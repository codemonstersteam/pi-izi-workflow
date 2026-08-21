// MODULE_CONTRACT: workflows/izi.js — программа: task → brd → survey-plan → scope → graph →
//             (intake → review → weight → ripple → design → нарезаемость)⟳ → gate1 → branch → tickets
// Purpose:      one decision — the ORDER of the pipeline, and it lives here as CODE. A phase is a
//               named function, not a manifest entry: with ten steps, ten hand-written calls are
//               cheaper than a pipeline.json plus a dispatcher plus their tests (docs/workflow.md
//               §1-§2, docs/concept.md, "What is deferred and why"). The rule returns when the cost of
//               listing phases by hand exceeds the cost of policy-as-data — not before.
// io:           none directly. This file runs in a vm sandbox with NO import, NO fs, NO network and
//               NO timers (pi-extensible-workflows/packages/core/src/execution.ts) — every byte it
//               reads or writes goes through a host function listed below.
// EXTERNAL_DEPENDENCY: ext/index.mjs (installed by `pi install ./ext`) injects these as sandbox
//               GLOBALS — readText · answers · brdForm · frdForm · carried · budgets · orderLine · herdrStatus · newRun · checkTask ·
//               checkBrd · promote · setPending · clearPending · survey · focus · cells · digest · reuse ·
//               remember · checkPart · buildGraph · graphMap · checkFrd · weight · ripple · design ·
//               parts · part · planbook · gate1 · branch · tickets · plan · review · reviewForm. They are not
//               imported and cannot be: `X is not defined` on any of them means the extension
//               loaded into this pi session is OLDER than this script (the extension is read at
//               session start, this file at every run) — restart pi. The catch at the bottom says
//               exactly that, because otherwise the message is indistinguishable from a typo.
// EXTERNAL_DEPENDENCY: izi.config.json in the RUN's root — loops · questions · checkpointRetries ·
//               maxParallel. Read once, at the start, by budgets(); the defaults live in
//               core/budgets.mjs and are NOT copied here. A broken config is a refusal, never a
//               silent default. `orderCap` rides the same call and is NOT of that file: it is the
//               model's window minus the output reserve (core/budgets.mjs::ORDER_CAP_CHARS), and every
//               order this script assembles is measured against it — see sized().
// EXTERNAL_DEPENDENCY: roles `gilb` (steps/brd/gilb.md), `scout` (steps/scope/scout.md), `intake`
//               (steps/intake/intake.md), the THREE roles of step 9 — `valuer`
//               (steps/design/valuer.md), `router` (steps/design/router.md) and `core-designer`
//               (steps/design/core-designer.md) — and `critic` (steps/review/critic.md) resolved by pi
//               from the extension's roleDirectories BY FILENAME (validation.js scanRoleFiles).
//               Renaming a role file breaks agent({role}) with no other symptom.
// EXTERNAL_DEPENDENCY: order templates read from disk at run time — steps/brd/order.tpl,
//               steps/scope/order.survey.tpl, steps/scope/order.spine.tpl, steps/intake/order-a.tpl,
//               steps/intake/order-b.tpl, steps/intake/order-c.tpl, steps/intake/order-d.tpl,
//               steps/design/order-values.tpl and steps/design/order-chains.tpl (one per pass of the
//               dictionary and the chains) and steps/design/order-part.tpl (ONE partition),
//               steps/review/order.tpl.
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
let LOOPS;              // gilb/scout/designer/critic redelegations after a RED check, NOT questions
let INTAKE_LOOPS;       // step 6 alone — one file answers to seven rules there (core/budgets.mjs)
let QUESTION_ROUNDS;    // trips to the operator allowed in one run — the round is what costs context
let CHECKPOINT_RETRIES; // re-pauses on the SAME question when no matching answer showed up
let MAX_PARALLEL;       // swarm batch size at step 4 — see scope() for why the sandbox needs one
let REVIEW_ROUNDS;      // rewinds of steps 6-11 ordered by the critic — see band() at the bottom
let ORDER_CAP;
let BASELINE;          // шаг 13: гонять ли все сьюты после среза ветки — core/budgets.mjs          // characters ONE assembled order may carry — core/budgets.mjs::ORDER_CAP_CHARS

// The two counters the operator's budgets are actually spent from. They are MODULE state, not phase
// state, because since S30 a phase can run more than once in a run: the critic rewinds the band to
// the step that owns the artifact it blamed (docs/review.md §6). Counters living inside intake()
// were reset by that rewind and handed the role a second full round budget — the same class of
// defect as a checkpoint name that repeats, and invisible to every unit, since a unit calls a phase
// once.
//
// ROUND_N is also what makes a pause NAMEABLE: it counts trips over the whole run, so `intake-q4`
// after a rewind can never collide with the `intake-q1` of the first pass. The host keys a pause by
// its name — two pauses called `intake-q1` are ONE pause, and the second question would never reach
// the operator (see askOperator).
let ROUND_N = 0;        // trips to the operator made so far, over the whole run
let ASKED_N = 0;        // questions asked so far, over the whole run

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
    values: { type: "number" },
    routes: { type: "number" },
    modules: { type: "number" },
    gaps: { type: "number" },
    deltas: { type: "number" },
    scenarios: { type: "number" },
    unknown: { type: "number" },
    // `lookup` — НЕ вопрос человеку, а вопрос ДИСКУ: «где лежит тип X». Отвечает скрипт по
    // .agent/graph-computed.xml за 0 токенов, и ответ уезжает роли тем же каналом, каким едет
    // FEEDBACK. Живой прогон 19.08.2026: роль разбудила оператора ради пути AgentConfiguration,
    // который лежал в вычисленном графе, — ход человека за факт с диска.
    kind: { type: "string", enum: ["blocked", "invalid", "question", "lookup", "escalate", "crashed"] },
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
  // BUG_FIX_CONTEXT: run fcc4c120 — intake returned {"track":"err","code":10,"subject":"…"} with NO
  // `kind`. The question rail switches on env.kind === "question" (:287, :581, :709), so an err
  // envelope with no kind fell past every question branch and out through the generic err(env.kind, …)
  // exit — the operator never saw the questions, at a cost of 193 316 tokens and 5 role runs. `track`
  // alone let "an error with no rail name" through. This `allOf`/`if`/`then` makes track:"err" REQUIRE
  // kind AND subject, so that shape is rejected before the workflow ever runs — the host compiles
  // outputSchema with typebox and rejects the envelope IN THE ROLE'S OWN TURN
  // (pi-extensible-workflows/packages/core/src/agent-execution.ts:816), which is cheaper than a
  // redelegation.
  allOf: [
    { if: { properties: { track: { const: "err" } }, required: ["track"] }, then: { required: ["kind", "subject"] } },
  ],
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
  let t = await checkTask({}); // registered functions require exactly one JSON object argument
  if (!t.ok) exit(err("blocked", { subject: t.why }));

  // THE TASK KEY IS ASKED HERE, AT THE FIRST STEP, or not asked at all. It names the branch, every
  // ticket and `task/<КЛЮЧ>/`, where step 9 puts the plan — so the band needs it long before step 10,
  // and an operator who has already written it into TASK.md should never be asked. One question at
  // the start beats an interruption in the middle of a run nobody is watching.
  for (let round = 1; !t.key && round <= QUESTION_ROUNDS + 1; round++) {
    const q = charge({ subject: t.question });
    if (q.spent) exit(noRoundsLeft({ subject: t.question, evidence: "" }, "task"));
    await askOperator({ subject: t.question, evidence: "" }, q.n, "task-key", "task");
    t = await checkTask({});
  }
  if (!t.key) exit(err("blocked", { subject: t.question, evidence: "ключ задачи не назван — поставке некуда лечь" }));
  log(`task: ok, строк ${t.lines}, ключ ${t.key} — поставка ляжет в task/${t.key}/`);
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

// $START_ORDER — cut out of the source and EXECUTED by ext/index.test.mjs, the device $START_SWARM,
// $START_BLAME and $START_REENTRY use: no test may import this file. The names below are that test's
// interface.
//
// D29b. Until this block no step knew how big its own order had grown: the ripple went from 2 311
// characters on form `t2` to 30 281 on `eddi` and not one line of any log noticed. `byteLen` above has
// been in this file since the beginning and was used in exactly one place — the 1024-byte checkpoint
// channel — while the five ORDERS, which are two orders of magnitude larger and are what the run
// actually spends its window on, were assembled and sent unmeasured.
//
// TWO THINGS, ONE PLACE: the LINE and the REFUSAL. A size printed to the log is a diagnosis for the
// operator reading a finished run; the refusal is what stops the request that cannot exist at all —
// live run 162e8b02 went 112 tokens over the window and the role never ran, which from the chat looks
// exactly like a role that answered badly. The ceiling is not restated here: it arrives from
// core/budgets.mjs through budgets() (see ORDER_CAP), because a number copied into this file is a
// number that drifts from the one the extension declares.
//
// NO AUTOMATIC SPLITTER, and that is a decision with evidence behind it: what separates the orders that
// produce a file from the ones that burn three turns of reasoning is the number of independent
// obligations, not the number of characters (pass A on `eddi` carried 145 of them, a swarm part 1-4).
// A resizer cutting by bytes would cut an FRD in the middle of a use case; the unit of a cut belongs to
// the slice that owns the artifact, and three of the five orders have no unit at all.
//
// HOW MUCH OF THE MEASUREMENT IS SPOKEN IS NOT DECIDED HERE. This band runs in a vm sandbox and no
// test may import it, so a decision written inside it is testable only by a regular expression over
// this source — a seam that sees structure and never logic. The wording of the line and the refusal
// therefore lives in core/orderline.mjs (unit: core/orderline.test.mjs) and arrives through the host,
// the same bargain steps/intake/lookup.mjs::lookupAnswer struck for the lookup rail. The MEASURE
// stays here: only this side knows how long the assembled text turned out.
//
// A KIND, NOT A NAME, counts the rounds. `scope/<cell>` and `design/part/<slug>` are one order
// composed again and again with different contents — the composition is worth seeing once, not once
// per cell — while `design/values` and `design/chains` are different orders and count apart.
//
// FUNCTION_CONTRACT: sized — one assembled order, measured before it is sent
//   Input:        step — the step's name, for the log and the refusal; tpl — the order template's text;
//                 keys — the values prompt() substitutes, by placeholder name; kind — what counts as
//                 "the same order assembled again", defaulting to the step's own name
//   Dependencies: EXTERNAL — prompt, log, orderLine (sandbox globals); ORDER_CAP, ORDER_ROUNDS
//   Antecedent:   `keys` matches the template's placeholders exactly, both ways — prompt() throws
//                 otherwise, and that throw is the launch's own seam, not this function's business
//   Consequent:   success: { text, chars, over, why } — the order and its size. `over` says the request
//                          would not fit the model's window; `why` NAMES EVERY ADDEND, because a
//                          refusal that only carries a total tells the operator nothing about which
//                          document grew
//                 failure: none — every caller decides what a refusal is: an exit at steps 2, 6, 9 and
//                          11, a returned value inside the swarm of step 4, where parallel() swallows
//                          a throw and rethrows its own (see scout's BUG_FIX_CONTEXT)
//   Purity:       io (log, host)
const ORDER_ROUNDS = {};   // kind → orders of that kind assembled so far, over the whole run
async function sized(step, tpl, keys, kind) {
  const text = prompt(tpl, keys);
  const family = kind || step;
  const round = ORDER_ROUNDS[family] = (ORDER_ROUNDS[family] || 0) + 1;
  const over = text.length > ORDER_CAP;
  const said = await orderLine({
    step,
    chars: text.length,
    cap: ORDER_CAP,
    round,
    over,
    tplChars: String(tpl == null ? "" : tpl).length,
    addends: Object.keys(keys).map((k) => ({ name: k, chars: String(keys[k] == null ? "" : keys[k]).length })),
  });
  log(said.line);
  return { text, chars: text.length, over, why: said.why };
}
// $END_ORDER

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
// FUNCTION_CONTRACT: answeredBlock — ПОСЛЕДНИЙ обмен отдельно от накопленной истории
//   Input:        seen — все ответы прогона ({n, question, text}[]); asked — вопросы последнего
//                 обмена ДОСЛОВНО, как их задала роль (env.items)
//   Dependencies: —
//   Antecedent:   любые значения; обмена нет — пустая строка, и слот в наряд НЕ уезжает вовсе
//   Consequent:   success: блок с парой «вопрос → ответ» на каждый вопрос обмена и с приказом
//                          применить: это единственное новое знание с прошлого черновика
//                 failure: none — тотальна
//   Purity:       pure
//
// ПОЧЕМУ ОТДЕЛЬНО ОТ {ANSWERS}. Тот блок несёт ВСЮ историю прогона: к пятому обмену это 1 466
// символов, где три новых ответа ничем не выделены, и роль читает их как справочный документ.
//
// BUG_FIX_CONTEXT: живой прогон eddi 19.08.2026, шаг 6, пласт A. Роль спросила три вопроса, получила
//   три ответа и применила ОДИН: «нужен GET по id» и «замена терминов целиком» не доехали до
//   артефакта, а пласт закрылся зелёным. Пауза оператора — самое дорогое, что есть у полосы, и
//   потратить её впустую дороже любого лишнего круга (docs/ask.md §3б).
function answeredBlock(seen, asked) {
  const want = (asked || []).map((x) => String(x).trim()).filter(Boolean);
  if (!want.length) return "";
  const rows = want.map((q, i) => {
    const hit = (seen || []).find((a) => String(a.question).trim() === q);
    return `  ${i + 1}. ВОПРОС: ${q}\n     ОТВЕТ ОПЕРАТОРА: ${hit ? hit.text : "(ответа нет)"}`;
  }).join("\n");
  return `Оператор ответил на твои вопросы. ЭТО ЕДИНСТВЕННОЕ НОВОЕ ЗНАНИЕ с твоего прошлого черновика.\nПримени КАЖДЫЙ ответ: то, что назвал оператор, обязано появиться в файле — путь в шаге, код в ветке и в карте отказов, поле в его строке.\nОтвет, который ты не применишь, будет назван блокером F13.\n\n${rows}`;
}

const ASK_HEAD = (role) => `Роль ${role} ждёт ответа оператора в этом чате. `;
const ASK_TAIL = " Получив ответ — вызови tool izi_answer({exchange}) со ВСЕМИ ответами разом: блок <exchange><question_N>вопрос</question_N><answer_N>ответ</answer_N>…</exchange>, номера и вопросы возьми из .agent/pending.json (поле items), не придумывай. ПОКАЖИ оператору разложение, которое вернёт тул. Затем workflow_respond({runId: <runId запуска>, name: <name из заголовка этого сообщения>, approved: true}).\n\nВНИМАНИЕ: approved:true значит «ОТВЕТ ПОЛУЧЕН И ЗАПИСАН», а НЕ «оператор согласен». Решение оператора живёт в ТЕКСТЕ ответа — approve, rework, stop, — и читает его полоса, не ты. Ответил «rework» или «stop»? Всё равно approved:true: ты доставил ответ.\napproved:false — ТОЛЬКО когда оператор отказался отвечать вовсе. Это гасит прогон терминально.";
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
async function askOperator(env, n, step, role, draft) {
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
  // ЗАКРЫТЫЙ ОБМЕН — АРТЕФАКТ ШАГА. Полоса называет только то, чего нет на диске: шаг, проход и путь
  // к черновику; вопросы и ответы хост берёт из pending.json и answers.md (docs/ask.md §3а).
  const [name, pass] = String(step).split("-");
  const record = { step: name, pass: pass || "", draft: draft || "" };
  let missing = await unanswered();
  if (!missing.length) { await clearPending(record); return; }

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
    if (!missing.length) { await clearPending(record); return; }
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
// model's), and a red check does not spend a round. Both counters are data, not prose.
//
// BUG_FIX_CONTEXT: S14 — the exhaustion exit used to say "retries exhausted" and nothing else.
//   Problem:  it threw away the only useful thing the run knew: WHY the check was red. The operator
//             got a count instead of a diagnosis the guardrail had already written.
//   Fix:      `feedback` here IS check.blockers from the last red iteration, so the exit carries it.
// FUNCTION_CONTRACT: charge — spend one trip to the operator
//   Input:        env — the role's question envelope
//   Dependencies: EXTERNAL — none; ROUND_N, ASKED_N, QUESTION_ROUNDS
//   Antecedent:   env.items is the batch as a LIST, or absent for a single question
//   Consequent:   success: { n — the ordinal of THIS trip, already counted; spent — the trip is over
//                            the budget, and what to do about it is the CALLER's, since it depends on
//                            whether that step's artifact can carry an unresolved gap }
//                 failure: none — total; it no longer exits (S33)
//   Purity:       io (module counters)
//
// One place counts them, so "how many trips has this run made" has one answer even when a phase runs
// twice. ASKED_N is now a pure tally for the log — nothing fails on it. The SIZE of a batch is its
// list's length and nothing else — the envelope's `questions` field was deleted (it was read nowhere;
// BUG_FIX_CONTEXT of intake, run 6350f09b).
// S33: the ceiling of rounds is a REFUSAL, not a death — `charge` no longer exits, it reports. Run
// e4a583a7 escalated on the fourth trip carrying twelve answered questions, a built map and a whole
// surveyed swarm, and left no artifact at all; the honest alternative is to tell the role its trips
// are over and take the FRD it can write, with the rest standing in it as `<question>` (see
// core/findings.mjs::OUT_OF_ROUNDS). There is no budget of QUESTIONS at all any more: S21's own
// reasoning — "the round, not the question, is what costs context" — names the cheap axis, and a
// number shown to a role as "left in this run" is read as an allowance to spend.
//
// ONLY STEP 6 SURVIVES ITS CEILING, and the artifacts say why. The FRD's grammar carries `<question>`
// and its guardrail accepts one (steps/intake/frd.mjs). A BRD may not ship with a gap at all —
// steps/brd/brd.mjs:402 refuses anything but `open-questions: 0`; the design graph has no such element
// in its grammar; and step 10 asks for a key with no role and no artifact to put it in. Where an
// unresolved gap has no home, the ceiling stays fatal, and each caller says so itself.
function charge(env) {
  ASKED_N += (env.items && env.items.length) || 1;
  return { n: ++ROUND_N, spent: ROUND_N > QUESTION_ROUNDS };
}
const noRoundsLeft = (env, step) => err("question", { subject: env.subject, evidence: env.evidence, diagnosis: `кругов уточнения за прогон больше ${QUESTION_ROUNDS} (шаг ${step}), а ${step} не сдаётся с открытым вопросом` });

async function brd() {
  const orderTpl = await readText({ path: "steps/brd/order.tpl" });
  const TASK = await readText({ path: "TASK.md" });
  const STAGING = ".agent/staging/brd.md";
  const CHECK = "checkBrd({path}) — steps/brd/brd.mjs::newBrd, numbers from TASK.md + operator answer values";
  // The anchor rule and the 3..7 range are SUBSTITUTED from core/form.mjs, never retyped here or in
  // the template: the guardrail quotes that same registry in its refusal, and two texts of one rule
  // drift apart in silence (backlog G9e, standards/code.md §1).
  const FORM = await brdForm({});
  let feedback = "(none — first attempt)", attempt = 0, wasRed = [];

  while (attempt < LOOPS) {
    const seen = await answers({});
    const ANSWERS = answersBlock(seen, FORM.absentDoc);
    // Прошлый ответ роли едет в наряде: иначе она переписывает BRD с нуля каждый круг, ориентируясь
    // на претензии к документу, которого не видит. Тот же приём, что у шагов 6 и 9.
    const PREVIOUS = await readText({ path: STAGING });
    const order = await sized("brd", orderTpl, {
      TASK,
      PREVIOUS,
      ANSWERS,
      FEEDBACK: feedback,
      STAGING,
      CHECK,
      SUBJECTS_MIN: FORM.subjectsMin,
      SUBJECTS_MAX: FORM.subjectsMax,
      SUBJECT_RULE: FORM.subjectRule,
      ANALOGUE_RULE: FORM.analogueRule,
    });
    if (order.over) exit(err("blocked", { subject: order.why, evidence: "наряд шага 2 не помещается в окно модели — роль не запускалась" }));
    const env = await agent(order.text, { role: "gilb", outputSchema: ENVELOPE });

    if (env.track === "err" && env.kind === "question") {
      // gilb asks ONE question per exchange, so its round IS its question (unlike intake, which
      // batches — see intake() below). The rounds are spent in one place, charge().
      const q = charge(env);
      if (q.spent) exit(noRoundsLeft(env, "brd"));   // a BRD may not ship with a gap — brd.mjs:402
      await askOperator(env, q.n, "brd", "gilb");
      continue; // a question does not spend the redelegation budget
    }
    if (env.track === "err") exit(err(env.kind, { subject: env.subject, evidence: env.evidence }));

    const check = await checkBrd({ path: STAGING }); // the check runs ON STAGING, before any promote
    if (check.ok) {
      await promote({ from: STAGING, to: ".agent/brd.md" }); // green check → THEN promote
      log(`brd: ok, requirements=${check.requirements}`);
      return;
    }
    const carry = await carried({ blockers: check.blockers, seen: wasRed });
    feedback = carry.text; wasRed = carry.seen;   // the loop's memory is the RUN, not the round
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

// FUNCTION_CONTRACT: focusing — step 3b: WHAT the swarm surveys, decided before it runs
//   Input:        —
//   Dependencies: EXTERNAL — focus (the host function), log, exit
//   Antecedent:   step 3 left .agent/survey-plan.json and .agent/graph-computed.xml
//   Consequent:   success: RETURNS the artifact path; .agent/focus.json names the cells step 4 will
//                          survey — every cell of the plan while the map fits the reading cap
//                 failure: exits err("blocked") — `no-plan`, `no-entry`, `no-anchor`, `over-cap`.
//                          All four are repaired by a human editing TASK.md or the BRD, never by a
//                          choice inside the run
//   Purity:       io (through the host)
//
// NO OPERATOR RAIL, and this phase used to have one. The first live firing killed it (run e90d9ce1,
// eddi): over the ceiling the step asked which cones to survey and offered twelve candidates — every
// one of them priced at 685-689 KB, because any choice also carried every anchor-marked orphan. No
// answer the operator could give changed the total. A question that cannot be acted on is worse than
// no question, so the choice moved into steps/focus/focus.mjs, where its ORDER is stated and what did
// not fit is COUNTED and declared — in this log, in .agent/focus.json and in the map's <focus>.
//
// On every form the pipeline is green on today this phase is silent: 19 files estimate at ~8 KB
// against a 115 KB cap, so focus() answers "whole-plan" and nothing is narrowed at all
// (docs/big-projects-solution.md §3).
async function focusing() {
  const f = await focus({});
  if (!f.ok) exit(err("blocked", { subject: f.why, evidence: ".agent/focus.json не написан" }));
  log(`focus: ${f.why} — срезов ${f.slices}, выбрано ${f.chosen}, клеток ${f.cells} из плана, файлов ${f.files} ≈ ${Math.round(f.estBytes / 1024)} КБ`);
  // What the ceiling left out is printed where the operator reads it. A narrowing that stays inside
  // the artifact is indistinguishable from a repository that had nothing more in it.
  // ПРЕДМЕТ ТРЕБОВАНИЯ, КОТОРЫЙ НЕ ПРОЧИТАН, НАЗЫВАЕТСЯ ВСЛУХ — и это не то же самое, что счёт
  // отброшенных клеток. Живой прогон eddi 19.08.2026: `dropped: 30 срезов, 66 клеток` полоса
  // напечатала, а того, что среди них лежал предмет `agent` — названный BRD и требованием R3, — не
  // сказал никто. Дальше роль спрашивала у оператора путь, правила краснели на существующем файле,
  // шаг 8 встал. Молчание стоило трёх остановок.
  if (f.uncovered) log(`focus: предметы требования НЕ прочитаны — ${f.uncovered}. Модули этих предметов рой не открывал: в карте не будет ни контрактов, ни io`);
  // Частичное чтение опаснее полного пропуска: предмет числится покрытым, а модуль требования лежит
  // среди отброшенных (на том же прогоне `agent`: взято 2 клетки из 52).
  if (f.partial) log(`focus: предметы прочитаны ЧАСТИЧНО — ${f.partial}`);
  if (f.droppedSlices || f.droppedCells) {
    log(`focus: не влезло — срезов ${f.droppedSlices}, клеток-сирот ${f.droppedCells}; их якоря приедут в карту как found="outside"`);
  }
  return ".agent/focus.json";
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
  let feedback = "(none — first attempt)", wasRed = [];

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
    const PREVIOUS = await readText({ path: STAGING });
    const order = await sized(`scope/${cell.id}`, orderTpl, {
      CELL: cell.id,
      PREVIOUS,
      BRD,
      STAGING,
      CHECK,
      FEEDBACK: feedback,
      SUBJECTS: cell.subjects.length ? cell.subjects.join(" · ") : "(no anchors matched this cell)",
      FILES: files.files,
    }, "scope");
    // A VALUE, never an exit — the rule of this whole function: parallel() catches every throw and
    // rethrows its own, so a cell that legitimately refuses would surface as `crashed`.
    if (order.over) return { ok: false, why: order.why };
    const env = await agent(order.text, { role: "scout", outputSchema: ENVELOPE });
    // There is no question rail at this step (docs/scope.md §6): what the scout could not read is a
    // <gap>, not a pause. Any err is therefore a cell failure, reported with the role's own words.
    if (env.track === "err") return { ok: false, why: `${cell.id}: ${env.kind || "err"} — ${env.subject || "(без subject)"}` };

    const check = await checkPart({ path: STAGING, cell: cell.id }); // check ON STAGING, before promote
    if (check.ok) {
      await promote({ from: STAGING, to: `.agent/graph-parts/${cell.id}.xml` });
      await remember({ cell: cell.id });   // only a PROMOTED part is worth remembering
      return { ok: true, modules: check.modules, gaps: check.gaps, hit: false };
    }
    const carry = await carried({ blockers: check.blockers, seen: wasRed });
    feedback = carry.text; wasRed = carry.seen;
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
//   Input:        fromCritic — вердикт шага 11 в форме FEEDBACK, "" если это не перемотка
//                 fromPass — проход, с которого начинать (steps/review/review.mjs::passOf); пусто = A
//   Dependencies: EXTERNAL — graphMap, readText, answers, frdForm, agent(role "intake"), checkFrd,
//                 promote, prompt; askOperator
//   Antecedent:   step 5 wrote .agent/appgraph.xml; steps/intake/order-{a,b,c,d}.tpl exist in the
//                 run's cwd; LOOPS ≥ 1
//   Consequent:   success: RETURNS with .agent/frd.xml promoted from staging after a GREEN checkFrd
//                          and a passed GATE — every node of the change that no suite executes either
//                          does not exist or was answered `accept` by the operator
//                 failure: exits — err("blocked") when the map cannot be read or is above the
//                          reading ceiling (docs/intake.md §3) or when the gate's answer is `suite`
//                          or `drop` (the repair is a human's, and the FRD is not promoted),
//                          err(kind) on a role error rail, err("question") when the trips to the
//                          operator ran out on the gate, err("escalate") when LOOPS redelegations
//                          were spent, carrying the LAST guardrail diagnosis
//   Purity:       io (through the host)
//
// This step ASKS, and it asks in BATCHES. Frying a requirement without a question degenerates into a
// guess, so a gap the BRD does not settle costs the operator's time, not a redelegation — and asking
// 25-30 gaps ONE PER TRIP would cost a re-read of the BRD and the map per question, which is why the
// role hands over the whole batch at once (docs/intake.md §2). Three budgets, three meanings: LOOPS
// (red checks) and QUESTION_ROUNDS (trips to the operator). `Unknown` stays
// for what even an answer cannot fix: an operation that does not land on the map at all.
// LOOKUP_ROUNDS — сколько раз роль шага 6 может спросить у РЕПОЗИТОРИЯ, прежде чем решать сама.
// Это не бюджет починки: справка не провал, роль ничего не сломала. Но и вечно спрашивать нельзя —
// каждый круг стоит полного наряда (133 КБ на живом прогоне), а фактов в графе конечное число.
const LOOKUP_ROUNDS = 3;

// $START_INTAKE
// ЧЕТЫРЕ ПЛАСТА ОДНОГО АРТЕФАКТА. Шаг 6 идёт проходами A → B → C → D
// (steps/intake/passes-data-flow.md): требование · изменение · величины и отказы · покрытие. Пласт
// пишется своим нарядом и судится своими правилами (steps/intake/frd.mjs::RULE_PASS), а промоут один
// — после ПОЛНОГО суда, где правила-мосты видят все пласты сразу.
const PASS_LAYERS = ["A", "B", "C", "D"];
// Сколько раз полоса согласна пройти круг «пласты → полный суд → расхождение → снова пласты».
// Расхождение пластов между собой — это не починка одного из них, а перезаход, и он ограничен: без
// потолка два правила-моста могли бы гонять роль по кругу до конца прогона.
const FULL_SWEEPS = 2;

async function intake(fromCritic, fromPass) {
  // Что не прочитано — факт ШАГА 3б, и он лежит в его артефакте: полоса не пересчитывает его здесь,
  // а читает (одно правило — одно место).
  const focusDoc = await readText({ path: ".agent/focus.json" });
  const uncovered = (() => {
    const m = String(focusDoc).match(/"uncovered"\s*:\s*\[([\s\S]*?)\]/);
    if (!m) return "";
    return [...m[1].matchAll(/"subject"\s*:\s*"([^"]+)"[\s\S]*?"why"\s*:\s*"([^"]+)"/g)]
      .filter((x) => x[2] === "cap").map((x) => x[1]).join(" · ");
  })();
  const map = await graphMap({});
  if (!map.ok) exit(err("blocked", { subject: map.why }));
  // The map may arrive DEGRADED — its index form, without declarations, prose or edges — and that is
  // said out loud here, because a role reading an index is a different fact about the run than a role
  // reading the map (ext/index.mjs::graphMap, steps/intake/map.mjs::mapIndex).
  log(map.form === "index"
    ? `intake: карта ${map.fullBytes} Б выше потолка ${map.cap} Б — роли едет ИНДЕКС ${map.bytes} Б на ${map.nodes} узлов: узлы и их <api>, без объявлений, прозы и рёбер`
    : `intake: карта ${map.bytes} Б на ${map.nodes} узлов, потолок ${map.cap} Б — едет роли целиком`);
  // ВТОРАЯ КАРТА: имена, которые называют задача, BRD и ответы оператора, уже разрешённые в пути по
  // вычисленному графу шага 3 (ext/index.mjs::graphMap). Роль не ищет того, что подставлено — а
  // имени, которого в графе нет, здесь нет строки, и спросить о нём оператора по-прежнему законно.
  log(`intake: таблица типов — ${map.typeRows || 0} имён из вычисленного графа`);

  // Четыре наряда, по одному на пласт. Карта едет ТОЛЬКО в B: пласты A и C о репозитории не
  // рассуждают, а в D о нём судит скрипт (F8 читает вычисленный граф сам), и роли там нечего с ней
  // делать. Это и есть главная экономия прохода: наряд A — единицы килобайт против 137 КБ, которые
  // стоил один общий наряд на живом прогоне 19.08.2026.
  const tplA = await readText({ path: "steps/intake/order-a.tpl" });
  const tplB = await readText({ path: "steps/intake/order-b.tpl" });
  const tplC = await readText({ path: "steps/intake/order-c.tpl" });
  const tplD = await readText({ path: "steps/intake/order-d.tpl" });
  const BRD = await readText({ path: ".agent/brd.md" });
  const STAGING = ".agent/staging/frd.xml";
  // The vocabularies the guardrail judges by are SUBSTITUTED from steps/intake/frd.mjs, never retyped
  // in the template: two texts of one rule drift apart in silence (ext/index.mjs::brdForm, G9e).
  const FORM = await frdForm({});

  // ПРЕДМЕТ ПОЧИНКИ ВОЗВРАЩАЕТСЯ НА СТОЛ. `promote` ПЕРЕМЕЩАЕТ файл, поэтому после закрытия шага по
  // staging-пути пусто. На возврате от критика роль получала бы `PREVIOUS = ""`, а наряд говорит
  // прямо: «пусто значит ты ещё ничего не писал — пиши». Промоутнутый артефакт при этом лежит рядом
  // целым, со всеми четырьмя пластами.
  //
  // BUG_FIX_CONTEXT: живой прогон eddi 19.08.2026, четвёртый запуск. Критик вернул Reject (2 находки
  //   + 3 открытых вопроса), полоса вошла в проход A — и роль ПЕРЕПИСАЛА артефакт с нуля: было
  //   8 use case · 15 дельт · 9 полей · 17 строк <carried>, стало 7 · 0 · 0 · 0. Пласты B, C и D
  //   исчезли, и перезаход стоил не одного прохода, а всех четырёх — ровно того, что пласты должны
  //   были предотвратить. Роль поступила по инструкции; ей не отдали её же файл.
  //
  // Возврат именно ПЕРЕМЕЩЕНИЕМ, а не копией: артефакт, который переписывают, перестаёт быть выходом
  // шага. Останься он на месте — лестница следующего запуска сочла бы шаг закрытым (core/runlog.mjs).
  if (fromCritic) {
    const promoted = await readText({ path: ".agent/frd.xml" });
    if (promoted) {
      await promote({ from: ".agent/frd.xml", to: STAGING });
      log(`intake: артефакт возвращён на правку — ${promoted.length} симв, пласты на месте`);
    }
  }

  let entry = Math.max(0, PASS_LAYERS.indexOf(String(fromPass || "A")));
  // On a REWIND the first order is not a first attempt: it carries the critic's blockers, and they
  // are marked as such. A blocker of the guardrail is numbered by a RULE and repaired pointwise; a
  // blocker of the critic names a code and a node and asks for the CONTENT to be reconsidered. The
  // role reacts to the two differently, so it is told which it is holding (docs/review.md §6).
  let feedback = fromCritic || "(none — first attempt)";
  // Вопросы ПОСЛЕДНЕГО обмена — то, что роль спросила и что ей сейчас ответили. Живут в шаге, а не в
  // проходе: спросил один пласт, а перечитывать ответ может и следующий (docs/ask.md §3б).
  let asked = [];

  for (let sweep = 1; sweep <= FULL_SWEEPS; sweep++) {
    for (let p = entry; p < PASS_LAYERS.length; p++) {
      const pass = PASS_LAYERS[p];
      const CLOSED = p ? PASS_LAYERS.slice(0, p).join(", ") : "нет — этот проход первый";
      const CHECK = `checkFrd({path, pass:"${pass}"}) — steps/intake/frd.mjs::newFrd, правила пласта ${pass}`;
      let attempt = 0, lookups = 0, wasRed = [];

      while (attempt < INTAKE_LOOPS) {
        const seen = await answers({});
        const ANSWERS = answersBlock(seen, "(no operator answers yet)");
        // THE ROLE'S OWN LAST ANSWER TRAVELS IN THE ORDER, and is not left for it to fetch. `promote`
        // MOVES, so a rejected FRD is still at the staging path — but READING it is an ACTION, and an
        // action a 27b role at `thinking: low` can silently skip. Live run 7f3a8431 is what that costs:
        // told only what was wrong, the role rewrote all 88 nodes from scratch every round and the
        // blockers went 10 → 4 → 6, each round closing one class and breaking another. Same discipline
        // as the question key of `.agent/pending.json`: what the next step needs is COPIED by the
        // machine, never recalled by a model. Missing file reads as "" — the first attempt carries
        // nothing.
        const PREVIOUS = await readText({ path: STAGING });
        // TYPES — the second map, already resolved into paths (ext/index.mjs::graphMap). "There is no
        // table" is worded HERE and not in the host: the same discipline as answersBlock's second
        // argument — the host returns "", the absence is the workflow's own sentence. And it is said in
        // ONE expression next to the key, because a comment BETWEEN the keys of this object breaks the
        // seam that holds the template's slots and these keys to one set (ext/index.test.mjs).
        const NO_TYPES = "(no name of the task, the BRD or the answers resolves in .agent/graph-computed.xml)";
        // Предметы, чьи модули рой НЕ читал: роль обязана знать, о чём у неё нет фактов. Пусто
        // говорится словами — молчание она прочтёт как «всё прочитано». Комментарий стоит ЗДЕСЬ, а не
        // между ключами объекта: шов, держащий слоты шаблона и ключи полосы одним множеством,
        // сканирует ключи построчно, и строка-комментарий между ними его рвёт (ext/index.test.mjs).
        const NO_GAP = uncovered || "(нет: все предметы требования прочитаны)";
        // Последний обмен — отдельным блоком; обмена не было — блок ПУСТ, и роль не читает пустоту
        // как «ответов не было»: об этом говорит сам текст блока (workflows/izi.js::answeredBlock).
        const ANSWERED = answeredBlock(seen, asked) || "(вопросов ты ещё не задавал)";
        // Четыре вызова, а не один с подменой ключей: слоты у нарядов РАЗНЫЕ, и шов, который держит
        // слоты шаблона и ключи полосы одним множеством, проверяет каждую пару отдельно
        // (core/orders.test.mjs). Один вызов с общим объектом ключей этот шов бы ослепил.
        let order;
        if (pass === "A") {
          order = await sized("intake/A", tplA, { ANSWERED, BRD, ANSWERS, PREVIOUS, FEEDBACK: feedback, STAGING, CHECK });
        } else if (pass === "B") {
          order = await sized("intake/B", tplB, { ANSWERED, MAP: map.text, TYPES: map.types || NO_TYPES, UNCOVERED: NO_GAP, DELTA_FORMS: FORM.deltaForms, CLOSED, PREVIOUS, FEEDBACK: feedback, STAGING, CHECK });
        } else if (pass === "C") {
          order = await sized("intake/C", tplC, { ANSWERED, BRD, ANSWERS, SOURCES: FORM.sources, CLOSED, PREVIOUS, FEEDBACK: feedback, STAGING, CHECK });
        } else {
          // Долг перед требованиями считается ЗДЕСЬ, а не в начале шага: тот же список, что видит
          // критик на шаге 11 (ext/index.mjs::reviewForm, steps/review/review.mjs::owedItems), и в
          // начале шага 6 его ещё не из чего собрать — FRD не существует.
          const CHECKLIST = await reviewForm({});
          order = await sized("intake/D", tplD, { ANSWERED, OWED: CHECKLIST.owed, CLOSED, PREVIOUS, FEEDBACK: feedback, STAGING, CHECK });
        }
        // The map's own ceiling is NOT this check and cannot stand in for it: it sees one addend of five
        // (steps/intake/map.mjs, the comment over MAP_CAP_BYTES; live run 162e8b02).
        if (order.over) exit(err("blocked", { subject: order.why, evidence: `наряд прохода ${pass} шага 6 не помещается в окно модели — роль не запускалась` }));
        const env = await agent(order.text, { role: "intake", outputSchema: ENVELOPE });

        // РЕЛЬСА lookup: роль просит ФАКТ, отвечает скрипт. Круг тратится тот же, что на починку —
        // иначе роль, спрашивающая по имени за раз, крутила бы полосу вечно; и ответ приезжает в
        // FEEDBACK, потому что второго канала «сказать роли» в полосе нет.
        if (env.track === "err" && env.kind === "lookup") {
          const want = (env.items && env.items.length ? env.items : [env.subject]).map((x) => String(x).trim()).filter(Boolean);
          // Счётчик кругов справок едет ВМЕСТЕ с вопросом: «справок больше нет» — часть ОТВЕТА, и живёт
          // она там же, где остальной его текст (steps/intake/lookup.mjs). Копии этой фразы в полосе
          // быть не должно: одно правило — одно место (CLAUDE.md).
          const found = await graphMap({ resolve: want, spent: ++lookups, cap: LOOKUP_ROUNDS, pending: feedback });
          feedback = String(found.answer || "");
          log(`intake/${pass}: lookup ${want.join(", ")} — ${found.typeRows ? `${found.typeRows} строк из вычисленного графа` : "не резолвится ничем"}${lookups >= LOOKUP_ROUNDS ? "; круги справок исчерпаны" : ""}`);
          continue;
        }

        if (env.track === "err" && env.kind === "question") {
          const q = charge(env);
          // The ceiling refuses instead of killing: the role is redelegated and writes what it can, with
          // every unresolved gap standing in the FRD as <question>. It costs one attempt, so it is bounded.
          if (q.spent) {
            const carry = await carried({ blockers: "", seen: wasRed, outOfRounds: true });
            feedback = carry.text; wasRed = carry.seen;
            log(`intake/${pass}: кругов к оператору больше нет (${QUESTION_ROUNDS}) — остаток пойдёт в артефакт как <question>`);
            attempt++;
            continue;
          }
          // ВОПРОС ЗАДАЁТ ЛЮБОЙ ПРОХОД, и в этом весь смысл пластов. Незнание рождается там, где
          // пишется пласт: A не знает, кто актёр; B — в каком модуле работа; C — какое значение. На
          // прогоне 19.08.2026 все три вопроса пришли ПОСЛЕ того, как роль написала FRD целиком, и
          // ответ обесценил уже написанные дельты, сценарии и поля. Проход не идёт дальше, пока его
          // собственный вопрос без ответа — askOperator ждёт ответа на месте.
          log(`intake/${pass}: круг ${q.n} — вопросов в пакете ${(env.items && env.items.length) || 1}, всего задано ${ASKED_N}`);
          asked = (env.items && env.items.length ? env.items : [env.subject]).map((x) => String(x).trim()).filter(Boolean);
          await askOperator(env, q.n, `intake-${pass}`, "intake", STAGING);
          continue; // a question does not spend the redelegation budget
        }
        if (env.track === "err") exit(err(env.kind, { subject: env.subject, evidence: env.evidence }));

        // Проверка идёт ПО СВОЕМУ ПЛАСТУ и по всем закрытым до него: правило будущего пласта молчит —
        // судить нечего, — а испорченный закрытый краснеет в том же круге, в котором его испортили
        // (steps/intake/frd.mjs::forPass). Гейт сьютов здесь не стоит: он про ширину изменения
        // целиком и живёт на полном суде ниже.
        const check = await checkFrd({ path: STAGING, pass });
        if (check.ok) {
          log(`intake/${pass}: пласт зелен за ${attempt + 1} ${attempt ? "круга" : "круг"}`);
          break;
        }
        const carry = await carried({ blockers: check.blockers, seen: wasRed });
        feedback = carry.text; wasRed = carry.seen;   // the loop's memory is the RUN, not the round
        attempt++;
      }
      if (attempt >= INTAKE_LOOPS) exit(err("escalate", { subject: feedback, evidence: `проход ${pass} шага 6: цикл исчерпан за ${INTAKE_LOOPS} попыток` }));
      feedback = "(none — first attempt at this layer)";
    }

    // ПОЛНЫЙ СУД — без пласта. Правила-мосты (F3c дельта и сценарий, F10 канал и узлы, F8 поле и
    // модуль) в проходном режиме видят половину картины, и пласты могут разойтись между собой.
    // Здесь же стоит гейт сьютов: он спрашивает оператора о ширине изменения, а ширина известна
    // только теперь.
    let check = await checkFrd({ path: STAGING });
    for (let round = 1; check.ask && round <= QUESTION_ROUNDS + 1; round++) {
      const q = charge({ subject: check.subject, items: check.items });
      if (q.spent) exit(noRoundsLeft({ subject: check.subject, evidence: check.why || "" }, "intake"));
      log(`intake: гейт сьютов — круг ${q.n}, узлов без сьюта ${(check.items || []).length} (${check.why || ""})`);
      await askOperator({ subject: check.subject, items: check.items, evidence: check.why || "" }, q.n, "intake", "intake");
      check = await checkFrd({ path: STAGING });
    }
    // `suite` and `drop` are the operator saying the band must stop: a suite is written by a human and
    // a requirement is withdrawn in TASK.md/BRD, neither of which any role here can do. The FRD is NOT
    // promoted — the next run starts from the requirement, not from an artifact nobody can verify.
    if (check.stop) exit(err("blocked", { subject: check.why, evidence: ".agent/frd.xml не промотирован" }));
    if (check.ok) {
      await promote({ from: STAGING, to: ".agent/frd.xml" });
      if (check.waived) log(`intake: неверифицируемых узлов принято оператором — ${check.waived}: шаг 11 о них не спросит`);
      log(`intake: deltas=${check.deltas} unknown=${check.unknown} scenarios=${check.scenarios} touched=${check.touched}`);
      // An Unknown is a legal artifact and a REFUSAL of step 7: said out loud here, where the run is
      // still green, rather than discovered later as a missing .agent/mode.
      if (check.unknown) log(`intake: ${check.unknown} дельт не классифицированы — шаг 7 веса не выведет, полоса встанет`);
      if (check.questions) log(`intake: открытых вопросов в артефакте — ${check.questions}`);
      return; // S22: intake is no longer the end of the run — the weight is weighed next
    }
    // Пласты разошлись между собой. Вход — РАННИЙ из названных пластов (ext/index.mjs::checkFrd,
    // steps/intake/frd.mjs::passOfBlocker), и полоса идёт от него ВПЕРЁД до D: правка нижнего пласта
    // снимает находки верхних, обратное неверно.
    entry = Math.max(0, PASS_LAYERS.indexOf(String(check.pass || "A")));
    const carry = await carried({ blockers: check.blockers, seen: [] });
    feedback = carry.text;
    log(`intake: полный суд красен — пласты разошлись; заход ${sweep + 1} с прохода ${PASS_LAYERS[entry]}`);
  }
  exit(err("escalate", { subject: feedback, evidence: `полный суд шага 6 не сошёлся за ${FULL_SWEEPS} захода` }));
}
// $END_INTAKE

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
}

// Признак «обратной связи нет» — ОДИН литерал на всю полосу: он же умолчание параметра, он же мерка,
// по которой считается первый проход. Второй литерал означал бы два ответа на один вопрос.
const NO_FEEDBACK = "(none — first attempt)";

// Каталоги шага 9. Скелеты и порции считает скрипт и кладёт в STEP9; ответы роли живут в STAGING —
// артефакт, написанный ролью, обязан быть отличим от того, что посчитала машина.
const STEP9 = ".agent/step9";
const STAGING_DIR = ".agent/staging";

// FUNCTION_CONTRACT: rework — mark every step the band is about to replay, and hear the journal out
//   Input:        steps — the step numbers to reopen; note — free text: a guardrail's blocker or the
//                 operator's own words
//   Dependencies: EXTERNAL — runlogMark (ext/index.mjs); log
//   Antecedent:   any values; the note is folded to one line by core/runlog.mjs::mark, so its shape
//                 is not this caller's business
//   Consequent:   success: undefined — every step marked `rework`
//                 failure: none; a journal that refused the value is REPORTED, not swallowed and not
//                          thrown: an unwritten mark means the next launch enters the wrong step
//   Purity:       io
//
// BUG_FIX_CONTEXT: live run 5b52f76d, 20.08.2026. Four call sites wrote this mark by hand, each with
// its own `note: <text>.slice(0, 80)` — a slice that cuts the length and keeps the line break. The
// dry slicing refused with a two-line blocker, the journal could not carry it, ext threw, and the run
// died as `crashed` seconds after PLAN.md was assembled. One helper, one place to hear the refusal.
const rework = async (steps, note) => {
  for (const step of steps) {
    // 80 символов — потолок ОДНОЙ заметки журнала, и он стоит здесь один раз на все четыре места.
    // Резать можно смело: перенос строки внутри среза сворачивает фабрика (core/runlog.mjs::mark),
    // а вся правда лежит в артефакте, на который ссылается отметка.
    const m = await runlogMark({ step, name: "rework", status: "rework", note: String(note ?? "").slice(0, 80) });
    if (m.why) log(`журнал: отметка шага ${step} НЕ записана — ${m.why}; следующий запуск войдёт не в тот шаг`);
  }
};

// FUNCTION_CONTRACT: designing — шаг 9: дерево модулей, потоки и план
//   Input:        from — с какого шага вошла полоса; fromCut — блокеры сухой нарезки предыдущего круга
//   Dependencies: EXTERNAL — values, tree, treeJoin, neighbours, flows, flowsJoin, planbook (ext);
//                 sized, agent, readText, clearStaged, log, exit, err
//   Antecedent:   шаги 6 и 8 закрыты: есть frd.xml, ripple.xml и решение о дизайне
//   Consequent:   success: путь собранного PLAN.md
//                 failure: exit blocked/escalate — с блокером гардрейла, а не с пересказом
//   Purity:       io
//
// ЧЕТЫРЕ ПОДШАГА И ОДНО ПРАВИЛО МЕЖДУ НИМИ: скрипт считает всё, что можно посчитать, роль решает то,
// что посчитать нельзя, гардрейл сверяет объявленное. Порядок: словарь границы → дерево модулей
// порциями → потоки по use case → план скриптом. Отношения ДВА и они не выводятся друг из друга:
// `needs` даёт очередь работ, поток даёт покрытие (docs/plan-design.md).
async function designing(from = 6, fromCut = "") {
  const KEY = (await checkTask({})).key || "";
  const treeTpl = await readText({ path: "steps/plan/tree/order-tree.tpl" });
  const treeFixTpl = await readText({ path: "steps/plan/tree/order-tree.fix.tpl" });
  const flowTpl = await readText({ path: "steps/plan/flows/order-flow.tpl" });
  const flowFixTpl = await readText({ path: "steps/plan/flows/order-flow.fix.tpl" });
  const FRD = await readText({ path: ".agent/frd.xml" });

  // --- 9A: словарь границы -----------------------------------------------------------------------
  const dict = await values({});
  if (!dict.ok) exit(err("blocked", { subject: dict.why, evidence: "шаг 9A: словарь значений" }));
  if (dict.reused) {
    log("design/values: .agent/values.xml зелен сейчас — проход A закрыт без роли, 0 токенов");
  } else {
    const STAGING = dict.at;
    let feedback = NO_FEEDBACK;
    for (let attempt = 1; ; attempt++) {
      if (attempt > LOOPS) exit(err("escalate", { subject: feedback, evidence: `шаг 9A: цикл исчерпан за ${LOOPS} попыток` }));
      const order = await sized("design/values", await readText({ path: "steps/plan/values/order-values.tpl" }), {
        SKELETON: await readText({ path: STAGING }), FRD, PREVIOUS: "", FEEDBACK: feedback,
        BLANK: String(dict.blank || 0), STAGING, CHECK: "values({path}) — состав скелета не тронут, пустые заполнены",
      }, "design/values");
      if (order.over) exit(err("blocked", { subject: order.why, evidence: "наряд словаря не помещается в окно модели" }));
      const env = await agent(order.text, { role: "valuer", outputSchema: ENVELOPE });
      if (env.track === "err") exit(err(env.kind, { subject: env.subject, evidence: env.evidence }));
      const judged = await values({ path: STAGING });
      if (judged.ok) { log(`design/values: ${judged.at} — строк ${judged.rows}`); break; }
      feedback = judged.blockers;
      log(`design/values: красный — попытка ${attempt} из ${LOOPS}: ${String(feedback).split("\n")[0].slice(0, 90)}`);
    }
  }

  // --- 9B: дерево модулей порциями ---------------------------------------------------------------
  const cut = await tree({});
  if (!cut.ok) exit(err("blocked", { subject: cut.why, evidence: "шаг 9B: скелет дерева не посчитан" }));
  log(`design/tree: модулей ${cut.modules}, порций ${cut.portions} — скелет посчитан скриптом, 0 токенов`);
  await portions({
    count: cut.portions, id: "tree", tpl: treeTpl, role: "tree-designer", KEY, FRD, fromCut,
    // ПОРЦИЯ ВИДИТ ТОЛЬКО СВОИ ЧЕТЫРЕ МОДУЛЯ. Имена и объявления соседей приходят ВЫЧИСЛЕННЫМ блоком:
    // роль не может их узнать иначе, и без него гардрейл считал соседа по `needs` призраком.
    order: async (n, PREVIOUS, feedback) => {
      // За данными идут к тому, кто их отдаёт: `tree({slice})` без пути ничего не судит и возвращает
      // модули порции и её образец. Образец едет ПУТЁМ И ВЫЖИМКОЙ — тело файла заняло бы 63% наряда
      // и вытеснило бы задачу в середину, которую слабая модель читает по диагонали.
      const mine = await tree({ slice: n });
      const near = await neighbours({ slice: n });
      const sample = await twin({ slice: n });
      return {
        SKELETON: await readText({ path: `${STEP9}/tree~${n}.xml` }), TWIN: sample.text,
        // Требование едет СУЖЕННЫМ до дельт этой порции и её use case: целиком оно давало 77%
        // дублированного входа шага (измерено на eddi 21.08.2026).
        NEIGHBOURS: near.text || "(твоя порция первая)", FRD: mine.frd || FRD, PREVIOUS, FEEDBACK: feedback,
        MINE: (mine.mine || []).join(" · "), STAGING: `${STAGING_DIR}/tree~${n}.xml`,
        CHECK: "tree({path, slice}) — раздел на каждый модуль порции, у каждого секрет, io, образец, контракт; needs это ПУТЬ",
      };
    },
    judge: (n) => tree({ path: `${STAGING_DIR}/tree~${n}.xml`, slice: n }),
    staging: (n) => `${STAGING_DIR}/tree~${n}.xml`,
    fixTpl: treeFixTpl,
    // НА ПОЧИНКЕ СКЕЛЕТ — МЁРТВЫЙ ГРУЗ: роль правит СВОЙ прошлый ответ, а не пустые поля. И задача
    // у неё другая: не «заполни шесть мест», а «сделай ровно эти находки», каждая со своим адресом.
    fix: async (n, PREVIOUS, feedback) => {
      const mine = await tree({ slice: n });
      const near = await neighbours({ slice: n });
      const sample = await twin({ slice: n });
      const todo = await repair({ blockers: feedback });
      return {
        TASKLIST: todo.text, COUNT: String(todo.count), PREVIOUS, TWIN: sample.text,
        NEIGHBOURS: near.text || "(твоя порция первая)", FRD: mine.frd || FRD,
        MINE: (mine.mine || []).join(" · "), STAGING: `${STAGING_DIR}/tree~${n}.xml`,
        CHECK: "tree({path, slice}) — раздел на каждый модуль порции, у каждого секрет, io, образец, контракт; needs это ПУТЬ",
      };
    },
    join: () => treeJoin({ portions: cut.portions }),
    whole: () => tree({ path: `${STAGING_DIR}/tree.xml`, composed: true }),
    name: (n) => `порция ${n} из ${cut.portions}`,
  });
  const TREE = await readText({ path: ".agent/tree.xml" });

  // --- 9C: потоки по use case --------------------------------------------------------------------
  const sk = await flows({});
  if (!sk.ok) exit(err("blocked", { subject: sk.why, evidence: "шаг 9C: скелет потоков не посчитан" }));
  log(`design/flows: потоков ${sk.flows}, шагов ${sk.steps}, use case ${sk.ucs.length} — closes проставлен скриптом`);
  await portions({
    count: sk.ucs.length, id: "flows", tpl: flowTpl, role: "flow-designer", KEY, FRD, fromCut,
    // ПОТОКИ НЕЗАВИСИМЫ ДРУГ ОТ ДРУГА — в отличие от порций дерева, где соседи читают уже написанное.
    // Семь use case пишутся одновременно, и это делит ВРЕМЯ шага на семь: экономия здесь не в
    // токенах, а в минутах, а минуты — то, чего одними токенами не купить.
    together: true,
    order: async (n, PREVIOUS, feedback) => {
      const uc = sk.ucs[n - 1];
      // Дерево и требование едут суженными до ЭТОГО use case: целиком они давали 211 246 символов
      // на семь нарядов, нарезкой — 78 485 и 43 337.
      const own = await flows({ uc });
      return {
        SKELETON: await readText({ path: `${STEP9}/flows~${uc}.xml` }), TREE: own.tree || TREE, FRD: own.frd || FRD,
        VALUES: own.values || "",
        UC: uc, PREVIOUS, FEEDBACK: feedback, STAGING: `${STAGING_DIR}/flows~${uc}.xml`,
        CHECK: "flows({path, uc}) — все шаги и ветвления этого use case закрыты, модуль из дерева, роль из словаря",
      };
    },
    judge: (n) => flows({ path: `${STAGING_DIR}/flows~${sk.ucs[n - 1]}.xml`, uc: sk.ucs[n - 1] }),
    staging: (n) => `${STAGING_DIR}/flows~${sk.ucs[n - 1]}.xml`,
    fixTpl: flowFixTpl,
    fix: async (n, PREVIOUS, feedback) => {
      const uc = sk.ucs[n - 1];
      const own = await flows({ uc });
      const todo = await repair({ blockers: feedback });
      return {
        TASKLIST: todo.text, COUNT: String(todo.count), PREVIOUS, UC: uc,
        TREE: own.tree || TREE, VALUES: own.values || "", FRD: own.frd || FRD,
        STAGING: `${STAGING_DIR}/flows~${uc}.xml`,
        CHECK: "flows({path, uc}) — все шаги и ветвления этого use case закрыты, модуль из дерева, роль из словаря",
      };
    },
    join: () => flowsJoin({ ucs: sk.ucs }),
    whole: () => flows({ path: `${STAGING_DIR}/flows.xml`, composed: true }),
    name: (n) => `use case ${sk.ucs[n - 1]}`,
  });

  // --- 9D: план собирается скриптом --------------------------------------------------------------
  const book = await planbook({});
  if (!book.ok) exit(err("escalate", { subject: book.blockers || book.why, evidence: book.cycle ? `очередь работ: ${book.cycle}` : "сборка плана шага 9D" }));
  log(`design/plan: ${book.at} собран — модулей ${book.modules}, волны ${book.waves.join(" · ")}, use case ${book.ucs}`);
  return book.at;
}

// FUNCTION_CONTRACT: portions — один подшаг, нарезанный на порции: написать, судить, склеить, судить целое
//   Input:        { count, id, tpl, role, order, judge, staging, join, whole, name, fromCut } — сколько
//                 порций, чем зовут роль, как собрать её наряд, чем судить порцию и целое
//   Dependencies: EXTERNAL — sized, agent, readText, clearStaged, log, exit, err
//   Antecedent:   скелет уже нарезан на порции скриптом
//   Consequent:   success: undefined — целое зелено и продвинуто
//                 failure: exit escalate — бюджет кругов исчерпан, с последним блокером
//   Purity:       io
//
// ТРИ ПРАВИЛА ЭТОГО ЦИКЛА КУПЛЕНЫ ЖИВЫМИ ПРОГОНАМИ, И КАЖДОЕ СТОИЛО КРУГОВ:
//   ① зелёная порция не переписывается — но АДРЕСАТ блокера целого зелёным не считается: пять кругов
//      прогона 5b52f76d ушли в пустоту, потому что все порции отвечали «я зелена» на находку, которую
//      ни одна из них не судила;
//   ② адресат ищется по ПУТЯМ в блокере; блокер без единого пути адресата не имеет, и тогда
//      переписываются ВСЕ порции — незнакомая находка едет по самому дорогому маршруту;
//   ③ правка ставится на СВОЙ прошлый ответ (`PREVIOUS`), а не пишется заново: роль, переписывающая
//      файл ради строки, теряет остальное.
async function portions({ count, id, tpl, fixTpl, role, order, fix, judge, staging, join, whole, name, fromCut = "", together = false }) {
  let feedback = fromCut || NO_FEEDBACK;
  const carried = Boolean(String(feedback).trim()) && feedback !== NO_FEEDBACK;
  let attempt = 0;

  for (;;) {
    if (attempt >= LOOPS) exit(err("escalate", { subject: feedback, evidence: `шаг 9 (${id}): цикл исчерпан за ${LOOPS} попыток` }));

    // ПОРЦИИ, КОТОРЫЕ ДРУГ О ДРУГЕ НЕ ЗНАЮТ, ПИШУТСЯ ОДНОВРЕМЕННО. Потоки — именно такие: use case
    // независим от соседа, и его наряд несёт своё дерево и своё требование. Порции ДЕРЕВА так
    // нельзя: каждая читает блок NEIGHBOURS — то, что уже решили соседние, — и параллель отдала бы
    // им пустой блок, то есть отняла бы единственный способ узнать имена соседей.
    // Один вызов роли на этом шаге — 4-9 минут; семь подряд это час, семь разом — те же 4-9 минут.
    if (together) {
      const todo = [];
      for (let n = 1; n <= count; n++) {
        const mineText = await readText({ path: staging(n) });
        const first = !carried && attempt === 0;
        if (first && mineText.trim() && (await judge(n)).ok) { log(`design/${id}: ${name(n)} зелена с прошлого прогона — роль не звалась, 0 токенов`); continue; }
        todo.push(n);
      }
      if (todo.length) {
        const orders = {};
        for (const n of todo) {
          const was = await readText({ path: staging(n) });
          // Наряд ПОЧИНКИ, когда есть и прошлый ответ, и вердикт: в нём нет скелета, а задача —
          // нумерованный список находок с адресами, а не «заполни поля».
          const repairing = Boolean(was.trim()) && carried;
          const o = repairing
            ? await sized(`design/${id}/fix`, fixTpl, await fix(n, was, feedback), `design/${id}/fix`)
            : await sized(`design/${id}`, tpl, await order(n, was, feedback), `design/${id}`);
          if (o.over) exit(err("blocked", { subject: o.why, evidence: `наряд ${name(n)} не помещается в окно модели` }));
          orders[String(n)] = o.text;
        }
        log(`design/${id}: ${todo.length} порций пишутся ОДНОВРЕМЕННО — ${todo.map((n) => name(n)).join(" · ")}`);
        const done = await parallel(`design-${id}`, Object.fromEntries(
          Object.entries(orders).map(([n, text]) => [n, () => agent(text, { role, outputSchema: ENVELOPE })])));
        for (const [n, env] of Object.entries(done)) {
          if (env && env.track === "err" && env.kind !== "question") exit(err(env.kind, { subject: env.subject, evidence: env.evidence }));
          const mine = await judge(Number(n));
          log(mine.ok ? `design/${id}: ${name(Number(n))} зелена` : `design/${id}: ${name(Number(n))} красная — ${String(mine.blockers || mine.why).split("\n")[0].slice(0, 90)}`);
          if (!mine.ok) { feedback = mine.blockers || mine.why; attempt++; }
        }
      }
    } else for (let n = 1; n <= count; n++) {
      const first = !carried && attempt === 0;
      const mineText = await readText({ path: staging(n) });
      const named = String(feedback).includes(`~${n}`) || (mineText && String(feedback)
        .split(/\s+/).some((w) => w.includes("/") && mineText.includes(w)));
      const blind = !first && !/src\//.test(String(feedback));
      if (!(first || !mineText.trim() || named || blind)) continue;

      if (first && mineText.trim()) {
        const kept = await judge(n);
        if (kept.ok) { log(`design/${id}: ${name(n)} зелена с прошлого прогона — роль не звалась, 0 токенов`); continue; }
      }
      if (!first) log(`design/${id}: ${name(n)} — адресат блокера${blind ? " (адресата не назвали — переписываются все)" : ""}, переписывается`);

      const repairing = Boolean(mineText.trim()) && !first;
      const o = repairing
        ? await sized(`design/${id}/fix`, fixTpl, await fix(n, mineText, feedback), `design/${id}/fix`)
        : await sized(`design/${id}`, tpl, await order(n, mineText, feedback), `design/${id}`);
      if (o.over) exit(err("blocked", { subject: o.why, evidence: `наряд ${name(n)} не помещается в окно модели` }));
      const env = await agent(o.text, { role, outputSchema: ENVELOPE });
      // ВОПРОС РОЛИ — РЕЛЬСА, А НЕ ОШИБКА. Роль спрашивает только о необратимом, о чём требование
      // молчит (owner-decision: форма хранимых данных, публичная поверхность, внешняя зависимость);
      // всё остальное ей отвечает образец из репозитория. Ответ оператора уезжает в журнал решений и
      // переживает пересборку плана — без этого он жил бы только в тексте артефакта и умирал вместе
      // с ним, как умирал три дня подряд.
      if (env.track === "err" && env.kind === "question") {
        const q = charge(env);
        if (q.spent) exit(noRoundsLeft(env, `design/${id}`));
        log(`design/${id}: вопрос ${q.n} — «${env.subject}»`);
        await askOperator(env, q.n, `design-${id}-${n}`, role);
        const said = await answers({});
        const hit = (said || []).find((a) => String(a.question || "").trim() === String(env.subject || "").trim());
        if (hit) {
          const wrote = await decision({ question: env.subject, answer: hit.text, source: `оператор, круг ${q.n}`, route: "operator", why: env.evidence || "" });
          if (!wrote.ok) log(`design/${id}: решение оператора не записано в журнал — ${wrote.why}`);
        }
        n--;
        continue;
      }
      if (env.track === "err") exit(err(env.kind, { subject: env.subject, evidence: env.evidence }));

      const mine = await judge(n);
      if (!mine.ok) {
        feedback = mine.blockers || mine.why;
        attempt++;
        log(`design/${id}: ${name(n)} красная — попытка ${attempt} из ${LOOPS}: ${String(feedback).split("\n")[0].slice(0, 90)}`);
        n--;
        if (attempt >= LOOPS) break;
        continue;
      }
      log(`design/${id}: ${name(n)} зелена`);
    }

    const joined = await join();
    if (!joined.ok) { attempt++; log(`design/${id}: ${joined.why} — попытка ${attempt} из ${LOOPS}`); continue; }
    const check = await whole();
    if (check.ok) { log(`design/${id}: целое зелено — ${JSON.stringify({ ...check, ok: undefined }).replace(/[{}"]/g, "").replace(/,/g, ", ")}`); return; }
    feedback = check.blockers || check.why;
    attempt++;
    log(`design/${id}: целое красное — попытка ${attempt} из ${LOOPS}: ${String(feedback).split("\n")[0].slice(0, 90)}`);
  }
}

// FUNCTION_CONTRACT: gating — step 12: the operator approves the plan, or sends it back
//   Input:        —
//   Dependencies: EXTERNAL — gate1 (the host function; the local name differs because a sandbox
//                 global cannot be shadowed by its caller); charge, askOperator, noRoundsLeft
//   Antecedent:   step 9 left task/<КЛЮЧ>/PLAN.md
//   Consequent:   success: returns "" when the plan is approved and .agent/gate1.json is written,
//                          or the operator's words when they sent it back — the caller rewinds to 6
//                 failure: exits — err("stopped") on `stop`, err("blocked") on anything else
//   Purity:       io (host functions, the operator)
//
// THE PRESENTATION IS THE QUESTION, and that is what binds the decision to the plan: an answer is
// recognised by the question's TEXT (core/answers.mjs), so a plan that changed after the operator
// looked at it asks anew instead of inheriting an approval it never got.
// FUNCTION_CONTRACT: planLoop — шаг 10в: второй судья над планом и починка его находок
//   Input:        note — слова оператора, когда луп включён ПОСЛЕ гейта; "" перед гейтом
//   Dependencies: EXTERNAL — planReview, planRoute, planFix, checkFrd, tickets(dry),
//                 agent(role "plan-critic"), agent(role "plan-fixer"), sized; log, err, exit
//   Antecedent:   шаг 10 собрал PLAN.md
//   Consequent:   success: возврата НЕТ — луп либо доводит план до состояния «находок нет», либо
//                          исчерпывает круги и отдаёт последний план гейту. Отмоток конвейера у него
//                          не бывает: шаги 6-9 к этому моменту закрыты, их артефакты — материал
//                 failure: exits — err("blocked"), когда судить план нечем ИЛИ наряд выше окна
//   Purity:       io (через хост)
//
// ЗАЧЕМ ВТОРОЙ СУДЬЯ. Критик шага 11 судит ТРЕБОВАНИЕ и на прогоне 19.08.2026 написал `Pass`; план
// против требований не судил никто — шаг 10б проверяет лишь, режется ли он. Гейт 1 забраковал работу
// человеком, и разбор показал: три требования план потерял (кэш, отказ 422, фильтр привязки), два не
// написаны в FRD (поле ресурса, ссылка в конфиге агента).
//
// ЭКСПЕРИМЕНТ, КУПИВШИЙ ЭТОТ ШАГ: тот же qwen на тех же артефактах за ОДИН вызов нашёл 4 находки и
// САМ их промаршрутизировал — 4 из 4 верно; фиксер закрыл их за два круга, и его единственный промах
// поймал наш же гардрейл (F3c). Пять вызовов, шесть минут.
//
// БЮДЖЕТ ПЯТЬ КРУГОВ, и это решение оператора. Замер даёт нижнюю границу: полнота растёт от круга к
// кругу — отказ 422 всплыл только на втором, когда первые находки были закрыты, — а верхней границы
// эксперимент не назвал, третий круг не гоняли. Круг стоит два вызова роли на артефакт, который
// человек утверждает своей подписью, и это дешевле, чем план, забракованный на гейте.
const PLAN_ROUNDS = 5;
// Сколько раз ЗА ПРОГОН луп вправе попросить переигрывание плана. Каждое стоит двух вызовов ролей
// (`valuer`+`router` при изменившемся требовании, `core-designer` всегда) и около восьми минут, а
// счётчик кругов лупа при новом заходе обнуляется — без этого предела «критик нашёл модуль →
// усыновили → пересобрали → критик нашёл ещё один» крутится, пока не кончится терпение человека.
// Исчерпан — план идёт к гейту, и НЕ ЗАКРЫТОЕ названо поимённо: решает дальше оператор.
// ТРИ, и это решение оператора: первое переигрывание — не «ещё одна попытка», а ПЕРВЫЙ проход по
// пересборке (план собирался до того, как критик вообще высказался). Значит на исправления
// остаётся два, а не один.
const PLAN_REPLAYS = 3;
// Заходов на ОДИН вызов роли, когда её `write` оборвался провайдером: файл пуст, а роль уверена, что
// сдала работу. Два — потому что круг лупа стоит вызова КРИТИКА сверху, а этот заход стоит только
// себя (standards/runbox.md: обрывы идут подряд на длинных нарядах).
const WRITE_TAKES = 2;
const FRD_PATH_LOOP = ".agent/frd.xml";
// FUNCTION_CONTRACT: fixOne — один заход фиксера по одному артефакту
//   Input:        ОДИН объект с ИМЕНАМИ полей: target — путь артефакта; findings — строки находок;
//                 tpl — шаблон наряда; rejected — отказ гардрейла прошлого круга; nfrs — просить ли
//                 величины; known — адресная книга карты; judge — чем судить правку до записи
//   Dependencies: EXTERNAL — readText, sized, agent(role "plan-fixer"), planFix; exit, err
//   Antecedent:   артефакт существует; находок хотя бы одна
//   Consequent:   success: { ok: true, bytes } — правка применена машиной по якорю
//                          { ok: false, why } — фиксер промахнулся якорем ЛИБО вернул не правку.
//                          Это ЗНАЧЕНИЕ, а не выход: вызывающий решает, чинить иначе или отступить
//                 failure: exits — наряд выше окна модели, роль ушла на рельсу ошибки
//   Purity:       io (через хост)
//
// ОДИН ФИКСЕР НА ДВА АРТЕФАКТА. План и требование правятся ОДИНАКОВО — якорем, — и разводить их по
// двум ролям значило бы держать две копии одного договора о форме правки.
// ИМЕНОВАННЫЕ ПОЛЯ, А НЕ ПОРЯДОК. Семь позиционных аргументов — это семь мест, где сдвиг на один
// не виден ни глазами, ни регуляркой, и виден только прогоном.
//
// BUG_FIX_CONTEXT: прогон c972e5c2 (20.08.2026) упал на `Invalid input for planFeedback`. Добавляя
//   адресную книгу, я дописал `src.known` шестым аргументом в вызовы, где шестого не было: книга
//   села в слот `nfrs`, и в хост уехала строка вместо булева. Шов на книгу это пропустил — он
//   проверял НАЛИЧИЕ `src.known` в вызове, а не его МЕСТО. Прогон стоил 301 487 токенов и умер
//   ровно там, куда шёл: на первой правке требования.
async function fixOne({ target, findings = "", tpl, rejected = "", nfrs = false, known = "", judge = "", facts = "" }) {
  const previous = await readText({ path: target });
  // ОДИН БЛОК FEEDBACK, строки помечены источником — тот же протокол, что у шага 6. Форму строки
  // собирает СРЕЗ (steps/planreview/planreview.mjs::feedbackFor), полоса возит готовое поле: собери
  // её здесь — и проверить будет нечем, кроме регулярки по этому же файлу (шов шага 11).
  const marked = await planFeedback({ findings, rejected: rejected || "", nfrs });
  // РОЛЬ ПИШЕТ ФАЙЛ, ПОЛОСА ЕГО ЧИТАЕТ. Конверт несёт только рельсу (`ok`/`err`) — поля `text` в нём
  // нет и быть не может (ENVELOPE, additionalProperties: false). Тот же договор, что у всех ролей
  // конвейера: артефакт живёт на staging-пути, и полоса берёт его оттуда.
  const STAGED_FIX = ".agent/staging/planfix.txt";
  const FLOW = await readText({ path: ".agent/data-flow.md" });
  const fix = await sized("planreview/fix", tpl, { TARGET: target, PREVIOUS: previous, FEEDBACK: marked.text, FACTS: facts || "(находки не назвали ни одного файла репозитория)", FLOW, KNOWN: known || "", STAGING: STAGED_FIX });
  if (fix.over) exit(err("blocked", { subject: fix.why, evidence: `наряд фиксера для ${target} не помещается в окно модели` }));
  // ПУТЬ ДОСТАВКИ ПУСТ ДО ВЫЗОВА. Иначе файл прошлого круга читается как ответ этого (ext::clearStaged).
  // ЗАПИСЬ МОГЛА НЕ ДОЕХАТЬ, И РОЛЬ ЭТОГО НЕ ЗНАЕТ. Провайдер обрывает вызовы инструментов так же,
  // как обрывает вызовы роли (standards/runbox.md): `write` возвращает «Operation aborted», роль
  // считает работу сданной и зовёт workflow_result. Снаружи это неотличимо от «роль промолчала»,
  // и стоит это КРУГА лупа — то есть лишнего вызова критика. Дешевле повторить сам вызов.
  //
  // BUG_FIX_CONTEXT: прогон da99bbae (20.08.2026), круг 1. Фиксер написал шесть правок на четыре
  //   находки; `write` оборвался; `.agent/staging/planfix.txt` остался пуст, и круг был потрачен.
  let patch = "";
  for (let take = 1; take <= WRITE_TAKES && !patch; take++) {
    await clearStaged({ path: STAGED_FIX });
    const fixed = await agent(fix.text, { role: "plan-fixer", outputSchema: ENVELOPE });
    if (fixed.track === "err") exit(err(fixed.kind, { subject: fixed.subject, evidence: fixed.evidence }));
    patch = String(await readText({ path: STAGED_FIX }) || "").trim();
    if (!patch && take < WRITE_TAKES) log(`planreview/fix: файл ${STAGED_FIX} пуст — запись роли не доехала, заход ${take + 1} из ${WRITE_TAKES}`);
  }
  // «Роль промолчала» — это ОТДЕЛЬНЫЙ отказ, а не «правка не применилась»: чинится он тоже иначе —
  // роли говорят, что файл обязателен, а не что её якорь не найден.
  if (!patch) return { ok: false, why: `роль ничего не записала по ${STAGED_FIX} за ${WRITE_TAKES} захода — правки нет` };
  return planFix({ target, patch, judge: judge || "" });
}

// УДАЛЕНО 21.08.2026: `placeValues` — расстановка величин по карточкам партий. Карточек больше нет;
// величина требования едет в новый план тем же гардрейлом, что и всё остальное.

// FUNCTION_CONTRACT: withPlan — что уезжает в пересборку вместе с её собственной причиной
//   Input:        routed — ответ planRoute
//   Dependencies: —
//   Antecedent:   маршрут выбран, пересборка решена
//   Consequent:   success: строки ВСЕХ находок круга — сперва причина пересборки, следом находки плана
//   Purity:       pure
//
// НАХОДКИ ПЛАНА НЕ ВЫБРАСЫВАЮТСЯ, КОГДА ПОБЕЖДАЕТ ДРУГОЙ МАРШРУТ. Правкой их закрывать здесь нечем:
// план сейчас пересоберётся из карточек, и патч по якорю будет затёрт той же минутой. Но и потерять
// их нельзя — иначе они всплывут только следующим кругом критика, то есть ещё одним вызовом роли на
// то, что уже найдено и названо.
//
// Поэтому они едут ДИЗАЙНЕРУ блоком FEEDBACK: он пишет карточку, из которой план и собирают, и
// закрывает их в источнике, а не в производном документе.
//
// BUG_FIX_CONTEXT: прогон c972e5c2 (20.08.2026). Критик нашёл пять дефектов: R11 (нет модуля
//   конфигурации агента) уехал в требование, а R1 (нет константы resource URI), R16 (ключ шаблона
//   `glossaries` вместо `glossary` — промпт молча не подставится), R17 (Map вместо Caffeine) и
//   R18 (нет исключения для 422) были ПРОСТО ОТБРОШЕНЫ вместе с ответом маршрутизатора.
const withPlan = (routed) => [...routed.frd, ...routed.design, ...routed.plan].join("\n");

async function planLoop(note) {
  // ЦЕЛЬ ЭТОГО ШАГА — РАБОЧИЙ ПЛАН, И БОЛЬШЕ НИЧЕГО. Конвейер выше (шаги 6-9) к этому моменту
  // ЗАКРЫТ: его артефакты — материал, из которого план собран, и переигрывать их здесь нельзя.
  // Остаются трое: критик находит, фиксер правит, гардрейлы не дают сломать. Отмоток нет.
  //
  // BUG_FIX_CONTEXT: прогон c972e5c2 (20.08.2026). Пять настоящих находок; полоса починила
  //   требование и ушла на пересборку шагов 7-9, ОТБРОСИВ четыре находки плана (константа resource
  //   URI, ключ шаблона `glossary`, Caffeine вместо Map, исключение под 422) — их предстояло найти
  //   заново новым кругом критика после двух вызовов ролей. Повторная работа не бесплатна.
  let missed = "";
  // Находки, чья правка НЕ ЛЕГЛА: они переживают круг и едут фиксеру снова, пока не лягут.
  let owed = [];
  // Находки, которые НЕ ЧИНЯТСЯ ни правкой карточки, ни скриптом: модуль, которого требование не
  // знает и усыновить которое не по чему. Фиксеру плана они не едут — он закрыл бы их сиротой.
  let stuck = [];
  const criticTpl = await readText({ path: "steps/planreview/order.tpl" });
  const fixTpl = await readText({ path: "steps/planreview/order.fix.tpl" });

  for (let round = 1; round <= PLAN_ROUNDS; round++) {
    const src = await planReview({});
    if (!src.ok) exit(err("blocked", { subject: src.why, evidence: "шаг 10в: судить план нечем" }));

    // Слова оператора едут КРИТИКУ ВХОДОМ, а не вторым разборщиком прозы: он и так читает три
    // документа, и его дело — превратить замечание человека в находку своей формы.
    const STAGED_VERDICT = ".agent/staging/planreview.txt";
    await clearStaged({ path: STAGED_VERDICT });
    const order = await sized("planreview", criticTpl, {
      BRD: src.brd, FRD: src.frd, PLAN: src.plan, PLANPATH: src.at, STAGING: STAGED_VERDICT, KNOWN: src.known,
      OPERATOR: note || "(оператор пока не высказывался — суди сам)",
    });
    if (order.over) exit(err("blocked", { subject: order.why, evidence: "наряд шага 10в не помещается в окно модели" }));
    const env = await agent(order.text, { role: "plan-critic", outputSchema: ENVELOPE });
    if (env.track === "err") exit(err(env.kind, { subject: env.subject, evidence: env.evidence }));

    const routed = await planRoute({ verdict: await readText({ path: STAGED_VERDICT }) });
    // НАЙДЕНО И НЕ ЗАКРЫТО — ЗНАЧИТ ОТКРЫТО. Критик недетерминирован: «в этот раз не назвал» не
    // означает «починено», и пустой вердикт не отменяет находку, правка которой НЕ ЛЕГЛА.
    //
    // BUG_FIX_CONTEXT: прогон e1f7b5c8 (20.08.2026). Круг 2 нашёл R11 («нет модуля конфигурации
    //   агента» — ту самую дыру, из-за которой оператор забраковал план 19.08); правка не легла;
    //   круг 3 критик назвал ноль находок, и полоса объявила план чистым и понесла его на гейт с
    //   открытой R11.
    const open = [...new Set([...owed, ...routed.plan])];
    if (stuck.length) log(`planreview: не чинится точечно ${stuck.length}: ${stuck.map((x) => x.split("|")[0].trim()).join(" ")} — оператор увидит это на гейте`);
    if (!open.length && !routed.frd.length && !routed.design.length) {
      log(`planreview: круг ${round} — находок нет и долгов нет, план идёт к гейту`);
      return;
    }
    log(`planreview: круг ${round} из ${PLAN_ROUNDS} — находок ${routed.plan.length}${owed.length ? `, долг прошлых кругов ${owed.length}` : ""}`);

    // ВСЕ НАХОДКИ КРУГА ЗАКРЫВАЮТСЯ ОДНОЙ ПРАВКОЙ. Раздела нет — фиксер его пишет: нарезка читает
    // разделы, и дописанный режется в наряд наравне с рождённым сборкой.
    // ФАКТЫ НАЗВАННЫХ ФАЙЛОВ — вход роли: объявления и вызовы с диска, а не память (ext::nodeFacts).
    const facts = await nodeFacts({ paths: routed.paths || [] });
    // ПРАВИМ ИСТОЧНИК, А НЕ ДОКУМЕНТ. `PLAN.md` собирает `planbook` из карточек партий: правка,
    // положенная в документ, живёт до первой пересборки — а пересборка случается всякий раз, когда
    // требование получает новый модуль. Поэтому фиксер правит КАРТОЧКУ, а план пересобирается
    // скриптом тут же и судится нарезкой (ext::planFix judge:"card").
    //
    // BUG_FIX_CONTEXT: 20.08.2026. Четыре правки лупа — константа resource URI, ключ шаблона
    //   `glossary`, Caffeine вместо Map, исключение под 422 — легли в PLAN.md, а карточка осталась
    //   прежней. Первое же переигрывание плана вернуло бы документ к её тексту.
    // КАЖДАЯ НАХОДКА — В КАРТОЧКУ СВОЕГО МОДУЛЯ. Партий бывает несколько, и якорь чужой карточки не
    // найдётся: круг был бы потрачен на промах, которого можно не делать. Строка без пути идёт в
    // карточку, названную первой, — другой связи у неё нет.
    // ПРАВКА ИДЁТ В САМ ПЛАН. Раньше находка ехала в карточку своей партии, чтобы пережить
    // пересборку документа из карточек; карточек больше нет (шаг 9 переписывается, docs/plan.md), и
    // единственный артефакт, который правит фиксер, — тот же, что судил критик.
    const byCard = new Map([[src.at, [...open]]]);

    let broke = "";
    for (const [target, lines] of byCard) {
      const put = await fixOne({ target, findings: lines.join("\n"), tpl: fixTpl, rejected: missed, known: src.known, judge: "card", facts: facts.text });
      // Промах якорем и отказ гардрейла — один класс: замечание о СОБСТВЕННОМ ответе роли. Ни
      // карточка, ни план на диске не тронуты, и замечание едет ей блоком `{REJECTED}` следующим кругом.
      if (!put.ok) { broke = put.blockers || put.why; break; }
      log(`planreview: ${target.split("/").pop()} правлена — ${lines.length} находок, ${put.bytes} симв`);
    }
    if (broke) {
      owed = open;
      missed = broke;
      log(`planreview: правка не легла (${String(broke).split("\n")[0].slice(0, 90)}) — круг ${round} из ${PLAN_ROUNDS}`);
      continue;
    }
    missed = "";
    // Правка ЛЕГЛА — долг снят: закрыта она или нет, скажет следующий круг критика, а не эта строка.
    owed = [];

    // ОТМЕТКА ПЕРЕСТАВЛЯЕТСЯ НА ПРАВЛЕНЫЙ ПЛАН. Журнал держит sha256 поставки шага 9, и правка лупа
    // её меняет — законно: артефакт тот же, он стал лучше, и нарезка это только что подтвердила.
    // Не переставить — значит сказать лестнице «шаг 9 сломан», и следующий запуск пересоберёт план
    // ролями поверх работы критика и фиксера.
    //
    // BUG_FIX_CONTEXT: 20.08.2026, перед четвёртым запуском. Величина `5 minutes`, поставленная
    //   лупом, изменила PLAN.md — и лестница сказала «артефакт шага 9 изменён после отметки»,
    //   предлагая переиграть шаг 9 целиком: два вызова ролей ради того, что уже сделано.
    if (byCard.size) {
      await runlogMark({ step: 9, name: "design", status: "done",
        artifacts: [".agent/design-graph.xml", ".agent/data-flow.md", src.at], note: src.at });
    }

    // ПОТЕРЯННЫЙ МОДУЛЬ ПАТЧЕМ НЕ ДОПИСЫВАЕТСЯ. Модули изменения берутся из `nodes` СЦЕНАРИЕВ
    // требования (steps/design/card.mjs::partsOf): раздел, вписанный в PLAN.md, не получит ни партии,
    // ни уровня, ни зависимостей, и первый же вход в шаг 9 сотрёт его вместе с работой. Поэтому
    // такая находка — это работа над ТРЕБОВАНИЕМ и переигрывание плана.
    //
    // Находки плана к этому моменту УЖЕ закрыты (выше по кругу) — переигрывание их не теряет.
    if (routed.frd.length) {
      // ТРЕБОВАНИЕ ПРАВИТ СКРИПТ, А НЕ РОЛЬ (ext::frdAdopt): путь назвал разборщик, use case назван
      // строкой `<carried>`, сценарий у него один, текст дельты — сама находка. Решать нечего —
      // значит нечем и ошибиться, а правка всё равно идёт через полный суд.
      let adopted = 0;
      for (const line of routed.frd) {
        const f = line.split("|").map((x) => x.trim());
        const node = (line.match(/[\w./-]+\/[\w.-]+\.\w+/) || [""])[0];
        const put = await frdAdopt({ path: node, req: f[0] || "", what: f[3] || "" });
        if (put.ok) { adopted++; continue; }
        log(`planreview: ${f[0] || "находка"} — требование не правится скриптом: ${String(put.blockers || put.why).split("\n")[0].slice(0, 100)}`);
        // НЕ УСЫНОВЛЁННОЕ НЕ ЕДЕТ ФИКСЕРУ ПЛАНА. Модуль, которого нет в требовании, патчем плана не
        // создаётся: положить эту строку в общий долг значило бы отправить её туда, где её закроют
        // разделом-сиротой — без партии, без уровня, без зависимостей и без наряда.
        stuck = [...new Set([...stuck, line])];
      }
      if (!adopted) { missed = ""; continue; }
      log(`planreview: требование получило ${adopted} узел(ов) скриптом, полный суд зелен; план переигрывается`);
      return { replay: routed.frd.join("\n") };
    }
    if (routed.design.length) {
      log(`planreview: ${routed.design.length} находок про модуль, которого нет в плане, — план переигрывается`);
      return { replay: routed.design.join("\n") };
    }

    // Здесь стояла перестановка величины в карточку партии: правка могла унести `5 minutes` вместе
    // со строкой. Карточек больше нет (шаг 9 переписывается) — величина возвращается в план тем же
    // гардрейлом, что и остальное содержание, и это решается в новом шаге, а не тут.
  }
  const left = [...owed, ...stuck];
  log(left.length
    ? `planreview: круги исчерпаны (${PLAN_ROUNDS}) — план идёт к гейту, НЕ ЗАКРЫТО ${left.length}: ${left.map((x) => x.split("|")[0].trim()).join(" ")}`
    : `planreview: круги исчерпаны (${PLAN_ROUNDS}) — план идёт к гейту с последними находками`);
}

async function gating() {
  for (let round = 1; round <= QUESTION_ROUNDS + 1; round++) {
    const g = await gate1({});
    // `kept` — рецепт признан: оператора не спрашивали, потому что этот план он уже утвердил. Счёта
    // модулей в этом ответе нет и быть не может: презентация не собиралась.
    if (g.ok) { log(g.kept ? `gate1: план уже утверждён этим токеном — ${g.at}` : `gate1: план утверждён — модулей ${g.modules}, токен ${g.at}`); return {}; }
    if (g.rework) { log(`gate1: оператор вернул план на доработку — «${g.rework}»`); return { note: g.rework }; }
    // ЕДИНСТВЕННАЯ ОТМОТКА ПОЛОСЫ, и объявляет её человек: требования не хватает вовсе, а не план
    // его потерял. Правкой плана это не чинится — работы нет в источнике.
    if (g.requirements) { log(`gate1: оператор назвал упущенное требование — «${g.requirements}»`); return { requirements: g.requirements }; }
    if (g.stop) exit(err("stopped", { subject: g.why, evidence: "gate1" }));
    if (!g.ask) exit(err("blocked", { subject: g.blockers || g.why, evidence: ".agent/gate1.json не написан" }));

    const q = charge({ subject: g.subject });
    if (q.spent) exit(noRoundsLeft({ subject: g.subject, evidence: "" }, "gate1"));
    await askOperator({ subject: g.subject, evidence: "" }, q.n, "gate1", "gate1");
  }
  exit(err("blocked", { subject: "гейт 1 не получил разбираемого ответа", evidence: "approve · rework: <что не так в плане> · requirements: <какое требование упущено> · stop" }));
}

// УДАЛЕНО 21.08.2026: `onePass` — один проход старого шага 9 (словарь и цепочки порциями).
// Порционность и её суды переезжают в новый шаг вместе с деревом и потоками (docs/plan.md §3).

// FUNCTION_CONTRACT: planning — step 10: the accepted change as an ordered DAG of work
//   Input:        —
//   Dependencies: EXTERNAL — plan (the host function; the local name differs because a sandbox global
//                 cannot be shadowed by the function that calls it); askOperator
//   Antecedent:   steps 5, 6 and 7 left .agent/appgraph.xml, .agent/frd.xml and .agent/mode;
//                 QUESTION_ROUNDS ≥ 1
//   Consequent:   success: RETURNS ".agent/plan-index.json" — nodes with a kind, a topological order
//                          and a check command each, plus the branch name and the declared gaps
//                 failure: exits err("blocked") — no weight, nothing to plan, a cycle, a node nothing
//                          can close, a scenario with no suite, no trunk; the artifact does NOT exist
//                          after it (the host erases a stale one), so no gate can approve a plan
//                          computed for a change that no longer exists
//   Purity:       io (through the host)
//
// The FIRST script step with an operator, and the shape follows from that: there is no role here to
// re-delegate to, so the answer is applied by the script itself and the "loop" is simply the same
// host call made again over the same disk. It therefore spends QUESTION_ROUNDS and never LOOPS — a
// round costs the operator's time, not the model's (docs/plan.md §6, §8).
async function planning(edges) {
  for (let round = 1; round <= QUESTION_ROUNDS + 1; round++) {
    // `edges` are the dependencies step 11's critic asserted on a previous turn of the band: both
    // ends were resolved to plan ids by its guardrail, so they are edges, and re-planning with them
    // is a repair that costs no role at all (docs/review.md §6).
    const p = await plan({ edges: edges || [] });
    if (p.ok) {
      log(`plan: узлов ${p.nodes} (code ${p.code}, scenario ${p.scenario}), ветка ${p.branch} от ${p.base}`);
      // What the repository could not answer is printed where the operator reads it. A gap that stays
      // inside the artifact is indistinguishable from a step that never looked (the same rule step 5
      // follows for its own found="no").
      if (p.gaps.length) log(`plan: пробелы — ${p.gaps.join(", ")}: узла нет, решение заводить их есть отдельная работа`);
      return ".agent/plan-index.json";
    }
    if (!p.ask) exit(err("blocked", { subject: p.why, evidence: ".agent/plan-index.json не написан" }));
    const q = charge({ subject: p.subject });
    if (q.spent) exit(noRoundsLeft({ subject: p.subject, evidence: "" }, "plan"));
    await askOperator({ subject: p.subject, evidence: "" }, q.n, "plan", "plan");
  }
}

// FUNCTION_CONTRACT: reviewing — шаг 11: ТРЕБОВАНИЕ, судимое ролью `critic`
//   Input:        —
//   Dependencies: EXTERNAL — readText, reviewForm, agent(role "critic"), review (host-функция; имя
//                 локальной переменной другое, потому что глобал песочницы нельзя затенить),
//                 carried, sized
//   Antecedent:   шаг 6 оставил `.agent/staging/frd.xml` (или промоутнутый `.agent/frd.xml`), шаг 2 —
//                 `.agent/brd.md`; LOOPS ≥ 1
//   Consequent:   success: ВОЗВРАЩАЕТ { verdict, findings[] } — Reject это УСПЕШНЫЙ прогон шага, и
//                          `.agent/review.xml` несёт блокеры в обоих случаях
//                 failure: exits — err(kind) на рельсе ошибки роли, err("escalate"), когда LOOPS
//                          переделегирований потрачены на МАЛФОРМИРОВАННЫЙ вердикт (R1..R5)
//   Purity:       io (через хост)
//
// Вопросов оператору здесь нет: то, чего критик не понимает в требовании, ЕСТЬ блокер, а не пробел.
// Вердикт здесь же и не применяется — этим владеет band(): починку пишет роль шага 6, чей артефакт
// блокер и обвинил.
//
// ЦИКЛ ЗДЕСЬ — ПРО ФОРМУ, А НЕ ПРО СУЖДЕНИЕ. Переделегирование случается только тогда, когда файл
// роли красен по форме (неизвестный код, адрес, который никуда не резолвится); её ВЫВОД не судится
// никем и не оспаривается. Сам критик зовётся ровно один раз на артефакт — это решает band().
async function reviewing() {
  const orderTpl = await readText({ path: "steps/review/order.tpl" });
  const TASK = await readText({ path: "TASK.md" });
  const BRD = await readText({ path: ".agent/brd.md" });
  const staged = await readText({ path: ".agent/staging/frd.xml" });
  const FRD = staged.trim() ? staged : await readText({ path: ".agent/frd.xml" });
  const STAGING = ".agent/staging/review.xml";
  const CHECK = "review({path}) — steps/review/review.mjs::newReview по staging: node — id элемента FRD, evidence по коду (номер требования BRD для requirement-not-carried, цитата источника для invented-value, id FRD для goal-not-delivered)";
  // Словарь и ОБА чек-листа ПОДСТАВЛЯЮТСЯ из steps/review/review.mjs, а не перепечатываются в
  // шаблоне: то, о чём наряд спрашивает, и то, что считает правило, — одно выражение.
  const FORM = await reviewForm({});
  let feedback = "(none — first attempt)", attempt = 0, wasRed = [];

  while (attempt < LOOPS) {
    const PREVIOUS = await readText({ path: STAGING });
    const order = await sized("review", orderTpl, { TASK, BRD, FRD, PREVIOUS, CODES: FORM.codes, OWED: FORM.owed, UNBACKED: FORM.unbacked, FEEDBACK: feedback, STAGING, CHECK });
    if (order.over) exit(err("blocked", { subject: order.why, evidence: "наряд шага 11 не помещается в окно модели — роль не запускалась" }));
    const env = await agent(order.text, { role: "critic", outputSchema: ENVELOPE });
    if (env.track === "err") exit(err(env.kind, { subject: env.subject, evidence: env.evidence }));

    const check = await review({ path: STAGING }); // проверка идёт ПО STAGING, до всякого промоута
    if (check.ok) {
      log(`review: ${check.verdict}${(check.findings || []).length ? ` — блокеров ${check.findings.length}` : ""}`);
      return { verdict: check.verdict, findings: check.findings || [], feedback: check.feedback || "" };
    }
    const carry = await carried({ blockers: check.blockers, seen: wasRed });
    feedback = carry.text; wasRed = carry.seen;   // красной была ФОРМА, а не суждение: находка остаётся, чинится её адрес
    attempt++;
  }
  exit(err("escalate", { subject: feedback, evidence: `цикл исчерпан за ${LOOPS} попыток` }));
}

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
//   does: prompts/izi.md cannot restate what changes with this file. It MOVED here with the band's
//   end when step 9 was added: a message about the end that stays on step 8 is a message about the
//   wrong step.
// FUNCTION_CONTRACT: band — steps 6-11 as ONE loop: the critic's verdict comes back into the band
//   Input:        —
//   Dependencies: intake, weigh, rippling, designing, planning, reviewing; REVIEW_ROUNDS
//   Antecedent:   steps 1-5 left .agent/appgraph.xml; REVIEW_ROUNDS ≥ 1
//   Consequent:   success: RETURNS the plan's artifact path, with a PASSED review beside it
//                 failure: exits — err("escalate") when the rounds ran out or when a repair did not
//                          take, err(...) from any phase inside
//   Purity:       io (through the phases)
//
// A Reject is routed, not printed: every blocker carries the STEP that owns the artifact it blamed
// (steps/review/review.mjs::CODE_OWNER), and the repair is that step running again.
//   owner 10 — a script: the blocker IS a missing edge, so the plan is recomputed with it and NO
//              role is called at all;
//   owner 6  — a role: the band rewinds to intake with the blockers in FEEDBACK, and 7, 8, 9 run
//              again after it. They MUST: the FRD changed, so yesterday's weight and ripple were
//              computed from deltas that no longer exist, and the designer would be handed a
//              subgraph belonging to a different change (docs/review.md §6).
//
// The loop's real stop is not the counter but the REPEAT: the same (code, node) coming back after a
// repair means the repair did not take, and another round would only spend the same tokens again.
function blockerKey(b) { return `${b.code}|${b.node}`; }

// FUNCTION_CONTRACT: bandStart — which step of the band this run must begin at
//   Input:        —
//   Dependencies: EXTERNAL — checkFrd, readText. Called AFTER graph(), never before: the FRD is judged
//                 against TODAY's map, so a repository that moved invalidates it exactly as it should
//   Antecedent:   .agent/appgraph.xml exists (step 5 just wrote it)
//   Consequent:   success: 6 | 9 | 11 | 12 — the first step whose artifact is not GREEN NOW
//   Purity:       io (host functions)
//
// A STEP IS CLOSED BY A GREEN GUARDRAIL, NOT BY A FILE THAT EXISTS. The same rule `reuse` already
// applies to a cached swarm part (ext/index.mjs): a part that would not close the step today does not
// close it because it once did. Existence alone lies in both directions here — `checkBrd`/`checkFrd`
// leave YESTERDAY's artifact on disk when a check comes back red (they promote, they do not erase), so
// a run that died inside step 6 leaves an frd.xml that belongs to a previous version of the task.
//
// Only the four steps a ROLE writes are judged. Steps 3-5 describe the REPOSITORY rather than the
// change, and cost no tokens at all — the swarm comes out of .izi/parts — so they always re-run and
// the map is today's. That also disposes of every half-written state they could leave behind: a
// partial graph-parts/, a focus.json out of step with the plan, a missing graph-computed.xml.
//
// Steps 7, 8 and 10 are host functions with no role. They are NOT judged, and the ladder in band()
// still skips them when the band starts later — deliberately: step 8's gate ERASES the artifacts of
// step 9 (ext/index.mjs::design), so re-running ripple on a run resumed at step 11 would delete the
// very design its plan was built from.
async function bandStart() {
  const frd = await checkFrd({ path: ".agent/frd.xml" });
  if (!frd.ok) return 6;

  const graph = await readText({ path: ".agent/design-graph.xml" });
  const flow = await readText({ path: ".agent/data-flow.md" });
  const skipped = (await readText({ path: ".agent/design" })).trim() === "skip";
  // Step 9's receipt is the PAIR, or step 8's decision that there is nothing to synchronise. Judging
  // it by its own guardrail is not possible from here: the chains that produced it are not promoted
  // (a green pass B assembles the pair in the same breath), so there is nothing left to re-judge —
  // and the gate of the step erases the pair on every entry for exactly that reason. Its EXISTENCE is
  // therefore the whole signal, and a run resumed at step 11 keeps the design its plan was built from.
  // ПОСТАВКА ШАГА — PLAN.md, а не только его внутренние артефакты. Лестница, смотревшая на одну пару
  // `design-graph.xml`+`data-flow.md`, объявляла шаг закрытым и после того, как разделы плана снесли:
  // живая попытка переиграть шаг 9 дважды ушла мимо него, прямо к гейту.
  const key9 = (await checkTask({})).key || "";
  const book = key9 ? await readText({ path: `task/${key9}/PLAN.md` }) : "";
  if (!skipped && !(graph && flow && book)) { log(`resume: шаг 6 закрыт — .agent/frd.xml зелен сейчас (дельт ${frd.deltas})`); return 9; }

  const verdict = await readText({ path: ".agent/review.xml" });
  if (!/verdict="Pass"/.test(verdict)) { log("resume: шаги 6 и 9 закрыты — их артефакты зелены сейчас"); return 11; }
  log("resume: полоса уже пройдена — вердикт шага 11 Pass");
  return 12;
}

async function band(from0) {
  // Наряд фиксера читается ОДИН раз на полосу: он же служит расстановке величин и лупу.
  const fixTplTop = await readText({ path: "steps/planreview/order.fix.tpl" });
  // fromPass — проход шага 6, с которого полоса переигрывает требование после Reject критика. Считает
  // его модуль (steps/review/review.mjs::passOf) по ЭЛЕМЕНТУ находки, а не по её коду; полоса входит в
  // названный проход и идёт от него вперёд до D.
  let from = from0, edges = [], fromCritic = "", fromPass = "", fromCut = "", fromGate = "", planned = ".agent/plan-index.json";
  // Критик высказывается один раз за прогон полосы. Флаг живёт здесь, а не на диске: `rework`
  // оператора с гейта 1 — это НОВОЕ решение человека и новый артефакт, и он получает свой один вызов
  // (ниже, в ветке gate1).
  let criticSpoke = false;
  // Переигрываний плана по просьбе лупа — не больше PLAN_REPLAYS за прогон.
  let replays = 0;
  const repaired = new Set();

  for (let round = 0; ; round++) {
    // A LADDER, not one gate: everything from `from` onward runs, everything before it is already
    // green. With a single `from <= 6` a run resumed at step 9 skipped the designer too — the one
    // role it existed to re-run.
    // КАЖДЫЙ ШАГ КОНЧАЕТСЯ ОТМЕТКОЙ, И ОТМЕТКА — ЕДИНСТВЕННЫЙ ОТВЕТ НА ВОПРОС «ЭТО УЖЕ СДЕЛАНО?».
    // Артефакты в ней названы не для красоты: их отпечатки снимаются в момент отметки, и следующий
    // запуск сверяет их с диском — правленый руками артефакт переигрывает свой шаг.
    if (from <= 6) {
      phase("intake"); await intake(fromCritic, fromPass);
      await runlogMark({ step: 6, name: "intake", status: "done", artifacts: [".agent/frd.xml"] });
    }
    // ШАГ 11 — КРИТИК ТРЕБОВАНИЯ, И ЗОВЁТСЯ ОН РОВНО ОДИН РАЗ НА АРТЕФАКТ.
    //
    // Место: сразу после зелёного `checkFrd` и до веса. Раньше нельзя — роль судила бы артефакт,
    // который машина ещё не признала разобранным; позже незачем — весь смысл в том, чтобы отказы
    // МАШИНЫ ниже по полосе (шаг 9, сухой прогон, `rework` на гейте) не случились вовсе, а каждый из
    // них стоит роли.
    //
    // ОДИН ВЫЗОВ — ПРАВИЛО, А НЕ НАСТРОЙКА: критик не судит починку собственной критики, иначе на
    // каждое замечание приходит новое и полоса критикует себя вечно. Его `Reject` даёт роли шага 6
    // РОВНО ОДИН круг, после чего судит только машина, а спорить с вердиктом дальше некому — на
    // гейте 1 сидит человек.
    if (from <= 6 && !criticSpoke) {
      criticSpoke = true;
      phase("review");
      const verdict = await reviewing();
      await runlogMark({ step: 11, name: "review", status: "done", artifacts: [".agent/review.xml"], note: verdict.verdict });
      if (verdict.verdict === "Reject") {
        from = 6;
        // Форму строки задаёт срез критика (steps/review/review.mjs::feedbackLines) — по её префиксу
        // и коду роль шага 6 выбирает ремонт, то есть это КОНТРАКТ между двумя ролями, а не печать.
        fromCritic = verdict.feedback;
        fromPass = verdict.pass || "A";
        log(`review: Reject — блокеров ${verdict.findings.length}; шаг 6 переигрывается с прохода ${fromPass} и вперёд, второго вызова критика не будет`);
        await rework([6], `критик: блокеров ${verdict.findings.length}`);
        continue;
      }
    }
    if (from <= 7) {
      phase("weight"); await weigh();
      await runlogMark({ step: 7, name: "weight", status: "done", artifacts: [".agent/mode"] });
    }
    if (from <= 8) {
      phase("ripple"); await rippling();
      await runlogMark({ step: 8, name: "ripple", status: "done", artifacts: [".agent/ripple.xml", ".agent/design"] });
    }
    if (from <= 9) {
      phase("design"); planned = await designing(from, fromCut);
      // На рельсе `skip` роль шага 9 не звалась и графа с потоком нет — отметка несёт то, что есть.
      // ПОСТАВКА ШАГА — ЭТО PLAN.md, а не только его внутренние артефакты. Отметка, называвшая один
      // `.agent/design-graph.xml`, считала шаг закрытым и после того, как разделы плана снесли: живая
      // попытка переиграть шаг 9 ушла прямо в шаг 14.
      const made = (await readText({ path: ".agent/design" })).trim() === "skip"
        ? [".agent/design"]
        : [".agent/design-graph.xml", ".agent/data-flow.md", ...(planned && planned !== ".agent/design" ? [planned] : [])];
      await runlogMark({ step: 9, name: "design", status: "done", artifacts: made, note: planned });
    }

    // THE BAND ENDS AT STEP 9 WHILE STEP 9 IS BEING FINISHED, and it says so instead of walking on.
    // Steps 10 and 11 are not broken and are not deleted — they are DEFERRED: their input is the
    // deliverable of step 9, and until the FRD names an operation per scenario (backlog D35) that
    // deliverable is knowingly incomplete on a big form. Judging a plan built on it costs a role call
    // and produces a verdict about the wrong thing — live run 6a41e94d spent two intake orders on a
    // rewind ordered by a false blocker of the critic.
    //
    // ONE LINE, and it is the only thing that has to move back when D35 closes.
    // GATE 1 — the operator approves the plan or sends it back to the requirement. `rework` rewinds to
    // step 6 and carries the operator's own words into the intake order: a plan cannot be edited
    // around the FRD, because the only thing that checks plan against requirement is phase ⑥, and it
    // reads the FRD.
    // ШАГ 10б — СУХОЙ ПРОГОН НАРЕЗКИ. Наряды режутся ДО гейта и НЕ ПИШУТСЯ: `ticketsOf` и
    // `checkTickets` — чистые функции, а всё, что они читают, лежит на диске уже здесь (разделы шага
    // 9, frd.xml шага 6, appgraph.xml шага 5, ripple.xml шага 8). Из шагов 12-13 нарезке нужны только
    // РАЗРЕШЕНИЕ писать и имя ветки в заголовок — ни одного ФАКТА после гейта не появляется.
    //
    // Смысл шага: оператор утверждает план, про который ДОКАЗАНО, что по нему нарезается исполнимый
    // набор. Красный — дефект ПЛАНА, и чинит его дизайнер шага 9, а не человек на гейте. Судит и
    // режет один и тот же код, поэтому «проверено одно, нарезано другое» невозможно.
    if (from <= 12) {
      const dry = await tickets({ dry: true });
      if (!dry.ok) {
        const why = dry.blockers || dry.why || "";
        // Та же жалоба во второй раз означает, что роль её не понимает: круги тратить не на что.
        if (fromCut && fromCut.includes(why.slice(0, 80))) {
          exit(err("escalate", { subject: why, evidence: "шаг 10б: сухой прогон нарезки вернул ту же жалобу после переписывания плана" }));
        }
        fromCut = `нарезка отказывается резать этот план:\n  ${why}`;
        from = 9;
        await rework([9], why);
        log(`нарезаемость: план НЕ режется — ${why.split("\n")[0]}; перемотка на шаг 9`);
        continue;
      }
      fromCut = "";
      log(`нарезаемость: план режется — ${dry.total} нарядов (границ ${dry.tests}, модулей ${dry.modules}), волны ${dry.waves.join(" · ")}`);
    }

    // ВЕЛИЧИНЫ РАССТАВЛЯЕТ МОДЕЛЬ, ОДИН РАЗ И ДО КРИТИКА. У `<nfr>` нет адреса: связь
    // «glossary-cache-ttl → GlossaryService» видна только по смыслу цепочки, вычислить её нечем.
    // Поэтому роли дают величины и `data-flow.md`, а она находит модуль и правит по якорю.
    // Лупа здесь нет: не сработало — величина придёт находкой к критику, который стоит следом.
    //
    // BUG_FIX_CONTEXT: прогон 19.08.2026. FRD нёс `<nfr subject="glossary-cache-ttl" fit="5 minutes">`,
    //   план — `glossaryCache: Map<String, Glossary>`. Величина умирала на шаге 6: её не читает ни
    //   дизайн, ни план, ни тикеты, и до исполнителя она не доезжала ничем.
    // (перестановка величины в план ждёт нового шага 9 — docs/plan.md)

    // ШАГ 10в — ВТОРОЙ СУДЬЯ НАД ПЛАНОМ. Включается ДВАЖДЫ: здесь сам по себе, до того как план
    // увидит человек, и ниже — со словами оператора, если он вернул работу с гейта.
    if (from <= 12) {
      phase("planreview");
      const verdict = (await planLoop(fromGate)) || {};
      fromGate = "";
      // ПЕРЕИГРЫВАНИЕ ПЛАНА — ЕДИНСТВЕННОЕ, ЧТО ЛУП МОЖЕТ ПОПРОСИТЬ У ПОЛОСЫ, и просит он его только
      // за потерянный модуль: модули изменения берутся из `nodes` сценариев требования, и патчем
      // документа модуль в план не попадает (steps/design/card.mjs::partsOf). Всё остальное луп
      // закрывает сам, на месте, и к этой строке приходит уже закрытым.
      if (verdict.replay && replays >= PLAN_REPLAYS) {
        log(`planreview: переигрывания исчерпаны (${PLAN_REPLAYS}) — план идёт к гейту, НЕ ЗАКРЫТО: ${verdict.replay.split("\n").map((x) => x.split("|")[0].trim()).join(" ")}`);
      } else if (verdict.replay) {
        replays++;
        from = 9;
        fromCut = `критик плана: ${verdict.replay}`;
        await rework([9], verdict.replay);
        log("planreview: план переигрывается — требование получило модуль, которого в плане не было");
        continue;
      }
      // Отметки у лупа НЕТ: он не шаг журнала, а вход в шаг 12. Отметить 12 здесь значило бы сказать
      // «гейт пройден» до того, как его увидел человек, — и обрыв между ними проскочил бы гейт.
    }

    if (from <= 12) {
      phase("gate1");
      const back = await gating();
      // СЛОВА ОПЕРАТОРА ИДУТ В ЛУП, А НЕ НА ШАГ 6. Реворк не означает «переписать всё»: замечание
      // вроде «добавь кэш» закрывается правкой плана за один вызов критика и фиксера.
      if (back.note) {
        from = 12;
        fromGate = back.note;
        log(`gate1: оператор вернул план — «${back.note.slice(0, 60)}»; слова уходят критику плана`);
        continue;
      }
      // ЕДИНСТВЕННАЯ ОТМОТКА КОНВЕЙЕРА, И ЕЁ ОБЪЯВЛЯЕТ ЧЕЛОВЕК. Требование упущено — значит работы
      // нет в источнике, и правкой плана её не создать: полоса идёт в начало, к доработке
      // требований, и интейк переигрывает FRD с этими словами. Ни один гардрейл и ни одна роль
      // такого решения не принимают: отличить «план потерял требование» от «требования не было»
      // может только тот, чья это работа.
      if (back.requirements) {
        from = 2;
        edges = [];
        fromCritic = `оператор на гейте: упущено требование — ${back.requirements}`;
        criticSpoke = false;
        await rework([2, 6, 7, 8, 9, 12], back.requirements);
        log(`gate1: упущено требование — полоса возвращается к доработке требований`);
        continue;
      }
      await runlogMark({ step: 12, name: "gate1", status: "done", artifacts: [".agent/gate1.json"] });
    }

    // STEP 13 — the branch. No role, no repair rail: every refusal is the state of a human's machine
    // (a dirty worktree, a taken name) or a plan that moved after the gate, and both are fixed by a
    // person in a minute. The band stops after it: step 14 (tickets) is not written yet.
    if (from <= 13) {
      phase("branch");
      const cutted = await branch({ baseline: BASELINE });
      if (!cutted.ok) exit(err("blocked", { subject: cutted.why, evidence: `шаг 13: ${cutted.kind}` }));
      log(cutted.kept
        ? `branch: ${cutted.name} уже срезана этим прогоном — работа продолжается в ней`
        : `branch: ${cutted.name} от ${cutted.remote ? `${cutted.remote}/` : ""}${cutted.base} (${cutted.baseSha.slice(0, 7)}) — базлайн ${cutted.baseline} → ${cutted.at}`);
      await runlogMark({ step: 13, name: "branch", status: "done", artifacts: [".agent/branch.json"], note: cutted.name });
    }

    // STEP 14 — наряды исполнителям. Роли нет: тест и модуль режутся из одной вырезки раздела, и
    // модульный наряд ждёт свои тесты. Отказ терминальный — расхождение тикетов с планом означает,
    // что разошлись артефакты, а чинить это некому.
    if (from <= 14) {
      phase("tickets");
      const cut = await tickets({});
      if (!cut.ok) exit(err("blocked", { subject: cut.blockers || cut.why, evidence: "шаг 14: тикеты не нарезаны" }));
      log(`tickets: ${cut.total} нарядов — границ ${cut.tests}, модулей ${cut.modules}; волны ${cut.waves.join(" · ")}; крупнейший ${cut.chars} симв → ${cut.at}`);
      // Ворота на всём сьюте — не молчание: у репозитория нет шаблона одного теста, и такой наряд
      // гоняет весь сьют. Дороже и чувствительно к чужим тестам, но это факт репозитория.
      if ((cut.wholeSuite || []).length) log(`tickets: ворота на ВСЁМ сьюте (в карте нет шаблона одного теста): ${cut.wholeSuite.join(", ")}`);
      await runlogMark({ step: 14, name: "tickets", status: "done", artifacts: cut.files, note: `нарядов ${cut.total}, волн ${cut.waves.length}` });
    }

    if (STOP_AFTER_TICKETS) {
      // ОТЛОЖЕННЫЙ ШАГ ОТМЕЧАЕТСЯ ПРОПУЩЕННЫМ, А НЕ ОСТАЁТСЯ НЕМЫМ. Лестница входит в первый шаг без
      // отметки: молчание про шаги 10 и 11 означало бы, что возобновление вечно встаёт на десятом и
      // переигрывает гейт, ветку и тикеты, которые давно закрыты. Появится наряд на эти шаги — они
      // начнут отмечаться по-настоящему, и `skipped` вытеснится сам.
      // Шаг 11 теперь СТОИТ в полосе — выше, сразу за интейком; пропущенным отмечается только шаг 10.
      for (const step of [10]) await runlogMark({ step, name: "отложен", status: "skipped", note: "шага нет в полосе" });
      return `task/<КЛЮЧ>/tickets`;
    }
    if (STOP_AFTER_DESIGN) return from <= 9 ? planned : ".agent/data-flow.md";

    if (from <= 10) { phase("plan"); planned = await planning(edges); }
    return planned;
  }
}

// STOP_AFTER_DESIGN — полоса кончается после шага 9, и у шагов 10 и 11 причины РАЗНЫЕ.
//
//   шаг 10 `plan` — ждёт, потому что источник `dod` переезжает: сегодня он считается из юнитов
//     design-graph.xml, а с шага 9 приходит строка «проверка» у каждого раздела плана. Включается
//     после шага 14, который покажет, что тикеты режутся из разделов (docs/workflow.md §3.10).
//   шаг 11 `review` — не ждёт, а ПЕРЕЕЗЖАЕТ: критик судит FRD против TASK.md, и место его после
//     шага 6, а не здесь. План судить нечего — фаза ⑥ шага 9 сверяет его с FRD машиной
//     (docs/workflow.md §3.11, TOBE).
//
// Одна константа и одна строка в лестнице: вернуть шаг 10 — снять `true`.
const STOP_AFTER_DESIGN = true;

// STOP_AFTER_TICKETS — полоса кончается после нарезки тикетов: шаг 15 (исполнение) ещё не написан.
const STOP_AFTER_TICKETS = true;

function bandEnds(artifact) {
  // Где полоса кончилась — вопрос ФЛАГА, а не памяти: строка врала ровно один прогон, объявляя гейт 1
  // ненаписанным после того, как он отработал и положил токен (ffdc6844).
  log(STOP_AFTER_TICKETS
    ? `izi: полоса кончилась на шаге 14 — шаг 15 ещё не написан. Поставка — ${artifact}: наряды исполнителям, ветка работы и утверждённый план`
    : STOP_AFTER_DESIGN
      ? `izi: полоса кончилась на шаге 9. Поставка — ${artifact}: план доработки по модулям, из которого режутся тикеты`
      : "izi: полоса кончилась на шаге 11. Поставка — артефакты .agent/; рабочее дерево проекта НЕ трогать: реализация это шаг 15, которого ещё нет");
  exit(ok({
    artifact,
    next: "Полоса кончается здесь. Напечатай результат и остановись: не пиши код, не гоняй тесты, не меняй файлы проекта — реализация это шаг 15, которого ещё нет.",
  }));
}

log("izi: start");
try {
  const b = await budgets({});
  if (!b.ok) exit(err("blocked", { subject: b.why })); // a broken config is a refusal, not a default
  LOOPS = b.loops; INTAKE_LOOPS = b.intakeLoops; QUESTION_ROUNDS = b.questionRounds;
  CHECKPOINT_RETRIES = b.checkpointRetries; MAX_PARALLEL = b.maxParallel; REVIEW_ROUNDS = b.reviewRounds;
  ORDER_CAP = b.orderCap; BASELINE = b.baseline;
  // An ABSENT ceiling is a refusal, not a default: `chars > undefined` is false in JavaScript, so an
  // extension older than this script would silently turn the size check off in all five places while
  // every log line still printed a number. The same class of fault as a host function that is not
  // defined — and it is silent, which the missing function is not.
  if (!ORDER_CAP) exit(err("blocked", { subject: "budgets() не вернул orderCap — расширение в этой сессии pi старше воркфлоу, перезапусти pi" }));
  log(`budgets: loops=${LOOPS} intakeLoops=${INTAKE_LOOPS} rounds=${QUESTION_ROUNDS} checkpointRetries=${CHECKPOINT_RETRIES} maxParallel=${MAX_PARALLEL} reviewRounds=${REVIEW_ROUNDS} orderCap=${ORDER_CAP} baseline=${BASELINE} (${b.source})`);

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
  // ПРОДОЛЖЕНИЕ И ПРОГОН С НУЛЯ — РАЗНЫЕ ФАКТЫ, и лог обязан их различать: оператор, у которого
  // спросили дважды, должен видеть, куда делся его прошлый ответ, а оператор продолжения — что его
  // ответы на месте и второй раз его не спросят.
  log(fresh.kept
    ? `run: продолжение — ответы и разговор оставлены на месте, staging убран (${fresh.staged})`
    : fresh.answers || fresh.pending || fresh.staged
    ? `run: состояние прошлого прогона убрано в .agent/prev — ответов ${fresh.answers}, staging ${fresh.staged}${fresh.pending ? ", открытый вопрос" : ""}`
    : "run: .agent чист — состояния прошлого прогона нет");
  // The working tree is DECLARED, never blocked on: uncommitted files are normal in a live repository.
  // What is not normal is not knowing — the swarm maps the tree as it is, so work done by hand before
  // the run is mapped as the repository's own and the FRD comes out about a different codebase (live
  // run 9a8821a7, ext/index.mjs::dirtyCount). `-1` means git did not answer, which is not "clean".
  if (fresh.dirty > 0) log(`run: рабочее дерево грязное — ${fresh.dirty} файлов не в коммите; разведка отобразит их КАК ЕСТЬ`);

  // WHERE THE BAND ENTERS IS READ, NOT DERIVED. Until this, every launch re-judged the artefacts with
  // their own guardrails to find out what was already done — and that answer is not stable, because a
  // guardrail judges against the evidence available NOW while a run's evidence (the operator's
  // answers) is carried into .agent/prev/ by the run after it. Live run c87db886 is the receipt: a
  // green FRD, an approved plan, and step 6 replayed twice with twenty questions asked again.
  const memo = await runlogRead({});
  log(`resume: вхожу с шага ${memo.from} — ${memo.why}${memo.closed && memo.closed.length ? `; позади ${memo.closed.join(" · ")}` : ""}`);
  const from0 = memo.from;

  // Step 1 runs on EVERY launch, closed or not, and costs nothing: the task key is what every later
  // step addresses its deliverable by, and the answer that carries it lives in .agent/answers.md —
  // the file newRun has just carried away. Skipping this step would resume a run that no longer knows
  // whose plan it is writing.
  phase("task"); await task();
  await runlogMark({ step: 1, name: "task", status: "done" });

  if (from0 <= 2) {
    // The BRD cannot wait for the map the way the FRD does: its subjects choose the focus, so
    // re-running gilb would move the swarm, the map, and with them every artefact the band reuses.
    const brdNow = await checkBrd({ path: ".agent/brd.md" });
    if (brdNow.ok) log(`resume: шаг 2 закрыт — .agent/brd.md зелен сейчас (требований ${brdNow.requirements})`);
    else { phase("brd"); await brd(); }
    await runlogMark({ step: 2, name: "brd", status: "done", artifacts: [".agent/brd.md"] });
  }

  if (from0 <= 3) {
    phase("survey-plan"); await surveyPlan();
    phase("focus"); await focusing();
    await runlogMark({ step: 3, name: "survey-plan", status: "done", artifacts: [".agent/survey-plan.json", ".agent/focus.json"] });
  }
  if (from0 <= 4) {
    phase("scope"); await scope();
    await runlogMark({ step: 4, name: "scope", status: "done" });
  }
  if (from0 <= 5) {
    phase("graph"); await graph();
    await runlogMark({ step: 5, name: "graph", status: "done", artifacts: [".agent/appgraph.xml"] });
  }

  // МОСТИК ДЛЯ ФОРМЫ БЕЗ ЖУРНАЛА. Прогоны, начатые до этого механизма, оставили артефакты и ни одной
  // отметки: спросить у них старую лестницу ОДИН раз дешевле, чем переиграть четырнадцать шагов.
  // Снимается, когда форм со старым состоянием не останется.
  //
  // НАЙДЕННОЕ СРАЗУ ЗАПИСЫВАЕТСЯ. Мостик, который только СКАЗАЛ бы «шаг 6 закрыт», оставил бы журнал
  // без отметки — и следующий запуск начал бы шестой шаг заново, потому что лестница входит в первый
  // шаг без отметки. Ровно это и случилось на первом живом запуске журнала: `intake` пошёл по второму
  // кругу над артефактом, который старая лестница только что признала зелёным.
  const BRIDGE = [[6, "intake", [".agent/frd.xml"]], [7, "weight", [".agent/mode"]],
                  [8, "ripple", [".agent/ripple.xml", ".agent/design"]],
                  [9, "design", [".agent/design-graph.xml", ".agent/data-flow.md"]]];
  // Мостик включается, пока журнал не знает про шаги 6-9 — а не «пока журнал пуст». Форма, где шаги
  // разведки уже отмечены, а полоса ещё нет, это ровно тот случай: закрытых отметок много, знания о
  // полосе нет ни одной.
  // Мостик молчит, когда журнал про полосу УЖЕ знает: `closed` содержит шаг 6 ровно тогда, когда его
  // отметка есть и цела. Иначе старая лестница перебивает вердикт журнала — а он точнее: это она
  // отвечает «шаг 9 закрыт» на артефакт, который человек только что поправил руками.
  let start = Math.max(from0, 6);
  if (from0 <= 9 && !(memo.closed || []).includes(6)) {
    start = await bandStart();
    for (const [step, name, artifacts] of BRIDGE) {
      if (step < start) await runlogMark({ step, name, status: "done", artifacts, note: "признан старой лестницей" });
    }
  }
  bandEnds(await band(start));                  // always exits — the band's end is one statement,
  return ok({});                                // in one place; the return is the next phase's slot
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
