// MODULE_CONTRACT: answer-arrived.mjs — Approve is a barrier over a fact, never the fact itself
// Purpose:      one decision — did the OPERATOR'S ANSWER to THIS question actually land on disk
//               before the checkpoint was approved. Live-run defect this closes: the operator clicked
//               Approve three times, never once running bin/answer.mjs — each `cat .agent/answers.md`
//               before the next iteration hit "No such file or directory". The role was re-delegated
//               three times (three paid launches), each time rephrasing the same question, loops.brd
//               ran out, and the run died on kind:escalate "повторы исчерпаны" — a false diagnosis:
//               the role never failed, the operator never answered.
// io:           none
// Invariants:   an absent file (empty string) is not "an empty answer" — it is "no answer at all";
//               presence is judged by an exact `subject` match against core/answers.mjs's OWN parse
//               (`вопрос:`/`ответ:` pairing, standards/protocol.md §7 — the key compares literally),
//               not a second, independently-invented regex
// Interface:    answerArrived(before, after, subject) -> boolean
//
// Mirrored, not imported, in workflows/izi.js — same necessity as core/operator-channel.mjs (see that
// module's own top-of-file note): the pi-extensible-workflows sandbox that runs a workflow script
// exposes no import/require/process (SKILL.md: "Workflow JavaScript has no imports, filesystem,
// network, process, or timers"). The RULE — changed content AND a literal subject match, nothing else
// counts as "answered" — is proven once here under `node --test`; the inline copy in izi.js is a copy
// of a rule already proven, not a second declaration of it.

import { newAnswers } from "./answers.mjs"

// FUNCTION_CONTRACT: answerArrived — did the operator's answer to THIS question land on disk
//   Input:        before/after — `.agent/answers.md`'s raw text at two points: BEFORE the checkpoint
//                 pause was raised, and AFTER Approve was clicked; "" names "the file did not exist"
//                 at that point, the same convention izi.js already uses for a missing file — never
//                 conflated with a tool failure (standards/protocol.md, distinction 4)
//   Dependencies: subject — the question's key, the role's own `subject` field from its envelope;
//                 bound by the caller, compared literally against answers.md's `вопрос:` line
//                 (protocol.md §7 — the same field the answer_cmd's `--q=` must match dословно);
//                 a collaborator, not data this predicate owns — same status as newFit's `known`
//   Antecedent:   before and after are strings (possibly ""); subject is a non-empty string
//   Consequent:   success: true iff `after !== before` (the file actually changed — an Approve with
//                          no bin/answer.mjs run leaves it byte-identical, including the case where
//                          neither before nor after has a file at all) AND `after`, parsed by
//                          core/answers.mjs's own `newAnswers`, contains an entry whose `question`
//                          equals `subject` exactly;
//                          false in every other case, INCLUDING when `after` fails to parse
//                          (`newAnswers` returns "malformed") — a file that does not parse cannot be
//                          claimed to carry a well-formed record for `subject`
//                 failure: none — total; this is a boolean predicate, not a construction
export function answerArrived(before, after, subject) {
  if (after === before) return false
  const parsed = newAnswers(after)
  if (!parsed.ok) return false
  return parsed.value.some((a) => a.question === subject)
}
