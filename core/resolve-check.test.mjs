// resolveCheck: 1 happy + 2 различимых исхода (плейсхолдер повторяется · плейсхолдера нет вовсе).
// Мирроп этой функции внутри workflows/izi.js доказывает живой прогон, не юнит (песочница воркфлоу
// без import — см. MODULE_CONTRACT).

import test from "node:test"
import assert from "node:assert/strict"
import { resolveCheck } from "./resolve-check.mjs"

test("artifact подставляется в каждый {{artifact}} среди args", () => {
  const check = { cmd: "node steps/brd/validate-brd.mjs", args: ["{{artifact}}", "--task=TASK.md", "--answers=.agent/answers.md"] }
  assert.equal(
    resolveCheck(check, ".agent/staging/brd.md"),
    "node steps/brd/validate-brd.mjs .agent/staging/brd.md --task=TASK.md --answers=.agent/answers.md",
  )
})

test("плейсхолдер, повторённый внутри одного arg, заменяется целиком", () => {
  const check = { cmd: "diff", args: ["{{artifact}}.bak", "{{artifact}}"] }
  assert.equal(resolveCheck(check, "out.md"), "diff out.md.bak out.md")
})

test("args без {{artifact}} вовсе — команда остаётся как есть", () => {
  const check = { cmd: "node steps/task/validate-task.mjs", args: [] }
  assert.equal(resolveCheck(check, "TASK.md"), "node steps/task/validate-task.mjs")
})
