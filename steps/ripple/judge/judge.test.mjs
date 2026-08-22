// ЮНИТЫ ГАРДРЕЙЛА ШАГА 8. Правило одно — каждый задетый путь есть в карте, — и у него четыре ветви.
// Тикет T17.
import test from "node:test"
import assert from "node:assert/strict"
import { judgeRipple } from "../judge.mjs"

const xml = (paths) => `<ripple>\n${paths.map((p) => `  <node path="${p}"/>`).join("\n")}\n</ripple>`
const MAP = ["src/A.java", "src/B.java"]

test("happy: все задетые узлы карта знает", () => {
  assert.deepEqual(judgeRipple({ text: xml(["src/A.java"]), known: MAP }), [])
})

test("узел, которого в карте нет, — отказ с ИМЕНЕМ пути", () => {
  const b = judgeRipple({ text: xml(["src/A.java", "src/Чужой.java"]), known: MAP })
  assert.equal(b.length, 1)
  assert.match(b[0], /Чужой\.java/)
  assert.ok(!b[0].includes("src/A.java"), "блокер приплёл законный узел — роль пойдёт чинить не то")
})

test("рябь не похожа на артефакт шага — вердикт invalid, а не молчание", () => {
  const b = judgeRipple({ text: "Извините, не смог посчитать", known: MAP })
  assert.equal(b.length, 1)
  assert.match(b[0], /^invalid/)
})

test("МОЛЧАНИЕ: карты нет — сверять не с чем, и правило не отбивает всё подряд", () => {
  assert.deepEqual(judgeRipple({ text: xml(["src/что/угодно.java"]), known: [] }), [])
})
