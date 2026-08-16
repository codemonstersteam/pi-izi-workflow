// MODULE_CONTRACT: parts — what step 9 CUTS an order down to: the units of a SWARM (passes B and C,
//               one agent per FRD scenario) and the whole change for pass A
// Purpose:    one decision: how much of the change one order carries, and it is decided by the machine —
//             for pass C the projection of the FRD the part may read, the ends of its use case with the
//             route id assigned to each, and the cards of the connected component its scenario lives in;
//             for pass B the nodes that scenario OWNS, their ripple bytes and the paths of their
//             neighbours; for pass A — which is NOT swarmed — the same cut over the whole change:
//             the ripple bytes of the nodes of the change and the PATHS of every other node of the
//             subgraph (changeRipple, D29a). Nothing here judges anything: the guardrail of a part is
//             checkSteps / checkNodes, of the whole checkRoutes / checkGraph (steps/design/routes.mjs,
//             steps/design/nodes.mjs), of pass A checkValues (steps/design/values.mjs). PURE: knows
//             nothing of disk, io lives in ext/index.mjs::routeUnits, ::nodeUnits and ::design.
// io:         none
// EXTERNAL_DEPENDENCY: core/xml.mjs — the tag scanner every grammar of this repository is read with.
//             The FRD's MEANING arrives already parsed (steps/intake/frd.mjs::parseFrd, the one
//             reader of that grammar); the scanner is used here to CUT the artifact's own bytes for
//             the part's order, because a projection re-serialised from a parse is no longer the
//             document the role is told it is reading. The ripple's own `<module>` bytes are cut the
//             same way, and with them the `<dep>` lines the subgraph already carries.
// Invariants: routeParts and nodeParts are total — no artifact, no dictionary, no graph yields an
//             empty list and never throws; a part is named by its FRD scenario and by nothing else;
//             the route ids and the node paths a part is given are assigned HERE and never by the role
//             (CLAUDE.md, constraint 4 — the same discipline by which the machine copies a question's
//             key); a node belongs to exactly ONE part, so the files of the parts are disjoint and
//             both merges are a concatenation with no conflict to resolve
// Interface:  routeParts({ frd, values, nodes, text }) -> Part[]
//             mergeParts(files) -> { xml, owner }
//             blameByScenario({ facts, frd, owner }) -> [{ scenario, lines }]
//             changeRipple({ frd, ripple }) -> { text, paths, neighbours, chars }
//             nodeParts({ frd, ripple, text }) -> NodePart[]
//             nodeOwner(frd) -> Map<path, scenario>
//             mergeNodes(files, { mode }) -> { xml, owner }
//             blameNodes({ facts, frd, owner }) -> [{ scenario, lines }]
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
// The width of the change has ONE home — step 8 measures the ripple by it and step 10 counts tickets
// by it (steps/ripple/ripple.mjs::changeWidth, standards/code.md §1). changeRipple below adds the
// scenario nodes to it and does not re-derive `<delta> ∪ <touched>`; the same import direction step 10
// already takes (steps/plan/plan.mjs).
import { changeWidth } from "../ripple/ripple.mjs"

// The paths one `<scenario nodes>` names, in its own order. Written once: the FRD spells the list with
// newlines inside the attribute, and three consumers below split it.
const pathsOf = (s) => String((s && s.nodes) || "").split(/\s+/).map((x) => x.trim()).filter(Boolean)

// byNode — path → the FRD scenarios that name it, in the FRD's order. It is the ONE reading of "who
// speaks about this node", and both swarms stand on it: pass C addresses a blocker about a node to
// every scenario that declared it (blameByScenario), pass B gives the node to the FIRST of them
// (nodeOwner) so that no two parts may write the same `<module>`.
const byNode = (frd) => {
  const out = new Map()
  for (const s of (frd && frd.scenarios) || []) {
    const id = String((s && s.id) || "").trim()
    if (!id) continue
    for (const p of pathsOf(s)) {
      if (!out.has(p)) out.set(p, [])
      if (!out.get(p).includes(id)) out.get(p).push(id)
    }
  }
  return out
}

// FUNCTION_CONTRACT: nodeOwner — which part of pass B writes which node
//   Input:        frd — the parse of `.agent/frd.xml`
//   Dependencies: byNode
//   Antecedent:   any value; a missing FRD owns nothing
//   Consequent:   success: Map<path, scenario id> — the FIRST scenario of the FRD that names the path
//                 failure: none — total
//   Purity:       pure
//   Interface:    nodeOwner(frd?: object) -> Map<string, string>
//
// THE FIRST NAMER, AND NOTHING CLEVERER. Measured on the FRD of live run 35972d1c: six of the sixteen
// nodes are named by two to four scenarios (`GlossaryStore.java` by four), so without an owner four
// parts would each write that `<module>` and the merge would have to choose between four contracts of
// one node — a role's judgement moved into a script. With it the parts' files are DISJOINT and the
// merge is a concatenation, exactly as the route ids of pass C are disjoint by construction.
export const nodeOwner = (frd) => new Map([...byNode(frd)].map(([p, ids]) => [p, ids[0]]))

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
  const named = byNode(frd)

  const out = new Map(ids.map((id) => [id, []]))
  const address = (routeOrScenario) => (owner && owner.get(routeOrScenario)) || scenarioOf(routeOrScenario, ids)
  for (const f of facts) {
    const to = new Set()
    for (const w of f.where || []) { const s = address(w); if (s) to.add(s) }
    if (f.scenario) { const s = address(f.scenario); if (s) to.add(s) }
    if (!to.size && f.path) for (const s of named.get(f.path) || []) to.add(s)
    const line = blockerLine(f)
    for (const s of to) {
      if (!out.has(s)) out.set(s, [])
      out.get(s).push(line)
    }
  }
  return [...out].filter(([, lines]) => lines.length).map(([scenario, lines]) => ({ scenario, lines }))
}

// --- D29a: PASS A READS THE RIPPLE PROJECTED ON THE CHANGE -----------------------------------------
//
// Live run d5f1d0b4 (sandbox/runbox/eddi), pass A: the order measured 49 884 characters, the role spent
// 98 304 output tokens — exactly 3 × 32 768 — in 1 104 seconds, called no tool and wrote nothing
// (`crashed`). The whole ripple travelled inside that order: 29 modules, 30 281 characters, 106
// declarations (86 `<decl>` + 20 `<api>`). The nodes the dictionary can legally speak about are the
// nodes of the CHANGE — 13 on that FRD, of which the repository already carries 6 — so 68 % of those
// bytes describe code that cannot appear in the design graph at all: a part of pass B writes only its
// own paths and may merely point a `<dep>` at anyone else's.
//
// Measured on the same two artifacts: the projection is 6 `<module>`, 9 573 characters and 37
// declarations, and the neighbours' paths cost 1 592 more.
//
// WHY THE NEIGHBOURS TRAVEL AS PATHS, AND WHY THEY TRAVEL AT ALL. A node of the ripple that no delta,
// no scenario and no `<touched>` names may still end up in the design graph as a TRANSIT node, and rule
// 6's second half (steps/design/nodes.mjs) allows exactly that and nothing else: a node without a delta
// must be one the subgraph declares. Hiding those paths from pass A would leave the dictionary with no
// name for what such a node hands over, and the deficit would surface one pass later as an id that
// resolves to nothing. Their DECLARATIONS are another matter and are measured: of the 16 values of the
// finished `t2` design only 5 reach the deliverable, and `v3…v12` were verbatim copies of `<api name>`
// and `<decl name>` that no contract, route or unit ever names.
//
// The set is the change's WIDTH plus the scenario nodes. The width is not re-derived here — it is
// step 8's expression (changeWidth) — and the scenario nodes are added because a `<scenario nodes>` may
// name a path the change only walks through: it carries no delta of its own, it is exactly the transit
// case above, and its declarations are what the dictionary needs to name the value it passes on.

// The sentence that explains a path with no declarations, written ONCE: it is the only thing the role
// is told about the neighbours, and a second wording of it in the order template would be the same rule
// written twice (standards/code.md §1).
const NEIGHBOURS_HEAD = "Соседи по ряби — узлы подграфа, которых это изменение не меняет. Едут ПУТЯМИ, без объявлений: они существуют, их можно назвать транзитом в следующем проходе, но значения для них объявлять не надо."
const NO_NEIGHBOURS = "Соседей у узлов изменения нет: подграф ряби — это ровно узлы изменения выше."

// FUNCTION_CONTRACT: changeRipple — the ripple as pass A's order carries it
//   Input:        { frd, ripple }
//                 frd    — the parse of `.agent/frd.xml` AS steps/intake/frd.mjs::parseFrd returns it
//                 ripple — the TEXT of `.agent/ripple.xml`, for the bytes of the change's own nodes and
//                          for the paths of everything else in the subgraph
//   Dependencies: elements, changeWidth, pathsOf
//   Antecedent:   any values — no FRD projects nothing and lists every module of the ripple as a
//                 neighbour, which is true and is what a caller with no change should see; no ripple
//                 yields a projection with no modules and no neighbours
//   Consequent:   success: { text, paths, neighbours, chars } — `text` is what the order's {RIPPLE}
//                          carries: the VERBATIM `<module>` bytes of the change's nodes, in the ripple's
//                          own order, then the paths of every other node of the subgraph as lines.
//                          `paths` are the projected nodes, `neighbours` the listed ones, `chars` the
//                          length of `text`
//                 failure: none — total
//   Purity:       pure
//   Interface:    changeRipple({ frd, ripple }) -> { text, paths, neighbours, chars }
//
// A node of the change the ripple does NOT carry is silently absent from `paths`, and that is the case
// rather than a defect: `<delta new="yes">` is a module this change creates, so the subgraph cannot hold
// it — 7 of eddi's 13 change nodes are exactly that. The order says so in its own document header.
export function changeRipple({ frd = {}, ripple = "" } = {}) {
  const moduleXml = elements(ripple, "module", "path")
  const width = changeWidth({ frd, tests: new Set() })
  for (const s of (frd && frd.scenarios) || []) for (const p of pathsOf(s)) width.add(p)

  const paths = [...moduleXml.keys()].filter((p) => width.has(p))
  const neighbours = [...moduleXml.keys()].filter((p) => !width.has(p))
  const text = [
    paths.map((p) => moduleXml.get(p)).join("\n"),
    neighbours.length ? `${NEIGHBOURS_HEAD}\n${neighbours.map((p) => `  ${p}`).join("\n")}` : NO_NEIGHBOURS,
  ].filter(Boolean).join("\n\n")

  return Object.freeze({ text, paths: Object.freeze(paths), neighbours: Object.freeze(neighbours), chars: text.length })
}

// --- D28: PASS B IS WRITTEN BY THE SAME SWARM ------------------------------------------------------
//
// Live run 35972d1c (sandbox/runbox/eddi): 5 use cases, 6 scenarios, 15 deltas, a ripple of 17 nodes.
// Pass B called its role three times — 23 536 / 27 547 / 1 889 tokens in, 14 157 / 20 260 / 98 304 out;
// the third is `3 × 32 768`, the signature of a role that spent its whole ceiling on reasoning, called
// no tool and wrote nothing. $0.5437 of the run's $0.9093 — 60 % — for zero artifacts. The order of
// that third attempt measured 47 246 characters (the ripple 40 % of it, the FRD 36 %). All six blockers
// of the two red attempts belonged to ONE use case, and the role rewrote all sixteen modules for them,
// paying for the repair of three lines with a regression on a node that had been green.
//
// The same role, the same model, the same `thinking: low`, given ONE scenario (S3, the very three nodes
// the run died on): three turns, 8 834 in, 7 361 out, two tool calls, the file written — 22 % of the
// ceiling, from an order of 10 292 characters (research И3, backlog).
//
// THE UNIT IS THE `<scenario>`, NOT THE CONNECTED COMPONENT. Measured on the same ripple: 16 of its 17
// nodes lie in ONE component (only `EddiTemplateExtensions.java` is isolated — the node the run kept
// failing on), so a part per component would carry ≈30 000 characters, which is the order that failed.
// The cut by scenario is legal only after D27 made every delta and every `touched` path belong to some
// scenario: measured on this FRD, deltas outside scenarios 0, `touched` outside scenarios 0, graph
// nodes no scenario names 0 — the parts cover the change whole.

// FUNCTION_CONTRACT: nodeParts — the change as the units of pass B's swarm
//   Input:        { frd, ripple, text }
//                 frd    — the parse of `.agent/frd.xml` AS steps/intake/frd.mjs::parseFrd returns it
//                 ripple — the TEXT of `.agent/ripple.xml`, for the bytes of the part's own nodes and
//                          for the neighbours its edges may reach
//                 text   — the TEXT of `.agent/frd.xml`, for the projection's bytes; absent means the
//                          projection is empty and the part carries only its node list
//   Dependencies: elements, nodeOwner, pathsOf
//   Antecedent:   pass A is GREEN — that is what makes the dictionary the part is handed WHOLE in its
//                 order real (nothing is projected out of it: a contract may legally name any id, and a
//                 cut dictionary would make rule 14's candidates unreachable). An FRD with no scenarios
//                 yields no parts, which the caller reads as "there is nothing to swarm"
//   Consequent:   success: one NodePart per `<scenario>` of the FRD, in the FRD's order:
//                          { id, uc, frd, ripple, nodes, paths[], neighbours[], chars }
//                          — `frd` is the projection (the scenario, its use case, the deltas of the
//                          part's OWN nodes, the failures of its use case), `ripple` the bytes of those
//                          nodes' `<module>` elements, `nodes` the block that names what the part
//                          writes and what it may only point at
//                 failure: none — total
//   Purity:       pure
//   Interface:    nodeParts({ frd, ripple, text }) -> NodePart[]
//
// A NODE NAMED BY NO SCENARIO BELONGS TO NO PART, and that is deliberate: the alternative is a script
// choosing a scenario for it, which is a judgement. After D27 the FRD cannot legally hold one — every
// delta's node is named by a scenario — and if one appears anyway the WHOLE's guardrail reports it
// (rule 14, the edge leaving the graph) and `blameNodes` gives that line no addressee, which
// workflows/izi.js escalates to the operator instead of waking every part with it.
export function nodeParts({ frd = {}, ripple = "", text = "" } = {}) {
  const owner = nodeOwner(frd)
  const scenarioXml = elements(text, "scenario")
  const usecaseXml = elements(text, "usecase")
  const deltaXml = elements(text, "delta", "node")
  const failureXml = elements(text, "failure", "code")
  const moduleXml = elements(ripple, "module", "path")
  const deltaOf = new Map(((frd && frd.deltas) || []).filter((d) => d && d.node).map((d) => [String(d.node).trim(), d]))

  const parts = []
  for (const s of (frd && frd.scenarios) || []) {
    const id = String((s && s.id) || "").trim()
    if (!id) continue
    const uc = String((s && s.uc) || "").trim()

    const declared = pathsOf(s)
    const mine = declared.filter((p) => owner.get(p) === id)
    // A SCENARIO THAT OWNS NOTHING IS NOT A PART. Measured on the FRD of run 35972d1c: S2 names three
    // nodes and every one of them was already named by S1, so its part would be an order to write an
    // empty file — a role call, a redelegation budget and a merge input, all for zero modules. Its
    // scenario is not lost: the nodes it speaks about are written by the parts that own them, and pass
    // C still gives it a part of its own (routeParts, one artifact later).
    if (!mine.length) continue
    // The neighbours: every path this part may point a `<dep>` at and may NOT write. It is the paths of
    // the OTHER parts, whole — not the ripple's edges of my own nodes, which are already in the bytes
    // below. A narrower list would be a trap: pass C's rule 3 walks a `<dep>`, so a route crossing two
    // parts needs the edge to exist, and a part that may not name the path could never draw it — a
    // blocker with no legal repair, which is the state D28 exists to abolish. What it may NOT do is
    // point outside the change: a path no part owns is an edge leaving the merged graph.
    const neighbours = [...owner.keys()].filter((p) => owner.get(p) !== id)

    // The failures of this use case: the `<failure from>` naming any end of it. A failure of another
    // use case is another part's business and would only widen this order — the same cut routeParts
    // makes one pass later.
    const failures = ((frd && frd.failures) || []).filter((f) => String((f && f.from) || "").split(/\s+/).some((t) => t.split("/")[0] === uc))

    const projection = [
      scenarioXml.get(id) || "",
      usecaseXml.get(uc) || "",
      ...mine.map((p) => deltaXml.get(p) || ""),
      ...failures.map((f) => failureXml.get(String(f.code || "").trim()) || ""),
    ].filter(Boolean).join("\n")

    const known = mine.filter((p) => moduleXml.has(p))
    const lines = [
      `Сценарий ${id} закрывает use case ${uc}. Твои узлы — <module> ровно на эти пути и ни на какие другие:`,
      "",
      ...mine.map((p) => {
        const d = deltaOf.get(p)
        return `  ${p} — ${d ? `delta="${String(d.form || "").trim()}", дельта FRD: ${String(d.op || "").trim()}` : "транзит (delta нет): контракт выводится из <api>/<decl> ряби"}`
      }),
      "",
      neighbours.length
        ? `Соседи — их <module> пишут другие части. На них можно только сослаться <dep path="…">, писать их нельзя:\n${neighbours.map((p) => `  ${p}`).join("\n")}`
        : `Соседей у твоих узлов нет: <dep> в твоём файле может указывать только на твои же пути.`,
      "",
      `Пути вне этих двух списков в твоём файле запрещены. За остальной граф ты не отвечаешь — его пишут другие части.`,
      known.length < mine.length
        ? `Узлов ${mine.length}, из них в ряби ${known.length} — остальные заводит это изменение, их <module> ты пишешь с нуля.`
        : `Узлов ${mine.length}, все они есть в ряби ниже.`,
    ]

    const rippleProjection = mine.map((p) => moduleXml.get(p) || "").filter(Boolean).join("\n")
    parts.push(Object.freeze({
      id,
      uc,
      frd: projection,
      ripple: rippleProjection,
      nodes: lines.join("\n"),
      paths: Object.freeze(mine),
      neighbours: Object.freeze(neighbours),
      chars: projection.length + rippleProjection.length + lines.join("\n").length,
    }))
  }
  return parts
}

// The root of `.agent/staging/design-nodes.xml` (docs/data-flow.md §4). It is written HERE only when a
// merge assembles the file out of parts; `base` is the map the whole step is drawn on and has no other
// legal value at step 9 — the same constant the order's schema shows the role.
const DESIGN_BASE = ".agent/appgraph.xml"

// FUNCTION_CONTRACT: mergeNodes — the swarm's parts as ONE artifact of pass B
//   Input:        files — [{ id, xml }] in the order the caller wants the modules to appear: the FRD's
//                 scenario order (ext/index.mjs::nodePartFiles); mode — step 7's weight, for the root
//   Dependencies: elem, attrs, esc
//   Antecedent:   any values; a part with no `<module>` contributes nothing and is not an error here —
//                 the WHOLE's guardrail is what reports a node that went missing
//   Consequent:   success: { xml, owner } — the text of `.agent/staging/design-nodes.xml` and the map
//                          `path → the part that wrote it`, which is how a red merge is addressed back
//                          to the part (blameNodes). A path met twice keeps the FIRST part's bytes
//                 failure: none — total
//   Purity:       pure
//   Interface:    mergeNodes(files?: [{ id, xml }], opts?: { mode }) -> { xml, owner: Map<string, string> }
//
// A CLONE OF mergeParts, NOT AN ABSTRACTION OVER IT, and the difference is the grammar: `mergeParts`
// PARSES `<route>` and writes it back through `routeXml`, because a route is four short attributes and
// the round trip is exact. A `<module>` carries `<role>` prose, a `<contract>` and a list of `<dep>` —
// there is no writer of that shape in this repository and there must not be one, since a writer would
// have to reproduce every byte the role typed. So this function CUTS the bytes and glues them under a
// root. One shared "merge elements of a grammar" helper would have to take a parser, a writer and a key
// as parameters — three arguments to save ten lines, and the price would be paid by whoever changes one
// grammar and silently changes the other.
export function mergeNodes(files = [], { mode = "" } = {}) {
  const seen = new Set()
  const out = []
  const owner = new Map()
  for (const f of files || []) {
    for (const m of String((f && f.xml) || "").matchAll(elem("module"))) {
      const path = String(attrs(m[1]).path || "").trim()
      if (!path || seen.has(path)) continue
      seen.add(path)
      out.push(`  ${m[0]}`)
      owner.set(path, (f && f.id) || "")
    }
  }
  return { xml: `<design mode="${esc(mode)}" base="${DESIGN_BASE}">\n${out.join("\n")}\n</design>\n`, owner }
}

// FUNCTION_CONTRACT: blameNodes — a red verdict addressed to the parts of PASS B that must repair it
//   Input:        { facts, frd, owner }
//                 facts — the records of steps/design/nodes.mjs::graphFacts (a red merge of pass B) OR
//                         the records of steps/design/routes.mjs that `blameOf` sends back to pass B
//                         (rules 3, 4 and rule 1 at the boundary). Both carry `rule`, `path` and the
//                         text; NOT their rendered lines
//                 frd   — the parse, for `<scenario nodes>` and the scenario order
//                 owner — Map<path, scenario id>: which part's FILE this node came out of. The merge
//                         is what knows it, and it beats any reading of the FRD
//   Dependencies: blockerLine, byNode, nodeOwner, pathsOf
//   Antecedent:   any values; a fact addressed to nobody is simply absent from the result, and the
//                 CALLER decides what that means (workflows/izi.js escalates — there is no part to
//                 send it to)
//   Consequent:   success: [{ scenario, lines }] in the FRD's scenario order, lines in the report's own
//                          order. A finding about a NODE goes to the ONE part that wrote it; a finding
//                          about a use case (rule 13) goes to every scenario of that use case, because
//                          any of them may be the one holding the node that must seat the value
//                 failure: none — total
//   Purity:       pure
//
// THE ADDRESS IS A FIELD, NEVER A REGULAR EXPRESSION over the blocker's prose — the rule blameByScenario
// keeps one pass later (standards/code.md §1). It is DERIVED from the same `byNode` map and is not a
// second channel: without it a red pass C sent back to pass B would hand its lines to the whole swarm,
// and all six parts would rewrite their files to repair three lines about one node — which is D25's
// re-entry cancelled and run 35972d1c's bill paid six times over.
export function blameNodes({ facts = [], frd = {}, owner = new Map() } = {}) {
  const ids = ((frd && frd.scenarios) || []).map((s) => String((s && s.id) || "").trim()).filter(Boolean)
  const first = nodeOwner(frd)
  const ofUc = new Map()
  for (const s of (frd && frd.scenarios) || []) {
    const id = String((s && s.id) || "").trim()
    const uc = String((s && s.uc) || "").trim()
    if (!id || !uc) continue
    if (!ofUc.has(uc)) ofUc.set(uc, [])
    ofUc.get(uc).push(id)
  }

  const out = new Map(ids.map((id) => [id, []]))
  for (const f of facts) {
    const to = new Set()
    const path = String((f && f.path) || "").trim()
    if (path) { const s = (owner && owner.get(path)) || first.get(path) || ""; if (s) to.add(s) }
    // `uc` carries one use case or several (a `<failure from>` may name ends of many), and every
    // scenario of each of them is an addressee: the value has to be seated somewhere among their nodes,
    // and which of them owns that node is not this function's judgement to make.
    if (!to.size && f.uc) for (const u of String(f.uc).split(/\s+/).filter(Boolean)) for (const s of ofUc.get(u) || []) to.add(s)
    const line = blockerLine(f)
    for (const s of to) {
      if (!out.has(s)) out.set(s, [])
      out.get(s).push(line)
    }
  }
  return [...out].filter(([, lines]) => lines.length).map(([scenario, lines]) => ({ scenario, lines }))
}
