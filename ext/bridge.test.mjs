// ЮНИТЫ МОСТА. Тикет T06. Мост — адаптер, судить внутри нечего, кроме ТАБЛИЦЫ и ДВЕРИ:
// известное имя → модуль, неизвестное → отказ с именем, битое состояние → отказ и модуль НЕ вызван.
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MODULES, stepNext, stepFold, stepStart } from "./bridge.mjs"
import { STEPS, start } from "./state.mjs"
import { WORDS } from "./values.mjs"

const root = () => {
  const d = mkdtempSync(join(tmpdir(), "izi-bridge-"))
  mkdirSync(join(d, ".agent", "staging"), { recursive: true })
  return d
}

test("таблица знает КАЖДЫЙ шаг словаря — иначе имя шага становится кодом в двух местах", () => {
  assert.deepEqual(Object.keys(MODULES).sort(), [...STEPS].sort())
  assert.equal(MODULES["plan/tree"], "../steps/plan/tree/tree.step.mjs")
})

test("неизвестный шаг — отказ С ИМЕНЕМ и перечислением словаря, а не TypeError", async () => {
  const s = start({ cwd: root(), run: "r1" }).value
  const it = await stepNext({ id: "дизайн", state: s })
  assert.equal(it.do, "err")
  assert.match(it.subject, /дизайн/)
  assert.ok(STEPS.every((x) => it.subject.includes(x)))
})

test("битое состояние — отказ с именем поля, и модуль шага НЕ вызывается", async () => {
  // cwd не существует: конструктор обязан отбить ДО того, как мост тронет модуль шага.
  const it = await stepNext({ id: "plan/tree", state: { cwd: "/нет/каталога", run: "r1" } })
  assert.equal(it.do, "err")
  assert.match(it.subject, /cwd/)
  assert.ok(!/не загрузился/.test(it.subject), "мост полез в модуль шага с невалидным состоянием")
})

test("КАЖДЫЙ шаг таблицы отвечает инструкцией или отказом С ИМЕНЕМ — и ни один не бросает", async () => {
  // Утверждение намеренно про всю таблицу, а не про один шаг: пока модули пишутся по одному,
  // проверка «модуля ещё нет» протухает в день, когда его напишут. Здесь же граница проверяется
  // ровно за то, за что она отвечает, — и на ненаписанном модуле, и на написанном.
  const s = start({ cwd: root(), run: "r1", key: "K" }).value
  for (const id of STEPS) {
    const it = await stepNext({ id, state: s })
    assert.ok(WORDS.includes(it.do), `шаг ${id} вернул слово «${it.do}», которого нет в словаре`)
    if (it.do === "err") {
      assert.ok(it.subject && it.subject.length > 10, `шаг ${id} отказал без внятного подлежащего: «${it.subject}»`)
    }
  }
})

test("stepFold на битом состоянии возвращает track:err — привод не деструктурирует состояние из отказа", async () => {
  const r = await stepFold({ id: "plan/tree", state: { cwd: "/нет", run: "r1" }, event: {} })
  assert.equal(r.track, "err")
  assert.equal(r.value, undefined)
})

test("stepStart на чистом каталоге даёт состояние и первый шаг", async () => {
  const r = await stepStart({ cwd: root(), run: "r1", key: "DOS-535" })
  assert.equal(r.track, "ok")
  assert.equal(r.continued, false)
  assert.equal(r.from, STEPS[0])
})
