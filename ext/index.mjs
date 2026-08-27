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
import { soloNext as _soloNext, soloFold as _soloFold, soloStart as _soloStart } from "./stations.mjs"

const ANY = { type: "object", additionalProperties: true }

// Функции каталога: хост валидирует форму (registry.ts:63 — description/run обязательны);
// cwd/run берутся из КОНТЕКСТА ХОСТА, не из входа — сандбокс не знает ни пути, ни id прогона.
export const soloStart = {
  description: "First act of a solo run: build the state from the project's TASK.md (or refuse with a name). cwd and run come from the HOST CONTEXT. Returns {track, state, from}.",
  input: { type: "object", properties: { key: { type: "string" } }, additionalProperties: false },
  output: ANY,
  run: (input, ctx) => _soloStart(input, ctx),
}
export const soloNext = {
  description: "Ask the current station for its next instruction — role | ask | done | err. Refusals carry do:'err' WITH a kind and subject, never a TypeError in the rail.",
  input: { type: "object", properties: { state: ANY }, required: ["state"], additionalProperties: false },
  output: ANY,
  run: (input) => _soloNext(input),
}
export const soloFold = {
  description: "Hand a station the answer to its instruction. Returns {track:'ok', value: state} or {track:'err', …} — the rail MUST check the track before touching the state.",
  input: { type: "object", properties: { state: ANY, event: ANY }, required: ["state", "event"], additionalProperties: false },
  output: ANY,
  run: (input) => _soloFold(input),
}
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
export { ask }
