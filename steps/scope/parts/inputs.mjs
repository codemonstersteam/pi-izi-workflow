// MODULE_CONTRACT: inputs — СУД ВХОДА подшага 3В: годятся ли фокус и план для запуска роя
// Purpose:    одно решение: имеет ли подшаг право звать скаутов. Фокус и план — артефакты 3A/3Б,
//             оба сверяются отпечатком; каждая клетка фокуса обязана существовать в плане —
//             «рой пошёл по клетке, которой нет» это дефект цепочки, а не работы роли.
// io:         fs
// Invariants: ТОТАЛЕН; отсутствие — ОТКАЗ С ИМЕНЕМ.
// Interface: inputs
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { sha1of } from "../../../ext/state.mjs"
import { PLAN, FOCUS } from "../paths.mjs"

const readAt = (cwd, rel) => (existsSync(join(cwd, rel)) ? readFileSync(join(cwd, rel), "utf8") : "")

// FUNCTION_CONTRACT: inputs — суд входа подшага
//   Input:        state (cwd, at.plan, at.focus)
//   Consequent:   success: ""; failure: { cls, why }
//   Purity:       io (fs)
export function inputs(state) {
  const plan = readAt(state.cwd, PLAN)
  if (!plan.trim()) return { cls: "no-plan", why: `${PLAN} не существует — подшаг 3A не отработал` }
  const planStamp = state.at && state.at.plan
  if (!planStamp || planStamp.sha1 !== sha1of(plan)) {
    return { cls: "plan-changed", why: `${PLAN} не совпадает с отпечатком подшага 3A` }
  }
  const focus = readAt(state.cwd, FOCUS)
  if (!focus.trim()) return { cls: "no-focus", why: `${FOCUS} не существует — подшаг 3Б не отработал` }
  const focusStamp = state.at && state.at.focus
  if (!focusStamp || focusStamp.sha1 !== sha1of(focus)) {
    return { cls: "focus-changed", why: `${FOCUS} не совпадает с отпечатком подшага 3Б` }
  }
  let p, f
  try { p = JSON.parse(plan); f = JSON.parse(focus) } catch (e) {
    return { cls: "unreadable", why: `план или фокус не разбирается как JSON — ${e.message}` }
  }
  const known = new Set((p.cells || []).map((c) => c && c.id).filter(Boolean))
  for (const id of (f.cells || []).map((c) => String(c || ""))) {
    if (!known.has(id)) return { cls: "focus-cell-missing", why: `фокус называет клетку «${id}», которой нет в плане — рой не может пойти по ней` }
  }
  return ""
}
