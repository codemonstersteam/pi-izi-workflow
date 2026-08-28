// MODULE_CONTRACT: card — карточка плана для оператора
// io:         fs (проверка путей)
// Interface:  card(plan, cwd) -> string
import { existsSync } from "node:fs"
import { join } from "node:path"
import { tableRows, sectionOf, extractPath } from "../plan/judge.ts"

export function card(plan: string, cwd: string): string {
  const req = tableRows(sectionOf(plan, "ТРЕБОВАНИЯ"))
  const chg = tableRows(sectionOf(plan, "ИЗМЕНЕНИЯ"))
  const val = tableRows(sectionOf(plan, "ВЕЛИЧИНЫ"))
  const scenarios = (plan.match(/^#{2,4}\s*(Сценарий|Сценарии)/gmi) || []).length
  const files = [...new Set(chg.map((c) => (c[1] || "").replace(/`/g, "").trim()).filter(Boolean))]
  const newFiles = files.map(extractPath).filter((f) => f && !existsSync(join(cwd, f)))
  const open = tableRows(sectionOf(plan, "ОТКРЫТЫЕ ВОПРОСЫ")).filter((c) => !/РЕШЕНО/.test(c[0] || ""))
  return [
    "═══ ПЛАН ГОТОВ ═══",
    `План: .agent/PLAN.md`,
    `${req.length} требований · ${chg.length} строк Ф (${newFiles.length} новых) · ${scenarios} сценариев · ${val.length} величин · открытых вопросов: ${open.length}`,
    files.length ? `Файлы: ${files.slice(0, 5).join("; ")}` : "",
  ].filter(Boolean).join("\n")
}
