// izi: two concrete rails, task → brd (S11). No step manifest, no pipeline.json, no shell() — the
// extension (ext/index.mjs) puts readText/answers/checkTask/checkBrd/promote on the sandbox as
// globals, and this script calls them directly. Docs: docs/workflow.md §1-§2, docs/concept.md.
// Loop/question budgets are literals — two steps do not earn a policy-as-data mechanism yet
// (docs/concept.md, «отложено»). The operator channel is checkpoint only: no headless run exists
// any more (bin/run.mjs is gone) — this workflow starts from an interactive pi session via `/izi`.

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

// askOperator — checkpoint is a barrier (approved|rejected), never a fact. The fact is an answer
// that shows up in .agent/answers.md under the exact question key — until then Approve is a no-op
// and gilb is not called again (a re-pause is a peer-review of the operator, not a paid redelegation).
async function askOperator(env, n) {
  const cmd = env.answer_cmd || `node bin/answer.mjs --q=${JSON.stringify(env.subject)} --text="<ответ>"`;
  for (let retry = 1; retry <= CHECKPOINT_RETRIES; retry++) {
    const retryNote = retry === 1 ? "" : "\n\n(Ответ не найден — выполните команду и нажмите Approve ещё раз.)";
    const decision = await checkpoint({
      name: retry === 1 ? `brd-q${n}` : `brd-q${n}-retry${retry}`,
      prompt: `Роль gilb ждёт ответа:\n${env.subject}\n\nВыполните команду:\n${cmd}\n\nзатем Approve. Reject — остановка.${retryNote}`,
      context: { subject: env.subject, evidence: env.evidence, answer_cmd: cmd },
    });
    if (decision !== "approved") exit(err("escalate", { subject: env.subject, evidence: env.evidence }));
    if ((await answers({})).some((a) => a.question === env.subject)) return;
  }
  exit(err("question", { subject: env.subject, evidence: env.evidence, answer_cmd: cmd, diagnosis: `ответ не получен за ${CHECKPOINT_RETRIES} переспросов` }));
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
