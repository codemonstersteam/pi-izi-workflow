// MODULE_CONTRACT: judge — гардрейл шага 1: одна задача — один вход
// Purpose:    одно решение: годится ли TASK.md как ВХОД конвейера. Правило одно и оно про размер:
//             задача длиннее трёхсот строк — это не задача, а пачка задач.
// io:         none
// EXTERNAL_DEPENDENCY: steps/task/task.mjs::checkTaskText — само правило; здесь только вердикт.
// Invariants: ТОТАЛЕН. Блокер несёт КЛАСС и текст — см. inputs.mjs, тот же договор.
// Interface:  CLASSES, judgeTask
import { checkTaskText } from "./task.mjs"

// Классы отказа гардрейла. Совпадают с классами ядра: судья их не выдумывает и не переименовывает.
export const CLASSES = Object.freeze(["empty", "too-long"])

// FUNCTION_CONTRACT: judgeTask — вердикт по тексту задачи
//   Input:        { text }
//   Dependencies: checkTaskText
//   Antecedent:   — (тотален)
//   Consequent:   success: [] ; failure: [{ cls, text }]
//   Purity:       pure
export function judgeTask({ text = "" } = {}) {
  const r = checkTaskText(String(text))
  return r.ok ? [] : [{ cls: r.error.cls, text: r.error.detail }]
}
