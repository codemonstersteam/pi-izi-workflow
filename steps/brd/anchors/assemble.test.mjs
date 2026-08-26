// Units of the assembler of substep 2C. By the formula of standards/code.md:
//     N = 1 happy path + Σ antecedent branches with a DISTINGUISHABLE consequent + 1 silence
//
// THE HAPPY PATH IS THE ETALON, not an invented table: `component-tests/steps/brd/4-anchors/in/` is the
// pair of documents the pipeline itself produced on the eddi order (18 rows of the normalized table,
// 90 counted words), `answer.analogue.txt` is the line the live role wrote, and `out/brd.md` is the
// artifact accepted from that. The assembly is checked against it BYTE FOR BYTE: a formatter proven
// on a hand-made string is proven against itself.
//
// The branches below are the ones the antecedents really distinguish: an empty table · a line
// carrying no separator · a candidate exactly ON the threshold · the analogue's word already among
// the candidates · fewer anchors than the form asks for · the counting table absent (SILENCE).

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { numbered, subjectsOf, brdText, SUBJECT_SEP } from "./assemble.mjs"
import { BRD_FORM } from "../../../core/form.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const FIX = join(HERE, "../../../component-tests/steps/brd/4-anchors")
const read = (p) => readFileSync(join(FIX, p), "utf8")

const NORMALIZED = read("in/normalized.md")
const ANALOGUE_LINE = read("answer.analogue.txt").trim()
const ANALOGUE_WORD = "PromptSnippet"
const WANT = read("out/brd.md")

// The counting table lives on disk as `word · files N · weight W` — the io of substep 2B. Reading it
// into `{ word: files }` is the head's work, not the module's, so the test does it here.
const HITS = (() => {
  const hits = {}
  for (const line of read("in/hits.txt").split("\n")) {
    const m = line.match(/^(.+?) · files (\d+) · weight/)
    if (m) hits[m[1]] = Number(m[2])
  }
  return hits
})()

// A small table for the branch units: `object` is the second column.
const table = (...objects) => objects.map((o) => `do | ${o} | with | value`).join("\n")

// --- the etalon: the assembly reproduces the accepted artifact byte for byte --------------------
test("the eddi etalon: 18 R lines, the analogue's line, four anchors — byte for byte", () => {
  const rs = numbered(NORMALIZED)
  assert.equal(rs.ok, true)
  assert.equal(rs.value.length, 18, "the table is 18 rows — the assembler lost or invented one")
  assert.equal(rs.value[0], "R1 create | Glossary | new configuration type | dictionary of bot terms, CRUD with " +
    "versioning, based on Prompt Snippet, resource type `eddi://ai.labs.glossary`")
  assert.equal(rs.value[17].startsWith("R18 define | export file name | agent ZIP archive |"), true,
    "the R number must equal the row number of the table — step 6 quotes `values` of THAT row")

  const subs = subjectsOf(NORMALIZED, HITS, ANALOGUE_WORD)
  assert.deepEqual(subs.value, ["Glossary", "substitution", "versioning", "collision", "PromptSnippet"],
    "the etalon's own subjects[] line — the reworked table moved `terms` (32 files) over the threshold and brought `versioning`/`collision` in")

  const text = brdText(rs.value, ANALOGUE_LINE, subs.value)
  assert.equal(text.ok, true)
  assert.equal(text.value, WANT, "the assembly diverged from the artifact the pipeline accepted")
})

// --- numbered: the table is empty, and a line without a separator is not a row ------------------
test("numbered: no table is an error rail, and a line carrying no `|` never takes a number", () => {
  for (const nothing of ["", "   \n\n", "just a sentence about glossaries", null, undefined]) {
    const r = numbered(nothing)
    assert.equal(r.ok, false, `«${nothing}» carries no row and must not assemble into one`)
    assert.equal(r.error.cls, "no-rows")
  }

  // A preamble, a fence and a closing sentence surround two real rows: the numbers stay 1 and 2, they
  // do not inherit the line numbers of the file.
  const noisy = ["Here is the table:", "```", "add | Glossary | type | x", "", "use | terms | prompt | y",
    "```", "That is all."].join("\n")
  assert.deepEqual(numbered(noisy).value, ["R1 add | Glossary | type | x", "R2 use | terms | prompt | y"])
})

// --- subjectsOf: the threshold is inclusive, and an uncounted word is not a candidate -----------
test("subjectsOf: a candidate exactly on the threshold is taken, one above it is not", () => {
  const hits = { onthe: 5, above: 6, zero: 0, analogue: 3 }
  const r = subjectsOf(table("onthe", "above", "zero", "uncounted"), hits, "analogue", 5)
  assert.deepEqual(r.value, ["onthe", "zero", "analogue"],
    "`above` is over the threshold; `uncounted` is absent from the counting table, so it was never " +
    "counted and is not a candidate; `zero` is a created entity and must be an anchor")

  // The default of `cap` is the single source and nothing here restates the number. On the etalon it
  // is what separates `terms` (32 files, taken) from `conflict` (86, dropped) — the measured gap.
  const byDefault = subjectsOf(table("terms", "conflict", "Glossary"), HITS, ANALOGUE_WORD)
  assert.deepEqual(byDefault.value, ["terms", "Glossary", ANALOGUE_WORD])
  assert.equal(subjectsOf(table("terms", "conflict", "Glossary"), HITS, ANALOGUE_WORD,
    BRD_FORM.anchorMaxFiles - 1).ok, false,
    "one file below the threshold `terms` is gone, and with it the third anchor")
})

test("subjectsOf: the analogue's word stands once and last, however often the table names it", () => {
  // The analogue is narrow enough to pass the threshold on its own merit — otherwise the threshold,
  // not the rule under test, would be what keeps it out of the candidate list.
  const hits = { promptsnippet: 5, glossary: 1, terms: 32 }
  const r = subjectsOf(table("PromptSnippet", "Glossary", "promptsnippet", "terms"), hits, "PromptSnippet")
  assert.deepEqual(r.value, ["Glossary", "terms", "PromptSnippet"],
    "the analogue is placed by hand and only once, at the end — it is the anchor whose coverage is measured")
})

test("subjectsOf: fewer anchors than the form asks for is a finding, not a short list", () => {
  const r = subjectsOf(table("agent", "configuration"), { agent: 895, configuration: 631 }, "PromptSnippet")
  assert.equal(r.ok, false)
  assert.equal(r.error.cls, "subjects-thin")
  assert.match(r.error.detail, new RegExp(String(BRD_FORM.subjectsMin)))
})

// --- SILENCE on a missing operand ---------------------------------------------------------------
test("subjectsOf: with no counting table the module says so instead of anchoring everything", () => {
  for (const nothing of [undefined, null, ""]) {
    const r = subjectsOf(NORMALIZED, nothing, ANALOGUE_WORD)
    assert.equal(r.ok, false, "no counts must never read as «every word is narrow»")
    assert.equal(r.error.cls, "hits-absent")
  }
  // The model's one line brought nothing — the other operand of the same function.
  assert.equal(subjectsOf(NORMALIZED, HITS, "  ").error.cls, "analogue-absent")
})

// --- brdText: an incomplete artifact is not written, and a one-line field stays one line --------
test("brdText: a missing part and a newline inside a one-line field both stay off the disk", () => {
  const rs = ["R1 add | Glossary | type | x"]
  const subs = ["Glossary", "terms", "PromptSnippet"]
  assert.equal(brdText([], ANALOGUE_LINE, subs).error.cls, "missing-part")
  assert.equal(brdText(rs, "", subs).error.cls, "missing-part")
  assert.equal(brdText(rs, ANALOGUE_LINE, []).error.cls, "missing-part")

  // Run 46edab60: a field declared one line long arrived multi-line, and the file parsed into a stump.
  assert.equal(brdText(rs, "analogue: PromptSnippet\n— files 62", subs).error.cls, "multiline-value")

  const t = brdText(rs, ANALOGUE_LINE, subs)
  assert.equal(t.value.endsWith(`subjects[]: Glossary${SUBJECT_SEP}terms${SUBJECT_SEP}PromptSnippet\n`), true)
})
