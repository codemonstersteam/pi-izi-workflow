// MODULE_CONTRACT: card — карточка плана для оператора: синтез «что и где» + ссылка
// io:         fs (проверка путей)
// Interface:  card(plan, cwd) -> string
import { existsSync } from "node:fs"
import { join } from "node:path"
import { tableRows, sectionOf, extractPath } from "../plan/judge.ts"

const clean = (s: string): string => s.replace(/[*`]/g, "").replace(/\s+/g, " ").trim()

export function card(plan: string, cwd: string): string {
  const req = tableRows(sectionOf(plan, "REQUIREMENTS"))
  const chg = tableRows(sectionOf(plan, "CHANGES")).filter((c) => /^C\d+/.test(c[0] || ""))
  const val = tableRows(sectionOf(plan, "VALUES"))
  const heads = (plan.match(/^#{2,4}\s*Scenario/gmi) || []).length
  const paras = (plan.match(/\*\*S\d+\s*—/g) || []).length
  const scenarios = Math.max(heads, paras)
  const files = chg.map((c) => extractPath(clean(c[1] || ""))).filter(Boolean)
  const newFiles = files.filter((f) => !existsSync(join(cwd, f)))
  const open = tableRows(sectionOf(plan, "OPEN QUESTIONS")).filter((c) => !/RESOLVED/.test(c[0] || ""))
  const rows = chg.slice(0, 6).map((c) => {
    const file = extractPath(clean(c[1] || "")) || clean(c[1] || "").slice(0, 30)
    return `${(c[0] || "").split(/\s+/)[0]} · ${file} · ${clean(c[3] || "").slice(0, 70)}`
  })
  if (chg.length > 6) rows.push(`… ещё ${chg.length - 6} строк C`)
  return [
    "═══ ПЛАН ГОТОВ ═══",
    `План: ${join(cwd, ".agent/PLAN.md")}`,
    `${req.length} требований · ${chg.length} строк C (${newFiles.length} новых) · ${scenarios} сценариев · ${val.length} величин · открытых вопросов: ${open.length}`,
    ...rows,
  ].join("\n")
}
