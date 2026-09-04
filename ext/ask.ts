// MODULE_CONTRACT: ask — вопрос оператору В ЧАТ, ответ — с диска
// Purpose:    одно решение: как текст вопроса доезжает до оператора. Хост не даёт скрипту
//             текстового ответа из чата (checkpoint — только Approve/Reject); шаблон
//             step9-rework: pending.json + инструмент реле + answers.md. Здесь: вопрос
//             печатается В ЧАТ (pi.sendMessage followUp, если pi доступен) И в файловый
//             канал (question.txt); ответ ждём на диске (answers.md) от любого канала.
// io:         fs (pending.json, question.txt, answer.txt, answers.md)
// Invariants: ответы ложатся ТОЛЬКО обменной грамматикой (answers.ts); вопрос в pending.json
//             пишется ДО доставки; таймаут возвращает пустые ответы — движок ПЕРЕСПРАШИВАЕТ.
// Interface:  ask (каталог-функция), setPi
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { newExchange, newAnswers } from "./answers.ts"

const ASK_TIMEOUT_MS = 30 * 60 * 1000
let piRef: any = null
export const setPi = (p: any) => { piRef = p }

export const ask = {
  description: "Ask the operator text questions. Each item is one question; the question is DELIVERED TO THE CHAT (follow-up message) and to .agent/question.txt; answers return as an array of strings once they land in .agent/answers.md (via the solo_answer tool or the answer.txt file loop). No chat-model tokens are spent by this function itself.",
  input: {
    type: "object",
    properties: { items: { type: "array", items: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } } },
    required: ["items"],
  },
  output: { type: "object", properties: { answers: { type: "array", items: { type: "string" } } } },
  run: async (input: any, ctx: any) => {
    const cwd = ctx?.run?.cwd || process.cwd()
    const dir = join(cwd, ".agent")
    mkdirSync(dir, { recursive: true })
    const items = (input.items || []).map((x: any) => String(x.text || "").trim()).filter(Boolean)
    const pending = { items: items.map((text: string, i: number) => ({ n: i + 1, text })), subject: "solo questions" }
    writeFileSync(join(dir, "pending.json"), JSON.stringify(pending, null, 1))

    // 1) ВОПРОС В ЧАТ — если pi доступен (followUp печатается в панель; чат-модель,
    //    увидев инструкцию, оформит ответ оператора инструментом solo_answer)
    // Одиночный вопрос — без нумерации (confirm не выглядит списком); файловый
    // канал остаётся нумерованным: collect() парсит строки «N. ответ».
    const chatText = items.length === 1
      ? ["🔒 ВОПРОС ОПЕРАТОРА (ответь СООБЩЕНИЕМ в чате):", items[0]].join("\n")
      : [
          "🔒 ВОПРОСЫ ОПЕРАТОРА (ответь СООБЩЕНИЕМ в чате, по номерам):",
          ...items.map((t: string, i: number) => `${i + 1}. ${t}`),
          "Форма ответа: «1. …» «2. …» — по одному на вопрос.",
        ].join("\n")
    try {
      piRef?.sendMessage?.({ customType: "workflow", content: chatText, display: true }, { deliverAs: "followUp", triggerTurn: true })
    } catch { /* чат недоступен — файловый канал сам по себе */ }

    // 2) ФАЙЛОВЫЙ КАНАЛ (работает всегда): question.txt + answer.txt
    appendFileSync(join(dir, "question.txt"), `[${new Date().toISOString()}]\n${items.map((t: string, i: number) => `${i + 1}. ${t}`).join("\n")}\nОтветь: echo "1. твой ответ" >> .agent/answer.txt\n\n`)
    console.log(`\n${chatText}\n`)

    // 3) ЖДЁМ ОТВЕТОВ на диске: answers.md (обмены) или answer.txt (нумерованные строки)
    const t0 = Date.now()
    for (;;) {
      const got = collect(dir, items)
      if (got) return { answers: got }
      if (Date.now() - t0 > ASK_TIMEOUT_MS) {
        console.log("\n⏰ Таймаут вопросов — пустой ответ (движок переспросит)")
        return { answers: items.map(() => "") }
      }
      await new Promise((r) => setTimeout(r, 2000))
    }
  },
}

// collect — ответы сошлись, если КАЖДЫЙ вопрос покрыт текстом (сверка по тексту вопроса)
function collect(dir: string, items: string[]): string[] | null {
  const md = existsSync(join(dir, "answers.md")) ? readFileSync(join(dir, "answers.md"), "utf8") : ""
  const r = newAnswers(md)
  const said = r.ok ? r.value : []
  // файловый канал: нумерованные строки answer.txt → дописать обменом (писатель один)
  const at = join(dir, "answer.txt")
  if (existsSync(at)) {
    const raw = readFileSync(at, "utf8")
    const pairs: { n: number; question: string; text: string }[] = []
    for (const m of raw.matchAll(/^\s*(\d+)[).]\s*(.+)$/gm)) {
      const n = Number(m[1])
      // Проверка по ТЕКСТУ вопроса, не по номеру: обмены прошлых раундов имеют
      // те же номера, но другие тексты — номер не может быть ключём (живой баг:
      // confirm «да» блокировался обменом №1 из фазы вопросов)
      if (items[n - 1] && !said.some((a) => a.question === items[n - 1])) pairs.push({ n, question: items[n - 1], text: m[2].trim() })
    }
    if (pairs.length) {
      const block = newExchange(pairs)
      if (block.ok) {
        appendFileSync(join(dir, "answers.md"), block.value)
        writeFileSync(at, raw.replace(new RegExp(`^\\s*\\d+[).].*$`, "gm"), "").trim() + (raw.trim() ? "\n" : ""))
        const again = newAnswers(readFileSync(join(dir, "answers.md"), "utf8"))
        if (again.ok) said.push(...again.value)
      }
    }
  }
  if (items.every((t) => said.some((a) => a.question === t && a.text))) {
    rmSync(join(dir, "pending.json"), { force: true })
    return items.map((t) => said.find((a) => a.question === t)!.text)
  }
  return null
}
