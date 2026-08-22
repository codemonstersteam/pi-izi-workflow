// КОМПОНЕНТНЫЙ ТЕСТ ШАГА 9A — шаг целиком, на НАСТОЯЩЕМ ответе роли `valuer`.
// ЧЕТЫРЕ сценария, а не три: к успеху, нарушению и обрыву добавлен «требование изменилось», без
// которого тест доказывал бы ровно то, что шаг НЕ зовёт роль, — то есть закреплял бы дефект.
//
// ЗАГЛУШКА — ЗАПИСАННЫЙ ОТВЕТ: `answer-valuer.txt` это `.agent/values.xml`, который роль `valuer`
// написала на живом прогоне eddi 20.08.2026. Артефакт роли и есть её ответ: роль пишет файл своими
// руками, а в конверте едет только путь.
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import * as step from "../values.step.mjs"
import { start, sha1of } from "../../../../ext/state.mjs"
import { instruction } from "../../../../ext/values.mjs"
import { parseValues } from "../values.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const ANSWER = readFileSync(join(HERE, "answer-valuer.txt"), "utf8")

// --- ARRANGE: вход шага 9A — требование и рябь ----------------------------------------------------
const arrange = () => {
  const cwd = mkdtempSync(join(tmpdir(), "izi-values-"))
  cpSync(join(HERE, "fixture"), cwd, { recursive: true })
  mkdirSync(join(cwd, ".agent", "staging"), { recursive: true })
  for (const p of [".agent/frd.xml", ".agent/ripple.xml"]) {
    assert.ok(existsSync(join(cwd, p)), `фикстура неполна: нет ${p}`)
  }
  return start({ cwd, run: "component", key: "DOS-535" }).value
}

const drive = (state, answer) => {
  const trace = []
  for (let it = step.next(state); it.do !== "done"; it = step.next(state)) {
    assert.equal(instruction(it).ok, true, `инструкция не проходит конструктор: ${JSON.stringify(it).slice(0, 140)}`)
    trace.push(it)
    if (it.do === "err") return { state, trace }
    const r = step.fold(state, { do: it.do, instruction: it, result: answer(it) })
    if (!r.ok) return { state, trace, refused: r.error }
    state = r.value
    assert.ok(trace.length < 20, "шаг не сходится")
  }
  return { state, trace }
}

// Заглушка роли: пишет ФАЙЛ по staging-пути и возвращает конверт с ПУТЁМ.
const respond = (state, answer) => (it) => {
  if (it.do !== "role") return null
  writeFileSync(join(state.cwd, it.staging), answer)
  return { track: "ok", artifact: it.staging }
}

test("9A успех: скелет посчитан, роль заполнила, гардрейл принял, словарь лёг", () => {
  const s0 = arrange()

  const run = drive(s0, respond(s0, ANSWER))

  const said = run.trace.find((i) => i.do === "say")
  assert.ok(said, "шаг не сказал, что посчитал")
  assert.match(said.line, /строк \d+, из них пустых \d+/)

  const order = run.trace.find((i) => i.do === "role")
  assert.ok(order, "наряда не было")
  assert.equal(order.role, "valuer")
  assert.ok(!/\{[A-Z_]+\}/.test(order.text), "слот остался незаполненным — данные не доехали")
  assert.match(order.text, /<values/, "в наряде нет скелета — роли нечего заполнять")

  assert.equal(run.state.verdicts.length, 1)
  assert.equal(run.state.verdicts[0].ok, true, `словарь отбит: ${run.state.verdicts[0].blockers}`)
  assert.equal(run.state.at.values.path, ".agent/values.xml")
  const laid = readFileSync(join(run.state.cwd, ".agent/values.xml"), "utf8")
  assert.ok(parseValues(laid).size > 0, "словарь лёг пустым")
  assert.equal(run.state.at.values.sha1, sha1of(laid))
  // Отбитого черновика не осталось: под staging лежит ровно то, что гардрейл ОТБИЛ.
  assert.ok(!existsSync(join(run.state.cwd, ".agent/staging/values.xml")), "принятый черновик остался в staging")
})

test("9A нарушение: роль оставила пустое значение — словарь НЕ лёг, круг потрачен", () => {
  const s0 = arrange()
  const broken = ANSWER.replace(/text="[^"]+"/, 'text=""')
  assert.notEqual(broken, ANSWER, "порча не применилась — тест судит не то, что думает")

  const run = drive(s0, respond(s0, broken))

  const last = run.trace[run.trace.length - 1]
  assert.equal(last.do, "err")
  assert.equal(last.code, "escalate")
  const red = run.state.verdicts.find((v) => !v.ok)
  assert.ok(red, "ни одного красного вердикта — гардрейл пропустил пустое значение")
  assert.ok(!existsSync(join(run.state.cwd, ".agent/values.xml")), "отбитый словарь лёг на диск")
  assert.equal(run.state.portions[0].round, s0.budgets.loops + 1, "круги починки не потрачены")
})

test("9A обрыв: связь оборвалась — круг НЕ потрачен, шаг доходит на втором заходе", () => {
  const s0 = arrange()
  let calls = 0
  const flaky = (it) => {
    if (it.do !== "role") return null
    calls += 1
    if (calls === 1) return { track: "err", kind: "crashed", subject: "connection reset by peer" }
    writeFileSync(join(s0.cwd, it.staging), ANSWER)
    return { track: "ok", artifact: it.staging }
  }

  const run = drive(s0, flaky)

  assert.equal(calls, 2, "после обрыва шаг не переспросил роль")
  assert.equal(run.state.verdicts.length, 1, "обрыв попал в вердикты — его судили как ответ")
  assert.equal(run.state.verdicts[0].round, 1, "ОБРЫВ СЪЕЛ КРУГ — три обрыва подряд дадут escalate там, где роль не ошиблась")
  assert.equal(run.state.at.values.path, ".agent/values.xml")
})

// ЧЕТВЁРТЫЙ СЦЕНАРИЙ, И ОН ОБЯЗАТЕЛЕН. Без него «переиспользование» доказывается тем, что роль не
// звалась, — то есть закрепляется дефект: вчерашний словарь по сегодняшнему требованию.
test("9A переиспользование: словарь зелен по СЕГОДНЯШНИМ входам — 0 токенов; требование изменилось — пересборка", () => {
  // (а) словарь на месте и годен: роль не зовётся
  const s0 = arrange()
  writeFileSync(join(s0.cwd, ".agent/values.xml"), ANSWER)
  // Заглушка бросает ТОЛЬКО на вызове роли: `say` переиспользования — законный ход, и бросок на нём
  // судил бы не то, что тест обещает.
  const reused = drive(s0, (it) => {
    if (it.do === "role") throw new Error("роль позвана на годном словаре — 0 токенов не соблюдены")
    return null
  })
  assert.ok(reused.trace.some((i) => i.reuse), "шаг не объявил переиспользование — решение осталось невидимым")
  assert.equal(reused.state.verdicts[0].ok, true, "вердикт о переиспользовании не лёг в состояние")

  // (б) требование изменилось: тот же словарь больше не годится, и роль ЗОВЁТСЯ
  const s1 = arrange()
  writeFileSync(join(s1.cwd, ".agent/values.xml"), ANSWER)
  // Правка требования, которую словарь не переживает: use case переименован, и строки словаря
  // закрывают концы, которых больше нет. Это ровно то, что делает оператор, уточняя сценарий.
  const frd = readFileSync(join(s1.cwd, ".agent/frd.xml"), "utf8")
  const moved = frd.replace(/UC1\b/g, "UC9")
  assert.notEqual(moved, frd, "правка не применилась — тест судит не то, что думает")
  writeFileSync(join(s1.cwd, ".agent/frd.xml"), moved)
  let called = 0
  drive(s1, (it) => { if (it.do === "role") { called += 1; writeFileSync(join(s1.cwd, it.staging), ANSWER) ; return { track: "ok", artifact: it.staging } } return null })
  assert.ok(called > 0, "требование изменилось, а словарь переиспользован — шаг 9C получит блокер F11, который роль закрыть не может")
})
