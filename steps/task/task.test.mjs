// Правило входа — ЧИСТОЕ (standards/code.md §3.10), тестируется импортом, не подпроцессом: io ушёл
// в ext/index.mjs (readText), здесь остаётся только судья текста. Формула §5: 1 happy + Σ ветвей
// антецедента — ровно две различимые ветви отказа (empty, too-long), три теста всего.

import test from "node:test"
import assert from "node:assert/strict"
import { checkTaskText, TASK_LINES_CAP } from "./task.mjs"

test("непустой текст в пределах строк — ok, несёт lines и words", () => {
  const r = checkTaskText("Сделать штуку, которая делает дело.\n")
  assert.equal(r.ok, true)
  assert.equal(r.value.words, 5)
})

test("пустой/пробельный текст — err(empty)", () => {
  const r = checkTaskText("   \n\n  \n")
  assert.equal(r.ok, false)
  assert.equal(r.error.cls, "empty")
})

test(`текст сверх ${TASK_LINES_CAP} строк — err(too-long)`, () => {
  const text = Array.from({ length: TASK_LINES_CAP + 1 }, (_, i) => `строка ${i}`).join("\n")
  const r = checkTaskText(text)
  assert.equal(r.ok, false)
  assert.equal(r.error.cls, "too-long")
})

test(`ровно ${TASK_LINES_CAP} строк — предел не строгий сверху, ok`, () => {
  const text = Array.from({ length: TASK_LINES_CAP }, (_, i) => `строка ${i}`).join("\n")
  const r = checkTaskText(text)
  assert.equal(r.ok, true)
})

test("undefined/null — тотальна, не бросает, судится как пустой", () => {
  assert.equal(checkTaskText(undefined).error.cls, "empty")
  assert.equal(checkTaskText(null).error.cls, "empty")
})
