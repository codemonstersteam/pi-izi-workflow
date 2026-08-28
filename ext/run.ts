// MODULE_CONTRACT: run — вся полоса solo: три шага последовательно
// Purpose:    одно решение: порядок шагов. plan → check → execute. Каждая функция —
//             один шаг, каждая возвращает Result. Никакой машины состояний.
// io:         через шаги (agent, fs, git)
// Invariants: шаг не начинается, пока предыдущий не вернул ok.
// Interface:  run(input, ctx) -> WorkflowResult
import { readAt, existsAt } from "./io.ts"
import { TASK } from "./paths.ts"
import type { FunctionContext } from "./context.ts"
import { writePlan, type PlanInput } from "../steps/plan/plan.ts"
import { checkPlan } from "../steps/plan-check/check.ts"
import { executePlan } from "../steps/execute/execute.ts"

export async function run(
  input: { key?: string },
  ctx: FunctionContext,
): Promise<{ track: string; [k: string]: unknown }> {
  const cwd = ctx.run.cwd
  const task = readAt(cwd, TASK)
  if (!task.trim())
    return { track: "err", kind: "no-task", subject: "TASK.md пуст или отсутствует" }

  const planInput: PlanInput = { cwd, key: input.key || "" };

  // шаг 1: план
  const plan = await writePlan(planInput, ctx);
  if (plan.ok !== true) return toErr(plan.error);

  // шаг 2: проверка
  const approved = await checkPlan(plan.value, planInput, ctx);
  if (approved.ok !== true) return toErr(approved.error);

  // шаг 3: разработка
  const done = await executePlan(approved.value, planInput, ctx);
  if (done.ok !== true) return toErr(done.error);

  return { track: "ok", summary: done.value };
}

function toErr(e: { kind: string; detail: string }) {
  return { track: "err", kind: e.kind, subject: e.detail };
}
