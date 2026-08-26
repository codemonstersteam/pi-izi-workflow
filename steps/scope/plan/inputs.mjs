// MODULE_CONTRACT: inputs — СУД ВХОДА подшага 3A: годен ли вход плану
// Purpose:    одно решение: имеет ли подшаг право резать дерево. Вход — артефакты шага 2; «шаг 2
//             закрыт» сам по себе не доказывает ничего — сверяется отпечаток (ext/state.mjs,
//             BUG_FIX_CONTEXT тикета T04).
// io:         fs
// Invariants: ТОТАЛЕН — ни одна функция не бросает; отсутствие файла — ОТКАЗ С ИМЕНЕМ, а не пустой
//             список (standards/code.md: «плана нет» и «в плане ноль клеток» — разные факты).
// Interface: inputs
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { sha1of } from "../../../ext/state.mjs"
import { BRD, ANCHORS } from "../paths.mjs"

const readAt = (cwd, rel) => (existsSync(join(cwd, rel)) ? readFileSync(join(cwd, rel), "utf8") : "")

// FUNCTION_CONTRACT: inputs — суд входа подшага
//   Input:        state — состояние прогона (cwd, at.brd)
//   Consequent:   success: "" — вход годен; failure: { cls, why } — отказ с именем
//   Purity:       io (fs)
export function inputs(state) {
  const brd = readAt(state.cwd, BRD)
  if (!brd.trim()) return { cls: "no-brd", why: `${BRD} не существует или пуст — шаг 2 не отработал` }
  const stamp = state.at && state.at.brd
  if (!stamp || stamp.sha1 !== sha1of(brd)) {
    return { cls: "brd-changed", why: `${BRD} не совпадает с отпечатком закрытого шага 2 — артефакт правили после закрытия` }
  }
  const raw = readAt(state.cwd, ANCHORS)
  if (!raw.trim()) return { cls: "no-anchors", why: `${ANCHORS} не существует — подшаг 2D карты обхода не написал` }
  try { JSON.parse(raw) } catch (e) {
    return { cls: "no-anchors", why: `${ANCHORS} не разбирается как JSON — ${e.message}` }
  }
  return ""
}
