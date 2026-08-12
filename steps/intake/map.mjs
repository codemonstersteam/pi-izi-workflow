// MODULE_CONTRACT: map — how the application map is READ: its node keys, its edges and its price
// Purpose:    one decision — does `.agent/appgraph.xml` fit the reader's window, and which node keys
//             a `touched` may resolve to. THREE consumers, one parse: step 6's guardrail needs the key
//             set (F2/F3/F4, docs/intake.md §4), its order needs the map's text with the measured
//             cost, and step 8 needs the same keys plus the EDGES to cut the ripple subgraph out of
//             the map (steps/ripple/ripple.mjs). A second reader of this grammar would drift from
//             this one exactly as a second parser of frd.xml would — which is why step 7 has none.
//             PURE: knows nothing of disk, io lives in ext/index.mjs.
// io:         none
// Invariants: parseMap and mapMeasure are total — any input, including undefined, yields an empty
//             parse and never throws; the cap is a CONSTANT here and nowhere else.
// Interface:  MAP_CAP_BYTES — the reading ceiling, in bytes
//             parseMap(xml) -> { nodes, tests, entries: Set<string>, edges: Edge[], count }
//             mapMeasure(xml, cap?) -> { bytes, nodes, overCap }
//
// WHY A MEASUREMENT AND NOT AN INDEX. docs/concept.md promised the reader an INDEX form above the
// ceiling (a module tree with `<api scope="public">`, no declarations, no edges). This slice does not
// build it, and that is a decision with a reason, not an omission: its price has never been measured
// (docs/graph.md §7 measured the FULL form — 417 B per node on a live run — and nothing else), and on
// every repository this pipeline has actually run on the branch would not execute once. A seam that
// only a synthetic fixture can reach is a test that no edit of the code can turn red — precisely the
// test standards/code.md forbids writing. Above the ceiling the step therefore REFUSES with the
// number, and the index arrives together with the repository that needs it, priced on that repository.
import { attrs, elem, tag } from "../../core/xml.mjs"

// 32K tokens of map ≈ 115 KB (docs/concept.md, "Как карта читается"); at the measured 417 B/node
// (docs/graph.md §7, live run c166bd87) that is ≈306 nodes. The number lives HERE — the workflow and
// the role receive it through the host, they do not carry a copy.
export const MAP_CAP_BYTES = 115 * 1024

// FUNCTION_CONTRACT: parseMap — the map's node keys
//   Input:        xml — text of `.agent/appgraph.xml`; type unconstrained
//   Dependencies: core/xml.mjs
//   Antecedent:   any value — undefined/null/garbage are read as a map with no nodes
//   Consequent:   success: { nodes: Set<path>, tests: Set<path>, entries: Set<path>,
//                          edges: [{from, to}], count } — every `<module path=…>`, self-closing or
//                          with a body, in appearance order; a repeated path collapses (a Set: one
//                          path is one name, the invariant step 5 already enforced). `tests` is the
//                          subset the map marked `kind="test"`; `entries` the subset that declares at
//                          least one `<api>` — an entry someone outside the repository can call.
//                          `edges` are the map's `<edge from to/>` VERBATIM, in appearance order:
//                          duplicates, self-loops and endpoints outside `nodes` are kept, because
//                          which of those matter is the consumer's rule, not the reader's
//                 failure: none — total
//   Purity:       pure
// The scan takes BOTH shapes of the grammar in one pass — step 5 writes a body when the node has
// declarations and a self-closing tag when it does not — because `entries` needs the body.
//
// `tests` exists for one rule (docs/intake.md §4, F3): a test is never a delta of its own. It reaches
// a ticket together with the module it checks — the map already binds them through `<test path suite>`
// — and splitting them would hand the test and the code to two different executors.
//
// `entries` exists for one rule too (F3, the `Changed`/`Removed` half): together with the incoming
// edges it answers "can an existing call of this node break at all". A node with neither has no
// existing caller, and a form defined by its effect ON a caller is then a statement about nothing.
export function parseMap(xml) {
  const s = String(xml || "")
  const nodes = new Set()
  const tests = new Set()
  const entries = new Set()
  for (const m of s.matchAll(elem("module"))) {
    const a = attrs(m[1])
    if (!a.path) continue
    nodes.add(a.path)
    if (a.kind === "test") tests.add(a.path)
    if (/<api\b/.test(m[2] || "")) entries.add(a.path)
  }
  // The edges are read but NOT judged: step 6 ignores them entirely, and step 8 decides for itself
  // what a test endpoint or a dangling one means for the ripple. `via` is dropped — the ripple carries
  // the fact of the edge, and the line of code that proves it is already in the map the operator reads.
  const edges = [...s.matchAll(tag("edge"))]
    .map((m) => attrs(m[1]))
    .filter((a) => a.from && a.to)
    .map((a) => Object.freeze({ from: a.from, to: a.to }))
  return { nodes, tests, entries, edges, count: nodes.size }
}

// FUNCTION_CONTRACT: mapMeasure — the price of handing this map to a role
//   Input:        xml — text of `.agent/appgraph.xml`; cap — the ceiling in bytes
//   Dependencies: parseMap, MAP_CAP_BYTES
//   Antecedent:   any value; cap defaults to MAP_CAP_BYTES
//   Consequent:   success: { bytes, nodes, overCap } — bytes is the UTF-8 length (the map is Cyrillic
//                          in its `<role>` texts, so counting characters would understate it by a
//                          third), nodes is the node count, overCap says whether the reader's window
//                          is exceeded
//                 failure: none — total
//   Purity:       pure
export function mapMeasure(xml, cap = MAP_CAP_BYTES) {
  const text = String(xml || "")
  const bytes = Buffer.byteLength(text, "utf8")
  return { bytes, nodes: parseMap(text).count, overCap: bytes > cap }
}
