// The `hits` module: the four stages of stage 2B — candidates, grep, IDF, the {HITS} slot.
// One unit per RULE (standards/guardrail.md), and one SILENCE unit per external operand: with no
// text, no repository and no result the module must stay quiet, not invent a table.
//
// The fixtures are TINY AND LOCAL. The facts these units pin were measured on
// sandbox/runbox/eddi (1854 files) — `export` 92 files, `descriptor` 290, `PromptSnippet` 62,
// `glossary` weight 7.53 vs `config` 0.51 — but a test that reads somebody else's checkout is a
// test that goes red when that checkout moves. The RULE is pinned here; the NUMBER lives in
// brd-backlog.md, TICKET 02.

import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { candidatesOf, hitsOf, tableOf, MAX_CANDIDATES, BACKGROUND } from "./hits.mjs"

// A normalized table, the real shape of `.agent/normalized.md`: verb | object | instrument | values.
const TABLE = [
  "expose | REST endpoint | Glossary | at `/glossarystore/glossaries` following `*store/*` pattern",
  "export | Glossary | agent ZIP archive | as `{id}.glossary.json` plus `{id}.descriptor.json`",
  "cache | Glossary data | Caffeine | with TTL matching PromptSnippetService",
].join("\n")

// A repository fixture: `word` reaches the counter through the file TEXT and through the PATH.
function repo(files) {
  const dir = mkdtempSync(join(tmpdir(), "izi-hits-"))
  for (const [path, text] of Object.entries(files)) {
    const slash = path.lastIndexOf("/")
    if (slash > 0) mkdirSync(join(dir, path.slice(0, slash)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  return dir
}

// One repository for the weight units: `config` in 4 files of 6 (wide, but under the background
// threshold), `glossary` in 1 (rare), `termstore` in none (a created entity).
const RARE_AND_WIDE = repo({
  "a.java": "config glossary", "b.java": "config", "c.java": "config", "d.java": "config",
  "e.java": "plain", "f.java": "plain",
})

// --- stage 1, candidatesOf: 4 rules + silence ------------------------------------------------------

// Rule 1 — the words of ALL FOUR columns, `values` included. This is the whole point of taking
// candidates from the table instead of TASK.md: on a Russian request `export` is not a candidate at
// all, on the table it is one and lands on 92 files.
test("candidates come from all four columns of the normalized table", () => {
  const c = candidatesOf(TABLE)
  for (const w of ["export", "Glossary", "Caffeine", "descriptor", "glossarystore", "archive"])
    assert.ok(c.includes(w), `${w} is not a candidate`)
})

// Rule 2 — prefixes of a compound name: the inverse of the two-word join. The table writes
// `PromptSnippetService` (29 files), the valuable anchor is `PromptSnippet` (62).
test("a compound name yields its prefixes, an abbreviation is not exploded into letters", () => {
  const c = candidatesOf("PromptSnippetService")
  assert.ok(c.includes("PromptSnippet"))
  assert.ok(c.includes("Prompt"))
  assert.equal(candidatesOf("CRUD with versioning").some((w) => w === "CRU" || w === "CR"), false)
})

// Rule 3 — words inside names, paths and URIs. `\b` alone does not see them: an underscore is a word
// character, so `prompt_snippet` yields NOTHING through word boundaries.
test("names, paths and URIs are cut into words", () => {
  assert.ok(candidatesOf("{id}.descriptor.json").includes("descriptor"))
  const p = candidatesOf("/glossarystore/glossaries")
  assert.ok(p.includes("glossarystore") && p.includes("glossaries"))
  assert.ok(candidatesOf("prompt_snippet").includes("snippet"))
  assert.ok(candidatesOf("eddi://ai.labs.glossary").includes("glossary"))
})

// Rule 4 — the stop list, and the ceiling: every word of the table is a candidate, so the ceiling is
// what keeps the grep inside its one-second budget.
test("function words are dropped and the list is capped", () => {
  assert.equal(candidatesOf("the value must be that").includes("the"), false)
  const many = Array.from({ length: 400 }, (_, i) => `word${i}alpha`).join(" ")
  assert.ok(candidatesOf(many).length <= MAX_CANDIDATES)
})

// SILENCE: no text — no candidates, and no exception either.
test("no text — an empty list, not a refusal", () => {
  assert.deepEqual(candidatesOf(""), [])
  assert.deepEqual(candidatesOf(), [])
})

// --- stage 2, hitsOf: substring grep -----------------------------------------------------------------

// Substring and case-insensitive, over the PATH as well as the text: word-boundary matching was
// tried and refuted — it loses `fruits` for the anchor `fruit` and `FruitResourceIT` whole.
test("the count is files, matched as a substring, case-insensitively, path included", () => {
  const dir = repo({
    "a.java": "class GlossaryStore {}",
    "b.java": "// no match here",
    "glossary-notes.md": "prose",
    "c.java": "fruits and vegetables",
  })
  const r = hitsOf(dir, ["glossary", "fruit"])
  assert.equal(r.files, 4)
  assert.equal(r.hits.glossary, 2)   // the class name and the file name
  assert.equal(r.hits.fruit, 1)      // `fruits` counts for the anchor `fruit`
})

// --- stage 3, IDF ------------------------------------------------------------------------------------

// The count is not comparable between words, the weight is: log(N/df).
test("the rarer word weighs more, and zero files gets the maximum weight", () => {
  const r = hitsOf(RARE_AND_WIDE, ["glossary", "config", "termstore"])
  assert.equal(r.files, 6)
  assert.ok(r.idf.glossary > r.idf.config)
  assert.equal(r.hits.termstore, 0)
  // A created entity is not a division by zero and not a defect: it takes the repository's maximum.
  assert.equal(r.idf.termstore.toFixed(4), Math.log(6).toFixed(4))
  assert.deepEqual(r.dead, ["termstore"])
})

// The BACKGROUND threshold is NOT replaced by IDF: it cuts the language's keywords (`import` in 85%
// of eddi's files), the weight orders what is left. Removing the threshold puts `import` back at the
// top of the candidate list with a legitimate-looking weight.
test("a word in almost every file is background, not an anchor", () => {
  const files = {}
  for (let i = 0; i < 10; i++) files[`f${i}.java`] = i < 9 ? "import x;" : "plain"
  for (let i = 0; i < 5; i++) files[`f${i}.java`] += " glossary"
  const r = hitsOf(repo(files), ["import", "glossary"])
  assert.ok(9 / 10 > BACKGROUND)
  assert.deepEqual(r.background, ["import"])
  assert.equal("import" in r.hits, false)
  assert.equal("import" in r.idf, false)
  assert.equal(r.hits.glossary, 5)
})

// SILENCE: no repository and no words — zeros and an empty answer, never an accusation.
test("no repository, no words — the measurement stays silent", () => {
  const r = hitsOf("/no/such/place", ["glossary"])
  assert.deepEqual(r, { hits: {}, idf: {}, files: 0, dead: ["glossary"], background: [] })
  assert.deepEqual(hitsOf(repo({ "a.java": "x" }), []).hits, {})
})

// --- stage 4, tableOf: the {HITS} slot ---------------------------------------------------------------

// Lines by descending weight. Zero is NOT hidden and leads: a word this repository does not carry is
// a CREATED entity, and the gate role must see it to name it an anchor.
test("the slot is lines by descending weight, and zero is not hidden", () => {
  const lines = tableOf(hitsOf(RARE_AND_WIDE, ["glossary", "config", "termstore"])).split("\n")
  assert.equal(lines[0], "termstore · files 0 · weight 1.79")
  assert.equal(lines[1], "glossary · files 1 · weight 1.79")
  assert.equal(lines[2], "config · files 4 · weight 0.41")
  assert.equal(tableOf(hitsOf(RARE_AND_WIDE, ["glossary", "config"]), 1).split("\n").length, 1)
})

// SILENCE: no measurement — an empty slot, not a fabricated table.
test("no measurement — an empty slot", () => {
  assert.equal(tableOf(), "")
  assert.equal(tableOf({}), "")
  assert.equal(tableOf({ hits: {}, idf: {}, files: 0 }), "")
})
