// Units of the normalize core (substep 2A). By the formula of standards/code.md:
//     N = 1 happy path + Σ antecedent branches with a DISTINGUISHABLE consequent + 1 silence
// Two rules are judged here and no third exists — four columns, values copied whole — so: the happy
// path, one red per rule, silence with no operand, plus the totality of the parser.
//
// THE HAPPY PATH IS THE ETALON, not an invented table: `component-tests/etalon-eddi/.agent/normalized.md`
// is what the live role wrote on 22.08.2026 and what the next steps consume. A rule that reddens on
// it has drifted away from the document the pipeline already accepted (standards/component-test.md).

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { parseRows, judgeRows, COLUMNS, CLASSES } from "./normalize.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const ETALON = readFileSync(join(HERE, "../../../component-tests/etalon-eddi/.agent/normalized.md"), "utf8")

// --- happy path: the etalon parses into rows and the guardrail accepts it -------------------------
test("the eddi etalon: every row carries four columns and the guardrail says nothing", () => {
  const rows = parseRows(ETALON)
  assert.equal(rows.length, 16, "the recorded answer is 16 rows — the parser lost or invented one")
  assert.deepEqual(rows.map((r) => r.cells.length), Array(16).fill(COLUMNS))
  assert.equal(rows[13].verb, "export")
  assert.equal(rows[13].values, "as `{id}.glossary.json` plus `{id}.descriptor.json`")

  const v = judgeRows(rows)
  assert.deepEqual(v.blockers, [], "the guardrail reddened on the document the pipeline accepted")
  assert.equal(v.silent, false, "there were 16 rows to judge — silence would mean the operand was lost")
})

// --- rule 1: exactly four columns -----------------------------------------------------------------
// And with it the second promise of judgeRows: ALL findings at once. One finding per round means a
// table of sixteen rows costs sixteen rounds, and the step has three.
test("columns: a row with three columns and a row with an empty one — both red, in one answer", () => {
  const v = judgeRows(parseRows([
    "create | Glossary configuration | E.D.D.I | as a new config type",
    "implement | CRUD with versioning | repeating Prompt Snippet mechanism",
    "cache | Glossary data | Caffeine |",
  ].join("\n")))

  assert.equal(v.blockers.length, 2, "the judge stopped at the first finding")
  assert.deepEqual(v.blockers.map((b) => b.cls), ["columns", "columns"])
  assert.match(v.blockers[0].text, /row 2/, "the blocker does not name the row — nothing to search for")
  assert.match(v.blockers[1].text, /row 3/)
  // A blocker without an exit is half the work (standards/guardrail.md): the sample row must be there.
  for (const b of v.blockers) assert.match(b.text, /export \| Glossary \| agent ZIP archive \|/)
})

// --- rule 2: values are copied whole --------------------------------------------------------------
test("clipped-value: an ellipsis and a half-written placeholder are red, «less than 64» is not", () => {
  const v = judgeRows(parseRows([
    "export | Glossary | agent ZIP archive | as {id}.glossary.json plus …",
    "enable | substitution | prompt engine | using {{glossary.<term>} syntax",
    "constrain | Term key | Glossary | to less than 64 characters, a < b",
  ].join("\n")))

  assert.deepEqual(v.blockers.map((b) => b.cls), ["clipped-value", "clipped-value"],
    "a comparison sign was read as a placeholder — the role is blamed for what it did not write")
  assert.match(v.blockers[0].text, /row 1/)
  assert.match(v.blockers[1].text, /row 2/)
  for (const b of v.blockers) assert.match(b.text, /WHOLE/, "the blocker does not say what to write instead")
})

// --- SILENCE: no rows, nothing to judge -----------------------------------------------------------
// Not red (a dead end the role cannot close: it has no table to fix) and not green (that would sign
// off on rubbish). Silence, said out loud (standards/guardrail.md).
test("silence: there are no rows — the rule says so instead of reddening at random", () => {
  for (const v of [judgeRows([]), judgeRows(), judgeRows(parseRows("A table follows.\n\n"))]) {
    assert.deepEqual(v.blockers, [])
    assert.equal(v.silent, true, "with no rows the verdict is indistinguishable from an accepted table")
    assert.equal(v.judged, 0)
  }
})

// --- the parser is total, and only a row is a row --------------------------------------------------
test("parseRows is total: no answer at all gives an empty parse, prose and rulers are not rows", () => {
  for (const junk of [undefined, null, "", 42, {}, []]) assert.deepEqual(parseRows(junk), [])

  const rows = parseRows([
    "Here is the normalized table:",
    "```",
    "| verb | object | instrument | values |",
    "|---|---|---|---|",
    "add | rotation | audit log | keeps the last 90 days",
    "```",
    "Let me know if you want more rows.",
  ].join("\n"))
  assert.equal(rows.length, 2, "a fence, a ruler or a sentence was counted as a row — or a row was lost")
  assert.equal(rows[1].n, 5, "the row number is the line number in the answer, or the blocker points nowhere")
  assert.equal(rows[1].values, "keeps the last 90 days")
})

// The rule codes the role reads live in one place, and the blockers use those names.
test("every class the module declares is a class it can actually return", () => {
  const seen = new Set(judgeRows(parseRows([
    "implement | CRUD | Prompt Snippet",
    "export | Glossary | agent ZIP archive | as {id}.glossary.json plus …",
  ].join("\n"))).blockers.map((b) => b.cls))
  assert.deepEqual([...seen].sort(), [...CLASSES].sort())
})
