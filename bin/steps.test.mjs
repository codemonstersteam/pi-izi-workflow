import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { writeFileSync, mkdirSync, mkdtempSync } from "node:fs"
import { join, dirname } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { lintManifest, readManifest } from "./steps.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, "..")
const CLI = join(HERE, "steps.mjs")

// --- lintManifest (pure logic) -------------------------------------------------------------------

const ROLE_STEP = { id: "brd", kind: "role", role: "gilb", staging: ".agent/staging/brd.md", receipt: "brd" }
const HUMAN_STEP = { id: "task", kind: "human", receipt: "task" }

test("lintManifest: два валидных шага собираются в один манифест", () => {
  const r = lintManifest({
    order: ["task", "brd"],
    entries: {
      task: { hasDir: true, stepJson: HUMAN_STEP },
      brd: { hasDir: true, stepJson: ROLE_STEP },
    },
  })
  assert.equal(r.ok, true)
  assert.deepEqual(Object.keys(r.value), ["task", "brd"])
  assert.equal(r.value.brd.role, "gilb")
})

test("lintManifest: шаг из order без каталога — отказ", () => {
  const r = lintManifest({ order: ["ghost"], entries: { ghost: { hasDir: false, stepJson: null } } })
  assert.equal(r.ok, false)
  assert.equal(r.error.cls, "manifest-invalid")
  assert.match(r.error.detail, /ghost.*не существует/)
})

test("lintManifest: каталог без step.json — отказ", () => {
  const r = lintManifest({ order: ["task"], entries: { task: { hasDir: true, stepJson: null } } })
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /step\.json отсутствует/)
})

test("lintManifest: ролевой шаг без role — отказ", () => {
  const r = lintManifest({
    order: ["brd"],
    entries: { brd: { hasDir: true, stepJson: { id: "brd", kind: "role", staging: ".agent/staging/brd.md", receipt: "brd" } } },
  })
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /без поля role/)
})

test("lintManifest: ролевой шаг без staging — отказ", () => {
  const r = lintManifest({
    order: ["brd"],
    entries: { brd: { hasDir: true, stepJson: { id: "brd", kind: "role", role: "gilb", receipt: "brd" } } },
  })
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /без staging/)
})

test("lintManifest: шаг без receipt — отказ", () => {
  const r = lintManifest({ order: ["task"], entries: { task: { hasDir: true, stepJson: { id: "task", kind: "human" } } } })
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /не несёт receipt/)
})

test("lintManifest: все нарушения отдаются разом, а не первое попавшееся", () => {
  const r = lintManifest({
    order: ["brd"],
    entries: { brd: { hasDir: true, stepJson: { id: "brd", kind: "role" } } },
  })
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /без поля role/)
  assert.match(r.error.detail, /без staging/)
  assert.match(r.error.detail, /не несёт receipt/)
})

test("lintManifest: шаг, не попавший в order, в манифест не входит", () => {
  const r = lintManifest({
    order: ["task"],
    entries: { task: { hasDir: true, stepJson: HUMAN_STEP }, brd: { hasDir: true, stepJson: ROLE_STEP } },
  })
  assert.equal(r.ok, true)
  assert.deepEqual(Object.keys(r.value), ["task"])
})

// --- readManifest (io, isolated tmp repos) --------------------------------------------------------

function fixtureRepo(order) {
  const dir = mkdtempSync(join(tmpdir(), "steps-manifest-"))
  writeFileSync(join(dir, "pipeline.json"), JSON.stringify({ order }))
  return dir
}

function writeStep(root, id, stepJson) {
  const d = join(root, "steps", id)
  mkdirSync(d, { recursive: true })
  writeFileSync(join(d, "step.json"), JSON.stringify(stepJson))
}

test("readManifest: pipeline.json отсутствует — отказ no-pipeline", () => {
  const dir = mkdtempSync(join(tmpdir(), "steps-manifest-"))
  const r = readManifest({ root: dir })
  assert.equal(r.ok, false)
  assert.equal(r.error.cls, "no-pipeline")
})

test("readManifest: pipeline.json не парсится — отказ bad-pipeline", () => {
  const dir = mkdtempSync(join(tmpdir(), "steps-manifest-"))
  writeFileSync(join(dir, "pipeline.json"), "{ не json")
  const r = readManifest({ root: dir })
  assert.equal(r.ok, false)
  assert.equal(r.error.cls, "bad-pipeline")
})

test("readManifest: собирает манифест с диска для валидного репозитория", () => {
  const dir = fixtureRepo(["task", "brd"])
  writeStep(dir, "task", HUMAN_STEP)
  writeStep(dir, "brd", ROLE_STEP)
  const r = readManifest({ root: dir })
  assert.equal(r.ok, true)
  assert.deepEqual(Object.keys(r.value), ["task", "brd"])
})

// --- CLI на реальном репозитории --------------------------------------------------------------

test("CLI: манифест реального репозитория несёт task и brd", () => {
  const out = execFileSync("node", [CLI, "--json"], { cwd: REPO_ROOT, encoding: "utf8" })
  const manifest = JSON.parse(out)
  assert.deepEqual(Object.keys(manifest), ["task", "brd"])
  assert.equal(manifest.brd.role, "gilb")
  assert.equal(manifest.brd.staging, ".agent/staging/brd.md")
  assert.equal(manifest.task.receipt, "task")
})

test("CLI: манифест дефектного репозитория — exit 1 с диагнозом", () => {
  const dir = fixtureRepo(["brd"])
  writeStep(dir, "brd", { id: "brd", kind: "role" })
  try {
    execFileSync("node", [CLI, `--root=${dir}`], { encoding: "utf8" })
    assert.fail("должен был отказать")
  } catch (e) {
    assert.equal(e.status, 1)
    assert.match(`${e.stdout || ""}${e.stderr || ""}`, /manifest-invalid/)
  }
})
