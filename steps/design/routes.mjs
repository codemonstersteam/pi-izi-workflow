// MODULE_CONTRACT: routes — step 9 pass C: the temporal projection of the change, and the JOINT it makes with the graph
// Purpose:    one decision: does the change, played out in time, agree with the structure it was
//             drawn on — every step lands on a node that produces the named value, every transition
//             walks a declared edge, every neighbour accepts what it is handed, every FRD scenario
//             has a route and every branch of a changed contract is taken by one. Nothing here
//             judges the graph ALONE (that is checkGraph, one pass earlier) and nothing re-judges the
//             dictionary: this guardrail owns the STITCH of two frozen artifacts
//             (docs/design-step-by-step.md §4.C, §7).
//             PURE: knows nothing of disk, io lives in ext/index.mjs. The grammar — docs/data-flow.md §4a.
// io:         none
// EXTERNAL_DEPENDENCY: core/xml.mjs — the tag scanner shared with steps/scope, steps/intake and the
//             rest of steps/design. One grammar family read by one piece of code; its
//             BUG_FIX_CONTEXT for ATTRS' quote-resilience is inherited here for free, and a step's
//             text carries exactly the characters that bought it (`steps="a -> b"`).
// Invariants: parseRoutes is total — any input, including undefined, yields an empty list and never
//             throws (a guardrail that crashes on a malformed artifact turns "the role wrote
//             nonsense" — data, a red check, a redelegation — into "the run crashed", code 2, no
//             diagnosis); checkRoutes is total and returns EVERY fact, not the first one; a rule
//             lives in exactly one place — the NUMBERS 1, 2, 3, 4, 5 and 7 are the ones of
//             docs/data-flow.md §6 and are not restated here in prose
// Interface:  parseRoutes(xml) -> Route[]
//             checkRoutes({ routes, nodes, values, frd }) -> string[]  — blockers, empty = green
//
// A ROUTE NAMES THE VALUE, NOT ITS POSITION (`path@v9`, `entry="v1"`). Two reasons, both bought:
//   - the role picks a name it SEES on the card of pass C (steps/design/nodes.mjs::cards), instead of
//     counting `|` separators in a contract it typed a hundred lines earlier — live run 0bbf7054
//     spent 5 and 6 blocker lines on «нет альтернативы #12»;
//   - a name survives a REGENERATED graph, a number does not. Red pass B therefore does not throw the
//     routes away: the file is simply re-judged against the new graph (docs/design-step-by-step.md §7).
// The promoted `.agent/design-graph.xml` keeps its `#n` — the script computes it at assembly (D5), so
// steps 10 and 14 read exactly the form they read today.
//
// BUG_FIX_CONTEXT: live run 0bbf7054-3b8c-400f-b46f-83625777e097 (sandbox/runbox/eddi).
//   Previous: one generation wrote the values, the nodes and the routes; the guardrail reported one
//             blocker per route STEP, prefixed `<scenario>#<k>`.
//   Problem:  81 blocker lines carried 48 facts and 91 carried 42 — the same joint, met by six
//             scenarios, arrived as six lines that differ only in a number the role cannot act on.
//             `core/findings.mjs::carriedBlockers` compares blockers between rounds as a SET, so a
//             line with a different step number read as a brand-new blocker every round.
//   Fix:      the blocker IS the fact. The scenarios that met it ride at the END of the line as
//             evidence, and rules 3 and 4 are grouped by the node that must be repaired
//             (docs/design-step-by-step.md §8).

import { attrs, tag } from "../../core/xml.mjs"

// FUNCTION_CONTRACT: parseRoutes — the routes of pass C from their text
//   Input:        xml — text of `.agent/staging/routes.xml`; type unconstrained
//   Dependencies: —
//   Antecedent:   any value — undefined/null/garbage are read as an empty list
//   Consequent:   success: [{ scenario, entry, steps: [{ path, value }] }] in appearance order.
//                          `entry` is the ID of the `in` alternative the scenario is STARTED by and
//                          `value` the ID of the `out` alternative the step produces — both trimmed,
//                          both empty when unnamed, which rule 1 reports rather than defaulting to
//                          the first alternative
//                 failure: none — total
//   Purity:       pure
//   Interface:    parseRoutes(xml: unknown) -> readonly Route[]
//
// It reads the same TAG as steps/design/design.mjs::parseRoutes and is deliberately not the same
// function: that one reads the PROMOTED `.agent/design-graph.xml`, where a step carries `path#n`, and
// it is what steps/plan and ext/index.mjs read the promote through. The two forms differ in exactly
// one thing — how a step refers to a value — and that difference is the whole point of the pass
// (docs/data-flow.md §4a). Sharing one reader would tie the staging grammar to the promoted one; the
// seam that keeps the two honest is D5's round trip: assemble → parseRoutes of design.mjs → the same
// routes.
//
// The path is cut at the LAST `@`: a path may contain anything a filesystem allows, the value id is
// the tail, and cutting at the first `@` would silently rename the node instead of reporting a step.
export function parseRoutes(xml) {
  return [...String(xml || "").matchAll(tag("route"))].map((m) => {
    const a = attrs(m[1])
    return Object.freeze({
      scenario: String(a.scenario || "").trim(),
      entry: String(a.entry || "").trim(),
      steps: Object.freeze(String(a.steps || "").split("->").map((s) => s.trim()).filter(Boolean).map((s) => {
        const i = s.lastIndexOf("@")
        return Object.freeze(i < 0
          ? { path: s, value: "" }
          : { path: s.slice(0, i).trim(), value: s.slice(i + 1).trim() })
      })),
    })
  })
}

// facts — the report's shape, and the only place it is written (docs/design-step-by-step.md §8.1).
// A fact is keyed by what must be REPAIRED, never by where it was met; the scenarios that met it are
// collected into the tail of the line. Cutting the report by count is forbidden by §8.3 — a dropped
// blocker comes back next round and spends a `LOOPS`.
const facts = () => {
  const m = new Map()
  return {
    add(key, text, scenario) {
      if (!m.has(key)) m.set(key, { text, where: new Set() })
      if (scenario) m.get(key).where.add(scenario)
    },
    lines: () => [...m.values()].map((f) => (f.where.size ? `${f.text} (${[...f.where].join(", ")})` : f.text)),
  }
}

// FUNCTION_CONTRACT: checkRoutes — the guardrail of pass C: the joint of the two projections
//   Input:        { routes, nodes, values, frd }
//                 routes — parseRoutes' parse
//                 nodes  — the graph of pass B AS steps/design/nodes.mjs::parseNodes returns it:
//                          Map<path, Node> whose contracts carry IDS. Parsing it belongs to that
//                          pass; here it is a DEPENDENCY, and it is NOT re-judged (§7)
//                 values — the dictionary of pass A AS steps/design/values.mjs::parseValues returns
//                          it: Map<id, text>. Used for the TEXT beside an id in a blocker — the
//                          role's card speaks both, and a bare id is not a diagnosis
//                 frd    — the parse of `.agent/frd.xml` AS steps/intake/frd.mjs::parseFrd returns
//                          it: `scenarios` are the ELEMENTS (an id lives in `.id`), `touched` are
//                          paths. Parsing that file belongs to the intake slice
//   Dependencies: facts
//   Antecedent:   routes — parseRoutes' array; nodes — parseNodes' Map; values — parseValues' Map (a
//                 missing one only costs the blockers their texts); frd — an object with two arrays,
//                 missing fields read as empty
//   Consequent:   success: string[] of blockers, empty = green. Rules 1, 2, 3, 4, 5 and 7 keep the
//                          numbers they have in docs/data-flow.md §6. ONE LINE PER FACT: the line
//                          names what to repair and ends with the scenarios that met it. Rules 3 and
//                          4 are emitted grouped by the RECEIVING node — the place of the repair
//                 failure: none — total, "the routes are bad" is DATA, not a function failure
//   Purity:       pure
//   BUG_FIX_CONTEXT: this slice was written BEFORE steps 6 and 8 existed, and its fixture was
//                 invented rather than parsed. `frd.scenarios` was compared as a list of STRINGS
//                 while parseFrd returns elements, so rule 5 reddened on every real FRD, with the
//                 text «у сценария FRD [object Object] нет маршрута» — a blocker no role can repair,
//                 burning every redelegation down to `escalate` (docs/design.md §3, discrepancy A).
//
// A route's node MUST be IN THE GRAPH even if it doesn't change: the role of pass B copies a transit
// node out of the ripple subgraph with a contract it derives from that node's `<api>`/`<decl>`, and
// WITHOUT `delta`. Otherwise assembly has nothing to unfold the step from, and rule 4 has nothing to
// join — the contract lives on the node, and the script has no other source for it.
export function checkRoutes({ routes = [], nodes = new Map(), values = new Map(), frd = {} } = {}) {
  const named = (id) => (id ? (values.has(id) ? `${id} «${values.get(id)}»` : id) : "(значение не названо)")

  const step = facts()                  // rule 1 — the route refers to something that is not there
  const joints = new Map()              // receiving path → facts of rules 3 and 4, grouped by §8.2
  const joint = (path) => {
    if (!joints.has(path)) joints.set(path, facts())
    return joints.get(path)
  }
  const tail = []                       // rules 2, 5, 7 — findings of the WHOLE set, no scenario to cite
  const used = new Set()
  const chosen = new Map()              // path → Set of the `out` ids some route actually took (rule 7)

  for (const r of routes) {
    for (const [k, s] of r.steps.entries()) {
      const n = nodes.get(s.path)
      // Rule 1. An unknown node short-circuits the rest of this pair's checks: three blockers for one
      // defect take the role three times as long to fix as one.
      if (!n) { step.add(`n:${s.path}`, `1 узла нет в дизайн-графе — ${s.path}`, r.scenario); continue }
      // Rule 1 at the BOUNDARY: what starts the scenario is NAMED, never guessed. Before S25 the
      // script took `in[0]` by position — a silent default, which standards/code.md forbids by
      // constraint 3 for exactly the reason a live run demonstrated: the page's only `in` alternative
      // was the RETURN one, and the flow's first line claimed a user's click was a Fruit
      // (steps/design/design.mjs, walk's BUG_FIX_CONTEXT).
      if (k === 0 && !n.in.includes(r.entry)) {
        step.add(`e:${s.path}:${r.entry}`, `1 у первого узла ${s.path} нет значения ${named(r.entry)} в in — маршрут обязан НАЗВАТЬ, каким внешним вызовом он запущен; если подходящего значения нет, значит вход в контракте узла не объявлен`, r.scenario)
        continue
      }
      if (!n.out.includes(s.value)) {
        step.add(`o:${s.path}:${s.value}`, `1 у узла ${s.path} нет значения ${named(s.value)} в out`, r.scenario)
        continue
      }
      used.add(s.path)
      if (!chosen.has(s.path)) chosen.set(s.path, new Set())
      chosen.get(s.path).add(s.value)

      const next = r.steps[k + 1]
      if (!next) continue
      const m = nodes.get(next.path)
      if (!m) continue
      // Rule 3. The edge is undirected: the return unwinds along the same <dep> backwards.
      if (!n.deps.includes(m.path) && !m.deps.includes(n.path)) {
        joint(m.path).add(`3:${n.path}`, `3 ${m.path} недостижим из ${n.path} — нет ребра <dep> между ними`, r.scenario)
      }
      // Rule 4 — the ONLY place where the role's manual judgement remains, and with the dictionary it
      // is no longer a spelling check: `out` of one node and `in` of its neighbour are the same id or
      // two different ids, and there is nowhere left for them to drift by spelling. Red rule 4 now
      // means a real design error — node A hands over what node B does not accept
      // (docs/design-step-by-step.md §4.B).
      if (!m.in.includes(s.value)) {
        joint(m.path).add(`4:${n.path}:${s.value}`, `4 ${m.path} не принимает ${named(s.value)} от ${n.path}`, r.scenario)
      }
    }
  }

  // Rule 2. A node with a delta that no route passes through is structure without time: nothing calls
  // it, and a ticket for it would be written blind.
  for (const n of nodes.values()) if (n.delta && !used.has(n.path)) tail.push(`2 узел с delta="${n.delta}" не встречен ни в одном маршруте — ${n.path}`)

  // Rule 5. A forgotten delta: an FRD scenario without a route, and a touched node outside all routes.
  const covered = new Set(routes.map((r) => r.scenario))
  for (const s of frd.scenarios || []) {
    const id = (s && s.id) || ""
    if (!covered.has(id)) tail.push(`5 у сценария FRD ${id || "(без id)"} нет маршрута`)
  }
  for (const t of frd.touched || []) if (!used.has(t)) tail.push(`5 touched FRD не встречен ни в одном маршруте — ${t}`)

  for (const n of nodes.values()) {
    // Rule 7. An `out` alternative no route takes is either a dead branch of the contract or a missing
    // FRD scenario — and it would silently shorten the node's unit list, which IS the `<dod>` of its
    // ticket (docs/design.md §2). Only nodes with a delta are judged: an existing node keeps as many
    // branches as it likes, and no ticket will be written for it. A delta node NO route passes through
    // is rule 2's finding, and it does not reach here — one defect, one blocker.
    if (!n.delta || !used.has(n.path)) continue
    const took = chosen.get(n.path) || new Set()
    for (const id of n.out) {
      if (!took.has(id)) tail.push(`7 узел ${n.path} с delta="${n.delta}": значение ${named(id)} в out не пройдено ни одним маршрутом — ветка мертва либо сценария FRD не хватает`)
    }
  }

  return [...step.lines(), ...[...joints.values()].flatMap((f) => f.lines()), ...tail]
}
