// T3 — созданная сущность обязана стоять в якорях. Юниты: штатное, ветвь, «ноль — норма», МОЛЧАНИЕ.
import test from "node:test"
import assert from "node:assert/strict"
import { T3 } from "./T3.mjs"

const R = [{ id: "R1", statement: "A new Glossary configuration type is added" },
           { id: "R2", statement: "Glossary terms are substituted into prompts alongside snippets" }]
const HITS = { glossary: 0, snippet: 214, prompt: 96 }

test("T3 happy: создаваемая сущность стоит в якорях — счёт ноль дефектом не является", () => {
  assert.deepEqual(T3({ requirements: R, subjects: ["glossary", "prompt"], hits: HITS }), [])
})

test("T3: созданная сущность выпала из якорей — блокер с ОБРАЗЦОМ строки целиком", () => {
  const b = T3({ requirements: R, subjects: ["prompt", "snippet"], hits: HITS })
  assert.equal(b.length, 1)
  assert.match(b[0], /«glossary»/)
  assert.match(b[0], /R1/, "блокер не назвал требование, где вещь создаётся")
  assert.match(b[0], /subjects\[\]: prompt · snippet · glossary/, "блокер не показал строку, которую надо написать")
})

// Обратного правила здесь НЕТ: существующее слово якорем быть не обязано, иначе два правила
// требовали бы несовместимого (standards/guardrail.md).
test("T3: существующее слово вне якорей — не забота этого правила", () => {
  assert.deepEqual(T3({ requirements: R, subjects: ["glossary"], hits: { snippet: 214 } }), [])
})

test("T3: нулевое слово, которого нет ни в одном требовании, якорем быть не обязано", () => {
  assert.deepEqual(T3({ requirements: R, subjects: ["glossary"], hits: { tenant: 0 } }), [])
})

test("T3 МОЛЧАНИЕ: таблицы попаданий нет — созданное от существующего не отличить", () => {
  assert.deepEqual(T3({ requirements: R, subjects: [], hits: null }), [])
  assert.deepEqual(T3({ requirements: R, subjects: [], hits: {} }), [])
  assert.deepEqual(T3(), [])
})
