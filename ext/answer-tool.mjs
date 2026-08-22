// MODULE_CONTRACT: answer-tool — тул `izi_answer`: канал ответа ОПЕРАТОРА
// Purpose:    одно решение спрятано здесь: как ответ человека попадает в прогон, не будучи
//             перепечатанным. Ключ вопроса КОПИРУЕТ МАШИНА: полоса пишет .agent/pending.json, тул
//             читает оттуда вопросы и их НОМЕРА и отвечает по номеру (CLAUDE.md, ограничение 4).
// io:         fs
// EXTERNAL_DEPENDENCY: pi.registerTool — регистрация в сессии pi (ext/index.mjs); core/answers.mjs —
//             грамматика .agent/answers.md, которую этот репозиторий и пишет, и читает.
// Invariants: тул НЕ является функцией песочницы — полосе он недоступен. Без него оператор
//             физически не может ответить, поэтому при схлопывании границы до трёх функций он
//             остался (тикет T20).
// Interface:  iziAnswer

import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { Type } from "typebox"
import { newExchange, newAnswers, stripOrdinal, looksLikeTemplate } from "../core/answers.mjs"

const at = (root, rel) => join(root, rel)
const readIfExists = (root, rel) => (existsSync(at(root, rel)) ? readFileSync(at(root, rel), "utf8") : "")
const runRoot = (context) => (context && context.run && context.run.cwd) || process.cwd()
const ANSWERS_PATH = ".agent/answers.md"
const PENDING_PATH = ".agent/pending.json"
const ASK_PATH = ".agent/ask.xml"

export const iziAnswer = {
  name: "izi_answer",
  label: "izi: operator answer",
  description: "Record the operator's reply to the currently open izi checkpoint question(s) in .agent/answers.md. Read the open questions and their numbers from .agent/pending.json (field items), then call with ONE xml block pairing every question with its answer: <exchange><question_1>…</question_1><answer_1>…</answer_1>…</exchange>. Every question must get an answer — a partial call is refused. SHOW the returned table to the operator: it says which answer landed under which question.",
  promptSnippet: "izi_answer({exchange}) — record the operator's reply as <exchange><question_N>…</question_N><answer_N>…</answer_N></exchange>; numbers and questions come from .agent/pending.json, not from you.",
  parameters: Type.Object({
    exchange: Type.String({
      description: "One <exchange> block: for every open question of .agent/pending.json a <question_N> with that question and an <answer_N> with the operator's reply to it, verbatim — not your paraphrase, not the alternatives the role offered. The value is the answer ITSELF, without the number the operator addressed it with: «1 GET /fruits» answering question 1 is <answer_1>GET /fruits</answer_1>.",
    }),
  }, { additionalProperties: false }),
  // ctx (5th arg) is pi's ExtensionContext (@earendil-works/pi-coding-agent) — this tool runs in the
  // INTERACTIVE session, which carries no WorkflowRunContext at all (that only exists inside the
  // workflow sandbox's registered functions, above). ctx.cwd is the session's own cwd — the same
  // project directory the operator launched `pi` in — so it is the correct stand-in anchor here;
  // process.cwd() is only the fallback if ctx is ever missing.
  async execute(_id, params, _signal, _onUpdate, ctx) {
    const root = (ctx && ctx.cwd) || process.cwd()
    if (!existsSync(at(root, PENDING_PATH))) {
      throw new Error("izi_answer: .agent/pending.json отсутствует — нет открытого вопроса izi, отвечать не на что")
    }
    let pending
    try {
      pending = JSON.parse(readFileSync(at(root, PENDING_PATH), "utf8"))
    } catch {
      throw new Error("izi_answer: .agent/pending.json повреждён — не JSON")
    }
    const items = Array.isArray(pending.items) && pending.items.length
      ? pending.items
      : [{ n: 1, text: pending.subject }]   // a pending written before items existed still answers
    if (!items.every((i) => i && typeof i.text === "string" && i.text)) {
      throw new Error("izi_answer: .agent/pending.json не несёт вопросов — писать в answers.md некуда")
    }

    // The block arrives as TEXT in this pipeline's own grammar and is read by this pipeline's own
    // parser — the model composes, the machine judges. What it is judged on is NUMBERS, never the
    // wording: the observed defect (live run e82192db) was a correctly copied question with somebody
    // else's answer under it, which no comparison of question texts would have caught, while such a
    // comparison would refuse an honest call over one stray space in a long Cyrillic line.
    const parsed = parsedAnswers(params.exchange)
    if (!parsed.ok) {
      throw new Error(`izi_answer: блок не разбирается — ${parsed.error.detail}. Форма: <exchange><question_1>…</question_1><answer_1>…</answer_1></exchange>`)
    }
    if (!parsed.value.length) {
      throw new Error("izi_answer: в блоке нет ни одной пары вопрос-ответ. Форма: <exchange><question_1>вопрос</question_1><answer_1>ответ</answer_1></exchange>, номера — из .agent/pending.json")
    }
    // Normalised HERE, once, before anything reads a value: the write below, the operator's table and
    // the checks in between must all see the same text. stripOrdinal drops the number the operator
    // ADDRESSED an answer with (live run 9d126ef3 — see its contract in core/answers.mjs); the value
    // is what the guardrails may take a number from, so the addressing must not survive into it.
    const byNumber = new Map(parsed.value.map((a) => [a.n, stripOrdinal(a.n, a.text)]))

    // Every open question must be answered, and every answer must belong to an open question. Both
    // directions matter: a stray number means the model answered something nobody asked, and a
    // missing one means the batch would close with a hole nobody would notice until step 7.
    const unknown = [...byNumber.keys()].filter((n) => !items.some((i) => i.n === n))
    if (unknown.length) {
      throw new Error(`izi_answer: номеров ${unknown.join(", ")} нет среди открытых вопросов (в .agent/pending.json их ${items.length}) — сверь номера с файлом`)
    }
    const missing = items.filter((i) => !String(byNumber.get(i.n) || "").trim()).map((i) => i.n)
    if (missing.length) {
      throw new Error(`izi_answer: нет ответов на ${missing.join(", ")} из ${items.length} — спроси оператора об оставшихся и вызови тул со ВСЕМИ ответами разом`)
    }
    const templated = items.filter((i) => looksLikeTemplate(byNumber.get(i.n))).map((i) => i.n)
    if (templated.length) {
      throw new Error(`izi_answer: ответ на ${templated.join(", ")} похож на шаблон-плейсхолдер (форма «<...>»), а не на ответ оператора`)
    }

    // The QUESTION written to disk is the one from pending.json, not the one the model retyped: the
    // file keeps the pipeline's own text, and the model's copy serves only the table below.
    const result = writeAnswer(root, items.map((i) => ({ n: i.n, question: i.text, text: byNumber.get(i.n) })))
    if (result.why) throw new Error(`izi_answer: ${result.why}`)

    // The table is the whole point of taking pairs instead of bare numbers: an answer glued to the
    // wrong question is invisible to any check and obvious to the operator in one line.
    const table = items.map((i) => `${i.n}. ${i.text}\n   → ${byNumber.get(i.n)}`).join("\n")
    const note = result.written ? "новая запись" : "уже была записана"
    return {
      content: [{ type: "text", text: `izi_answer: записано ответов ${items.length} (${note}, всего ${result.count} в .agent/answers.md). ПОКАЖИ оператору это разложение — если ответ лёг не под свой вопрос, он увидит здесь:\n${table}` }],
      details: { answered: items.map((i) => i.n), ...result },
    }
  },
}
