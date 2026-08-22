// MODULE_CONTRACT: judge — гардрейл шага 2: требование измеримо и написано на языке заказа
// Purpose:    одно решение: годится ли BRD как ВХОД всего остального конвейера. Дальше по нему
//             грепают репозиторий, из него растут use case и по его числам судятся дельты.
// io:         none
// EXTERNAL_DEPENDENCY: steps/brd/brd.mjs::newBrd — сами правила; здесь только вердикт и тотальность.
// Invariants: ТОТАЛЕН. Ответ не похож на BRD — вердикт `invalid`, а не молчание.
// Interface:  CLASSES, judgeBrd
//
// ИСТОЧНИКИ СУДЯТСЯ ВМЕСТЕ С ДОКУМЕНТОМ. `newBrd(text, sources)` без источников молчит о числах:
// правилу «число в fit имеет источник» не с чем сверять, и зелёный вердикт не доказывает ничего.
// Источники — ЗАДАЧА и ЗНАЧЕНИЯ ответов оператора, никогда формулировки вопросов
// (CLAUDE.md, ограничение 3).
import { newBrd } from "./brd.mjs"

export const CLASSES = Object.freeze(["invalid", "invalid-brd", "invalid-requirement", "invalid-subjects", "no-fit", "invented-default"])

// FUNCTION_CONTRACT: judgeBrd — вердикт по BRD
//   Input:        { text — что записала роль; sources — [задача, …значения ответов оператора] }
//   Antecedent:   — (тотален)
//   Consequent:   success: [] ; failure: [{ cls, text }]
//   Purity:       pure
export function judgeBrd({ text = "", sources = [] } = {}) {
  const raw = String(text || "")
  if (!/^\s*R\d+\b/m.test(raw)) {
    return [{ cls: "invalid", text: `invalid: ответ не похож на BRD — в тексте нет ни одной строки вида «R1 …». Верни требования по схеме своего наряда, без пояснений вокруг. Начало ответа: «${raw.trim().slice(0, 120)}»` }]
  }
  const r = newBrd(raw, sources)
  if (r.ok) return []
  // Класс верхнего уровня один — `invalid-brd`, а внутри лежат блокеры разных правил, по строке на
  // находку. Наряд починки строится из НИХ, поэтому они и разбираются здесь построчно.
  return String(r.error.detail).split("\n").map((l) => l.trim()).filter(Boolean).map((text) => ({ cls: classOf(text), text }))
}

// FUNCTION_CONTRACT: classOf — какого правила эта находка
//   Antecedent:   — ; Consequent: класс из CLASSES; Purity: pure
function classOf(text) {
  if (/не встречается ни в задаче/.test(text)) return "invented-default"
  if (/fit-критери|нет способа проверки/.test(text)) return "no-fit"
  if (/subjects/.test(text)) return "invalid-subjects"
  if (/^R\d+/.test(text)) return "invalid-requirement"
  return "invalid-brd"
}
