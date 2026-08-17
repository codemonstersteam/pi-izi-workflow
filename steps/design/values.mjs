// MODULE_CONTRACT: values — step 9 pass A: the dictionary, COMPOSED by the script, NAMED by the role
// Purpose:    one decision: what does each end of the change EXCHANGE, said in one short name a later
//             pass can refer to instead of retyping a sentence. The COMPOSITION of the dictionary is
//             not a judgement and is not asked of a role: how many rows there are, which token each
//             row closes, in what order and under what id — all of it follows from the FRD and the
//             ripple, and the script writes it. What is left for the role is the one thing no script
//             can do: NAME the value at an end whose text the requirement wrote in prose.
//             PURE: knows nothing of disk, io lives in ext/index.mjs. The grammar — docs/data-flow.md §4a.
// io:         none
// EXTERNAL_DEPENDENCY: steps/intake/frd.mjs::endsOf — "what are the ends of a use case" is answered
//             ONCE and it is answered by the grammar that owns them. The skeleton IS that list, one
//             row per end; step 6's F6c judges the same list on the artifact that feeds this one.
// EXTERNAL_DEPENDENCY: steps/ripple/ripple.mjs::changeWidth — "which nodes does this change work on"
//             is step 8's expression and is not re-derived here; steps 8, 9 and 10 must not be able
//             to disagree about what the change even touches.
// EXTERNAL_DEPENDENCY: core/xml.mjs — the tag scanner shared with steps/scope, steps/intake and the
//             rest of steps/design. One grammar family read by one piece of code; its
//             BUG_FIX_CONTEXT for ATTRS' quote-resilience is inherited here for free, and a value's
//             text carries exactly the characters that bought it (`409 {conflict}`).
// Invariants: every function here is TOTAL — any input, including undefined, yields an empty result
//             and never throws (a guardrail that crashes on a malformed artifact turns "the role
//             wrote nonsense" — data, a red check, a redelegation — into "the run crashed", code 2,
//             no diagnosis); the skeleton is a FUNCTION of its two inputs, so two runs over one FRD
//             and one ripple agree byte for byte; checkValues returns EVERY blocker, not the first.
// Interface:  VALUES_GRAMMAR — the version stamped on the artifact
//             parseValues(xml) -> Map<id, text>  (with `dups` and `closes` — see the contract)
//             valuesSkeleton({ frd, ripple }) -> { xml, rows, blank, filled }
//             normalize(xml) -> string   — the skeleton's scaffolding stripped, for the promoted file
//             checkValues({ staged, frd, ripple }) -> string[]  — blockers, empty = green
//
// WHY THE SCRIPT COMPOSES AND THE ROLE ONLY NAMES — the measurement that bought this shape.
//
// Until now one role wrote the whole dictionary from the FRD and the ripple, and it decided four
// things in one answer: how many rows, which `closes` token on each, in which separator, and whether
// an end was forgotten. Measured on the two live artifacts:
//
//   форма  строк роли  концов FRD  строк с closes у роли  дублей текста  пропусков в нумерации
//   t2         16          6              6                    0                0
//   eddi       72         35             38  (3 лишних)        6 групп          7
//
// Every defect there is a defect of COMPOSITION, and composition is computable: this module's
// skeleton gives 35 rows on `eddi` and 6 on `t2` — exactly the ends, no duplicates, a solid
// numbering — for zero tokens. Of the texts, the ones a machine can write it writes: an `<ext>`
// branch that raises a failure code is `"<status> <code>"` (11 of 11 on `eddi`, written by hand by
// the role in that very form), and a call of a node of the change is the `<api name>` / `<decl name>`
// of the ripple copied verbatim (22 of `eddi`'s 72 rows were exactly such copies, 9 of `t2`'s 16).
// What remains blank is 24 rows on `eddi` and 6 on `t2` — the ends the requirement wrote in prose,
// where naming is the whole job.

import { attrs, elem, tag, tokens, esc } from "../../core/xml.mjs"
import { endsOf } from "../intake/frd.mjs"
import { changeWidth } from "../ripple/ripple.mjs"

// The artifact's version. It moved to 2 when the composition became the script's: a dictionary of
// grammar 1 was written whole by a role and its rows carry no relation to a skeleton, so a leftover
// from an older run must not be read as this one's answer.
export const VALUES_GRAMMAR = 2

// FUNCTION_CONTRACT: parseValues — the dictionary from its text
//   Input:        xml — text of `.agent/values.xml` or of the staged skeleton; type unconstrained
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
// and for the same reason: the next pass resolves the attribution of a value without re-parsing the
// artifact this one already read.
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

// The status line of a failure, as a value: `"404 GLOSSARY_NOT_FOUND"`. Written ONCE, because the
// skeleton fills the row with it and the guardrail asserts the role did not touch it — two spellings
// of this form would turn a green artifact red on the day one of them gained a colon.
const failureText = (status, code) => `${String(status || "").trim()} ${String(code || "").trim()}`.trim()

// FUNCTION_CONTRACT: valuesSkeleton — the dictionary's composition, computed
//   Input:        { frd, ripple }
//                 frd    — the parse of `.agent/frd.xml` AS steps/intake/frd.mjs::parseFrd returns it
//                 ripple — the TEXT of `.agent/ripple.xml`
//   Dependencies: endsOf, changeWidth, core/xml.mjs
//   Antecedent:   any values — no FRD yields a skeleton with no rows, which is what a caller with no
//                 requirement should see; no ripple yields the ends alone
//   Consequent:   success: { xml, rows, blank, filled } — `xml` is the artifact in grammar 2 with
//                          `form="skeleton"`, one `<value>` per row, ids `v1…vN` in this order:
//                          every end of every use case in the FRD's order, then every operation the
//                          change introduces (`<delta op>`), then every call of every node of the
//                          change in the ripple's order. `rows` is their count, `filled` how many
//                          texts the script wrote, `blank` how many it left for the role
//                 failure: none — total
//   Purity:       pure
//   Interface:    valuesSkeleton({ frd, ripple }) -> { xml, rows, blank, filled }
//
// THREE ATTRIBUTES THE PROMOTED FILE DOES NOT CARRY, and why they ride the skeleton:
//   · `side`  — `in` or `out`. It is the end's own fact (an entry is not an exit) and it tells the
//               role which way to read the text it must name
//   · `end`   — the requirement's OWN sentence about this end, verbatim. Without it the role would
//               have to find the sentence in the FRD by the token, which is the search a weak model
//               gets wrong; with it the row is a fill-in-the-blank
//   · `src`   — where a prefilled text was copied FROM (`failure <код>`, `delta <path>`,
//               `api <path>`, `decl <path>`). It is
//               the evidence that the text is a copy and not an invention, and it is what a human
//               diagnoses from when a value turns out to name nothing
// They are stripped on promote (`normalize`) — a later pass reads `<value id text closes/>` and
// nothing else, so the scaffolding cannot become an input of anything.
export function valuesSkeleton({ frd = {}, ripple = "" } = {}) {
  const rows = []
  const failures = new Map(((frd && frd.failures) || []).map((f) => [String((f && f.code) || "").trim(), String((f && f.status) || "").trim()]).filter(([c]) => c))

  // THE ENDS FIRST, in the FRD's own order. They are the reason the dictionary exists: a value that
  // closes no end is a name for something the change does not observe.
  for (const e of endsOf(frd)) {
    // An `<ext>` branch that raises a code is the one text a script can write and a role cannot
    // improve: `"404 GLOSSARY_NOT_FOUND"` is the boundary observation, and the role wrote exactly
    // that form 11 times out of 11 on `eddi`. The code is found by the TOKEN, not by matching the
    // outcome's prose: the token is the artifact's own key, the prose is the thing being named.
    const uc = ((frd && frd.usecases) || []).find((u) => String((u && u.id) || "").trim() === e.uc)
    const ext = ((uc && uc.exts) || []).find((x) => `${e.uc}/${String((x && x.id) || "").trim()}` === e.token)
    const code = String((ext && ext.error) || "").trim()
    const text = failures.has(code) ? failureText(failures.get(code), code) : ""
    rows.push({ closes: e.token, side: e.side, end: String(e.text || "").trim(), text, src: text ? `failure ${code}` : "" })
  }

  const width = changeWidth({ frd, tests: new Set() })
  const seen = new Set(rows.map((r) => r.text).filter(Boolean))

  // THEN THE OPERATIONS THE CHANGE INTRODUCES — `<delta op>`, verbatim, one row each (D33).
  //
  // Without them the dictionary knows only what the repository ALREADY has: the ripple is a cut of
  // written code, so an operation this change is about exists nowhere in it. Measured on `eddi`: of
  // the 12 distinct `op` the FRD declares, EIGHT are absent from the dictionary — among them
  // `readGlossaries()`, the operation the whole change is for (4 occurrences in frd.xml, 0 in
  // ripple.xml, 0 in values.xml). The next pass then has no name for the joints between nodes: value
  // coverage of the change's own nodes was 4 of 13.
  //
  // `src` says `delta <node>` and not `api`/`decl` for a reason: this is the one row that names a
  // node which may not exist yet (`<delta new="yes">` — 7 of eddi's 13), so the seat is the FRD's
  // claim about the future, not the ripple's fact about the present.
  for (const d of (frd && frd.deltas) || []) {
    const op = String((d && d.op) || "").trim()
    if (!op || seen.has(op)) continue
    seen.add(op)
    rows.push({ closes: "", side: "", end: "", text: op, src: `delta ${String((d && d.node) || "").trim()}`.trim() })
  }

  // THEN THE CALLS OF THE CHANGE'S OWN NODES, copied verbatim out of the ripple. `<api>` is what a
  // node offers the outside and `<decl kind="method">` what it offers its neighbours; a field or a
  // class declaration is not something two nodes exchange, so it is not a value. The width is step
  // 8's (changeWidth) — a neighbour the change only reads through declares nothing this dictionary
  // needs, and 68 % of the subgraph's bytes are exactly those neighbours (D29a).
  for (const m of String(ripple || "").matchAll(elem("module"))) {
    const path = String(attrs(m[1]).path || "").trim()
    if (!width.has(path)) continue
    const body = m[2] || ""
    const calls = [
      ...[...body.matchAll(tag("api"))].map((a) => ({ name: String(attrs(a[1]).name || "").trim(), kind: "api" })),
      ...[...body.matchAll(tag("decl"))].map((d) => attrs(d[1])).filter((d) => d.kind === "method").map((d) => ({ name: String(d.name || "").trim(), kind: "decl" })),
    ]
    // ONE NAME IS ONE VALUE. A method declared by two nodes of the change is one thing they exchange,
    // and two rows for it would be the duplicate the merge of the swarm used to produce — six groups
    // of them in `eddi`'s dictionary, each a place where a later pass could refer to either id.
    for (const c of calls) {
      if (!c.name || seen.has(c.name)) continue
      seen.add(c.name)
      rows.push({ closes: "", side: "", end: "", text: c.name, src: `${c.kind} ${path}` })
    }
  }

  const line = (r, k) => {
    const a = [`id="v${k + 1}"`]
    if (r.closes) a.push(`closes="${esc(r.closes)}"`)
    if (r.side) a.push(`side="${r.side}"`)
    a.push(`text="${esc(r.text)}"`)
    if (r.end) a.push(`end="${esc(r.end)}"`)
    if (r.src) a.push(`src="${esc(r.src)}"`)
    return `  <value ${a.join(" ")}/>`
  }
  const xml = [`<values grammar="${VALUES_GRAMMAR}" form="skeleton">`, ...rows.map(line), "</values>"].join("\n")
  const filled = rows.filter((r) => r.text).length
  return Object.freeze({ xml, rows: rows.length, filled, blank: rows.length - filled })
}

// FUNCTION_CONTRACT: normalize — the promoted dictionary: names, ids, ends, nothing else
//   Input:        xml — the text the role staged, already green
//   Dependencies: parseValues
//   Antecedent:   any value
//   Consequent:   success: XML in grammar 2 with no `form`, one `<value id text closes/>` per row, in
//                          the staged order
//                 failure: none — total
//   Purity:       pure
//   Interface:    normalize(xml: unknown) -> string
//
// The scaffolding (`side`, `end`, `src`) exists to be READ BY THE ROLE and is dropped the moment the
// role is done. Promoting it would make a later pass's input depend on how this pass talked to a
// model: `end` in particular carries the requirement's prose, and a pass that can read the prose will
// eventually judge by it instead of by the name — which is the drift the dictionary exists to stop.
export function normalize(xml) {
  const values = parseValues(xml)
  const out = [`<values grammar="${VALUES_GRAMMAR}">`]
  for (const [id, text] of values) {
    const closes = (values.closes.get(id) || []).join(" ")
    out.push(`  <value id="${esc(id)}" text="${esc(text)}"${closes ? ` closes="${esc(closes)}"` : ""}/>`)
  }
  out.push("</values>")
  return out.join("\n")
}

// FUNCTION_CONTRACT: checkValues — did the role fill THIS skeleton, and only fill it
//   Input:        { staged, frd, ripple } — the text the role wrote, and the two inputs the skeleton
//                 is a function of, so the guardrail recomputes the skeleton instead of trusting a
//                 copy of it
//   Dependencies: valuesSkeleton, parseValues
//   Antecedent:   any values
//   Consequent:   success: string[] — one blocker per defect, empty means green
//                 failure: none — total
//   Purity:       pure
//   Interface:    checkValues({ staged, frd, ripple }) -> string[]
//
// FOUR RULES, AND THE THREE THAT ARE GONE. What the old guardrail judged — every end of every use
// case is closed by some value, no end is closed twice, no token points outside the FRD, the rows
// are numbered without a gap — is no longer judged because it is no longer DECIDED: the skeleton is
// the composition, so those rules hold by construction and a rule that cannot fail is a test no edit
// can turn red (standards/code.md §2). Rule 8 of the old set ("every failure code occurs in some
// text") is gone for the same reason and it is worth naming out loud: step 6's F6 makes every code
// the code of some `<ext>` branch, every branch is an end, every end is a row, and the row of a
// branch with a code is PREFILLED with `"<status> <code>"`. So rule 8 follows from rule 3 below, and
// stating it twice is one rule written twice.
//
// What is judged is what the role can actually get wrong:
//   1 — a row of the skeleton is missing, or a row the skeleton never wrote appeared
//   2 — a row's `closes` moved: the role re-attributed an end
//   3 — a prefilled text was edited: the copy stopped being a copy
//   4 — a blank text stayed blank: the row nobody named
export function checkValues({ staged, frd = {}, ripple = "" } = {}) {
  const B = []
  const skeleton = parseValues(valuesSkeleton({ frd, ripple }).xml)
  const mine = parseValues(staged)

  for (const id of mine.dups) B.push(`значение ${id} объявлено дважды — в файле ровно одна строка на каждый id скелета`)

  const lost = [...skeleton.keys()].filter((id) => !mine.has(id))
  const extra = [...mine.keys()].filter((id) => !skeleton.has(id))
  if (lost.length) B.push(`строки ${lost.join(", ")} нет в файле — состав словаря считает скрипт, строки не добавляются и не удаляются: перепиши файл из скелета, заполнив text`)
  if (extra.length) B.push(`строки ${extra.join(", ")} в скелете нет — состав словаря считает скрипт: удали их, а недостающее имя напиши в text той строки, которая уже есть`)

  for (const [id, text] of skeleton) {
    if (!mine.has(id)) continue
    const was = (skeleton.closes.get(id) || []).join(" ")
    const now = (mine.closes.get(id) || []).join(" ")
    if (was !== now) B.push(`у значения ${id} closes="${now}", а скелет дал closes="${was}" — какой конец закрывает строка, решает скрипт: верни как было`)
    const got = mine.get(id)
    if (text && got !== text) B.push(`значение ${id} уже было заполнено скриптом как «${text}», а в файле «${got}» — заполненные строки не трогают`)
    if (!text && !got) B.push(`значение ${id} без текста${was ? ` — это конец ${was}` : ""}: назови то, что здесь передаётся, коротким именем`)
  }
  return B
}
