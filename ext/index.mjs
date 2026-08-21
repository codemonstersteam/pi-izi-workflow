// MODULE_CONTRACT: ext/index.mjs — pi-extensible-workflows extension: host functions for izi's five
//               steps (task, brd, survey-plan, scope, graph, intake, weight), replacing the bin/*.mjs + shell() harness (S11), plus
//               (S13) the izi_answer tool that lets the OPERATOR window itself carry the
//               question→answer exchange
// Purpose:      one decision — the workflow sandbox has no fs/import at all ("Workflow JavaScript
//               has no imports, filesystem, network, process, or timers" — pi-extensible-workflows'
//               own SKILL.md). Two steps do not need a generic step-manifest harness reached through
//               shell("cat …") and shell("node bin/…") — they need small, named host functions the
//               workflow script calls directly as globals ("Registered functions returned by
//               workflow_catalog are globals inside workflow source" — same SKILL.md). S13 adds a
//               second surface this file is trusted for: `export default function extension(pi)` is
//               loaded by pi ITSELF as an ordinary extension (`ExtensionFactory = (pi:
//               ExtensionAPI) => void`, @earendil-works/pi-coding-agent), not only by
//               pi-extensible-workflows — the same factory both calls registerWorkflowExtension(...)
//               (sandbox globals + role directory) AND pi.registerTool(...) (a real tool the
//               INTERACTIVE session's own model can call). izi_answer exists because
//               checkpoint()'s decision (approved|rejected) is a barrier, never a fact — the fact is
//               a file, and after S13's move to `foreground: false` the operator types the answer
//               directly in this chat window, not in a second terminal running bin/answer.mjs. This
//               file is TRUSTED HOST CODE — fs and imports are the contract, not a shortcut (see
//               ext/package.json's own comment for why standards/code.md's "no dependencies" rule
//               does not cover importing pi-extensible-workflows here) — and it is the ONLY place
//               workflows/izi.js's disk access goes through.
// io:           fs
// Invariants:   every path a function receives is relative to the WORKFLOW RUN's own cwd
//               (context.run.cwd — WorkflowRunContext, pi-extensible-workflows/packages/core/
//               src/types.ts:119 — the same cwd role agents like gilb run with, agent-execution.ts:
//               `cwd: input.cwd`), never to THIS repository's own location. install.mjs copies the
//               harness's workflows/steps/core/bin into an arbitrary project directory; a run
//               launched there has its TASK.md, .agent/answers.md and .agent/staging/ in THAT
//               project, not in this repo checkout — anchoring to import.meta.url instead (S14's
//               proven defect, live run 2e71776f-342c-42e3-b623-d338b2b9c45c: checkBrd never found
//               staging, three redelegations, escalate) silently reads/writes the WRONG directory.
//               process.cwd() is the fallback for the one caller with no WorkflowRunContext at
//               all — izi_answer, an ordinary pi tool the interactive session's own model calls,
//               not a sandbox function; there ExtensionContext.cwd (execute()'s 5th argument,
//               @earendil-works/pi-coding-agent's own contract) stands in for context.run.cwd.
//               readText never throws: a missing file reads as "" — the caller decides what absence
//               means, the same convention the donor's `cat file || true` used. checkTask/checkBrd
//               never throw either: "the artifact is bad" is DATA (`ok:false`), not a host failure.
//               promote MOVES: it copies staging→out and then drops the staging file, so what is
//               left under .agent/staging after a run is exactly what a guardrail rejected.
//               promote DOES throw on a missing staging file — that is a contract violation (the
//               check gating this call ran against staging and found it, or should not have called
//               promote at all), never a silent no-op success (standards/workflow.md, «step shape
//               closes a step): staging→out precedes any "done" fact, and a promote that quietly did
//               nothing would let a run claim a fact that never happened). izi_answer follows the
//               same discipline: no .agent/pending.json means no open question, and the tool THROWS
//               rather than writing an answer nobody asked for or silently doing nothing.
// Interface:    default export — extension(pi): registers the izi_answer tool on pi AND calls
//               registerWorkflowExtension (pi-extensible-workflows contract) for the sandbox
//               functions and role directories. readText/answers/brdForm/checkTask/checkBrd/promote/
//               setPending/clearPending/survey/focus/cells/digest/reuse/remember/checkPart/buildGraph are ALSO named exports — pi-extensible-workflows never
//               exercises run(input, context) itself (it is the caller, not test scaffolding), so
//               ext/index.test.mjs imports these directly and calls run() with a fabricated
//               { run: { cwd } } context to prove the anchor without a live pi/workflow harness.

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, copyFileSync, renameSync, rmSync, readdirSync, statSync } from "node:fs"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { dirname, join } from "node:path"
import { Type } from "typebox"
import { registerWorkflowExtension, herdrAvailable, herdrPaneId, loadSettings } from "pi-extensible-workflows"
import { checkTaskText } from "../steps/task/task.mjs"
import { newBrd, parseBrd, analogueTerm } from "../steps/brd/brd.mjs"
import { newPlan } from "../steps/survey-plan/plan.mjs"
import { skipDir, skipFile } from "../steps/survey-plan/skip.mjs"
import { newSlices } from "../steps/focus/slices.mjs"
import { newFocus, checkFocus } from "../steps/focus/focus.mjs"
import { newPart, GRAMMAR_VERSION } from "../steps/scope/part.mjs"
import { readSource } from "../steps/scope/source.mjs"
import { newComputed, computedXml, parseComputed } from "../steps/scope/computed.mjs"
import { pathsOf } from "../core/node.mjs"
import { newDigest } from "../steps/scope/digest.mjs"
import { newGraph, graphXml } from "../steps/graph/graph.mjs"
import { newFrd, parseFrd, FRD_FORM, entryPass } from "../steps/intake/frd.mjs"
import { lookupAnswer, mergeFeedback } from "../steps/intake/lookup.mjs"
import { newMode } from "../steps/weight/weight.mjs"
import { newRipple, blindNodes, waiverFor } from "../steps/ripple/ripple.mjs"
import { parseDesign, parseRoutes, expand, unitsByPath } from "../steps/design/design.mjs"
import { parseValues, valuesSkeleton, normalize, checkValues } from "../steps/plan/values/values.mjs"

// `checkPart` шага 4 (часть графа) уже занимает это имя в файле — ядро шага 9 приезжает под
// псевдонимом. Одно имя на два разных вопроса было бы дефектом чтения, а не удобством.
// Шаг 9 переписывается на два отношения (docs/plan.md): карточка партии, её гардрейл и сборка
// PLAN.md из карточек удалены 21.08.2026. Пережили переделку три вещи, и каждая уехала туда, где
// ей место: чтение формата плана, топологическая сортировка и вид гейта.
import { SECTION_KEYS, sectionsOf } from "../steps/plan/sections.mjs"
import { modulesOfChange, sampleOf, rankedCandidates, treeSkeleton, parseTree, checkTree, digestOf, frdFor } from "../steps/plan/tree/tree.mjs"
import { flowsSkeleton, parseFlows, checkFlows, treeFor } from "../steps/plan/flows/flows.mjs"
import { wavesOf, planDoc, checkBook } from "../steps/plan/book/book.mjs"
import { newDecision, renderDecisions, parseDecisions } from "../steps/plan/decisions/decisions.mjs"
import { orderOf } from "../steps/plan/order.mjs"
import { gateView, readGate } from "../steps/plan/gate.mjs"
// EXTERNAL_DEPENDENCY: steps/plan/raises.mjs — кто ПОДНИМАЕТ отказ по развёрнутым цепочкам шага 9.
import { raisesOf, measuresOf } from "../steps/plan/raises.mjs"
import { newPlanIndex, KEY_QUESTION, TASK_KEY } from "../steps/plan/plan.mjs"
import { newBranch } from "../steps/branch/branch.mjs"
import { newLog, render, begin, mark, ticket, resumeAt, pending } from "../core/runlog.mjs"
import { ticketsOf, checkTickets, ticketText } from "../steps/tickets/tickets.mjs"
import { factsOf, namedTypes, typesBlock } from "../steps/tickets/facts.mjs"
// attrs — тот же разбор атрибутов, каким карту читают все шаги: базлайн берёт cmd сьютов оттуда же.
import { attrs, elem, tokens } from "../core/xml.mjs"
import { newReview, parseReview, owedItems, unbackedItems, autoFindings, feedbackLines, criticEntry, CODES, CODE_CULPRIT, CODE_OWNER, OPERATOR_NOTE } from "../steps/review/review.mjs"
import { parseMap, mapMeasure, mapIndex, MAP_CAP_BYTES } from "../steps/intake/map.mjs"
import { decide, entryFor } from "../steps/scope/cache.mjs"
import { newAnswers, looksLikeTemplate, stripOrdinal, hardTokens } from "../core/answers.mjs"
// EXTERNAL_DEPENDENCY: core/ask.mjs — форма записи разговора объявлена ОДИН раз и там (docs/ask.md §3а).
import { askEntry } from "../core/ask.mjs"
// EXTERNAL_DEPENDENCY: steps/planreview — второй судья над планом: разбор находок, маршрут и правка
// по якорю объявлены ОДИН раз там (docs/plan-loop.md).
import { findingsOf, routeOf, applyPatch, feedbackFor, adoptNode, hiddenHeads } from "../steps/planreview/planreview.mjs"
import { newBudgets, BUDGETS_PATH, ORDER_CAP_CHARS } from "../core/budgets.mjs"
import { newOrderLine } from "../core/orderline.mjs"
import { BRD_FORM, ABSENT_DOC } from "../core/form.mjs"
import { carriedBlockers } from "../core/findings.mjs"
import { writeAnswer } from "../bin/write-answer.mjs"

// runRoot — the anchor itself: context.run.cwd for sandbox functions, process.cwd() for izi_answer
// (no WorkflowRunContext reaches a pi tool; its caller passes ExtensionContext.cwd through instead —
// see izi_answer's own execute() below). Never THIS repository's directory (see Invariants above).
const runRoot = (context) => (context && context.run && context.run.cwd) || process.cwd()
const at = (root, p) => join(root, p)

// TASK_PATH — the pipeline's ONE input, named once: checkTask reads it, checkBrd feeds it to the
// guardrail as a source of numbers, and survey skips it (SKIP_FILES below). BUDGETS_PATH is its
// twin and already lives in core/budgets.mjs. workflows/izi.js repeats the literal because the
// sandbox has no import — a copy demanded by the host, not a second declaration.
const TASK_PATH = "TASK.md"
// The run's own state, named once each: the operator's answers (a source of NUMBERS for checkBrd and
// checkFrd), the question currently open, the roles' unjudged output, and the place the PREVIOUS
// run's copies of all three are carried to. newRun below is what carries them.
const ANSWERS_PATH = ".agent/answers.md"
const readIfExists = (root, p) => (existsSync(at(root, p)) ? readFileSync(at(root, p), "utf8") : "")

// parsedAnswers — one parse of .agent/answers.md shared by `answers` and `checkBrd` below, so the
// format (core/answers.mjs) is read in exactly one place on each call, not twice per run.
function parsedAnswers(raw) {
  return raw ? newAnswers(raw) : { ok: true, value: [] }
}

export const readText = {
  description: 'Read a text file relative to the workflow run\'s cwd (context.run.cwd). A missing file reads as "".',
  input: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
  output: { type: "string" },
  run({ path }, context) {
    return readIfExists(runRoot(context), path)
  },
}

export const answers = {
  description: "Operator answers from .agent/answers.md as values ({n,question,text}[]), not raw text; [] when the file is absent. `n` numbers a question within its exchange; the key a caller matches on is the question TEXT.",
  input: { type: "object", properties: {}, additionalProperties: false },
  output: {
    type: "array",
    items: {
      type: "object",
      properties: { n: { type: "number" }, question: { type: "string" }, text: { type: "string" } },
      required: ["question", "text"],
      additionalProperties: false,
    },
  },
  run(_input, context) {
    const root = runRoot(context)
    const r = parsedAnswers(readIfExists(root, ANSWERS_PATH))
    if (!r.ok) throw new Error(`answers: .agent/answers.md повреждён — ${r.error.detail}`)
    return r.value
  },
}

export const checkTask = {
  description: "Judge TASK.md by the one-task-one-input rule (non-empty, ≤300 lines) — steps/task/task.mjs wired to disk.",
  input: { type: "object", properties: {}, additionalProperties: false },
  output: {
    type: "object",
    properties: { ok: { type: "boolean" }, why: { type: "string" }, lines: { type: "number" }, key: { type: "string" }, question: { type: "string" } },
    required: ["ok"],
    additionalProperties: false,
  },
  run(_input, context) {
    const root = runRoot(context)
    if (!existsSync(at(root, TASK_PATH))) {
      return { ok: false, why: `${TASK_PATH} не существует — вход конвейера кладёт оператор` }
    }
    const r = checkTaskText(readFileSync(at(root, TASK_PATH), "utf8"))
    if (!r.ok) return { ok: false, why: r.error.detail }
    // The task key rides out of the FIRST step that reads the task, because it names things the band
    // creates much later — the branch, the ticket, and `task/<КЛЮЧ>/` where step 9 puts the plan.
    // Asking for it here costs the operator one question at the start instead of an interruption in
    // the middle; `question` is carried verbatim so the caller never rebuilds it.
    return { ok: true, lines: r.value.lines, key: taskKey(root), question: KEY_QUESTION }
  },
}

export const checkBrd = {
  description: "Judge a staged BRD by steps/brd/brd.mjs's newBrd. Numbers may come from TASK.md and the VALUES of operator answers only — never from a question's own wording.",
  input: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
  output: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      requirements: { type: "number" },
      advice: { type: "array", items: { type: "string" } },
      blockers: { type: "string" },
    },
    required: ["ok"],
    additionalProperties: false,
  },
  run({ path, pass = "" }, context) {
    const root = runRoot(context)
    if (!existsSync(at(root, path))) {
      return { ok: false, blockers: `${path} не существует — роль ничего не записала по staging-пути` }
    }
    const text = readFileSync(at(root, path), "utf8")
    const task = readIfExists(root, TASK_PATH)
    const ans = parsedAnswers(readIfExists(root, ANSWERS_PATH))
    const answerTexts = ans.ok ? ans.value.map((a) => a.text) : []
    const r = newBrd(text, [task, ...answerTexts])
    if (!r.ok) return { ok: false, blockers: r.error.detail }
    return { ok: true, requirements: r.value.requirements.length, advice: r.value.advice.map((a) => `[${a.code}] ${a.message}`) }
  },
}

// brdForm — the FORM of the BRD as data, so the order can substitute it instead of restating it.
//
// BUG_FIX_CONTEXT: backlog G9e. `steps/brd/order.tpl` carried a word-for-word copy of
//   `core/form.mjs::BRD_FORM.subjectRule` and of the 3..7 range, while the registry's own comment
//   promised the order would SUBSTITUTE it. Two texts of one rule drift apart silently — and the
//   guardrail quotes the registry's text in its refusal, so a role told the OLD wording gets a
//   diagnosis in words its order never used. The sandbox has no import, so the only way the workflow
//   can reach a constant of this repository is a host function: this one.
export const brdForm = {
  description: "The BRD's form as data (subjectsMin, subjectsMax, subjectRule, analogueRule, absentDoc) from core/form.mjs — the order SUBSTITUTES these, it does not restate them.",
  input: { type: "object", properties: {}, additionalProperties: false },
  output: {
    type: "object",
    properties: {
      subjectsMin: { type: "number" },
      subjectsMax: { type: "number" },
      subjectRule: { type: "string" },
      analogueRule: { type: "string" },
      absentDoc: { type: "string" },
    },
    required: ["subjectsMin", "subjectsMax", "subjectRule", "analogueRule", "absentDoc"],
    additionalProperties: false,
  },
  run() {
    return {
      subjectsMin: BRD_FORM.subjectsMin,
      subjectsMax: BRD_FORM.subjectsMax,
      subjectRule: BRD_FORM.subjectRule,
      analogueRule: BRD_FORM.analogueRule,
      absentDoc: ABSENT_DOC,
    }
  },
}

// carried — the memory of a repair loop, computed OUTSIDE the sandbox because the rule is pure and
// wants a test: the sandbox cannot import, and a rule written inline in workflows/izi.js would have no
// seam at all (`workflows/` is covered by no test in this repository). The rule itself and the run
// that paid for it live in core/findings.mjs.
export const carried = {
  description: "The feedback of a redelegation: the current red check plus the lines already red earlier in this run, which repairing the current one must not bring back (core/findings.mjs::carriedBlockers).",
  input: {
    type: "object",
    properties: { blockers: { type: "string" }, seen: { type: "array", items: { type: "string" } }, outOfRounds: { type: "boolean" } },
    required: ["blockers"],
    additionalProperties: false,
  },
  output: {
    type: "object",
    properties: { text: { type: "string" }, seen: { type: "array", items: { type: "string" } } },
    required: ["text", "seen"],
    additionalProperties: false,
  },
  run({ blockers, seen, outOfRounds }) {
    return carriedBlockers({ blockers, seen, outOfRounds })
  },
}

// frdForm — the same device as brdForm, for step 6: the order SUBSTITUTES the vocabularies the
// guardrail judges by (steps/intake/frd.mjs::FRD_FORM), it does not retype them. A form written twice
// drifts, and the copy that runs is the machine's.
export const frdForm = {
  description: "The FRD's form as data (deltaForms, sources) from steps/intake/frd.mjs — the order SUBSTITUTES these, it does not restate them.",
  input: { type: "object", properties: {}, additionalProperties: false },
  output: {
    type: "object",
    properties: {
      deltaForms: { type: "string" },
      sources: { type: "string" },
    },
    required: ["deltaForms", "sources"],
    additionalProperties: false,
  },
  run() {
    // Joined HERE, not in the sandbox: the workflow substitutes a value, it does not format one.
    return { deltaForms: FRD_FORM.deltaForms.join(" | "), sources: FRD_FORM.sources.join(" | ") }
  },
}

// orderLine — СКОЛЬКО о собранном наряде сказать вслух. Решение живёт в core/orderline.mjs и едет
// сюда, а не в песочницу: полосу нельзя импортировать в тест, и то, что решается внутри неё,
// проверяется одной регуляркой по исходнику. Тот же расклад, что у frdForm выше: полоса ПОДСТАВЛЯЕТ
// значение, а не форматирует его.
//
// Мера остаётся у полосы: длину собранного текста знает только она. Сюда едут ЧИСЛА, назад — две
// готовые строки: та, что печатается, и та, которой отказ называет виновный документ.
export const orderLine = {
  description: "One assembled order as the run's log says it (core/orderline.mjs::newOrderLine). Returns `line` — what log() prints: the total alone from the second order of a KIND onward, the total plus every addend on the first one and whenever the order is over the cap — and `why`, the refusal, which always names every addend. The caller measures; this function only decides how much of the measurement is spoken.",
  input: {
    type: "object",
    properties: {
      step: { type: "string" },
      chars: { type: "number" },
      cap: { type: "number" },
      round: { type: "number" },
      over: { type: "boolean" },
      tplChars: { type: "number" },
      addends: {
        type: "array",
        items: { type: "object", properties: { name: { type: "string" }, chars: { type: "number" } }, required: ["name", "chars"], additionalProperties: false },
      },
    },
    additionalProperties: false,
  },
  output: {
    type: "object",
    properties: { line: { type: "string" }, why: { type: "string" } },
    required: ["line", "why"],
    additionalProperties: false,
  },
  run(input) {
    return newOrderLine(input || {})
  },
}

export const budgets = {
  description: "Run budgets from the project's izi.config.json (loops, intakeLoops, questionRounds, checkpointRetries, maxParallel, reviewRounds), plus orderCap — the ceiling on ONE assembled order in CHARACTERS (core/budgets.mjs::ORDER_CAP_CHARS), which izi.config.json cannot move: it is the model's window minus the output reserve and the request's own boilerplate. A missing file means the declared defaults; a broken one is a refusal (ok:false), never a silent default.",
  input: { type: "object", properties: {}, additionalProperties: false },
  output: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      why: { type: "string" },
      loops: { type: "number" },
      intakeLoops: { type: "number" },
      questionRounds: { type: "number" },
      checkpointRetries: { type: "number" },
      // maxParallel is declared here as well as in core/budgets.mjs for a reason the host makes
      // unavoidable: it validates every function's OUTPUT against this schema, and
      // additionalProperties:false turns a budget missing from this list into
      // "Invalid output from budgets" — a crashed run with no hint about which key it disliked.
      // Caught by the first live launch after maxParallel was added (run 657fcd98) — and again, the
      // same crash on the same line, by the first launch after intakeLoops (run c8bd1294): a comment
      // is not a seam. ext/index.test.mjs now asserts this list against DEFAULT_BUDGETS key by key,
      // so the NEXT budget cannot be forgotten here at all.
      maxParallel: { type: "number" },
      reviewRounds: { type: "number" },
      baseline: { type: "boolean" },
      // orderCap is NOT a member of DEFAULT_BUDGETS and must not become one: newBudgets accepts any
      // key it declares from izi.config.json, and a project lowering — or raising — the window of the
      // model it does not choose would be a budget over somebody else's fact. It rides this channel
      // because the workflow sandbox has no import and no other way to learn a constant.
      orderCap: { type: "number" },
      source: { type: "string" },
    },
    required: ["ok"],
    additionalProperties: false,
  },
  run(_input, context) {
    const root = runRoot(context)
    const raw = readIfExists(root, BUDGETS_PATH)
    const r = newBudgets(raw)
    if (!r.ok) return { ok: false, why: r.error.detail }
    return { ok: true, ...r.value, orderCap: ORDER_CAP_CHARS, source: raw.trim() ? BUDGETS_PATH : "defaults" }
  },
}

// herdrStatus — is this run observable in herdr? The availability RULE is not restated here: it is
// substituted from the host (`herdrAvailable`/`herdrPaneId`, pi-extensible-workflows/src/herdr.ts —
// HERDR_ENV=1 AND HERDR_PANE_ID AND HERDR_SOCKET_PATH in pi's own environment), and fully-inspectable
// mode comes from the same settings file @piewf/herdr itself reads (`loadSettings()`,
// ~/.pi/agent/pi-extensible-workflows/settings.json).
//
// Why this exists: with herdr unavailable the herdr extension does not register AT ALL
// (`registerHerdrExtension` returns false and stays silent), so a run launched from an ordinary
// terminal goes entirely blind and looks exactly like a broken integration. One printed fact at the
// start of a run separates "herdr is off" from "herdr is broken".
export const herdrStatus = {
  description: "Is this run observable in herdr? Reports the host's own herdrAvailable() verdict, the pane id and whether fully-inspectable mode is on. Never fails the run — an unobserved run is still a run.",
  input: { type: "object", properties: {}, additionalProperties: false },
  output: {
    type: "object",
    properties: {
      available: { type: "boolean" },
      pane: { type: "string" },
      fullyInspectable: { type: "boolean" },
      why: { type: "string" },
    },
    required: ["available"],
    additionalProperties: false,
  },
  run() {
    const available = herdrAvailable(process.env)
    const settings = loadSettings()
    const fullyInspectable = Boolean(settings?.extensions?.herdr?.enableFullyInspectableMode)
    if (available) return { available: true, pane: herdrPaneId(process.env) || "", fullyInspectable }
    const missing = ["HERDR_ENV=1", "HERDR_PANE_ID", "HERDR_SOCKET_PATH"]
      .filter((v) => (v === "HERDR_ENV=1" ? process.env.HERDR_ENV !== "1" : !process.env[v]))
    return {
      available: false,
      fullyInspectable,
      why: `pi запущен не в пейне herdr (нет ${missing.join(", ")}) — панели агентов не откроются`,
    }
  },
}

const PENDING_PATH = ".agent/pending.json"
const ASK_PATH = ".agent/ask.xml"
const STAGING_DIR = ".agent/staging"
// СОСТОЯНИЕ ШАГА 9 ПЕРЕЖИВАЕТ ПЕРЕЗАПУСК. Порция, прошедшая суд, — сделанная работа: гасить прогон
// на зависании и писать её заново стоит минут и токенов. `staging/` для этого не годится: `newRun`
// уносит его в `.agent/prev/` (черновик текущего вызова по определению не наследуется), поэтому у
// порций свой каталог run state — его не трогает ни `newRun`, ни промоут.
//
// Признак «сделано» здесь НЕ ХРАНИТСЯ: порция переиспользуется, только если она ЗЕЛЕНА СЕЙЧАС —
// тем же судом порции, что судил её тогда. Флаг разошёлся бы с требованием, суд — не может.
const STEP9_DIR = ".agent/step9"
const PREV_DIR = ".agent/prev"

// setPending writes the open question AND ITS ITEMS: a question may be a BATCH (step 6 asks 25-30 at
// once), and the answer to a batch is addressed per item. The NUMBERING is assigned here, by machine,
// exactly as the question key itself is — the model reads numbers from this file and never invents
// one. A role that asked a single question (gilb) simply arrives with one item.
export const setPending = {
  description: "Record the operator question currently open at .agent/pending.json, called just before checkpoint() pauses. Numbers its items 1..N. izi_answer reads this file for the questions and their numbers — the model never supplies them.",
  input: {
    type: "object",
    properties: {
      subject: { type: "string" },
      evidence: { type: "string" },
      items: { type: "array", items: { type: "string" } },
    },
    required: ["subject"],
    additionalProperties: false,
  },
  output: { type: "object", properties: {}, additionalProperties: false },
  run({ subject, evidence, items }, context) {
    const root = runRoot(context)
    const list = (items && items.length ? items : [subject]).map((text, i) => ({ n: i + 1, text }))
    mkdirSync(dirname(at(root, PENDING_PATH)), { recursive: true })
    writeFileSync(at(root, PENDING_PATH), JSON.stringify({ subject, evidence: evidence || "", items: list }, null, 2))
    return {}
  },
}

export const clearPending = {
  description: "Close the exchange: RECORD it in .agent/ask.xml (core/ask.mjs::askEntry — step, pass, the size of the role's draft at the moment it asked, and every question with its answer verbatim), then remove .agent/pending.json. Called after checkpoint() resolves AND the matching answer is found, never before. The record is what survives the run: pending.json is erased here, and without it nobody can say afterwards what the role asked at a step (docs/ask.md §3а).",
  input: {
    type: "object",
    properties: { step: { type: "string" }, pass: { type: "string" }, draft: { type: "string" } },
    additionalProperties: false,
  },
  output: { type: "object", properties: { asked: { type: "number" } }, additionalProperties: false },
  run({ step = "", pass = "", draft = "" } = {}, context) {
    const root = runRoot(context)
    // ВОПРОСЫ БЕРУТСЯ С ДИСКА, А НЕ ИЗ АРГУМЕНТОВ. Их номера и тексты уже лежат в pending.json,
    // записанные машиной (CLAUDE.md, ограничение 4), а ответы — в answers.md. Полоса называет только
    // то, чего на диске нет: свой шаг, свой проход и путь к черновику.
    const pending = readIfExists(root, PENDING_PATH)
    const items = pending ? (JSON.parse(pending).items || []) : []
    const heard = newAnswers(readIfExists(root, ANSWERS_PATH))
    const said = heard.ok ? heard.value : []
    // обмен — это ответы НА ЭТИ вопросы, а не вся история прогона
    const texts = new Set(items.map((i) => String(i && i.text || "").trim()).filter(Boolean))
    const mine = said.filter((a) => texts.has(String(a.question || "").trim()))
    const entry = askEntry({ step, pass, draftBytes: draft ? (readIfExists(root, draft) || "").length : 0, said: mine })
    if (entry) appendFileSync(at(root, ASK_PATH), entry)
    if (existsSync(at(root, PENDING_PATH))) rmSync(at(root, PENDING_PATH))
    return { asked: mine.length }
  },
}

// countFiles — how many FILES lie under a directory, at any depth; 0 for an absent one. Used by
// newRun to say what it carried away, so "staging was empty" and "staging held a rejected part" are
// different facts in the log instead of one silent line.
function countFiles(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return 0
  let n = 0
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    n += statSync(p).isDirectory() ? countFiles(p) : 1
  }
  return n
}

// newRun — the first act of a run: the PREVIOUS run's state is carried out of the way.
//
// Why it exists (live evidence, runbox 11.08): the answer «10» to gilb's question «предел 50
// (альтернативы 20, 100)?» was written by run 0fbfdb53, which the operator then interrupted. Run
// f5361857 started in the same directory, read that answer as its own (workflows/izi.js's
// answersBlock puts every accumulated exchange into the order), and asked the operator again in its
// own words — with 10 already as its default. The numbers matched, so nothing turned red. Had the
// dead run's answer been «50», `fit: 50` would have passed checkBrd's invented-default rule in a run
// where nobody ever said 50: the VALUES of answers are one of that rule's legal sources
// (see checkBrd/checkFrd below), and nothing in the file says which run's question they answer.
//
// Three things are the state of ONE run, and all three are carried to .agent/prev/:
//   answers.md   — an answer is addressed to a QUESTION of the run that asked it
//   pending.json — the open question of a run that is over; izi_answer keys the answer off THIS file
//   staging/     — the current run's role never wrote these, yet a guardrail judges staging and
//                  promote() moves what it accepts (CLAUDE.md constraint 2)
//
// NOTHING is deleted, and that is deliberate: this harness diagnoses runs from facts on disk
// (sandbox/pi-runbox.md §Диагноз — never trust what the launching model printed), so the state of a
// run that fell over is EVIDENCE. It is carried aside, not destroyed. What .agent/prev/ held before
// is overwritten: the run before last has already been read or has already lost its interest.
//
// What is NOT touched: the artifacts (.agent/brd.md, frd.xml, appgraph.xml, graph-parts/) — promote
// overwrites each after a green check — and .izi/parts, the part cache that outlives runs BY DESIGN
// and is re-judged before use (`reuse`). That is the whole distinction: a cached part can be
// re-judged against today's tree, an answer cannot be re-judged against a question nobody asked.
//
// Replay-safe by construction: the host journals a completed function call under its structural path
// and replays it from the journal on a retry of the same runId (packages/core/src/registry.ts:149,
// persistence.ts:1027) — so `function/newRun/1` does not run twice, and answers written AFTER it
// survive a resume.
// dirtyCount — how many files the working tree carries uncommitted, or -1 when git did not answer.
//
// It DECLARES, it does not stop: an uncommitted working tree is normal in a live repository, and a
// rail here would refuse to run on most of them. What is NOT normal is not knowing: the swarm maps the
// tree as it is, so work already done by hand is mapped as if it had always been there, and the FRD
// comes out about a different repository.
//
// BUG_FIX_CONTEXT: live run 9a8821a7 (quarkus-rest-json-app-v2-t2). The band ends at step 8, but after
//   the run finished the CHAT model went on and implemented the task — 27 lines across three files
//   plus a new page. The next run would have mapped that implementation as the repository's own code
//   and produced an FRD for work already done, with nothing anywhere saying why. The rule against
//   doing this lives where the model reads it (prompts/izi.md and the terminal log of
//   workflows/izi.js); this number is how the next run NOTICES.
//
// -1 is not 0: "git did not answer" (no repository, no git, a broken invocation) is a different fact
// from "nothing is uncommitted", and a catch that returned 0 would turn a tool failure into data
// (standards/code.md, constraint 4).
// It counts what the SWARM would map, by the swarm's own rule (steps/survey-plan/skip.mjs): the
// harness copied into the project — `workflows/`, `steps/`, `core/`, `bin/` — is permanently modified
// against the form's own HEAD after every `bin/install.mjs`, and counting it would make this warning
// fire on every run in a runbox copy. A signal that always fires says nothing.
function dirtyCount(root) {
  try {
    const out = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    return out.split("\n")
      .map((l) => l.slice(3).trim())                      // " M path" · "?? path" · "R  old -> new"
      .map((p) => (p.includes(" -> ") ? p.split(" -> ").pop() : p))
      .filter(Boolean)
      .filter((p) => !p.split("/").slice(0, -1).some(skipDir) && !skipFile(p))
      .length
  } catch {
    return -1
  }
}

export const newRun = {
  description: "First act of a run. A run FROM SCRATCH carries the previous run's state out of the way — .agent/answers.md, .agent/pending.json, .agent/ask.xml and the leftovers under .agent/staging/ are MOVED into .agent/prev/ (nothing is deleted; artifacts and the .izi/parts cache are untouched). A CONTINUATION — a run whose ladder enters at a step above 1 (core/runlog.mjs::resumeAt, the same function that drives the band) — keeps the answers, the open question and the conversation: they belong to the work it continues. Staging leftovers are moved in both cases: an unfinished draft is never inherited. Returns what was carried and whether this was a continuation, so the run can log why the operator is or is not asked again.",
  input: { type: "object", properties: {}, additionalProperties: false },
  output: {
    type: "object",
    properties: {
      answers: { type: "number" },   // answers carried away, counted by core/answers.mjs, not by eye
      kept: { type: "boolean" },     // продолжение: состояние оставлено на месте
      pending: { type: "boolean" },  // an open question of the dead run was found
      staged: { type: "number" },    // files a guardrail never judged, or judged and rejected
      dirty: { type: "number" },     // files the working tree carries uncommitted; -1 = git said nothing
    },
    required: ["answers", "pending", "staged"],
    additionalProperties: false,
  },
  run(_input, context) {
    const root = runRoot(context)
    const prev = at(root, PREV_DIR)
    const dirty = dirtyCount(root)

    // ПРОДОЛЖЕНИЕ НЕ ТЕРЯЕТ ОТВЕТОВ. Уносить состояние имеет смысл только у прогона С НУЛЯ: там ответы
    // относятся к прошлой работе. Прогон, входящий в середину полосы, продолжает ТУ ЖЕ работу — её
    // ответы, её открытый вопрос и её разговор принадлежат ей.
    //
    // Где мы входим, спрашивается ТОЙ ЖЕ функцией, что ведёт полосу (core/runlog.mjs::resumeAt), а не
    // вторым разбором журнала: два ответа на вопрос «с какого шага» разошлись бы на первой правке.
    //
    // BUG_FIX_CONTEXT: прогон eddi 19.08.2026 дошёл до гейта 1, оператор вернул план на доработку —
    //   и его слова, как и пять ответов, на которых стоял FRD, лежали в answers.md. Перезапуск ради
    //   реворка унёс бы их все: гейт спросил бы заново, роль шага 6 переспросила бы синтаксис, код
    //   отказа и остальное. Каждый такой ответ — пауза человека, самое дорогое в полосе.
    const log = runlogOf(root)
    const seenFp = {}
    if (log) for (const m of log.steps) for (const a of m.artifacts) {
      seenFp[a.path] = existsSync(at(root, a.path)) ? sha256(readFileSync(at(root, a.path), "utf8")) : null
    }
    const from = log ? resumeAt(log, { seen: seenFp }).from : 1
    const carryOn = from > 1

    const raw = readIfExists(root, ANSWERS_PATH)
    // A malformed file is still carried away — counting it is what fails, not moving it. The count
    // is a number for the log; the move is what the rule is about.
    const answersCount = raw ? (newAnswers(raw).value || []).length : 0
    const pending = existsSync(at(root, PENDING_PATH))
    const staged = countFiles(at(root, STAGING_DIR))
    if (!raw && !pending && !staged) return { answers: 0, pending: false, staged: 0, dirty, kept: carryOn }

    mkdirSync(prev, { recursive: true })
    // renameSync overwrites an existing destination file, which is exactly the intent: .agent/prev/
    // holds the LAST run, not a growing pile. A directory is not overwritten, so staging's old copy
    // goes first.
    if (raw && !carryOn) renameSync(at(root, ANSWERS_PATH), join(prev, "answers.md"))
    if (pending && !carryOn) renameSync(at(root, PENDING_PATH), join(prev, "pending.json"))
    // Разговор прошлого прогона уезжает вместе с ответами: он ИХ след, и оставлять его рядом с новыми
    // ответами значит копить два прогона в одном файле (docs/ask.md §3а).
    if (existsSync(at(root, ASK_PATH)) && !carryOn) renameSync(at(root, ASK_PATH), join(prev, "ask.xml"))
    if (staged) {
      rmSync(join(prev, "staging"), { recursive: true, force: true })
      renameSync(at(root, STAGING_DIR), join(prev, "staging"))
      mkdirSync(at(root, STAGING_DIR), { recursive: true }) // the roles write into it; leave it ready
    }
    // `answers`/`pending` в ответе — ЧТО УНЕСЕНО, а не что было: у продолжения это ноль, и полоса
    // печатает другую строку. Иначе лог скажет «убрано 5 ответов» о файле, который остался на месте.
    return { answers: carryOn ? 0 : answersCount, pending: carryOn ? false : pending, staged, dirty, kept: carryOn }
  },
}

// promote — MOVE, not copy: the staging file is gone once its content is accepted.
//
// BUG_FIX_CONTEXT: live run 6e3b9455-533a-4843-aee6-c4c7e96e3fbc.
//   Previous: copyFileSync, and nothing else.
//   Problem:  after a green run `.agent/staging/` still held copies of brd.md and both parts — byte
//             for byte what the final directory held. The directory answered no question of a
//             post-mortem: accepted and rejected lay side by side.
//   Fix:      a MOVE. What stays under staging is now EXACTLY what a guardrail rejected: an empty
//             staging/graph-parts/ means every cell closed, a leftover file names the cell that did
//             not — and that is a fact on disk, not a retelling of the log.
export const promote = {
  description: "Move staging→out: copy, then drop the staging file. What remains under .agent/staging is exactly what a guardrail REJECTED. A missing staging file is a refusal (throws), never a silent success.",
  input: {
    type: "object",
    properties: { from: { type: "string" }, to: { type: "string" } },
    required: ["from", "to"],
    additionalProperties: false,
  },
  output: { type: "object", properties: { at: { type: "string" } }, required: ["at"], additionalProperties: false },
  run({ from, to }, context) {
    const root = runRoot(context)
    if (!existsSync(at(root, from))) {
      throw new Error(`promote: ${from} не существует — чек, который должен был пройти по этому пути, не исполнялся`)
    }
    mkdirSync(dirname(at(root, to)), { recursive: true })
    copyFileSync(at(root, from), at(root, to))
    rmSync(at(root, from))                      // a MOVE: accepted work lives in the final directory, staging keeps only rejected
    return { at: new Date().toISOString() }
  },
}

// --- survey: the run's tree → .agent/survey-plan.json ---------------------------------------------
//
// The border of the walk is declared ONCE, and not here: steps/survey-plan/skip.mjs is a pure
// predicate with units of its own. Its own contract names the reason for the move: a live run on the
// quarkus form turns red on none of the skip rules, because that form holds no `vendor/`, no
// `.min.js` and no built frontend (backlog W1). What stays here is only what the predicate cannot
// know — THE HARNESS INPUTS the operator places in the project.
//
// BUG_FIX_CONTEXT: live run 6e3b9455-533a-4843-aee6-c4c7e96e3fbc, step 4 green.
//   Previous: the skip list knew only the build wrappers.
//   Problem:  a part came back carrying `<module path="TASK.md">` — the operator's requirement became
//             a node of the application graph. The scout is not at fault: the order obliges it to
//             close EVERY file of the cell, and step 3 is what put the file there.
//   Fix:      a second class of names — the harness inputs. They are the pipeline, not the app.
const HARNESS_FILES = new Set([TASK_PATH, BUDGETS_PATH])

// MAX_BYTES — the ceiling on READING a file at step 3.
//
// BUG_FIX_CONTEXT: backlog W5. It used to be 512 KB, and a larger file fell out of the plan ENTIRELY
//   — the node was lost in silence (10 files of eddi went that way). The ceiling existed because the
//   whole text of a file travelled into the order; now a DIGEST travels instead
//   (steps/scope/digest.mjs), and a large file's cost in an order is no longer proportional to its
//   size. The ceiling is now only the border of reading the disk, and everything above it is
//   DECLARED in the plan (`skipped`) instead of vanishing.
const MAX_BYTES = 4 * 1024 * 1024

// SPINE — the backbone: where the graph's answers live, except the ones only the code shows
// (docs/survey-plan.md §1 — how it is tested, changed, switched off, branched, how its external
// contract is described, and which EXTERNAL SYSTEMS the configuration declares: that last answer is
// exactly why `resources/application.*`, `.env` and `config/` are on this list).
// Names of ECOSYSTEMS, not the layout of one repository.
// Nothing matched → there is no spine cell, and that is DATA, not a refusal: the list is an
// accelerator, never a condition.
const SPINE = [/^pom\.xml$/, /^build\.gradle(\.kts)?$/, /^settings\.gradle(\.kts)?$/, /^gradle\.properties$/,
               /^package\.json$/, /^go\.mod$/, /^Makefile$/, /^pyproject\.toml$/,
               /resources\/application\.[^/]+$/, /(^|\/)\.env/, /(^|\/)config\//,
               /^\.github\/workflows\//, /^\.gitlab-ci\.yml$/, /^Jenkinsfile$/,
               /^README/i, /^CONTRIBUTING/i]

// walk — io plumbing, not unit-tested (standards/code.md: a live run of the slice proves an io pipe);
// the skip RULE, by contrast, is covered — steps/survey-plan/skip.mjs. walk starts at the RUN's root
// and yields "/"-separated paths relative to it. A file larger than MAX_BYTES is not dropped in
// silence: it travels into `skipped` with its reason.
function walk(root, rel, out, skipped) {
  for (const e of readdirSync(at(root, rel), { withFileTypes: true })) {
    const path = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) {
      if (skipDir(e.name)) continue
      walk(root, path, out, skipped)
      continue
    }
    if (!e.isFile()) continue                                   // a symlink or socket is not a project file
    if (skipFile(path, HARNESS_FILES)) continue
    const bytes = statSync(join(root, path)).size
    if (bytes > MAX_BYTES) { skipped.push(`${path} (${bytes} b > ${MAX_BYTES})`); continue }
    out.push({ path, bytes })
  }
  return out
}

// An anchor MARKS a file, it never filters it: a case-insensitive substring, over the path AND the
// text. Word-boundary matching was tried and refuted by fact — it loses `fruits` for the anchor
// `fruit`, and `FruitResourceIT` entirely (docs/survey-plan.md §1).
function hitsFor(path, text, anchors) {
  if (!anchors.length) return []
  const hay = `${path}\n${text}`.toLowerCase()
  return anchors.filter((a) => hay.includes(String(a).toLowerCase()))
}

// goModuleOf — `module` from go.mod. The only thing that turns a go import path into a directory of
// THIS repository (steps/scope/edges.mjs); its absence is DECLARED as
// `<lang id="go" edges="no-rules">` instead of staying silent.
const goModuleOf = (root) => ((readIfExists(root, "go.mod").match(/^module[ \t]+(\S+)/m) || [])[1] || "")

const sha1 = (text) => createHash("sha1").update(text).digest("hex")
// The gate token pins the plan by CONTENT: sha1 is the cache's hash, this one guards an approval.
const sha256 = (text) => createHash("sha256").update(text).digest("hex")

// COMPUTED_PATH — what the script computed, as a SEPARATE artifact beside the roles' parts.
//
// The backlog W4a decision, recorded here and in docs/scope.md §2b: edges are not patched into a
// part. A part stays exactly what the role produced; the computed facts live in their own file, each
// with its own evidence, and step 5 merges them. Between "the script computed the edges" and "the
// edges are in the graph" there is otherwise nothing: neither checkPart nor promote mutates a part,
// and a mutating host function would make `.agent/graph-parts/` unarguable — "what the model said"
// and "what the script computed" would stop being distinguishable.
const COMPUTED_PATH = ".agent/graph-computed.xml"

export const survey = {
  description: "Build .agent/survey-plan.json (the run's file tree minus the skip list, cut into subtree cells with sha1 per file) and .agent/graph-computed.xml (edges, routes and drivers a script can read). Anchors from .agent/brd.md annotate files; they never filter them.",
  input: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
  output: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      why: { type: "string" },
      files: { type: "number" },
      bytes: { type: "number" },
      cells: { type: "number" },
      edges: { type: "number" },
      langs: { type: "array", items: { type: "string" } },
      subjects: { type: "number" },
      gaps: { type: "array", items: { type: "string" } },
      skipped: { type: "array", items: { type: "string" } },
      at: { type: "string" },
    },
    required: ["ok"],
    additionalProperties: false,
  },
  run({ path }, context) {
    const root = runRoot(context)                                     // the RUN's cwd, not this repository's
    const anchors = parseBrd(readIfExists(root, ".agent/brd.md")).subjects || []  // one parser, from steps/brd
    const skipped = []
    const scanned = walk(root, "", [], skipped)

    // One pass over the disk feeds THREE consumers: the anchors, the cache key and the computed
    // facts. A file's text does not survive its iteration — only the facts squeezed out of it do.
    const sources = []
    const files = scanned.map((f) => {
      let text = ""
      try { text = readFileSync(at(root, f.path), "utf8") } catch { text = "" }  // a binary reads as garbage, not as a failure
      sources.push(readSource({ path: f.path, text }))
      return { path: f.path, bytes: f.bytes, sha1: sha1(text), subjects: hitsFor(f.path, text, anchors) }
    })

    const isSpine = (p) => SPINE.some((re) => re.test(p))
    const byPath = new Map(files.map((f) => [f.path, f]))
    const spine = scanned.filter((f) => isSpine(f.path)).map((f) => ({ path: f.path, bytes: f.bytes, sha1: byPath.get(f.path).sha1, subjects: [] }))

    const r = newPlan({ files, spine, subjects: anchors })
    if (!r.ok) return { ok: false, why: r.error.detail }               // the only refusal is no-files

    const computed = newComputed({ sources, paths: scanned.map((f) => f.path), goModule: goModuleOf(root) })
    mkdirSync(dirname(at(root, path)), { recursive: true })            // written AFTER the decision to accept
    writeFileSync(at(root, path), JSON.stringify({ ...r.value, skipped }, null, 2))
    writeFileSync(at(root, COMPUTED_PATH), computedXml(computed))
    return { ok: true, files: r.value.files, bytes: r.value.bytes, cells: r.value.cells.length,
             edges: computed.edges.length,
             langs: computed.langs.map((l) => `${l.lang}:${l.rules ? "edges" : "no-rules"}:${l.files}`),
             // `subjects` next to `gaps` so the caller can state the SHARE that matched nothing: it
             // is the only cheap measurement of how well step 2 translated the request into the
             // repository's own words (backlog G9f). It never blocks — an anchor MARKS, it does not
             // select.
             subjects: anchors.length, gaps: [...r.value.gaps], skipped, at: new Date().toISOString() }
  },
}

// --- scope: plan cells in, graph parts judged ----------------------------------------------------
//
// PLAN_PATH — where step 3 leaves the swarm layout. It is a CONSTANT here rather than a parameter of
// checkPart on purpose: the file list a part is judged against must reach the guardrail from the
// plan by machine — not from the workflow script, and never from the model. Same discipline as
// izi_answer reading the question key out of .agent/pending.json instead of taking it as an
// argument: what a machine can copy, a machine copies.
const PLAN_PATH = ".agent/survey-plan.json"

// readPlanCells — the plan as data, or a refusal with a diagnosis. Shared by both functions below so
// the file is parsed in exactly one place. An absent plan is a REFUSAL, not an empty list: "there is
// no plan" must never silently become "the plan has no cells" (standards/code.md §2).
function readPlanCells(root) {
  const raw = readIfExists(root, PLAN_PATH)
  if (!raw.trim()) return { ok: false, why: `${PLAN_PATH} не существует — шаг 3 survey-plan не отработал` }
  let plan
  try {
    plan = JSON.parse(raw)
  } catch (e) {
    return { ok: false, why: `${PLAN_PATH} не разбирается как JSON — ${e.message}` }
  }
  if (!plan || !Array.isArray(plan.cells) || !plan.cells.length) {
    return { ok: false, why: `${PLAN_PATH} не несёт ни одной клетки — картировать нечего` }
  }
  return { ok: true, cells: plan.cells, plan }
}

// --- focus: step 3b — WHAT the swarm surveys, decided before the swarm runs ----------------------
//
// The whole of step 3b: no role, no token, one artifact. It reads what steps 2-3 already left on
// disk and answers one question — does the map this run would build fit the reader's window, and if
// not, which entry cones does the BRD point at. Today that answer arrives at step 6, after 306 scout
// calls and ≈10M input tokens have been spent on a map nobody can read (docs/big-projects-problems.md
// §2); here it costs zero.
//
// `.agent/brd.md` is deliberately NOT read: step 3 already resolved every anchor to the files that
// carry it (`files[].subjects`), and a second resolution here would be a second copy of the anchor
// rule plus a re-read of the whole tree — 37 MB on eddi — inside a step that promises no io.
const FOCUS_PATH = ".agent/focus.json"

// readFocus — the focus as data, or a refusal with a diagnosis. THREE functions read this file
// (focus itself, cells, buildGraph), and in all three the difference between "there is no focus" and
// "the focus is everything" decides whether a step may run at all (standards/code.md §2). Deciding
// it once, here, is the same discipline readPlanCells above follows for the plan.
function readFocus(root) {
  const raw = readIfExists(root, FOCUS_PATH)
  if (!raw.trim()) return { ok: false, why: `${FOCUS_PATH} не существует — шаг 3b focus не отработал` }
  let f
  try {
    f = JSON.parse(raw)
  } catch (e) {
    return { ok: false, why: `${FOCUS_PATH} не разбирается как JSON — ${e.message}` }
  }
  if (!f || !Array.isArray(f.cells) || !f.cells.length) {
    return { ok: false, why: `${FOCUS_PATH} не несёт ни одной клетки — разведывать нечего` }
  }
  return { ok: true, focus: f, cells: new Set(f.cells) }
}

export const focus = {
  description: "Step 3b. Decide WHICH cells of .agent/survey-plan.json the swarm surveys, before it runs and for zero tokens: every cell while the plan's map fits the reading cap, otherwise the entry cones the BRD's anchors NAME (steps/focus/slices.mjs, steps/focus/focus.mjs). Writes .agent/focus.json — the cones, the choice, the cells and what the ceiling dropped. There is no operator rail: the choice is made here, its order is stated, and what did not fit is counted. Any refusal REMOVES the artifact, so step 4 can never survey yesterday's focus.",
  input: { type: "object", properties: {}, additionalProperties: false },
  output: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      why: { type: "string" },
      slices: { type: "number" },
      entries: { type: "number" },
      chosen: { type: "number" },
      cells: { type: "number" },
      files: { type: "number" },
      estBytes: { type: "number" },
      droppedSlices: { type: "number" },
      droppedCells: { type: "number" },
      // Предметы требования и что по ним прочитано. `uncovered` — СТРОКА для лога и наряда: сюда
      // попадает то, о чём полоса обязана сказать вслух, иначе молчание читается как «всё прочитано».
      uncovered: { type: "string" },
      partial: { type: "string" },
    },
    required: ["ok"],
    additionalProperties: false,
  },
  run(_input, context) {
    const root = runRoot(context)
    const drop = () => { if (existsSync(at(root, FOCUS_PATH))) rmSync(at(root, FOCUS_PATH)) }

    const p = readPlanCells(root)
    if (!p.ok) { drop(); return { ok: false, why: p.why } }

    const computed = parseComputed(readIfExists(root, COMPUTED_PATH))
    const nodes = p.cells.flatMap((c) => (c.files || []).map((f) => f.path))

    // The anchors reach the choice as NAMES and are matched against the file's PATH — step 3's rule
    // (the anchor's text anywhere in the file, hitsFor below) stays where it belongs, MARKING. On
    // run e90d9ce1 that rule named 83 of eddi's 84 entries on the anchor `import`
    // (steps/focus/focus.mjs::names).
    const { slices, orphans } = newSlices({ nodes, edges: computed.edges, routes: computed.api.map((a) => a.at) })
    // The analogue comes from the BRD — one line, read with the ONE parser this repository has for
    // that file (parseBrd, steps/brd). This is not the anchor rule read twice: anchors were already
    // resolved to files by step 3 and arrive through the plan; `analogue` is a single term that
    // exists nowhere else.
    const brd = parseBrd(readIfExists(root, ".agent/brd.md"))
    // The estimate prices what the map will carry, so it needs the counts the map will carry:
    // declarations and api rows per path, both already parsed out of graph-computed.xml above.
    const declsAt = {}
    for (const d of computed.decls) declsAt[d.at] = (declsAt[d.at] || 0) + 1
    const apisAt = {}
    for (const a of computed.api) apisAt[a.at] = (apisAt[a.at] || 0) + 1
    const r = newFocus({ slices, anchors: p.plan.subjects || [], analogue: analogueTerm(brd.analogue), cells: p.cells, edges: computed.edges, decls: declsAt, apis: apisAt })
    if (!r.ok) {
      drop()
      return { ok: false, why: `${r.error.cls}: ${r.error.detail}`, slices: slices.length, entries: slices.length }
    }

    const v = r.value
    // The artifact carries the cones as FACTS about the run, not as a graph: an entry, its kind and
    // its size. The node lists themselves have no reader — the address of a node in the map is
    // deferred with a trigger (docs/big-projects-solution.md §6.2) — and writing 84 of them would be
    // bytes nobody parses.
    const artifact = {
      why: v.why,
      chosen: v.chosen,
      cells: v.cells,
      files: v.files,
      repoFiles: nodes.length,
      estBytes: v.estBytes,
      dropped: v.dropped,
      covered: v.covered,
      uncovered: v.uncovered,
      slices: v.slices.map((s) => ({ id: s.id, entry: s.entry, kind: s.kind, nodes: s.nodes.length })),
    }
    mkdirSync(dirname(at(root, FOCUS_PATH)), { recursive: true })   // written AFTER the decision to accept
    writeFileSync(at(root, FOCUS_PATH), JSON.stringify(artifact, null, 2))
    // ГАРДРЕЙЛ НАД СКРИПТОМ: предмет, потерянный `coverageOf`, останавливает прогон здесь — роли на
    // этом шаге нет, и чинить блокер некому, кроме кода.
    const lost = checkFocus({ focus: v, anchors: p.plan.subjects || [] })
    if (lost.length) { drop(); return { ok: false, why: lost.join("\n  ") } }
    // Что сказать вслух: предмет, не прочитанный ВОВСЕ, и предмет, прочитанный ЧАСТИЧНО. Второе
    // куплено проигрышем: на живом прогоне `agent` числился покрытым двумя клетками из пятидесяти
    // двух, и модуль требования лежал среди отброшенных.
    const uncovered = (v.uncovered || []).filter((u) => u.why === "cap")
      .map((u) => `${u.subject} (${u.slices} срезов, ${u.cells} клеток отброшено потолком)`).join(" · ")
    const partial = (v.covered || []).filter((c) => c.droppedCells)
      .map((c) => `${c.subject}: взято ${c.cells}, отброшено ${c.droppedCells}`).join(" · ")
    return { ok: true, why: v.why, slices: v.slices.length, entries: v.entries, chosen: v.chosen.length, cells: v.cells.length, files: v.files, estBytes: v.estBytes, droppedSlices: v.dropped.slices, droppedCells: v.dropped.cells, uncovered, partial }
  },
}

export const cells = {
  description: "Scout cells from .agent/survey-plan.json: id, kind, subjects and the file list of each cell. The workflow sandbox has no fs and does not parse JSON — this function is how step 4 sees the layout step 3 produced.",
  input: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
  output: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      why: { type: "string" },
      cells: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            kind: { type: "string" },
            subjects: { type: "array", items: { type: "string" } },
            files: {
              type: "array",
              items: {
                type: "object",
                properties: { path: { type: "string" }, bytes: { type: "number" } },
                required: ["path"],
                additionalProperties: false,
              },
            },
          },
          required: ["id", "kind"],
          additionalProperties: false,
        },
      },
    },
    required: ["ok"],
    additionalProperties: false,
  },
  run(_input, context) {
    const root = runRoot(context)
    const r = readPlanCells(root)
    if (!r.ok) return { ok: false, why: r.why }
    // The swarm surveys the FOCUS, not the plan. A missing .agent/focus.json is terminal rather than
    // a quiet fallback to every cell: "there is no focus" must never become "the focus is
    // everything" — on a monolith that is the difference between 3-6 cells and 306
    // (standards/code.md §2).
    const f = readFocus(root)
    if (!f.ok) return { ok: false, why: f.why }
    return {
      ok: true,
      cells: r.cells.filter((c) => f.cells.has(c.id)).map((c) => ({
        id: c.id,
        kind: c.kind,
        subjects: [...(c.subjects || [])],
        files: (c.files || []).map((f) => ({ path: f.path, bytes: f.bytes })),
      })),
    }
  },
}

export const checkPart = {
  description: "Judge a staged graph part by steps/scope/part.mjs::newPart. Takes the CELL ID, never a file list: the files a part must cover are read here from .agent/survey-plan.json, so neither the model nor the workflow can hand the guardrail a list that suits the answer.",
  input: {
    type: "object",
    properties: { path: { type: "string" }, cell: { type: "string" } },
    required: ["path", "cell"],
    additionalProperties: false,
  },
  output: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      modules: { type: "number" },
      gaps: { type: "number" },
      blockers: { type: "string" },
    },
    required: ["ok"],
    additionalProperties: false,
  },
  run({ path, cell }, context) {
    const root = runRoot(context)
    const plan = readPlanCells(root)
    if (!plan.ok) return { ok: false, blockers: plan.why }
    const target = plan.cells.find((c) => c.id === cell)
    if (!target) return { ok: false, blockers: `cell ${cell} is not in ${PLAN_PATH} — the workflow ordered a cell the plan does not carry` }
    if (!existsSync(at(root, path))) {
      return { ok: false, blockers: `${path} does not exist — the role wrote nothing to the staging path` }
    }
    // The inventory is the WHOLE survey, not this cell's slice: the spine answers `<suite>` for the
    // repository, and the files a suite claims (P8) and the wrapper it must run through (P9) live in
    // other cells. Reading it here keeps the same discipline as the cell itself — neither the model
    // nor the workflow hands the guardrail a list that suits the answer.
    const inventory = plan.cells.flatMap((c) => (c.files || []).map((f) => f.path))
    const r = newPart({ xml: readFileSync(at(root, path), "utf8"), cell: target, inventory })
    if (!r.ok) return { ok: false, blockers: r.error.detail }
    return { ok: true, modules: r.value.modules.length, gaps: r.value.gaps.length }
  },
}

// digest — the {FILES} block of one cell's order: a SUMMARY of every file plus the facts step 3
// already computed about it, instead of a bare list of paths the role then opens one by one.
//
// Why it is a host function and not a field of `cells`: the digest of a whole repository is the same
// order of magnitude as the repository (java: 27% of it), and `cells` returns EVERY cell at once. The
// sandbox would hold the entire digest of the run in memory to use one cell of it.
export const digest = {
  description: "The {FILES} block of one cell's order: per file — size, language, package, the imports/routes/drivers a script computed, and the declarations with their visibility. The scout reads a file itself only when this is not enough.",
  input: { type: "object", properties: { cell: { type: "string" } }, required: ["cell"], additionalProperties: false },
  output: {
    type: "object",
    properties: { ok: { type: "boolean" }, why: { type: "string" }, files: { type: "string" } },
    required: ["ok"],
    additionalProperties: false,
  },
  run({ cell }, context) {
    const root = runRoot(context)
    const plan = readPlanCells(root)
    if (!plan.ok) return { ok: false, why: plan.why }
    const target = plan.cells.find((c) => c.id === cell)
    if (!target) return { ok: false, why: `cell ${cell} is not in ${PLAN_PATH}` }

    const computed = parseComputed(readIfExists(root, COMPUTED_PATH))
    const files = (target.files || []).map((f) => {
      let text = ""
      try { text = readFileSync(at(root, f.path), "utf8") } catch { text = "" }
      return { path: f.path, bytes: f.bytes, source: readSource({ path: f.path, text }) }
    })
    return { ok: true, files: newDigest({ files, computed }) }
  },
}

// --- the part cache: .izi/, a PROJECT artifact that outlives a run -------------------------------
//
// A file per cell, not one shared index: cells run in batches of eight in parallel, and a
// read-modify-write of a single JSON would be a race — eight scouts finishing at once would
// overwrite each other's entries.
const CACHE_DIR = ".izi/parts"
const cachedXml = (id) => `${CACHE_DIR}/${id}.xml`
const cachedKey = (id) => `${CACHE_DIR}/${id}.json`

export const reuse = {
  description: "Reuse the cached part of a cell instead of calling a scout — only when composition, sha1 and grammar version all match AND the cached part passes checkPart NOW. Returns ok:false with a reason otherwise; that reason is DATA, not a failure.",
  input: { type: "object", properties: { cell: { type: "string" } }, required: ["cell"], additionalProperties: false },
  output: {
    type: "object",
    properties: { ok: { type: "boolean" }, why: { type: "string" }, modules: { type: "number" }, gaps: { type: "number" } },
    required: ["ok"],
    additionalProperties: false,
  },
  run({ cell }, context) {
    const root = runRoot(context)
    const plan = readPlanCells(root)
    if (!plan.ok) return { ok: false, why: plan.why }
    const target = plan.cells.find((c) => c.id === cell)
    if (!target) return { ok: false, why: `cell ${cell} is not in ${PLAN_PATH}` }

    let stored = null
    const raw = readIfExists(root, cachedKey(cell))
    if (raw.trim()) { try { stored = JSON.parse(raw) } catch { stored = null } }
    const verdict = decide({ cell: target, stored, grammar: GRAMMAR_VERSION })
    if (!verdict.reuse) return { ok: false, why: verdict.why }

    // Matching hashes are NOT enough. The cache may have arrived from somebody else's commit or from
    // another branch of the rules, and the only thing that closes a step is a green guardrail NOW —
    // the very same one that judges a scout.
    const xml = readIfExists(root, cachedXml(cell))
    if (!xml.trim()) return { ok: false, why: "no-part" }
    const r = newPart({ xml, cell: target })
    if (!r.ok) return { ok: false, why: `stale-part: ${r.error.detail.split("\n")[0]}` }

    mkdirSync(dirname(at(root, `.agent/graph-parts/${cell}.xml`)), { recursive: true })
    writeFileSync(at(root, `.agent/graph-parts/${cell}.xml`), xml)
    return { ok: true, why: "hit", modules: r.value.modules.length, gaps: r.value.gaps.length }
  },
}

export const remember = {
  description: "Store a cell's ACCEPTED part in .izi/parts/ together with the composition, sha1 set and grammar version it was accepted under. Called after promote, never before: only a green part is worth remembering.",
  input: { type: "object", properties: { cell: { type: "string" } }, required: ["cell"], additionalProperties: false },
  output: { type: "object", properties: { ok: { type: "boolean" }, why: { type: "string" } }, required: ["ok"], additionalProperties: false },
  run({ cell }, context) {
    const root = runRoot(context)
    const plan = readPlanCells(root)
    if (!plan.ok) return { ok: false, why: plan.why }
    const target = plan.cells.find((c) => c.id === cell)
    if (!target) return { ok: false, why: `cell ${cell} is not in ${PLAN_PATH}` }
    const from = at(root, `.agent/graph-parts/${cell}.xml`)
    if (!existsSync(from)) return { ok: false, why: `.agent/graph-parts/${cell}.xml не существует — запоминать нечего` }

    mkdirSync(at(root, CACHE_DIR), { recursive: true })
    copyFileSync(from, at(root, cachedXml(cell)))
    writeFileSync(at(root, cachedKey(cell)), JSON.stringify(entryFor(target, GRAMMAR_VERSION), null, 2))
    return { ok: true }
  },
}

// --- graph: the parts and the computed facts → .agent/appgraph.xml ------------------------------
//
// The parts are read BY THE PLAN, never by listing `.agent/graph-parts/`: a cell whose part is
// missing is a lost subtree, and a directory listing would simply not contain it — the graph would
// come out smaller and green. The plan is the authority on what the swarm owed.
const GRAPH_PATH = ".agent/appgraph.xml"
// Step 11's verdict — moved up from beside `review` itself, because checkFrd (below) now reads it too:
// F9 (steps/intake/frd.mjs) judges a rewind against the review that ordered it, and one path constant
// serves both readers instead of two literals drifting apart.
const REVIEW_PATH = ".agent/review.xml"
// Step 6's artifact and step 7's, named once each. `.agent/mode` holds ONE word and nothing else: its
// readers are scripts (steps 8 and 10), and a word is the smallest thing that cannot be misparsed.
const FRD_PATH = ".agent/frd.xml"
// Критик судит артефакт, который роль ТОЛЬКО ЧТО написала: staging, если он есть.
const FRD_STAGING = `${STAGING_DIR}/frd.xml`
const BRD_PATH = ".agent/brd.md"
const MODE_PATH = ".agent/mode"
// Step 8's two artifacts. `.agent/design` holds ONE word for the same reason `.agent/mode` does — the
// program branches on it; `.agent/ripple.xml` is the subgraph step 9's role is handed instead of the
// whole map.
const DESIGN_PATH = ".agent/design"
const RIPPLE_PATH = ".agent/ripple.xml"

export const buildGraph = {
  description: "Merge every graph part and the script's computed facts into .agent/appgraph.xml — steps/graph/graph.mjs::newGraph wired to disk. Parts are read by the FOCUS (.agent/focus.json), so a missing part of a focused cell is named instead of silently shrinking the graph, while a cell the focus left out is not expected to have one. A narrowed map declares its own boundary in a <focus> element. Written only after a green merge.",
  input: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
  output: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      why: { type: "string" },
      modules: { type: "number" },
      components: { type: "number" },
      isolated: { type: "number" },
      levels: { type: "number" },
      edges: { type: "number" },
      suites: { type: "number" },
      gaps: { type: "number" },
      cycles: { type: "number" },
      surface: { type: "number" },
      systems: { type: "number" },
      unanswered: { type: "array", items: { type: "string" } },
      at: { type: "string" },
    },
    required: ["ok"],
    additionalProperties: false,
  },
  run({ path }, context) {
    const root = runRoot(context)
    const p = readPlanCells(root)
    if (!p.ok) return { ok: false, why: p.why }
    // The FOCUS decides which cells must be closed, and it is a refusal when it is absent — the same
    // rule step 4 follows. "There is no focus" and "the focus is everything" are different facts:
    // falling back to the plan here would survey by one list and merge by another.
    const f = readFocus(root)
    if (!f.ok) return { ok: false, why: f.why }

    const parts = []
    for (const c of p.cells.filter((c) => f.cells.has(c.id))) {
      const from = `.agent/graph-parts/${c.id}.xml`
      if (!existsSync(at(root, from))) {
        return { ok: false, why: `${from} не существует — клетка ${c.id} ФОКУСА не закрыта частью, поддерево потеряно` }
      }
      parts.push({ id: c.id, kind: c.kind, xml: readFileSync(at(root, from), "utf8") })
    }

    const r = newGraph({ parts, computedXml: readIfExists(root, COMPUTED_PATH), plan: p.plan, focus: f.focus })
    if (!r.ok) return { ok: false, why: r.error.detail }

    const g = r.value
    mkdirSync(dirname(at(root, path)), { recursive: true })   // written AFTER the decision to accept
    writeFileSync(at(root, path), graphXml(g))
    return {
      ok: true,
      modules: g.modules.length,
      components: g.components.length,
      isolated: g.isolated.length,
      levels: g.modules.reduce((n, m) => Math.max(n, m.level), 0),
      edges: g.edges.length,
      suites: g.suites.length,
      gaps: g.gaps.length,
      cycles: g.cycle.length,
      surface: g.surface.length,
      systems: g.systems.length,
      unanswered: [...g.unanswered],
      at: new Date().toISOString(),
    }
  },
}

// --- intake: the map read, and the FRD judged --------------------------------------------------
//
// The map is handed to the role WHOLE or not at all. Above the reading ceiling the step refuses with
// the number instead of degrading into a form whose price nobody has measured — the reasoning, and
// what would bring the index form back, is docs/intake.md §3.
export const graphMap = {
  description: "Read .agent/appgraph.xml for step 6 and measure what it costs to hand it to a role (steps/intake/map.mjs). Above the reading ceiling the map DEGRADES to its index form — nodes, their kind and their <api>, without declarations, prose or edges — and says so in the artifact it hands over (form=\"index\"). Only an index that is itself over the ceiling is a refusal. Returns the SECOND map with it: `types` is the table of every capitalized name of TASK.md, .agent/brd.md and the operator's answers that resolves in .agent/graph-computed.xml — name · path · kind · what it declares (steps/tickets/facts.mjs::namedTypes). A name that resolves nowhere gets no row and stays a legal question to the operator.",
  // resolve — РЕЛЬСА lookup шага 6: роль назвала типы, которых ей не хватило, и просит ФАКТ, а не
  // человека. Тогда карта не читается вовсе — считается только таблица по этим именам.
  input: { type: "object", properties: { resolve: { type: "array", items: { type: "string" } }, spent: { type: "number" }, cap: { type: "number" }, pending: { type: "string" } }, additionalProperties: false },
  output: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      why: { type: "string" },
      text: { type: "string" },
      bytes: { type: "number" },
      nodes: { type: "number" },
      cap: { type: "number" },
      form: { type: "string" },
      fullBytes: { type: "number" },
      types: { type: "string" },
      typeRows: { type: "number" },
      // answer — готовый текст ответа рельсы lookup (steps/intake/lookup.mjs::lookupAnswer)
      answer: { type: "string" },
    },
    required: ["ok"],
    additionalProperties: false,
  },
  run({ resolve, spent = 0, cap = 0, pending = "" } = {}, context) {
    const root = runRoot(context)
    if (!existsSync(at(root, GRAPH_PATH))) {
      return { ok: false, why: `${GRAPH_PATH} не существует — шаг 5 не отработал, читать нечего` }
    }
    const text = readFileSync(at(root, GRAPH_PATH), "utf8")

    // РЕЛЬСА lookup. Роль просит имена — возвращаются ТОЛЬКО строки таблицы по ним, без карты: карта
    // у неё уже есть в наряде, а стоит она 107 811 Б, и возить её ради одного пути незачем.
    // Ни одно имя не резолвится — `types` пуст, и полоса скажет роли, что таких типов в репозитории
    // нет; выдумывать путь ей нечем, а спросить оператора она по-прежнему вправе.
    if (Array.isArray(resolve) && resolve.length) {
      const asked = namedTypes(resolve.join(" "), factsOf(parseMap(text), parseComputed(readIfExists(root, COMPUTED_PATH))))
      // ГОТОВЫЙ ТЕКСТ, а не составные части: собирает его чистая функция
      // (steps/intake/lookup.mjs), у которой есть свой юнит. Полосе остаётся ОДНО поле — перепутать
      // его со счётчиком, как это случилось на прогоне 64cebdda, больше не с чем.
      return { ok: true, types: typesBlock(asked), typeRows: asked.length, answer: mergeFeedback({ pending, answer: lookupAnswer({ names: resolve, rows: typesBlock(asked), spent, cap }) }) }
    }

    // ВТОРАЯ КАРТА, ПОДСТАВЛЕННАЯ, А НЕ НАЙДЕННАЯ. Роль шага 6 не ищет того, что скрипт уже знает:
    // каждое заглавное имя, которое называют TASK.md, BRD и ответы оператора, резолвится по
    // `.agent/graph-computed.xml` (все файлы репозитория) поверх карты роя (клетки фокуса) — ОДНИМ
    // резолвером, тем самым, которым шаг 12 наполняет наряды (steps/tickets/facts.mjs::factsOf).
    //
    // BUG_FIX_CONTEXT: живой прогон 19.08.2026, форма eddi (DOS-535). Роль спросила оператора
    //   «AgentConfiguration model class path (not in appgraph.xml — needed for R3 `glossaries` field
    //   delta; recommended to search agentstore or engine packages)», и это был третий круг: имя
    //   AgentConfiguration оператор назвал ещё в ПЕРВОМ ответе (06:39), а путь роль спросила в 06:56.
    //   Путь всё это время лежал в graph-computed.xml — `<decl at="src/main/java/ai/labs/eddi/configs/
    //   agents/model/AgentConfiguration.java" kind="class"/>` — и карта роя (86 узлов фокуса) его не
    //   несла ни разу. Поэтому источник имён — не только задача и BRD, но и .agent/answers.md: имя,
    //   которое оператор УЖЕ произнёс, приезжает в следующий наряд с путём, и второй вопрос про него
    //   задать нечем.
    const named = namedTypes(
      `${readIfExists(root, TASK_PATH)}\n${readIfExists(root, BRD_PATH)}\n${readIfExists(root, ANSWERS_PATH)}`,
      factsOf(parseMap(text), parseComputed(readIfExists(root, COMPUTED_PATH))),
    )
    const types = typesBlock(named)

    const m = mapMeasure(text)
    if (!m.overCap) return { ok: true, text, bytes: m.bytes, nodes: m.nodes, cap: MAP_CAP_BYTES, types, typeRows: named.length }

    // Above the ceiling the map DEGRADES instead of refusing — and it says so. The full file stays on
    // disk for steps 8 and 10; what changes is only what step 6's role is handed.
    //
    // BUG_FIX_CONTEXT: runs fa8def32 and fb57f506 died here, 2-3% over, with the swarm already paid
    //   for. Refusing was honest and final; degrading is honest and lets the run continue, which is
    //   the whole point of measuring before the swarm instead of after it. The index declares
    //   `form="index" without="decl role io edge"`, so the role can never mistake "no edges written"
    //   for "no dependencies exist".
    const index = mapIndex(text)
    const mi = mapMeasure(index)
    if (mi.overCap) {
      return { ok: false, why: `карта ${m.bytes} Б и даже её индекс ${mi.bytes} Б выше потолка чтения ${MAP_CAP_BYTES} Б на ${mi.nodes} узлах — сузить фокус нечем, читать нечем`, bytes: m.bytes, nodes: m.nodes, cap: MAP_CAP_BYTES }
    }
    // The table travels with the INDEX too, and it is worth more there than anywhere: the index is
    // exactly the form that drops the declarations, so the only paths of types the role still holds
    // are these.
    return { ok: true, text: index, bytes: mi.bytes, nodes: mi.nodes, cap: MAP_CAP_BYTES, form: "index", fullBytes: m.bytes, types, typeRows: named.length }
  },
}
// THE GATE OF STEP 6 lives at the END of this function, and only on a GREEN check — see the block
// after `newFrd` succeeds.
export const checkFrd = {
  description: "Judge a staged FRD by steps/intake/frd.mjs::newFrd. Node keys come from .agent/appgraph.xml; a number in a field's domain or an NFR's fit must occur in TASK.md, in the VALUES of operator answers, in a BRD requirement's fit or verify, or in the map itself. When .agent/review.xml carries a Reject, its blockers travel in as `rewind` for F9: a `goal-not-delivered` whose evidence no longer resolves in the new FRD is refused — the subject of a rewind is not repaired by deleting it. AFTER a green check, and only then, the gate: a node of the change's width that no suite of the repository executes (steps/ripple/ripple.mjs::blindNodes) is asked about the OPERATOR — ok:false with ask:true carries the questions verbatim; an answer `suite` or `drop` comes back as ok:false with stop:true, `accept` as ok:true with waived:N.",
  input: { type: "object", properties: { path: { type: "string" }, pass: { type: "string" } }, required: ["path"], additionalProperties: false },
  output: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      // pass — на красном ПОЛНОМ суде: РАННИЙ пласт среди блокеров, то есть проход, с которого полоса
      // переигрывает шаг (steps/intake/frd.mjs::passOfBlocker). Пусто в проходном режиме: там пласт
      // задал вызывающий.
      pass: { type: "string" },
      deltas: { type: "number" },
      unknown: { type: "number" },
      scenarios: { type: "number" },
      questions: { type: "number" },
      touched: { type: "number" },
      blockers: { type: "string" },
      // The gate's three answers, and they are three DIFFERENT rails for the caller: `ask` goes to the
      // operator (no role is re-delegated — the artifact is green, the repository is not), `stop` ends
      // the run (the repair is a human's: a suite is written or a requirement is withdrawn), `waived`
      // is the count of nodes whose unverifiability the operator accepted on purpose.
      ask: { type: "boolean" },
      subject: { type: "string" },
      items: { type: "array", items: { type: "string" } },
      stop: { type: "boolean" },
      why: { type: "string" },
      waived: { type: "number" },
    },
    required: ["ok"],
    additionalProperties: false,
  },
  run({ path, pass = "" }, context) {
    const root = runRoot(context)
    if (!existsSync(at(root, path))) {
      return { ok: false, blockers: `${path} не существует — роль ничего не записала по staging-пути` }
    }
    if (!existsSync(at(root, GRAPH_PATH))) {
      return { ok: false, blockers: `${GRAPH_PATH} не существует — узлы карты неизвестны, судить дельту нечем` }
    }

    const mapText = readFileSync(at(root, GRAPH_PATH), "utf8")
    // PROVENANCE IS JUDGED WHEN THE ARTEFACT IS WRITTEN, NOT FOREVER AFTER. The two callers are told
    // apart by the path. STAGING is an artefact a role is writing NOW: every number must be evidence
    // of THIS run, or a dead run's answer legalises an invented default — the rule newRun exists for,
    // and the seam beside it in ext/index.test.mjs. The PROMOTED .agent/frd.xml is a different
    // question: resume asks whether the artefact still STANDS (workflows/izi.js::band) — its nodes
    // resolve, its use cases carry scenarios, its deltas are classified. It already passed provenance
    // once, under evidence that existed then; re-deriving it against today's files re-judges history.
    //
    // BUG_FIX_CONTEXT: live run c87db886. The FRD went green, the operator approved the plan, step 13
    // refused on an unrelated defect — and no later run could close step 6 again: `newRun` moves
    // answers.md into .agent/prev/, and .agent/prev/ holds exactly ONE run, so the twenty answers
    // behind the FRD's numbers were overwritten by the next run's two. The band replayed from step 6
    // and asked everything anew. Provenance kept as a resume rule means: an artefact whose evidence
    // is one run old can never be resumed — on any project where numbers come from the operator.
    const judgingStaged = String(path).includes(`${STAGING_DIR}/`)
    const ans = judgingStaged ? parsedAnswers(readIfExists(root, ANSWERS_PATH)) : { ok: false }
    // The provenance of a number: the task, the VALUES of the operator's answers (never the wording
    // of a question — the alternatives an offer lists are the role's own words), the fit criteria of
    // the BRD, and the map. The BRD arrives through parseBrd — one parser, from steps/brd.
    // BOTH `fit` and `verify`. Live run e132f0a1: the BRD said `R1 verify: … возвращают 200`, the
    // slice took `fit` alone, and F5 told the role the number 200 stood "nowhere in the BRD" — so the
    // role deleted a correct number to satisfy a blocker that was wrong. A number in the criterion by
    // which a requirement is CHECKED is that requirement's number just as much as one in its fit.
    const brd = parseBrd(readIfExists(root, ".agent/brd.md"))
    const fits = brd.requirements.map((r) => `${r.fit || ""}\n${r.verify || ""}`).join("\n")
    // ТРЕБОВАНИЯ BRD — вход F11. До этой строки шаг 6 получал из BRD только ЧИСЛА (словарь для F5),
    // и требование, не доехавшее до FRD ни одним элементом, ловить было нечем: критик строил
    // чек-лист из самого FRD, где требования уже не было (форма t2, два прогона).
    // Только на staging: промоутнутый артефакт судится на то, СТОИТ ли он, а не переписывается.
    const requirements = judgingStaged ? brd.requirements.map((r) => r.id).filter(Boolean) : []
    // Числа судятся только на staging: пустой список источников гасит ветку invented-default в
    // steps/intake/frd.mjs::provenance, а словарь допустимых `source` остаётся в силе для обоих.
    const sources = judgingStaged
      ? [readIfExists(root, TASK_PATH), ...(ans.ok ? ans.value.map((a) => a.text) : []), fits, mapText]
      : []

    const map = parseMap(mapText)
    // ВТОРАЯ КАРТА ДЛЯ ШАГА 6. `.agent/graph-computed.xml` пишет скрипт шага 3 по ВСЕМ файлам (живой
    // счёт eddi: 6890 объявлений против 88 узлов карты роя), и ниже шага 5 его не читал никто. Без
    // него правило F8 невозможно физически: `grep -c AgentConfiguration appgraph.xml` = 0, а тип
    // существует. Файла может не быть (прогон снят до того, как шаг 3 стал его писать) — тогда
    // таблицы пусты и правила, которые на них стоят, молчат.
    const comp = parseComputed(readIfExists(root, COMPUTED_PATH) || "")
    const TYPE_KINDS = new Set(["class", "interface", "enum", "record", "type", "struct", "trait"])
    const types = new Map()
    const members = new Map()
    for (const d of comp.decls || []) {
      if (TYPE_KINDS.has(d.kind) && d.name && d.at && !types.has(d.name)) types.set(d.name, d.at)
      if (!d.at) continue
      if (!members.has(d.at)) members.set(d.at, new Set())
      members.get(d.at).add(String(d.name || "").replace(/\(.*/, ""))
    }
    // F9's input: a rewind exists only when the LAST review Rejected — band() only rewinds to step 6
    // after review() wrote that verdict (docs/review.md §6), and .agent/review.xml is what carries it.
    // A Pass, or no verdict at all (first attempt, or a run that never reached step 11), means this is
    // not a rewind: rewind stays [] and F9 (steps/intake/frd.mjs) is as silent as F5 with no sources.
    // F14 — ТРИ ФАКТА, ДОБЫТЫЕ ПОЛОСОЙ РАНЬШЕ, и ни одного нового: якоря требования (шаг 2), каталоги
    // репозитория (вычисленный граф шага 3) и аналог, который копируют, а не меняют.
    const subjects = brd.subjects || []
    const analogue = brd.analogue || ""
    const dirs = new Set((comp.decls || []).map((d) => String(d.at || "").split("/").slice(0, -1).join("/")).filter(Boolean))
    const lastReview = parseReview(readIfExists(root, REVIEW_PATH))
    // Маршруты репозитория — вход F10: у пути из канала есть владелец, и это факт карты.
    const routes = (comp.api || []).map((r) => ({ at: r.at, name: r.name }))
    // Рёбра вычисленного графа: связка «реализация → интерфейс», которой в карте роя нет.
    const links = (comp.edges || []).map((e) => ({ from: e.from, to: e.to }))
    const rewind = lastReview.verdict === "Reject" ? lastReview.blockers.map((b) => ({ code: b.code, node: b.node, evidence: b.evidence })) : []
    // F13 — ОТВЕТЫ ОПЕРАТОРА КАК ВХОД ГАРДРЕЙЛА. Их разбирает тот же модуль, что пишет их на диск
    // (core/answers.mjs::newAnswers): «что такое ответ» отвечено один раз на весь конвейер.
    const heard = newAnswers(readIfExists(root, ANSWERS_PATH))
    const r = newFrd({ xml: readFileSync(at(root, path), "utf8"), nodes: map.nodes, tests: map.tests, entries: map.entries, edges: map.edges, sources, rewind, types, members, routes, requirements, links, pass, said: heard.ok ? heard.value : [], subjects, analogue, dirs })
    if (!r.ok) {
      // На ПОЛНОМ суде красное — это расхождение пластов между собой, и чинить его начинает РАННИЙ из
      // них: правка нижнего пласта снимает находки верхних, обратное неверно. В проходном режиме поле
      // пусто — пласт назвал вызывающий, и называть его обратно значило бы отвечать вопросом.
      const worst = pass ? "" : entryPass(r.error.detail)
      return { ok: false, blockers: r.error.detail, ...(worst ? { pass: worst } : {}) }
    }
    const v = r.value
    const seen = { deltas: v.deltas.length, unknown: v.unknown, scenarios: v.scenarios.length, questions: v.questions.length, touched: v.touched.length }

    // THE GATE, and it fires ONLY HERE — after the check came back green. On a red check the rail is
    // the ROLE's (the FRD is re-delegated with the blockers), and asking the operator about an
    // artifact the role is still rewriting would spend a trip on a change that no longer exists by the
    // time the answer lands. The width itself is a function of that artifact.
    //
    // BUG_FIX_CONTEXT: live run 21dd9b34 (runbox/quarkus-rest-json-app-v2-t2). The band ran to step 11
    //   and escalated on `unverifiable-node · …/fruits.html` — a page no suite of the repository
    //   executes. Both operands of that fact existed the moment this check went green: the map (step 5)
    //   and the width of the change (this artifact). Between the green check and the escalation stood
    //   167 805 tokens and five role launches (valuer, designer, router, critic ×2), and none of them
    //   could have repaired it — a suite is written by a human. The gate stands where the fact first
    //   becomes relevant, and its rail is the operator's because the repair is the operator's.
    // ГЕЙТ СЬЮТОВ СТОИТ ТОЛЬКО НА ПОЛНОМ СУДЕ. Он спрашивает ОПЕРАТОРА о ширине изменения целиком, а
    // в проходе B ширина ещё растёт: спросить о ней в середине значит разбудить человека вопросом,
    // который через два прохода будет о другом наборе узлов.
    const blind = pass ? { known: false, nodes: [] } : blindNodes({ frd: v, map })
    if (!blind.known || !blind.nodes.length) return { ok: true, ...seen }

    const said = ans.ok ? ans.value : []
    const decided = blind.nodes.map((node) => ({ node, ...waiverFor({ node, answers: said }) }))
    const asking = decided.filter((d) => !d.word)
    if (asking.length) {
      // The suites and their commands are FACTS ABOUT THE REPOSITORY and travel in `evidence`, never
      // in the question's text: the text is compared against the stored answer, and a question built
      // out of values stops matching its own answer when a value changes (run 46edab60).
      const cmds = (map.suites || []).map((s) => `${s.id}: ${s.cmd || "(без команды)"}`).join(" · ") || "сьютов в карте нет вовсе"
      return {
        ok: false,
        ask: true,
        subject: asking.map((d) => d.question).join("\n\n"),
        items: asking.map((d) => d.question),
        why: `узлов без сьюта: ${asking.map((d) => d.node).join(", ")}`,
      }
    }

    const stop = decided.filter((d) => d.word !== "accept")
    if (stop.length) {
      const how = (d) => (d.word === "suite"
        ? `заведи сьют, исполняющий ${d.node}, и перезапусти полосу`
        : `сними требование правкой TASK.md/BRD (НЕ FRD) по узлу ${d.node} и перезапусти полосу`)
      return { ok: false, stop: true, why: `оператор ответил на гейте шага 6: ${stop.map((d) => `${d.node} → ${d.word}`).join("; ")}. Что делать: ${stop.map(how).join("; ")}` }
    }
    return { ok: true, ...seen, waived: decided.length }
  },
}

// --- weight: the forms of the FRD's deltas → one word of SemVer ---------------------------------
//
// The whole of step 7: no role, no operator, no token. The judgement it folds was made at step 6 —
// what a delta does to a call that exists today — and the fold itself is steps/weight/weight.mjs.
//
// ERASING is half the contract, not housekeeping. "No weight" must mean "no file": newRun carries the
// run's STATE into .agent/prev but leaves the artifacts where they are, so yesterday's `.agent/mode`
// would survive today's refusal and step 8 would read it without ever noticing (docs/weight.md §4).
export const weight = {
  description: "Weigh the change by the FORMS of the deltas in .agent/frd.xml (steps/weight/weight.mjs::newMode) and write the one word of .agent/mode. An Unknown delta, no delta or a form outside the vocabulary is ok:false — and then .agent/mode is REMOVED, so that step 8 can never read a previous run's weight.",
  input: { type: "object", properties: {}, additionalProperties: false },
  output: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      why: { type: "string" },
      mode: { type: "string" },
      earned: { type: "string" },
      deltas: { type: "number" },
    },
    required: ["ok"],
    additionalProperties: false,
  },
  run(_input, context) {
    const root = runRoot(context)
    const drop = () => { if (existsSync(at(root, MODE_PATH))) rmSync(at(root, MODE_PATH)) }

    if (!existsSync(at(root, FRD_PATH))) {
      drop()
      return { ok: false, why: `${FRD_PATH} не существует — шаг 6 intake не отработал, взвешивать нечего` }
    }
    const deltas = parseFrd(readFileSync(at(root, FRD_PATH), "utf8")).deltas
    const r = newMode({ deltas })
    if (!r.ok) {
      drop()
      return { ok: false, why: `${r.error.cls}:\n  ${r.error.detail}`, deltas: deltas.length }
    }
    mkdirSync(dirname(at(root, MODE_PATH)), { recursive: true })   // written AFTER the decision to accept
    writeFileSync(at(root, MODE_PATH), r.value.mode)               // one word, no trailing newline
    return { ok: true, mode: r.value.mode, earned: r.value.why.join(", "), deltas: deltas.length }
  },
}

// --- ripple: is a design needed, and over which nodes --------------------------------------------
//
// The whole of step 8: no role, no operator, no token. Three artifacts in, two out. The map is read by
// THE map reader (steps/intake/map.mjs) and the FRD by THE frd parser (steps/intake/frd.mjs) — a
// second parser of either grammar is how two readers of one file start disagreeing.
//
// ERASING BOTH is half the contract, exactly as it is for `.agent/mode` (docs/weight.md §4): newRun
// carries the run's STATE into .agent/prev and leaves the artifacts, so yesterday's `.agent/design`
// would survive today's refusal and step 9 would be ordered — or skipped — on a subgraph nobody
// computed today.
export const ripple = {
  description: "Decide whether step 9 designer is needed and cut the ripple subgraph out of the map (steps/ripple/ripple.mjs::newRipple). Writes .agent/design (needed|skip) and .agent/ripple.xml. Any refusal — no weight, no delta, a seed the map does not declare, a subgraph above the reading ceiling — is ok:false, and then BOTH files are REMOVED so that step 9 can never read a previous run's verdict.",
  input: { type: "object", properties: {}, additionalProperties: false },
  output: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      why: { type: "string" },
      design: { type: "string" },
      mode: { type: "string" },
      seeds: { type: "number" },
      nodes: { type: "number" },
      total: { type: "number" },
    },
    required: ["ok"],
    additionalProperties: false,
  },
  run(_input, context) {
    const root = runRoot(context)
    const drop = () => {
      for (const p of [DESIGN_PATH, RIPPLE_PATH]) if (existsSync(at(root, p))) rmSync(at(root, p))
    }

    for (const [path, why] of [[FRD_PATH, "шаг 6 intake не отработал"], [GRAPH_PATH, "шаг 5 graph не отработал"], [MODE_PATH, "шаг 7 weight не отработал"]]) {
      if (!existsSync(at(root, path))) {
        drop()
        return { ok: false, why: `${path} не существует — ${why}, рябь считать не от чего` }
      }
    }

    const xml = readFileSync(at(root, GRAPH_PATH), "utf8")
    const map = parseMap(xml)
    const mode = readFileSync(at(root, MODE_PATH), "utf8")
    // Второй источник узлов — вычисленный граф шага 3: он знает ВСЕ файлы, карта роя — только фокус.
    const repo = pathsOf(parseComputed(readIfExists(root, COMPUTED_PATH)))
    const r = newRipple({ xml, frd: parseFrd(readFileSync(at(root, FRD_PATH), "utf8")), mode, map, repo })
    if (!r.ok) {
      drop()
      return { ok: false, why: `${r.error.cls}:\n  ${r.error.detail}` }
    }

    mkdirSync(dirname(at(root, DESIGN_PATH)), { recursive: true })  // written AFTER the decision to accept
    writeFileSync(at(root, RIPPLE_PATH), `${r.value.xml}\n`)
    writeFileSync(at(root, DESIGN_PATH), r.value.design)            // one word, no trailing newline
    return { ok: true, design: r.value.design, mode: mode.trim(), seeds: r.value.seeds.length, nodes: r.value.nodes.length, total: map.count }
  },
}

// --- design: the change's dictionary, composed by the script and named by the role ----------------
//
// STEP 9 IS BEING REWRITTEN, AND TODAY IT ENDS AFTER PASS A. What survives of the old three-pass
// construction is its DELIVERABLE grammar (steps/design/design.mjs, read by step 10); the two passes
// that used to fill it — the node graph and the routes — were deleted with their swarms, and the
// artifacts they produced (`.agent/design-graph.xml`, `.agent/data-flow.md`) are not written by any
// code in this file any more. The band says so out loud instead of walking on (workflows/izi.js).
//
// ONE function, THREE calls, told apart by their arguments — the same step, asked three questions:
//   design({})              the GATE: reads `.agent/design` (written by step 8) and erases every
//                           artifact of the step that is not green NOW. Yesterday's design must not
//                           survive into today's run in any branch. The argument is the one
//                           `.agent/mode` and `.agent/ripple.xml` are erased by (docs/weight.md §4,
//                           docs/ripple.md §5): newRun carries the run's STATE into .agent/prev and
//                           leaves the ARTIFACTS.
//   design({ skeleton: p }) COMPOSE: write the dictionary's skeleton to the staging path `p` — one
//                           row per end of every use case with its `closes` already filled in, one
//                           row per call of every node of the change copied verbatim out of the
//                           ripple. This is the whole composition of the artifact, and it costs no
//                           tokens (steps/design/values.mjs::valuesSkeleton).
//   design({ path })        the CHECK: judge what the role staged against a freshly recomputed
//                           skeleton, and on green NORMALIZE and promote it to `.agent/values.xml`.
//
// The FRD is read by THE frd parser and the subgraph by THE map reader — the same discipline the
// ripple keeps: a second parser of either grammar is how two readers of one file start disagreeing.
const DESIGN_GRAPH_PATH = ".agent/design-graph.xml"
const VALUES_PATH = ".agent/values.xml"
const NODES_PATH = ".agent/design-nodes.xml"
const DATA_FLOW_PATH = ".agent/data-flow.md"

// GREEN NOW, NOT GREEN ONCE — the same rule `bandStart` applies to the band (workflows/izi.js). A
// promoted dictionary is reusable only while its own guardrail still accepts it: the FRD or the
// ripple may have moved under it since, and the skeleton is a function of both.
const frdOf = (root) => parseFrd(readFileSync(at(root, FRD_PATH), "utf8"))
const greenValues = (root) => {
  if (!existsSync(at(root, VALUES_PATH)) || !existsSync(at(root, FRD_PATH)) || !existsSync(at(root, RIPPLE_PATH))) return null
  const staged = readFileSync(at(root, VALUES_PATH), "utf8")
  const frd = frdOf(root)
  const ripple = readFileSync(at(root, RIPPLE_PATH), "utf8")
  return checkValues({ staged, frd, ripple }).length ? null : parseValues(staged)
}

// УДАЛЕНО 21.08.2026: `greenChains` сторожил пару design-graph.xml + data-flow.md старого
// шага 9. Пары больше нет — новый шаг пишет дерево модулей и потоки (docs/plan.md).

// УДАЛЕНО 21.08.2026 вместе со старым шагом 9 (docs/plan.md): `design`.

// --- parts: the change as a tree of modules, cut into partitions ----------------------------------
// Phases ①②③ of step 9 (steps/design-data-flow.md), and all three cost no tokens. The partition is
// the unit of ONE role call, and its invariant — every module in exactly one partition — is what
// makes a duplicate impossible: no two calls can decide one file. The card of each partition is
// written here so the workflow only reads it.
const PARTS_DIR = ".agent/staging/parts"
// Маршрутов в ОДНОЙ порции прохода B. Четыре — по той же мерке, что и модулей в порции карточки:
// выход роли около полусотни строк, минута работы, обрыв стоит порции, а не всего прохода.
const CHAINS_CAP = 4

// WHERE THE STEP'S DELIVERABLE LIVES, and why it is not `.agent/`. The plan outlives the run: it is
// read by a human at the gate, committed, and cut into tickets. `.agent/` is run STATE — rotated by
// newRun, erased by the gates, and gitignored in every form.
//
// The directory is keyed by the TASK KEY, the same one the branch is named after, for a reason a
// second task would have found the hard way: two changes in one repository share the partition slugs
// (`configs-glossary` is `configs-glossary` in both), and a flat `docs/design/` would let the second
// change silently overwrite the first one's decisions.
//
// The key is asked ONCE, by the SAME verbatim question step 10 asks (steps/plan/plan.mjs::KEY_QUESTION),
// so the answer written to .agent/answers.md serves both and the operator is never asked twice.
// TWO SOURCES, ONE ORDER. The operator's answer comes first — it can correct what the task says;
// then TASK.md itself, because a key already written there is a key nobody should be asked for. Both
// are READ, never written: fabricating an answer nobody gave would make .agent/answers.md lie about
// who decided what.
const taskKey = (root) => {
  const said = parsedAnswers(readIfExists(root, ANSWERS_PATH))
  const hit = (said.ok ? said.value : []).find((a) => String(a.question || "").trim() === KEY_QUESTION.trim())
  const answered = String((hit && hit.text) || "").trim()
  if (TASK_KEY.test(answered)) return answered

  // In TASK.md the key is DECLARED, not hunted for: a line `task: DOS-535`. Scanning the whole text
  // for anything shaped like a key was the first version and it is wrong — a task that mentions a
  // neighbouring ticket («как в DOS-100») would name the branch and the plan's directory after it,
  // silently. A declaration has an author; a match has none.
  const line = String(readIfExists(root, TASK_PATH)).match(/^[ \t]*task[ \t]*:[ \t]*(\S+)[ \t]*$/im)
  const declared = String((line && line[1]) || "").trim()
  return TASK_KEY.test(declared) ? declared : ""
}

const taskDir = (root) => {
  const key = taskKey(root)
  return key ? `task/${key}` : ""
}

// Everything this repository can resolve a path to: the map's own modules. Rule 5 of the guardrail
// asks whether a declared call is an ADDRESS, and this is the address book.
const knownPaths = (map) => [...String(map || "").matchAll(/<module\b[^>]*\bpath="([^"]+)"/g)].map((m) => m[1])

// УДАЛЕНО 21.08.2026 вместе со старым шагом 9 (docs/plan.md): `parts`.

// chainsJoin — ПОРЦИИ ЦЕПОЧЕК, СКЛЕЕННЫЕ В ОДИН ОТВЕТ ПРОХОДА B. Судит собранный файл тот же
// `checkChains`, что судил бы ответ одного вызова: состав маршрутов он пересчитывает из требования и
// словаря, а не из того, сколько раз звали роль.
// УДАЛЕНО 21.08.2026 вместе со старым шагом 9 (docs/plan.md): `chainsJoin`.

// partJoin — ПОРЦИИ, СКЛЕЕННЫЕ В ПЛАН ПАРТИИ. Роль пишет по порции за вызов; судит и продвигает
// артефакт `part`, и судит он партию ЦЕЛИКОМ — «все use case закрыты», «чужих модулей нет»,
// «дублей нет» суть свойства партии, а не порции. Склейка поэтому машинная: заголовок партии один,
// разделы идут в порядке порций, ничей текст не правится.
// УДАЛЕНО 21.08.2026 вместе со старым шагом 9 (docs/plan.md): `partJoin`.

// --- part: the plan of ONE partition, judged and promoted -----------------------------------------
// Phase ⑤. The partition is RECOMPUTED here rather than carried: it is a pure function of artifacts
// already on disk, so the judgement cannot drift from the card the role was actually given.
// УДАЛЕНО 21.08.2026 вместе со старым шагом 9 (docs/plan.md): `part`.


// --- planbook: phases ⑥⑦⑧ — is the requirement covered, in what order, and the one document ------
// The last three phases of step 9, and none of them costs a token. Coverage is a comparison of two
// sets of numbers (the FRD numbers its steps, the role names them); the order is the topological sort
// of what the plans DECLARE; the document is the sections copied verbatim, in that order.
//
// A REFUSAL HERE REMOVES PLAN.md, for the same reason step 10's refusal removes its index: yesterday's
// plan surviving today's hole is a gate approving work that no longer matches the requirement.


// УДАЛЕНО 21.08.2026 вместе со старым шагом 9 (docs/plan.md): `planbook`.

// --- ШАГ 9A: СЛОВАРЬ ЗНАЧЕНИЙ --------------------------------------------------------------------
//
// Словарь отвечает за значения ГРАНИЦЫ: адреса, статусы, коды отказов, сущности требования. Данные,
// живущие внутри изменения («Glossary (черновик создания)»), объявляются в потоках и там же судятся
// правилом «один порождающий» — расширять словарь на каждое внутреннее имя значило бы перестать
// сверять его с требованием (docs/plan-design.md §3).
export const values = {
  description: "Step 9A: the dictionary of boundary values. Without arguments — the SKELETON: one row per end of every use case (its `closes` already filled in, a failure branch already written as «status code»), then one row per `<api>` and `<decl kind=method>` of every node of the change, copied verbatim out of .agent/ripple.xml; the role only names what the script left blank. With `path` — the CHECK against that skeleton (a row lost or added, an end re-attributed, a prefilled text edited, a text left blank) and, on green, the promotion to .agent/values.xml. Without arguments AND with the artifact green NOW it answers `reused` — the pass costs no tokens at all.",
  input: { type: "object", properties: { path: { type: "string" } }, additionalProperties: false },
  output: {
    type: "object",
    properties: {
      ok: { type: "boolean" }, why: { type: "string" }, blockers: { type: "string" }, missing: { type: "boolean" },
      at: { type: "string" }, rows: { type: "number" }, filled: { type: "number" }, blank: { type: "number" }, reused: { type: "boolean" },
    },
    required: ["ok"],
    additionalProperties: false,
  },
  run({ path = "" } = {}, context) {
    const root = runRoot(context)
    if (!existsSync(at(root, FRD_PATH))) return { ok: false, why: `${FRD_PATH} не существует — словарь строить не из чего` }
    const frd = frdAt(root)
    const ripple = readIfExists(root, RIPPLE_PATH)

    if (!path) {
      // ЗЕЛЁНОЕ СЕЙЧАС — НЕ ПЕРЕПИСЫВАЕМ. Тот же вопрос, что задаёт себе полоса о порции, и та же
      // цена: ноль токенов. Судится СЕГОДНЯШНИМИ входами, а не отметкой прошлого прогона.
      if (greenValues(root)) return { ok: true, reused: true, at: VALUES_PATH }
      const sk = valuesSkeleton({ frd, ripple })
      mkdirSync(at(root, STAGING_DIR), { recursive: true })
      writeFileSync(at(root, `${STAGING_DIR}/values.xml`), sk.xml)
      return { ok: true, at: `${STAGING_DIR}/values.xml`, rows: sk.rows, filled: sk.filled, blank: sk.blank }
    }
    if (!existsSync(at(root, path))) {
      return { ok: false, missing: true, blockers: `${path} не существует — роль ничего не записала по staging-пути. Артефакт это ФАЙЛ по этому пути: запиши его инструментом write и только после этого верни track:"ok"` }
    }
    const staged = readFileSync(at(root, path), "utf8")
    const bad = checkValues({ staged, frd, ripple })
    if (bad.length) return { ok: false, blockers: bad.join("\n  ") }
    writeFileSync(at(root, VALUES_PATH), normalize(staged))
    rmSync(at(root, path), { force: true })
    return { ok: true, at: VALUES_PATH, rows: parseValues(readIfExists(root, VALUES_PATH)).length }
  },
}

// --- ШАГ 9: ДЕРЕВО МОДУЛЕЙ, ПОТОКИ И ПЛАН ---------------------------------------------------------
//
// Три функции на три подшага, и у всех троих одна форма: без аргументов — СКЕЛЕТ (скрипт считает
// всё, что можно посчитать, и пишет его в staging), с `path` — СУД того, что роль записала, с
// `composed` — суд ЦЕЛОГО и промоут. Роль не решает, что считать: она дописывает в размеченное.
const TREE_PATH = ".agent/tree.xml"
const FLOWS_PATH = ".agent/flows.xml"
const DECISIONS_PATH = ".agent/decisions.md"
const TREE_STAGING = `${STAGING_DIR}/tree.xml`
const FLOWS_STAGING = `${STAGING_DIR}/flows.xml`

// Порция дерева — четыре модуля. Замер: наряд на 12 модулей это 63 735 символов, 5-9 минут и обрывы;
// четыре модуля держатся устойчиво (docs/plan-design.md §1).
const TREE_CAP = 4
const portionOf = (paths, slice) => paths.slice((slice - 1) * TREE_CAP, slice * TREE_CAP)

const frdAt = (root) => parseFrd(readIfExists(root, FRD_PATH))

export const tree = {
  description: "Step 9B: the module tree. Without arguments — the SKELETON: one <module> per module of the change (the requirement's deltas UNION the nodes of its scenarios), with `path`, `delta`, the twin found by the form of the path and the declarations of .agent/ripple.xml already written in; the role fills `hides`, `io`, `owns`, `needs` and the contract, and nothing else. With `path` and `slice` — the CHECK of one portion (four modules): a section per module of the portion, no foreign one, a secret, an io from the vocabulary, a non-empty signature, and every `needs` an ADDRESS that resolves. With `composed` — the check of the WHOLE (composition against the requirement, one owner per type, one spelling per name, `needs` acyclic) and the promotion to .agent/tree.xml. Costs no tokens.",
  input: {
    type: "object",
    properties: { path: { type: "string" }, slice: { type: "number" }, composed: { type: "boolean" } },
    additionalProperties: false,
  },
  output: {
    type: "object",
    properties: {
      ok: { type: "boolean" }, why: { type: "string" }, blockers: { type: "string" }, missing: { type: "boolean" },
      at: { type: "string" }, modules: { type: "number" }, portions: { type: "number" }, mine: { type: "array", items: { type: "string" } },
      neighbours: { type: "string" }, twin: { type: "string" }, frd: { type: "string" },
    },
    required: ["ok"],
    additionalProperties: false,
  },
  run({ path = "", slice = 0, composed = false } = {}, context) {
    const root = runRoot(context)
    if (!existsSync(at(root, FRD_PATH))) return { ok: false, why: `${FRD_PATH} не существует — дерево строить не из чего` }
    const frd = frdAt(root)
    const map = readIfExists(root, GRAPH_PATH)
    const all = [...modulesOfChange({ frd }).keys()]
    const portions = Math.max(1, Math.ceil(all.length / TREE_CAP))

    // ДАННЫЕ СПРАШИВАЮТ У ТОГО, КТО ИХ ОТДАЁТ. Список модулей порции и её образец нужны наряду ДО
    // всякого суда, а суд на пустом скелете возвращает блокеры и данных не отдаёт вовсе: первый
    // живой прогон нового шага собрал наряд с пустым MINE именно так (21.08.2026).
    if (!path && slice) {
      const mine = portionOf(all, slice)
      const twin = mine.map((q) => sampleOf(q, map)).find((t) => t.path && t.kind !== "self")
      // ТРЕБОВАНИЕ ЕДЕТ СУЖЕННЫМ. Целиком оно в десяти нарядах шага 9 давало 77% дублированного
      // входа (измерено на eddi, 21.08.2026). Порции нужны её дельты и те use case, через которые её
      // модули проходят; общие ограничения — поля, отказы, величины — остаются всегда.
      return {
        ok: true, mine, portions, modules: mine.length, at: `${STEP9_DIR}/tree~${slice}.xml`,
        twin: twin ? twin.path : "", frd: frdFor({ xml: readIfExists(root, FRD_PATH), modules: mine }),
      }
    }

    // СКЕЛЕТ РЕЖЕТСЯ НА ПОРЦИИ ЗДЕСЬ ЖЕ. Одна порция — один файл и один вызов роли: наряд на все 12
    // модулей это 63 735 символов и 5-9 минут с обрывами, четыре модуля держатся устойчиво.
    if (!path) {
      const sk = treeSkeleton({ frd, ripple: readIfExists(root, RIPPLE_PATH), map })
      mkdirSync(at(root, STAGING_DIR), { recursive: true })
      mkdirSync(at(root, STEP9_DIR), { recursive: true })
      writeFileSync(at(root, `${STEP9_DIR}/tree-skeleton.xml`), sk.xml)
      const head = sk.xml.slice(0, sk.xml.indexOf(">") + 1)
      const blocks = [...sk.xml.matchAll(/ {2}<module[\s\S]*?<\/module>/g)].map((m) => m[0])
      for (let n = 1; n <= portions; n++) {
        const mine = portionOf(all, n)
        const part = blocks.filter((b) => mine.some((q) => b.includes(`path="${q}"`)))
        writeFileSync(at(root, `${STEP9_DIR}/tree~${n}.xml`), `${head}\n${part.join("\n")}\n</tree>\n`)
      }
      return { ok: true, at: `${STEP9_DIR}/tree~1.xml`, modules: sk.modules, portions, mine: portionOf(all, 1) }
    }

    if (!existsSync(at(root, path))) {
      return { ok: false, missing: true, blockers: `${path} не существует — роль ничего не записала по staging-пути. Артефакт это ФАЙЛ по этому пути: запиши его инструментом write и только после этого верни track:"ok"` }
    }
    const staged = readFileSync(at(root, path), "utf8")
    const bad = checkTree({
      text: staged, frd, known: knownPaths(map), family: all,
      mine: slice ? portionOf(all, slice) : all,
      portion: !composed, whole: composed,
    })
    if (bad.length) return { ok: false, blockers: bad.join("\n  ") }
    if (!composed) return { ok: true, modules: parseTree(staged).modules.length, mine: slice ? portionOf(all, slice) : all }

    writeFileSync(at(root, TREE_PATH), staged.endsWith("\n") ? staged : `${staged}\n`)
    return { ok: true, at: TREE_PATH, modules: parseTree(staged).modules.length, portions }
  },
}

// СОСЕДИ — ВЫЧИСЛЯЕМЫЙ БЛОК, А НЕ ДИСЦИПЛИНА АВТОРА. Роль видит только свою порцию, и узнать имена и
// сигнатуры соседей ей больше неоткуда: приём взят у superpowers (блок `Interfaces: Consumes /
// Produces` тикета), но там его пишет человек, а здесь считает скрипт из уже зелёных порций. Пока
// этого блока не было, гардрейл считал соседа по `needs` призраком — живой дефект 20.08.2026.
// Склейка МАШИННАЯ: пропущенная порция — отказ с её номером, а не тихая потеря модулей.
export const treeJoin = {
  description: "Step 9B: join the per-portion answers into one staged tree. The portions are independent — a module knows only what it needs — so the join is a concatenation of `<module>` blocks in portion order, nobody's text edited. Refuses when a portion is missing, naming it. Costs no tokens.",
  input: { type: "object", properties: { portions: { type: "number" } }, required: ["portions"], additionalProperties: false },
  output: { type: "object", properties: { ok: { type: "boolean" }, why: { type: "string" }, at: { type: "string" }, modules: { type: "number" } }, required: ["ok"], additionalProperties: false },
  run({ portions }, context) {
    const root = runRoot(context)
    const blocks = []
    for (let n = 1; n <= portions; n++) {
      const p = `${STAGING_DIR}/tree~${n}.xml`
      const text = readIfExists(root, p)
      if (!text.trim()) return { ok: false, why: `порция ${n} не написана: ${p} пуст — склеивать нечего` }
      blocks.push(...[...text.matchAll(/ {2}<module[\s\S]*?<\/module>/g)].map((m) => m[0]))
    }
    const head = readIfExists(root, `${STEP9_DIR}/tree-skeleton.xml`).split("\n")[0] || '<tree task="">'
    mkdirSync(at(root, STAGING_DIR), { recursive: true })
    writeFileSync(at(root, TREE_STAGING), `${head}\n${blocks.join("\n")}\n</tree>\n`)
    return { ok: true, at: TREE_STAGING, modules: blocks.length }
  },
}

export const neighbours = {
  description: "Step 9B: the NEIGHBOURS block of one portion's order — what the modules OUTSIDE this portion own and declare, as the already-written portions say it. Computed from the staged tree, never authored: the role sees only its own four modules and has no other way to learn a sibling's type names and signatures. Costs no tokens.",
  input: { type: "object", properties: { slice: { type: "number" } }, required: ["slice"], additionalProperties: false },
  output: { type: "object", properties: { ok: { type: "boolean" }, text: { type: "string" }, count: { type: "number" } }, required: ["ok"], additionalProperties: false },
  run({ slice }, context) {
    const root = runRoot(context)
    const frd = frdAt(root)
    const all = [...modulesOfChange({ frd }).keys()]
    const mine = new Set(portionOf(all, slice))
    const done = []
    for (let n = 1; n <= Math.ceil(all.length / TREE_CAP); n++) done.push(readIfExists(root, `${STAGING_DIR}/tree~${n}.xml`))
    const written = parseTree(done.join("\n")).modules.filter((m) => !mine.has(m.path) && (m.owns || m.contract.sig))
    const text = written.map((m) => [
      `${m.path}`,
      m.owns ? `  владеет типом: ${m.owns}` : "",
      m.contract.sig ? `  объявление: ${m.contract.sig}` : "",
      m.contract.post ? `  отдаёт: ${m.contract.post}` : "",
    ].filter(Boolean).join("\n")).join("\n")
    return { ok: true, text, count: written.length }
  },
}

// ОБРАЗЕЦ ЕДЕТ В НАРЯД ПУТЁМ И ВЫЖИМКОЙ, А НЕ ТЕЛОМ. Измерено на живом прогоне: дизайнер, получивший
// ПУТЬ, сам открыл три файла и назвал шесть настоящих классов репозитория. Тело того же файла — это
// 35 КБ из 55 КБ наряда (первый прогон нового шага 9, 21.08.2026): оно вытесняет задачу в середину,
// которую слабая модель читает по диагонали, и платит за то, что роль могла бы и не открывать.
export const twin = {
  description: "Step 9B: the samples for ONE portion — a digest per module, never one for the four. A portion holds four kinds at once (a data model, a store interface, a REST interface, a Mongo implementation), and one sample for all of them teaches the wrong form to three: the digest of `AgentConfiguration` says nothing about `AbstractResourceStore` or `@ConfigurationUpdate`. Each digest is the PATH plus the file's payload as declarations — the type with its extends/implements, its annotations, its fields and its method signatures, each carrying the LINE NUMBER it stands on. Never the body: on the first live run of this step a twin's body was 35KB of a 55KB order. The map's own `sig` is no substitute — reconnaissance truncates it to «public class X». Line numbers are what makes a digest enough: what a signature cannot show, the role reads back POINTWISE. Costs no tokens.",
  input: { type: "object", properties: { slice: { type: "number" }, path: { type: "string" } }, additionalProperties: false },
  output: { type: "object", properties: { ok: { type: "boolean" }, text: { type: "string" }, at: { type: "string" }, lines: { type: "number" }, samples: { type: "number" } }, required: ["ok"], additionalProperties: false },
  run({ slice = 0, path = "" } = {}, context) {
    const root = runRoot(context)
    const one = (p) => {
      if (!p || !existsSync(at(root, p))) return { at: "", lines: 0, text: `${p ? `${p} — файла нет в репозитории` : "образца не нашлось"}` }
      const body = readFileSync(at(root, p), "utf8")
      const d = digestOf(body)
      return {
        at: p, lines: d.lines.length,
        text: [
          `path: ${p}  (всего строк ${body.split("\n").length})`,
          `собрано: объявление типа, аннотаций ${d.took.annotations}, полей ${d.took.fields}, сигнатур ${d.took.methods}; отброшено ${d.took.dropped} строк — импорты, комментарии, ТЕЛА методов, вложенные типы`,
          ...d.lines,
        ].join("\n"),
      }
    }
    if (path) { const r = one(path); return { ok: true, at: r.at, lines: r.lines, samples: 1, text: r.text } }

    // ВЫЖИМКА НА КАЖДЫЙ МОДУЛЬ ПОРЦИИ. Кандидаты у модулей свои и разные — они стоят в скелете, — и
    // один образец на четыре противоречил бы самому скелету: он показывал бы один файл, а требовал
    // выбрать из пяти. Берётся первый кандидат каждого модуля: он же первый в списке, из которого
    // роль выбирает `<twin path>`.
    const frd = frdAt(root)
    const map = readIfExists(root, GRAPH_PATH)
    const mine = portionOf([...modulesOfChange({ frd }).keys()], slice)
    // ДВА КАНДИДАТА НА МОДУЛЬ, А НЕ ОДИН. Формула выбора близнеца для НОВОЙ сущности не сходится —
    // это доказано трижды (docs/plan-design.md §3), поэтому выбирает роль. Но выбирать вслепую из
    // одних путей она не может: выжимки показывают, чем эти файлы отличаются, а `<twin path>` она
    // ставит сама. Свой модуль уже существует — образец ему он сам, и второго не нужно.
    const parts = mine.map((m) => {
      const own = sampleOf(m, map)
      if (own.kind === "self") return [`--- ${m}: модуль уже существует, образец — он сам`, one(m).text].join("\n")
      const two = rankedCandidates(m, map).slice(0, 2)
      if (!two.length) return `--- ${m}: образца в репозитории не нашлось — пиши по требованию`
      return [`--- кандидаты в образцы для ${m} (выбери ОДИН и впиши его в <twin path>)`, ...two.map((q) => one(q).text)].join("\n")
    })
    return {
      ok: true, at: "", samples: mine.length,
      lines: parts.length,
      text: [
        ...parts,
        "",
        "Слева от строки — её номер в ЕЁ файле. Нужно тело метода или аргументы конструктора —",
        "read(path: <путь этого образца>, offset: <номер минус 2>, limit: 12). До восьми чтений на порцию.",
      ].join("\n"),
    }
  },
}

export const flows = {
  description: "Step 9C: the data flows. Without arguments — the SKELETON: one <flow> per use case and one per failure branch, with a row per step of the requirement whose `closes` is ALREADY written by the script (a role that typed the number by hand once produced a Cyrillic «2а» where the FRD had a Latin «2a», and the coverage became a lie). With `path` and `uc` — the CHECK of one portion: every step and branch of THAT use case closed, the module named by the tree, the role from the vocabulary. With `composed` — the check of the WHOLE (one producing module per value, every input produced or external, every failure born and delivered to its status, every module of the tree working in a flow or reachable by `needs`) and the promotion to .agent/flows.xml. Costs no tokens.",
  input: {
    type: "object",
    properties: { path: { type: "string" }, uc: { type: "string" }, composed: { type: "boolean" } },
    additionalProperties: false,
  },
  output: {
    type: "object",
    properties: {
      ok: { type: "boolean" }, why: { type: "string" }, blockers: { type: "string" }, missing: { type: "boolean" },
      at: { type: "string" }, flows: { type: "number" }, steps: { type: "number" }, ucs: { type: "array", items: { type: "string" } },
      tree: { type: "string" }, frd: { type: "string" }, values: { type: "string" },
    },
    required: ["ok"],
    additionalProperties: false,
  },
  run({ path = "", uc = "", composed = false } = {}, context) {
    const root = runRoot(context)
    if (!existsSync(at(root, TREE_PATH))) return { ok: false, why: `${TREE_PATH} не существует — потоки судить не по чему, шаг 9B не закрыт` }
    const frd = frdAt(root)
    const tree_ = readIfExists(root, TREE_PATH)
    const ucs = (frd.usecases || []).map((u) => u.id)

    // Наряд ОДНОЙ порции: её скелет, дерево, суженное до её модулей, и требование, суженное до её
    // use case. Дерево целиком давало 112 441 символ на семь нарядов, требование — 98 805.
    if (!path && uc) {
      return {
        ok: true, at: `${STEP9_DIR}/flows~${uc}.xml`, ucs: [uc],
        tree: treeFor({ tree: readIfExists(root, TREE_PATH), frd, uc }),
        frd: frdFor({ xml: readIfExists(root, FRD_PATH), uc }),
        values: readIfExists(root, VALUES_PATH),
      }
    }
    if (!path) {
      const sk = flowsSkeleton({ frd })
      mkdirSync(at(root, STAGING_DIR), { recursive: true })
      mkdirSync(at(root, STEP9_DIR), { recursive: true })
      writeFileSync(at(root, `${STEP9_DIR}/flows-skeleton.xml`), sk.xml)
      // Порция потоков — ОДИН use case со всеми его ветвлениями: единица здесь смысловая, а не
      // счётная, и резать её пополам значит рвать сценарий посередине.
      for (const id of ucs) {
        const own = [...sk.xml.matchAll(/ {2}<flow[\s\S]*?<\/flow>/g)].map((m) => m[0]).filter((b) => b.includes(`uc="${id}"`))
        writeFileSync(at(root, `${STEP9_DIR}/flows~${id}.xml`), `<flows task="">\n${own.join("\n")}\n</flows>\n`)
      }
      return { ok: true, at: `${STEP9_DIR}/flows~${ucs[0] || ""}.xml`, flows: sk.flows, steps: sk.steps, ucs }
    }
    if (!existsSync(at(root, path))) {
      return { ok: false, missing: true, blockers: `${path} не существует — роль ничего не записала по staging-пути. Артефакт это ФАЙЛ по этому пути: запиши его инструментом write и только после этого верни track:"ok"` }
    }
    const staged = readFileSync(at(root, path), "utf8")
    const bad = checkFlows({ text: staged, frd, tree: tree_, values: readIfExists(root, VALUES_PATH), only: uc, portion: !composed, whole: composed })
    if (bad.length) return { ok: false, blockers: bad.join("\n  ") }
    const parsed = parseFlows(staged)
    if (!composed) return { ok: true, flows: parsed.flows.length, steps: parsed.flows.reduce((n, f) => n + f.steps.length, 0) }

    writeFileSync(at(root, FLOWS_PATH), staged.endsWith("\n") ? staged : `${staged}\n`)
    return { ok: true, at: FLOWS_PATH, flows: parsed.flows.length, steps: parsed.flows.reduce((n, f) => n + f.steps.length, 0), ucs }
  },
}

export const flowsJoin = {
  description: "Step 9C: join the per-use-case answers into one staged flows file. Refuses when a use case's portion is missing, naming it. Costs no tokens.",
  input: { type: "object", properties: { ucs: { type: "array", items: { type: "string" } } }, required: ["ucs"], additionalProperties: false },
  output: { type: "object", properties: { ok: { type: "boolean" }, why: { type: "string" }, at: { type: "string" }, flows: { type: "number" } }, required: ["ok"], additionalProperties: false },
  run({ ucs }, context) {
    const root = runRoot(context)
    const blocks = []
    for (const id of ucs || []) {
      const p = `${STAGING_DIR}/flows~${id}.xml`
      const text = readIfExists(root, p)
      if (!text.trim()) return { ok: false, why: `поток use case ${id} не написан: ${p} пуст — склеивать нечего` }
      blocks.push(...[...text.matchAll(/ {2}<flow[\s\S]*?<\/flow>/g)].map((m) => m[0]))
    }
    mkdirSync(at(root, STAGING_DIR), { recursive: true })
    writeFileSync(at(root, FLOWS_STAGING), `<flows task="">\n${blocks.join("\n")}\n</flows>\n`)
    return { ok: true, at: FLOWS_STAGING, flows: blocks.length }
  },
}

// ПЛАН СОБИРАЕТСЯ СКРИПТОМ И НЕ СТОИТ НИ ОДНОГО ТОКЕНА. Отказ сборки не пишет план И СНОСИТ
// предыдущий: план, переживший дыру, — это гейт, утверждающий работу, которой уже нет.
export const planbook = {
  description: "Step 9D: assemble task/<KEY>/PLAN.md from the tree, the flows, the requirement and the decisions log. A SCRIPT, not a role: the plan holds no decision that is not already in the tree or the flows — it indexes them. Waves come from `needs` (never from the flows: a data flow is a round trip and therefore a circle). Refuses when the tree is circular, when a module or a `fit` value did not reach the document, or when a placeholder was left in it — and REMOVES the previous PLAN.md on any refusal. Costs no tokens.",
  input: { type: "object", properties: {}, additionalProperties: false },
  output: {
    type: "object",
    properties: {
      ok: { type: "boolean" }, why: { type: "string" }, blockers: { type: "string" }, cycle: { type: "string" },
      at: { type: "string" }, modules: { type: "number" }, waves: { type: "array", items: { type: "number" } }, ucs: { type: "number" },
    },
    required: ["ok"],
    additionalProperties: false,
  },
  run(_ = {}, context) {
    const root = runRoot(context)
    const dir = taskDir(root)
    if (!dir) return { ok: false, why: "ключ задачи не отвечен — класть план некуда" }
    const out = `${dir}/PLAN.md`
    const drop = () => { if (existsSync(at(root, out))) rmSync(at(root, out), { force: true }) }
    for (const p of [TREE_PATH, FLOWS_PATH]) {
      if (!existsSync(at(root, p))) { drop(); return { ok: false, why: `${p} не существует — план собирать не из чего` } }
    }
    const frd = frdAt(root)
    const tree_ = readIfExists(root, TREE_PATH)
    const flows_ = readIfExists(root, FLOWS_PATH)
    const { waves, cycle } = wavesOf({ tree: tree_ })
    if (cycle.length) { drop(); return { ok: false, cycle: cycle.join(" → "), blockers: `очередь работ замкнута: ${cycle.join(" → ")} — отношение «без чего меня не написать» кругов не имеет: одно из рёбер описывает вызов, а не объявление` } }

    const text = planDoc({ frd, tree: tree_, flows: flows_, decisions: readIfExists(root, DECISIONS_PATH), key: taskKey(root) })
    const bad = checkBook({ plan: text, frd, tree: tree_ })
    if (bad.length) { drop(); return { ok: false, blockers: bad.join("\n  ") } }
    mkdirSync(at(root, dir), { recursive: true })
    writeFileSync(at(root, out), text.endsWith("\n") ? text : `${text}\n`)
    return { ok: true, at: out, modules: parseTree(tree_).modules.length, waves: waves.map((w) => w.length), ucs: (frd.usecases || []).length }
  },
}

// ЖУРНАЛ РЕШЕНИЙ ПЕРЕЖИВАЕТ ПЕРЕСБОРКУ ПЛАНА. Ответ, найденный у соседа в репозитории, живёт здесь, а
// не в тексте плана: план собирается заново каждый круг, и решение вместе с ним исчезало.
export const decision = {
  description: "Write one decision into .agent/decisions.md — the question the requirement left silent, the answer, the `file:line` that backs it and the route (repo | frd | operator). A decision taken from the repository WITHOUT a `file:line` is refused: «that is how it is done here» with no address is a guess, not an answer. Reading with no arguments returns the log. Costs no tokens.",
  input: {
    type: "object",
    properties: { question: { type: "string" }, answer: { type: "string" }, source: { type: "string" }, route: { type: "string" }, why: { type: "string" } },
    additionalProperties: false,
  },
  output: { type: "object", properties: { ok: { type: "boolean" }, why: { type: "string" }, count: { type: "number" }, text: { type: "string" } }, required: ["ok"], additionalProperties: false },
  run({ question = "", answer = "", source = "", route = "", why = "" } = {}, context) {
    const root = runRoot(context)
    const had = parseDecisions(readIfExists(root, DECISIONS_PATH))
    if (!question) return { ok: true, count: had.length, text: readIfExists(root, DECISIONS_PATH) }
    const one = newDecision({ question, answer, source, route, why })
    if (one.error) return { ok: false, why: one.error }
    const kept = [...had.filter((d) => d.question !== one.question), one]
    mkdirSync(at(root, ".agent"), { recursive: true })
    writeFileSync(at(root, DECISIONS_PATH), renderDecisions(kept))
    return { ok: true, count: kept.length }
  },
}

// --- gate1: the operator approves the plan --------------------------------------------------------
// Step 12. The presentation is assembled by SCRIPT — every line a cut or a count — for the same
// reason the prose header was reverted out of PLAN.md: the gate is where an unverifiable sentence
// does the most damage, because a human who reads a confident introduction stops reading the plan.
//
// The token pins the PLAN's hash. Without it `approve` of yesterday's plan closes today's, and the
// band would cut a branch for work nobody looked at — the same rule as «judge the staging path
// before promoting it», moved to the gate.
const GATE_PATH = ".agent/gate1.json"

export const gate1 = {
  description: "Step 12: show the operator the plan and record the decision. Without an answer on disk: ok:false with ask:true and the PRESENTATION as the question — the goal from the FRD, the partitions with their use case ids and module counts, what is written first and why, the check commands, the branch. With an answer: approve writes .agent/gate1.json (the task key, a sha256 of PLAN.md and the decision), «rework: <текст>» returns the operator's words to the plan critic, «requirements: <текст>» is the ONE legal rewind — the requirement itself is missing, so the band goes back to step 2 and the intake replays, stop ends the band. An unrecognised answer is a blocker naming the three words. A VALID TOKEN IS HONOURED: when .agent/gate1.json already carries this key, this plan's sha256 and approve, the operator is not asked again (ok:true with kept:true) — the answer lives in .agent/answers.md, which newRun carries into .agent/prev/ before the band starts. Costs no tokens.",
  input: { type: "object", properties: {}, additionalProperties: false },
  output: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      why: { type: "string" },
      ask: { type: "boolean" },
      kept: { type: "boolean" },
      subject: { type: "string" },
      blockers: { type: "string" },
      rework: { type: "string" },
      requirements: { type: "string" },
      stop: { type: "boolean" },
      at: { type: "string" },
      modules: { type: "number" },
    },
    required: ["ok"],
    additionalProperties: false,
  },
  run(_ = {}, context) {
    const root = runRoot(context)
    const key = taskKey(root)
    if (!key) return { ok: false, why: "ключ задачи не отвечен — гейт не знает, какой план утверждается" }
    const planPath = `task/${key}/PLAN.md`
    if (!existsSync(at(root, planPath))) return { ok: false, why: `${planPath} не существует — шаг 9 не отработал, утверждать нечего` }

    // РЕЦЕПТ ГЕЙТА ПРИЗНАЁТСЯ ЕГО ЖЕ ВЛАДЕЛЬЦЕМ, И РАНЬШЕ ВСЕГО ОСТАЛЬНОГО. Токен пишется здесь, а
    // читали его до сих пор только шаги 13 и 14: сам гейт искал свой ответ исключительно в
    // .agent/answers.md — файле, который newRun уносит в .agent/prev/ ПЕРВЫМ действием прогона.
    // Поэтому перезапуск спрашивал оператора снова над тем же самым планом; на живом прогоне 08675093
    // один из таких повторов ушёл в модель-раздатчик и вернулся не словом `approve`, а описанием
    // проекта — шаг умер терминально.
    //
    // Токен действителен ровно пока действителен план: тот же ключ и тот же sha256 файла, который
    // оператор ЧИТАЛ. Переписали план — токен перестаёт годиться, и гейт спрашивает заново над новым.
    // Проверка стоит до сборки презентации: при живом рецепте ни карта, ни разделы не нужны.
    const planNow = sha256(readFileSync(at(root, planPath), "utf8"))
    const token = (() => { try { return JSON.parse(readIfExists(root, GATE_PATH) || "{}") } catch { return {} } })()
    if (token.answer === "approve" && token.key === key && token.plan === planNow) {
      return { ok: true, at: GATE_PATH, kept: true }
    }
    if (!existsSync(at(root, FRD_PATH)) || !existsSync(at(root, GRAPH_PATH))) {
      return { ok: false, why: `${FRD_PATH} или ${GRAPH_PATH} не существует` }
    }

    const frd = parseFrd(readFileSync(at(root, FRD_PATH), "utf8"))
    const map = readFileSync(at(root, GRAPH_PATH), "utf8")
    // ОДИН ДОКУМЕНТ, А НЕ ПАПКА КАРТОЧЕК. Разбиение на партии удалено вместе со старым шагом 9
    // (docs/plan.md): гейт читает собранный PLAN.md, а модули изменения берёт из дельт требования —
    // из того же места, откуда их брало разбиение.
    const modules = modulesOfChange({ frd })
    const planDocPath = `task/${key}/PLAN.md`
    const sections = sectionsOf(readIfExists(root, planDocPath))
    const { order } = orderOf({ sections, modules, edges: parseMap(map).edges })
    const view = gateView({ frd, modules, parts: [], sections, order, key, base: gitTrunk(root) })

    // The presentation IS the question: an answer is recognised by the question's text (core/answers.mjs),
    // so the operator's word is bound to the plan they were shown, not to the plan that exists now.
    const said = parsedAnswers(readIfExists(root, ANSWERS_PATH))
    const hit = (said.ok ? said.value : []).find((a) => String(a.question || "").trim() === view.trim())
    if (!hit) return { ok: false, ask: true, subject: view }

    const decision = readGate(hit.text)
    if (decision.kind === "stop") return { ok: false, stop: true, why: "оператор остановил полосу на гейте 1" }
    if (decision.kind === "rework") return { ok: false, rework: decision.comment }
    // ЕДИНСТВЕННАЯ ЗАКОННАЯ ОТМОТКА, и её объявляет ЧЕЛОВЕК. «Требование упущено» правкой плана не
    // чинится: источника у этой работы нет вовсе, и полоса идёт в начало — дорабатывать требования
    // и переигрывать интейк. Отличить это от «план собран не так» может только тот, чья это работа.
    if (decision.kind === "requirements") return { ok: false, requirements: decision.comment }
    if (decision.kind !== "approve") {
      return { ok: false, blockers: `ответ «${String(hit.text).slice(0, 60)}» не разобран — ответь одним из четырёх: approve · rework: <что не так в плане> · requirements: <какое требование упущено> · stop` }
    }

    writeFileSync(at(root, GATE_PATH), `${JSON.stringify({ key, plan: planNow, answer: "approve" }, null, 2)}\n`)
    return { ok: true, at: GATE_PATH, modules: modules.size }
  },
}

// --- runlog: память полосы о том, что уже сделано --------------------------------------------------
// Тонкий io вокруг чистого ядра (core/runlog.mjs): здесь читается диск, считаются отпечатки и ставится
// время — решение «шаг закрыт» принимает ядро и только оно.
//
// ЖУРНАЛ НЕ РОТИРУЕТСЯ. newRun уносит в .agent/prev/ ровно состояние ПРОГОНА — ответы, вопрос,
// staging. Журнал — не состояние прогона, а память проекта о полосе: унеси его, и следующий запуск
// снова не будет знать, что сделано. Ровно эта потеря стоила прогону c87db886 двух переигранных
// шагов 6 подряд, когда уликами артефакта служил файл, живущий один прогон.
const RUNLOG_PATH = ".agent/run.yaml"

const runlogOf = (root) => {
  const r = newLog(readIfExists(root, RUNLOG_PATH))
  return r.ok ? r.value : null
}
// ПИСАТЬ ПОВЕРХ НЕЧИТАЕМОГО ЖУРНАЛА — ЗНАЧИТ СТЕРЕТЬ ПАМЯТЬ МОЛЧА. Живой прогон: разбор спотыкался на
// одном поле, отметка начинала журнал с чистого листа, и двенадцать закрытых шагов исчезали без
// единого сообщения — та самая тихая потеря, ради которой весь механизм и заведён. Отметка на
// испорченном журнале ПАДАЕТ; читать его (runlogRead) по-прежнему можно, и он честно говорит «не знаю».
const runlogNow = (root) => {
  const raw = readIfExists(root, RUNLOG_PATH)
  const r = newLog(raw)
  if (!r.ok) throw new Error(`${RUNLOG_PATH} не разбирается (${r.error.detail}) — отметка не пишется поверх: журнал прогона был бы стёрт`)
  return raw ? r.value : undefined
}
// ОТКАЗ ФОРМАТА — ДАННЫЕ, А НЕ СМЕРТЬ ПРОГОНА.
//
// BUG_FIX_CONTEXT: live run 5b52f76d, 20.08.2026. This threw, the host turned the throw into
// `crashed` with code 2, and a run that had just assembled PLAN.md died with its diagnosis mangled
// into a subject line. A guardrail that refuses has SUCCEEDED (standards/code.md, rule 5): it says
// what it cannot carry, the caller decides. Now the refusal travels back as `why`, the journal on
// disk is left untouched, and the band reports it instead of dying.
const runlogPut = (root, log) => {
  const text = render(log)
  if (!text.ok) return { ok: false, why: `журнал не записывается: ${text.error.detail}` }
  mkdirSync(at(root, ".agent"), { recursive: true })
  writeFileSync(at(root, RUNLOG_PATH), text.value)
  return { ok: true }
}
const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, "Z")

export const runlogRead = {
  description: "The run's memory: where the band enters. Reads .agent/run.yaml, fingerprints every artefact the journal names, and answers with the FIRST step that is not closed — a step is closed by its own mark plus a sha256 that still matches the file on disk. No journal at all answers from: 1. `why` says which of the four reasons it is (no mark · the run was cut on that step · the artefact is gone · the artefact was edited after the mark), so the operator reads a cause, not a number. Costs no tokens.",
  input: { type: "object", properties: {}, additionalProperties: false },
  output: {
    type: "object",
    properties: {
      from: { type: "number" },
      why: { type: "string" },
      closed: { type: "array", items: { type: "number" } },
      broken: { type: "boolean" },
      tickets: { type: "number" },
    },
    required: ["from", "why"],
    additionalProperties: false,
  },
  run(_ = {}, context) {
    const root = runRoot(context)
    const log = runlogOf(root)
    // Испорченный журнал — это не «шагов нет», это «мы не знаем». Полоса идёт с начала и говорит почему.
    if (!log) return { from: 1, why: `${RUNLOG_PATH} не разбирается — журнал испорчен, полоса идёт с начала`, closed: [], broken: true, tickets: 0 }

    const seen = {}
    for (const m of log.steps) {
      for (const a of m.artifacts) {
        seen[a.path] = existsSync(at(root, a.path)) ? sha256(readFileSync(at(root, a.path), "utf8")) : null
      }
    }
    const r = resumeAt(log, { seen })
    return { from: r.from, why: r.why, closed: r.closed, broken: false, tickets: log.tickets.length }
  },
}

export const runlogMark = {
  description: "Write one step's receipt into .agent/run.yaml: the step number, its phase name, an optional unit inside the step (a scouting cell, a partition of step 9), the status (running|done|failed|skipped) and the artefacts it is answerable for. The sha256 of every artefact is taken HERE, at the moment of the mark — that fingerprint is what a later launch compares against, so a file edited by hand replays its step. The time is the host's. A mark REPLACES the previous one for the same step and unit. Costs no tokens.",
  input: {
    type: "object",
    properties: {
      step: { type: "number" },
      name: { type: "string" },
      unit: { type: "string" },
      status: { type: "string" },
      note: { type: "string" },
      artifacts: { type: "array", items: { type: "string" } },
    },
    required: ["step", "status"],
    additionalProperties: false,
  },
  // `why` без `at` — отметка НЕ записана: значение не переносится форматом. Полоса обязана это
  // услышать, иначе следующий запуск войдёт не в тот шаг.
  output: { type: "object", properties: { at: { type: "string" }, sealed: { type: "number" }, why: { type: "string" } }, required: ["at"], additionalProperties: false },
  run({ step, name = "", unit = "", status, note = "", artifacts = [] }, context) {
    const root = runRoot(context)
    const at_ = stamp()
    const prints = (artifacts || [])
      .filter(Boolean)
      .map((path) => ({ path, sha256: existsSync(at(root, path)) ? sha256(readFileSync(at(root, path), "utf8")) : "" }))
    const log = mark(begin(runlogNow(root), { key: taskKey(root), at: at_ }), { step, name, unit, status, at: at_, note, artifacts: prints })
    const put = runlogPut(root, log)
    if (!put.ok) return { at: "", sealed: 0, why: put.why }
    return { at: at_, sealed: prints.length }
  },
}

export const runlogTicket = {
  description: "Write one implementer ticket's row into .agent/run.yaml (step 15): its id, its wave, and the status — running|green|failed. A row REPLACES the previous one for the same id, so a retried ticket does not grow the file. This is what lets a run cut in the middle of a wave pick up exactly the tickets that are not green. Costs no tokens.",
  input: {
    type: "object",
    properties: { id: { type: "string" }, wave: { type: "number" }, status: { type: "string" }, note: { type: "string" } },
    required: ["id", "status"],
    additionalProperties: false,
  },
  // `why` без `at` — расписка НЕ записана; та же дисциплина, что у runlogMark.
  output: { type: "object", properties: { at: { type: "string" }, why: { type: "string" } }, required: ["at"], additionalProperties: false },
  run({ id, wave = 0, status, note = "" }, context) {
    const root = runRoot(context)
    const at_ = stamp()
    const put = runlogPut(root, ticket(runlogNow(root), { id, wave, status, at: at_, note }))
    if (!put.ok) return { at: "", why: put.why }
    return { at: at_ }
  },
}

export const runlogPending = {
  description: "Which units of a step are still not closed — the scouting cells step 4 has yet to take, the partitions step 9 has yet to write, the tickets of a wave that are not green. Answers with the members of `of` that carry no done mark, in the caller's own order, so a stage is entered in its MIDDLE instead of from its start. Costs no tokens.",
  input: {
    type: "object",
    properties: { step: { type: "number" }, of: { type: "array", items: { type: "string" } } },
    required: ["step", "of"],
    additionalProperties: false,
  },
  output: { type: "object", properties: { units: { type: "array", items: { type: "string" } }, done: { type: "number" } }, required: ["units"], additionalProperties: false },
  run({ step, of = [] }, context) {
    const log = runlogOf(runRoot(context))
    const units = log ? pending(log, { step, of }) : (of || [])
    return { units, done: (of || []).length - units.length }
  },
}

// --- branch: короткая ветка от свежего транка ------------------------------------------------------
// Step 13, и весь его код — это io вокруг одного чистого суждения (steps/branch/branch.mjs::newBranch).
// Ядро судит по СНИМКУ фактов git; здесь снимок делается и, если суждение зелёное, режется ветка.
//
// СВЕЖЕСТЬ — ФАКТ, А НЕ ПАМЯТЬ: `git fetch` идёт ДО снимка, и база берётся из `<remote>/<base>`.
// Отставший локальный транк в ветвлении не участвует вовсе — иначе ветка режется от вчерашнего дня, и
// зелёный базлайн доказывает релизопригодность того, чего уже нет.
const BRANCH_PATH = ".agent/branch.json"

// gitFacts — то, что репозиторий говорит о себе ПРЯМО СЕЙЧАС. Ошибка любой команды — это отсутствие
// факта, а не ноль: `trunk: ""` уедет отказом `no-trunk`, и никто не спутает его с «транк называется
// пустой строкой» (standards/code.md, правило 4).
const gitFacts = (root, planPath) => {
  const git = (args) => {
    try {
      return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
    } catch {
      return ""
    }
  }
  const remote = git(["remote"]).split("\n").filter(Boolean)[0] || null
  const trunk = gitTrunk(root)
  if (remote && trunk) git(["fetch", remote, trunk])          // свежесть берётся здесь

  return {
    // `-uall` РАЗВОРАЧИВАЕТ нетронутые каталоги в файлы: без него полностью новый `task/DOS-535/`
    // приезжает одной строкой `?? task/`, и ядро не может отличить свою поставку от чужого ключа.
    head: git(["rev-parse", "--abbrev-ref", "HEAD"]),
    dirtyPaths: git(["status", "--porcelain", "-uall"]).split("\n")
      .map((l) => l.slice(3).trim())
      .map((p) => (p.includes(" -> ") ? p.split(" -> ").pop() : p))
      .filter(Boolean),
    refs: git(["for-each-ref", "--format=%(refname:short)", "refs/heads"]).split("\n").filter(Boolean),
    trunk,
    trunkSha: remote ? git(["rev-parse", `${remote}/${trunk}`]) : git(["rev-parse", trunk]),
    remote,
    planHash: existsSync(at(root, planPath)) ? sha256(readFileSync(at(root, planPath), "utf8")) : "",
  }
}

export const branch = {
  description: "Step 13: cut the work branch. Reads the gate's token (.agent/gate1.json), takes a snapshot of git — the uncommitted PATHS, local refs, trunk, its sha at the REMOTE after a fetch, and a sha256 of the approved plan; the run's own deliverable under task/<KEY>/ is not dirt, anything else is — and judges by steps/branch/branch.mjs::newBranch: no-gate · plan-changed · dirty-worktree · no-trunk · branch-exists. On green cuts <prefix>/<KEY> from <remote>/<trunk> and writes .agent/branch.json. No role, no repair rail: a dirty worktree and a taken branch name are the state of a human's machine, and every refusal is terminal with the evidence. Costs no tokens.",
  input: { type: "object", properties: { baseline: { type: "boolean" } }, additionalProperties: false },
  output: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      why: { type: "string" },
      kind: { type: "string" },
      name: { type: "string" },
      kept: { type: "boolean" },
      baseline: { type: "string" },
      base: { type: "string" },
      baseSha: { type: "string" },
      remote: { type: "string" },
      at: { type: "string" },
    },
    required: ["ok"],
    additionalProperties: false,
  },
  run({ baseline = true } = {}, context) {
    const root = runRoot(context)
    // РЕЦЕПТ СТИРАЕТСЯ, ТОЛЬКО ЕСЛИ ОН УЖЕ ЛЖЁТ. Раньше его сносил ЛЮБОЙ отказ шага — грязная копия,
    // изменившийся план, нечитаемый токен, — и вместе с ним пропадала единственная улика, по которой
    // шаг узнаёт СВОЮ ветку. Живой прогон: ветка на месте, HEAD на ней, работа продолжается, а
    // рецепта уже нет, потому что один посторонний отказ его снёс — и шаг отказывает `branch-exists`
    // о ветке, которую сам же и отрезал, теперь уже навсегда.
    const drop = () => {
      if (!existsSync(at(root, BRANCH_PATH))) return
      const said = (() => { try { return JSON.parse(readFileSync(at(root, BRANCH_PATH), "utf8")) } catch { return null } })()
      const alive = said && said.name && (() => {
        try { return execFileSync("git", ["rev-parse", "--verify", said.name], { cwd: root, stdio: ["ignore", "pipe", "ignore"] }) && true } catch { return false }
      })()
      if (!alive) rmSync(at(root, BRANCH_PATH))
    }

    const token = readIfExists(root, GATE_PATH)
    let gate = null
    try {
      gate = token ? JSON.parse(token) : null
    } catch (e) {
      drop()
      return { ok: false, kind: "no-gate", why: `${GATE_PATH} не разбирается как JSON — ${e.message}` }
    }
    const key = String((gate && gate.key) || "").trim()
    const planPath = `task/${key}/PLAN.md`

    // Рецепт прошлого среза — вход суждения, а не его вывод: признать свою ветку своей может только
    // ядро, потому что имя ветки выводится там же, из ключа и веса.
    const prior = (() => { try { return JSON.parse(readIfExists(root, BRANCH_PATH) || "null") } catch { return null } })()
    const r = newBranch({
      gate: gate ? { key, planHash: gate.plan, answer: gate.answer } : null,
      prior,
      planText: readIfExists(root, planPath),
      mode: readIfExists(root, MODE_PATH).trim(),
      git: gitFacts(root, planPath),
    })
    if (!r.ok) { drop(); return { ok: false, kind: r.error.cls, why: r.error.detail } }

    const b = r.value
    // ВЕТКА УЖЕ НАША: ни git switch, ни базлайна — оба уже случились в прогоне, который её отрезал.
    // Артефакт остаётся на месте нетронутым: перезаписать его значило бы стереть вердикт базлайна.
    // Хост валидирует ВЫХОД: `null` в поле, объявленном строкой, роняет прогон на «Invalid output
    // from branch» — тот же класс, что дважды стоил прогона на budgets. Отсутствие удалённого — это
    // пустая строка, а не отсутствие значения.
    if (b.kept) return { ok: true, kept: true, name: b.name, base: b.base, baseSha: b.baseSha, remote: String(b.remote || ""), at: BRANCH_PATH, baseline: String((prior && prior.baseline) || "") }

    try {
      execFileSync("git", ["switch", "-c", b.name, b.remote ? `${b.remote}/${b.base}` : b.base], { cwd: root, stdio: "ignore" })
    } catch (e) {
      drop()
      return { ok: false, kind: "cut-failed", why: `git switch -c ${b.name} не выполнился — ${e.message}` }
    }
    // АРТЕФАКТ ПИШЕТСЯ СРАЗУ ПОСЛЕ СРЕЗА, до базлайна. Живой урок: исключение между `git switch` и
    // записью оставило срезанную ветку без квитанции, и повторный запуск отказал бы `branch-exists` о
    // ветке, которую сам же и создал. Состояние git изменилось — значит запись о нём уже должна быть.
    writeFileSync(at(root, BRANCH_PATH), `${JSON.stringify({ ...b, baseline: "не гонялся" }, null, 2)}\n`)

    // БАЗЛАЙН — ДО ПЕРВОЙ СТРОЧКИ РАБОТЫ. Ветка равна свежему транку, поэтому зелёный прогон
    // доказывает релизопригодность транка, а красный называет дефект ЧУЖИМ. Без этого якоря красный
    // сьют на шаге 16 не улика: его с равным правом спишут на наследство.
    //
    // Флаг `baseline` (izi.config.json) выключает его там, где якорь дорог и не нужен: песочница
    // гоняет полосу десять раз в день, и полный `mvn verify` на каждом срезе стоит больше, чем
    // доказывает. Ветка при этом уже срезана — отказ базлайна не откатывает git, он ОБЪЯВЛЯЕТ, что
    // якоря нет (`baseline: "red: <сьют>"` в артефакте), и полоса встаёт с именем чужого дефекта.
    const suites = [...readFileSync(at(root, GRAPH_PATH), "utf8").matchAll(/<suite\b([^>]*)\/>/g)]
      .map((m) => attrs(m[1])).filter((a) => a.cmd)
    let note = "выключен флагом izi.config.json"
    if (baseline && suites.length) {
      const red = []
      for (const one of suites) {
        try {
          execFileSync("/bin/sh", ["-c", one.cmd], { cwd: root, stdio: "ignore", timeout: 30 * 60 * 1000 })
        } catch {
          red.push(one.id || one.cmd)
        }
      }
      note = red.length ? `red: ${red.join(", ")}` : `зелен: ${suites.map((x) => x.id || x.cmd).join(", ")}`
      if (red.length) {
        writeFileSync(at(root, BRANCH_PATH), `${JSON.stringify({ ...b, baseline: note }, null, 2)}\n`)
        return {
          ok: false,
          kind: "red-baseline",
          name: b.name,
          baseline: note,
          why: `базлайн красный на свежем транке: ${red.join(", ")} — это ЧУЖОЙ дефект, ветка ${b.name} уже срезана. Почини транк либо запусти полосу заново: молча чинить чужое здесь нельзя`,
        }
      }
    } else if (baseline) {
      note = "сьютов в карте нет"
    }

    writeFileSync(at(root, BRANCH_PATH), `${JSON.stringify({ ...b, baseline: note }, null, 2)}\n`)
    return { ok: true, at: BRANCH_PATH, name: b.name, base: b.base, baseSha: b.baseSha, remote: b.remote || "", baseline: note }
  },
}

// --- tickets: план → наряды исполнителям ----------------------------------------------------------
// Step 14, и роли на нём нет: что менять решил шаг 6, как менять — фаза ④ шага 9, в каком порядке —
// фаза ⑦, можно ли вообще — гейт 1. Здесь только раскладка, и она стоит 0 токенов.
//
// ТИКЕТОВ ДВА РОДА, И ПОРЯДОК ЖЁСТКИЙ: тест раньше модуля. Оба пишутся по ОДНОЙ вырезке раздела, а
// тестовый файл не входит в `outputs` модульного наряда — привести модуль к тесту исполнитель может,
// привести тест к модулю нет. Это и есть соблюдение контракта, снятое с доброй воли.
const TICKETS_DIR = "tickets"

export const tickets = {
  description: "Step 14: cut the approved plan into implementer tickets. Two kinds: a BOUNDARY ticket per use case whose actor enters through a path (a black box through that channel, wave 0) and a MODULE ticket per section of the plan, carrying the code and its own tests. Every step of the requirement gets exactly one owner — the module through which it is observable, decided by the declared `calls` edges, never by guessing what kind of module it is. The body also carries what the repository already knows and the ticket used to omit: the stack, the package, the declaration, the signatures of types that exist here, and the mirrored test of the sample (steps/tickets/facts.mjs). Ticket text is ENGLISH — from the FRD down the reader is the small model that writes the code. Writes task/<KEY>/tickets/<NN>-<name>.md and returns the wave layout step 15 dispatches by. Twelve structural rules; no role, no tokens.",
  // dry — СУХОЙ ПРОГОН: посчитать нарезку и НЕ ПИСАТЬ её. Гардрейл нарезки — чистая функция от
  // артефактов шагов 5/6/8/9, и все они лежат на диске уже к шагу 10; из шагов 12-13 сюда приходят
  // только РАЗРЕШЕНИЕ писать (gate1.json) и имя ветки в заголовок. Поэтому «нарезается ли по этому
  // плану исполнимый набор» — вопрос, на который можно ответить ДО гейта, тем же кодом, который
  // потом режет. Красный сухой прогон возвращает работу дизайнеру шага 9, а не оператору.
  input: { type: "object", properties: { dry: { type: "boolean" } }, additionalProperties: false },
  output: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      why: { type: "string" },
      blockers: { type: "string" },
      at: { type: "string" },
      total: { type: "number" },
      tests: { type: "number" },      // граничных нарядов: род `test` исчез вместе с прежней нарезкой
      modules: { type: "number" },
      waves: { type: "array", items: { type: "number" } },
      chars: { type: "number" },
      files: { type: "array", items: { type: "string" } },
      // Наряды, чьи ворота — ВЕСЬ сьют: у репозитория нет шаблона одного теста. Поле объявлено здесь,
      // потому что хост валидирует ВЫХОД (`additionalProperties: false`): не объявленный ключ роняет
      // прогон на «Invalid output from tickets» — так умер живой прогон 9bbf195f, вошедший в шаг 14.
      wholeSuite: { type: "array", items: { type: "string" } },
    },
    required: ["ok"],
    additionalProperties: false,
  },
  run({ dry = false } = {}, context) {
    const root = runRoot(context)
    const key = taskKey(root)
    if (!key) return { ok: false, why: "ключ задачи не отвечен — тикеты класть некуда" }

    // Гейт — разрешение ПИСАТЬ, а не условие считать: сухой прогон идёт до него.
    const gate = readIfExists(root, GATE_PATH)
    if (!dry && !gate) return { ok: false, why: `${GATE_PATH} не существует — план не утверждён, резать тикеты рано` }
    if (!existsSync(at(root, FRD_PATH)) || !existsSync(at(root, GRAPH_PATH))) {
      return { ok: false, why: `${FRD_PATH} или ${GRAPH_PATH} не существует` }
    }

    const frd = parseFrd(readFileSync(at(root, FRD_PATH), "utf8"))
    const map = readFileSync(at(root, GRAPH_PATH), "utf8")
    const modules = modulesOfChange({ frd })
    const planDocPath = `task/${key}/PLAN.md`
    const sections = sectionsOf(readIfExists(root, planDocPath))
    if (!sections.length) return { ok: false, why: `в ${planDocPath} нет ни одного раздела — шаг 9 не отработал` }

    // ОЧЕРЕДЬ РАБОТ БЕРЁТСЯ ИЗ `needs` ДЕРЕВА, А НЕ ИЗ ВЫЗОВОВ. Пока она считалась по объявленным
    // вызовам плюс статическим рёбрам карты, нарезка выдавала «iglossarystore (волна 2) ждёт
    // glossarystore волна 3» — интерфейс ждал собственную реализацию, и этим кончился прогон
    // 1410ae34. Волны тикетов обязаны совпадать с волнами плана: их считает один и тот же вход.
    const treeText = readIfExists(root, TREE_PATH)
    if (!treeText.trim()) return { ok: false, why: `${TREE_PATH} не существует — очередь работ строить не из чего, шаг 9B не закрыт` }
    const byNeeds = wavesOf({ tree: treeText })
    if (byNeeds.cycle.length) return { ok: false, why: `очередь работ замкнута: ${byNeeds.cycle.join(" → ")} — артефакты разошлись с утверждённым планом` }
    const order = byNeeds.waves.flat()

    // Куда кладут тесты и как их называют, решает РЕПОЗИТОРИЙ: разведка записала это в карту, и
    // здесь оно только читается. Юнитовый сьют первым — модульный тикет закрывается им.
    const suites = [...map.matchAll(elem("suite"))].map((m) => attrs(m[1]))
    const suite = suites.find((x) => x.kind === "unit") || suites[0] || {}
    // СЬЮТ НЕ-UNIT — то, чем репозиторий гоняет программу СНАРУЖИ. Есть он — есть куда положить
    // граничную проверку, которую никто не подгонит; нет — все шаги достаются владельцам.
    const outer = suites.find((x) => x.kind && x.kind !== "unit") || null
    // Команда сборки БЕЗ прогона тестов: ею закрывается модуль, за которым не осталось шагов. Полная
    // сборка (`<build cmd>`) для этого не годится — она гоняет и граничные тесты, а те красные до
    // последней волны по замыслу.
    const build = attrs(((map.match(/<build\b([^>]*)\/>/) || ["", ""])[1])).compile || ""

    // ОБРАЗЦЫ ВНЕШНЕГО СЬЮТА — файлы, которые репозиторий уже держит под своим же шаблоном. Один из
    // них едет в граничный тикет, и из него исполнитель берёт фреймворк, базовый класс, доступ к
    // защищённым эндпоинтам и уборку за собой. Карта их не знает: их клетка не попала в разведку —
    // а искать по объявленному шаблону дешевле и точнее, чем спрашивать роль.
    const samples = outer && outer.path && outer.match
      ? (() => {
          const rx = new RegExp(`^${String(outer.match).split("*").map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`)
          const walk = (dir, into = []) => {
            let all = []
            try { all = readdirSync(at(root, dir), { withFileTypes: true }) } catch { return into }
            for (const e of all) {
              const one = `${dir}/${e.name}`
              if (e.isDirectory()) walk(one, into)
              else if (rx.test(e.name)) into.push(one)
            }
            return into
          }
          return walk(String(outer.path).replace(/\/$/, "")).sort()
        })()
      : []

    // ОДИН РАЗБОР КАРТЫ НА ВЕСЬ ШАГ. Из него же растут факты репозитория (steps/tickets/facts.mjs):
    // стек, пакет и сигнатуры типов, которые в репозитории уже есть. Токенов не стоит — карту
    // оплатил шаг 5.
    const parsed = parseMap(map)
    // ВТОРОЙ ИСТОЧНИК ТИПОВ — вычисленный граф шага 3: рой читал только клетки фокуса (в живой карте
    // eddi 230 объявлений), а скрипт прочитал ВСЕ файлы (6070). Тип, которого в карте роя нет,
    // находится здесь за 0 токенов — иначе наряд называет тип из конструктора, не давая ни
    // сигнатуры, ни пути (живой счёт eddi: IDocumentDescriptorStore, MeterRegistry и ещё четыре).
    const computed = parseComputed(readIfExists(root, COMPUTED_PATH))
    const facts = factsOf(parsed, computed)
    // Карта — словарь путей, которые в репозитории ЕСТЬ: по нему отсеивается проза из строки
    // «sample», и по нему же судит седьмое правило гардрейла. Пути из вычисленного графа — такие
    // же существующие файлы: скрипт прочитал их с диска на шаге 3.
    const known = new Set([...parsed.nodes, ...(computed.decls || []).map((d) => d.at).filter(Boolean)])
    const list = ticketsOf({
      sections, order, frd, key,
      branch: (() => { try { return JSON.parse(readIfExists(root, BRANCH_PATH) || "{}").name || "" } catch { return "" } })(),
      match: suite.match || "*",
      testDir: suite.path || "",
      known,
      outer,
      unit: suite,
      build,
      samples,
      facts,
    })
    const bad = checkTickets({
      tickets: list, sections, frd, known, outer,
      stack: facts.stack, match: suite.match || "*", testDir: suite.path || "",
    })
    if (bad.length) return { ok: false, blockers: bad.join("\n  ") }

    // СУХОЙ ПРОГОН КОНЧАЕТСЯ ЗДЕСЬ — ровно там, где начинается диск. Счёт возвращается тот же, что у
    // мокрого: полоса печатает его до гейта, и шаг 14 обязан выдать такой же.
    if (dry) {
      const layers = [...new Set(list.map((t) => t.wave))].sort((x, y) => x - y)
      return {
        ok: true,
        total: list.length,
        tests: list.filter((t) => t.kind === "boundary").length,
        modules: list.filter((t) => t.kind === "module").length,
        waves: layers.map((w) => list.filter((t) => t.wave === w).length),
      }
    }

    const dir = `task/${key}/${TICKETS_DIR}`
    mkdirSync(at(root, dir), { recursive: true })
    let chars = 0
    // ШАГ ОТВЕЧАЕТ ЗА СВОИ ТИКЕТЫ ПОИМЁННО. Список уезжает в отметку журнала артефактами: удалили
    // каталог — лестница говорит «артефакт исчез» и шаг переигрывается сам; правили тикет руками —
    // ловит отпечаток. Без этого шаг 14 закрывался «на слово», и перегенерировать его было нечем,
    // кроме ручной правки состояния прогона.
    const files = []
    for (const t of list) {
      const text = ticketText(t)
      chars = Math.max(chars, text.length)
      const one = `${dir}/${t.id}-${t.name}.md`
      writeFileSync(at(root, one), `${text}\n`)
      files.push(one)
    }
    const waves = [...new Set(list.map((t) => t.wave))].sort((a, b) => a - b)
    // Ворота на ВСЁМ сьюте сказаны вслух: у репозитория нет шаблона одного теста, и такой наряд
    // гоняет весь сьют — дороже и чувствителен к чужим тестам, но это факт репозитория.
    const wide = list.filter((t) => t.wholeSuite).map((t) => t.name)
    return {
      ok: true,
      wholeSuite: wide,
      at: dir,
      total: list.length,
      tests: list.filter((t) => t.kind === "boundary").length,
      modules: list.filter((t) => t.kind === "module").length,
      waves: waves.map((w) => list.filter((t) => t.wave === w).length),
      chars,
      files,
    }
  },
}

// --- plan: the change as an ordered DAG of work ---------------------------------------------------
// Step 10. One io function, and the ONLY one in the band that both asks the operator and applies the
// answer itself: there is no role here to re-delegate to, so the value the operator typed is
// substituted by this script (docs/plan.md §6). The judgement is steps/plan/plan.mjs::newPlanIndex.
//
// ERASING is half the contract, exactly as for `.agent/mode` and the ripple (docs/weight.md §4):
// newRun carries the run's STATE into .agent/prev and leaves the artifacts, so yesterday's plan would
// survive today's refusal and the operator would approve a plan for a change that no longer exists.
const PLAN_INDEX_PATH = ".agent/plan-index.json"

// gitTrunk — the trunk's name as a FACT, or "" when git cannot say.
//
// `origin/HEAD` first (the remote's own answer to "what is the default branch"), then a local
// `main`/`master`. NEVER the current branch: it can be anything, and a base taken from it would cut
// the work branch off whatever happened to be checked out. "" is not "main" — no fact means the
// refusal `no-trunk`, not a guess (standards/code.md, constraint 4: a tool failure is not data).
function gitTrunk(root) {
  const git = (args) => {
    try {
      return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
    } catch {
      return ""
    }
  }
  const head = git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])   // "origin/main"
  if (head) return head.split("/").slice(1).join("/")
  for (const name of ["main", "master"]) {
    if (git(["rev-parse", "--verify", "--quiet", `refs/heads/${name}`])) return name
  }
  return ""
}

export const plan = {
  description: "Step 10. Project the accepted change onto the work: nodes with a kind, a topological order out of the map's DIRECTED edges and the design's DIRECTED routes, and a check command per node (steps/plan/plan.mjs::newPlanIndex). Writes .agent/plan-index.json. The task key is asked ONCE — ok:false with ask:true carries the question verbatim, and the caller puts it on the operator's rail and calls again. `edges` are the dependencies step 11's critic asserted, already resolved to plan ids by its guardrail: passing them re-plans WITHOUT re-delegating any role. Any refusal REMOVES the artifact so that no gate can approve a previous run's plan.",
  input: {
    type: "object",
    properties: {
      edges: {
        type: "array",
        items: {
          type: "object",
          properties: { from: { type: "string" }, to: { type: "string" } },
          required: ["from", "to"],
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
  output: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      why: { type: "string" },
      ask: { type: "boolean" },
      subject: { type: "string" },
      branch: { type: "string" },
      base: { type: "string" },
      nodes: { type: "number" },
      code: { type: "number" },
      scenario: { type: "number" },
      gaps: { type: "array", items: { type: "string" } },
    },
    required: ["ok"],
    additionalProperties: false,
  },
  run(input, context) {
    const root = runRoot(context)
    const drop = () => { if (existsSync(at(root, PLAN_INDEX_PATH))) rmSync(at(root, PLAN_INDEX_PATH)) }

    for (const [path, why] of [[FRD_PATH, "шаг 6 intake не отработал"], [GRAPH_PATH, "шаг 5 graph не отработал"], [MODE_PATH, "шаг 7 weight не отработал"]]) {
      if (!existsSync(at(root, path))) {
        drop()
        return { ok: false, why: `${path} не существует — ${why}, планировать нечего` }
      }
    }

    // The design graph is OPTIONAL by contract: step 8 may have decided a design was not needed, and
    // then a created module simply has no declared neighbours (docs/plan.md §4, rule 2).
    const designXml = readIfExists(root, DESIGN_GRAPH_PATH)
    const said = parsedAnswers(readIfExists(root, ANSWERS_PATH))
    const r = newPlanIndex({
      frd: parseFrd(readFileSync(at(root, FRD_PATH), "utf8")),
      map: parseMap(readFileSync(at(root, GRAPH_PATH), "utf8")),
      mode: readFileSync(at(root, MODE_PATH), "utf8"),
      design: designXml ? parseDesign(designXml) : null,
      routes: designXml ? parseRoutes(designXml) : [],
      // The DoD of every node, derived ONCE at step 9 and carried here — not recomputed. A skipped
      // step 9 gives an empty map, and every node's `dod` is then `[]`: declared, never guessed.
      units: designXml ? unitsByPath(parseDesign(designXml), parseRoutes(designXml)) : new Map(),
      trunk: gitTrunk(root),
      answers: said.ok ? said.value : [],
      edges: (input && input.edges) || [],
    })

    if (!r.ok) {
      drop()
      // `ask` is a RAIL, not a refusal: the detail IS the question, byte-stable across calls, so the
      // answer written against it is recognised on the next call by comparison, not by memory.
      if (r.error.cls === "ask") return { ok: false, ask: true, subject: r.error.detail, why: r.error.detail }
      return { ok: false, why: `${r.error.cls}:\n  ${r.error.detail}` }
    }

    mkdirSync(dirname(at(root, PLAN_INDEX_PATH)), { recursive: true })   // written AFTER the decision to accept
    writeFileSync(at(root, PLAN_INDEX_PATH), `${JSON.stringify(r.value.index, null, 2)}\n`)
    return {
      ok: true,
      branch: r.value.branch.name,
      base: r.value.branch.base,
      nodes: r.value.nodes.length,
      code: r.value.nodes.filter((n) => n.kind === "code").length,
      scenario: r.value.nodes.filter((n) => n.kind === "scenario").length,
      gaps: r.value.gaps,
    }
  },
}

// --- review: the critic's verdict on the plan -----------------------------------------------------
// Step 11. The verdict is DATA, and the io reflects that: the artifact is promoted on a green FORM in
// BOTH branches of the verdict, because a Reject's blockers are what the band repairs from and what
// the operator reads. What is never promoted is a file that broke R1..R4 — that is not a negative
// verdict, it is a malformed one (docs/review.md §7).
//
// ERASING first, as for the mode, the ripple and the design (docs/weight.md §4): newRun carries the
// run's STATE into .agent/prev and leaves the artifacts, so yesterday's Pass would sit on disk while
// today's plan was never judged.
// (REVIEW_PATH is declared once, beside FRD_PATH — checkFrd's F9 io reads it too.)

export const reviewForm = {
  description: "Словарь блокеров И оба чек-листа шага 11, как ДАННЫЕ. `codes` — из steps/review/review.mjs; `owed` — строка на каждое требование brd.md (owedItems), id машинный, роль его копирует, а не сочиняет; `unbacked` — обратный ход: элементы FRD, которых не называет ни одна строка <carried by> (unbackedItems) — подозреваемые, а не виноватые. Наряд ПОДСТАВЛЯЕТ оба: роль, которой пришлось бы вспоминать содержимое артефакта, отвечает «в целом» — так прошли три дефекта прогона c64dbd32 и оба открытых вопроса ручного прогона по eddi.",
  input: { type: "object", properties: {}, additionalProperties: false },
  output: {
    type: "object",
    properties: { codes: { type: "string" }, owed: { type: "string" }, unbacked: { type: "string" } },
    required: ["codes"],
    additionalProperties: false,
  },
  run(_args, context) {
    const root = runRoot(context)
    const codes = CODES.join(" | ")
    // Форму спрашивают ДО того, как артефакты обязательно существуют (юнит зовёт её голой), поэтому
    // отсутствие — пустой чек-лист, а не бросок: отказывает `review({path})`, та функция, что судит.
    // FRD берётся со STAGING: критик судит артефакт, который роль только что написала, а не
    // промоутнутый прошлого круга.
    const frdPath = existsSync(at(root, FRD_STAGING)) ? FRD_STAGING : FRD_PATH
    const frd = existsSync(at(root, frdPath)) ? parseFrd(readFileSync(at(root, frdPath), "utf8")) : null
    const brd = parseBrd(readIfExists(root, BRD_PATH))
    // ДОЛГ СЧИТАЕТСЯ ИЗ BRD И ТОЛЬКО ИЗ НЕГО: отсутствие FRD гасит лишь ОБРАТНЫЙ ход (`unbacked`),
    // которому нужен артефакт. Общий ранний возврат обнулял оба поля разом.
    //
    // BUG_FIX_CONTEXT: живой прогон eddi 19.08.2026, четвёртый запуск. Полоса зовёт `reviewForm({})`
    //   в начале шага 6 — FRD в этот момент нет ни в staging, ни промоутнутого, — и в наряд прохода
    //   D уезжала заглушка «(нет FRD: чек-лист пуст)», 24 символа вместо 2141. Роль обходить было
    //   нечего, она не написала ни строки `<carried>`, и F11 краснел на ВСЕХ семнадцати требованиях.
    //   Дважды подряд, и оба раза вина читалась как «модель ленится».

    const owed = owedItems({ requirements: brd.requirements }).map((r) => `${r.id} — ${r.what}`).join("\n")
    const unbacked = frd ? unbackedItems({ frd }).map((r) => `${r.id} — ${r.what}`).join("\n") : ""
    return {
      codes,
      owed: owed || "(в brd.md нет ни одного требования: закрывать нечего)",
      // Пустой обратный список — тоже ответ, и его надо сказать словами: молчание роль читает как
      // «этот вопрос не задан», а он задан и ответ на него «всё заявлено».
      unbacked: frd ? (unbacked || "(пусто: за каждым элементом артефакта стоит требование)") : "(артефакта ещё нет — обратный ход считать не по чему)",
    }
  },
}

export const review = {
  description: "Шаг 11. Судить staging-вердикт роли `critic` по steps/review/review.mjs::newReview: вердикт согласен со своим телом, каждый код в словаре, каждый `node` резолвится в ЭЛЕМЕНТ FRD, каждая улика — того рода, какого требует её код, и закрыты обе таблицы: долг перед требованиями brd.md и элементы артефакта, которых не просило ни одно требование. ERASES .agent/review.xml before judging, and on a green FORM promotes the staged file — for a Reject too, since its blockers are what the band repairs from. Returns the blockers with the culprit artifact and the OWNING STEP derived from each code, so the caller can route the repair without parsing prose.",
  input: { type: "object", properties: { path: { type: "string" } }, additionalProperties: false },
  output: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      verdict: { type: "string" },
      blockers: { type: "string" },
      // feedback — вердикт в той форме, в какой его читает роль шага 6 (steps/review/review.mjs::feedbackLines)
      feedback: { type: "string" },
      // pass — проход шага 6, с которого полоса переигрывает требование (steps/review/review.mjs::passOf)
      pass: { type: "string" },
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            code: { type: "string" },
            node: { type: "string" },
            evidence: { type: "string" },
            culprit: { type: "string" },
            owner: { type: ["number", "string"] },
            text: { type: "string" },
            // The words the OPERATOR reads when `owner` is "operator" — steps/review/review.mjs::
            // OPERATOR_NOTE, a function OF the code exactly as culprit/owner are. "" for every other
            // owner; band() (workflows/izi.js) is the one reader that cares, and only for those rows.
            note: { type: "string" },
          },
          required: ["code", "node", "evidence", "culprit", "owner", "text", "note"],
          additionalProperties: false,
        },
      },
    },
    required: ["ok"],
    additionalProperties: false,
  },
  run({ path } = {}, context) {
    const root = runRoot(context)
    if (existsSync(at(root, REVIEW_PATH))) rmSync(at(root, REVIEW_PATH))

    if (!path) return { ok: false, blockers: "review({path}) вызван без пути к staging — судить нечего" }
    if (!existsSync(at(root, path))) {
      return { ok: false, blockers: `${path} не существует — роль ничего не записала по staging-пути` }
    }
    // Критик судит ТРЕБОВАНИЕ: FRD со staging (роль только что его написала) или промоутнутый, если
    // staging уже убран. Плана здесь нет и быть не может — шаг 11 переехал ВЫШЕ него.
    const frdPath = existsSync(at(root, FRD_STAGING)) ? FRD_STAGING : FRD_PATH
    if (!existsSync(at(root, frdPath))) {
      return { ok: false, blockers: `${frdPath} не существует — шаг 6 intake не отработал, судить требование не по чему` }
    }
    const frd = parseFrd(readFileSync(at(root, frdPath), "utf8"))
    // Чек-лист долга — требования BRD, тем же парсером, что судит шаг 2.
    const requirements = parseBrd(readIfExists(root, BRD_PATH)).requirements

    const r = newReview({ xml: readFileSync(at(root, path), "utf8"), frd, requirements })
    if (!r.ok) return { ok: false, blockers: r.error.detail }

    // The findings that cost no role call at all, merged AFTER the form was judged: R1 keeps judging
    // the role's own file (a Pass carrying a blocker is still a contradiction in it), and a script
    // finding then turns the RESULT to Reject regardless. An open question that reached the plan is
    // a fact, and a fact does not need a model to notice it (docs/concept.md, rule 3).
    const auto = autoFindings({ frd }).map((b) => ({ ...b, culprit: CODE_CULPRIT[b.code], owner: CODE_OWNER[b.code], note: OPERATOR_NOTE[b.code] || "" }))
    const findings = [...r.value.blockers.map((b) => ({ ...b })), ...auto]

    copyFileSync(at(root, path), at(root, REVIEW_PATH))   // promoted AFTER the decision to accept
    rmSync(at(root, path))
    // Строки FEEDBACK собирает срез критика, а не полоса: их форма — контракт между двумя ролями,
    // и у неё есть юнит (steps/review/review.test.mjs).
    // ПРОХОД ВХОДА — решение модуля, не полосы (steps/review/review.mjs::passOf). Полоса войдёт в
    // РАННИЙ из названных проходов и пойдёт от него вперёд до D: элемент нижнего пласта обязан
    // получить верхние (steps/intake/passes-data-flow.md).
    const entry = criticEntry(findings, frd)
    return { ok: true, verdict: auto.length ? "Reject" : r.value.verdict, findings, feedback: feedbackLines(findings), pass: entry }
  },
}

// nodeFacts — ЧТО РЕПОЗИТОРИЙ ЗНАЕТ О НАЗВАННЫХ ФАЙЛАХ. Роль, которой велено написать раздел про
// существующий файл, обязана взять его объявления и его вызовы С ДИСКА, а не из головы: сигнатура,
// придуманная по имени класса, читается исполнителем как факт и уводит его писать не тот код.
//
// Приоритет и зависимости наряда роль не пишет вовсе — их считает нарезка (`layersOf` по строкам
// `calls:` и рёбрам карты). Поэтому единственное, что от роли нужно для очереди работ, — ЧЕСТНЫЙ
// `calls:`, и он тоже берётся отсюда.
//
// BUG_FIX_CONTEXT: прогон e1f7b5c8 (20.08.2026). Фиксеру велели дописать раздел плана про
//   `AgentConfiguration.java`, а в наряде у него были только ПУТИ (адресная книга) — ни одного
//   объявления. Вычисленный граф при этом несёт по этому файлу 151 объявление и его рёбра.
export const nodeFacts = {
  description: "Step 10c: what the repository knows about the files a finding names — the declarations of .agent/graph-computed.xml (kind and name, in file order) and the outgoing edges of the map. The fixer writes `signatures:` and `calls:` of a section from THIS, never from memory; the ticket's wave and dependencies are computed from `calls:` by the cut, not written by a role. Costs no tokens.",
  input: { type: "object", properties: { paths: { type: "array", items: { type: "string" } }, cap: { type: "number" } }, additionalProperties: false },
  output: { type: "object", properties: { text: { type: "string" }, nodes: { type: "number" } }, required: ["text"], additionalProperties: false },
  run({ paths = [], cap = 60 } = {}, context) {
    const root = runRoot(context)
    const comp = parseComputed(readIfExists(root, COMPUTED_PATH) || "")
    const map = parseMap(readIfExists(root, GRAPH_PATH) || "")
    const want = [...new Set((Array.isArray(paths) ? paths : []).filter(Boolean))]
    const out = []
    let seen = 0
    for (const p of want) {
      const decls = (comp.decls || []).filter((d) => d && d.at === p)
      const edges = [...new Set([
        ...(comp.edges || []).filter((e) => e && e.from === p).map((e) => e.to),
        ...(map.edges || []).filter((e) => e && e.from === p).map((e) => e.to),
      ].filter(Boolean))]
      if (!decls.length && !edges.length) continue
      seen++
      out.push(`${p}`)
      for (const d of decls.slice(0, cap)) out.push(`  ${d.kind} ${d.name}`)
      if (decls.length > cap) out.push(`  … ещё ${decls.length - cap} объявлений`)
      out.push(`  calls: ${edges.length ? edges.join(" ") : "none"}`)
    }
    return { text: out.join("\n"), nodes: seen }
  },
}

// planCard — ГДЕ ЖИВЁТ ИСТОЧНИК РАЗДЕЛА. `PLAN.md` — документ ПРОИЗВОДНЫЙ: `planbook` копирует его
// разделы из карточек партий (`task/<KEY>/design/<slug>.md`). Правка, положенная в документ, живёт
// до первой пересборки — а пересборка случается каждый раз, когда требование получило новый модуль.
//
// BUG_FIX_CONTEXT: 20.08.2026. Луп чинил PLAN.md: константа resource URI, ключ шаблона `glossary`,
//   Caffeine вместо Map, исключение под 422 — четыре правки. В карточке партии всё это осталось
//   по-старому, и первая же пересборка плана вернула бы документ к тексту карточки.
// УДАЛЕНО 21.08.2026 вместе со старым шагом 9 (docs/plan.md): `planCard`.

// frdAdopt — ПОТЕРЯННЫЙ МОДУЛЬ ВПИСЫВАЕТ СКРИПТ, А НЕ РОЛЬ. Модель здесь ничего не решает: путь
// назвал разборщик вердикта, use case назван строкой `<carried>`, сценарий у него один, а текст
// дельты — сама находка. Нечего решать — значит нечем и ошибиться.
//
// BUG_FIX_CONTEXT: прогон 20.08.2026, две правки требования подряд от роли: первая с якорем ИЗ
//   ПЛАНА, вторая с выдуманным путём `…/agent/AgentConfig.java`. Обе поймал гардрейл, обе стоили
//   круга. Замер этой функции на том же артефакте: правка проходит полный checkFrd с первого раза,
//   и `parts` видит 12 модулей вместо 11.
export const frdAdopt = {
  description: "Step 10c: adopt a module the requirement lost — WITHOUT a role. Reads the finding's path, the use case its `<carried req>` names, and that use case's scenario; appends the path to the scenario's `nodes` and writes a `<delta>` beside the last one, with the critic's own words as its `to`. The edit is a TRANSACTION judged by checkFrd (planFix judge:frd): red never reaches the disk. Refuses, naming why, when the requirement has no `<carried>` for that number, the scenario has no `nodes`, or the node is already there. Costs no tokens.",
  input: {
    type: "object",
    properties: { path: { type: "string" }, req: { type: "string" }, what: { type: "string" } },
    required: ["path", "req"],
    additionalProperties: false,
  },
  output: { type: "object", properties: { ok: { type: "boolean" }, why: { type: "string" }, blockers: { type: "string" }, bytes: { type: "number" } }, required: ["ok"], additionalProperties: false },
  run({ path, req, what = "" }, context) {
    const root = runRoot(context)
    if (!existsSync(at(root, FRD_PATH))) return { ok: false, why: `${FRD_PATH} не существует — усыновлять некуда` }
    const made = adoptNode({ frd: readFileSync(at(root, FRD_PATH), "utf8"), path, req, what })
    if (!made.ok) return { ok: false, why: made.why }
    return planFix.run({ target: FRD_PATH, patch: made.patch, judge: "frd" }, context)
  },
}

// clearStaged — ПУТЬ ДОСТАВКИ ПУСТ ПЕРЕД КАЖДЫМ ВЫЗОВОМ РОЛИ. Роль отдаёт работу файлом; файл,
// оставшийся от прошлого круга, полоса прочитает как ответ ЭТОГО круга — и не отличит «роль
// промолчала» от «роль повторила себя».
//
// BUG_FIX_CONTEXT: прогон e1f7b5c8 (20.08.2026), круг 2. Фиксер не записал ничего;
//   `.agent/staging/planfix.txt` нёс правку КРУГА 1, и полоса применила её повторно. Спас якорь:
//   `no such line in the file` — план не тронут, но круг потрачен, а находка R11 осталась открытой.
export const clearStaged = {
  description: "Step 10c: empty the staging path a role is about to write, and refuse any path outside .agent/staging/. The band calls it BEFORE every role call whose answer is a file: a file left by the previous round is indistinguishable from this round's answer. Costs no tokens.",
  input: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
  output: { type: "object", properties: { ok: { type: "boolean" }, why: { type: "string" } }, required: ["ok"], additionalProperties: false },
  run({ path }, context) {
    const root = runRoot(context)
    const p = String(path || "")
    if (!p.startsWith(`${STAGING_DIR}/`)) return { ok: false, why: `${p} лежит вне ${STAGING_DIR}/ — чистить чужое нельзя` }
    if (existsSync(at(root, p))) rmSync(at(root, p), { force: true })
    return { ok: true }
  },
}

// planReview — вход и выход второго судьи, шаг 10в. Роль зовёт полоса; здесь только диск и разбор.
export const planReview = {
  description: "Step 10c, phase ①: the inputs of the PLAN CRITIC — .agent/brd.md, .agent/frd.xml and task/<KEY>/PLAN.md, plus the operator's words when the loop runs after gate 1, plus `known` — every path .agent/appgraph.xml knows, the address book the FIXER names nodes from. Costs no tokens; the role call itself is the band's.",
  input: { type: "object", properties: {}, additionalProperties: false },
  output: {
    type: "object",
    properties: { ok: { type: "boolean" }, why: { type: "string" }, brd: { type: "string" }, frd: { type: "string" }, plan: { type: "string" }, known: { type: "string" }, at: { type: "string" } },
    required: ["ok"],
    additionalProperties: false,
  },
  run(_ = {}, context) {
    const root = runRoot(context)
    const key = taskKey(root)
    if (!key) return { ok: false, why: "ключ задачи не отвечен — план искать негде" }
    const planPath = `task/${key}/PLAN.md`
    if (!existsSync(at(root, planPath))) return { ok: false, why: `${planPath} не существует — шаг 10 не отработал, судить нечего` }
    // АДРЕСНАЯ КНИГА. Фиксер называет УЗЕЛ, а узлы знает карта — не он. Без неё он пишет путь по
    // памяти, и живой прогон 20.08.2026 это купил: `…/agent/AgentConfig.java` вместо
    // `…/configs/agents/model/AgentConfiguration.java`. Гардрейл поймал (F3), но круг был потрачен.
    return { ok: true, at: planPath, brd: readIfExists(root, BRD_PATH), frd: readIfExists(root, FRD_PATH),
      plan: readIfExists(root, planPath), known: knownPaths(readIfExists(root, GRAPH_PATH)).join("\n") }
  },
}

// planFix — правка по якорю, применённая МАШИНОЙ, и приговор ей же.
export const planFix = {
  description: "Step 10c, phase ②: apply the fixer's anchored edits to one artifact — the plan or the FRD (steps/planreview/planreview.mjs::applyPatch). An anchor absent from the file is REFUSED, never guessed at: a fixer that missed its anchor would otherwise write into the wrong place silently. With `judge: \"frd\"` the edit is a TRANSACTION: the result is judged by checkFrd on a candidate beside the artifact and written only if green — a refused edit leaves the deliverable, and the sha256 its runlog mark holds, untouched. After a plan edit the caller runs the dry cut. Costs no tokens.",
  input: {
    type: "object",
    properties: { target: { type: "string" }, patch: { type: "string" }, judge: { type: "string" } },
    required: ["target", "patch"],
    additionalProperties: false,
  },
  output: { type: "object", properties: { ok: { type: "boolean" }, why: { type: "string" }, blockers: { type: "string" }, bytes: { type: "number" } }, required: ["ok"], additionalProperties: false },
  run({ target, patch, judge = "" }, context) {
    const root = runRoot(context)
    if (!existsSync(at(root, target))) return { ok: false, why: `${target} не существует — править нечего` }
    const r = applyPatch({ text: readFileSync(at(root, target), "utf8"), patch })
    if (!r.ok) return { ok: false, why: r.error.detail }

    // ПРАВКА — ТРАНЗАКЦИЯ: судим, ПОТОМ пишем. Правило конвейера («артефакт, написанный на рельсе
    // ошибки, не закрывает шаг») стоит на СТУПЕНЯХ, а здесь правится ПОСТАВКА — файл, чью sha
    // держит отметка журнала. Записать в неё непрошедшее — значит порвать отметку.
    //
    // BUG_FIX_CONTEXT: живой прогон 20.08.2026. Фиксер вписал в `.agent/frd.xml` дельту с
    //   выдуманным путём `…/agent/AgentConfig.java`. Запись прошла, суд сказал КРАСНО, но sha уже
    //   разошлась с отметкой шага 6 — и лестница следующего запуска вошла НЕ в луп, а в шаг 6:
    //   цена одной опечатки роли стала полным переписыванием требования (четыре пласта, ~10
    //   вызовов). Кандидат живёт рядом и исчезает в обоих исходах.
    // ПЛАН — ПРОДУКТ, И ПРАВКА ЕГО ТОЖЕ ТРАНЗАКЦИЯ. Судит сухая нарезка: план, из которого не выйдет
    // ни одного наряда, хуже плана с находкой. Красная правка откатывается, и фиксер получает
    // отказ нарезки замечанием о СВОЁМ ответе — отмотки конвейера здесь нет и быть не должно.
    // ПРАВКА ИСТОЧНИКА, А НЕ ДОКУМЕНТА. Карточка — то, из чего `planbook` собирает разделы плана;
    // документ пересобирается тут же скриптом, и судит его та же сухая нарезка. Не сошлось —
    // возвращаются ОБА файла: карточка из памяти, план — пересборкой из неё.
    // ЗАГОЛОВОК РАЗДЕЛА — НА НУЛЕВОЙ КОЛОНКЕ, и это проверяет машина, а не глаз. Раздел с отступом
    // не виден ни покрытию, ни нарезке, ни следующему кругу критика (steps/planreview::hiddenHeads).
    if (judge === "card" || judge === "cut") {
      // ВМЕНЯЕТСЯ ТОЛЬКО ТО, ЧТО ВНЕСЛА ЭТА ПРАВКА. Артефакт мог приехать со скрытым заголовком,
      // написанным под старыми правилами: требовать от новой правки убрать чужой мусор — тупик,
      // она и не про него. Старый заголовок не исчезает: карточку перепишет ближайшее переигрывание
      // шага 9, а критик всё это время видит, что раздела у модуля нет.
      const was = hiddenHeads(readFileSync(at(root, target), "utf8"))
      const hidden = hiddenHeads(r.value).filter((l) => !was.includes(l))
      if (hidden.length) {
        return {
          ok: false,
          blockers: `заголовок раздела стоит не на нулевой колонке — такой раздел не увидит ни покрытие, ни нарезка:\n  ${hidden.slice(0, 3).join("\n  ")}\nНовый раздел начинается со строки «## <путь>» БЕЗ пробелов слева; якорем для него бери ПОСЛЕДНЮЮ строку файла, а не строку внутри чужого раздела`,
          why: "правка прячет раздел отступом — артефакт не тронут",
        }
      }
    }
    if (judge === "card") {
      const dir = taskDir(root)
      const PLAN_DOC = dir ? `${dir}/PLAN.md` : ""
      const before = readFileSync(at(root, target), "utf8")
      const planBefore = PLAN_DOC && existsSync(at(root, PLAN_DOC)) ? readFileSync(at(root, PLAN_DOC), "utf8") : ""
      writeFileSync(at(root, target), r.value)
      const rebuilt = planbook.run({}, context)
      const verdict = rebuilt.ok ? tickets.run({ dry: true }, context) : rebuilt
      if (!verdict.ok) {
        writeFileSync(at(root, target), before)
        if (planBefore) writeFileSync(at(root, PLAN_DOC), planBefore)
        return { ok: false, blockers: verdict.blockers || verdict.why, why: "после правки карточки план не собрался или не режется — правка откачена" }
      }
      return { ok: true, bytes: r.value.length }
    }
    if (judge === "cut") {
      const before = readFileSync(at(root, target), "utf8")
      writeFileSync(at(root, target), r.value)
      const verdict = tickets.run({ dry: true }, context)
      if (!verdict.ok) {
        writeFileSync(at(root, target), before)
        return { ok: false, blockers: verdict.blockers || verdict.why, why: "после правки план не режется — правка откачена" }
      }
      return { ok: true, bytes: r.value.length }
    }
    if (judge === "frd") {
      const CAND = `${target}.candidate`
      const lines = (v) => String((v && (v.blockers || v.why)) || "").split("\n").map((x) => x.trim()).filter(Boolean)
      // ЧТО ВМЕНЯЕТСЯ ПРАВКЕ — только то, чего ДО НЕЁ НЕ БЫЛО. Артефакт мог приехать в луп с чужим
      // долгом (правило появилось позже него, шаг закрылся под старым судом), и требовать от
      // точечной правки закрыть ВЕСЬ этот долг — это тупик: роль не может, а круги кончатся.
      // Старый блокер не исчезает — он остаётся долгом требования и всплывёт там, где его чинят
      // (шаг 6, у которого есть право спросить человека).
      const was = lines(checkFrd.run({ path: target }, context))
      writeFileSync(at(root, CAND), r.value)
      const now = lines(checkFrd.run({ path: CAND }, context))
      rmSync(at(root, CAND), { force: true })
      const fresh = now.filter((l) => !was.includes(l))
      if (fresh.length) return { ok: false, blockers: fresh.join("\n  "), why: "правка не прошла суд — артефакт не тронут" }
    }
    writeFileSync(at(root, target), r.value)
    return { ok: true, bytes: r.value.length }
  },
}

// planRoute — куда едет каждая находка. Решение чистое (steps/planreview/planreview.mjs::routeOf),
// здесь только чтение плана с диска.
export const planRoute = {
  description: "Step 10c, phase ③: parse the plan critic's verdict into findings and route each one to the ARTIFACTS it repairs — `plan` (a section of PLAN.md: fixed by anchor, or written whole when there is no such section) and `frd` (the fact is missing from the requirement too, so it is repaired in the SAME round). One finding can go to both. `design` stays in the shape for compatibility and is always empty: rebuilding steps 7-9 costs two role calls plus a fresh critic round, and the dry cut is what judges whether a patched plan can still be cut. Costs no tokens.",
  input: { type: "object", properties: { verdict: { type: "string" } }, required: ["verdict"], additionalProperties: false },
  output: {
    type: "object",
    properties: {
      found: { type: "number" },
      plan: { type: "array", items: { type: "string" } },
      design: { type: "array", items: { type: "string" } },
      frd: { type: "array", items: { type: "string" } },
      // Пути, названные находками: по ним фиксеру подставляют ФАКТЫ файла (nodeFacts).
      paths: { type: "array", items: { type: "string" } },
    },
    required: ["found"],
    additionalProperties: false,
  },
  run({ verdict }, context) {
    const root = runRoot(context)
    const key = taskKey(root)
    const plan = key ? readIfExists(root, `task/${key}/PLAN.md`) : ""
    const frd = readIfExists(root, FRD_PATH)
    const out = { plan: [], design: [], frd: [] }
    const found = findingsOf(verdict)
    for (const f of found) for (const r of routeOf(f, { plan, frd })) out[r].push(`${f.req} | ${f.kind} | ${f.at} | ${f.what}`)
    const paths = [...new Set(found.flatMap((f) => [...`${f.at} ${f.what}`.matchAll(/[\w./-]+\/[\w.-]+\.\w+/g)].map((m) => m[0])))]
    return { found: found.length, ...out, paths }
  },
}

// planFeedback — строки FEEDBACK фиксера с их источником. Форму задаёт срез, полоса её не сочиняет.
export const planFeedback = {
  description: "Step 10c: the FEEDBACK lines of the fixer, in the form the role reads them (steps/planreview/planreview.mjs::feedbackFor) — `critic:` for what the plan critic found, `guardrail:` for an edit of the previous round that did not apply. The band carries the field; the form lives in the slice, exactly as step 11's does. Costs no tokens.",
  input: { type: "object", properties: { findings: { type: "string" }, rejected: { type: "string" }, nfrs: { type: "boolean" } }, additionalProperties: false },
  output: { type: "object", properties: { text: { type: "string" }, count: { type: "number" } }, required: ["text"], additionalProperties: false },
  run({ findings = "", rejected = "", nfrs = false } = {}, context) {
    // ВЕЛИЧИНЫ, КОТОРЫЕ ПЛАН НЕ НЕСЁТ. Узнаётся величина ЧИСЛОМ С ЕДИНИЦЕЙ либо кодом
    // (steps/plan/raises.mjs::measuresOf) — голое число встречается в плане десятками способов.
    // Величина словесная («по образцу соседнего модуля») не проверяема и в работу не берётся:
    // притворяться, что проверяема, хуже, чем промолчать.
    let missing = []
    if (nfrs) {
      const root = runRoot(context)
      const key = taskKey(root)
      const plan = key ? readIfExists(root, `task/${key}/PLAN.md`) : ""
      const frd = existsSync(at(root, FRD_PATH)) ? parseFrd(readFileSync(at(root, FRD_PATH), "utf8")) : { nfrs: [] }
      missing = (frd.nfrs || []).filter((n) => {
        const tok = measuresOf(n.fit || "")
        return tok.length && !tok.some((t) => plan.toLowerCase().includes(t.toLowerCase()))
      })
    }
    return { text: feedbackFor({ findings, rejected, nfrs: missing }), count: missing.length }
  },
}

// izi_answer — an ordinary pi TOOL (not a workflow sandbox function: this one is called by the
// INTERACTIVE session's own model, reacting to the checkpoint follow-up message that
// workflows/izi.js's askOperator() delivers into this same chat). The question TEXT is never a model
// input: the tool takes ANSWERS BY NUMBER and reads the questions themselves from
// .agent/pending.json, written by the workflow's setPending() just before the pause.
//
// The model does the SPLITTING (it has the operator's reply and the batch in front of it) and this
// tool JUDGES the split: an unknown number, or a batch answered only halfway, is a refusal naming the
// missing numbers — not a half-written file. Splitting the reply here with a regex over "1. … 2. …"
// would be parsing prose, the class of defect that returned three unusable graphs in a row.
export const iziAnswer = {
  name: "izi_answer",
  label: "izi: operator answer",
  description: "Record the operator's reply to the currently open izi checkpoint question(s) in .agent/answers.md. Read the open questions and their numbers from .agent/pending.json (field items), then call with ONE xml block pairing every question with its answer: <exchange><question_1>…</question_1><answer_1>…</answer_1>…</exchange>. Every question must get an answer — a partial call is refused. SHOW the returned table to the operator: it says which answer landed under which question.",
  promptSnippet: "izi_answer({exchange}) — record the operator's reply as <exchange><question_N>…</question_N><answer_N>…</answer_N></exchange>; numbers and questions come from .agent/pending.json, not from you.",
  parameters: Type.Object({
    exchange: Type.String({
      description: "One <exchange> block: for every open question of .agent/pending.json a <question_N> with that question and an <answer_N> with the operator's reply to it, verbatim — not your paraphrase, not the alternatives the role offered. The value is the answer ITSELF, without the number the operator addressed it with: «1 GET /fruits» answering question 1 is <answer_1>GET /fruits</answer_1>.",
    }),
  }, { additionalProperties: false }),
  // ctx (5th arg) is pi's ExtensionContext (@earendil-works/pi-coding-agent) — this tool runs in the
  // INTERACTIVE session, which carries no WorkflowRunContext at all (that only exists inside the
  // workflow sandbox's registered functions, above). ctx.cwd is the session's own cwd — the same
  // project directory the operator launched `pi` in — so it is the correct stand-in anchor here;
  // process.cwd() is only the fallback if ctx is ever missing.
  async execute(_id, params, _signal, _onUpdate, ctx) {
    const root = (ctx && ctx.cwd) || process.cwd()
    if (!existsSync(at(root, PENDING_PATH))) {
      throw new Error("izi_answer: .agent/pending.json отсутствует — нет открытого вопроса izi, отвечать не на что")
    }
    let pending
    try {
      pending = JSON.parse(readFileSync(at(root, PENDING_PATH), "utf8"))
    } catch {
      throw new Error("izi_answer: .agent/pending.json повреждён — не JSON")
    }
    const items = Array.isArray(pending.items) && pending.items.length
      ? pending.items
      : [{ n: 1, text: pending.subject }]   // a pending written before items existed still answers
    if (!items.every((i) => i && typeof i.text === "string" && i.text)) {
      throw new Error("izi_answer: .agent/pending.json не несёт вопросов — писать в answers.md некуда")
    }

    // The block arrives as TEXT in this pipeline's own grammar and is read by this pipeline's own
    // parser — the model composes, the machine judges. What it is judged on is NUMBERS, never the
    // wording: the observed defect (live run e82192db) was a correctly copied question with somebody
    // else's answer under it, which no comparison of question texts would have caught, while such a
    // comparison would refuse an honest call over one stray space in a long Cyrillic line.
    const parsed = parsedAnswers(params.exchange)
    if (!parsed.ok) {
      throw new Error(`izi_answer: блок не разбирается — ${parsed.error.detail}. Форма: <exchange><question_1>…</question_1><answer_1>…</answer_1></exchange>`)
    }
    if (!parsed.value.length) {
      throw new Error("izi_answer: в блоке нет ни одной пары вопрос-ответ. Форма: <exchange><question_1>вопрос</question_1><answer_1>ответ</answer_1></exchange>, номера — из .agent/pending.json")
    }
    // Normalised HERE, once, before anything reads a value: the write below, the operator's table and
    // the checks in between must all see the same text. stripOrdinal drops the number the operator
    // ADDRESSED an answer with (live run 9d126ef3 — see its contract in core/answers.mjs); the value
    // is what the guardrails may take a number from, so the addressing must not survive into it.
    const byNumber = new Map(parsed.value.map((a) => [a.n, stripOrdinal(a.n, a.text)]))

    // Every open question must be answered, and every answer must belong to an open question. Both
    // directions matter: a stray number means the model answered something nobody asked, and a
    // missing one means the batch would close with a hole nobody would notice until step 7.
    const unknown = [...byNumber.keys()].filter((n) => !items.some((i) => i.n === n))
    if (unknown.length) {
      throw new Error(`izi_answer: номеров ${unknown.join(", ")} нет среди открытых вопросов (в .agent/pending.json их ${items.length}) — сверь номера с файлом`)
    }
    const missing = items.filter((i) => !String(byNumber.get(i.n) || "").trim()).map((i) => i.n)
    if (missing.length) {
      throw new Error(`izi_answer: нет ответов на ${missing.join(", ")} из ${items.length} — спроси оператора об оставшихся и вызови тул со ВСЕМИ ответами разом`)
    }
    const templated = items.filter((i) => looksLikeTemplate(byNumber.get(i.n))).map((i) => i.n)
    if (templated.length) {
      throw new Error(`izi_answer: ответ на ${templated.join(", ")} похож на шаблон-плейсхолдер (форма «<...>»), а не на ответ оператора`)
    }

    // The QUESTION written to disk is the one from pending.json, not the one the model retyped: the
    // file keeps the pipeline's own text, and the model's copy serves only the table below.
    const result = writeAnswer(root, items.map((i) => ({ n: i.n, question: i.text, text: byNumber.get(i.n) })))
    if (result.why) throw new Error(`izi_answer: ${result.why}`)

    // The table is the whole point of taking pairs instead of bare numbers: an answer glued to the
    // wrong question is invisible to any check and obvious to the operator in one line.
    const table = items.map((i) => `${i.n}. ${i.text}\n   → ${byNumber.get(i.n)}`).join("\n")
    const note = result.written ? "новая запись" : "уже была записана"
    return {
      content: [{ type: "text", text: `izi_answer: записано ответов ${items.length} (${note}, всего ${result.count} в .agent/answers.md). ПОКАЖИ оператору это разложение — если ответ лёг не под свой вопрос, он увидит здесь:\n${table}` }],
      details: { answered: items.map((i) => i.n), ...result },
    }
  },
}

export default function extension(pi) {
  pi.registerTool(iziAnswer)
  registerWorkflowExtension({
    version: "1.25.0",
    headline: "izi: task → brd → survey-plan → scope → graph → intake → weight → ripple → design → plan → review host functions",
    description: "readText/answers/brdForm/frdForm/carried/reviewForm/budgets/orderLine/herdrStatus/newRun/checkTask/checkBrd/promote/setPending/clearPending/survey/cells/digest/reuse/remember/checkPart/buildGraph/graphMap/checkFrd/weight/ripple/values/tree/treeJoin/twin/neighbours/flows/flowsJoin/planbook/decision/planReview/planFix/planRoute/planFeedback/clearStaged/nodeFacts/frdAdopt/gate1/branch/tickets/plan/review, plus the gilb, scout, intake, designer and critic role directories (steps/brd/, steps/scope/, steps/intake/, steps/design/, steps/review/, steps/planreview/) and the izi_answer tool (pi.registerTool, not a sandbox function).",
    functions: { readText, answers, brdForm, frdForm, carried, reviewForm, budgets, orderLine, herdrStatus, newRun, checkTask, checkBrd, promote, setPending, clearPending, survey, focus, cells, digest, reuse, remember, checkPart, buildGraph, graphMap, checkFrd, weight, ripple, values, tree, treeJoin, twin, neighbours, flows, flowsJoin, planbook, decision, planReview, planFix, planRoute, planFeedback, clearStaged, nodeFacts, frdAdopt, gate1, branch, tickets, plan, review, runlogRead, runlogMark, runlogTicket, runlogPending },
    // steps/brd/ carries gilb.md, steps/scope/ carries scout.md, steps/intake/ carries intake.md and
    // steps/design/ carries designer.md (role files, named by ROLE not by step — see steps/brd/gilb.md's
    // own header) alongside their cores/orders/tests;
    // pi-extensible-workflows scans a role directory for *.md files only (validation.js
    // scanRoleFiles), so the non-.md neighbours here are inert to role resolution.
    roleDirectories: [new URL("../steps/brd/", import.meta.url), new URL("../steps/scope/", import.meta.url), new URL("../steps/intake/", import.meta.url), new URL("../steps/plan/values/", import.meta.url), new URL("../steps/plan/tree/", import.meta.url), new URL("../steps/plan/flows/", import.meta.url), new URL("../steps/review/", import.meta.url), new URL("../steps/planreview/", import.meta.url)],
  })
}
