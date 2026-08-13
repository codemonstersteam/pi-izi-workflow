// MODULE_CONTRACT: nodes — step 9 pass B: the structural projection of the change, contracts written in NAMES
// Purpose:    one decision: is the graph of the change SELF-CONSISTENT before any route exists — the
//             delta of every node is a word of step 6's vocabulary, every node the role did not
//             change came from the ripple subgraph, every name a contract speaks was declared in the
//             dictionary of pass A, and every edge lands on a node of this same file. Nothing here
//             judges TIME: routes do not exist yet in this pass, which is precisely what stops the
//             edges from being authored after the routes that overtake them
//             (docs/design-step-by-step.md §4.B).
//             PURE: knows nothing of disk, io lives in ext/index.mjs. The grammar — docs/data-flow.md §4.
// io:         none
// EXTERNAL_DEPENDENCY: core/xml.mjs — the tag scanner shared with steps/scope, steps/intake and the
//             rest of steps/design. One grammar family read by one piece of code; its
//             BUG_FIX_CONTEXT for ATTRS' quote-resilience is inherited here for free.
// EXTERNAL_DEPENDENCY: steps/intake/frd.mjs::FRD_FORM — the vocabulary of a delta's FORM is ONE
//             vocabulary for the whole pipeline, declared at step 6 and weighed at step 7
//             (steps/weight/weight.mjs). It moved here WITH rule 6 out of steps/design/design.mjs;
//             a second spelling of the same word would make the artifacts of steps 6, 7 and 9
//             unjoinable by anything but a translation table (docs/design.md §3, discrepancy C).
// Invariants: parseNodes is total — any input, including undefined, yields an empty graph and never
//             throws (a guardrail that crashes on a malformed artifact turns "the role wrote
//             nonsense" — data, a red check, a redelegation — into "the run crashed", code 2, no
//             diagnosis); checkGraph is total and returns EVERY blocker, not the first one; the rule
//             lives in exactly one place — rule 6's NUMBER is the one of docs/data-flow.md §6 and is
//             not restated here in prose
// Interface:  parseNodes(xml) -> Map<path, Node>
//             checkGraph({ nodes, values, frd, known }) -> string[]  — blockers, empty = green
//             cards(values, nodes) -> string  — the data block of pass C's order
//
// BUG_FIX_CONTEXT: live run 0bbf7054-3b8c-400f-b46f-83625777e097 (sandbox/runbox/eddi).
//   Previous: one generation wrote the dictionary, the nodes and the routes into one 23,5 KB artifact.
//   Problem:  rule 3 spent 23 and 21 blocker lines on 8 and 4 facts — a `<dep>` is written INSIDE
//             `<module>`, the route that needs it a hundred lines below, and an already printed
//             module cannot be appended to. Two attempts shared 17 % of their facts: the role
//             regenerates the artifact, it does not repair it. Cost: 657 953 tokens, zero artifacts.
//   Fix:      the graph is the ONLY subject of this generation — there are no routes yet to outrun
//             the edges. A red graph regenerates ten kilobytes, not twenty-three and a half.

import { attrs, ATTRS, tag } from "../../core/xml.mjs"
import { FRD_FORM } from "../intake/frd.mjs"

const alts = (s) => String(s || "").split("|").map((x) => x.trim()).filter(Boolean)

// FUNCTION_CONTRACT: parseNodes — nodes of the design graph from the text of pass B
//   Input:        xml — text of `.agent/design-nodes.xml`; type unconstrained
//   Dependencies: —
//   Antecedent:   any value — undefined/null/garbage are read as an empty graph
//   Consequent:   success: Map<path, { path, delta, in[], out[], deps[] }> in appearance order;
//                          `in`/`out` are the contract's alternatives — IDS OF THE DICTIONARY, split
//                          on `|` and trimmed at the edges; no `<contract>` → both empty; a repeated
//                          path — the last one wins (one key per node, as in appgraph.xml)
//                 failure: none — total
//   Purity:       pure
//   Interface:    parseNodes(xml: unknown) -> Map<path, Node>
//
// It reads the same TAGS as steps/design/design.mjs::parseDesign and is deliberately not the same
// function: that one reads the PROMOTED `.agent/design-graph.xml`, where a contract carries texts,
// and it is what steps/plan and ext/index.mjs read the promote through. The two files differ in
// exactly one thing — what fills `in`/`out` — and that difference is the whole point of the pass
// (docs/design-step-by-step.md §5.2: the staging form speaks ids, the promote speaks text, and the
// script substitutes between them). Sharing one reader would tie the staging grammar to the promoted
// one, and the seam that keeps the two honest is D5's round trip: assemble → parseDesign → the same
// nodes.
export function parseNodes(xml) {
  const nodes = new Map()
  for (const m of String(xml || "").matchAll(tag("module", ">([\\s\\S]*?)</module>"))) {
    const a = attrs(m[1])
    const body = m[2]
    const c = attrs((body.match(new RegExp(`<contract\\b${ATTRS}/?>`)) || [""])[0])
    nodes.set(a.path, Object.freeze({
      path: a.path,
      delta: a.delta || "",
      in: Object.freeze(alts(c.in)),
      out: Object.freeze(alts(c.out)),
      deps: Object.freeze([...body.matchAll(tag("dep"))].map((d) => attrs(d[1]).path)),
    }))
  }
  return nodes
}

// FUNCTION_CONTRACT: checkGraph — the guardrail of pass B
//   Input:        { nodes, values, frd, known }
//                 nodes  — parseNodes' parse
//                 values — the dictionary of pass A AS steps/design/values.mjs::parseValues returns
//                          it: Map<id, text>. Parsing it belongs to that pass; here it is a DEPENDENCY
//                 frd    — the parse of `.agent/frd.xml` AS steps/intake/frd.mjs::parseFrd returns
//                          it: `failures` are the ELEMENTS (a code lives in `.code`)
//                 known  — Set<path> of the ripple subgraph's nodes (steps/intake/map.mjs::parseMap
//                          over `.agent/ripple.xml`), or null when no subgraph was supplied — then
//                          rule 6's transit half stays silent, the discipline F5 keeps without sources
//   Dependencies: FRD_FORM
//   Antecedent:   nodes — parseNodes' Map; values — parseValues' Map (a missing one is read as an
//                 empty dictionary, and then every id a contract names is unknown, which is true);
//                 frd — an object, a missing `failures` read as empty; known — a Set or null
//   Consequent:   success: string[] of blockers, empty = green. Rule 6 keeps the number it has in
//                          docs/data-flow.md §6; the three checks the graph owns carry no number,
//                          because §6's table is the single declaration of the numbers and they are
//                          not in it
//                 failure: none — total, "the graph is bad" is DATA, not a function failure
//   Purity:       pure
export function checkGraph({ nodes = new Map(), values = new Map(), frd = {}, known = null } = {}) {
  const B = []

  for (const n of nodes.values()) {
    // Rule 6, first half — the vocabulary. One word for one fact across the whole pipeline: the form
    // is DECIDED at step 6 and weighed at step 7, so a design that renames it makes the two artifacts
    // unjoinable by anything but a translation table.
    if (n.delta && !FRD_FORM.deltaForms.includes(n.delta)) {
      B.push(`6 узел ${n.path}: delta="${n.delta}" — допустимо ${FRD_FORM.deltaForms.join(" | ")}`)
    }
    // Rule 6, second half — a transit node cannot be invented. A node WITH a delta may legitimately
    // be absent from the subgraph: that is a NEW module, and inventing one is exactly the designer's
    // judgement. A node WITHOUT a delta is a claim about what already exists, and the only place it
    // may come from is the subgraph the order carried.
    if (!n.delta && known && !known.has(n.path)) {
      B.push(`6 узел без delta вне подграфа ряби — ${n.path}: транзитный узел копируется из .agent/ripple.xml, выдумать его нельзя`)
    }

    // A contract speaks NAMES, and a name that was never declared resolves to nothing: assembly would
    // substitute emptiness into `<contract>` and the route of pass C would refer to a value no card
    // shows. This is what makes the dictionary load-bearing rather than decorative — without it the
    // pass would happily accept a graph whose ids are private to itself.
    for (const [side, ids] of [["in", n.in], ["out", n.out]]) {
      for (const id of ids) {
        if (!values.has(id)) B.push(`узел ${n.path}: в ${side} стоит ${id}, которого нет в словаре — контракт называет значение по имени, выдумать имя нельзя`)
      }
    }

    // An edge lands INSIDE this file or it is not an edge of this graph. Rule 3 of pass C walks the
    // route k→k+1 along `<dep>`, and a dep pointing outside gives it nothing to walk on; the ripple
    // subgraph is not a substitute, because a transit node must be COPIED here to carry its contract
    // (docs/data-flow.md §4) — `expand` has no other source for the values of a step.
    for (const d of n.deps) {
      if (!nodes.has(d)) B.push(`узел ${n.path}: <dep path="${d}"> — такого узла в этом файле нет; ребро ведёт наружу графа, и шагнуть по нему маршруту будет некуда`)
    }
  }

  // The half of rule 8 that its move to pass A could not take with it. Over the flat dictionary the
  // rule only decides "the failure is DECLARED somewhere"; today it decided "declared in some node's
  // `out`" (steps/design/design.mjs, the note where the rule stood: `flatMap(n => n.out)`). Nothing
  // else in the pipeline closes the difference — rule 7 judges the alternatives OF A NODE, not the
  // rows of the dictionary, so a failure nobody produces would reach step 15 unimplemented exactly as
  // before pass A existed (backlog, «Что концепт обещает, а код не подтвердил», п. 2).
  //
  // One blocker per FAILURE, not per value: the substring comparison is rule 8's (a value names both
  // the failure and how the module hands it out — `404 FRUIT_NOT_FOUND`), and a code no value carries
  // at all is rule 8's finding, judged one artifact earlier. One defect, one blocker.
  const produced = new Set([...nodes.values()].flatMap((n) => n.out))
  for (const f of frd.failures || []) {
    const code = String((f && f.code) || "").trim()
    if (!code) continue
    const named = [...values].filter(([, text]) => String(text).includes(code)).map(([id]) => id)
    if (named.length && !named.some((id) => produced.has(id))) {
      B.push(`отказ ${code} назван значением ${named.join(", ")}, но ни один узел не отдаёт его в out — отдавать отказ некому, маршрута у него не будет, значит не будет и юнита`)
    }
  }

  return B
}

// The card is read by a ROLE, so it speaks the language of the order — Russian (standards/code.md,
// constraint 8: English is what a machine reads, and this text is not read by one).
const NO_TEXT = "(нет в словаре)"
const NOTHING = "—"
const SEP = " · "
// The label column is padded so the three rows line up under each other: the role scans DOWN one
// column for the name it needs, which is the whole reason the card exists rather than a sentence.
const LABEL = "принимает:".length
const row = (label, cells) => `  ${(label + ":").padEnd(LABEL)} ${cells.length ? cells.join(SEP) : NOTHING}`

// FUNCTION_CONTRACT: cards — the frozen passes A and B as the data block of pass C's order
//   Input:        values — the dictionary AS steps/design/values.mjs::parseValues returns it: Map<id, text>
//                 nodes  — the graph AS parseNodes returns it: Map<path, Node>
//   Dependencies: row, NO_TEXT/NOTHING/SEP — private
//   Antecedent:   any value — a missing dictionary is an empty one and a missing graph an empty card
//                 block; totality is what keeps a malformed artifact a red check instead of a crash,
//                 exactly as for parseNodes above
//   Consequent:   success: one card per node in the graph's order, cards separated by a blank line.
//                          A card is a path with its delta, then `принимает:` / `отдаёт:` — the
//                          contract's alternatives, EACH AS A PAIR `<id> <text>` — then `соседи:`,
//                          the `<dep>` paths in full. An empty side is `—`, never a dropped row; an
//                          id the dictionary does not carry is `<id> (нет в словаре)`, never the bare
//                          id — the pair is the invariant, and a half of it would be the very shape
//                          this function exists to abolish. No positional `#n` is produced anywhere
//                 failure: none — total
//   Purity:       pure
//   Interface:    cards(values?: Map<id, text>, nodes?: Map<path, Node>) -> string
//
//   BUG_FIX_CONTEXT: live run 0bbf7054-3b8c-400f-b46f-83625777e097 (sandbox/runbox/eddi), rule 1's
//     blockers: «нет альтернативы #12», 5 and 6 lines of them. The order carried `ripple.xml` and no
//     contracts, so a route's step could only refer to a value BY POSITION — and the position was
//     counted by the role in its own freshly written string, over `|` separators, from memory. The
//     card replaces `ripple.xml` in that order whole (docs/design-step-by-step.md §4.C): the role
//     picks a name it SEES. This is the same device as `izi_answer` reading a question's number out
//     of `.agent/pending.json` instead of recalling it (CLAUDE.md, constraint 4).
//
// The neighbours are printed as FULL paths where docs/design-step-by-step.md §4.C abbreviates them
// to `…/IGlossaryStore.java`. The doc is illustrating the shape on a 60-character Java path; a route
// step is written `path@v9` with that very path, so an abbreviated neighbour would be a name the
// role cannot copy — and copying it is the point.
export function cards(values = new Map(), nodes = new Map()) {
  const named = (id) => `${id} ${(values && values.get(id)) || NO_TEXT}`
  return [...nodes.values()].map((n) => [
    // A node with no delta is not a node with an empty one: it is TRANSIT, copied from the ripple
    // subgraph (docs/data-flow.md §4), and the word says so instead of leaving empty brackets that
    // read as a broken card. The delta words themselves are FRD_FORM's and are printed verbatim.
    `${n.path}   (${n.delta || "транзит"})`,
    row("принимает", n.in.map(named)),
    row("отдаёт", n.out.map(named)),
    row("соседи", [...n.deps]),
  ].join("\n")).join("\n\n")
}
