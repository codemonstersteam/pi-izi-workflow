// Slice `focus`: the decision "what do we survey" — a PURE core.
//
// The graph is the same 12-node extract of the live eddi tree that slices.test.mjs uses, and the
// plan is built from it by this repository's own newPlan — so the cells are real cells, with real
// ids and a real spine. `cap` is passed explicitly in most cases: the true ceiling (115 KB) is
// twenty times this fixture, and a branch that only a monolith can reach would otherwise be a branch
// no test can turn red. The ceiling itself is NOT redefined here — it arrives from
// steps/intake/map.mjs, and the first case below proves that it does.

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { newSlices } from "./slices.mjs"
import { newFocus, names } from "./focus.mjs"
import { newPlan } from "../survey-plan/plan.mjs"
import { MAP_BYTES_PER_NODE } from "../intake/map.mjs"

const FX = JSON.parse(readFileSync(new URL("./fixture-eddi.json", import.meta.url), "utf8"))
const ENTRY = FX.entry                       // …/configs/agents/IRestCapabilityRegistry.java — cone of 5
const OTHER = FX.otherEntry                  // …/configs/dictionary/IRestAction.java — cone of 2
const ORPHAN = FX.nodes.find((p) => p.endsWith(".descriptor.json"))

const { slices, orphans } = newSlices(FX)

// `cellFiles: 2` cuts the extract into nine cells instead of one. It is not a knob the pipeline
// turns — the real width is CELL_FILES = 20 — but a twelve-file tree lands in a SINGLE cell at that
// width, and a focus that can only ever choose "everything" cannot show that it chooses.
const plan = newPlan({
  files: FX.nodes.map((path) => ({ path, bytes: 1000 })),
  spine: [{ path: "README.md", bytes: 1000 }],
  subjects: [],
  cellFiles: 2,
}).value
const CELLS = plan.cells
const SPINE = CELLS.find((c) => c.kind === "spine").id

const TIGHT = 8 * MAP_BYTES_PER_NODE         // the whole plan is 13 files: it cannot meet this
const focus = (over) => newFocus({ slices, orphans, cells: CELLS, ...over })

test("names: the anchor NAMES the file — by its PATH, case-insensitively", () => {
  assert.equal(names("export", "src/main/java/ai/labs/eddi/backup/IRestExportService.java"), true)
  assert.equal(names("Glossary", "…/configs/glossary/IGlossaryStore.java"), true)
  assert.equal(names("snippet", "…/PromptSnippetService.java"), true)

  // BUG_FIX_CONTEXT run e90d9ce1: the BRD's anchors were `… · export · import`, and `import` is a
  // java keyword. Under step 3's rule — the anchor's text anywhere in the file — it marked the whole
  // repository and named 83 of 84 entries. A path is not a text: this is the whole repair.
  assert.equal(names("import", "src/main/java/ai/labs/eddi/configs/agents/IRestAgentStore.java"), false)
  assert.equal(names("import", "src/main/java/ai/labs/eddi/backup/IRestImportService.java"), true, "…but a file that IS about import is still named")

  // an empty anchor would name EVERY file — `"".includes("")` is true — which is the failure this
  // rule exists to end, so it is refused rather than allowed through
  assert.equal(names("", "…/anything.java"), false)
  assert.equal(names("   ", "…/anything.java"), false)
  assert.equal(names(undefined, undefined), false)
})

test("the whole plan fits — the focus IS the plan, and nothing is dropped", () => {
  const r = focus({})                        // no cap given: the real 115 KB arrives from map.mjs
  assert.equal(r.value.why, "whole-plan")
  assert.deepEqual(r.value.cells, CELLS.map((c) => c.id))
  assert.deepEqual(r.value.dropped, { slices: 0, cells: 0 })

  // This is the branch that keeps every form the pipeline is green on today green: t1-t3 are ~19
  // files, so the focus equals the plan and step 4 sees exactly what it saw yesterday.
})

test("above the ceiling the anchor picks the cone that NAMES it, and the cell comes whole", () => {
  const r = focus({ cap: TIGHT, anchors: ["capabilityregistry"] })
  assert.equal(r.value.why, "anchors")
  assert.deepEqual(r.value.chosen, ["s1"])
  assert.ok(r.value.cells.length < CELLS.length, "the focus is narrower than the plan")
  assert.ok(r.value.cells.includes(SPINE), "the spine is in every focus: its six questions are not about a slice")
  assert.ok(r.value.estBytes <= TIGHT)

  // an anchor that names NOTHING is not a narrowing rule, it is a broken requirement: the repair is
  // the BRD, not a choice among 84 candidates the operator cannot rank
  const nothing = focus({ cap: TIGHT, anchors: ["import", "glossary"] })
  assert.equal(nothing.error.cls, "no-anchor")
  assert.match(nothing.error.detail, /правится формулировка требований/)
})

test("an anchor on an orphan brings its cell — else a config could never be surveyed at all", () => {
  const r = focus({ cap: TIGHT, anchors: ["descriptor"] })
  assert.deepEqual(r.value.chosen, [], "no cone was named…")
  const cellOfOrphan = CELLS.find((c) => c.files.some((f) => f.path === ORPHAN)).id
  assert.ok(r.value.cells.includes(cellOfOrphan), "…and yet the named orphan's cell is in the focus")
})

test("what does not fit is COUNTED, not silently absent — cheapest named cone first", () => {
  const tighter = 4 * MAP_BYTES_PER_NODE
  const r = newFocus({ slices, orphans, cells: CELLS, cap: tighter, anchors: ["capabilityregistry", "irestaction"] })

  assert.equal(r.value.why, "anchors")
  assert.deepEqual(r.value.chosen, ["s2"], "s2 costs 2 cells and s1 costs 4: the cheaper one gets in")
  assert.equal(r.value.dropped.slices, 1, "and the one that did not fit is counted")
  assert.ok(r.value.estBytes <= tighter, "the ceiling is never exceeded to fit one more")

  // The count is what makes this a decision rather than a default (standards/code.md §3): step 5
  // carries it into <focus>, and the anchors whose files stayed out come back as found="outside".
})

test("no plan, no entry, no cone that fits — three different refusals, and all total", () => {
  assert.equal(newFocus().error.cls, "no-plan")
  assert.equal(newFocus({ cells: [] }).error.cls, "no-plan")

  const noEntry = newFocus({ slices: [], orphans: FX.nodes, cells: CELLS, cap: TIGHT })
  assert.equal(noEntry.error.cls, "no-entry")
  assert.match(noEntry.error.detail, /сузить нечем/)

  // …but a SMALL repository of such a language never meets that refusal: it leaves by the whole-plan
  // branch above, because its plan fits. The order of the two checks is the rule.
  assert.equal(newFocus({ slices: [], orphans: FX.nodes, cells: CELLS }).value.why, "whole-plan")

  // a ceiling under the cheapest cone: nothing can be surveyed, and saying so costs zero tokens
  const over = newFocus({ slices, orphans, cells: CELLS, cap: 2 * MAP_BYTES_PER_NODE, anchors: ["capabilityregistry"] })
  assert.equal(over.error.cls, "over-cap")
  assert.match(over.error.detail, /ключ кэша/)
})
