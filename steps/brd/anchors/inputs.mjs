// MODULE_CONTRACT: inputs — СУД ВХОДА подшага 2C
// Purpose:    одно решение: есть ли из чего выбирать аналог. Подшаг судит ТАБЛИЦУ ДЕЙСТВИЙ подшага
//             2A, а не сырой заказ: из её колонок посчитаны кандидаты в якоря, её строки скрипт
//             копирует в `R1..Rn`, и её же слова роль читает, называя образец.
// io:         fs
// EXTERNAL_DEPENDENCY: ext/state.mjs::sha1of — тот же отпечаток, который кладёт подшаг 2A;
//             steps/brd/normalize/normalize.mjs::parseRows — как читается таблица.
// Invariants: ТОТАЛЕН. Отказ несёт КЛАСС и текст.
// Interface:  CLASSES, inputs
//
// ЗАКАЗ ЗДЕСЬ НЕ СУДИТСЯ ВТОРОЙ РАЗ, и это не пропуск. `TASK.md` и ключ задачи судит подшаг 2A
// (`steps/brd/inputs.mjs`), и отпечаток таблицы в `at.normalized` — доказательство, что он это
// сделал: таблицы не существует иначе как из зелёного вердикта 2A. Второй текст того же правила
// разъехался бы молча (standards/code.md, ограничение 1).
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { sha1of } from "../../../ext/state.mjs"
import { parseRows } from "../normalize/normalize.mjs"
import { NORMALIZED } from "../paths.mjs"

export const CLASSES = Object.freeze(["no-normalized", "unreadable-normalized", "normalized-changed"])

// FUNCTION_CONTRACT: inputs — годен ли вход подшага 2C
//   Input:        state
//   Dependencies: sha1of, parseRows
//   Antecedent:   — (тотальна)
//   Consequent:   success: null; failure: { cls, why } — why называет ФАЙЛ и того, кто его пишет
//   Purity:       io (fs)
//   BUG_FIX_CONTEXT: «подшаг 2A закрыт» само по себе не доказывает НИЧЕГО о содержимом таблицы:
//                 между прогонами её правят руками, и артефакт собирался бы по документу, которого
//                 больше нет. Поэтому здесь сверяется отпечаток, а не отметка о закрытии.
export function inputs(state) {
  const abs = join(state.cwd, NORMALIZED)
  if (!existsSync(abs)) {
    return { cls: "no-normalized", why: `${NORMALIZED} не существует — якоря собираются по таблице действий, а её пишет подшаг brd/normalize: он не закрыт` }
  }
  const text = readFileSync(abs, "utf8")
  if (!parseRows(text).length) {
    return { cls: "unreadable-normalized", why: `${NORMALIZED} не содержит ни одной строки таблицы «<verb> | <object> | <instrument> | <values>» — ни R-строк, ни кандидатов в якоря из неё не выйдет: переиграй brd/normalize` }
  }
  const known = state.at && state.at.normalized
  if (known && known.sha1 !== sha1of(text)) {
    return { cls: "normalized-changed", why: `${NORMALIZED} изменился после того, как его продвинул brd/normalize — артефакт нельзя собирать по документу, которого больше нет: переиграй brd/normalize` }
  }
  return null
}
