// MODULE_CONTRACT: design — the GRAMMAR of step 9's deliverable: the design graph and what it owes
// Purpose:    one decision: how `.agent/design-graph.xml` is READ — its nodes with their contracts,
//             its routes, and the units each node owes. It is a READER and nothing else: the passes
//             that WROTE this artifact (the node graph and the routes) were deleted while step 9 is
//             rewritten, so today nothing in this repository produces the file and step 10 treats it
//             as absent — which was always a legal input (steps/plan/plan.mjs). The rewritten passes
//             B and C will write this same form: the deliverable's grammar does not move because the
//             way it is filled did.
//             PURE: knows nothing of disk, io lives in ext/index.mjs. Parsing — docs/data-flow.md §3–§6.
// io:         none
// Invariants: parseDesign/parseRoutes are total — any input, including undefined, yields an empty parse,
//             never an exception; unitsByPath's antecedent is a route where every step resolves to a
//             node and to an existing alternative — nothing in this file establishes it, the guardrail
//             that will is pass C's, and the rule lives in exactly one place
// Interface:  parseDesign(xml) -> Map<path, Node>
//             parseRoutes(xml) -> Route[]
//             unitsByPath(nodes, routes) -> Map<path, string[]>

import { attrs, ATTRS, tag, alts } from "../../core/xml.mjs"
// EXTERNAL_DEPENDENCY: core/xml.mjs — tag scanner (attrs · ATTRS · tag) shared with steps/scope: one
// grammar for two slices is read by one piece of code, otherwise part-parsing and design-parsing would drift apart.
// The same file holds the BUG_FIX_CONTEXT for ATTRS' quote-resilience, and `alts` — a contract's `in`
// and `out` carry TEXT with spaces and commas inside, so `|` is their only separator (the class
// boundary is declared once, in core/xml.mjs; run 27b37fdb bought it).

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

// checkDesign, newDesign и assemble удалены вместе с проходами B и C шага 9: их писала
// роль, которой больше нет. Читателей у них не осталось — а код, до которого доходит только тест,
// это тест, который не краснеет ни от одной правки (standards/code.md §2).
