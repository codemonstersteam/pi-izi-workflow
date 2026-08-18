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

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, renameSync, rmSync, readdirSync, statSync } from "node:fs"
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
import { newFocus } from "../steps/focus/focus.mjs"
import { newPart, GRAMMAR_VERSION } from "../steps/scope/part.mjs"
import { readSource } from "../steps/scope/source.mjs"
import { newComputed, computedXml, parseComputed } from "../steps/scope/computed.mjs"
import { newDigest } from "../steps/scope/digest.mjs"
import { newGraph, graphXml } from "../steps/graph/graph.mjs"
import { newFrd, parseFrd, FRD_FORM } from "../steps/intake/frd.mjs"
import { newMode } from "../steps/weight/weight.mjs"
import { newRipple, blindNodes, waiverFor } from "../steps/ripple/ripple.mjs"
import { parseDesign, parseRoutes, expand, unitsByPath } from "../steps/design/design.mjs"
import { parseValues, valuesSkeleton, normalize, checkValues } from "../steps/design/values.mjs"
import { routesSkeleton, parseChains, checkChains, assemble } from "../steps/design/routes.mjs"
// `checkPart` шага 4 (часть графа) уже занимает это имя в файле — ядро шага 9 приезжает под
// псевдонимом. Одно имя на два разных вопроса было бы дефектом чтения, а не удобством.
import { partsOf, partCardOf, sectionsOf, checkPart as judgePartPlan } from "../steps/design/card.mjs"
import { coverageOf, orderOf, planDoc, gateView, readGate } from "../steps/design/plandoc.mjs"
import { newPlanIndex, KEY_QUESTION, TASK_KEY } from "../steps/plan/plan.mjs"
import { newBranch } from "../steps/branch/branch.mjs"
import { newLog, render, begin, mark, ticket, resumeAt, pending } from "../core/runlog.mjs"
import { ticketsOf, checkTickets, ticketText } from "../steps/tickets/tickets.mjs"
// attrs — тот же разбор атрибутов, каким карту читают все шаги: базлайн берёт cmd сьютов оттуда же.
import { attrs, elem } from "../core/xml.mjs"
import { newReview, parseReview, owedItems, autoFindings, askedNodes, createdNodes, CODES, CODE_CULPRIT, CODE_OWNER, OPERATOR_NOTE } from "../steps/review/review.mjs"
import { parseMap, mapMeasure, mapIndex, MAP_CAP_BYTES } from "../steps/intake/map.mjs"
import { decide, entryFor } from "../steps/scope/cache.mjs"
import { newAnswers, looksLikeTemplate, stripOrdinal } from "../core/answers.mjs"
import { newBudgets, BUDGETS_PATH, ORDER_CAP_CHARS } from "../core/budgets.mjs"
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
  run({ path }, context) {
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
const STAGING_DIR = ".agent/staging"
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
  description: "Remove .agent/pending.json once the operator's answer to it is confirmed present in .agent/answers.md — called after checkpoint() resolves AND the matching answer is found, never before.",
  input: { type: "object", properties: {}, additionalProperties: false },
  output: { type: "object", properties: {}, additionalProperties: false },
  run(_input, context) {
    const root = runRoot(context)
    if (existsSync(at(root, PENDING_PATH))) rmSync(at(root, PENDING_PATH))
    return {}
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
  description: "First act of a run: carry the PREVIOUS run's state out of the way — .agent/answers.md, .agent/pending.json and the leftovers under .agent/staging/ are MOVED into .agent/prev/ (nothing is deleted; artifacts and the .izi/parts cache are untouched). Returns what was carried, so the run can log why the operator is asked again.",
  input: { type: "object", properties: {}, additionalProperties: false },
  output: {
    type: "object",
    properties: {
      answers: { type: "number" },   // answers carried away, counted by core/answers.mjs, not by eye
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

    const raw = readIfExists(root, ANSWERS_PATH)
    // A malformed file is still carried away — counting it is what fails, not moving it. The count
    // is a number for the log; the move is what the rule is about.
    const answersCount = raw ? (newAnswers(raw).value || []).length : 0
    const pending = existsSync(at(root, PENDING_PATH))
    const staged = countFiles(at(root, STAGING_DIR))
    if (!raw && !pending && !staged) return { answers: 0, pending: false, staged: 0, dirty }

    mkdirSync(prev, { recursive: true })
    // renameSync overwrites an existing destination file, which is exactly the intent: .agent/prev/
    // holds the LAST run, not a growing pile. A directory is not overwritten, so staging's old copy
    // goes first.
    if (raw) renameSync(at(root, ANSWERS_PATH), join(prev, "answers.md"))
    if (pending) renameSync(at(root, PENDING_PATH), join(prev, "pending.json"))
    if (staged) {
      rmSync(join(prev, "staging"), { recursive: true, force: true })
      renameSync(at(root, STAGING_DIR), join(prev, "staging"))
      mkdirSync(at(root, STAGING_DIR), { recursive: true }) // the roles write into it; leave it ready
    }
    return { answers: answersCount, pending, staged, dirty }
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
      slices: v.slices.map((s) => ({ id: s.id, entry: s.entry, kind: s.kind, nodes: s.nodes.length })),
    }
    mkdirSync(dirname(at(root, FOCUS_PATH)), { recursive: true })   // written AFTER the decision to accept
    writeFileSync(at(root, FOCUS_PATH), JSON.stringify(artifact, null, 2))
    return { ok: true, why: v.why, slices: v.slices.length, entries: v.entries, chosen: v.chosen.length, cells: v.cells.length, files: v.files, estBytes: v.estBytes, droppedSlices: v.dropped.slices, droppedCells: v.dropped.cells }
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
  description: "Read .agent/appgraph.xml for step 6 and measure what it costs to hand it to a role (steps/intake/map.mjs). Above the reading ceiling the map DEGRADES to its index form — nodes, their kind and their <api>, without declarations, prose or edges — and says so in the artifact it hands over (form=\"index\"). Only an index that is itself over the ceiling is a refusal.",
  input: { type: "object", properties: {}, additionalProperties: false },
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
    },
    required: ["ok"],
    additionalProperties: false,
  },
  run(_input, context) {
    const root = runRoot(context)
    if (!existsSync(at(root, GRAPH_PATH))) {
      return { ok: false, why: `${GRAPH_PATH} не существует — шаг 5 не отработал, читать нечего` }
    }
    const text = readFileSync(at(root, GRAPH_PATH), "utf8")
    const m = mapMeasure(text)
    if (!m.overCap) return { ok: true, text, bytes: m.bytes, nodes: m.nodes, cap: MAP_CAP_BYTES }

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
    return { ok: true, text: index, bytes: mi.bytes, nodes: mi.nodes, cap: MAP_CAP_BYTES, form: "index", fullBytes: m.bytes }
  },
}
// THE GATE OF STEP 6 lives at the END of this function, and only on a GREEN check — see the block
// after `newFrd` succeeds.
export const checkFrd = {
  description: "Judge a staged FRD by steps/intake/frd.mjs::newFrd. Node keys come from .agent/appgraph.xml; a number in a field's domain or an NFR's fit must occur in TASK.md, in the VALUES of operator answers, in a BRD requirement's fit or verify, or in the map itself. When .agent/review.xml carries a Reject, its blockers travel in as `rewind` for F9: a `goal-not-delivered` whose evidence no longer resolves in the new FRD is refused — the subject of a rewind is not repaired by deleting it. AFTER a green check, and only then, the gate: a node of the change's width that no suite of the repository executes (steps/ripple/ripple.mjs::blindNodes) is asked about the OPERATOR — ok:false with ask:true carries the questions verbatim; an answer `suite` or `drop` comes back as ok:false with stop:true, `accept` as ok:true with waived:N.",
  input: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
  output: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
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
  run({ path }, context) {
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
    const fits = parseBrd(readIfExists(root, ".agent/brd.md")).requirements.map((r) => `${r.fit || ""}\n${r.verify || ""}`).join("\n")
    // Числа судятся только на staging: пустой список источников гасит ветку invented-default в
    // steps/intake/frd.mjs::provenance, а словарь допустимых `source` остаётся в силе для обоих.
    const sources = judgingStaged
      ? [readIfExists(root, TASK_PATH), ...(ans.ok ? ans.value.map((a) => a.text) : []), fits, mapText]
      : []

    const map = parseMap(mapText)
    // F9's input: a rewind exists only when the LAST review Rejected — band() only rewinds to step 6
    // after review() wrote that verdict (docs/review.md §6), and .agent/review.xml is what carries it.
    // A Pass, or no verdict at all (first attempt, or a run that never reached step 11), means this is
    // not a rewind: rewind stays [] and F9 (steps/intake/frd.mjs) is as silent as F5 with no sources.
    const lastReview = parseReview(readIfExists(root, REVIEW_PATH))
    const rewind = lastReview.verdict === "Reject" ? lastReview.blockers.map((b) => ({ code: b.code, node: b.node, evidence: b.evidence })) : []
    const r = newFrd({ xml: readFileSync(at(root, path), "utf8"), nodes: map.nodes, tests: map.tests, entries: map.entries, edges: map.edges, sources, rewind })
    if (!r.ok) return { ok: false, blockers: r.error.detail }
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
    const blind = blindNodes({ frd: v, map })
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
    const r = newRipple({ xml, frd: parseFrd(readFileSync(at(root, FRD_PATH), "utf8")), mode, map })
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

export const design = {
  description: "Step 9 in two passes: A the dictionary, B the chains. Without arguments: the GATE — read .agent/design (needed|skip) and erase every artifact of the step that is not green NOW, so no previous run's dictionary can survive. With `skeleton`: COMPOSE the artifact and write it to that staging path — one row per end of every use case (its `closes` token already filled in, and the text of a failure branch already written as «status code»), then one row per `<api>` and `<decl kind=method>` of every node of the change, copied verbatim out of .agent/ripple.xml. Costs no tokens and decides the whole composition: how many rows there are, what each closes, in what order, under what id. With `path`: the CHECK — recompute that skeleton and judge what the role staged against it (a row lost or added, an end re-attributed, a text the script prefilled edited, a text left blank), and on green strip the scaffolding and promote to .agent/values.xml.",
  input: {
    type: "object",
    properties: { pass: { type: "string", enum: ["values", "chains"] }, path: { type: "string" }, skeleton: { type: "string" } },
    additionalProperties: false,
  },
  output: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      why: { type: "string" },
      design: { type: "string" },
      reused: { type: "array", items: { type: "string" } },
      values: { type: "number" },
      // What the composition cost the role: `rows` in the skeleton, `filled` of them written by the
      // script, `blank` left to name. The three are printed by the workflow and are the only place a
      // run can see how much of pass A a role was actually asked for.
      rows: { type: "number" },
      filled: { type: "number" },
      blank: { type: "number" },
      chains: { type: "number" },
      nodes: { type: "number" },
      units: { type: "number" },
      // `unstepped` — узлы изменения, через которые не прошла ни одна цепочка. Их `dod` пуст, а
      // тикет без определения готовности исполнителю закрыть нечем (живой прогон d8ef8c60). Это
      // ЧИСЛО, которое печатает воркфлоу, а не вердикт: правило на него заводится по замеру, а не
      // по догадке.
      unstepped: { type: "array", items: { type: "string" } },
      blockers: { type: "string" },
      // `missing` — the role wrote NOTHING to the staging path. It is told apart from every other
      // refusal because the caller spends a different budget on it: there is no artifact to repair,
      // so no round of the repair budget is charged (workflows/izi.js::designing, live run a900de7b).
      // A boolean, not a regex over the blocker's Russian sentence — a rule read by matching another
      // module's prose is the same rule written twice (standards/code.md §1).
      missing: { type: "boolean" },
    },
    required: ["ok"],
    additionalProperties: false,
  },
  run({ pass = "values", path, skeleton } = {}, context) {
    const root = runRoot(context)
    const read = (p) => readFileSync(at(root, p), "utf8")
    const drop = (...ps) => { for (const p of ps) if (existsSync(at(root, p))) rmSync(at(root, p)) }

    if (!path && !skeleton) {
      if (!existsSync(at(root, DESIGN_PATH))) {
        return { ok: false, why: `${DESIGN_PATH} не существует — шаг 8 ripple не отработал, решать про дизайн нечем` }
      }
      const flag = read(DESIGN_PATH).trim()
      if (flag !== "needed" && flag !== "skip") {
        return { ok: false, why: `${DESIGN_PATH} содержит «${flag}» — допустимо needed | skip; артефакт из другой версии грамматики` }
      }
      // THE DELIVERABLE NEVER SURVIVES THE GATE, and this is not the same rule as the dictionary's.
      // It is the artifact of pass B, whose own input — the staged chains — is deliberately not
      // promoted: a green B assembles the pair in the same breath, so there is nothing for the chains
      // to survive INTO. Reaching the gate at all therefore means pass B has to run again, and
      // yesterday's pair would otherwise be planned on by step 10. `.agent/design-nodes.xml` goes with
      // them: no code writes it any more, and a copy left by an older version of this pipeline would
      // be read as this run's answer.
      drop(NODES_PATH, DESIGN_GRAPH_PATH, DATA_FLOW_PATH)
      if (flag === "skip") { drop(VALUES_PATH); return { ok: true, design: flag } }

      if (!existsSync(at(root, FRD_PATH)) || !existsSync(at(root, RIPPLE_PATH))) {
        return { ok: false, why: `${FRD_PATH} или ${RIPPLE_PATH} не существует — судить, что из дизайна ещё живо, не по чему` }
      }
      const values = greenValues(root)
      if (!values) drop(VALUES_PATH)
      return { ok: true, design: flag, reused: values ? ["values"] : [] }
    }

    // MODE_PATH is demanded here and not only where it is read: the assembled graph types itself with
    // the weight of step 7, and a deliverable that says mode="" is not a smaller deliverable — it is
    // one whose weight step 11 and the operator cannot read at all.
    for (const [p, why] of [[FRD_PATH, "шаг 6 intake не отработал"], [RIPPLE_PATH, "шаг 8 ripple не отработал"], [MODE_PATH, "шаг 7 weight не отработал"]]) {
      if (!existsSync(at(root, p))) return { ok: false, blockers: `${p} не существует — ${why}, судить дизайн не по чему` }
    }

    // COMPOSE. The skeleton is written to STAGING and to nowhere else: it is not an artifact of the
    // step, it is the form of the answer, and the role's job is to hand back this same file with the
    // blank texts filled. Writing it here rather than embedding it in the order is what makes «верни
    // файл по этому пути» the whole instruction — the role edits a file it can read, and the check
    // below compares it with a skeleton recomputed from the same two inputs.
    if (skeleton) {
      if (pass === "chains") {
        const values = greenValues(root)
        if (!values) return { ok: false, blockers: `${VALUES_PATH} не зелен — проход A не закрыт, а цепочка говорит id словаря` }
        const s = routesSkeleton({ frd: frdOf(root), values })
        mkdirSync(dirname(at(root, skeleton)), { recursive: true })
        writeFileSync(at(root, skeleton), `${s.xml}\n`)
        return { ok: true, chains: s.chains, blank: s.blank }
      }
      const s = valuesSkeleton({ frd: frdOf(root), ripple: read(RIPPLE_PATH) })
      mkdirSync(dirname(at(root, skeleton)), { recursive: true })
      writeFileSync(at(root, skeleton), `${s.xml}\n`)
      return { ok: true, rows: s.rows, filled: s.filled, blank: s.blank }
    }

    if (!existsSync(at(root, path))) {
      return { ok: false, missing: true, blockers: `${path} не существует — роль ничего не записала по staging-пути. Артефакт прохода это ФАЙЛ по этому пути: запиши его инструментом write и только после этого верни track:"ok"` }
    }

    // JUDGE ON STAGING, PROMOTE ONLY AFTER GREEN (standards/workflow.md). A red pass leaves its
    // staging file where it is — that file is the evidence the operator diagnoses from, and it is
    // also what the next round's order carries back to the role.
    const staged = read(path)

    // PASS B: the chains are judged, and a green set is ASSEMBLED in the same breath. The working
    // artifact is never promoted — the deliverable IS the promotion, exactly as it was before the
    // three-pass construction: there is nothing for the chains to survive into.
    if (pass === "chains") {
      const values = greenValues(root)
      if (!values) return { ok: false, blockers: `${VALUES_PATH} не зелен — проход A не закрыт, а цепочка говорит id словаря` }
      const frd = frdOf(root)
      // The map's edges are NOT read here any more: the only rule that wanted them judged the ORDER
      // OF WORK, and a chain does not decide the order (D42). The guardrail is three structural rules
      // over the skeleton and the dictionary, and both of them are already in hand.
      const bad = checkChains({ staged, frd, values })
      if (bad.length) return { ok: false, blockers: bad.join("\n  ") }

      const built = assemble({ chains: parseChains(staged), values, frd, ripple: read(RIPPLE_PATH), mode: read(MODE_PATH).trim() })
      writeFileSync(at(root, DESIGN_GRAPH_PATH), `${built.xml}\n`)
      // The flow is expanded out of the ASSEMBLED graph, never out of the chains: one reader, the same
      // one steps 10 and 14 use, so the deliverable cannot disagree with itself.
      const flow = expand(parseDesign(built.xml), parseRoutes(built.xml))
      writeFileSync(at(root, DATA_FLOW_PATH), `${flow}\n`)
      rmSync(at(root, path))
      return { ok: true, nodes: built.nodes, units: built.units, unstepped: [...built.unstepped] }
    }

    const blockers = checkValues({ staged, frd: frdOf(root), ripple: read(RIPPLE_PATH) })
    if (blockers.length) return { ok: false, blockers: blockers.join("\n  ") }

    // The scaffolding the role read (`side`, `end`, `src`, `form`) is stripped on the way out: a later
    // pass reads `<value id text closes/>` and must never be able to judge by the requirement's prose
    // instead of by the name (steps/design/values.mjs::normalize).
    const values = parseValues(staged)
    mkdirSync(dirname(at(root, VALUES_PATH)), { recursive: true })
    writeFileSync(at(root, VALUES_PATH), `${normalize(staged)}\n`)
    rmSync(at(root, path))
    return { ok: true, values: values.size }
  },
}

// --- parts: the change as a tree of modules, cut into partitions ----------------------------------
// Phases ①②③ of step 9 (steps/design-data-flow.md), and all three cost no tokens. The partition is
// the unit of ONE role call, and its invariant — every module in exactly one partition — is what
// makes a duplicate impossible: no two calls can decide one file. The card of each partition is
// written here so the workflow only reads it.
const PARTS_DIR = ".agent/staging/parts"

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

export const parts = {
  description: "Step 9, phases ①②③: read .agent/frd.xml for the COMPOSITION of the change (the modules its scenarios name), enrich it from .agent/ripple.xml with what the repository knows (deps, level, whether the file exists at all), then cut the modules into PARTITIONS — the connected components of «some use case reaches both». Every module lands in exactly one partition, which is what makes two decisions of one file impossible. Writes one card per partition to .agent/staging/parts/<slug>.txt: the partition's modules, every use case that touches them verbatim, what those modules call today, a SAMPLE by path, the check command and the draft contract of pass 9B. Costs no tokens. Measured: eddi 13 modules (7 created) → 3 partitions, cards 8,9-15,3 KB against the 126 KB the map and the FRD weigh together.",
  input: { type: "object", properties: {}, additionalProperties: false },
  output: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      why: { type: "string" },
      ask: { type: "boolean" },
      subject: { type: "string" },
      at: { type: "string" },
      modules: { type: "number" },
      created: { type: "number" },
      chars: { type: "number" },
      parts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            slug: { type: "string" },
            modules: { type: "number" },
            ucs: { type: "number" },
            neighbours: { type: "number" },
          },
          required: ["slug", "modules", "ucs", "neighbours"],
          additionalProperties: false,
        },
      },
    },
    required: ["ok"],
    additionalProperties: false,
  },
  run(_ = {}, context) {
    const root = runRoot(context)
    if (!existsSync(at(root, FRD_PATH))) {
      return { ok: false, why: `${FRD_PATH} не существует — шаг 6 intake не отработал, планировать нечего` }
    }
    // The map is DEMANDED: without it a card has no facts, no sample and no check command, and a role
    // handed that would invent the repository instead of reading it.
    if (!existsSync(at(root, GRAPH_PATH))) {
      return { ok: false, why: `${GRAPH_PATH} не существует — шаг 5 graph не отработал, карточке нечего показать про репозиторий` }
    }
    // The key is asked BEFORE the first role call, because every deliverable of this step lands under
    // it: a plan written to a directory nobody named is a plan nobody finds.
    const dir = taskDir(root)
    if (!dir) return { ok: false, ask: true, subject: KEY_QUESTION }

    const frd = parseFrd(readFileSync(at(root, FRD_PATH), "utf8"))
    const map = readFileSync(at(root, GRAPH_PATH), "utf8")
    const tree = partsOf({ frd, ripple: readIfExists(root, RIPPLE_PATH) })
    if (!tree.parts.length) return { ok: false, why: "ни один сценарий FRD не называет узлов — состав изменения пуст" }

    mkdirSync(at(root, PARTS_DIR), { recursive: true })
    let chars = 0
    for (const one of tree.parts) {
      const c = partCardOf({ part: one, frd, map, graph: readIfExists(root, DESIGN_GRAPH_PATH) })
      writeFileSync(at(root, `${PARTS_DIR}/${one.slug}.txt`), c.text)
      chars = Math.max(chars, c.chars)
    }
    return {
      ok: true,
      at: dir,
      modules: tree.modules.size,
      created: [...tree.modules.values()].filter((m) => m.new).length,
      chars,
      parts: tree.parts.map((x) => ({ slug: x.slug, modules: x.modules.length, ucs: x.ucs.length, neighbours: x.neighbours.length })),
    }
  },
}

// --- part: the plan of ONE partition, judged and promoted -----------------------------------------
// Phase ⑤. The partition is RECOMPUTED here rather than carried: it is a pure function of artifacts
// already on disk, so the judgement cannot drift from the card the role was actually given.
export const part = {
  description: "Step 9, phase ⑤: judge the plan a role staged for ONE partition and, on green, promote it to docs/design/<slug>.md. Five structural rules — a section per module of the partition, not one module of another partition, every use case shown as closed by step («закрывает: UC1 шаг 1»), every section carrying «проверка» and «зовёт» (paths or the word «нет»), and every declared call resolving to a module of the change or a file of the map. What the plan MEANS is read by a human at the gate. Costs no tokens.",
  input: {
    type: "object",
    properties: { slug: { type: "string" }, path: { type: "string" } },
    additionalProperties: false,
  },
  output: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      why: { type: "string" },
      blockers: { type: "string" },
      missing: { type: "boolean" },
      modules: { type: "number" },
      ucs: { type: "number" },
      calls: { type: "number" },
      at: { type: "string" },
    },
    required: ["ok"],
    additionalProperties: false,
  },
  run({ slug = "", path = "" } = {}, context) {
    const root = runRoot(context)
    if (!existsSync(at(root, FRD_PATH)) || !existsSync(at(root, GRAPH_PATH))) {
      return { ok: false, why: `${FRD_PATH} или ${GRAPH_PATH} не существует — план партии судить не по чему` }
    }
    const frd = parseFrd(readFileSync(at(root, FRD_PATH), "utf8"))
    const map = readFileSync(at(root, GRAPH_PATH), "utf8")
    const one = partsOf({ frd, ripple: readIfExists(root, RIPPLE_PATH) }).parts.find((x) => x.slug === slug)
    if (!one) return { ok: false, why: `партии «${slug}» нет в разбиении — её модулей в изменении не осталось` }

    if (!existsSync(at(root, path))) {
      return { ok: false, missing: true, blockers: `${path} не существует — роль ничего не записала по staging-пути. Артефакт это ФАЙЛ по этому пути: запиши его инструментом write и только после этого верни track:"ok"` }
    }
    const staged = readFileSync(at(root, path), "utf8")
    // ТЕКСТЫ ШАГОВ — вход правила 6: владелец шага обязан звать модуль, о котором шаг говорит. FRD
    // здесь уже открыт, и второго разбора не заводится.
    const stepTexts = {}
    for (const u of frd.usecases || []) {
      ;(u.steps || []).forEach((t, k) => { stepTexts[`${u.id}/${k + 1}`] = String(t) })
      for (const e of u.exts || []) stepTexts[`${u.id}/${e.id}`] = `${e.error || ""} ${e.outcome || ""}`.trim()
    }
    const bad = judgePartPlan({ text: staged, part: one, known: knownPaths(map), texts: stepTexts })
    if (bad.length) return { ok: false, blockers: bad.join("\n  ") }

    // Promoted OUT of `.agent/`, under the task's own directory (see taskDir).
    const dir = taskDir(root)
    if (!dir) return { ok: false, why: "ключ задачи не отвечен — класть решение партии некуда" }
    mkdirSync(at(root, `${dir}/design`), { recursive: true })
    const out = `${dir}/design/${slug}.md`
    writeFileSync(at(root, out), staged.endsWith("\n") ? staged : `${staged}\n`)
    rmSync(at(root, path))
    const sections = sectionsOf(staged)
    return { ok: true, at: out, modules: sections.length, ucs: one.ucs.length, calls: sections.reduce((n, x) => n + x.calls.length, 0) }
  },
}


// --- planbook: phases ⑥⑦⑧ — is the requirement covered, in what order, and the one document ------
// The last three phases of step 9, and none of them costs a token. Coverage is a comparison of two
// sets of numbers (the FRD numbers its steps, the role names them); the order is the topological sort
// of what the plans DECLARE; the document is the sections copied verbatim, in that order.
//
// A REFUSAL HERE REMOVES PLAN.md, for the same reason step 10's refusal removes its index: yesterday's
// plan surviving today's hole is a gate approving work that no longer matches the requirement.


export const planbook = {
  description: "Step 9, phases ⑥⑦⑧: read every docs/design/<slug>.md a partition promoted, check that the requirement is covered whole (every module planned, every use case named, every step and failure branch closed), order the modules by what the plans DECLARE in «зовёт:» plus the map's static edges between existing files, and assemble PLAN.md — the header of counts and every section verbatim in the order of work. Refuses with the holes named, or with the circle's modules named, and REMOVES PLAN.md on any refusal. Costs no tokens.",
  input: { type: "object", properties: {}, additionalProperties: false },
  output: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      why: { type: "string" },
      blockers: { type: "string" },
      cycle: { type: "string" },
      // The partitions a refusal implicates: the rail re-delegates THEM, with the blocker as
      // feedback. Without it a hole in the coverage is an escalation, though the role that wrote the
      // section is the one who can name what closes the step.
      guilty: { type: "array", items: { type: "string" } },
      modules: { type: "number" },
      sections: { type: "number" },
      ucs: { type: "number" },
      at: { type: "string" },
    },
    required: ["ok"],
    additionalProperties: false,
  },
  run(_ = {}, context) {
    const root = runRoot(context)
    const dir = taskDir(root)
    if (!dir) return { ok: false, why: "ключ задачи не отвечен — план класть некуда" }
    const PLAN_DOC = `${dir}/PLAN.md`
    const drop = () => { if (existsSync(at(root, PLAN_DOC))) rmSync(at(root, PLAN_DOC)) }
    if (!existsSync(at(root, FRD_PATH)) || !existsSync(at(root, GRAPH_PATH))) {
      drop()
      return { ok: false, why: `${FRD_PATH} или ${GRAPH_PATH} не существует — план собирать не из чего` }
    }
    const frd = parseFrd(readFileSync(at(root, FRD_PATH), "utf8"))
    const map = readFileSync(at(root, GRAPH_PATH), "utf8")
    const { modules, parts: cut } = partsOf({ frd, ripple: readIfExists(root, RIPPLE_PATH) })

    // The plans are read from the DELIVERABLES, not from staging: what a partition promoted is what
    // the gate reads, and assembling anything else would document work nobody approved.
    const sections = []
    const lost = []
    for (const one of cut) {
      const doc = readIfExists(root, `${dir}/design/${one.slug}.md`)
      if (!doc) { lost.push(one.slug); continue }
      for (const x of sectionsOf(doc)) sections.push(x)
    }
    if (lost.length) {
      drop()
      return { ok: false, why: `нет плана партий: ${lost.join(", ")} — фаза ④ по ним не отработала` }
    }

    // Which partition answers for what: a module belongs to exactly one, and a use case to every
    // partition its modules touch. This is the same invariant that makes a duplicate impossible,
    // used the other way round — to address a refusal.
    const ownerOf = new Map()
    for (const one of cut) for (const m of one.modules) ownerOf.set(m, one.slug)
    const blame = (text) => cut.filter((one) =>
      one.modules.some((m) => text.includes(m)) || one.ucs.some((u) => new RegExp(`\\b${u}\\b`).test(text))).map((x) => x.slug)

    const holes = coverageOf({ frd, modules, sections })
    if (holes.length) { drop(); return { ok: false, blockers: holes.join("\n  "), guilty: [...new Set(holes.flatMap(blame))] } }

    const { order, cycle } = orderOf({ sections, modules, edges: parseMap(map).edges })
    if (cycle.length) {
      drop()
      return {
        ok: false,
        cycle: cycle.join(" → "),
        guilty: [...new Set(cycle.map((m) => ownerOf.get(m)).filter(Boolean))],
        blockers: `очередь работ не строится: ${cycle.map((m) => m.split("/").pop()).join(" → ")} замкнуты в круг строками «зовёт:». Разорви круг: у одного из них вызов другого — не зависимость сборки, а обратный вызов. Убери его из «зовёт» того модуля, который пишется ПЕРВЫМ, и опиши связь словами в «что это». Полные пути: ${cycle.join(" → ")}`,
      }
    }

    mkdirSync(at(root, dir), { recursive: true })
    writeFileSync(at(root, PLAN_DOC), `${planDoc({ frd, sections, order, modules })}\n`)
    return {
      ok: true,
      at: PLAN_DOC,
      modules: modules.size,
      sections: sections.length,
      ucs: (frd.usecases || []).length,
    }
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
  description: "Step 12: show the operator the plan and record the decision. Without an answer on disk: ok:false with ask:true and the PRESENTATION as the question — the goal from the FRD, the partitions with their use case ids and module counts, what is written first and why, the check commands, the branch. With an answer: approve writes .agent/gate1.json (the task key, a sha256 of PLAN.md and the decision), «rework: <текст>» returns the operator's words for step 6, stop ends the band. An unrecognised answer is a blocker naming the three words. A VALID TOKEN IS HONOURED: when .agent/gate1.json already carries this key, this plan's sha256 and approve, the operator is not asked again (ok:true with kept:true) — the answer lives in .agent/answers.md, which newRun carries into .agent/prev/ before the band starts. Costs no tokens.",
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
    const { modules, parts: cut } = partsOf({ frd, ripple: readIfExists(root, RIPPLE_PATH) })
    const sections = cut.flatMap((one) => sectionsOf(readIfExists(root, `task/${key}/design/${one.slug}.md`)))
    const { order } = orderOf({ sections, modules, edges: parseMap(map).edges })
    const view = gateView({ frd, modules, parts: cut, sections, order, key, base: gitTrunk(root) })

    // The presentation IS the question: an answer is recognised by the question's text (core/answers.mjs),
    // so the operator's word is bound to the plan they were shown, not to the plan that exists now.
    const said = parsedAnswers(readIfExists(root, ANSWERS_PATH))
    const hit = (said.ok ? said.value : []).find((a) => String(a.question || "").trim() === view.trim())
    if (!hit) return { ok: false, ask: true, subject: view }

    const decision = readGate(hit.text)
    if (decision.kind === "stop") return { ok: false, stop: true, why: "оператор остановил полосу на гейте 1" }
    if (decision.kind === "rework") return { ok: false, rework: decision.comment }
    if (decision.kind !== "approve") {
      return { ok: false, blockers: `ответ «${String(hit.text).slice(0, 60)}» не разобран — ответь одним из трёх: approve · rework: <что не так> · stop` }
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
const runlogPut = (root, log) => {
  const text = render(log)
  if (!text.ok) throw new Error(`журнал не записывается: ${text.error.detail}`)
  mkdirSync(at(root, ".agent"), { recursive: true })
  writeFileSync(at(root, RUNLOG_PATH), text.value)
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
  output: { type: "object", properties: { at: { type: "string" }, sealed: { type: "number" } }, required: ["at"], additionalProperties: false },
  run({ step, name = "", unit = "", status, note = "", artifacts = [] }, context) {
    const root = runRoot(context)
    const at_ = stamp()
    const prints = (artifacts || [])
      .filter(Boolean)
      .map((path) => ({ path, sha256: existsSync(at(root, path)) ? sha256(readFileSync(at(root, path), "utf8")) : "" }))
    const log = mark(begin(runlogNow(root), { key: taskKey(root), at: at_ }), { step, name, unit, status, at: at_, note, artifacts: prints })
    runlogPut(root, log)
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
  output: { type: "object", properties: { at: { type: "string" } }, required: ["at"], additionalProperties: false },
  run({ id, wave = 0, status, note = "" }, context) {
    const root = runRoot(context)
    const at_ = stamp()
    runlogPut(root, ticket(runlogNow(root), { id, wave, status, at: at_, note }))
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
  description: "Step 14: cut the approved plan into implementer tickets. Two kinds: a TEST ticket per «module × use case» (the checks come from the FRD's own steps, failure branches and their codes) and a MODULE ticket per section of the plan, which waits for its tests and may not write into their files. Every step of the requirement gets exactly one owner — the module through which it is observable, decided by the declared «зовёт» edges, never by guessing what kind of module it is. Writes task/<KEY>/tickets/<NN>-<name>.md and returns the wave layout step 15 dispatches by. Six structural rules; no role, no tokens.",
  input: { type: "object", properties: {}, additionalProperties: false },
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
    },
    required: ["ok"],
    additionalProperties: false,
  },
  run(_ = {}, context) {
    const root = runRoot(context)
    const key = taskKey(root)
    if (!key) return { ok: false, why: "ключ задачи не отвечен — тикеты класть некуда" }

    const gate = readIfExists(root, GATE_PATH)
    if (!gate) return { ok: false, why: `${GATE_PATH} не существует — план не утверждён, резать тикеты рано` }
    if (!existsSync(at(root, FRD_PATH)) || !existsSync(at(root, GRAPH_PATH))) {
      return { ok: false, why: `${FRD_PATH} или ${GRAPH_PATH} не существует` }
    }

    const frd = parseFrd(readFileSync(at(root, FRD_PATH), "utf8"))
    const map = readFileSync(at(root, GRAPH_PATH), "utf8")
    const { modules, parts: cut } = partsOf({ frd, ripple: readIfExists(root, RIPPLE_PATH) })
    const sections = cut.flatMap((one) => sectionsOf(readIfExists(root, `task/${key}/design/${one.slug}.md`)))
    if (!sections.length) return { ok: false, why: `в task/${key}/design нет ни одного раздела — шаг 9 не отработал` }

    const { order, cycle } = orderOf({ sections, modules, edges: parseMap(map).edges })
    if (cycle.length) return { ok: false, why: `очередь работ замкнута: ${cycle.join(" → ")} — артефакты разошлись с утверждённым планом` }

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

    const list = ticketsOf({
      sections, order, frd, key,
      branch: (() => { try { return JSON.parse(readIfExists(root, BRANCH_PATH) || "{}").name || "" } catch { return "" } })(),
      match: suite.match || "*",
      testDir: suite.path || "",
      // Карта — словарь путей, которые в репозитории ЕСТЬ: по нему отсеивается проза из строки
      // «по образцу», и по нему же судит седьмое правило гардрейла.
      known: parseMap(map).nodes,
      outer,
      build,
      samples,
    })
    const bad = checkTickets({ tickets: list, sections, frd, known: parseMap(map).nodes })
    if (bad.length) return { ok: false, blockers: bad.join("\n  ") }

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
    return {
      ok: true,
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
  description: "The blocker vocabulary AND the checklist of step 11, as data. `codes` from steps/review/review.mjs; `owed` — one row per thing the plan owes the FRD, with a machine-generated id the role copies rather than composes (owedItems); `unchecked` — the nodes R6 asks about (steps/review/review.mjs::askedNodes, the SAME expression the rule counts by), each with the commands of the scenarios that close it, followed by one line per set the rule does NOT judge: the nodes this change creates (createdNodes) and the nodes whose unverifiability the operator accepted at step 6's gate. The order SUBSTITUTES all three; a role that had to recall the FRD's contents instead answered as a whole, and three defects passed unremarked (live run c64dbd32).",
  input: { type: "object", properties: {}, additionalProperties: false },
  output: {
    type: "object",
    properties: { codes: { type: "string" }, owed: { type: "string" }, unchecked: { type: "string" } },
    required: ["codes"],
    additionalProperties: false,
  },
  run(_args, context) {
    const root = runRoot(context)
    const codes = CODES.join(" | ")
    // The form is asked for BEFORE the two artifacts necessarily exist (a unit calls it bare), so
    // absence is an empty checklist, never a throw: the refusal on a missing plan belongs to
    // review({path}), which is the function that judges.
    let plan = null
    try { plan = JSON.parse(readFileSync(at(root, PLAN_INDEX_PATH), "utf8")) } catch { plan = null }
    const frd = existsSync(at(root, FRD_PATH)) ? parseFrd(readFileSync(at(root, FRD_PATH), "utf8")) : null
    if (!plan || !frd) return { codes, owed: "(нет плана или FRD — чек-лист пуст)", unchecked: "—" }

    const owed = owedItems(frd, plan).map((r) => `${r.id} — ${r.what}`).join("\n")
    const byId = new Map((plan.nodes || []).map((n) => [n.id, n]))
    // WHAT THE ORDER ASKS IS WHAT THE RULE COUNTS — one expression, `askedNodes`, imported from the
    // module that judges (steps/review/review.mjs). The two written separately is D23: the order
    // stopped naming the node this change CREATES while R6 went on judging it, and a role that
    // answered the order verbatim got `R6 узел …/fruit-card.html без своей команды`.
    const said = parsedAnswers(readIfExists(root, ANSWERS_PATH))
    const answers = said.ok ? said.value : []
    const waived = (plan.nodes || [])
      .filter((n) => waiverFor({ node: n.id, answers }).word === "accept")
      .map((n) => n.id)
    const unchecked = askedNodes({ plan, answers })
      .map((n) => {
        const cmds = (n.coveredBy || []).flatMap((s) => ((byId.get(s) || {}).check || []).map((c) => c.cmd))
        // The node's OWN units travel beside the candidate commands. Without them the question reads
        // «does one of these commands execute this id», and an id executes nothing — live run
        // d8ef8c60 answered it with `<witness cmd="mvn verify -Pnative"/>` for an HTML page, a
        // command that passes the machine check (it is the scenario's) and opens no page at all.
        const dod = (n.dod || []).map((u, i) => `\n      ${i + 1}. ${u}`).join("")
        return `${n.id} — своей команды нет; закрывают: ${cmds.length ? cmds.join(" · ") : "ничто"}${dod ? `\n    делает:${dod}` : ""}`
      }).join("\n")
    // Said out loud instead of silently missing: the operator's decision is part of what the critic is
    // looking at, and a node that vanished from the list with no explanation reads as an oversight.
    const note = waived.length ? `\nневерифицируемость этих узлов принята оператором на шаге 6: ${waived.join(" · ")}` : ""
    // The second such line, and it exists for the same reason: a created node is absent from the list
    // BY THE RULE (askedNodes), not by an oversight, and the role is told so in the words of the fact —
    // step 16 measures a created node, not step 11.
    const created = createdNodes({ plan }).map((n) => n.id)
    const born = created.length
      ? `\nэти узлы изменение СОЗДАЁТ — своей команды у них нет по построению (карта старше файла), и witness про них не спрашивают: наблюдаемость нового узла меряет шаг 16 фактом «команда была красной до и зелёной после». Блокер unverifiable-node на них не пишется: ${created.join(" · ")}`
      : ""
    return { codes, owed: owed || "(пусто)", unchecked: `${unchecked || "—"}${note}${born}` }
  },
}

export const review = {
  description: "Step 11. Judge the staged verdict of the role `critic` by steps/review/review.mjs::newReview: the verdict agrees with its body, every code is in the vocabulary, every `node` resolves to a node of .agent/plan-index.json and every `evidence` to the kind of fact its code takes. ERASES .agent/review.xml before judging, and on a green FORM promotes the staged file — for a Reject too, since its blockers are what the band repairs from. Returns the blockers with the culprit artifact and the OWNING STEP derived from each code, so the caller can route the repair without parsing prose.",
  input: { type: "object", properties: { path: { type: "string" } }, additionalProperties: false },
  output: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      verdict: { type: "string" },
      blockers: { type: "string" },
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
    for (const [p, why] of [[PLAN_INDEX_PATH, "шаг 10 plan не отработал"], [FRD_PATH, "шаг 6 intake не отработал"]]) {
      if (!existsSync(at(root, p))) return { ok: false, blockers: `${p} не существует — ${why}, судить план не по чему` }
    }

    let plan = null
    try {
      plan = JSON.parse(readFileSync(at(root, PLAN_INDEX_PATH), "utf8"))
    } catch (e) {
      // A tool failure is not data (standards/code.md, constraint 4): a plan that does not parse is
      // named as such, never read as "a plan with no nodes".
      return { ok: false, blockers: `${PLAN_INDEX_PATH} не разбирается как JSON: ${String((e && e.message) || e)}` }
    }

    const frd = parseFrd(readFileSync(at(root, FRD_PATH), "utf8"))
    // The map is R6's reachability operand — which tests can observe a node. It is not demanded:
    // a run whose map is missing loses that half of the rule and keeps the rest, the same way
    // `checkRoutes` of step 9 reads a missing map as no edges rather than as a refusal.
    const mapPath = at(root, GRAPH_PATH)
    const map = existsSync(mapPath) ? parseMap(readFileSync(mapPath, "utf8")) : null
    // The operator's waivers from step 6's gate, read by THE reader of that file — the same call
    // `plan` makes for the task key. A node answered `accept` is not judged by R6 at all.
    const said = parsedAnswers(readIfExists(root, ANSWERS_PATH))
    const r = newReview({ xml: readFileSync(at(root, path), "utf8"), plan, frd, map, answers: said.ok ? said.value : [] })
    if (!r.ok) return { ok: false, blockers: r.error.detail }

    // The findings that cost no role call at all, merged AFTER the form was judged: R1 keeps judging
    // the role's own file (a Pass carrying a blocker is still a contradiction in it), and a script
    // finding then turns the RESULT to Reject regardless. An open question that reached the plan is
    // a fact, and a fact does not need a model to notice it (docs/concept.md, rule 3).
    const auto = autoFindings({ frd }).map((b) => ({ ...b, culprit: CODE_CULPRIT[b.code], owner: CODE_OWNER[b.code], note: OPERATOR_NOTE[b.code] || "" }))
    const findings = [...r.value.blockers.map((b) => ({ ...b })), ...auto]

    copyFileSync(at(root, path), at(root, REVIEW_PATH))   // promoted AFTER the decision to accept
    rmSync(at(root, path))
    return { ok: true, verdict: auto.length ? "Reject" : r.value.verdict, findings }
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
    version: "1.22.0",
    headline: "izi: task → brd → survey-plan → scope → graph → intake → weight → ripple → design → plan → review host functions",
    description: "readText/answers/brdForm/frdForm/carried/reviewForm/budgets/herdrStatus/newRun/checkTask/checkBrd/promote/setPending/clearPending/survey/cells/digest/reuse/remember/checkPart/buildGraph/graphMap/checkFrd/weight/ripple/design/parts/part/planbook/gate1/branch/tickets/plan/review, plus the gilb, scout, intake, designer and critic role directories (steps/brd/, steps/scope/, steps/intake/, steps/design/, steps/review/) and the izi_answer tool (pi.registerTool, not a sandbox function).",
    functions: { readText, answers, brdForm, frdForm, carried, reviewForm, budgets, herdrStatus, newRun, checkTask, checkBrd, promote, setPending, clearPending, survey, focus, cells, digest, reuse, remember, checkPart, buildGraph, graphMap, checkFrd, weight, ripple, design, parts, part, planbook, gate1, branch, tickets, plan, review, runlogRead, runlogMark, runlogTicket, runlogPending },
    // steps/brd/ carries gilb.md, steps/scope/ carries scout.md, steps/intake/ carries intake.md and
    // steps/design/ carries designer.md (role files, named by ROLE not by step — see steps/brd/gilb.md's
    // own header) alongside their cores/orders/tests;
    // pi-extensible-workflows scans a role directory for *.md files only (validation.js
    // scanRoleFiles), so the non-.md neighbours here are inert to role resolution.
    roleDirectories: [new URL("../steps/brd/", import.meta.url), new URL("../steps/scope/", import.meta.url), new URL("../steps/intake/", import.meta.url), new URL("../steps/design/", import.meta.url), new URL("../steps/review/", import.meta.url)],
  })
}
