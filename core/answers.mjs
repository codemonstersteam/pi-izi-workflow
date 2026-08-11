// MODULE_CONTRACT: answers.mjs — the operator's accumulated answers as VALUES, not as file text
// Purpose:      one decision — what in the answers file is a FACT and what is the role's own text,
//               and in what shape the two travel to disk. The format `<exchange>` with a
//               `question_<n>`/`answer_<n>` pair per item is known to one module: whoever writes it
//               and whoever judges numbers against it take it from here instead of recalling it
// io:           none
// Invariants:   the question and the answer are separated by machine, not by eye; the order of the
//               entries is preserved; newExchange REFUSES a value the format cannot carry instead of
//               writing a file that parses into something else
// Interface:    newExchange(pairs) -> Result<string, "invalid-exchange">
//               newAnswers(text) -> Result<Answer[], "malformed">
//               looksLikeTemplate(text) -> boolean
//               stripOrdinal(n, text) -> string
//
// WHY THE SEPARATION. Run run-5 (finding F17): the role asked "response cap — 20 by default
// (alternatives: 50, 100)?", the operator answered "20", and the criterion came back as "20 records
// by default, 100 maximum". The `invented-default` rule stayed silent, because it compared numbers
// against the WHOLE FILE — and in that file, right beside the answer, sits the text of the question
// itself with its list of alternatives. The role's own question became its source of facts.
//
// The source of a fact is the ANSWER alone. The question was written by the role, and the numbers in
// it have exactly the status of numbers in its head.
//
// BUG_FIX_CONTEXT: live run 46edab60-39ee-4e1b-929f-08028ab011ff (step 6, a batch of six questions).
//   Previous: one entry was TWO LINES — `- вопрос: …` then `  ответ: …` — and the module's own
//             antecedent said so: "no newlines: each field is one line".
//   Problem:  S21 widened a question into a BATCH, and a batch is multi-line by construction. The
//             parser took line 1 as the whole key and silently dropped lines 2-6; askOperator then
//             compared that stump against the full subject, found no match, and re-asked an operator
//             who HAD already answered — the answer sat on disk, addressed to a key nobody looked up.
//             The antecedent forbidding this was prose: nothing checked it, so nothing turned red.
//   Fix:      the boundary is a CLOSING TAG, not a line break, so multi-line text is legal on both
//             sides; and the writer REFUSES text the format cannot carry (see newExchange).
//
// The tag names stay Russian-free and the field names Russian on purpose: `question_<n>`/`answer_<n>`
// are machine keys, while the file is read by the OPERATOR, which standards/code.md §7 keeps Russian.

import { ok, err } from "./result.mjs"

// The one border of this format, declared instead of encoded. Escaping every `<` and `&` would buy
// nothing: the scan below is non-greedy up to the closing tag, so ordinary angle brackets pass
// through untouched. The single text this format cannot carry is one that contains a CLOSING TAG of
// its own grammar — and that text is refused, loudly, rather than written and mis-parsed later.
const FORBIDDEN = /<\/(question|answer)_\d+>/

// FUNCTION_CONTRACT: newExchange — one exchange (a batch of questions and their answers) as file text
//   Input:        pairs — [{ n, question, text }], the numbering as the pending question carried it
//   Dependencies: FORBIDDEN
//   Antecedent:   a non-empty array; every n is a positive integer and occurs once; question and text
//                 are non-empty and carry no closing tag of this grammar. Newlines ARE allowed —
//                 that is the whole point of the shape
//   Consequent:   success: the text of one `<exchange>` block, ending with a newline
//                 failure: "invalid-exchange" — the detail names what the format cannot carry, so the
//                          caller (a CLI or a tool) can say it to the operator or to the model
//   Purity:       pure
export function newExchange(pairs) {
  if (!Array.isArray(pairs) || !pairs.length) return err("invalid-exchange", "нет ни одной пары вопрос-ответ")
  const seen = new Set()
  for (const p of pairs) {
    const n = p && p.n
    if (!Number.isInteger(n) || n < 1) return err("invalid-exchange", `номер «${n}» — ожидалось целое ≥ 1`)
    if (seen.has(n)) return err("invalid-exchange", `номер ${n} повторяется`)
    seen.add(n)
    if (!String(p.question || "").trim()) return err("invalid-exchange", `вопрос ${n} пуст`)
    if (!String(p.text || "").trim()) return err("invalid-exchange", `ответ на вопрос ${n} пуст`)
    if (FORBIDDEN.test(p.question) || FORBIDDEN.test(p.text)) {
      return err("invalid-exchange", `вопрос или ответ ${n} содержит закрывающий тег формата — такой текст answers.md не переживёт`)
    }
  }
  const body = pairs
    .map((p) => `  <question_${p.n}>${p.question}</question_${p.n}>\n  <answer_${p.n}>${p.text}</answer_${p.n}>`)
    .join("\n")
  return ok(`<exchange>\n${body}\n</exchange>\n`)
}

// FUNCTION_CONTRACT: newAnswers — the accumulated answers as a list of values
//   Input:        text — the contents of `.agent/answers.md`; empty means "no answers yet"
//   Dependencies: —
//   Antecedent:   any value; the format it RECOGNISES is `<question_<n>>…</question_<n>>` followed by
//                 `<answer_<n>>…</answer_<n>>` with the SAME n, in `<exchange>` blocks
//   Consequent:   success: [{ n, question, text }] in file order, across every exchange; an empty
//                          file → an empty list (NOT a refusal: the first exchange has no answers).
//                          `n` numbers a question WITHIN its exchange — the key a caller matches on
//                          is the QUESTION TEXT, which now round-trips verbatim, however many lines
//                          it takes
//                 failure: "malformed" — a question with no answer of the same number: a pair that
//                          lost half of itself is neither a fact nor a question
//   Purity:       pure
export function newAnswers(text) {
  const out = []
  // The pair is looked up INSIDE its own exchange: round 2 numbers its questions from 1 again, and a
  // search over the whole file would marry question_1 of one round to answer_1 of another.
  for (const block of String(text || "").matchAll(/<exchange>([\s\S]*?)<\/exchange>/g)) {
    const b = block[1]
    for (const m of b.matchAll(/<question_(\d+)>([\s\S]*?)<\/question_\1>/g)) {
      const n = Number(m[1])
      const a = b.match(new RegExp(`<answer_${n}>([\\s\\S]*?)</answer_${n}>`))
      if (!a) return err("malformed", `вопрос ${n} без ответа: «${m[2].trim().slice(0, 40)}»`)
      out.push(Object.freeze({ n, question: m[2].trim(), text: a[1].trim() }))
    }
  }
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

// ORDINAL — a leading integer, an optional separator, and text after it. The text is REQUIRED: an
// answer that is nothing but a number («10») is a value, never an address.
const ORDINAL = /^\s*(\d+)\s*[.)\-:—–]?\s+(\S[\s\S]*)$/

// FUNCTION_CONTRACT: stripOrdinal — the number an operator ADDRESSED an answer with is not part of it
//   Input:        n — the question's own number, as .agent/pending.json assigned it;
//                 text — the answer as the model split it out of the operator's reply
//   Dependencies: ORDINAL
//   Antecedent:   any values — n non-integer or text empty simply strips nothing
//   Consequent:   success: the answer with a LEADING ORDINAL EQUAL TO n removed, trimmed; every
//                          other text comes back trimmed and otherwise untouched
//                 failure: none — total
//   Purity:       pure
//
// BUG_FIX_CONTEXT: live run 9d126ef3 (the intake batch of three).
//   Previous: whatever the model put inside <answer_N> went to disk as the answer's VALUE.
//   Problem:  the operator replied to a batch in one line — «1 GET /fruits… 2 только к ответам…
//             3 пустой результат…» — and the split kept the addressing digit inside each value:
//             `<answer_2>2 только к ответам…</answer_2>`. The VALUES of answers are a legal source of
//             numbers for checkBrd and checkFrd (ext/index.mjs), so 2 and 3 became legal numbers for
//             a `fit:` nobody had uttered. Same class as F17 above — a fact's source turned out to be
//             the markup around it — only here the markup arrived from the ADDRESSING, not from the
//             question.
//   Fix:      the ordinal is stripped where the operator's numbering enters the pipeline, and ONLY
//             when it equals the number of the answer it prefixes.
//
// The border, named rather than implied. `«10»` survives (nothing follows the number). «10 записей
// максимум» as the answer to question 1 survives (10 ≠ 1) — the quantity is safe. «11 GET /fruits…»
// as the answer to question 1 survives too (11 ≠ 1): that one is two of the operator's messages glued
// together, and nothing here can tell the glue from a value — the operator sees it in the table the
// tool returns. The price: an answer to question 3 that honestly begins with «3 секунды» loses that
// word. That is the single false cut this rule can make, and it is cheaper than a number with no
// source passing a guardrail.
export function stripOrdinal(n, text) {
  const t = String(text || "")
  const m = t.match(ORDINAL)
  return m && Number(m[1]) === n ? m[2].trim() : t.trim()
}
