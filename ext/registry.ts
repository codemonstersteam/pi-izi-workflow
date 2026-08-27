// MODULE_CONTRACT: registry — словарь шагов и ролей solo
// Purpose:    одно решение: какие шаги существуют и где лежат их роли. Имя шага = папка
//             steps/<id>/; голова шага = <последний сегмент>.step.ts; роли — .md в той же
//             папке (паттерн step9-rework: «шаг = папка с промптами и скриптами»).
// io:         none
// Invariants: реестр един; шов (vocabulary-тест) сверяет объявленное с диском в обе стороны.
// Interface:  STEPS, ROLES, MODULES
export const STEPS = ["plan", "plan-check", "execute"] as const
export type StepId = (typeof STEPS)[number]

// роли по шагам: ключ — id шага, значение — имена .md в его папке (имя файла = имя роли)
export const ROLES: Record<StepId, string[]> = {
  plan: ["planner"],
  "plan-check": ["critic"],
  execute: ["dev"],
}

// id → файл головы шага (динамический import в engine)
export const MODULES: Record<StepId, string> = {
  plan: "../steps/plan/plan.step.ts",
  "plan-check": "../steps/plan-check/plan-check.step.ts",
  execute: "../steps/execute/execute.step.ts",
}
