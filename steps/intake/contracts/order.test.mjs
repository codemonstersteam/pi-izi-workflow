// Units of the contracts order slice. By the formula of standards/code.md:
//     N = 1 happy path + Σ antecedent branches with a DISTINGUISHABLE consequent + 1 silence
//
// The judge material is the REAL artifact of the etalon run's owners layer
// (component-tests/steps/intake/2-owners/out/frd~owners.xml), and the map is the etalon
// package's own appgraph — the slice is proven on what the pipeline really accepted.
// The «B1 не оставил владельцев» branch is proven integration-side by order.test.mjs.
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { orderSlice } from "./order.mjs"

const ETALON = fileURLToPath(new URL("../../../component-tests/etalon-eddi", import.meta.url))
const OWNERS_XML = readFileSync(
  fileURLToPath(new URL("../../../component-tests/steps/intake/2-owners/out/frd~owners.xml", import.meta.url)), "utf8")

test("слайс contracts строит таблицу владельцев МАШИНОЙ из слоя owners и честный срез карты", () => {
  const slots = orderSlice({ cwd: ETALON }, OWNERS_XML)
  assert.deepEqual(Object.keys(slots).sort(),
    ["{DELTA_FORMS}", "{MAPSLICE}", "{OWNERS}"], "слоты пласта не те")
  assert.match(slots["{OWNERS}"], /^UC1\/1 → src\/main\/java\/ai\/labs\/eddi\/configs\/glossaries\/rest\/RestGlossaryStore\.java \(new\)$/m,
    "таблица владельцев не машиной из staging B1 — связь снова проза")
  assert.match(slots["{MAPSLICE}"], /RestGlossaryStore\.java — \(нет в карте — новый файл\)/,
    "новый узел не назван «нет в карте» — модель не отличит новый файл от забытого")
  assert.equal(slots["{DELTA_FORMS}"], "Added · Changed · Removed · Fixed · Unknown",
    "словарь форм дельт дошёл не тем — вес шага 7 читает его же")
})
