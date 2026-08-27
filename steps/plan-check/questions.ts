// MODULE_CONTRACT: questions — извлечение и применение ответов оператора
// io:         none (чистые функции)
// Interface:  extractQuestions, applyAnswers
import { newAnswers } from "../../ext/answers.ts"
import { tableRows, sectionOf } from "../plan/judge.ts"

export function extractQuestions(plan: string): string[] {
  return tableRows(sectionOf(plan, "ОТКРЫТЫЕ ВОПРОСЫ"))
    .map((c) => c[0] || "")
    .filter((q) => q && !/РЕШЕНО/.test(q))
}

export function applyAnswers(plan: string, answersMd: string): string {
  const r = newAnswers(answersMd)
  if (!r.ok) return plan
  let out = plan
  for (const a of r.value) {
    const needle = a.question.split("— рекомендация")[0].trim()
    if (!needle) continue
    const re = new RegExp(`^(\\|\\s*)${escapeRe(needle)}(\\s*\\|.*)$`, "m")
    out = out.replace(re, (_m: string, before: string, rest: string) =>
      `${before}${needle} → РЕШЕНО: ${a.text}${rest}`)
  }
  return out
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
