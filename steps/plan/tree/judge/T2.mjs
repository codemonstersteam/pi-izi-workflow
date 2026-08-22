// MODULE_CONTRACT: T2 — `needs` это АДРЕС, и адрес разрешается
// Purpose:    одно решение: можно ли по каждому <need> найти файл. «Без чего меня не написать» —
//             это путь, а не слово: по слову исполнитель ничего не откроет.
// io:         none
// EXTERNAL_DEPENDENCY: steps/plan/tree/tree.mjs::isPath — форма пути этого репозитория.
// Invariants: свойство ПОРЦИИ: адрес проверяется у модулей, которые эта порция решает.
// Interface:  T2
import { isPath } from "../tree.mjs"

// FUNCTION_CONTRACT: T2 — адреса в needs
//   Input:        { modules — разобранные модули порции; kin — пути модулей работы;
//                   known — пути, которые есть в репозитории }
//   Dependencies: isPath
//   Antecedent:   known известен. Карты репозитория нет — правило МОЛЧИТ о «такого файла нет»:
//                 не зная репозитория, оно отбило бы каждую ссылку на существующий файл.
//   Consequent:   success: []; failure: блокеры с образцом строки, которую надо написать
//   Purity:       pure
//   Interface:    T2({ modules, kin, known }) -> string[]
export function T2({ modules = [], kin = [], known = [] } = {}) {
  const B = []
  for (const m of modules) {
    for (const n of m.needs) {
      if (!isPath(n.path)) {
        B.push(`T2 в <needs> модуля ${m.path} стоит «${n.path}» — это не путь; напиши ПУТЬ файла: <need path="src/main/java/…/Glossary.java" why="параметр типа"/>`)
      } else if (known.length && !kin.includes(n.path) && !known.includes(n.path)) {
        B.push(`T2 модуль ${m.path} требует ${n.path} — такого файла нет ни среди модулей работы, ни в репозитории`)
      }
      if (isPath(n.path) && !n.why) {
        B.push(`T2 <need path="${n.path}"> модуля ${m.path} без why — скажи одной строкой, ЧТО оттуда нужно: why="параметр типа IResourceStore&lt;Glossary&gt;"`)
      }
    }
  }
  return B
}
