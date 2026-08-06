// MODULE_CONTRACT: answers.mjs — накопленные ответы оператора как значения, а не как текст файла
// Purpose:      одно решение — что в файле ответов является ФАКТОМ, а что текстом роли. Формат
//               `- вопрос: … / ответ: …` знает один модуль: тот, кто пишет, и тот, кто судит по
//               нему числа, берут его отсюда и не воспроизводят по памяти
// io:           none
// Invariants:   вопрос и ответ разделены машинно, а не глазами; порядок записей сохраняется
// Interface:    answerEntry(raw) -> string
//               newAnswers(text) -> Result<Answer[], "malformed">
//               looksLikeTemplate(text) -> boolean
//
// ЗАЧЕМ РАЗДЕЛЕНИЕ. Прогон run-5 (находка F17): роль спросила «response cap — 20 by default
// (alternatives: 50, 100)?», оператор ответил «20», а в критерий уехало «20 records by default,
// 100 maximum». Правило `invented-default` промолчало, потому что сверяло числа с ФАЙЛОМ целиком —
// а в файле, рядом с ответом, лежит текст самого вопроса со списком альтернатив. Собственный вопрос
// роли стал для неё источником фактов.
//
// Источник факта — только `ответ:`. Строка `вопрос:` написана ролью, и числа в ней имеют ровно тот
// же статус, что числа у неё в голове.

import { ok, err } from "./result.mjs"

// FUNCTION_CONTRACT: answerEntry — запись ответа в накопительный файл
//   Input:        raw — { question, text }
//   Dependencies: —
//   Antecedent:   question и text — непустые строки без переводов строки: запись однострочна в
//                 каждом поле, иначе разбор потеряет границу записи
//   Consequent:   success: две строки формата `- вопрос: …\n  ответ: …\n`
//                 failure: none — тотальна; проверку входа делает вызывающий, у которого есть
//                          диагноз для оператора
export function answerEntry({ question, text }) {
  return `- вопрос: ${question}\n  ответ: ${text}\n`
}

// FUNCTION_CONTRACT: newAnswers — накопленные ответы как список значений
//   Input:        text — содержимое `.agent/answers.md`; пустое значит «ответов ещё нет»
//   Dependencies: —
//   Antecedent:   каждая запись — пара строк `- вопрос: …` и `  ответ: …` в этом порядке
//   Consequent:   success: массив `{ question, text }` в порядке файла; пустой файл → пустой список
//                          (это НЕ отказ: первый обмен идёт без ответов)
//                 failure: "malformed" — вопрос без ответа либо ответ без вопроса: пара, у которой
//                          потерялась половина, не является ни фактом, ни вопросом
export function newAnswers(text) {
  const lines = String(text || "").split("\n")
  const out = []
  let pending = null
  for (const line of lines) {
    const q = /^- вопрос:\s*(.*)$/.exec(line)
    const a = /^\s+ответ:\s*(.*)$/.exec(line)
    if (q) {
      if (pending !== null) return err("malformed", `вопрос без ответа: «${pending.slice(0, 40)}»`)
      pending = q[1]
      continue
    }
    if (a) {
      if (pending === null) return err("malformed", `ответ без вопроса: «${a[1].slice(0, 40)}»`)
      out.push(Object.freeze({ question: pending, text: a[1] }))
      pending = null
    }
  }
  if (pending !== null) return err("malformed", `вопрос без ответа: «${pending.slice(0, 40)}»`)
  return ok(Object.freeze(out))
}

// FUNCTION_CONTRACT: looksLikeTemplate — текст ответа неотличим от шаблона, скопированного как есть
//   Input:        text — кандидат в ответ оператора; тип не ограничен
//   Dependencies: —
//   Antecedent:   любое значение — приводится к строке через String(text || "")
//   Consequent:   success: true, когда обрезанный текст целиком имеет форму `<…>` (плейсхолдер вида
//                          `<ответ>`, `<operator answer>` — форма примера роли, попавшая в файл
//                          дословно, не значение); false во всех прочих случаях, включая пустую
//                          строку
//                 failure: нет — тотальна
// Один и тот же класс ошибки, что «модель скопировала форму вместо значения»: такой текст молча
// становится источником числа для fit, поэтому оба входа человека в answers.md — CLI (bin/answer.mjs)
// и tool-вызов (ext/index.mjs::izi_answer) — проверяют его этой ОДНОЙ функцией, а не каждый своей
// копией регулярки.
export function looksLikeTemplate(text) {
  return /^<.*>$/.test(String(text || "").trim())
}
