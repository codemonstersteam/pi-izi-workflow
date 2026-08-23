// T1 — вердикт ворот. Юниты по формуле standards/code.md: 1 штатный + по различимой ветви +
// МОЛЧАНИЕ на отсутствующем операнде.
import test from "node:test"
import assert from "node:assert/strict"
import { T1, VERDICTS } from "./T1.mjs"

test("T1 happy: вердикт из словаря принят", () => {
  for (const v of VERDICTS) assert.deepEqual(T1({ verdict: v }), [])
})

test("T1: четвёртого значения нет — блокер перечисляет все три", () => {
  const b = T1({ verdict: "maybe" })
  assert.equal(b.length, 1)
  for (const v of VERDICTS) assert.ok(b[0].includes(v), `в блокере нет значения «${v}» — роли не из чего выбрать`)
})

test("T1: строки вердикта нет — блокер несёт ОБРАЗЕЦ строки", () => {
  const b = T1({ verdict: null })
  assert.equal(b.length, 1)
  assert.match(b[0], /verdict: solvable/, "блокер не показал, что именно написать")
})

// «Не смог» — это `unclear`, а не пустая строка: иначе полоса поедет на молчании.
test("T1: пустая строка вердикта судится как вердикт, а не как его отсутствие операнда", () => {
  assert.equal(T1({ verdict: "   " }).length, 1)
})

test("T1 МОЛЧАНИЕ: артефакта нет вовсе — судить нечего", () => {
  assert.deepEqual(T1({ verdict: null, said: false }), [])
})
