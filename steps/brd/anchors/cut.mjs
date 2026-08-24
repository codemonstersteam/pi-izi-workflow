// MODULE_CONTRACT: cut — состав работы подшага 2C и ОПЕРАНДЫ его гардрейла
// Purpose:    одно решение: что подшаг видит кроме строки, которую написала роль. Правило T4 судит
//             ЧИСЛОМ — сколько файлов упоминает названное слово, — и без этого числа МОЛЧИТ; тем же
//             числом сборщик артефакта отбирает якоря. Значит таблица попаданий приезжает в суд тем
//             же путём, что в наряд: с диска.
// io:         fs
// EXTERNAL_DEPENDENCY: steps/brd/hits/hits.mjs::tableAt — таблица попаданий ПРОХОДА, лежащая в
//             `.agent/hits.txt`; steps/brd/cut.mjs — источники (задача и ЗНАЧЕНИЯ ответов
//             оператора): по их числу подшаг узнаёт, что оператор ответил на вопрос роли.
// Invariants: ТОТАЛЕН. Порция здесь одна — артефакт не режется.
// Interface:  readAt, sourcesOf, rowsOf, hitsFor
//
// СУД НЕ СЧИТАЕТ, А ЧИТАЕТ (тикет A01, backlog-anchors.md). Между ходами состояние документов не
// носит (standards/workflow-design.md, правило 6), и потому счёт звался дважды за круг — в наряде и
// в суде. Носит их ДИСК: наряд кладёт таблицу в `.agent/hits.txt`, суд берёт оттуда. Судить по
// числам, ПОСЧИТАННЫМ ЗАНОВО, — значит судить не то, что видела роль.
import { tableAt } from "../hits/hits.mjs"
import { readAt, sourcesOf } from "../cut.mjs"
import { NORMALIZED } from "../paths.mjs"

export { readAt, sourcesOf }

// FUNCTION_CONTRACT: rowsOf — таблица действий подшага 2A, байты как есть
//   Input:        state
//   Antecedent:   — (тотальна: файла нет — пустая строка)
//   Consequent:   success: текст `.agent/normalized.md`
//   Purity:       io (fs)
export const rowsOf = (state) => readAt(state.cwd, NORMALIZED)

// FUNCTION_CONTRACT: hitsFor — таблица попаданий как ОПЕРАНД правила T4 и сборщика якорей
//   Input:        state; rows — таблица действий (по умолчанию читается с диска)
//   Dependencies: tableAt, rowsOf
//   Antecedent:   — (тотальна; МОЛЧАНИЕ: таблицы действий нет — `{ hits: null }`, и правило про
//                 аналог промолчит, а не покраснеет по догадке)
//   Consequent:   success: { hits: { слово: сколько файлов } | null }
//   Purity:       io (fs — чтение `.agent/hits.txt`; счёт только если файла нет)
export function hitsFor(state, rows = null) {
  const table = rows === null ? rowsOf(state) : rows
  return { hits: tableAt(state.cwd, { rows: table }).hits }
}
