// MODULE_CONTRACT: inputs — СУД ВХОДА подшага 3Б: годен ли план и факт скрипта для выбора фокуса
// Purpose:    одно решение: имеет ли подшаг право решать, что читает рой. План и computed-факт —
//             артефакты подшага 3A; «3A закрыт» проверяется отпечатком, а не воспоминанием.
// io:         fs
// Invariants: ТОТАЛЕН; отсутствие файла — ОТКАЗ С ИМЕНЕМ (steps/graph/inputs.mjs — тот же суд
//             читает эти файлы шагом 5; здесь они судятся на ВХОДЕ их потребителя).
// Interface: inputs
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { sha1of } from "../../../ext/state.mjs"
import { PLAN, COMPUTED } from "../paths.mjs"

const readAt = (cwd, rel) => (existsSync(join(cwd, rel)) ? readFileSync(join(cwd, rel), "utf8") : "")

// FUNCTION_CONTRACT: inputs — суд входа подшага
//   Input:        state (cwd, at.plan, at.computed)
//   Consequent:   success: ""; failure: { cls, why }
//   Purity:       io (fs)
export function inputs(state) {
  const plan = readAt(state.cwd, PLAN)
  if (!plan.trim()) return { cls: "no-plan", why: `${PLAN} не существует — подшаг 3A не отработал` }
  const stamp = state.at && state.at.plan
  if (!stamp || stamp.sha1 !== sha1of(plan)) {
    return { cls: "plan-changed", why: `${PLAN} не совпадает с отпечатком подшага 3A — план правили после закрытия` }
  }
  const xml = readAt(state.cwd, COMPUTED)
  if (!xml.trim()) return { cls: "no-computed", why: `${COMPUTED} не существует — подшаг 3A не отработал` }
  const fact = state.at && state.at.computed
  if (!fact || fact.sha1 !== sha1of(xml)) {
    return { cls: "computed-changed", why: `${COMPUTED} не совпадает с отпечатком подшага 3A` }
  }
  return ""
}
