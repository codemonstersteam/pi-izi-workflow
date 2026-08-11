// MODULE_CONTRACT: workflows/izi.js — the program: task → brd → survey-plan → scope → graph
// Purpose:      one decision — the ORDER of the pipeline, and it lives here as CODE. A phase is a
//               named function, not a manifest entry: with five steps, five hand-written calls are
//               cheaper than a pipeline.json plus a dispatcher plus their tests (docs/workflow.md
//               §1-§2, docs/concept.md, "What is deferred and why"). The rule returns when the cost of
//               listing phases by hand exceeds the cost of policy-as-data — not before.
// io:           none directly. This file runs in a vm sandbox with NO import, NO fs, NO network and
//               NO timers (pi-extensible-workflows/packages/core/src/execution.ts) — every byte it
//               reads or writes goes through a host function listed below.
// EXTERNAL_DEPENDENCY: ext/index.mjs (installed by `pi install ./ext`) injects these as sandbox
//               GLOBALS — readText · answers · brdForm · budgets · herdrStatus · checkTask · checkBrd ·
//               promote · setPending · clearPending · survey · cells · digest · reuse · remember ·
//               checkPart · buildGraph. They are not
//               imported and cannot be: `X is not defined` on any of them means the extension
//               loaded into this pi session is OLDER than this script (the extension is read at
//               session start, this file at every run) — restart pi. The catch at the bottom says
//               exactly that, because otherwise the message is indistinguishable from a typo.
// EXTERNAL_DEPENDENCY: izi.config.json in the RUN's root — loops · questions · checkpointRetries ·
//               maxParallel. Read once, at the start, by budgets(); the defaults live in
//               core/budgets.mjs and are NOT copied here. A broken config is a refusal, never a
//               silent default.
// EXTERNAL_DEPENDENCY: roles `gilb` (steps/brd/gilb.md) and `scout` (steps/scope/scout.md) resolved
//               by pi from the extension's roleDirectories BY FILENAME (validation.js
//               scanRoleFiles). Renaming a role file breaks agent({role}) with no other symptom.
// EXTERNAL_DEPENDENCY: order templates read from disk at run time — steps/brd/order.tpl,
//               steps/scope/order.survey.tpl, steps/scope/order.spine.tpl. prompt() demands an
//               EXACT bidirectional match between a template's placeholders and the values passed
//               here: an added key with no placeholder, or a placeholder with no key, throws at
//               launch. steps/scope/part.test.mjs holds that seam.
// EXTERNAL_DEPENDENCY: sandbox globals from the host — agent · prompt · checkpoint · parallel ·
//               pipeline · phase · log · args · JSON · Math. NOT available: Date, Math.random,
//               process, console, fetch, timers. Anything needing the clock or randomness belongs
//               in a host function, not here.
// EXTERNAL_DEPENDENCY: the operator's chat. The run is launched with `foreground: false`
//               (prompts/izi.md), so checkpoint() pauses arrive as ORDINARY chat messages and the
//               operator answers in that window; the model then calls the izi_answer tool. There is
//               no second terminal and no headless runner any more.
// Invariants:   a guardrail decides, a role never certifies itself; every check runs against the
//               STAGING path and only a green check leads to promote(); a question to the operator
//               does not spend the redelegation budget (different counters, both declared data);
//               artifacts are written by host functions only after the decision to accept them.
// Interface:    the workflow's own result — { track: "ok"|"err", code, ... } returned to the host.

// Budgets are assigned ONCE, before any phase. A budget that could change mid-run would make
// "the loop is exhausted after N attempts" a statement about nothing.
let LOOPS;              // gilb/scout redelegations after a RED guardrail check, NOT questions
let QUESTIONS;          // operator exchanges allowed in one run
let CHECKPOINT_RETRIES; // re-pauses on the SAME question when no matching answer showed up
let MAX_PARALLEL;       // swarm batch size at step 4 — see scope() for why the sandbox needs one

const ok = (fields) => ({ track: "ok", code: 0, ...fields });
const err = (kind, fields) => ({ track: "err", kind, code: kind === "crashed" ? 2 : 10, ...fields });
class Exit extends Error { constructor(result) { super("exit"); this.result = result; } }
const exit = (result) => { throw new Exit(result); };

// ENVELOPE — the one shape every role in this run returns through outputSchema. The host validates
// it (standards/workflow.md §5), so no parser is written anywhere. Fields are shared across roles on
// purpose: `requirements`/`questions` belong to gilb, `modules`/`gaps` to scout, and a role simply
// omits what is not its own.
const ENVELOPE = {
  type: "object",
  properties: {
    track: { type: "string", enum: ["ok", "err"] },
    artifact: { type: "string" },
    requirements: { type: "number" },
    questions: { type: "number" },
    modules: { type: "number" },
    gaps: { type: "number" },
    kind: { type: "string", enum: ["blocked", "invalid", "question", "escalate", "crashed"] },
    subject: { type: "string" },
    evidence: { type: "string" },
    answer_cmd: { type: "string" },
  },
  required: ["track"],
  additionalProperties: false,
};

// FUNCTION_CONTRACT: task — step 1: the operator's raw requirement, judged
//   Input:        —
//   Dependencies: EXTERNAL — checkTask (ext/index.mjs → steps/task/task.mjs::checkTaskText)
//   Antecedent:   the run's cwd is the project directory; TASK.md is the operator's to place
//   Consequent:   success: returns; TASK.md is non-empty and ≤300 lines
//                 failure: exits the run with err("blocked") — this step has NO role, so a red
//                          check is terminal by construction: a human fixes it and re-runs
//   Purity:       io (through the host)
async function task() {
  const t = await checkTask({}); // registered functions require exactly one JSON object argument
  if (!t.ok) exit(err("blocked", { subject: t.why }));
}

// byteLen — UTF-8 byte length without Buffer.
// EXTERNAL_DEPENDENCY: none — encodeURIComponent/unescape are plain ECMAScript globals, unlike
// Buffer, which is a Node global and is never injected into this sandbox. The escape-to-one-char-
// per-byte trick gives an exact UTF-8 byte count without either.
//
// FUNCTION_CONTRACT: byteLen — how many bytes a string costs in the checkpoint channel
//   Input:        s — any value; null/undefined count as ""
//   Consequent:   success: the UTF-8 byte length as a number
//   Purity:       pure
function byteLen(s) { return unescape(encodeURIComponent(String(s == null ? "" : s))).length; }

// The checkpoint prompt is capped at 1024 UTF-8 bytes and its context at 4096
// (pi-extensible-workflows/src/validation.ts:17-22, validateCheckpoint); past that it throws
// INVALID_METADATA and the run CRASHES rather than degrades. gilb's subject is natural-language
// operator prose with no length contract of its own, so the prompt cannot simply interpolate it.
const ASK_HEAD = "Роль gilb ждёт ответа оператора в этом чате. ";
const ASK_TAIL = " Получив ответ — вызови tool izi_answer({text: ответ дословно}). Затем workflow_respond({runId: <runId запуска>, name: <name из заголовка этого сообщения>, approved: true}). Отказ оператора — approved: false.";
const ASK_LONG = "Вопрос слишком длинный для этого сообщения — прочитай его дословно в .agent/pending.json (поле subject) и задай оператору оттуда.";
const RETRY_NOTE = "\n\n(Ответ не найден в .agent/answers.md по этому ключу — переспроси и повтори вызовы.)";

// FUNCTION_CONTRACT: askPrompt — the chat message that carries a question to the operator
//   Input:        subject — the question verbatim, any length; retryNote — appended note or ""
//   Dependencies: byteLen, ASK_HEAD/ASK_TAIL/ASK_LONG
//   Antecedent:   subject is the role's own wording; it is NEVER shortened here
//   Consequent:   success: a string that fits the 1024-byte checkpoint limit BY CONSTRUCTION. The
//                          long form does not truncate the question — a clipped question can change
//                          its meaning mid-sentence — it points at .agent/pending.json, which
//                          setPending() wrote with no length limit at all (a file, not this channel)
//   Purity:       pure
function askPrompt(subject, retryNote) {
  const note = retryNote || "";
  const short = `${ASK_HEAD}Спроси оператора дословно:\n${subject}${ASK_TAIL}${note}`;
  if (byteLen(short) <= 1024) return short;
  return `${ASK_HEAD}${ASK_LONG}${ASK_TAIL}${note}`; // byte-safe regardless of subject length
}

// FUNCTION_CONTRACT: askOperator — one question→answer exchange with the operator
//   Input:        env — the role's err envelope carrying `subject` (the question) and `evidence`;
//                 n — the question's ordinal in this run, used for the checkpoint name
//   Dependencies: EXTERNAL — setPending, checkpoint, answers, clearPending; askPrompt
//   Antecedent:   env.subject is the question VERBATIM; CHECKPOINT_RETRIES ≥ 1
//   Consequent:   success: returns only when an answer to THIS subject exists in
//                          .agent/answers.md — the answer is a FACT ON DISK, not a click
//                 failure: exits with err("escalate") if the operator rejects, or err("question")
//                          when no answer showed up within CHECKPOINT_RETRIES re-asks
//   Purity:       io (through the host)
//
// checkpoint() resolves to "approved" | "rejected" and carries no text at all (standards/workflow.md
// §OPERATOR_CHANNEL), so it is a BARRIER over a fact, never the fact itself. The question KEY that
// izi_answer writes against is never a model input: setPending() puts it in .agent/pending.json
// BEFORE the pause (so it is there the instant the message lands in chat), and clearPending() removes
// it only AFTER an answer to this subject is confirmed present — never on Reject and never on
// exhausted retries, where the run is terminating anyway.
//
// BUG_FIX_CONTEXT: live run 8bb23932-f368-4632-9b0b-75ea32eea95f.
//   Previous: the last line called `clearPending()` with no argument.
//   Problem:  every registered host function requires exactly one JSON object argument
//             (execution.ts: "<name> requires exactly one JSON object argument"), so askOperator
//             threw AFTER the operator's answer had already been accepted — the exchange worked and
//             the run died anyway, with a crash that named the wrong culprit.
//   Fix:      clearPending({}). Re-proven by run 0445e4cd, which reached .agent/brd.md.
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

// FUNCTION_CONTRACT: brd — step 2: raw requirement → measurable BRD, by role `gilb`
//   Input:        —
//   Dependencies: EXTERNAL — readText, answers, agent(role "gilb"), checkBrd, promote, prompt;
//                 askOperator
//   Antecedent:   step 1 passed; steps/brd/order.tpl exists in the run's cwd; LOOPS ≥ 1
//   Consequent:   success: RETURNS (does not exit — since S15 this is no longer the end of the run)
//                          with .agent/brd.md promoted from staging after a GREEN checkBrd
//                 failure: exits — err(kind) on a role error rail, err("escalate") when LOOPS
//                          redelegations were spent, carrying the LAST guardrail diagnosis
//   Purity:       io (through the host)
//
// Two budgets, never mixed: a question does not spend LOOPS (it costs the operator's time, not the
// model's), and a red check does not spend QUESTIONS. Both counters are data, not prose.
//
// BUG_FIX_CONTEXT: S14 — the exhaustion exit used to say "retries exhausted" and nothing else.
//   Problem:  it threw away the only useful thing the run knew: WHY the check was red. The operator
//             got a count instead of a diagnosis the guardrail had already written.
//   Fix:      `feedback` here IS check.blockers from the last red iteration, so the exit carries it.
async function brd() {
  const orderTpl = await readText({ path: "steps/brd/order.tpl" });
  const TASK = await readText({ path: "TASK.md" });
  const STAGING = ".agent/staging/brd.md";
  const CHECK = "checkBrd({path}) — steps/brd/brd.mjs::newBrd, numbers from TASK.md + operator answer values";
  // The anchor rule and the 3..7 range are SUBSTITUTED from core/form.mjs, never retyped here or in
  // the template: the guardrail quotes that same registry in its refusal, and two texts of one rule
  // drift apart in silence (backlog G9e, standards/code.md §1).
  const FORM = await brdForm({});
  let feedback = "(none — first attempt)", attempt = 0, asked = 0;

  while (attempt < LOOPS) {
    const seen = await answers({});
    const ANSWERS = seen.length ? seen.map((a) => `- вопрос: ${a.question}\n  ответ: ${a.text}`).join("\n") : FORM.absentDoc;
    const order = prompt(orderTpl, {
      TASK,
      ANSWERS,
      FEEDBACK: feedback,
      STAGING,
      CHECK,
      SUBJECTS_MIN: FORM.subjectsMin,
      SUBJECTS_MAX: FORM.subjectsMax,
      SUBJECT_RULE: FORM.subjectRule,
    });
    const env = await agent(order, { role: "gilb", outputSchema: ENVELOPE });

    if (env.track === "err" && env.kind === "question") {
      if (++asked > QUESTIONS) exit(err("question", { subject: env.subject, evidence: env.evidence, diagnosis: `вопросов за прогон больше ${QUESTIONS}` }));
      await askOperator(env, asked);
      continue; // a question does not spend the redelegation budget
    }
    if (env.track === "err") exit(err(env.kind, { subject: env.subject, evidence: env.evidence }));

    const check = await checkBrd({ path: STAGING }); // the check runs ON STAGING, before any promote
    if (check.ok) {
      await promote({ from: STAGING, to: ".agent/brd.md" }); // green check → THEN promote
      log(`brd: ok, requirements=${check.requirements}`);
      return;
    }
    feedback = check.blockers;
    attempt++;
  }
  exit(err("escalate", { subject: feedback, evidence: `цикл исчерпан за ${LOOPS} попыток` }));
}

// FUNCTION_CONTRACT: surveyPlan — step 3: the run's file tree → swarm cells
//   Input:        —
//   Dependencies: EXTERNAL — survey (ext/index.mjs → steps/survey-plan/plan.mjs::newPlan,
//                 steps/scope/computed.mjs::newComputed)
//   Antecedent:   .agent/brd.md exists (its subjects[] annotate files; they never select them)
//   Consequent:   success: RETURNS with .agent/survey-plan.json AND .agent/graph-computed.xml
//                          written; the cost of the swarm (files, bytes, cells) is LOGGED before
//                          step 4 spends a single token, and so are the BORDERS of what the script
//                          could compute — a language with no edge rules is named, never silent
//                 failure: exits with err("blocked") — the only refusal is no-files: an empty
//                          repository has nothing to map
//   Purity:       io (through the host)
//
// A SCRIPT step: no role, no model call, no operator. What is computable is computed for 0 tokens
// (docs/concept.md, rule 3).
async function surveyPlan() {
  const PLAN = ".agent/survey-plan.json";
  const p = await survey({ path: PLAN });
  if (!p.ok) exit(err("blocked", { subject: p.why }));
  log(`survey-plan: files=${p.files} bytes=${p.bytes} cells=${p.cells} edges=${p.edges} [${p.langs.join(" ")}]`);
  // The anchors that matched NO file, said out loud and never as a blocker. This is the pipeline's
  // only cheap measurement of step 2's translation into the repository's words: an anchor invented as
  // a category label ("retention", "compatibility") lands here every time (backlog G9f). A miss costs
  // nothing by design — the anchor MARKS a file, it never selects one — so this is a number to read,
  // not a rail to stop on.
  if (p.gaps.length) log(`survey-plan: якорей без единого файла — ${p.gaps.length} из ${p.subjects}: ${p.gaps.join(" · ")}`);
  if (p.skipped.length) log(`survey-plan: не прочитано (крупнее потолка): ${p.skipped.join(", ")}`);
}

// FUNCTION_CONTRACT: scout — one plan cell → one fragment of the application graph
//   Input:        cell — { id, kind, subjects[], files[{path,bytes}] } from .agent/survey-plan.json;
//                 orderTpl — the order text, chosen by the caller from the cell's KIND field;
//                 BRD — the text of .agent/brd.md, context for the scout, never a file selector
//   Dependencies: EXTERNAL — prompt, agent(role "scout"), reuse, digest, checkPart, promote, remember
//   Antecedent:   the cell came from step 3; orderTpl is non-empty; LOOPS ≥ 1
//   Consequent:   success: { ok: true, modules, gaps, hit } and .agent/graph-parts/<id>.xml exists,
//                          promoted only after a GREEN checkPart against the staging path — or
//                          copied from the cache, which is gated by the SAME guardrail
//                 failure: { ok: false, why } — RETURNED AS A VALUE, never thrown
//   Purity:       io (through the host)
//
// BUG_FIX_CONTEXT: designed against pi-extensible-workflows/packages/core/src/execution.ts:253-262.
//   Previous shape considered: exit(err(...)) straight from inside the swarm task.
//   Problem:  parallel() catches EVERY error a task throws and rethrows its own workflowError. The
//             Exit instance would never reach this file's catch, so a cell that legitimately failed
//             its guardrail would surface as `crashed` with a host message instead of `blocked` with
//             the cell id and the blockers the role needs.
//   Fix:      refusals travel as values; scope() collects them after the batch and decides.
async function scout(cell, orderTpl, BRD) {
  const STAGING = `.agent/staging/graph-parts/${cell.id}.xml`;
  const CHECK = "checkPart({path, cell}) — steps/scope/part.mjs::newPart; the cell's file list is read from .agent/survey-plan.json, not from your part";
  let feedback = "(none — first attempt)";

  // The cache is asked FIRST, before a single token is spent. It answers "yes" only when composition,
  // sha1 and grammar version all match AND the stored part passes the guardrail NOW (ext/index.mjs::
  // reuse) — a cached part that would not close the step today does not close it because it once did.
  const cached = await reuse({ cell: cell.id });
  if (cached.ok) {
    log(`scope: ${cell.id} — из кэша (.izi/parts), скаут не звался`);
    return { ok: true, modules: cached.modules, gaps: cached.gaps, hit: true };
  }

  // The order carries a DIGEST, not the file list: path, language, computed imports/routes/drivers
  // and the declarations of every file. The role opens a file only where the digest is not enough.
  const files = await digest({ cell: cell.id });
  if (!files.ok) return { ok: false, why: `${cell.id}: ${files.why}` };

  for (let attempt = 0; attempt < LOOPS; attempt++) {
    const order = prompt(orderTpl, {
      CELL: cell.id,
      BRD,
      STAGING,
      CHECK,
      FEEDBACK: feedback,
      SUBJECTS: cell.subjects.length ? cell.subjects.join(" · ") : "(no anchors matched this cell)",
      FILES: files.files,
    });
    const env = await agent(order, { role: "scout", outputSchema: ENVELOPE });
    // There is no question rail at this step (docs/scope.md §6): what the scout could not read is a
    // <gap>, not a pause. Any err is therefore a cell failure, reported with the role's own words.
    if (env.track === "err") return { ok: false, why: `${cell.id}: ${env.kind || "err"} — ${env.subject || "(без subject)"}` };

    const check = await checkPart({ path: STAGING, cell: cell.id }); // check ON STAGING, before promote
    if (check.ok) {
      await promote({ from: STAGING, to: `.agent/graph-parts/${cell.id}.xml` });
      await remember({ cell: cell.id });   // only a PROMOTED part is worth remembering
      return { ok: true, modules: check.modules, gaps: check.gaps, hit: false };
    }
    feedback = check.blockers;
  }
  return { ok: false, why: `${cell.id}: цикл исчерпан за ${LOOPS} попыток — ${feedback}` };
}

// FUNCTION_CONTRACT: scope — step 4: the swarm; every cell of the plan into a graph part
//   Input:        —
//   Dependencies: EXTERNAL — cells, readText, parallel; scout
//   Antecedent:   step 3 wrote .agent/survey-plan.json; MAX_PARALLEL ≥ 1; both order templates exist
//   Consequent:   success: exits with ok — one .agent/graph-parts/<cell>.xml per plan cell, and the
//                          totals (cells, modules, gaps) logged, and RETURNS — since step 5 exists,
//                          this is no longer the end of the run, exactly as S15 did to brd()
//                 failure: exits with err("blocked") naming EVERY cell that failed in the batch —
//                          a lost cell is a lost graph node, so no cell is skipped "to salvage the
//                          rest"; the operator sees all of them at once, not the first one
//   Purity:       io (through the host)
//
// EXTERNAL_DEPENDENCY (behavioural): parallel(name, RECORD) — the second argument is a record
// { taskName: () => Promise }, not an array, and the result is { taskName: value }
// (execution.ts:245-266).
//
// BUG_FIX_CONTEXT: live launch in /private/tmp/izi-sandbox-scope, before a single token was spent.
//   Previous: the batch was built dynamically — parallel(`scope-b${n}`, Object.fromEntries(
//             batch.map((c) => [c.id, () => scout(c, …)]))), which reads naturally and is what the
//             concept sketch showed.
//   Problem:  the host validates the workflow SOURCE before running it and demands both arguments
//             be literals: a literal string name and an ObjectExpression of tasks
//             (pi-extensible-workflows/packages/core/src/validation.ts:755). The run never started —
//             `The workflow metadata is invalid: parallel requires an operation name string and
//             tasks record`. A swarm whose width comes from a config file at run time is therefore
//             IMPOSSIBLE here, not merely discouraged.
//   Fix:      a literal record of SWARM_WIDTH slots, each slot taking the i-th cell of the batch and
//             returning null when the batch is shorter. The width is a literal in this file; the
//             izi.config.json budget can only LOWER it (Math.min below), never raise it.
//
// Why any limit at all: the sandbox has NO concurrency limiter — parallel() is Promise.all, so a
// hundred cells would go to the model at once.
//
// Why the same `agent(...)` call site is legal in N concurrent slots: the host keys its in-flight
// guard on [inheritedAgentPath, callSite], and parallel() gives every task its own inherited path
// (execution.ts:107-130, 253). Outside parallel(), two concurrent calls from one line are
// INVALID_METADATA — which is why the swarm may not be hand-rolled with Promise.all.
const SWARM_WIDTH = 8; // literal by host contract — see BUG_FIX_CONTEXT above

// FUNCTION_CONTRACT: slot — one seat of the swarm
//   Input:        batch — the cells of this batch; i — the seat's index; TPL — orders by cell kind;
//                 BRD — the text of .agent/brd.md
//   Dependencies: scout
//   Antecedent:   i is within 0..SWARM_WIDTH-1; the batch may be SHORTER than the swarm
//   Consequent:   success: scout's result, or null when this seat has no cell — an idle seat costs
//                          nothing and is filtered out by the caller
//   Purity:       io (through scout)
async function slot(batch, i, TPL, BRD) {
  const cell = batch[i];
  if (!cell) return null;
  return scout(cell, TPL[cell.kind] || TPL.survey, BRD);
}

async function scope() {
  const plan = await cells({ path: ".agent/survey-plan.json" });
  if (!plan.ok) exit(err("blocked", { subject: plan.why }));

  const BRD = await readText({ path: ".agent/brd.md" });
  const TPL = {
    survey: await readText({ path: "steps/scope/order.survey.tpl" }),
    spine: await readText({ path: "steps/scope/order.spine.tpl" }),
  };

  const width = Math.min(MAX_PARALLEL, SWARM_WIDTH);
  let modules = 0, gaps = 0, hits = 0;
  for (let i = 0; i < plan.cells.length; i += width) {
    const batch = plan.cells.slice(i, i + width);
    log(`scope: батч ${batch.map((c) => c.id).join(" ")}`);

    const done = await parallel("scope-batch", {
      s1: () => slot(batch, 0, TPL, BRD),
      s2: () => slot(batch, 1, TPL, BRD),
      s3: () => slot(batch, 2, TPL, BRD),
      s4: () => slot(batch, 3, TPL, BRD),
      s5: () => slot(batch, 4, TPL, BRD),
      s6: () => slot(batch, 5, TPL, BRD),
      s7: () => slot(batch, 6, TPL, BRD),
      s8: () => slot(batch, 7, TPL, BRD),
    });

    const results = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"].map((k) => done[k]).filter((r) => r);
    const bad = results.filter((r) => !r.ok);
    if (bad.length) exit(err("blocked", { subject: bad.map((r) => r.why).join("\n  ") }));
    for (const r of results) { modules += r.modules; gaps += r.gaps; if (r.hit) hits += 1; }
  }

  log(`scope: cells=${plan.cells.length} modules=${modules} gaps=${gaps} cache-hit=${hits}`);
}

// FUNCTION_CONTRACT: graph — step 5: the swarm's parts + the script's facts → one map
//   Input:        —
//   Dependencies: EXTERNAL — buildGraph (ext/index.mjs → steps/graph/graph.mjs::newGraph)
//   Antecedent:   step 4 promoted a part for EVERY cell of .agent/survey-plan.json
//   Consequent:   success: exits ok with .agent/appgraph.xml — the first artifact that knows the
//                          repository. The merge is a commutative monoid over the node path, so the
//                          order the scouts finished in cannot change the result and no batch order
//                          is replayed here
//                 failure: exits err("blocked"). Only ONE of the refusals is about the repository
//                          itself — "no test suite", which a human fixes with a separate task; the
//                          others mean an invariant of steps 3-4 broke (docs/graph.md §5). There is
//                          no role at this step, so no refusal has a repair rail: everything a
//                          redelegation could not have fixed is DECLARED in the artifact instead
//   Purity:       io (through the host)
//
// A SCRIPT step, like surveyPlan: no role, no model call, no operator, no staging. What is computable
// is computed for 0 tokens (docs/concept.md, rule 3) — and here that includes the whole architecture:
// components, levels and coupling come out of edges the script already had (docs/graph.md §2).
async function graph() {
  const g = await buildGraph({ path: ".agent/appgraph.xml" });
  if (!g.ok) exit(err("blocked", { subject: g.why }));
  log(`graph: modules=${g.modules} components=${g.components} isolated=${g.isolated} levels=${g.levels} edges=${g.edges} suites=${g.suites} surface=${g.surface}`);
  // What the repository did NOT answer is printed BEFORE step 10 turns it into a question: a
  // found="no" that stays inside the artifact is indistinguishable from a step that never ran.
  if (g.unanswered.length) log(`graph: не найдено в репозитории — ${g.unanswered.join(", ")} (вопрос оператору на шаге 10)`);
  if (g.gaps) log(`graph: пробелов ${g.gaps} — непрочитанное, вход нечитаем, тест без сьюта`);
  if (g.cycles) log(`graph: циклов ${g.cycles} — топосорт шага 10 их не переживёт, см. <cycle> в артефакте`);
  exit(ok({ artifact: ".agent/appgraph.xml", modules: g.modules, components: g.components, gaps: g.gaps }));
}

log("izi: start");
try {
  const b = await budgets({});
  if (!b.ok) exit(err("blocked", { subject: b.why })); // a broken config is a refusal, not a default
  LOOPS = b.loops; QUESTIONS = b.questions; CHECKPOINT_RETRIES = b.checkpointRetries; MAX_PARALLEL = b.maxParallel;
  log(`budgets: loops=${LOOPS} questions=${QUESTIONS} checkpointRetries=${CHECKPOINT_RETRIES} maxParallel=${MAX_PARALLEL} (${b.source})`);

  // Observability is declared out loud, never assumed: with herdr unavailable the herdr extension
  // does not register at all and stays SILENT, so a run from an ordinary terminal looks exactly like
  // a broken integration. The run is not blocked by it — an unobserved run is still a run.
  const h = await herdrStatus({});
  log(h.available
    ? `herdr: on pane=${h.pane}${h.fullyInspectable ? " fully-inspectable" : " (fully-inspectable выключен в ~/.pi/agent/pi-extensible-workflows/settings.json)"}`
    : `herdr: off — ${h.why}`);

  phase("task"); await task();
  phase("brd"); await brd();
  phase("survey-plan"); await surveyPlan();
  phase("scope"); await scope();
  phase("graph"); await graph();
  return ok({}); // unreachable — graph() always exits — kept as the fall-through for a sixth phase
} catch (e) {
  if (e instanceof Exit) return e.result;
  const msg = String((e && e.message) || e);
  // BUG_FIX_CONTEXT: a bare "X is not defined" here used to be indistinguishable from a typo in this
  // script. It never is: host functions are injected by the extension, which pi reads at SESSION
  // start while this file is read at every run — so the message means the session's extension is
  // older than the workflow. The diagnosis names the fix, because nothing else in the run can.
  if (/ is not defined$/.test(msg)) {
    return err("crashed", { subject: `${msg} — функции хоста нет в этой сессии pi: расширение старше воркфлоу, перезапусти pi` });
  }
  return err("crashed", { subject: msg });
}
