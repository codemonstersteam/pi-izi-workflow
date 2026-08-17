// S14 unit seam: every host function (ext/index.mjs) must anchor to context.run.cwd — the
// WORKFLOW RUN's own directory — never to this repository's own location. The live defect (run
// 2e71776f-342c-42e3-b623-d338b2b9c45c) had readText/answers/checkTask/checkBrd/promote/
// setPending/clearPending silently reading and writing THIS repo checkout instead of the
// installed project that launched the run — checkBrd never found staging, three redelegations,
// escalate. Each test below plants content in a temp root that DIFFERS from what actually lives
// in this repo's own TASK.md/.agent/ (this repo's TASK.md is a meeting-room booking spec; every
// temp root here carries something else, e.g. fruit), so a function that falls back to reading
// the repo instead of context.run.cwd fails LOUDLY on wrong content, not by lucky coincidence.
//
// Manually verified as the seam it claims to be (standards/code.md: a test with no seam is a comment):
// reverting `at`/`readIfExists` in ext/index.mjs to the old REPO_ROOT-anchored form turns every
// test below red; restoring the context.run.cwd anchor turns them green again.

import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Compile } from "typebox/compile"
import { readText, answers, checkTask, checkBrd, checkFrd, carried, budgets, setPending, clearPending, promote, newRun, focus, cells, buildGraph, weight, ripple, design, plan, review, reviewForm, iziAnswer } from "./index.mjs"
import { KEY_QUESTION } from "../steps/plan/plan.mjs"
// D23: the gate of step 6 — its question is a constant of the ripple slice, and the answer travels in
// the format core/answers.mjs owns.
import { BLIND_STEM, BLIND_TAIL } from "../steps/ripple/ripple.mjs"
import { newExchange } from "../core/answers.mjs"
// D23-11: наряд и правило шага 11 читают ОДНО выражение — тест держит их за одно и то же.
import { askedNodes } from "../steps/review/review.mjs"
import { parseFrd } from "../steps/intake/frd.mjs"
import { DEFAULT_BUDGETS, ORDER_CAP_CHARS } from "../core/budgets.mjs"

const tempRoot = () => mkdtempSync(join(tmpdir(), "izi-s14-"))
const ctx = (cwd) => ({ run: { cwd } })

// --- readText -----------------------------------------------------------------------------

test("readText reads TASK.md from context.run.cwd, not this repo's own TASK.md", () => {
  const root = tempRoot()
  writeFileSync(join(root, "TASK.md"), "Короткое требование про фрукты.\n")
  assert.equal(readText.run({ path: "TASK.md" }, ctx(root)), "Короткое требование про фрукты.\n")
})

test("readText: missing file at run root reads as '' — no repo fallback", () => {
  const root = tempRoot()
  assert.equal(readText.run({ path: "nope.md" }, ctx(root)), "")
})

// --- answers --------------------------------------------------------------------------------

test("answers reads .agent/answers.md from context.run.cwd", () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, ".agent", "answers.md"), "<exchange>\n  <question_1>лимит?</question_1>\n  <answer_1>4</answer_1>\n</exchange>\n")
  assert.deepEqual(answers.run({}, ctx(root)), [{ n: 1, question: "лимит?", text: "4" }])
})

test("answers: absent .agent/answers.md at run root is [], even though this repo HAS one", () => {
  const root = tempRoot()
  assert.deepEqual(answers.run({}, ctx(root)), [])
})

// --- checkTask ------------------------------------------------------------------------------

test("checkTask judges the run root's TASK.md, not this repo's", () => {
  const root = tempRoot()
  writeFileSync(join(root, "TASK.md"), "Короткое требование про фрукты.\n")
  assert.equal(checkTask.run({}, ctx(root)).ok, true)
})

test("checkTask: TASK.md missing at run root fails, even though this repo has one", () => {
  const root = tempRoot()
  const r = checkTask.run({}, ctx(root))
  assert.equal(r.ok, false)
})

// --- checkBrd -------------------------------------------------------------------------------

test("checkBrd reads staging AND TASK.md from context.run.cwd", () => {
  const root = tempRoot()
  writeFileSync(join(root, "TASK.md"), "Лимит бронирования не более 20 штук.\n")
  mkdirSync(join(root, ".agent", "staging"), { recursive: true })
  writeFileSync(
    join(root, ".agent", "staging", "brd.md"),
    [
      "R1 Лимит бронирования",
      "   fit: не более 20",
      "   verify: unit test",
      "subjects[]: лимит · бронь · штук",
      "analogue: PromptSnippet\nopen-questions: 0",
      "",
    ].join("\n"),
  )
  const r = checkBrd.run({ path: ".agent/staging/brd.md" }, ctx(root))
  assert.equal(r.ok, true)
  assert.equal(r.requirements, 1)
})

test("checkBrd: staging missing at run root is a blocker, not a silent pass", () => {
  const root = tempRoot()
  const r = checkBrd.run({ path: ".agent/staging/brd.md" }, ctx(root))
  assert.equal(r.ok, false)
  assert.match(r.blockers, /не существует/)
})

// --- setPending / clearPending ----------------------------------------------------------------

test("setPending writes and clearPending removes .agent/pending.json under context.run.cwd", () => {
  const root = tempRoot()
  setPending.run({ subject: "лимит?", evidence: "" }, ctx(root))
  const p = join(root, ".agent", "pending.json")
  assert.equal(existsSync(p), true)
  assert.equal(JSON.parse(readFileSync(p, "utf8")).subject, "лимит?")
  clearPending.run({}, ctx(root))
  assert.equal(existsSync(p), false)
})

// --- promote ----------------------------------------------------------------------------------

test("promote MOVES staging→out under context.run.cwd: accepted content leaves staging behind empty", () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent", "staging"), { recursive: true })
  writeFileSync(join(root, ".agent", "staging", "brd.md"), "R1 ...\n")
  promote.run({ from: ".agent/staging/brd.md", to: ".agent/brd.md" }, ctx(root))
  assert.equal(readFileSync(join(root, ".agent", "brd.md"), "utf8"), "R1 ...\n")
  assert.equal(existsSync(join(root, ".agent", "staging", "brd.md")), false)  // staging holds only what was REJECTED
})

test("promote: missing staging at run root throws, never a silent no-op", () => {
  const root = tempRoot()
  assert.throws(() => promote.run({ from: ".agent/staging/brd.md", to: ".agent/brd.md" }, ctx(root)))
})

// --- newRun -----------------------------------------------------------------------------------
//
// The seam of "an answer belongs to the run whose question it answers". Reintroducing the defect —
// dropping the newRun() call from workflows/izi.js, or making it skip answers.md — turns the
// invented-default test below red: a number nobody uttered in THIS run passes the guardrail.

const EXCHANGE = (q, a) => `<exchange>\n  <question_1>${q}</question_1>\n  <answer_1>${a}</answer_1>\n</exchange>\n`

// A root that looks exactly like the directory an interrupted run leaves behind.
function deadRun(root, { answer = "50", staged = true } = {}) {
  mkdirSync(join(root, ".agent", "staging", "graph-parts"), { recursive: true })
  writeFileSync(join(root, ".agent", "answers.md"), EXCHANGE("предел ответа — 50 (альтернативы 20, 100)?", answer))
  writeFileSync(join(root, ".agent", "pending.json"), JSON.stringify({ subject: "предел?", items: [{ n: 1, text: "предел?" }] }))
  if (staged) writeFileSync(join(root, ".agent", "staging", "graph-parts", "root.xml"), "<part/>\n")
  writeFileSync(join(root, ".agent", "brd.md"), "R1 старый артефакт\n")
  mkdirSync(join(root, ".izi", "parts"), { recursive: true })
  writeFileSync(join(root, ".izi", "parts", "root.json"), "{}\n")
}

test("newRun carries the dead run's answers, question and staging into .agent/prev — and deletes nothing", () => {
  const root = tempRoot()
  deadRun(root)
  const r = newRun.run({}, ctx(root))

  assert.deepEqual(r, { answers: 1, pending: true, staged: 1, dirty: -1 })   // a temp dir is no git repo: -1, never 0
  assert.deepEqual(answers.run({}, ctx(root)), [])                                   // the new run starts with no answers
  assert.equal(existsSync(join(root, ".agent", "pending.json")), false)
  assert.equal(existsSync(join(root, ".agent", "staging", "graph-parts", "root.xml")), false)

  assert.match(readFileSync(join(root, ".agent", "prev", "answers.md"), "utf8"), /50/)  // evidence, not garbage
  assert.equal(JSON.parse(readFileSync(join(root, ".agent", "prev", "pending.json"), "utf8")).subject, "предел?")
  assert.equal(readFileSync(join(root, ".agent", "prev", "staging", "graph-parts", "root.xml"), "utf8"), "<part/>\n")
})

test("newRun does not touch artifacts or the .izi/parts cache — that cache outlives runs BY DESIGN", () => {
  const root = tempRoot()
  deadRun(root)
  newRun.run({}, ctx(root))
  assert.equal(readFileSync(join(root, ".agent", "brd.md"), "utf8"), "R1 старый артефакт\n")
  assert.equal(existsSync(join(root, ".izi", "parts", "root.json")), true)
})

test("newRun on a clean root: nothing to carry, nothing created", () => {
  const root = tempRoot()
  assert.deepEqual(newRun.run({}, ctx(root)), { answers: 0, pending: false, staged: 0, dirty: -1 })
  assert.equal(existsSync(join(root, ".agent", "prev")), false)
})

test("newRun twice: .agent/prev holds the PREVIOUS run, not a growing pile", () => {
  const root = tempRoot()
  deadRun(root, { answer: "50" })
  newRun.run({}, ctx(root))
  writeFileSync(join(root, ".agent", "answers.md"), EXCHANGE("предел?", "10"))       // the run that just ended
  const r = newRun.run({}, ctx(root))
  assert.deepEqual(r, { answers: 1, pending: false, staged: 0, dirty: -1 })
  const prev = readFileSync(join(root, ".agent", "prev", "answers.md"), "utf8")
  assert.match(prev, /10/)
  assert.doesNotMatch(prev, /50/)                                                     // overwritten, not appended
})

test("the defect this closes: a number answered in a DEAD run no longer passes invented-default", () => {
  const root = tempRoot()
  writeFileSync(join(root, "TASK.md"), "Поиск по части имени, существующие вызовы не ломать.\n")   // no numbers at all
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, ".agent", "answers.md"), EXCHANGE("предел ответа?", "50"))
  const brd = [
    "R1 Ответ ограничен по размеру",
    "   fit: не более 50 записей",
    "   verify: GET /fruits?q=a → записей ≤ 50",
    "subjects[]: поиск · имя · предел",
    "analogue: PromptSnippet\nopen-questions: 0",
    "",
  ].join("\n")
  mkdirSync(join(root, ".agent", "staging"), { recursive: true })
  writeFileSync(join(root, ".agent", "staging", "brd.md"), brd)

  // Before: the dead run's answer is on disk and 50 is a legal source.
  assert.equal(checkBrd.run({ path: ".agent/staging/brd.md" }, ctx(root)).ok, true)

  // After a run boundary: the same 50 lives in .agent/prev/answers.md and answers nobody's question.
  newRun.run({}, ctx(root))
  mkdirSync(join(root, ".agent", "staging"), { recursive: true })
  writeFileSync(join(root, ".agent", "staging", "brd.md"), brd)
  const r = checkBrd.run({ path: ".agent/staging/brd.md" }, ctx(root))
  assert.equal(r.ok, false)
  assert.match(r.blockers, /50/)
})

test("a number that stands in a requirement's verify is sourced — the BRD slice is fit AND verify", () => {
  const root = tempRoot()
  writeFileSync(join(root, "TASK.md"), "Отдавать глоссарий агента по HTTP.\n")   // no numbers at all
  mkdirSync(join(root, ".agent", "staging"), { recursive: true })
  writeFileSync(join(root, ".agent", "appgraph.xml"),
    '<appgraph><module path="src/GlossaryResource.java" kind="rest"><api name="GET /glossary"/></module></appgraph>')
  writeFileSync(join(root, ".agent", "brd.md"), [
    "R1 Эндпоинт глоссария отвечает успешно",
    "   fit: эндпоинт отвечает успешным статусом",   // the NUMBER is deliberately NOT here
    "   verify: GET /glossary возвращает 200",
    "subjects[]: глоссарий · агент",
    "analogue: PromptSnippet\nopen-questions: 0",
  ].join("\n"))
  const frd = (status) => `<frd grammar="1" goal="отдавать глоссарий агента">
  <actor name="admin-ui" kind="human" via="HTTP GET /glossary"/>
  <usecase id="UC1" actor="admin-ui" goal="получить глоссарий">
    <pre>агент существует</pre><post>вернулся глоссарий</post>
    <step n="1">клиент шлёт GET /glossary</step>
    <ext id="1a" error="none" outcome="глоссария нет — пустой список"/>
  </usecase>
  <field name="status" in="GET /glossary" type="int" domain="${status}" required="yes" error="none" source="brd.md"/>
  <failures found="no" why="изменение не вводит кодов отказа"/>
  <delta op="GET /glossary" form="Changed" node="src/GlossaryResource.java" from="404" to="глоссарий"/>
  <scenario id="S1" uc="UC1" before="GET /glossary не отвечает" after="отдаёт глоссарий" nodes="src/GlossaryResource.java"/>
  <touched path="src/GlossaryResource.java" why="появляется чтение глоссария"/>
</frd>`

  // Live run e132f0a1 died on exactly this: the number stood in `verify`, F5 said "nowhere in the
  // BRD", and the role deleted a correct number to obey a blocker that was wrong.
  writeFileSync(join(root, ".agent", "staging", "frd.xml"), frd("200"))
  assert.deepEqual(checkFrd.run({ path: ".agent/staging/frd.xml" }, ctx(root)).ok, true)

  // The rule still bites: a number in neither fit nor verify is still invented, and the refusal now
  // names the ways out instead of leaving the role to invent one.
  writeFileSync(join(root, ".agent", "staging", "frd.xml"), frd("418"))
  const r = checkFrd.run({ path: ".agent/staging/frd.xml" }, ctx(root))
  assert.equal(r.ok, false)
  assert.match(r.blockers, /418/)
  assert.match(r.blockers, /<question>/)
})

// --- budgets: the host validates OUTPUT, so a budget missing from the schema crashes the run ----
//
// This defect has now happened twice on the same line — maxParallel (run 657fcd98) and intakeLoops
// (run c8bd1294) — because the fix each time was a comment. `additionalProperties: false` turns a key
// declared in core/budgets.mjs but not here into "Invalid output from budgets": a crash at `izi: start`
// naming no key. The assertion below is over the KEY SET, so it fails for a budget that does not exist
// yet, which is the only version of this seam worth having.

test("every budget of core/budgets.mjs is declared in the host's output schema", () => {
  const declared = Object.keys(budgets.output.properties)
  for (const k of Object.keys(DEFAULT_BUDGETS)) assert.ok(declared.includes(k), `бюджет ${k} не объявлен в схеме budgets`)

  const root = tempRoot()
  const out = budgets.run({}, ctx(root))
  const validate = Compile(budgets.output)   // the host's own check, run here instead of at launch
  assert.equal(validate.Check(out), true, JSON.stringify(out))
  assert.equal(out.intakeLoops, DEFAULT_BUDGETS.intakeLoops)

  // D29b: потолок наряда едет тем же каналом и НЕ является бюджетом izi.config.json — проект не
  // выбирает окно модели. Убери его из ответа — воркфлоу встаёт `blocked` на первом же шаге, потому
  // что `симв > undefined` это `false`: проверка размера выключилась бы молча во всех пяти местах.
  assert.equal(out.orderCap, ORDER_CAP_CHARS)
  assert.equal(Object.keys(DEFAULT_BUDGETS).includes("orderCap"), false)
})

// --- the judges a resumed run leans on must be NON-DESTRUCTIVE --------------------------------
//
// S34: a run now starts at the first step whose artifact is not GREEN NOW (workflows/izi.js::
// bandStart), and it asks that question by running the step's own guardrail over the PROMOTED
// artifact. That only works while the guardrail merely judges: `design({path})` promotes and erases
// (ext/index.mjs — copyFileSync then rmSync), so asking it "is this green" would consume the answer.
// This test holds checkBrd and checkFrd to the other contract.

test("checkBrd and checkFrd judge a promoted artifact without consuming it", () => {
  const root = tempRoot()
  writeFileSync(join(root, "TASK.md"), "Лимит бронирования не более 20 штук.\n")
  mkdirSync(join(root, ".agent"), { recursive: true })
  const brd = ["R1 Лимит бронирования", "   fit: не более 20", "   verify: unit test",
    "subjects[]: лимит · бронь · штук", "analogue: PromptSnippet\nopen-questions: 0", ""].join("\n")
  writeFileSync(join(root, ".agent", "brd.md"), brd)

  assert.equal(checkBrd.run({ path: ".agent/brd.md" }, ctx(root)).ok, true)
  assert.equal(readFileSync(join(root, ".agent", "brd.md"), "utf8"), brd)  // still there, byte for byte
  assert.equal(checkBrd.run({ path: ".agent/brd.md" }, ctx(root)).ok, true) // and the SAME answer twice

  // A missing artifact is a refusal, never a throw: that is what makes "not green now" a legal answer
  // for a step that simply has not run yet.
  assert.equal(checkFrd.run({ path: ".agent/frd.xml" }, ctx(root)).ok, false)
})

// --- checkFrd io: F9's `rewind` comes from .agent/review.xml, only on a Reject --------------------
// Live run 508d74fa's class of defect: step 6, cornered by a blocker it cannot honestly repair,
// deletes the SUBJECT of the blocker instead. F9 (steps/intake/frd.mjs) catches that on the FRD side;
// this is the io half — the workflow never hands `rewind` in by hand (workflows/izi.js::intake is
// unchanged), checkFrd builds it itself from whatever verdict is on disk.
test("checkFrd io: rewind is read from .agent/review.xml, and only a Reject supplies it", () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent", "staging"), { recursive: true })
  writeFileSync(join(root, ".agent", "appgraph.xml"),
    '<appgraph><module path="src/CardResource.java" kind="rest"><api name="GET /card"/></module></appgraph>')

  const frdXml = (withUC2) => `<frd grammar="1" goal="карточка по имени">
  <usecase id="UC1" actor="user" goal="увидеть карточку">
    <post>карточка отображена</post>
    <step n="1">пользователь открывает карточку</step>
  </usecase>
  ${withUC2 ? `<usecase id="UC2" actor="user" goal="получить данные карточки">
    <post>данные карточки получены</post>
    <step n="1">клиент шлёт GET /card</step>
  </usecase>` : ""}
  <failures found="no" why="изменение не вводит кодов отказа"/>
  <delta op="GET /card" form="Added" node="src/CardResource.java"/>
  <scenario id="S1" uc="UC1" before="карточки нет" after="карточка есть" nodes="src/CardResource.java"/>
  ${withUC2 ? '<scenario id="S2" uc="UC2" before="данных нет" after="данные есть" nodes="src/CardResource.java"/>' : ""}
  <touched path="src/CardResource.java" why="карточка добавляется"/>
</frd>`
  const reject = '<review verdict="Reject" grammar="2"><blocker code="goal-not-delivered" node="src/CardResource.java" evidence="UC2/post">карточка данных не реализована</blocker></review>'

  // No .agent/review.xml at all: not a rewind, F9 stays silent even though UC2 is absent.
  writeFileSync(join(root, ".agent", "staging", "frd.xml"), frdXml(false))
  assert.equal(checkFrd.run({ path: ".agent/staging/frd.xml" }, ctx(root)).ok, true)

  // A promoted Pass carries no rewind either.
  writeFileSync(join(root, ".agent", "review.xml"), '<review verdict="Pass" grammar="2"/>')
  assert.equal(checkFrd.run({ path: ".agent/staging/frd.xml" }, ctx(root)).ok, true)

  // A Reject naming UC2/post, with UC2 still gone from the repair: F9 refuses.
  writeFileSync(join(root, ".agent", "review.xml"), reject)
  const cut = checkFrd.run({ path: ".agent/staging/frd.xml" }, ctx(root))
  assert.equal(cut.ok, false)
  assert.match(cut.blockers, /F9 предмет перемотки «UC2\/post» удалён из FRD/)

  // …and the honest repair — UC2 restored — passes the very Reject that named it.
  writeFileSync(join(root, ".agent", "staging", "frd.xml"), frdXml(true))
  const fixed = checkFrd.run({ path: ".agent/staging/frd.xml" }, ctx(root))
  assert.equal(fixed.ok, true, fixed.ok ? "" : fixed.blockers)
})

// --- carried: the memory of a repair loop reaches the sandbox --------------------------------

test("carried hands the workflow the lines already red in this run, not just the last check", () => {
  const first = carried.run({ blockers: "F4 S1: uc пуст\nF5 поле id: 24" })
  const second = carried.run({ blockers: "F4 S1: uc пуст", seen: first.seen })
  assert.match(second.text, /F5 поле id: 24/)
  assert.equal(second.text.match(/F4 S1: uc пуст/g).length, 1)
})

// --- focus (step 3b): the artifact is written from the RUN's plan, and a refusal erases it -------
//
// Same rule as `.agent/mode` below and for the same reason: newRun leaves artifacts alone, so
// yesterday's focus would outlive today's refusal and step 4 would survey it. Seam: drop the
// `drop()` calls in ext/index.mjs::focus and the third test here goes red.
//
// The anchor rule is the OTHER thing under test. `focus` never reads .agent/brd.md — it takes the
// anchors from the plan's own files[].subjects — so a run whose plan marks nothing must ask, even
// when this repository's own .agent/brd.md is full of anchors.
const planAt = (root, files, marked = []) => {
  mkdirSync(join(root, ".agent"), { recursive: true })
  const cell = (id, kind, paths) => ({ id, kind, subjects: [], bytes: paths.length * 1000, files: paths.map((path) => ({ path, bytes: 1000, sha1: "", subjects: marked.includes(path) ? ["якорь"] : [] })) })
  writeFileSync(join(root, ".agent", "survey-plan.json"), JSON.stringify({
    files: files.length, bytes: files.length * 1000, subjects: ["якорь"], gaps: [],
    cells: [cell("spine", "spine", ["README.md"]), ...files.map((p, i) => cell(`c${i + 1}`, "survey", [p]))],
  }))
  // one route on the first file and one edge from it to the second: the smallest graph that yields
  // an entry with a cone, so the branches below differ by the ANCHORS and not by the shape
  writeFileSync(join(root, ".agent", "graph-computed.xml"), `<computed grammar="1">\n<edge from="${files[0]}" to="${files[1]}"/>\n<api at="${files[0]}" name="GET /x" kind="http" scope="public" via="jaxrs"/>\n</computed>\n`)
  return root
}

test("focus writes .agent/focus.json under context.run.cwd — the whole plan while it fits", () => {
  const root = planAt(tempRoot(), ["src/A.java", "src/B.java"])
  const r = focus.run({}, ctx(root))
  assert.equal(r.ok, true)
  assert.equal(r.why, "whole-plan")
  const f = JSON.parse(readFileSync(join(root, ".agent", "focus.json"), "utf8"))
  assert.equal(f.cells.length, 3)                       // spine + both cells: nothing is narrowed
  assert.deepEqual(f.slices.map((s) => s.entry), ["src/A.java"])   // …and the cone is computed anyway
  assert.equal(f.slices[0].nodes, 2)                    // a COUNT: the node list has no reader
})

test("no .agent/survey-plan.json at the run root: refusal naming step 3, and no focus left behind", () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, ".agent", "focus.json"), '{"cells":["c1"]}')       // yesterday's focus
  const r = focus.run({}, ctx(root))
  assert.equal(r.ok, false)
  assert.match(r.why, /шаг 3 survey-plan не отработал/)
  assert.equal(existsSync(join(root, ".agent", "focus.json")), false)
})

test("the anchor is matched against the SURFACE, not the file's text", () => {
  // BUG_FIX_CONTEXT run e90d9ce1 (eddi): the surface is built HERE, out of graph-computed.xml, and
  // that is the whole repair — under step 3's marking rule the anchor `import` named 83 of 84
  // entries, because every java file opens with a block of imports.
  const root = planAt(tempRoot(), Array.from({ length: 400 }, (_, i) => `src/n${i}.java`))
  writeFileSync(join(root, ".agent", "focus.json"), '{"cells":["c1"]}')       // yesterday's focus

  const r = focus.run({}, ctx(root))
  assert.equal(r.ok, false)
  assert.match(r.why, /no-anchor/)                       // the plan's anchor names no entry here
  assert.equal(existsSync(join(root, ".agent", "focus.json")), false, "a refusal erases the artifact")

  // …and when an anchor DOES name an entry, the focus is written and narrower than the plan
  const named = planAt(tempRoot(), ["src/GlossaryStore.java", "src/Other.java", ...Array.from({ length: 398 }, (_, i) => `src/n${i}.java`)])
  writeFileSync(join(named, ".agent", "survey-plan.json"), readFileSync(join(named, ".agent", "survey-plan.json"), "utf8").replace('"subjects":["якорь"],"gaps"', '"subjects":["Glossary"],"gaps"'))
  const ok2 = focus.run({}, ctx(named))
  assert.equal(ok2.ok, true, ok2.why)
  assert.equal(ok2.why, "anchors")
  assert.ok(ok2.cells < 401, "narrower than the plan")
  assert.equal(typeof ok2.droppedSlices, "number")
})

// --- steps 4 and 5 read the FOCUS, and they do it in one change --------------------------------
//
// Parts are read by the plan in ONE place — buildGraph — and the cells the swarm surveys come from
// another (`cells`). Narrowing only the first would leave the second demanding a part for every cell
// of the plan and refusing "поддерево потеряно" on each one the focus dropped: the pipeline would be
// red BETWEEN the two commits. That is why this is one naryad, and these two tests are its seam.
const SPINE_PART = `<part cell="spine" kind="spine">
  <artifact name="acme" root="."/>
  <suite id="unit" kind="unit" cmd="mvn test" one="-Dtest={class}" path="src/test/java" match="*Test.java"/>
  <build cmd="mvn package"/>
  <toggles found="no"/><branching found="no"/><contract found="no"/><integrations found="no"/>
</part>`

const focusAt = (root, cells) => {
  writeFileSync(join(root, ".agent", "focus.json"), JSON.stringify({ why: "anchors", chosen: ["s1"], cells, files: 1, repoFiles: 2, estBytes: 417, slices: [] }))
  return root
}

test("cells: no .agent/focus.json is a REFUSAL, never a quiet fallback to the whole plan", () => {
  const root = planAt(tempRoot(), ["src/A.java", "src/B.java"])
  const missing = cells.run({ path: "" }, ctx(root))
  assert.equal(missing.ok, false)
  assert.match(missing.why, /шаг 3b focus не отработал/)

  // …and with a focus the swarm sees only what the focus named
  focusAt(root, ["spine", "c1"])
  const r = cells.run({ path: "" }, ctx(root))
  assert.deepEqual(r.cells.map((c) => c.id), ["spine", "c1"])
})

test("buildGraph demands a part for every cell OF THE FOCUS, and for no other", () => {
  const root = planAt(tempRoot(), ["src/A.java", "src/B.java"])
  mkdirSync(join(root, ".agent", "graph-parts"), { recursive: true })
  writeFileSync(join(root, ".agent", "graph-parts", "spine.xml"), SPINE_PART)

  // c1 is IN the focus and has no part: the subtree is lost and the step refuses, naming the cell
  focusAt(root, ["spine", "c1"])
  const lost = buildGraph.run({ path: ".agent/appgraph.xml" }, ctx(root))
  assert.equal(lost.ok, false)
  assert.match(lost.why, /клетка c1 ФОКУСА не закрыта частью/)

  // the same tree, the same missing parts — but now the focus does not name them, and their absence
  // is a decision rather than a loss. Before this change c1 and c2 were demanded here too.
  focusAt(root, ["spine"])
  const narrowed = buildGraph.run({ path: ".agent/appgraph.xml" }, ctx(root))
  assert.equal(narrowed.ok, true, narrowed.why)
  const xml = readFileSync(join(root, ".agent", "appgraph.xml"), "utf8")
  assert.match(xml, /<focus slices="s1" cells="1" of="3"/)         // the boundary is declared, not implied
})

// --- weight: "no weight" must mean "no file" ---------------------------------------------------
//
// S22. newRun carries the run's STATE into .agent/prev and leaves the ARTIFACTS alone by design (the
// test above), so `.agent/mode` from a previous run outlives today's refusal unless this function
// removes it. Step 8 reads that file and has no way to tell yesterday's weight from today's — the
// seam is proven by reintroducing the defect: drop the `drop()` calls in ext/index.mjs::weight and
// the second test below goes red while everything else stays green (docs/weight.md §4).
const FRD = (form) => `<frd grammar="1" goal="искать посылку">\n  <delta op="GET /parcels" form="${form}" node="src/ParcelResource.java" from="list()" to="list(track)"/>\n</frd>\n`
const frdAt = (root, form) => {
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, ".agent", "frd.xml"), FRD(form))
  return root
}

test("weight writes .agent/mode under context.run.cwd — one word, from the RUN's frd.xml", () => {
  const root = frdAt(tempRoot(), "Added")
  const r = weight.run({}, ctx(root))
  assert.deepEqual(r, { ok: true, mode: "minor", earned: "GET /parcels (Added)", deltas: 1 })
  assert.equal(readFileSync(join(root, ".agent", "mode"), "utf8"), "minor")   // no newline, no JSON
})

test("an Unknown delta: ok:false AND the previous run's .agent/mode is ERASED", () => {
  const root = frdAt(tempRoot(), "Unknown")
  writeFileSync(join(root, ".agent", "mode"), "major")                        // yesterday's weight
  const r = weight.run({}, ctx(root))
  assert.equal(r.ok, false)
  assert.match(r.why, /unknown-delta/)
  assert.equal(existsSync(join(root, ".agent", "mode")), false)
})

test("no .agent/frd.xml at the run root: refusal naming step 6, and no mode left behind", () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, ".agent", "mode"), "patch")
  const r = weight.run({}, ctx(root))
  assert.equal(r.ok, false)
  assert.match(r.why, /шаг 6 intake не отработал/)
  assert.equal(existsSync(join(root, ".agent", "mode")), false)
})

// --- ripple: the same rule, now for TWO files ---------------------------------------------------
//
// Step 8 writes a verdict AND the subgraph it was computed from, so "no ripple" must mean "neither
// file". The seam is the same one weight bought: drop the `drop()` in ext/index.mjs::ripple and the
// second test below goes red — step 9 would then be ordered (or skipped) on yesterday's verdict over
// a subgraph nobody computed today (docs/ripple.md §5).
const MAP = `<appgraph grammar="3" modules="2">
  <module path="src/ParcelResource.java" level="3" fanin="1" fanout="1">
    <role>REST-ресурс посылок</role>
  </module>
  <module path="src/ParcelRepo.java" level="4" fanin="1" fanout="0"/>
  <edge from="src/ParcelResource.java" to="src/ParcelRepo.java" via="private ParcelRepo repo"/>
</appgraph>`
const FRD_R = `<frd grammar="1" goal="искать посылку">
  <delta op="GET /parcels" form="Added" node="src/ParcelResource.java" from="list()" to="list(track)"/>
  <scenario id="S1" uc="UC1" before="весь реестр" after="только совпавшие" nodes="src/ParcelResource.java"/>
  <touched path="src/ParcelResource.java"/>
</frd>
`
const rippleRoot = (mode = "minor", frd = FRD_R) => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, ".agent", "appgraph.xml"), MAP)
  writeFileSync(join(root, ".agent", "frd.xml"), frd)
  if (mode) writeFileSync(join(root, ".agent", "mode"), mode)
  return root
}

test("ripple writes .agent/design and .agent/ripple.xml under context.run.cwd", () => {
  const root = rippleRoot()
  const r = ripple.run({}, ctx(root))
  assert.deepEqual(r, { ok: true, design: "needed", mode: "minor", seeds: 1, nodes: 2, total: 2 })
  assert.equal(readFileSync(join(root, ".agent", "design"), "utf8"), "needed")  // one word, no newline
  assert.match(readFileSync(join(root, ".agent", "ripple.xml"), "utf8"), /^<ripple grammar="1" mode="minor"/)
})

test("a refusal ERASES both of the previous run's artifacts, not just the verdict", () => {
  const root = rippleRoot("minor", `<frd grammar="1" goal="искать посылку"/>`)   // no delta at all
  writeFileSync(join(root, ".agent", "design"), "needed")                       // yesterday's verdict
  writeFileSync(join(root, ".agent", "ripple.xml"), "<ripple/>")                // yesterday's subgraph
  const r = ripple.run({}, ctx(root))
  assert.equal(r.ok, false)
  assert.match(r.why, /no-delta/)
  assert.equal(existsSync(join(root, ".agent", "design")), false)
  assert.equal(existsSync(join(root, ".agent", "ripple.xml")), false)
})

test("no .agent/mode at the run root: refusal naming step 7, and nothing left behind", () => {
  const root = rippleRoot(null)
  writeFileSync(join(root, ".agent", "design"), "needed")
  const r = ripple.run({}, ctx(root))
  assert.equal(r.ok, false)
  assert.match(r.why, /шаг 7 weight не отработал/)
  assert.equal(existsSync(join(root, ".agent", "design")), false)
})

// --- design: the gate erases, the SCRIPT composes, the check promotes ----------------------------
//
// Step 9's own version of the erasure rule, one layer on: the GATE (design({}) with no argument) must
// take with it everything of the step that is not green NOW — including the artifacts of the two
// passes that were DELETED while the step is rewritten. Remove the `drop` of that pair in
// ext/index.mjs::design and the first test below goes red: step 10 would then plan on a design graph
// left by a run of an older version of this pipeline.
//
// The other half is what replaced the pass: the composition of the dictionary is a SCRIPT
// (steps/design/values.mjs::valuesSkeleton), and the role only names what the script left blank.
const DESIGN_RIPPLE = `<ripple grammar="1" mode="minor" seeds="1" nodes="2">
  <module path="src/ParcelResource.java" seed="yes" level="3">
    <role>REST-ресурс посылок</role>
    <api name="GET /parcels" kind="http" scope="public" via="@GET public Set&lt;Parcel&gt; list()"/>
    <dep path="src/ParcelRepo.java"/>
  </module>
  <module path="src/ParcelRepo.java" level="4">
    <role>хранилище посылок</role>
    <decl kind="method" name="all()" sig="public Set&lt;Parcel&gt; all()"/>
  </module>
</ripple>`
const FRD_D = `<frd grammar="1" goal="искать посылку">
  <usecase id="UC1" actor="http-client" goal="найти посылку по трек-номеру">
    <post>вернён список совпавших посылок</post>
    <step n="1">клиент отправляет GET /parcels?track=…</step>
  </usecase>
  <delta op="GET /parcels" form="Added" node="src/ParcelResource.java" from="list()" to="list(track)"/>
  <scenario id="S1" uc="UC1" before="весь реестр" after="только совпавшие" nodes="src/ParcelResource.java"/>
  <touched path="src/ParcelResource.java"/>
</frd>
`
const designRoot = (flag = "needed") => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent", "staging"), { recursive: true })
  writeFileSync(join(root, ".agent", "frd.xml"), FRD_D)
  writeFileSync(join(root, ".agent", "ripple.xml"), DESIGN_RIPPLE)
  writeFileSync(join(root, ".agent", "mode"), "minor")
  if (flag) writeFileSync(join(root, ".agent", "design"), flag)
  return root
}

const stage = (root, name, text) => {
  const p = join(".agent", "staging", name)
  writeFileSync(join(root, p), text)
  return p
}

// The dictionary as the role hands it back: the skeleton with its two blanks named. Written as a
// FUNCTION of the skeleton on purpose — a fixture typed by hand would stop being the skeleton the
// moment the composition moved, and then this file would prove nothing about the run.
const named = (root) => {
  design.run({ skeleton: ".agent/staging/values-skeleton.xml" }, ctx(root))
  return readFileSync(join(root, ".agent", "staging", "values-skeleton.xml"), "utf8")
    .replace('closes="UC1/in" side="in" text=""', 'closes="UC1/in" side="in" text="GET /parcels?track=T"')
    .replace('closes="UC1/post" side="out" text=""', 'closes="UC1/post" side="out" text="Parcels(совпавшие)"')
}

test("гейт: артефакты снесённых проходов не переживают его НИКОГДА, а зелёный словарь переживает", () => {
  // skip — от шага 9 не остаётся ничего
  const skip = designRoot("skip")
  writeFileSync(join(skip, ".agent", "values.xml"), "<values/>")
  writeFileSync(join(skip, ".agent", "design-graph.xml"), "<design/>")
  writeFileSync(join(skip, ".agent", "data-flow.md"), "$START_FLOW id=\"вчера\"\n$END_FLOW\n")
  assert.deepEqual(design.run({}, ctx(skip)), { ok: true, design: "skip" })
  for (const f of ["values.xml", "design-graph.xml", "data-flow.md"]) {
    assert.equal(existsSync(join(skip, ".agent", f)), false, f)
  }

  // needed, словарь зелен СЕЙЧАС — он переиспользуется, а пара прошлой версии полосы уходит
  const both = designRoot("needed")
  writeFileSync(join(both, ".agent", "values.xml"), named(both))
  writeFileSync(join(both, ".agent", "design-graph.xml"), "<design/>")
  assert.deepEqual(design.run({}, ctx(both)).reused, ["values"])
  assert.equal(existsSync(join(both, ".agent", "values.xml")), true)
  assert.equal(existsSync(join(both, ".agent", "design-graph.xml")), false)

  // needed, словарь зелен когда-то, но не сейчас: строку из него убрали, состав перестал сходиться
  // со скелетом — гейт сносит его, и проход A пойдёт заново.
  const stale = designRoot("needed")
  writeFileSync(join(stale, ".agent", "values.xml"), named(stale).replace(/\n.*id="v3".*/, ""))
  assert.deepEqual(design.run({}, ctx(stale)).reused, [])
  assert.equal(existsSync(join(stale, ".agent", "values.xml")), false)
})

test("no .agent/design at the run root: refusal naming step 8", () => {
  const r = design.run({}, ctx(designRoot(null)))
  assert.equal(r.ok, false)
  assert.match(r.why, /шаг 8 ripple не отработал/)
})

test("скрипт составляет словарь, роль называет пустые, промоут снимает леса", () => {
  const root = designRoot()
  design.run({}, ctx(root))

  // СОСТАВ — скрипта: два конца use case и вызов узла изменения. Текст вызова списан из ряби
  // дословно, остальное — работа роли, и её объём назван числом.
  const s = design.run({ skeleton: ".agent/staging/values-skeleton.xml" }, ctx(root))
  assert.deepEqual(s, { ok: true, rows: 3, filled: 1, blank: 2 })
  const skel = readFileSync(join(root, ".agent", "staging", "values-skeleton.xml"), "utf8")
  assert.match(skel, /<value id="v1" closes="UC1\/in" side="in" text="" end="клиент отправляет GET/)
  // Операция изменения названа дельтой: она заявка требования о будущем, а не факт репозитория,
  // и её узла в ряби может не быть вовсе (D33).
  assert.match(skel, /<value id="v3" text="GET \/parcels" src="delta src\/ParcelResource.java"\/>/)
  // Объявление СОСЕДА по ряби значением не является: изменение его не меняет.
  assert.doesNotMatch(skel, /all\(\)/)

  // Незаполненный скелет — красный: строка, которую никто не назвал, это дефект, а не пустое место.
  const red = design.run({ path: stage(root, "values.xml", skel) }, ctx(root))
  assert.equal(red.ok, false)
  assert.equal(red.blockers.split("\n").length, 2)
  assert.equal(existsSync(join(root, ".agent", "values.xml")), false)

  // Заполненный — зелёный, и наружу уходит грамматика без лесов, которые читала роль.
  const green = design.run({ path: stage(root, "values.xml", named(root)) }, ctx(root))
  assert.deepEqual(green, { ok: true, values: 3 })
  const out = readFileSync(join(root, ".agent", "values.xml"), "utf8")
  assert.match(out, /^<values grammar="2">/)
  assert.equal(/side=|end=|src=|form=/.test(out), false)
  assert.match(out, /<value id="v1" text="GET \/parcels\?track=T" closes="UC1\/in"\/>/)
  assert.equal(existsSync(join(root, ".agent", "staging", "values.xml")), false)   // promote is a MOVE
})

test("роль переписала состав: строка добавлена — красный, staging остаётся уликой, промоута нет", () => {
  const root = designRoot()
  design.run({}, ctx(root))
  const p = stage(root, "values.xml", named(root).replace("</values>", '  <value id="v9" text="Parcel(track)"/>\n</values>'))

  const r = design.run({ path: p }, ctx(root))
  assert.equal(r.ok, false)
  assert.match(r.blockers, /v9/)
  assert.equal(existsSync(join(root, ".agent", "values.xml")), false)
  assert.equal(existsSync(join(root, p)), true, "красный staging остаётся уликой")
})

test("nothing written to the staging path is MISSING, not merely red", () => {
  const root = designRoot()
  design.run({}, ctx(root))
  const r = design.run({ path: ".agent/staging/values.xml" }, ctx(root))
  assert.equal(r.ok, false)
  assert.equal(r.missing, true)
  assert.match(r.blockers, /роль ничего не записала/)
})

test("izi_answer drops the number the operator addressed each answer with, on disk and in the table", async () => {
  const root = tempRoot()
  setPending.run({
    subject: "три вопроса",
    items: ["точка входа для поиска?", "лимит только к поиску?", "пустой результат?"],
  }, ctx(root))

  const r = await iziAnswer.execute("id", {
    exchange: [
      "<exchange>",
      "<question_1>точка входа для поиска?</question_1><answer_1>1 GET /fruits с параметром name</answer_1>",
      "<question_2>лимит только к поиску?</question_2><answer_2>2 только к ответам с активным поиском</answer_2>",
      "<question_3>пустой результат?</question_3><answer_3>3 пустой массив с HTTP 200</answer_3>",
      "</exchange>",
    ].join(""),
  }, null, null, { cwd: root })

  const values = answers.run({}, ctx(root)).map((a) => a.text)
  assert.deepEqual(values, ["GET /fruits с параметром name", "только к ответам с активным поиском", "пустой массив с HTTP 200"])
  assert.doesNotMatch(r.content[0].text, /→ [123] /)   // the operator sees what was actually written
})

// --- fallback: the one caller with no WorkflowRunContext at all (izi_answer) reasons the same
// way about process.cwd() as every sandbox function reasons about context.run.cwd — proven here
// on a sandbox function directly, since no context.run is the shape an absent WorkflowRunContext
// takes too.

test("no context.run.cwd falls back to process.cwd(), never to this repo's own location", () => {
  const root = tempRoot()
  writeFileSync(join(root, "TASK.md"), "cwd-fallback probe\n")
  const prevCwd = process.cwd()
  process.chdir(root)
  try {
    assert.equal(readText.run({ path: "TASK.md" }, {}), "cwd-fallback probe\n")
  } finally {
    process.chdir(prevCwd)
  }
})

// --- ENVELOPE: an err with no rail name must be rejected by the SCHEMA, not by workflow logic -----
//
// S28. Live run fcc4c120: `intake` returned {"track":"err","code":10,"subject":"Вопросы…"} with no
// `kind`. The question rail switches on env.kind === "question" (workflows/izi.js:287/:581/:709), so
// that envelope fell past every question branch and left the operator no way to answer — 193 316
// tokens and 5 role runs spent. The fix lives in workflows/izi.js's ENVELOPE literal: an `allOf`/
// `if`/`then` clause that makes track:"err" REQUIRE kind AND subject.
//
// This test lives in ext/, not workflows/, because typebox resolves from ext/node_modules — the
// pipeline itself (workflows/izi.js) runs in a host vm sandbox with no import and no node_modules of
// its own (standards/code.md, MODULE_CONTRACT at the top of izi.js).
//
// It READS the ENVELOPE literal out of workflows/izi.js instead of copying the schema, because a
// second copy of the same rule is exactly the defect standards/code.md forbids ("one rule, one
// place"): a copy can drift from what the host actually compiles. The literal is cut out by matching
// balanced braces after `const ENVELOPE = ` (skipping braces inside strings/comments) and turned into
// an object with `new Function("return " + src)()` — comments inside the literal are just source text
// to a JS parser, so they survive.
//
// It compiles that object with `Compile` from "typebox/compile" — the exact function
// pi-extensible-workflows/packages/core/src/agent-execution.ts:816 uses on outputSchema — so a pass
// here means the host's own validator would also pass, and a fail here means the host would reject
// the envelope in the role's own turn (agent-execution.ts:816-828), before the workflow logic ever
// runs.
//
// The seam: delete the `allOf` clause from ENVELOPE (or narrow `then.required` back to just `kind`)
// and the second and third branches below turn red — an err envelope missing kind, or missing
// subject, would again validate as legal.

function readEnvelopeSchema() {
  const src = readFileSync(new URL("../workflows/izi.js", import.meta.url), "utf8")
  const marker = "const ENVELOPE = "
  const markerAt = src.indexOf(marker)
  if (markerAt === -1) throw new Error("workflows/izi.js: `const ENVELOPE = ` not found")
  let i = markerAt + marker.length
  while (src[i] !== "{") i++
  const literalStart = i
  let depth = 0
  let inString = null   // one of: ' " ` while inside a string literal
  let inLineComment = false
  let inBlockComment = false
  for (; i < src.length; i++) {
    const c = src[i]
    const next = src[i + 1]
    if (inLineComment) { if (c === "\n") inLineComment = false; continue }
    if (inBlockComment) { if (c === "*" && next === "/") { inBlockComment = false; i++ } continue }
    if (inString) { if (c === "\\") { i++; continue }; if (c === inString) inString = null; continue }
    if (c === "/" && next === "/") { inLineComment = true; i++; continue }
    if (c === "/" && next === "*") { inBlockComment = true; i++; continue }
    if (c === '"' || c === "'" || c === "`") { inString = c; continue }
    if (c === "{") depth++
    else if (c === "}") { depth--; if (depth === 0) { i++; break } }
  }
  const literal = src.slice(literalStart, i)
  return new Function("return " + literal)()
}

test("ENVELOPE: track:ok with an artifact validates", () => {
  const schema = Compile(readEnvelopeSchema())
  assert.equal(schema.Check({ track: "ok", artifact: ".agent/brd.md" }), true)
})

test("ENVELOPE: track:err with subject but no kind — the fcc4c120 shape — is REJECTED", () => {
  const schema = Compile(readEnvelopeSchema())
  assert.equal(schema.Check({ track: "err", subject: "Вопросы по архитектуре:\n1. …" }), false)
})

test("ENVELOPE: track:err with kind but no subject is REJECTED", () => {
  const schema = Compile(readEnvelopeSchema())
  assert.equal(schema.Check({ track: "err", kind: "question" }), false)
})

test("ENVELOPE: track:err with both kind and subject validates", () => {
  const schema = Compile(readEnvelopeSchema())
  assert.equal(schema.Check({ track: "err", kind: "question", subject: "Вопросы по архитектуре:\n1. …" }), true)
})

// --- plan: the question is a rail, and a refusal erases -------------------------------------------
//
// Step 10 is the first SCRIPT step with an operator, so it has two io halves nothing else has: an
// `ask` that is not a refusal (the question travels verbatim, and the caller re-asks it), and the
// same erasure rule as the weight and the ripple. Remove the `drop()` in ext/index.mjs::plan and the
// second test below goes red — the gate at step 12 would then approve a plan computed for a change
// that no longer exists.
//
// The GREEN path is not unit-tested here: it needs a real git repository for the trunk, and this is
// an io module — a live run proves it (standards/code.md, the four kinds of module).
const planRoot = (mode = "minor") => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, ".agent", "appgraph.xml"), MAP)
  writeFileSync(join(root, ".agent", "frd.xml"), FRD_R)
  if (mode) writeFileSync(join(root, ".agent", "mode"), mode)
  return root
}

// R-shippable, io-половина. Зелёный путь `plan` юнитом не берётся — ему нужен настоящий git-репозиторий
// для транка (см. соседний блок), поэтому шов здесь на ИСТОЧНИК, тем же приёмом, что ENVELOPE и
// $START_BLAME: хост обязан ПОСЧИТАТЬ юниты из design-graph и передать их в ядро. Верни `new Map()` —
// и тикет снова приедет без определения готовности, ровно как в прогоне d8ef8c60, где команда узла
// была зелена до начала работы.
test("plan: хост считает dod из design-graph и передаёт его в ядро", () => {
  const src = readFileSync(new URL("./index.mjs", import.meta.url), "utf8")
  assert.match(src, /units: designXml \? unitsByPath\(parseDesign\(designXml\), parseRoutes\(designXml\)\) : new Map\(\)/)
  assert.match(src, /import \{[^}]*unitsByPath[^}]*\} from "\.\.\/steps\/design\/design\.mjs"/)
})

test("plan asks for the task key VERBATIM, and asking is not a refusal of the step", () => {
  const root = planRoot()
  const r = plan.run({}, ctx(root))
  assert.equal(r.ok, false)
  assert.equal(r.ask, true, "the question rail, not a blocked run")
  assert.equal(r.subject, KEY_QUESTION, "byte-stable: the answer written against it is recognised next call")
})

test("a refusal erases yesterday's plan-index.json", () => {
  const root = planRoot(null)                                        // no weight — step 7 never ran
  writeFileSync(join(root, ".agent", "plan-index.json"), '{"grammar":1}')   // yesterday's plan
  const r = plan.run({}, ctx(root))
  assert.equal(r.ok, false)
  assert.match(r.why, /шаг 7 weight не отработал/)
  assert.equal(existsSync(join(root, ".agent", "plan-index.json")), false)
})

// --- review (step 11) ------------------------------------------------------------------------
// The io seam of the slice: the verdict is DATA, so a green FORM promotes the file in BOTH branches
// — a Reject's blockers are what the band repairs from — while a MALFORMED verdict promotes nothing
// and leaves no stale artifact behind. Remove the rmSync at the top of review.run and the third test
// goes red: yesterday's Pass would sit on disk while today's plan was never judged.
const reviewRoot = (verdict) => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent", "staging"), { recursive: true })
  writeFileSync(join(root, ".agent", "frd.xml"), FRD_R)
  writeFileSync(join(root, ".agent", "plan-index.json"), JSON.stringify({
    grammar: 1,
    order: ["src/ParcelResource.java"],
    nodes: [{ id: "src/ParcelResource.java", kind: "code", delta: ["GET /parcels (Added)"], deps: [], check: [{ suite: "unit", cmd: "mvn test" }], coveredBy: ["scenario:S1"] }],
  }))
  writeFileSync(join(root, ".agent", "staging", "review.xml"), verdict)
  return root
}

test("review promotes a Pass and returns the verdict", () => {
  // grammar 2 (D21): a Pass now has to CLOSE the checklist — this FRD owes exactly one row, S1.
  const root = reviewRoot('<review verdict="Pass" grammar="2"><covers item="S1" node="src/ParcelResource.java"/></review>')
  const r = review.run({ path: ".agent/staging/review.xml" }, ctx(root))
  assert.equal(r.ok, true, r.ok ? "" : r.blockers)
  assert.equal(r.verdict, "Pass")
  assert.equal(existsSync(join(root, ".agent", "review.xml")), true)
  assert.equal(existsSync(join(root, ".agent", "staging", "review.xml")), false, "promoted, not copied")
})

test("review promotes a Reject too, and hands back the owner of each blocker", () => {
  const root = reviewRoot('<review verdict="Reject" grammar="2"><blocker code="goal-not-delivered" node="src/ParcelResource.java" evidence="S1">поиск не выполняется ни одним узлом</blocker></review>')
  const r = review.run({ path: ".agent/staging/review.xml" }, ctx(root))
  assert.equal(r.ok, true, r.ok ? "" : r.blockers)
  assert.equal(r.verdict, "Reject")
  assert.deepEqual(r.findings.map((f) => [f.code, f.culprit, f.owner]), [["goal-not-delivered", "frd.xml", 6]])
  assert.equal(existsSync(join(root, ".agent", "review.xml")), true, "the operator and the repair rail both read the blockers")
})

// The findings schema carries `note` (П2) — a function of the code, "" for every owner but `operator`
// (goal-not-delivered has none). The host's OWN validator is the judge here, the same device the
// budgets schema test above uses: a key present in the runtime shape but missing from `required`/
// `properties` is how a live run silently drops a field the caller (band()) depends on.
test("review output schema: findings carry `note`, and the host's own validator accepts the shape", () => {
  const root = reviewRoot('<review verdict="Reject" grammar="2"><blocker code="goal-not-delivered" node="src/ParcelResource.java" evidence="S1">поиск не выполняется ни одним узлом</blocker></review>')
  const r = review.run({ path: ".agent/staging/review.xml" }, ctx(root))
  assert.equal(r.ok, true, r.ok ? "" : r.blockers)
  assert.equal(r.findings[0].note, "", "goal-not-delivered carries no OPERATOR_NOTE — band() never reads this row's note")
  const validate = Compile(review.output)
  assert.equal(validate.Check(r), true, JSON.stringify(r))
})

// autoFindings (open-question) is a SEPARATE mapping from newReview's blockers (ext/index.mjs::review,
// "const auto = …") — a `note` added to one and not the other still validates as long as no test
// exercises the missing side. This is that side.
test("review output schema: an autoFindings open-question finding also carries `note`", () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent", "staging"), { recursive: true })
  writeFileSync(join(root, ".agent", "frd.xml"), `<frd grammar="1" goal="искать посылку">
  <delta op="GET /parcels" form="Added" node="src/ParcelResource.java" from="list()" to="list(track)"/>
  <scenario id="S1" uc="UC1" before="весь реестр" after="только совпавшие" nodes="src/ParcelResource.java"/>
  <touched path="src/ParcelResource.java"/>
  <question subject="track-format" why="формат трек-номера не определён"/>
</frd>
`)
  writeFileSync(join(root, ".agent", "plan-index.json"), JSON.stringify({
    grammar: 1,
    order: ["src/ParcelResource.java"],
    nodes: [{ id: "src/ParcelResource.java", kind: "code", delta: ["GET /parcels (Added)"], deps: [], check: [{ suite: "unit", cmd: "mvn test" }], coveredBy: ["scenario:S1"] }],
  }))
  writeFileSync(join(root, ".agent", "staging", "review.xml"),
    '<review verdict="Pass" grammar="2"><covers item="S1" node="src/ParcelResource.java"/></review>')

  const r = review.run({ path: ".agent/staging/review.xml" }, ctx(root))
  assert.equal(r.ok, true, r.ok ? "" : r.blockers)
  assert.equal(r.verdict, "Reject", "an unanswered <question> reaching the plan turns the RESULT to Reject regardless of the role's own Pass")
  const q = r.findings.find((f) => f.code === "open-question")
  assert.ok(q, JSON.stringify(r.findings))
  assert.equal(q.note, "", "open-question's owner is step 6, not operator — OPERATOR_NOTE has no row for it")
  const validate = Compile(review.output)
  assert.equal(validate.Check(r), true, JSON.stringify(r))
})

test("a malformed verdict promotes nothing and erases yesterday's review", () => {
  const root = reviewRoot('<review verdict="Reject" grammar="2"><blocker code="made-up" node="src/ParcelResource.java" evidence="S1">x</blocker></review>')
  writeFileSync(join(root, ".agent", "review.xml"), '<review verdict="Pass" grammar="1"/>')   // yesterday's
  const r = review.run({ path: ".agent/staging/review.xml" }, ctx(root))
  assert.equal(r.ok, false)
  assert.match(r.blockers, /R2 /)
  assert.equal(existsSync(join(root, ".agent", "review.xml")), false, "a stale Pass must not survive today's run")
})

test("review names the step that did not run instead of reading an absent artifact", () => {
  const root = reviewRoot('<review verdict="Pass" grammar="1"/>')
  rmSync(join(root, ".agent", "plan-index.json"))
  assert.match(review.run({ path: ".agent/staging/review.xml" }, ctx(root)).blockers, /шаг 10 plan не отработал/)
})

// --- D10: the phase of step 9 is ONE pass while the step is rewritten ----------------------------
//
// `workflows/` is covered by no test of its own — it runs in a host vm sandbox with no imports — so
// the only seam available for its structure is the one the ENVELOPE test above already uses: read the
// source and hold it to what the pass requires.
const IZI = readFileSync(new URL("../workflows/izi.js", import.meta.url), "utf8")

//
// Passes B and C were deleted, so the ladder of three is gone with them. What is asserted here is the
// shape that replaced it and the two facts a live run cannot recover from being wrong about: the
// phase is handed WHERE THE BAND STARTED (a rewind to step 6 must not reuse a dictionary extracted
// from the previous FRD), and the band STOPS after the pass instead of walking into step 10 with no
// design at all — step 10 accepts a missing design as legal input, so nothing below would refuse.
test("the band hands the design phase where it STARTED, and the phase re-runs pass A on a rewind", () => {
  assert.match(IZI, /await designing\(from\)/)
  assert.match(IZI, /if \(from > 6 && \(gate\.reused \|\| \[\]\)\.includes\("values"\)\)/)
})

test("проход A — одна роль, один наряд, и имя роли то, которое pi резолвит по ФАЙЛУ", () => {
  assert.match(IZI, /role: "valuer"/)
  assert.equal(existsSync(new URL("../steps/design/valuer.md", import.meta.url).pathname), true)
  assert.equal(existsSync(new URL("../steps/design/order-values.tpl", import.meta.url).pathname), true)
  // Роли и наряды снесённых проходов не лежат там, где их найдёт pi: они уехали в архив.
  for (const gone of ["designer.md", "router.md", "order-nodes.tpl", "order-routes.tpl", "order.tpl"]) {
    assert.equal(existsSync(new URL(`../steps/design/${gone}`, import.meta.url).pathname), false, gone)
  }
})

test("полоса ОСТАНАВЛИВАЕТСЯ после прохода A, а не идёт в шаг 10 без дизайна", () => {
  // Шаг 10 принимает отсутствующий дизайн как законный вход (steps/plan/plan.mjs) — значит молча
  // построит план с пустым dod на каждом узле. Остановка объявлена здесь и нигде больше.
  assert.match(IZI, /const made = await designing\(from\);/)
  assert.match(IZI, /if \(made !== "\.agent\/design"\) \{\n\s+exit\(err\("blocked"/)
  // …и `skip` шага 8 — другой случай: там дизайна нет по решению, и полоса идёт дальше.
  assert.match(IZI, /return "\.agent\/design"; \/\/ the flag file IS the receipt of the skip/)
})

// Наряд прохода A несёт СКЕЛЕТ и файл прошлой попытки. `prompt()` требует точного двустороннего
// совпадения ключей, поэтому `{SKELETON}` в шаблоне без ключа здесь бросает НА ЗАПУСКЕ — после
// гейта и после расчёта скелета. Шов — grep, и стоит он миллисекунду.
test("наряд прохода A несёт скелет, число пустых строк и файл прошлой попытки", () => {
  assert.match(IZI, /FRD, SKELETON, PREVIOUS, BLANK: String\(s\.blank\), FEEDBACK: feedback/)
  assert.match(IZI, /\(none — first attempt\)/)
})

// BUG_FIX_CONTEXT: живой прогон 4cfdbf54 (форма eddi). Наряд прохода A нёс в CONSTRAINTS пример
// формы значения — `POST /loans/{id}/renew`, — и `prompt()` прочитал `{id}` как ПОДСТАНОВКУ: он
// требует двустороннего совпадения ключей и бросил `Missing prompt value "id"`. Крах пришёл ПОСЛЕ
// гейта, ряби и посчитанного скелета, то есть за миллисекунду до вызова роли и без единого артефакта.
// Проверка стоит миллисекунду и держит обе стороны сразу: каждая фигурная скобка шаблона — ключ,
// который воркфлоу передаёт, и каждый ключ — скобка в шаблоне.
test("плейсхолдеры наряда прохода A и ключи, которые ему передают, — одно множество", () => {
  const tpl = readFileSync(new URL("../steps/design/order-values.tpl", import.meta.url), "utf8")
  const inTpl = [...new Set([...tpl.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1]))].sort()
  const call = IZI.slice(IZI.indexOf('const o = sized("design/values"'), IZI.indexOf("if (o.over)"))
  // Ключ — то, что стоит ПОСЛЕ разделителя объекта: иначе `STAGING: VALUES_STAGING` читается как два.
  // Хвостовой разделитель — заглядыванием: иначе съеденная запятая крадёт следующий ключ.
  const inCall = [...new Set([...call.matchAll(/[{,]\s*([A-Z][A-Z_]*)\s*(?=[,:])/g)].map((m) => m[1]))].sort()
  assert.deepEqual(inTpl, inCall)
})

test("the valuer returns a count, so the envelope carries it — additionalProperties is false", () => {
  assert.match(IZI, /values: \{ type: "number" \}/)
})

// и она ответила `<witness cmd="mvn verify -Pnative"/>` для HTML-страницы — команда машинную сверку
// проходит (она у закрывающего сценария) и страницу не открывает. Убери `dod` из строки — красный.
test("reviewForm: строка {UNCHECKED} несёт юниты узла, а не один его id", () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, ".agent", "frd.xml"), FRD_R)
  writeFileSync(join(root, ".agent", "plan-index.json"), JSON.stringify({
    grammar: 2,
    order: ["src/page.html", "scenario:S1"],
    nodes: [
      { id: "src/page.html", kind: "code", delta: [], why: "вызов и карточка", dod: ["клик -> GET /x", "200 -> карточка"], deps: [], check: [], coveredBy: ["scenario:S1"] },
      { id: "scenario:S1", kind: "scenario", scenario: "S1", deps: [], check: [{ suite: "unit", cmd: "mvn test" }], coveredBy: [] },
    ],
  }))
  const f = reviewForm.run({}, ctx(root))
  assert.match(f.unchecked, /src\/page\.html — своей команды нет; закрывают: mvn test/)
  assert.match(f.unchecked, /делает:/)
  assert.match(f.unchecked, /1\. клик -> GET \/x/)
  assert.match(f.unchecked, /2\. 200 -> карточка/)
})

// --- D23: гейт шага 6 — узел изменения, которого не исполняет ни один сьют ------------------------
//
// io трёх рельс. Вопрос ОПЕРАТОРУ (роли здесь нет: артефакт зелёный, сьюта нет у РЕПОЗИТОРИЯ),
// остановка на `suite`/`drop` и проход на `accept`. Жёсткое условие проверяется отдельно: на КРАСНОМ
// checkFrd гейт молчит — иначе оператора спрашивают про артефакт, который роль ещё перепишет.
const GATE_MAP = `<appgraph grammar="4" modules="4">
  <suite id="unit" kind="unit" cmd="mvn test" one="-Dtest={class}" path="src/test" match="*Test.java"/>
  <module path="src/CardResource.java" kind="rest">
    <api name="GET /card"/>
    <test path="src/test/CardResourceTest.java" suite="unit"/>
  </module>
  <module path="src/card.html"/>
  <module path="src/test/CardResourceTest.java" kind="test" suite="unit"/>
  <edge from="src/test/CardResourceTest.java" to="src/CardResource.java" via=".when().get(&quot;/card&quot;)" by="use"/>
  <edge from="src/card.html" to="src/CardResource.java" via="url: '/card'" by="use"/>
</appgraph>`
const GATE_FRD = (goal = "карточка по имени") => `<frd grammar="1" goal="${goal}">
  <usecase id="UC1" actor="user" goal="увидеть карточку">
    <post>карточка отображена</post>
    <step n="1">пользователь открывает карточку</step>
  </usecase>
  <failures found="no" why="изменение не вводит кодов отказа"/>
  <delta op="GET /card" form="Added" node="src/CardResource.java"/>
  <scenario id="S1" uc="UC1" before="карточки нет" after="карточка есть" nodes="src/card.html src/CardResource.java"/>
  <touched path="src/card.html" why="страница показывает карточку"/>
</frd>`
const gateRoot = (frd = GATE_FRD()) => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent", "staging"), { recursive: true })
  writeFileSync(join(root, ".agent", "appgraph.xml"), GATE_MAP)
  writeFileSync(join(root, ".agent", "staging", "frd.xml"), frd)
  return root
}
// Ответ пишется тем же путём, каким его пишет izi_answer — через формат core/answers.mjs.
const answerOnDisk = (root, question, text) =>
  writeFileSync(join(root, ".agent", "answers.md"), newExchange([{ n: 1, question, text }]).value)

test("шов 8: гейт шага 6 — ask без ответа, стоп на suite/drop, проход на accept", () => {
  const root = gateRoot()
  const asked = `${BLIND_STEM("src/card.html")}${BLIND_TAIL}`
  // Хост валидирует ВЫХОД: поле, которого нет в схеме, роняет прогон на «Invalid output from
  // checkFrd» — тот же класс, что дважды стоил прогона на `budgets`. Проверяется каждая рельса.
  const schema = Compile(checkFrd.output)
  const valid = (out) => { assert.equal(schema.Check(out), true, JSON.stringify(out)); return out }

  // 1. Ответа нет: рельса ОПЕРАТОРА. FRD не промотирован — промоушен делает workflow после гейта.
  const ask = valid(checkFrd.run({ path: ".agent/staging/frd.xml" }, ctx(root)))
  assert.equal(ask.ok, false)
  assert.equal(ask.ask, true)
  assert.deepEqual(ask.items, [asked])
  assert.equal(ask.subject, asked)
  assert.match(ask.why, /src\/card\.html/)
  assert.equal(ask.blockers, undefined, "это не блокер формы: роль на этом не пере-делегируют")
  assert.equal(existsSync(join(root, ".agent", "frd.xml")), false)

  // 2. `suite` — полоса встаёт, и это НЕ вопрос и НЕ блокер роли: чинит человек.
  answerOnDisk(root, asked, "suite")
  const stop = valid(checkFrd.run({ path: ".agent/staging/frd.xml" }, ctx(root)))
  assert.equal(stop.ok, false)
  assert.equal(stop.stop, true)
  assert.equal(stop.ask, undefined)
  assert.match(stop.why, /заведи сьют, исполняющий src\/card\.html/)

  // 3. `drop` — та же остановка, другой честный выход: правится TASK.md/BRD, не FRD.
  answerOnDisk(root, asked, "drop")
  const drop = valid(checkFrd.run({ path: ".agent/staging/frd.xml" }, ctx(root)))
  assert.equal(drop.stop, true)
  assert.match(drop.why, /TASK\.md\/BRD \(НЕ FRD\)/)

  // 4. `accept` — полоса идёт дальше, и число принятых узлов названо.
  answerOnDisk(root, asked, "accept")
  const green = valid(checkFrd.run({ path: ".agent/staging/frd.xml" }, ctx(root)))
  assert.equal(green.ok, true, green.ok ? "" : green.blockers || green.why)
  assert.equal(green.waived, 1)
  assert.equal(green.ask, undefined)

  // 5. Ответ вне словаря — пере-спрос с ПРИЧИНОЙ: текст новый, значит пауза придёт.
  answerOnDisk(root, asked, "ну ладно")
  const again = valid(checkFrd.run({ path: ".agent/staging/frd.xml" }, ctx(root)))
  assert.equal(again.ask, true)
  assert.notEqual(again.items[0], asked)
  assert.match(again.items[0], /ну ладно/)
})

test("гейт срабатывает ТОЛЬКО после зелёного checkFrd: на красной проверке вопроса нет", () => {
  // Тот же слепой узел, но артефакт красный по F-правилу: узла `src/invented.java` карта не знает.
  const broken = GATE_FRD().replace('nodes="src/card.html src/CardResource.java"', 'nodes="src/card.html src/invented.java"')
  const root = gateRoot(broken)
  const r = checkFrd.run({ path: ".agent/staging/frd.xml" }, ctx(root))
  assert.equal(r.ok, false)
  assert.ok(r.blockers, "красная проверка возвращает блокеры роли")
  assert.equal(r.ask, undefined, "оператора не спрашивают про артефакт, который роль ещё перепишет")
  assert.equal(r.stop, undefined)

  // Ровно та же красная проверка при ответе `accept` на диске остаётся рельсой РОЛИ.
  answerOnDisk(root, `${BLIND_STEM("src/card.html")}${BLIND_TAIL}`, "accept")
  const still = checkFrd.run({ path: ".agent/staging/frd.xml" }, ctx(root))
  assert.equal(still.ok, false)
  assert.ok(still.blockers)
  assert.equal(still.waived, undefined)
})

test("шов 9: {UNCHECKED} спрашивает про узел, а про два множества, о которых не спрашивают, говорит", () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, ".agent", "frd.xml"), FRD_R)
  writeFileSync(join(root, ".agent", "plan-index.json"), JSON.stringify({
    grammar: 2,
    order: ["src/page.html", "src/card.html", "scenario:S1"],
    nodes: [
      { id: "src/page.html", kind: "code", new: false, delta: [], dod: ["клик -> GET /x"], deps: [], check: [], coveredBy: ["scenario:S1"] },
      { id: "src/card.html", kind: "code", new: true, delta: ["GET /card (Added)"], dod: [], deps: [], check: [], coveredBy: ["scenario:S1"] },
      { id: "scenario:S1", kind: "scenario", scenario: "S1", deps: [], check: [{ suite: "unit", cmd: "mvn test" }], coveredBy: [] },
    ],
  }))

  // Создаваемый узел спрошенным не бывает: до него не может доходить ни одна команда карты — карта
  // старше файла (steps/review/review.mjs::askedNodes). Но и молча пропасть он не может: строка
  // наряда называет его ФАКТОМ шага 16, иначе пропажа читается как недосмотр и роль чинит её сама.
  const before = reviewForm.run({}, ctx(root))
  assert.match(before.unchecked, /src\/page\.html — своей команды нет/)
  assert.equal(/src\/card\.html — своей команды нет/.test(before.unchecked), false)
  assert.match(before.unchecked, /эти узлы изменение СОЗДАЁТ.*шаг 16.*Блокер unverifiable-node на них не пишется: src\/card\.html/)
  assert.equal(/принята оператором/.test(before.unchecked), false)

  // Узел с `accept` — тоже, и вместо него одна строка про решение оператора: строка чек-листа,
  // которую правило не посчитает, тратит внимание роли впустую.
  answerOnDisk(root, `${BLIND_STEM("src/page.html")}${BLIND_TAIL}`, "accept")
  const after = reviewForm.run({}, ctx(root))
  assert.equal(/src\/page\.html — своей команды нет/.test(after.unchecked), false)
  assert.match(after.unchecked, /неверифицируемость этих узлов принята оператором на шаге 6: src\/page\.html/)
})

// --- D23-11: наряд и правило спрашивают ОДНО множество (главный io-шов) ---------------------------
//
// Форма quarkus-rest-json-app-v2-t3, три артефакта её прогона c6bc2e54 ДОСЛОВНО. Роль здесь не
// зовётся: её ответ СОБИРАЕТСЯ из выхода reviewForm — `<covers>` на каждую строку {OWED} и
// `<witness>` на каждую строку {UNCHECKED}, то есть ровно то, о чём наряд спросил, и ничего сверх.
// Такой ответ обязан пройти review({path}) целиком. D23 давал на нём
// `R6 узел …/fruit-card.html без своей команды`: множество «о чём спрашивают» было записано дважды,
// и наряд перестал называть создаваемый узел раньше, чем правило перестало его судить.
const T3_LIST = "src/main/resources/META-INF/resources/fruits.html"
const T3_CARD = "src/main/resources/META-INF/resources/fruit-card.html"
const T3_PLAN = `{
  "grammar": 1,
  "mode": "minor",
  "branch": {
    "task": "IZI-3",
    "name": "feature/IZI-3",
    "base": "main",
    "source": "operator-answer"
  },
  "gaps": [
    "toggle",
    "spec"
  ],
  "order": [
    "src/main/java/org/acme/rest/json/FruitResource.java",
    "src/main/resources/META-INF/resources/fruits.html",
    "src/main/resources/META-INF/resources/fruit-card.html",
    "scenario:S2",
    "scenario:S3"
  ],
  "nodes": [
    {
      "id": "src/main/java/org/acme/rest/json/FruitResource.java",
      "kind": "code",
      "new": false,
      "delta": [
        "GET /fruits/{id} (Added)"
      ],
      "deps": [],
      "check": [
        {
          "suite": "unit",
          "cmd": "mvn test -Dtest=FruitResourceTest"
        },
        {
          "suite": "component-native",
          "cmd": "mvn verify -Pnative -Dit.test=FruitResourceIT"
        }
      ],
      "coveredBy": [
        "scenario:S3"
      ]
    },
    {
      "id": "src/main/resources/META-INF/resources/fruits.html",
      "kind": "code",
      "new": false,
      "delta": [
        "list-page navigation (Added)"
      ],
      "deps": [
        "src/main/java/org/acme/rest/json/FruitResource.java"
      ],
      "check": [],
      "coveredBy": [
        "scenario:S2"
      ]
    },
    {
      "id": "src/main/resources/META-INF/resources/fruit-card.html",
      "kind": "code",
      "new": true,
      "delta": [
        "GET /fruit-card.html (Added)"
      ],
      "deps": [
        "src/main/java/org/acme/rest/json/FruitResource.java"
      ],
      "check": [],
      "coveredBy": [
        "scenario:S3"
      ]
    },
    {
      "id": "scenario:S2",
      "kind": "scenario",
      "scenario": "S2",
      "deps": [
        "src/main/resources/META-INF/resources/fruits.html"
      ],
      "check": [
        {
          "suite": "unit",
          "cmd": "mvn test"
        },
        {
          "suite": "component-native",
          "cmd": "mvn verify -Pnative"
        }
      ],
      "coveredBy": []
    },
    {
      "id": "scenario:S3",
      "kind": "scenario",
      "scenario": "S3",
      "deps": [
        "src/main/resources/META-INF/resources/fruit-card.html",
        "src/main/java/org/acme/rest/json/FruitResource.java"
      ],
      "check": [
        {
          "suite": "unit",
          "cmd": "mvn test"
        },
        {
          "suite": "component-native",
          "cmd": "mvn verify -Pnative"
        }
      ],
      "coveredBy": []
    }
  ]
}
`
const T3_FRD = `<frd grammar="1" goal="отдельная страница карточки фрукта со своим адресом, отображающая имя и описание">
  <actor name="browser" kind="human" via="HTTP GET /fruit-card.html, GET /fruits/{id}"/>
  <actor name="list-page" kind="system" via="HTML navigation link in fruits.html"/>

  <usecase id="UC1" actor="browser" goal="получить данные одного фрукта по идентификатору">
    <pre>фрукт с таким name существует в коллекции</pre>
    <post>вернётся JSON с полями name и description одного фрукта, HTTP 200</post>
    <step n="1">клиент отправляет GET /fruits/{id}, где {id} — имя фрукта</step>
    <step n="2">FruitResource находит фрукт по name в коллекции</step>
    <step n="3">FruitResource возвращает JSON {name, description} со статусом 200</step>
    <ext id="2a" error="FRUIT_NOT_FOUND" outcome="фрукт с таким name не найден — HTTP 404"/>
  </usecase>

  <usecase id="UC2" actor="browser" goal="перейти на карточку фрукта из списка">
    <pre>пользователь видит страницу списка фруктов (fruits.html)</pre>
    <post>клик по имени фрукта открывает страницу карточки /fruit-card.html с параметром id</post>
    <step n="1">fruits.html рендерит список фруктов, каждое имя — ссылка &lt;a&gt;</step>
    <step n="2">ссылка ведёт на /fruit-card.html?id=&lt;fruitName&gt;</step>
    <step n="3">браузер открывает страницу fruit-card.html</step>
  </usecase>

  <usecase id="UC3" actor="browser" goal="отобразить карточку фрукта">
    <pre>пользователь открыл /fruit-card.html?id=&lt;fruitName&gt;</pre>
    <post>на странице отображены name и description фрукта</post>
    <step n="1">fruit-card.html считывает параметр id из URL</step>
    <step n="2">страница отправляет GET /fruits/{id}</step>
    <step n="3">при получении ответа страница отображает name и description</step>
    <ext id="2a" error="FRUIT_NOT_FOUND" outcome="GET вернул 404 — страница показывает сообщение об отсутствии фрукта"/>
  </usecase>

  <field name="id" in="GET /fruits/{id}" type="string" domain="any fruit name present in collection" required="yes" error="FRUIT_NOT_FOUND" source="answers.md"/>

  <failure code="FRUIT_NOT_FOUND" status="404" client="отобразить сообщение об отсутствии" operator="—" from="UC1/2a,UC3/2a"/>

  <delta op="GET /fruits/{id}" form="Added" node="src/main/java/org/acme/rest/json/FruitResource.java" from="endpoint отсутствует" to="endpoint возвращает Fruit по name (200) или 404"/>
  <delta op="GET /fruit-card.html" form="Added" node="src/main/resources/META-INF/resources/fruit-card.html" new="yes"/>
  <delta op="list-page navigation" form="Added" node="src/main/resources/META-INF/resources/fruits.html" from="имя фрукта не кликабельно" to="имя фрукта — ссылка &lt;a href=&quot;/fruit-card.html?id={name}&quot;&gt;"/>

  <scenario id="S1" uc="UC1" before="GET /fruits/{id} не существует — сервер возвращает 404 для любого path-параметра" after="GET /fruits/{id} возвращает JSON с name и description фрукта или 404 при отсутствии" nodes="src/main/java/org/acme/rest/json/FruitResource.java"/>
  <scenario id="S2" uc="UC2" before="fruits.html не содержит ссылок на карточку фрукта" after="имя каждого фрукта в списке — кликабельная ссылка на /fruit-card.html?id={name}" nodes="src/main/resources/META-INF/resources/fruits.html"/>
  <scenario id="S3" uc="UC3" before="файл fruit-card.html не существует, адрес /fruit-card.html недоступен" after="fruit-card.html загружает фрукт по GET /fruits/{id} и отображает name и description" nodes="src/main/resources/META-INF/resources/fruit-card.html src/main/java/org/acme/rest/json/FruitResource.java"/>

  <touched path="src/main/java/org/acme/rest/json/FruitResource.java" why="добавлен метод findByName() с @PathParam для GET /fruits/{id}"/>
  <touched path="src/main/resources/META-INF/resources/fruits.html" why="имя фрукта в списке обёрнуто в &lt;a&gt; со ссылкой на карточку"/>
  <touched path="src/main/resources/META-INF/resources/fruit-card.html" why="новый HTML-файл страницы карточки, загружающий данные по GET /fruits/{id}"/>

  <nfr subject="existing-contracts" fit="format ответа существующих endpoints unchanged" source="brd.md"/>
</frd>
`
const T3_MAP = `<appgraph grammar="3" modules="17" components="2" isolated="7" levels="4">
  <artifact name="rest-json-quickstart" root="."/>
  <suite id="unit" kind="unit" cmd="mvn test" one="-Dtest={class}" path="src/test/java" match="*Test.java"/>
  <suite id="component-native" kind="component" cmd="mvn verify -Pnative" one="-Dit.test={class}" path="src/test/java" match="*IT.java"/>
  <build cmd="mvn package"/>
  <toggles found="no"/>
  <branching found="no"/>
  <contract found="no"/>
  <lang id="(unknown)" files="10" edges="no-rules" routes="no-rules" decls="no-rules"/>
  <lang id="java" files="9" edges="yes" routes="yes" decls="class,interface,enum,record,method,field"/>
  <subject name="fruit"/>
  <subject name="card" found="no"/>
  <subject name="page"/>
  <subject name="list"/>
  <subject name="link"/>
  <component id="c1" modules="5" heads="src/main/resources/META-INF/resources/fruits.html src/test/java/org/acme/rest/json/FruitResourceIT.java"/>
  <component id="c2" modules="5" heads="src/main/resources/META-INF/resources/legumes.html src/test/java/org/acme/rest/json/LegumeResourceIT.java"/>
  <module path=".github/modernize/java-upgrade/hooks/scripts/recordToolUse.ps1" level="1" fanin="0" fanout="0">
    <role>PowerShell hook script recording tool use events for java-upgrade extension</role>
  </module>
  <module path=".github/modernize/java-upgrade/hooks/scripts/recordToolUse.sh" level="1" fanin="0" fanout="0">
    <role>Bash hook script recording tool use events for java-upgrade extension</role>
  </module>
  <module path="src/main/docker/Dockerfile.jvm" level="1" fanin="0" fanout="0">
    <role>Dockerfile for JVM-mode container image of Quarkus application</role>
  </module>
  <module path="src/main/docker/Dockerfile.legacy-jar" level="1" fanin="0" fanout="0">
    <role>Dockerfile for legacy JAR-mode container image of Quarkus application</role>
  </module>
  <module path="src/main/docker/Dockerfile.native" level="1" fanin="0" fanout="0">
    <role>Dockerfile for native-mode container image of Quarkus application</role>
  </module>
  <module path="src/main/docker/Dockerfile.native-micro" level="1" fanin="0" fanout="0">
    <role>Dockerfile for native micro-base container image of Quarkus application</role>
  </module>
  <module path="src/main/java/org/acme/rest/json/Fruit.java" pkg="org.acme.rest.json" component="c1" level="4" fanin="1" fanout="0">
    <role>POJO class representing a fruit entity</role>
    <decl kind="class" name="Fruit" sig="public class Fruit"/>
    <decl kind="method" name="Fruit()" sig="public Fruit()"/>
    <decl kind="method" name="Fruit(String name, String description)" sig="public Fruit(String name, String description)"/>
    <decl kind="field" name="name" sig="public String name"/>
    <decl kind="field" name="description" sig="public String description"/>
  </module>
  <module path="src/main/java/org/acme/rest/json/FruitResource.java" pkg="org.acme.rest.json" component="c1" level="3" fanin="2" fanout="1">
    <role>JAX-RS REST resource managing in-memory fruit collection</role>
    <api name="DELETE /fruits" kind="http" scope="public" via="@DELETE public Set&lt;Fruit&gt; delete(Fruit fruit)"/>
    <api name="GET /fruits" kind="http" scope="public" via="@GET public Set&lt;Fruit&gt; list()"/>
    <api name="POST /fruits" kind="http" scope="public" via="@POST public Set&lt;Fruit&gt; add(Fruit fruit)"/>
    <decl kind="class" name="FruitResource" sig="public class FruitResource"/>
    <decl kind="method" name="FruitResource()" sig="public FruitResource()"/>
    <decl kind="method" name="list()" sig="public Set&lt;Fruit&gt; list()"/>
    <decl kind="method" name="add(Fruit fruit)" sig="public Set&lt;Fruit&gt; add(Fruit fruit)"/>
    <decl kind="method" name="delete(Fruit fruit)" sig="public Set&lt;Fruit&gt; delete(Fruit fruit)"/>
    <test path="src/test/java/org/acme/rest/json/FruitResourceTest.java" suite="unit"/>
    <test path="src/test/java/org/acme/rest/json/FruitResourceIT.java" suite="component-native"/>
  </module>
  <module path="src/main/java/org/acme/rest/json/Legume.java" pkg="org.acme.rest.json" component="c2" level="4" fanin="1" fanout="0">
    <role>POJO class representing a legume entity</role>
    <decl kind="class" name="Legume" sig="public class Legume"/>
    <decl kind="method" name="Legume()" sig="public Legume()"/>
    <decl kind="method" name="Legume(String name, String description)" sig="public Legume(String name, String description)"/>
    <decl kind="field" name="name" sig="public String name"/>
    <decl kind="field" name="description" sig="public String description"/>
  </module>
  <module path="src/main/java/org/acme/rest/json/LegumeResource.java" pkg="org.acme.rest.json" component="c2" level="3" fanin="2" fanout="1">
    <role>JAX-RS REST resource managing in-memory legume collection</role>
    <api name="GET /legumes" kind="http" scope="public" via="@GET public Response list()"/>
    <decl kind="class" name="LegumeResource" sig="public class LegumeResource"/>
    <decl kind="method" name="LegumeResource()" sig="public LegumeResource()"/>
    <decl kind="method" name="list()" sig="public Response list()"/>
    <test path="src/test/java/org/acme/rest/json/LegumeResourceTest.java" suite="unit"/>
    <test path="src/test/java/org/acme/rest/json/LegumeResourceIT.java" suite="component-native"/>
  </module>
  <module path="src/main/java/org/acme/rest/json/LoggingFilter.java" pkg="org.acme.rest.json" level="1" fanin="0" fanout="0">
    <role>JAX-RS provider filter logging incoming HTTP requests</role>
    <decl kind="class" name="LoggingFilter" sig="public class LoggingFilter"/>
    <decl kind="method" name="filter(ContainerRequestContext context)" sig="public void filter(ContainerRequestContext context)"/>
  </module>
  <module path="src/main/resources/META-INF/resources/fruits.html" component="c1" level="1" fanin="0" fanout="1">
    <role>AngularJS single-page client for viewing and adding fruits via /fruits API</role>
  </module>
  <module path="src/main/resources/META-INF/resources/legumes.html" component="c2" level="1" fanin="0" fanout="1">
    <role>AngularJS single-page client for viewing legumes via /legumes API</role>
  </module>
  <module path="src/test/java/org/acme/rest/json/FruitResourceIT.java" pkg="org.acme.rest.json" kind="test" suite="component-native" component="c1" level="1" fanin="0" fanout="1">
    <role>Quarkus integration test delegating to FruitResourceTest</role>
    <decl kind="class" name="FruitResourceIT" sig="public class FruitResourceIT"/>
  </module>
  <module path="src/test/java/org/acme/rest/json/FruitResourceTest.java" pkg="org.acme.rest.json" kind="test" suite="unit" component="c1" level="2" fanin="1" fanout="1">
    <role>Quarkus unit test for FruitResource list and add operations</role>
    <decl kind="class" name="FruitResourceTest" sig="public class FruitResourceTest"/>
    <decl kind="method" name="testList()" sig="public void testList()"/>
    <decl kind="method" name="testAdd()" sig="public void testAdd()"/>
  </module>
  <module path="src/test/java/org/acme/rest/json/LegumeResourceIT.java" pkg="org.acme.rest.json" kind="test" suite="component-native" component="c2" level="1" fanin="0" fanout="1">
    <role>Quarkus integration test delegating to LegumeResourceTest</role>
    <decl kind="class" name="LegumeResourceIT" sig="public class LegumeResourceIT"/>
  </module>
  <module path="src/test/java/org/acme/rest/json/LegumeResourceTest.java" pkg="org.acme.rest.json" kind="test" suite="unit" component="c2" level="2" fanin="1" fanout="1">
    <role>Quarkus unit test for LegumeResource list operation</role>
    <decl kind="class" name="LegumeResourceTest" sig="public class LegumeResourceTest"/>
    <decl kind="method" name="testList()" sig="public void testList()"/>
  </module>
  <edge from="src/main/java/org/acme/rest/json/FruitResource.java" to="src/main/java/org/acme/rest/json/Fruit.java" via="private Set&lt;Fruit&gt; fruits = Collections.newSetFromMap(Collections.synchronizedMap(new LinkedHashMap&lt;&gt;()));"/>
  <edge from="src/main/java/org/acme/rest/json/LegumeResource.java" to="src/main/java/org/acme/rest/json/Legume.java" via="private Set&lt;Legume&gt; legumes = Collections.synchronizedSet(new LinkedHashSet&lt;&gt;());"/>
  <edge from="src/test/java/org/acme/rest/json/FruitResourceIT.java" to="src/test/java/org/acme/rest/json/FruitResourceTest.java" via="public class FruitResourceIT extends FruitResourceTest {"/>
  <edge from="src/test/java/org/acme/rest/json/LegumeResourceIT.java" to="src/test/java/org/acme/rest/json/LegumeResourceTest.java" via="public class LegumeResourceIT extends LegumeResourceTest {"/>
  <edge from="src/main/resources/META-INF/resources/fruits.html" to="src/main/java/org/acme/rest/json/FruitResource.java" via="url: '/fruits'," by="use"/>
  <edge from="src/main/resources/META-INF/resources/legumes.html" to="src/main/java/org/acme/rest/json/LegumeResource.java" via="url: '/legumes'" by="use"/>
  <edge from="src/test/java/org/acme/rest/json/FruitResourceTest.java" to="src/main/java/org/acme/rest/json/FruitResource.java" via=".when().get(&quot;/fruits&quot;)" by="use"/>
  <edge from="src/test/java/org/acme/rest/json/LegumeResourceTest.java" to="src/main/java/org/acme/rest/json/LegumeResource.java" via=".when().get(&quot;/legumes&quot;)" by="use"/>
  <surface>
    <api name="DELETE /fruits" kind="http" at="src/main/java/org/acme/rest/json/FruitResource.java"/>
    <api name="GET /fruits" kind="http" at="src/main/java/org/acme/rest/json/FruitResource.java"/>
    <api name="POST /fruits" kind="http" at="src/main/java/org/acme/rest/json/FruitResource.java"/>
    <api name="GET /legumes" kind="http" at="src/main/java/org/acme/rest/json/LegumeResource.java"/>
  </surface>
  <systems/>
  <isolated path=".github/modernize/java-upgrade/hooks/scripts/recordToolUse.ps1"/>
  <isolated path=".github/modernize/java-upgrade/hooks/scripts/recordToolUse.sh"/>
  <isolated path="src/main/docker/Dockerfile.jvm"/>
  <isolated path="src/main/docker/Dockerfile.legacy-jar"/>
  <isolated path="src/main/docker/Dockerfile.native"/>
  <isolated path="src/main/docker/Dockerfile.native-micro"/>
  <isolated path="src/main/java/org/acme/rest/json/LoggingFilter.java"/>
</appgraph>
`

const t3Root = () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent", "staging"), { recursive: true })
  writeFileSync(join(root, ".agent", "plan-index.json"), T3_PLAN)
  writeFileSync(join(root, ".agent", "frd.xml"), T3_FRD)
  writeFileSync(join(root, ".agent", "appgraph.xml"), T3_MAP)
  // Гейт шага 6 на этой форме спрашивает про fruits.html — узел ширины с fanin="0", до которого не
  // доходит ни один сьют, — и до шага 11 полоса доходит ТОЛЬКО с ответом `accept`: `suite` и `drop`
  // останавливают её там же (steps/ripple/ripple.mjs::BLIND_TAIL). Прогон c6bc2e54 старше гейта,
  // поэтому ответ дописан здесь: без него у формы нет пути до шага 11 вовсе.
  answerOnDisk(root, `${BLIND_STEM(T3_LIST)}${BLIND_TAIL}`, "accept")
  return root
}

// Ответ роли, собранный ИЗ НАРЯДА. Ни один id здесь не набран руками: пункты приходят строками
// {OWED}, узлы без своей команды — строками {UNCHECKED} вместе со своими командами-кандидатами.
// Узел для `<covers>` роль выбирает по FRD (LAW 2 роли, правило R7): пункт живёт на узлах своего
// сценария, а для `nfr:` узла у FRD нет вовсе.
const orderIds = (block, mark) => String(block).split("\n")
  .filter((l) => l.includes(mark))
  .map((l) => l.split(" — ")[0].trim())
const answerTheOrder = (form, plan, frd) => {
  const planIds = new Set((plan.nodes || []).map((n) => n.id))
  const nodeFor = (item) => {
    const uc = item.includes("/") ? item.split("/")[0] : null
    const own = (frd.scenarios || []).filter((s) => (uc ? String(s.uc).trim() === uc : String(s.id).trim() === item))
    const cands = own.flatMap((s) => [`scenario:${String(s.id).trim()}`, ...String(s.nodes || "").split(/\s+/).filter(Boolean)])
    return cands.find((id) => planIds.has(id)) || [...planIds][0]
  }
  const covers = orderIds(form.owed, " — ").map((id) => `<covers item="${id}" node="${nodeFor(id)}"/>`)
  const witness = String(form.unchecked).split("\n")
    .filter((l) => l.includes("своей команды нет; закрывают: "))
    .map((l) => {
      const id = l.split(" — ")[0].trim()
      const cmd = l.split("закрывают: ")[1].split(" · ")[0].trim()
      return `<witness node="${id}" cmd="${cmd}"/>`
    })
  return `<review verdict="Pass" grammar="2">\n  ${[...covers, ...witness].join("\n  ")}\n</review>`
}

test("шов 11: роль, ответившая наряду ДОСЛОВНО, проходит шаг 11 на форме t3", () => {
  const root = t3Root()
  const plan = JSON.parse(T3_PLAN)
  const answers = [{ n: 1, question: `${BLIND_STEM(T3_LIST)}${BLIND_TAIL}`, text: "accept" }]
  const form = reviewForm.run({}, ctx(root))

  // О чём наряд спрашивает — то правило и считает. Одно выражение на обоих концах: верни `!n.new` в
  // любую одну сторону, и эти два множества разойдутся (D23).
  assert.deepEqual(orderIds(form.unchecked, "своей команды нет"), askedNodes({ plan, answers }).map((n) => n.id))
  // На этой форме спрашивать не о чем: fruits.html принят оператором, fruit-card.html создаётся.
  assert.deepEqual(askedNodes({ plan, answers }), [])
  assert.match(form.unchecked, new RegExp(`принята оператором на шаге 6: ${T3_LIST}`))
  assert.match(form.unchecked, new RegExp(`эти узлы изменение СОЗДАЁТ.*${T3_CARD}`))

  writeFileSync(join(root, ".agent", "staging", "review.xml"), answerTheOrder(form, plan, parseFrd(T3_FRD)))
  const r = review.run({ path: ".agent/staging/review.xml" }, ctx(root))
  assert.equal(r.ok, true, r.ok ? "" : r.blockers)
  assert.equal(r.verdict, "Pass")
})

// --- D15: the hats, and the one that must stay unique --------------------------------------------
//
// A role's first line is the strongest instruction in the file: it decides which of the model's
// professions answers the order. The seven hats are chosen so that they do not overlap, and the
// overlap that matters is `software architect` — the only profession in this pipeline that is
// entitled to invent modules. Give it to the interface analyst and pass A starts drawing a graph it
// is forbidden to draw; give it to the systems analyst and pass C starts repairing the frozen one.
// So it is asserted to occur EXACTLY ONCE in all of steps/, and the test lives here because
// ext/index.mjs is what declares roleDirectories — the only place all of them are named at once.
//
// The domain check is one rule in one place, over EVERY role rather than three: standards/role.md
// constraint 3 is a property of role files as such, and it has already cost a live run (a role
// returned its prepared example instead of reading the order). The words banned are the ones of the
// forms this pipeline is actually run against — a role carrying them cannot be told apart from an
// order.
const ROLE_FILES = [
  ["brd/gilb.md", /business analyst/],
  ["scope/scout.md", /REVERSE ENGINEER/],
  ["intake/intake.md", /requirements analyst/],
  ["design/valuer.md", /INTERFACE ANALYST/],
  ["review/critic.md", /DESIGN REVIEWER/],
]
const roleText = (f) => readFileSync(new URL(`../steps/${f}`, import.meta.url), "utf8")

test("no role carries a word of a form this pipeline is run against — the example is the only concrete place", () => {
  // The regression form (fruits) and the hard input (eddi, its glossary): live-domain vocabulary in a
  // LAW or a STRATEGY is a prepared answer, and a weak tier returns it instead of reading the order.
  const live = /\bfruits?\b|фрукт|\bglossar|глоссари|\beddi\b/i
  for (const [file] of ROLE_FILES) {
    const hits = roleText(file).split("\n").filter((l) => live.test(l))
    assert.deepEqual(hits, [], `${file} несёт слова живого домена`)
  }
})


// $START_ORDER — то же устройство, что $START_SWARM, $START_BLAME и $START_REENTRY: блок ВЫРЕЗАН из
// workflows/izi.js и исполнен здесь, потому что импортировать этот файл нельзя. `prompt`, `log` и
// потолок передаются параметрами — внутри песочницы это глобали хоста.
//
// D29b. До этого блока ни один шаг не знал, насколько разросся его наряд: рябь выросла с 2 311
// символов (форма `t2`) до 30 281 (`eddi`), и не заметила этого ни одна строка лога. Прогон 162e8b02
// ушёл за окно на 112 токенов — HTTP 400, роль не запускалась вовсе, и из чата это неотличимо от
// роли, которая ответила плохо.
const ORDER = (cap) => new Function("prompt", "log", "ORDER_CAP", `${IZI.slice(IZI.indexOf("// $START_ORDER"), IZI.indexOf("// $END_ORDER"))}
  return { sized }`)(
  (tpl, keys) => `${tpl}::${Object.values(keys).join("")}`,
  (line) => LOGGED.push(line),
  cap,
)
let LOGGED = []

test("D29b: размер наряда печатается СЛАГАЕМЫМИ — иначе «наряд большой» это число, с которым нечего делать", () => {
  LOGGED = []
  const o = ORDER(1000).sized("intake", "tpl", { MAP: "m".repeat(300), BRD: "b".repeat(40), FEEDBACK: "" })

  assert.equal(o.chars, o.text.length)
  assert.equal(o.over, false)
  assert.equal(LOGGED.length, 1)
  // Слагаемые — по убыванию размера: первым стоит тот документ, который и разнесло.
  assert.equal(LOGGED[0], "intake: наряд 345 симв из 1000 — шаблон 3 · MAP 300 · BRD 40 · FEEDBACK 0")
})

test("D29b: наряд выше потолка — отказ, и он НАЗЫВАЕТ слагаемые", () => {
  LOGGED = []
  const o = ORDER(100).sized("design/values", "tpl", { FRD: "f".repeat(60), RIPPLE: "r".repeat(60) })

  assert.equal(o.over, true)
  assert.match(o.why, /^наряд design\/values — 125 симв при потолке 100:/)
  assert.match(o.why, /FRD 60/)
  assert.match(o.why, /RIPPLE 60/)
  // Строка лога печатается и в этом случае: отказ едет оператору, а лог остаётся в прогоне.
  assert.equal(LOGGED.length, 1)
})

test("D29b: пять прямых сборок наряда идут через sized, и каждая отказывает по-своему", () => {
  // ПЯТЬ мест — шаги 2, 4, 6, 9 и 11. Роёв больше нет: проход A шага 9 собирает ОДИН наряд, и он
  // идёт через ту же меру, что остальные четыре.
  assert.equal([...IZI.matchAll(/= sized\(/g)].length, 5, "пять прямых сборок наряда")
  assert.match(IZI, /const order = sized\("brd", orderTpl, \{/)
  assert.match(IZI, /const order = sized\(`scope\/\$\{cell\.id\}`, orderTpl, \{/)
  assert.match(IZI, /const order = sized\("intake", orderTpl, \{/)
  assert.match(IZI, /const o = sized\("design\/values", tpl, \{/)
  assert.match(IZI, /const order = sized\("review", orderTpl, \{/)

  // Ни одного `prompt(` мимо sized: наряд, собранный в обход меры, — это наряд, размер которого
  // впервые узнают из HTTP 400 (прогон 162e8b02).
  const raw = [...IZI.matchAll(/prompt\(([A-Za-z.[\]"]+)/g)].map((m) => m[1])
  assert.deepEqual(raw.sort(), ["tpl"], "prompt() вызывается только внутри sized")

  // Отказ шага 4 — ЗНАЧЕНИЕ, а не exit: parallel() глотает бросок и перебрасывает свой.
  const scoutFn = IZI.slice(IZI.indexOf("async function scout("), IZI.indexOf("// FUNCTION_CONTRACT: scope"))
  assert.match(scoutFn, /if \(order\.over\) return \{ ok: false, why: order\.why \};/)
  assert.doesNotMatch(scoutFn, /exit\(/)
  // …а остальные четыре — blocked с диагнозом гардрейла.
  assert.equal([...IZI.matchAll(/if \(o(?:rder)?\.over\) exit\(err\("blocked"/g)].length, 4)

  // Потолок не переписан в этом файле: он приходит из core/budgets.mjs через budgets().
  assert.match(IZI, /ORDER_CAP = b\.orderCap;/)
  assert.doesNotMatch(IZI, new RegExp(`= ${ORDER_CAP_CHARS}`))
})
