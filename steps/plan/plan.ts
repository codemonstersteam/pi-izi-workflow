// MODULE_CONTRACT: plan — шаг 1: planner пишет план, судья формы проверяет
// Purpose:    одно решение: как рождается принимаемый план. Planner (роль с глазами на код)
//             пишет по спеке; судья-скрипт проверяет форму (6 разделов, цитаты, пути, источники);
//             красное → круг починки с FEEDBACK; blocked → вопрос оператору.
// io:         fs (чтение TASK/спеки, запись staging); agent (planner); invoke (ask)
// Invariants: круг тратится только на красный судью; обрыв не тратит; выход — план или escalate.
// Interface:  writePlan(input, ctx) -> Result<string>
import { ok, fail, type Result } from "../../ext/result.ts"
import type { FunctionContext } from "../../ext/context.ts"
import { readAt, writeAt, copyAt, existsAt } from "../../ext/io.ts"
import { PLAN_DRAFT, PLAN, TASK } from "../../ext/paths.ts"
import { judgeForm, countReqs, countRows } from "./judge.ts"
import { planOrder, repairOrder } from "./order.ts"
import { askWithRetry } from "../../ext/engine/ask-retry.ts"

const LOOPS = 3

export interface PlanInput { cwd: string; key: string }

export async function writePlan(input: PlanInput, ctx: FunctionContext): Promise<Result<string>> {
  const { cwd } = input
  ctx.log("план: пишу")

  // resume: план уже принят → пропустить шаг
  if (existsAt(cwd, PLAN)) {
    ctx.log(`план: уже готов — ${countReqs(readAt(cwd, PLAN))} требований, ${countRows(readAt(cwd, PLAN))} строк Ф`)
    return ok(readAt(cwd, PLAN))
  }

  let draft = readAt(cwd, PLAN_DRAFT) // resume: свой черновик как PREVIOUS

  for (let round = 1; round <= LOOPS; round++) {
    const answer = await ctx.agent(
      planOrder(input, draft),
      { role: "planner" },
      "solo:plan",
    )

    // planner упёрся — вопрос оператору, ответ в следующий круг
    if (answer && answer.track === "err" && answer.kind === "blocked") {
      const resolved = await askWithRetry([String(answer.subject || "")], ctx)
      draft += `\n\n$START_ANSWERED\n${resolved.join("\n")}\n$END_ANSWERED`
      continue
    }
    // обрыв — круг НЕ тратится
    if (answer && answer.track === "err") continue

    draft = readAt(cwd, PLAN_DRAFT)
    const blockers = judgeForm(draft, readAt(cwd, TASK), cwd)
    if (blockers.length === 0) {
      copyAt(cwd, PLAN_DRAFT, PLAN)
      ctx.log(`план: готов — ${countReqs(draft)} требований, ${countRows(draft)} строк Ф`)
      return ok(draft)
    }

    ctx.log(`план: круг ${round}/${LOOPS} — ${blockers.length} замечаний`)
  }

  return fail("escalate", `план не прошёл судью за ${LOOPS} круга`)
}

// repairPlan — planner получает существующий план + блокеры, правит названное
export async function repairPlan(
  plan: string,
  blockers: string[],
  input: PlanInput,
  ctx: FunctionContext,
): Promise<Result<string>> {
  const { cwd } = input
  writeAt(cwd, PLAN_DRAFT, plan) // план в staging для правки

  const answer = await ctx.agent(
    repairOrder(input, plan, blockers),
    { role: "planner" },
    "solo:repair",
  )
  if (answer && answer.track === "err") return fail("blocked", String(answer.subject || "planner недоступен"))

  const repaired = readAt(cwd, PLAN_DRAFT)
  const form = judgeForm(repaired, readAt(cwd, TASK), cwd)
  if (form.length > 0) return fail("escalate", form.join("\n"))

  copyAt(cwd, PLAN_DRAFT, PLAN)
  return ok(repaired)
}
