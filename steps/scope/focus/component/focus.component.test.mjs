// COMPONENT TEST подшага 3Б — фокус роя на мини-репозитории, привод next/fold как у полосы.
// Формула: 2 сценария (успех · нарушение). Вход подшага готовится НАСТОЯЩЕЙ головю 3A — фокус
// судит то, что реально лежит после плана, а не самодельную подделку плана.
import test from "node:test"
import assert from "node:assert/strict"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { tmpdir } from "node:os"
import { start, put, sha1of } from "../../../../ext/state.mjs"
import { next as planNext, fold as planFold } from "../../plan/plan.step.mjs"
import { next, fold } from "../focus.step.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const FIX = join(HERE, "../../fixture")

function form() {
  const cwd = mkdtempSync(join(tmpdir(), "scope-focus-"))
  cpSync(join(FIX, "mini"), cwd, { recursive: true })
  mkdirSync(join(cwd, ".agent"), { recursive: true })
  cpSync(join(FIX, "agent"), join(cwd, ".agent"), { recursive: true })
  const s = start({ cwd, run: "component-focus", key: "FIX-1", budgets: {} })
  assert.ok(s.ok, s.error?.detail)
  const brd = readFileSync(join(cwd, ".agent/brd.md"), "utf8")
  let state = put(s.value, { at: { brd: { path: ".agent/brd.md", sha1: sha1of(brd) } } }).value
  const it = planNext(state)
  state = planFold(state, { do: "say", instruction: it, result: null }).value   // 3A закрыт по-настоящему
  return state
}

test("успех: план + факт → focus.json, предмет назван, штамп лёг, второй next — done", () => {
  const state = form()
  const it = next(state)
  assert.equal(it.do, "say")

  const folded = fold(state, { do: "say", instruction: it, result: null })
  assert.ok(folded.ok, folded.error?.detail)

  const focus = JSON.parse(readFileSync(join(state.cwd, ".agent/focus.json"), "utf8"))
  const said = [...(focus.covered || []), ...(focus.uncovered || [])].map((x) => x.subject)
  assert.ok(said.includes("Fruit"), "предмет требования назван — либо покрытым, либо непрочитанным (J18)")
  assert.ok((focus.cells || []).length > 0, "рой получил состав клеток")
  assert.equal(folded.value.at.focus.path, ".agent/focus.json")
  assert.equal(next(folded.value).do, "done")
})

test("нарушение: предмет пропал из covered/uncovered — named-отказ FC1, фокус не лёг", () => {
  const state = form()
  const it = next(state)
  const broken = fold(state, { do: "say", instruction: { ...it, focus: { ...it.focus, covered: [], uncovered: [] } }, result: null })
  assert.ok(!broken.ok, "молчание фокуса — дефект скрипта, а не успех")
  assert.match(broken.error.detail, /FC1/, "отказ называет правило по имени")
  assert.ok(!existsSync(join(state.cwd, ".agent/focus.json")), "отбитый фокус не лёг на диск")
})
