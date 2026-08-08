// Бюджеты прогона — ЧИСТОЕ правило чтения izi.config.json. Формула §5: 1 happy + Σ ветвей
// антецедента с РАЗЛИЧИМЫМ следствием = 3 юнита («файла нет» — отдельное следствие, а не отказ).

import test from "node:test"
import assert from "node:assert/strict"
import { newBudgets, DEFAULT_BUDGETS } from "./budgets.mjs"

test("конфиг задаёт бюджеты; недостающий ключ берёт умолчание", () => {
  const r = newBudgets('{"questions": 10}')
  assert.equal(r.ok, true)
  assert.equal(r.value.questions, 10)
  assert.equal(r.value.loops, DEFAULT_BUDGETS.loops)
})

test("файла нет — умолчания целиком, а не отказ", () => {
  assert.deepEqual(newBudgets("").value, DEFAULT_BUDGETS)
  assert.equal(DEFAULT_BUDGETS.maxParallel, 8) // размер батча веера шага 4 живёт здесь, не в izi.js
})

test("сломанный конфиг — отказ, а не тихое умолчание", () => {
  assert.equal(newBudgets("{questions: 10}").error.cls, "invalid-budgets")     // не JSON
  assert.match(newBudgets('{"question": 10}').error.detail, /неизвестный ключ/) // опечатка в имени
  assert.match(newBudgets('{"questions": 0}').error.detail, /целое ≥ 1/)        // не бюджет
})
