// Units of the data-failures order slice. By the formula of standards/code.md:
//     N = 1 happy path + Σ antecedent branches with a DISTINGUISHABLE consequent + 1 silence
//
// The slot that only THIS layer owns is {SOURCES}: the closed vocabulary of where a number may
// come from. The unit proves the slice carries every legal source — a value quoted from nowhere
// is an invented default (constraint 3), and the guardrail (F5/F13) judges by the same list.
// {BRD}/{NORMALIZED} byte-equality is proven by the scenarios slice unit on the same etalon.
import test from "node:test"
import assert from "node:assert/strict"
import { fileURLToPath } from "node:url"
import { orderSlice } from "./order.mjs"

const ETALON = fileURLToPath(new URL("../../../component-tests/etalon-eddi", import.meta.url))

test("слайс data-failures несёт {SOURCES} со ВСЕМИ легальными источниками чисел", () => {
  const slots = orderSlice({ cwd: ETALON })
  assert.deepEqual(Object.keys(slots).sort(),
    ["{BRD}", "{NORMALIZED}", "{SOURCES}"], "слоты пласта не те")
  for (const src of ["TASK.md", "answers.md", "brd.md", "normalized.md", "appgraph.xml"]) {
    assert.ok(slots["{SOURCES}"].includes(src),
      `источник «${src}» выпал из {SOURCES} — его числа станут считаться выдуманными`)
  }
  assert.ok(slots["{BRD}"].length && slots["{NORMALIZED}"].length,
    "эталон не донёс BRD/normalized — стенд ослеп")
})
