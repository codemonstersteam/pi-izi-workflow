// MODULE_CONTRACT: T1 — ВЕРДИКТ ВОРОТ: одно слово из трёх, четвёртого нет
// Purpose:    одно решение: вправе ли полоса ехать дальше. По этому слову шаги 3-11 либо работают,
//             либо останавливаются на входе, поэтому словарь ЗАКРЫТ: «не смог» это `unclear`, а не
//             отсутствие строки и не слово по вкусу модели.
// io:         none
// Invariants: ТОТАЛЕН. Артефакта нет вовсе — правило МОЛЧИТ: судить нечего.
// Interface:  VERDICTS, T1
export const VERDICTS = Object.freeze(["solvable", "unclear", "not-this-repo"])

// FUNCTION_CONTRACT: T1 — вердикт из закрытого словаря
//   Input:        { verdict — значение строки `verdict:` артефакта, null если строки нет;
//                   said — был ли артефакт вообще (текст роли непуст) }
//   Dependencies: VERDICTS
//   Antecedent:   артефакт есть. Нет артефакта (said=false) — МОЛЧАНИЕ, а не «вердикт пуст»
//   Consequent:   success: []; failure: один блокер, перечисляющий словарь и называющий строку,
//                 которую надо написать
//   Purity:       pure
//   Interface:    T1({ verdict, said }) -> string[]
export function T1({ verdict = null, said = true } = {}) {
  if (!said) return []
  const w = verdict === null ? "" : String(verdict).trim()
  if (!w) {
    return [`T1 verdict: строки нет — первой строкой артефакта стоит вердикт. Напиши одну из трёх: ${VERDICTS.map((v) => `verdict: ${v}`).join(" · ")}`]
  }
  if (VERDICTS.includes(w)) return []
  return [`T1 verdict: «${w}» — вне закрытого словаря. Поставь одно из трёх: ${VERDICTS.join(" · ")}; «не смог решить» это verdict: unclear, а не своё слово`]
}
