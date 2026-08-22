// MODULE_CONTRACT: cut — состав работы шага 9A: СКЕЛЕТ словаря
// Purpose:    одно решение: какие строки словаря считает СКРИПТ, а какие заполняет роль. Скрипт
//             ставит строку на каждый конец use case и на каждое объявление изменения; роль
//             заполняет только пустые `text=""`.
// io:         fs
// EXTERNAL_DEPENDENCY: steps/intake/frd.mjs::parseFrd — тот же читатель требования, что у всех.
// Invariants: ТОТАЛЕН.
// Interface:  skeletonOf, frdOf, rippleOf, greenNow, readAt
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parseFrd } from "../../intake/frd.mjs"
import { valuesSkeleton, checkValues, parseValues } from "./values.mjs"
import { FRD, RIPPLE, OUT, STAGED } from "./paths.mjs"

export const readAt = (cwd, rel) => (existsSync(join(cwd, rel)) ? readFileSync(join(cwd, rel), "utf8") : "")
export const frdOf = (state) => parseFrd(readAt(state.cwd, FRD))
export const rippleOf = (state) => readAt(state.cwd, RIPPLE)

// FUNCTION_CONTRACT: greenNow — годится ли словарь ПРОШЛОГО прогона
//   Antecedent:   —
//   Consequent:   success: true, если словарь на месте И проходит гардрейл СЕЙЧАС, по сегодняшним
//                 входам; иначе false
//   Purity:       io (fs)
//   BUG_FIX_CONTEXT: условие «зелен с прошлого прогона» без пересуда — это дефект, а не экономия:
//                 правка требования оставила бы вчерашний словарь, а шаг 9C получил бы блокер F11,
//                 который роль закрыть НЕ МОЖЕТ (значения нет в словаре, а словарь она не пишет) —
//                 прямой запрет standards/guardrail.md. Условие списано с кэша частей шага scope,
//                 где правило уже куплено живым прогоном.
export function greenNow(state) {
  const staged = readAt(state.cwd, OUT)
  if (!staged.trim()) return false
  return checkValues({ staged, frd: frdOf(state), ripple: rippleOf(state) }).length === 0
}

// FUNCTION_CONTRACT: skeletonOf — скелет словаря на диск
//   Consequent:   success: { at, rows, filled, blank }; failure: { why }
//   Purity:       io (fs)
export function skeletonOf(state) {
  const sk = valuesSkeleton({ frd: frdOf(state), ripple: rippleOf(state) })
  if (!sk.rows) return { why: `${FRD} не даёт ни одной строки словаря — у требования нет ни концов use case, ни объявлений изменения` }
  mkdirSync(join(state.cwd, ".agent", "staging"), { recursive: true })
  writeFileSync(join(state.cwd, STAGED), sk.xml)
  return { at: STAGED, rows: sk.rows, filled: sk.filled, blank: sk.blank }
}

export { parseValues }
