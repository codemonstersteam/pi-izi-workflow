// MODULE_CONTRACT: answers.mjs — the operator's accumulated answers as VALUES, not as file text
// Purpose:      one decision — what in the answers file is a FACT and what is the role's own text.
//               The format `- вопрос: … / ответ: …` is known to one module: whoever writes it and
//               whoever judges numbers against it take it from here instead of recalling it
// io:           none
// Invariants:   the question and the answer are separated by machine, not by eye; the order of the
//               entries is preserved
// Interface:    answerEntry(raw) -> string
//               newAnswers(text) -> Result<Answer[], "malformed">
//               looksLikeTemplate(text) -> boolean
//
// WHY THE SEPARATION. Run run-5 (finding F17): the role asked "response cap — 20 by default
// (alternatives: 50, 100)?", the operator answered "20", and the criterion came back as "20 records
// by default, 100 maximum". The `invented-default` rule stayed silent, because it compared numbers
// against the WHOLE FILE — and in that file, right beside the answer, sits the text of the question
// itself with its list of alternatives. The role's own question became its source of facts.
//
// The source of a fact is `ответ:` alone. The `вопрос:` line was written by the role, and the numbers
// in it have exactly the status of numbers in its head.
//
// The two field names stay Russian on purpose: they are what the OPERATOR reads and writes in
// .agent/answers.md, which standards/code.md §7 keeps in Russian.

import { ok, err } from "./result.mjs"

// FUNCTION_CONTRACT: answerEntry — one answer's entry in the accumulating file
//   Input:        raw — { question, text }
//   Dependencies: —
//   Antecedent:   question and text are non-empty strings with no newlines: each field is one line,
//                 otherwise the parse loses the boundary between entries
//   Consequent:   success: two lines shaped `- вопрос: …\n  ответ: …\n`
//                 failure: none — total; the caller validates its input, because the caller is the
//                          one holding a diagnosis for the operator
export function answerEntry({ question, text }) {
  return `- вопрос: ${question}\n  ответ: ${text}\n`
}

// FUNCTION_CONTRACT: newAnswers — the accumulated answers as a list of values
//   Input:        text — the contents of `.agent/answers.md`; empty means "no answers yet"
//   Dependencies: —
//   Antecedent:   every entry is a pair of lines, `- вопрос: …` then `  ответ: …`, in that order
//   Consequent:   success: an array of `{ question, text }` in file order; an empty file → an empty
//                          list (NOT a refusal: the first exchange happens with no answers)
//                 failure: "malformed" — a question with no answer or an answer with no question: a
//                          pair that lost half of itself is neither a fact nor a question
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

// FUNCTION_CONTRACT: looksLikeTemplate — an answer indistinguishable from a template copied verbatim
//   Input:        text — a candidate for the operator's answer; type unconstrained
//   Dependencies: —
//   Antecedent:   any value — coerced with String(text || "")
//   Consequent:   success: true when the trimmed text is entirely of the form `<…>` (a placeholder
//                          like `<ответ>` or `<operator answer>` — the shape of the role's example
//                          that reached the file verbatim, not a value); false otherwise, including
//                          for the empty string
//                 failure: none — total
// The same class of error as "the model copied the shape instead of the value": such a text silently
// becomes the source of a number for `fit:`, so both human entrances into answers.md — the CLI
// (bin/answer.mjs) and the tool call (ext/index.mjs::izi_answer) — check it with this ONE function
// rather than each with its own copy of the regex.
export function looksLikeTemplate(text) {
  return /^<.*>$/.test(String(text || "").trim())
}
