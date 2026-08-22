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
  description: "First act of a run: build the pipeline state, or CONTINUE the one the trace remembers. Time and the run id come from OUTSIDE — the sandbox has no Date. Returns {track, state, from, continued}.",
  input: { type: "object", properties: { cwd: { type: "string" }, run: { type: "string" }, key: { type: "string" }, budgets: ANY }, required: ["cwd", "run"], additionalProperties: false },
  output: ANY,
  run: (input) => _stepStart(input),
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

// КАТАЛОГИ РОЛЕЙ СЧИТАЮТСЯ ИЗ ДЕРЕВА, а не перечисляются поимённо.
// BUG_FIX_CONTEXT: список был написан руками, и чистка T20 унесла из него два каталога. Хост
// сканирует каждый URL при регистрации (validation.js::scanRoleFiles) и валит загрузку расширения на
// несуществующем — а отказ на краю сказал бы «перезапусти pi», что неверно и уводит в сторону.
// Здесь список СЧИТАЕТСЯ: каталог шага попадает в роли тогда и только тогда, когда в нём лежит *.md.
import { readdirSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { join } from "node:path"

const STEPS_ROOT = fileURLToPath(new URL("../steps/", import.meta.url))
const roleDirs = (dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name === "component" || e.name === "judge" || e.name === "fixture") continue
    const p = join(dir, e.name)
    if (readdirSync(p).some((n) => n.endsWith(".md") && !n.endsWith("-ru.md"))) out.push(new URL(`file://${p}/`))
    roleDirs(p, out)
  }
  return out
}

export default function extension(pi) {
  pi.registerTool(iziAnswer)
  registerWorkflowExtension({
    version: "2.0.0",
    headline: "izi: three verbs at the boundary — stepStart, stepNext, stepFold",
    description: "The pipeline's whole host surface. A step module decides WHAT to do and the rail does it; the boundary carries one JSON object each way, because a callback does not cross a process boundary. Plus the izi_answer tool (pi.registerTool, not a sandbox function) — without it the operator cannot answer at all — and the role directories, computed from the steps tree.",
    functions: { stepStart, stepNext, stepFold },
    roleDirectories: roleDirs(STEPS_ROOT),
  })
}
