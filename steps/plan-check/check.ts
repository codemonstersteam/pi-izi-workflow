// MODULE_CONTRACT: check — шаг 2: критик судит, вопросы оператору, подтверждение
// Purpose:    одно решение: как план становится УТВЕРЖДЁННЫМ. Критик (роль) судит смысл;
//             REJECT → repairPlan; вопросы → оператору → ответы в план; подтверждение
//             словами («да» → execute, «нет» → repairPlan с причиной).
// io:         fs (чтение/запись PLAN); agent (critic); invoke (ask)
// Invariants: круг тратится на REJECT/отклонение; ответы вписываются в план до confirm.
// Interface:  checkPlan(plan, input, ctx) -> Result<string>
import { ok, fail, type Result } from "../../ext/result.ts"
import type { FunctionContext } from "../../ext/context.ts"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { readAt, writeAt, existsAt } from "../../ext/io.ts"
import { PLAN, CONFIRMED, PLAN_DRAFT, TASK } from "../../ext/paths.ts"
import { extractQuestions, applyAnswers } from "./questions.ts"
import { card } from "./card.ts"
import { judgeForm, countRows } from "../plan/judge.ts"
import { askWithRetry } from "../../ext/engine/ask-retry.ts"
import { repairPlan, type PlanInput } from "../plan/plan.ts"

const LOOPS = 3

export async function checkPlan(
  plan: string,
  input: PlanInput,
  ctx: FunctionContext,
): Promise<Result<string>> {
  let current = plan

  // resume: план уже подтверждён → пропустить шаг
  if (existsAt(input.cwd, CONFIRMED)) {
    ctx.log("проверка: план уже утверждён")
    return ok(readAt(input.cwd, PLAN))
  }

  for (let round = 1; round <= LOOPS; round++) {
    // ── критик ──
    ctx.log("проверка: критик")
    const verdict = await ctx.agent(
      criticOrder(current),
      { role: "critic", outputSchema: VERDICT_SCHEMA },
      "solo:critic",
    )

    if (verdict && verdict.verdict === "APPROVE") {
      // ── вопросы плана оператору ──
      const open = extractQuestions(current)
      if (open.length > 0) {
        ctx.log(`проверка: вопросы оператору (${open.length})`)
        ctx.log(`⏳ ЖДУ ${open.length} ОТВЕТОВ В ЧАТЕ (формат: «1. …», можно одним сообщением) · план: ${join(input.cwd, ".agent/PLAN.md")}`)
        const askR = await askWithRetry(open, ctx)
        if (!askR.ok) return askR
        const answers = askR.value
        current = applyAnswersToPlan(current, readAt(input.cwd, ".agent/answers.md"), input, ctx)
      }

      // ── сверка: planner проверяет РЕШЕНО против ВСЕХ разделов ──
      current = await plannerReconcile(current, input, ctx)
      writeAt(input.cwd, PLAN, current)

      // ── подтверждение ──
      ctx.log(card(current, input.cwd))
      ctx.log(`⏳ ЖДУ ОТВЕТ В ЧАТЕ: «да» — запуск разработки · «нет: причина» — починка плана · план: ${join(input.cwd, ".agent/PLAN.md")} (дубль: .agent/question.txt)`)
      const replyR = await askWithRetry(
        [`${card(current, input.cwd)}\nЗапускаем разработку? да / нет: причина`],
        ctx,
      )
      if (!replyR.ok) return replyR
      const said = replyR.value.join(" ").trim().toLowerCase()
      if (/^(да|yes|ok|согласен|approve)/.test(said)) {
        writeAt(input.cwd, CONFIRMED, new Date().toISOString())
        ctx.log("проверка: план утверждён")
        return ok(current)
      }

      ctx.log(`проверка: круг ${round}/${LOOPS} — оператор отклонил`)
      const repaired = await repairPlan(current, [`operator rejected: ${said}`], input, ctx)
      if (!repaired.ok) return repaired
      current = repaired.value
      continue
    }

    // ── критик REJECT → planner с блокерами ──
    ctx.log(`проверка: круг ${round}/${LOOPS} — критик отклонил (${(verdict?.blockers || []).length})`)
    const repaired = await repairPlan(current, verdict?.blockers || ["critic rejected with no blockers"], input, ctx)
    if (!repaired.ok) return repaired
    current = repaired.value
  }

  return fail("escalate", `проверка не прошла за ${LOOPS} круга`)
}

// applyAnswersToPlan — применить ответы с проверкой постусловия «вписаны ВСЕ»
function applyAnswersToPlan(plan: string, answersMd: string, input: PlanInput, ctx: FunctionContext): string {
  const r = applyAnswers(plan, answersMd)
  if (!r.ok) {
    ctx.log(`проверка: ОТВЕТЫ НЕ ВПИСАНЫ — ${r.error.detail}`)
    return plan // продолжаем с исходным планом, вопрос повторится на следующем круге
  }
  if (r.value.applied < r.value.total)
    ctx.log(`проверка: вписано ${r.value.applied}/${r.value.total} ответов`)
  return r.value.plan
}

// plannerReconcile — после применения ответов planner сверяет РЕШЕНО со ВСЕМИ разделами
async function plannerReconcile(
  plan: string,
  input: PlanInput,
  ctx: FunctionContext,
): Promise<string> {
  const tpl = readFileSync(new URL("./order.reconcile.tpl", import.meta.url).pathname, "utf8")
  const text = tpl.replace("{PLAN}", plan).replace("{STAGING}", PLAN_DRAFT)

  // Записать ТЕКУЩИЙ план (с РЕШЕНО) в staging ДО вызова planner:
  // без этого planner пишет СВОЙ вариант в staging и стирает отметки ответов.
  writeAt(input.cwd, PLAN_DRAFT, plan)

  await ctx.agent(text, { role: "planner", outputSchema: ENVELOPE }, "solo:reconcile")

  const updated = readAt(input.cwd, PLAN_DRAFT)
  if (!updated.trim()) return plan

  // Если planner переписал план БЕЗ RESOLVED — ответы потеряны, вернуть исходный
  const hadResolved = (plan.match(/→ RESOLVED/g) || []).length
  const hasResolved = (updated.match(/→ RESOLVED/g) || []).length
  if (hadResolved > 0 && hasResolved < hadResolved) {
    ctx.log(`сверка: planner потерял ${hadResolved - hasResolved} RESOLVED — использую исходный`)
    return plan
  }

  const blockers = judgeForm(updated, readAt(input.cwd, TASK), input.cwd)
  if (blockers.length > 0) return plan

  const was = countRows(plan)
  const now = countRows(updated)
  if (now !== was) ctx.log(`сверка: ${was} → ${now} строк C`)
  return updated
}

function criticOrder(plan: string): string {
  const tpl = readFileSync(new URL("./order-critic.tpl", import.meta.url).pathname, "utf8")
  return tpl.replace("{PLAN}", plan)
}

const ENVELOPE = {
  type: "object",
  properties: {
    track: { type: "string", enum: ["ok", "err"] },
    artifact: { type: "string" },
    kind: { type: "string" },
    subject: { type: "string" },
  },
  required: ["track"],
  additionalProperties: false,
}

const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    track: { type: "string", enum: ["ok", "err"] },
    verdict: { type: "string", enum: ["APPROVE", "REJECT"] },
    blockers: { type: "array", items: { type: "string" } },
    questions: { type: "array", items: { type: "string" } },
  },
  required: ["track", "verdict"],
  additionalProperties: false,
}
