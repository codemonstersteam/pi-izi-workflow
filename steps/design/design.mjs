// MODULE_CONTRACT: design — two projections of a change: the design graph and the data flow, aligned by a script
// Purpose:    one decision: where the structural projection (nodes with contracts) diverges from the temporal
//             one (a scenario played out step by step). The role writes the graph and the ROUTE (a node path
//             plus the number of its `out` alternative); expand substitutes the values into the flow, so
//             divergence INSIDE the flow is inexpressible, and the only remaining seam is the joint between
//             neighboring contracts.
//             PURE: knows nothing of disk, io lives in ext/index.mjs. Parsing — docs/data-flow.md §3–§6.
// io:         none
// Invariants: parseDesign/parseRoutes are total — any input, including undefined, yields an empty parse,
//             never an exception; expand's antecedent is a route where every step resolves to a node
//             and to an existing alternative — TODAY nothing in this file establishes it any more,
//             see checkDesign: the eight rules moved to values.mjs, nodes.mjs and routes.mjs, and the
//             passes that call them are wired in D5/D6. The rule lives in exactly one place, and for
//             this file that place is now elsewhere
// Interface:  parseDesign(xml) -> Map<path, Node>
//             parseRoutes(xml) -> Route[]
//             expand(nodes, routes) -> string
//             checkDesign({ nodes, routes, frd, known }) -> string[]  — EMPTY, see its contract
//             newDesign({ xml, frd, known }) -> Result<Design, "invalid-design">

import { ok, err } from "../../core/result.mjs"
// EXTERNAL_DEPENDENCY: core/xml.mjs — tag scanner (attrs · ATTRS · tag) shared with steps/scope: one
// grammar for two slices is read by one piece of code, otherwise part-parsing and design-parsing would drift apart.
// The same file holds the BUG_FIX_CONTEXT for ATTRS' quote-resilience.
import { attrs, ATTRS, tag, esc } from "../../core/xml.mjs"
// The slice's dependency on steps/intake/frd.mjs::FRD_FORM moved with rule 6 to
// steps/design/nodes.mjs (backlog D2) — the vocabulary of a delta's FORM is read where the delta is
// judged, and importing it here for nobody would be a second claim on the same fact.

const alts = (s) => String(s || "").split("|").map((x) => x.trim()).filter(Boolean)

// FUNCTION_CONTRACT: parseDesign — nodes of the design graph from its text
//   Input:        xml — text of `.agent/design-graph.xml`; type unconstrained
//   Dependencies: —
//   Antecedent:   any value — undefined/null/garbage are read as an empty graph
//   Consequent:   success: Map<path, { path, delta, in[], out[], deps[] }> in appearance order;
//                          `in`/`out` are contract alternatives, split on `|` and trimmed at the
//                          edges; no `<contract>` → both empty; a repeated path — the last one wins
//                          (one key per node, as in appgraph.xml)
//                 failure: none — total
//   Purity:       pure
export function parseDesign(xml) {
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

// FUNCTION_CONTRACT: parseRoutes — scenario routes from the same text
//   Input:        xml — text of `.agent/design-graph.xml`; type unconstrained
//   Dependencies: —
//   Antecedent:   any value
//   Consequent:   success: [{ scenario, entry, steps: [{ path, alt }] }] in appearance order; `alt`
//                          is the number from `<path>#<n>` and `entry` the number of the FIRST
//                          node's `in` alternative the scenario is started by; a missing or
//                          non-numeric number of either kind yields NaN, caught by rule 1 rather
//                          than silently defaulting to the first alternative
//                 failure: none — total
//   Purity:       pure
// Routes live in the SAME file as the graph: the role hands over one artifact, not two — a second
// file from the same role would have to be checked for consistency even before the five rules.
//
// `entry` is a NUMBER, never the text of the call. The value is written once, on the node, and the
// route refers to it by position — the same discipline the `out` numbers keep (docs/data-flow.md §4).
// An `entry="POST /bookings"` would be that value typed a second time, and a value typed twice is a
// value that drifts (steps/design/designer.md, LAW 2).
export function parseRoutes(xml) {
  return [...String(xml || "").matchAll(tag("route"))].map((m) => {
    const a = attrs(m[1])
    return Object.freeze({
      scenario: a.scenario || "",
      entry: Number(a.entry),
      steps: Object.freeze(String(a.steps || "").split("->").map((s) => s.trim()).filter(Boolean).map((s) => {
        const [path, alt] = s.split("#")
        return Object.freeze({ path, alt: Number(alt) })
      })),
    })
  })
}

// FUNCTION_CONTRACT: walk — the one computation both projections of the flow are made of
//   Input:        nodes — parseDesign's parse; routes — parseRoutes' parse
//   Dependencies: —
//   Antecedent:   GREEN checkDesign (see expand)
//   Consequent:   success: [{ scenario, path, in, out }] in route order — one entry per route STEP,
//                          with the values already substituted out of the contracts
//                 failure: none, given the antecedent holds
//   Purity:       pure
// Both sections of `.agent/data-flow.md` are projections of THIS list: the flow groups it by scenario,
// the unit list groups it by node. A second traversal would be a second count of one fact, and the
// `<dod>` of a ticket would start drifting from the flow it was cut beside (docs/design.md §2).
//
// BUG_FIX_CONTEXT: live run ffe8cb7b (quarkus-rest-json-app-v2-t2), the first green run of step 9.
//   Previous: the first step's `in` was `n.in[0]` — the first alternative BY POSITION, because the
//             route named numbers for `out` only.
//   Problem:  flow line 1 of scenario S2 read `fruits.html : Fruit -> GET /fruits/{name}`. The page
//             has not received a Fruit at that point — a user's click starts it, and the click was
//             in no contract at all. The guardrail could not see it: rule 4 joins k↔k+1, and the
//             entry into step 1 is not a joint. The lie then travelled into the node's unit list,
//             i.e. into the `<dod>` of a ticket nobody could write.
//   Fix:      the route NAMES the entry alternative by number, and rule 1 demands it exists. A node
//             with no входной alternative can no longer be a route's first step without the role
//             declaring the external call it is started by (docs/design.md §9).
function walk(nodes, routes) {
  const out = []
  for (const r of routes) {
    r.steps.forEach((s, k) => {
      const n = nodes.get(s.path)
      const prev = k === 0 ? null : nodes.get(r.steps[k - 1].path)
      // TOTAL. On a green artifact every step resolves — that is `expand`'s antecedent and rule 1 of
      // step 9 buys it. But this walk now has a SECOND caller, `unitsByPath`, whose result rides on
      // the plan's node, and step 10 is total by contract: an artifact outlives the run that wrote
      // it, and a stale design-graph must give a Result, never a throw.
      if (!n || (k > 0 && !prev)) return
      out.push({
        scenario: r.scenario,
        path: s.path,
        in: k === 0 ? n.in[r.entry - 1] : prev.out[r.steps[k - 1].alt - 1],
        out: n.out[s.alt - 1],
      })
    })
  }
  return out
}

// FUNCTION_CONTRACT: expand — route + contracts → the text of .agent/data-flow.md
//   Input:        nodes — parseDesign's parse; routes — parseRoutes' parse
//   Dependencies: walk
//   Antecedent:   GREEN checkDesign: every step resolves to a node that has the `alt` alternative,
//                 and every route names an `entry` its first node actually has.
//                 Calling this on an unchecked route is a defect of the caller, not of this function
//   Consequent:   success: text of `.agent/data-flow.md` — TWO kinds of section:
//                          `$START_FLOW id="<scenario>"` … `$END_FLOW`, lines `<n>. <path> : <in> -> <out>`
//                            — the change played out in time, one block per FRD scenario;
//                          `$START_TESTS path="<node>"` … `$END_TESTS`, lines `<n>. <in> -> <out>`
//                            — the node's units, one per DISTINGUISHABLE pair, deduplicated, in
//                            first-appearance order. The count is the LENGTH of the list and is not
//                            written beside it: a tally next to the list it counts is two places for
//                            one fact (docs/ripple.md §4, why fanin is not copied into the subgraph)
//                 failure: none, given the antecedent holds
//   Purity:       pure
// The machine substitutes the values, not the role: a copy is the one thing a weak tier survives
// (it paraphrases), and the one thing the script does for free.
//
// `1 happy + Σ branches` (standards/code.md) reads on this data as: every pair a route traverses IS a
// branch of the antecedent with a distinguishable consequent, and the FRD's main scenario is the FIRST
// of them. Adding one on top of the list would inflate the `<dod>` of every node in the pipeline by a
// unit — the happy path is a line here, never a summand (docs/design.md §2).
export function expand(nodes, routes) {
  const steps = walk(nodes, routes)
  const out = []

  for (const r of routes) {
    out.push(`$START_FLOW id="${r.scenario}"`)
    steps.filter((s) => s.scenario === r.scenario).forEach((s, k) => out.push(`${k + 1}. ${s.path} : ${s.in} -> ${s.out}`))
    out.push("$END_FLOW")
  }

  // The section is named exactly as the TICKET's section (docs/workflow.md §3.14): step 14 CUTS it by
  // `path` into the ticket, it does not retell it — the same device by which it cuts $START_FLOW.
  for (const [path, units] of unitsByPath(nodes, routes)) {
    out.push(`$START_TESTS path="${path}"`)
    units.forEach((u, k) => out.push(`${k + 1}. ${u}`))
    out.push("$END_TESTS")
  }

  return out.join("\n")
}

// FUNCTION_CONTRACT: unitsByPath — the DoD of every node: its units, one per distinguishable pair
//   Input:        nodes — parseDesign's parse; routes — parseRoutes' parse (of the promoted form)
//   Dependencies: walk
//   Antecedent:   the same one `expand` has — a GREEN checkRoutes; an unchecked route is the caller's
//                 defect, not this function's
//   Consequent:   success: Map<path, string[]> — `<in> -> <out>` per DISTINGUISHABLE pair the routes
//                          traverse, in first-appearance order, deduplicated; a node no route passes
//                          through is absent from the map, never present with an empty list
//                 failure: none — total
//   Purity:       pure
//
// WHY IT IS ITS OWN FUNCTION. Step 9 computes this and writes it into `.agent/data-flow.md`; step 10
// needs the SAME list on the plan's node, because the ticket is cut from the plan and a ticket with no
// definition of done cannot be shipped — live run d8ef8c60 handed the implementer a node whose check
// command was green BEFORE any work, and nothing anywhere said which tests were owed. Two derivations
// of one list would drift, so there is one, and `expand` calls it too (the device D17 used for
// `forwardLegs`).
export function unitsByPath(nodes, routes) {
  const steps = walk(nodes, routes)
  const byPath = new Map()
  for (const path of nodes.keys()) {
    const seen = new Set()
    const units = []
    for (const s of steps) {
      if (s.path !== path) continue
      const key = `${s.in} -> ${s.out}`
      if (seen.has(key)) continue
      seen.add(key)
      units.push(key)
    }
    if (units.length) byPath.set(path, units)
  }
  return byPath
}

// FUNCTION_CONTRACT: assemble — the three working artifacts of step 9 into the ONE promoted file
//   Input:        { values, nodes, routes, mode }
//                 values — steps/design/values.mjs::parseValues (id → text)
//                 nodes  — steps/design/nodes.mjs::parseNodes, whose contracts carry IDS
//                 routes — steps/design/routes.mjs::parseRoutes, whose steps carry `path@id`
//                 mode   — the weight of step 7, the attribute the role used to type itself
//   Dependencies: esc (core/xml.mjs)
//   Antecedent:   all three artifacts GREEN by their own guardrails. Nothing is re-judged here: an id
//                 the dictionary does not carry survives as itself, because checkGraph already
//                 refused that graph and assembly of a refused artifact never happens
//   Consequent:   success: the text of `.agent/design-graph.xml` in TODAY's form — contracts as
//                          texts, route steps as `path#n`, `entry` as a number
//                 failure: none — total
//   Purity:       pure
//   Interface:    assemble({ values, nodes, routes, mode }) -> string
//
// THE FORM OF THE DELIVERABLE DOES NOT MOVE, and that is the whole point of this function. Passes A,
// B and C write by ID because a name survives a regenerated graph and a position does not
// (steps/design/routes.mjs). Their consumers — `steps/plan/plan.mjs`, `ext/index.mjs`, step 14 and
// `parseDesign`/`parseRoutes` right here — read TEXT and `#n`, exactly as they read yesterday. The
// translation lives in one place, costs no tokens, and is proved by a ROUND TRIP: what this writes,
// today's readers read back into the same nodes and routes, and `expand` yields the same data-flow.
//
// This is CLAUDE.md's constraint 5 answered rather than argued with: widening the shape of a value is
// a change to every consumer of it — so the widened shape stops at staging, and not one consumer of
// the promoted artifact is touched.
//
// The position is computed HERE and never asked of a model: `#n` is the index of the named value in
// the node's own list. The number a script derives cannot disagree with the list it derived it from —
// which is precisely what live run 0bbf7054 could not manage, spending blockers on «нет альтернативы
// #12» in a contract the role itself had typed a hundred lines earlier.
export function assemble({ values, nodes, routes = [], mode = "" }) {
  const text = (id) => (values && values.get(id) != null ? values.get(id) : id)
  const at = (list, id) => list.indexOf(id) + 1        // 0 means "not there" — impossible after checkRoutes
  const out = [`<design mode="${esc(mode)}" base=".agent/appgraph.xml">`]

  for (const n of nodes.values()) {
    out.push(`  <module path="${esc(n.path)}"${n.delta ? ` delta="${esc(n.delta)}"` : ""}>`)
    if (n.role) out.push(`    <role>${esc(n.role)}</role>`)
    out.push(`    <contract in="${n.in.map((v) => esc(text(v))).join(" | ")}" out="${n.out.map((v) => esc(text(v))).join(" | ")}"/>`)
    for (const d of n.deps) out.push(`    <dep path="${esc(d)}"/>`)
    out.push("  </module>")
  }

  for (const r of routes) {
    const first = nodes.get((r.steps[0] || {}).path)
    const steps = r.steps.map((s) => `${s.path}#${at((nodes.get(s.path) || { out: [] }).out, s.value)}`).join(" -> ")
    out.push(`  <route scenario="${esc(r.scenario)}" entry="${first ? at(first.in, r.entry) : 0}" steps="${esc(steps)}"/>`)
  }

  out.push("</design>")
  return out.join("\n")
}

// FUNCTION_CONTRACT: checkDesign — EMPTY: every rule it carried has moved out, and the function is
//                 kept only until D5 replaces its caller
//   Input:        { nodes, routes, frd, known } — all four accepted and none of them read
//   Dependencies: —
//   Antecedent:   any value
//   Consequent:   success: `[]`, always
//                 failure: none — total
//   Purity:       pure
//
// ALL EIGHT RULES NOW LIVE ONE ARTIFACT EARLIER, and no number was reused:
//   8 → steps/design/values.mjs::checkValues (backlog D1). The dictionary of pass A is the earliest
//     artifact in which a declared failure is decidable, and everything after it refers to values by
//     id. What that move costs is repaid in checkGraph: over a flat dictionary the rule only says
//     "declared somewhere", so "produced by SOME node's out" is judged there, in the pass that owns
//     the contracts (backlog, «Что концепт обещает, а код не подтвердил», п. 2).
//   6 → steps/design/nodes.mjs::checkGraph (backlog D2), whole, both halves. It reads only NODES,
//     never a route, so it belongs to the pass whose only subject is the graph.
//   1, 2, 3, 4, 5, 7 → steps/design/routes.mjs::checkRoutes (backlog D4), with the numbers unchanged
//     and the blocker rewritten as a FACT: no `<scenario>#<k>` prefix, the scenarios in the tail of
//     the line, rules 3 and 4 grouped by the receiving node (docs/design-step-by-step.md §8).
//
// So this function decides NOTHING, and it is not given new work to look busy: the honest note is
// that `newDesign` is unguarded until D5 replaces it with `assemble` and D6 wires the three
// guardrails to the three passes. Until then a live step 9 rejects exactly one thing — a text with no
// `<module>` in it. That window is the one the backlog names («Окно без правил 8 и 6»), now open on
// all eight; the alternative — a second copy of six rules living for three tickets — is worse, because
// two copies drift and the window closes with one ticket.
export function checkDesign({ nodes, routes = [], frd = {}, known = null }) {
  return []
}

// FUNCTION_CONTRACT: newDesign — step 9's artifacts from the role's text
//   Input:        { xml, frd, known } — xml as the role wrote it in staging
//   Dependencies: parseDesign, parseRoutes, checkDesign, expand
//   Antecedent:   xml — any value (empty text yields an empty graph and a "not one node" rejection);
//                 frd, known — same as checkDesign
//   Consequent:   success: { nodes, routes, flow } — flow is the text of `.agent/data-flow.md`,
//                          expanded OUT of the contracts, not out of whatever the role typed
//                 failure: "invalid-design" — blockers joined into one line by `\n  `, the same way
//                          newBrd does it: this text rides in the FEEDBACK of the re-delegation order
//   Purity:       pure
export function newDesign({ xml, frd = {}, known = null }) {
  const nodes = parseDesign(xml)
  const routes = parseRoutes(xml)
  if (!nodes.size) return err("invalid-design", "в дизайн-графе нет ни одного <module> — картировать изменение нечем")

  const blockers = checkDesign({ nodes, routes, frd, known })
  if (blockers.length) return err("invalid-design", blockers.join("\n  "))

  return ok(Object.freeze({ nodes, routes: Object.freeze(routes), flow: expand(nodes, routes) }))
}
