// MODULE_CONTRACT: weight — step 7's pure core: the FORMS of the deltas → one word of SemVer
// Purpose:    one decision — how heavy the change is, so that step 8 knows whether a design is
//             mandatory and step 10 knows whether the capability ships behind a toggle. The weight is
//             a SUM OF FORMS, never a reading of the prose in `from`/`to`: what a change does to a
//             call that exists today is a judgement, and it was already made by the role at step 6
//             (steps/intake/intake.md, STRATEGY §8). This module only folds it.
//             PURE: knows no disk; the io — reading .agent/frd.xml, writing AND ERASING .agent/mode —
//             lives in ext/index.mjs.
// io:         none
// EXTERNAL_DEPENDENCY: steps/intake/frd.mjs::FRD_FORM — the vocabulary of forms is declared ONCE, by
//             the step that produces them. MODE_TABLE below is judged against it by the test: a sixth
//             form added to the vocabulary without a weight reddens there, instead of silently
//             becoming a `bad-form` refusal on a live run.
// Invariants: MODE_TABLE and RANK are fixed at load; newMode is pure and TOTAL — any input, including
//             undefined, yields a Result and never throws; the fold is COMMUTATIVE (a maximum), so
//             the order of deltas in the artifact cannot change the weight — the same property that
//             makes the graph merge order-independent (docs/graph.md)
// Interface:  MODE_TABLE — form → weight, as data
//             newMode({ deltas }) -> Result<{ mode, why[] }, "no-delta" | "unknown-delta" | "bad-form">

import { ok, err } from "../../core/result.mjs"

// The table of docs/weight.md §3. `Unknown` is deliberately ABSENT: it is not a weight but a refusal
// (below), and a row for it here would let a run continue on "could not classify".
export const MODE_TABLE = Object.freeze({
  Added: "minor",     // the contract only grew; the call that exists behaves as before
  Changed: "major",   // an existing element changed FOR an existing call
  Removed: "major",   // an element of the contract is gone
  Fixed: "patch",     // the contract does not move; behaviour goes wrong → right
})

// The weight is the MAXIMUM over the deltas, not the first one read.
const RANK = Object.freeze({ patch: 1, minor: 2, major: 3 })

// FUNCTION_CONTRACT: newMode — step 7's artifact: the weight of the change and what earned it
//   Input:        { deltas } — the `<delta>` elements of .agent/frd.xml as parseFrd returns them
//                 (steps/intake/frd.mjs), each an attribute map: { op, form, node, why }
//   Dependencies: MODE_TABLE, RANK
//   Antecedent:   any value — a non-array, undefined and [] are all read as "no deltas"
//   Consequent:   success: { mode, why[] } — `mode` one of patch | minor | major; `why[]` the
//                          `op (form)` of every delta that reached the maximum, in the artifact's
//                          order, so the operator sees at the gate WHAT made the weight without
//                          opening the FRD
//                 failure: "no-delta"      — nothing to weigh
//                          "bad-form"      — a word outside the vocabulary: the artifact is from
//                                            another grammar version and is not judgeable at all
//                          "unknown-delta" — the role could not classify: THE rule of this step, the
//                                            detail names every op with its own `why`
//   Purity:       pure
//
// The last two repeat F3 and F7 of step 6, and that is not distrust of the guardrail: .agent/frd.xml
// outlives the run that wrote it (newRun carries away the run's STATE, not the artifacts), so this
// core is handed files older than the current grammar. A pure core owes totality on any input
// (standards/code.md) — a refusal is data, a throw is a crashed run with no diagnosis.
export function newMode({ deltas } = {}) {
  const list = Array.isArray(deltas) ? deltas : []
  if (!list.length) return err("no-delta", "в FRD ни одной <delta> — взвешивать нечего")

  const at = (d) => d.op || "(delta без op)"

  const bad = list.filter((d) => d.form !== "Unknown" && !MODE_TABLE[d.form])
  if (bad.length) {
    return err("bad-form", `форма вне словаря: ${bad.map((d) => `${at(d)} → "${d.form || ""}"`).join(", ")}; допустимо ${Object.keys(MODE_TABLE).join(" | ")} | Unknown`)
  }

  // THE rule of step 7. An Unknown is a legal FRD (it passes F3 and is counted by newFrd) precisely so
  // that "could not classify" reaches a human instead of being hidden behind a plausible form — and
  // this is the place where it becomes a stop: a weight guessed over an unclassified delta would be
  // the silent default the whole pipeline exists to forbid (docs/weight.md §5).
  const unknown = list.filter((d) => d.form === "Unknown")
  if (unknown.length) {
    return err("unknown-delta", unknown.map((d) => `${at(d)}: ${d.why || "(без why — дефект шага 6, F3)"}`).join("\n  "))
  }

  const mode = list.reduce((m, d) => (RANK[MODE_TABLE[d.form]] > RANK[m] ? MODE_TABLE[d.form] : m), "patch")
  const why = list.filter((d) => MODE_TABLE[d.form] === mode).map((d) => `${at(d)} (${d.form})`)
  return ok(Object.freeze({ mode, why: Object.freeze(why) }))
}
