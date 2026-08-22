// MODULE_CONTRACT: cut — состав работы шага 1: КЛЮЧ задачи
// Purpose:    одно решение: откуда берётся ключ. Он объявляется строкой `task: DOS-535` в TASK.md
//             либо ответом оператора — и никогда не выискивается по тексту.
// io:         fs
// EXTERNAL_DEPENDENCY: steps/plan/plan.mjs — TASK_KEY (форма ключа) и KEY_QUESTION (текст вопроса,
//             байт в байт одинаковый между прогонами); core/answers.mjs — разбор ответов оператора.
// Invariants: ТОТАЛЕН.
// Interface:  keyOf, KEY_QUESTION
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { TASK_KEY, KEY_QUESTION } from "../plan/plan.mjs"
import { newAnswers } from "../../core/answers.mjs"
import { TASK, ANSWERS } from "./paths.mjs"

const readAt = (cwd, rel) => (existsSync(join(cwd, rel)) ? readFileSync(join(cwd, rel), "utf8") : "")

// FUNCTION_CONTRACT: keyOf — ключ задачи
//   Input:        state
//   Dependencies: parsedAnswers, TASK_KEY
//   Antecedent:   — (тотальна)
//   Consequent:   success: ключ либо "" — и тогда шаг спросит оператора
//   Purity:       io (fs)
//   BUG_FIX_CONTEXT: ключ ОБЪЯВЛЯЕТСЯ строкой `task: DOS-535`, а не ищется по всему тексту. Первая
//                 версия сканировала текст на что-нибудь похожее на ключ — и задача, упоминающая
//                 соседний тикет («как в DOS-100»), называла бы его именем и ветку, и каталог плана.
export function keyOf(state) {
  const said = newAnswers(readAt(state.cwd, ANSWERS))
  const hit = (said.ok ? said.value : []).find((a) => String(a.question || "").trim() === KEY_QUESTION.trim())
  const answered = String((hit && hit.text) || "").trim()
  if (TASK_KEY.test(answered)) return answered

  const declared = readAt(state.cwd, TASK).match(/^\s*task:\s*([A-Z]{2,20}-[0-9]{1,6})\s*$/m)
  return declared ? declared[1] : ""
}

export { KEY_QUESTION, readAt, TASK_KEY }
