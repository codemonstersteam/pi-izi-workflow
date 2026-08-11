// The operator's answer channel: the role prints the command, the router executes it.
// Port of izi-flow-v2/bin/answer.test.mjs 1:1 (PLAN.md §3, task S3) — CLI behavior unchanged, only
// the journal inside answer.mjs is now written through bin/decisions-log.mjs (see answer.mjs MODULE_CONTRACT).

import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync, mkdtempSync } from "node:fs"
import { join, dirname } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"

const CLI = join(dirname(fileURLToPath(import.meta.url)), "answer.mjs")
const run = (root, q, text) => {
  try { return { code: 0, out: execFileSync("node", [CLI, `--root=${root}`, `--q=${q}`, `--text=${text}`], { encoding: "utf8" }) } }
  catch (e) { return { code: e.status, out: `${e.stdout || ""}${e.stderr || ""}` } }
}

test("the answer lands in .agent/answers.md together with the question", () => {
  const d = mkdtempSync(join(tmpdir(), "ans-"))
  assert.equal(run(d, "предел размера?", "20").code, 0)
  const t = readFileSync(join(d, ".agent", "answers.md"), "utf8")
  assert.match(t, /<question_1>предел размера\?<\/question_1>/)
  assert.match(t, /<answer_1>20<\/answer_1>/)
})

test("cumulative: a second answer does not overwrite the first", () => {
  const d = mkdtempSync(join(tmpdir(), "ans-"))
  run(d, "первый?", "1")
  run(d, "второй?", "2")
  const t = readFileSync(join(d, ".agent", "answers.md"), "utf8")
  assert.match(t, /<answer_1>1<\/answer_1>/)
  assert.match(t, /<answer_1>2<\/answer_1>/)
})

test("a repeat of the same answer does not duplicate the entry", () => {
  const d = mkdtempSync(join(tmpdir(), "ans-"))
  run(d, "q?", "20")
  run(d, "q?", "20")
  assert.equal(readFileSync(join(d, ".agent", "answers.md"), "utf8").split("<exchange>").length - 1, 1)
})

test("a template in place of an answer is rejected", () => {
  const d = mkdtempSync(join(tmpdir(), "ans-"))
  const r = run(d, "q?", "<operator answer>")
  assert.equal(r.code, 2)
  assert.match(r.out, /шаблон/)
})

test("an answer appends a line to .agent/decisions.log — the harness writes the journal, not the model (F2)", () => {
  const d = mkdtempSync(join(tmpdir(), "ans-"))
  run(d, "предел?", "20")
  const log = readFileSync(join(d, ".agent", "decisions.log"), "utf8")
  assert.match(log, /step=_answer/)
  assert.match(log, /actor=izi/)
})
