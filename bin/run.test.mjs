// run.mjs — головной модуль-труба (standards/code.md §5): не покрывается юнитом целиком, но чистые
// части (argv, инструкция запуска, выбор нового прогона по времени, терминальность, код возврата)
// вынесены в функции и покрыты здесь.

import test from "node:test"
import assert from "node:assert/strict"
import {
  parseArgv,
  buildRunInstruction,
  projectStorageKey,
  pickNewestRun,
  isTerminalState,
  resultExitCode,
} from "./run.mjs"

// --- parseArgv ----------------------------------------------------------------------------------

test("parseArgv: без --task берёт TASK.md по умолчанию", () => {
  assert.deepEqual(parseArgv([]), { taskPath: "TASK.md" })
})

test("parseArgv: --task= переопределяет путь", () => {
  assert.deepEqual(parseArgv(["--task=fixtures/no-number.md"]), { taskPath: "fixtures/no-number.md" })
})

// --- buildRunInstruction --------------------------------------------------------------------------

test("buildRunInstruction: несёт name/scriptPath/foreground и явно запрещает args", () => {
  const s = buildRunInstruction({ name: "izi", scriptPath: "workflows/izi.js", foreground: true })
  assert.match(s, /"izi"/)
  assert.match(s, /"workflows\/izi\.js"/)
  assert.match(s, /foreground: true/)
  assert.match(s, /Do not pass an `args`/)
})

test("buildRunInstruction: foreground нестрогое truthy не протекает как true", () => {
  const s = buildRunInstruction({ name: "izi", scriptPath: "workflows/izi.js", foreground: "yes" })
  assert.match(s, /foreground: false/)
})

// --- projectStorageKey -----------------------------------------------------------------------

test("projectStorageKey: детерминирован на одном и том же пути", () => {
  assert.equal(projectStorageKey("/a/b/izi-pi-v2"), projectStorageKey("/a/b/izi-pi-v2"))
})

test("projectStorageKey: несёт basename как читаемый префикс", () => {
  assert.match(projectStorageKey("/a/b/izi-pi-v2"), /^izi-pi-v2-[0-9a-f]{12}$/)
})

test("projectStorageKey: разные пути дают разные ключи", () => {
  assert.notEqual(projectStorageKey("/a/b/izi-pi-v2"), projectStorageKey("/a/c/izi-pi-v2"))
})

// --- pickNewestRun -----------------------------------------------------------------------------

test("pickNewestRun: старый прогон (до старта) не выбирается", () => {
  const runs = [{ id: "old", createdAtMs: 100 }]
  assert.equal(pickNewestRun(runs, 200), null)
})

test("pickNewestRun: из нескольких новых берёт самый свежий, а не последний по списку", () => {
  const runs = [
    { id: "new-1", createdAtMs: 300 },
    { id: "new-2", createdAtMs: 500 },
    { id: "old", createdAtMs: 100 },
  ]
  assert.equal(pickNewestRun(runs, 200).id, "new-2")
})

test("pickNewestRun: пустой список — null, а не исключение", () => {
  assert.equal(pickNewestRun([], 0), null)
})

// --- isTerminalState -----------------------------------------------------------------------------

test("isTerminalState: completed/failed/stopped — терминальны", () => {
  assert.equal(isTerminalState("completed"), true)
  assert.equal(isTerminalState("failed"), true)
  assert.equal(isTerminalState("stopped"), true)
})

test("isTerminalState: running и незнакомое значение — не терминальны", () => {
  assert.equal(isTerminalState("running"), false)
  assert.equal(isTerminalState(undefined), false)
})

// --- resultExitCode -----------------------------------------------------------------------------

test("resultExitCode: берёт числовой code из результата", () => {
  assert.equal(resultExitCode({ code: 10 }), 10)
  assert.equal(resultExitCode({ code: 0 }), 0)
})

test("resultExitCode: отсутствующий/нечисловой code — 2, а не тихий 0", () => {
  assert.equal(resultExitCode({}), 2)
  assert.equal(resultExitCode({ code: "0" }), 2)
  assert.equal(resultExitCode(null), 2)
})
