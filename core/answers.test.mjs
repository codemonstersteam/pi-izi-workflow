// The format of accumulated answers. It exists because run-5 (F17) showed that while the SOURCE of
// numbers is the whole FILE, a role may carry any number from its own question's list of alternatives
// into a criterion — its own question becomes its source of facts.
//
// Since run 46edab60 it also carries the ROUND-TRIP seam: this file is written by one module and read
// by the same one, and the pair had never met in a test — a batch of six questions went to disk and
// came back a stump (standards/code.md §TESTS).

import test from "node:test"
import assert from "node:assert/strict"
import { newExchange, newAnswers, looksLikeTemplate, stripOrdinal } from "./answers.mjs"

// --- newExchange + newAnswers: the round trip ---------------------------------------------------

test("round trip on the HARDEST legal value: multi-line, Cyrillic, angle brackets, blank lines", () => {
  const pairs = [
    { n: 1, question: "1) регистронезависимый поиск?\n   альтернативы: нет, регистрозависимый", text: "да" },
    { n: 2, question: "2) предел ответа — a < b & c > d?", text: "не больше 10 записей\n\nостальное — вторым запросом" },
  ]
  const written = newExchange(pairs)
  assert.equal(written.ok, true)

  const back = newAnswers(written.value)
  assert.equal(back.ok, true)
  assert.deepEqual(back.value.map((a) => ({ n: a.n, question: a.question, text: a.text })), pairs)
})

test("two exchanges accumulate, and round 2's numbering does not marry round 1's answers", () => {
  const one = newExchange([{ n: 1, question: "первый?", text: "1" }]).value
  const two = newExchange([{ n: 1, question: "второй?", text: "2" }]).value
  const back = newAnswers(one + two)
  assert.deepEqual(back.value.map((a) => `${a.question}=${a.text}`), ["первый?=1", "второй?=2"])
})

test("an empty file is an empty list, not a refusal: the first exchange has no answers", () => {
  assert.deepEqual(newAnswers("").value, [])
})

test("a question with no answer of its number — half a pair is neither a fact nor a question", () => {
  assert.equal(newAnswers("<exchange>\n  <question_1>предел?</question_1>\n</exchange>").error.cls, "malformed")
})

// --- newExchange: Σ antecedent branches ---------------------------------------------------------

test("the writer REFUSES what the format cannot carry, instead of writing a file that mis-parses", () => {
  assert.equal(newExchange([]).error.cls, "invalid-exchange")
  assert.match(newExchange([{ n: 0, question: "q", text: "a" }]).error.detail, /ожидалось целое/)
  assert.match(newExchange([{ n: 1, question: "q", text: "a" }, { n: 1, question: "w", text: "b" }]).error.detail, /повторяется/)
  assert.match(newExchange([{ n: 1, question: "q", text: "  " }]).error.detail, /ответ на вопрос 1 пуст/)
  // The one border of this grammar, declared and enforced rather than encoded away.
  assert.match(newExchange([{ n: 1, question: "q", text: "хитрый </answer_1> ответ" }]).error.detail, /закрывающий тег/)
})

// F17 live: the numbers of an alternatives list belong to the QUESTION and never reach the values.
test("numbers from a question's alternatives never become a source", () => {
  const x = newExchange([{ n: 1, question: "cap — 20 by default (alternatives: 50, 100)?", text: "20" }]).value
  assert.equal(newAnswers(x).value.map((a) => a.text).join(" ").includes("100"), false)
})

// --- looksLikeTemplate: total, 1 happy + 1 distinguishable outcome ----------------------------
// S13: one check, two callers (bin/answer.mjs, ext/index.mjs::izi_answer) — not two copies.

test("an ordinary answer does not look like a template", () => {
  assert.equal(looksLikeTemplate("20"), false)
})

test("a placeholder of the form <...> is a template, not an answer", () => {
  assert.equal(looksLikeTemplate("<operator answer>"), true)
})

// --- stripOrdinal: the address is not the answer (live run 9d126ef3) ---------------------------

test("the number the operator addressed an answer with is dropped from its value", () => {
  assert.equal(stripOrdinal(2, "2 только к ответам с активным поиском"), "только к ответам с активным поиском")
  assert.equal(stripOrdinal(3, "3) пустой массив с HTTP 200"), "пустой массив с HTTP 200")
  assert.equal(stripOrdinal(1, "1. GET /fruits"), "GET /fruits")
})

test("an answer that IS a number survives whole — nothing follows it to be the answer", () => {
  assert.equal(stripOrdinal(1, "10"), "10")
  assert.equal(stripOrdinal(10, "10"), "10")
})

test("a quantity leading an answer is not an address unless it equals the question's number", () => {
  assert.equal(stripOrdinal(1, "10 записей максимум"), "10 записей максимум")
  assert.equal(stripOrdinal(1, "11 GET /fruits"), "11 GET /fruits")   // two glued messages, indistinguishable from a value
  assert.equal(stripOrdinal(2, "20 секунд"), "20 секунд")
})

test("stripOrdinal is total: empty, undefined and a bare separator never throw", () => {
  assert.equal(stripOrdinal(1, ""), "")
  assert.equal(stripOrdinal(1, undefined), "")
  assert.equal(stripOrdinal(1, "  1  "), "1")   // still no text after the number — it IS the answer
})
