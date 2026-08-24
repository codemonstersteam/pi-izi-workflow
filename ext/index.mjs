// MODULE_CONTRACT: ext — расширение pi для конвейера izi. ГРАНИЦА, и она узкая
// Purpose:    одно решение спрятано здесь: ЧТО песочница вообще умеет попросить. Три функции, и
//             больше ничего: stepStart · stepNext · stepFold. Полоса не знает ни одного шага по
//             имени файла, ни одного гардрейла, ни одного артефакта — она знает три глагола.
// io:         fs (через мост и модули шагов)
// EXTERNAL_DEPENDENCY: pi-extensible-workflows::registerWorkflowExtension — контракт хоста; принимает
//             ровно пять возможностей (registry.js:43), и лишний ключ верхнего уровня валит загрузку.
// Invariants: расширение подключено ПО ПУТИ в ~/.pi/agent/settings.json, а не установлено пакетом:
//             правка здесь живая после перезапуска СЕССИИ pi и только после него.
// Interface:  stepStart, stepNext, stepFold + default (регистрация)
//
// БЫЛО 55 ЭКСПОРТОВ. Каждый из них был решением о шаге, вынесенным на границу: `checkBrd`, `digest`,
// `treeOrder`, `planbook`… — полоса знала внутренности всех десяти шагов и звала их по одному.
// Куда уехала каждая — docs/phase/plan/host-functions.md (тикет T20).

import { registerWorkflowExtension } from "pi-extensible-workflows"
import { stepStart as _stepStart, stepNext as _stepNext, stepFold as _stepFold } from "./bridge.mjs"
import { iziAnswer } from "./answer-tool.mjs"

const ANY = { type: "object", additionalProperties: true }

export const stepStart = {
  description: "First act of a run: build the pipeline state, or CONTINUE the one the trace remembers. `cwd` and `run` come from the HOST CONTEXT — the sandbox has no Date and does not know the run id. Returns {track, state, from, continued}.",
  input: { type: "object", properties: { cwd: { type: "string" }, run: { type: "string" }, key: { type: "string" }, budgets: ANY }, additionalProperties: false },
  output: ANY,
  // КАТАЛОГ И НОМЕР ПРОГОНА БЕРУТСЯ У ХОСТА, А НЕ У ПОЛОСЫ. Хост зовёт функцию расширения как
  // `run(input, context)`, и `context.run` несёт `{ cwd, sessionId, runId, args, signal }`
  // (pi-extensible-workflows/packages/core/src/types.ts:118-119). Раньше полоса читала их из
  // `args`, а `prompts/izi.md` передавать `args` ЗАПРЕЩАЕТ — живой прогон 24.08.2026 умирал на
  // `Invalid input for stepStart` за 63 мс и ноль токенов. Явное значение по-прежнему побеждает:
  // на нём стоят юниты (ext/bridge.test.mjs) и стенд.
  run: (input, ctx) => _stepStart({ cwd: ctx?.run?.cwd, run: ctx?.run?.runId, ...input }),
}

export const stepNext = {
  description: "Ask a step what to do next. Returns ONE instruction built by its constructor — role | roles | ask | say | done | err. An unknown step id, a broken state or a step that throws all come back as {do:'err'} WITH A NAME, never as a TypeError in the rail.",
  input: { type: "object", properties: { id: { type: "string" }, state: ANY }, required: ["id", "state"], additionalProperties: false },
  output: ANY,
  run: (input) => _stepNext(input),
}

export const stepFold = {
  description: "Hand a step the answer to its instruction. Returns {track:'ok', value: state} or {track:'err', …} — the rail MUST check the track before touching the state, or a refusal silently becomes state=undefined.",
  input: { type: "object", properties: { id: { type: "string" }, state: ANY, event: ANY }, required: ["id", "state", "event"], additionalProperties: false },
  output: ANY,
  run: (input) => _stepFold(input),
}

// КАТАЛОГИ РОЛЕЙ ОБЪЯВЛЕНЫ, а не считаются обходом дерева: `ext/roles.mjs`, и оба дефекта, которые
// за этим стоят, записаны там. Коротко: хост берёт из отданного каталога КАЖДЫЙ `.md` и делает из
// него роль по имени файла, поэтому обход по признаку «в каталоге есть *.md» тащил в реестр
// проектные записки — три файла `data-flow.md` дали три роли «data-flow», и расширение перестало
// грузиться вовсе.
import { fileURLToPath } from "node:url"
import { roleDirsOf } from "./roles.mjs"

const STEPS_ROOT = fileURLToPath(new URL("../steps/", import.meta.url))

export default function extension(pi) {
  pi.registerTool(iziAnswer)
  registerWorkflowExtension({
    version: "2.0.0",
    headline: "izi: three verbs at the boundary — stepStart, stepNext, stepFold",
    description: "The pipeline's whole host surface. A step module decides WHAT to do and the rail does it; the boundary carries one JSON object each way, because a callback does not cross a process boundary. Plus the izi_answer tool (pi.registerTool, not a sandbox function) — without it the operator cannot answer at all — and the role directories, declared in ext/roles.mjs.",
    functions: { stepStart, stepNext, stepFold },
    roleDirectories: roleDirsOf(STEPS_ROOT),
  })
}
