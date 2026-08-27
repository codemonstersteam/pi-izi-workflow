// Units of the answers grammar (порт из step9-rework, обе стороны каждого правила).
import test from "node:test"
import assert from "node:assert/strict"
import { newExchange, newAnswers, answersText } from "./answers.ts"

test("писатель→читатель: пара проходит насквозь", () => {
  const r = newExchange([{ n: 1, question: "вопрос", text: "ответ" }])
  assert.ok(r.ok)
  const back = newAnswers(r.value)
  assert.ok(back.ok)
  assert.deepEqual(back.value, [{ n: 1, question: "вопрос", text: "ответ" }])
})

test("вопрос без ответа своего номера — malformed; пустой набор — отказ", () => {
  assert.ok(!newAnswers("<exchange>\n  <question_1>q</question_1>\n</exchange>").ok)
  assert.ok(!newExchange([]).ok)
})

test("номера уникальны; закрывающий тег в значении — отказ писателя", () => {
  assert.ok(!newExchange([{ n: 1, question: "q", text: "a" }, { n: 1, question: "q2", text: "a2" }]).ok)
  assert.ok(!newExchange([{ n: 1, question: "q", text: "</answer_1>" }]).ok)
})

test("answersText — строки «N. ответ» без разметки", () => {
  const r = newExchange([{ n: 2, question: "q2", text: "второй" }, { n: 1, question: "q1", text: "первый" }])
  assert.equal(answersText(r.value!), "2. второй\n1. первый")
})
