// MODULE_CONTRACT: design — two projections of a change: the design graph and the data flow, aligned by a script
// Purpose:    one decision: where the structural projection (nodes with contracts) diverges from the temporal
//             one (a scenario played out step by step). The role writes the graph and the ROUTE (a node path
//             plus the number of its `out` alternative); expand substitutes the values into the flow, so
//             divergence INSIDE the flow is inexpressible, and the only remaining seam is the joint between
//             neighboring contracts.
//             PURE: knows nothing of disk, io lives in ext/index.mjs. Parsing — docs/data-flow.md §3–§6.
// io:         none
// Invariants: parseDesign/parseRoutes are total — any input, including undefined, yields an empty parse,
//             never an exception; expand is called ONLY after a green checkDesign (its antecedent is a
//             route where every step resolves to a node and to an existing alternative), so newDesign
//             chains them in exactly this order; the rule lives in exactly one place — RULES below,
//             numbers match docs/data-flow.md §6
// Interface:  parseDesign(xml) -> Map<path, Node>
//             parseRoutes(xml) -> Route[]
//             expand(nodes, routes) -> string
//             checkDesign({ nodes, routes, frd, known }) -> string[]  — blockers, empty = green
//             newDesign({ xml, frd, known }) -> Result<Design, "invalid-design">

import { ok, err } from "../../core/result.mjs"
// EXTERNAL_DEPENDENCY: core/xml.mjs — tag scanner (attrs · ATTRS · tag) shared with steps/scope: one
// grammar for two slices is read by one piece of code, otherwise part-parsing and design-parsing would drift apart.
// The same file holds the BUG_FIX_CONTEXT for ATTRS' quote-resilience.
import { attrs, ATTRS, tag } from "../../core/xml.mjs"

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
//   Consequent:   success: [{ scenario, steps: [{ path, alt }] }] in appearance order; `alt` is
//                          the number from `<path>#<n>`; a missing or non-numeric `#n` yields NaN,
//                          caught by rule 1 rather than silently defaulting to the first alternative
//                 failure: none — total
//   Purity:       pure
// Routes live in the SAME file as the graph: the role hands over one artifact, not two — a second
// file from the same role would have to be checked for consistency even before the five rules.
export function parseRoutes(xml) {
  return [...String(xml || "").matchAll(tag("route"))].map((m) => {
    const a = attrs(m[1])
    return Object.freeze({
      scenario: a.scenario || "",
      steps: Object.freeze(String(a.steps || "").split("->").map((s) => s.trim()).filter(Boolean).map((s) => {
        const [path, alt] = s.split("#")
        return Object.freeze({ path, alt: Number(alt) })
      })),
    })
  })
}

// FUNCTION_CONTRACT: expand — route + contracts → data-flow text
//   Input:        nodes — parseDesign's parse; routes — parseRoutes' parse
//   Dependencies: —
//   Antecedent:   GREEN checkDesign: every step resolves to a node that has the `alt` alternative.
//                 Calling this on an unchecked route is a defect of the caller, not of this function
//   Consequent:   success: text of `.agent/data-flow.md`: one block per scenario,
//                          `$START_FLOW id="<scenario>"` … `$END_FLOW`, with lines inside of the
//                          form `<n>. <path> : <in> -> <out>`; the first step's `in` is the first
//                          alternative of its node's `in`; step k+1's `in` is step k's CHOSEN `out`,
//                          copied verbatim
//                 failure: none, given the antecedent holds
//   Purity:       pure
// The machine substitutes the values, not the role: a copy is the one thing a weak tier survives
// (it paraphrases), and the one thing the script does for free.
export function expand(nodes, routes) {
  const out = []
  for (const r of routes) {
    out.push(`$START_FLOW id="${r.scenario}"`)
    r.steps.forEach((s, k) => {
      const n = nodes.get(s.path)
      const prev = k === 0 ? null : nodes.get(r.steps[k - 1].path)
      const inTok = k === 0 ? n.in[0] : prev.out[r.steps[k - 1].alt - 1]
      out.push(`${k + 1}. ${s.path} : ${inTok} -> ${n.out[s.alt - 1]}`)
    })
    out.push("$END_FLOW")
  }
  return out.join("\n")
}

// FUNCTION_CONTRACT: checkDesign — alignment of the two projections
//   Input:        { nodes, routes, frd }
//                 frd — { scenarios: string[], touched: string[] } from step 6; parsing
//                       `.agent/frd.xml` belongs to the intake slice (steps/intake/frd.mjs::parseFrd),
//                       here it is a DEPENDENCY, not a concern
//   Dependencies: —
//   Antecedent:   nodes — parseDesign's Map; routes — its array; frd — an object with two arrays
//                 (missing fields are read as empty)
//   Consequent:   success: string[] of blockers, empty = green. The rules and their numbers are the
//                          same as in docs/data-flow.md §6, NOT restated here in prose
//                 failure: none — total, "the design is bad" is DATA, not a function failure
//   Purity:       pure
// A route's node MUST be IN THE DESIGN GRAPH even if it doesn't change: the role copies a transit
// node from the ripple subgraph with its contract and WITHOUT `delta`. Otherwise expand has nothing
// to unfold the step from, and rule 4 has nothing to join — the contract lives on the node, and the
// script has no other source for it.
export function checkDesign({ nodes, routes = [], frd = {} }) {
  const B = []
  const used = new Set()

  for (const r of routes) {
    for (const [k, s] of r.steps.entries()) {
      const n = nodes.get(s.path)
      // Rule 1. An unknown node short-circuits the rest of this pair's checks: three blockers for one
      // defect take the role three times as long to fix as one.
      if (!n) { B.push(`1 ${r.scenario}#${k + 1}: узла нет в дизайн-графе — ${s.path}`); continue }
      if (!n.out[s.alt - 1]) { B.push(`1 ${r.scenario}#${k + 1}: у ${s.path} нет альтернативы #${s.alt} в out`); continue }
      used.add(s.path)

      const next = r.steps[k + 1]
      if (!next) continue
      const m = nodes.get(next.path)
      if (!m) continue
      // Rule 3. The edge is undirected: the return unwinds along the same <dep> backwards.
      if (!n.deps.includes(m.path) && !m.deps.includes(n.path)) {
        B.push(`3 ${r.scenario}#${k + 1}: нет ребра <dep> между ${s.path} и ${m.path}`)
      }
      // Rule 4 — the ONLY place where the role's manual input remains: neighboring contracts are
      // written independently of each other. Everything else is held together by expand's substitution.
      if (!m.in.includes(n.out[s.alt - 1])) {
        B.push(`4 ${r.scenario}#${k + 1}: out «${n.out[s.alt - 1]}» не среди in узла ${m.path}`)
      }
    }
  }

  // Rule 2. A node with a delta that no route passes through is structure without time: nothing
  // calls it, and a ticket for it would be written blind.
  for (const n of nodes.values()) if (n.delta && !used.has(n.path)) B.push(`2 узел с delta="${n.delta}" не встречен ни в одном маршруте — ${n.path}`)

  // Rule 5. A forgotten delta: an FRD scenario without a route, and a touched node outside all routes.
  const covered = new Set(routes.map((r) => r.scenario))
  for (const s of frd.scenarios || []) if (!covered.has(s)) B.push(`5 у сценария FRD ${s} нет маршрута`)
  for (const t of frd.touched || []) if (!used.has(t)) B.push(`5 touched FRD не встречен ни в одном маршруте — ${t}`)

  return B
}

// FUNCTION_CONTRACT: newDesign — step 9's artifacts from the role's text
//   Input:        { xml, frd } — xml as the role wrote it in staging
//   Dependencies: parseDesign, parseRoutes, checkDesign, expand
//   Antecedent:   xml — any value (empty text yields an empty graph and a "not one node" rejection);
//                 frd — same as checkDesign
//   Consequent:   success: { nodes, routes, flow } — flow is the text of `.agent/data-flow.md`,
//                          expanded OUT of the contracts, not out of whatever the role typed
//                 failure: "invalid-design" — blockers joined into one line by `\n  `, the same way
//                          newBrd does it: this text rides in the FEEDBACK of the re-delegation order
//   Purity:       pure
export function newDesign({ xml, frd = {} }) {
  const nodes = parseDesign(xml)
  const routes = parseRoutes(xml)
  if (!nodes.size) return err("invalid-design", "в дизайн-графе нет ни одного <module> — картировать изменение нечем")

  const blockers = checkDesign({ nodes, routes, frd })
  if (blockers.length) return err("invalid-design", blockers.join("\n  "))

  return ok(Object.freeze({ nodes, routes: Object.freeze(routes), flow: expand(nodes, routes) }))
}
