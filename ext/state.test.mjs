// ЮНИТЫ СОСТОЯНИЯ. Формула — standards/workflow-design.md: 1 happy + ветвь на антецедент.
// Тикет T04. Каждый тест работает в своём mkdtemp: состояние живёт от cwd прогона, и тест, который
// пишет в этот репозиторий, — дефект, а не сокращение (CLAUDE.md, ограничение 6).
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { start, put, close, resume, sha1of, STEPS, DEFAULT_BUDGETS } from "./state.mjs"

const root = () => {
  const d = mkdtempSync(join(tmpdir(), "izi-state-"))
  mkdirSync(join(d, ".agent", "staging"), { recursive: true })
  return d
}
const why = (r) => (r.ok ? "" : r.error.detail)
const fresh = (d) => start({ cwd: d, run: "r1", key: "DOS-535" }).value

// --- start ------------------------------------------------------------------------------------------
test("start: happy — чистое состояние с полным словарём бюджетов", () => {
  const r = start({ cwd: root(), run: "r1", key: "DOS-535" })
  assert.equal(r.ok, true, why(r))
  assert.deepEqual(Object.keys(r.value.budgets).sort(), Object.keys(DEFAULT_BUDGETS).sort())
  assert.deepEqual(r.value.closed, [])
})

test("start: чужой cwd — отказ, а не молчаливое создание", () => {
  assert.equal(start({ cwd: "/нет/такого/каталога", run: "r1" }).ok, false)
})

test("start: без идентификатора прогона — отказ: трейс некуда писать", () => {
  const r = start({ cwd: root(), run: "" })
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /прогона/)
})

test("start: staging НЕ чистится — resume видит закрытые подшаги и не перегоняет их", () => {
  // Приёмка 26.08: чистка staging на каждом запуске заставляла перегонять ВСЕ закрытые подшаги
  // (+2 вызова на каждую станцию приёмки). Recon уже различает: файл есть → green, нет → todo.
  // Черновик прошлого круга невозможен по построению: наряд перед вызовом роли чистит СВОЙ
  // staging-путь (tree.step.mjs::next), а не весь каталог.
  const d = root()
  writeFileSync(join(d, ".agent/staging/frd~owners.xml"), "закрытый подшаг прошлого запуска")
  start({ cwd: d, run: "r2" })
  assert.ok(existsSync(join(d, ".agent/staging/frd~owners.xml")), "staging закрытого подшага стёрт — resume сломан")
})

test("start: уносит прошлые ответы в .agent/prev, а не удаляет", () => {
  const d = root()
  writeFileSync(join(d, ".agent/answers.md"), "ответ оператора вчера")
  const r = start({ cwd: d, run: "r2" })
  assert.deepEqual(r.value.carried, [".agent/answers.md"])
  assert.equal(readFileSync(join(d, ".agent/prev/answers.md"), "utf8"), "ответ оператора вчера")
})

test("start: бюджет вне формы — отказ с именем поля", () => {
  const r = start({ cwd: root(), run: "r1", budgets: { loops: 0 } })
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /loops/)
})

// --- put --------------------------------------------------------------------------------------------
test("put: happy — новое состояние, вход НЕ тронут", () => {
  const s = fresh(root())
  const before = JSON.stringify(s)
  const r = put(s, { asked: 2 })
  assert.equal(r.ok, true, why(r))
  assert.equal(r.value.asked, 2)
  assert.equal(JSON.stringify(s), before, "put мутировал вход — конструктор перестал быть гардрейлом")
})

test("put: круг порции за пределом бюджета — отказ", () => {
  const s = fresh(root())
  const r = put(s, { portions: [{ id: "UC1", staging: "s", status: "red", round: s.budgets.loops + 2 }] })
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /круг/)
})

test("put: круг РОВНО на единицу за пределом создаётся — иначе escalate недостижим", () => {
  const s = fresh(root())
  const r = put(s, { portions: [{ id: "UC1", staging: "s", status: "red", round: s.budgets.loops + 1 }] })
  assert.equal(r.ok, true, why(r))
})

test("put: неизвестное имя шага в closed — отказ, и он перечисляет словарь", () => {
  const r = put(fresh(root()), { closed: ["tree"] })
  assert.equal(r.ok, false)
  assert.ok(STEPS.every((s) => r.error.detail.includes(s)))
})

test("put: артефакт без отпечатка — отказ: «шаг закрыт» ничего не говорит о содержимом", () => {
  const r = put(fresh(root()), { at: { frd: { path: ".agent/frd.xml" } } })
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /отпечат/)
})

test("put: вопрос без имени паузы — отказ: второй вопрос до оператора не доедет", () => {
  const r = put(fresh(root()), { question: { items: ["как быть?"] } })
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /имени паузы/)
})

test("put: красный вердикт без блокеров — отказ (конструктор вердикта)", () => {
  const r = put(fresh(root()), { verdicts: [{ step: "plan/tree", scope: "whole", round: 1, ok: false }] })
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /блокер/)
})

// --- close ------------------------------------------------------------------------------------------
test("close: happy — шаг в closed, артефакт с отпечатком, снимок на диске", () => {
  const d = root()
  writeFileSync(join(d, ".agent/brd.md"), "R1 …")
  const r = close(fresh(d), "brd", { brd: ".agent/brd.md" })
  assert.equal(r.ok, true, why(r))
  assert.deepEqual(r.value.closed, ["brd"])
  assert.equal(r.value.at.brd.sha1, sha1of("R1 …"))
  assert.ok(existsSync(join(d, ".agent/state.json")))
})

test("close: объявленного артефакта нет на диске — отказ с именем файла", () => {
  const r = close(fresh(root()), "brd", { brd: ".agent/brd.md" })
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /\.agent\/brd\.md/)
})

test("close: неизвестный шаг — отказ", () => {
  assert.equal(close(fresh(root()), "дизайн", {}).ok, false)
})

test("close: сбрасывает порции и вопрос — следующий шаг начинает с чистого состава", () => {
  const d = root()
  writeFileSync(join(d, ".agent/brd.md"), "R1")
  const s = put(fresh(d), { portions: [{ id: "1", staging: "s", status: "green", round: 1 }] }).value
  const r = close(s, "brd", { brd: ".agent/brd.md" })
  assert.deepEqual(r.value.portions, [])
})

// --- resume -----------------------------------------------------------------------------------------
test("resume: снимка нет — отказ «прогон с нуля», а не пустое состояние", () => {
  const r = resume(root())
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /с нуля/)
})

test("resume: happy — состояние восстановлено, from называет первый незакрытый шаг", () => {
  const d = root()
  writeFileSync(join(d, ".agent/brd.md"), "R1")
  close(fresh(d), "brd", { brd: ".agent/brd.md" })
  const r = resume(d, [{ step: "brd", status: "done" }])
  assert.equal(r.ok, true, why(r))
  assert.equal(r.value.from, "task")
  assert.deepEqual(r.value.state.closed, ["brd"])
})

test("resume: снимок от чужого каталога — отказ", () => {
  const d = root(), other = root()
  writeFileSync(join(d, ".agent/brd.md"), "R1")
  close(fresh(d), "brd", { brd: ".agent/brd.md" })
  writeFileSync(join(other, ".agent/state.json"), readFileSync(join(d, ".agent/state.json"), "utf8"))
  const r = resume(other, [{ step: "brd", status: "done" }])
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /чужого/)
})

test("resume: снимок расходится с трейсом — отказ С ИМЕНЕМ ШАГА", () => {
  const d = root()
  writeFileSync(join(d, ".agent/brd.md"), "R1")
  close(fresh(d), "brd", { brd: ".agent/brd.md" })
  const r = resume(d, [{ step: "task", status: "done" }])
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /brd/)
})

test("resume: артефакт ПРАВИЛИ РУКАМИ — шаг переигрывается, что бы ни говорил closed", () => {
  const d = root()
  writeFileSync(join(d, ".agent/brd.md"), "R1")
  close(fresh(d), "brd", { brd: ".agent/brd.md" })
  writeFileSync(join(d, ".agent/brd.md"), "R1, и ещё оператор дописал R2 руками")
  const r = resume(d, [{ step: "brd", status: "done" }])
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /изменился/)
})

test("resume: артефакт исчез — отказ, а не тихая работа по пустоте", () => {
  const d = root()
  writeFileSync(join(d, ".agent/brd.md"), "R1")
  close(fresh(d), "brd", { brd: ".agent/brd.md" })
  rmSync(join(d, ".agent/brd.md"))
  const r = resume(d, [{ step: "brd", status: "done" }])
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /исчез/)
})

test("resume: снимок не разбирается — отказ, а не исключение", () => {
  const d = root()
  writeFileSync(join(d, ".agent/state.json"), "{ это не json")
  const r = resume(d)
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /разбирается/)
})
