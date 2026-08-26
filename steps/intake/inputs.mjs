// MODULE_CONTRACT: inputs — СУД ВХОДА шага 6: годны ли карта, требование и таблица
// Purpose:    одно решение: имеет ли шаг право обжаривать требование о карту. Три документа,
//             каждый по своему отпечатку; «шаг 5 закрыт» сам по себе ничего не доказывает.
// io:         fs
// Invariants: ТОТАЛЕН; отсутствие файла — ОТКАЗ С ИМЕНЕМ.
// Interface: inputs
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { sha1of } from "../../ext/state.mjs"

const readAt = (cwd, rel) => (existsSync(join(cwd, rel)) ? readFileSync(join(cwd, rel), "utf8") : "")

// FUNCTION_CONTRACT: inputs — суд входа шага
//   Input:        state (cwd, at.appgraph, at.brd, at.normalized)
//   Consequent:   success: ""; failure: { cls, why }
//   Purity:       io (fs)
export function inputs(state) {
  const graph = readAt(state.cwd, ".agent/appgraph.xml")
  if (!graph.trim()) return { cls: "no-graph", why: ".agent/appgraph.xml не существует или пуст — шаг 5 не отработал" }
  const graphStamp = state.at && state.at.appgraph
  if (!graphStamp || graphStamp.sha1 !== sha1of(graph)) {
    return { cls: "graph-changed", why: ".agent/appgraph.xml не совпадает с отпечатком шага 5" }
  }
  const brd = readAt(state.cwd, ".agent/brd.md")
  if (!brd.trim()) return { cls: "no-brd", why: ".agent/brd.md не существует или пуст — шаг 2 не отработал" }
  const brdStamp = state.at && state.at.brd
  if (!brdStamp || brdStamp.sha1 !== sha1of(brd)) {
    return { cls: "brd-changed", why: ".agent/brd.md не совпадает с отпечатком шага 2" }
  }
  const normalized = readAt(state.cwd, ".agent/normalized.md")
  if (!normalized.trim()) return { cls: "no-normalized", why: ".agent/normalized.md не существует или пуст" }
  return ""
}
