// Units of the coverage order slice. By the formula of standards/code.md:
//     N = 1 happy path + Σ antecedent branches with a DISTINGUISHABLE consequent + 1 silence
//
// The happy path is measured on the etalon package's own brd.md — the R-ids the slice owes
// are the ones a live run really carried. The named-emptiness branch (no R-lines) is the
// second distinguishable consequent: an empty {OWED} once cost a whole D round (T50).
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { orderSlice } from "./order.mjs"

const ETALON = fileURLToPath(new URL("../../../component-tests/etalon-eddi", import.meta.url))

test("слайс coverage несёт {OWED} — КАЖДЫЙ R-id из brd.md эталона, машиной", () => {
  const brd = readFileSync(`${ETALON}/.agent/brd.md`, "utf8")
  const owed = orderSlice({ cwd: ETALON })["{OWED}"]
  for (const id of [...new Set([...brd.matchAll(/^R\d+ /gm)].map((m) => m[0].trim()))]) {
    assert.ok(owed.split("\n").includes(id),
      `требование ${id} выпало из {OWED} — F11 сочтёт его непокрытым на ровном месте`)
  }
})

test("слайс coverage без R-строк в brd.md называет пустоту, а не молчит", () => {
  const owed = orderSlice({ cwd: "/nonexistent-run-cwd" })["{OWED}"]
  assert.equal(owed, "(нет требований в brd.md — проверь формат)",
    "пустой {OWED} без имени — модель не отличит «пусто» от «сломано»")
})
