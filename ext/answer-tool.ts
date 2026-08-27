// MODULE_CONTRACT: answer-tool — инструмент solo_answer: канал ответа оператора из чата
// Purpose:    одно решение: как ответ, напечатанный оператором В ЧАТЕ, попадает на диск.
//             Чат-модель видит вопрос (followUp) и инструкцию; когда оператор отвечает
//             сообщением, она зовёт ЭТОТ инструмент. Ключ вопроса КОПИРУЕТ МАШИНА: полоса
//             пишет .agent/pending.json, инструмент читает вопросы и их НОМЕРА оттуда —
//             модель не пересказывает вопрос (урок e82192db: чужой ответ под скопированным
//             вопросом).
// io:         fs (pending.json, answers.md)
// Invariants: сверка по НОМЕРАМ; частичный вызов отвергается; вопрос на диск ложится из
//             pending.json, не из пересказа модели.
// Interface:  soloAnswer (pi tool)
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs"
import { join } from "node:path"
import { newAnswers, newExchange } from "./answers.ts"

const PENDING = ".agent/pending.json"
const ANSWERS = ".agent/answers.md"

export const soloAnswer = {
  name: "solo_answer",
  description: "Record the operator's reply to the currently open solo questions in .agent/answers.md. Read the open questions and their numbers from .agent/pending.json (field items), then call with ONE xml block pairing every question with its answer: <exchange><question_1>…</question_1><answer_1>…</answer_1>…</exchange>. Every question must get an answer — a partial call is refused. Copy each question TEXT from pending.json verbatim. SHOW the returned table to the operator.",
  input: { type: "object", properties: { exchange: { type: "string" } }, required: ["exchange"] },
  run: async (input: { exchange: string }, ctx: any) => {
    const root = (ctx && ctx.cwd) || process.cwd()
    const pendingPath = join(root, PENDING)
    if (!existsSync(pendingPath)) throw new Error(".agent/pending.json отсутствует — нет открытых вопросов solo")
    let pending: any
    try { pending = JSON.parse(readFileSync(pendingPath, "utf8")) } catch (e) { throw new Error(`pending.json не читается: ${e}`) }
    const items: { n: number; text: string }[] = (pending.items || []).map((x: any, i: number) => ({ n: x.n ?? i + 1, text: String(x.text || "") }))

    const parsed = newAnswers(String(input.exchange).includes("<exchange>") ? input.exchange : `<exchange>\n${input.exchange}\n</exchange>`)
    if (!parsed.ok) throw new Error(`разбор exchange: ${parsed.error.detail}`)
    const byNumber = new Map(parsed.value.map((a) => [a.n, a.text]))

    for (const it of items) if (!byNumber.has(it.n))
      throw new Error(`нет ответа на вопрос ${it.n}: «${it.text.slice(0, 60)}» — частичный вызов отвергнут, ответь на ВСЕ вопросы одним exchange`)
    for (const n of byNumber.keys()) if (!items.some((it) => it.n === n))
      throw new Error(`вопрос ${n} не открыт (в pending.json вопросов: ${items.length}) — сверяй номера с .agent/pending.json`)

    const block = newExchange(items.map((it) => ({ n: it.n, question: it.text, text: byNumber.get(it.n)! })))
    if (!block.ok) throw new Error(block.error.detail)
    appendFileSync(join(root, ANSWERS), block.value)
    writeFileSync(pendingPath, JSON.stringify({ ...pending, answeredAt: new Date().toISOString() }, null, 1))

    const table = items.map((it) => `${it.n}. ${it.text.slice(0, 80)} → ${byNumber.get(it.n)!.slice(0, 80)}`).join("\n")
    return {
      content: [{ type: "text", text: `solo_answer: записано ответов ${items.length}. ПОКАЖИ оператору это разложение — если ответ лёг не под свой вопрос, он увидит здесь:\n${table}` }],
      details: { answered: items.map((it) => it.n) },
    }
  },
}
