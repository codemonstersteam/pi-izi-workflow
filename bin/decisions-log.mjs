// MODULE_CONTRACT: decisions-log — appends one line to .agent/decisions.log
// Purpose:      one decision — the run journal is written by the HARNESS, never by the model
//               (donor finding F2: a journal the model writes about itself is not evidence). Both
//               bin/receipt.mjs and bin/answer.mjs need this, so the format lives here once instead
//               of two copies drifting apart. The donor keeps this pure in core/log.mjs
//               (core/*.mjs is out of scope for this task — PLAN.md §S3 territory is bin/*.mjs
//               only), so the same tab-separated shape is reproduced here as an io module instead.
// io:           fs
// Invariants:   one call appends exactly one line ending in "\n"; note is escaped so that "\t"/"\n"
//               inside it cannot be mistaken for a field/record separator
// Interface:    appendDecision(root, { step, actor, note }) -> void
//
// Format: `<ISO>\tstep=<id>\tactor=<who>\t<note-escaped>\n`. Tab separates fields, newline separates
// records — a stall watch (not built on this slice) could count lines. actor defaults to "harness"
// when falsy: every call site on this slice is the harness itself, not the model, not the operator.

import { appendFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"

function escapeNote(s) {
  // Order matters: the backslash first, or the following replacements would double it.
  return String(s).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\t/g, "\\t")
}

// FUNCTION_CONTRACT: appendDecision — writes one journal line under <root>/.agent/decisions.log
//   Input:        root — absolute path to the run root; raw — { step, actor, note }
//   Dependencies: fs (append + mkdir), Date.now() for the timestamp
//   Antecedent:   root is a non-empty string; step and note are non-empty truthy values; actor may
//                 be falsy (defaults to "harness")
//   Consequent:   success: one line appended to <root>/.agent/decisions.log, directory created if
//                          absent; returns undefined
//                 failure: throws Error if step or note is empty — a record without a step is not
//                          linkable to any transition, a record without a note carries no fact
export function appendDecision(root, { step, actor, note }) {
  if (!step) throw new Error("appendDecision: step пуст — запись без шага не свяжется ни с одним переходом")
  if (!note) throw new Error("appendDecision: note пуста — запись без заметки не несёт факта")
  const who = actor || "harness"
  const at = new Date().toISOString()
  const line = `${at}\tstep=${step}\tactor=${who}\t${escapeNote(note)}\n`
  const agentDir = join(root, ".agent")
  mkdirSync(agentDir, { recursive: true })
  appendFileSync(join(agentDir, "decisions.log"), line)
}
