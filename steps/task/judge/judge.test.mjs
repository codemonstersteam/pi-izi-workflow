// ЮНИТЫ ГАРДРЕЙЛА ШАГА 1. Правило одно — «одна задача, один вход», — и у него две ветви.
// Тикет T11.
import test from "node:test"
import assert from "node:assert/strict"
import { judgeTask } from "../judge.mjs"
import { TASK_LINES_CAP } from "../task.mjs"

test("happy: обычная задача принимается", () => {
  assert.deepEqual(judgeTask({ text: "Добавить продление займа.\ntask: DOS-535\n" }), [])
})

test("пустой вход — отказ класса empty: требование ни о чём поехало бы дальше по всей полосе", () => {
  const b = judgeTask({ text: "   \n\n" })
  assert.equal(b.length, 1)
  assert.equal(b[0].cls, "empty", "у отказа нет КЛАССА — его нельзя ни адресовать, ни сосчитать швом")
  assert.ok(b[0].text.length > 10, "блокер без внятного текста")
})

test("вход длиннее предела — отказ класса too-long: это не задача, а пачка задач", () => {
  const b = judgeTask({ text: Array.from({ length: TASK_LINES_CAP + 1 }, (_, i) => `строка ${i}`).join("\n") })
  assert.equal(b.length, 1)
  assert.equal(b[0].cls, "too-long")
  assert.match(b[0].text, new RegExp(String(TASK_LINES_CAP)), "блокер не называет предел — оператор не узнает, до чего резать")
})
