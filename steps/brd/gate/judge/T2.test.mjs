// T2 — R-строка это следствие, а не пересказ. Юниты: штатное, ветвь, граница меры, МОЛЧАНИЕ.
import test from "node:test"
import assert from "node:assert/strict"
import { T2, SAME_WORDS } from "./T2.mjs"

const REQUEST = "A new endpoint is needed that returns ONE fruit by its name instead of the whole list. "
  + "The page with the list of fruits must be able to show the card of the selected fruit. "
  + "Existing calls must not be broken."

// Записанный ответ живой модели (quarkus-t2, `component/answer-gate.txt`): почти те же слова, что в
// заказе, но это уже утверждение о репозитории. Мера — ДОСЛОВНОСТЬ, а не похожесть, и этот случай
// её и стережёт: пересечением словаря он был бы отбит.
test("T2 happy: следствие с почти теми же словами — не пересказ", () => {
  const requirements = [
    { id: "R1", statement: "A new endpoint returns one fruit by its name" },
    { id: "R2", statement: "The page with the list of fruits can show the card of the selected fruit by requesting it from the new endpoint" },
    { id: "R3", statement: "Existing calls remain unchanged" },
  ]
  assert.deepEqual(T2({ requirements, request: REQUEST }), [])
})

test("T2: предложение заказа, переписанное слово в слово — блокер с адресом и выходом", () => {
  const requirements = [{ id: "R4", statement: "Existing calls must not be broken, and the page must show the card" }]
  const b = T2({ requirements, request: "Existing calls must not be broken, and the page must show the card." })
  assert.equal(b.length, 1)
  assert.match(b[0], /^T2 R4:/, "блокер без адреса — роль пойдёт искать место по всему документу")
  assert.match(b[0], /ЧТО ИЗМЕНИТСЯ/, "блокер без выхода — роль не знает, что писать вместо")
})

// Общая формулировка предметной области — не пересказ: заказ уже назвал вещь своим словом, и
// требовать синоним значило бы убивать якорь (роль gate, LAW 3).
test(`T2: короче ${SAME_WORDS} слов подряд — это имя вещи, а не пересказ`, () => {
  assert.deepEqual(T2({ requirements: [{ id: "R1", statement: "Glossary is exported" }], request: "Glossary is exported." }), [])
})

test("T2 МОЛЧАНИЕ: заказа нет — сверять пересказ не с чем", () => {
  const requirements = [{ id: "R1", statement: "Existing calls must not be broken at all" }]
  assert.deepEqual(T2({ requirements, request: "" }), [])
  assert.deepEqual(T2({ requirements }), [])
  assert.deepEqual(T2(), [])
})
