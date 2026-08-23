// СУД ВХОДА шага 2: есть ли из чего делать требование и то ли это, что принял шаг 1.
// Перенесено без правок из прежнего теста ядра — правила входа тикет 03 не трогал.
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { inputs, CLASSES as IN_CLASSES } from "./inputs.mjs"
import { sha1of } from "../../ext/state.mjs"

const root = (task = "task: DOS-535\nтребование\n") => {
  const d = mkdtempSync(join(tmpdir(), "izi-brd-u-"))
  mkdirSync(join(d, ".agent"), { recursive: true })
  if (task !== null) writeFileSync(join(d, "TASK.md"), task)
  return d
}

test("inputs happy: задача на месте, ключ есть, отпечаток совпал", () => {
  const cwd = root()
  const at = { task: { path: "TASK.md", sha1: sha1of(readFileSync(join(cwd, "TASK.md"), "utf8")) } }
  assert.equal(inputs({ cwd, key: "DOS-535", at }), null)
})

test("inputs: TASK.md нет — класс no-task, и отказ называет, кто его кладёт", () => {
  const r = inputs({ cwd: root(null), key: "DOS-535", at: {} })
  assert.equal(r.cls, "no-task")
  assert.match(r.why, /оператор/)
})

test("inputs: ключа нет — класс no-key, и отказ объясняет, чем ключ важен", () => {
  const r = inputs({ cwd: root(), key: "", at: {} })
  assert.equal(r.cls, "no-key")
  assert.match(r.why, /ветк|тикет|план/)
})

test("inputs: задачу правили после шага 1 — класс task-changed, и сказано, что переиграть", () => {
  const cwd = root()
  const at = { task: { path: "TASK.md", sha1: sha1of("другой текст") } }
  const r = inputs({ cwd, key: "DOS-535", at })
  assert.equal(r.cls, "task-changed")
  assert.match(r.why, /переиграй task/)
})

test("inputs МОЛЧАНИЕ: отпечатка в состоянии нет — сверять не с чем", () => {
  assert.equal(inputs({ cwd: root(), key: "DOS-535", at: {} }), null)
})

test("inputs: все объявленные классы достижимы — ни один не мёртв", () => {
  const seen = new Set([
    inputs({ cwd: root(null), key: "K", at: {} }).cls,
    inputs({ cwd: root(), key: "", at: {} }).cls,
    inputs({ cwd: root(), key: "K", at: { task: { path: "TASK.md", sha1: "нет" } } }).cls,
  ])
  for (const c of IN_CLASSES) assert.ok(seen.has(c), `класс «${c}» объявлен, но ни одна ветвь его не возвращает`)
})
