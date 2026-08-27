// MODULE_CONTRACT: check — шаг 2: критик судит, вопросы оператору, подтверждение
// Purpose:    одно решение: как план становится УТВЕРЖДЁННЫМ. Критик (роль) судит смысл;
//             REJECT → repairPlan; вопросы → оператору → ответы в план; подтверждение
//             словами («да» → execute, «нет» → repairPlan с причиной).
// io:         fs (чтение/запись PLAN); agent (critic); invoke (ask)
// Invariants: круг тратится на REJECT/отклонение; ответы вписываются в план до confirm.
// Interface:  checkPlan(plan, input, ctx) -> Result<string>
import { ok, fail, type Result } from "../../ext/result.ts"
import type { FunctionContext } from "../../ext/context.ts"
import { readAt, writeAt, existsAt } from "../../ext/io.ts"
import { PLAN, CONFIRMED } from "../../ext/paths.ts"
import { extractQuestions, applyAnswers } from "./questions.ts"
import { card } from "./card.ts"
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
        const answers = await askWithRetry(open, ctx)
        current = applyAnswers(current, readAt(input.cwd, ".agent/answers.md"))
        writeAt(input.cwd, PLAN, current)
      }

      // ── подтверждение ──
      ctx.log("проверка: подтверждаю у оператора")
      const reply = await askWithRetry(
        [`${card(current, input.cwd)}\nЗапускаем разработку? да / нет: причина`],
        ctx,
      )
      const said = reply.join(" ").trim().toLowerCase()
      if (/^(да|yes|ok|согласен|approve)/.test(said)) {
        writeAt(input.cwd, CONFIRMED, new Date().toISOString())
        ctx.log("проверка: план утверждён")
        return ok(current)
      }

      ctx.log(`проверка: круг ${round}/${LOOPS} — оператор отклонил`)
      const repaired = await repairPlan(current, [`оператор отклонил: ${said}`], input, ctx)
      if (!repaired.ok) return repaired
      current = repaired.value
      continue
    }

    // ── критик REJECT → planner с блокерами ──
    ctx.log(`проверка: круг ${round}/${LOOPS} — критик отклонил (${(verdict?.blockers || []).length})`)
    const repaired = await repairPlan(current, verdict?.blockers || ["критик отверг без блокеров"], input, ctx)
    if (!repaired.ok) return repaired
    current = repaired.value
  }

  return fail("escalate", `проверка не прошла за ${LOOPS} круга`)
}

function criticOrder(plan: string): string {
  return [
    `$START_TASK\nТы критик плана. Прочитай план ниже и проверь по чек-листу — выборочно сверяй с кодом (read):\n1. ТРЕБОВАНИЯ: каждая строка — цитата из TASK, и место закрытия реально закрывает её.\n2. ИЗМЕНЕНИЯ: пути существуют или честно «новый» с образцом; контракт соответствует коду.\n3. СЦЕНАРИИ: до и после различны; «до» — текущий код.\n4. ВЕЛИЧИНЫ: у каждой источник.\n5. ГАРАНТИИ: поимённы и правдоподобны.\n6. ОТКРЫТЫЕ ВОПРОСЫ: решения оператора, не молчаливые допущения.\nВердикт: APPROVE или REJECT с ≤3 блокеров (адрес + что сломает).\n$END_TASK`,
    `$START_DATA\n$START_CONTENT\n${plan}$END_CONTENT\n$END_DATA`,
    `$START_OUTPUT\n{ "track": "ok", "verdict": "APPROVE" } или { "track": "ok", "verdict": "REJECT", "blockers": ["…"] }\n$END_OUTPUT`,
  ].join("\n\n")
}

// outputSchema для критика: хост валидирует и возвращает объект, не текст
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
