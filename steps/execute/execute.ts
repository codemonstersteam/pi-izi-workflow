// MODULE_CONTRACT: execute — шаг 3: dev по строкам Ф, судьи a/b/c
// io:         fs; agent (dev); proc (git)
// Invariants: круг тратится только на красный судью; обрыв НЕ тратит.
// Interface:  executePlan(plan, input, ctx) -> Result<string>
import { ok, fail, type Result } from "../../ext/result.ts"
import type { FunctionContext } from "../../ext/context.ts"
import { readFileSync } from "node:fs"
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
  let round = 1

  while (round <= LOOPS) {
    const answer = await ctx.agent(
      devOrder(plan, findings),
      { role: "dev", outputSchema: ENVELOPE },
      "solo:dev",
    )

    if (answer && answer.track === "err" && answer.kind === "blocked") {
      const askR = await askWithRetry([String(answer.subject || "")], ctx)
      if (!askR.ok) return askR
      findings = `ответ оператора: ${askR.value.join(" ")}`
      continue
    }
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
    round++
  }

  return fail("escalate", `разработка не прошла судей за ${LOOPS} круга: ${findings.slice(0, 200)}`)
}

function devOrder(plan: string, findings: string): string {
  const tpl = readFileSync(new URL("./order-dev.tpl", import.meta.url).pathname, "utf8")
  return tpl
    .replace("{PLAN}", plan)
    .replace("{FEEDBACK}", findings.trim() ? `$START_FEEDBACK\n${findings}\n$END_FEEDBACK` : "")
}

function gitHead(cwd: string): string {
  try { return execSync("git rev-parse HEAD", { cwd, encoding: "utf8" }).trim() } catch { return "" }
}
