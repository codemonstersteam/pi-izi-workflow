// MODULE_CONTRACT: plan — шаг 1: planner пишет план, судья формы проверяет
// io:         fs; agent (planner); invoke (ask)
// Invariants: круг тратится только на красный судью; обрыв НЕ тратит; blocked → вопрос.
// Interface:  writePlan(input, ctx) -> Result<string>
import { ok, fail, type Result } from "../../ext/result.ts"
import type { FunctionContext } from "../../ext/context.ts"
import { readAt, writeAt, copyAt, existsAt } from "../../ext/io.ts"
import { PLAN_DRAFT, PLAN, TASK } from "../../ext/paths.ts"
import { judgeForm, countReqs, countRows } from "./judge.ts"
import { planOrder, repairOrder } from "./order.ts"
import { askWithRetry } from "../../ext/engine/ask-retry.ts"

const LOOPS = 3

const ENVELOPE = {
  type: "object",
  properties: {
    track: { type: "string", enum: ["ok", "err"] },
    artifact: { type: "string" },
    kind: { type: "string", enum: ["blocked", "invalid", "crashed"] },
    subject: { type: "string" },
  },
  required: ["track"],
  additionalProperties: false,
}

export interface PlanInput { cwd: string; key: string }

export async function writePlan(input: PlanInput, ctx: FunctionContext): Promise<Result<string>> {
  const { cwd } = input
  ctx.log("план: пишу")

  if (existsAt(cwd, PLAN)) {
    ctx.log(`план: уже готов — ${countReqs(readAt(cwd, PLAN))} требований, ${countRows(readAt(cwd, PLAN))} строк Ф`)
    return ok(readAt(cwd, PLAN))
  }

  let draft = readAt(cwd, PLAN_DRAFT)
  let blockers: string[] = []
  let round = 1

  // INVARIANT: обрыв (err без blocked) и blocked НЕ тратят круг —
  // round++ только при красном судье. Цикл — while, не for.
  while (round <= LOOPS) {
    // круг 1 — первичный наряд; круг ≥ 2 — наряд починки с FEEDBACK
    // PRECONDITION repairOrder: blockers непусты (иначе — первичный наряд)
    const order = round > 1 && blockers.length > 0
      ? repairOrder(input, draft, blockers)
      : planOrder(input, draft)

    const answer = await ctx.agent(
      order,
      { role: "planner", outputSchema: ENVELOPE },
      "solo:plan",
    )

    // planner упёрся — вопрос оператору, круг НЕ тратится
    if (answer && answer.track === "err" && answer.kind === "blocked") {
      const askR = await askWithRetry([String(answer.subject || "")], ctx)
      if (!askR.ok) return askR
      const resolved = askR.value
      draft += `\n\n$START_ANSWERED\n${resolved.join("\n")}\n$END_ANSWERED`
      continue // round НЕ меняется
    }
    // обрыв — круг НЕ тратится
    if (answer && answer.track === "err") continue

    draft = readAt(cwd, PLAN_DRAFT)
    blockers = judgeForm(draft, readAt(cwd, TASK), cwd)
    if (blockers.length === 0) {
      copyAt(cwd, PLAN_DRAFT, PLAN)
      ctx.log(`план: готов — ${countReqs(draft)} требований, ${countRows(draft)} строк Ф`)
      return ok(draft)
    }

    ctx.log(`план: круг ${round}/${LOOPS} — ${blockers.length} замечаний`)
    round++ // круг потрачен ТОЛЬКО на красный судью
  }

  return fail("escalate", `план не прошёл судью за ${LOOPS} круга: ${blockers.join("; ").slice(0, 200)}`)
}

// repairPlan — planner получает существующий план + блокеры, правит названное
export async function repairPlan(
  plan: string,
  blockers: string[],
  input: PlanInput,
  ctx: FunctionContext,
): Promise<Result<string>> {
  const { cwd } = input
  writeAt(cwd, PLAN_DRAFT, plan)

  const answer = await ctx.agent(
    repairOrder(input, plan, blockers),
    { role: "planner", outputSchema: ENVELOPE },
    "solo:repair",
  )
  if (answer && answer.track === "err")
    return fail("blocked", String(answer.subject || "planner недоступен"))

  const repaired = readAt(cwd, PLAN_DRAFT)
  if (!repaired.trim())
    return fail("blocked", "planner не написал план — починка не состоялась")

  const form = judgeForm(repaired, readAt(cwd, TASK), cwd)
  if (form.length > 0) return fail("escalate", form.join("\n"))

  copyAt(cwd, PLAN_DRAFT, PLAN)
  return ok(repaired)
}
