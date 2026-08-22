// КОМПОНЕНТНЫЙ ТЕСТ ШАГА 8 — шаг целиком, без модели, на НАСТОЯЩЕЙ карте и НАСТОЯЩЕМ требовании
// живого прогона eddi 20.08.2026. Два сценария: успех и нарушение.
//
// Вычисленного графа шага 3 в фикстуре нет НАМЕРЕННО: он весит 3.5 МБ, а его отсутствие законно —
// правило тогда судит по карте, как судило до правки, которая его добавила.
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import * as step from "../ripple.step.mjs"
import { start, sha1of } from "../../../ext/state.mjs"
import { instruction } from "../../../ext/values.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))

// --- ARRANGE: вход шага 8 — требование, карта и вес -----------------------------------------------
const arrange = () => {
  const cwd = mkdtempSync(join(tmpdir(), "izi-ripple-"))
  cpSync(join(HERE, "fixture"), cwd, { recursive: true })
  mkdirSync(join(cwd, ".agent", "staging"), { recursive: true })
  for (const p of [".agent/frd.xml", ".agent/appgraph.xml", ".agent/mode"]) {
    assert.ok(existsSync(join(cwd, p)), `фикстура неполна: нет ${p}`)
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

test("шаг 8 успех: подграф посчитан по настоящей карте, рябь легла, модель не звалась", () => {
  const s0 = arrange()

  const run = drive(s0)

  assert.ok(!run.trace.some((i) => i.do === "role" || i.do === "roles"), "шаг 8 позвал модель — у него роли нет")
  const said = run.trace.find((i) => i.do === "say")
  assert.ok(said, `шаг не сказал, что посчитал: ${JSON.stringify(run.trace).slice(0, 200)}`)
  assert.match(said.line, /семян \d+, узлов \d+ из \d+/, "лог не называет размер подграфа")

  assert.equal(run.state.verdicts.length, 1)
  assert.equal(run.state.verdicts[0].ok, true, `рябь отбита: ${run.state.verdicts[0].blockers}`)
  assert.equal(run.state.at.ripple.path, ".agent/ripple.xml")
  const laid = readFileSync(join(run.state.cwd, ".agent/ripple.xml"), "utf8")
  assert.match(laid, /<ripple\b/, "легло что-то, что не рябь")
  assert.equal(run.state.at.ripple.sha1, sha1of(laid), "отпечаток не совпал с тем, что легло")

  // РЕЛЬСА skip ОТЛОЖЕНА: второго выхода у шага нет, и .agent/design он не пишет.
  assert.ok(!existsSync(join(run.state.cwd, ".agent/design")), "шаг написал отложенную рельсу skip")
})

test("шаг 8 нарушение: карту правили после graph — отказ, рябь НЕ легла", () => {
  const s0 = arrange()
  const map = readFileSync(join(s0.cwd, ".agent/appgraph.xml"), "utf8")
  const sealed = { ...s0, at: { appgraph: { path: ".agent/appgraph.xml", sha1: sha1of(map) } } }
  writeFileSync(join(s0.cwd, ".agent/appgraph.xml"), `${map}\n<!-- оператор дописал строку -->`)

  const run = drive(sealed)

  const last = run.trace[run.trace.length - 1]
  assert.equal(last.do, "err")
  assert.match(last.subject, /изменился/)
  assert.match(last.subject, /переиграй graph/)
  assert.ok(!existsSync(join(s0.cwd, ".agent/ripple.xml")), "рябь легла при отбитом входе")
})

test("шаг 8: веса нет — отказ с именем файла и шага-владельца, а не догадка", () => {
  const s0 = arrange()
  rmSync(join(s0.cwd, ".agent/mode"))
  const it = step.next(s0)
  assert.equal(it.do, "err")
  assert.match(it.subject, /\.agent\/mode/)
  assert.match(it.subject, /weight/)
})
