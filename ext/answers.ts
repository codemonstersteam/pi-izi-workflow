// MODULE_CONTRACT: answers — ответы оператора как ЗНАЧЕНИЯ, а не текст файла
// Purpose:    одно решение: что в файле ответов — ФАКТ, и в какой форме факты едут на диск.
//             Грамматика <exchange> с парами question_N/answer_N известна одному модулю:
//             писатель (newExchange) и читатель (newAnswers) берут её здесь — снаружи никто
//             не припоминает (урок T75: сырые строки «N. текст» не читал никто).
// io:         none
// Invariants: вопрос и ответ разделены машиной, не глазом; порядок сохранён; писатель
//             ОТКАЗЫВАЕТСЯ писать значение, которое формат не унесёт.
// Interface:  newExchange, newAnswers
import { ok, err, type Result } from "./result.ts"

export interface Answer { n: number; question: string; text: string }

const FORBIDDEN = /<\/(question|answer)_\d+>/i

// FUNCTION_CONTRACT: newExchange — один обмен вопрос-ответ как текст файла
//   Consequent: success: строка `<exchange>…</exchange>\n`; failure: "invalid-exchange"
//   Purity:     pure
export function newExchange(pairs: { n: number; question: string; text: string }[]): Result<string> {
  if (!Array.isArray(pairs) || !pairs.length) return err("invalid-exchange", "нет ни одной пары вопрос-ответ")
  const seen = new Set<number>()
  for (const p of pairs) {
    if (!Number.isInteger(p.n) || p.n < 1) return err("invalid-exchange", `номер «${p.n}» — ожидалось целое ≥ 1`)
    if (seen.has(p.n)) return err("invalid-exchange", `номер ${p.n} повторяется`)
    seen.add(p.n)
    if (!String(p.question || "").trim()) return err("invalid-exchange", `вопрос ${p.n} пуст`)
    if (!String(p.text || "").trim()) return err("invalid-exchange", `ответ на вопрос ${p.n} пуст`)
    if (FORBIDDEN.test(p.question) || FORBIDDEN.test(p.text)) {
      return err("invalid-exchange", `вопрос или ответ ${p.n} содержит закрывающий тег формата — такой текст answers.md не переживёт`)
    }
  }
  const body = pairs
    .map((p) => `  <question_${p.n}>${p.question}</question_${p.n}>\n  <answer_${p.n}>${p.text}</answer_${p.n}>`)
    .join("\n")
  return ok(`<exchange>\n${body}\n</exchange>\n`)
}

// FUNCTION_CONTRACT: newAnswers — накопленные ответы списком значений
//   Consequent: success: Answer[] в порядке файла (пустой файл → пустой список);
//               failure: "malformed" — вопрос без ответа своего номера
//   Purity:     pure
export function newAnswers(text: string): Result<Answer[]> {
  const out: Answer[] = []
  for (const block of String(text || "").matchAll(/<exchange>([\s\S]*?)<\/exchange>/g)) {
    const b = block[1]
    for (const m of b.matchAll(/<question_(\d+)>([\s\S]*?)<\/question_\1>/g)) {
      const n = Number(m[1])
      const a = b.match(new RegExp(`<answer_${n}>([\\s\\S]*?)</answer_${n}>`))
      if (!a) return err("malformed", `вопрос ${n} без ответа: «${m[2].trim().slice(0, 40)}»`)
      out.push({ n, question: m[2].trim(), text: a[1].trim() })
    }
  }
  return ok(out)
}

// answersText — строки-ответы для нарядов: «N. ответ» без разметки файла.
export function answersText(text: string): string {
  const r = newAnswers(text)
  return (r.ok ? r.value : []).map((a) => `${a.n}. ${a.text}`).join("\n")
}
