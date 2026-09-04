// MODULE_CONTRACT: judge — судья плана: вычислимое о шести разделах
// io:         fs (проверка существования путей)
// Interface:  judgeForm, countReqs, countRows, tableRows, sectionOf
import { existsSync } from "node:fs"
import { join } from "node:path"

const SECTIONS = ["REQUIREMENTS", "CHANGES", "SCENARIOS", "VALUES", "GUARANTEES", "OPEN QUESTIONS"]

export function tableRows(sectionText: string): string[][] {
  return sectionText
    .split("\n").filter((l) => l.trim().startsWith("|"))
    .filter((l) => !/^\s*\|[\s\-:|]+\|\s*$/.test(l))
    .slice(1)
    .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()))
}

export function sectionOf(plan: string, name: string): string {
  const m = plan.match(new RegExp(`^#+\\s*(\\d+\\.\\s*)?${name}\\s*$`, "mi"))
  if (!m) return ""
  const after = plan.slice(m.index! + m[0].length)
  const next = after.match(/^#+\s/m)
  return next ? after.slice(0, next.index) : after
}

const norm = (t: string): string =>
  t.replace(/[«»"'`]/g, "").replace(/\s*\([^)]*\)\s*$/g, "").replace(/\s+/g, " ").trim().toLowerCase()

export function judgeForm(plan: string, task: string, cwd: string): string[] {
  const B: string[] = []
  if (!plan.trim()) return ["no form: the plan is empty"]

  const heads = SECTIONS.filter((h) => !new RegExp(`^#+\\s*(\\d+\\.\\s*)?${h}`, "mi").test(plan))
  if (heads.length) B.push(`section(s) missing: ${heads.join(", ")}`)

  const reqRows = tableRows(sectionOf(plan, "REQUIREMENTS"))
  const chgRows = tableRows(sectionOf(plan, "CHANGES"))
  if (!reqRows.length) B.push("REQUIREMENTS: table does not parse")
  if (!chgRows.length) B.push("CHANGES: table does not parse")

  const taskNorm = norm(task)
  for (const c of reqRows) {
    const quote = norm(c[1] || "")
    if (!quote) { B.push(`REQUIREMENTS «${(c[0] || "?").slice(0, 12)}»: quote column empty`); continue }
    if (taskNorm && !taskNorm.includes(quote.slice(0, Math.min(60, quote.length))))
      B.push(`REQUIREMENTS «${quote.slice(0, 50)}…» — not a substring of TASK.md: quote verbatim`)
  }

  for (const c of chgRows) {
    const cell = (c[1] || "").replace(/`/g, "").trim()
    const what = `${c[3] || ""} ${c[2] || ""} ${c[4] || ""} ${cell}`
    if (!cell) { B.push(`CHANGES «${(c[0] || "?").slice(0, 12)}»: file column empty`); continue }
    // planner пишет путь с пояснением в ячейке — извлечь путь, а не брать cell целиком
    const path = extractPath(cell)
    if (cwd && path && !existsSync(join(cwd, path)) && !/(sample|after)/i.test(what))
      B.push(`CHANGES «${path || cell.slice(0, 60)}»: file does not exist and no sample named`)
  }

  for (const c of tableRows(sectionOf(plan, "VALUES"))) {
    if (c.length >= 3 && !c[2])
      B.push(`VALUES «${(c[1] || c[0] || "?").slice(0, 30)}»: source empty`)
  }

  return B
}

export const countReqs = (plan: string): number => tableRows(sectionOf(plan, "REQUIREMENTS")).length
export const countRows = (plan: string): number => tableRows(sectionOf(plan, "CHANGES")).filter((c) => /^C\d+/.test(c[0] || "")).length

// extractPath — извлечь путь из ячейки таблицы: planner пишет путь + пояснение в скобках.
// Ищем подстроку, которая выглядит как путь (содержит / и расширение) и обрезаем по
// первому пробелу/скобке ЗА ним.
export function extractPath(cell: string): string {
  const cleaned = cell.replace(/`/g, "").trim()
  // путь в кавычках или без — берём часть до первого пробела/скобки после последнего /
  const m = cleaned.match(/((?:[\w.-]+\/)+[\w.-]+\.\w+)/)
  return m ? m[1] : cleaned.split(/[\s(]/)[0] || ""
}
