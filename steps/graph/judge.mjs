// MODULE_CONTRACT: judge — гардрейл шага 5: карта покрывает клетки и не двоит пути
// Purpose:    одно решение: годится ли склеенная карта как ЕДИНЫЙ документ о репозитории.
// io:         none
// EXTERNAL_DEPENDENCY: steps/graph/graph.mjs::checkGraph, mergeGraph — те же правила G1..G3.
// Invariants: ТОТАЛЕН. Карты нет — вердикт invalid, а не молчание: пустая карта проехала бы дальше.
// Interface:  judgeGraph
import { checkGraph } from "./graph.mjs"

// FUNCTION_CONTRACT: judgeGraph — вердикт по карте
//   Input:        { graph — разобранная карта; plan — план обследования; text — сырой XML }
//   Antecedent:   — (тотален)
//   Consequent:   success: []; failure: блокеры G1..G3
//   Purity:       pure
export function judgeGraph({ graph = null, plan = {}, text = "" } = {}) {
  const raw = String(text || "")
  if (!graph) {
    return [`invalid: карты нет — склеивать было нечего или склейка не удалась. Длина полученного: ${raw.length} симв.`]
  }
  if (raw && !/<appgraph\b|<graph\b/.test(raw)) {
    return [`invalid: склеенный документ не похож на карту — нет корня <appgraph>. Начало: «${raw.trim().slice(0, 80)}»`]
  }
  return checkGraph(graph, plan)
}
