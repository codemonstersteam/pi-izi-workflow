// MODULE_CONTRACT: order — НАРЯД НОРМАЛИЗАЦИИ: первый заход и ПОЧИНКА, и это разные наряды
// Purpose:    одно решение спрятано здесь: что роль `normalizer` видит. На первом заходе — сырой
//             заказ и форму строки; на починке — список находок и СВОЙ прошлый ответ, потому что
//             чинится таблица, а не пишется заново.
// io:         fs (шаблоны читаются module-relative — они часть модуля; заказ читается от cwd ПРОГОНА)
// EXTERNAL_DEPENDENCY: order.normalize.tpl и order.normalize.fix.tpl рядом с этим файлом;
//             steps/plan/repair.mjs::repairTask — блокеры как нумерованный список дел с адресом.
//             Отсутствие шаблона читается как ошибка чтения файла на сборке наряда, а не как пустой
//             наряд: наряд с дырой заставляет роль выдумывать.
// Invariants: ТОТАЛЕН по входу. Слот без данных — ОТКАЗ с именем слота, а не пустота.
// Interface:  orderText
import { readFileSync } from "node:fs"
import { repairTask } from "../../plan/repair.mjs"
import { readAt } from "../cut.mjs"
import { TASK, STAGED_NORMALIZED } from "../paths.mjs"

// FUNCTION_CONTRACT: orderText — наряд одного захода
//   Input:        state; { previous — прошлый ответ роли; feedback — блокеры вердикта }
//   Dependencies: repairTask, readAt
//   Antecedent:   заказ непуст — нормализовать молчание нечем
//   Consequent:   success: { text, staging, fix }; failure: { why } при незаполненном слоте
//   Purity:       io (fs)
//
//   ПОЧИНКА ОПОЗНАЁТСЯ ПО НАЛИЧИЮ НАХОДОК, а не по номеру круга: круг мог вырасти от обрыва связи,
//   на который чинить нечего, и наряд починки без находок был бы нарядом «сделай ровно это»
//   с пустым списком дел.
export function orderText(state, { previous = "", feedback = "" } = {}) {
  const task = readAt(state.cwd, TASK)
  if (!String(task).trim()) {
    return { why: `${TASK} пуст или не существует — нормализовать нечего` }
  }
  const fix = Boolean(feedback)
  const slots = fix
    ? (() => {
        const t = repairTask(feedback)
        return { TASKLIST: t.lines.join("\n"), COUNT: String(t.count), PREVIOUS: previous, TASK: task, STAGING: STAGED_NORMALIZED }
      })()
    // ПЕРВЫЙ ЗАХОД НЕ НЕСЁТ НИ `PREVIOUS`, НИ НАХОДОК: раздел, который нечем наполнить, из наряда
    // убирается, а не заполняется заглушкой.
    : { TASK: task, STAGING: STAGED_NORMALIZED }

  const tpl = readFileSync(new URL(fix ? "./order.normalize.fix.tpl" : "./order.normalize.tpl", import.meta.url), "utf8")
  let text = tpl
  for (const [k, v] of Object.entries(slots)) text = text.split(`{${k}}`).join(v)
  const left = [...text.matchAll(/\{([A-Z_]+)\}/g)].map((m) => m[1])
  if (left.length) return { why: `в наряде подшага brd/normalize остались незаполненные слоты: ${[...new Set(left)].join(", ")} — данные не доехали, и роль будет выдумывать` }
  return { text, staging: STAGED_NORMALIZED, fix }
}
