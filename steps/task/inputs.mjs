// MODULE_CONTRACT: inputs — СУД ВХОДА шага 1
// Purpose:    одно решение: положил ли оператор вход конвейера.
// io:         fs
// Invariants: ТОТАЛЕН. Отказ несёт КЛАСС и текст: класс — то, по чему его находит сценарий и шов,
//             текст — то, что читает человек. Безымянный отказ нельзя ни адресовать, ни сосчитать.
// Interface:  CLASSES, inputs
import { existsSync } from "node:fs"
import { join } from "node:path"
import { TASK } from "./paths.mjs"

// Классы отказа ЭТОГО подмодуля. Объявлены здесь и только здесь: по ним шов сверяет, что на каждую
// ветвь есть сценарий компонентного теста (steps/task/component/task.component.test.mjs).
export const CLASSES = Object.freeze(["no-task"])

// FUNCTION_CONTRACT: inputs — годен ли вход шага 1
//   Input:        state
//   Antecedent:   — (тотален)
//   Consequent:   success: null — вход годен
//                 failure: { cls, why } — класс отказа и его текст
//   Purity:       io (fs)
export function inputs(state) {
  if (existsSync(join(state.cwd, TASK))) return null
  return {
    cls: "no-task",
    why: `${TASK} не существует — вход конвейера кладёт оператор, и пустая строка вместо него стала бы требованием ни о чём`,
  }
}
