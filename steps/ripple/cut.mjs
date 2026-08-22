// MODULE_CONTRACT: cut — состав работы шага 8: ПОДГРАФ, который изменение задевает
// Purpose:    одно решение: какие узлы попадают под изменение. Считает СКРИПТ, 0 токенов.
// io:         fs
// EXTERNAL_DEPENDENCY: steps/intake/frd.mjs::parseFrd и steps/intake/map.mjs::mapIndex — ТЕ ЖЕ
//             читатели требования и карты, что у всех: второй читатель одной грамматики это то, как
//             два шага начинают спорить о фактах.
// Invariants: ТОТАЛЕН.
// Interface:  rippleOf, knownOf, readAt
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { parseFrd } from "../intake/frd.mjs"
import { parseMap } from "../intake/map.mjs"
import { parseComputed } from "../scope/computed.mjs"
import { newRipple } from "./ripple.mjs"
import { FRD, GRAPH, MODE, COMPUTED } from "./paths.mjs"

export const readAt = (cwd, rel) => (existsSync(join(cwd, rel)) ? readFileSync(join(cwd, rel), "utf8") : "")

// FUNCTION_CONTRACT: knownOf — пути, которые объявляет карта
//   Purity:       io (fs)
export const knownOf = (state) =>
  [...String(readAt(state.cwd, GRAPH)).matchAll(/<module\b[^>]*\bpath="([^"]+)"/g)].map((m) => m[1])

// FUNCTION_CONTRACT: rippleOf — подграф изменения
//   Dependencies: parseFrd, mapIndex, parseComputed, newRipple
//   Antecedent:   вход уже осуждён `inputs`
//   Consequent:   success: { xml, seeds, nodes, design }; failure: { why } — вердикт, не бросок
//   Purity:       io (fs)
export function rippleOf(state) {
  const xml = readAt(state.cwd, GRAPH)
  const map = parseMap(xml)
  // Вычисленный граф шага 3 знает ВСЕ файлы, карта роя — только фокус. Его отсутствие законно:
  // правило тогда судит по карте, как судило до этой правки.
  const computed = readAt(state.cwd, COMPUTED)
  const repo = computed ? new Set([...String(computed).matchAll(/\bpath="([^"]+)"/g)].map((m) => m[1])) : new Set()
  const r = newRipple({ xml, frd: parseFrd(readAt(state.cwd, FRD)), mode: readAt(state.cwd, MODE), map, repo })
  if (!r.ok) return { why: `${r.error.cls}:\n  ${r.error.detail}` }
  return { xml: r.value.xml, seeds: r.value.seeds.length, nodes: r.value.nodes.length, design: r.value.design, total: map.count }
}
