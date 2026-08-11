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
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readText, answers, checkTask, checkBrd, setPending, clearPending, promote, newRun, iziAnswer } from "./index.mjs"

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
      "open-questions: 0",
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

  assert.deepEqual(r, { answers: 1, pending: true, staged: 1 })
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
  assert.deepEqual(newRun.run({}, ctx(root)), { answers: 0, pending: false, staged: 0 })
  assert.equal(existsSync(join(root, ".agent", "prev")), false)
})

test("newRun twice: .agent/prev holds the PREVIOUS run, not a growing pile", () => {
  const root = tempRoot()
  deadRun(root, { answer: "50" })
  newRun.run({}, ctx(root))
  writeFileSync(join(root, ".agent", "answers.md"), EXCHANGE("предел?", "10"))       // the run that just ended
  const r = newRun.run({}, ctx(root))
  assert.deepEqual(r, { answers: 1, pending: false, staged: 0 })
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
    "open-questions: 0",
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

// --- izi_answer: the operator's numbering does not reach the VALUES -----------------------------
//
// The wiring seam for core/answers.mjs::stripOrdinal (live run 9d126ef3): removing the call from
// izi_answer's byNumber map turns this test red — the digits the operator addressed the batch with
// land on disk as part of the answers, and from there they are legal numbers for a `fit:`.

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
