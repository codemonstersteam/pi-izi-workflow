// Units of the scenarios order slice. By the formula of standards/code.md:
//     N = 1 happy path + Σ antecedent branches with a DISTINGUISHABLE consequent + 1 silence
//
// The etalon package (component-tests/etalon-eddi) is the measure, not an illustration: the
// slice feeds the role the artifact of step 2 AS PROMOTED, byte for byte — the role of pass A
// starts from what the pipeline really accepted on a live run.
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { orderSlice } from "./order.mjs"

const ETALON = fileURLToPath(new URL("../../../component-tests/etalon-eddi", import.meta.url))

test("слайс scenarios несёт ОБА слота — BRD и normalized эталона целиком, без переписывания", () => {
  const slots = orderSlice({ cwd: ETALON })
  assert.deepEqual(Object.keys(slots).sort(), ["{BRD}", "{NORMALIZED}"], "слоты пласта не те")
  assert.equal(slots["{BRD}"], readFileSync(`${ETALON}/.agent/brd.md`, "utf8").trim(),
    "BRD дошёл не тем байтами — роль увидит не то, что принял шаг 2")
  assert.equal(slots["{NORMALIZED}"], readFileSync(`${ETALON}/.agent/normalized.md`, "utf8").trim(),
    "таблица значений дошла не теми байтами")
})
