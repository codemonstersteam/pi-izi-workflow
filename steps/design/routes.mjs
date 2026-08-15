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
//             lives in exactly one place — the NUMBERS 1, 2, 3, 4, 5, 7, 9, 10 and 11 are the ones of
//             docs/data-flow.md §6 and are not restated here in prose
// Interface:  parseRoutes(xml) -> Route[]
//             forwardLegs(routes) -> [{ from, to, scenario }]  — read by step 10 as well
//             checkRoutes({ routes, nodes, values, frd, edges }) -> string[]  — blockers, empty = green
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

// FUNCTION_CONTRACT: forwardLegs — the DIRECTED edges a set of routes asserts
//   Input:        routes — parseRoutes' array, of EITHER form: the staging one (a step's value is an
//                 id) or the promoted one (`path#n`). Only `steps[].path` is read, and that field is
//                 the same in both
//   Dependencies: —
//   Antecedent:   any value; a missing/garbage input is an empty list
//   Consequent:   success: [{ from, to, scenario }] in appearance order, one per FORWARD transition.
//                          A route RETURNS along the nodes it already walked, and a return is not an
//                          edge: `A -> B -> A` says A calls B, never that B calls A. A node already
//                          seen in THIS route is where its return begins
//                 failure: none — total
//   Purity:       pure
//   Interface:    forwardLegs(routes?: Route[]) -> [{ from, to, scenario }]
//
// WHY IT LIVES HERE AND IS EXPORTED. Step 10 derives the order of the work from exactly these edges
// (steps/plan/plan.mjs), and until D17 it re-implemented the forward-leg rule inline. Two copies of
// one rule is the defect standards/code.md §1 forbids, and here it was load-bearing: rule 9 below
// promises "step 10 will be able to sort this", and a promise made by a SECOND implementation of the
// same derivation is a promise about a different graph.
export function forwardLegs(routes) {
  const out = []
  for (const r of routes || []) {
    const steps = (r && r.steps) || []
    const seen = new Set()
    for (const [k, s] of steps.entries()) {
      seen.add(s.path)
      const next = steps[k + 1]
      if (next && !seen.has(next.path)) out.push({ from: s.path, to: next.path, scenario: r.scenario })
    }
  }
  return out
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
//   Input:        { routes, nodes, values, frd, edges }
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
//                 edges  — the map's DIRECTED `<edge from to/>` AS steps/intake/map.mjs::parseMap
//                          returns them (`.agent/appgraph.xml`), or [] when the caller has none. They
//                          are rule 9's second operand and nothing else reads them here: `<dep>` of
//                          the design graph is deliberately UNDIRECTED (rule 3 walks it both ways),
//                          so the direction a repository already has can only come from the map
//   Dependencies: facts, forwardLegs
//   Antecedent:   routes — parseRoutes' array; nodes — parseNodes' Map; values — parseValues' Map (a
//                 missing one only costs the blockers their texts); frd — an object with two arrays,
//                 missing fields read as empty; edges — an array of {from, to}, missing read as empty,
//                 and then rule 9 judges the routes against each other alone
//   Consequent:   success: string[] of blockers, empty = green. Rules 1, 2, 3, 4, 5, 7 and 9 keep the
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
export function checkRoutes({ routes = [], nodes = new Map(), values = new Map(), frd = {}, edges = [] } = {}) {
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
  const arrived = new Map()             // path → Set of the `in` ids some route actually DELIVERED (rule 10)
  const refused = new Set()             // paths rule 4 already blamed — rule 10 stays quiet on them
  // PER OCCURRENCE, not per set: which `out` answered which `in` AT THIS STEP. Sets would cross-
  // multiply — on an honest pair of routes through one node the product pairs the failure's `in` with
  // the happy `out` and rule 11 reddens a correct artifact. The `in` of step k is what step k-1
  // handed over, or the route's `entry` when k is 0.
  const answers = new Map()             // path → Map(in id → Set of out ids that answered it)
  const answered = (path, inId, outId) => {
    if (!inId || !outId) return
    if (!answers.has(path)) answers.set(path, new Map())
    const m = answers.get(path)
    if (!m.has(inId)) m.set(inId, new Set())
    m.get(inId).add(outId)
  }
  const deliver = (path, id) => {
    if (!id) return
    if (!arrived.has(path)) arrived.set(path, new Set())
    arrived.get(path).add(id)
  }

  // Rule 1 at the ID: a route's `scenario` is DERIVED from the FRD — that scenario's id verbatim, or
  // that id plus a suffix for a second route through it (`S1` → `S1b`). Rule 5 only walks the other
  // way (every FRD scenario has a route), so until R1 an id belonging to no scenario at all was
  // accepted in silence — live run 79650c98 wrote `S1b` and `S2b` with nothing checking them, and a
  // typo would have passed the same way. The flow section of the deliverable is cut BY this id.
  const frdScenarios = ((frd && frd.scenarios) || []).map((s) => String((s && s.id) || "").trim()).filter(Boolean)
  for (const r of routes) {
    if (r.scenario && !frdScenarios.some((id) => r.scenario === id || r.scenario.startsWith(id))) {
      step.add(`s:${r.scenario}`, `1 маршрут ${r.scenario}: такого сценария в FRD нет — id маршрута это id сценария FRD дословно либо он же с суффиксом (${frdScenarios.join(", ") || "в FRD нет сценариев"})`)
    }
  }

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
      if (k === 0) deliver(s.path, r.entry)   // the outside world hands the first node its entry
      answered(s.path, k === 0 ? r.entry : r.steps[k - 1].value, s.value)
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
        refused.add(m.path)
      }
      deliver(m.path, s.value)               // rule 10's operand: this transition DELIVERED that in
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
      if (!took.has(id)) { tail.push(`7 узел ${n.path} с delta="${n.delta}": значение ${named(id)} в out не пройдено ни одним маршрутом — ветка мертва либо сценария FRD не хватает`); refused.add(n.path) }
    }
  }

  // Rule 10 — THE MIRROR OF RULE 7, and it is not symmetry for its own sake: a node's `in` is half of
  // its unit list exactly as its `out` is the other half, and `expand` writes a unit per PAIR the
  // routes traverse. An `in` no route delivers therefore drops a unit out of the future ticket's
  // `<dod>` — the very defect rule 7 was written against, on the other side of the contract.
  //
  // BUG_FIX_CONTEXT: live run 79650c98 (sandbox/runbox/quarkus-rest-json-app-v2-t2), backlog R1.
  //   Previous: rule 7 iterated `n.out` and there was no counterpart for `in`.
  //   Problem:  the FRD declared a branch in BOTH use cases («карточка не отображается»), pass B put
  //             it honestly into the page's `in`, and pass C ran the route as far as the resource and
  //             stopped — the failure never travelled back to the page. Step 9 went green with two
  //             units for that node and none for the branch; the critic could not see it either,
  //             since neither the design nor the flow reaches step 11 by contract.
  //   Fix:      this rule. Its operand is collected where the routes are already walked: `entry` of a
  //             first node and every `out(k)→in(k+1)` transition ARE the deliveries.
  //
  // Only nodes with a `delta` are judged, for rule 7's reason: an existing node keeps as many inputs
  // as it likes and no ticket will be written for it.
  for (const n of nodes.values()) {
    // A node rules 4 or 7 already blamed is skipped. Both name the SAME cut this rule would name from
    // the other side: rule 4 reports the transition that was refused, rule 7 the branch left untaken,
    // and one missing step produces all three. One defect, one blocker — the discipline rule 2 and
    // rule 7 already keep between themselves (§8.1).
    if (!n.delta || !used.has(n.path) || refused.has(n.path)) continue
    const got = arrived.get(n.path) || new Set()
    for (const id of n.in) {
      if (!got.has(id)) tail.push(`10 узел ${n.path} с delta="${n.delta}": значение ${named(id)} в in не доставлено ни одним маршрутом — вход мёртв либо маршрут оборван раньше этого узла`)
    }
  }

  // Rule 11 — A FAILURE BRANCH MAY NOT END IN SUCCESS. If a node with a `delta` answers a failure it
  // received with the SAME value it answers an ordinary input with, then the two branches are one
  // branch: `expand` writes a unit per DISTINGUISHABLE pair, and two antecedents sharing a consequent
  // is a unit that proves nothing (standards/code.md — 1 happy + Σ branches with a distinguishable
  // consequent).
  //
  // BUG_FIX_CONTEXT: live run 09d11a84 (sandbox/runbox/quarkus-rest-json-app-v2-t2), round 3.
  //   Previous: nothing compared what a node answers a failure with against what it answers anything
  //             else with.
  //   Problem:  the dictionary had no value for the page's not-found ending, so rule 10's demand
  //             («deliver the 404 to the page») could only be met by writing «404 → the card WITH THE
  //             FRUIT'S DATA is shown». The role wrote it twice. One of the two forms — the one that
  //             RETURNS to the page rather than starting at the resource — is green under all ten
  //             rules: rule 9 sees no forward leg in a return, rule 4 is satisfied because the page
  //             does accept the 404, and the lie ships into `data-flow.md` and into the ticket's units.
  //             Measured: that set minus the other route gives checkRoutes → [].
  //   Fix:      this rule. Measured against every artifact under sandbox/runbox — eddi (15+ routes,
  //             four worded failure codes, chains of delegates), t3 and two slice snapshots — zero
  //             false positives: a delegate answers a failure WITH a failure, which this rule allows.
  const codes = ((frd && frd.failures) || []).map((f) => String((f && f.code) || "").trim()).filter(Boolean)
  const carriesFailure = (id) => codes.length > 0 && codes.some((c) => String(values.get(id) || "").includes(c))
  for (const n of nodes.values()) {
    if (!n.delta || !used.has(n.path)) continue
    const mine = answers.get(n.path)
    if (!mine) continue
    const ordinary = new Set()
    for (const [id, outs] of mine) if (!carriesFailure(id)) for (const o of outs) ordinary.add(o)
    for (const [id, outs] of mine) {
      if (!carriesFailure(id)) continue
      for (const o of outs) {
        if (!ordinary.has(o)) continue
        tail.push(`11 узел ${n.path}: на отказ ${named(id)} маршрут отвечает тем же значением ${named(o)}, каким узел отвечает и на обычный вход — ветка отказа кончается успехом, и юнит у неё будет неотличим. Ответь значением, которым КОНЧАЕТСЯ это ветвление FRD; если такого значения нет — его нет в СЛОВАРЕ, и чинить надо там`)
      }
    }
  }

  // Rule 9 — THE ORDER OF THE WORK MUST EXIST, and it is judged HERE because here there is a role to
  // repair it. Step 10 sorts the tickets topologically over the map's directed edges plus the FORWARD
  // legs of these very routes (steps/plan/plan.mjs); a cycle there is `err("cycle")` on a step with no
  // role, no operator and no repair rail — the band dies with a diagnosis nobody can act on.
  //
  // BUG_FIX_CONTEXT: live run f7bf154a (sandbox/runbox/quarkus-rest-json-app-v2-t2), backlog D17.
  //   Previous: nothing judged direction at step 9 at all — rule 3 walks a `<dep>` BOTH ways on
  //             purpose, so the design graph cannot say who calls whom.
  //   Problem:  rule 7 demanded a route through an `out` branch that predates the change (the
  //             resource's existing list call). No FRD scenario exercises it, and pass C took the
  //             branch by handing it to the page — a leg the map already declares in the opposite
  //             direction. Step 9 went green, step 10 died: `неразрешимый порядок среди узлов плана`.
  //   Fix:      this rule, plus the way OUT that makes it satisfiable — a route may simply END on the
  //             node that produced the value (router.md). Rule 7 is unchanged: weakening it would need
  //             a provenance per alternative, whose price docs/triggers.md rows 8 and 20 already
  //             refused, and the shortened route satisfies BOTH rules at once.
  //
  // Only a leg some ROUTE asserts is reported. A cycle the map carries on its own is the repository's,
  // not this artifact's — step 5 declares it (`<cycle>`) and step 10 refuses on it by its own rule; a
  // blocker here would order pass C to repair something it did not write and cannot reach.
  const legs = forwardLegs(routes)

  // WHO ASSERTS WHICH DIRECTION: from -> (to -> the artifact that says so). A Map of Maps, not a Map
  // keyed by a joined string: a path may legally contain any character a filesystem allows, so every
  // separator is a path that breaks the key, and the first draft of this rule proved it — the writer
  // joined on one character and the reader split on another, and rule 9 was silent on its own fixture.
  const dir = new Map()
  const claim = (from, to, why) => {
    if (from === to || !nodes.has(from) || !nodes.has(to)) return
    if (!dir.has(from)) dir.set(from, new Map())
    if (!dir.get(from).has(to)) dir.get(from).set(to, why)
  }
  const out = (p) => dir.get(p) || new Map()
  for (const e of edges || []) claim(e.from, e.to, "ребро карты")
  for (const l of legs) claim(l.from, l.to, `маршрут ${l.scenario}`)

  // A leg is guilty when the graph can walk BACK from where it points to where it started: that, and
  // only that, is a leg lying on a cycle. Kahn's leftovers will not do — everything standing BEHIND a
  // cycle stays unsorted too, and blaming those legs hands pass C nodes that are perfectly ordered.
  // Measured on this slice's own fixture while writing D17: three lines for one defect.
  const reaches = (from, to) => {
    const seen = new Set([from]), q = [from]
    while (q.length) {
      for (const y of out(q.pop()).keys()) {
        if (y === to) return true
        if (!seen.has(y)) { seen.add(y); q.push(y) }
      }
    }
    return false
  }

  // ONE LINE PER FACT (docs/design-step-by-step.md §8.1), and the fact is the PAIR, not the leg: when
  // two nodes call each other, both legs are the same defect and one of the two has to go. Keyed by
  // the pair, so the report says it once and names who asserts each direction — a route the role can
  // rewrite, or an edge of the map it cannot.
  const cycle = facts()
  for (const l of legs) {
    if (!nodes.has(l.from) || !nodes.has(l.to) || !reaches(l.to, l.from)) continue
    if (!out(l.to).has(l.from)) {
      cycle.add(`9:${l.from}:${l.to}`, `9 маршрут ведёт ${l.from} → ${l.to}, а обратный путь через другие узлы возвращается в ${l.from} — порядок работ шага 10 на этом круге не строится`, l.scenario)
      continue
    }
    const [a, b] = [l.from, l.to].sort()
    cycle.add(`9:${a}:${b}`, `9 ${a} и ${b} зовут друг друга: ${a} → ${b} (${out(a).get(b)}), ${b} → ${a} (${out(b).get(a)}) — порядок работ на этой паре не строится. Маршрут, которому дальше идти не к кому, ОБРЫВАЕТСЯ на узле, отдавшем значение: шаг из одного узла законен и ветку закрывает`, l.scenario)
  }
  tail.push(...cycle.lines())

  return [...step.lines(), ...[...joints.values()].flatMap((f) => f.lines()), ...tail]
}
