#!/usr/bin/env node
// MODULE_CONTRACT: ask — ЗАМЕР РОЛИ И НАРЯДА НАПРЯМУЮ, мимо pi. Стенд зеркалит хост.
// Purpose:    измерить, что РЕАЛЬНО отвечает модель на данную роль и данный наряд — секунды,
//             токены, какие инструменты она позвала. Живой прогон этого не показывает: там ответ
//             съедает хост, а журнал пишет уже последствия.
// io:         net (OpenRouter), fs
// EXTERNAL_DEPENDENCY: только node>=18 (fetch). Ключ — OPENROUTER_API_KEY в окружении.
// Invariants: ТОТАЛЕН. Любой исход — строка отчёта и код возврата, никогда молчание.
//             ОТЧЁТ О ФАКТЕ, А НЕ О НАДЕЖДЕ: если модель позвала не `write`, это печатается вместе
//             с аргументами того, что она позвала. Прошлая версия на python в этом случае печатала
//             «не разбирается» — и полдня искали сеть, пока роль уходила на рельс вопроса.
// Interface:  CLI: node bin/ask.mjs <роль.md> <наряд.txt> <файл-ответа.md> [метка]
//                     [--case=<каталог>] [--root=<каталог прогона>]
//
// ЦИКЛ, А НЕ ОДИН ВЫЗОВ — ПОТОМУ ЧТО ХОСТ ЦИКЛИТ: роль с `tools: [read, write]` (скаут) начинает
// с чтения, и одновызовный стенд мерял её БЕЗ ГЛАЗ — хребет-клетка, чья работа читать файлы,
// получала единственный выход «дописать вслепую» (замер 24.08.2026). Чтения подаются из --root
// (каталог прогона, по умолчанию --case), запись и workflow_result заканчивают цикл; больше
// ROUNDS ходов стенд не даёт — циклиться вечно обязана роль, а не замер.
//
// --case КЛАДЁТ ЗАПРОС ВО ВХОД ПОДШАГА: `<каталог>/in/request.<метка>.json` — то, что РЕАЛЬНО ушло
// в сеть (роль в `system`, наряд в `user`, объявление инструментов, model/temperature/reasoning), и
// `<каталог>/raw.<метка>.json` — сырой ответ. Наряд один расхождения роли не показывает: роль в
// репозитории и роль, ушедшая в модель, — разные вещи, и видны они только в запросе. Без --case оба
// файла ложатся в /tmp/sq, как раньше.
//
// ПОЧЕМУ ОТВЕТ ЧИТАЕТСЯ ЦЕЛИКОМ, А НЕ ПОСТРОЧНО: OpenRouter шлёт keep-alive — тысячи пробелов и
// переводов строки ПЕРЕД телом. Это валидный JSON-пробел, `JSON.parse` его снимает; построчный
// разбор на нём спотыкается.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"

export const MODEL = "qwen/qwen3.6-27b"
export const URL = "https://openrouter.ai/api/v1/chat/completions"
export const TIMEOUT_MS = 600_000

// Инструменты объявлены ТАК ЖЕ, как их объявляет хост pi: роль обязана видеть ту же поверхность,
// иначе замер меряет другой мир. Набор берётся ИЗ ФРОНТМАТТЕРА РОЛИ (`tools: [read, write]`) —
// стенд, объявляющий все ролям один `write`, измеряет скаута без глаз: хребет-клетка, чья работа
// читать файлы, получает единственный выход «дописать вслепую» (замер 24.08.2026, answer-spine).
export const TOOL_SCHEMA = {
  read:  { type: "function", function: { name: "read", parameters: { type: "object", required: ["path"],
    properties: { path: { type: "string" } } } } },
  write: { type: "function", function: { name: "write", parameters: { type: "object", required: ["path", "content"],
    properties: { path: { type: "string" }, content: { type: "string" } } } } },
  workflow_result: { type: "function", function: { name: "workflow_result", parameters: { type: "object", required: ["track"],
    properties: { track: { type: "string" }, artifact: { type: "string" }, kind: { type: "string" },
      subject: { type: "string" }, items: { type: "array", items: { type: "string" } } } } } },
}

// FUNCTION_CONTRACT: toolsFor — инструменты роли + рельс результата
//   Antecedent:   raw — содержимое файла роли ЦЕЛИКОМ (фронтматтер читается здесь же)
//   Consequent:   success: схемы инструментов роли и ВСЕГДА workflow_result; роль без `tools:`
//                 получает `write` — минимум, которым закрывается артефакт
//   Purity:       pure
export function toolsFor(roleRaw = "") {
  const m = String(roleRaw).match(/^tools:\s*\[([^\]]*)\]/m)
  const names = m ? m[1].split(",").map((s) => s.trim()).filter(Boolean) : ["write"]
  const tools = [...new Set(names)].map((n) => TOOL_SCHEMA[n]).filter(Boolean)
  tools.push(TOOL_SCHEMA.workflow_result)
  return tools
}

// FUNCTION_CONTRACT: roleText — текст роли без фронтматтера
//   Antecedent:   raw — содержимое файла роли
//   Consequent:   success: тело после второго `---`; при отсутствии фронтматтера — весь файл
//   Purity:       pure
export function roleText(raw = "") {
  const parts = String(raw).split("---")
  return (parts.length >= 3 ? parts.slice(2).join("---") : String(raw)).trim()
}

// FUNCTION_CONTRACT: callsOf — какие инструменты позвала модель
//   Antecedent:   message — choices[0].message
//   Consequent:   success: [{ id, name, args }] — args уже разобраны; id нужен циклу для tool-ответа
//   Purity:       pure
export function callsOf(message = {}) {
  return (message.tool_calls || []).map((c) => {
    const a = c.function?.arguments
    let args = {}
    try { args = typeof a === "string" ? JSON.parse(a) : (a || {}) } catch { args = { raw: String(a).slice(0, 400) } }
    return { id: c.id, name: c.function?.name, args }
  })
}

async function main() {
  const argv = process.argv.slice(2)
  const caseDir = (argv.find((a) => a.startsWith("--case=")) || "").slice(7)
  const [roleFile, orderFile, outFile, label = "ask"] = argv.filter((a) => !a.startsWith("--"))
  if (!roleFile || !orderFile || !outFile) {
    console.error("node bin/ask.mjs <роль.md> <наряд.txt> <файл-ответа.md> [метка]"); process.exit(64)
  }
  const key = process.env.OPENROUTER_API_KEY
  if (!key) { console.error("OPENROUTER_API_KEY не задан"); process.exit(64) }

  const roleRaw = readFileSync(roleFile, "utf8")
  const root = resolve((argv.find((a) => a.startsWith("--root=")) || `--root=${caseDir || "."}`).slice(7))
  const messages = [{ role: "system", content: roleText(roleRaw) },
                    { role: "user", content: readFileSync(orderFile, "utf8") }]
  const tools = toolsFor(roleRaw)
  const base = { model: MODEL, temperature: 0, tools, tool_choice: "auto", reasoning: { effort: "low" } }
  // СВОЙ ФАЙЛ ЗАПРОСА НА КАЖДУЮ МЕТКУ: два прогона на одном имени затирают друг друга, и сравнение
  // остаётся убедительным на вид и недействительным по сути. В файл ложится ПЕРВЫЙ ход — расхождение
  // роли репозитория с ролью, ушедшей в модель, видно уже в нём; последующие ходы цикла — тот же мир.
  const reqFile = caseDir ? `${caseDir}/in/request.${label}.json` : `/tmp/sq/req-${label}.json`
  try { mkdirSync(reqFile.slice(0, reqFile.lastIndexOf("/")), { recursive: true }) } catch {}
  try { writeFileSync(reqFile, JSON.stringify({ ...base, messages }, null, 1)) } catch {}

  // ЦИКЛ КАК У ХОСТА: модель зовёт инструменты — стенд отвечает. Чтение подаётся из --root и только
  // из него: путь наружу каталога прогона — это не чтение, а выход за мир замера.
  const ROUNDS = 8
  const t0 = Date.now()
  const allCalls = []
  let write = null
  let raw = ""
  let sec = 0
  let u = {}
  for (let round = 0; round < ROUNDS; round++) {
    const res = await fetch(URL, { method: "POST", signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...base, messages }) })
    raw = await res.text()
    sec = Math.round((Date.now() - t0) / 1000)
    // СЫРОЙ ОТВЕТ ЛОЖИТСЯ НА ДИСК ДО РАЗБОРА, и на свою метку — как и запрос. Отчёт о факте печатает
    // секунды и токены, но каталог приёмки обязан носить ОТВЕТ ЦЕЛИКОМ: разбор — наше прочтение, а
    // спорят потом о байтах, которых после выхода процесса уже нет.
    const rawFile = caseDir ? `${caseDir}/raw.${label}.json` : `/tmp/sq/raw-${label}.json`
    try { writeFileSync(rawFile, raw) } catch {}
    let d
    try { d = JSON.parse(raw) } catch (e) {
      console.error(`${label}: ответ не JSON, ${res.status}, ${raw.length} байт, ${sec}с\n${raw.trim().slice(0, 400)}`)
      process.exit(1)
    }
    if (d.error) { console.error(`${label}: ОШИБКА ${JSON.stringify(d.error).slice(0, 300)}`); process.exit(1) }

    const msg = d.choices?.[0]?.message || {}
    u = d.usage || {}
    const calls = callsOf(msg)
    allCalls.push(...calls)
    if (!write) write = calls.find((c) => c.name === "write") || null

    if (!calls.length) break                                        // модель замолчала — циклу конец
    messages.push({ role: "assistant", content: msg.content || "", tool_calls: msg.tool_calls })
    let done = false
    for (const c of calls) {
      if (c.name === "read") {
        const at = resolve(root, String(c.args.path || ""))
        const inside = at === root || at.startsWith(root + "/")
        const text = inside && existsSync(at) ? readFileSync(at, "utf8") : `no such file: ${c.args.path}`
        messages.push({ role: "tool", tool_call_id: c.id, content: text.slice(0, 64 * 1024) })
      } else if (c.name === "write") {
        messages.push({ role: "tool", tool_call_id: c.id, content: "written" })
      } else {
        messages.push({ role: "tool", tool_call_id: c.id, content: "ok" })
        done = true                                                // workflow_result — конец хода, как у хоста
      }
    }
    if (done) break
  }

  const det = u.completion_tokens_details || {}
  const head = `${label}: ${sec}с | выход ${u.completion_tokens} (рассужд. ${det.reasoning_tokens}) | позвала: ${allCalls.map((c) => c.name).join(", ") || "ничего"}`

  const content = write?.args?.content ?? ""
  if (write) writeFileSync(outFile, content)

  const timingFile = "/tmp/sq/timing.json"
  let timing = {}
  try { if (existsSync(timingFile)) timing = JSON.parse(readFileSync(timingFile, "utf8")) } catch {}
  timing[label] = { sec, out: u.completion_tokens ?? null, reasoning: det.reasoning_tokens ?? null,
    chars: content.length, calls: allCalls.map((c) => c.name) }
  try { writeFileSync(timingFile, JSON.stringify(timing, null, 1)) } catch {}

  console.log(head)
  // РЕЛЬС ВИДЕН СРАЗУ. Роль, ушедшая на вопрос, — это результат замера, а не сбой стенда.
  for (const c of allCalls) if (c.name !== "write" && c.name !== "read") console.log(`  ${c.name}: ${JSON.stringify(c.args, null, 1).slice(0, 900)}`)
  console.log(`  запрос → ${reqFile}`)
  console.log(`  сырой ответ ${raw.length} байт → ${caseDir ? `${caseDir}/raw.${label}.json` : `/tmp/sq/raw-${label}.json`}`)
  if (!write) { console.log(`  артефакт НЕ записан — файла ${outFile} нет`); process.exit(2) }
  console.log(`  ${content.length} симв → ${outFile}`)
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
