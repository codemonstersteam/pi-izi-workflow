// MODULE_CONTRACT: write-answer — appends one exchange to <root>/.agent/answers.md
// Purpose:      one decision — the "append, or skip an exact duplicate" rule for answers.md lives in
//               exactly one place, so the two humans-facing entry points that write it —
//               bin/answer.mjs (operator types a shell command) and ext/index.mjs's izi_answer tool
//               (the assistant relays a chat reply, S13) — cannot drift into two different notions of
//               "already answered". Before S13 this logic lived inline in bin/answer.mjs alone; it is
//               pulled out here because a second caller arrived, not because bin/answer.mjs itself
//               changed shape.
// io:           fs
// Invariants:   answers.md only grows — a byte-identical exchange already present is not appended
//               twice; the .agent directory is created if absent; nothing is written when the format
//               refuses the value (newExchange), so a mis-parsing file cannot be produced here
// Interface:    writeAnswer(root, pairs) -> { written: boolean, count: number, why?: string }

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import { newExchange, newAnswers } from "../core/answers.mjs"

// FUNCTION_CONTRACT: writeAnswer — appends one exchange to <root>/.agent/answers.md
//   Input:        root — absolute path to the run root; pairs — [{ n, question, text }]
//   Dependencies: newExchange (the format and its refusals), newAnswers (counting), fs
//   Antecedent:   root — non-empty string; pairs — whatever the caller collected: this function does
//                 NOT trust it, newExchange judges it (S21: an antecedent that nothing checks is a
//                 comment, and this one cost live run 46edab60)
//   Consequent:   success: { written: true, count } when the exchange was appended (count = answered
//                          questions in the file after this write); { written: false, count } when a
//                          byte-identical exchange was already present
//                 failure: { written: false, count: 0, why } — the format refused the value; nothing
//                          was written. The caller owns the diagnosis for its own audience
export function writeAnswer(root, pairs) {
  const block = newExchange(pairs)
  if (!block.ok) return { written: false, count: 0, why: block.error.detail }

  const agentDir = join(root, ".agent")
  const out = join(agentDir, "answers.md")
  mkdirSync(agentDir, { recursive: true })
  const prev = existsSync(out) ? readFileSync(out, "utf8") : ""
  const priorCount = (newAnswers(prev).value || []).length
  if (prev.includes(block.value)) return { written: false, count: priorCount }
  writeFileSync(out, prev + block.value)
  return { written: true, count: priorCount + pairs.length }
}
