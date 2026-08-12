// MODULE_CONTRACT: ripple — step 8's pure core: is a design needed, and over WHICH nodes
// Purpose:    two decisions, both computable, so no role is called and no token is spent. First: is a
//             design ordered — answered by what step 9 EXISTS for (contracts kept consistent and a
//             data flow drawn before the work is cut into tickets that must agree), NOT by what step 7
//             answers (can an existing caller break). A moved contract always needs it; an unmoved one
//             needs it only when the work spans more than one node (docs/ripple.md §3). Second: which
//             slice of the map step 9 is handed, since `appgraph.xml` whole neither fits a role's
//             window nor is needed once the ripple is known.
//             PURE: knows no disk; the io — reading three artifacts, writing AND ERASING two — lives
//             in ext/index.mjs.
// io:         none
// EXTERNAL_DEPENDENCY: steps/intake/map.mjs — MAP_CAP_BYTES (the reading ceiling is ONE number for
//             the whole band) and the node/edge parse this core is fed. The map is never parsed here.
// EXTERNAL_DEPENDENCY: steps/design/design.mjs — the CONSUMER of `ripple.xml`. It parses `<module>`
//             with `<dep path/>` inside (parseDesign) and judges routes by those deps (checkDesign
//             rule 3), which is why the map's top-level `<edge from to/>` is projected onto the nodes
//             here instead of being copied: the form is dictated by the consumer, and a role asked to
//             translate one form into the other would be doing the one thing a weak tier gets wrong.
//             Not imported — a guardrail must not depend on the step it feeds; the test asserts the
//             agreement by reading this module's output with THAT module's parser.
// Invariants: newRipple is TOTAL — any input, including undefined, yields a Result and never throws
//             (an artifact outlives the run that wrote it, so this core is handed files older than
//             the current grammar); the subgraph is a FUNCTION of its inputs alone — nodes come out in
//             the map's own order, so two runs over one map agree byte for byte; a test node
//             (`kind="test"`) is never a node of the ripple.
// Interface:  GRAMMAR_VERSION — stamped on the artifact
//             DESIGN_TABLE — weight → how the flag is decided, as data
//             newRipple({ xml, frd, mode, map, cap? }) -> Result<Ripple, ...>

import { ok, err } from "../../core/result.mjs"
import { attrs, elem, esc } from "../../core/xml.mjs"
import { MAP_CAP_BYTES } from "../intake/map.mjs"

export const GRAMMAR_VERSION = 1

// The table of docs/ripple.md §3, and it answers the question step 9 EXISTS for — not the question
// step 7 answers. A design is ordered so that contracts stay consistent and the data flow is drawn
// before work is cut into tickets that must agree; SemVer answers something else entirely (can an
// existing caller break), and it stays the honest fact step 10 needs for a toggle.
//   `major`, `minor` — always: the contract moved, so there is a contract to keep consistent.
//   `patch`         — by WIDTH: the contract does not move, so one node has nothing to synchronise
//                     with; several nodes still do — a refactoring spread over modules must not have
//                     its tickets drift apart.
//
// BUG_FIX_CONTEXT: two live misses of the SAME rule, each in a different direction.
//   1. It read "needed if the CLOSURE is bigger than one node" (docs/workflow.md §3.8, docs/concept.md
//      line 133). Measured on the live map (run 682b6a71): the closure from one touched node is 5 of
//      15 — the whole connected component, because a closure over edges is that for any node with an
//      edge at all. `skip` was unreachable and the designer would have been ordered for everything.
//   2. It then counted the nodes CARRYING a delta. Run c4b7cea5 (quarkus-rest-json-app-v2-t2): one
//      delta on the resource, `fruits.html` touched but deltaless — a page has no contract of its
//      own, so it can carry none — and the flag came out `skip`. Yet the page and the endpoint must
//      agree on the shape of the answer: exactly `checkDesign` rule 4 (`out(k) ∈ in(k+1)`). The width
//      below is therefore the TOUCHED nodes, not the ones a contract could be pinned to.
export const DESIGN_TABLE = Object.freeze({
  major: "always",
  minor: "always",
  patch: "by-width",
})

// Attributes copied off the map's node, in the map's order, MINUS the two that would lie in a
// subgraph: `fanin`/`fanout` count the neighbours of the FULL graph, and beside a `<dep>` list cut to
// radius 1 they are a second place for one fact — the role would read "15 callers" under two visible
// ones and have no way to tell which is true (docs/ripple.md §4). What the subgraph hides is said
// instead by `cut`, the way the map says `<decl more="N"/>` about declarations it did not list.
const DROPPED = new Set(["path", "fanin", "fanout"])

const openTag = (path, seed, rest, cut) => {
  const tail = Object.entries(rest).map(([k, v]) => ` ${k}="${esc(v)}"`).join("")
  return `  <module path="${esc(path)}"${seed ? ' seed="yes"' : ""}${tail}${cut ? ` cut="${cut}"` : ""}`
}

// FUNCTION_CONTRACT: newRipple — step 8's two artifacts out of the FRD, the map and the weight
//   Input:        { xml, frd, mode, map, cap }
//                 xml  — text of `.agent/appgraph.xml`; the nodes are COPIED from it, so the role
//                        reads the same `<role>`/`<api>`/`<test>` the operator does
//                 frd  — parseFrd's parse (steps/intake/frd.mjs): `deltas`, `touched`, `scenarios`
//                 mode — the one word of `.agent/mode`
//                 map  — parseMap's parse (steps/intake/map.mjs): `nodes`, `tests`, `edges`
//                 cap  — the subgraph ceiling in bytes; defaults to the map's own MAP_CAP_BYTES
//   Dependencies: DESIGN_TABLE, openTag, core/xml.mjs
//   Antecedent:   any values — a missing frd, map or mode is a refusal, never a default
//   Consequent:   success: { design, xml, seeds[], nodes[] } — `design` is "needed" | "skip" by
//                          DESIGN_TABLE and the WIDTH of the change (the touched nodes, minus tests),
//                          `xml` the text of `.agent/ripple.xml`, `seeds` the nodes the FRD named and
//                          `nodes` every node of the subgraph, both in the MAP's order
//                 failure: "no-mode"      — no weight: step 7 refused or never ran
//                          "bad-mode"     — a word outside DESIGN_TABLE: another grammar version
//                          "no-delta"     — nothing to ripple from: no delta, or none of them named a
//                                           node that is a module of this map
//                          "unknown-node" — a seed the map does not declare; every one is named
//                          "over-cap"     — the subgraph does not fit the reader's window
//   Purity:       pure
export function newRipple({ xml, frd, mode, map, cap = MAP_CAP_BYTES } = {}) {
  const weight = String(mode == null ? "" : mode).trim()
  if (!weight) return err("no-mode", ".agent/mode пуст или отсутствует — шаг 7 не отработал, вес не угадывается")
  if (!DESIGN_TABLE[weight]) {
    return err("bad-mode", `вес "${weight}" вне таблицы — допустимо ${Object.keys(DESIGN_TABLE).join(" | ")}`)
  }

  const deltas = (frd && frd.deltas) || []
  if (!deltas.length) return err("no-delta", "в FRD ни одной <delta> — рябь считать не от чего")

  const nodes = (map && map.nodes) || new Set()
  const tests = (map && map.tests) || new Set()

  // The seeds come from THREE places, and the third is not decoration: `checkDesign` demands a route
  // for every FRD scenario (rule 5) and a contracted node for every step of it (rule 1), and the role
  // copies a transit node's contract OUT of this subgraph — it has no other source (steps/design/
  // design.mjs, the comment on checkDesign). A node a scenario passes through without changing would
  // otherwise be missing exactly where step 9 must have it. F4 of step 6 already made these paths
  // resolvable, on the rail that can still repair them.
  const deltaNodes = deltas.map((d) => d.node).filter(Boolean)
  const routeNodes = (frd.scenarios || []).flatMap((s) => String(s.nodes || "").split(/\s+/).filter(Boolean))
  const named = [...new Set([...deltaNodes, ...(frd.touched || []).filter(Boolean), ...routeNodes])]

  // The modules this change CREATES (`<delta new="yes">`, declared and judged at step 6 — F3n,
  // steps/intake/frd.mjs). They are absent from the map BY DEFINITION, so they are neither a missing
  // node nor a seed: there is no neighbourhood to cut around a file that does not exist. Step 9 gets
  // them from the FRD itself — its order carries `.agent/frd.xml` whole — and `checkDesign` rule 6
  // already allows a node with a `delta` outside this subgraph, calling it the designer's own
  // judgement (steps/design/design.mjs).
  //
  // BUG_FIX_CONTEXT: live run b857d4a0 — the band stopped one step earlier, at the weight, because
  //   the FRD could not express a new module at all; this filter is the second half of that fix, and
  //   without it the very next refusal would have been `unknown-node` here.
  const created = new Set(deltas.filter((d) => d.new === "yes" && d.node).map((d) => d.node))

  const unknown = named.filter((p) => !nodes.has(p) && !created.has(p))
  if (unknown.length) {
    return err("unknown-node", `узла нет в карте: ${unknown.join(", ")} — frd.xml старше appgraph.xml либо путь выдуман`)
  }

  const seeds = new Set(named.filter((p) => !tests.has(p) && !created.has(p)))
  // A change that ONLY adds modules has nothing to cut a subgraph around, and that is a legal state:
  // the width below still counts the work, the flag is still decided, and the designer writes the new
  // modules from the FRD. The refusal stays for the case it was written for — deltas that named no
  // module at all.
  if (!seeds.size && !created.size) {
    return err("no-delta", "ни одна дельта не назвала узла-модуля — рябь считать не от чего (тест дельтой не бывает, F2/F3 шага 6)")
  }

  // Radius 1, in BOTH directions: a caller is affected by a changed contract, and a callee is what the
  // changed node's own contract now leans on. Deeper is a declared assumption with a trigger, not an
  // oversight — the closure would be the connected component (BUG_FIX_CONTEXT above), and the first
  // live run where checkDesign rule 1 reddens on a node missing here is what buys the wider radius
  // (docs/ripple.md §4).
  const edges = ((map && map.edges) || []).filter((e) => nodes.has(e.from) && nodes.has(e.to) && e.from !== e.to)
  const near = new Map()                                   // path -> Set(neighbour), undirected
  const link = (a, b) => { if (!near.has(a)) near.set(a, new Set()); near.get(a).add(b) }
  for (const e of edges) { link(e.from, e.to); link(e.to, e.from) }

  const shown = new Set(seeds)
  for (const s of seeds) for (const n of near.get(s) || []) if (!tests.has(n)) shown.add(n)

  // WIDTH — how many nodes the change makes WORK on, which is how many tickets step 10 will cut. It is
  // `touched` plus the delta nodes, and NOT `seeds`: a scenario's route may pass through a node the
  // change never touches, and a transit node is context for the designer, not work for an executor.
  const width = new Set([...deltaNodes, ...(frd.touched || [])].filter((p) => p && !tests.has(p)))

  const out = []
  const order = []
  for (const m of String(xml || "").matchAll(elem("module"))) {
    const a = attrs(m[1])
    if (!shown.has(a.path)) continue
    order.push(a.path)

    const deps = [...(near.get(a.path) || [])].filter((n) => shown.has(n))
    // What the radius hid, said out loud. Test neighbours are not counted: they are not hidden, they
    // ride inside the node as `<test path suite>` and a number about them would read as lost work.
    const cut = [...(near.get(a.path) || [])].filter((n) => !shown.has(n) && !tests.has(n)).length
    const rest = Object.fromEntries(Object.entries(a).filter(([k]) => !DROPPED.has(k)))
    const body = (m[2] || "").replace(/^\n+/, "").replace(/\s+$/, "")   // the element's own indent survives
    const depLines = deps.map((d) => `    <dep path="${esc(d)}"/>`).join("\n")

    const head = openTag(a.path, seeds.has(a.path), rest, cut)
    if (!body && !depLines) { out.push(`${head}/>`); continue }
    out.push(`${head}>`)
    if (body) out.push(body)
    if (depLines) out.push(depLines)
    out.push("  </module>")
  }

  const design = DESIGN_TABLE[weight] === "always" || (DESIGN_TABLE[weight] === "by-width" && width.size > 1)
    ? "needed"
    : "skip"

  const text = [
    `<ripple grammar="${GRAMMAR_VERSION}" mode="${esc(weight)}" seeds="${seeds.size}" nodes="${order.length}">`,
    ...out,
    "</ripple>",
  ].join("\n")

  const bytes = Buffer.byteLength(text, "utf8")
  if (bytes > cap) {
    return err("over-cap", `подграф ${bytes} Б на ${order.length} узлов — выше потолка чтения ${cap} Б: индексной формы этот срез не строит (docs/ripple.md §4)`)
  }

  return ok(Object.freeze({
    design,
    xml: text,
    seeds: Object.freeze(order.filter((p) => seeds.has(p))),
    nodes: Object.freeze(order),
  }))
}
