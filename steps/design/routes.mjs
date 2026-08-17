// MODULE_CONTRACT: routes — step 9 pass B: the change played out, one CHAIN per end of a use case
// Purpose:    one decision, and it is the last judgement of step 9: through which nodes, and carrying
//             which value, does each end of each use case get reached. Everything else the deliverable
//             carries — the contract of every node, the edges between them, the flow and the unit list
//             — FOLLOWS from those chains and is computed here, at no cost.
//             PURE: knows nothing of disk, io lives in ext/index.mjs. The grammar — docs/data-flow.md §4b.
// io:         none
// EXTERNAL_DEPENDENCY: steps/intake/frd.mjs::endsOf — the ends of a use case are enumerated ONCE, by
//             the grammar that owns them. Pass A's skeleton is that list; this skeleton is the same
//             list crossed with the scenarios, so the two passes cannot disagree about what an end is.
//             `parseFrd`'s deltas and scenarios are read as data, never re-parsed.
// EXTERNAL_DEPENDENCY: steps/ripple/ripple.mjs::changeWidth — "which nodes does this change work on"
//             is step 8's expression; steps 8, 9 and 10 must not be able to disagree about it.
// EXTERNAL_DEPENDENCY: steps/plan/plan.mjs::forwardLegs + orderLegs — "which directed edge does a chain
//             assert" and "which of them order the WORK" are ONE derivation each, and both live with
//             their other consumer: step 10 orders by exactly these edges, so a cycle this guardrail
//             misses is `err("cycle")` at step 10 with no repair rail at all (live run f7bf154a), and
//             a cycle this guardrail INVENTS is three redelegations the role cannot repair.
// Invariants: every function here is TOTAL — any input, including undefined, yields an empty result
//             and never throws; the skeleton is a FUNCTION of the FRD and the dictionary, so two runs
//             over one pair agree byte for byte; checkChains returns EVERY blocker, not the first.
// Interface:  ROUTES_GRAMMAR — the version stamped on the working artifact
//             routesSkeleton({ frd, values }) -> { xml, chains, blank }
//             parseChains(xml) -> Chain[]
//             checkChains({ staged, frd, values, edges }) -> string[]  — blockers, empty = green
//             assemble({ chains, values, frd, ripple, mode }) -> { xml, nodes, units, unstepped }
//
// WHY A CHAIN AND NOT A CONTRACT — the measurement that chose this shape.
//
// The obvious form for this pass is "every node declares what it takes and what it gives", and it is
// the wrong one. On the single finished deliverable this pipeline ever produced (form `t3`), all five
// `in` alternatives of its three nodes are RECOVERABLE: three are verbatim some other node's `out`,
// two are the entries of their scenarios (`closes="UCx/in"` in the dictionary). Nothing about `in` is
// a judgement — it is the previous step's `out`, and asking a model for it buys the rule «consequent
// of step N ⊆ antecedent of step N+1», which is the rule that cost live run 0bbf7054 33 and 49 blocker
// lines and produced no artifact at all.
//
// So the role writes only what cannot be derived: the ORDER of the nodes and the value handed on at
// each step. Measured obligations: `eddi` — 23 chains over 12 scenarios, each ≤ 4 nodes; `t2` — 4;
// `t3` — 5. Pass A closed on the first attempt with 24 blanks, so this is the same order of work.

import { attrs, tag, tokens, esc } from "../../core/xml.mjs"
import { endsOf } from "../intake/frd.mjs"
import { changeWidth } from "../ripple/ripple.mjs"
import { forwardLegs, orderLegs } from "../plan/plan.mjs"

export const ROUTES_GRAMMAR = 1

// A chain's id: the scenario, then the scenario with a letter. The device is the machine's, and it is
// the machine's on purpose — an id composed out of the branch's MEANING (`S1_notfound`) is an id no
// consumer can resolve back to its scenario.
const SUFFIX = "bcdefghijklmnopqrstuvwxyz"
const chainId = (base, k) => (k === 0 ? base : `${base}${SUFFIX[k - 1] || "?"}`)

// The value that closes a given end token, out of the dictionary's own attribution. A token closed by
// no value cannot happen on a green pass A (the skeleton gives every end a row), and if it ever does,
// the chain is written with an empty `exit` and rule 3 reddens with a sentence a human can act on.
const closerOf = (values, token) => {
  for (const [id, ends] of values.closes || []) if (ends.includes(token)) return id
  return ""
}

// FUNCTION_CONTRACT: routesSkeleton — the chains of the change, composed
//   Input:        { frd, values }
//                 frd    — parseFrd's object; values — parseValues' dictionary (with `closes`)
//   Dependencies: endsOf, closerOf
//   Antecedent:   any values — no FRD yields no chains, which is what a caller with no requirement
//                 should see
//   Consequent:   success: { xml, chains, blank } — one `<route>` per (scenario × OUTPUT end of its
//                          use case), in the FRD's scenario order and the ends' own order. Each row
//                          carries `id`, `scenario`, `uc`, `end` (the token), `entry` (the value id
//                          that closes `UCx/in`), `exit` (the value id that closes `end`) and `nodes`
//                          (the scenario's own paths). `steps` is empty and is the whole of the role's
//                          work
//                 failure: none — total
//   Purity:       pure
//   Interface:    routesSkeleton({ frd, values }) -> { xml, chains, blank }
//
// ONE CHAIN PER END, NOT PER SCENARIO. A scenario with a failure branch reaches TWO ends and a linear
// route can reach one, so the branch is its own chain — the device the finished `t3` deliverable used
// (`S3` and `S3-ext`). Splitting it here rather than leaving it to the role is what makes the row a
// fill-in-the-blank: the start and the finish are both given, and only the way between them is asked.
export function routesSkeleton({ frd = {}, values = new Map() } = {}) {
  const ends = endsOf(frd)
  const rows = []
  for (const s of (frd && frd.scenarios) || []) {
    const id = String((s && s.id) || "").trim()
    const uc = String((s && s.uc) || "").trim()
    if (!id || !uc) continue
    const entry = closerOf(values, `${uc}/in`)
    const outs = ends.filter((e) => e.uc === uc && e.side === "out")
    outs.forEach((e, k) => {
      rows.push({
        id: chainId(id, k), scenario: id, uc, end: e.token,
        entry, exit: closerOf(values, e.token), nodes: tokens(s.nodes).join(" "), text: e.text,
      })
    })
  }
  const line = (r) => `  <route id="${esc(r.id)}" scenario="${esc(r.scenario)}" uc="${esc(r.uc)}" end="${esc(r.end)}"`
    + ` entry="${esc(r.entry)}" exit="${esc(r.exit)}" nodes="${esc(r.nodes)}" steps=""`
    + ` ends="${esc(r.text)}"/>`
  const xml = [`<routes grammar="${ROUTES_GRAMMAR}" form="skeleton">`, ...rows.map(line), "</routes>"].join("\n")
  return Object.freeze({ xml, chains: rows.length, blank: rows.length })
}

// FUNCTION_CONTRACT: parseChains — the chains from their text
//   Input:        xml — the staged file or the skeleton; type unconstrained
//   Dependencies: core/xml.mjs
//   Antecedent:   any value — undefined/garbage read as no chains
//   Consequent:   success: [{ id, scenario, uc, end, entry, exit, nodes[], steps[{path, value}] }] in
//                          appearance order. `steps` is cut on `->`, each step is `path@value`; a step
//                          with no `@` keeps an empty value rather than being dropped, so the guardrail
//                          reports it instead of the file silently shrinking
//                 failure: none — total
//   Purity:       pure
export function parseChains(xml) {
  const out = []
  for (const m of String(xml || "").matchAll(tag("route"))) {
    const a = attrs(m[1])
    const steps = String(a.steps || "").split("->").map((s) => s.trim()).filter(Boolean).map((s) => {
      const at = s.lastIndexOf("@")
      return Object.freeze({ path: at < 0 ? s : s.slice(0, at), value: at < 0 ? "" : s.slice(at + 1) })
    })
    out.push(Object.freeze({
      id: a.id || "", scenario: a.scenario || "", uc: a.uc || "", end: a.end || "",
      entry: a.entry || "", exit: a.exit || "", nodes: tokens(a.nodes), steps: Object.freeze(steps),
    }))
  }
  return out
}

// FUNCTION_CONTRACT: checkChains — did the role walk THESE chains, and only walk them
//   Input:        { staged, frd, values, edges } — the text the role wrote, the two inputs the
//                 skeleton is a function of, and the MAP's directed edges for the cycle rule
//   Dependencies: routesSkeleton, parseChains, forwardLegs
//   Antecedent:   any values
//   Consequent:   success: string[] — one blocker per defect, empty means green
//                 failure: none — total
//   Purity:       pure
//
// FOUR RULES, AND EVERY ONE OF THEM IS A THING THE ROLE CAN ACTUALLY DO WRONG. What the old pass C
// judged with eleven rules is mostly gone, and gone by CONSTRUCTION rather than by decision:
//   · «the composition of the routes» — the skeleton is the composition (rule 1 only asks that it was
//     copied), so «a scenario with no route» and «a route of a scenario the FRD does not carry» are
//     unreachable;
//   · «`out(k)` is an alternative `in(k+1)` accepts» — there are no contracts to disagree: `in` IS the
//     previous step's value, computed by `assemble`. This is the rule that produced 33 and 49 blocker
//     lines in run 0bbf7054;
//   · «a value seated in two nodes» — a value sits where a chain hands it over, once per step;
//   · «the entry is named» — the entry is the dictionary's, not the role's (live run ffe8cb7b).
export function checkChains({ staged, frd = {}, values = new Map(), edges = [] } = {}) {
  const B = []
  const want = parseChains(routesSkeleton({ frd, values }).xml)
  const mine = parseChains(staged)
  const byId = new Map(mine.map((c) => [c.id, c]))

  // 1 — THE COMPOSITION IS THE SCRIPT'S. Same rows, same start, same finish, same node set.
  const lost = want.filter((w) => !byId.has(w.id)).map((w) => w.id)
  const extra = mine.filter((c) => !want.some((w) => w.id === c.id)).map((c) => c.id)
  if (lost.length) B.push(`маршрута ${lost.join(", ")} нет в файле — состав считает скрипт: перепиши файл из скелета, заполнив steps`)
  if (extra.length) B.push(`маршрута ${extra.join(", ")} нет в скелете — состав считает скрипт: удали его`)

  for (const w of want) {
    const c = byId.get(w.id)
    if (!c) continue
    for (const [f, name] of [["entry", "entry"], ["exit", "exit"], ["uc", "uc"]]) {
      if (c[f] !== w[f]) B.push(`у маршрута ${w.id} ${name}="${c[f]}", а скелет дал ${name}="${w[f]}" — верни как было`)
    }
    if (c.nodes.join(" ") !== w.nodes.join(" ")) B.push(`у маршрута ${w.id} изменён nodes — узлы сценария называет шаг 6, не ты`)

    // 2 — EVERY STEP RESOLVES: its node is a node of THIS scenario, its value is a name of the
    // dictionary. Judged before the walk, exactly as pass A judges ids before it judges texts: a
    // blocker «конец не достигнут» about a path nobody can resolve is a sentence the role cannot act on.
    if (!c.steps.length) { B.push(`у маршрута ${w.id} пустой steps: проведи сценарий от entry="${w.entry}" до exit="${w.exit}" по узлам ${w.nodes.join(", ")}`); continue }
    let broken = false
    for (const s of c.steps) {
      if (!w.nodes.includes(s.path)) { B.push(`маршрут ${w.id} идёт через ${s.path} — этого узла нет в nodes сценария ${w.scenario}`); broken = true }
      if (!values.has(s.value)) { B.push(`маршрут ${w.id}: значения ${s.value || "«»"} нет в словаре — шаг пишется как путь@id`); broken = true }
    }
    if (broken) continue

    // 3 — THE CHAIN ENDS WHERE THE REQUIREMENT SAYS IT ENDS. The end of a use case is the reason this
    // pass exists: it is what the operator reads, what step 11 asks about and what pass A named.
    const last = c.steps[c.steps.length - 1]
    if (last.value !== w.exit) {
      B.push(`маршрут ${w.id} кончается значением ${last.value}, а конец ${w.end} — это ${w.exit} «${values.get(w.exit) || ""}»: последний шаг обязан отдать его`)
    }
  }

  // 4 — THE ORDER OF THE WORK MUST EXIST. Step 10 sorts the nodes topologically by exactly these
  // edges plus the map's, and a cycle there is `err("cycle")` with no role to repair it — live run
  // f7bf154a. The rule is judged once, over ALL chains together, because a cycle is not a property of
  // any one of them.
  // …and the legs the MAP contradicts are not legs of the order at all: a call through an interface
  // into its implementation runs one way and is WRITTEN the other (steps/plan/plan.mjs::orderLegs).
  const legs = orderLegs(forwardLegs(mine.map((c) => ({ scenario: c.id, steps: c.steps }))), edges)
  const cyc = cycleIn([...legs.map((l) => [l.from, l.to]), ...(edges || []).map((e) => [e.from, e.to])])
  if (cyc.length) B.push(`порядок работ не строится: узлы ${cyc.join(" -> ")} замкнуты в круг — шаг 10 сортирует по этим же рёбрам и упадёт без рельсы починки`)

  return B
}

// cycleIn — the first cycle of a directed edge list, as the path that closes it, or []. Kahn's
// algorithm would answer "there is one" and step 10 already does that; a blocker has to name WHICH
// nodes, because that is what the role rewrites.
function cycleIn(pairs) {
  const next = new Map()
  for (const [a, b] of pairs) { if (!next.has(a)) next.set(a, new Set()); next.get(a).add(b) }
  const state = new Map()
  const stack = []
  const walk = (n) => {
    state.set(n, 1); stack.push(n)
    for (const m of next.get(n) || []) {
      if (m === n) continue                       // a self-loop is a node calling itself, not an order
      if (state.get(m) === 1) return [...stack.slice(stack.indexOf(m)), m]
      if (!state.has(m)) { const c = walk(m); if (c.length) return c }
    }
    state.set(n, 2); stack.pop(); return []
  }
  for (const n of next.keys()) if (!state.has(n)) { const c = walk(n); if (c.length) return c }
  return []
}

// FUNCTION_CONTRACT: assemble — the deliverable, computed out of the chains
//   Input:        { chains, values, frd, ripple, mode }
//   Dependencies: changeWidth, forwardLegs, core/xml.mjs
//   Antecedent:   GREEN checkChains. Assembling a refused set of chains never happens — the caller
//                 promotes only after the guardrail
//   Consequent:   success: { xml, nodes, units, unstepped } — `xml` is `.agent/design-graph.xml` in
//                          TODAY's form (contracts as TEXTS, route steps as `path#n`, `entry` as a
//                          number), `nodes` how many modules it carries, `units` how many distinct
//                          `<in> -> <out>` pairs, `unstepped` the nodes of the change no chain walks
//                          through — a NUMBER the caller prints, never a silent omission
//                 failure: none — total
//   Purity:       pure
//
// THE THREE THINGS THE ROLE NEVER WRITES, AND WHERE THEY COME FROM:
//   · `in` of a node   — the value the PREVIOUS step handed it, or the chain's `entry` when it is the
//                        first. Recoverable in 5 cases out of 5 on the finished `t3` deliverable, which
//                        is why asking a model for it would be paying for a copy
//   · `<dep>`          — the ripple's own edges of that node, plus the joint every chain asserts. A
//                        change that introduces a call the repository does not have yet is the NORMAL
//                        case (7 of eddi's 13 nodes do not exist at all), so a dep is derived, never
//                        demanded
//   · `#n`             — the position of the named value in the node's own list. A number a script
//                        derives cannot disagree with the list it derived it from; live run 0bbf7054
//                        spent blockers on «нет альтернативы #12» in a contract the role itself typed
export function assemble({ chains = [], values = new Map(), frd = {}, ripple = "", mode = "" } = {}) {
  const width = changeWidth({ frd, tests: new Set() })
  const deltaOf = new Map(((frd && frd.deltas) || []).map((d) => [String((d && d.node) || "").trim(), String((d && d.form) || "").trim()]).filter(([p]) => p))
  const roleOf = new Map()
  const depsOf = new Map()
  for (const m of String(ripple || "").matchAll(/<module\b([^>]*)>([\s\S]*?)<\/module>/g)) {
    const path = String(attrs(m[1]).path || "").trim()
    const role = (m[2].match(/<role>([\s\S]*?)<\/role>/) || ["", ""])[1].trim()
    if (role) roleOf.set(path, role)
    depsOf.set(path, new Set([...m[2].matchAll(tag("dep"))].map((d) => String(attrs(d[1]).path || "").trim()).filter(Boolean)))
  }

  // The walk: one entry per STEP, with the values already substituted. Both projections of the flow
  // and every contract below are groupings of THIS list — a second traversal would be a second count
  // of one fact.
  const walk = []
  for (const c of chains) {
    c.steps.forEach((s, k) => {
      walk.push({ chain: c.id, path: s.path, in: k === 0 ? c.entry : c.steps[k - 1].value, out: s.value })
    })
  }

  const nodes = new Map()
  const seat = (path) => {
    if (!nodes.has(path)) nodes.set(path, { path, in: [], out: [], deps: new Set(depsOf.get(path) || []) })
    return nodes.get(path)
  }
  for (const p of [...width].filter((p) => walk.some((w) => w.path === p) || deltaOf.has(p))) seat(p)
  for (const w of walk) {
    const n = seat(w.path)
    if (w.in && !n.in.includes(w.in)) n.in.push(w.in)
    if (w.out && !n.out.includes(w.out)) n.out.push(w.out)
  }
  // The joints the chains assert become edges of the deliverable — that IS the design's own direction,
  // and it is the second operand of step 10's order (the first is the map's).
  for (const l of forwardLegs(chains.map((c) => ({ scenario: c.id, steps: c.steps })))) {
    if (nodes.has(l.from)) nodes.get(l.from).deps.add(l.to)
  }

  const text = (id) => (values.get(id) != null && values.get(id) !== "" ? values.get(id) : id)
  const at = (list, id) => list.indexOf(id) + 1
  const out = [`<design mode="${esc(mode)}" base=".agent/appgraph.xml">`]
  for (const n of nodes.values()) {
    const d = deltaOf.get(n.path)
    out.push(`  <module path="${esc(n.path)}"${d ? ` delta="${esc(d)}"` : ""}>`)
    if (roleOf.has(n.path)) out.push(`    <role>${esc(roleOf.get(n.path))}</role>`)
    out.push(`    <contract in="${n.in.map((v) => esc(text(v))).join(" | ")}" out="${n.out.map((v) => esc(text(v))).join(" | ")}"/>`)
    for (const dep of [...n.deps].sort()) out.push(`    <dep path="${esc(dep)}"/>`)
    out.push("  </module>")
  }
  for (const c of chains) {
    const first = nodes.get((c.steps[0] || {}).path)
    const steps = c.steps.map((s) => `${s.path}#${at((nodes.get(s.path) || { out: [] }).out, s.value)}`).join(" -> ")
    out.push(`  <route scenario="${esc(c.id)}" entry="${first ? at(first.in, c.entry) : 0}" steps="${esc(steps)}"/>`)
  }
  out.push("</design>")

  const units = new Set(walk.map((w) => `${w.path} ${text(w.in)} -> ${text(w.out)}`)).size
  const unstepped = [...width].filter((p) => !walk.some((w) => w.path === p))
  return Object.freeze({ xml: out.join("\n"), nodes: nodes.size, units, unstepped: Object.freeze(unstepped) })
}
