// MODULE_CONTRACT: context — что хост даёт зарегистрированной функции
// Purpose:    одно решение: через что функция общается с внешним миром. Всё io — здесь.
// io:         всё внешнее (agent, log, invoke/ask)
// Interface:  FunctionContext
export interface FunctionContext {
  run: { cwd: string; runId: string }
  agent: (text: string, opts?: { role?: string; outputSchema?: unknown }, callsite?: string) => Promise<any>
  log: (message: string) => void
  invoke: (name: string, input: unknown) => Promise<any>
}
