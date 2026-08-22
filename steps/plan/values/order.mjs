// MODULE_CONTRACT: order — НАРЯД шага 9A: слоты и текст
// Purpose:    одно решение: что роль видит и чего не видит. Слот без данных — ОТКАЗ, а не пустота:
//             пустой слот роль заполняет выдумкой.
// io:         fs (шаблон читается module-relative — он часть модуля, а не данные проекта)
// EXTERNAL_DEPENDENCY: order-values.tpl рядом с этим файлом.
// Invariants: ТОТАЛЕН.
// Interface:  SLOTS, slotsFor, orderText
import { readFileSync } from "node:fs"
import { readAt, frdOf } from "./cut.mjs"
import { FRD, STAGED } from "./paths.mjs"

// Слоты объявлены ЗДЕСЬ и сверяются с шаблоном в обе стороны: лишний ключ — мёртвые данные,
// недостающий — выдумка роли.
export const SLOTS = Object.freeze(["SKELETON", "FRD", "PREVIOUS", "FEEDBACK", "BLANK", "STAGING", "CHECK"])

// FUNCTION_CONTRACT: slotsFor — слоты наряда
//   Input:        state; { previous, feedback, skeleton, blank }
//   Consequent:   success: объект слотов, все ключи заполнены
//   Purity:       io (fs)
export function slotsFor(state, { previous = "", feedback = "", skeleton = "", blank = 0 } = {}) {
  return {
    SKELETON: skeleton || readAt(state.cwd, STAGED),
    FRD: readAt(state.cwd, FRD),
    PREVIOUS: previous || "(первый заход)",
    FEEDBACK: feedback || "(замечаний нет)",
    BLANK: String(blank),
    STAGING: STAGED,
    CHECK: "values({path}) — состав скелета не тронут, пустых text= не осталось, значение границы имеет форму «МЕТОД путь» или «код КОД»",
  }
}

// FUNCTION_CONTRACT: orderText — наряд целиком
//   Consequent:   success: { text, staging }; НЕЗАПОЛНЕННЫЙ СЛОТ — ОТКАЗ
//   Purity:       io (fs)
export function orderText(state, opts = {}) {
  const slots = slotsFor(state, opts)
  const tpl = readFileSync(new URL("./order-values.tpl", import.meta.url), "utf8")
  let text = tpl
  for (const [k, v] of Object.entries(slots)) text = text.split(`{${k}}`).join(v)
  const left = [...text.matchAll(/\{([A-Z_]+)\}/g)].map((m) => m[1])
  if (left.length) return { why: `в наряде словаря остались незаполненные слоты: ${[...new Set(left)].join(", ")} — данные не доехали, и роль будет выдумывать` }
  return { text, staging: STAGED }
}
export { frdOf }
