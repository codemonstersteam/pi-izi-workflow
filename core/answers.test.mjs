// The format of accumulated answers. It exists because run-5 (F17) showed that while the SOURCE of
// numbers is the whole FILE, a role may carry any number from its own question's list of alternatives
// into a criterion — its own question becomes its source of facts.

import test from "node:test"
import assert from "node:assert/strict"
import { answerEntry, newAnswers, looksLikeTemplate } from "./answers.mjs"

// --- answerEntry: total, no branches ----------------------------------------------------------

test("an answer entry carries the question and the answer on separate lines", () => {
  assert.equal(answerEntry({ question: "предел?", text: "20" }), "- вопрос: предел?\n  ответ: 20\n")
})

// --- newAnswers: 1 happy + 1 branch (malformed) -----------------------------------------------

test("answers parse into values, while the question stays the role's own text", () => {
  const r = newAnswers("- вопрос: cap — 20 (alternatives: 50, 100)?\n  ответ: 20\n")
  assert.deepEqual(r.value.map((a) => a.text), ["20"])
})

test("an empty file is an empty list, not a refusal: the first exchange has no answers", () => {
  assert.deepEqual(newAnswers("").value, [])
})

test("a question with no answer — half a pair is neither a fact nor a question", () => {
  assert.equal(newAnswers("- вопрос: предел?\n").error.cls, "malformed")
})

// F17 live: the numbers of an alternatives list belong to the QUESTION and never reach the values.
test("numbers from a question's alternatives never become a source", () => {
  const r = newAnswers("- вопрос: cap — 20 by default (alternatives: 50, 100)?\n  ответ: 20\n")
  assert.equal(r.value.map((a) => a.text).join(" ").includes("100"), false)
})

// --- looksLikeTemplate: total, 1 happy + 1 distinguishable outcome ----------------------------
// S13: one check, two callers (bin/answer.mjs, ext/index.mjs::izi_answer) — not two copies.

test("an ordinary answer does not look like a template", () => {
  assert.equal(looksLikeTemplate("20"), false)
})

test("a placeholder of the form <...> is a template, not an answer", () => {
  assert.equal(looksLikeTemplate("<operator answer>"), true)
})
