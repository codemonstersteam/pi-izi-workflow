// The entry rule is PURE (standards/code.md), tested by import rather than by subprocess: the io
// moved to ext/index.mjs (readText), and only the judge of the text stays here. Formula: 1 happy +
// Σ antecedent branches — exactly two distinguishable refusals (empty, too-long).

import test from "node:test"
import assert from "node:assert/strict"
import { checkTaskText, TASK_LINES_CAP } from "./task.mjs"

test("non-empty text within the line limit — ok, carrying lines and words", () => {
  const r = checkTaskText("Сделать штуку, которая делает дело.\n")
  assert.equal(r.ok, true)
  assert.equal(r.value.words, 5)
})

test("empty or whitespace-only text — err(empty)", () => {
  const r = checkTaskText("   \n\n  \n")
  assert.equal(r.ok, false)
  assert.equal(r.error.cls, "empty")
})

test(`text past ${TASK_LINES_CAP} lines — err(too-long)`, () => {
  const text = Array.from({ length: TASK_LINES_CAP + 1 }, (_, i) => `строка ${i}`).join("\n")
  const r = checkTaskText(text)
  assert.equal(r.ok, false)
  assert.equal(r.error.cls, "too-long")
})

test(`exactly ${TASK_LINES_CAP} lines — the limit is inclusive, ok`, () => {
  const text = Array.from({ length: TASK_LINES_CAP }, (_, i) => `строка ${i}`).join("\n")
  const r = checkTaskText(text)
  assert.equal(r.ok, true)
})

test("undefined/null — total, never throws, judged as empty", () => {
  assert.equal(checkTaskText(undefined).error.cls, "empty")
  assert.equal(checkTaskText(null).error.cls, "empty")
})
