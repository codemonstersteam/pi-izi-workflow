// Units of the critic order slice. By the formula of standards/code.md:
//     N = 1 happy path + Σ antecedent branches with a DISTINGUISHABLE consequent + 1 silence
//
// The layer has exactly one distinguishable consequent: its {BRD} is EMPTY — the critic reads
// the whole artifact in {PREVIOUS} (a head slot), and a non-empty {BRD} would duplicate what
// the artifact already embodies.
import test from "node:test"
import assert from "node:assert/strict"
import { orderSlice } from "./order.mjs"

test("слайс critic возвращает ПУСТОЙ {BRD} — данные критика это весь артефакт в {PREVIOUS}", () => {
  assert.deepEqual(orderSlice({}, "<frd>…</frd>"), { "{BRD}": "" },
    "критик получил BRD слайсом — наряд дублирует то, что несёт {PREVIOUS}")
})
