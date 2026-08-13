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
    if (!units.length) continue
    out.push(`$START_TESTS path="${path}"`)
    units.forEach((u, k) => out.push(`${k + 1}. ${u}`))
    out.push("$END_TESTS")
  }

  return out.join("\n")
}

// FUNCTION_CONTRACT: checkDesign — alignment of the two projections
//   Input:        { nodes, routes, frd, known }
//                 frd — the parse of `.agent/frd.xml` AS steps/intake/frd.mjs::parseFrd returns it:
//                       `scenarios` are the ELEMENTS (an id lives in `.id`), `touched` are paths.
//                       Parsing that file belongs to the intake slice; here it is a DEPENDENCY
//                 known — accepted and UNUSED since rule 6 moved to steps/design/nodes.mjs
//                       (backlog D2); see the note at the end of the body for why the parameter
//                       stays. Callers keep passing the ripple subgraph's Set<path>
//   Dependencies: —
//   Antecedent:   nodes — parseDesign's Map; routes — its array; frd — an object with two arrays
//                 (missing fields are read as empty)
//   Consequent:   success: string[] of blockers, empty = green. The rules and their numbers are the
//                          same as in docs/data-flow.md §6, NOT restated here in prose — rules
//                          1, 2, 3, 4, 5 and 7, the ones that need BOTH projections on the table;
//                          rules 6 and 8 are judged one artifact earlier, see the note at the end
//                 failure: none — total, "the design is bad" is DATA, not a function failure
//   Purity:       pure
//   BUG_FIX_CONTEXT: this slice was written BEFORE steps 6 and 8 existed, and its fixture was
//                 invented rather than parsed. `frd.scenarios` was compared as a list of STRINGS
//                 while parseFrd returns elements, so rule 5 reddened on every real FRD, with the
//                 text «у сценария FRD [object Object] нет маршрута» — a blocker no role can repair,
//                 burning every redelegation down to `escalate` (docs/design.md §3, discrepancy A).
//
// A route's node MUST be IN THE DESIGN GRAPH even if it doesn't change: the role copies a transit
// node from the ripple subgraph with a contract it derives from that node's `<api>`/`<decl>`, and
// WITHOUT `delta`. Otherwise expand has nothing to unfold the step from, and rule 4 has nothing to
// join — the contract lives on the node, and the script has no other source for it.
export function checkDesign({ nodes, routes = [], frd = {}, known = null }) {
  const B = []
  const used = new Set()
  const chosen = new Map() // path → Set of the `out` alternatives some route actually took (rule 7)

  for (const r of routes) {
    for (const [k, s] of r.steps.entries()) {
      const n = nodes.get(s.path)
      // Rule 1. An unknown node short-circuits the rest of this pair's checks: three blockers for one
      // defect take the role three times as long to fix as one.
      if (!n) { B.push(`1 ${r.scenario}#${k + 1}: узла нет в дизайн-графе — ${s.path}`); continue }
      // Rule 1 at the BOUNDARY: what starts the scenario is named, never guessed. Before this the
      // script took `in[0]` by position (see walk's BUG_FIX_CONTEXT) — a silent default, which
      // standards/code.md forbids by constraint 3 for exactly the reason the live run demonstrated:
      // a default is indistinguishable from a fact.
      if (k === 0 && !n.in[r.entry - 1]) {
        B.push(`1 ${r.scenario}: entry=${Number.isFinite(r.entry) ? `"${r.entry}"` : "(не назван)"} — у первого узла ${s.path} нет такой альтернативы in. Маршрут обязан НАЗВАТЬ, каким внешним вызовом он запущен; если подходящей альтернативы нет, значит вход в контракте узла не объявлен`)
        continue
      }
      if (!n.out[s.alt - 1]) { B.push(`1 ${r.scenario}#${k + 1}: у ${s.path} нет альтернативы #${s.alt} в out`); continue }
      used.add(s.path)
      if (!chosen.has(s.path)) chosen.set(s.path, new Set())
      chosen.get(s.path).add(s.alt)

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
  for (const s of frd.scenarios || []) {
    const id = (s && s.id) || ""
    if (!covered.has(id)) B.push(`5 у сценария FRD ${id || "(без id)"} нет маршрута`)
  }
  for (const t of frd.touched || []) if (!used.has(t)) B.push(`5 touched FRD не встречен ни в одном маршруте — ${t}`)

  for (const n of nodes.values()) {
    // Rule 7. An `out` alternative no route takes is either a dead branch of the contract or a missing
    // FRD scenario — and it would silently shorten the node's unit list, which IS the `<dod>` of its
    // ticket (docs/design.md §2). Only nodes with a delta are judged: an existing node keeps as many
    // branches as it likes, and no ticket will be written for it. A delta node NO route passes through
    // is rule 2's finding, and it does not reach here — one defect, one blocker.
    if (!n.delta || !used.has(n.path)) continue
    const took = chosen.get(n.path) || new Set()
    for (const [i, alt] of n.out.entries()) {
      if (!took.has(i + 1)) B.push(`7 узел ${n.path} с delta="${n.delta}": альтернатива out «${alt}» не пройдена ни одним маршрутом — она мертва либо сценария FRD не хватает`)
    }
  }

  // Rules 6 and 8 are NOT here any more, and neither number was reused:
  //   8 → steps/design/values.mjs::checkValues (backlog D1). The dictionary of pass A is the earliest
  //     artifact in which a declared failure is decidable, and everything after it refers to values by
  //     id. What that move costs is repaid in checkGraph: over a flat dictionary the rule only says
  //     "declared somewhere", so "produced by SOME node's out" is judged there, in the pass that owns
  //     the contracts (backlog, «Что концепт обещает, а код не подтвердил», п. 2).
  //   6 → steps/design/nodes.mjs::checkGraph (backlog D2), whole, both halves. It reads only NODES,
  //     never a route, so it belongs to the pass whose only subject is the graph. `known` is the one
  //     input it consumed; the parameter stays in this signature because ext/index.mjs still passes
  //     it, and this whole function is deleted in D5 — a signature change here would be a second edit
  //     of the same code.

  return B
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
