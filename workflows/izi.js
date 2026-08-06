// izi: two concrete rails, task → brd (S11). No step manifest, no pipeline.json, no shell() — the
// extension (ext/index.mjs) puts readText/answers/checkTask/checkBrd/promote/setPending/clearPending
// on the sandbox as globals, and this script calls them directly. Docs: docs/workflow.md §1-§2,
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

const LOOPS = 3;              // gilb red-check redelegations (guardrail failures), NOT questions
const QUESTIONS = 3;          // operator exchanges allowed in one run
const CHECKPOINT_RETRIES = 2; // re-pause on the SAME question when no matching answer showed up

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
      const p = await promote({ from: STAGING, to: ".agent/brd.md" }); // green check → THEN promote
      exit(ok({ artifact: ".agent/brd.md", requirements: check.requirements, advice: check.advice, at: p.at }));
    }
    feedback = check.blockers;
    attempt++;
  }
  exit(err("escalate", { subject: "повторы исчерпаны" }));
}

log("izi: start");
try {
  phase("task"); await task();
  phase("brd"); await brd();
  return ok({}); // unreachable — brd() always exits — kept so a future third phase has a fall-through
} catch (e) {
  if (e instanceof Exit) return e.result;
  return err("crashed", { subject: String((e && e.message) || e) });
}
