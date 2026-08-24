// ЮНИТЫ МОСТА. Тикет T06. Мост — адаптер, судить внутри нечего, кроме ТАБЛИЦЫ и ДВЕРИ:
// известное имя → модуль, неизвестное → отказ с именем, битое состояние → отказ и модуль НЕ вызван.
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MODULES, stepNext, stepFold, stepStart } from "./bridge.mjs"
import { STEPS, start, put } from "./state.mjs"
import { WORDS } from "./values.mjs"

const why = (r) => (r && r.error ? r.error.detail : "")

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

// --- ШОВ: ПОРЦИИ НЕ ПЕРЕЖИВАЮТ СВОЙ ПОДШАГ ---------------------------------------------------------
// Единственное место, где живёт связка двух шагов, — `workflows/izi.js::run` (`brd/normalize` →
// `brd/anchors`), и её не покрывает ни один компонентный тест: те зовут `next`/`fold` модуля
// напрямую, моста в их приводе нет. Поэтому шов стоит здесь.
//
// ЧЕМ ОПЛАЧЕН. Прогон 24.08.2026 на eddi: подшаг 2A кончил, оставив две свои порции `green`;
// `brd/anchors` прочитал `portions[0]`, увидел не `todo` и вернул `done`, не сделав ничего
// (anchors.step.mjs:71,81). Три звена из пяти промолчали, `.agent/brd.md` не собрался.
test("шов связки: состояние, вернувшееся с `done`, не несёт чужих порций и чужого вопроса", async () => {
  const cwd = root()
  writeFileSync(join(cwd, "TASK.md"), "требование\n")
  const s0 = start({ cwd, run: "r-hand-off", key: "DOS-535" }).value

  // Состояние, каким его оставляет ЗАКОНЧИВШИЙ подшаг: свои порции зелены, свой вопрос отвечен не был.
  const left = put(s0, {
    at: { normalized: { path: ".agent/normalized.md", sha1: "a".repeat(40) } },
    portions: [{ id: "1", staging: ".agent/staging/normalized.md", status: "green", round: 1 },
               { id: "2", staging: ".agent/staging/normalized.clean.md", status: "green", round: 1 }],
    question: { of: "1", name: "чужая-пауза", items: ["вопрос прошлого подшага"], retry: 1 },
  })
  assert.equal(left.ok, true, why(left))

  // Шаг, который сказал бы `done` на таком состоянии: `graph` закрыт по `at.appgraph`, которого нет,
  // значит он объявит СВОЮ работу. Берём `weight` — он тоже без порций — и смотрим на ВЫХОД моста.
  const it = await stepNext({ id: "brd/normalize", state: left.value })
  assert.equal(it.do, "done", `подшаг с продвинутым артефактом обязан сказать done: ${JSON.stringify(it).slice(0, 160)}`)
  assert.deepEqual(it.state.portions, [], "порции закончившего подшага уехали к следующему как свои")
  assert.equal(it.state.question, null, "неотвеченный вопрос закончившего подшага уехал к следующему")

  // И следующий подшаг на этом состоянии объявляет СВОЙ состав работы, а не молчит.
  const after = await stepNext({ id: "brd/anchors", state: it.state })
  assert.notEqual(after.do, "done", "следующий подшаг принял чужие порции за свои и промолчал")
})
