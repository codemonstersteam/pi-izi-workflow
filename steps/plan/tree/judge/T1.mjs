// MODULE_CONTRACT: T1 — СОСТАВ дерева: ровно те модули, которых требование касается
// Purpose:    одно решение: совпадает ли множество модулей дерева с множеством «дельты ∪ узлы
//             сценариев» требования. Свойство ЦЕЛОГО: порция состава не видит.
// io:         none
// EXTERNAL_DEPENDENCY: steps/plan/tree/tree.mjs::modulesOfChange — что именно требование трогает.
// Invariants: судья не чинит и не дополняет; он называет ОБЕ стороны расхождения.
// Interface:  T1
import { modulesOfChange } from "../tree.mjs"

// FUNCTION_CONTRACT: T1 — состав дерева против состава требования
//   Input:        { said — пути модулей дерева; frd — разобранное требование }
//   Dependencies: modulesOfChange
//   Antecedent:   frd разобран и НЕПУСТ. Требования нет — правило МОЛЧИТ: сказать «в дереве лишние
//                 модули», не зная, что трогает требование, значит выдать тупиковый блокер.
//   Consequent:   success: [] — состав совпал
//                 failure: блокеры, каждый называет потерянные ИЛИ лишние пути поимённо
//   Purity:       pure
//   Interface:    T1({ said, frd }) -> string[]
export function T1({ said = [], frd = {} } = {}) {
  const want = [...modulesOfChange({ frd }).keys()]
  if (!want.length) return []                       // молчание: операнда нет
  const B = []
  const lost = want.filter((p) => !said.includes(p))
  const extra = said.filter((p) => !want.includes(p))
  if (lost.length) B.push(`T1 состав: требование трогает модули, которых в дереве нет: ${lost.join(", ")} — на каждую дельту и каждый узел сценария нужен свой <module path="…">`)
  if (extra.length) B.push(`T1 состав: в дереве есть модули, которых требование не трогает: ${extra.join(", ")} — убери их либо впиши узел в <scenario nodes> требования`)
  return B
}
