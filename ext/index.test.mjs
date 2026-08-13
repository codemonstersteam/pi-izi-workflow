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
import { readText, answers, checkTask, checkBrd, setPending, clearPending, promote, newRun, focus, cells, buildGraph, weight, ripple, design, plan, review, iziAnswer } from "./index.mjs"
import { KEY_QUESTION } from "../steps/plan/plan.mjs"

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

// --- design: the gate erases, the check promotes -------------------------------------------------
//
// Step 9's own version of the same rule, one layer on: the GATE (design({}) with no path) must erase
// BOTH of yesterday's artifacts in EVERY branch — on `skip` nobody will rewrite them, and on `needed`
// they are rewritten only if the role and the guardrail both succeed. Remove the rmSync loop in
// ext/index.mjs::design and the first test below goes red: step 10 would then read a design graph
// computed for a different FRD (docs/design.md §5).
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
const STAGED = `<design mode="minor" base=".agent/appgraph.xml">
  <module path="src/ParcelResource.java" delta="Added">
    <role>REST-ресурс посылок</role>
    <contract in="GET /parcels?track=&lt;v&gt; | Set&lt;Parcel&gt;" out="all() | Set&lt;Parcel&gt; (совпавшие)"/>
    <dep path="src/ParcelRepo.java"/>
  </module>
  <module path="src/ParcelRepo.java">
    <role>хранилище посылок</role>
    <contract in="all()" out="Set&lt;Parcel&gt;"/>
  </module>
  <route scenario="S1" entry="1" steps="src/ParcelResource.java#1 -> src/ParcelRepo.java#1 -> src/ParcelResource.java#2"/>
</design>`
const designRoot = (flag = "needed") => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent", "staging"), { recursive: true })
  writeFileSync(join(root, ".agent", "frd.xml"), FRD_R)
  writeFileSync(join(root, ".agent", "ripple.xml"), DESIGN_RIPPLE)
  if (flag) writeFileSync(join(root, ".agent", "design"), flag)
  writeFileSync(join(root, ".agent", "design-graph.xml"), "<design/>")     // yesterday's graph
  writeFileSync(join(root, ".agent", "data-flow.md"), "$START_FLOW id=\"вчера\"\n$END_FLOW\n")
  return root
}

test("the gate erases both artifacts of the previous run — on skip and on needed alike", () => {
  for (const flag of ["skip", "needed"]) {
    const root = designRoot(flag)
    assert.deepEqual(design.run({}, ctx(root)), { ok: true, design: flag })
    assert.equal(existsSync(join(root, ".agent", "design-graph.xml")), false, flag)
    assert.equal(existsSync(join(root, ".agent", "data-flow.md")), false, flag)
  }
})

test("no .agent/design at the run root: refusal naming step 8", () => {
  const r = design.run({}, ctx(designRoot(null)))
  assert.equal(r.ok, false)
  assert.match(r.why, /шаг 8 ripple не отработал/)
})

test("the check promotes the role's graph and writes the flow with the unit list beside it", () => {
  const root = designRoot()
  const staging = join(".agent", "staging", "design-graph.xml")
  writeFileSync(join(root, staging), STAGED)

  const r = design.run({ path: staging }, ctx(root))
  assert.deepEqual(r, { ok: true, nodes: 2, routes: 1, units: 2 })
  // promote is a MOVE: what stays under staging is exactly what a guardrail rejected.
  assert.equal(existsSync(join(root, staging)), false)
  assert.match(readFileSync(join(root, ".agent", "design-graph.xml"), "utf8"), /^<design mode="minor"/)
  const flow = readFileSync(join(root, ".agent", "data-flow.md"), "utf8")
  assert.match(flow, /^1\. src\/ParcelResource\.java : GET \/parcels\?track=<v> -> all\(\)$/m)
  assert.match(flow, /\$START_TESTS path="src\/ParcelRepo\.java"\n1\. all\(\) -> Set<Parcel>\n\$END_TESTS/)
})

test("a red check leaves the artifacts absent and hands the blockers back as text", () => {
  const root = designRoot()
  const staging = join(".agent", "staging", "design-graph.xml")
  design.run({}, ctx(root))   // the gate runs first in the phase, and it is what erased yesterday's pair
  // The subgraph knows no such module, and it carries no delta: rule 6 — a transit node invented.
  writeFileSync(join(root, staging), STAGED.replaceAll("src/ParcelRepo.java", "src/Nope.java"))

  const r = design.run({ path: staging }, ctx(root))
  assert.equal(r.ok, false)
  assert.match(r.blockers, /6 узел без delta вне подграфа ряби — src\/Nope\.java/)
  assert.equal(existsSync(join(root, ".agent", "design-graph.xml")), false)
  assert.equal(existsSync(join(root, ".agent", "data-flow.md")), false)
  assert.equal(existsSync(join(root, staging)), true)  // the rejected file stays where it was written
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
    nodes: [{ id: "src/ParcelResource.java", kind: "code", delta: ["GET /parcels (Added)"], deps: [], check: [], coveredBy: ["scenario:S1"] }],
  }))
  writeFileSync(join(root, ".agent", "staging", "review.xml"), verdict)
  return root
}

test("review promotes a Pass and returns the verdict", () => {
  const root = reviewRoot('<review verdict="Pass" grammar="1"/>')
  const r = review.run({ path: ".agent/staging/review.xml" }, ctx(root))
  assert.equal(r.ok, true, r.ok ? "" : r.blockers)
  assert.equal(r.verdict, "Pass")
  assert.equal(existsSync(join(root, ".agent", "review.xml")), true)
  assert.equal(existsSync(join(root, ".agent", "staging", "review.xml")), false, "promoted, not copied")
})

test("review promotes a Reject too, and hands back the owner of each blocker", () => {
  const root = reviewRoot('<review verdict="Reject" grammar="1"><blocker code="goal-not-delivered" node="src/ParcelResource.java" evidence="S1">поиск не выполняется ни одним узлом</blocker></review>')
  const r = review.run({ path: ".agent/staging/review.xml" }, ctx(root))
  assert.equal(r.ok, true, r.ok ? "" : r.blockers)
  assert.equal(r.verdict, "Reject")
  assert.deepEqual(r.findings.map((f) => [f.code, f.culprit, f.owner]), [["goal-not-delivered", "frd.xml", 6]])
  assert.equal(existsSync(join(root, ".agent", "review.xml")), true, "the operator and the repair rail both read the blockers")
})

test("a malformed verdict promotes nothing and erases yesterday's review", () => {
  const root = reviewRoot('<review verdict="Reject" grammar="1"><blocker code="made-up" node="src/ParcelResource.java" evidence="S1">x</blocker></review>')
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
