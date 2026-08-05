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
    // Вопрос оператору (или иной err) — терминальный возврат прогона, без пере-делегации.
    // Оператор исполняет env.answer_cmd, перезапускает прогон — накопленные ответы приезжают
    // в наряд следующего запуска через .agent/answers.md.
    log("izi: brd err — terminal return to operator");
    return { step: "brd", ...env, code: 10 };
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
