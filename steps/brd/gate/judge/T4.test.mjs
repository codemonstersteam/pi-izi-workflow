// T4 — образец существует в этом репозитории. Юниты: штатное, объявленное отсутствие, две ветви
// отказа, МОЛЧАНИЕ.
import test from "node:test"
import assert from "node:assert/strict"
import { T4 } from "./T4.mjs"

const HITS = { PromptSnippet: 29, agent: 890, glossary: 0 }

test("T4 happy: аналог со счётом принят вместе с объяснением после тире", () => {
  assert.deepEqual(T4({ analogue: "PromptSnippet — the existing configuration type it is modelled after", hits: HITS }), [])
})

test("T4: `none` — законный вход, а не пропуск", () => {
  assert.deepEqual(T4({ analogue: "none — ничего похожего в репозитории нет", hits: HITS }), [])
  assert.deepEqual(T4({ analogue: "none", hits: HITS }), [])
})

test("T4: аналог с нулевым счётом — назвали то, чего в репозитории нет", () => {
  const b = T4({ analogue: "glossary — по образцу него", hits: HITS })
  assert.equal(b.length, 1)
  assert.match(b[0], /0 файлов/)
  assert.match(b[0], /PromptSnippet|agent/, "блокер не предложил ни одного слова со счётом")
  assert.match(b[0], /analogue: none/, "блокер не назвал второй законный выход")
})

test("T4: слова нет в таблице попаданий — счёт никто не считал", () => {
  assert.match(T4({ analogue: "Frobnicator", hits: HITS })[0], /в таблице попаданий нет/)
})

test("T4: строки analogue нет вовсе — блокер называет оба выхода", () => {
  const b = T4({ analogue: null, hits: HITS })
  assert.equal(b.length, 1)
  assert.match(b[0], /строки нет/)
  assert.match(b[0], /analogue: none/)
})

test("T4 МОЛЧАНИЕ: таблицы попаданий нет — счёт брать неоткуда", () => {
  assert.deepEqual(T4({ analogue: null, hits: null }), [])
  assert.deepEqual(T4({ analogue: "glossary", hits: {} }), [])
  assert.deepEqual(T4(), [])
})
