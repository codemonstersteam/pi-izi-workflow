// MODULE_CONTRACT: order — наряд скауту на ОДНУ клетку
// Purpose:    одно решение: как клетка становится текстом наряда. Шаблон — ДАННЫЕ
//             (order.spine.tpl для хребта, order.survey.tpl для обычной), подстановка слотов;
//             блоки PREVIOUS и FEEDBACK уже живут в шаблоне: первый заход несёт их пустыми,
//             починка — с прошлым ответом и находками. Отдельного fix-шаблона нет НАМЕРЕННО:
//             форма одна, различие — в заполнении (паттерн brd/order.clean.tpl проверен прогоном).
// io:         fs (чтение шаблона — module-relative)
// EXTERNAL_DEPENDENCY: steps/scope/part.mjs::GRAMMAR_VERSION — версия грамматики для {CHECK};
//             cut.mjs — digest и якоря клетки.
// Invariants: ТОТАЛЕН; шаблон читается рядом с модулем — место шаблона знает наряд, не полоса.
// Interface: orderText
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { existsSync } from "node:fs"
import { GRAMMAR_VERSION } from "../part.mjs"
import { digestOf, subjectsLines } from "./cut.mjs"
import { BRD, STAGED_PART } from "../paths.mjs"

const tpl = (name) => readFileSync(new URL(`./order.${name}.tpl`, import.meta.url), "utf8")

// МАЛАЯ КЛЕТКА — ТЕКСТ ФАЙЛОВ В НАРЯДЕ, НЕ DIGEST (T23). Замер прогона 3c6542e7: хвост разведки —
// шесть вызовов по 900–2473 с из 24, каждый read — раунд модели с полным контекстом (~65 тыс.
// входных токенов НА РАУНД). Клетка ≤ SMALL_FILES файлов и ≤ SMALL_BYTES не нуждается в digest:
// наряд несёт содержимое целиком, роль отвечает ОДНИМ ходом, read ей не нужен. Пределы — константы
// ЗДЕСЬ: это решение наряда, а не плана (план режет по читаемости, наряд — по цене раунда).
export const SMALL_FILES = 3
export const SMALL_BYTES = 30 * 1024
// T36 — ХРЕБЕТ ВСЕГДА ИНЛАЙН. Замер izi-live 24.08.2026: хребтовая клетка eddi = 110КБ (pom 40К +
// README 41К + config 29К) > SMALL_BYTES → digest → digest.mjs для XML/MD/.properties даёт
// «no digest — open the file yourself» × 3 (ноль информации, явное указание читать) → scout
// ОБЯЗАН читать → 10–15 read-раундов с полным контекстом → 5.1M входных токенов, прогон погиб.
// Digest для ИСХОДНОГО КОДА (survey-клетки) полезен: пакет, импорты, маршруты, объявления —
// модель пишет <module> не открывая файл. Для хребта (XML, MD, properties) digest ПУСТ:
// ни один из 7 вопросов (artifact, suites, build, toggles, branching, contract, integrations)
// не отвечается из «no digest» строк. Хребет инлайн ВСЕГДА, с обрезкой файла до SPINE_FILE_CAP
// (artifactId, surefire/failsafe, зависимости — в первых 40КБ pom.xml).
export const SPINE_FILE_CAP = 40 * 1024

// FUNCTION_CONTRACT: filesBlock — блок {FILES} для клетки: полный текст или digest
//   Antecedent:   клетка мала, ИЛИ хребет, ИЛИ велика — три исхода
//   Consequent:   success: string — $START_FILE-блоки (хребет: с обрезкой до SPINE_FILE_CAP) | digest-строки
//   Purity:       io (fs — чтение файлов клетки)
function filesBlock(state, cell) {
  const files = cell.files || []
  const bytes = files.reduce((n, f) => n + (f.bytes || 0), 0)
  const isSpine = cell.kind === "spine"
  const small = files.length <= SMALL_FILES && bytes <= SMALL_BYTES
  if (!small && !isSpine) return digestOf(state, cell)
  const cap = isSpine ? SPINE_FILE_CAP : Infinity
  const lines = [`${isSpine ? "SPINE" : "SMALL"} CELL: every file comes as FULL TEXT below — the digest is skipped, and you have nothing to open with read`]
  for (const f of files) {
    let text = ""
    try { text = readFileSync(join(state.cwd, f.path), "utf8") } catch { text = "" }
    const cut = text.length > cap
    if (cut) text = text.slice(0, cap)
    lines.push(`$START_FILE path=${f.path} (${f.bytes || 0} b${cut ? `, first ${Math.round(cap / 1024)}KB shown` : ""})`, text, "$END_FILE")
  }
  return lines.join("\n")
}

// FUNCTION_CONTRACT: orderText — наряд по клетке
//   Input:        state; cell — клетка плана; { previous, feedback } — прошлый ответ и находки
//                 (пустые строки на первом заходе)
//   Consequent:   success: { text, staging } — наряд целиком и путь доставки;
//                 failure: { why: `слот {X} не подставлен…` } — наряд с дырой не доезжает до роли
//   Purity:       io (fs: шаблон, файлы клетки)
export function orderText(state, cell, { previous = "", feedback = "" } = {}) {
  const staging = STAGED_PART.replace("{CELL}", cell.id)
  const brd = existsSync(join(state.cwd, BRD)) ? readFileSync(join(state.cwd, BRD), "utf8") : ""
  const text = tpl(cell.kind === "spine" ? "spine" : "survey")
    .replaceAll("{CELL}", cell.id)
    .replaceAll("{FILES}", filesBlock(state, cell))
    .replaceAll("{SUBJECTS}", subjectsLines(cell).join("\n"))
    .replaceAll("{BRD}", brd.trim())
    .replaceAll("{PREVIOUS}", previous)
    .replaceAll("{FEEDBACK}", feedback)
    .replaceAll("{STAGING}", staging)
    .replaceAll("{CHECK}", `the script judges the file you write at ${staging} by the part guardrail ` +
      `(grammar ${GRAMMAR_VERSION}); a red verdict returns as FEEDBACK with rule numbers and paths`)
  // НЕПОДСТАВЛЕННЫЙ СЛОТ — ОТКАЗ, А НЕ ПУСТОТА: роль будет выдумывать данные вместо слота
  const hole = text.match(/\{([A-Z_]+)\}/)
  if (hole) return { why: `слот {${hole[1]}} не подставлен — наряд уходит роли с дырой` }
  return { text, staging }
}
