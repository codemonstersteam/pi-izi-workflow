#!/usr/bin/env node
// MODULE_CONTRACT: receipt.mjs — writes the one file that closes a step, .agent/receipts/<id>.json
// Purpose:      one decision — "step done" is a receipt on disk, never the presence of `out`
//               (standards/protocol.md, «Квитанция закрывает шаг»). Writing it is the harness's
//               job, not the role's: a role that could write its own receipt could also fabricate
//               "done" over a broken artifact.
// io:           fs
// Invariants:   writeReceipt is idempotent — a receipt already on disk is never overwritten, so its
//               `at` never moves once a step is closed, and calling it twice for the same step
//               produces exactly one decisions.log line, not two
// Interface:    writeReceipt({ root, step }) -> { written: boolean, path: string }
//
//   node bin/receipt.mjs --step=<id> [--root=<путь>]
//
// Пишет .agent/receipts/<id>.json = { step, at, by: "harness" } и одну строку в
// .agent/decisions.log (журнал — след харнеса, не модели — donor F2).

import { writeFileSync, mkdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import { appendDecision } from "./decisions-log.mjs"
import { isMain } from "./cli-entry.mjs"

// FUNCTION_CONTRACT: writeReceipt — closes a step by writing its receipt, once
//   Input:        raw — { root: absolute run root, step: non-empty step id string }
//   Dependencies: fs (read/write/mkdir), Date.now() for `at`
//   Antecedent:   root is a non-empty string naming an existing (or creatable) directory; step is a
//                 non-empty string
//   Consequent:   success: { written: true, path } on first call — receipt file created, one
//                          decisions.log line appended; { written: false, path } on a repeat call —
//                          receipt already existed, nothing written, no duplicate log line
//                 failure: throws Error if step is empty — a receipt without a step key closes
//                          nothing
export function writeReceipt({ root, step }) {
  if (!step) throw new Error("writeReceipt: step пуст — квитанция без ключа не закрывает шаг")
  const dir = join(root, ".agent", "receipts")
  const path = join(dir, `${step}.json`)
  if (existsSync(path)) return { written: false, path }
  mkdirSync(dir, { recursive: true })
  const body = { step, at: new Date().toISOString(), by: "harness" }
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`)
  appendDecision(root, { step, actor: "harness", note: `квитанция записана: ${path}` })
  return { written: true, path }
}

function main() {
  const args = process.argv.slice(2)
  const opt = (n) => { const h = args.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : "" }
  const root = opt("root") || process.cwd()
  const step = opt("step")
  if (!step) { console.error('usage: receipt.mjs --step=<id> [--root=<путь>]'); process.exit(2) }
  const { written, path } = writeReceipt({ root, step })
  console.log(written ? `✓ квитанция записана: ${path}` : `✓ квитанция уже была: ${path}`)
}

if (isMain(import.meta.url)) main()
