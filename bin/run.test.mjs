// run.mjs — головной модуль-труба (standards/code.md §5): не покрывается юнитом целиком, но чистые
// части (argv, инструкция запуска, разность множеств прогонов до/после, терминальность, код
// возврата) вынесены в функции и покрыты здесь.

import test from "node:test"
import assert from "node:assert/strict"
import {
  parseArgv,
  buildRunInstruction,
  projectStorageKey,
  newRunsSince,
  classifyNewRuns,
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

test("buildRunInstruction: прямо требует ровно один вызов workflow, без чтений и правок файлов", () => {
  const s = buildRunInstruction({ name: "izi", scriptPath: "workflows/izi.js", foreground: true })
  assert.match(s, /EXACTLY ONE call/)
  assert.match(s, /no reading files, no editing/)
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

// --- newRunsSince --------------------------------------------------------------------------------

test("newRunsSince: прогон, существовавший ДО старта, из разности исключён", () => {
  const before = new Set(["/runs/old"])
  const after = [{ id: "old", dir: "/runs/old", createdAtMs: 100 }]
  assert.deepEqual(newRunsSince(before, after), [])
})

test("newRunsSince: прогон, которого не было в снимке ДО, входит в разность", () => {
  const before = new Set(["/runs/old"])
  const after = [
    { id: "old", dir: "/runs/old", createdAtMs: 100 },
    { id: "new", dir: "/runs/new", createdAtMs: 200 },
  ]
  assert.deepEqual(newRunsSince(before, after), [{ id: "new", dir: "/runs/new", createdAtMs: 200 }])
})

test("newRunsSince: пустой снимок ДО — все текущие прогоны новые", () => {
  const after = [{ id: "a", dir: "/runs/a", createdAtMs: 1 }, { id: "b", dir: "/runs/b", createdAtMs: 2 }]
  assert.deepEqual(newRunsSince(new Set(), after), after)
})

test("newRunsSince: старый прогон с более поздним mtime всё равно исключён — решает множество, не время", () => {
  // регрессия дефекта S4: «взять самый новый по времени» путал старый прогон с новым, если у
  // старого оказывался более поздний createdAtMs (например, из другой, параллельно идущей сессии)
  const before = new Set(["/runs/old-but-touched-later"])
  const after = [
    { id: "old-but-touched-later", dir: "/runs/old-but-touched-later", createdAtMs: 9999 },
    { id: "new", dir: "/runs/new", createdAtMs: 100 },
  ]
  assert.deepEqual(newRunsSince(before, after), [{ id: "new", dir: "/runs/new", createdAtMs: 100 }])
})

// --- classifyNewRuns -----------------------------------------------------------------------------

test("classifyNewRuns: ноль новых прогонов — kind:none, прежний диагноз preflight", () => {
  assert.deepEqual(classifyNewRuns([]), { kind: "none" })
})

test("classifyNewRuns: ровно один новый прогон — kind:one, берём его", () => {
  const run = { id: "r1", dir: "/runs/r1", createdAtMs: 1 }
  assert.deepEqual(classifyNewRuns([run]), { kind: "one", run })
})

test("classifyNewRuns: два и более новых прогона — kind:many, называет ВСЕ, не выбирает", () => {
  const runs = [
    { id: "r1", dir: "/runs/r1", createdAtMs: 1 },
    { id: "r2", dir: "/runs/r2", createdAtMs: 2 },
  ]
  assert.deepEqual(classifyNewRuns(runs), { kind: "many", runs })
})

test("classifyNewRuns: три новых прогона — тоже kind:many, а не «берём первый попавшийся»", () => {
  const runs = [
    { id: "r1", dir: "/runs/r1", createdAtMs: 1 },
    { id: "r2", dir: "/runs/r2", createdAtMs: 2 },
    { id: "r3", dir: "/runs/r3", createdAtMs: 3 },
  ]
  const result = classifyNewRuns(runs)
  assert.equal(result.kind, "many")
  assert.equal(result.runs.length, 3)
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
