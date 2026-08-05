// install.mjs — только временный HOME/PI_CODING_AGENT_DIR в тестах, реальный ~ не трогается ни разу.

import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, cpSync } from "node:fs"
import { join, dirname } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { resolveAgentDir, buildModelAliases, mergeSettings } from "./install.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, "..")

// --- resolveAgentDir -----------------------------------------------------------------------------

test("resolveAgentDir: без override — home/.pi/agent", () => {
  assert.equal(resolveAgentDir({ env: {}, home: "/h" }), join("/h", ".pi", "agent"))
})

test("resolveAgentDir: PI_CODING_AGENT_DIR перекрывает home целиком", () => {
  assert.equal(resolveAgentDir({ env: { PI_CODING_AGENT_DIR: "/override" }, home: "/h" }), "/override")
})

// --- buildModelAliases -----------------------------------------------------------------------

test("buildModelAliases: три тира из pipeline.json.models", () => {
  const models = {
    routing: { id: "openrouter/qwen/qwen3.6-27b" },
    execution: { id: "openrouter/qwen/qwen3.6-27b" },
    judgment: { id: "openrouter/qwen/qwen3.6-27b" },
  }
  const r = buildModelAliases(models)
  assert.equal(r.ok, true)
  assert.deepEqual(r.value, { routing: "openrouter/qwen/qwen3.6-27b", execution: "openrouter/qwen/qwen3.6-27b", judgment: "openrouter/qwen/qwen3.6-27b" })
})

test("buildModelAliases: отсутствующий тир — отказ deny-safe, а не молчаливый дефолт", () => {
  const r = buildModelAliases({ routing: { id: "m" }, execution: { id: "m" } })
  assert.equal(r.ok, false)
  assert.equal(r.error.cls, "missing-tier")
  assert.match(r.error.detail, /judgment/)
})

// --- mergeSettings -----------------------------------------------------------------------------

test("mergeSettings: с нуля — только modelAliases", () => {
  const out = mergeSettings({ existing: null, aliases: { routing: "m" } })
  assert.deepEqual(out, { modelAliases: { routing: "m" } })
})

test("mergeSettings: чужой ключ вне разрешённых четырёх не переживает слияние", () => {
  const out = mergeSettings({ existing: { concurrency: 4, foo: "bar" }, aliases: { routing: "m" } })
  assert.equal("foo" in out, false)
  assert.equal(out.concurrency, 4)
})

test("mergeSettings: новые тиры перекрывают одноимённые старые, остальные алиасы сохраняются", () => {
  const out = mergeSettings({ existing: { modelAliases: { routing: "old", custom: "keep" } }, aliases: { routing: "new" } })
  assert.deepEqual(out.modelAliases, { routing: "new", custom: "keep" })
})

// --- CLI: временный каталог, не реальный ~ --------------------------------------------------

function buildFixtureRepo({ withRoles, roleFiles = ["gilb.md"], pipelineModels, withPrompts = true, promptFiles = ["izi.md"] }) {
  const dir = mkdtempSync(join(tmpdir(), "install-repo-"))
  mkdirSync(join(dir, "bin"), { recursive: true })
  mkdirSync(join(dir, "core"), { recursive: true })
  cpSync(join(REPO_ROOT, "bin", "install.mjs"), join(dir, "bin", "install.mjs"))
  cpSync(join(REPO_ROOT, "bin", "cli-entry.mjs"), join(dir, "bin", "cli-entry.mjs"))
  cpSync(join(REPO_ROOT, "core", "result.mjs"), join(dir, "core", "result.mjs"))
  writeFileSync(join(dir, "pipeline.json"), JSON.stringify({ models: pipelineModels }))
  if (withRoles) {
    mkdirSync(join(dir, "roles"), { recursive: true })
    for (const f of roleFiles) writeFileSync(join(dir, "roles", f), `---\ndescription: fixture\n---\nfixture role body\n`)
  }
  if (withPrompts) {
    mkdirSync(join(dir, "prompts"), { recursive: true })
    for (const f of promptFiles) writeFileSync(join(dir, "prompts", f), `---\ndescription: fixture prompt\n---\nfixture prompt body\n`)
  }
  return dir
}

const VALID_MODELS = {
  routing: { id: "openrouter/qwen/qwen3.6-27b" },
  execution: { id: "openrouter/qwen/qwen3.6-27b" },
  judgment: { id: "openrouter/qwen/qwen3.6-27b" },
}

function runInstall(repoDir, agentDir) {
  try {
    const out = execFileSync("node", [join(repoDir, "bin", "install.mjs"), `--agent-dir=${agentDir}`], { encoding: "utf8" })
    return { code: 0, out }
  } catch (e) {
    return { code: e.status, out: `${e.stdout || ""}${e.stderr || ""}` }
  }
}

test("install: roles/*.md копируются в <agent-dir>/pi-extensible-workflows/roles/", () => {
  const repo = buildFixtureRepo({ withRoles: true, roleFiles: ["gilb.md", "smoker.md"], pipelineModels: VALID_MODELS })
  const agentDir = mkdtempSync(join(tmpdir(), "agent-dir-"))
  const r = runInstall(repo, agentDir)
  assert.equal(r.code, 0, r.out)
  assert.equal(existsSync(join(agentDir, "pi-extensible-workflows", "roles", "gilb.md")), true)
  assert.equal(existsSync(join(agentDir, "pi-extensible-workflows", "roles", "smoker.md")), true)
})

test("install: prompts/*.md копируются в <agent-dir>/prompts/", () => {
  const repo = buildFixtureRepo({ withRoles: true, pipelineModels: VALID_MODELS, promptFiles: ["izi.md"] })
  const agentDir = mkdtempSync(join(tmpdir(), "agent-dir-"))
  const r = runInstall(repo, agentDir)
  assert.equal(r.code, 0, r.out)
  assert.equal(existsSync(join(agentDir, "prompts", "izi.md")), true)
})

test("install: prompts/ отсутствует в репозитории — отказ с диагнозом, не тихий пропуск", () => {
  const repo = buildFixtureRepo({ withRoles: true, pipelineModels: VALID_MODELS, withPrompts: false })
  const agentDir = mkdtempSync(join(tmpdir(), "agent-dir-"))
  const r = runInstall(repo, agentDir)
  assert.equal(r.code, 1)
  assert.match(r.out, /prompts\/ не существует/)
  assert.equal(existsSync(join(agentDir, "prompts")), false)
})

test("install: settings.json несёт modelAliases по трём тирам и ровно разрешённые ключи", () => {
  const repo = buildFixtureRepo({ withRoles: true, pipelineModels: VALID_MODELS })
  const agentDir = mkdtempSync(join(tmpdir(), "agent-dir-"))
  const r = runInstall(repo, agentDir)
  assert.equal(r.code, 0, r.out)
  const settings = JSON.parse(readFileSync(join(agentDir, "pi-extensible-workflows", "settings.json"), "utf8"))
  assert.deepEqual(Object.keys(settings), ["modelAliases"])
  assert.deepEqual(settings.modelAliases, { routing: "openrouter/qwen/qwen3.6-27b", execution: "openrouter/qwen/qwen3.6-27b", judgment: "openrouter/qwen/qwen3.6-27b" })
})

test("install: сливается с уже существующим settings.json, роняя неизвестный ключ", () => {
  const repo = buildFixtureRepo({ withRoles: true, pipelineModels: VALID_MODELS })
  const agentDir = mkdtempSync(join(tmpdir(), "agent-dir-"))
  mkdirSync(join(agentDir, "pi-extensible-workflows"), { recursive: true })
  writeFileSync(join(agentDir, "pi-extensible-workflows", "settings.json"), JSON.stringify({ concurrency: 4, unknownKey: "ломает pi" }))
  const r = runInstall(repo, agentDir)
  assert.equal(r.code, 0, r.out)
  const settings = JSON.parse(readFileSync(join(agentDir, "pi-extensible-workflows", "settings.json"), "utf8"))
  assert.equal(settings.concurrency, 4)
  assert.equal("unknownKey" in settings, false)
})

test("install: roles/ отсутствует в репозитории — отказ с диагнозом, не тихий успех", () => {
  const repo = buildFixtureRepo({ withRoles: false, pipelineModels: VALID_MODELS })
  const agentDir = mkdtempSync(join(tmpdir(), "agent-dir-"))
  const r = runInstall(repo, agentDir)
  assert.equal(r.code, 1)
  assert.match(r.out, /roles\/ не существует/)
  assert.equal(existsSync(join(agentDir, "pi-extensible-workflows")), false)
})

test("install: тир не объявлен в pipeline.json — отказ, а не установка с частичными алиасами", () => {
  const repo = buildFixtureRepo({ withRoles: true, pipelineModels: { routing: { id: "m" } } })
  const agentDir = mkdtempSync(join(tmpdir(), "agent-dir-"))
  const r = runInstall(repo, agentDir)
  assert.equal(r.code, 1)
  assert.match(r.out, /missing-tier/)
})
