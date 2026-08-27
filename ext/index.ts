// MODULE_CONTRACT: index — точка входа пакета solo
// Purpose:    одно решение: ЧТО хост видит. Одна функция `solo` (вся полоса) +
//             инструмент solo_answer (реле ответов) + ask (вопрос в чат).
// io:         через подключаемые модули
// Interface:  default(pi)
import { registerWorkflowExtension } from "pi-extensible-workflows"
import { run } from "./run.ts"
import { ask, setPi } from "./ask.ts"
import { soloAnswer } from "./answer-tool.ts"

const ANY = { type: "object", additionalProperties: true }

export default function register(pi: any) {
  setPi(pi)
  pi.registerTool(soloAnswer)
  registerWorkflowExtension({
    version: "3.0.0",
    headline: "solo: план → проверка → разработка (три шага, три функции)",
    description: "Модель с глазами на код пишет план; судьи и критик проверяют; оператор утверждает; dev коммитит по строкам Ф.",
    functions: {
      solo: {
        description: "Run the full solo workflow: plan → check → execute. Returns final summary or error.",
        input: { type: "object", properties: { key: { type: "string" } }, additionalProperties: false },
        output: ANY,
        run: (input: any, ctx: any) => run(input, ctx),
      },
      ask,
    },
    roleDirectories: [
      new URL("../steps/plan/", import.meta.url).pathname,
      new URL("../steps/plan-check/", import.meta.url).pathname,
      new URL("../steps/execute/", import.meta.url).pathname,
    ],
  })
}
