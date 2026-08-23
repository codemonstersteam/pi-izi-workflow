// MODULE_CONTRACT: order — НАРЯД ВОРОТ: первый заход и ПОЧИНКА, и это разные наряды
// Purpose:    одно решение спрятано здесь: что роль видит. На первом заходе — таблицу действий,
//             таблицу попаданий и заказ; на починке — конкретную задачу и ровно те источники, без
//             которых названную находку не закрыть. Не всё подряд: лишний блок это середина наряда,
//             которую слабая модель читает по диагонали (docs/plan-design.md §1).
// io:         fs (шаблоны читаются module-relative — они часть модуля; таблица действий и ответы
//             оператора читаются от cwd ПРОГОНА)
// EXTERNAL_DEPENDENCY: order.gate.tpl и order.fix.tpl рядом; steps/brd/hits/hits.mjs — таблица попаданий
//             (`candidatesOf` → `hitsOf` → `tableOf`, 0,56 с и 0 токенов); core/form.mjs::BRD_FORM —
//             сколько якорей; steps/plan/repair.mjs::repairTask — находки с адресом; judge/T1.mjs и
//             judge/T1.mjs — словарь вердиктов едет в `check:` ПОДСТАНОВКОЙ,
//             а не пересказом. Отсутствие модуля читается как ошибка импорта на сборке наряда.
// Invariants: ТОТАЛЕН. Слот без данных — ОТКАЗ, а не пустота: наряд с дырой заставляет роль выдумывать.
// Interface:  orderText
import { readFileSync } from "node:fs"
import { BRD_FORM } from "../../../core/form.mjs"
import { repairTask } from "../../plan/repair.mjs"
import { readAt } from "../cut.mjs"
import { candidatesOf, hitsOf, tableOf } from "../hits/hits.mjs"
import { TASK, ANSWERS, NORMALIZED, STAGED } from "../paths.mjs"
import { VERDICTS } from "./judge/T1.mjs"

// ЧЕК — ЭТО ПРАВИЛА ГАРДРЕЙЛА, ПОДСТАВЛЕННЫЕ ИЗ НИХ САМИХ. Словарь вердиктов и коридор стоят в
// коде правил (`judge/T1.mjs`); здесь они ЦИТИРУЮТСЯ, а не переписываются: два
// текста одного требования разъезжаются, и разъехались однажды ценой целого прогона
// (core/form.mjs, «Why a registry rather than prose»).
const CHECK = [
  `T1 verdict is one of: ${VERDICTS.join(" · ")}`,
  "T2 an R line is a CONSEQUENCE for this repository, not a sentence of the request copied",
  "T3 every thing your R lines CREATE stands in subjects[] — its count is zero, and that is expected",
  "T4 analogue is a word with a NON-ZERO count in the hit table, or `none — <why>`",
].join(" · ")

// БЛОКИ ИСТОЧНИКОВ ПРИЕЗЖАЮТ ПО КЛАССАМ НАХОДОК, а не всегда. Находке «вердикт вне словаря» не нужны
// ни таблица действий, ни таблица попаданий: закрыть её можно одним словом, и всё остальное в наряде
// только отодвигает это слово.
const SOURCE_FOR = Object.freeze({
  invalid: [],                          // роль вернула прозу — данные те же, что были; вопрос в форме
  "invalid-verdict": [],                // одно слово из трёх, источник не нужен
  "restated-request": ["ROWS"],         // следствие пишется ПО таблице действий
  "missing-anchor": ["HITS"],
  "invalid-analogue": ["HITS"],
})

const BLOCK = Object.freeze({
  ROWS: (data) => `
$START_ROWS_DOCUMENT
path: ${NORMALIZED}
ТАБЛИЦА ДЕЙСТВИЙ — заказ, переведённый на язык кода: строка на требование, четыре колонки
\`<verb> | <object> | <instrument> | <values>\`. Следствие пишется ПО НЕЙ: что изменится в
репозитории, если это сделать.
$START_ROWS_CONTENT
${data.rows}
$END_ROWS_CONTENT
$END_ROWS_DOCUMENT
`,
  HITS: (data) => `
$START_HITS_DOCUMENT
path: посчитано скриптом по ${data.files} файлам этого репозитория, 0 токенов
ТАБЛИЦА ПОПАДАНИЙ — сколько файлов упоминает слово и насколько оно редкое. Якорь и аналог
выбираются ИЗ НЕЁ. Ноль у создаваемой вещи — норма: её ещё нет, в этом и работа.
$START_HITS_CONTENT
${data.hits}
$END_HITS_CONTENT
$END_HITS_DOCUMENT
`,
})

// FUNCTION_CONTRACT: hitTable — таблица попаданий для наряда
//   Input:        state; { rows — таблица действий; hits — готовая строка таблицы, если её посчитал
//                 вызывающий; files — знаменатель к ней }
//   Dependencies: candidatesOf, hitsOf, tableOf (steps/brd/hits/hits.mjs)
//   Antecedent:   таблица действий непуста — кандидаты берутся ИЗ НЕЁ, а не из сырого заказа: по
//                 русскому TASK.md слово `export` в кандидаты не попадает вовсе, по таблице —
//                 попадает и даёт 92 файла (`steps/brd/normalize-concept-research.md`, глава 4)
//   Consequent:   success: { hits — строки «слово · files N · weight W», files — сколько просмотрено }
//   Purity:       io (fs — обход дерева прогона)
function hitTable(state, { rows, hits, files }) {
  if (hits) return { hits: String(hits), files: Number(files) || 0 }
  const r = hitsOf(state.cwd, candidatesOf(rows))
  return { hits: tableOf(r), files: r.files }
}

// FUNCTION_CONTRACT: orderText — наряд одного захода
//   Input:        state; { rows — таблица действий подшага 2A (по умолчанию читается с диска);
//                 hits/files — таблица попаданий, если её уже посчитали; previous — прошлый ответ
//                 роли; feedback — блокеры вердикта; classes — КЛАССЫ находок }
//   Dependencies: hitTable, repairTask, readAt, BLOCK, CHECK
//   Antecedent:   таблица действий есть (подшаг 2A закрыт); починка требует непустого feedback
//   Consequent:   success: { text, staging, fix }; failure: { why } при незаполненном слоте
//   Purity:       io (fs)
export function orderText(state, { rows = "", hits = "", files = 0, previous = "", feedback = "", classes = [] } = {}) {
  const table = rows || readAt(state.cwd, NORMALIZED)
  if (!String(table).trim()) {
    return { why: `${NORMALIZED} пуст или не существует — ворота судят ТАБЛИЦУ ДЕЙСТВИЙ, а не сырой заказ: подшаг нормализации не закрыт` }
  }
  const hit = hitTable(state, { rows: table, hits, files })
  const data = { rows: table, hits: hit.hits, files: String(hit.files) }

  // Починка опознаётся по НАЛИЧИЮ находок, а не по номеру круга: круг мог вырасти от обрыва связи,
  // на который чинить нечего.
  const fix = Boolean(feedback)
  const slots = fix
    ? (() => {
        const t = repairTask(feedback)
        const want = [...new Set(classes.flatMap((c) => SOURCE_FOR[c] || []))]
        return {
          TASKLIST: t.lines.join("\n"), COUNT: String(t.count),
          PREVIOUS: previous, STAGING: STAGED, CHECK,
          SOURCES: want.map((k) => BLOCK[k](data)).join(""),
        }
      })()
    : {
        // ПЕРВЫЙ ЗАХОД НЕ НЕСЁТ НИ `PREVIOUS`, НИ `FEEDBACK`. Их место — наряд ПОЧИНКИ, и только он:
        // раздел, который нечем наполнить, из наряда убирается, а не заполняется заглушкой.
        TASK: readAt(state.cwd, TASK),
        ROWS: data.rows, HITS: data.hits, FILES: data.files,
        ANSWERS: readAt(state.cwd, ANSWERS) || "(no operator answers yet)",
        SUBJECTS_MIN: String(BRD_FORM.subjectsMin), SUBJECTS_MAX: String(BRD_FORM.subjectsMax),
        STAGING: STAGED, CHECK,
      }

  const tpl = readFileSync(new URL(fix ? "./order.fix.tpl" : "./order.gate.tpl", import.meta.url), "utf8")
  let text = tpl
  for (const [k, v] of Object.entries(slots)) text = text.split(`{${k}}`).join(v)
  const left = [...text.matchAll(/\{([A-Z_]+)\}/g)].map((m) => m[1])
  if (left.length) return { why: `в наряде шага brd остались незаполненные слоты: ${[...new Set(left)].join(", ")} — данные не доехали, и роль будет выдумывать` }
  return { text, staging: STAGED, fix }
}
