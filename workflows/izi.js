// izi: three concrete rails, task → brd → survey-plan (S11, S15). No step manifest, no
// pipeline.json, no shell() — the extension (ext/index.mjs) puts readText/answers/checkTask/checkBrd/
// promote/setPending/clearPending/survey on the sandbox as globals, and this script calls them
// directly. Order stays CODE, not data: a third phase is one more named function, not a manifest
// entry plus a dispatcher plus their tests. Docs: docs/workflow.md §1-§2, docs/survey-plan.md §5,
// docs/concept.md. Loop/question budgets are literals — two steps do not earn a policy-as-data
// mechanism yet (docs/concept.md, «отложено»). The operator channel is checkpoint only: no headless
// run exists any more (bin/run.mjs is gone) — this workflow starts from an interactive pi session
// via `/izi`. S13: `prompts/izi.md` launches with `foreground: false`, so the operator answers gilb's
// question DIRECTLY in that same chat window instead of a second terminal running bin/answer.mjs —
// `foreground: true` hands checkpoint's Approve/Reject to a modal `ui.select` that swallows all other
// input (pi-extensible-workflows/src/host.ts:686, checkpointBridge) and the operator is locked out of
// typing an answer at all; `foreground: false` delivers the same pause as an ordinary chat message
// instead (host.ts:673-677, deliverBackgroundCheckpoint) and the editor stays free. askOperator()
// below writes that message's `prompt` to instruct the model, not the operator, directly: read the
// question, relay it, wait for the reply, call the izi_answer tool, then workflow_respond.

// S16: the three budgets are no longer literals here. The operator raises them per project in
// izi.config.json, read by the budgets() host function (core/budgets.mjs holds the defaults — one
// place — and refuses a broken file instead of silently falling back to them). They are assigned
// ONCE, at the start of the run, before any phase: a budget that could change mid-run would make
// "цикл исчерпан за N попыток" a statement about nothing.
let LOOPS;              // gilb red-check redelegations (guardrail failures), NOT questions
let QUESTIONS;          // operator exchanges allowed in one run
let CHECKPOINT_RETRIES; // re-pause on the SAME question when no matching answer showed up

const ok = (fields) => ({ track: "ok", code: 0, ...fields });
const err = (kind, fields) => ({ track: "err", kind, code: kind === "crashed" ? 2 : 10, ...fields });
class Exit extends Error { constructor(result) { super("exit"); this.result = result; } }
const exit = (result) => { throw new Exit(result); };

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

async function task() {
  const t = await checkTask({}); // registered functions require exactly one JSON object argument
  if (!t.ok) exit(err("blocked", { subject: t.why }));
}

// byteLen — UTF-8 byte length without Buffer: the workflow sandbox is a bare vm.createContext
// (pi-extensible-workflows/src/execution.ts) carrying only {agent, shell, prompt, checkpoint,
// parallel, pipeline, phase, log, args, Promise, JSON, Math} plus registered functions — Buffer is a
// Node global, never injected here. encodeURIComponent/unescape ARE plain ECMAScript globals (not
// Node-specific, not on the sandbox's blacklist), and the escape-to-one-char-per-byte trick gives an
// exact UTF-8 byte count without either.
function byteLen(s) { return unescape(encodeURIComponent(String(s == null ? "" : s))).length; }

// checkpoint()'s prompt is capped at 1024 UTF-8 bytes and context at 4096
// (pi-extensible-workflows/src/validation.ts:17-22, validateCheckpoint) — past that it throws
// INVALID_METADATA and the run crashes, not degrades. gilb's subject is natural-language operator
// prose with no length contract of its own (steps/brd/gilb.md does not bound it), so the prompt
// cannot simply interpolate it and hope. ASK_LONG is the fallback used when the short form would
// not fit: it never truncates the subject text itself — a clipped question can silently change its
// meaning mid-sentence — instead it points at .agent/pending.json, which setPending() below writes
// with NO byte limit (a file, not this channel), so the operator always gets the question complete,
// just via one extra file read in the rare long-subject case instead of inline chat text.
const ASK_HEAD = "Роль gilb ждёт ответа оператора в этом чате. ";
const ASK_TAIL = " Получив ответ — вызови tool izi_answer({text: ответ дословно}). Затем workflow_respond({runId: <runId запуска>, name: <name из заголовка этого сообщения>, approved: true}). Отказ оператора — approved: false.";
const ASK_LONG = "Вопрос слишком длинный для этого сообщения — прочитай его дословно в .agent/pending.json (поле subject) и задай оператору оттуда.";

function askPrompt(subject, retryNote) {
  const note = retryNote || "";
  const short = `${ASK_HEAD}Спроси оператора дословно:\n${subject}${ASK_TAIL}${note}`;
  if (byteLen(short) <= 1024) return short;
  return `${ASK_HEAD}${ASK_LONG}${ASK_TAIL}${note}`; // byte-safe by construction — independent of subject length
}

const RETRY_NOTE = "\n\n(Ответ не найден в .agent/answers.md по этому ключу — переспроси и повтори вызовы.)";

// askOperator — checkpoint is a barrier (approved|rejected), never a fact (host.ts: checkpoint()
// resolves to a boolean, the operator's text never travels this channel). The fact is an answer that
// shows up in .agent/answers.md under the exact question key — until then Approve is a no-op and
// gilb is not called again (a re-pause is a peer-review of the operator, not a paid redelegation).
// setPending()/clearPending() bracket the exchange: the question key the izi_answer tool writes
// against is never a model input, it is read from .agent/pending.json — setPending() puts it there
// BEFORE the pause (so it exists the instant the checkpoint message lands in chat), clearPending()
// removes it only AFTER an answer to THIS subject is confirmed present (never on Reject or on
// exhausted retries — the run is terminating there anyway, and the next run's first askOperator call
// overwrites pending.json before its own pause).
async function askOperator(env, n) {
  await setPending({ subject: env.subject, evidence: env.evidence || "" });
  for (let retry = 1; retry <= CHECKPOINT_RETRIES; retry++) {
    const decision = await checkpoint({
      name: retry === 1 ? `brd-q${n}` : `brd-q${n}-retry${retry}`,
      prompt: askPrompt(env.subject, retry === 1 ? "" : RETRY_NOTE),
      context: { pending: ".agent/pending.json" },
    });
    if (decision !== "approved") exit(err("escalate", { subject: env.subject, evidence: env.evidence }));
    if ((await answers({})).some((a) => a.question === env.subject)) { await clearPending({}); return; }
  }
  exit(err("question", { subject: env.subject, evidence: env.evidence, diagnosis: `ответ не получен за ${CHECKPOINT_RETRIES} переспросов` }));
}

async function brd() {
  const orderTpl = await readText({ path: "steps/brd/order.tpl" });
  const TASK = await readText({ path: "TASK.md" });
  const STAGING = ".agent/staging/brd.md";
  const CHECK = "checkBrd({path}) — steps/brd/brd.mjs::newBrd, numbers from TASK.md + operator answer values";
  let feedback = "(none — first attempt)", attempt = 0, asked = 0;

  while (attempt < LOOPS) {
    const seen = await answers({});
    const ANSWERS = seen.length ? seen.map((a) => `- вопрос: ${a.question}\n  ответ: ${a.text}`).join("\n") : "(no operator answers yet)";
    const order = prompt(orderTpl, { TASK, ANSWERS, FEEDBACK: feedback, STAGING, CHECK });
    const env = await agent(order, { role: "gilb", outputSchema: ENVELOPE });

    if (env.track === "err" && env.kind === "question") {
      if (++asked > QUESTIONS) exit(err("question", { subject: env.subject, evidence: env.evidence, diagnosis: `вопросов за прогон больше ${QUESTIONS}` }));
      await askOperator(env, asked);
      continue; // question does not spend the redelegation budget
    }
    if (env.track === "err") exit(err(env.kind, { subject: env.subject, evidence: env.evidence }));

    const check = await checkBrd({ path: STAGING }); // check runs ON STAGING, before any promote
    if (check.ok) {
      await promote({ from: STAGING, to: ".agent/brd.md" }); // green check → THEN promote
      log(`brd: ok, requirements=${check.requirements}`);
      return; // S15: no longer the end of the run — survey-plan follows
    }
    feedback = check.blockers;
    attempt++;
  }
  // feedback here IS check.blockers from the LAST iteration (set just above, on every red pass
  // through the loop) — the guardrail's own diagnosis, not a generic "retries exhausted" that
  // throws away why. A bare "повторы исчерпаны" subject told the operator nothing checkBrd didn't
  // already know and say better (S14).
  exit(err("escalate", { subject: feedback, evidence: `цикл исчерпан за ${LOOPS} попыток` }));
}

// surveyPlan — step 3, a SCRIPT step: no role, no model call, no operator at all. The layout is
// computable, and what is computable is computed by a script for 0 tokens (docs/survey-plan.md).
// The numbers are logged BEFORE the swarm of step 4 exists: the cost of reading this repository is
// visible in journal.json ahead of paying it, and the decision "that is too much" belongs to step 4.
async function surveyPlan() {
  const PLAN = ".agent/survey-plan.json";
  const p = await survey({ path: PLAN });
  if (!p.ok) exit(err("blocked", { subject: p.why }));
  log(`survey-plan: files=${p.files} bytes=${p.bytes} cells=${p.cells}`);
  exit(ok({ artifact: PLAN, files: p.files, cells: p.cells, gaps: p.gaps }));
}

log("izi: start");
try {
  const b = await budgets({});
  if (!b.ok) exit(err("blocked", { subject: b.why })); // сломанный конфиг — отказ, не тихое умолчание
  LOOPS = b.loops; QUESTIONS = b.questions; CHECKPOINT_RETRIES = b.checkpointRetries;
  log(`budgets: loops=${LOOPS} questions=${QUESTIONS} checkpointRetries=${CHECKPOINT_RETRIES} (${b.source})`);

  // Наблюдаемость объявляется вслух, а не предполагается: herdr-расширение при недоступном herdr
  // не регистрируется вовсе и МОЛЧИТ, поэтому прогон из обычного терминала выглядит так же, как
  // сломанная интеграция. Прогон при этом не блокируется — ненаблюдаемый прогон всё равно прогон.
  const h = await herdrStatus({});
  log(h.available
    ? `herdr: on pane=${h.pane}${h.fullyInspectable ? " fully-inspectable" : " (fully-inspectable выключен в ~/.pi/agent/pi-extensible-workflows/settings.json)"}`
    : `herdr: off — ${h.why}`);

  phase("task"); await task();
  phase("brd"); await brd();
  phase("survey-plan"); await surveyPlan();
  return ok({}); // unreachable — surveyPlan() always exits — kept as the fall-through for a fourth phase
} catch (e) {
  if (e instanceof Exit) return e.result;
  const msg = String((e && e.message) || e);
  // «X is not defined» на функции хоста значит ровно одно: расширение в этой сессии pi СТАРШЕ
  // воркфлоу-скрипта (ext/index.mjs читается при старте сессии, workflows/izi.js — при каждом
  // прогоне). Диагноз называет починку, иначе он неотличим от опечатки в скрипте.
  if (/ is not defined$/.test(msg)) {
    return err("crashed", { subject: `${msg} — функции хоста нет в этой сессии pi: расширение старше воркфлоу, перезапусти pi` });
  }
  return err("crashed", { subject: msg });
}
