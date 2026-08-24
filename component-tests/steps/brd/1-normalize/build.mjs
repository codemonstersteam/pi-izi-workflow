#!/usr/bin/env node
// MODULE_CONTRACT: build — СБОРЩИК КАТАЛОГА РУЧНОЙ ПРИЁМКИ подшага 2A на настоящем заказе eddi
// Purpose:    каталог приёмки обязан быть СОБРАН кодом подшага, а не скопирован руками. Иначе
//             оператор смотрит глазами на файл, которого конвейер никогда не писал, и приёмка
//             проверяет нашу аккуратность вместо конвейера. Тот же довод, что у 4-anchors/build.mjs.
// io:         fs (читает in/, пишет наряд во вход и артефакт в out/; гоняет подшаг во временном cwd)
// EXTERNAL_DEPENDENCY: steps/brd/normalize/order.mjs::orderText — наряд;
//             steps/brd/normalize/normalize.step.mjs::next, fold — ТОТ ЖЕ ПРИВОД, что у полосы;
//             ext/state.mjs::start, sha1of — состояние прогона и отпечаток задачи.
// Invariants: ВХОД НЕ ТРОГАЕТСЯ: `in/TASK.md` — заказ байт в байт, скрипт его только читает.
//             `answer.normalize.txt` — ответ живой модели, его пишет `bin/ask.mjs`; артефакт роли
//             руками не правится никогда. Нет ответа — собирается ТОЛЬКО наряд, и это норма:
//             наряд нужен ДО вызова модели, артефакт — после.
// Interface:  CLI: node component-tests/steps/brd/1-normalize/build.mjs
//
// ПОЧЕМУ ПОДШАГ ГОНЯЕТСЯ ВО ВРЕМЕННОМ КАТАЛОГЕ, а не пишет прямо в out/: подшаг кладёт артефакт по
// СВОЕМУ пути (`.agent/normalized.md`) через staging и promote. Дай ему писать в каталог приёмки —
// и приёмка увидит копию, сделанную нами, вместо файла, продвинутого гардрейлом.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import * as step from "../../../../steps/brd/normalize/normalize.step.mjs"
import { orderText } from "../../../../steps/brd/normalize/order.mjs"
import { parseRows } from "../../../../steps/brd/normalize/normalize.mjs"
import { start, sha1of } from "../../../../ext/state.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const HITS = join(HERE, "../3-hits")
const ANCHORS = join(HERE, "../4-anchors")

const read = (p) => readFileSync(join(HERE, p), "utf8")
const put = (p, text) => { const abs = join(HERE, p); mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, text) }
const die = (why) => { console.error(`build: ${why}`); process.exit(1) }

const TASK = read("in/TASK.md")
if (!TASK.trim()) die("in/TASK.md пуст — нормализовать нечего")

// --- временный прогон подшага: cwd, в котором TASK.md лежит там, где его ждёт steps/brd/paths.mjs -
const cwd = mkdtempSync(join(tmpdir(), "izi-2a-accept-"))
mkdirSync(join(cwd, ".agent", "staging"), { recursive: true })
writeFileSync(join(cwd, "TASK.md"), TASK)
const s0 = { ...start({ cwd, run: "accept-2a", key: "DOS-535" }).value,
             at: { task: { path: "TASK.md", sha1: sha1of(TASK) } } }

// --- наряд: настоящий order.mjs, и он ложится ВО ВХОД -------------------------------------------
// Наряд — это `user`-сообщение запроса к модели, то есть вход подшага, а не его результат.
const order = orderText(s0, {})
if (order.why) die(`in/order.normalize.md: ${order.why}`)
put("in/order.normalize.md", order.text)

if (!existsSync(join(HERE, "answer.normalize.txt"))) {
  console.log(`наряд ${order.text.split("\n").length} строк → in/order.normalize.md`)
  console.log("ответа модели нет — зови bin/ask.mjs с --case, потом собери каталог ещё раз")
  process.exit(0)
}
const ANSWER = read("answer.normalize.txt")

// --- артефакт: подшаг ведётся ТЕМ ЖЕ приводом next/fold, что и полоса ----------------------------
let s = s0
const trace = []
for (let it = step.next(s); it.do !== "done"; it = step.next(s)) {
  trace.push(it)
  if (it.do === "err") die(`подшаг отказал: ${it.cls || it.code} — ${it.subject}`)
  let result = null
  if (it.do === "role") { writeFileSync(join(cwd, it.staging), ANSWER); result = { track: "ok", artifact: it.staging } }
  const r = step.fold(s, { do: it.do, instruction: it, result })
  if (!r.ok) die(`fold отказал: ${r.error.detail || JSON.stringify(r.error)}`)
  s = r.value
  if (trace.length > 8) die("подшаг не сошёлся за 8 ходов")
}
if (!s.at.normalized) {
  const v = s.verdicts.filter((x) => !x.ok).slice(-1)[0]
  die(`ГАРДРЕЙЛ ОТБИЛ ОТВЕТ МОДЕЛИ — таблица не продвинута:\n${v ? v.blockers : "вердиктов нет"}`)
}
const laid = readFileSync(join(cwd, s.at.normalized.path), "utf8")
put("out/normalized.md", laid)

// --- цепочка: выход 2A становится входом 2B и 2C ------------------------------------------------
mkdirSync(join(HITS, "in"), { recursive: true })
mkdirSync(join(ANCHORS, "in"), { recursive: true })
writeFileSync(join(HITS, "in/normalized.md"), laid)
writeFileSync(join(ANCHORS, "in/normalized.md"), laid)

const rows = parseRows(laid)
const bad = rows.filter((r) => ![r.verb, r.object, r.instrument, r.values].every((c) => String(c || "").trim()))
console.log(`наряд ${order.text.split("\n").length} строк → in/order.normalize.md`)
console.log(`ходов ${trace.length} · вердиктов ${s.verdicts.length} · гардрейл ${s.verdicts.every((v) => v.ok) ? "ПРИНЯЛ" : "ОТБИЛ"}`)
console.log(`артефакт: ${rows.length} строк требований, пустых колонок ${bad.length} · побайтово равен ответу: ${laid === ANSWER}`)
console.log(`выход 2A → out/normalized.md · 3-hits/in/normalized.md · 4-anchors/in/normalized.md`)
