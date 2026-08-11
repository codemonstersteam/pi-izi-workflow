// MODULE_CONTRACT: cache — reuse a computed part, or recompute it
// Purpose:    one decision — under what conditions a cell's part, left over from a previous run,
//             still answers the same question. PURE: knows no disk; the io lives in ext/index.mjs
//             (`reuse`/`remember`), the decision lives here.
// io:         none
// EXTERNAL_DEPENDENCY: steps/scope/part.mjs::GRAMMAR_VERSION — the version of the part grammar.
//             Compared here but declared there, because whoever changes the rules changes it. A
//             change that raises a rule and forgets the version silently hands the new guardrail an
//             artifact of the old shape.
// EXTERNAL_DEPENDENCY (conceptual): the files' `sha1` comes from step 3, in
//             `.agent/survey-plan.json`. An empty `sha1` does not mean "unchanged", it means
//             "nothing to compare with" — that is a MISS, never a hit.
// Invariants: decide is total — any input, including undefined, yields a decision rather than a
//             throw; no branch answers "reuse" by default: a hit is assembled from conditions that
//             HELD, a miss from the first that did not, and a miss always carries its reason as a
//             string; this module does not know WHERE an entry is stored, only what it is.
// Interface:  entryFor(cell, grammar) -> Entry     — what to remember about a computed cell
//             decide({ cell, stored, grammar }) -> { reuse: boolean, why: string }

// FUNCTION_CONTRACT: entryFor — the cache entry for a computed cell
//   Input:        cell — a plan cell { id, kind, files: [{ path, sha1 }] }
//                 grammar — the grammar version the part was accepted under
//   Dependencies: —
//   Antecedent:   the cell has already passed the guardrail: only accepted work is remembered
//   Consequent:   success: { id, kind, grammar, files: [{ path, sha1 }] } — composition and content,
//                          sorted by path so the comparison does not depend on walk order
//                 failure: none — total
//   Purity:       pure
//   Interface:    entryFor(cell, grammar: string) -> Entry
export function entryFor(cell, grammar) {
  const c = cell || {}
  return {
    id: String(c.id || ""),
    kind: String(c.kind || ""),
    grammar: String(grammar == null ? "" : grammar),
    files: (c.files || [])
      .map((f) => ({ path: String(f.path || ""), sha1: String(f.sha1 || "") }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  }
}

const key = (entry) => entry.files.map((f) => f.path).join("\n")

// FUNCTION_CONTRACT: decide — reuse a cell's part, or call the scout
//   Input:        { cell, stored, grammar } — a cell of the CURRENT plan; the previous run's entry
//                 (entryFor's shape, or null/undefined when there is none); the current grammar
//   Dependencies: entryFor, key
//   Antecedent:   any values; a missing entry is an ordinary branch, not an error
//   Consequent:   success: { reuse, why } — `why` names the FIRST condition that did not hold and is
//                          fit for the run's log: no-entry · grammar · kind · composition · content ·
//                          no-sha1. The order of checks runs from cheapest to most specific, which is
//                          also the order of interest: a grammar version invalidates the whole cache,
//                          composition invalidates one cell
//                 failure: none — total. "The cache did not fit" is DATA, not a refusal
//   Purity:       pure
//   Interface:    decide({ cell, stored, grammar }) -> { reuse: boolean, why: string }
export function decide({ cell, stored, grammar }) {
  const now = entryFor(cell, grammar)
  if (!stored || !Array.isArray(stored.files)) return { reuse: false, why: "no-entry" }
  const was = entryFor(stored, stored.grammar)

  if (was.grammar !== now.grammar) return { reuse: false, why: `grammar ${was.grammar || "?"}→${now.grammar}` }
  if (was.kind !== now.kind) return { reuse: false, why: `kind ${was.kind || "?"}→${now.kind}` }
  if (key(was) !== key(now)) return { reuse: false, why: "composition" }

  // An empty sha1 on either side means "nothing to compare with". Treating that as a match would
  // substitute a default for a fact exactly where the cache must be stricter than the guardrail: the
  // guardrail still judges the part, but the decision "do not call the scout" has nothing to check.
  for (let i = 0; i < now.files.length; i++) {
    if (!now.files[i].sha1 || !was.files[i].sha1) return { reuse: false, why: `no-sha1 ${now.files[i].path}` }
    if (now.files[i].sha1 !== was.files[i].sha1) return { reuse: false, why: `content ${now.files[i].path}` }
  }
  return { reuse: true, why: "hit" }
}
