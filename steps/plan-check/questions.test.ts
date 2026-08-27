// Units of question extraction and answer application into the plan.
import test from "node:test"
import assert from "node:assert/strict"
import { extractQuestions, applyAnswers } from "./questions.ts"

const PLAN = `# П

## 6. ОТКРЫТЫЕ ВОПРОСЫ
| Вопрос | Рекомендация |
|---|---|
| Лимит по умолчанию? | 20 |
| Регистрозависимость? | без учёта регистра |
| Уже решён? → РЕШЕНО: да | — |
`

const ANSWERS = `<exchange>
  <question_1>Лимит по умолчанию?</question_1>
  <answer_1>30</answer_1>
  <question_2>Регистрозависимость?</question_2>
  <answer_2>без учёта регистра</answer_2>
</exchange>
`

test("extractQuestions: нерешённые строки; решённые пропускаются", () => {
  const qs = extractQuestions(PLAN)
  assert.equal(qs.length, 2)
  assert.equal(qs[0].text, "Лимит по умолчанию?")
  assert.equal(qs[0].recommendation, "20")
})

test("applyAnswers: решение дописывается своей строке; чужие не тронуты", () => {
  const out = applyAnswers(PLAN, ANSWERS)
  assert.match(out, /\| Лимит по умолчанию\? → РЕШЕНО: 30 \| 20 \|/)
  assert.match(out, /\| Регистрозависимость\? → РЕШЕНО: без учёта регистра \| без учёта регистра \|/)
  assert.match(out, /Уже решён\? → РЕШЕНО: да/)
})

test("applyAnswers: ответ без своего вопроса — план не меняется", () => {
  const alien = `<exchange>\n  <question_1>Чужой вопрос?</question_1>\n  <answer_1>х</answer_1>\n</exchange>\n`
  assert.equal(applyAnswers(PLAN, alien), PLAN)
})

test("applyAnswers: вопрос с припиской «— рекомендация» находит свою строку", () => {
  const withRec = "<exchange>\n  <question_1>Лимит по умолчанию? — рекомендация: 20</question_1>\n  <answer_1>30</answer_1>\n</exchange>\n"
  const out = applyAnswers(PLAN, withRec)
  assert.match(out, /Лимит по умолчанию\? → РЕШЕНО: 30/)
})
