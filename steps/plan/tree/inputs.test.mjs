// ЮНИТЫ СУДА ВХОДА шага 9B (правило 11 standards/workflow-design.md).
// «Вход зелен» — это комментарий, пока никто не сверил содержимое; здесь проверяется, что сверяет.
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { inputs } from "./inputs.mjs"
import { sha1of } from "../../../ext/state.mjs"

const root = () => {
  const d = mkdtempSync(join(tmpdir(), "izi-in-"))
  mkdirSync(join(d, ".agent"), { recursive: true })
  for (const f of ["frd.xml", "ripple.xml", "appgraph.xml"]) writeFileSync(join(d, ".agent", f), `<${f}/>`)
  return d
}
const st = (cwd, at = {}) => ({ cwd, at })

test("happy: все три входа на месте и разбираются", () => {
  assert.equal(inputs(st(root())), "")
})

test("входного артефакта нет — отказ называет ФАЙЛ и шаг, который его даёт", () => {
  const d = root()
  rmSync(join(d, ".agent/ripple.xml"))
  const why = inputs(st(d))
  assert.match(why, /\.agent\/ripple\.xml/)
  assert.match(why, /ripple/, "отказ не назвал шаг-владельца — оператор не поймёт, что переигрывать")
})

test("входной артефакт пуст — отказ, а не тихая работа по пустоте", () => {
  const d = root()
  writeFileSync(join(d, ".agent/frd.xml"), "   \n")
  assert.match(inputs(st(d)), /пуст/)
})

test("артефакт ПРАВИЛИ РУКАМИ после продвижения — отказ: строить дерево не по чему", () => {
  const d = root()
  const at = { frd: { path: ".agent/frd.xml", sha1: sha1of("<frd.xml/>") } }
  assert.equal(inputs(st(d, at)), "", "нетронутый артефакт отбит")
  writeFileSync(join(d, ".agent/frd.xml"), "<frd.xml/> и ещё оператор дописал строку")
  const why = inputs(st(d, at))
  assert.match(why, /изменился/)
  assert.match(why, /переиграй intake/, "отказ не сказал, что делать — оператор останется с ним один на один")
})

test("отпечатка в состоянии нет — правило МОЛЧИТ о содержимом: сверять не с чем", () => {
  assert.equal(inputs(st(root(), {})), "")
})
