#!/usr/bin/env node
// MODULE_CONTRACT: ask — ОДИН ВЫЗОВ МОДЕЛИ НАПРЯМУЮ, мимо pi. Стенд для замеров роли и наряда.
// Purpose:    измерить, что РЕАЛЬНО отвечает модель на данную роль и данный наряд — секунды,
//             токены, какой инструмент она позвала. Живой прогон этого не показывает: там ответ
//             съедает хост, а журнал пишет уже последствия.
// io:         net (OpenRouter), fs
// EXTERNAL_DEPENDENCY: только node>=18 (fetch). Ключ — OPENROUTER_API_KEY в окружении.
// Invariants: ТОТАЛЕН. Любой исход — строка отчёта и код возврата, никогда молчание.
//             ОТЧЁТ О ФАКТЕ, А НЕ О НАДЕЖДЕ: если модель позвала не `write`, это печатается вместе
//             с аргументами того, что она позвала. Прошлая версия на python в этом случае печатала
//             «не разбирается» — и полдня искали сеть, пока роль уходила на рельс вопроса.
// Interface:  CLI: node bin/ask.mjs <роль.md> <наряд.txt> <файл-ответа.md> [метка]
//
// ПОЧЕМУ ОТВЕТ ЧИТАЕТСЯ ЦЕЛИКОМ, А НЕ ПОСТРОЧНО: OpenRouter шлёт keep-alive — тысячи пробелов и
// переводов строки ПЕРЕД телом. Это валидный JSON-пробел, `JSON.parse` его снимает; построчный
// разбор на нём спотыкается.
import { readFileSync, writeFileSync, existsSync } from "node:fs"

export const MODEL = "qwen/qwen3.6-27b"
export const URL = "https://openrouter.ai/api/v1/chat/completions"
export const TIMEOUT_MS = 600_000

// Инструменты объявлены ТАК ЖЕ, как их объявляет хост pi: роль обязана видеть ту же поверхность,
// иначе замер меряет другой мир. `write` — артефакт, `workflow_result` — рельс (ok | err).
export const TOOLS = [
  { type: "function", function: { name: "write", parameters: { type: "object", required: ["path", "content"],
      properties: { path: { type: "string" }, content: { type: "string" } } } } },
  { type: "function", function: { name: "workflow_result", parameters: { type: "object", required: ["track"],
      properties: { track: { type: "string" }, artifact: { type: "string" }, kind: { type: "string" },
        subject: { type: "string" }, items: { type: "array", items: { type: "string" } } } } } },
]

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
//   Consequent:   success: [{ name, args }] — args уже разобраны
//   Purity:       pure
export function callsOf(message = {}) {
  return (message.tool_calls || []).map((c) => {
    const a = c.function?.arguments
    let args = {}
    try { args = typeof a === "string" ? JSON.parse(a) : (a || {}) } catch { args = { raw: String(a).slice(0, 400) } }
    return { name: c.function?.name, args }
  })
}

async function main() {
  const [roleFile, orderFile, outFile, label = "ask"] = process.argv.slice(2)
  if (!roleFile || !orderFile || !outFile) {
    console.error("node bin/ask.mjs <роль.md> <наряд.txt> <файл-ответа.md> [метка]"); process.exit(64)
  }
  const key = process.env.OPENROUTER_API_KEY
  if (!key) { console.error("OPENROUTER_API_KEY не задан"); process.exit(64) }

  const body = { model: MODEL, temperature: 0, tools: TOOLS, tool_choice: "auto",
    reasoning: { effort: "low" },
    messages: [{ role: "system", content: roleText(readFileSync(roleFile, "utf8")) },
               { role: "user", content: readFileSync(orderFile, "utf8") }] }
  // СВОЙ ФАЙЛ ЗАПРОСА НА КАЖДУЮ МЕТКУ: два прогона на одном имени затирают друг друга, и сравнение
  // остаётся убедительным на вид и недействительным по сути.
  const reqFile = `/tmp/sq/req-${label}.json`
  try { writeFileSync(reqFile, JSON.stringify(body, null, 1)) } catch {}

  const t0 = Date.now()
  const res = await fetch(URL, { method: "POST", signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body) })
  const raw = await res.text()
  const sec = Math.round((Date.now() - t0) / 1000)
  let d
  try { d = JSON.parse(raw) } catch (e) {
    console.error(`${label}: ответ не JSON, ${res.status}, ${raw.length} байт, ${sec}с\n${raw.trim().slice(0, 400)}`)
    process.exit(1)
  }
  if (d.error) { console.error(`${label}: ОШИБКА ${JSON.stringify(d.error).slice(0, 300)}`); process.exit(1) }

  const msg = d.choices?.[0]?.message || {}
  const calls = callsOf(msg)
  const u = d.usage || {}
  const det = u.completion_tokens_details || {}
  const head = `${label}: ${sec}с | выход ${u.completion_tokens} (рассужд. ${det.reasoning_tokens}) | позвала: ${calls.map((c) => c.name).join(", ") || "ничего"}`

  const write = calls.find((c) => c.name === "write")
  const content = write?.args?.content ?? ""
  if (write) writeFileSync(outFile, content)

  const timingFile = "/tmp/sq/timing.json"
  let timing = {}
  try { if (existsSync(timingFile)) timing = JSON.parse(readFileSync(timingFile, "utf8")) } catch {}
  timing[label] = { sec, out: u.completion_tokens ?? null, reasoning: det.reasoning_tokens ?? null,
    chars: content.length, calls: calls.map((c) => c.name) }
  try { writeFileSync(timingFile, JSON.stringify(timing, null, 1)) } catch {}

  console.log(head)
  // РЕЛЬС ВИДЕН СРАЗУ. Роль, ушедшая на вопрос, — это результат замера, а не сбой стенда.
  for (const c of calls) if (c.name !== "write") console.log(`  ${c.name}: ${JSON.stringify(c.args, null, 1).slice(0, 900)}`)
  if (!write) { console.log(`  артефакт НЕ записан — файла ${outFile} нет`); process.exit(2) }
  console.log(`  ${content.length} симв → ${outFile}`)
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
