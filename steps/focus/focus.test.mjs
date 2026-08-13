// Slice `focus`: the decision "what do we survey" — a PURE core.
//
// The graph is the same 12-node extract of the live eddi tree that slices.test.mjs uses, and the
// plan is built from it by this repository's own newPlan — so the cells are real cells, with real
// ids and a real spine. `cap` is passed explicitly in most cases: the true ceiling (115 KB) is
// twenty times this fixture, and a branch that only a monolith can reach would otherwise be a branch
// no test can turn red. The ceiling itself is NOT redefined here — it arrives from
// steps/intake/map.mjs, and the default case below proves that it does.

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { newSlices } from "./slices.mjs"
import { newFocus, FOCUS_QUESTION, ASK_CANDIDATES } from "./focus.mjs"
import { newPlan } from "../survey-plan/plan.mjs"
import { MAP_BYTES_PER_NODE } from "../intake/map.mjs"

const FX = JSON.parse(readFileSync(new URL("./fixture-eddi.json", import.meta.url), "utf8"))
const ENTRY = FX.entry
const NEIGHBOUR = "src/main/java/ai/labs/eddi/configs/agents/model/AgentConfiguration.java"
const ORPHAN = FX.nodes.find((p) => p.endsWith(".json"))

const { slices, orphans } = newSlices(FX)
// `cellFiles: 2` cuts the extract into nine cells instead of one. It is not a knob the pipeline
// turns — the real width is CELL_FILES = 20 — but a twelve-file tree lands in a SINGLE cell at that
// width, and a focus that can only ever choose "everything" cannot show that it chooses. The narrow
// cell is the fixture's way of holding a monolith's granularity in twelve files.
const plan = newPlan({
  files: FX.nodes.map((path) => ({ path, bytes: 1000 })),
  spine: [{ path: "README.md", bytes: 1000 }],
  subjects: [],
  cellFiles: 2,
}).value
const CELLS = plan.cells
const SPINE = CELLS.find((c) => c.kind === "spine").id
const TIGHT = 8 * MAP_BYTES_PER_NODE            // the whole plan is 13 files: it cannot meet this

const focus = (over) => newFocus({ slices, orphans, cells: CELLS, ...over })

test("the whole plan fits — the focus IS the plan, and nobody is asked anything", () => {
  const r = focus({})                                  // no cap given: the real 115 KB arrives from map.mjs
  assert.equal(r.ok, true)
  assert.equal(r.value.why, "whole-plan")
  assert.deepEqual(r.value.cells, CELLS.map((c) => c.id))
  assert.deepEqual(r.value.chosen, slices.map((s) => s.id))
  assert.equal(r.value.estBytes, r.value.files * MAP_BYTES_PER_NODE)

  // This is the branch that keeps every form the pipeline is green on today green: t1-t3 are ~15
  // files, so the focus equals the plan and step 4 sees exactly what it saw yesterday.
})

test("above the ceiling the anchor picks by ENTRY, and the cell comes whole", () => {
  const r = focus({ cap: TIGHT, marked: [ENTRY] })
  assert.equal(r.ok, true)
  assert.equal(r.value.why, "anchors")
  assert.deepEqual(r.value.chosen, ["s1"])
  assert.ok(r.value.cells.length < CELLS.length, "the focus is narrower than the plan")
  assert.ok(r.value.cells.includes(SPINE), "the spine is in every focus: its six questions are not about a slice")
  assert.ok(r.value.estBytes <= TIGHT)

  // An anchor on a node INSIDE the cone selects nothing: measured on eddi, "anchor anywhere in the
  // cone" gives 244-282 KB against a 115 KB ceiling, because hitsFor matches a substring of the
  // whole file and a word like `http` lives in half the repository. The entry is the one place where
  // an anchor's name means something — it says what STARTS the change.
  const inside = focus({ cap: TIGHT, marked: [NEIGHBOUR] })
  assert.equal(inside.ok, false)
  assert.equal(inside.error.cls, "ask")
})

test("an anchor on an orphan brings its cell — else a config could never be surveyed at all", () => {
  const r = focus({ cap: TIGHT, marked: [ORPHAN] })
  assert.equal(r.ok, true)
  assert.deepEqual(r.value.chosen, [], "no cone was chosen…")
  const cellOfOrphan = CELLS.find((c) => c.files.some((f) => f.path === ORPHAN)).id
  assert.ok(r.value.cells.includes(cellOfOrphan), "…and yet the orphan's cell is in the focus")
})

test("what cannot be decided is ASKED — one question, constant, with the list beside it", () => {
  const none = focus({ cap: TIGHT, marked: [] })
  assert.equal(none.ok, false)
  assert.equal(none.error.cls, "ask")
  assert.equal(none.error.detail.subject, FOCUS_QUESTION, "the question is the constant, verbatim")
  assert.ok(none.error.detail.evidence.includes(ENTRY), "the candidates travel in the evidence")

  // The stem does not move when the list does — this is the whole reason the list lives in the
  // evidence. An answer is found by the question's PREFIX (core/answers.mjs), so a stem assembled
  // from candidates would stop matching its own answer the moment a candidate changed: run 46edab60.
  const other = newFocus({ slices: slices.slice(0, 1), orphans, cells: CELLS, cap: TIGHT, marked: [] })
  assert.equal(other.error.detail.subject, none.error.detail.subject)
  assert.notEqual(other.error.detail.evidence, none.error.detail.evidence)

  // A list is cut to ASK_CANDIDATES and says so: with no anchor hitting anything, every entry is a
  // candidate — 84 of them on eddi, which is not a choice an operator can make.
  const many = Array.from({ length: ASK_CANDIDATES + 8 }, (_, i) => ({ id: `s${i + 1}`, entry: `src/E${i}.java`, kind: "head", nodes: [`src/E${i}.java`] }))
  const cut = newFocus({ slices: many, orphans: [], cells: CELLS, cap: TIGHT, marked: [] })
  assert.equal(cut.error.detail.evidence.includes(`из ${many.length}`), true)
  assert.equal(cut.error.detail.evidence.includes("src/E12.java"), false, "the 13th candidate is not offered")
})

test("the operator answers by number; a bad answer is re-asked with a DIFFERENT text", () => {
  const answered = focus({ cap: TIGHT, marked: [], answers: [{ question: FOCUS_QUESTION, text: "1" }] })
  assert.equal(answered.ok, true)
  assert.equal(answered.value.why, "answered")
  assert.deepEqual(answered.value.chosen, ["s1"])

  // BUG_FIX_CONTEXT run 03b598c7: a rejected answer re-asked with the SAME text finds the old answer
  // on disk, never pauses, and burns every QUESTION_ROUND in seconds without the operator seeing it.
  for (const [text, why] of [["не знаю", "no numbers"], ["7", "out of range"]]) {
    const bad = focus({ cap: TIGHT, marked: [], answers: [{ question: FOCUS_QUESTION, text }] })
    assert.equal(bad.error.cls, "ask", why)
    assert.notEqual(bad.error.detail.subject, FOCUS_QUESTION, why)
    assert.ok(bad.error.detail.subject.startsWith(FOCUS_QUESTION), why)
    assert.ok(bad.error.detail.subject.includes(text), why)
  }

  // and an answer that IS a valid number but still does not fit is refused with its own reason,
  // rather than quietly truncated to whatever would fit
  const over = newFocus({ slices, orphans, cells: CELLS, cap: 1, marked: [], answers: [{ question: FOCUS_QUESTION, text: "1" }] })
  assert.equal(over.error.cls, "ask")
  assert.ok(over.error.detail.subject.includes("выше потолка"))
})

test("no plan and no entry are different refusals, and both are total", () => {
  assert.equal(newFocus().error.cls, "no-plan")
  assert.equal(newFocus({ cells: [] }).error.cls, "no-plan")

  const noEntry = newFocus({ slices: [], orphans: FX.nodes, cells: CELLS, cap: TIGHT })
  assert.equal(noEntry.error.cls, "no-entry")
  assert.ok(noEntry.error.detail.includes("сузить нечем"))

  // …but a SMALL repository of such a language never meets that refusal: it leaves by the branch
  // above, because its plan fits whole. The order of the two checks is the rule.
  assert.equal(newFocus({ slices: [], orphans: FX.nodes, cells: CELLS }).value.why, "whole-plan")
})
