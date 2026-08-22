// MODULE_CONTRACT: order — НАРЯД шага 2: первый заход и ПОЧИНКА, и это разные наряды
// Purpose:    одно решение спрятано здесь: что роль видит на починке. Не то же, что на первом
//             заходе, и не всё подряд — только конкретная задача и то, чем её можно закрыть.
// io:         fs (шаблоны читаются module-relative — они часть модуля)
// EXTERNAL_DEPENDENCY: order.tpl и order.fix.tpl рядом; core/form.mjs::BRD_FORM — форма BRD едет
//             ДАННЫМИ, а не пересказом; steps/plan/repair.mjs::repairTask — находки с адресом.
// Invariants: ТОТАЛЕН. Слот без данных — ОТКАЗ, а не пустота.
// Interface:  orderText
import { readFileSync } from "node:fs"
import { BRD_FORM } from "../../core/form.mjs"
import { repairTask } from "../plan/repair.mjs"
import { readAt } from "./cut.mjs"
import { TASK, ANSWERS, STAGED } from "./paths.mjs"

const CHECK = "judge: нумерация R сплошная · у каждого R есть fit и verify · число в fit имеет источник · subjects[] в диапазоне · analogue назван · open-questions: 0 · fit на языке заказа"

// БЛОКИ ИСТОЧНИКОВ ПРИЕЗЖАЮТ ПО КЛАССАМ НАХОДОК, а не всегда.
// Наряд починки несёт КОНКРЕТНУЮ ЗАДАЧУ и ничего лишнего: находке «нет verify у R7» не нужны ни
// правило про якоря, ни правило про образец. Лишний блок — это середина наряда, которую слабая
// модель читает по диагонали (docs/plan-design.md §1), и он вытесняет то, ради чего наряд послан.
const SOURCE_FOR = Object.freeze({
  "invented-default": ["TASK", "ANSWERS"],   // число обязано найтись в задаче или в ответах
  "invalid-requirement": [],                  // формулировка, fit, verify — всё это уже в PREVIOUS
  "no-fit": [],
  "invalid-subjects": ["SUBJECTS"],
  "invalid-brd": ["FORM"],                    // analogue, open-questions — правила формы
  invalid: [],
})

const BLOCK = Object.freeze({
  TASK: (state) => `
$START_REQUEST_DOCUMENT
path: ${TASK}
СЫРОЙ ЗАКАЗ ОПЕРАТОРА — здесь ищется источник числа и язык, на котором пишется fit.
$START_REQUEST_CONTENT
${readAt(state.cwd, TASK)}
$END_REQUEST_CONTENT
$END_REQUEST_DOCUMENT
`,
  ANSWERS: (state) => `
$START_ANSWERS_DOCUMENT
path: ${ANSWERS}
ОТВЕТЫ ОПЕРАТОРА — второй законный источник числа. Источник это ЗНАЧЕНИЕ ответа, а не формулировка
вопроса: число, подсказанное вопросом, ничего не обосновывает.
$START_ANSWERS_CONTENT
${readAt(state.cwd, ANSWERS) || "(оператор ещё ни на что не отвечал)"}
$END_ANSWERS_CONTENT
$END_ANSWERS_DOCUMENT
`,
  SUBJECTS: () => `
$START_RULE
subjects[]: ${BRD_FORM.subjectsMin}..${BRD_FORM.subjectsMax} штук; каждый — ${BRD_FORM.subjectRule}
Якорь — СУЩЕСТВИТЕЛЬНОЕ из заказа, а не твоя оценка: шаг 3 грепает его по репозиторию, и оценка не
совпадёт ни с одним файлом.
$END_RULE
`,
  FORM: () => `
$START_RULE
analogue: ${BRD_FORM.analogueRule}. Образца нет — так и напиши: none — <почему>.
open-questions: ${BRD_FORM.openQuestions} — BRD не сдаётся с открытыми вопросами.
$END_RULE
`,
})

// FUNCTION_CONTRACT: orderText — наряд одного захода
//   Input:        state; { previous, feedback, classes } — classes это КЛАССЫ находок вердикта
//   Antecedent:   починка требует непустого feedback: наряд починки без находок бессмыслен
//   Consequent:   success: { text, staging, fix }; failure: { why } при незаполненном слоте
//   Purity:       io (fs)
export function orderText(state, { previous = "", feedback = "", classes = [] } = {}) {
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
          SOURCES: want.map((k) => BLOCK[k](state)).join(""),
        }
      })()
    : {
        // ПЕРВЫЙ ЗАХОД НЕ НЕСЁТ НИ `PREVIOUS`, НИ `FEEDBACK`.
        // Их место — наряд ПОЧИНКИ, и только он. Пустой блок «(первая попытка)» в первом заходе не
        // безобиден: он занимает место, приучает роль к разделу, которого сейчас нет по смыслу, и
        // удлиняет наряд ровно в той середине, которую слабая модель читает по диагонали
        // (docs/plan-design.md §1). Раздел, который нечем наполнить, из наряда убирается, а не
        // заполняется заглушкой.
        TASK: readAt(state.cwd, TASK),
        ANSWERS: readAt(state.cwd, ANSWERS) || "(no operator answers yet)",
        SUBJECT_RULE: BRD_FORM.subjectRule, SUBJECTS_MIN: String(BRD_FORM.subjectsMin),
        SUBJECTS_MAX: String(BRD_FORM.subjectsMax), ANALOGUE_RULE: BRD_FORM.analogueRule,
        STAGING: STAGED, CHECK,
      }

  const tpl = readFileSync(new URL(fix ? "./order.fix.tpl" : "./order.tpl", import.meta.url), "utf8")
  let text = tpl
  for (const [k, v] of Object.entries(slots)) text = text.split(`{${k}}`).join(v)
  const left = [...text.matchAll(/\{([A-Z_]+)\}/g)].map((m) => m[1])
  if (left.length) return { why: `в наряде шага brd остались незаполненные слоты: ${[...new Set(left)].join(", ")} — данные не доехали, и роль будет выдумывать` }
  return { text, staging: STAGED, fix }
}
