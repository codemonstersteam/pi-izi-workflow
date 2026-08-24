// MODULE_CONTRACT: paths — где у шага 2 что лежит. io: none.
// Invariants: пути относительные — разрешаются от cwd ПРОГОНА, никогда от этого репозитория.
// Interface: TASK, ANSWERS, NORMALIZED, STAGED_NORMALIZED, STAGED_CLEAN, HITS, STAGED_ANALOGUE, OUT,
//            STAGED, ANCHORS
export const TASK = "TASK.md"
export const ANSWERS = ".agent/answers.md"
// Нормализованная таблица подшага 2A. Живёт ДАЛЬШЕ шага: колонка `values` — это будущие `fit:`
// шага 6, а слова таблицы — кандидаты в якоря для 2B. Умрёт внутри одного хода модели — intake
// переспросит оператора о том, что он уже решил (на eddi это 14 принятых решений).
export const NORMALIZED = ".agent/normalized.md"
export const STAGED_NORMALIZED = ".agent/staging/normalized.md"
// Черновик ВТОРОГО прохода 2A — очищенной таблицы. Путь СВОЙ, отдельный от `STAGED_NORMALIZED`:
// проход чистки читает таблицу первого прохода и пишет свою. Свали их в один путь — и ответ чистки
// затрёт то, что ей же и подано на вход, молча (тот же довод, что у `STAGED_ANALOGUE`).
export const STAGED_CLEAN = ".agent/staging/normalized.clean.md"
// Таблица попаданий подшага 2B: слово · files N · weight W. Артефакт ПРОХОДА, а не временное
// значение внутри наряда: её пишет первый наряд подшага 2C, читают и наряд починки, и судья. До
// этого счёт звался дважды за круг (наряд и суд), и на диске не оставалось ответа на вопрос
// «почему выбраны эти якоря» — чтобы его увидеть, надо было пересчитать.
export const HITS = ".agent/hits.txt"
// Одна строка аналога — ВЕСЬ ответ модели на подшаге 2C. Файл отдельный от `STAGED`, потому что
// `.agent/brd.md` собирает СКРИПТ (assemble.mjs) из R-строк, этой строки и subjects[]: свали их в
// один путь — и ответ модели затрёт собранный артефакт либо наоборот, молча.
export const STAGED_ANALOGUE = ".agent/staging/analogue.txt"
export const OUT = ".agent/brd.md"
export const STAGED = ".agent/staging/brd.md"
// Карта обхода подшага 2D: якоря и аналог, посчитанные грепом в файлы, пакеты и плотность. Пишется
// СКРИПТОМ сразу за продвижением brd.md — роль её не видит и видеть не может.
export const ANCHORS = ".agent/anchors.json"
