// MODULE_CONTRACT: ext/index.mjs — pi-extensible-workflows extension: host functions for izi's two
//               steps (task, brd), replacing the bin/*.mjs + shell() harness (S11), plus (S13) the
//               izi_answer tool that lets the OPERATOR window itself carry the question→answer
//               exchange
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
//               promote at all), never a silent no-op success (standards/protocol.md, «Квитанция
//               закрывает шаг»: staging→out precedes any "done" fact, and a promote that quietly did
//               nothing would let a run claim a fact that never happened). izi_answer follows the
//               same discipline: no .agent/pending.json means no open question, and the tool THROWS
//               rather than writing an answer nobody asked for or silently doing nothing.
// Interface:    default export — extension(pi): registers the izi_answer tool on pi AND calls
//               registerWorkflowExtension (pi-extensible-workflows contract) for the sandbox
//               functions and role directory. readText/answers/checkTask/checkBrd/promote/
//               setPending/clearPending are ALSO named exports — pi-extensible-workflows never
//               exercises run(input, context) itself (it is the caller, not test scaffolding), so
//               ext/index.test.mjs imports these directly and calls run() with a fabricated
//               { run: { cwd } } context to prove the anchor without a live pi/workflow harness.

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { Type } from "typebox"
import { registerWorkflowExtension } from "pi-extensible-workflows"
import { checkTaskText } from "../steps/task/task.mjs"
import { newBrd } from "../steps/brd/brd.mjs"
import { newAnswers, looksLikeTemplate } from "../core/answers.mjs"
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
    version: "1.1.0",
    headline: "izi: task → brd host functions",
    description: "readText/answers/checkTask/checkBrd/promote/setPending/clearPending, plus the gilb role directory (steps/brd/) and the izi_answer tool (pi.registerTool, not a sandbox function).",
    functions: { readText, answers, checkTask, checkBrd, promote, setPending, clearPending },
    // steps/brd/ carries gilb.md (the role file, named by ROLE not by step — see steps/brd/gilb.md's
    // own header) alongside brd.mjs/order.tpl/step tests; pi-extensible-workflows scans a role
    // directory for *.md files only (validation.js scanRoleFiles), so the non-.md neighbours here
    // are inert to role resolution.
    roleDirectories: [new URL("../steps/brd/", import.meta.url)],
  })
}
