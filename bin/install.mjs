#!/usr/bin/env node
// MODULE_CONTRACT: install.mjs — roles/*.md → global pi roles dir; pipeline.json tiers → settings.json
// Purpose:      one decision — pi only picks up roles from its GLOBAL directory
//               (~/.pi/agent/pi-extensible-workflows/roles/), confirmed on the stand
//               (PLAN.md §0: a project-local `.pi/pi-extensible-workflows/roles/` role never ran a
//               launch; `--approve` did not help). Installing is therefore mandatory, not optional
//               convenience, and this file is the one place that performs it.
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

function fail(detail) { console.error(`✗ ${detail}`); process.exit(1) }

function main() {
  const args = process.argv.slice(2)
  const opt = (n) => { const h = args.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : "" }

  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
  const agentDirOverride = opt("agent-dir")
  const agentDir = agentDirOverride || resolveAgentDir({ env: process.env, home: homedir() })
  const wfDir = join(agentDir, "pi-extensible-workflows")

  const rolesSrc = join(repoRoot, "roles")
  if (!existsSync(rolesSrc)) fail("roles/ не существует в репозитории — каталог создаёт задача S2 параллельно с установкой; повтори после того, как она готова")
  const roleFiles = readdirSync(rolesSrc).filter((f) => f.endsWith(".md"))
  if (!roleFiles.length) fail("roles/ пуст — ни одной роли .md, нечего устанавливать")

  const rolesDst = join(wfDir, "roles")
  mkdirSync(rolesDst, { recursive: true })
  for (const f of roleFiles) copyFileSync(join(rolesSrc, f), join(rolesDst, f))

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

  console.log(`роли: ${roleFiles.length} → ${rolesDst}`)
  for (const f of roleFiles) console.log(`  ${f}`)
  console.log(`settings: ${settingsPath}`)
  console.log(`  modelAliases: ${Object.entries(aliasResult.value).map(([k, v]) => `${k}=${v}`).join(", ")}`)
  console.log(`✓ установлено в ${agentDir}`)
}

if (isMain(import.meta.url)) main()
