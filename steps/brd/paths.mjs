// MODULE_CONTRACT: paths — где у шага 2 что лежит. io: none.
// Invariants: пути относительные — разрешаются от cwd ПРОГОНА, никогда от этого репозитория.
// Interface: TASK, ANSWERS, OUT, STAGED
export const TASK = "TASK.md"
export const ANSWERS = ".agent/answers.md"
export const OUT = ".agent/brd.md"
export const STAGED = ".agent/staging/brd.md"
