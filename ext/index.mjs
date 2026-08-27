// MODULE_CONTRACT: index — точка входа пакета solo: регистрация хост-функций и ask
// Purpose:    одно решение: ЧТО хост видит от пакета. Четыре каталог-функции (soloStart,
//             soloNext, soloFold — станционный движок; ask — вопрос оператору) и каталог ролей.
//             Inline-скрипт полосы живёт в команде /solo (ext/prompts/solo.md) и зовёт эти
//             функции как глобальные сандбокса.
// io:         fs (ask-фолбэк: question.txt/answer.txt; answers.md)
// EXTERNAL_DEPENDENCY: pi-extensible-workflows::registerWorkflowExtension — единственная;
//             стандарты запрещают иные зависимости конвейеру, а этот файл — контракт хоста.
// Invariants: функции ТОтальны (мусорный вход → именованный отказ, не бросок); пути читаются
//             против ctx.run.cwd ПРОГОНА, не этого пакета.
// Interface:  default(pi) — регистрация; используется и в тестах напрямую (импорт функций).
import { join } from "node:path"
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { registerWorkflowExtension } from "pi-extensible-workflows"
import { soloNext, soloFold, soloStart } from "./stations.mjs"
import { newExchange } from "./answers.mjs"

const ASK_TIMEOUT_MS = 30 * 60 * 1000

// T75 — ФАЙЛОВЫЙ ФОЛБЭК ask: включается сам, когда TUI-ветка недоступна (headless-раннер,
// фон без ui). Вопрос — нумерованной строкой в question.txt, ответ — строкой «N. …» в
// answer.txt; ответы ложатся в answers.md ОБМЕННОЙ грамматикой (answers.mjs — один писатель,
// один читатель; сырые строки никто не читает — урок вопросного цикла FRUIT-1).
async function fileAsk(cwd, seq, text) {
  const q = join(cwd, ".agent/question.txt")
  const a = join(cwd, ".agent/answer.txt")
  mkdirSync(join(cwd, ".agent"), { recursive: true })
  appendFileSync(q, `[${new Date().toISOString()}]\n${seq}. ${text}\nОтветь: echo "${seq}. твой ответ" >> .agent/answer.txt\n\n`)
  console.log(`\n🔒 ВОПРОС ${seq}: ${text}\nОтветь: echo "${seq}. твой ответ" >> .agent/answer.txt`)
  const t0 = Date.now()
  for (;;) {
    if (existsSync(a)) {
      const m = readFileSync(a, "utf8").match(new RegExp(`^\\s*${seq}[).]\\s*(.*)$`, "m"))
      if (m) {
        writeFileSync(a, readFileSync(a, "utf8").replace(m[0], "").replace(/^\s*[\r\n]+/, ""))
        return m[1].trim()
      }
    }
    if (Date.now() - t0 > ASK_TIMEOUT_MS) { console.log(`\n⏰ Таймаут вопроса ${seq} — пустой ответ`); return "" }
    await new Promise((r) => setTimeout(r, 2000))
  }
}

// ask — вопрос оператору БЕЗ чат-модели: TUI input в хост-процессе, фолбэк — файлы.
// Ответы дополнительно ложатся в .agent/answers.md обменами: наряды кругов несут их
// как {ANSWERED}, и это единственный источник ответов для всех потребителей.
const ask = {
  description: "Ask the operator text questions. Each item is one question; answers return as an array of strings, same order. TUI input per question when available, file loop otherwise — no chat model involved.",
  input: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } } }, required: ["items"] },
  output: { type: "object", properties: { answers: { type: "array", items: { type: "string" } } } },
  run: async (input, ctx) => {
    const answers = []
    const tui = ctx?.ui?.input?.bind(ctx.ui)
    let seq = 0
    for (const item of input.items || []) {
      const text = String(item.text || "").slice(0, 400)
      seq += 1
      const answer = tui ? await tui(text, "ответ оператора…") : await fileAsk(ctx?.run?.cwd || process.cwd(), seq, text)
      answers.push(String(answer || "").trim())
    }
    const dir = join(String(ctx?.run?.cwd || process.cwd()), ".agent")
    const pairs = (input.items || [])
      .map((item, i) => ({ n: i + 1, question: String(item.text || "").trim(), text: answers[i] }))
      .filter((p) => p.question && p.text)
    if (pairs.length) {
      const block = newExchange(pairs)
      if (block.ok) {
        mkdirSync(dir, { recursive: true })
        appendFileSync(join(dir, "answers.md"), block.value)
      } else console.log(`\n⚠ ответ не записан: ${block.error.detail}`)
    }
    return { answers }
  },
}

const here = (p) => new URL(p, import.meta.url).pathname

export default function register(pi) {
  registerWorkflowExtension({
    version: "1.0.0",
    headline: "solo: план по спеке пишет модель с кодом, судят скрипты и критик",
    description: "Станции draft → critic → approve → solve. Полоса — inline-скрипт команды /solo (foreground); этот пакет даёт глаголы и ask.",
    functions: { soloStart, soloNext, soloFold, ask },
    roleDirectories: [here("./roles")],
  })
}

// для тестов и headless-раннера
export { soloStart, soloNext, soloFold, ask }
