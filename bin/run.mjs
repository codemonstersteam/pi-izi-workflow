#!/usr/bin/env node
// MODULE_CONTRACT: run — ЗАПУСК ПРОГОНА БЕЗ МОДЕЛИ-ЗАПУСКАТОРА
// Purpose:    одно решение спрятано здесь: КТО нажимает пуск. Сегодня это делала модель — шаблон
//             `prompts/izi.md` велел ей позвать инструмент `workflow`. Здесь параметры инструмента
//             собирает скрипт, и он же его исполняет. Полоса, шаги и роли не меняются вовсе.
// io:         fs, net (через роли прогона)
// EXTERNAL_DEPENDENCY: пакет хоста `pi-extensible-workflows` — его СОБСТВЕННЫЙ инструмент
//             `workflow`, тот же, что зовёт модель. Берётся по ЯВНОМУ пути в `ext/node_modules`,
//             потому что реестр расширений — синглтон модуля: наш `ext/index.mjs` регистрируется в
//             ТОТ ЖЕ экземпляр, и второй резолв дал бы пустой каталог функций и ни одной роли.
// Invariants: ТОТАЛЕН. Любой исход — строка отчёта и код возврата. Прогон НЕ запускается, пока не
//             сказано `--go`: подготовил ≠ запустил.
// Interface:  CLI: node bin/run.mjs --cwd=<каталог прогона> [--key=DOS-535] [--go]
//
// ЧЕМ ЭТО ОПЛАЧЕНО. `PLAN.md:145-146` назвал риск при рождении проекта: «Запуск опосредован моделью
// (tool `workflow` вызывает агент-запускатор)», и `PLAN.md:82`, тикет S3, объявил `bin/run.mjs` —
// не построенный до сегодня. Живые прогоны цену подтвердили: модель-запускатор путала runId по
// памяти (`standards/runbox.md:281-286`), отказывалась работать и вешала полосу на девять минут
// (`standards/live-run.md:45-48`), а `pi -p` дважды повис на прогоне, который на диске был
// `completed` (`PLAN.md:16-17`).
//
// ЧТО ДЕЛАЕТ ХОСТ И ЧЕГО ОН НЕ ТРЕБУЕТ. Инструмент `workflow` требует ССЫЛКУ на модель
// (`packages/core/src/host.ts:1035`, `{provider, id}`), а не её ответ: ни одного токена на запуск не
// тратится. Роли модель зовут сами, изнутри прогона. Образец такого вызова — тест самого хоста
// `packages/core/test/alias-extensions.test.ts:16-24`: рукодельный API из семи методов и контекст из
// трёх полей.
import { readFileSync, existsSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = fileURLToPath(new URL(".", import.meta.url))
const HOST = join(HERE, "../ext/node_modules/pi-extensible-workflows/dist/src/index.js")
const PI = join(HERE, "../ext/node_modules/@earendil-works/pi-coding-agent/dist/index.js")
const AGENT_DIR = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent")
const ACTIVE_TOOLS = ["read", "bash", "edit", "write", "workflow"]

// FUNCTION_CONTRACT: modelRef — ССЫЛКА на модель для хоста, не вызов
//   Antecedent:   — (тотальна)
//   Consequent:   success: { provider, id } из настроек pi; при отсутствии — пара по умолчанию
//   Purity:       io (fs)
//   Хост проверяет только НАЛИЧИЕ пары (host.ts:1035). Ролям она не достаётся: у каждой свой
//   `model:` во фронтматтере, разрешаемый через алиасы (standards/role.md).
export function modelRef(settingsPath = join(AGENT_DIR, "settings.json")) {
  try {
    const s = JSON.parse(readFileSync(settingsPath, "utf8"))
    if (s.defaultProvider && s.defaultModel) return { provider: String(s.defaultProvider), id: String(s.defaultModel) }
  } catch { /* настроек нет — пара ниже годится: хост её не вызывает */ }
  return { provider: "openrouter", id: "qwen/qwen3.6-27b" }
}

// FUNCTION_CONTRACT: flags — разбор аргументов командной строки
//   Consequent:   success: { cwd, key, go }
//   Purity:       pure
export function flags(argv = []) {
  const get = (name) => (argv.find((a) => a.startsWith(`--${name}=`)) || "").split("=").slice(1).join("=")
  return { cwd: get("cwd"), key: get("key"), stopAfter: get("stop-after"), go: argv.includes("--go") }
}

async function main() {
  const { cwd: rawCwd, key, stopAfter, go } = flags(process.argv.slice(2))
  const cwd = rawCwd ? resolve(rawCwd) : process.cwd()
  if (!existsSync(join(cwd, "workflows", "izi.js"))) {
    console.error(`в ${cwd} нет workflows/izi.js — харнес не установлен: node bin/install.mjs --to=${cwd}`)
    process.exit(64)
  }

  // ОДИН экземпляр пакета хоста на всё: реестр расширений — состояние модуля.
  const host = await import(HOST)
  const tools = []
  const pi = {
    // ГРАНИЦА ИНСТРУМЕНТОВ СЕССИИ. Хост проверяет `tools:` КАЖДОЙ роли против набора запускающей
    // сессии и валит прогон на первом же несовпадении: «Unknown tool for role analogue: write»
    // (замер 24.08.2026). Список тот же, что строит CLI хоста (packages/cli/src/cli.ts:307).
    appendEntry() {}, getActiveTools: () => ACTIVE_TOOLS, getThinkingLevel: () => "medium",
    on() {}, registerCommand() {}, registerTool: (t) => tools.push(t),
    sendMessage() {},
  }
  const ours = (await import(join(HERE, "../ext/index.mjs"))).default
  ours(pi)                                   // наши функции, роли и izi_answer — в тот же реестр
  host.default(pi, undefined, undefined, undefined, AGENT_DIR)   // инструмент `workflow` хоста

  const workflow = tools.find((t) => t.name === "workflow")
  if (!workflow) { console.error("инструмент `workflow` не зарегистрировался — пакет хоста не тот"); process.exit(1) }

  // РЕЕСТР МОДЕЛЕЙ — НЕ УКРАШЕНИЕ. Роль объявляет `model: execution` — АЛИАС, и хост разрешает его
  // в провайдерский id, а потом проверяет, что такая модель ВООБЩЕ доступна
  // (agent-execution.ts::resolve). Без реестра прогон умирает на первой же роли:
  // «Unknown model alias execution resolved to openrouter/qwen/qwen3.6-27b» — замер 24.08.2026.
  // Строится тем же способом, что у CLI хоста (packages/cli/src/cli.ts:298-304, :324-327).
  const pia = await import(PI)
  const settingsManager = pia.SettingsManager.create(cwd, AGENT_DIR)
  const services = await pia.createAgentSessionServices({ cwd, agentDir: AGENT_DIR, settingsManager })
  const pair = ({ provider, id }) => ({ provider, id })
  const modelRegistry = {
    getAll: () => services.modelRuntime.getModels().map(pair),
    getAvailable: () => services.modelRuntime.getAvailableSnapshot().map(pair),
  }

  // СЕССИЯ PI: если /izi передал IZI_SESSION_ID, используем ЕГО — runs лягут в pi's
  // сессионный каталог и /workflow их покажет. Без этого — свой UUID (runs невидимы).
  const sessionId = process.env.IZI_SESSION_ID || randomUUID()

  // T38 — ФАЙЛОВАЯ ПЕТЛЯ ВОПРОС-ОТВЕТ (вместо чат-модели и TUI).
  // Хост требует ui.select для checkpoint; мы подменяем его на файловый опросчик:
  //   вопрос  → .agent/question.txt (оператор читает)
  //   ответ   ← .agent/answer.txt   (оператор пишет: echo "..." > .agent/answer.txt)
  // Появился ответ → "Approve" → пауза снята → полоса продолжает с ответом в answers.md.
  // Чат-модель НЕ участвует нигде.
  const QUESTION_FILE = join(cwd, ".agent/question.txt")
  const ANSWER_FILE = join(cwd, ".agent/answer.txt")
  const CHECKPOINT_TIMEOUT_MS = 10 * 60 * 1000  // 10 минут
  const ASK_TIMEOUT_MS = 30 * 60 * 1000         // вопрос рельсы ask — 30 минут (оператор не рядом)

  const fileSelect = async (prompt, options) => {
    mkdirSync(join(cwd, ".agent"), { recursive: true })
    writeFileSync(QUESTION_FILE, `[${new Date().toISOString()}]\n${prompt}\n\nОтветь: echo "твой ответ" > .agent/answer.txt\n`)
    console.log(`\n${"═".repeat(60)}\n🔒 CHECKPOINT — вопрос оператору:\n${prompt}\n${"═".repeat(60)}\nОтветь: echo "твой ответ" > .agent/answer.txt\n`)
    const t0 = Date.now()
    while (true) {
      await new Promise((r) => setTimeout(r, 2000))
      if (existsSync(ANSWER_FILE)) {
        const answer = readFileSync(ANSWER_FILE, "utf8").trim()
        rmSync(ANSWER_FILE, { force: true })  // consumed — следующий вопрос не увидит старый ответ
        console.log(`\n✅ Ответ получен (${answer.length} симв) — полоса продолжает\n`)
        return "Approve"
      }
      if (Date.now() - t0 > CHECKPOINT_TIMEOUT_MS) {
        console.log(`\n⏰ Таймаут ${CHECKPOINT_TIMEOUT_MS / 60000} мин — checkpoint отклонён\n`)
        return "Reject"
      }
    }
  }

  // T41 — ASK-РЕЛЬСА В HEADLESS. Наша ask-функция (ext/index.mjs) зовёт ctx.ui.input ПО ВОПРОСУ
  // на каждый item; без input она молча возвращала пусто, и шаг умирал «не отвечен за 2 паузы»
  // за 32 секунды (приёмка 25.08, станция intake). Тот же файловый протокол, что у select, но
  // ответы нумерованные: вопрос N снят, когда в answer.txt есть строка «N. …» (или «N) …»).
  // Несколько вопросов одного ask-вызова пишутся в question.txt подряд.
  let askSeq = 0
  const fileInput = async (prompt) => {
    mkdirSync(join(cwd, ".agent"), { recursive: true })
    askSeq += 1
    if (askSeq === 1) { rmSync(ANSWER_FILE, { force: true }); writeFileSync(QUESTION_FILE, "") }
    const q = `[${new Date().toISOString()}]\n${askSeq}. ${prompt}`
    appendFileSync(QUESTION_FILE, q + `\nОтветь: echo "${askSeq}. твой ответ" >> .agent/answer.txt\n\n`)
    console.log(`\n🔒 ВОПРОС ${askSeq}: ${prompt}\nОтветь: echo "${askSeq}. твой ответ" >> .agent/answer.txt`)
    const t0 = Date.now()
    while (true) {
      await new Promise((r) => setTimeout(r, 2000))
      if (existsSync(ANSWER_FILE)) {
        const m = readFileSync(ANSWER_FILE, "utf8").match(new RegExp(`^\\s*${askSeq}[).]\\s*(.*)$`, "m"))
        if (m) {
          console.log(`\n✅ Ответ ${askSeq} получен: ${m[1].trim().slice(0, 120)}\n`)
          return m[1].trim()
        }
      }
      if (Date.now() - t0 > ASK_TIMEOUT_MS) {
        console.log(`\n⏰ Таймаут вопроса ${askSeq} (${ASK_TIMEOUT_MS / 60000} мин) — пустой ответ\n`)
        return ""
      }
    }
  }

  const context = {
    cwd, model: modelRef(), mode: "print",
    hasUI: true,           // есть "UI" — наш файловый опросчик
    headless: false,       // НЕ headless — checkpoint работает (host.ts:638)
    ui: { select: fileSelect, input: fileInput },
    modelRegistry, sessionManager: { getSessionId: () => sessionId },
    isProjectTrusted: () => settingsManager.isProjectTrusted(),
  }
  // STOP-AFTER — станция приёмки: id подшага, после которого полоса возвращает ok({stopped}) и
  // заканчивается. Словарь id — литералы workflows/izi.js (task, brd/normalize, …, plan/flows).
  const args = { ...(key ? { key } : {}), ...(stopAfter ? { stopAfter } : {}) }
  const params = { name: "izi", scriptPath: "workflows/izi.js", foreground: true, ...(Object.keys(args).length ? { args } : {}) }

  console.log(`каталог прогона: ${cwd}`)
  console.log(`модель-ссылка:   ${context.model.provider}/${context.model.id} (запуск её НЕ зовёт)`)
  console.log(`параметры:       ${JSON.stringify(params)}`)
  console.log(`инструментов зарегистрировано: ${tools.map((t) => t.name).join(", ")}`)
  console.log(`моделей в реестре: ${modelRegistry.getAll().length}, доступных: ${modelRegistry.getAvailable().length}`)
  if (!go) { console.log("\nпрогон НЕ запущен — добавь --go"); return }

  const t0 = Date.now()
  const res = await workflow.execute(randomUUID(), params, undefined, undefined, context)
  const sec = ((Date.now() - t0) / 1000).toFixed(1)
  const text = (res && res.content && res.content[0] && res.content[0].text) || ""
  console.log(`\nпрогон кончился за ${sec} с\n${text}`)
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
