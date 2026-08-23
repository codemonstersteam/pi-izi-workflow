// The `spread` module: words → files → packages → share. One unit per RULE
// (standards/guardrail.md), and one SILENCE unit per external operand: with no repository, no
// anchors and no analogue the map must stay quiet, not invent places.
//
// The fixtures are TINY AND LOCAL. The facts these units pin were measured on
// sandbox/runbox/eddi (1854 files) — `PromptSnippet` 62 files in 20 directories, `agent` 895,
// `Glossary` 1 — but a test that reads somebody else's checkout goes red when that checkout moves.
// The RULE is pinned here; the NUMBERS live in brd-backlog.md TICKET 04 and in the etalon artifact
// component-tests/etalon-eddi/.agent/anchors.json.

import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { filesOf, packagesOf, spreadOf, MAX_PACKAGES } from "./spread.mjs"

function repo(files) {
  const dir = mkdtempSync(join(tmpdir(), "izi-spread-"))
  for (const [path, text] of Object.entries(files)) {
    const slash = path.lastIndexOf("/")
    if (slash > 0) mkdirSync(join(dir, path.slice(0, slash)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  return dir
}

// Two anchors and an analogue over one small tree: `glossary` in 3 files (one of them ONLY through
// the path), `snippet` in 3 (one of them only as a substring of `snippets`), `nowhere` in none.
const TREE = repo({
  "src/a/GlossaryStore.java": "class GlossaryStore { Snippet s; }",
  "src/a/Other.java": "// glossary mentioned in a comment",
  "docs/glossary-notes.md": "prose with no marker word inside",
  "src/b/SnippetService.java": "class SnippetService {}",
  "README.md": "prose about snippets",
  "src/b/Plain.java": "nothing here",
})

// --- filesOf: the paths, not the count -----------------------------------------------------------

// The match is a SUBSTRING, case-insensitive, over the text AND the path — the same rule hitsOf
// counts by, so that the count shown to the gate and the paths handed to step 3 are one measurement.
test("filesOf returns the paths that carry the word, matched in text or in path", () => {
  // `docs/glossary-notes.md` carries the word in its PATH only, `README.md` only inside `snippets`.
  assert.deepEqual(filesOf(TREE, "glossary"),
    ["docs/glossary-notes.md", "src/a/GlossaryStore.java", "src/a/Other.java"])
  assert.deepEqual(filesOf(TREE, "Snippet"),
    ["README.md", "src/a/GlossaryStore.java", "src/b/SnippetService.java"])
  assert.deepEqual(filesOf(TREE, "nowhere"), [])
})

// SILENCE: no repository and no word — an empty list, never a throw.
test("filesOf stays silent on a missing repository and on an empty word", () => {
  assert.deepEqual(filesOf("/no/such/place", "glossary"), [])
  assert.deepEqual(filesOf(TREE, "  "), [])
  assert.deepEqual(filesOf(TREE), [])
})

// --- packagesOf: the summary step 3 reads --------------------------------------------------------

// Folded by directory, by descending count, then by name; a root file has a package too ("."), and
// the summary is CAPPED — an order has room for lines, not for 62 paths.
test("packagesOf folds paths into directories, sorts by count and caps the summary", () => {
  assert.deepEqual(packagesOf(["a/x.java", "a/y.java", "b/z.java", "top.md"]),
    { "a": 2, "b": 1, ".": 1 })
  const wide = Array.from({ length: 20 }, (_, i) => `d${String(i).padStart(2, "0")}/f.java`)
  assert.equal(Object.keys(packagesOf(wide)).length, MAX_PACKAGES)
  assert.equal(Object.keys(packagesOf(wide, 0)).length, 20)
})

// SILENCE: nothing measured — an empty summary, not a fabricated one.
test("packagesOf stays silent with no paths", () => {
  assert.deepEqual(packagesOf(), {})
  assert.deepEqual(packagesOf([]), {})
})

// --- spreadOf: the artifact ----------------------------------------------------------------------

// The happy path pins the whole shape: per-anchor files, packages and share, the UNION in `marked`
// (what step 3 reads for density), and the analogue as a SEPARATE block — it is a second query about
// where a solved case already lives, so it must not inflate the union.
test("spreadOf maps anchors to files, packages and share, and keeps the analogue apart", () => {
  const s = spreadOf({ cwd: TREE, anchors: ["glossary", "nowhere"], analogue: "Snippet" })
  assert.equal(s.files, 6)
  assert.deepEqual(s.anchors.map((a) => a.word), ["glossary", "nowhere"])
  assert.deepEqual(s.anchors[0].packages, { "src/a": 2, "docs": 1 })
  assert.equal(s.anchors[0].share, 0.5)          // 3 of 6
  assert.equal(s.anchors[1].share, 0)            // a created entity: zero files is a fact, not a bug
  assert.deepEqual(s.marked,
    ["docs/glossary-notes.md", "src/a/GlossaryStore.java", "src/a/Other.java"])
  assert.equal(s.analogue.word, "Snippet")
  assert.equal(s.analogue.files.length, 3)
  assert.deepEqual(s.analogue.packages, { ".": 1, "src/a": 1, "src/b": 1 })
  assert.equal(s.marked.includes("README.md"), false)   // the analogue is not in the union
})

// `analogue: none` is a LEGAL answer, not a failure: absence is a case, not an empty value. `null`
// and `{ word: "", files: [] }` read differently to step 3B — the second one claims an analogue
// exists and has no files, which is the one thing that IS a defect.
test("spreadOf turns `analogue: none` into null, keeping the anchors measured", () => {
  const s = spreadOf({ cwd: TREE, anchors: ["glossary"], analogue: "none" })
  assert.equal(s.analogue, null)
  assert.equal(s.anchors[0].files.length, 3)
  assert.equal(spreadOf({ cwd: TREE, anchors: ["glossary"] }).analogue, null)
})

// SILENCE, twice: no anchors and no analogue — nothing was asked, so the tree is not even walked;
// a repository that is not there — an empty measurement, not a throw and not an accusation.
test("spreadOf stays silent with no words and with no repository", () => {
  assert.deepEqual(spreadOf({ cwd: TREE }),
    { files: 0, marked: [], anchors: [], analogue: null })
  assert.deepEqual(spreadOf(), { files: 0, marked: [], anchors: [], analogue: null })
  const gone = spreadOf({ cwd: "/no/such/place", anchors: ["glossary"], analogue: "Snippet" })
  assert.equal(gone.files, 0)
  assert.deepEqual(gone.anchors, [{ word: "glossary", files: [], packages: {}, share: 0 }])
  assert.deepEqual(gone.analogue, { word: "Snippet", files: [], packages: {} })
})
