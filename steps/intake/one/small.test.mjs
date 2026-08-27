// Units of the small-task threshold. By the formula of standards/code.md:
//     N = 1 happy path + Σ antecedent branches with a DISTINGUISHABLE consequent + 1 silence
//
// Both SIDES of each threshold, plus the no-data case (backlog-small-task.md, ticket 01).
// Fixtures are strings here: a minimal mapxml and a brd. Калибровка — ЖИВЫЕ КАРТЫ прогонов:
// quarkus FRUIT-1 = 24 узла (12 файлов в двух префиксных вариантах) / 3 R → маленькая;
// eddi DOS-535 = 71 узел обследованного фокуса / 16 R → полный путь. Перекалибровано 27.08:
// первый порог 12 был посчитан по java-файлам, а читаются УЗЛЫ КАРТЫ — живой прогон ушёл
// в полный путь и поймал это.
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { isSmall } from "./small.mjs"

const BRD3 = "R1 сущности хранятся\nR2 сущность читается по URI\nR3 сущность удаляется\n"

const stand = (modules, brd) => {
  const cwd = mkdtempSync(join(tmpdir(), "izi-small-"))
  mkdirSync(join(cwd, ".agent"), { recursive: true })
  writeFileSync(join(cwd, ".agent/appgraph.xml"),
    `<appgraph grammar="4">\n${modules.map((p) => `  <module path="${p}" pkg="p"/>`).join("\n")}\n</appgraph>`)
  writeFileSync(join(cwd, ".agent/brd.md"), brd)
  return cwd
}
const quarkusNodes = Array.from({ length: 24 }, (_, i) => `src/pkg/Mod${i}.java`)

test("калибровка quarkus: 24 узла карты (живой замер) и 3 R-строки → маленькая, один вызов", () => {
  const cwd = stand(quarkusNodes, BRD3)
  try {
    assert.equal(isSmall({ cwd }), true, "24/3 — внутри обоих порогов, а трек выбран полный")
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test("33 узла карты → полный путь (порог узлов)", () => {
  const cwd = stand(Array.from({ length: 33 }, (_, i) => `src/pkg/Mod${i}.java`), BRD3)
  try {
    assert.equal(isSmall({ cwd }), false, "33 > 32 узлов — карта уже не помещается в один наряд")
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test("калибровка eddi: 71 узел карты (живой замер) → полный путь, с запасом к порогу", () => {
  const cwd = stand(Array.from({ length: 71 }, (_, i) => `src/pkg/Mod${i}.java`), BRD3)
  try {
    assert.equal(isSmall({ cwd }), false, "71 узел — это обследованный фокус большой задачи")
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test("6 R-строк → полный путь (порог требований)", () => {
  const brd6 = "R1 один\nR2 два\nR3 три\nR4 четыре\nR5 пять\nR6 шесть\n"
  const cwd = stand(quarkusNodes, brd6)
  try {
    assert.equal(isSmall({ cwd }), false, "6 > 5 требований — решений больше, чем один вызов несёт")
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test("пустая карта или пустой brd → полный путь: нет данных решать", () => {
  const noMap = stand([], BRD3)
  const noBrd = stand(quarkusNodes, "")
  try {
    assert.equal(isSmall({ cwd: noMap }), false, "пустая карта прочитана как «маленькая»")
    assert.equal(isSmall({ cwd: noBrd }), false, "пустой brd прочитан как «маленькая»")
  } finally {
    rmSync(noMap, { recursive: true, force: true })
    rmSync(noBrd, { recursive: true, force: true })
  }
})
