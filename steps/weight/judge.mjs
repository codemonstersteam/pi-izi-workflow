// MODULE_CONTRACT: judge — гардрейл шага 7: вес из ЗАКРЫТОГО словаря
// Purpose:    одно решение: законно ли слово, которым назван вес изменения. Словарь закрыт, потому
//             что по этому слову дальше выбирается ветка, форма плана и глубина проверки.
// io:         none
// EXTERNAL_DEPENDENCY: steps/weight/weight.mjs::MODE_TABLE — таблица «форма дельты → вес». Словарь
//             ВЕСОВ выводится из её ЗНАЧЕНИЙ, а не из ключей: ключи это формы дельт (Added, Changed,
//             Removed, Fixed), а вес — то, во что они отображаются (patch, minor, major). Первая
//             версия судьи взяла ключи и отбила законный вес «major» как слово вне словаря.
// Invariants: ТОТАЛЕН. `Unknown` в таблице отсутствует НАМЕРЕННО: это не вес, а отказ, и строка для
//             него позволила бы прогону ехать дальше на «не смог классифицировать».
// Interface:  judgeMode, MODES
import { MODE_TABLE } from "./weight.mjs"

export const MODES = Object.freeze([...new Set(Object.values(MODE_TABLE))])

// FUNCTION_CONTRACT: judgeMode — вердикт по весу
//   Input:        { mode }
//   Antecedent:   — (тотален). Веса нет вовсе — правило МОЛЧИТ: судить нечего, а не «пусто это не слово».
//   Consequent:   success: []; failure: блокер, перечисляющий словарь
//   Purity:       pure
export function judgeMode({ mode = "" } = {}) {
  const w = String(mode || "").trim()
  if (!w) return []
  return MODES.includes(w) ? [] : [`вес «${w}» вне закрытого словаря — поставь одно из: ${MODES.join(" · ")}`]
}
