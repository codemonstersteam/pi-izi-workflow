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
// Invariants:   every path a function receives is relative to REPO_ROOT — this repository's own
//               root, anchored to THIS FILE's location via import.meta.url, never to the pi
//               process's cwd (which need not be the repository if pi was launched elsewhere).
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
//               functions and role directory

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Type } from "typebox"
import { registerWorkflowExtension } from "pi-extensible-workflows"
import { checkTaskText } from "../steps/task/task.mjs"
import { newBrd } from "../steps/brd/brd.mjs"
import { newAnswers, looksLikeTemplate } from "../core/answers.mjs"
import { writeAnswer } from "../bin/write-answer.mjs"

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url))
const at = (p) => join(REPO_ROOT, p)
const readIfExists = (p) => (existsSync(at(p)) ? readFileSync(at(p), "utf8") : "")

// parsedAnswers — one parse of .agent/answers.md shared by `answers` and `checkBrd` below, so the
// format (core/answers.mjs) is read in exactly one place on each call, not twice per run.
function parsedAnswers(raw) {
  return raw ? newAnswers(raw) : { ok: true, value: [] }
}

const readText = {
  description: 'Read a text file relative to the repository root. A missing file reads as "".',
  input: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
  output: { type: "string" },
  run({ path }) {
    return readIfExists(path)
  },
}

const answers = {
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
  run() {
    const r = parsedAnswers(readIfExists(".agent/answers.md"))
    if (!r.ok) throw new Error(`answers: .agent/answers.md повреждён — ${r.error.detail}`)
    return r.value
  },
}

const checkTask = {
  description: "Judge TASK.md by the one-task-one-input rule (non-empty, ≤300 lines) — steps/task/task.mjs wired to disk.",
  input: { type: "object", properties: {}, additionalProperties: false },
  output: {
    type: "object",
    properties: { ok: { type: "boolean" }, why: { type: "string" }, lines: { type: "number" } },
    required: ["ok"],
    additionalProperties: false,
  },
  run() {
    if (!existsSync(at("TASK.md"))) {
      return { ok: false, why: "TASK.md не существует — вход конвейера кладёт оператор" }
    }
    const r = checkTaskText(readFileSync(at("TASK.md"), "utf8"))
    return r.ok ? { ok: true, lines: r.value.lines } : { ok: false, why: r.error.detail }
  },
}

const checkBrd = {
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
  run({ path }) {
    if (!existsSync(at(path))) {
      return { ok: false, blockers: `${path} не существует — роль ничего не записала по staging-пути` }
    }
    const text = readFileSync(at(path), "utf8")
    const task = readIfExists("TASK.md")
    const ans = parsedAnswers(readIfExists(".agent/answers.md"))
    const answerTexts = ans.ok ? ans.value.map((a) => a.text) : []
    const r = newBrd(text, [task, ...answerTexts])
    if (!r.ok) return { ok: false, blockers: r.error.detail }
    return { ok: true, requirements: r.value.requirements.length, advice: r.value.advice.map((a) => `[${a.code}] ${a.message}`) }
  },
}

const PENDING_PATH = ".agent/pending.json"

const setPending = {
  description: "Record the operator question currently open at .agent/pending.json, called just before checkpoint() pauses. izi_answer reads this file for the question key — the model never supplies it.",
  input: {
    type: "object",
    properties: { subject: { type: "string" }, evidence: { type: "string" } },
    required: ["subject"],
    additionalProperties: false,
  },
  output: { type: "object", properties: {}, additionalProperties: false },
  run({ subject, evidence }) {
    mkdirSync(dirname(at(PENDING_PATH)), { recursive: true })
    writeFileSync(at(PENDING_PATH), JSON.stringify({ subject, evidence: evidence || "" }, null, 2))
    return {}
  },
}

const clearPending = {
  description: "Remove .agent/pending.json once the operator's answer to it is confirmed present in .agent/answers.md — called after checkpoint() resolves AND the matching answer is found, never before.",
  input: { type: "object", properties: {}, additionalProperties: false },
  output: { type: "object", properties: {}, additionalProperties: false },
  run() {
    if (existsSync(at(PENDING_PATH))) rmSync(at(PENDING_PATH))
    return {}
  },
}

const promote = {
  description: "Copy staging→out. A missing staging file is a refusal (throws), never a silent success.",
  input: {
    type: "object",
    properties: { from: { type: "string" }, to: { type: "string" } },
    required: ["from", "to"],
    additionalProperties: false,
  },
  output: { type: "object", properties: { at: { type: "string" } }, required: ["at"], additionalProperties: false },
  run({ from, to }) {
    if (!existsSync(at(from))) {
      throw new Error(`promote: ${from} не существует — чек, который должен был пройти по этому пути, не исполнялся`)
    }
    mkdirSync(dirname(at(to)), { recursive: true })
    copyFileSync(at(from), at(to))
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
  async execute(_id, params) {
    if (!existsSync(at(PENDING_PATH))) {
      throw new Error("izi_answer: .agent/pending.json отсутствует — нет открытого вопроса izi, отвечать не на что")
    }
    let pending
    try {
      pending = JSON.parse(readFileSync(at(PENDING_PATH), "utf8"))
    } catch {
      throw new Error("izi_answer: .agent/pending.json повреждён — не JSON")
    }
    if (!pending || typeof pending.subject !== "string" || !pending.subject) {
      throw new Error("izi_answer: .agent/pending.json не несёт subject — писать в answers.md некуда")
    }
    if (looksLikeTemplate(params.text)) {
      throw new Error("izi_answer: текст похож на шаблон-плейсхолдер (форма «<...>»), а не на ответ оператора")
    }
    const result = writeAnswer(REPO_ROOT, { question: pending.subject, text: params.text })
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
