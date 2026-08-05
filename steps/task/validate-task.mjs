#!/usr/bin/env node
// MODULE_CONTRACT: validate-task — io-гардрейл входа конвейера: судит TASK.md одним пределом строк
// Purpose:    одно решение спрятано здесь: предел «одна задача = один вход» — число строк, при
//             котором TASK.md обязан делиться человеком, а не ролью — объявлен и проверяется в
//             ОДНОМ месте. Раньше он жил прозой в шаг-листе и второй раз в тексте роли; проверку
//             делала модель, то есть за «файл слишком велик» платили вложением файла в промпт.
// io:         fs
// Invariants: TASK_LINES_CAP не меняется во время выполнения; пустой файл (0 слов после trim) и
//             файл сверх предела — два разных отказа, оба роняют exit 1, ни один не путается с "✓".
// Interface:  TASK_LINES_CAP — число, предел строк входа; export const без функции, FUNCTION_CONTRACT не несёт (§5 стандарта)
//
// Приёмка входа конвейера — 0 токенов.
//
//   node steps/task/validate-task.mjs TASK.md
//
// Предел объявлен ЗДЕСЬ и проверяется здесь. Пока он жил прозой в шаг-листе и вторым экземпляром
// в тексте роли, его исполняла модель — то есть за проверку «файл слишком велик» платили вложением
// этого файла в промпт.

import { readFileSync, existsSync } from "node:fs"

// Одна задача = один вход. Больше — задача делится, и делит её оператор, а не роль.
export const TASK_LINES_CAP = 300

const f = process.argv[2]
if (!f) { console.error("usage: validate-task.mjs <TASK.md>"); process.exit(2) }
if (!existsSync(f)) { console.error(`✗ ${f} не существует — вход конвейера кладёт оператор`); process.exit(1) }

const text = readFileSync(f, "utf8")
const lines = text.split("\n").length
const words = text.trim().split(/\s+/).filter(Boolean).length

if (!words) { console.error(`✗ ${f} пуст — молчание не является требованием`); process.exit(1) }
if (lines > TASK_LINES_CAP) {
  console.error(`✗ ${f}: ${lines} строк при пределе ${TASK_LINES_CAP} — одна задача = один вход, эту надо делить`)
  process.exit(1)
}

console.log(`✓ ${f}: ${lines} строк, ${words} слов`)
