// MODULE_CONTRACT: order — НАРЯД ПОДШАГА 2C: первый заход и ПОЧИНКА, и это разные наряды
// Purpose:    одно решение спрятано здесь: что роль `analogue` видит. Она отвечает ОДНОЙ строкой,
//             поэтому наряд показывает ровно два документа — пронумерованные требования и таблицу
//             попаданий — и путь, куда писать. Наряд починки показывает задачу, прошлый ответ и ту
//             же таблицу: случай у подшага один — слово с нулевым счётом.
// io:         fs (шаблоны читаются module-relative — они часть модуля; документы прогона читаются
//             от cwd ПРОГОНА, никогда от этого репозитория — CLAUDE.md, ограничение 6)
// EXTERNAL_DEPENDENCY: order.analogue.tpl и order.fix.tpl рядом с этим файлом — отсутствие читается
//             как ошибка чтения файла на сборке наряда, а не как пустой наряд: наряд с дырой
//             заставляет роль выдумывать. steps/brd/anchors/assemble.mjs::numbered — R-строки
//             собирает СКРИПТ. steps/brd/hits/hits.mjs::tableAt — таблица попаданий ПРОХОДА:
//             считается один раз и лежит в `.agent/hits.txt`. steps/plan/repair.mjs::repairTask —
//             блокеры как нумерованный список дел с адресом.
// Invariants: ТОТАЛЕН по входу. Слот без данных — ОТКАЗ `{ why }` с именем слота, а не пустота.
// Interface:  orderText, fill
import { readFileSync } from "node:fs"
import { repairTask } from "../../plan/repair.mjs"
import { readAt } from "../cut.mjs"
import { tableAt } from "../hits/hits.mjs"
import { NORMALIZED, HITS, STAGED_ANALOGUE } from "../paths.mjs"
import { numbered } from "./assemble.mjs"

// FUNCTION_CONTRACT: fill — подстановка слотов с проверкой остатка
//   Input:        tpl — текст шаблона наряда; slots — { ИМЯ: значение }
//   Dependencies: —
//   Antecedent:   — (тотальна)
//   Consequent:   success: { text } — все слоты шаблона заполнены
//                 failure: { why } — в тексте остался `{СЛОТ}`: данные не доехали
//   Purity:       pure
//   Interface:    fill(tpl: string, slots: object) -> { text } | { why }
//   Вынесено из orderText отдельной функцией, потому что «наряд с дырой не уедет роли» — это
//   правило, а правило без шва является комментарием: шаблон и сборщик всегда согласованы между
//   собой, и покрасить проверку остатка можно только вызвав её с рассогласованной парой.
export function fill(tpl, slots = {}) {
  let text = String(tpl == null ? "" : tpl)
  for (const [k, v] of Object.entries(slots)) text = text.split(`{${k}}`).join(String(v == null ? "" : v))
  const left = [...new Set([...text.matchAll(/\{([A-Z_]+)\}/g)].map((m) => m[1]))]
  if (left.length) {
    return { why: `в наряде подшага brd/anchors остались незаполненные слоты: ${left.join(", ")} — данные не доехали, и роль будет выдумывать` }
  }
  return { text }
}

// FUNCTION_CONTRACT: orderText — наряд одного захода
//   Input:        state — { cwd }; { rows — таблица действий подшага 2A (по умолчанию читается с
//                 диска); previous — прошлый ответ роли, строка аналога; feedback — блокеры вердикта }
//   Dependencies: numbered, tableAt, repairTask, readAt, fill
//   Antecedent:   таблица действий есть и разбирается в строки (подшаг 2A закрыт); таблица попаданий
//                 непуста; починка требует непустого feedback И прошлого ответа
//   Consequent:   success: { text, staging, fix }; failure: { why } при незаполненном слоте
//   Purity:       io (fs)
//
//   ПОЧИНКА ОПОЗНАЁТСЯ ПО НАЛИЧИЮ НАХОДОК, а не по номеру круга: круг мог вырасти от обрыва связи,
//   на который чинить нечего, и наряд починки без находок был бы нарядом «сделай ровно это» с
//   пустым списком дел.
//   ТАБЛИЦУ ПОПАДАНИЙ СЧИТАЕТ ПЕРВЫЙ НАРЯД ПРОХОДА, и он один: `recount: !fix` кладёт её в
//   `.agent/hits.txt`, а наряд починки и судья ЧИТАЮТ этот файл. Два счёта за круг — это два текста
//   одного требования, и разъехались бы они молча.
export function orderText(state, { rows = "", previous = "", feedback = "" } = {}) {
  const cwd = (state && state.cwd) || ""
  const table = rows || readAt(cwd, NORMALIZED)
  if (!String(table).trim()) {
    return { why: `${NORMALIZED} пуст или не существует — аналог выбирается ПО ТАБЛИЦЕ ДЕЙСТВИЙ, а не по сырому заказу: подшаг нормализации не закрыт` }
  }
  const lines = numbered(table)
  if (!lines.ok) {
    return { why: `${NORMALIZED} не разбирается в строки требований (${lines.error.cls}): ${lines.error.detail}` }
  }
  const fix = Boolean(String(feedback).trim())
  if (fix && !String(previous).trim()) {
    return { why: "наряд починки без прошлого ответа роли — чинить нечего: находка называет строку, которой в наряде не будет" }
  }
  const hit = tableAt(cwd, { rows: table, recount: !fix })
  if (!String(hit.text).trim()) {
    return { why: `${HITS} пуста — аналог выбирается ИЗ ТАБЛИЦЫ ПОПАДАНИЙ, а без неё роль назовёт слово, счёт которого никто не считал` }
  }
  const slots = fix
    ? (() => {
        const t = repairTask(feedback)
        return { TASKLIST: t.lines.join("\n"), COUNT: String(t.count), PREVIOUS: String(previous).trim(), WORDS: hit.text, STAGING: STAGED_ANALOGUE }
      })()
    // ПЕРВЫЙ ЗАХОД НЕ НЕСЁТ НИ `PREVIOUS`, НИ НАХОДОК: раздел, который нечем наполнить, из наряда
    // убирается, а не заполняется заглушкой.
    : { ROWS: lines.value.join("\n"), WORDS: hit.text, STAGING: STAGED_ANALOGUE }

  const tpl = readFileSync(new URL(fix ? "./order.fix.tpl" : "./order.analogue.tpl", import.meta.url), "utf8")
  const out = fill(tpl, slots)
  if (out.why) return out
  return { text: out.text, staging: STAGED_ANALOGUE, fix }
}
