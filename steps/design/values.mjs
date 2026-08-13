// MODULE_CONTRACT: values — step 9 pass A: the dictionary of everything the nodes of the change exchange
// Purpose:    one decision: is every value the design will speak of DECLARED — once, under a name a
//             later pass can refer to instead of retyping the text. A dictionary is not a projection
//             of the change; it is what makes the two projections joinable by a name rather than by
//             spelling, so `out` of one node and `in` of its neighbour become the same id or two
//             different ids, with nowhere left to drift (docs/design-step-by-step.md §4.B).
//             PURE: knows nothing of disk, io lives in ext/index.mjs. The grammar — docs/data-flow.md §4a.
// io:         none
// EXTERNAL_DEPENDENCY: core/xml.mjs — the tag scanner shared with steps/scope, steps/intake and the
//             rest of steps/design. One grammar family read by one piece of code; its
//             BUG_FIX_CONTEXT for ATTRS' quote-resilience is inherited here for free, and a value's
//             text carries exactly the characters that bought it (`steps="a -> b"`, `409 {conflict}`).
// Invariants: parseValues is total — any input, including undefined, yields an empty dictionary and
//             never throws (a guardrail that crashes on a malformed artifact turns "the role wrote
//             nonsense" — data, a red check, a redelegation — into "the run crashed", code 2, no
//             diagnosis); checkValues is total and returns EVERY blocker, not the first one;
//             the rule lives in exactly one place — rule 8's NUMBER is the one of docs/data-flow.md
//             §6 and is not restated here in prose
// Interface:  parseValues(xml) -> Map<id, text>  (with `dups` — see the contract)
//             checkValues({ values, frd }) -> string[]  — blockers, empty = green
//
// BUG_FIX_CONTEXT: live run 0bbf7054-3b8c-400f-b46f-83625777e097 (sandbox/runbox/eddi), the run that
//   bought this whole pass (docs/design-step-by-step.md §1-§2).
//   Previous: one generation wrote the values, the nodes and the routes into one 23,5 KB artifact.
//   Problem:  a value was typed twice — once in `out` of a node, once in `in` of its neighbour — and
//             rule 4 spent 33 and 49 blocker lines on the difference. Two attempts shared 8 facts out
//             of 48 and 42 (17 %): the role does not repair the artifact by feedback, it REGENERATES
//             it. Cost: 657 953 tokens, $0,54, 22 minutes, zero artifacts.
//   Fix:      the value is declared ONCE, in its own artifact, and everything downstream refers to it
//             by id. A red dictionary regenerates a page, not 23,5 KB.

import { attrs, tag } from "../../core/xml.mjs"

// FUNCTION_CONTRACT: parseValues — the dictionary from its text
//   Input:        xml — text of `.agent/values.xml`; type unconstrained
//   Dependencies: —
//   Antecedent:   any value — undefined/null/garbage are read as an empty dictionary
//   Consequent:   success: Map<id, text> in appearance order, texts trimmed at the edges; a missing
//                          `id` keys as "" and a missing `text` values as "", so neither is silently
//                          dropped from the artifact the role must repair. A REPEATED id keeps the
//                          FIRST declaration and its id is collected into the Map's `dups` array —
//                          resolving it here would make the dictionary depend on write order and
//                          hide the defect from the only function that reports it (the device is
//                          steps/graph/graph.mjs::mergeGraph's `duplicates`, same reason)
//                 failure: none — total
//   Purity:       pure
//   Interface:    parseValues(xml: unknown) -> Map<id, text> & { dups: readonly string[] }
//
// The Map is the shape every consumer wants — `values.get("v9")` for a card, `values.has("v9")` for a
// contract's id — so the duplicate evidence rides ON it rather than beside it in a wrapper: a wrapper
// would make every later pass unpack a pair to ask a Map one question.
export function parseValues(xml) {
  const values = new Map()
  const dups = []
  for (const m of String(xml || "").matchAll(tag("value"))) {
    const a = attrs(m[1])
    const id = a.id || ""
    if (values.has(id)) { dups.push(id); continue }
    values.set(id, String(a.text || "").trim())
  }
  values.dups = Object.freeze(dups)
  return values
}

// FUNCTION_CONTRACT: checkValues — the guardrail of pass A
//   Input:        { values, frd }
//                 values — parseValues' parse; the duplicate evidence is read off its `dups`
//                 frd    — the parse of `.agent/frd.xml` AS steps/intake/frd.mjs::parseFrd returns
//                          it: `failures` are the ELEMENTS (a code lives in `.code`). Parsing that
//                          file belongs to the intake slice; here it is a DEPENDENCY
//   Antecedent:   values — a Map as parseValues builds it (a hand-built Map with no `dups` is read
//                 as "no repeats", which is true of any Map built by set()); frd — an object, a
//                 missing `failures` read as empty
//   Consequent:   success: string[] of blockers, empty = green. Rule 8 keeps the number it has in
//                          docs/data-flow.md §6; the two checks the dictionary owns are the pass's
//                          own and carry no number, because §6 numbers the rules of the two
//                          PROJECTIONS and the dictionary is neither
//                 failure: none — total, "the dictionary is bad" is DATA, not a function failure
//   Purity:       pure
export function checkValues({ values = new Map(), frd = {} } = {}) {
  const B = []

  // A value is a NAME and a TEXT, and both are load-bearing: the name is what a contract writes
  // instead of the text, the text is what the script substitutes back at assembly. Either half
  // missing makes the row unusable by the pass that reads it, and unusable is not "empty" — a
  // contract referring to it would resolve to nothing at all.
  for (const [id, text] of values) {
    if (!id) B.push(`значение без id: text="${text}" — на него нечем сослаться из контракта, имя обязательно`)
    else if (!text) B.push(`значение ${id} без text — подставлять при сборке нечего`)
  }

  // One name, one value. A repeated id makes every reference to it ambiguous, and the ambiguity is
  // invisible downstream: a contract says `v9` and gets whichever declaration the reader kept.
  for (const id of new Set(values.dups || [])) {
    B.push(`значение ${id} объявлено дважды — имя выдаётся один раз, иначе ссылка из контракта неоднозначна`)
  }

  // Rule 8. A failure the requirement DECLARED and the dictionary does not carry. Everything
  // downstream speaks in ids, so a failure absent from HERE is a failure no contract can name, no
  // route can take and no unit of `$START_TESTS` can cover — it reaches step 15 as a `<failure>`
  // nobody implements, and the error path dies silently between step 6 and the ticket.
  //
  // This is the earliest place the failure is decidable at all: the check is a set membership over
  // texts, and texts are what this artifact is. SUBSTRING, not equality: the failure's `code` is a
  // literal of the FRD (`FRUIT_NOT_FOUND`) and the value names that literal AND how the module hands
  // it out (`404 FRUIT_NOT_FOUND`); prescribing that wording would be inventing a second grammar for
  // something the role already writes in one.
  const declared = (frd.failures || []).map((f) => String((f && f.code) || "").trim()).filter(Boolean)
  if (declared.length) {
    const texts = [...values.values()]
    for (const code of declared) {
      if (!texts.some((t) => t.includes(code))) {
        B.push(`8 отказ ${code} объявлен в FRD, но не назван ни одним значением — маршрута у него не будет, значит не будет и юнита; объяви значение, которым узел его отдаёт`)
      }
    }
  }

  return B
}
