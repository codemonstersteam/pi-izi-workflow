// MODULE_CONTRACT: T4 — У ТИПА ОДИН ВЛАДЕЛЕЦ, И ИМЯ ПИШЕТСЯ ОДИНАКОВО
// Purpose:    одно решение: не разъехались ли собственность на тип и написание его имени.
// io:         none
// EXTERNAL_DEPENDENCY: steps/plan/tree/tree.mjs::baseOf — имя типа из пути файла.
// Invariants: свойство ЦЕЛОГО: два владельца видны только когда видны обе порции.
// Interface:  T4
import { baseOf } from "../tree.mjs"

// FUNCTION_CONTRACT: T4 — владелец типа и написание имени
//   Input:        { modules — все модули дерева; said — их пути }
//   Dependencies: baseOf
//   Antecedent:   дерево разобрано. Модулей нет — молчание.
//   Consequent:   success: []; failure: блокеры, называющие всех претендентов на тип поимённо
//   Purity:       pure
//   BUG_FIX_CONTEXT: «владелец называет свой тип» верно ТОЛЬКО для нового файла. У изменяемого
//                 объявление уже лежит в репозитории, а <sig> показывает ДЕЛЬТУ («+ private
//                 List&lt;URI&gt; glossaries»); требовать там имени класса значит требовать переписать
//                 файл целиком. Сухой прогон 21.08.2026 поймал это на эталонном пакете.
//   Interface:    T4({ modules, said }) -> string[]
export function T4({ modules = [], said = [] } = {}) {
  if (!modules.length) return []
  const B = []
  const owners = new Map()
  for (const m of modules) if (m.owns) owners.set(m.owns, [...(owners.get(m.owns) || []), m.path])
  for (const [type, who] of owners) {
    if (who.length > 1) B.push(`T4 тип «${type}» объявлен собственностью ${who.length} модулей: ${who.join(", ")} — владелец один; у остальных сними <owns type=""/> и впиши владельца в <needs>`)
  }
  for (const m of modules) {
    if (m.owns && m.delta === "Added" && !m.contract.sig.includes(m.owns)) {
      B.push(`T4 модуль ${m.path} владеет типом «${m.owns}», но его сигнатура этого типа не называет — либо впиши тип в <sig>, либо владелец не он`)
    }
  }
  // Сверяются только имена, УЖЕ ЕСТЬ в дереве: если сигнатура называет `Glossarystore`, а модуль
  // зовётся `GlossaryStore.java`, разъехалось имя, а не проект. Регистр значим — иначе правило
  // судит язык, а не текст.
  const bases = new Map(said.map((p) => [baseOf(p).toLowerCase(), baseOf(p)]))
  for (const m of modules) {
    for (const w of new Set(m.contract.sig.match(/\b[A-Z][A-Za-z0-9]{2,}\b/g) || [])) {
      const right = bases.get(w.toLowerCase())
      if (right && right !== w) B.push(`T4 сигнатура ${m.path} называет «${w}», а модуль дерева зовётся «${right}» — одно имя, одно написание`)
    }
  }
  return B
}
