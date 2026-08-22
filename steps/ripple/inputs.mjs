// MODULE_CONTRACT: inputs — СУД ВХОДА шага 8
// Purpose:    одно решение: есть ли от чего считать рябь. io: fs. Тотален.
// EXTERNAL_DEPENDENCY: ext/state.mjs::sha1of.
// Interface:  inputs
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { sha1of } from "../../ext/state.mjs"
import { FRD, GRAPH, MODE } from "./paths.mjs"

// FUNCTION_CONTRACT: inputs — годен ли вход шага 8
//   Consequent:   success: ""; failure: отказ с ИМЕНЕМ файла и шага-владельца
//   Purity:       io (fs)
export function inputs(state) {
  for (const [rel, step, key] of [[FRD, "intake", "frd"], [GRAPH, "graph", "appgraph"], [MODE, "weight", "mode"]]) {
    const abs = join(state.cwd, rel)
    if (!existsSync(abs)) return `${rel} не существует — шаг ${step} не отработал, рябь считать не от чего`
    const text = readFileSync(abs, "utf8")
    if (!text.trim()) return `${rel} пуст — шаг ${step} закрылся, ничего не написав`
    const known = state.at && state.at[key]
    if (known && known.sha1 !== sha1of(text)) return `${rel} изменился после того, как его продвинул ${step} — рябь нельзя считать по документу, которого больше нет: переиграй ${step}`
  }
  return ""
}
