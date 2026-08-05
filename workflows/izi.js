// izi: task → brd
//
// Конфиг воркфлоу читает сам, детерминированным каналом shell("cat …"), а не принимает снаружи
// через args. Канал запуска (tool `workflow`) опосредован моделью-запускателем, и то, КАК она
// сериализует объектные аргументы вызова, — не контракт: один и тот же наблюдался и с haiku, и с
// sonnet-лаунчером как JSON-строка вместо объекта (не воспроизводится стабильно). shell() — прямой
// детерминированный RPC хоста, без модели посередине, и потому единственный канал, на который
// уместно опираться для конфигурации. args не используется вовсе.
//
// Контракт запуска для bin/run.mjs (S3) теперь: name + scriptPath + foreground — без args.

const pipelineCat = await shell("cat pipeline.json");
if (pipelineCat.exitCode !== 0) {
  return {
    step: "config", track: "err", kind: "crashed",
    subject: pipelineCat.stderr.trim() || "pipeline.json не прочитан", code: 2,
  };
}
let pipeline;
try {
  pipeline = JSON.parse(pipelineCat.stdout);
} catch (e) {
  return {
    step: "config", track: "err", kind: "crashed",
    subject: `pipeline.json: ${String(e && e.message ? e.message : e)}`, code: 2,
  };
}

const orderTplCat = await shell("cat steps/brd/order.tpl");
if (orderTplCat.exitCode !== 0) {
  return {
    step: "config", track: "err", kind: "crashed",
    subject: orderTplCat.stderr.trim() || "steps/brd/order.tpl не прочитан", code: 2,
  };
}
const orderTpl = orderTplCat.stdout;

// operatorChannel — policy declared in pipeline.json (see its own "//operatorChannel" comment) and
// proven once, in the open, by core/operator-channel.mjs (node --test). Mirrored inline, not imported:
// this sandbox exposes no import/require/process (pi-extensible-workflows SKILL.md: "Workflow
// JavaScript has no imports, filesystem, network, process, or timers" — only the globals this file
// already uses reach it). No default: a field this run does not declare must not silently pick a
// channel a script author is trusted to remember — same argument as pipeline.json's loops/models.
const OPERATOR_CHANNELS = ["terminal", "checkpoint"];
const operatorChannel = pipeline.operatorChannel;
if (operatorChannel === undefined) {
  return {
    step: "config", track: "err", kind: "crashed",
    subject: "pipeline.json: operatorChannel не объявлен — умолчания нет, канал прогона обязан быть данными",
    code: 2,
  };
}
if (!OPERATOR_CHANNELS.includes(operatorChannel)) {
  return {
    step: "config", track: "err", kind: "crashed",
    subject: `pipeline.json: operatorChannel=${JSON.stringify(operatorChannel)} — допустимо только terminal | checkpoint`,
    code: 2,
  };
}

// UTF-8 byte length without Buffer/TextEncoder — neither reaches this sandbox. Needed below because
// pi-extensible-workflows caps a checkpoint's `prompt` at 1024 UTF-8 bytes at the RPC boundary
// (validation.ts, validateCheckpoint) — Cyrillic runs ~2 bytes/char, so this is a real ceiling, not a
// formality.
function utf8ByteLength(s) {
  let n = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    n += cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
  }
  return n;
}

// Несущие контракты, перенесённые дословно из izi-flow-v2 (PLAN.md §1):
//   1. Квитанция закрывает шаг, а не наличие out — bin/receipt.mjs / bin/promote.mjs пишут её.
//   2. Промоут staging→out только на зелёном чеке; чек исполняется по staging-пути ДО промоута.
//   5. Ключ --q="<subject>" в answer_cmd совпадает с subject дословно — держит роль (roles/gilb.md).
//   6. Красный чек на task уходит оператору (код 10), а не в пере-делегацию.

// ENVELOPE — JSON Schema результата роли gilb. Заменяет текстовый конверт IZI/1: форму валидирует
// хост через workflow_result, а не парсер, который мы больше не переносим (PLAN.md §0.1).
const ENVELOPE = {
  type: "object",
  properties: {
    track: { type: "string", enum: ["ok", "err"] },
    artifact: { type: "string" },
    requirements: { type: "number" },
    questions: { type: "number" },
    kind: { type: "string", enum: ["blocked", "invalid", "question", "escalate", "crashed"] },
    subject: { type: "string" },
    evidence: { type: "string" },
    answer_cmd: { type: "string" },
  },
  required: ["track"],
  additionalProperties: false,
};

log("izi: start");

// ── шаг task ─────────────────────────────────────────────────────────────
phase("task");
const t = await shell("node steps/task/validate-task.mjs TASK.md");
if (t.exitCode !== 0) {
  log("izi: task red — terminal return to operator");
  return { step: "task", track: "err", kind: "blocked", subject: t.stderr.trim(), code: 10 };
}
await shell("node bin/receipt.mjs --step=task");
log("izi: task closed");

// ── шаг brd ──────────────────────────────────────────────────────────────
phase("brd");
const TASK = (await shell("cat TASK.md")).stdout;
const STAGING = ".agent/staging/brd.md";
const CHECK = `node steps/brd/validate-brd.mjs ${STAGING} --task=TASK.md --answers=.agent/answers.md`;

let feedback = "";
for (let i = 0; i < pipeline.loops.brd; i++) {
  const ANSWERS = (await shell("cat .agent/answers.md || true")).stdout || "(no operator answers yet)";
  const order = prompt(orderTpl, {
    TASK,
    ANSWERS,
    STAGING,
    CHECK,
    FEEDBACK: feedback || "(none — first attempt)",
  });

  log(`izi: brd attempt ${i + 1}/${pipeline.loops.brd}`);
  const env = await agent(order, { role: "gilb", outputSchema: ENVELOPE, timeoutMs: 180000 });

  if (env.track === "err") {
    // Прочие kind (blocked, invalid, escalate, crashed) чекпоинт не трогает — они терминальны на
    // обоих каналах: только question — штатный ход, для которого канал вообще имеет смысл выбирать.
    if (env.kind !== "question" || operatorChannel === "terminal") {
      // Терминальный возврат прогона, без пере-делегации. На канале terminal оператор исполняет
      // env.answer_cmd и перезапускает прогон — накопленные ответы приезжают в наряд следующего
      // запуска через .agent/answers.md.
      log("izi: brd err — terminal return to operator");
      return { step: "brd", ...env, code: 10 };
    }

    // operatorChannel === "checkpoint" && env.kind === "question": пауза В ЭТОМ прогоне, а не
    // терминальный возврат. Текст ответа этим каналом не едет — checkpoint(input) возвращает
    // раннеру только строку approved|rejected (ui.select(prompt, ["Approve","Reject"]) —
    // pi-extensible-workflows/src/host.ts); правда по-прежнему на диске в .agent/answers.md,
    // которую пишет bin/answer.mjs и которую эта же итерация цикла перечитает после approve.
    const cmd = env.answer_cmd || `node bin/answer.mjs --q=${JSON.stringify(env.subject)} --text="<ответ>"`;
    const checkpointPrompt = [
      `Роль gilb ждёт ответа (brd, попытка ${i + 1}/${pipeline.loops.brd}):`,
      env.subject,
      "",
      "Выполните команду:",
      cmd,
      "",
      "затем нажмите Approve. Reject — вопрос уходит человеку (escalate), прогон останавливается.",
    ].join("\n");

    if (utf8ByteLength(checkpointPrompt) > 1024) {
      // Хост режет checkpoint prompt на 1024 UTF-8 байтах (validation.ts, validateCheckpoint) —
      // молча ужать чужой subject/evidence значило бы придумать текст, которого роль не писала.
      // Честный ход — не звать checkpoint() вовсе и вернуть тот же вопрос терминально, как на
      // канале terminal; логируем причину, чтобы это не выглядело потерянным решением.
      log(`izi: brd question prompt exceeds checkpoint's 1024-byte limit (${utf8ByteLength(checkpointPrompt)}b) — falling back to terminal return for this question`);
      return { step: "brd", ...env, code: 10 };
    }

    log(`izi: brd question — pausing at checkpoint brd-q${i + 1} (channel: checkpoint)`);
    const decision = await checkpoint({
      name: `brd-q${i + 1}`,
      prompt: checkpointPrompt,
      context: { subject: env.subject, evidence: env.evidence, answer_cmd: cmd },
    });

    if (decision !== "approved") {
      // rejected (или любое иное значение, кроме буквального "approved") — оператор отказался
      // отвечать здесь и сейчас; решает человек, а не следующая итерация цикла.
      log(`izi: brd question — checkpoint ${decision}, escalate`);
      return { step: "brd", track: "err", kind: "escalate", subject: env.subject, evidence: env.evidence, code: 10 };
    }

    // approved: ответ оператора уже на диске (.agent/answers.md, записан bin/answer.mjs ДО Approve
    // — так гласит текст чекпоинта выше). Следующая итерация цикла перечитает ANSWERS и соберёт
    // наряд заново; agent() в ЭТОЙ итерации не вызывается второй раз.
    log(`izi: brd question — checkpoint approved, retrying with fresh answers`);
    continue;
  }

  const check = await shell(CHECK);
  if (check.exitCode === 0) {
    await shell("node bin/promote.mjs --step=brd"); // staging→out, потом квитанция
    log("izi: brd closed");
    return { step: "brd", track: "ok", artifact: ".agent/brd.md", advice: check.stdout, code: 0 };
  }

  // Красный чек — пере-делегация той же роли с уликами. advice не роняет приёмку, feedback — роняет.
  feedback = check.stderr;
  log(`izi: brd check red (attempt ${i + 1}) — redelegating with feedback`);
}

log("izi: brd retries exhausted — escalate");
return { step: "brd", track: "err", kind: "escalate", subject: "повторы исчерпаны", code: 10 };
