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
//             diagnosis); valueFacts is total and returns EVERY finding, not the first one;
//             the rule lives in exactly one place — rule 8's NUMBER is the one of docs/data-flow.md
//             §6 and is not restated here in prose
// Interface:  parseValues(xml) -> Map<id, text>  (with `dups` — see the contract)
//             endsOf(frd) -> End[]
//             valueFacts({ values, frd }) -> Fact[]  — every finding, in the report's order
//             checkEnds({ values, frd, uc }) -> Fact[]  — the facts a PART can be judged by
//             checkValues({ values, frd }) -> string[]  — blockers, empty = green
//
// TWO RULES, TWO OPERANDS, AND THE FIELD THAT DECIDES WHICH IS WHICH (D31). Pass A is written by a
// SWARM — one agent per FRD scenario — and a part holds the values of ONE use case: its ends, the
// failures of that use case, the calls of its own nodes. A finding whose operands lie inside one part
// is judged ON the part (`local: true` — a row without a name or without a text, a repeated id, rule
// 12 for the ends of THIS use case, and rule 12's mirror, which resolves a token against the whole
// FRD the part is handed); a finding whose operand is the SET of all values cannot be asked of a part
// at all (rule 8 — a failure code is looked for across every text of the dictionary, and the text
// that carries it may be another part's). Let rule 8 and the other use cases' ends loose on the parts
// of `eddi` and its twelve parts answer with 422 phantom lines where the whole answers with none.
// `checkValues` is the same records rendered in TODAY'S order, which is why steps/design/values.test.mjs
// judges this decomposition without one edit — that file is the seam.
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

import { attrs, tag, tokens } from "../../core/xml.mjs"

// FUNCTION_CONTRACT: parseValues — the dictionary from its text
//   Input:        xml — text of `.agent/values.xml`; type unconstrained
//   Dependencies: core/xml.mjs::tokens — `closes` is a list of TOKENS, and its separator is declared
//                 for the whole class there, not chosen here
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
//   Interface:    parseValues(xml: unknown) -> Map<id, text> & { dups: readonly string[],
//                                                                closes: Map<id, readonly token[]> }
//
// The Map is the shape every consumer wants — `values.get("v9")` for a card, `values.has("v9")` for a
// contract's id — so the duplicate evidence rides ON it rather than beside it in a wrapper: a wrapper
// would make every later pass unpack a pair to ask a Map one question. `closes` rides the same way
// and for the same reason: rule 13 lives in the NEXT pass's guardrail and needs the attribution of a
// value without re-parsing the artifact this one already read.
export function parseValues(xml) {
  const values = new Map()
  const dups = []
  const closes = new Map()
  for (const m of String(xml || "").matchAll(tag("value"))) {
    const a = attrs(m[1])
    const id = a.id || ""
    if (values.has(id)) { dups.push(id); continue }
    values.set(id, String(a.text || "").trim())
    // `closes` is a list of TOKENS, cut by the one declaration of that class (core/xml.mjs::tokens).
    // The separator is not this reader's decision: run 27b37fdb died on this line reading ` | ` — the
    // form its OWN order taught — as three tokens, one of them `|`.
    const ends = tokens(a.closes)
    if (ends.length) closes.set(id, ends)
  }
  values.dups = Object.freeze(dups)
  values.closes = closes
  return values
}

// The ends of a use case, as TOKENS: the entry (its first `<step>`), the exit (its `<post>`) and one
// per `<ext>`. The set is derived from the FRD and never from the dictionary — that asymmetry is the
// rule: the requirement says how many ends the change has, the dictionary answers for them.
// Exported because rule 13 resolves the same tokens against the graph one pass later, and two
// spellings of one token would drift the day an id gains a dot.
export function endsOf(frd = {}) {
  const ends = []
  for (const u of frd.usecases || []) {
    const id = String((u && u.id) || "").trim()
    if (!id) continue
    ends.push({ token: `${id}/in`, uc: id, side: "in", text: (u.steps || [])[0] || "" })
    ends.push({ token: `${id}/post`, uc: id, side: "out", text: u.post || "" })
    for (const e of u.exts || []) {
      const eid = String((e && e.id) || "").trim()
      if (!eid) continue
      ends.push({ token: `${id}/${eid}`, uc: id, side: "out", text: e.outcome || "" })
    }
  }
  return ends
}

// A FINDING OF PASS A, and its three fields beside the text:
//   · `id`    — the value the finding is about, when there is one. It is the ADDRESS of the repair:
//               the merge knows which part wrote which id (steps/design/parts.mjs::mergeValues)
//   · `uc`    — the use case the finding is about, when the finding is about an END rather than a row.
//               Its addressees are every scenario of that use case, exactly as for rule 13 one pass
//               lower (steps/design/parts.mjs::blameNodes)
//   · `local` — TRUE when every operand of the finding lies inside one part, i.e. when a PART can be
//               judged by it. See the module contract: this field IS the decomposition.
const fact = (rule, text, { id = "", uc = "", local = false } = {}) =>
  Object.freeze({ rule, text, id, uc, local })

// FUNCTION_CONTRACT: valueFacts — every finding of pass A, in the order the report prints them
//   Input:        { values, frd }
//                 values — parseValues' parse; the duplicate evidence is read off its `dups`
//                 frd    — the parse of `.agent/frd.xml` AS steps/intake/frd.mjs::parseFrd returns
//                          it: `failures` are the ELEMENTS (a code lives in `.code`). Parsing that
//                          file belongs to the intake slice; here it is a DEPENDENCY
//   Dependencies: fact, endsOf
//   Antecedent:   values — a Map as parseValues builds it (a hand-built Map with no `dups` is read
//                 as "no repeats", which is true of any Map built by set()); frd — an object, a
//                 missing `failures` read as empty
//   Consequent:   success: Fact[] in the report's own order — the rows first (a value with no name,
//                          a value with no text), then the repeated ids, then rule 8, then rule 12's
//                          open ends, then rule 12's mirror
//                 failure: none — total, "the dictionary is bad" is DATA, not a function failure
//   Purity:       pure
export function valueFacts({ values = new Map(), frd = {} } = {}) {
  const B = []

  // A value is a NAME and a TEXT, and both are load-bearing: the name is what a contract writes
  // instead of the text, the text is what the script substitutes back at assembly. Either half
  // missing makes the row unusable by the pass that reads it, and unusable is not "empty" — a
  // contract referring to it would resolve to nothing at all.
  for (const [id, text] of values) {
    if (!id) B.push(fact(0, `значение без id: text="${text}" — на него нечем сослаться из контракта, имя обязательно`, { local: true }))
    else if (!text) B.push(fact(0, `значение ${id} без text — подставлять при сборке нечего`, { id, local: true }))
  }

  // One name, one value. A repeated id makes every reference to it ambiguous, and the ambiguity is
  // invisible downstream: a contract says `v9` and gets whichever declaration the reader kept.
  // …and inside a PART it stays decidable in full: the ids of a part are its own prefix and nobody
  // else's, so two parts CANNOT collide (steps/design/parts.mjs::valueParts assigns the prefix, the
  // same discipline by which the machine assigns a route id). A repeat is therefore always a repeat
  // within one file, and the merge can only carry it through.
  for (const id of new Set(values.dups || [])) {
    B.push(fact(0, `значение ${id} объявлено дважды — имя выдаётся один раз, иначе ссылка из контракта неоднозначна`, { id, local: true }))
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
  //
  // THE WHOLE'S FINDING, NOT THE PART'S (D31): the operand is the set of ALL texts, and a part carries
  // the values of one use case. A failure whose `from` names two use cases is legally named by either
  // of the two parts, so asked of one part alone the rule reports a defect the other part has already
  // repaired. Its ADDRESS is the use cases the failure came from — every scenario of each of them.
  const declared = (frd.failures || []).filter((f) => String((f && f.code) || "").trim())
  if (declared.length) {
    const texts = [...values.values()]
    for (const f of declared) {
      const code = String(f.code).trim()
      if (!texts.some((t) => t.includes(code))) {
        B.push(fact(8, `8 отказ ${code} объявлен в FRD, но не назван ни одним значением — маршрута у него не будет, значит не будет и юнита; объяви значение, которым узел его отдаёт`, {
          uc: tokens(f.from).map((t) => t.split("/")[0]).join(" "),
        }))
      }
    }
  }

  // Rule 12. A use case ENDS somewhere, and the dictionary answers for every one of its ends by NAME.
  // Until this rule the ends were LAW 6 of the role and nothing else: three live runs in a row wrote a
  // dictionary with no value for the exit of a page — 09d11a84, d07c4840, 1df91a31 — and pass C burnt
  // its whole loop on the consequence, having no legal file to write (tasks/step-design-ends-closed.md).
  // The count is over the FRD's ends, not over the dictionary's rows: the requirement declares how many
  // ends the change has, and a row that answers for none of them is not a defect — the dictionary is
  // deliberately wider than any one projection.
  const ends = endsOf(frd)
  if (ends.length) {
    const claimed = new Set([...values.closes || []].flatMap(([, ts]) => ts))
    // THE PART ANSWERS FOR THE ENDS OF ITS OWN USE CASE (D31), and `uc` is what says which those are:
    // a part is one FRD scenario, a scenario closes one use case, and the ends of somebody else's use
    // case are somebody else's rows. Judged without that filter, one part of `eddi` reports 32 open
    // ends out of 35 — every one of them written by another part.
    for (const e of ends) {
      if (!claimed.has(e.token)) {
        B.push(fact(12, `12 конец ${e.token} не закрыт ни одним значением — «${e.text}»; объяви значение, которым он кончается, и пометь его closes="${e.token}"`, { uc: e.uc, local: true }))
      }
    }
    // The mirror of rule 1: a token that resolves to no end of this FRD closes nothing, and the value
    // wearing it would be seated by rule 13 against a use case that does not exist.
    // The blocker quotes the WHOLE attribute and then names the offending token inside it. Naming
    // the token alone is what let run 27b37fdb repair the wrong thing four rounds running: the role
    // saw «closes="|"», a string it had never written, and could not tell that the reader had cut
    // its list. The attribute is rendered in the ONE separator the schema teaches — a dictionary
    // written with commas is quoted back in the form its order shows.
    const known = new Set(ends.map((e) => e.token))
    for (const [id, ts] of values.closes || []) {
      for (const t of ts) {
        if (!known.has(t)) B.push(fact(12, `12 значение ${id}: closes="${ts.join(" | ")}" — токен «${t}» не резолвится ни в один конец FRD; концы этого требования: ${[...known].join(", ")}`, { id, local: true }))
      }
    }
  }

  return B
}

// FUNCTION_CONTRACT: checkEnds — the findings a PART of pass A can be judged by, alone
//   Input:        { values, frd, uc } — `values` being ONE part's dictionary or the whole one, `frd`
//                 the WHOLE requirement (a part is handed the same file), `uc` the use case this part
//                 answers for; no `uc` means no end is this caller's, which is what a caller with no
//                 scenario should see
//   Dependencies: valueFacts
//   Antecedent:   the same as valueFacts'
//   Consequent:   success: Fact[] — the subset whose operands lie inside one part: a row with no name
//                          or no text, a repeated id, rule 12's mirror, and rule 12's open ends OF
//                          THIS USE CASE. Every one of them is MONOTONE — red on a part stays red on
//                          the merge — GIVEN the ownership the part's own guardrail enforces: a part
//                          closes the ends of its use case and of no other (ext/index.mjs::design), so
//                          no second part can quietly close an end this one left open
//                 failure: none — total
//   Purity:       pure
//   Interface:    checkEnds({ values, frd, uc }) -> Fact[]
//
// The whole is judged by `checkValues` after the merge and by nothing else (ext/index.mjs::design): no
// rule is relaxed here, rule 8 is simply unanswerable by one part.
export const checkEnds = ({ uc = "", ...input } = {}) =>
  valueFacts(input).filter((f) => f.local && (!f.uc || f.uc === uc))

// FUNCTION_CONTRACT: checkValues — the guardrail of pass A: the WHOLE dictionary, all its rules
//   Input:        { values, frd } — as valueFacts takes them
//   Dependencies: valueFacts
//   Antecedent:   the same as valueFacts'
//   Consequent:   success: string[] of blockers, empty = green. Rules 8 and 12 keep the numbers they
//                          have in docs/data-flow.md §6; the two checks the dictionary owns beside
//                          them (an id without a text, a repeated id) are the pass's own and carry no
//                          number, because §6's table is the single declaration of the numbers
//                 failure: none — total, "the dictionary is bad" is DATA, not a function failure
//   Purity:       pure
//   Interface:    checkValues({ values, frd }) -> string[]
//
// THE ORDER OF THE LINES IS THE CONTRACT, and it is the order this report had before the decomposition
// — which is why steps/design/values.test.mjs judges D31 without an edit. It is kept by CONSTRUCTION:
// one function produces the records, and this one only renders them.
export function checkValues(input = {}) {
  return valueFacts(input).map((f) => f.text)
}
