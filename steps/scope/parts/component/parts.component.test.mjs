// COMPONENT TEST подшага 3В — рой скаутов на мини-репозитории, привод next/fold как у полосы.
// Формула (standards/workflow-design.md): шаг с ПАРАЛЛЕЛЬНЫМИ порциями — 4 сценария:
// успех · нарушение · обрыв ОДНОЙ порции · обрыв всех.
// ЗАГЛУШКА — ЗАПИСАННЫЙ ответ живой модели (bin/ask.mjs, qwen3.6-27b, temperature 0), не выдуманный:
// answer-spine.txt и answer-root.txt сняты 24.08.2026 на нарядах из in/ тем же order.mjs.
// Порча делается В ТЕСТЕ, в открытую, на именованном дефекте (стандарт component-test).
import test from "node:test"
import assert from "node:assert/strict"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { tmpdir } from "node:os"
import { start, put, sha1of } from "../../../../ext/state.mjs"
import { next as planNext, fold as planFold } from "../../plan/plan.step.mjs"
import { next as focusNext, fold as focusFocusFold } from "../../focus/focus.step.mjs"
import { next, fold } from "../parts.step.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const FIX = join(HERE, "../../fixture")
const ANSWER = (cell) => readFileSync(join(HERE, `answer-${cell}.txt`), "utf8")
const CELLS = ["spine", "root"]

function form() {
  const cwd = mkdtempSync(join(tmpdir(), "scope-parts-"))
  cpSync(join(FIX, "mini"), cwd, { recursive: true })
  mkdirSync(join(cwd, ".agent"), { recursive: true })
  cpSync(join(FIX, "agent"), join(cwd, ".agent"), { recursive: true })
  const s = start({ cwd, run: "component-parts", key: "FIX-1", budgets: {} })
  assert.ok(s.ok, s.error?.detail)
  const brd = readFileSync(join(cwd, ".agent/brd.md"), "utf8")
  let state = put(s.value, { at: { brd: { path: ".agent/brd.md", sha1: sha1of(brd) } } }).value
  state = planFold(state, { do: "say", instruction: planNext(state), result: null }).value
  state = focusFocusFold(state, { do: "say", instruction: focusNext(state), result: null }).value
  return state
}

// рой-заглушка: пишет записанный ответ клетки по её staging-пути и возвращает конверты ПО СЛОТАМ.
// answers: { cell: текст | null } — null означает обрыв связи этой порции ({track:"err"}).
function swarm(it, answers) {
  const record = {}
  it.calls.forEach((c, i) => {
    const text = answers[c.id] === undefined ? ANSWER(c.id) : answers[c.id]
    if (text !== null) writeFileSync(join(process.env.SCOPE_CWD, c.staging), text)
    record[`s${i}`] = text === null
      ? { track: "err", kind: "crashed", subject: "provider aborted" }
      : { track: "ok", artifact: c.staging }
  })
  return record
}

const drive = async (state, answers, rounds = 4) => {
  let st = state
  for (let r = 0; r < rounds; r++) {
    const it = next(st)
    if (it.do === "done") return { state: st, done: true }
    if (it.do === "say") { const f = fold(st, { do: "say", instruction: it, result: null }); assert.ok(f.ok, f.error?.detail); st = f.value; continue }
    if (it.do === "roles") { const f = fold(st, { do: "roles", instruction: it, result: swarm(it, answers) }); assert.ok(f.ok, f.error?.detail); st = f.value; continue }
    return { state: st, err: it }
  }
  return { state: st }
}

test("успех: две клетки роя — части легли байт в байт, кэш помнит, штамп каталога стоит", async () => {
  const state = form()
  process.env.SCOPE_CWD = state.cwd
  const out = await drive(state, {})
  assert.ok(out.done, `рой закрыл подшаг: ${JSON.stringify(out.err || {}).slice(0, 200)}`)

  for (const cell of CELLS) {
    const part = readFileSync(join(state.cwd, `.agent/graph-parts/${cell}.xml`), "utf8")
    assert.equal(part, ANSWER(cell), `часть «${cell}» лежит байт в байт как ответ скаута`)
    assert.ok(existsSync(join(state.cwd, `.izi/parts/${cell}.xml`)), `кэш помнит часть «${cell}»`)
    assert.ok(existsSync(join(state.cwd, `.izi/parts/${cell}.json`)), `и её состав с версией грамматики`)
  }
  assert.equal(out.state.at.parts.path, ".agent/graph-parts")
  assert.ok(out.state.portions.every((p) => p.status === "green"), "все порции зелёные")
})

test("нарушение: из ответа выкинут модуль — круг починки ЭТОЙ клетке, часть не легла, сосед зелёный", async () => {
  const state = form()
  process.env.SCOPE_CWD = state.cwd
  const spoiled = ANSWER("root").replace(/  <module path="src\/main\/java\/demo\/Fruit.java"[^]*?\/module>\n/, "")
  assert.ok(spoiled.length < ANSWER("root").length, "порча в тесте реально выкинула модуль")

  // круги: say + ОДИН красный ход роя — дальше сценарию нечего доказывать
  const out = await drive(state, { root: spoiled }, 2)
  assert.ok(!out.done, "шаг не закрылся — красная клетка ушла в круг починки")
  const root = out.state.portions.find((p) => p.id === "root")
  const spine = out.state.portions.find((p) => p.id === "spine")
  assert.equal(root.status, "todo")
  assert.equal(root.round, 2, "красный вердикт потратил круг именно этой клетки")
  assert.match(root.blockers, /S\d|P\d|C\d/, "блокер несёт номер правила")
  assert.equal(spine.status, "green", "соседняя клетка не пострадала")
  assert.ok(existsSync(join(state.cwd, ".agent/graph-parts/spine.xml")), "зелёная часть легла")
  assert.ok(!existsSync(join(state.cwd, ".agent/graph-parts/root.xml")), "отбитая часть НЕ легла")
  assert.ok(!out.state.at.parts, "каталог частей не штампован — шаг не закрыт")
})

test("обрыв ОДНОЙ клетки: круг НЕ потрачен, сосед зелёный, рой вернётся к ней", async () => {
  const state = form()
  process.env.SCOPE_CWD = state.cwd
  const out = await drive(state, { root: null })
  const root = out.state.portions.find((p) => p.id === "root")
  const spine = out.state.portions.find((p) => p.id === "spine")
  assert.equal(root.round, 1, "обрыв связи не тратит круг починки")
  assert.equal(root.status, "todo")
  assert.equal(spine.status, "green", "сосед по рою не пострадал")
  assert.ok(existsSync(join(state.cwd, ".agent/graph-parts/spine.xml")))
  const again = next(out.state)
  assert.equal(again.do, "roles", "следующий ход — снова рой, только на оборвавшуюся клетку")
  assert.deepEqual(again.calls.map((c) => c.id), ["root"])
})

test("обрыв ВСЕХ: ни одной части, ни одного вердикта порции, круги целы", async () => {
  const state = form()
  process.env.SCOPE_CWD = state.cwd
  const out = await drive(state, { spine: null, root: null })
  assert.ok(!existsSync(join(state.cwd, ".agent/graph-parts/spine.xml")))
  assert.ok(!existsSync(join(state.cwd, ".agent/graph-parts/root.xml")))
  assert.ok(!out.state.at.parts, "штампа нет — шаг открыт")
  assert.deepEqual(out.state.portions.map((p) => `${p.id}:${p.round}`), ["spine:1", "root:1"],
    "круги обеих порций целы")
})
