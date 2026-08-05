#!/usr/bin/env node
// MODULE_CONTRACT: validate-brd — io-гардрейл шага brd: подключает чистое ядро newBrd к диску и коду возврата
// Purpose:    одно решение спрятано здесь: код возврата процесса (0 или 1) решает ЭТОТ скрипт по
//             факту находок, а не роль о себе self-сертификацией. Разбиение находок на блокер и
//             совет (severityOf) сюда только применяется, не переизобретается: блокер печатается в
//             stderr и роняет чек (exit 1), совет печатается в stdout и роли не мешает.
// io:         fs
// Invariants: путь источника (--task=, --answers=) читается, только если он передан и существует на
//             диске; source без пути или без файла даёт пустую строку молча, а не исключение.
//             Правил разбора текста этот файл не хранит — весь разбор делегирован newBrd.
// Interface:  экспорта нет, файл — io-труба слайса (§4 стандарта: труба не несёт export function)
//
// Приёмка BRD фронт-дора (0 токенов). Ядро — steps/brd/brd.mjs; здесь io.
//
//   node steps/brd/validate-brd.mjs .agent/brd.md --task=TASK.md --answers=.agent/answers.md
//
// Самосертификация снята: «agent-ready» решает ЭТОТ скрипт, а не роль о себе.

import { readFileSync, existsSync } from "node:fs"
import { newBrd } from "./brd.mjs"
import { newAnswers } from "../../core/answers.mjs"

const args = process.argv.slice(2)
const opt = (n) => { const h = args.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : "" }
const files = args.filter((a) => !a.startsWith("--"))
if (!files.length) { console.error("usage: steps/brd/validate-brd.mjs <brd.md> [--task=TASK.md] [--answers=.agent/answers.md]"); process.exit(2) }

// H1. Источники, откуда числу критерия РАЗРЕШЕНО взяться. Не переданы — правило молчит: судить
// происхождение не по чему, а молчать честнее, чем обвинять наугад.
const read = (p) => (p && existsSync(p) ? readFileSync(p, "utf8") : "")
// ИСТОЧНИК ЧИСЛА — задача и ЗНАЧЕНИЯ ответов оператора, но НЕ текст его вопросов. Файл ответов
// хранит и вопрос, и ответ; подавая его целиком, правило `invented-default` считало источником
// собственный вопрос роли и пропускало числа из списка альтернатив (находка F17 прогона run-5).
const answersRaw = read(opt("answers"))
const parsed = newAnswers(answersRaw)
if (!parsed.ok) {
  console.error(`✗ ${opt("answers")} [${parsed.error.cls}]: ${parsed.error.detail}`)
  process.exit(1)
}
const sources = [read(opt("task")), ...parsed.value.map((a) => a.text)].filter(Boolean)

// advice ПЕЧАТАЕТСЯ, но не роняет приёмку (B17-R): красный чек означает пере-делегирование
// владельца, а правило-суждение не имеет права им командовать. Советы уходят оператору на GATE #1.
let failed = 0
for (const f of files) {
  const built = newBrd(readFileSync(f, "utf8"), sources)
  if (!built.ok) {
    failed++
    console.error(`✗ ${f} [${built.error.cls}]:`)
    for (const line of built.error.detail.split("\n")) console.error(`  ${line.trim()}`)
    continue
  }
  const brd = built.value
  console.log(`✓ ${f}: ${brd.requirements.length} требований, subjects[${brd.subjects.length}], open-questions: 0`)
  // Улики едут НА УСПЕХЕ и печатаются, но приёмку не роняют: правило-суждение не имеет права
  // командовать пере-делегированием владельца артефакта.
  for (const a of brd.advice) console.log(`  ⚠ [${a.code}]${a.line ? ` :${a.line}` : ""} ${a.message}${a.evidence ? `\n      «${a.evidence.slice(0, 90)}»` : ""}`)
}
process.exit(failed ? 1 : 0)
