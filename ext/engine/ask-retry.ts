// MODULE_CONTRACT: ask-retry — вопрос оператору с переспросом на пустой ответ
// io:         через ctx.invoke("ask")
// Interface:  askWithRetry(items, ctx) -> string[]
import { fail, ok, type Result } from "../result.ts"
import type { FunctionContext } from "../context.ts"

export async function askWithRetry(items: string[], ctx: FunctionContext): Promise<Result<string[]>> {
  for (let retry = 1; retry <= 2; retry++) {
    const r = await ctx.invoke("ask", { items: items.map((t) => ({ text: t })) })
    const answers = (r as any)?.answers || []
    if (answers.some((a: string) => a && String(a).trim())) return ok(answers)
  }
  return fail("escalate", `вопросы не отвечены за 2 паузы: ${items[0]?.slice(0, 60)}`)
}
