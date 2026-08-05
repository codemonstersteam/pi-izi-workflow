import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { promoteStep } from "./promote.mjs"

const CLI = join(dirname(fileURLToPath(import.meta.url)), "promote.mjs")
const run = (root, extra = []) => {
  try { return { code: 0, out: execFileSync("node", [CLI, `--root=${root}`, ...extra], { encoding: "utf8" }) } }
  catch (e) { return { code: e.status, out: `${e.stdout || ""}${e.stderr || ""}` } }
}

function withStaging(root, text) {
  mkdirSync(join(root, ".agent", "staging"), { recursive: true })
  writeFileSync(join(root, ".agent", "staging", "brd.md"), text)
}

// --- promoteStep (imported) ---------------------------------------------------------------------

test("promoteStep: копирует staging→out и ТОЛЬКО ПОТОМ пишет квитанцию", () => {
  const d = mkdtempSync(join(tmpdir(), "promote-"))
  withStaging(d, "# BRD\n")
  const r = promoteStep({ root: d, step: "brd" })
  assert.equal(r.ok, true)
  assert.equal(readFileSync(join(d, ".agent", "brd.md"), "utf8"), "# BRD\n")
  assert.equal(existsSync(join(d, ".agent", "receipts", "brd.json")), true)
})

test("промоут без staging НЕ пишет квитанцию — порядок обратным не бывает", () => {
  const d = mkdtempSync(join(tmpdir(), "promote-"))
  const r = promoteStep({ root: d, step: "brd" })
  assert.equal(r.ok, false)
  assert.equal(r.error.cls, "staging-missing")
  assert.equal(existsSync(join(d, ".agent", "brd.md")), false)
  assert.equal(existsSync(join(d, ".agent", "receipts", "brd.json")), false)
})

test("promoteStep: шаг без объявленного staging (task) — отказ no-staging, не тихий успех", () => {
  const d = mkdtempSync(join(tmpdir(), "promote-"))
  const r = promoteStep({ root: d, step: "task" })
  assert.equal(r.ok, false)
  assert.equal(r.error.cls, "no-staging")
})

test("promoteStep: незнакомый шаг — unknown-step", () => {
  const d = mkdtempSync(join(tmpdir(), "promote-"))
  const r = promoteStep({ root: d, step: "nope" })
  assert.equal(r.ok, false)
  assert.equal(r.error.cls, "unknown-step")
})

// --- CLI wrapper -----------------------------------------------------------------------------

test("CLI: зелёный путь — exit 0, out записан, квитанция есть", () => {
  const d = mkdtempSync(join(tmpdir(), "promote-"))
  withStaging(d, "# BRD\n")
  const r = run(d, ["--step=brd"])
  assert.equal(r.code, 0, r.out)
  assert.equal(existsSync(join(d, ".agent", "brd.md")), true)
  assert.equal(existsSync(join(d, ".agent", "receipts", "brd.json")), true)
})

test("CLI: без staging — exit 1 с диагнозом, а не тихий успех", () => {
  const d = mkdtempSync(join(tmpdir(), "promote-"))
  const r = run(d, ["--step=brd"])
  assert.equal(r.code, 1)
  assert.match(r.out, /staging-missing/)
  assert.equal(existsSync(join(d, ".agent", "receipts", "brd.json")), false)
})

test("CLI: без --step= — usage и exit 2", () => {
  const d = mkdtempSync(join(tmpdir(), "promote-"))
  const r = run(d)
  assert.equal(r.code, 2)
})
