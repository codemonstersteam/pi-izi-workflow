// MODULE_CONTRACT: order — наряды роли planner (первичный + починка)
// Purpose:    одно решение: ЧТО видит planner. Промпты живут в .tpl шаблонах;
//             этот модуль только подставляет данные в плейсхолдеры.
// io:         fs (чтение TASK/спеки/шаблонов)
// Interface:  planOrder, repairOrder
import { readFileSync } from "node:fs"
import { readAt } from "../../ext/io.ts"
import { TASK } from "../../ext/paths.ts"
import type { PlanInput } from "./plan.ts"

const STAGING = ".agent/staging/PLAN~draft.md"

const tpl = (name: string): string =>
  readFileSync(new URL(`./${name}`, import.meta.url).pathname, "utf8")

const fill = (text: string, slots: Record<string, string>): string => {
  let out = text
  for (const [k, v] of Object.entries(slots)) out = out.split(`{${k}}`).join(v)
  return out
}

const specOf = (cwd: string): string => {
  const own = readAt(cwd, "PROMPT.md")
  return own.trim() ? own : readFileSync(new URL("../../ext/spec/PROMPT.default.md", import.meta.url).pathname, "utf8")
}

export function planOrder(input: PlanInput, draft: string): string {
  const previous = draft.trim()
    ? `$START_PREVIOUS\npath: ${STAGING}\nYOUR DRAFT. FEEDBACK names what to fix — fix only what is named, touch nothing else.\n$START_CONTENT\n${draft}$END_CONTENT\n$END_PREVIOUS`
    : ""
  return fill(tpl("order-plan.tpl"), {
    SPEC: specOf(input.cwd).trim(),
    TASK: readAt(input.cwd, TASK),
    PREVIOUS: previous,
    STAGING: STAGING,
  })
}

export function repairOrder(input: PlanInput, plan: string, blockers: string[]): string {
  return fill(tpl("order-repair.tpl"), {
    SPEC: specOf(input.cwd).trim(),
    PLAN: plan,
    FEEDBACK: blockers.join("\n"),
    STAGING: STAGING,
  })
}
