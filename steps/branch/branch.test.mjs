// Ядро шага 13 — чистое; git приезжает снимком, поэтому тест не знает ни про диск, ни про репозиторий.
// Формула: 1 happy + Σ ветвей антецедента с различимым следствием — пять отказов, пять швов.
import test from "node:test"
import assert from "node:assert/strict"
import { newBranch } from "./branch.mjs"

const HASH = "a6296f6d645e7aa646dfb5b495225d92faa617912f47908bb61ada53959a075b"
const GATE = { key: "DOS-535", planHash: HASH, answer: "approve" }
const GIT = { dirtyPaths: [], refs: ["main", "feature/DOS-100"], trunk: "main", trunkSha: "abc1234", remote: "origin", planHash: HASH }
const cut = (over = {}) => newBranch({
  prior: "prior" in over ? over.prior : null,
  gate: "gate" in over ? over.gate : GATE,
  planText: "planText" in over ? over.planText : "# План доработки\n## src/A.java\n",
  mode: "mode" in over ? over.mode : "minor",
  git: "git" in over ? over.git : GIT,
})

test("happy: ветка называется ключом задачи и режется от транка", () => {
  const r = cut()
  assert.equal(r.ok, true, r.ok ? "" : r.error.detail)
  assert.deepEqual({ ...r.value }, { name: "feature/DOS-535", key: "DOS-535", base: "main", baseSha: "abc1234", remote: "origin" })
})

// Префикс решает ВЕС, и решён он на шаге 7 — здесь только подстановка. Разотождествишь — и починка
// дефекта поедет веткой `feature/`, а релизные соглашения репозитория читают именно префикс.
test("префикс из веса: patch чинит дефект, остальное — функциональность", () => {
  assert.equal(cut({ mode: "patch" }).value.name, "bugfix/DOS-535")
  assert.equal(cut({ mode: "major" }).value.name, "feature/DOS-535")
  assert.equal(cut({ mode: "" }).value.name, "feature/DOS-535", "без веса — feature, а не отказ")
})

test("без акцепта ветки нет — ни без токена, ни с ответом не approve", () => {
  assert.equal(cut({ gate: null }).error.cls, "no-gate")
  assert.equal(cut({ gate: { ...GATE, answer: "rework" } }).error.cls, "no-gate")
  assert.match(cut({ gate: { ...GATE, key: "dos-535" } }).error.detail, /не той формы/)
})

// Самый важный отказ: токен несёт хеш плана, который оператор ЧИТАЛ. Перепиши план после гейта — и
// ветка отрезалась бы под работу, которую никто не утверждал.
test("план изменился после акцепта — отказ, и он называет оба хеша", () => {
  const r = cut({ git: { ...GIT, planHash: "0".repeat(64) } })
  assert.equal(r.error.cls, "plan-changed")
  assert.match(r.error.detail, /утверждали a6296f6d645e…, на диске 000000000000…/)
  assert.equal(cut({ planText: "  " }).error.cls, "plan-changed")
})

test("грязная копия и отсутствие транка — терминальные отказы с уликой", () => {
  const r = cut({ git: { ...GIT, dirtyPaths: ["src/A.java", "pom.xml"] } })
  assert.equal(r.error.cls, "dirty-worktree")
  assert.match(r.error.detail, /src\/A.java/, "отказ называет, ЧТО грязно — иначе человеку нечего чинить")
  assert.equal(cut({ git: { ...GIT, trunk: "" } }).error.cls, "no-trunk")
})

// СВОЯ ПОСТАВКА — НЕ ЧУЖАЯ РАБОТА. Шаг 9 пишет `task/<КЛЮЧ>/` за минуты до среза, и на живом прогоне
// c87db886 шаг 13 отказал ровно на ней: `?? task/` — единственное, что было в `git status`. Ветка
// режется ПОД эту поставку и уносит её с собой, поэтому грязью она быть не может. Всё остальное —
// по-прежнему терминальный отказ: чужие правки на рабочую ветку уезжать не должны.
test("поставка прогона не считается грязью, а всё рядом с ней — считается", () => {
  assert.equal(cut({ git: { ...GIT, dirtyPaths: ["task/DOS-535/PLAN.md", "task/DOS-535/design/labs-eddi.md"] } }).ok, true)
  assert.equal(cut({ git: { ...GIT, dirtyPaths: ["task/"] } }).ok, true, "git сворачивает нетронутый каталог в одну строку")

  // Поставка ДРУГОГО ключа — чужая работа: её ветка не унесёт, а перезапишет.
  assert.equal(cut({ git: { ...GIT, dirtyPaths: ["task/DOS-100/PLAN.md"] } }).error.cls, "dirty-worktree")
  assert.equal(cut({ git: { ...GIT, dirtyPaths: ["task/DOS-535/PLAN.md", "src/A.java"] } }).error.cls, "dirty-worktree")
})

test("имя занято — работа по ключу уже начата, и молча в неё не переключаемся", () => {
  const r = cut({ git: { ...GIT, refs: ["main", "feature/DOS-535"] } })
  assert.equal(r.error.cls, "branch-exists")
  assert.match(r.error.detail, /feature\/DOS-535 уже есть/)
})

test("тотальность: без входов — отказ, а не бросок", () => {
  const r = newBranch()
  assert.equal(r.ok, false)
  assert.equal(r.error.cls, "no-gate")
})

// СВОЯ ВЕТКА — НЕ ЗАНЯТОЕ ИМЯ. Живой прогон c87db886: ветка отрезана, .agent/branch.json на диске, мы
// на ней стоим — и перезапуск отказал `branch-exists`, будто работу начал кто-то другой. Тот же класс,
// что и у гейта, который не признавал собственный токен: артефакт шага — это РЕЦЕПТ, и предъявить его
// должен тот, кто его выдал.
test("шаг признаёт собственную ветку: тот же рецепт, то же имя, мы на ней", () => {
  const prior = { name: "feature/DOS-535", base: "main", baseSha: "abc1234", remote: "origin", key: "DOS-535" }
  const r = cut({ prior, git: { ...GIT, refs: ["main", "feature/DOS-535"], head: "feature/DOS-535" } })
  assert.equal(r.ok, true, r.ok ? "" : r.error.detail)
  assert.equal(r.value.name, "feature/DOS-535")
  assert.equal(r.value.kept, true, "рецепт не отмечен как признанный — шаг снова отрежет ветку")

  // Рецепт есть, но HEAD в другом месте: человек ушёл на другую ветку — это уже не наш случай.
  assert.equal(cut({ prior, git: { ...GIT, refs: ["main", "feature/DOS-535"], head: "main" } }).error.cls, "branch-exists")

  // Рецепта нет вовсе, а имя занято — по-прежнему терминальный отказ.
  assert.equal(cut({ git: { ...GIT, refs: ["main", "feature/DOS-535"], head: "feature/DOS-535" } }).error.cls, "branch-exists")

  // Рецепт от ДРУГОГО ключа своим не делает.
  assert.equal(cut({ prior: { ...prior, name: "feature/DOS-100" }, git: { ...GIT, refs: ["main", "feature/DOS-535"], head: "feature/DOS-535" } }).error.cls, "branch-exists")
})
