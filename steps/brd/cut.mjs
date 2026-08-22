// MODULE_CONTRACT: cut — состав работы шага 2 и его ИСТОЧНИКИ
// Purpose:    одно решение: что считается источником числа в `fit`. Порция здесь одна — BRD не
//             режется, — а вот источники считать надо, и считать правильно.
// io:         fs
// EXTERNAL_DEPENDENCY: core/answers.mjs::newAnswers — грамматика .agent/answers.md.
// Invariants: ТОТАЛЕН.
// Interface:  sourcesOf, readAt
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { newAnswers } from "../../core/answers.mjs"
import { TASK, ANSWERS } from "./paths.mjs"

export const readAt = (cwd, rel) => (existsSync(join(cwd, rel)) ? readFileSync(join(cwd, rel), "utf8") : "")

// FUNCTION_CONTRACT: sourcesOf — откуда числу в `fit` браться законно
//   Input:        state
//   Dependencies: newAnswers
//   Antecedent:   — (тотальна)
//   Consequent:   success: [задача, …ЗНАЧЕНИЯ ответов оператора]
//   Purity:       io (fs)
//   BUG_FIX_CONTEXT: берутся ЗНАЧЕНИЯ ответов, а не тексты вопросов. Вопрос оператору часто сам
//                 содержит число («до 64 символов?»), и если считать источником его формулировку,
//                 роль сможет «обосновать» любое число, которое машина же ей и подсказала —
//                 то есть правило про invented-default отменит само себя (CLAUDE.md, ограничение 3).
export function sourcesOf(state) {
  const said = newAnswers(readAt(state.cwd, ANSWERS))
  const values = (said.ok ? said.value : []).map((a) => String(a.text || "")).filter(Boolean)
  return [readAt(state.cwd, TASK), ...values]
}
