// Slice `scope`: the cache decision — a PURE core; its io (ext/index.mjs::reuse/remember) is proven
// by a live run, not by units (standards/code.md). Formula: 1 happy (a hit) + one unit per antecedent
// branch with a distinguishable consequent — a miss by content, by composition, by grammar version,
// and the two absences (no entry, no hash). Backlog W3a demands exactly these.

import test from "node:test"
import assert from "node:assert/strict"
import { entryFor, decide } from "./cache.mjs"

const cell = {
  id: "src~main",
  kind: "survey",
  files: [
    { path: "src/main/Api.java", sha1: "aaa1", bytes: 10 },
    { path: "src/main/Model.java", sha1: "bbb2", bytes: 20 },
  ],
}
const stored = entryFor(cell, "2")

test("hit: same grammar, same composition, same hashes — the scout is not called", () => {
  assert.deepEqual(decide({ cell, stored, grammar: "2" }), { reuse: true, why: "hit" })
  // entryFor normalises the order: two walks of a tree need not agree between runs
  const shuffled = { ...cell, files: [...cell.files].reverse() }
  assert.equal(decide({ cell: shuffled, stored, grammar: "2" }).reuse, true)
})

test("miss by content: one file changed — its cell is recomputed, and the file is NAMED", () => {
  const edited = { ...cell, files: [cell.files[0], { ...cell.files[1], sha1: "ZZZ" }] }
  assert.deepEqual(decide({ cell: edited, stored, grammar: "2" }),
    { reuse: false, why: "content src/main/Model.java" })
})

test("miss by composition: a file added or removed — the other hashes decide nothing", () => {
  const added = { ...cell, files: [...cell.files, { path: "src/main/New.java", sha1: "ccc3" }] }
  assert.deepEqual(decide({ cell: added, stored, grammar: "2" }), { reuse: false, why: "composition" })

  const removed = { ...cell, files: [cell.files[0]] }
  assert.deepEqual(decide({ cell: removed, stored, grammar: "2" }), { reuse: false, why: "composition" })
})

test("miss by grammar version: a part of the old shape is never handed to the new guardrail", () => {
  assert.deepEqual(decide({ cell, stored, grammar: "3" }), { reuse: false, why: "grammar 2→3" })
  assert.deepEqual(decide({ cell: { ...cell, kind: "spine" }, stored, grammar: "2" }),
    { reuse: false, why: "kind survey→spine" })
})

test("absence is not a match: no entry, and nothing to compare with, both read as a miss", () => {
  assert.deepEqual(decide({ cell, stored: null, grammar: "2" }), { reuse: false, why: "no-entry" })
  assert.deepEqual(decide({}), { reuse: false, why: "no-entry" })

  const unhashed = { ...cell, files: [{ path: "src/main/Api.java", sha1: "" }, cell.files[1]] }
  assert.deepEqual(decide({ cell: unhashed, stored: entryFor(unhashed, "2"), grammar: "2" }),
    { reuse: false, why: "no-sha1 src/main/Api.java" })
})
