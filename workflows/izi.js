// izi: цикл по pipeline.order, диспетчеризация по kind — программа не знает имён шагов (S9,
// docs/workflow.md §1 правка 3). Сегодня в pipeline.order лежат ровно task (kind=human) и brd
// (kind=role); третий род (kind=script), веер (fanout) и условные шаги (when) сюда не входят —
// они приезжают вместе со срезами survey-plan/scope/design (docs/workflow.md §5), и объявлять их
// диспетчер здесь значило бы писать код, который живой прогон не может доказать. Кода kind, для
// которого диспетчер не готов (включая "script" — CANDIDATE, но пока без доказанного шага), —
// терминальный crashed, code 2: тихого пропуска НЕТ (см. ветку unknown ниже).
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

// Манифест срезов — steps/*/step.json, объединённые и линченные bin/steps.mjs (S9, докрутка
// bin/steps-map.mjs). Единственный канал воркфлоу к диску — shell() (песочница pi-extensible-
// workflows не даёт fs), поэтому манифест приезжает тем же приёмом, что и pipeline.json выше —
// отдельным, независимым чтением, а не аргументом запуска.
const stepsCat = await shell("node bin/steps.mjs --json");
if (stepsCat.exitCode !== 0) {
  return {
    step: "config", track: "err", kind: "crashed",
    subject: stepsCat.stderr.trim() || "bin/steps.mjs манифест не собрался", code: 2,
  };
}
let steps;
try {
  steps = JSON.parse(stepsCat.stdout);
} catch (e) {
  return {
    step: "config", track: "err", kind: "crashed",
    subject: `bin/steps.mjs --json: ${String(e && e.message ? e.message : e)}`, code: 2,
  };
}

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
// (see its own "//questions" comment for the full argument) and split from loops[step] on PURPOSE
// (S8 defect): loops[step] spends ONLY on a red guardrail check (a paid agent() re-delegation); a
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

// resolveCheck — mirrors core/resolve-check.mjs inline, same reason as operatorChannel/answerArrived
// above: the sandbox has no import. Proven by node --test over the real module, copied here by hand.
function resolveCheck(check, artifact) {
  const args = (check.args || []).map((a) => a.replaceAll("{{artifact}}", artifact));
  return [check.cmd, ...args].join(" ");
}

// Несущие контракты, перенесённые дословно из izi-flow-v2 (PLAN.md §1), теперь читаются из данных
// (step.json), а не из литералов в этом файле:
//   1. Квитанция закрывает шаг, а не наличие out — bin/receipt.mjs / bin/promote.mjs пишут её; уже
//      закрытый шаг (квитанция на диске) пропускается ниже без вызова роли.
//   2. Промоут staging→out только на зелёном чеке; чек исполняется по staging-пути ДО промоута.
//   5. Ключ --q="<subject>" в answer_cmd совпадает с subject дословно — держит роль (steps/brd/role.md).
//   6. Красный чек на human-шаге уходит оператору (код 10), а не в пере-делегацию.

// ENVELOPE — JSON Schema результата роли. Заменяет текстовый конверт IZI/1: форму валидирует
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

// answerArrived — правило доказано юнитами в core/answer-arrived.mjs (node --test); зеркалится
// инлайн ТЕМ ЖЕ приёмом, что и operatorChannel выше. parseAnswers ниже — копия разбора из
// core/answers.mjs (тот же формат "вопрос:/ответ:", та же регулярка), а не второй, независимо
// изобретённый парсер: правило "--q= совпадает с subject дословно" (standards/protocol.md §7)
// живёт в одном месте логически, даже если этот файл существует на диске в двух местах.
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

// ── ход шага kind=human — красный чек уходит оператору, никакой роли не зовём ─────────────────────
async function runHumanStep(s) {
  const artifact = s.staging || Object.values(s.out)[0];
  const t = await shell(resolveCheck(s.check, artifact));
  if (t.exitCode !== 0) {
    log(`izi: ${s.id} red — terminal return to operator`);
    return { step: s.id, track: "err", kind: "blocked", subject: t.stderr.trim(), code: 10 };
  }
  await shell(`node bin/receipt.mjs --step=${s.id}`);
  log(`izi: ${s.id} closed`);
  return null; // не терминально — цикл идёт к следующему id
}

// ── ход шага kind=role — наряд из step.json.prompt, бюджет из pipeline.loops[s.id] ─────────────────
async function runRoleStep(s) {
  const loopsBudget = pipeline.loops && pipeline.loops[s.id];
  if (!Number.isInteger(loopsBudget) || loopsBudget < 1) {
    return {
      step: s.id, track: "err", kind: "crashed",
      subject: `pipeline.json: loops.${s.id} не объявлен — ролевой шаг без бюджета пере-делегаций не собирается`,
      code: 2,
    };
  }

  const orderTplCat = await shell(`cat ${s.prompt}`);
  if (orderTplCat.exitCode !== 0) {
    return {
      step: "config", track: "err", kind: "crashed",
      subject: orderTplCat.stderr.trim() || `${s.prompt} не прочитан`, code: 2,
    };
  }
  const orderTpl = orderTplCat.stdout;

  const TASK = (await shell("cat TASK.md")).stdout;
  const STAGING = s.staging;
  const CHECK = resolveCheck(s.check, STAGING);
  // Отсутствие .agent/answers.md — случай, не ошибка инструмента (standards/protocol.md,
  // различение 4): `[ -f … ] && cat … || true` молчит на отсутствующем файле (exit 0, stdout ""),
  // тогда как прежнее `cat … || true` сыпало "No such file or directory" в stderr прогона на
  // каждой итерации ДО первого ответа — журнал ложно выглядел так, будто что-то уже пошло не так.
  const ANSWERS_CMD = "[ -f .agent/answers.md ] && cat .agent/answers.md || true";

  let feedback = "";
  let attempt = 0;        // loops[s.id] budget — тратит ТОЛЬКО красный чек (пере-делегация роли)
  let questionsAsked = 0; // pipeline.questions budget — тратит КАЖДЫЙ РАЗ, когда роль задаёт вопрос
  while (attempt < loopsBudget) {
    const ANSWERS = (await shell(ANSWERS_CMD)).stdout || "(no operator answers yet)";
    const order = prompt(orderTpl, {
      TASK, ANSWERS, STAGING, CHECK,
      FEEDBACK: feedback || "(none — first attempt)",
    });

    log(`izi: ${s.id} attempt ${attempt + 1}/${loopsBudget}`);
    const env = await agent(order, { role: s.role, outputSchema: ENVELOPE, timeoutMs: 180000 });

    if (env.track === "err") {
      // Прочие kind (blocked, invalid, escalate, crashed) чекпоинт не трогает — они терминальны на
      // обоих каналах: только question — штатный ход, для которого канал вообще имеет смысл выбирать.
      const isCheckpointQuestion = env.kind === "question" && operatorChannel === "checkpoint";
      if (!isCheckpointQuestion) {
        log(`izi: ${s.id} err — terminal return to operator`);
        return { step: s.id, ...env, code: 10 };
      }

      questionsAsked++;
      if (questionsAsked > questions) {
        log(`izi: ${s.id} question — questions budget exhausted (${questionsAsked} > ${questions})`);
        return {
          step: s.id, track: "err", kind: "question",
          subject: env.subject, evidence: env.evidence, answer_cmd: env.answer_cmd,
          diagnosis: `вопросов за прогон больше, чем позволяет pipeline.json.questions=${questions}`,
          code: 10,
        };
      }

      const cmd = env.answer_cmd || `node bin/answer.mjs --q=${JSON.stringify(env.subject)} --text="<ответ>"`;
      const basePrompt = [
        `Роль ${s.role} ждёт ответа (${s.id}, вопрос ${questionsAsked}/${questions}):`,
        env.subject,
        "",
        "Выполните команду:",
        cmd,
        "",
        "затем нажмите Approve. Reject — вопрос уходит человеку (escalate), прогон останавливается.",
      ].join("\n");

      if (utf8ByteLength(basePrompt) > 1024) {
        log(`izi: ${s.id} question prompt exceeds checkpoint's 1024-byte limit (${utf8ByteLength(basePrompt)}b) — falling back to terminal return for this question`);
        return { step: s.id, ...env, code: 10 };
      }

      const before = (await shell(ANSWERS_CMD)).stdout;
      let confirmed = false;
      for (let retry = 1; retry <= checkpointRetries; retry++) {
        const retryNote = retry === 1
          ? ""
          : "\n\n(Повтор: в .agent/answers.md не нашли новую запись — похоже, команда выше не была " +
            "выполнена. Выполните её и нажмите Approve ещё раз.)";
        const checkpointPrompt = basePrompt + retryNote;
        if (utf8ByteLength(checkpointPrompt) > 1024) {
          log(`izi: ${s.id} question retry prompt exceeds checkpoint's 1024-byte limit (${utf8ByteLength(checkpointPrompt)}b) — falling back to terminal return for this question`);
          return { step: s.id, ...env, code: 10 };
        }

        log(`izi: ${s.id} question — pausing at checkpoint ${s.id}-q${questionsAsked} (retry ${retry}/${checkpointRetries}, channel: checkpoint)`);
        const decision = await checkpoint({
          name: retry === 1 ? `${s.id}-q${questionsAsked}` : `${s.id}-q${questionsAsked}-retry${retry}`,
          prompt: checkpointPrompt,
          context: { subject: env.subject, evidence: env.evidence, answer_cmd: cmd },
        });

        if (decision !== "approved") {
          log(`izi: ${s.id} question — checkpoint ${decision}, escalate`);
          return { step: s.id, track: "err", kind: "escalate", subject: env.subject, evidence: env.evidence, code: 10 };
        }

        const after = (await shell(ANSWERS_CMD)).stdout;
        if (answerArrived(before, after, env.subject)) {
          confirmed = true;
          break;
        }
        log(`izi: ${s.id} question — checkpoint approved, но .agent/answers.md не несёт ответа на «${env.subject}» — команда, видимо, не выполнена; переспрашиваю (${retry}/${checkpointRetries})`);
      }

      if (!confirmed) {
        log(`izi: ${s.id} question — ответ не получен за ${checkpointRetries} переспросов`);
        return {
          step: s.id, track: "err", kind: "question",
          subject: env.subject, evidence: env.evidence, answer_cmd: cmd,
          diagnosis: `ответ не получен за ${checkpointRetries} переспросов`,
          code: 10,
        };
      }

      log(`izi: ${s.id} question — answer confirmed on disk, retrying with fresh answers`);
      continue;
    }

    const check = await shell(CHECK);
    if (check.exitCode === 0) {
      await shell(`node bin/promote.mjs --step=${s.id}`); // staging→out, потом квитанция
      log(`izi: ${s.id} closed`);
      return { step: s.id, track: "ok", artifact: Object.values(s.out)[0], advice: check.stdout, code: 0 };
    }

    // Красный чек — пере-делегация той же роли с уликами. advice не роняет приёмку, feedback — роняет.
    // Только этот путь двигает attempt — loops[s.id] тратится ИСКЛЮЧИТЕЛЬНО красным чеком гардрейла.
    feedback = check.stderr;
    attempt++;
    log(`izi: ${s.id} check red (attempt ${attempt}/${loopsBudget}) — redelegating with feedback`);
  }

  log(`izi: ${s.id} retries exhausted — escalate`);
  return { step: s.id, track: "err", kind: "escalate", subject: "повторы исчерпаны", code: 10 };
}

// ── программа: цикл по pipeline.order, диспетчеризация по kind ─────────────────────────────────
log("izi: start");

let lastOk = { track: "ok", code: 0 };
for (const id of pipeline.order) {
  const doneCheck = await shell(`[ -f .agent/receipts/${id}.json ]`);
  if (doneCheck.exitCode === 0) {
    log(`izi: ${id} already closed — skip, роль не зовём`);
    continue;
  }

  const s = steps[id];
  if (!s) {
    // Недостижимо по построению: bin/steps.mjs уже отказал бы (exitCode!==0) выше, будь id из
    // pipeline.order без записи в манифесте. Оставлено как явный терминальный отказ, а не молчание.
    return {
      step: id, track: "err", kind: "crashed",
      subject: `«${id}» объявлен в pipeline.order, но манифест bin/steps.mjs его не несёт`, code: 2,
    };
  }

  phase(id);

  if (s.kind === "human") {
    const r = await runHumanStep(s);
    if (r) return r;
    continue;
  }

  if (s.kind === "role") {
    const r = await runRoleStep(s);
    if (r.track === "ok") { lastOk = r; continue; }
    return r;
  }

  // Веер (fanout) и условные шаги (when) сюда не входят (см. верхний комментарий файла) — их kind
  // здесь неизвестен, и неизвестное — рельса, а не тихий пропуск (standards/protocol.md, различение 3).
  return {
    step: id, track: "err", kind: "crashed",
    subject: `«${id}»: неизвестный kind=${JSON.stringify(s.kind)} — диспетчер не собран для этого рода`, code: 2,
  };
}

log("izi: pipeline order exhausted — все шаги закрыты");
return lastOk;
