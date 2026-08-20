// Срез `ask`: разговор с оператором как артефакт. Формула — 1 счастливый путь + по случаю на каждую
// ветку антецедента с РАЗЛИЧИМЫМ следствием.
import test from "node:test"
import assert from "node:assert/strict"
import { askEntry } from "./ask.mjs"

test("happy: обмен становится записью — шаг, проход, размер черновика, пары вопрос-ответ", () => {
  const x = askEntry({
    step: "intake", pass: "A", draftBytes: 5217,
    said: [{ n: 1, question: "нужен GET по id?", text: "да, нужен GET /parcels/{id}" },
           { n: 2, question: "код отказа?", text: "422" }],
  })
  assert.match(x, /^<ask step="intake" pass="A" draft="5217">/)
  assert.match(x, /<q n="1">нужен GET по id\?<\/q>/)
  assert.match(x, /<a n="1">да, нужен GET \/parcels\/\{id\}<\/a>/)
  assert.match(x, /<a n="2">422<\/a>/)
  assert.match(x, /<\/ask>\n$/)
})

// НОЛЬ ПРОТИВ ПЯТИ ТЫСЯЧ — разные факты о работе: спросила до того, как написала, или после.
test("размер черновика записан, даже когда он ноль", () => {
  const x = askEntry({ step: "intake", pass: "A", said: [{ n: 1, question: "q", text: "a" }] })
  assert.match(x, /draft="0"/)
})

// Ответ живого прогона нёс `{{glossary.<term>}}`: сырой знак сделал бы ask.xml нечитаемым — ровно та
// беда, от которой в steps/intake/frd.mjs стоит F0.
test("текст вопроса и ответа экранируется — артефакт остаётся читаемым", () => {
  const x = askEntry({ step: "intake", said: [{ n: 1, question: "синтаксис <term>?", text: "{{glossary.<term>}} & точка" }] })
  assert.equal(x.includes("<term>?"), false, "сырой < доехал до артефакта")
  assert.match(x, /&lt;term&gt;/)
  assert.match(x, /&amp; точка/)
})

test("шаг без проходов не пишет пустой атрибут pass", () => {
  const x = askEntry({ step: "brd", said: [{ n: 1, question: "q", text: "a" }] })
  assert.match(x, /^<ask step="brd" draft="0">/)
  assert.equal(x.includes('pass=""'), false)
})

test("тотальна: без обмена записывать нечего", () => {
  assert.equal(askEntry(), "")
  assert.equal(askEntry({ step: "intake", said: [] }), "")
  assert.equal(askEntry({ said: [{ n: 1, text: "ответ без вопроса" }] }), "", "пара без вопроса — не обмен")
})
