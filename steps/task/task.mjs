// MODULE_CONTRACT: task — правило входа конвейера: одна задача = один вход, ≤300 строк, непуст
// Purpose:    одно решение — предел «одна задача = один вход» (число строк, при котором TASK.md
//             обязан делиться человеком, а не ролью) объявлен и проверяется в ОДНОМ месте, как
//             ЧИСТОЕ правило. S11: раньше это была io-труба (steps/task/validate-task.mjs,
//             читавшая файл сама); расширение теперь читает байты (readText) и передаёт СЮДА текст
//             — правило не знает о диске вовсе, io-обвязку держит расширение (ext/index.mjs).
// io:         none
// Invariants: TASK_LINES_CAP не меняется исполнением; пустой текст (0 слов после trim) и текст
//             сверх предела — два разных отказа, оба различимы кодом ошибки
// Interface:  TASK_LINES_CAP — число, предел строк входа
//             checkTaskText(text) -> Result<{lines, words}, "empty" | "too-long">

import { ok, err } from "../../core/result.mjs"

// Одна задача = один вход. Больше — задача делится, и делит её оператор, а не роль.
export const TASK_LINES_CAP = 300

// FUNCTION_CONTRACT: checkTaskText — судит байты TASK.md одним пределом строк
//   Input:        text — сырой текст TASK.md
//   Dependencies: —
//   Antecedent:   любое значение — приводится к String(text || ""), диапазон не сужен: сама природа
//                 правила — судить текст, который может быть чем угодно, включая отсутствующий
//   Consequent:   success: { lines, words } — число строк и число слов текста
//                 failure: "empty" — 0 слов после trim, молчание не является требованием
//                          "too-long" — строк больше TASK_LINES_CAP, одна задача = один вход
export function checkTaskText(text) {
  const t = String(text || "")
  const lines = t.split("\n").length
  const words = t.trim().split(/\s+/).filter(Boolean).length
  if (!words) return err("empty", "пуст — молчание не является требованием")
  if (lines > TASK_LINES_CAP) {
    return err("too-long", `${lines} строк при пределе ${TASK_LINES_CAP} — одна задача = один вход, эту надо делить`)
  }
  return ok({ lines, words })
}
