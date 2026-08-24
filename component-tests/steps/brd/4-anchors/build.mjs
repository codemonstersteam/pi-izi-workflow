#!/usr/bin/env node
// MODULE_CONTRACT: build — СБОРЩИК КАТАЛОГА РУЧНОЙ ПРИЁМКИ подшагов 2C и 2D на настоящем eddi
// Purpose:    каталог приёмки обязан быть СОБРАН кодом подшага, а не скопирован руками. Иначе
//             оператор смотрит глазами на файл, которого конвейер никогда не писал, и приёмка
//             проверяет нашу аккуратность вместо конвейера.
// io:         fs (читает дерево прогона и каталог приёмки, пишет производные файлы каталога)
// EXTERNAL_DEPENDENCY: steps/brd/anchors/order.mjs::orderText — наряд; assemble.mjs::numbered,
//             subjectsOf, brdText — артефакт; steps/brd/spread/spread.mjs::spreadOf — карта обхода;
//             steps/brd/brd.mjs::parseBrd, analogueTerm — как читается артефакт (та же пара, что
//             зовёт steps/brd/anchors/route.mjs::spread).
// Invariants: ВХОД НЕ ТРОГАЕТСЯ. `in/normalized.md` и `in/hits.txt` — выходы подшагов 1 и 2, байт в
//             байт; скрипт их только читает. `answer.analogue.txt` — ответ живой модели, его пишет
//             `bin/ask.mjs`, а не этот скрипт: артефакт роли руками не правится никогда.
// Interface:  CLI: node component-tests/steps/brd/4-anchors/build.mjs [дерево-прогона]
//
// ПОЧЕМУ НАРЯД СОБИРАЕТСЯ НА НАСТОЯЩЕМ ДЕРЕВЕ, а не на записанной таблице попаданий: `orderText`
// первого захода СЧИТАЕТ таблицу сам (`recount: !fix`) — так же, как на живом прогоне. Подложив ему
// готовый файл, мы проверили бы копипасту, а не счёт.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { orderText } from "../../../../steps/brd/anchors/order.mjs"
import { numbered, subjectsOf, brdText } from "../../../../steps/brd/anchors/assemble.mjs"
import { parseTable } from "../../../../steps/brd/hits/hits.mjs"
import { parseBrd, analogueTerm } from "../../../../steps/brd/brd.mjs"
import { spreadOf } from "../../../../steps/brd/spread/spread.mjs"
import { BRD_FORM } from "../../../../core/form.mjs"
import { parseRows } from "../../../../steps/brd/normalize/normalize.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const SPREAD = join(HERE, "../5-spread")
const TREE = process.argv[2] || "/Users/mac/IdeaProjects/codemonstersdev/sandbox/runbox/eddi"

const read = (p) => readFileSync(join(HERE, p), "utf8")
const put = (p, text) => { const abs = join(HERE, p); mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, text) }
const die = (why) => { console.error(`build: ${why}`); process.exit(1) }

const NORMALIZED = read("in/normalized.md")
const HITS = parseTable(read("in/hits.txt")).hits

// --- R-строки: их собирает СКРИПТ, потому что модель их переписывала (2113 токенов на копию) ------
const rows = numbered(NORMALIZED)
if (!rows.ok) die(`brd.rows.txt: ${rows.error.cls} — ${rows.error.detail}`)
put("brd.rows.txt", `${rows.value.join("\n")}\n`)

// --- наряд: настоящий order.mjs на настоящем дереве, и он ложится ВО ВХОД ------------------------
// Наряд — это `user`-сообщение запроса к модели, то есть вход подшага, а не его результат; рядом с
// ним `bin/ask.mjs --case` кладёт `in/request.analogue.json` — то, что реально ушло в сеть.
// СЧЁТ ИДЁТ В КОПИИ ДЕРЕВА, А НЕ В САМОМ eddi: `orderText` первого захода зовёт `tableAt` с
// `recount: true`, а тот ПИШЕТ `.agent/hits.txt` в корень прогона. Дай ему настоящий eddi — и сборка
// каталога приёмки насорит в дереве, по которому сама же и считает.
const cwd = mkdtempSync(join(tmpdir(), "izi-2c-accept-"))
cpSync(TREE, cwd, { recursive: true, dereference: false })
const order = orderText({ cwd }, { rows: NORMALIZED })
if (order.why) die(`in/order.analogue.md: ${order.why}`)
put("in/order.analogue.md", order.text)

// НЕТ ОТВЕТА — СОБИРАЕТСЯ ТОЛЬКО НАРЯД, и это норма: наряд нужен ДО вызова модели, всё
// остальное — после. Такой же порядок у 1-normalize/build.mjs.
if (!existsSync(join(HERE, "answer.analogue.txt"))) {
  console.log(`наряд ${order.text.split("\n").length} строк → in/order.analogue.md · R-строк ${rows.value.length}`)
  console.log("ответа модели нет — зови bin/ask.mjs с --case, потом собери каталог ещё раз")
  process.exit(0)
}
const ANSWER = read("answer.analogue.txt").trim()
// --- кандидаты в якоря со счётом: видно, что отсёк порог ----------------------------------------
// Слова колонки `object` — те же, что перебирает `subjectsOf`; здесь они печатаются ВСЕ, со счётом,
// чтобы оператор увидел не только выбранное, но и отсечённое. Кто выбран — решает `subjectsOf`,
// а не этот отчёт: набор берётся из его ответа, а не считается второй раз.
if (!ANSWER) die("answer.analogue.txt пуст — ответ модели снимается `bin/ask.mjs`, а не пишется руками")
const TERM = analogueTerm(ANSWER.replace(/^analogue:\s*/i, ""))
const subs = subjectsOf(NORMALIZED, HITS, TERM)
if (!subs.ok) die(`subjects[]: ${subs.error.cls} — ${subs.error.detail}`)

const index = new Map(Object.entries(HITS).map(([w, n]) => [w.toLowerCase(), Number(n)]))
const chosen = new Set(subs.value.map((s) => s.toLowerCase()))
const cap = BRD_FORM.anchorMaxFiles
const seen = new Set()
const objects = [`# кандидаты в якоря — слова колонки \`object\` таблицы требований, со счётом файлов.`,
  `# порог BRD_FORM.anchorMaxFiles = ${cap}: слово, встреченное более чем в ${cap} файлах, якорем не становится.`,
  `# аналог стоит в subjects[] безусловно — его счёт порогом не судится.`]
for (const row of parseRows(NORMALIZED)) {
  for (const word of String(row.object).split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    const key = word.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const n = index.has(key) ? index.get(key) : null
    const mark = key === TERM.toLowerCase() ? "  ← аналог"
      : chosen.has(key) ? "  ← якорь"
      : n === null ? "  (в таблице попаданий нет: слишком короткое или служебное)"
      : "  отсечён порогом"
    objects.push(`${word} · files ${n === null ? "—" : n}${mark}`)
  }
}
if (!seen.has(TERM.toLowerCase())) objects.push(`${TERM} · files ${index.get(TERM.toLowerCase()) ?? "—"}  ← аналог`)
put("objects.txt", `${objects.join("\n")}\n`)

// --- артефакт подшага: три части, собранные brdText ---------------------------------------------
const brd = brdText(rows.value, ANSWER, subs.value)
if (!brd.ok) die(`out/brd.md: ${brd.error.cls} — ${brd.error.detail}`)
put("out/brd.md", brd.value)

// --- подшаг 2D: вход — артефакт 2C, выход — карта обхода ----------------------------------------
// Пара `parseBrd` + `analogueTerm` — та же, что зовёт route.mjs::spread: карта описывает ТО, что
// легло в артефакт, а не то, что мы про него помним.
mkdirSync(join(SPREAD, "out"), { recursive: true })
mkdirSync(join(SPREAD, "in"), { recursive: true })
writeFileSync(join(SPREAD, "in/brd.md"), brd.value)
const doc = parseBrd(brd.value)
const t0 = Date.now()
const map = spreadOf({ cwd: TREE, anchors: doc.subjects || [], analogue: analogueTerm(doc.analogue) })
const sec = ((Date.now() - t0) / 1000).toFixed(2)
writeFileSync(join(SPREAD, "out/anchors.json"), `${JSON.stringify(map, null, 2)}\n`)

const share = map.files ? ((map.marked.length / map.files) * 100).toFixed(1) : "0.0"
const twin = map.analogue ? map.analogue.files.length : 0
const inside = map.analogue ? map.analogue.files.filter((p) => map.marked.includes(p)).length : 0
console.log(`наряд ${order.text.split("\n").length} строк → in/order.analogue.md · R-строк ${rows.value.length} · subjects[] ${subs.value.join(" · ")}`)
console.log(`карта обхода: дерево ${map.files} файлов · помечено ${map.marked.length} (${share}%) · ` +
  `файлов аналога «${map.analogue?.word || "—"}» ${twin}, из них внутри помеченного ${inside} · ${sec} с, 0 токенов`)
