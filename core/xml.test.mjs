// The CLASS BOUNDARY of core/xml.mjs, and only it. The scanner's other exports (`attrs`, `tag`,
// `elem`, `esc`) are proven where their grammars live — steps/scope/part.test.mjs,
// steps/design/*.test.mjs, steps/intake/frd.test.mjs — and each of their BUG_FIX_CONTEXTs names the
// slice test that caught it. What has no owner among the slices is the LINE BETWEEN the two ways one
// attribute value is cut, because that line is what a reader picks WITHOUT reading either slice:
// `tokens` for a list of tokens, `alts` for alternatives of text. Live run 27b37fdb was bought by
// picking wrong, so the boundary gets a seam of its own.

import test from "node:test"
import assert from "node:assert/strict"
import { tokens, alts } from "./xml.mjs"

test("class boundary: a list of TOKENS reads the same through all three separators, text alternatives read only through `|`", () => {
  // A token carries no space, no comma and no bar, so all three separators name the same list. This
  // is what makes ` | ` in a schema and ` ` in a role's example the same instruction — the difference
  // the live run spent four red rounds on.
  assert.deepEqual(tokens("a | b"), ["a", "b"])
  assert.deepEqual(tokens("a, b"), ["a", "b"])
  assert.deepEqual(tokens("a b"), ["a", "b"])
  assert.deepEqual(tokens("UC1/in | UC1/post|UC1/2a"), ["UC1/in", "UC1/post", "UC1/2a"])

  // A member of `alts` is TEXT: the spaces and commas inside it are content, not separators, and
  // `tokens` would shred it into words. That is the whole reason the two functions exist apart.
  assert.deepEqual(alts("201 {bookingId} | 409 {conflict}"), ["201 {bookingId}", "409 {conflict}"])
  assert.deepEqual(alts("Loan(loanId,dueOn) | 409 LOAN_OVERDUE"), ["Loan(loanId,dueOn)", "409 LOAN_OVERDUE"])
  assert.deepEqual(tokens("201 {bookingId} | 409 {conflict}"), ["201", "{bookingId}", "409", "{conflict}"])
})

test("totality: garbage, undefined and an empty value are an empty list, not a throw", () => {
  for (const f of [tokens, alts]) {
    assert.deepEqual(f(undefined), [])
    assert.deepEqual(f(null), [])
    assert.deepEqual(f(""), [])
    assert.deepEqual(f("   "), [])
    // Frozen: the list is read by guardrails that pass it on, and a shared mutable array is how one
    // reader's filter becomes another reader's fact.
    assert.equal(Object.isFrozen(f("a | b")), true)
  }
})
