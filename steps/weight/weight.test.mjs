// Slice `weight`: the forms of the deltas → one word of SemVer — a PURE core; its io lives in
// ext/index.mjs (standards/code.md: an io pipe is not unit-tested). Formula: 1 happy + Σ antecedent
// branches with a DISTINGUISHABLE consequent, each built by REINTRODUCING the defect docs/weight.md §2
// names, so the seam is proven rather than claimed.

import test from "node:test"
import assert from "node:assert/strict"
import { newMode, MODE_TABLE } from "./weight.mjs"
import { FRD_FORM } from "../intake/frd.mjs"

// A DIFFERENT domain from any live input, as everywhere else in this repository.
const d = (op, form, extra = {}) => ({ op, form, node: `src/${op}.java`, ...extra })

test("happy: the weight is the MAXIMUM over the forms, and why[] names what earned it", () => {
  const r = newMode({ deltas: [d("findByTrack", "Added"), d("GET /parcels", "Fixed")] })
  assert.equal(r.ok, true)
  assert.equal(r.value.mode, "minor")               // Added beats Fixed, not the first delta read
  assert.deepEqual([...r.value.why], ["findByTrack (Added)"])   // Fixed did not earn it, so it is not named
})

test("a breaking form weighs major — one Changed, one Removed", () => {
  assert.equal(newMode({ deltas: [d("GET /parcels", "Changed")] }).value.mode, "major")
  assert.equal(newMode({ deltas: [d("GET /parcels", "Removed")] }).value.mode, "major")
})

// THE seam of discrepancy B (docs/weight.md §2): before `Fixed` existed, `patch` was given for "no
// deltas at all" while F7 of step 6 demands at least one — so no run could ever produce it, and step
// 8's branch "a one-node patch needs no design" was dead code.
test("only Fixed weighs patch — the contract did not move, and patch is REACHABLE", () => {
  const r = newMode({ deltas: [d("GET /parcels", "Fixed"), d("list", "Fixed")] })
  assert.equal(r.value.mode, "patch")
  assert.equal(r.value.why.length, 2)
})

test("the fold is commutative: the order of deltas in the artifact cannot change the weight", () => {
  const a = newMode({ deltas: [d("GET /parcels", "Fixed"), d("list", "Changed")] })
  const b = newMode({ deltas: [d("list", "Changed"), d("GET /parcels", "Fixed")] })
  assert.equal(a.value.mode, "major")
  assert.equal(a.value.mode, b.value.mode)
  assert.deepEqual([...a.value.why], [...b.value.why])
})

// The rule of this step: a weight guessed over an unclassified delta is the silent default the whole
// pipeline exists to forbid. The `why` the role wrote is what the operator gets to read.
test("one Unknown among green deltas — no weight, and every op is named with its why", () => {
  const r = newMode({ deltas: [d("findByTrack", "Added"), { op: "PATCH /parcels", form: "Unknown", why: "в карте два кандидата" }] })
  assert.equal(r.ok, false)
  assert.equal(r.error.cls, "unknown-delta")
  assert.match(r.error.detail, /PATCH \/parcels: в карте два кандидата/)
  assert.doesNotMatch(r.error.detail, /findByTrack/)      // the classified delta is not the operator's problem
})

test("an Unknown without why is still a stop, and says whose defect that is", () => {
  const r = newMode({ deltas: [{ op: "PATCH /parcels", form: "Unknown" }] })
  assert.equal(r.error.cls, "unknown-delta")
  assert.match(r.error.detail, /дефект шага 6/)
})

// Totality: .agent/frd.xml outlives the run that wrote it, so this core is handed files older than
// the current grammar. A refusal is data; a throw would be a crashed run with no diagnosis.
test("a form outside the vocabulary — bad-form, naming the word and the vocabulary", () => {
  const r = newMode({ deltas: [d("GET /parcels", "Modified")] })
  assert.equal(r.error.cls, "bad-form")
  assert.match(r.error.detail, /GET \/parcels → "Modified"/)
  assert.match(r.error.detail, /Added \| Changed \| Removed \| Fixed \| Unknown/)
})

test("nothing to weigh — no-delta on an empty list, a non-array and no argument at all", () => {
  for (const deltas of [[], undefined, null, "две дельты", { form: "Added" }]) {
    assert.equal(newMode({ deltas }).error.cls, "no-delta")
  }
  assert.equal(newMode().error.cls, "no-delta")
})

// THE seam against drift: the vocabulary lives in step 6, the weights in step 7. A sixth form added
// there without a weight here would otherwise reach a live run as a `bad-form` refusal on a perfectly
// legal artifact — the defect would be found by the operator, not by the suite.
test("every form of the FRD's vocabulary except Unknown has a weight, and no weight is invented", () => {
  const weighed = Object.keys(MODE_TABLE)
  const declared = FRD_FORM.deltaForms.filter((f) => f !== "Unknown")
  assert.deepEqual([...weighed].sort(), [...declared].sort())
  assert.equal(MODE_TABLE.Unknown, undefined)       // a refusal, never a row of the table
})
