// MODULE_CONTRACT: map — how the application map is READ by step 6: its node keys and its price
// Purpose:    one decision — does `.agent/appgraph.xml` fit the reader's window, and which node keys
//             a `touched` may resolve to. Two consumers, one parse: the guardrail needs the key set
//             (F2/F3, docs/intake.md §5) and the order needs the map's text with its measured cost.
//             PURE: knows nothing of disk, io lives in ext/index.mjs.
// io:         none
// Invariants: parseMap and mapMeasure are total — any input, including undefined, yields an empty
//             parse and never throws; the cap is a CONSTANT here and nowhere else.
// Interface:  MAP_CAP_BYTES — the reading ceiling, in bytes
//             parseMap(xml) -> { nodes: Set<string>, count: number }
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
import { attrs, tag } from "../../core/xml.mjs"

// 32K tokens of map ≈ 115 KB (docs/concept.md, "Как карта читается"); at the measured 417 B/node
// (docs/graph.md §7, live run c166bd87) that is ≈306 nodes. The number lives HERE — the workflow and
// the role receive it through the host, they do not carry a copy.
export const MAP_CAP_BYTES = 115 * 1024

// FUNCTION_CONTRACT: parseMap — the map's node keys
//   Input:        xml — text of `.agent/appgraph.xml`; type unconstrained
//   Dependencies: core/xml.mjs
//   Antecedent:   any value — undefined/null/garbage are read as a map with no nodes
//   Consequent:   success: { nodes: Set<path>, tests: Set<path>, count } — every `<module path=…>`,
//                          self-closing or with a body, in appearance order; a repeated path
//                          collapses (a Set: one path is one name, the invariant step 5 already
//                          enforced). `tests` is the subset the map marked `kind="test"`
//                 failure: none — total
//   Purity:       pure
// The scan is `<module\b …` without demanding a closing form, so BOTH shapes of the grammar are seen:
// step 5 writes a body when the node has declarations and a self-closing tag when it does not.
//
// `tests` exists for one rule (docs/intake.md §4, F3): a test is never a delta of its own. It reaches
// a ticket together with the module it checks — the map already binds them through `<test path suite>`
// — and splitting them would hand the test and the code to two different executors.
export function parseMap(xml) {
  const nodes = new Set()
  const tests = new Set()
  for (const m of String(xml || "").matchAll(tag("module", ">"))) {
    const a = attrs(m[1])
    if (!a.path) continue
    nodes.add(a.path)
    if (a.kind === "test") tests.add(a.path)
  }
  return { nodes, tests, count: nodes.size }
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
