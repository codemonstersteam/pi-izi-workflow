// MODULE_CONTRACT: card — карточка плана для оператора: ссылка + верхнеуровневый синтез
// Purpose:    одно решение: что оператор видит НЕ ОТКРЫВАЯ план, принимая решение. Счётчики
//             строк таблиц и первые вопросы — вычислимое; смысл уже проверен критиком.
// io:         fs (проверка существования путей раздела 2 — «какие из файлов новые»)
// Invariants: карточка пишется по УТВЕРЖДАЕМОМУ тексту плана, не по состоянию движка.
// Interface:  buildCard
import { existsSync } from "node:fs"
import { join } from "node:path"
import { tableRows, sectionOf } from "../plan/judge.ts"

export function buildCard(plan: string, cwd: string): string {
  const req = tableRows(sectionOf(plan, "ТРЕБОВАНИЯ"))
  const chg = tableRows(sectionOf(plan, "ИЗМЕНЕНИЯ"))
  const val = tableRows(sectionOf(plan, "ВЕЛИЧИНЫ"))
  const scenarios = (plan.match(/^#{2,4}\s*(Сценарий|Сценарии)/gmi) || []).length
  const guarantees = tableRows(sectionOf(plan, "ГАРАНТИИ")).length || (plan.match(/^\s*\d+\./gm) || []).length
  const files = [...new Set(chg.map((c) => (c[1] || "").replace(/`/g, "").trim()).filter(Boolean))]
  const newFiles = files.filter((f) => !existsSync(join(cwd, f)))
  const open = tableRows(sectionOf(plan, "ОТКРЫТЫЕ ВОПРОСЫ")).filter((c) => !/РЕШЕНО/.test(c[0] || ""))
  return [
    "═══ ПЛАН ГОТОВ — ждём решения оператора ═══",
    `План: .agent/PLAN.md — прочитай его в редакторе; ниже — синтез.`,
    `Синтез: ${req.length} требований (цитаты TASK) · ${chg.length} строк изменений (${newFiles.length} новых файлов, ${files.length - newFiles.length} существующих) · ${scenarios} сценариев · ${val.length} величин с источниками · ${guarantees} гарантий · открытых вопросов осталось: ${open.length}`,
    files.length ? `Файлы: ${files.slice(0, 6).join("; ")}${files.length > 6 ? "; …" : ""}` : "",
  ].filter(Boolean).join("\n")
}
