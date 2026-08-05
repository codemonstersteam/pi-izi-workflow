#!/usr/bin/env node
// MODULE_CONTRACT: run.mjs — launches workflows/izi.js and returns its result.json as the process's own JSON/exit code
// Purpose:      one decision — the run's OUTCOME is whatever the pi stand wrote to disk
//               (state.json/result.json under ~/.pi/workflows/projects/…), never the stdout of the
//               `pi -p` launcher process. PLAN.md §0 recorded `pi -p` hanging while its own run was
//               already `completed` on disk — printed text from that process is not evidence.
// io:           fs, proc (spawns `pi -p`, polls the filesystem)
// Invariants:   PI_LAUNCH_TIMEOUT_MS and POLL_TIMEOUT_MS are each declared exactly once, here;
//               the run picked from disk is always the newest one created strictly AFTER this
//               process's own start time — never "last by directory listing order", since old runs
//               from earlier sessions sit in the same sessions/ directory
// Interface:    parseArgv(argv) -> { taskPath }
//               buildRunInstruction({ name, scriptPath, foreground }) -> string
//               projectStorageKey(cwd) -> string
//               pickNewestRun(runs, afterMs) -> run | null
//               isTerminalState(state) -> boolean
//               resultExitCode(result) -> number
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
export function buildRunInstruction({ name, scriptPath, foreground }) {
  return [
    'Call the "workflow" tool now with EXACTLY these parameters — no other tool calls, no commentary, no extra parameters:',
    `name: ${JSON.stringify(name)}`,
    `scriptPath: ${JSON.stringify(scriptPath)}`,
    `foreground: ${foreground === true}`,
    "Do not pass an `args` parameter at all — the script reads its own configuration from disk.",
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

// FUNCTION_CONTRACT: pickNewestRun — the run this launch produced, never an old one from the same project
//   Input:        runs — array of { id, createdAtMs }; afterMs — this process's own start time (ms)
//   Dependencies: —
//   Antecedent:   runs is an array (possibly empty); each element carries a numeric createdAtMs;
//                 afterMs is a finite number
//   Consequent:   success: the element with the greatest createdAtMs among those with
//                          createdAtMs > afterMs, or null if none qualify — "created after this
//                          launcher started", not "last in a directory listing" (listings are not
//                          time-ordered and old runs from earlier sessions share the directory)
//                 failure: none — total
export function pickNewestRun(runs, afterMs) {
  const candidates = runs.filter((r) => r.createdAtMs > afterMs)
  if (!candidates.length) return null
  return candidates.reduce((best, r) => (r.createdAtMs > best.createdAtMs ? r : best))
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

// ── io orchestration below — not unit-covered (standards/code.md §5: a head/io pipe of already-
//    proven parts is proven by a live run, not a unit wearing a unit's name) ────────────────────

function sessionsDir(cwd) {
  return join(homedir(), ".pi", "workflows", "projects", projectStorageKey(cwd), "sessions")
}

function listRunsCreatedAfter(cwd, afterMs) {
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
  return runs.filter((r) => r.createdAtMs > afterMs)
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

async function pollForTerminalRun(cwd, afterMs) {
  const deadline = Date.now() + POLL_TIMEOUT_MS
  let lastSeen = null
  while (Date.now() < deadline) {
    const runs = listRunsCreatedAfter(cwd, afterMs)
    const newest = pickNewestRun(runs, afterMs)
    if (newest) {
      lastSeen = newest
      const state = readJsonIfExists(join(newest.dir, "state.json"))
      if (state && isTerminalState(state.state)) return { found: newest, terminal: true }
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  return { found: lastSeen, terminal: false }
}

function spawnLauncher(model, instruction) {
  return new Promise((resolveSpawn) => {
    const child = spawn("pi", ["-p", "--model", model, instruction], { stdio: "ignore" })
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

  const scriptPath = join(root, "workflows", "izi.js")
  if (!existsSync(scriptPath)) fail(2, "preflight: workflows/izi.js не существует")

  const startedAtMs = Date.now()
  const instruction = buildRunInstruction({ name: "izi", scriptPath: "workflows/izi.js", foreground: true })

  await spawnLauncher(model, instruction)

  const { found, terminal } = await pollForTerminalRun(root, startedAtMs)
  if (!found) fail(2, `preflight: run-каталог не появился под ${sessionsDir(root)} за ${POLL_TIMEOUT_MS}ms — это отказ preflight, не зависание`)
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
