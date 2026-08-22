// ЮНИТЫ ГАРДРЕЙЛА ШАГА 7. Правило одно — вес из закрытого словаря — и у него три ветви:
// законное слово, слово вне словаря и МОЛЧАНИЕ при отсутствии операнда. Тикет T16.
import test from "node:test"
import assert from "node:assert/strict"
import { judgeMode, MODES } from "../judge.mjs"

test("happy: слово из словаря принимается", () => {
  assert.deepEqual(judgeMode({ mode: MODES[0] }), [])
})

test("слово вне словаря — отказ, и он перечисляет словарь целиком", () => {
  const b = judgeMode({ mode: "средненькое" })
  assert.equal(b.length, 1)
  assert.ok(MODES.every((m) => b[0].includes(m)), "блокер не назвал допустимые слова — автор не узнает, что писать")
})

test("МОЛЧАНИЕ: веса нет вовсе — судить нечего, а не «пусто это не слово»", () => {
  assert.deepEqual(judgeMode({ mode: "" }), [])
  assert.deepEqual(judgeMode({}), [])
})
