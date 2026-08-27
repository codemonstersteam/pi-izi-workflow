// Seam: solo_answer schema — pi expects parameters (TypeBox), not input.
// A wrong key silently kills the tool on first model turn (live 27.08).
import test from "node:test"
import assert from "node:assert/strict"
import { soloAnswer } from "./answer-tool.ts"

test("solo_answer: parameters TypeBox (не input) + execute (не run)", () => {
  assert.ok((soloAnswer as any).parameters, "parameters отсутствует — pi отвергнет вызов")
  assert.ok((soloAnswer as any).parameters.properties, "parameters.properties отсутствует — undefined.properties на первом ходе")
  assert.equal(typeof (soloAnswer as any).execute, "function", "execute — не функция")
  assert.ok(!("input" in (soloAnswer as any)), "input-поле осталось — старый формат")
  assert.ok(!("run" in (soloAnswer as any)), "run-поле осталось — старый формат")
})
