// MODULE_CONTRACT: inputs — СУД ВХОДА шага 9B, первый ход шага
// Purpose:    одно решение: годится ли то, на чём шаг собирается работать. «Вход зелен» — это
//             комментарий, пока никто не сверил содержимое.
// io:         fs
// EXTERNAL_DEPENDENCY: ext/state.mjs::sha1of — тот же отпечаток, который считает close.
// Invariants: ТОТАЛЕН: не бросает. Отказ называет ФАЙЛ, а не правило.
// Interface:  inputs
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { sha1of } from "../../../ext/state.mjs"
import { FRD, RIPPLE, GRAPH } from "./paths.mjs"

// FUNCTION_CONTRACT: inputs — годен ли вход
//   Input:        state — состояние конвейера
//   Dependencies: sha1of
//   Antecedent:   — (тотален)
//   Consequent:   success: "" — вход годен
//                 failure: строка отказа с ИМЕНЕМ файла и тем, какой шаг его даёт
//   Purity:       io (fs)
//   BUG_FIX_CONTEXT: три двери, через которые внутрь заезжает непроверенное, и все три закрывает
//                 ОДНА сверка отпечатка: правка руками между прогонами, артефакт, оставшийся на
//                 рельсе ошибки, и артефакт от прошлой задачи. До неё `closed` продолжал бы
//                 утверждать, что шаг зелен, по документу, которого больше нет.
export function inputs(state) {
  const need = [[FRD, "intake", "frd"], [RIPPLE, "ripple", "ripple"], [GRAPH, "graph", "appgraph"]]
  for (const [rel, step, key] of need) {
    const abs = join(state.cwd, rel)
    if (!existsSync(abs)) return `${rel} не существует — шаг ${step} не отработал, дерево строить не из чего`
    const text = readFileSync(abs, "utf8")
    if (!text.trim()) return `${rel} пуст — шаг ${step} закрылся, ничего не написав`
    const known = state.at && state.at[key]
    if (known && known.sha1 !== sha1of(text)) {
      return `${rel} изменился после того, как его продвинул шаг ${step} — дерево нельзя строить по документу, которого больше нет: переиграй ${step}`
    }
  }
  return ""
}
