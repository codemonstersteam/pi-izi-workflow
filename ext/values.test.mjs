// ЮНИТЫ КОНСТРУКТОРОВ ЗНАЧЕНИЙ. Формула — standards/workflow-design.md, $START_TESTS:
// 1 happy на конструктор + ветвь на каждый различимый антецедент.
// Тикет T03. Внешних операндов у этих конструкторов нет — ветви «молчание» здесь не бывает.
import test from "node:test"
import assert from "node:assert/strict"
import { instruction, verdict, err, portion, WORDS, KINDS, PROMPT_MAX } from "./values.mjs"

const why = (r) => (r.ok ? "" : r.error.detail)

// --- instruction ----------------------------------------------------------------------------------
test("instruction: happy — слово из словаря со своими полями строится", () => {
  const r = instruction({ do: "role", role: "tree-designer", text: "наряд", staging: ".agent/staging/tree~1.xml" })
  assert.equal(r.ok, true, why(r))
  assert.equal(r.value.role, "tree-designer")
})

test("instruction: слово вне словаря — отказ, и он называет слово", () => {
  const r = instruction({ do: "whisper", text: "x" })
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /whisper/)
  assert.ok(WORDS.every((w) => r.error.detail.includes(w)), "отказ не перечислил словарь — автор не узнает, что можно")
})

test("instruction: role без text — отказ с именем поля, а не agent(undefined)", () => {
  const r = instruction({ do: "role", role: "gilb", staging: ".agent/staging/brd.md" })
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /text/)
})

test("instruction: roles с пустым calls — отказ", () => {
  assert.equal(instruction({ do: "roles", calls: [] }).ok, false)
})

test("instruction: roles, где у вызова нет staging, — отказ (роль некуда послать)", () => {
  const r = instruction({ do: "roles", calls: [{ id: "UC1", role: "flow-designer", text: "t" }] })
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /staging/)
})

test("instruction: ask с текстом длиннее предела хоста — отказ ЗДЕСЬ, а не INVALID_METADATA в прогоне", () => {
  const r = instruction({ do: "ask", name: "intake-q1", prompt: "я".repeat(PROMPT_MAX), items: ["в?"] })
  assert.equal(r.ok, false)
  assert.match(r.error.detail, new RegExp(String(PROMPT_MAX)))
})

test("instruction: ask без items — отказ: отвечать будет не по чему", () => {
  const r = instruction({ do: "ask", name: "intake-q1", prompt: "коротко", items: [] })
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /items/)
})

test("instruction: err с кодом вне словаря — отказ", () => {
  const r = instruction({ do: "err", code: "oops", subject: "что-то" })
  assert.equal(r.ok, false)
  assert.ok(KINDS.every((k) => r.error.detail.includes(k)))
})

test("instruction: done без состояния — отказ", () => {
  assert.equal(instruction({ do: "done" }).ok, false)
})

// --- verdict --------------------------------------------------------------------------------------
test("verdict: happy — зелёный вердикт порции строится", () => {
  const r = verdict({ step: "plan/tree", scope: "portion", id: "1", round: 1, ok: true })
  assert.equal(r.ok, true, why(r))
  assert.equal(r.value.blockers, "")
})

test("verdict: КРАСНЫЙ без блокеров не создаётся — иначе наряд починки пуст", () => {
  const r = verdict({ step: "plan/tree", scope: "whole", round: 1, ok: false })
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /блокер/)
})

test("verdict: без шага — отказ: непонятно, что судили", () => {
  assert.equal(verdict({ scope: "whole", round: 1, ok: true }).ok, false)
})

test("verdict: scope вне пары portion|whole — отказ", () => {
  const r = verdict({ step: "plan/tree", scope: "часть", round: 1, ok: true })
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /portion/)
})

test("verdict: без round — отказ: круг починки нечем считать", () => {
  assert.equal(verdict({ step: "plan/tree", scope: "whole", ok: true }).ok, false)
})

test("verdict: вердикт ПОРЦИИ без её id — отказ: адресата починки не будет", () => {
  const r = verdict({ step: "plan/flows", scope: "portion", round: 1, ok: true })
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /id/)
})

// --- err ------------------------------------------------------------------------------------------
test("err: happy — отказ с классом и подлежащим", () => {
  const r = err("escalate", { subject: "круги исчерпаны" })
  assert.equal(r.ok, true, why(r))
  assert.equal(r.value.evidence, "")
})

test("err: класс вне словаря — отказ", () => {
  assert.equal(err("странный", { subject: "x" }).ok, false)
})

test("err: без subject — отказ: оператору нечего читать", () => {
  const r = err("blocked", {})
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /subject/)
})

// --- portion --------------------------------------------------------------------------------------
test("portion: happy — id СТРОКА, а не номер", () => {
  const r = portion({ id: "UC1", staging: ".agent/staging/flows~UC1.xml", status: "todo", round: 1 })
  assert.equal(r.ok, true, why(r))
  assert.equal(r.value.id, "UC1")
})

test("portion: без id — отказ: нечем адресовать в наряде починки", () => {
  assert.equal(portion({ staging: "s", status: "todo", round: 1 }).ok, false)
})

test("portion: без staging — отказ: роль некуда послать", () => {
  const r = portion({ id: "UC1", status: "todo", round: 1 })
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /staging/)
})

test("portion: status вне словаря — отказ", () => {
  const r = portion({ id: "UC1", staging: "s", status: "почти", round: 1 })
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /todo/)
})

test("portion: round нулевой — отказ: круги считаются с единицы", () => {
  assert.equal(portion({ id: "UC1", staging: "s", status: "todo", round: 0 }).ok, false)
})
