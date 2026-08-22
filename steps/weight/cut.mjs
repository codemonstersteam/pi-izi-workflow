// MODULE_CONTRACT: cut — состав работы шага 7: ВЕС по формам дельт
// Purpose:    одно решение: какое слово называет размер этого изменения. Считает СКРИПТ, 0 токенов.
// io:         fs
// EXTERNAL_DEPENDENCY: steps/intake/frd.mjs::parseFrd — ТОТ ЖЕ разбор требования, что у всех;
//             второй разбор одной грамматики это то, как два читателя одного файла начинают спорить.
// Invariants: ТОТАЛЕН.
// Interface:  weighOf, readAt
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { parseFrd } from "../intake/frd.mjs"
import { newMode } from "./weight.mjs"
import { FRD } from "./paths.mjs"

export const readAt = (cwd, rel) => (existsSync(join(cwd, rel)) ? readFileSync(join(cwd, rel), "utf8") : "")

// FUNCTION_CONTRACT: weighOf — вес изменения
//   Consequent:   success: { mode, why, deltas }; failure: { why } — вердикт, не бросок
//   Purity:       io (fs)
export function weighOf(state) {
  const deltas = parseFrd(readAt(state.cwd, FRD)).deltas
  const r = newMode({ deltas })
  if (!r.ok) return { why: `${r.error.cls}:\n  ${r.error.detail}`, deltas: deltas.length }
  return { mode: r.value.mode, earned: r.value.why.join(", "), deltas: deltas.length }
}
