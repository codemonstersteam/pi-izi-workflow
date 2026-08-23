// MODULE_CONTRACT: cut — состав работы подшага 2C и ОПЕРАНДЫ его гардрейла
// Purpose:    одно решение: что именно судья видит кроме ответа роли. Правила T3 и T4 судят
//             ЧИСЛАМИ — сколько файлов упоминает слово, — и без этих чисел они МОЛЧАТ. Значит
//             таблица попаданий считается на каждом суде, тем же скриптом, что собрал наряд.
// io:         fs
// EXTERNAL_DEPENDENCY: steps/brd/hits/hits.mjs — `candidatesOf` → `hitsOf` (0,56 с и 0 токенов на 1854
//             файлах); steps/brd/cut.mjs — источники чисел (задача и ЗНАЧЕНИЯ ответов оператора).
// Invariants: ТОТАЛЕН. Порция здесь одна — BRD не режется.
// Interface:  readAt, sourcesOf, rowsOf, hitsFor
//
// СЧИТАЕТСЯ ДВАЖДЫ ЗА КРУГ — В НАРЯДЕ И В СУДЕ, — И ЭТО НЕ РАСТОЧИТЕЛЬСТВО. Между ходами состояние
// документов не носит (standards/workflow-design.md, правило 6), а RPC между `next` и `fold` их не
// возит; альтернатива — таблица попаданий в состоянии, то есть документ шага в состоянии. Полсекунды
// грепа дешевле того, что этим правилом куплено.
import { candidatesOf, hitsOf } from "../hits/hits.mjs"
import { readAt, sourcesOf } from "../cut.mjs"
import { NORMALIZED } from "../paths.mjs"

export { readAt, sourcesOf }

// FUNCTION_CONTRACT: rowsOf — таблица действий подшага 2A, байты как есть
//   Input:        state
//   Antecedent:   — (тотальна: файла нет — пустая строка)
//   Consequent:   success: текст `.agent/normalized.md`
//   Purity:       io (fs)
export const rowsOf = (state) => readAt(state.cwd, NORMALIZED)

// FUNCTION_CONTRACT: hitsFor — таблица попаданий как ОПЕРАНД правил T3 и T4
//   Input:        state; rows — таблица действий (по умолчанию читается с диска)
//   Dependencies: candidatesOf, hitsOf, rowsOf
//   Antecedent:   — (тотальна; МОЛЧАНИЕ: таблицы действий нет — `{ hits: null, files: 0 }`, и
//                 правила про якоря промолчат, а не покраснеют по догадке)
//   Consequent:   success: { hits: { слово: сколько файлов } | null, files: сколько просмотрено }
//   Purity:       io (fs — обход дерева прогона)
export function hitsFor(state, rows = null) {
  const table = rows === null ? rowsOf(state) : rows
  if (!String(table).trim()) return { hits: null, files: 0 }
  const r = hitsOf(state.cwd, candidatesOf(table))
  return { hits: r.hits, files: r.files }
}
