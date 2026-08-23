// MODULE_CONTRACT: paths — где у шага 2 что лежит. io: none.
// Invariants: пути относительные — разрешаются от cwd ПРОГОНА, никогда от этого репозитория.
// Interface: TASK, ANSWERS, NORMALIZED, STAGED_NORMALIZED, OUT, STAGED, ANCHORS
export const TASK = "TASK.md"
export const ANSWERS = ".agent/answers.md"
// Нормализованная таблица подшага 2A. Живёт ДАЛЬШЕ шага: колонка `values` — это будущие `fit:`
// шага 6, а слова таблицы — кандидаты в якоря для 2B. Умрёт внутри одного хода модели — intake
// переспросит оператора о том, что он уже решил (на eddi это 14 принятых решений).
export const NORMALIZED = ".agent/normalized.md"
export const STAGED_NORMALIZED = ".agent/staging/normalized.md"
export const OUT = ".agent/brd.md"
export const STAGED = ".agent/staging/brd.md"
// Карта обхода подшага 2D: якоря и аналог, посчитанные грепом в файлы, пакеты и плотность. Пишется
// СКРИПТОМ сразу за продвижением brd.md — роль её не видит и видеть не может.
export const ANCHORS = ".agent/anchors.json"
