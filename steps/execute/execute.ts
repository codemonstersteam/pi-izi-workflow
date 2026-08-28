// MODULE_CONTRACT: execute — шаг 3: dev по строкам Ф, судьи a/b/c
// Purpose:    одно решение: как план становится коммитами. Dev (роль) работает по строкам
//             Ф (итерация = строка = коммит); судьи проверяют покрытие/тесты/гарантии;
//             нарушения → круг починки с FEEDBACK.
// io:         fs (чтение PLAN); agent (dev); proc (git для судей)
// Interface:  executePlan(plan, input, ctx) -> Result<string>
import { ok, fail, type Result } from "../../ext/result.ts"
import type { FunctionContext } from "../../ext/context.ts"
import { readAt } from "../../ext/io.ts"
import { PLAN } from "../../ext/paths.ts"
import { countRows } from "../plan/judge.ts"
import { judgeSolve, doneCard } from "./judges.ts"
import { askWithRetry } from "../../ext/engine/ask-retry.ts"
import type { PlanInput } from "../plan/plan.ts"
import { execSync } from "node:child_process"

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

export async function executePlan(
  plan: string,
  input: PlanInput,
  ctx: FunctionContext,
): Promise<Result<string>> {
  const rows = countRows(plan)
  const before = gitHead(input.cwd)
  ctx.log(`разработка: ${rows} строк Ф`)

  let findings = ""

  for (let round = 1; round <= LOOPS; round++) {
    const answer = await ctx.agent(devOrder(plan, findings), { role: "dev" }, "solo:dev")

    // dev упёрся — вопрос оператору
    if (answer && answer.track === "err" && answer.kind === "blocked") {
      const resolved = await askWithRetry([String(answer.subject || "")], ctx)
      findings = `ответ оператора: ${resolved.join(" ")}`
      continue
    }
    // обрыв — круг НЕ тратится
    if (answer && answer.track === "err") continue

    const violations = judgeSolve({ cwd: input.cwd, plan, since: before })
    if (violations.length === 0) {
      const done = doneCard(input.cwd, plan, before)
      ctx.log(`разработка: готова — ${rows}/${rows} строк, судьи зелёные`)
      ctx.log(done)
      return ok(done)
    }

    ctx.log(`разработка: круг ${round}/${LOOPS} — ${violations.length} нарушений`)
    findings = violations.join("\n")
  }

  return fail("escalate", `разработка не прошла судей за ${LOOPS} круга: ${findings.slice(0, 200)}`)
}

function devOrder(plan: string, findings: string): string {
  const parts = [
    `$START_TASK\nРазработай по плану ниже. Правила:\n1. работай маленькими итерациями с тестами; итерация = строка Ф = коммит\n2. величины — только из раздела 4; гарантии раздела 5 нерушимы\n3. существующие тесты не переписывать\nБаг плана нашёл по мелочи — правь PLAN.md с обоснованием в коммите.\nНужно изменить поведение/требование/гарантию — верни err-конверт kind="blocked" с вопросом.\n$END_TASK`,
    `$START_DATA\n$START_DOCUMENT\npath: ${PLAN}\nУтверждённый план — единственная инструкция. Вопросы оператора решены («→ РЕШЕНО»).\n$END_DOCUMENT\n$START_CONTENT\n${plan}$END_CONTENT\n$END_DATA`,
  ]
  if (findings.trim())
    parts.push(`$START_FEEDBACK\n${findings}\n$END_FEEDBACK`)
  parts.push(`$START_OUTPUT\nРаботай read/bash/edit/write; коммить сам (git add -A && git commit).\nЗакончив ВСЕ строки Ф — workflow_result: { "track": "ok" }.\n$END_OUTPUT`)
  return parts.join("\n\n")
}

function gitHead(cwd: string): string {
  try { return execSync("git rev-parse HEAD", { cwd, encoding: "utf8" }).trim() } catch { return "" }
}
