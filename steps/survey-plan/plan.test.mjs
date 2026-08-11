// Slice `survey-plan`: the survey layout — a PURE core; its io (ext/index.mjs::survey) is proven by a
// live run, not by units (standards/code.md). Formula: 1 happy + Σ antecedent branches with a
// DISTINGUISHABLE consequent — the subtree fits · the subtree does not (descent + cutting the
// directory's own files) · an id collision · no files at all. The second unit is the STABILITY SEAM:
// bring the flat cut back and it turns red.

import test from "node:test"
import assert from "node:assert/strict"
import { newPlan, cellId, CELL_FILES, CELL_BYTES, SPINE_CELL } from "./plan.mjs"

const file = (path, bytes = 100, subjects = []) => ({ path, bytes, subjects })

test("happy: the spine is its own cell, a subtree is one cell, and the id comes from the PATH", () => {
  const spine = [file("pom.xml", 3120)]
  const files = [
    file("pom.xml", 3120),
    file("src/main/java/FruitResource.java", 1180, ["fruit"]),
    file("src/main/java/Legume.java", 800, ["limit"]),
    file("src/test/java/FruitResourceIT.java", 900, ["fruit"]),
  ]
  const r = newPlan({ files, spine, subjects: ["fruit", "limit", "search"] })
  assert.equal(r.ok, true)

  const plan = r.value
  assert.equal(plan.files, 4)
  assert.equal(plan.bytes, 6000)
  assert.deepEqual(plan.subjects, ["fruit", "limit", "search"])
  assert.deepEqual(plan.gaps, ["search"])                 // an anchor that matched nothing is DECLARED

  assert.equal(plan.cells[0].id, SPINE_CELL)
  assert.equal(plan.cells[0].kind, "spine")
  assert.deepEqual(plan.cells[0].files.map((f) => f.path), ["pom.xml"])

  // Everything outside the spine fits both ceilings → one cell, named after its directory: the root.
  const survey = plan.cells.slice(1)
  assert.deepEqual(survey.map((c) => c.id), ["root"])
  assert.ok(survey.every((c) => c.kind === "survey"))
  const got = survey.flatMap((c) => c.files.map((f) => f.path))
  assert.equal(got.length, new Set(got).size)             // no overlap
  assert.deepEqual([...got].sort(), files.map((f) => f.path).filter((p) => p !== "pom.xml").sort())
  assert.deepEqual(survey[0].subjects, ["fruit", "limit"]) // a cell's mark is the union of its files'
})

test("stability seam: an added file changes ONLY its own cell — neighbouring ids do not move", () => {
  const big = (dir, n, bytes) => Array.from({ length: n }, (_, i) => file(`${dir}/f${i}.java`, bytes))
  // The root does not fit (3 directories of 15 files), so it unfolds into three subtree cells.
  const before = [...big("alpha", 15, 100), ...big("beta", 15, 100), ...big("gamma", 15, 100)]
  const after = [...before, file("alpha/NEW.java", 100)]

  const ids = (files) => newPlan({ files, spine: [], subjects: [] }).value.cells.map((c) => c.id)
  assert.deepEqual(ids(before), ["alpha", "beta", "gamma"])
  assert.deepEqual(ids(after), ["alpha", "beta", "gamma"])

  const cellsOf = (files) => Object.fromEntries(
    newPlan({ files, spine: [], subjects: [] }).value.cells.map((c) => [c.id, c.files.map((f) => f.path)]))
  const a = cellsOf(before)
  const b = cellsOf(after)
  assert.deepEqual(b.beta, a.beta)                        // the neighbour is untouched in composition…
  assert.deepEqual(b.gamma, a.gamma)                      // …and in name
  assert.equal(b.alpha.length, a.alpha.length + 1)        // the edit landed in exactly its own subtree
})

test("the subtree does not fit: descend into subdirectories, cut the directory's own files", () => {
  const files = [
    file("web/a.js", CELL_BYTES * 0.75),                  // `web`'s own two files do not fit together
    file("web/b.js", CELL_BYTES * 0.75),
    ...Array.from({ length: CELL_FILES + 1 }, (_, i) => file(`web/ui/c${i}.js`, 100)),  // nor does the subdir
  ]
  const cells = newPlan({ files, spine: [], subjects: [] }).value.cells
  // `web/ui` overflows on file count → it unfolds and is cut into two chunks under its own name;
  // then `web`'s own files, into two chunks by bytes. No id is an ordinal of the plan.
  assert.deepEqual(cells.map((c) => c.id), ["web~ui~~1", "web~ui~~2", "web~~1", "web~~2"])
  const covered = cells.flatMap((c) => c.files.map((f) => f.path))
  assert.equal(covered.length, files.length)
  assert.equal(new Set(covered).size, files.length)
})

test("a directory named like the spine cell does not steal its id — it gets a separated one", () => {
  const many = (dir, n) => Array.from({ length: n }, (_, i) => file(`${dir}/f${i}.go`, 100))
  const r = newPlan({ files: [...many("spine", 15), ...many("other", 10)], spine: [file("go.mod", 50)], subjects: [] })
  assert.deepEqual(r.value.cells.map((c) => `${c.id}:${c.kind}`),
    [`${SPINE_CELL}:spine`, "other:survey", "spine~~2:survey"])
  assert.equal(cellId("src/main/java"), "src~main~java")
  assert.equal(cellId(""), "root")
})

test("no files at all — err(no-files): there is nothing to map", () => {
  const r = newPlan({ files: [], spine: [], subjects: ["fruit"] })
  assert.equal(r.ok, false)
  assert.equal(r.error.cls, "no-files")
})
