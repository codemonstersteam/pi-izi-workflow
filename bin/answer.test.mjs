// Канал ответа оператора: команду печатает роль, исполняет роутер.
// Порт izi-flow-v2/bin/answer.test.mjs 1:1 (PLAN.md §3, задача S3) — поведение CLI не изменилось,
// только журнал внутри answer.mjs пишется через bin/decisions-log.mjs (см. answer.mjs MODULE_CONTRACT).

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

test("ответ ложится в .agent/answers.md вместе с вопросом", () => {
  const d = mkdtempSync(join(tmpdir(), "ans-"))
  assert.equal(run(d, "предел размера?", "20").code, 0)
  const t = readFileSync(join(d, ".agent", "answers.md"), "utf8")
  assert.match(t, /предел размера\?/)
  assert.match(t, /ответ: 20/)
})

test("накопительно: второй ответ не затирает первый", () => {
  const d = mkdtempSync(join(tmpdir(), "ans-"))
  run(d, "первый?", "1")
  run(d, "второй?", "2")
  const t = readFileSync(join(d, ".agent", "answers.md"), "utf8")
  assert.match(t, /ответ: 1/)
  assert.match(t, /ответ: 2/)
})

test("повтор того же ответа не дублирует запись", () => {
  const d = mkdtempSync(join(tmpdir(), "ans-"))
  run(d, "q?", "20")
  run(d, "q?", "20")
  assert.equal(readFileSync(join(d, ".agent", "answers.md"), "utf8").split("- вопрос:").length - 1, 1)
})

test("шаблон вместо ответа отбивается", () => {
  const d = mkdtempSync(join(tmpdir(), "ans-"))
  const r = run(d, "q?", "<operator answer>")
  assert.equal(r.code, 2)
  assert.match(r.out, /шаблон/)
})

test("ответ дописывает строку в .agent/decisions.log — журнал пишет харнес, а не модель (F2)", () => {
  const d = mkdtempSync(join(tmpdir(), "ans-"))
  run(d, "предел?", "20")
  const log = readFileSync(join(d, ".agent", "decisions.log"), "utf8")
  assert.match(log, /step=_answer/)
  assert.match(log, /actor=izi/)
})
