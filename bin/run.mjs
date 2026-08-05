#!/usr/bin/env node
// MODULE_CONTRACT: run.mjs — launches workflows/izi.js and returns its result.json as the process's own JSON/exit code
// Purpose:      one decision — the run's OUTCOME is whatever the pi stand wrote to disk
//               (state.json/result.json under ~/.pi/workflows/projects/…), never the stdout of the
//               `pi -p` launcher process. PLAN.md §0 recorded `pi -p` hanging while its own run was
//               already `completed` on disk — printed text from that process is not evidence.
// io:           fs, proc (spawns `pi -p`, polls the filesystem)
// Invariants:   PI_LAUNCH_TIMEOUT_MS and POLL_TIMEOUT_MS are each declared exactly once, here;
//               "the runs this launch produced" is established by a SNAPSHOT DIFF — the set of run
//               directories that exist on disk right before `pi -p` is spawned, subtracted from
//               whatever exists at each poll — never by time (S5 finding: a live run showed the
//               launcher session persists across separate `node bin/run.mjs` invocations and, on one
//               occasion, the model called the `workflow` tool TWICE inside one launcher turn — "pick
//               newest by mtime" silently returned the second, corrupted call's result while the
//               first, untouched call had already answered correctly. See the debt entry this closes
//               in README.md.). Two or more new run directories is refused, not resolved by picking
//               one — see classifyNewRuns.
// Interface:    parseArgv(argv) -> { taskPath }
//               buildRunInstruction({ name, scriptPath, foreground }) -> string
//               projectStorageKey(cwd) -> string
//               newRunsSince(beforeDirs, afterRuns) -> run[]
//               classifyNewRuns(newRuns) -> { kind: "none" } | { kind: "one", run } | { kind: "many", runs }
//               isTerminalState(state) -> boolean
//               resultExitCode(result) -> number
//               headlessChannelRefusal(pipeline) -> string | null
//
//   node bin/run.mjs [--task=TASK.md]
//
// Contract update (coordinator, mid-task): `pi -p` serializes a tool call's `args` parameter to a
// STRING, not an object, on both haiku and sonnet launcher models — a live run failed with
// INTERNAL_ERROR on this (S2 finding). `args` is therefore not used at all: workflows/izi.js reads
// pipeline.json and steps/brd/order.tpl itself via shell("cat …") — a deterministic channel unlike
// the model-mediated tool call. The launch instruction below carries name/scriptPath/foreground and
// nothing else.
//
// Единственный способ запуска: tool `workflow` внутри сессии pi (PLAN.md §0 — CLI `piewf` в 5.1.1
// отсутствует). `pi -p` вызывает МОДЕЛЬ, которая исполняет этот tool call — печати той модели верить
// нельзя (см. Purpose), поэтому итог читается с диска, а сам запуск идёт с таймаутом и не блокирует
// опрос: опрос стенда стартует независимо от того, вернулся `pi -p` штатно или был убит по таймауту.
//
// Contract update (S5, defect fix): the launcher process is started with `--tools workflow,read,write`
// — an allowlist, not a suggestion. This is enforced by `pi -p` itself and, one layer deeper, by
// pi-extensible-workflows: `rootTools` (the launcher session's own active tools, minus the
// workflow-control tools themselves) becomes the CEILING every role's `tools:` list is checked
// against when the `workflow` tool call runs
// (`~/.pi/agent/npm/node_modules/pi-extensible-workflows/src/host.ts:984` computes `rootTools` from
// `pi.getActiveTools()`; `src/validation.ts:263` — `validateRolePolicies` — rejects the whole launch
// with `UNKNOWN_TOOL` if any role tool is absent from `rootTools`). Role `gilb` declares
// `tools: [read, write]` (`roles/gilb.md`) — DO NOT remove `read` or `write` from the allowlist below,
// only `bash`/`edit`/anything else the launcher does not need: dropping `read` or `write` makes every
// run fail validation before the workflow's own guardrail ever runs, not just narrow the launcher.

// Contract update (S6, operatorChannel): pipeline.json now declares operatorChannel — "terminal" (the
// behaviour above, unchanged) or "checkpoint" (workflows/izi.js pauses in-run via checkpoint(), only
// meaningful inside an interactive pi window — see pipeline.json's own "//operatorChannel" comment).
// A headless launch through THIS file cannot honour "checkpoint" at all: pi-extensible-workflows'
// checkpointBridge refuses outright when there is no UI to show Approve/Reject to
// (`~/.pi/agent/npm/node_modules/pi-extensible-workflows/src/host.ts` — `if (isForeground() &&
// !ui?.select) fail("RESUME_INCOMPATIBLE", "Foreground checkpoints require UI")`, and again
// `if (headless) fail("RESUME_INCOMPATIBLE", "Headless CLI checkpoints are unsupported")` — `pi -p`
// is exactly this case, matching PLAN.md §0's recorded fact). Two ways to keep bin/run.mjs from
// silently sitting on a pause it can never resolve: (a) refuse before spawning `pi -p` at all, with a
// diagnosis telling the operator to flip the field, or (b) transparently substitute "terminal" for the
// duration of this one launch. (b) was rejected: bin/run.mjs parses pipeline.json ONLY to pick the
// launcher model — workflows/izi.js re-reads the file itself, independently, via its own
// shell("cat pipeline.json") (see that file's own top-of-file contract note: args is not used at all,
// precisely because the model-mediated tool call is not a reliable channel). There is no args-like
// channel between this process and the workflow script to carry a substituted value through — the
// ONLY way to make the workflow SEE "terminal" would be to rewrite pipeline.json on disk before spawn
// (a race against anything else reading the file, and a dirty tree the moment the process is killed
// before it can restore the original — exactly the trap the task brief calls out) or to invent a new
// side-channel file izi.js does not otherwise know about (unverifiable without a live run, and another
// place the two readers of "the" config could disagree). (a) has neither problem and fails LOUD, at
// preflight, before a single token is spent talking to a launcher model that would just watch the
// checkpoint call blow up deep inside the run. Chosen: headlessChannelRefusal() below refuses with
// exit 2 whenever pipeline.json.operatorChannel is exactly "checkpoint"; every other value (including
// "terminal", missing, or invalid) is workflows/izi.js's own preflight to accept or reject — this file
// does not re-validate the whole enum, only the one value it alone knows is fatal to a headless launch.

import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve, basename } from "node:path"
import { isMain } from "./cli-entry.mjs"

// Таймаут самого процесса-запускателя (`pi -p`). Живой прогон вешался с завершённым `completed` на
// диске — поэтому убийство этого процесса по таймауту НЕ считается отказом прогона, только сигналом
// прекратить ждать его stdout и переходить к опросу стенда.
export const PI_LAUNCH_TIMEOUT_MS = 15 * 60 * 1000

// Таймаут ОПРОСА стенда — отдельная константа (не выводится из PI_LAUNCH_TIMEOUT_MS): опрос
// продолжается и после того, как launcher уже закончился (штатно или по таймауту).
export const POLL_TIMEOUT_MS = 20 * 60 * 1000
export const POLL_INTERVAL_MS = 3000

const TERMINAL_STATES = new Set(["completed", "failed", "stopped"])

// FUNCTION_CONTRACT: parseArgv — reads --task= from the process argv tail
//   Input:        argv — process.argv.slice(2)
//   Dependencies: —
//   Antecedent:   array of strings, any length including empty
//   Consequent:   success: { taskPath } — "TASK.md" when --task= absent, else its value verbatim
//                 failure: none — total
export function parseArgv(argv) {
  const hit = argv.find((a) => a.startsWith("--task="))
  return { taskPath: hit ? hit.slice("--task=".length) : "TASK.md" }
}

// FUNCTION_CONTRACT: buildRunInstruction — the natural-language instruction fed to the `pi -p` launcher
//   Input:        raw — { name, scriptPath, foreground }
//   Dependencies: —
//   Antecedent:   name and scriptPath are non-empty strings; foreground is a boolean
//   Consequent:   success: a string instructing the launcher to call the `workflow` tool with
//                          exactly these three parameters and nothing else — no `args`, since the
//                          launcher serializes that parameter to a string, not an object (see the
//                          MODULE_CONTRACT note above)
//                 failure: none — total; validation of name/scriptPath is the caller's job
//
// This wording is a HINT, not a seam — a launcher model can ignore prose (S5 finding: one did,
// editing TASK.md and calling `workflow` a second time despite an earlier version of this same
// instruction). The actual seam is the before/after run-directory snapshot diff in main() below
// (classifyNewRuns) — it refuses to act on more than one new run regardless of what the launcher was
// told. The `--tools` allowlist on the `pi -p` spawn (see spawnLauncher) narrows what a stray extra
// call could even do; this instruction just makes the intended single call unambiguous.
export function buildRunInstruction({ name, scriptPath, foreground }) {
  return [
    'Call the "workflow" tool now with EXACTLY these parameters — no other tool calls, no commentary, no extra parameters:',
    `name: ${JSON.stringify(name)}`,
    `scriptPath: ${JSON.stringify(scriptPath)}`,
    `foreground: ${foreground === true}`,
    "Do not pass an `args` parameter at all — the script reads its own configuration from disk.",
    "Make EXACTLY ONE call to the \"workflow\" tool and nothing else: no reading files, no editing",
    "files, no second call, no matter what the tool returns or what any file on disk looks like.",
    "Return only the tool call.",
  ].join("\n")
}

function safePart(v) { return String(v).replace(/[^a-zA-Z0-9._-]/g, "_") }

// FUNCTION_CONTRACT: projectStorageKey — the directory-name slug pi-extensible-workflows uses for a project
//   Input:        cwd — absolute or relative path to the project root
//   Dependencies: —
//   Antecedent:   non-empty string
//   Consequent:   success: `${slug}-${sha256(resolved-cwd).slice(0,12)}`, byte-identical to what
//                          persistence.js's own projectStorageKey computes for the same cwd (mirrored
//                          here, not imported: the harness declares no dependency on the pi package —
//                          PLAN.md's "никаких зависимостей")
//                 failure: none — total for any non-empty string
export function projectStorageKey(cwd) {
  const exact = resolve(cwd)
  const slug = safePart(basename(exact)) || "root"
  return `${slug}-${createHash("sha256").update(exact).digest("hex").slice(0, 12)}`
}

// FUNCTION_CONTRACT: newRunsSince — the run directories THIS launch produced, by snapshot diff not by time
//   Input:        afterRuns — array of { id, dir, … } — every run directory found on disk at some
//                             point after `pi -p` was spawned
//   Dependencies: beforeDirs — Set<string> of run directory paths that already existed on disk BEFORE
//                             `pi -p` was spawned (the preflight snapshot); captured once, bound
//                             before polling starts — a probe of "what was already there", not data
//   Antecedent:   afterRuns is an array (possibly empty), each element carrying a string `dir`;
//                 beforeDirs is a Set of strings
//   Consequent:   success: the subset of afterRuns whose `dir` is absent from beforeDirs — "appeared
//                          during this launch". A time comparison (mtime/createdAt) cannot tell a
//                          launcher's second, unwanted call apart from a leftover run of an earlier
//                          session that merely happens to sort later; set membership can.
//                 failure: none — total
export function newRunsSince(beforeDirs, afterRuns) {
  return afterRuns.filter((r) => !beforeDirs.has(r.dir))
}

// FUNCTION_CONTRACT: classifyNewRuns — turns "how many new runs appeared" into the one decision run.mjs acts on
//   Input:        newRuns — array of run objects, the result of newRunsSince
//   Dependencies: —
//   Antecedent:   array, possibly empty
//   Consequent:   success: { kind: "none" } when empty — the launcher never produced a run at all,
//                          the pre-existing preflight diagnosis, untouched by this fix;
//                          { kind: "one", run: newRuns[0] } when exactly one — the ordinary case,
//                          this run's result.json is the process's own result;
//                          { kind: "many", runs: newRuns } when two or more — the launcher exceeded
//                          its mandate of exactly one `workflow` call. The caller MUST NOT pick any
//                          single one of them as "the" result — that would silently launder a
//                          launcher defect into a believable answer (S5: the discarded run of the
//                          pair had already answered correctly; picking "the newest" printed the
//                          corrupted one instead)
//                 failure: none — total
export function classifyNewRuns(newRuns) {
  if (newRuns.length === 0) return { kind: "none" }
  if (newRuns.length === 1) return { kind: "one", run: newRuns[0] }
  return { kind: "many", runs: newRuns }
}

// FUNCTION_CONTRACT: isTerminalState — whether a run's state.json `state` field means "stop polling"
//   Input:        state — any value
//   Dependencies: —
//   Antecedent:   any value, not necessarily a string
//   Consequent:   success: true iff state ∈ {"completed", "failed", "stopped"} — the same set
//                          pi-extensible-workflows' own TERMINAL_SUMMARY_STATES names
//                 failure: none — total
export function isTerminalState(state) {
  return TERMINAL_STATES.has(state)
}

// FUNCTION_CONTRACT: resultExitCode — this process's own exit code, taken from the workflow's result
//   Input:        result — any value; the parsed contents of result.json, or a synthesized diagnostic
//   Dependencies: —
//   Antecedent:   any value — result.json's shape is not enforced upstream of this function
//   Consequent:   success: result.code when it is a finite number; 2 otherwise — 2 names "run.mjs
//                          could not establish a workflow-declared code", the same class as a
//                          preflight failure, never silently 0
//                 failure: none — total
export function resultExitCode(result) {
  return result && typeof result === "object" && Number.isFinite(result.code) ? result.code : 2
}

// FUNCTION_CONTRACT: headlessChannelRefusal — the one operatorChannel value this headless launcher must refuse
//   Input:        pipeline — the parsed contents of pipeline.json, any shape
//   Dependencies: —
//   Antecedent:   any value; pipeline?.operatorChannel may be absent, "terminal", "checkpoint", or
//                 anything else — this function only ever recognises "checkpoint" as ITS problem
//   Consequent:   success: a diagnosis string when pipeline.operatorChannel === "checkpoint" — this
//                          launcher spawns `pi -p`, which has no UI for checkpoint()'s Approve/Reject
//                          (see the module's Contract-update note above); null in every other case —
//                          "terminal" is this launcher's own working mode, and an absent or invalid
//                          value is workflows/izi.js's own preflight to diagnose, not duplicated here
//                 failure: none — total
export function headlessChannelRefusal(pipeline) {
  if (pipeline && typeof pipeline === "object" && pipeline.operatorChannel === "checkpoint") {
    return 'preflight: pipeline.json.operatorChannel="checkpoint" — headless-раннер (bin/run.mjs → pi -p) ' +
      "не проводит чекпоинты (pi-extensible-workflows отказывает checkpoint() без UI кодом " +
      'RESUME_INCOMPATIBLE), переключите канал на "terminal" для запуска через bin/run.mjs — ' +
      '"checkpoint" держите для интерактивного окна pi'
  }
  return null
}

// ── io orchestration below — not unit-covered (standards/code.md §5: a head/io pipe of already-
//    proven parts is proven by a live run, not a unit wearing a unit's name) ────────────────────

function sessionsDir(cwd) {
  return join(homedir(), ".pi", "workflows", "projects", projectStorageKey(cwd), "sessions")
}

// listRunsAll — every run directory on disk for this project, regardless of age. Deliberately NOT
// time-filtered: "which of these are new" is decided by newRunsSince's set diff against the
// before-spawn snapshot, not by a timestamp comparison (see the MODULE_CONTRACT note on why).
function listRunsAll(cwd) {
  const base = sessionsDir(cwd)
  if (!existsSync(base)) return []
  const runs = []
  for (const session of safeReaddir(base)) {
    const runsBase = join(base, session, "runs")
    for (const runId of safeReaddir(runsBase)) {
      const dir = join(runsBase, runId)
      const statePath = join(dir, "state.json")
      if (!existsSync(statePath)) continue
      const createdAtMs = runCreatedAtMs(dir, statePath)
      runs.push({ id: runId, dir, createdAtMs })
    }
  }
  return runs
}

function snapshotRunDirs(cwd) {
  return new Set(listRunsAll(cwd).map((r) => r.dir))
}

function safeReaddir(dir) {
  try { return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) }
  catch { return [] }
}

function runCreatedAtMs(dir, statePath) {
  // summary.json carries an explicit createdAt when present; state.json's own mtime is the fallback
  // — both name "when this run directory first appeared", never "when we happened to list it".
  const summaryPath = join(dir, "summary.json")
  if (existsSync(summaryPath)) {
    try {
      const summary = JSON.parse(readFileSync(summaryPath, "utf8"))
      if (summary.createdAt) return Date.parse(summary.createdAt)
    } catch { /* fall through to mtime */ }
  }
  return statSync(statePath).mtimeMs
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return null
  try { return JSON.parse(readFileSync(path, "utf8")) } catch { return null }
}

// pollForRuns — the seam: classifies "new since beforeDirs" on every poll tick, and stops as soon as
// the answer is decidable — one run reaching a terminal state, or a second new run appearing at all
// (a "many" verdict does not need to wait for anyone to finish; it is already a mandate violation).
async function pollForRuns(cwd, beforeDirs) {
  const deadline = Date.now() + POLL_TIMEOUT_MS
  let lastClassification = { kind: "none" }
  while (Date.now() < deadline) {
    const fresh = newRunsSince(beforeDirs, listRunsAll(cwd))
    const classification = classifyNewRuns(fresh)
    lastClassification = classification
    if (classification.kind === "many") return { classification, terminal: false }
    if (classification.kind === "one") {
      const state = readJsonIfExists(join(classification.run.dir, "state.json"))
      if (state && isTerminalState(state.state)) return { classification, terminal: true }
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  return { classification: lastClassification, terminal: false }
}

function spawnLauncher(model, instruction) {
  return new Promise((resolveSpawn) => {
    // --tools workflow,read,write: an allowlist, not a suggestion. See the MODULE_CONTRACT note above
    // for why `read`/`write` MUST stay — pi-extensible-workflows checks role `gilb`'s declared tools
    // against this session's active tools (minus workflow-control tools) and refuses the whole launch
    // otherwise. bash/edit/anything else is deliberately absent: the launcher's only job is one
    // `workflow` tool call.
    const child = spawn("pi", ["-p", "--model", model, "--tools", "workflow,read,write", instruction], { stdio: "ignore" })
    const timer = setTimeout(() => { try { child.kill("SIGKILL") } catch { /* already gone */ } }, PI_LAUNCH_TIMEOUT_MS)
    child.on("exit", () => { clearTimeout(timer); resolveSpawn() })
    child.on("error", () => { clearTimeout(timer); resolveSpawn() })
  })
}

function fail(code, diagnosis) {
  console.error(`✗ ${diagnosis}`)
  console.log(JSON.stringify({ track: "err", kind: "crashed", subject: diagnosis, code }))
  process.exit(code)
}

async function main() {
  const { taskPath } = parseArgv(process.argv.slice(2))
  const root = process.cwd()

  if (taskPath !== "TASK.md") {
    if (!existsSync(taskPath)) fail(2, `preflight: --task=${taskPath} не существует`)
    writeFileSync(join(root, "TASK.md"), readFileSync(taskPath))
  }

  const pipelinePath = join(root, "pipeline.json")
  if (!existsSync(pipelinePath)) fail(2, "preflight: pipeline.json не существует")
  let pipeline
  try { pipeline = JSON.parse(readFileSync(pipelinePath, "utf8")) }
  catch { fail(2, "preflight: pipeline.json не парсится как JSON"); return }
  const model = pipeline?.models?.routing?.id
  if (!model) fail(2, "preflight: pipeline.json.models.routing.id не объявлен — какой моделью запускать launcher, решить нечем")

  const channelRefusal = headlessChannelRefusal(pipeline)
  if (channelRefusal) fail(2, channelRefusal)

  const scriptPath = join(root, "workflows", "izi.js")
  if (!existsSync(scriptPath)) fail(2, "preflight: workflows/izi.js не существует")

  const instruction = buildRunInstruction({ name: "izi", scriptPath: "workflows/izi.js", foreground: true })

  // Snapshot BEFORE spawn — the set difference against this, not "newest by time", is what decides
  // which run directory(-ies) belong to this launch (see classifyNewRuns).
  const beforeDirs = snapshotRunDirs(root)

  await spawnLauncher(model, instruction)

  const { classification, terminal } = await pollForRuns(root, beforeDirs)

  if (classification.kind === "none") {
    fail(2, `preflight: run-каталог не появился под ${sessionsDir(root)} за ${POLL_TIMEOUT_MS}ms — это отказ preflight, не зависание`)
  }

  if (classification.kind === "many") {
    const listing = classification.runs
      .map((r) => `${r.id}:${readJsonIfExists(join(r.dir, "state.json"))?.state ?? "unknown"}`)
      .join(", ")
    fail(2, `launcher сделал ${classification.runs.length} вызова(ов) tool "workflow" вместо одного — новые run-каталоги (id:state): ${listing}. Ни один из них не выбран автоматически — результат любого был бы ложью о прогоне; смотри их сам под ${sessionsDir(root)}.`)
    return
  }

  const found = classification.run
  if (!terminal) fail(2, `run ${found.id} не достиг терминального состояния за ${POLL_TIMEOUT_MS}ms опроса`)

  const result = readJsonIfExists(join(found.dir, "result.json"))
  const state = readJsonIfExists(join(found.dir, "state.json"))
  const finalResult = result ?? {
    track: "err",
    kind: "crashed",
    subject: `run ${found.id} терминален (${state?.state ?? "unknown"}) без result.json`,
    code: 2,
  }
  console.log(JSON.stringify(finalResult))
  process.exit(resultExitCode(finalResult))
}

if (isMain(import.meta.url)) main()
