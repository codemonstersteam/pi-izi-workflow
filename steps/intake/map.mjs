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
//             MAP_NODE_BYTES · MAP_EDGE_BYTES — what a node and an edge of the map cost
//             parseMap(xml) -> { nodes, tests, entries: Set<string>, edges: Edge[], count,
//                                nodeTests: Map, suites: Suite[], spine: {…}, cycles: Set<string> }
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

// MAP_NODE_BYTES / MAP_EDGE_BYTES — what the map costs, as two numbers the code may multiply by.
//
// They live next to the cap because the three are one arithmetic: "does the map fit" is
// `Σ nodes + Σ edges ≤ cap`. Step 3b (steps/focus/focus.mjs) is their only consumer: it decides
// BEFORE the swarm whether the map the swarm would produce can be read at all, which is the whole
// point of measuring instead of finding out after 39 batches (docs/big-projects-problems.md §2).
//
// MEASURED on a live artifact — but read the correction below before trusting the second decimal.
// The split was taken on `runbox/s31-before-t3/appgraph.xml` (10310 B, 17 modules, 8 edges):
//   edges   1528 B over 8   → 191 B each, of which 103 B is the two paths  → 88 B + the paths
//   the rest 8782 B over 17 → 516 B each, of which  48 B is the path       → 468 B + the path
// The PATH is not folded into the constant, and that is the correction that matters: a java monolith
// writes `src/main/java/ai/labs/eddi/backup/impl/RestExportService.java` where the form writes
// `src/main/java/org/acme/rest/json/Fruit.java`, and an edge names two of them. Folding an average
// path length into one number is what made the previous constant (417 B/node, no edges at all)
// under-count eddi by 2.3× — 114 KB estimated against 259 KB real.
//
// CORRECTION, and it is the kind this file exists to prevent. That 10310 B file is the snapshot
// taken BEFORE run 23644036, not its result: the run's own artifact is 10253 B, so the formula
// reproduces its source to 0.50%, not to the 0.1% first claimed here and in commit 67ea8b2.
//
// Two things are folded into the 468 and both make it OVER-count a small focus: the map's fixed
// preamble (the header, `<lang>`, `<suite>`, the spine's answers — 2153 B on t3, 11498 B on eddi)
// and `<role>`, which the scout writes and which does not exist before the swarm. Measured against
// eddi's real map (run a3597dd3, 114072 B over 126 nodes and 199 edges) the per-element numbers are
// 409 and 84, and the formula lands at 110745 — 2.9% low, because the preamble it never modelled is
// larger there than the per-node slack it carries. The estimate is therefore a two-sided
// approximation, not a bound, and the last honest check stays where it has always been:
// mapMeasure() below, after the swarm, on the real bytes.
export const MAP_NODE_BYTES = 468
export const MAP_EDGE_BYTES = 88

// FUNCTION_CONTRACT: parseMap — the map's node keys
//   Input:        xml — text of `.agent/appgraph.xml`; type unconstrained
//   Dependencies: core/xml.mjs
//   Antecedent:   any value — undefined/null/garbage are read as a map with no nodes
//   Consequent:   success: { nodes: Set<path>, tests: Set<path>, entries: Set<path>,
//                          edges: [{from, to}], count, nodeTests, suites, spine, cycles }
//                          — every `<module path=…>`, self-closing or
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
// FOUR MORE FIELDS FOR STEP 10, and none of them a second reader of this grammar (docs/plan.md §7):
//   nodeTests — the `<test path suite>` a node declares, which is where the node's CHECK COMMAND comes
//               from once the suite is looked up. `tests` above answers "is this node a test"; this
//               answers "what tests does this node have", and the two are different questions about
//               different keys.
//   suites    — `<suite id kind cmd one path match>` verbatim: `cmd` runs the suite, `one` runs a
//               single file (empty is a legal value — step 10 then plans the whole suite and says so).
//   spine     — the answers the repository did NOT give: `toggles`, `branching`, `contract`. A
//               `found="no"` becomes null, so "there is no toggle mechanism" is a case, never an empty
//               string that reads as an answer (standards/code.md §2).
//   cycles    — every module named by a `<cycle modules="…">`. Step 10 topologically sorts, and a
//               cycle is the one thing a topological sort cannot survive.
export function parseMap(xml) {
  const s = String(xml || "")
  const nodes = new Set()
  const tests = new Set()
  const entries = new Set()
  const nodeTests = new Map()
  for (const m of s.matchAll(elem("module"))) {
    const a = attrs(m[1])
    if (!a.path) continue
    nodes.add(a.path)
    if (a.kind === "test") tests.add(a.path)
    if (/<api\b/.test(m[2] || "")) entries.add(a.path)
    const own = [...String(m[2] || "").matchAll(tag("test"))]
      .map((t) => attrs(t[1]))
      .filter((t) => t.path)
      .map((t) => Object.freeze({ path: t.path, suite: t.suite || "" }))
    if (own.length) nodeTests.set(a.path, Object.freeze(own))
  }

  const suites = [...s.matchAll(tag("suite"))]
    .map((m) => attrs(m[1]))
    .filter((a) => a.id)
    .map((a) => Object.freeze({ id: a.id, kind: a.kind || "", cmd: a.cmd || "", one: a.one || "", path: a.path || "", match: a.match || "" }))

  const spineAnswer = (el) => {
    const m = s.match(tag(el, "/?>"))
    if (!m) return null
    const a = attrs(m[0].replace(new RegExp(`^<${el}\\b`), "").replace(/\/?>$/, ""))
    return a.found === "no" ? null : Object.freeze(a)
  }
  const spine = Object.freeze({
    toggles: spineAnswer("toggles"),
    branching: spineAnswer("branching"),
    contract: spineAnswer("contract"),
  })

  const cycles = new Set(
    [...s.matchAll(tag("cycle"))].flatMap((m) => String(attrs(m[1]).modules || "").split(/\s+/).filter(Boolean)),
  )
  // The edges are read but NOT judged: step 6 ignores them entirely, and step 8 decides for itself
  // what a test endpoint or a dangling one means for the ripple. `via` is dropped — the ripple carries
  // the fact of the edge, and the line of code that proves it is already in the map the operator reads.
  const edges = [...s.matchAll(tag("edge"))]
    .map((m) => attrs(m[1]))
    .filter((a) => a.from && a.to)
    .map((a) => Object.freeze({ from: a.from, to: a.to }))
  return { nodes, tests, entries, edges, count: nodes.size, nodeTests, suites, spine, cycles }
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
