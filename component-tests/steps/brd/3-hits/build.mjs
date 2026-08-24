#!/usr/bin/env node
// MODULE_CONTRACT: build — СБОРЩИК КАТАЛОГА РУЧНОЙ ПРИЁМКИ подшага 2B на настоящем дереве eddi
// Purpose:    каталог приёмки обязан быть СОБРАН кодом подшага, а не скопирован руками (тот же
//             довод, что у 1-normalize/build.mjs и 4-anchors/build.mjs).
// io:         fs (читает in/normalized.md и дерево прогона, пишет out/hits.txt и вход подшага 2C)
// EXTERNAL_DEPENDENCY: steps/brd/hits/hits.mjs::tableAt — ТА ЖЕ ступень, что зовёт наряд подшага 2C
//             (`anchors/order.mjs`, `recount: !fix`); paths.mjs::HITS — путь артефакта прохода.
// Invariants: ВХОД НЕ ТРОГАЕТСЯ: `in/normalized.md` — выход подшага 2A байт в байт.
//             РОЛИ НЕТ: 0 токенов, весь предмет проверки — числа грепа по НАСТОЯЩЕМУ дереву.
// Interface:  CLI: node component-tests/steps/brd/3-hits/build.mjs [дерево-прогона]
//
// ПОЧЕМУ СЧЁТ ИДЁТ ВО ВРЕМЕННОМ cwd, А ДЕРЕВО БЕРЁТСЯ ЖИВОЕ: `tableAt` пишет таблицу по СВОЕМУ пути
// (`.agent/hits.txt`) в корень прогона. Дай ему писать в eddi — и мы насорим в дереве, по которому
// сами же и считаем. Поэтому дерево копируется не байтами, а ссылкой: считаем ПО eddi, кладём В
// временный каталог, оттуда файл переезжает в приёмку.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, cpSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { tableAt, parseTable } from "../../../../steps/brd/hits/hits.mjs"
import { HITS } from "../../../../steps/brd/paths.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const ANCHORS = join(HERE, "../4-anchors")
const TREE = process.argv[2] || "/Users/mac/IdeaProjects/codemonstersdev/sandbox/runbox/eddi"

const die = (why) => { console.error(`build: ${why}`); process.exit(1) }
if (!existsSync(TREE)) die(`дерева прогона нет: ${TREE}`)

const ROWS = readFileSync(join(HERE, "in/normalized.md"), "utf8")
if (!ROWS.trim()) die("in/normalized.md пуст — это выход подшага 2A, собери его 1-normalize/build.mjs")

// Дерево живое, а `.agent/` — свой: считаем ПО eddi, но артефакт прохода кладём не в него.
const cwd = mkdtempSync(join(tmpdir(), "izi-2b-accept-"))
cpSync(TREE, cwd, { recursive: true, dereference: false })

const t0 = Date.now()
const r = tableAt(cwd, { rows: ROWS, recount: true })
const sec = ((Date.now() - t0) / 1000).toFixed(2)
if (!r.at) die("таблица не легла на диск — `tableAt` вернул at: null")
if (!r.hits) die("таблицы действий нет — считать нечего")

const text = readFileSync(join(cwd, HITS), "utf8")
mkdirSync(join(HERE, "out"), { recursive: true })
writeFileSync(join(HERE, "out/hits.txt"), text)
mkdirSync(join(ANCHORS, "in"), { recursive: true })
writeFileSync(join(ANCHORS, "in/hits.txt"), text)

const back = parseTable(text)
const words = Object.keys(back.hits)
const zero = words.filter((w) => back.hits[w] === 0)
console.log(`дерево ${TREE.split("/").slice(-1)[0]} · ${sec} с · 0 токенов`)
console.log(`кандидатов ${words.length} · с нулём файлов ${zero.length}${zero.length ? `: ${zero.join(" · ")}` : ""}`)
console.log(`таблица → out/hits.txt (${text.trim().split("\n").length} строк) · 4-anchors/in/hits.txt`)
