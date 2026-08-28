// MODULE_CONTRACT: order — наряды роли planner (первичный + починка)
// Purpose:    одно решение: ЧТО видит planner. Спека едет ДОСЛОВНО; PREVIOUS на починке.
// io:         fs (чтение TASK/спеки)
// Interface:  planOrder, repairOrder
import { readFileSync } from "node:fs"
import { readAt } from "../../ext/io.ts"
import { TASK } from "../../ext/paths.ts"
import type { PlanInput } from "./plan.ts"

const specOf = (cwd: string): string => {
  const own = readAt(cwd, "PROMPT.md")
  return own.trim() ? own : readFileSync(new URL("../../ext/spec/PROMPT.default.md", import.meta.url).pathname, "utf8")
}

export function planOrder(input: PlanInput, draft: string): string {
  const parts = [
    `$START_TASK\nТы планировщик. ${specOf(input.cwd).trim()}\n$END_TASK`,
    `$START_DATA\n$START_DOCUMENT\npath: ${TASK}\nЗаказ оператора, байты как есть. Единственный источник требований.\n$END_DOCUMENT\n$START_CONTENT\n${readAt(input.cwd, TASK)}$END_CONTENT\n$END_DATA`,
  ]
  if (draft.trim())
    parts.push(`$START_PREVIOUS\npath: staging\nТВОЙ ЧЕРНОВИК как он лежит на диске. FEEDBACK называет что чинить — правь названное, остальное не трогай.\n$START_CONTENT\n${draft}$END_CONTENT\n$END_PREVIOUS`)
  parts.push(`$START_OUTPUT\nПиши файл по пути .agent/staging/PLAN~draft.md инструментом write, затем один раз workflow_result:\n{ "track": "ok", "artifact": ".agent/staging/PLAN~draft.md" }\n$END_OUTPUT`)
  return parts.join("\n\n")
}

export function repairOrder(input: PlanInput, plan: string, blockers: string[]): string {
  const parts = [
    `$START_TASK\nТы планировщик. Правь план по замечаниям — ТОЛЬКО названное, остальное не трогай.\n${specOf(input.cwd).trim()}\n$END_TASK`,
    `$START_PREVIOUS\npath: staging\nПЛАН, который нужно починить.\n$START_CONTENT\n${plan}$END_CONTENT\n$END_PREVIOUS`,
    `$START_FEEDBACK\n${blockers.join("\n")}\n$END_FEEDBACK`,
    `$START_OUTPUT\nПравь файл .agent/staging/PLAN~draft.md инструментом edit, затем workflow_result.\n$END_OUTPUT`,
  ]
  return parts.join("\n\n")
}
