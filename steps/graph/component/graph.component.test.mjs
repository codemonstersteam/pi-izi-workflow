// КОМПОНЕНТНЫЙ ТЕСТ ШАГА 5 — шаг целиком, без модели, на НАСТОЯЩИХ частях роя живого прогона eddi
// (20.08.2026): 21 часть, план обследования и фокус — как их оставил шаг 4. Два сценария.
//
// Вычисленный граф лежит СПРОЕЦИРОВАННЫМ до путей (см. комментарий в самом файле): настоящий весит
// 3.5 МБ, а шаг читает из него факты, которые в проекции сохранены.
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import * as step from "../graph.step.mjs"
import { start, sha1of } from "../../../ext/state.mjs"
import { instruction } from "../../../ext/values.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))

// --- ARRANGE: вход шага 5 — части, план и фокус ---------------------------------------------------
const arrange = () => {
  const cwd = mkdtempSync(join(tmpdir(), "izi-graph-"))
  cpSync(join(HERE, "fixture"), cwd, { recursive: true })
  mkdirSync(join(cwd, ".agent", "staging"), { recursive: true })
  for (const q of [".agent/survey-plan.json", ".agent/focus.json", ".agent/graph-parts/spine.xml"]) {
    assert.ok(existsSync(join(cwd, q)), `фикстура неполна: нет ${q}`)
  }
  return start({ cwd, run: "component", key: "DOS-535" }).value
}

const drive = (state) => {
  const trace = []
  for (let it = step.next(state); it.do !== "done"; it = step.next(state)) {
    assert.equal(instruction(it).ok, true, `инструкция не проходит конструктор: ${JSON.stringify(it).slice(0, 140)}`)
    trace.push(it)
    if (it.do === "err") return { state, trace }
    const r = step.fold(state, { do: it.do, instruction: it, result: null })
    if (!r.ok) return { state, trace, refused: r.error }
    state = r.value
    assert.ok(trace.length < 10, "шаг не сходится")
  }
  return { state, trace }
}

test("шаг 5 успех: части склеились в одну карту, карта легла, модель не звалась", () => {
  const s0 = arrange()

  const run = drive(s0)

  assert.ok(!run.trace.some((i) => i.do === "role" || i.do === "roles"), "шаг 5 позвал модель — склейка это скрипт")
  const said = run.trace.find((i) => i.do === "say")
  assert.ok(said, `шаг не сказал, что склеил: ${JSON.stringify(run.trace).slice(0, 200)}`)
  assert.match(said.line, /карта из \d+ частей, \d+ узлов/)

  assert.equal(run.state.verdicts.length, 1)
  assert.equal(run.state.verdicts[0].ok, true, `карта отбита: ${run.state.verdicts[0].blockers}`)
  const laid = readFileSync(join(run.state.cwd, ".agent/appgraph.xml"), "utf8")
  assert.match(laid, /<appgraph\b/)
  assert.equal(run.state.at.appgraph.sha1, sha1of(laid))
})

test("шаг 5 нарушение: часть клетки ФОКУСА потеряна — отказ с именем клетки, карта НЕ легла", () => {
  const s0 = arrange()
  const focus = JSON.parse(readFileSync(join(s0.cwd, ".agent/focus.json"), "utf8"))
  const victim = focus.cells[0]
  rmSync(join(s0.cwd, `.agent/graph-parts/${victim}.xml`))

  const run = drive(s0)

  const last = run.trace[run.trace.length - 1]
  assert.equal(last.do, "err")
  assert.match(last.subject, new RegExp(victim.replace(/[.*+?^${}()|[\]\\~]/g, "\\$&")))
  assert.match(last.subject, /поддерево потеряно/)
  assert.ok(!existsSync(join(s0.cwd, ".agent/appgraph.xml")), "карта легла при потерянной части")
})

test("шаг 5: часть на диске ЕСТЬ, но гардрейл части её сейчас не принимает — карта не собирается", () => {
  const s0 = arrange()
  const focus = JSON.parse(readFileSync(join(s0.cwd, ".agent/focus.json"), "utf8"))
  const victim = focus.cells[0]
  // Огрызок, какой остаётся от прогона, где клетку отбили: корень на месте, содержимого нет.
  writeFileSync(join(s0.cwd, `.agent/graph-parts/${victim}.xml`), "<part/>\n")

  const it = step.next(s0)
  assert.equal(it.do, "err")
  assert.match(it.subject, /СЕЙЧАС не принимает/)
  assert.match(it.subject, /когда-то была зелёной/, "отказ не объясняет, почему вчерашняя зелень не считается")
})
