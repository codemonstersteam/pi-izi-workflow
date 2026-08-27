// MODULE_CONTRACT: data-failures — слайс пласта data-failures наряда intake (величины, B3)
// Purpose:    одно решение: ЧТО видит модель на пласте «отказы данных» — BRD и таблицу
//             normalized (легальные источники чисел требования) плюс сам словарь источников
//             машиной: число вне словаря — выдумка, и суд (F5/F13) читает тот же словарь.
// io:         fs (через cut.mjs — чтение .agent/brd.md, .agent/normalized.md)
// EXTERNAL_DEPENDENCY: steps/intake/frd.mjs::FRD_FORM.sources — замкнутый словарь источников;
//             steps/intake/cut.mjs — brdText/normalizedText; пути против state.cwd ПРОГОНА.
// Invariants: слоты приходят ВСЕГДА, в том числе пустыми; тотальность наряда проверяет
//             голова (order.mjs) — дыра слота значит отказ, а не текст с дырой.
// Interface:  orderSlice
import { FRD_FORM } from "../frd.mjs"
import { brdText, normalizedText } from "../cut.mjs"

// FUNCTION_CONTRACT: orderSlice — слоты пласта data-failures
//   Input:        state — состояние прогона (cwd); prev — staging прошлого слоя, здесь не нужен
//   Dependencies: cut.mjs::brdText, cut.mjs::normalizedText; frd.mjs::FRD_FORM.sources
//   Antecedent:   .agent/brd.md и .agent/normalized.md могут отсутствовать — слоты пусты
//   Consequent:   success: { "{BRD}", "{NORMALIZED}", "{SOURCES}" } — строки
//   Purity:       io (fs через cut.mjs)
export function orderSlice(state, _prev) {
  return {
    "{BRD}": brdText(state),
    "{NORMALIZED}": normalizedText(state),
    "{SOURCES}": FRD_FORM.sources ? Object.entries(FRD_FORM.sources).map(([k, v]) => `${k}: ${v}`).join("\n") : "",
  }
}
