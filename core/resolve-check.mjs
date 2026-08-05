// MODULE_CONTRACT: resolve-check.mjs — a step's declared {cmd, args[]} → one shell command string
// Purpose:      one decision — `{{artifact}}` is the ONLY placeholder name a step's `check` may
//               carry, and resolving it is a pure substitution, not a second parser
//               (standards/protocol.md, «Что обязан объявить шаг»: `{{artifact}}` in `args` — the
//               resolver substitutes the STAGING path, since the check runs before promote and only
//               the staging copy exists on disk at that moment). This module is mirrored INLINE in
//               workflows/izi.js (same reason as core/operator-channel.mjs and
//               core/answer-arrived.mjs: the workflow sandbox has no import/require/fs — see that
//               file's own top-of-file note) — proven here once by node --test, copied there by hand.
// io:           none
// Invariants:   resolveCheck never mutates `check`; a literal `{{artifact}}` occurring more than
//               once inside one arg is replaced everywhere in that arg, not just the first
// Interface:    resolveCheck(check, artifact) -> string

// FUNCTION_CONTRACT: resolveCheck — a step's check object plus the artifact path it judges, as one
//                     runnable shell command line
//   Input:        raw — check: { cmd: non-empty string, args: string[] }; artifact: non-empty string
//   Dependencies: —
//   Antecedent:   check.cmd is a non-empty string; check.args is an array of strings (possibly
//                 empty — a check with no placeholder at all is admissible, e.g. a future step
//                 whose gate takes no artifact argument); artifact is a non-empty string
//   Consequent:   success: `cmd` followed by each arg, space-joined, every literal `{{artifact}}`
//                          substring inside each arg replaced by `artifact`
//                 failure: none — total over the stated antecedent
export function resolveCheck(check, artifact) {
  const args = (check.args || []).map((a) => a.replaceAll("{{artifact}}", artifact))
  return [check.cmd, ...args].join(" ")
}
