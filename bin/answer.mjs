#!/usr/bin/env node
// MODULE_CONTRACT: answer.mjs — writes the operator's answer to .agent/answers.md under the question's key
// Purpose:    one decision — the role prints answer_cmd in its own envelope, and this command
//             ANSWERS it, not the operator by hand: the code owns format and accumulation, not a
//             human's care, and the invented-default rule checks numbers against exactly this file
// io:         fs
// Invariants: answers.md only grows — prior entries are never rewritten or lost; the same
//             (question, answer) pair does not land in the file twice in a row
// Interface:  — (no export: a CLI pipe, 0 tokens, io on top of bin/decisions-log.mjs)
//
// Port of izi-flow-v2/bin/answer.mjs 1:1 (PLAN.md §3, task S3), with one difference from the donor:
// the .agent/decisions.log journal is written through bin/decisions-log.mjs, not core/log.mjs —
// core/*.mjs was out of scope for this slice's S3 (see bin/decisions-log.mjs MODULE_CONTRACT), not
// because the format changed: the journal line is byte-for-byte the same shape.
//
//   node bin/answer.mjs --q="предел размера ответа?" --text="20"
//
// The command is printed by the role ITSELF in its envelope's `answer_cmd` field, the router
// executes it. Why not "the operator appends the file by hand": the format would then depend on a
// human's care, the question→answer link would be lost, and the `invented-default` rule checks
// numbers against exactly this file — an operator's typo would turn into a red check on the role.
//
// The `--q=` key is NOT checked against the asked question HERE — that check is done by the role's
// envelope parsing (`answer-cmd-key-mismatch`, donor F5). Duplicating it here would mean keeping one
// requirement in two places — and they would drift apart one day.
//
// S13: the disk write (mkdir/read/dedupe/write) moved to bin/write-answer.mjs — a second caller
// appeared (ext/index.mjs::izi_answer, the assistant's tool call from a background checkpoint), and
// the "a repeat of the same (question, answer) is not duplicated" rule cannot live in two copies.
// This command is a CLI wrapper around the same rule, not a second implementation of it.

import { appendDecision } from "./decisions-log.mjs"
import { looksLikeTemplate } from "../core/answers.mjs"
import { writeAnswer } from "./write-answer.mjs"

const args = process.argv.slice(2)
const opt = (n) => { const h = args.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : "" }
const ROOT = opt("root") || process.cwd()
const Q = opt("q")
const TEXT = opt("text")

if (!Q || !TEXT) { console.error('usage: answer.mjs --q="<вопрос>" --text="<ответ>"'); process.exit(2) }
// A template copied from the role's example verbatim into the file is not an answer. It's the same
// class of defect as "the model copied the form instead of the value": downstream it would silently
// become the source of a number for fit.
if (looksLikeTemplate(TEXT)) { console.error("✗ ответ выглядит шаблоном, а не ответом оператора"); process.exit(2) }

// Cumulative: answers from prior exchanges stay put, or the role would lose them on the next question.
const written = writeAnswer(ROOT, { question: Q, text: TEXT })
if (!written.written) { console.log("✓ ответ уже записан"); process.exit(0) }
console.log(`✓ .agent/answers.md: ${written.count} ответов`)

// The journal is a trace, not a gate (F2): we write it ONLY when the answer was actually appended —
// the duplicate check above already stopped the process earlier, and there will be no repeat line
// in the journal. "_answer" is not a step id: the answer_cmd protocol carries only the question and
// the answer, the step the question belongs to is not passed in its shape (standards/workflow.md,
// operator channel). actor=izi, as at every other transition point — the router executes the
// command, even though the operator supplied the value.
try {
  appendDecision(ROOT, { step: "_answer", actor: "izi", note: `ответ оператора записан по ключу «${Q}»` })
} catch { /* the journal is a trace, not a gate: a write failure must not crash answer.mjs */ }
