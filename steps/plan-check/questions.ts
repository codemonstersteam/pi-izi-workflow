// MODULE_CONTRACT: questions — открытые вопросы плана: извлечь, спросить, вписать ответы
// Purpose:    одно решение: как вопросы раздела 6 становятся паузой оператора и как его
//             ответы становятся ЧАСТЬЮ плана. Строка вопроса дописывается «→ РЕШЕНО: …» —
//             план остаётся единственным источником правды, answers.md — только канал.
// io:         none (чистые функции над текстом)
// Invariants: вопрос без ответа остаётся вопросом; ответы вписываются только в свой вопрос.
// Interface:  extractQuestions, applyAnswers
import { newAnswers } from "../../ext/answers.ts"
import { sectionOf } from "../plan/judge.ts"

export interface OpenQuestion { n: number; text: string; recommendation?: string }

// extractQuestions — строки таблицы раздела 6 (вопрос | рекомендация)
export function extractQuestions(plan: string): OpenQuestion[] {
  const sec = sectionOf(plan, "ОТКРЫТЫЕ ВОПРОСЫ")
  return sec.split("\n")
    .filter((l) => l.trim().startsWith("|"))
    .filter((l) => !/^\s*\|[\s\-:|]+\|\s*$/.test(l))
    .slice(1)
    .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()))
    .map((c, i) => ({ n: i + 1, text: c[0] || "", recommendation: c[1] || "" }))
    .filter((q) => q.text && !/РЕШЕНО/.test(q.text))
}

// applyAnswers — ответы оператора вписываются В ПЛАН: строке вопроса дописывается решение.
// Сверка ПО ТЕКСТУ вопроса (answers.md несёт вопрос из pending.json — тот же текст).
export function applyAnswers(plan: string, answersMd: string): string {
  const r = newAnswers(answersMd)
  if (!r.ok) return plan
  let out = plan
  for (const a of r.value) {
    // вопрос в answers.md мог приехать с припиской «— рекомендация: …» (pending
    // собирал вопрос+рекомендацию одной строкой) — сверяем по тексту ДО приписки
    const needle = a.question.split("— рекомендация")[0].trim()
    if (!needle) continue
    // строка таблицы раздела 6, первая колонка которой совпадает с вопросом
    const re = new RegExp(`^(\\|\\s*)${escapeRe(needle)}(\\s*\\|.*)$`, "m")
    out = out.replace(re, (_m: string, before: string, rest: string) =>
      `${before}${needle} → РЕШЕНО: ${a.text}${rest}`)
  }
  return out
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
