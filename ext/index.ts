// MODULE_CONTRACT: index — точка входа пакета solo (TypeScript, грузится pi через jiti)
// Purpose:    одно решение: ЧТО хост видит от пакета. Каталог-функции полосы (soloStart,
//             soloNext, soloFold — движок фаз; ask — вопрос в чат), инструмент solo_answer
//             (реле ответов оператора из чата), реестр ролей (роли лежат в папках шагов).
// io:         fs/proc — внутри подключаемых модулей
// Invariants: функции тотальны; пути — против ctx.run.cwd ПРОГОНА.
// Interface:  default(pi)
import { registerWorkflowExtension } from "pi-extensible-workflows"
import { soloStart, soloNext, soloFold } from "./engine.ts"
import { ask, setPi } from "./ask.ts"
import { soloAnswer } from "./answer-tool.ts"
import { ROLES } from "./registry.ts"

const here = (p: string) => new URL(p, import.meta.url).pathname

// каталог-функции несут форму хоста (registry.ts:63 — description/run обязательны)
const ANY = { type: "object", additionalProperties: true }
const fns = {
  soloStart: {
    description: "First act of a solo run: build the state from the project's TASK.md (or refuse with a name). cwd and run come from the HOST CONTEXT. Returns {track, state, from}.",
    input: { type: "object", properties: { key: { type: "string" } }, additionalProperties: false },
    output: ANY,
    run: (input: any, ctx: any) => soloStart(input, ctx),
  },
  soloNext: {
    description: "Ask the current phase for its next instruction — role | ask | checkpoint | say | done | err. Refusals carry do:'err' WITH kind and subject.",
    input: { type: "object", properties: { state: ANY }, required: ["state"], additionalProperties: false },
    output: ANY,
    run: (input: any) => soloNext(input),
  },
  soloFold: {
    description: "Hand a phase the answer to its instruction. Returns {track:'ok', value: state} or {track:'err', …} — the rail MUST check the track before touching the state.",
    input: { type: "object", properties: { state: ANY, event: ANY }, required: ["state", "event"], additionalProperties: false },
    output: ANY,
    run: (input: any) => soloFold(input),
  },
  ask,
}

export default function register(pi: any) {
  setPi(pi) // ask печатает вопросы В ЧАТ через pi.sendMessage
  pi.registerTool(soloAnswer)
  registerWorkflowExtension({
    version: "2.0.0",
    headline: "solo: план по спеке пишет модель с кодом; вопросы оператору — в чат; судят скрипты и критик",
    description: "Фазы plan → critic → questions(чат) → confirm(checkpoint) → execute. Полоса — inline-скрипт команды /solo (foreground); этот пакет даёт глаголы, ask и solo_answer.",
    functions: fns,
    roleDirectories: Object.keys(ROLES).map((id) => here(`../steps/${id}/`)),
  })
}
