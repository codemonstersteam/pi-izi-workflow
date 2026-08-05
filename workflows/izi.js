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

// questions/checkpointRetries — policy of the RUN for operator exchanges, declared in pipeline.json
// (see its own "//questions" comment for the full argument) and split from loops.brd on PURPOSE
// (S8 defect): loops.brd spends ONLY on a red guardrail check (a paid agent() re-delegation); a
// question→answer exchange does not re-delegate the role until core/answer-arrived.mjs's mirrored
// rule (below) confirms the answer as a FACT on disk — a live run died in three re-delegations
// because Approve alone was being read as three red checks of the same role, loops.brd ran out, and
// the terminal escalate blamed "retries exhausted" though the role never once received an answer.
// No default here, same reasoning as operatorChannel above: a silent default would return the
// exchange budget to the memory of whoever wrote this script.
const questions = pipeline.questions;
if (!Number.isInteger(questions) || questions < 1) {
  return {
    step: "config", track: "err", kind: "crashed",
    subject: questions === undefined
      ? "pipeline.json: questions не объявлен — умолчания нет, бюджет обменов с оператором обязан быть данными"
      : `pipeline.json: questions=${JSON.stringify(questions)} — должно быть положительным целым`,
    code: 2,
  };
}
const checkpointRetries = pipeline.checkpointRetries;
if (!Number.isInteger(checkpointRetries) || checkpointRetries < 1) {
  return {
    step: "config", track: "err", kind: "crashed",
    subject: checkpointRetries === undefined
      ? "pipeline.json: checkpointRetries не объявлен — умолчания нет, число переспросов обязано быть данными"
      : `pipeline.json: checkpointRetries=${JSON.stringify(checkpointRetries)} — должно быть положительным целым`,
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
// Отсутствие .agent/answers.md — случай, не ошибка инструмента (standards/protocol.md, различение 4):
// `[ -f … ] && cat … || true` молчит на отсутствующем файле (exit 0, stdout ""), тогда как прежнее
// `cat … || true` сыпало "No such file or directory" в stderr прогона на каждой итерации ДО первого
// ответа — журнал ложно выглядел так, будто что-то уже пошло не так.
const ANSWERS_CMD = "[ -f .agent/answers.md ] && cat .agent/answers.md || true";

// answerArrived — правило доказано юнитами в core/answer-arrived.mjs (node --test); зеркалится
// инлайн ТЕМ ЖЕ приёмом, что и operatorChannel выше: песочница воркфлоу не даёт import/require.
// parseAnswers ниже — копия разбора из core/answers.mjs (тот же формат "вопрос:/ответ:", та же
// регулярка), а не второй, независимо изобретённый парсер: правило "--q= совпадает с subject
// дословно" (standards/protocol.md §7) живёт в одном месте логически, даже если этот файл существует
// на диске в двух местах.
function parseAnswersInline(text) {
  const lines = String(text || "").split("\n");
  const out = [];
  let pending = null;
  for (const line of lines) {
    const q = /^- вопрос:\s*(.*)$/.exec(line);
    const a = /^\s+ответ:\s*(.*)$/.exec(line);
    if (q) {
      if (pending !== null) return null; // malformed — пара потеряла половину
      pending = q[1];
      continue;
    }
    if (a) {
      if (pending === null) return null; // malformed
      out.push({ question: pending, text: a[1] });
      pending = null;
    }
  }
  if (pending !== null) return null;
  return out;
}
function answerArrived(before, after, subject) {
  if (after === before) return false; // Approve без записи — файл байт-в-байт тот же
  const parsed = parseAnswersInline(after);
  if (parsed === null) return false; // не разобралось — не заявляем присутствие
  return parsed.some((a) => a.question === subject);
}

let feedback = "";
let attempt = 0;        // loops.brd budget — тратит ТОЛЬКО красный чек (пере-делегация роли)
let questionsAsked = 0; // pipeline.questions budget — тратит КАЖДЫЙ РАЗ, когда роль задаёт вопрос
while (attempt < pipeline.loops.brd) {
  const ANSWERS = (await shell(ANSWERS_CMD)).stdout || "(no operator answers yet)";
  const order = prompt(orderTpl, {
    TASK,
    ANSWERS,
    STAGING,
    CHECK,
    FEEDBACK: feedback || "(none — first attempt)",
  });

  log(`izi: brd attempt ${attempt + 1}/${pipeline.loops.brd}`);
  const env = await agent(order, { role: "gilb", outputSchema: ENVELOPE, timeoutMs: 180000 });

  if (env.track === "err") {
    // Прочие kind (blocked, invalid, escalate, crashed) чекпоинт не трогает — они терминальны на
    // обоих каналах: только question — штатный ход, для которого канал вообще имеет смысл выбирать.
    const isCheckpointQuestion = env.kind === "question" && operatorChannel === "checkpoint";
    if (!isCheckpointQuestion) {
      // Терминальный возврат прогона, без пере-делегации. На канале terminal оператор исполняет
      // env.answer_cmd и перезапускает прогон — накопленные ответы приезжают в наряд следующего
      // запуска через .agent/answers.md.
      log("izi: brd err — terminal return to operator");
      return { step: "brd", ...env, code: 10 };
    }

    // operatorChannel === "checkpoint" && env.kind === "question": пауза В ЭТОМ прогоне, а не
    // терминальный возврат. checkpoint(input) возвращает раннеру только строку approved|rejected
    // (ui.select(prompt, ["Approve","Reject"]) — pi-extensible-workflows/src/host.ts) — Approve сам
    // по себе НЕ факт ответа (это и был живой дефект: три Approve, ноль bin/answer.mjs). Правда
    // по-прежнему только на диске, в .agent/answers.md — answerArrived() ниже проверяет её как факт,
    // а не берёт решение оператора на слово.
    questionsAsked++;
    if (questionsAsked > questions) {
      // Бюджет обменов исчерпан. Это НЕ "повторы гардрейла исчерпаны" (escalate) — роль ни разу не
      // получила плохой ответ, прогону просто разрешено спросить не больше pipeline.json.questions
      // раз. kind остаётся "question": subject/answer_cmd — последний заданный вопрос, отвечать
      // на который оператору всё ещё нужно, просто уже вне этого прогона.
      log(`izi: brd question — questions budget exhausted (${questionsAsked} > ${questions})`);
      return {
        step: "brd", track: "err", kind: "question",
        subject: env.subject, evidence: env.evidence, answer_cmd: env.answer_cmd,
        diagnosis: `вопросов за прогон больше, чем позволяет pipeline.json.questions=${questions}`,
        code: 10,
      };
    }

    const cmd = env.answer_cmd || `node bin/answer.mjs --q=${JSON.stringify(env.subject)} --text="<ответ>"`;
    const basePrompt = [
      `Роль gilb ждёт ответа (brd, вопрос ${questionsAsked}/${questions}):`,
      env.subject,
      "",
      "Выполните команду:",
      cmd,
      "",
      "затем нажмите Approve. Reject — вопрос уходит человеку (escalate), прогон останавливается.",
    ].join("\n");

    if (utf8ByteLength(basePrompt) > 1024) {
      // Хост режет checkpoint prompt на 1024 UTF-8 байтах (validation.ts, validateCheckpoint) —
      // молча ужать чужой subject/evidence значило бы придумать текст, которого роль не писала.
      // Честный ход — не звать checkpoint() вовсе и вернуть тот же вопрос терминально, как на
      // канале terminal; логируем причину, чтобы это не выглядело потерянным решением.
      log(`izi: brd question prompt exceeds checkpoint's 1024-byte limit (${utf8ByteLength(basePrompt)}b) — falling back to terminal return for this question`);
      return { step: "brd", ...env, code: 10 };
    }

    // Снимок ДО паузы — контрольная точка, с которой answerArrived() будет сравнивать файл ПОСЛЕ
    // каждого Approve. Один и тот же снимок для всех переспросов этого вопроса: ответ либо появился
    // относительно него, либо нет — переспрос не двигает точку отсчёта.
    const before = (await shell(ANSWERS_CMD)).stdout;
    let confirmed = false;
    for (let retry = 1; retry <= checkpointRetries; retry++) {
      const retryNote = retry === 1
        ? ""
        : "\n\n(Повтор: в .agent/answers.md не нашли новую запись — похоже, команда выше не была " +
          "выполнена. Выполните её и нажмите Approve ещё раз.)";
      const checkpointPrompt = basePrompt + retryNote;
      if (utf8ByteLength(checkpointPrompt) > 1024) {
        log(`izi: brd question retry prompt exceeds checkpoint's 1024-byte limit (${utf8ByteLength(checkpointPrompt)}b) — falling back to terminal return for this question`);
        return { step: "brd", ...env, code: 10 };
      }

      log(`izi: brd question — pausing at checkpoint brd-q${questionsAsked} (retry ${retry}/${checkpointRetries}, channel: checkpoint)`);
      const decision = await checkpoint({
        name: retry === 1 ? `brd-q${questionsAsked}` : `brd-q${questionsAsked}-retry${retry}`,
        prompt: checkpointPrompt,
        context: { subject: env.subject, evidence: env.evidence, answer_cmd: cmd },
      });

      if (decision !== "approved") {
        // rejected (или любое иное значение, кроме буквального "approved") — оператор отказался
        // отвечать здесь и сейчас, на ЛЮБОЙ итерации переспроса; решает человек, а не цикл.
        log(`izi: brd question — checkpoint ${decision}, escalate`);
        return { step: "brd", track: "err", kind: "escalate", subject: env.subject, evidence: env.evidence, code: 10 };
      }

      const after = (await shell(ANSWERS_CMD)).stdout;
      if (answerArrived(before, after, env.subject)) {
        confirmed = true;
        break;
      }
      // approved, но факта на диске нет: та же самая пауза повторяется — роль НЕ зовётся, денег
      // это не стоит, только время в окне pi.
      log(`izi: brd question — checkpoint approved, но .agent/answers.md не несёт ответа на «${env.subject}» — команда, видимо, не выполнена; переспрашиваю (${retry}/${checkpointRetries})`);
    }

    if (!confirmed) {
      // Переспросы исчерпаны, ответа так и нет. Тоже НЕ escalate — причина иная, чем "повторы
      // гардрейла исчерпаны": оператор не ответил, роль тут ни при чём.
      log(`izi: brd question — ответ не получен за ${checkpointRetries} переспросов`);
      return {
        step: "brd", track: "err", kind: "question",
        subject: env.subject, evidence: env.evidence, answer_cmd: cmd,
        diagnosis: `ответ не получен за ${checkpointRetries} переспросов`,
        code: 10,
      };
    }

    // Ответ подтверждён ФАКТОМ на диске — следующая итерация цикла перечитает ANSWERS и соберёт
    // наряд заново. attempt НЕ увеличен: вопрос-ответ — не пере-делегация по красному чеку, это
    // структурно видно здесь — continue ведёт на `while (attempt < …)` с тем же attempt.
    log(`izi: brd question — answer confirmed on disk, retrying with fresh answers`);
    continue;
  }

  const check = await shell(CHECK);
  if (check.exitCode === 0) {
    await shell("node bin/promote.mjs --step=brd"); // staging→out, потом квитанция
    log("izi: brd closed");
    return { step: "brd", track: "ok", artifact: ".agent/brd.md", advice: check.stdout, code: 0 };
  }

  // Красный чек — пере-делегация той же роли с уликами. advice не роняет приёмку, feedback — роняет.
  // Только этот путь двигает attempt — loops.brd тратится ИСКЛЮЧИТЕЛЬНО красным чеком гардрейла.
  feedback = check.stderr;
  attempt++;
  log(`izi: brd check red (attempt ${attempt}/${pipeline.loops.brd}) — redelegating with feedback`);
}

log("izi: brd retries exhausted — escalate");
return { step: "brd", track: "err", kind: "escalate", subject: "повторы исчерпаны", code: 10 };
