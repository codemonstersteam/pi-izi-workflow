// MODULE_CONTRACT: answers.mjs — накопленные ответы оператора как значения, а не как текст файла
// Purpose:      одно решение — что в файле ответов является ФАКТОМ, а что текстом роли. Формат
//               `- вопрос: … / ответ: …` знает один модуль: тот, кто пишет, и тот, кто судит по
//               нему числа, берут его отсюда и не воспроизводят по памяти
// io:           none
// Invariants:   вопрос и ответ разделены машинно, а не глазами; порядок записей сохраняется
// Interface:    answerEntry(raw) -> string
//               newAnswers(text) -> Result<Answer[], "malformed">
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
