import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync, mkdtempSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { writeReceipt } from "./receipt.mjs"

const CLI = join(dirname(fileURLToPath(import.meta.url)), "receipt.mjs")
const run = (root, extra = []) => {
  try { return { code: 0, out: execFileSync("node", [CLI, `--root=${root}`, ...extra], { encoding: "utf8" }) } }
  catch (e) { return { code: e.status, out: `${e.stdout || ""}${e.stderr || ""}` } }
}

// --- writeReceipt (imported directly — pure enough to call without the CLI wrapper) --------------

test("writeReceipt: пишет .agent/receipts/<id>.json с step/at/by", () => {
  const d = mkdtempSync(join(tmpdir(), "receipt-"))
  const r = writeReceipt({ root: d, step: "brd" })
  assert.equal(r.written, true)
  const body = JSON.parse(readFileSync(join(d, ".agent", "receipts", "brd.json"), "utf8"))
  assert.equal(body.step, "brd")
  assert.equal(body.by, "harness")
  assert.equal(typeof body.at, "string")
})

test("writeReceipt: идемпотентен — второй вызов не переписывает at и не пишет вторую строку журнала", () => {
  const d = mkdtempSync(join(tmpdir(), "receipt-"))
  const first = writeReceipt({ root: d, step: "task" })
  const firstAt = JSON.parse(readFileSync(first.path, "utf8")).at
  const second = writeReceipt({ root: d, step: "task" })
  assert.equal(second.written, false)
  assert.equal(JSON.parse(readFileSync(first.path, "utf8")).at, firstAt)
  const log = readFileSync(join(d, ".agent", "decisions.log"), "utf8")
  assert.equal(log.split("\n").filter(Boolean).length, 1)
})

test("writeReceipt: без step — отказ (антецедент)", () => {
  const d = mkdtempSync(join(tmpdir(), "receipt-"))
  assert.throws(() => writeReceipt({ root: d, step: "" }))
})

// --- CLI wrapper -----------------------------------------------------------------------------

test("CLI: --step=<id> закрывает шаг и уходит в decisions.log", () => {
  const d = mkdtempSync(join(tmpdir(), "receipt-"))
  const r = run(d, ["--step=brd"])
  assert.equal(r.code, 0)
  assert.equal(existsSync(join(d, ".agent", "receipts", "brd.json")), true)
  assert.match(readFileSync(join(d, ".agent", "decisions.log"), "utf8"), /step=brd/)
})

test("CLI: без --step= — usage и exit 2", () => {
  const d = mkdtempSync(join(tmpdir(), "receipt-"))
  const r = run(d)
  assert.equal(r.code, 2)
  assert.match(r.out, /usage/)
})
