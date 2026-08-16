// MODULE_CONTRACT: parts — step 9 pass C cut into the units of a SWARM: one agent, one FRD scenario
// Purpose:    one decision: what ONE part of pass C is, and it is decided by the machine — the
//             projection of the FRD the part may read, the ends of its use case with the route id
//             assigned to each, and the cards of the connected component its scenario lives in.
//             Nothing here judges anything: the guardrail of a part is checkSteps, of the whole
//             checkRoutes (steps/design/routes.mjs). PURE: knows nothing of disk, io lives in
//             ext/index.mjs::routeUnits.
// io:         none
// EXTERNAL_DEPENDENCY: core/xml.mjs — the tag scanner every grammar of this repository is read with.
//             The FRD's MEANING arrives already parsed (steps/intake/frd.mjs::parseFrd, the one
//             reader of that grammar); the scanner is used here to CUT the artifact's own bytes for
//             the part's order, because a projection re-serialised from a parse is no longer the
//             document the role is told it is reading.
// Invariants: routeParts is total — no artifact, no dictionary, no graph yields an empty list and
//             never throws; a part is named by its FRD scenario and by nothing else; the route ids a
//             part is given are assigned HERE and never by the role (CLAUDE.md, constraint 4 — the
//             same discipline by which the machine copies a question's key)
// Interface:  routeParts({ frd, values, nodes, text }) -> Part[]
//             mergeParts(files) -> { xml, owner }
//             blameByScenario({ facts, frd, owner }) -> [{ scenario, lines }]
//
// WHY ONE SCENARIO IS THE UNIT (research И2, backlog). On the whole task the role of pass C produced
// THREE turns of pure reasoning, 32 768 output tokens each, `stop: length`, and not one byte of text —
// the artifact was never written. The same role, same model, same thinking budget, given ONE scenario
// of the same change, wrote its four routes in five turns for 10 600 output tokens. The order it was
// handed measured 11 262 characters against 32 779, and the FRD projection is what made that possible:
// the whole FRD is 24 955 bytes, so a part carrying it entire would be no smaller than the whole.

import { attrs, elem, esc } from "../../core/xml.mjs"
import { blockerLine, parseRoutes, scenarioOf } from "./routes.mjs"
import { endsOf } from "./values.mjs"
import { cards } from "./nodes.mjs"

// The suffix ladder of a second route through one scenario: `S1` → `S1b` → `S1c`. It is the role's
// LAW 3 and rule 1's own text, and the machine is what walks it — a role that composes an id out of
// the branch's meaning writes `S1_notfound`, which steps/design/routes.mjs::scenarioOf refuses.
const SUFFIX = "bcdefghijklmnopqrstuvwxyz"
const routeId = (base, k) => (k === 0 ? base : `${base}${SUFFIX[k - 1] || "?"}`)

// elements — the artifact's own bytes for one tag, keyed by an attribute. Used to CUT, never to
// decide: every decision below reads the parse.
const elements = (text, name, key = "id") => {
  const out = new Map()
  for (const m of String(text || "").matchAll(elem(name))) {
    const a = attrs(m[1])
    const k = String(a[key] || "").trim()
    if (k && !out.has(k)) out.set(k, m[0])
  }
  return out
}

// componentOf — the connected component of the design graph the scenario's nodes lie in, over `<dep>`
// read UNDIRECTED (rule 3 walks an edge both ways, so a legal route cannot leave the component).
//
// Measured on `eddi`: for all eleven scenarios the component is 7 nodes out of 15, and not one node a
// scenario's routes really walk lies outside it — 0 misses out of 11. That is not a heuristic: a
// transition requires an edge, so a route physically cannot leave.
const componentOf = (nodes, seeds) => {
  const adj = new Map()
  const link = (a, b) => {
    if (!adj.has(a)) adj.set(a, new Set())
    adj.get(a).add(b)
  }
  for (const n of nodes.values()) {
    for (const d of n.deps || []) if (nodes.has(d)) { link(n.path, d); link(d, n.path) }
  }
  const seen = new Set()
  const q = [...seeds].filter((p) => nodes.has(p))
  while (q.length) {
    const p = q.pop()
    if (seen.has(p)) continue
    seen.add(p)
    for (const y of adj.get(p) || []) if (!seen.has(y)) q.push(y)
  }
  return seen
}

// FUNCTION_CONTRACT: routeParts — the change as the units of pass C's swarm
//   Input:        { frd, values, nodes, text }
//                 frd    — the parse of `.agent/frd.xml` AS steps/intake/frd.mjs::parseFrd returns it
//                 values — the dictionary AS steps/design/values.mjs::parseValues returns it, with its
//                          `closes` map: that map is where a route's ENDS come from
//                 nodes  — the graph of pass B AS steps/design/nodes.mjs::parseNodes returns it
//                 text   — the text of `.agent/frd.xml`, for the projection's bytes; absent means the
//                          projection is empty and the part carries only its ends and its cards
//   Dependencies: elements, componentOf, endsOf, cards, routeId
//   Antecedent:   passes A and B are GREEN — that is what makes the ends resolvable and the cards
//                 real. An FRD with no scenarios yields no parts, which is the case the caller reads
//                 as "there is nothing to swarm"
//   Consequent:   success: one Part per `<scenario>` of the FRD, in the FRD's order:
//                          { id, uc, entry, frd, ends, cards, nodes[], routes[{ id, closes, value }] }
//                          — `frd` is the projection (the scenario, its use case, the failures whose
//                          `from` names that use case), `ends` the block that assigns a route id to
//                          every end of the use case, `cards` the component's cards
//                 failure: none — total
//   Purity:       pure
//   Interface:    routeParts({ frd, values, nodes, text }) -> Part[]
//
// THE ROLE CHOOSES NOTHING HERE. Which scenario, which ids, which cards and which ends — all four are
// the machine's, exactly as the number of a question is the machine's (CLAUDE.md, constraint 4). What
// is left to the role is the only thing a script cannot do: which of the component's nodes the value
// actually travels through.
export function routeParts({ frd = {}, values = new Map(), nodes = new Map(), text = "" } = {}) {
  const closes = (values && values.closes) || new Map()
  const byToken = new Map()                       // `UC5/post` → the value that closes it
  for (const [id, tokens] of closes) for (const t of tokens) if (!byToken.has(t)) byToken.set(t, id)

  const scenarioXml = elements(text, "scenario")
  const usecaseXml = elements(text, "usecase")
  const failureXml = elements(text, "failure", "code")
  const named = (id) => (id ? `${id} «${values.get(id) || "(нет в словаре)"}»` : "(значения нет)")

  const parts = []
  for (const s of frd.scenarios || []) {
    const id = String((s && s.id) || "").trim()
    if (!id) continue
    const uc = String((s && s.uc) || "").trim()

    // The ends of THIS use case, in the FRD's own order: the entry first, then the exit, then one per
    // `<ext>`. endsOf is the single declaration of that order — rule 12 counts by it one pass earlier.
    const ends = endsOf(frd).filter((e) => e.uc === uc)
    const entry = ends.find((e) => e.side === "in") || null
    const outs = ends.filter((e) => e.side === "out")
    const routes = outs.map((e, k) => Object.freeze({
      id: routeId(id, k),
      closes: e.token,
      value: byToken.get(e.token) || "",
      text: e.text,
    }))

    // The failures of this use case: the `<failure from>` naming any end of it. A failure of another
    // use case is another part's business and would only widen this order.
    const mine = (frd.failures || []).filter((f) => String((f && f.from) || "").split(/\s+/).some((t) => t.split("/")[0] === uc))

    const seeds = String((s && s.nodes) || "").split(/\s+/).map((x) => x.trim()).filter(Boolean)
    const comp = componentOf(nodes, seeds)
    // NO COMPONENT IS A CASE, not an empty card block: a scenario whose nodes pass B did not draw
    // leaves the role blind, and blind is worse than wide. It gets the whole graph and the merge's
    // rules 2 and 7 stay exactly as strict.
    const sub = comp.size ? new Map([...nodes].filter(([p]) => comp.has(p))) : nodes

    const projection = [
      scenarioXml.get(id) || "",
      usecaseXml.get(uc) || "",
      ...mine.map((f) => failureXml.get(String(f.code || "").trim()) || ""),
    ].filter(Boolean).join("\n")

    const lines = [
      `Сценарий ${id} закрывает use case ${uc}. Твои маршруты — по одному на каждый конец ${uc}:`,
      "",
      ...routes.map((r) => `  ${r.id} — конец ${r.closes}: последний шаг отдаёт ${named(r.value)} («${r.text}»)`),
      "",
      entry && byToken.get(entry.token)
        ? `entry ВСЕХ этих маршрутов: ${named(byToken.get(entry.token))} (конец ${entry.token}). Первый шаг — карточка, у которой это значение стоит в «принимает:».`
        : `entry этих маршрутов в словаре не назван (конца ${uc}/in нет) — маршрут писать не с чего, верни err.`,
      "",
      `Нужен ещё маршрут — узел, на который иначе не зайдёт ни один из перечисленных: бери следующий свободный id ${routeId(id, routes.length)}, затем ${routeId(id, routes.length + 1)}.`,
      `Маршрут другого сценария не пиши — его пишет другая часть. В твоём файле только id из этого списка.`,
    ]

    parts.push(Object.freeze({
      id,
      uc,
      entry: (entry && byToken.get(entry.token)) || "",
      frd: projection,
      ends: lines.join("\n"),
      cards: cards(values, sub),
      nodes: Object.freeze([...sub.keys()]),
      routes: Object.freeze(routes),
    }))
  }
  return parts
}

// routeXml — one route as the grammar of `.agent/staging/routes.xml` writes it (docs/data-flow.md
// §4a). It is the ONLY writer of that form outside the role's own file, which is what makes the merge
// round-trippable: parseRoutes of what this produces gives the routes it was handed.
const routeXml = (r) => `  <route scenario="${esc(r.scenario)}" entry="${esc(r.entry)}" steps="${esc(r.steps.map((s) => (s.value ? `${s.path}@${s.value}` : s.path)).join(" -> "))}"/>`

// FUNCTION_CONTRACT: mergeParts — the swarm's parts as ONE artifact of pass C
//   Input:        files — [{ id, xml }] in the order the caller wants the routes to appear: the FRD's
//                 scenario order (ext/index.mjs::partFiles)
//   Dependencies: parseRoutes, routeXml
//   Antecedent:   any values; a part with no `<route>` contributes nothing and is not an error here —
//                 rule 5 is what reports a scenario with no route, and it reports it on the WHOLE
//   Consequent:   success: { xml, owner } — the text of `.agent/staging/routes.xml` and the map
//                          `route id → the part that wrote it`, which is how a red merge is addressed
//                          back to the part (blameByScenario). A route id met twice keeps the FIRST
//                          part as its owner
//                 failure: none — total
//   Purity:       pure
//   Interface:    mergeParts(files?: [{ id, xml }]) -> { xml, owner: Map<string, string> }
//
// THERE IS NOTHING TO RESOLVE HERE, and that is the point: the ids are disjoint by construction (the
// host assigns them per scenario, steps/design/parts.mjs::routeParts), so the union of the lists is
// the merge — the same commutative merge step 5 does over graph parts. Two scenarios taking DIFFERENT
// alternatives of one node is not a conflict either: it is exactly what rule 7 demands.
export function mergeParts(files = []) {
  const routes = []
  const owner = new Map()
  for (const f of files || []) {
    for (const r of parseRoutes(f && f.xml)) {
      routes.push(r)
      if (r.scenario && !owner.has(r.scenario)) owner.set(r.scenario, (f && f.id) || "")
    }
  }
  return { xml: `<routes>\n${routes.map(routeXml).join("\n")}\n</routes>\n`, owner }
}

// FUNCTION_CONTRACT: blameByScenario — a red MERGE addressed to the parts that must repair it
//   Input:        { facts, frd, owner }
//                 facts — the records of steps/design/routes.mjs (checkSteps and checkCoverage), NOT
//                         their rendered lines
//                 frd   — the parse, for `<scenario nodes>` and the scenario ids
//                 owner — Map<route id, scenario id>: which part's FILE a route came out of. The merge
//                         is what knows it, and it beats any reading of the id itself
//   Dependencies: blockerLine, scenarioOf
//   Antecedent:   any values; a fact addressed to nobody is simply absent from the result, and the
//                 CALLER decides what that means (workflows/izi.js escalates — there is no part to
//                 send it to and no rail that could repair it)
//   Consequent:   success: [{ scenario, lines }] in the FRD's scenario order, lines in the report's
//                          own order; one line may be addressed to SEVERAL parts, because one joint
//                          met by three scenarios is repaired by whichever of them wrote it wrong
//                 failure: none — total
//   Purity:       pure
//
// THE ADDRESS IS A FIELD, NEVER A REGULAR EXPRESSION over the blocker's prose. Rules 1, 9 and 11 name
// the routes that met them (`where`); rules 2, 7 and 10 name a NODE, and the scenarios that declared
// that node in `<scenario nodes>` are its addressees; rule 5 names the scenario itself. Measured on
// `eddi`: 26 of 28 lines of a red merge get an addressee, and the two that do not are nodes with a
// `delta` that no scenario of the FRD names at all — a deficit of step 6, not of pass C.
export function blameByScenario({ facts = [], frd = {}, owner = new Map() } = {}) {
  const ids = ((frd && frd.scenarios) || []).map((s) => String((s && s.id) || "").trim()).filter(Boolean)
  const byNode = new Map()
  for (const s of frd.scenarios || []) {
    const id = String((s && s.id) || "").trim()
    for (const p of String((s && s.nodes) || "").split(/\s+/).map((x) => x.trim()).filter(Boolean)) {
      if (!byNode.has(p)) byNode.set(p, new Set())
      byNode.get(p).add(id)
    }
  }

  const out = new Map(ids.map((id) => [id, []]))
  const address = (routeOrScenario) => (owner && owner.get(routeOrScenario)) || scenarioOf(routeOrScenario, ids)
  for (const f of facts) {
    const to = new Set()
    for (const w of f.where || []) { const s = address(w); if (s) to.add(s) }
    if (f.scenario) { const s = address(f.scenario); if (s) to.add(s) }
    if (!to.size && f.path) for (const s of byNode.get(f.path) || []) to.add(s)
    const line = blockerLine(f)
    for (const s of to) {
      if (!out.has(s)) out.set(s, [])
      out.get(s).push(line)
    }
  }
  return [...out].filter(([, lines]) => lines.length).map(([scenario, lines]) => ({ scenario, lines }))
}
