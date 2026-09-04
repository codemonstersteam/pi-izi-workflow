// MODULE_CONTRACT: answer-tool — инструмент solo_answer: канал ответа оператора из чата
// Purpose:    одно решение: как ответ, напечатанный оператором В ЧАТЕ, попадает на диск.
//             Чат-модель видит вопрос (followUp) и инструкцию; когда оператор отвечает
//             сообщением, она зовёт ЭТОТ инструмент. Ключ вопроса КОПИРУЕТ МАШИНА: полоса
//             пишет .agent/pending.json, инструмент читает вопросы и их НОМЕРА оттуда.
// io:         fs (pending.json, answers.md)
// Invariants: сверка по НОМЕРАМ; частичный вызов отвергается.
// Interface:  soloAnswer (pi tool: parameters TypeBox + execute)
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs"
import { join } from "node:path"
import { Type } from "typebox"
import { newAnswers, newExchange } from "./answers.ts"

const PENDING = ".agent/pending.json"
const ANSWERS = ".agent/answers.md"

// pi.registerTool ожидает parameters: Type.Object (TypeBox) и execute(toolCallId, params, …) —
// НЕ input/run (живой урок 27.08: input-схема → undefined.properties → инструмент мёртв)
export const soloAnswer = {
  name: "solo_answer",
  label: "solo: operator answered",
  description:
    "Record the operator's reply to the currently open solo questions in .agent/answers.md. " +
    "Read the open questions and their numbers from .agent/pending.json (field items), then call with ONE xml block " +
    "pairing every question with its answer: <exchange><question_1>…</question_1><answer_1>…</answer_1>…</exchange>. " +
    "Every question must get an answer — a partial call is refused. " +
    "Copy each question TEXT from pending.json verbatim. SHOW the returned table to the operator.",
  promptSnippet:
    "solo_answer({exchange}) — record the operator's reply as <exchange>…</exchange>; numbers and questions come from .agent/pending.json, not from you.",
  parameters: Type.Object(
    {
      exchange: Type.String({
        description:
          "One <exchange> block: <question_N>copy from pending.json</question_N><answer_N>operator's answer</answer_N> for every open question N.",
      }),
    },
    { additionalProperties: false },
  ),
  async execute(_id: string, params: { exchange: string }, _signal: any, _onUpdate: any, ctx: any) {
    const root = (ctx && ctx.cwd) || process.cwd()
    const pendingPath = join(root, PENDING)
    if (!existsSync(pendingPath)) throw new Error(".agent/pending.json is missing — no open solo questions")
    let pending: any
    try { pending = JSON.parse(readFileSync(pendingPath, "utf8")) } catch (e) { throw new Error(`pending.json is unreadable: ${e}`) }
    const items: { n: number; text: string }[] = (pending.items || []).map((x: any, i: number) => ({ n: x.n ?? i + 1, text: String(x.text || "") }))

    const parsed = newAnswers(
      String(params.exchange).includes("<exchange>") ? params.exchange : `<exchange>\n${params.exchange}\n</exchange>`,
    )
    if (!parsed.ok) throw new Error(`exchange parse: ${parsed.error.detail}`)
    const byNumber = new Map(parsed.value.map((a) => [a.n, a.text]))

    for (const it of items) if (!byNumber.has(it.n))
      throw new Error(`no answer for question ${it.n}: «${it.text.slice(0, 60)}» — a partial call is refused, answer ALL questions in one exchange`)
    for (const n of byNumber.keys()) if (!items.some((it) => it.n === n))
      throw new Error(`question ${n} is not open (pending.json has ${items.length} questions) — match numbers against .agent/pending.json`)

    const block = newExchange(items.map((it) => ({ n: it.n, question: it.text, text: byNumber.get(it.n)! })))
    if (!block.ok) throw new Error(block.error.detail)
    appendFileSync(join(root, ANSWERS), block.value)
    writeFileSync(pendingPath, JSON.stringify({ ...pending, answeredAt: new Date().toISOString() }, null, 1))

    const table = items.map((it) => `${it.n}. ${it.text.slice(0, 80)} → ${byNumber.get(it.n)!.slice(0, 80)}`).join("\n")
    return {
      content: [{ type: "text", text: `solo_answer: recorded ${items.length} answers. SHOW this breakdown to the operator:\n${table}` }],
      details: { answered: items.map((it) => it.n) },
    }
  },
}
