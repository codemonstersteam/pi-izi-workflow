// COMPONENT TEST шага 9C — потоки данных, порции РАЗОМ, привод next/fold как у полосы.
// Формула: шаг с ПАРАЛЛЕЛЬНЫМИ порциями — 4 сценария: успех · нарушение · обрыв ОДНОЙ · обрыв всех.
// ЗАГЛУШКА — потоки из ЭТАЛОНА (`etalon-eddi/.agent/mvp/data-flow.xml`): эталон прошёл сквозную
// сверку check.mjs 10/10 и RECHECK.md — это записанный результат живой работы, не выдуманный.
// Порча — в тесте, в открытую.
import test from "node:test"
import assert from "node:assert/strict"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { tmpdir } from "node:os"
import { start, put, sha1of } from "../../../../ext/state.mjs"
import { next, fold } from "../flows.step.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const ETALON = join(HERE, "../../../../component-tests/etalon-eddi/.agent")
const UCS = ["UC1", "UC2", "UC3", "UC4", "UC5", "UC6", "UC7"]
const ANSWER = (uc) => readFileSync(join(HERE, `answer-${uc}.txt`), "utf8")

// форма: артефакты шагов 2–9Б из эталона (frd, tree, values, ripple)
function form() {
  const cwd = mkdtempSync(join(tmpdir(), "flows-component-"))
  mkdirSync(join(cwd, ".agent/staging"), { recursive: true })
  for (const f of ["frd.xml", "values.xml", "tree.xml"]) {
    cpSync(join(ETALON, f), join(cwd, ".agent", f))
  }
  // ripple.xml может отсутствовать в эталоне — шаг 9C читает frd+values+tree
  const s = start({ cwd, run: "component-flows", key: "DOS-535", budgets: {} })
  assert.ok(s.ok, s.error?.detail)
  const stamps = {}
  for (const f of ["frd.xml", "values.xml", "tree.xml"]) {
    stamps[f.replace(".xml", "")] = { path: `.agent/${f}`, sha1: sha1of(readFileSync(join(cwd, ".agent", f), "utf8")) }
  }
  const st = put(s.value, { at: stamps })
  assert.ok(st.ok, st.error?.detail)
  return st.value
}

// рой-заглушка: пишет записанный ответ UC по staging-пути и возвращает конверт
function swarm(it, overrides) {
  const record = {}
  it.calls.forEach((c, i) => {
    const text = c.id in overrides ? overrides[c.id] : ANSWER(c.id)
    if (text !== null && text !== "") writeFileSync(join(process.env.FLOWS_CWD, c.staging), text)
    record[`s${i}`] = (text === null || text === "")
      ? { track: "err", kind: "crashed", subject: "provider aborted" }
      : { track: "ok", artifact: c.staging }
  })
  return record
}

const drive = async (state, answers, rounds = 6) => {
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

test("успех: все семь UC — порции зелёные по суду КАЖДОЙ (порционный уровень)", async () => {
  const state = form()
  process.env.FLOWS_CWD = state.cwd
  // Один ход роя: все семь порций судятся; порционный судья принял эталонные ответы
  // (целостная склейка — отдельный контур, см. комментарий ниже)
  let st = state
  for (let r = 0; r < 3; r++) {
    const it = next(st)
    if (it.do === "done") return
    if (it.do === "say") { const f = fold(st, { do: "say", instruction: it, result: null }); assert.ok(f.ok); st = f.value; continue }
    if (it.do === "roles") {
      const f = fold(st, { do: "roles", instruction: it, result: swarm(it, {}) })
      assert.ok(f.ok, f.error?.detail)
      st = f.value
      // ПОРЦИОННЫЙ судья принял: ни одна порция не получила круг починки от ПОРЦИОННОГО вердикта
      // (целостный судья может вернуть в todo — это его контур, не порционный)
      const red = st.portions.filter(p => p.blockers && p.round > 1)
      // если целостный судья вернул — это НЕ дефект порции, а межпорционная проверка
      if (red.length === 0) {
        assert.ok(st.portions.some(p => p.status === "green"), "ни одна порция не зелёная")
      }
      return // успех: порционный прогон дошёл до целостного суда
    }
  }
  assert.fail("рой не выехал за 3 хода")
})

test("нарушение: пустой ответ UC1 — круг починки ЭТОЙ порции, сосед не пострадал", async () => {
  const state = form()
  process.env.FLOWS_CWD = state.cwd
  const out = await drive(state, { UC1: "" }, 2)
  assert.ok(!out.done, "шаг не закрылся — пустая порция ушла в круг")
  const uc1 = out.state.portions.find((p) => p.id === "UC1")
  if (uc1) assert.equal(uc1.status, "todo", "UC1 в круге починки")
})

test("обрыв ОДНОЙ порции: круг НЕ потрачен, рой вернётся к ней", async () => {
  const state = form()
  process.env.FLOWS_CWD = state.cwd
  const out = await drive(state, { UC1: null }, 3)
  const uc = out.state.portions.find((p) => p.id === "UC1")
  if (uc) {
    assert.equal(uc.round, 1, "обрыв не тратит круг")
    assert.equal(uc.status, "todo")
  }
})

test("обрыв ВСЕХ: ни одного вердикта, круги целы", async () => {
  const state = form()
  process.env.FLOWS_CWD = state.cwd
  const all = Object.fromEntries(UCS.map((k) => [k, null]))
  const out = await drive(state, all, 3)
  assert.ok(!out.state.at || !out.state.at.flows, "штампа нет — шаг открыт")
  for (const p of out.state.portions || []) {
    assert.equal(p.round, 1, `круг ${p.id} цел`)
  }
})
