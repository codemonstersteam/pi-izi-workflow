// answerArrived — 1 happy + 3 distinguishable "false" antecedent branches (unchanged/no-match/
// malformed all yield the SAME consequent, `false`, but each is its own live-run-motivated
// regression: standards/code.md §5 counts a branch only if it changes the consequent, and by that
// rule these collapse to two — however the defect this module closes (S8, checkpoint approved with
// no file write) is precisely "unchanged still reads as answered", so that branch is kept explicit,
// not folded into "false" generically, to keep it independently reddenable (§5, "a test holds if
// there exists a code change that reddens it alone").

import test from "node:test"
import assert from "node:assert/strict"
import { answerArrived } from "./answer-arrived.mjs"

test("файл изменился и несёт запись с этим subject — true", () => {
  const before = ""
  const after = "- вопрос: предел брони — минуты?\n  ответ: 90\n"
  assert.equal(answerArrived(before, after, "предел брони — минуты?"), true)
})

// Регрессия живого прогона: Approve нажат, bin/answer.mjs не выполнялся — файл не тронут.
test("Approve без bin/answer.mjs — файл не изменился, false, а не «ответ пуст»", () => {
  const before = "- вопрос: старый вопрос?\n  ответ: да\n"
  const after = before
  assert.equal(answerArrived(before, after, "новый вопрос?"), false)
})

test("отсутствие файла ДО и ПОСЛЕ (обе пустые строки) — false: «ответа нет», не «ответ пуст»", () => {
  assert.equal(answerArrived("", "", "любой вопрос?"), false)
})

test("файл изменился, но новая запись отвечает на ДРУГОЙ вопрос — false", () => {
  const before = ""
  const after = "- вопрос: другой вопрос?\n  ответ: да\n"
  assert.equal(answerArrived(before, after, "предел брони — минуты?"), false)
})

test("файл изменился, но не разбирается (malformed) — false, не выброс исключения", () => {
  const before = ""
  const after = "- вопрос: висячий вопрос без ответа\n"
  assert.equal(answerArrived(before, after, "висячий вопрос без ответа"), false)
})

test("ключ subject сверяется дословно — префикс/суффикс не считаются совпадением", () => {
  const before = ""
  const after = "- вопрос: предел брони — минуты\n  ответ: 90\n"
  assert.equal(answerArrived(before, after, "предел брони — минуты?"), false)
})
