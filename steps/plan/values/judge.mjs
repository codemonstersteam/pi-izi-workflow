// MODULE_CONTRACT: judge — гардрейл шага 9A: словарь значений ГРАНИЦЫ
// Purpose:    одно решение: годится ли словарь как перечень значений, ходящих через край системы.
// io:         none
// EXTERNAL_DEPENDENCY: steps/plan/values/values.mjs::checkValues — сами правила.
// Invariants: ТОТАЛЕН. Ответ не похож на словарь — вердикт invalid, а не молчание.
// Interface:  judgeValues
import { checkValues } from "./values.mjs"

// FUNCTION_CONTRACT: judgeValues — вердикт по словарю
//   Input:        { text — то, что записала роль; frd; ripple }
//   Antecedent:   — (тотален)
//   Consequent:   success: []; failure: блокеры
//   Purity:       pure
export function judgeValues({ text = "", frd = {}, ripple = "" } = {}) {
  const raw = String(text || "")
  if (!/<values\b/.test(raw)) {
    return [`invalid: ответ не похож на словарь — нет корня <values>. Верни ТОЛЬКО XML: <values grammar="2">…</values>, без пояснений вокруг. Начало ответа: «${raw.trim().slice(0, 120)}»`]
  }
  return checkValues({ staged: raw, frd, ripple })
}
