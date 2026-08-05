// Гардрейл входа `task` — io-труба (steps/task/validate-task.mjs, MODULE_CONTRACT: io: fs), поэтому
// тестируется прогоном подпроцесса (standards/code.md §5: «I/O-модули НЕ покрываются юнитами, их
// доказывает компонентный сценарий») и его кодом возврата, а не импортом функции — импортировать
// здесь нечего: TASK_LINES_CAP это export const без функции, а решение принимает верхний уровень
// модуля при исполнении файла.

import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const HERE = dirname(fileURLToPath(import.meta.url))
const CLI = join(HERE, "validate-task.mjs")
const TASK_LINES_CAP = 300

function sandbox() {
  return mkdtempSync(join(tmpdir(), "validate-task-"))
}

const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" })

test("нет файла — usage и код 2, когда путь вовсе не передан", () => {
  const r = run()
  assert.equal(r.status, 2)
  assert.match(r.stderr, /usage/)
})

test("файла не существует на диске — отказ, код 1", () => {
  const d = sandbox()
  const f = join(d, "TASK.md")
  const r = run(f)
  assert.equal(r.status, 1)
  assert.match(r.stderr, /не существует/)
  rmSync(d, { recursive: true, force: true })
})

test("пустой файл — молчание не является требованием, код 1", () => {
  const d = sandbox()
  const f = join(d, "TASK.md")
  writeFileSync(f, "   \n\n  \n")
  const r = run(f)
  assert.equal(r.status, 1)
  assert.match(r.stderr, /пуст/)
  rmSync(d, { recursive: true, force: true })
})

test(`файл сверх предела ${TASK_LINES_CAP} строк — задачу делит человек, код 1`, () => {
  const d = sandbox()
  const f = join(d, "TASK.md")
  writeFileSync(f, Array.from({ length: TASK_LINES_CAP + 1 }, (_, i) => `строка ${i}`).join("\n"))
  const r = run(f)
  assert.equal(r.status, 1)
  assert.match(r.stderr, /строк при пределе/)
  rmSync(d, { recursive: true, force: true })
})

test(`файл ровно на пределе ${TASK_LINES_CAP} строк — предел не строгий сверху, зелёный`, () => {
  const d = sandbox()
  const f = join(d, "TASK.md")
  writeFileSync(f, Array.from({ length: TASK_LINES_CAP }, (_, i) => `строка ${i}`).join("\n"))
  const r = run(f)
  assert.equal(r.status, 0)
  rmSync(d, { recursive: true, force: true })
})

test("непустой файл в пределах строк — зелёный, код 0", () => {
  const d = sandbox()
  const f = join(d, "TASK.md")
  writeFileSync(f, "Сделать штуку, которая делает дело.\n")
  const r = run(f)
  assert.equal(r.status, 0)
  assert.match(r.stdout, /✓/)
  rmSync(d, { recursive: true, force: true })
})
