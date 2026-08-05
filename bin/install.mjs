#!/usr/bin/env node
// MODULE_CONTRACT: install.mjs — steps/*/role.md → global pi roles dir, under the ROLE's name;
//               prompts/*.md → global pi prompts dir; pipeline.json tiers → settings.json
// Purpose:      one decision — pi only picks up roles from its GLOBAL directory
//               (~/.pi/agent/pi-extensible-workflows/roles/), confirmed on the stand
//               (PLAN.md §0: a project-local `.pi/pi-extensible-workflows/roles/` role never ran a
//               launch; `--approve` did not help). Installing is therefore mandatory, not optional
//               convenience, and this file is the one place that performs it. Prompt templates carry
//               the exact same fact: pi loads project-local `.pi/prompts/*.md` only after the project
//               is trusted (docs/prompt-templates.md, "Locations"), which this repository does not
//               have (README.md, «Долги»); the only reachable location is the GLOBAL
//               `${agentDir}/prompts/`.
//
//               Second decision (S9, docs/workflow.md §1 правка 1): there is no standalone `roles/`
//               collection any more — a role is part of its slice, `steps/<id>/role.md`. This file
//               COLLECTS roles by scanning `steps/*/role.md`, and the file it writes on the pi side
//               is named after the ROLE (`steps/<id>/step.json`'s `role` field), not after the step
//               id — pi resolves a role by the name a workflow's `agent(order, { role })` call
//               passes, which is the role name, never the step id.
// io:           fs
// Invariants:   settings.json is written with EXACTLY the four keys pi's own validator accepts —
//               concurrency, modelAliases, disabledAgentResources, extensions — an unknown key
//               breaks pi's launch (confirmed against
//               node_modules/pi-extensible-workflows/dist/src/validation.js's `allowed` set); a
//               merge never invents or drops an allowed key that was already present, and never
//               carries forward a key outside that set
// Interface:    resolveAgentDir({ env, home }) -> string
//               buildModelAliases(models) -> Result<{routing,execution,judgment}, Error>
//               mergeSettings({ existing, aliases }) -> object
//               collectRoleFiles({ stepsDir, ids }) -> Result<{ roleName: string, src: string }[], Error>
//
//   node bin/install.mjs [--agent-dir=<override, для тестов>]
//
// PI_CODING_AGENT_DIR — тот же env var, что читает @earendil-works/pi-coding-agent::getAgentDir():
// подтверждено чтением dist/config.js пакета, установленного на стенде (`ENV_AGENT_DIR =
// "${APP_NAME}_CODING_AGENT_DIR"`, APP_NAME="pi"). Он НЕ импортируется как зависимость (PLAN.md:
// «никаких зависимостей») — то же пятистрочное правило воспроизведено здесь.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from "node:fs"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { homedir } from "node:os"
import { ok, err } from "../core/result.mjs"
import { isMain } from "./cli-entry.mjs"

const ALLOWED_SETTINGS_KEYS = ["concurrency", "modelAliases", "disabledAgentResources", "extensions"]
const TIERS = ["routing", "execution", "judgment"]

// FUNCTION_CONTRACT: resolveAgentDir — where pi's own config lives, override included
//   Input:        raw — { env: env-like object, home: homedir() string }
//   Dependencies: —
//   Antecedent:   home is a non-empty string; env may or may not carry PI_CODING_AGENT_DIR
//   Consequent:   success: env.PI_CODING_AGENT_DIR when truthy, else `${home}/.pi/agent` —
//                          byte-identical to @earendil-works/pi-coding-agent's own getAgentDir()
//                 failure: none — total
export function resolveAgentDir({ env, home }) {
  return env.PI_CODING_AGENT_DIR || join(home, ".pi", "agent")
}

// FUNCTION_CONTRACT: buildModelAliases — pipeline.json's three tiers as a modelAliases object
//   Input:        models — pipeline.json's `models` field
//   Dependencies: —
//   Antecedent:   models is an object; a tier not carrying `{ id: <non-empty string> }` is
//                 inadmissible — deny-safe, same reasoning as the donor's resolveModel: a tier
//                 undeclared here must not silently fall back to a guess
//   Consequent:   success: `{ routing, execution, judgment }` — each value the tier's `models[t].id`
//                 failure: "missing-tier" — the first tier (in TIERS order) that is absent or
//                          malformed; detail names it
export function buildModelAliases(models) {
  const aliases = {}
  for (const tier of TIERS) {
    const m = models && models[tier]
    if (!m || typeof m !== "object" || typeof m.id !== "string" || !m.id.trim()) {
      return err("missing-tier", `pipeline.json.models.${tier}.id не объявлен — молчаливый дефолт вернул бы выбор модели в память установщика`)
    }
    aliases[tier] = m.id
  }
  return ok(aliases)
}

// FUNCTION_CONTRACT: mergeSettings — settings.json content, strictly the four keys pi accepts
//   Input:        raw — { existing: object | null, aliases: object }
//   Dependencies: —
//   Antecedent:   existing is null (no file yet) or an already-parsed plain object; aliases is a
//                 flat object of alias name → model id
//   Consequent:   success: an object carrying `concurrency`/`disabledAgentResources`/`extensions`
//                          from `existing` ONLY when already present there (never invented), and
//                          `modelAliases` = existing.modelAliases merged with `aliases` (ours win on
//                          a name collision) — no key outside ALLOWED_SETTINGS_KEYS survives
//                 failure: none — total
export function mergeSettings({ existing, aliases }) {
  const base = existing && typeof existing === "object" ? existing : {}
  const out = {}
  for (const key of ALLOWED_SETTINGS_KEYS) {
    if (key === "modelAliases") continue
    if (Object.prototype.hasOwnProperty.call(base, key)) out[key] = base[key]
  }
  out.modelAliases = { ...(base.modelAliases && typeof base.modelAliases === "object" ? base.modelAliases : {}), ...aliases }
  return out
}

// FUNCTION_CONTRACT: collectRoleFiles — steps/*/role.md, named by their OWN step.json's `role`
//   Input:        raw — { stepsDir: absolute path to the repo's steps/ directory,
//                          ids: string[] — steps/ subdirectory names to scan }
//   Dependencies: fs (existsSync/readFileSync) — this scans slices on disk, it does not receive
//                 them pre-read; the caller supplies only WHICH ids to look at, not their content
//   Antecedent:   stepsDir is a non-empty string naming an existing directory; ids is an array of
//                 directory names under it (possibly not carrying role.md at all — that is the
//                 ordinary "this slice has no role" case, not an error)
//   Consequent:   success: `{ roleName, src }[]`, one entry per steps/<id>/role.md found, `roleName`
//                          taken from that SAME step's step.json `role` field — never the step id,
//                          since pi resolves a role by the name a workflow's `agent(order, {role})`
//                          passes, not by which slice happens to own the file
//                 failure: "role-without-step-json" — role.md exists but its step.json does not, so
//                                        no name is knowable;
//                          "bad-step-json" — step.json exists but does not parse;
//                          "role-name-missing" — step.json exists but declares no non-empty `role`;
//                          "no-roles" — not one steps/*/role.md found across `ids` — nothing to
//                                        install, a repository with slices but no roles is not
//                                        silently "done"
export function collectRoleFiles({ stepsDir, ids }) {
  const found = []
  for (const id of ids) {
    const roleMd = join(stepsDir, id, "role.md")
    if (!existsSync(roleMd)) continue
    const stepJsonPath = join(stepsDir, id, "step.json")
    if (!existsSync(stepJsonPath)) {
      return err("role-without-step-json", `steps/${id}/role.md есть, но steps/${id}/step.json отсутствует — имя роли неизвестно`)
    }
    let stepJson
    try { stepJson = JSON.parse(readFileSync(stepJsonPath, "utf8")) }
    catch (e) { return err("bad-step-json", `steps/${id}/step.json не парсится: ${e.message}`) }
    const roleName = stepJson.role
    if (!roleName || typeof roleName !== "string" || !roleName.trim()) {
      return err("role-name-missing", `steps/${id}/step.json не объявляет role — steps/${id}/role.md некуда установить`)
    }
    found.push({ roleName, src: roleMd })
  }
  if (!found.length) return err("no-roles", "ни одного steps/*/role.md — нечего устанавливать")
  return ok(found)
}

function fail(detail) { console.error(`✗ ${detail}`); process.exit(1) }

function main() {
  const args = process.argv.slice(2)
  const opt = (n) => { const h = args.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : "" }

  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
  const agentDirOverride = opt("agent-dir")
  const agentDir = agentDirOverride || resolveAgentDir({ env: process.env, home: homedir() })
  const wfDir = join(agentDir, "pi-extensible-workflows")

  const stepsDir = join(repoRoot, "steps")
  if (!existsSync(stepsDir)) fail("steps/ не существует в репозитории — нечего собирать")
  const stepIds = readdirSync(stepsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
  const roleResult = collectRoleFiles({ stepsDir, ids: stepIds })
  if (!roleResult.ok) fail(`[${roleResult.error.cls}] ${roleResult.error.detail}`)
  const roleEntries = roleResult.value

  const rolesDst = join(wfDir, "roles")
  mkdirSync(rolesDst, { recursive: true })
  for (const { roleName, src } of roleEntries) copyFileSync(src, join(rolesDst, `${roleName}.md`))

  const promptsSrc = join(repoRoot, "prompts")
  if (!existsSync(promptsSrc)) fail("prompts/ не существует в репозитории — источник шаблона /izi отсутствует, установка отказывает вместо тихого пропуска")
  const promptFiles = readdirSync(promptsSrc).filter((f) => f.endsWith(".md"))
  if (!promptFiles.length) fail("prompts/ пуст — ни одного шаблона .md, нечего устанавливать")

  const promptsDst = join(agentDir, "prompts")
  mkdirSync(promptsDst, { recursive: true })
  for (const f of promptFiles) copyFileSync(join(promptsSrc, f), join(promptsDst, f))

  const pipelinePath = join(repoRoot, "pipeline.json")
  if (!existsSync(pipelinePath)) fail("pipeline.json не существует в репозитории")
  let pipeline
  try { pipeline = JSON.parse(readFileSync(pipelinePath, "utf8")) }
  catch { fail("pipeline.json не парсится как JSON"); return }

  const aliasResult = buildModelAliases(pipeline.models)
  if (!aliasResult.ok) fail(`[${aliasResult.error.cls}] ${aliasResult.error.detail}`)

  const settingsPath = join(wfDir, "settings.json")
  let existing = null
  if (existsSync(settingsPath)) {
    try { existing = JSON.parse(readFileSync(settingsPath, "utf8")) }
    catch { fail(`${settingsPath} существует, но не парсится как JSON — слияние невозможно, поправь файл вручную`); return }
  }
  const merged = mergeSettings({ existing, aliases: aliasResult.value })
  mkdirSync(wfDir, { recursive: true })
  writeFileSync(settingsPath, `${JSON.stringify(merged, null, 2)}\n`)

  console.log(`роли: ${roleEntries.length} → ${rolesDst}`)
  for (const { roleName, src } of roleEntries) console.log(`  ${roleName}.md ← ${src.slice(repoRoot.length + 1)}`)
  console.log(`шаблоны: ${promptFiles.length} → ${promptsDst}`)
  for (const f of promptFiles) console.log(`  ${f}`)
  console.log(`settings: ${settingsPath}`)
  console.log(`  modelAliases: ${Object.entries(aliasResult.value).map(([k, v]) => `${k}=${v}`).join(", ")}`)
  console.log(`✓ установлено в ${agentDir}`)
}

if (isMain(import.meta.url)) main()
