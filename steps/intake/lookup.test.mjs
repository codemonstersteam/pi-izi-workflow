// TEST_CONTRACT: ответ рельсы lookup — ТЕКСТ, который увидит роль, а не его длина.
//
// Шов заведён после живого прогона 64cebdda: полоса подставляла в FEEDBACK счётчик строк вместо самих
// строк, роль получала «lookup: 7» и спрашивала снова. Регулярка по izi.js этого поймать не могла —
// она видит, что строка собрана, но не видит, из чего.
import test from "node:test"
import assert from "node:assert/strict"
import { lookupAnswer, mergeFeedback } from "./lookup.mjs"

const ROWS = "AgentConfiguration · src/main/java/app/configs/AgentConfiguration.java · class · declares getId(), getGlossaries()"

test("ответ несёт ПУТИ, а не число: подмена таблицы счётчиком краснит этот тест", () => {
  const answer = lookupAnswer({ names: ["AgentConfiguration"], rows: ROWS, spent: 1, cap: 3 })
  assert.match(answer, /src\/main\/java\/app\/configs\/AgentConfiguration\.java/)
  assert.match(answer, /class/)
  // Ровно то, что уехало роли на живом прогоне и ничего ей не сказало.
  assert.equal(/^lookup: \d+\s*$/m.test(answer), false, "в ответе стоит число вместо строк таблицы")
  assert.equal(answer.includes("Больше справок нет"), false, "круги ещё есть — торопить роль не за что")
})

test("не резолвится ничего — прямой отказ и единственный законный выход", () => {
  const answer = lookupAnswer({ names: ["Nowhere", "Missing"], rows: "", spent: 0, cap: 3 })
  assert.match(answer, /Nowhere, Missing/)
  assert.match(answer, /таких типов нет/)
  assert.match(answer, /kind:"question"/, "роли не сказано, куда идти с фактом, которого нет")
  assert.equal(/AgentConfiguration/.test(answer), false)
})

test("круги кончились — ответ остаётся, но роль обязана решать сама", () => {
  const answer = lookupAnswer({ names: ["X"], rows: ROWS, spent: 3, cap: 3 })
  assert.match(answer, /AgentConfiguration\.java/, "исчерпание кругов не отменяет уже найденного")
  assert.match(answer, /Больше справок нет: 3 кругов/)
})

test("тотальность: пустой вход даёт строку, а не бросок", () => {
  assert.equal(typeof lookupAnswer(), "string")
  assert.equal(typeof lookupAnswer({}), "string")
  assert.match(lookupAnswer({}), /таких типов нет/)
})

// СКЛЕЙКА: справка ПРИБАВЛЯЕТСЯ к замечаниям, а не замещает их.
//
// Живой прогон 19.08.2026, круг 2: гардрейл вернул 15 блокеров, роль спросила справку — и полоса
// присвоила ответ рельсы в feedback, стерев список того, что чинить. Роль пошла бы чинить вслепую и
// получила бы те же 15 строк кругом позже.
test("mergeFeedback: замечания сохраняются, справка добавляется ниже", () => {
  const merged = mergeFeedback({ pending: "F3c дельта без сценария\n  F4b UC5 без сценария", answer: "lookup: путь X" })
  assert.match(merged, /F3c дельта без сценария/)
  assert.match(merged, /F4b UC5 без сценария/)
  assert.match(merged, /lookup: путь X/)
  assert.ok(merged.indexOf("F3c") < merged.indexOf("lookup:"), "замечания обязаны стоять первыми")

  // Заглушка первой попытки замечанием не считается — иначе роль будет чинить скобку.
  assert.equal(mergeFeedback({ pending: "(none — first attempt)", answer: "lookup: X" }), "lookup: X")
  // Одна сторона пуста — вторая целиком; обе пусты — пусто.
  assert.equal(mergeFeedback({ pending: "F5 число", answer: "" }), "F5 число")
  assert.equal(mergeFeedback({}), "")
  assert.equal(mergeFeedback(), "")
})
