// The findings registry — severity of a code, the evidence a guardrail printed, and the memory of a
// repair loop. Formula: 1 happy + Σ antecedent branches with a DISTINGUISHABLE consequent.

import test from "node:test"
import assert from "node:assert/strict"
import { severityOf, adviceLines, ADVICE_CODES, carriedBlockers } from "./findings.mjs"

test("a code with no resolver of truth is advice; everything else, including the unknown, blocks", () => {
  assert.equal(severityOf("wish-not-requirement"), "advice")
  assert.equal(severityOf("F5"), "blocker")
  // deny-safe: a code nobody declared cannot quietly stop failing acceptance
  assert.equal(severityOf("a-code-invented-tomorrow"), "blocker")
  assert.equal(severityOf(undefined), "blocker")
  assert.ok(ADVICE_CODES.has("design-leak"))
})

test("evidence is the bracketed lines only — a gap printed without a code is not a finding", () => {
  const out = "⚠ [design-leak] R2 называет механизм\n⚠ карта не ответила про src/x.java\nобычная строка"
  assert.deepEqual(adviceLines(out), ["⚠ [design-leak] R2 называет механизм"])
  assert.deepEqual(adviceLines(""), [])
})

// THE MEMORY OF THE LOOP — the run e132f0a1 reproduced as data. Round 1 red on F4 and F5, round 2 red
// on F4 alone, and the role brought F5 back on round 3 because nothing carried it.
test("what was red earlier travels into the next round's feedback", () => {
  const r1 = carriedBlockers({ blockers: "F4 S1: uc=\"UC1,UC4\"\nF5 поле id: 24" })
  assert.deepEqual(r1.seen, ["F4 S1: uc=\"UC1,UC4\"", "F5 поле id: 24"])
  assert.ok(!/Already red/.test(r1.text)) // the first round has nothing to carry

  const r2 = carriedBlockers({ blockers: "F4 S1: uc=\"UC1,UC2\"", seen: r1.seen })
  assert.match(r2.text, /^F4 S1: uc="UC1,UC2"/)
  assert.match(r2.text, /Already red earlier in this run/)
  assert.match(r2.text, /F5 поле id: 24/) // THE line, with its number and its field — not a bare "F5"
  assert.equal(r2.seen.length, 3)
})

test("a demand that is red right now is not also shown as carried — two copies read as two defects", () => {
  const r = carriedBlockers({ blockers: "F5 поле id: 24", seen: ["F5 поле id: 24", "F4 S1: uc пуст"] })
  assert.equal(r.text.match(/F5 поле id: 24/g).length, 1)
  assert.match(r.text, /F4 S1: uc пуст/)
})

test("nothing red before and nothing red now — the text is the blockers verbatim, and seen only grows", () => {
  assert.equal(carriedBlockers({ blockers: "F7 ни одной дельты" }).text, "F7 ни одной дельты")
  assert.deepEqual(carriedBlockers({ blockers: "", seen: [] }), { text: "", seen: [] })
  // first-seen order is kept, and a repeat does not duplicate
  const r = carriedBlockers({ blockers: "b\na", seen: ["a"] })
  assert.deepEqual(r.seen, ["a", "b"])
})
