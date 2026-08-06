// MODULE_CONTRACT: write-answer — appends one operator answer to <root>/.agent/answers.md
// Purpose:      one decision — the "append, or skip an exact duplicate" rule for answers.md lives in
//               exactly one place, so the two humans-facing entry points that write it —
//               bin/answer.mjs (operator types a shell command) and ext/index.mjs's izi_answer tool
//               (the assistant relays a chat reply, S13) — cannot drift into two different notions of
//               "already answered". Before S13 this logic lived inline in bin/answer.mjs alone; it is
//               pulled out here because a second caller arrived, not because bin/answer.mjs itself
//               changed shape.
// io:           fs
// Invariants:   answers.md only grows — a byte-identical (question, text) pair already present is not
//               appended twice; the .agent directory is created if absent
// Interface:    writeAnswer(root, { question, text }) -> { written: boolean, count: number }

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import { answerEntry } from "../core/answers.mjs"

// FUNCTION_CONTRACT: writeAnswer — appends one answer entry to <root>/.agent/answers.md
//   Input:        root — absolute path to the run root; raw — { question, text }
//   Dependencies: fs (mkdir/read/write)
//   Antecedent:   root — non-empty string; question and text — non-empty single-line strings
//                 (answerEntry's own antecedent — the caller validates emptiness/shape before this,
//                 the same division bin/answer.mjs already made)
//   Consequent:   success: { written: true, count } when the entry was appended (count = total
//                          question records in the file after this write, including this one);
//                          { written: false, count } when the exact (question, text) pair was already
//                          present — count is the total unchanged; directory created if absent either
//                          way
//                 failure: throws — none of its own; propagates fs errors (disk full, permissions) —
//                          the caller has no better diagnosis to substitute
export function writeAnswer(root, { question, text }) {
  const agentDir = join(root, ".agent")
  const out = join(agentDir, "answers.md")
  mkdirSync(agentDir, { recursive: true })
  const prev = existsSync(out) ? readFileSync(out, "utf8") : ""
  const entry = answerEntry({ question, text })
  const priorCount = prev.split("- вопрос:").length - 1
  if (prev.includes(entry)) return { written: false, count: priorCount }
  writeFileSync(out, prev + entry)
  return { written: true, count: priorCount + 1 }
}
