// Разбор наряда по слагаемым — ДИАГНОЗ, и его место в журнале прогона, а не в каждом ходе чат-модели:
// строку лога доставляет хост записью сессии, и она едет в контекст всех следующих ходов
// (pi-extensible-workflows/src/host.ts:216). Замер сессии 01a017dc: 22 хода по 22-31 тыс. токенов.
// Здесь проверяется РЕШЕНИЕ «что печатать», а не то, как оно выглядит в полосе: полоса исполняется в
// vm-песочнице и в тест не импортируется, поэтому решение живёт снаружи неё.
import test from "node:test"
import assert from "node:assert/strict"
import { newOrderLine } from "./orderline.mjs"

const ADDENDS = [{ name: "BRD", chars: 40 }, { name: "MAP", chars: 300 }, { name: "FEEDBACK", chars: 0 }]

test("первый наряд своего рода несёт разбор — шаблон первым, слагаемые по убыванию", () => {
  const { line, why } = newOrderLine({ step: "intake", chars: 345, cap: 1000, round: 1, over: false, tplChars: 3, addends: ADDENDS })

  assert.equal(line, "intake: наряд 345 симв из 1000, круг 1 — шаблон 3 · MAP 300 · BRD 40 · FEEDBACK 0")
  assert.equal(why, "наряд intake — 345 симв при потолке 1000: шаблон 3 · MAP 300 · BRD 40 · FEEDBACK 0")
})

test("со второго круга в лог едет один итог, а разбор остаётся в отказе", () => {
  const { line, why } = newOrderLine({ step: "intake", chars: 345, cap: 1000, round: 3, over: false, tplChars: 3, addends: ADDENDS })

  assert.equal(line, "intake: наряд 345 симв из 1000, круг 3")
  assert.match(why, /шаблон 3 · MAP 300 · BRD 40 · FEEDBACK 0$/)
})

test("наряд выше потолка печатает разбор на любом круге — там разбор и есть ответ", () => {
  const { line } = newOrderLine({ step: "design/values", chars: 125, cap: 100, round: 7, over: true, tplChars: 5, addends: [{ name: "FRD", chars: 60 }] })
  assert.equal(line, "design/values: наряд 125 симв из 100, круг 7 — шаблон 5 · FRD 60")

  // Тотальность: круга нет — считаем первым, то есть говорим БОЛЬШЕ, а не меньше.
  assert.equal(newOrderLine().line, ": наряд 0 симв из 0, круг 1 — шаблон 0")
  assert.equal(typeof newOrderLine({ addends: "мусор" }).why, "string")
})
