// MODULE_CONTRACT: inputs — СУД ВХОДА шага 9C
// Purpose:    одно решение: есть ли из чего рисовать потоки. io: fs. Тотален.
// EXTERNAL_DEPENDENCY: ext/state.mjs::sha1of.
// Invariants: ОТСУТСТВИЕ СЛОВАРЯ — ОТКАЗ ШАГА, а не красный F11 на каждой порции: значения нет в
//             словаре, а словарь роль не пишет — такой блокер ей закрыть нечем, и это прямой запрет
//             standards/guardrail.md.
// Interface:  inputs
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { sha1of } from "../../../ext/state.mjs"
import { FRD, TREE, VALUES } from "./paths.mjs"

// FUNCTION_CONTRACT: inputs — годен ли вход шага 9C
//   Consequent:   success: ""; failure: отказ с ИМЕНЕМ файла и шага-владельца
//   Purity:       io (fs)
export function inputs(state) {
  for (const [rel, step, key] of [[TREE, "plan/tree", "tree"], [VALUES, "plan/values", "values"], [FRD, "intake", "frd"]]) {
    const abs = join(state.cwd, rel)
    if (!existsSync(abs)) return `${rel} не существует — шаг ${step} не отработал, потоки рисовать не по чему`
    const text = readFileSync(abs, "utf8")
    if (!text.trim()) return `${rel} пуст — шаг ${step} закрылся, ничего не написав`
    const known = state.at && state.at[key]
    if (known && known.sha1 !== sha1of(text)) return `${rel} изменился после того, как его продвинул ${step} — потоки нельзя рисовать по документу, которого больше нет: переиграй ${step}`
  }
  return ""
}
