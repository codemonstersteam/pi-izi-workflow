// MODULE_CONTRACT: questions — извлечение и применение ответов оператора
// io:         none (чистые функции)
// Interface:  extractQuestions, applyAnswers
import { ok, fail, type Result } from "../../ext/result.ts"
import { newAnswers } from "../../ext/answers.ts"
import { tableRows, sectionOf } from "../plan/judge.ts"

export function extractQuestions(plan: string): string[] {
  return tableRows(sectionOf(plan, "ОТКРЫТЫЕ ВОПРОСЫ"))
    .map((c) => c[0] || "")
    .filter((q) => q && !/РЕШЕНО/.test(q))
}

// FUNCTION_CONTRACT: applyAnswers — вписать ответы оператора в план
//   Antecedent:   answersMd содержит ≥ 1 валидный обмен
//   Consequent:   success: { plan с «→ РЕШЕНО», applied: сколько вписано, total: сколько было }
//                 failure: "blocked" — ни один ответ не нашёл свою строку (regex не совпал)
//   Postcondition: applied === total, ИЛИ отказ — ответы НЕ теряются молча
export function applyAnswers(plan: string, answersMd: string): Result<{ plan: string; applied: number; total: number }> {
  const r = newAnswers(answersMd)
  if (!r.ok || r.value.length === 0)
    return fail("blocked", "answers.md пуст или не парсится — ответы оператора недоступны")

  let out = plan
  let applied = 0
  const total = r.value.length

  for (const a of r.value) {
    const needle = a.question.split("— рекомендация")[0].trim()
    if (!needle) continue
    const re = new RegExp(`^(\\|\\s*)${escapeRe(needle)}(\\s*\\|.*)$`, "m")
    const before = out
    out = out.replace(re, (_m: string, b: string, rest: string) =>
      `${b}${needle} → РЕШЕНО: ${a.text}${rest}`)
    if (out !== before) applied++
  }

  if (applied === 0)
    return fail("blocked", `${total} ответов в answers.md, но НИ ОДИН не совпал со строками плана — тексты вопросов разошлись`)

  return ok({ plan: out, applied, total })
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
