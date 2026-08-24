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
import { readFileSync, existsSync } from "node:fs"
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
  return { cwd: get("cwd"), key: get("key"), go: argv.includes("--go") }
}

async function main() {
  const { cwd: rawCwd, key, go } = flags(process.argv.slice(2))
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

  const sessionId = randomUUID()
  const context = {
    cwd, model: modelRef(), mode: "print", hasUI: false, headless: true,
    modelRegistry, sessionManager: { getSessionId: () => sessionId },
    isProjectTrusted: () => settingsManager.isProjectTrusted(),
  }
  const params = { name: "izi", scriptPath: "workflows/izi.js", foreground: true, ...(key ? { args: { key } } : {}) }

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
