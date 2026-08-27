// MODULE_CONTRACT: scenarios — слайс пласта scenarios наряда intake (первый слой FRD)
// Purpose:    одно решение: ЧТО видит модель на первом пласте — артефакт шага 2 целиком:
//             BRD и таблицу normalized, из которых она пишет сценарии. Слоёв до него нет,
//             предыдущее несёт только общие слоты головы (order.mjs).
// io:         fs (через cut.mjs — чтение .agent/brd.md, .agent/normalized.md)
// EXTERNAL_DEPENDENCY: steps/intake/cut.mjs — brdText/normalizedText; пути читаются против
//             state.cwd ПРОГОНА (не этого репо) — нет файлов, значит пустые строки.
// Invariants: слоты приходят ВСЕГДА, в том числе пустыми; тотальность наряда проверяет
//             голова (order.mjs) — дыра слота значит отказ, а не текст с дырой.
// Interface:  orderSlice
import { brdText, normalizedText } from "../cut.mjs"

// FUNCTION_CONTRACT: orderSlice — слоты пласта scenarios
//   Input:        state — состояние прогона (cwd); prev — staging прошлого слоя, здесь не нужен
//   Dependencies: cut.mjs::brdText, cut.mjs::normalizedText
//   Antecedent:   .agent/brd.md и .agent/normalized.md могут отсутствовать — слоты пусты
//   Consequent:   success: { "{BRD}": текст BRD, "{NORMALIZED}": таблица значений } — строки
//   Purity:       io (fs через cut.mjs)
export function orderSlice(state, _prev) {
  return {
    "{BRD}": brdText(state),
    "{NORMALIZED}": normalizedText(state),
  }
}
