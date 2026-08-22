// ЮНИТЫ ГАРДРЕЙЛА ШАГА 5. Правила G1..G3 плюс тотальность. Тикет T14.
import test from "node:test"
import assert from "node:assert/strict"
import { judgeGraph } from "../judge.mjs"

const graph = (over = {}) => ({ suites: [{ id: "mvn" }], duplicates: [], subjects: [{ name: "Loan" }], ...over })

test("happy: карта со сьютом, без дублей, с уцелевшими якорями", () => {
  assert.deepEqual(judgeGraph({ graph: graph(), plan: { subjects: ["Loan"] }, text: "<appgraph/>" }), [])
})

test("G3: ни одного тест-сьюта — репозиторий не готов, и это отдельная задача", () => {
  const b = judgeGraph({ graph: graph({ suites: [] }), plan: {}, text: "<appgraph/>" })
  assert.equal(b.length, 1)
  assert.match(b[0], /тест-сьюта/)
})

test("G1: один путь объявлен двумя частями — сломан инвариант шагов 3-4", () => {
  const b = judgeGraph({ graph: graph({ duplicates: ["src/A.java"] }), plan: {}, text: "<appgraph/>" })
  assert.ok(b.some((x) => /src\/A\.java/.test(x)))
})

test("G2: якорь плана потерян при слиянии — его больше нет НИГДЕ", () => {
  const b = judgeGraph({ graph: graph(), plan: { subjects: ["Loan", "Glossary"] }, text: "<appgraph/>" })
  assert.ok(b.some((x) => /Glossary/.test(x)))
})

test("тотальность: карты нет вовсе — вердикт invalid, а не молчание", () => {
  const b = judgeGraph({ graph: null, plan: {}, text: "" })
  assert.equal(b.length, 1)
  assert.match(b[0], /^invalid/)
})

test("тотальность: собрано что-то, что не карта — вердикт invalid", () => {
  const b = judgeGraph({ graph: graph(), plan: {}, text: "Извините, не смог склеить" })
  assert.equal(b.length, 1)
  assert.match(b[0], /^invalid/)
})
