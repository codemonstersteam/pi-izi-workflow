// MODULE_CONTRACT: cut — состав работы шага 5: СКЛЕЙКА частей в одну карту
// Purpose:    одно решение: как части роя становятся одним документом. Считает СКРИПТ, 0 токенов;
//             склейка и есть суть этого шага.
// io:         fs
// EXTERNAL_DEPENDENCY: steps/graph/graph.mjs::newGraph, graphXml — сама склейка и её грамматика.
// Invariants: ТОТАЛЕН.
// Interface:  mergeOf
import { newGraph, graphXml } from "./graph.mjs"
import { plan, focus, readAt } from "./inputs.mjs"
import { COMPUTED, partAt } from "./paths.mjs"

// FUNCTION_CONTRACT: mergeOf — карта из частей
//   Antecedent:   вход уже осуждён `inputs` — каждая клетка фокуса закрыта частью, и часть свежа
//   Consequent:   success: { xml, nodes, cells }; failure: { why } — вердикт, не бросок
//   Purity:       io (fs)
export function mergeOf(state) {
  const p = plan(state)
  if (p.why) return { why: p.why }
  const f = focus(state)
  if (f.why) return { why: f.why }

  const parts = p.cells.filter((c) => f.cells.has(c.id))
    .map((c) => ({ id: c.id, kind: c.kind, xml: readAt(state.cwd, partAt(c.id)) }))

  const r = newGraph({ parts, computedXml: readAt(state.cwd, COMPUTED), plan: p.plan, focus: f.focus })
  if (!r.ok) return { why: `${r.error.cls}:\n  ${r.error.detail}` }
  return { xml: graphXml(r.value), nodes: r.value.modules.length, cells: parts.length }
}
