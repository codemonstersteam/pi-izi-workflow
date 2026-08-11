// MODULE_CONTRACT: task — the pipeline's entry rule: one task = one input, ≤300 lines, non-empty
// Purpose:    one decision — the "one task = one input" limit (the line count past which TASK.md must
//             be split by a human, never by a role) is declared and enforced in ONE place, as a PURE
//             rule. S11: this used to be an io pipe (steps/task/validate-task.mjs, which read the file
//             itself); the extension now reads the bytes (readText) and passes the text HERE — the
//             rule knows nothing of disk, the io plumbing lives in ext/index.mjs.
// io:         none
// Invariants: TASK_LINES_CAP does not change at run time; empty text (0 words after trim) and text
//             past the limit are two different refusals, told apart by their error class
// Interface:  TASK_LINES_CAP — the number, the input's line limit
//             checkTaskText(text) -> Result<{lines, words}, "empty" | "too-long">

import { ok, err } from "../../core/result.mjs"

// One task = one input. More than that must be split, and the operator splits it, not a role.
export const TASK_LINES_CAP = 300

// FUNCTION_CONTRACT: checkTaskText — judges TASK.md's bytes by one line limit
//   Input:        text — the raw text of TASK.md
//   Dependencies: —
//   Antecedent:   any value — coerced with String(text || ""), the range is not narrowed: the nature
//                 of the rule is to judge text that may be anything at all, including absent
//   Consequent:   success: { lines, words } — the text's line and word counts
//                 failure: "empty" — 0 words after trim; silence is not a requirement
//                          "too-long" — more lines than TASK_LINES_CAP; one task = one input
export function checkTaskText(text) {
  const t = String(text || "")
  const lines = t.split("\n").length
  const words = t.trim().split(/\s+/).filter(Boolean).length
  if (!words) return err("empty", "пуст — молчание не является требованием")
  if (lines > TASK_LINES_CAP) {
    return err("too-long", `${lines} строк при пределе ${TASK_LINES_CAP} — одна задача = один вход, эту надо делить`)
  }
  return ok({ lines, words })
}
