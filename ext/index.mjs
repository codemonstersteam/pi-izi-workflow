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

// T41 — ASK: текстовые ответы оператора, несколько вопросов разом.
// checkpoint хоста возвращает ТОЛЬКО boolean (Approve/Reject) — текст ответа через него не
// проходит. Наша функция ask запускается В ХОСТ-ПРОЦЕССЕ (не в песочнице!) и имеет доступ
// к pi API. Для каждого вопроса — ui.input() (TUI свободный текст). Ответы возвращаются
// в песочтуру КАК ДАННЫЕ — полоса кладёт их в answers.md и передаёт роли в следующем наряде.
// Чат-модель НЕ участвует: TUI-диалог, 0 токелей на курьерство.
//
// T60 — ФАЙЛОВЫЙ ФОЛБЭК БЕЗ TUI. Приёмка 25.08 (станция intake, headless-раннер): до
// зарегистрированной функции ctx.ui НЕ доезжает — ui?.input молча пуст, ask возвращал
// ["", …], и шаг умирал «вопрос не отвечен за 2 паузы» за 32 секунды. Расширение имеет
// диск — поэтому файловый протокол живёт ЗДЕСЬ, рядом с TUI-веткой: вопрос N дописывается
// в <cwd>/.agent/question.txt, ответ снимается строкой «N. …» из <cwd>/.agent/answer.txt.
// Один протокол для обоих миров: TUI есть — диалог; нет — файл. Пустой items — пустой ответ.
const ASK_TIMEOUT_MS = 30 * 60 * 1000
const fileAsk = async (cwd, seq, text) => {
  const dir = join(String(cwd || process.cwd()), ".agent")
  mkdirSync(dir, { recursive: true })
  const q = join(dir, "question.txt"), a = join(dir, "answer.txt")
  if (seq === 1) { if (existsSync(a)) rmSync(a, { force: true }); writeFileSync(q, "") }
  appendFileSync(q, `[${new Date().toISOString()}]\n${seq}. ${text}\nОтветь: echo "${seq}. твой ответ" >> .agent/answer.txt\n\n`)
  console.log(`\n🔒 ВОПРОС ${seq}: ${text}\nОтветь: echo "${seq}. твой ответ" >> .agent/answer.txt`)
  const t0 = Date.now()
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000))
    if (existsSync(a)) {
      const m = readFileSync(a, "utf8").match(new RegExp(`^\\s*${seq}[).]\\s*(.*)$`, "m"))
      if (m) { console.log(`\n✅ Ответ ${seq}: ${m[1].trim().slice(0, 120)}`); return m[1].trim() }
    }
    if (Date.now() - t0 > ASK_TIMEOUT_MS) { console.log(`\n⏰ Таймаут вопроса ${seq} — пустой ответ`); return "" }
  }
}
const ask = {
  description: "Ask the operator text questions. Each item is one question; answers return as an array of strings, same order. The operator sees a TUI input per question — no chat model involved.",
  input: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } } }, required: ["items"] },
  output: { type: "object", properties: { answers: { type: "array", items: { type: "string" } } } },
  run: async (input, ctx) => {
    const answers = []
    const tui = ctx?.ui?.input?.bind(ctx.ui)
    let seq = 0
    for (const item of input.items || []) {
      const text = String(item.text || "").slice(0, 200)
      seq += 1
      const answer = tui ? await tui(text, "ответ оператора…") : await fileAsk(ctx?.run?.cwd, seq, text)
      answers.push(String(answer || "").trim())
    }
    // T60 — ОТВЕТЫ ЛОЖАТСЯ В answers.md ЗДЕСЬ. Все fold'ы полосы перечитывают .agent/answers.md
    // как единственный источник (T35: «approved» — барьер над фактом, НЕ факт), а песочница fs не
    // имеет. До этой записи ответы оператора умирали в объекте результата: fold ждал строку,
    // примитив возвращал объект — вопросный круг повторялся до escalate (приёмка 25.08, intake).
    const dir = join(String(ctx?.run?.cwd || process.cwd()), ".agent")
    if (answers.some((a) => a && a.trim())) {
      mkdirSync(dir, { recursive: true })
      appendFileSync(join(dir, "answers.md"), answers.map((a, i) => `${i + 1}. ${String(a || "").trim()}`).join("\n") + "\n")
    }
    return { answers }
  },
}

export const stepStart = {
  description: "First act of a run: build the pipeline state, or CONTINUE the one the trace remembers. `cwd` and `run` come from the HOST CONTEXT — the sandbox has no Date and does not know the run id. Returns {track, state, from, continued}.",
  input: { type: "object", properties: { cwd: { type: "string" }, run: { type: "string" }, key: { type: "string" }, budgets: ANY }, additionalProperties: false },
  output: ANY,
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
import { join } from "node:path"
import { homedir } from "node:os"
import { rmSync, existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs"
import { roleDirsOf } from "./roles.mjs"

const STEPS_ROOT = fileURLToPath(new URL("../steps/", import.meta.url))

// T41 — /izi КАК КОМАНДА: запуск workflow БЕЗ чат-модели.
// Ни захват тула, ни прокси НЕ РАБОТАЮТ: pi передаёт каждому расширению изолированный API.
// Решение — ТО ЖЕ, что bin/run.mjs: создаём МИНИМАЛЬНЫЙ pi-объект внутри команды,
// импортируем factory хоста, вызываем через наш объект → тул workflow попадает к нам.
// Реестр — синглтон (Symbol.for), функции уже зарегистрированы основным расширением —
// это НЕ конфликт: factory хоста создаёт свой набор замыканий (runs, scheduler, bridges).
import { createLocalWorkflowAgentSession, localAgentTransport } from "pi-extensible-workflows"

export default function extension(pi) {
  pi.registerTool(iziAnswer)

  registerWorkflowExtension({
    version: "2.0.0",
    headline: "izi: three verbs + ask — stepStart, stepNext, stepFold, ask",
    description: "The pipeline's whole host surface. stepStart/stepNext/stepFold drive the rail; ask collects operator answers via TUI (no chat model). Plus izi_answer tool and role directories.",
    functions: { stepStart, stepNext, stepFold, ask },
    roleDirectories: roleDirsOf(STEPS_ROOT),
  })

  // T47 — /izi УДАЛЁН как кастомная команда (спавн дочернего процесса).
  // Запуск теперь через штатный промпт /izi (prompts/izi.md): чат-модель делает
  // ОДИН tool call workflow(...) → run в pi's runs Map → /workflow видит.
  // Чат-модель = кнопка «Пуск», ~100 токелей. Дальше полоса автономна.
}
