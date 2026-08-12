// MODULE_CONTRACT: workflows/izi.js — the program: task → brd → survey-plan → scope → graph → intake → weight → ripple
// Purpose:      one decision — the ORDER of the pipeline, and it lives here as CODE. A phase is a
//               named function, not a manifest entry: with eight steps, eight hand-written calls are
//               cheaper than a pipeline.json plus a dispatcher plus their tests (docs/workflow.md
//               §1-§2, docs/concept.md, "What is deferred and why"). The rule returns when the cost of
//               listing phases by hand exceeds the cost of policy-as-data — not before.
// io:           none directly. This file runs in a vm sandbox with NO import, NO fs, NO network and
//               NO timers (pi-extensible-workflows/packages/core/src/execution.ts) — every byte it
//               reads or writes goes through a host function listed below.
// EXTERNAL_DEPENDENCY: ext/index.mjs (installed by `pi install ./ext`) injects these as sandbox
//               GLOBALS — readText · answers · brdForm · frdForm · budgets · herdrStatus · newRun · checkTask ·
//               checkBrd · promote · setPending · clearPending · survey · cells · digest · reuse ·
//               remember · checkPart · buildGraph · graphMap · checkFrd · weight · ripple. They are not
//               imported and cannot be: `X is not defined` on any of them means the extension
//               loaded into this pi session is OLDER than this script (the extension is read at
//               session start, this file at every run) — restart pi. The catch at the bottom says
//               exactly that, because otherwise the message is indistinguishable from a typo.
// EXTERNAL_DEPENDENCY: izi.config.json in the RUN's root — loops · questions · checkpointRetries ·
//               maxParallel. Read once, at the start, by budgets(); the defaults live in
//               core/budgets.mjs and are NOT copied here. A broken config is a refusal, never a
//               silent default.
// EXTERNAL_DEPENDENCY: roles `gilb` (steps/brd/gilb.md), `scout` (steps/scope/scout.md) and `intake`
//               (steps/intake/intake.md) resolved by pi from the extension's roleDirectories BY
//               FILENAME (validation.js scanRoleFiles). Renaming a role file breaks agent({role})
//               with no other symptom.
// EXTERNAL_DEPENDENCY: order templates read from disk at run time — steps/brd/order.tpl,
//               steps/scope/order.survey.tpl, steps/scope/order.spine.tpl, steps/intake/order.tpl.
//               prompt() demands an
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
let LOOPS;              // gilb/scout/intake redelegations after a RED guardrail check, NOT questions
let QUESTIONS;          // QUESTIONS allowed in one run — not exchanges: intake asks them in BATCHES
let QUESTION_ROUNDS;    // trips to the operator allowed in one run — the round is what costs context
let CHECKPOINT_RETRIES; // re-pauses on the SAME question when no matching answer showed up
let MAX_PARALLEL;       // swarm batch size at step 4 — see scope() for why the sandbox needs one

const ok = (fields) => ({ track: "ok", code: 0, ...fields });
const err = (kind, fields) => ({ track: "err", kind, code: kind === "crashed" ? 2 : 10, ...fields });
class Exit extends Error { constructor(result) { super("exit"); this.result = result; } }
const exit = (result) => { throw new Exit(result); };

// ENVELOPE — the one shape every role in this run returns through outputSchema. The host validates
// it (standards/workflow.md §5), so no parser is written anywhere. Fields are shared across roles on
// purpose: `requirements`/`questions` belong to gilb, `modules`/`gaps` to scout,
// `deltas`/`scenarios`/`unknown` to intake, and a role simply omits what is not its own.
const ENVELOPE = {
  type: "object",
  properties: {
    track: { type: "string", enum: ["ok", "err"] },
    artifact: { type: "string" },
    requirements: { type: "number" },
    questions: { type: "number" },
    modules: { type: "number" },
    gaps: { type: "number" },
    deltas: { type: "number" },
    scenarios: { type: "number" },
    unknown: { type: "number" },
    kind: { type: "string", enum: ["blocked", "invalid", "question", "escalate", "crashed"] },
    subject: { type: "string" },
    // items — the questions of a BATCH as a LIST. The machine numbers them (setPending) and the
    // answer is addressed per number, so nothing has to parse "1) … 2) …" out of prose. A role that
    // asks a single question omits this and the pipeline reads [subject].
    items: { type: "array", items: { type: "string" } },
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

// FUNCTION_CONTRACT: answersBlock — the operator's answers as they travel INTO an order
//   Input:        seen — answers({})'s value: [{ n, question, text }]; absent — what to substitute
//                 when there are none yet (the registry's wording, never invented here)
//   Dependencies: —
//   Antecedent:   seen is an array; an empty one means the first exchange
//   Consequent:   success: the SAME grammar the answers file itself carries — one `<question_N>` and
//                          one `<answer_N>` per answer. One fact, one form: before this, the file was
//                          xml on disk and prose in the order, and a third shape of the same fact is
//                          how a format drifts (CLAUDE.md: do not restate in prose what lives in code)
//   Purity:       pure
// Why the role gets the pairs and not a paraphrase: the boundary "a question is not a source of
// facts" (core/answers.mjs, F17) is then visible in the SHAPE — the alternatives' numbers sit inside
// question_N, the value inside answer_N — and the role can cite "answer 2" instead of retelling it.
// The numbering here is the READER's, running 1..N over every exchange of the run: on disk each
// round numbers its own questions from 1, and two `question_1` in one block would be ambiguous. The
// pipeline never matches on these numbers — pending.json owns the ones that address an answer.
function answersBlock(seen, absent) {
  if (!seen.length) return absent;
  const body = seen.map((a, i) => `  <question_${i + 1}>${a.question}</question_${i + 1}>\n  <answer_${i + 1}>${a.text}</answer_${i + 1}>`).join("\n");
  return `<exchange>\n${body}\n</exchange>`;
}

// The checkpoint prompt is capped at 1024 UTF-8 bytes and its context at 4096
// (pi-extensible-workflows/src/validation.ts:17-22, validateCheckpoint); past that it throws
// INVALID_METADATA and the run CRASHES rather than degrades. gilb's subject is natural-language
// operator prose with no length contract of its own, so the prompt cannot simply interpolate it.
const ASK_HEAD = (role) => `Роль ${role} ждёт ответа оператора в этом чате. `;
const ASK_TAIL = " Получив ответ — вызови tool izi_answer({exchange}) со ВСЕМИ ответами разом: блок <exchange><question_N>вопрос</question_N><answer_N>ответ</answer_N>…</exchange>, номера и вопросы возьми из .agent/pending.json (поле items), не придумывай. ПОКАЖИ оператору разложение, которое вернёт тул. Затем workflow_respond({runId: <runId запуска>, name: <name из заголовка этого сообщения>, approved: true}). Отказ оператора — approved: false.";
// The long form is the NORMAL path for intake, not an emergency one: a grilling batch of 25-30
// questions cannot fit 1024 bytes and never will. The questions are not shortened — a clipped
// question changes its meaning — they travel in .agent/pending.json, a file with no length limit.
const ASK_LONG = "Вопросы не влезают в это сообщение — прочитай их дословно в .agent/pending.json (поле subject) и задай оператору оттуда, все сразу.";
const RETRY_NOTE = "\n\n(Ответы не найдены в .agent/answers.md — переспроси оператора и вызови izi_answer со ВСЕМИ ответами разом, по номерам из .agent/pending.json.)";

// FUNCTION_CONTRACT: askPrompt — the chat message that carries a question to the operator
//   Input:        subject — the question verbatim, any length; retryNote — appended note or ""
//   Dependencies: byteLen, ASK_HEAD/ASK_TAIL/ASK_LONG
//   Antecedent:   subject is the role's own wording; it is NEVER shortened here
//   Consequent:   success: a string that fits the 1024-byte checkpoint limit BY CONSTRUCTION. The
//                          long form does not truncate the question — a clipped question can change
//                          its meaning mid-sentence — it points at .agent/pending.json, which
//                          setPending() wrote with no length limit at all (a file, not this channel)
//   Purity:       pure
function askPrompt(subject, retryNote, role) {
  const note = retryNote || "";
  const head = ASK_HEAD(role);
  const short = `${head}Спроси оператора дословно:\n${subject}${ASK_TAIL}${note}`;
  if (byteLen(short) <= 1024) return short;
  return `${head}${ASK_LONG}${ASK_TAIL}${note}`; // byte-safe regardless of subject length
}

// FUNCTION_CONTRACT: askOperator — one question→answer exchange with the operator
//   Input:        env — the role's err envelope carrying `subject` (the question) and `evidence`;
//                 n — the question's ordinal in this run, used for the checkpoint name;
//                 step — the step's id, so two steps asking in one run get distinct checkpoint names
//                        (the host keys a pause by its name; `brd-q1` twice would be one pause)
//   Dependencies: EXTERNAL — setPending, checkpoint, answers, clearPending; askPrompt
//   Antecedent:   env.subject is the question VERBATIM; env.items — the batch as a LIST when the role
//                 asked several at once; CHECKPOINT_RETRIES ≥ 1
//   Consequent:   success: returns only when EVERY question of the batch has an answer in
//                          .agent/answers.md — the answer is a FACT ON DISK, not a click
//                 failure: exits with err("escalate") if the operator rejects, or err("question")
//                          when answers were still missing after CHECKPOINT_RETRIES re-asks — and the
//                          diagnosis NAMES the numbers that stayed unanswered
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
//
// BUG_FIX_CONTEXT: live run 46edab60-39ee-4e1b-929f-08028ab011ff (the batch of six questions).
//   Previous: `answers().some(a => a.question === env.subject)` — one string compared to one string.
//   Problem:  a batch is multi-line, and the file format of the day kept an entry on ONE line: the
//             stored key came back as the first line only, the comparison failed, and the operator —
//             who had answered — was re-asked twice while their answer sat on disk. One string also
//             cannot express "four of six answered".
//   Fix:      the format carries a question per element (core/answers.mjs), and the check is per
//             ITEM: what is missing is named by number, in the re-ask and in the final diagnosis.
async function askOperator(env, n, step, role) {
  // Trimmed here, once: the parser trims what it reads back (core/answers.mjs), so a role's stray
  // leading space would otherwise make an answered question look unanswered forever.
  const items = (env.items && env.items.length ? env.items : [env.subject]).map((q) => String(q).trim());
  await setPending({ subject: env.subject, evidence: env.evidence || "", items });

  // unanswered — the items with no answer on disk, by NUMBER. One expression, used twice: before
  // the first pause and after every checkpoint, so "answered" means the same thing in both places.
  const unanswered = async () => {
    const seen = await answers({});
    return items.map((q, i) => (seen.some((a) => a.question === q) ? 0 : i + 1)).filter((x) => x);
  };

  // The answer is a FACT ON DISK, not a click — so the disk is asked FIRST. Waking the operator for
  // a question every item of which is already answered costs a round trip and buys nothing. This
  // fires only on a verbatim match of the question: a role that rewords its question asks anew, and
  // that border is the honest one — nothing here can tell two wordings apart.
  let missing = await unanswered();
  if (!missing.length) { await clearPending({}); return; }

  for (let retry = 1; retry <= CHECKPOINT_RETRIES; retry++) {
    const note = retry === 1 ? "" : `${RETRY_NOTE}\n(Без ответа: ${missing.join(", ")} из ${items.length}.)`;
    const decision = await checkpoint({
      name: retry === 1 ? `${step}-q${n}` : `${step}-q${n}-retry${retry}`,
      prompt: askPrompt(env.subject, note, role),
      context: { pending: ".agent/pending.json" },
    });
    if (decision !== "approved") exit(err("escalate", { subject: env.subject, evidence: env.evidence }));

    // The answer is judged by the QUESTION's text, which now round-trips verbatim however many lines
    // it takes; the number is what the operator and the diagnosis speak in.
    missing = await unanswered();
    if (!missing.length) { await clearPending({}); return; }
  }
  exit(err("question", {
    subject: env.subject,
    evidence: env.evidence,
    diagnosis: `нет ответов на ${missing.join(", ")} из ${items.length} за ${CHECKPOINT_RETRIES} переспросов`,
  }));
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
    const ANSWERS = answersBlock(seen, FORM.absentDoc);
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
      // gilb asks ONE question per exchange, so its round IS its question (unlike intake, which
      // batches — see intake() below). The cap it is judged by is therefore the round budget.
      if (++asked > QUESTION_ROUNDS) exit(err("question", { subject: env.subject, evidence: env.evidence, diagnosis: `обменов с оператором больше ${QUESTION_ROUNDS}` }));
      await askOperator(env, asked, "brd", "gilb");
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
//   Consequent:   success: RETURNS with .agent/appgraph.xml — the first artifact that knows the
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
}

// FUNCTION_CONTRACT: intake — step 6: the requirement fried against the map, by role `intake`
//   Input:        —
//   Dependencies: EXTERNAL — graphMap, readText, answers, frdForm, agent(role "intake"), checkFrd,
//                 promote, prompt; askOperator
//   Antecedent:   step 5 wrote .agent/appgraph.xml; steps/intake/order.tpl exists in the run's cwd;
//                 LOOPS ≥ 1
//   Consequent:   success: RETURNS with .agent/frd.xml promoted from staging after a GREEN checkFrd
//                 failure: exits — err("blocked") when the map cannot be read or is above the
//                          reading ceiling (docs/intake.md §3), err(kind) on a role error rail,
//                          err("escalate") when LOOPS redelegations were spent, carrying the LAST
//                          guardrail diagnosis
//   Purity:       io (through the host)
//
// This step ASKS, and it asks in BATCHES. Frying a requirement without a question degenerates into a
// guess, so a gap the BRD does not settle costs the operator's time, not a redelegation — and asking
// 25-30 gaps ONE PER TRIP would cost a re-read of the BRD and the map per question, which is why the
// role hands over the whole batch at once (docs/intake.md §2). Three budgets, three meanings: LOOPS
// (red checks), QUESTIONS (questions asked), QUESTION_ROUNDS (trips to the operator). `Unknown` stays
// for what even an answer cannot fix: an operation that does not land on the map at all.
async function intake() {
  const map = await graphMap({});
  if (!map.ok) exit(err("blocked", { subject: map.why }));
  log(`intake: карта ${map.bytes} Б на ${map.nodes} узлов, потолок ${map.cap} Б — едет роли целиком`);

  const orderTpl = await readText({ path: "steps/intake/order.tpl" });
  const BRD = await readText({ path: ".agent/brd.md" });
  const STAGING = ".agent/staging/frd.xml";
  const CHECK = "checkFrd({path}) — steps/intake/frd.mjs::newFrd, узлы из .agent/appgraph.xml, числа из TASK.md + значений ответов + fit BRD + карты";
  // The vocabularies the guardrail judges by are SUBSTITUTED from steps/intake/frd.mjs, never retyped
  // in the template: two texts of one rule drift apart in silence (ext/index.mjs::brdForm, G9e).
  const FORM = await frdForm({});
  let feedback = "(none — first attempt)", attempt = 0, round = 0, spent = 0;

  while (attempt < LOOPS) {
    const seen = await answers({});
    const ANSWERS = answersBlock(seen, "(no operator answers yet)");
    const order = prompt(orderTpl, {
      BRD,
      MAP: map.text,
      ANSWERS,
      FEEDBACK: feedback,
      STAGING,
      CHECK,
      DELTA_FORMS: FORM.deltaForms,
      SOURCES: FORM.sources,
      QUESTIONS_LEFT: String(QUESTIONS - spent),
    });
    const env = await agent(order, { role: "intake", outputSchema: ENVELOPE });

    // A BATCH, not one question (S21, the operator's decision): grilling a requirement on a real
    // project takes 25-30 questions, and the ROUND is what costs context — the role re-reads the BRD
    // and the whole map on every trip. Two budgets, two meanings: `round` is trips to the operator,
    // `spent` is questions asked.
    //
    // BUG_FIX_CONTEXT: live run 6350f09b.
    //   Previous: the batch size came from the envelope's `questions` field.
    //   Problem:  the role sent `items` with ONE question and `questions: 3` — the number copied off
    //             the role's own example. The size of a batch then lived in two places at once, they
    //             disagreed on the first run, and the operator got three pauses for three questions
    //             while the budget was charged nine.
    //   Fix:      the size IS the list. `questions` is not read here at all — nothing can disagree
    //             with a length.
    if (env.track === "err" && env.kind === "question") {
      const asked = (env.items && env.items.length) || 1;
      if (++round > QUESTION_ROUNDS) exit(err("question", { subject: env.subject, evidence: env.evidence, diagnosis: `кругов уточнения больше ${QUESTION_ROUNDS}` }));
      if (spent + asked > QUESTIONS) exit(err("question", { subject: env.subject, evidence: env.evidence, diagnosis: `вопросов за прогон больше ${QUESTIONS} (задано ${spent}, в пакете ещё ${asked})` }));
      spent += asked;
      log(`intake: раунд ${round} — вопросов ${asked}, всего ${spent} из ${QUESTIONS}`);
      await askOperator(env, round, "intake", "intake");
      continue; // a question does not spend the redelegation budget
    }
    if (env.track === "err") exit(err(env.kind, { subject: env.subject, evidence: env.evidence }));

    const check = await checkFrd({ path: STAGING }); // the check runs ON STAGING, before any promote
    if (check.ok) {
      await promote({ from: STAGING, to: ".agent/frd.xml" });
      log(`intake: deltas=${check.deltas} unknown=${check.unknown} scenarios=${check.scenarios} touched=${check.touched}`);
      // An Unknown is a legal artifact and a REFUSAL of step 7: said out loud here, where the run is
      // still green, rather than discovered later as a missing .agent/mode.
      if (check.unknown) log(`intake: ${check.unknown} дельт не классифицированы — шаг 7 веса не выведет, полоса встанет`);
      if (check.questions) log(`intake: открытых вопросов в артефакте — ${check.questions}`);
      return; // S22: intake is no longer the end of the run — the weight is weighed next
    }
    feedback = check.blockers;
    attempt++;
  }
  exit(err("escalate", { subject: feedback, evidence: `цикл исчерпан за ${LOOPS} попыток` }));
}

// FUNCTION_CONTRACT: weigh — step 7: the forms of the FRD's deltas → one word of SemVer
//   Input:        —
//   Dependencies: EXTERNAL — weight (the host function; the local name differs because a sandbox
//                 global cannot be shadowed by the function that calls it)
//   Antecedent:   step 6 promoted .agent/frd.xml
//   Consequent:   success: RETURNS with .agent/mode written — one word
//                 failure: exits err("blocked") — an Unknown delta, no delta, or a form outside the
//                          vocabulary; .agent/mode does NOT exist after it (the host erases a stale
//                          one, docs/weight.md §4), so step 8 can never read a previous run's weight
//   Purity:       io (through the host)
//
// No role, no operator, no token: the judgement was made at step 6 (what a delta does to a call that
// exists today) and this step only folds it. A refusal is terminal — a step without a role does not
// open a checkpoint, and the answer to an Unknown can only be applied by the intake role rewriting
// the FRD (docs/weight.md §5).
async function weigh() {
  const w = await weight({});
  if (!w.ok) exit(err("blocked", { subject: w.why, evidence: ".agent/mode не написан" }));
  log(`weight: mode=${w.mode} из ${w.earned} (дельт ${w.deltas})`);
}

// FUNCTION_CONTRACT: rippling — step 8: is a design needed, and over which nodes
//   Input:        —
//   Dependencies: EXTERNAL — ripple (the host function; the local name differs for the same reason
//                 weigh's does — a sandbox global cannot be shadowed by the function that calls it)
//   Antecedent:   steps 5, 6 and 7 left .agent/appgraph.xml, .agent/frd.xml and .agent/mode
//   Consequent:   success: exits ok with .agent/design (needed | skip) and .agent/ripple.xml written
//                          — the end of today's stripe
//                 failure: exits err("blocked") — no weight, nothing to ripple from, a seed the map
//                          does not declare, or a subgraph above the reading ceiling; NEITHER file
//                          exists after it (the host erases both, docs/ripple.md §5), so step 9 can
//                          never be ordered on a previous run's verdict
//   Purity:       io (through the host)
//
// The flag is a COUNT of the nodes carrying a delta, not a radius of reachability: a closure over the
// map's edges is the connected component, which would make `skip` unreachable and order the designer
// for every change ever (docs/ripple.md §2, discrepancy A). The subgraph is what step 9 reads INSTEAD
// of the whole map.
async function rippling() {
  const r = await ripple({});
  if (!r.ok) exit(err("blocked", { subject: r.why, evidence: ".agent/design не написан" }));
  // Both numbers are named: "the subgraph was computed" and "the subgraph came out empty" are
  // otherwise indistinguishable in the journal, and the journal is what diagnosis reads.
  log(`ripple: design=${r.design} узлов ${r.nodes} из ${r.total} (затравок ${r.seeds}, mode=${r.mode})`);
  // THE END OF THE BAND SAYS SO OUT LOUD, and it says it HERE — beside the code that moves it. The
  // terminal message is what the chat model reads when the run finishes, and a result that only says
  // `track:"ok"` reads to a coding agent sitting in a project directory as a green light to go build
  // the thing TASK.md describes.
  //
  // BUG_FIX_CONTEXT: live run 9a8821a7 (quarkus-rest-json-app-v2-t2). After a green run the chat model
  //   implemented the requirement by hand — 27 lines across three files plus a new page — and ran the
  //   tests. Nothing was wrong with the artifacts; the band simply never said it had ended, and step 15
  //   (`implement`) does not exist yet. The next run would have mapped that code as the repository's
  //   own. The rule travels with the message for the same reason askOperator's checkpoint instruction
  //   does: prompts/izi.md cannot restate what changes with this file.
  log("izi: полоса кончилась на шаге 8. Поставка — артефакты .agent/; рабочее дерево проекта НЕ трогать: реализация это шаг 15, которого ещё нет");
  exit(ok({
    artifact: ".agent/design",
    design: r.design,
    mode: r.mode,
    nodes: r.nodes,
    next: "Полоса кончается здесь. Напечатай результат и остановись: не пиши код, не гоняй тесты, не меняй файлы проекта — реализация это шаг 15, которого ещё нет.",
  }));
}

log("izi: start");
try {
  const b = await budgets({});
  if (!b.ok) exit(err("blocked", { subject: b.why })); // a broken config is a refusal, not a default
  LOOPS = b.loops; QUESTIONS = b.questions; QUESTION_ROUNDS = b.questionRounds;
  CHECKPOINT_RETRIES = b.checkpointRetries; MAX_PARALLEL = b.maxParallel;
  log(`budgets: loops=${LOOPS} questions=${QUESTIONS} rounds=${QUESTION_ROUNDS} checkpointRetries=${CHECKPOINT_RETRIES} maxParallel=${MAX_PARALLEL} (${b.source})`);

  // Observability is declared out loud, never assumed: with herdr unavailable the herdr extension
  // does not register at all and stays SILENT, so a run from an ordinary terminal looks exactly like
  // a broken integration. The run is not blocked by it — an unobserved run is still a run.
  const h = await herdrStatus({});
  log(h.available
    ? `herdr: on pane=${h.pane}${h.fullyInspectable ? " fully-inspectable" : " (fully-inspectable выключен в ~/.pi/agent/pi-extensible-workflows/settings.json)"}`
    : `herdr: off — ${h.why}`);

  // The run's FIRST act, before a single fact is read: the previous run's state is carried out of
  // the way (ext/index.mjs::newRun). It is not deleted — it moves to .agent/prev/, because a run
  // that fell over is diagnosed from disk. Logged out loud: an operator asked the same question
  // twice must be able to see WHY, and where their earlier answer went.
  const fresh = await newRun({});
  log(fresh.answers || fresh.pending || fresh.staged
    ? `run: состояние прошлого прогона убрано в .agent/prev — ответов ${fresh.answers}, staging ${fresh.staged}${fresh.pending ? ", открытый вопрос" : ""}`
    : "run: .agent чист — состояния прошлого прогона нет");
  // The working tree is DECLARED, never blocked on: uncommitted files are normal in a live repository.
  // What is not normal is not knowing — the swarm maps the tree as it is, so work done by hand before
  // the run is mapped as the repository's own and the FRD comes out about a different codebase (live
  // run 9a8821a7, ext/index.mjs::dirtyCount). `-1` means git did not answer, which is not "clean".
  if (fresh.dirty > 0) log(`run: рабочее дерево грязное — ${fresh.dirty} файлов не в коммите; разведка отобразит их КАК ЕСТЬ`);

  phase("task"); await task();
  phase("brd"); await brd();
  phase("survey-plan"); await surveyPlan();
  phase("scope"); await scope();
  phase("graph"); await graph();
  phase("intake"); await intake();
  phase("weight"); await weigh();
  phase("ripple"); await rippling();
  return ok({}); // unreachable — rippling() always exits — kept as the fall-through for a ninth phase
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
