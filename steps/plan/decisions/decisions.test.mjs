// Шов журнала решений. Предмет — «что считается ответом» и круглый рейс формата.
import test from "node:test"
import assert from "node:assert/strict"
import { ROUTES, newDecision, renderDecisions, parseDecisions } from "./decisions.mjs"

const OK = {
  question: "R11 говорит «по образцу snippets» — какая привязка имеется в виду?",
  answer: "привязка workflows: List<URI> в AgentConfiguration",
  source: "LlmTask.java:214",
  route: "repo",
  why: "сниппеты к агенту не привязываются вовсе, слова snippet в AgentConfiguration нет",
}

test("решение из репозитория без ссылки «файл:строка» не записывается", () => {
  assert.equal(newDecision(OK).error, undefined)

  assert.match(newDecision({ ...OK, source: "так принято в репозитории" }).error, /без ссылки «файл:строка»/)
  assert.match(newDecision({ ...OK, route: "догадка" }).error, new RegExp(ROUTES.join(" · ")))
  assert.match(newDecision({ ...OK, answer: "" }).error, /без ответа/)
  assert.match(newDecision({ question: "" }).error, /без вопроса/)

  // Оператор и правка требования ссылкой на строку кода не подтверждаются — у них свой источник.
  assert.equal(newDecision({ ...OK, route: "operator", source: "ответ оператора 21.08" }).error, undefined)
  assert.equal(newDecision({ ...OK, route: "frd", source: "frd.xml, дельта R11" }).error, undefined)
})

// КРУГЛЫЙ РЕЙС НА САМОМ ТРУДНОМ ЗНАЧЕНИИ: многострочный ответ, кириллица, угловые скобки —
// формат построчный, и всё это обязано доехать обратно целым (standards/code.md, правило форматов).
test("журнал возвращается из текста тем же, чем был записан", () => {
  const hard = newDecision({
    ...OK,
    answer: "поле List<URI> glossaries\nрядом с workflows",
    why: "проверено по исходникам:\n  в AgentConfiguration слова «snippet» нет",
  })
  const back = parseDecisions(renderDecisions([hard, newDecision({ ...OK, question: "второе" })]))
  assert.equal(back.length, 2)
  assert.deepEqual({ ...back[0] }, { ...hard }, "решение вернулось не тем, чем было записано")
  assert.equal(back[0].answer.includes("\n"), false, "перенос строки уехал в файл — формат построчный")
  assert.equal(back[1].question, "второе")

  assert.equal(parseDecisions("").length, 0, "пустой файл — пустой список, а не отказ")
  assert.equal(renderDecisions([{ error: "не записано" }]).includes("##"), false, "отказ попал в журнал как решение")
})
