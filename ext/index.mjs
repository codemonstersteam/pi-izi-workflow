// MODULE_CONTRACT: ext/index.mjs — pi-extensible-workflows extension: host functions for izi's three
//               steps (task, brd, survey-plan), replacing the bin/*.mjs + shell() harness (S11), plus
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
//               promote DOES throw on a missing staging file — that is a contract violation (the
//               check gating this call ran against staging and found it, or should not have called
//               promote at all), never a silent no-op success (standards/workflow.md, «step shape
//               закрывает шаг»: staging→out precedes any "done" fact, and a promote that quietly did
//               nothing would let a run claim a fact that never happened). izi_answer follows the
//               same discipline: no .agent/pending.json means no open question, and the tool THROWS
//               rather than writing an answer nobody asked for or silently doing nothing.
// Interface:    default export — extension(pi): registers the izi_answer tool on pi AND calls
//               registerWorkflowExtension (pi-extensible-workflows contract) for the sandbox
//               functions and role directories. readText/answers/checkTask/checkBrd/promote/
//               setPending/clearPending/survey/cells/checkPart are ALSO named exports — pi-extensible-workflows never
//               exercises run(input, context) itself (it is the caller, not test scaffolding), so
//               ext/index.test.mjs imports these directly and calls run() with a fabricated
//               { run: { cwd } } context to prove the anchor without a live pi/workflow harness.

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync, readdirSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { Type } from "typebox"
import { registerWorkflowExtension, herdrAvailable, herdrPaneId, loadSettings } from "pi-extensible-workflows"
import { checkTaskText } from "../steps/task/task.mjs"
import { newBrd, parseBrd } from "../steps/brd/brd.mjs"
import { newPlan } from "../steps/survey-plan/plan.mjs"
import { newPart } from "../steps/scope/part.mjs"
import { newAnswers, looksLikeTemplate } from "../core/answers.mjs"
import { newBudgets, BUDGETS_PATH } from "../core/budgets.mjs"
import { writeAnswer } from "../bin/write-answer.mjs"

// runRoot — the anchor itself: context.run.cwd for sandbox functions, process.cwd() for izi_answer
// (no WorkflowRunContext reaches a pi tool; its caller passes ExtensionContext.cwd through instead —
// see izi_answer's own execute() below). Never THIS repository's directory (see Invariants above).
const runRoot = (context) => (context && context.run && context.run.cwd) || process.cwd()
const at = (root, p) => join(root, p)
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
  description: "Operator answers from .agent/answers.md as values ({question,text}[]), not raw text; [] when the file is absent.",
  input: { type: "object", properties: {}, additionalProperties: false },
  output: {
    type: "array",
    items: {
      type: "object",
      properties: { question: { type: "string" }, text: { type: "string" } },
      required: ["question", "text"],
      additionalProperties: false,
    },
  },
  run(_input, context) {
    const root = runRoot(context)
    const r = parsedAnswers(readIfExists(root, ".agent/answers.md"))
    if (!r.ok) throw new Error(`answers: .agent/answers.md повреждён — ${r.error.detail}`)
    return r.value
  },
}

export const checkTask = {
  description: "Judge TASK.md by the one-task-one-input rule (non-empty, ≤300 lines) — steps/task/task.mjs wired to disk.",
  input: { type: "object", properties: {}, additionalProperties: false },
  output: {
    type: "object",
    properties: { ok: { type: "boolean" }, why: { type: "string" }, lines: { type: "number" } },
    required: ["ok"],
    additionalProperties: false,
  },
  run(_input, context) {
    const root = runRoot(context)
    if (!existsSync(at(root, "TASK.md"))) {
      return { ok: false, why: "TASK.md не существует — вход конвейера кладёт оператор" }
    }
    const r = checkTaskText(readFileSync(at(root, "TASK.md"), "utf8"))
    return r.ok ? { ok: true, lines: r.value.lines } : { ok: false, why: r.error.detail }
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
  run({ path }, context) {
    const root = runRoot(context)
    if (!existsSync(at(root, path))) {
      return { ok: false, blockers: `${path} не существует — роль ничего не записала по staging-пути` }
    }
    const text = readFileSync(at(root, path), "utf8")
    const task = readIfExists(root, "TASK.md")
    const ans = parsedAnswers(readIfExists(root, ".agent/answers.md"))
    const answerTexts = ans.ok ? ans.value.map((a) => a.text) : []
    const r = newBrd(text, [task, ...answerTexts])
    if (!r.ok) return { ok: false, blockers: r.error.detail }
    return { ok: true, requirements: r.value.requirements.length, advice: r.value.advice.map((a) => `[${a.code}] ${a.message}`) }
  },
}

export const budgets = {
  description: "Run budgets from the project's izi.config.json (loops, questions, checkpointRetries). A missing file means the declared defaults; a broken one is a refusal (ok:false), never a silent default.",
  input: { type: "object", properties: {}, additionalProperties: false },
  output: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      why: { type: "string" },
      loops: { type: "number" },
      questions: { type: "number" },
      checkpointRetries: { type: "number" },
      // maxParallel is declared here as well as in core/budgets.mjs for a reason the host makes
      // unavoidable: it validates every function's OUTPUT against this schema, and
      // additionalProperties:false turns a budget missing from this list into
      // "Invalid output from budgets" — a crashed run with no hint about which key it disliked.
      // Caught by the first live launch after maxParallel was added (run 657fcd98).
      maxParallel: { type: "number" },
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
    return { ok: true, ...r.value, source: raw.trim() ? BUDGETS_PATH : "defaults" }
  },
}

// herdrStatus — наблюдаем ли прогон в herdr. Правило доступности НЕ пересказано здесь: оно
// подставлено из хоста (`herdrAvailable`/`herdrPaneId`, pi-extensible-workflows/src/herdr.ts —
// HERDR_ENV=1 И HERDR_PANE_ID И HERDR_SOCKET_PATH в окружении процесса pi), а режим
// fully-inspectable — из того же файла настроек, что читает сам @piewf/herdr (`loadSettings()`,
// ~/.pi/agent/pi-extensible-workflows/settings.json).
//
// Зачем это существует: herdr-расширение при недоступном herdr не регистрируется ВООБЩЕ
// (`registerHerdrExtension` возвращает false и молчит), поэтому прогон, запущенный из обычного
// терминала, идёт полностью вслепую и выглядит точно так же, как сломанная интеграция. Один
// печатный факт в начале прогона отличает «herdr выключен» от «herdr не работает».
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

export const setPending = {
  description: "Record the operator question currently open at .agent/pending.json, called just before checkpoint() pauses. izi_answer reads this file for the question key — the model never supplies it.",
  input: {
    type: "object",
    properties: { subject: { type: "string" }, evidence: { type: "string" } },
    required: ["subject"],
    additionalProperties: false,
  },
  output: { type: "object", properties: {}, additionalProperties: false },
  run({ subject, evidence }, context) {
    const root = runRoot(context)
    mkdirSync(dirname(at(root, PENDING_PATH)), { recursive: true })
    writeFileSync(at(root, PENDING_PATH), JSON.stringify({ subject, evidence: evidence || "" }, null, 2))
    return {}
  },
}

export const clearPending = {
  description: "Remove .agent/pending.json once the operator's answer to it is confirmed present in .agent/answers.md — called after checkpoint() resolves AND the matching answer is found, never before.",
  input: { type: "object", properties: {}, additionalProperties: false },
  output: { type: "object", properties: {}, additionalProperties: false },
  run(_input, context) {
    const root = runRoot(context)
    if (existsSync(at(root, PENDING_PATH))) rmSync(at(root, PENDING_PATH))
    return {}
  },
}

export const promote = {
  description: "Copy staging→out. A missing staging file is a refusal (throws), never a silent success.",
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
    return { at: new Date().toISOString() }
  },
}

// --- survey: дерево прогона → .agent/survey-plan.json ---------------------------------------------
//
// SKIP — граница обхода вместо каталога app/ (docs/survey-plan.md §1). Первые шесть имён — сам
// харнес: install.mjs копирует его В проект, поэтому там они принадлежат конвейеру, а не приложению.
// Принятая цена названа вслух: проект, у которого СВОЙ каталог зовётся так же, потеряет его из
// разведки.
const SKIP = new Set(["workflows", "steps", "core", "bin", "ext", "prompts",
                      "node_modules", "dist", "build", "target", "coverage"]) // + любой каталог на точку
const SKIP_FILES = new Set(["mvnw", "mvnw.cmd", "gradlew", "gradlew.bat"])    // вендоренные обёртки сборщика
const KEEP_DOTS = new Set([".github"])   // исключение из «точечные каталоги пропускаем»: там CI
const MAX_BYTES = 512 * 1024             // файл крупнее рою не читать — он и не поедет в наряд

// SPINE — хребет: где живут ответы на четыре вопроса графа (docs/survey-plan.md §1 — как тестировать,
// как менять, как выключают, как ветвятся). Имена ЭКОСИСТЕМ, не раскладка конкретного репозитория.
// Ни одно не совпало → клетки c0 нет, и это ДАННЫЕ, а не отказ: список — ускоритель, а не условие.
const SPINE = [/^pom\.xml$/, /^build\.gradle(\.kts)?$/, /^settings\.gradle(\.kts)?$/, /^gradle\.properties$/,
               /^package\.json$/, /^go\.mod$/, /^Makefile$/, /^pyproject\.toml$/,
               /resources\/application\.[^/]+$/, /(^|\/)\.env/, /(^|\/)config\//,
               /^\.github\/workflows\//, /^\.gitlab-ci\.yml$/, /^Jenkinsfile$/,
               /^README/i, /^CONTRIBUTING/i]

// walk/hitsFor — io-обвязка, юнитами не покрывается (standards/code.md: io-трубу доказывает живой
// прогон слайса). walk идёт от корня ПРОГОНА и отдаёт пути со слэшем, относительные к нему.
function walk(root, rel, out) {
  for (const e of readdirSync(at(root, rel), { withFileTypes: true })) {
    const path = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) {
      if (SKIP.has(e.name)) continue
      if (e.name.startsWith(".") && !KEEP_DOTS.has(e.name)) continue
      walk(root, path, out)
      continue
    }
    if (!e.isFile()) continue                                   // симлинк/сокет — не файл проекта
    if (SKIP_FILES.has(e.name)) continue
    const bytes = statSync(join(root, path)).size
    if (bytes > MAX_BYTES) continue
    out.push({ path, bytes })
  }
  return out
}

// Якорь ПОМЕЧАЕТ файл, а не фильтрует его: подстрока без учёта регистра, по пути И по тексту.
// Матч по границе слова проверен и отвергнут фактом — он теряет `fruits` при якоре `fruit` и
// `FruitResourceIT` целиком (docs/survey-plan.md §1).
function hitsFor(root, file, anchors) {
  if (!anchors.length) return []
  const hay = `${file.path}\n${readFileSync(at(root, file.path), "utf8")}`.toLowerCase()
  return anchors.filter((a) => hay.includes(String(a).toLowerCase()))
}

export const survey = {
  description: "Build .agent/survey-plan.json: the run's whole file tree minus the skip list, cut into scout cells. Anchors from .agent/brd.md annotate files; they never filter them.",
  input: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
  output: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      why: { type: "string" },
      files: { type: "number" },
      bytes: { type: "number" },
      cells: { type: "number" },
      gaps: { type: "array", items: { type: "string" } },
      at: { type: "string" },
    },
    required: ["ok"],
    additionalProperties: false,
  },
  run({ path }, context) {
    const root = runRoot(context)                                     // cwd ПРОГОНА, не этого репозитория
    const anchors = parseBrd(readIfExists(root, ".agent/brd.md")).subjects || []  // разбор один, из steps/brd
    const scanned = walk(root, "", [])
    const isSpine = (p) => SPINE.some((re) => re.test(p))
    const spine = scanned.filter((f) => isSpine(f.path)).map((f) => ({ path: f.path, bytes: f.bytes, subjects: [] }))
    const files = scanned.map((f) => ({ path: f.path, bytes: f.bytes, subjects: hitsFor(root, f, anchors) }))

    const r = newPlan({ files, spine, subjects: anchors })
    if (!r.ok) return { ok: false, why: r.error.detail }               // единственный отказ — no-files
    mkdirSync(dirname(at(root, path)), { recursive: true })            // пишем ПОСЛЕ решения принять
    writeFileSync(at(root, path), JSON.stringify(r.value, null, 2))
    return { ok: true, files: r.value.files, bytes: r.value.bytes, cells: r.value.cells.length,
             gaps: [...r.value.gaps], at: new Date().toISOString() }
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
  return { ok: true, cells: plan.cells }
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
    return {
      ok: true,
      cells: r.cells.map((c) => ({
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
    const r = newPart({ xml: readFileSync(at(root, path), "utf8"), cell: target })
    if (!r.ok) return { ok: false, blockers: r.error.detail }
    return { ok: true, modules: r.value.modules.length, gaps: r.value.gaps.length }
  },
}

// izi_answer — an ordinary pi TOOL (not a workflow sandbox function: this one is called by the
// INTERACTIVE session's own model, reacting to the checkpoint follow-up message that
// workflows/izi.js's askOperator() delivers into this same chat). It takes exactly one parameter,
// `text` — the operator's reply, verbatim, nothing else. The question KEY is never a model input: it
// is read from .agent/pending.json, written by the workflow's setPending() just before the pause.
// Deliberately narrow — a tool that accepted `question` as a parameter would let a distracted model
// answer the wrong open question, or invent one; this tool cannot, because it has no such parameter.
const iziAnswer = {
  name: "izi_answer",
  label: "izi: operator answer",
  description: "Record the operator's reply to the currently open izi checkpoint question in .agent/answers.md. Call with the operator's answer text, verbatim, right after they reply in this chat to a 'Workflow izi checkpoint ...' message. The question key comes from .agent/pending.json, not from you — do not pass it.",
  promptSnippet: "izi_answer({text}) — record the operator's reply to the open izi checkpoint question; the key is read from .agent/pending.json, not supplied here.",
  parameters: Type.Object({ text: Type.String({ description: "The operator's answer, verbatim — not your paraphrase, not the alternatives you offered." }) }, { additionalProperties: false }),
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
    if (!pending || typeof pending.subject !== "string" || !pending.subject) {
      throw new Error("izi_answer: .agent/pending.json не несёт subject — писать в answers.md некуда")
    }
    if (looksLikeTemplate(params.text)) {
      throw new Error("izi_answer: текст похож на шаблон-плейсхолдер (форма «<...>»), а не на ответ оператора")
    }
    const result = writeAnswer(root, { question: pending.subject, text: params.text })
    const note = result.written ? "новая запись" : "уже была записана"
    return {
      content: [{ type: "text", text: `izi_answer: записано по ключу «${pending.subject}» (${note}, всего ${result.count} в .agent/answers.md).` }],
      details: { question: pending.subject, ...result },
    }
  },
}

export default function extension(pi) {
  pi.registerTool(iziAnswer)
  registerWorkflowExtension({
    version: "1.5.0",
    headline: "izi: task → brd → survey-plan → scope host functions",
    description: "readText/answers/budgets/herdrStatus/checkTask/checkBrd/promote/setPending/clearPending/survey/cells/checkPart, plus the gilb and scout role directories (steps/brd/, steps/scope/) and the izi_answer tool (pi.registerTool, not a sandbox function).",
    functions: { readText, answers, budgets, herdrStatus, checkTask, checkBrd, promote, setPending, clearPending, survey, cells, checkPart },
    // steps/brd/ carries gilb.md and steps/scope/ carries scout.md (role files, named by ROLE not by
    // step — see steps/brd/gilb.md's own header) alongside their cores/orders/tests;
    // pi-extensible-workflows scans a role directory for *.md files only (validation.js
    // scanRoleFiles), so the non-.md neighbours here are inert to role resolution.
    roleDirectories: [new URL("../steps/brd/", import.meta.url), new URL("../steps/scope/", import.meta.url)],
  })
}
