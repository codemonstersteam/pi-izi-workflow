#!/usr/bin/env node
// MODULE_CONTRACT: check — СВЕРКА ПРОГОНА КОНВЕЙЕРА С ЭТАЛОНОМ DOS-535
// Purpose:    одно решение спрятано здесь: что значит «план совпал с эталоном». Матрица модулей
//             живёт в expected.md РЯДОМ (таблица «Матрица модулей») — этот скрипт её читает и
//             ничего про eddi не знает сам: смена эталона меняет вердикт без правки кода.
// io:         fs (чтение)
// EXTERNAL_DEPENDENCY: steps/plan/tree/tree.mjs::parseTree — разбор дерева тем же парсером, что
//             судит полоса; expected.md — данные эталона.
// Invariants: НИЧЕГО НЕ ВЫДУМЫВАЕТ. Отсутствующий артефакт — строка «нет», а не тишина; touch-строки
//             матрицы судятся мягче дельт (законны и как touched); сверка печатает факты, решение
//             остаётся за оператором.
// Interface:  CLI: node check.mjs <каталог прогона> [<второй каталог — например, брак>]
//
// ЭТО ТЕСТОВЫЙ МАТЕРИАЛ, НЕ КОНВЕЙЕР: имена eddi законны здесь и в expected.md — и нигде больше.
import { readFileSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { parseTree } from "../../steps/plan/tree/tree.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const EXPECTED = join(HERE, "expected.md")

// --- эталон: таблица «Матрица модулей» из expected.md -------------------------------------------
// Строка: | имя | путь | дельта | уровень(дельта|touch) | что делает | источник |
export function matrixOf(text = "") {
  const rows = []
  let inTable = false
  for (const line of String(text).split("\n")) {
    if (/^## Матрица модулей/.test(line)) { inTable = true; continue }
    if (inTable && /^## /.test(line)) break
    if (!inTable || !line.startsWith("|")) continue
    const cols = line.split("|").map((c) => c.trim())
    if (cols.length < 7 || cols[2] === "путь" || /^[-: ]+$/.test(cols[2])) continue
    rows.push({ name: cols[1], path: cols[2], delta: cols[3], tier: cols[4], what: cols[5], src: cols[6] })
  }
  return rows
}

// --- один прогон против матрицы -------------------------------------------------------------------
// Возвращает строки-факты; ✅/⚠/❌ — сигналы оператору, не вердикт полосы.
export function factsOf(runDir, matrix) {
  const at = (p) => join(runDir, p)
  const read = (p) => (existsSync(at(p)) ? readFileSync(at(p), "utf8") : "")
  const out = []

  const treeText = read(".agent/tree.xml")
  const tree = treeText ? parseTree(treeText).modules : null
  const frdText = read(".agent/frd.xml")
  const rippleText = read(".agent/ripple.xml")
  const mapText = read(".agent/appgraph.xml")
  const focusText = read(".agent/focus.json")

  if (!tree) out.push("❌ .agent/tree.xml отсутствует — матрицу судить нечем")
  if (tree) {
    const byPath = new Map(tree.map((m) => [m.path, m]))
    for (const row of matrix) {
      const m = byPath.get(row.path)
      if (!m) {
        out.push(row.tier === "touch"
          ? `⚠ ${row.name}: нет в дереве ни дельтой, ни touched (touch-строка, мягкая)`
          : `❌ ${row.name} (${row.delta}) отсутствует в tree.xml — ${row.what} [${row.src}]`)
        continue
      }
      const want = row.delta === "Added" ? "Added" : "Changed"
      if ((m.delta || "Changed") !== want) {
        out.push(`❌ ${row.name}: дельта ${m.delta || "(нет)"}, эталон ${want} — ${row.what} [${row.src}]`)
        continue
      }
      if (row.tier === "touch" && !m.delta) out.push(`✅ ${row.name}: touched (без дельты — законно для touch-строки)`)
      else out.push(`✅ ${row.name}: ${m.delta || "Changed"} = эталон`)
    }
    const extra = tree.filter((m) => !matrix.some((r) => r.path === m.path))
    for (const m of extra) out.push(`⚠ ${m.path.split("/").pop()}: в дереве есть, в эталоне НЕТ — ${m.path}`)
  }

  // T6 наизнанку: seed в ripple с Added в tree — красный; seed с Changed — зелёный
  if (rippleText && treeText) {
    const seeds = [...rippleText.matchAll(/<module\b([^>]*)>/g)]
      .filter((m) => /\bseed="yes"/.test(m[1]))
      .map((m) => (m[1].match(/\bpath="([^"]+)"/) || [])[1]).filter(Boolean)
    for (const m of tree) {
      if (seeds.includes(m.path) && (m.delta || "") === "Added")
        out.push(`❌ T6: seed ${m.path.split("/").pop()} объявлен Added — существующий файл обязан быть Changed`)
    }
  }

  if (frdText) {
    const stubs = [...frdText.matchAll(/<failure\b[^>]*\bstatus="0"[^>]*>/g)]
    for (const s of stubs) out.push(`❌ F15: отказ со status="0" — ${(s[0].match(/code="([^"]*)"/) || [])[1] || "?"}`)
  }

  if (mapText) {
    const has = (p) => mapText.includes(p)
    for (const p of [
      "configs/agents/model/AgentConfiguration.java",   // T51: клетка из требования доехала до карты
      "modules/llm/impl/PromptSnippetService.java",     // T55: аналог в карте
      "configs/snippets/rest/RestPromptSnippetStore.java",
    ]) out.push(has(p) ? `✅ карта несёт ${p.split("/").pop()}` : `⚠ карте не хватает ${p} — точка подстановки/аналог вне фокуса`)
  }

  if (rippleText) {
    for (const name of ["PromptSnippetService", "RestPromptSnippetStore"]) {
      out.push(rippleText.includes(name) ? `✅ ripple несёт аналог ${name} (T55)` : `⚠ ripple без ${name} — близнецы новых модулей без контрактов`)
    }
  }

  if (focusText) {
    try {
      const f = JSON.parse(focusText)
      const cells = f.cells || []
      out.push(cells.includes("src~main~java~ai~labs~eddi~configs~agents")
        ? "✅ фокус содержит configs~agents (T51)"
        : "❌ фокус без configs~agents — AgentConfiguration выпадет из карты (корень T51)")
      const docs = cells.filter((c) => /^(docs|planning)~/.test(c))
      if (docs.length) out.push(`⚠ фокус купил ${docs.length} доковых/плановых клеток: ${docs.slice(0, 4).join(", ")}${docs.length > 4 ? " …" : ""}`)
    } catch { out.push("⚠ focus.json не разбирается как JSON") }
  }

  for (const p of [".agent/frd.xml", ".agent/ripple.xml", ".agent/tree.xml", ".agent/flows.xml"]) {
    if (!existsSync(at(p))) out.push(`— ${p} ещё не написан`)
  }
  return out
}

// --- CLI: одна колонка или две -------------------------------------------------------------------
const dirs = process.argv.slice(2).filter((a) => !a.startsWith("-"))
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!dirs.length) {
    console.error("usage: node check.mjs <каталог прогона> [<второй каталог — например, брак>]")
    process.exit(1)
  }
  const matrix = matrixOf(readFileSync(EXPECTED, "utf8"))
  if (!matrix.length) {
    console.error(`expected.md не дал ни одной строки матрицы — таблица «Матрица модулей» сломана`)
    process.exit(1)
  }
  console.log(`эталон v2: ${matrix.filter((r) => r.tier === "дельта").length} дельт + ${matrix.filter((r) => r.tier === "touch").length} touch`)
  const reports = dirs.map((d) => ({ dir: d, facts: factsOf(d, matrix) }))
  for (const r of reports) {
    console.log(`\n=== ${r.dir} ===`)
    for (const f of r.facts) console.log(f)
  }
  if (reports.length === 2) {
    const red = (n) => reports[n].facts.filter((f) => f.startsWith("❌")).length
    console.log(`\nкрасные строки: ${reports[0].dir} — ${red(0)} · ${reports[1].dir} — ${red(1)}`)
  }
}
