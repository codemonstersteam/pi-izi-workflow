// MODULE_CONTRACT: T5 — РЕШЕНИЕ ПРИНЯТО ПО КАЖДОМУ МОДУЛЮ ПОРЦИИ И ТОЛЬКО ПО НИМ
// Purpose:    одно решение: полон ли ответ роли по своей порции — шесть полей на модуль, ни одного
//             чужого модуля.
// io:         none
// EXTERNAL_DEPENDENCY: steps/plan/tree/tree.mjs::IO_KINDS — словарь видов io.
// Invariants: свойство ПОРЦИИ.
// Interface:  T5
import { IO_KINDS } from "../tree.mjs"

// FUNCTION_CONTRACT: T5 — полнота решения по порции
//   Input:        { modules — разобранные модули ответа; said — их пути; mine — пути порции }
//   Dependencies: IO_KINDS
//   Antecedent:   состав порции известен. mine пуст — правило МОЛЧИТ о составе (но не о полях):
//                 не зная порции, оно объявило бы чужим каждый модуль.
//   Consequent:   success: []; failure: блокеры с ОБРАЗЦОМ строки, которую надо написать
//   Purity:       pure
//   Interface:    T5({ modules, said, mine }) -> string[]
export function T5({ modules = [], said = [], mine = [] } = {}) {
  const B = []
  if (mine.length) {
    const lost = mine.filter((p) => !said.includes(p))
    if (lost.length) B.push(`T5 нет решения по модулям: ${lost.join(", ")} — у каждого модуля порции свой <module path="…">`)
    const alien = said.filter((p) => !mine.includes(p))
    if (alien.length) B.push(`T5 решены модули не из этой порции: ${alien.join(", ")} — их решает свой вызов; соседа читают в блоке NEIGHBOURS, но <module> по нему не пишут`)
  }
  for (const m of modules) {
    if (!m.hides) B.push(`T5 у модуля ${m.path} пуст <hides> — назови ОДНО решение, которое он прячет: «как глоссарий хранится: коллекция, версионирование, где проверяется ключ»`)
    if (!IO_KINDS.includes(m.io)) B.push(`T5 у модуля ${m.path} io="${m.io}" — слово вне словаря; поставь одно из: ${IO_KINDS.join(" · ")}`)
    if (!m.twin) B.push(`T5 у модуля ${m.path} не назван образец — выбери ОДИН путь из candidates и впиши его в <twin path="…">: по нему исполнитель узнаёт базовый класс, аннотации и стиль`)
    if (!m.contract.sig) B.push(`T5 у модуля ${m.path} пуста <sig> — выпиши объявление так, как его напишет исполнитель: «public interface IGlossaryStore extends IResourceStore&lt;Glossary&gt;»`)
    if (!m.contract.pre) B.push(`T5 у модуля ${m.path} пуст <pre> — что обязано быть верным на входе; предусловия нет — так и напиши: «нет — это объявление»`)
    if (!m.contract.post) B.push(`T5 у модуля ${m.path} пуст <post> — что он гарантирует, со ссылкой на шаг требования: «create → id и version 1 (UC2/3)»`)
  }
  return B
}
