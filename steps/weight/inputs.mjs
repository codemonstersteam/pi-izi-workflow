// MODULE_CONTRACT: inputs — СУД ВХОДА шага 7
// Purpose:    одно решение: есть ли чем взвешивать. io: fs. Тотален.
// EXTERNAL_DEPENDENCY: ext/state.mjs::sha1of — тот же отпечаток, что считает close.
// Interface:  inputs
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { sha1of } from "../../ext/state.mjs"
import { FRD } from "./paths.mjs"

// FUNCTION_CONTRACT: inputs — годен ли вход шага 7
//   Consequent:   success: ""; failure: отказ с ИМЕНЕМ файла и шага-владельца
//   Purity:       io (fs)
export function inputs(state) {
  const abs = join(state.cwd, FRD)
  if (!existsSync(abs)) return `${FRD} не существует — шаг intake не отработал, взвешивать нечего`
  const text = readFileSync(abs, "utf8")
  if (!text.trim()) return `${FRD} пуст — шаг intake закрылся, ничего не написав`
  const known = state.at && state.at.frd
  if (known && known.sha1 !== sha1of(text)) return `${FRD} изменился после того, как его продвинул intake — вес считается по требованию, которого больше нет: переиграй intake`
  return ""
}
