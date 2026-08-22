// КОМПОНЕНТНЫЙ ТЕСТ ШАГА 7 — шаг целиком, без модели, на НАСТОЯЩЕМ требовании.
// Два сценария: успех и нарушение (у шага без роли третьего не бывает).
//
// ФИКСТУРА НАСТОЯЩАЯ: `.agent/frd.xml` — требование, которое шаг 6 выдал на живом прогоне eddi
// 20.08.2026. Выдуманное требование проверяло бы наши представления о форме дельт, а не сам шаг.
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import * as step from "../weight.step.mjs"
import { start, sha1of } from "../../../ext/state.mjs"
import { instruction } from "../../../ext/values.mjs"
import { MODES } from "../judge.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))

// --- ARRANGE: вход шага 7 — одно требование ------------------------------------------------------
const arrange = () => {
  const cwd = mkdtempSync(join(tmpdir(), "izi-weight-"))
  cpSync(join(HERE, "fixture"), cwd, { recursive: true })
  mkdirSync(join(cwd, ".agent", "staging"), { recursive: true })
  assert.ok(existsSync(join(cwd, ".agent/frd.xml")), "фикстура неполна: нет .agent/frd.xml")
  return start({ cwd, run: "component", key: "DOS-535" }).value
}

const drive = (state) => {
  const trace = []
  for (let it = step.next(state); it.do !== "done"; it = step.next(state)) {
    assert.equal(instruction(it).ok, true, `инструкция не проходит конструктор: ${JSON.stringify(it).slice(0, 120)}`)
    trace.push(it)
    if (it.do === "err") return { state, trace }
    const r = step.fold(state, { do: it.do, instruction: it, result: null })
    if (!r.ok) return { state, trace, refused: r.error }
    state = r.value
    assert.ok(trace.length < 10, "шаг не сходится")
  }
  return { state, trace }
}

test("шаг 7 успех: вес посчитан по настоящим дельтам, слово легло, модель не звалась", () => {
  const s0 = arrange()

  const run = drive(s0)

  assert.ok(!run.trace.some((i) => i.do === "role" || i.do === "roles"), "шаг 7 позвал модель — у него роли нет")
  const said = run.trace.find((i) => i.do === "say")
  assert.ok(said, "шаг не сказал, что посчитал")
  assert.ok(MODES.includes(said.mode), `вес «${said.mode}» вне словаря — гардрейл пропустил`)
  assert.match(said.line, /по \d+ дельтам/, "лог не называет, из чего вес посчитан")

  assert.equal(run.state.verdicts.length, 1)
  assert.equal(run.state.verdicts[0].ok, true)
  assert.equal(run.state.at.mode.path, ".agent/mode")
  assert.equal(readFileSync(join(run.state.cwd, ".agent/mode"), "utf8"), said.mode)
  assert.equal(run.state.at.mode.sha1, sha1of(said.mode), "отпечаток веса не совпал с тем, что легло")
})

test("шаг 7 нарушение: требование правили после intake — отказ, вес НЕ пересчитан по чужому", () => {
  const s0 = arrange()
  // Продвигаем требование, как это сделал бы intake, и правим его руками — ровно тот случай, ради
  // которого в состоянии лежит отпечаток.
  const frd = readFileSync(join(s0.cwd, ".agent/frd.xml"), "utf8")
  const sealed = { ...s0, at: { frd: { path: ".agent/frd.xml", sha1: sha1of(frd) } } }
  writeFileSync(join(s0.cwd, ".agent/frd.xml"), `${frd}\n<!-- оператор дописал строку -->`)

  const run = drive(sealed)

  const last = run.trace[run.trace.length - 1]
  assert.equal(last.do, "err")
  assert.match(last.subject, /изменился/)
  assert.match(last.subject, /переиграй intake/, "отказ не сказал, что делать")
  assert.ok(!existsSync(join(s0.cwd, ".agent/mode")), "вес лёг на диск при отбитом входе")
})

test("шаг 7: требования нет — отказ с именем файла и шага-владельца", () => {
  const cwd = mkdtempSync(join(tmpdir(), "izi-weight-"))
  mkdirSync(join(cwd, ".agent", "staging"), { recursive: true })
  const it = step.next(start({ cwd, run: "c" }).value)
  assert.equal(it.do, "err")
  assert.match(it.subject, /\.agent\/frd\.xml/)
  assert.match(it.subject, /intake/)
})
