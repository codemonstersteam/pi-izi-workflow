// MODULE_CONTRACT: ext/index.mjs — pi-extensible-workflows extension: host functions for izi's five
//               steps (task, brd, survey-plan, scope, graph), replacing the bin/*.mjs + shell() harness (S11), plus
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
//               setPending/clearPending/survey/cells/digest/reuse/remember/checkPart/buildGraph are ALSO named exports — pi-extensible-workflows never
//               exercises run(input, context) itself (it is the caller, not test scaffolding), so
//               ext/index.test.mjs imports these directly and calls run() with a fabricated
//               { run: { cwd } } context to prove the anchor without a live pi/workflow harness.

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync, readdirSync, statSync } from "node:fs"
import { createHash } from "node:crypto"
import { dirname, join } from "node:path"
import { Type } from "typebox"
import { registerWorkflowExtension, herdrAvailable, herdrPaneId, loadSettings } from "pi-extensible-workflows"
import { checkTaskText } from "../steps/task/task.mjs"
import { newBrd, parseBrd } from "../steps/brd/brd.mjs"
import { newPlan } from "../steps/survey-plan/plan.mjs"
import { skipDir, skipFile } from "../steps/survey-plan/skip.mjs"
import { newPart, GRAMMAR_VERSION } from "../steps/scope/part.mjs"
import { readSource } from "../steps/scope/source.mjs"
import { newComputed, computedXml, parseComputed } from "../steps/scope/computed.mjs"
import { newDigest } from "../steps/scope/digest.mjs"
import { newGraph, graphXml } from "../steps/graph/graph.mjs"
import { decide, entryFor } from "../steps/scope/cache.mjs"
import { newAnswers, looksLikeTemplate } from "../core/answers.mjs"
import { newBudgets, BUDGETS_PATH } from "../core/budgets.mjs"
import { BRD_FORM, ABSENT_DOC } from "../core/form.mjs"
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
    if (!existsSync(at(root, TASK_PATH))) {
      return { ok: false, why: `${TASK_PATH} не существует — вход конвейера кладёт оператор` }
    }
    const r = checkTaskText(readFileSync(at(root, TASK_PATH), "utf8"))
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
    const task = readIfExists(root, TASK_PATH)
    const ans = parsedAnswers(readIfExists(root, ".agent/answers.md"))
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
  description: "The BRD's form as data (subjectsMin, subjectsMax, subjectRule, absentDoc) from core/form.mjs — the order SUBSTITUTES these, it does not restate them.",
  input: { type: "object", properties: {}, additionalProperties: false },
  output: {
    type: "object",
    properties: {
      subjectsMin: { type: "number" },
      subjectsMax: { type: "number" },
      subjectRule: { type: "string" },
      absentDoc: { type: "string" },
    },
    required: ["subjectsMin", "subjectsMax", "subjectRule", "absentDoc"],
    additionalProperties: false,
  },
  run() {
    return {
      subjectsMin: BRD_FORM.subjectsMin,
      subjectsMax: BRD_FORM.subjectsMax,
      subjectRule: BRD_FORM.subjectRule,
      absentDoc: ABSENT_DOC,
    }
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

export const buildGraph = {
  description: "Merge every graph part and the script's computed facts into .agent/appgraph.xml — steps/graph/graph.mjs::newGraph wired to disk. Parts are read by the PLAN, so a missing one is named instead of silently shrinking the graph. Written only after a green merge.",
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

    const parts = []
    for (const c of p.cells) {
      const from = `.agent/graph-parts/${c.id}.xml`
      if (!existsSync(at(root, from))) {
        return { ok: false, why: `${from} не существует — клетка ${c.id} плана не закрыта частью, поддерево потеряно` }
      }
      parts.push({ id: c.id, kind: c.kind, xml: readFileSync(at(root, from), "utf8") })
    }

    const r = newGraph({ parts, computedXml: readIfExists(root, COMPUTED_PATH), plan: p.plan })
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
    version: "1.8.0",
    headline: "izi: task → brd → survey-plan → scope → graph host functions",
    description: "readText/answers/brdForm/budgets/herdrStatus/checkTask/checkBrd/promote/setPending/clearPending/survey/cells/digest/reuse/remember/checkPart/buildGraph, plus the gilb and scout role directories (steps/brd/, steps/scope/) and the izi_answer tool (pi.registerTool, not a sandbox function).",
    functions: { readText, answers, brdForm, budgets, herdrStatus, checkTask, checkBrd, promote, setPending, clearPending, survey, cells, digest, reuse, remember, checkPart, buildGraph },
    // steps/brd/ carries gilb.md and steps/scope/ carries scout.md (role files, named by ROLE not by
    // step — see steps/brd/gilb.md's own header) alongside their cores/orders/tests;
    // pi-extensible-workflows scans a role directory for *.md files only (validation.js
    // scanRoleFiles), so the non-.md neighbours here are inert to role resolution.
    roleDirectories: [new URL("../steps/brd/", import.meta.url), new URL("../steps/scope/", import.meta.url)],
  })
}
