// MODULE_CONTRACT: nodes — step 9 pass B: the structural projection of the change, contracts written in NAMES
// Purpose:    one decision: is the graph of the change SELF-CONSISTENT before any route exists — the
//             delta of every node is a word of step 6's vocabulary, every node the role did not
//             change came from the ripple subgraph, every name a contract speaks was declared in the
//             dictionary of pass A, and every edge lands on a node of this same file. Nothing here
//             judges TIME: routes do not exist yet in this pass, which is precisely what stops the
//             edges from being authored after the routes that overtake them
//             (docs/design-step-by-step.md §4.B).
//             PURE: knows nothing of disk, io lives in ext/index.mjs. The grammar — docs/data-flow.md §4.
// io:         none
// EXTERNAL_DEPENDENCY: core/xml.mjs — the tag scanner shared with steps/scope, steps/intake and the
//             rest of steps/design. One grammar family read by one piece of code; its
//             BUG_FIX_CONTEXT for ATTRS' quote-resilience is inherited here for free.
// EXTERNAL_DEPENDENCY: steps/intake/frd.mjs::FRD_FORM — the vocabulary of a delta's FORM is ONE
//             vocabulary for the whole pipeline, declared at step 6 and weighed at step 7
//             (steps/weight/weight.mjs). It moved here WITH rule 6 out of steps/design/design.mjs;
//             a second spelling of the same word would make the artifacts of steps 6, 7 and 9
//             unjoinable by anything but a translation table (docs/design.md §3, discrepancy C).
// EXTERNAL_DEPENDENCY: steps/intake/frd.mjs::OP_STUB — «is this `op` an answer or a dash» is ONE
//             question with ONE answer: F3n refuses the stub at step 6, and rule 14 here reads the
//             SAME expression to decide whether the FRD gave this node anything to hand out. A second
//             list of fillers would drift the day a role types «—» instead of «-» (run 088fb3ee).
// Invariants: parseNodes is total — any input, including undefined, yields an empty graph and never
//             throws (a guardrail that crashes on a malformed artifact turns "the role wrote
//             nonsense" — data, a red check, a redelegation — into "the run crashed", code 2, no
//             diagnosis); graphFacts is total and returns EVERY finding, not the first one; the rule
//             lives in exactly one place — rule 6's NUMBER is the one of docs/data-flow.md §6 and is
//             not restated here in prose
// Interface:  parseNodes(xml) -> Map<path, Node>
//             graphFacts({ nodes, values, frd, known }) -> Fact[]  — every finding, in the report's order
//             checkNodes({ nodes, values, frd, known }) -> Fact[]  — the facts a PART can be judged by
//             checkGraph({ nodes, values, frd, known }) -> string[]  — blockers, empty = green
//             cards(values, nodes) -> string  — the data block of pass C's order
//
// FIVE RULES, TWO OPERANDS, AND THE FIELD THAT DECIDES WHICH IS WHICH (D28). Pass B is written by a
// SWARM — one agent per FRD scenario — and a part holds the nodes that scenario OWNS and nothing else.
// A finding whose operands all live inside one node is judged ON the part (`local: true` — the delta
// vocabulary, the transit node outside the ripple, an id outside the dictionary, rule 14 for a node
// with a delta); a finding whose operand is the SET of nodes cannot be asked of a part at all (an edge
// leaving the graph, rule 14 for a `touched` path, rule 13, rule 15, a failure nobody hands out).
// Let the whole's rules loose on the five parts of `eddi` and they report 103 lines where the whole
// reports three. `checkGraph` is the same records rendered in TODAY'S order, which is why
// steps/design/nodes.test.mjs judges this decomposition without one edit — that file is the seam.
//
// BUG_FIX_CONTEXT: live run 0bbf7054-3b8c-400f-b46f-83625777e097 (sandbox/runbox/eddi).
//   Previous: one generation wrote the dictionary, the nodes and the routes into one 23,5 KB artifact.
//   Problem:  rule 3 spent 23 and 21 blocker lines on 8 and 4 facts — a `<dep>` is written INSIDE
//             `<module>`, the route that needs it a hundred lines below, and an already printed
//             module cannot be appended to. Two attempts shared 17 % of their facts: the role
//             regenerates the artifact, it does not repair it. Cost: 657 953 tokens, zero artifacts.
//   Fix:      the graph is the ONLY subject of this generation — there are no routes yet to outrun
//             the edges. A red graph regenerates ten kilobytes, not twenty-three and a half.

import { attrs, ATTRS, tag, alts, tokens } from "../../core/xml.mjs"
import { FRD_FORM, OP_STUB } from "../intake/frd.mjs"

// The three grounds rule 14 may offer, as TEXT — one wording each, written once. A ground names WHERE
// the value comes from, because a candidate with no provenance is the invention the rule exists to
// refuse (the same device F5's blocker uses: a rule and the way out of it are one decision).
const GROUND_OP = "текст значения стоит в op дельты FRD этого узла"
const GROUND_IN = "уже в in этого узла: узел-транзит отдаёт то, что принял"
const GROUND_CLOSES = (token) => `закрывает конец ${token}, сценарий которого называет этот узел`

// FUNCTION_CONTRACT: outCandidates — what rule 14 may OFFER a node whose `out` is empty
//   Input:        n — the node as parseNodes returns it; frd — parseFrd's parse; values — parseValues'
//   Dependencies: OP_STUB (steps/intake/frd.mjs) — «op пуст или заглушка» is ONE question with ONE
//                 answer, asked at step 6 by F3n and re-asked here over the artifact it let through
//   Antecedent:   any values — a missing FRD or dictionary yields no candidates, which is the truth
//                 about them and not a silence
//   Consequent:   success: [{ id, why }] — every id declared in the dictionary, offered ONCE, in the
//                          order the three grounds are declared above
//                 failure: none — total
//   Purity:       pure
//
// BUG_FIX_CONTEXT: live run 088fb3ee (sandbox/runbox/eddi), pass B. The blocker said «назови, что этот
//   узел отдаёт» and nothing else. For five of the six created modules step 6 had said `op="-"`, so
//   there was nothing to name — and the role, holding a demand it could not satisfy, did what a role
//   always does with one: attempt 2 rewrote the file and knocked out a node that had been green
//   (`Glossary.java: out="v94"` → `out=""`), attempt 3 produced three thinking blocks of ~110 000
//   characters and no tool call at all. The operands were on the guardrail's own hands the whole time.
function outCandidates(n, frd = {}, values = new Map()) {
  const found = []
  const seen = new Set()
  const add = (id, why) => {
    if (!id || seen.has(id) || !values.has(id)) return
    seen.add(id)
    found.push({ id, why })
  }

  // 1. What the requirement said this node brings into the world. A stub is not a source — F3n of
  // step 6 judges the same attribute by the same expression, and when it let one through the answer
  // here is «нет кандидатов», never a guess.
  const op = String((frd.deltas || []).find((d) => d && d.node === n.path)?.op || "").trim()
  if (op && !OP_STUB.test(op)) {
    for (const [id, text] of values) {
      const t = String(text || "").trim()
      if (t && op.includes(t)) add(id, GROUND_OP)
    }
  }

  // 2. What the node already accepts. A transit node hands on what it took, and a data model hands
  // out itself — `in="v94" out="v94"` is the shape run 088fb3ee had no word for.
  for (const id of n.in) add(id, GROUND_IN)

  // 3. The end of a use case whose scenario names this node. The `in` side is somebody else's ground:
  // rule 13 seats an entry in `in`, and offering it here would push the node to answer with its own
  // input.
  for (const [id, ends] of values.closes || []) {
    for (const token of ends) {
      const [uc, tail] = String(token).split("/")
      if (tail === "in") continue
      const names = (frd.scenarios || []).some((s) =>
        String((s && s.uc) || "").trim() === uc &&
        tokens(s && s.nodes).includes(n.path))
      if (names) add(id, GROUND_CLOSES(token))
    }
  }

  return found
}

// The tail of rule 14's blocker: the candidates, or the address of the deficit that left none. It is
// built in one place because both halves of the rule — a node with a delta, a `touched` path of the
// FRD — describe ONE state and owe the role ONE repair instruction.
const offer = (cands) => cands.length
  ? `; кандидаты — ${cands.map((c) => `${c.id} (${c.why})`).join(" · ")}: возьми из них, а не придумывай`
  : `. Кандидатов нет: FRD не сказал, что этот узел заводит (<delta op> пуст или заглушка). Это дефицит шага 6, а не твоя выдумка — верни track:"err" kind:"question"`

// FUNCTION_CONTRACT: parseNodes — nodes of the design graph from the text of pass B
//   Input:        xml — text of `.agent/design-nodes.xml`; type unconstrained
//   Dependencies: —
//   Antecedent:   any value — undefined/null/garbage are read as an empty graph
//   Consequent:   success: Map<path, { path, delta, in[], out[], deps[] }> in appearance order;
//                          `in`/`out` are the contract's alternatives — IDS OF THE DICTIONARY, split
//                          on `|` and trimmed at the edges; no `<contract>` → both empty; a repeated
//                          path — the last one wins (one key per node, as in appgraph.xml)
//                 failure: none — total
//   Purity:       pure
//   Interface:    parseNodes(xml: unknown) -> Map<path, Node>
//
// It reads the same TAGS as steps/design/design.mjs::parseDesign and is deliberately not the same
// function: that one reads the PROMOTED `.agent/design-graph.xml`, where a contract carries texts,
// and it is what steps/plan and ext/index.mjs read the promote through. The two files differ in
// exactly one thing — what fills `in`/`out` — and that difference is the whole point of the pass
// (docs/design-step-by-step.md §5.2: the staging form speaks ids, the promote speaks text, and the
// script substitutes between them). Sharing one reader would tie the staging grammar to the promoted
// one, and the seam that keeps the two honest is D5's round trip: assemble → parseDesign → the same
// nodes.
export function parseNodes(xml) {
  const nodes = new Map()
  for (const m of String(xml || "").matchAll(tag("module", ">([\\s\\S]*?)</module>"))) {
    const a = attrs(m[1])
    const body = m[2]
    const c = attrs((body.match(new RegExp(`<contract\\b${ATTRS}/?>`)) || [""])[0])
    nodes.set(a.path, Object.freeze({
      path: a.path,
      delta: a.delta || "",
      // `role` is read by no guardrail — and it is carried anyway, because ASSEMBLY writes it back out
      // (D5). Nothing in code consumes the line; the promoted artifact carries it for the human and
      // for step 14, and a projection that silently drops a section of the deliverable is a lossy
      // round trip, not a simplification.
      role: (body.match(/<role>([\s\S]*?)<\/role>/) || ["", ""])[1].trim(),
      in: Object.freeze(alts(c.in)),
      out: Object.freeze(alts(c.out)),
      deps: Object.freeze([...body.matchAll(tag("dep"))].map((d) => attrs(d[1]).path)),
    }))
  }
  return nodes
}

// A finding of pass B, and the ONE place its shape is written. Four fields nothing renders:
//   · `rule`  — the NUMBER of docs/data-flow.md §6, or 0 for the three checks that carry none. It is
//               what a caller filters by, because reading a rule out of another module's Russian prose
//               with a regular expression is that rule written twice (standards/code.md §1);
//   · `path`  — the node to repair, and the swarm's ADDRESS: a node belongs to the first FRD scenario
//               that names it (steps/design/parts.mjs::blameNodes);
//   · `uc`    — the use cases (space-separated), for the two findings that name no single node: rule 13
//               names the use case whose end is unseated, and the failure nobody hands out names the
//               ones its `<failure from>` does. Both are addressed to every scenario of those use cases;
//   · `local` — TRUE when every operand of the finding lies inside one node, i.e. when a PART can be
//               judged by it alone. See the module contract: this field IS the decomposition.
const fact = (rule, text, { path = "", uc = "", local = false } = {}) =>
  Object.freeze({ rule, text, path, uc, local })

// FUNCTION_CONTRACT: graphFacts — every finding of pass B, in the order the report prints them
//   Input:        { nodes, values, frd, known }
//                 nodes  — parseNodes' parse
//                 values — the dictionary of pass A AS steps/design/values.mjs::parseValues returns
//                          it: Map<id, text>. Parsing it belongs to that pass; here it is a DEPENDENCY
//                 frd    — the parse of `.agent/frd.xml` AS steps/intake/frd.mjs::parseFrd returns
//                          it: `failures` are the ELEMENTS (a code lives in `.code`)
//                 known  — Set<path> of the ripple subgraph's nodes (steps/intake/map.mjs::parseMap
//                          over `.agent/ripple.xml`), or null when no subgraph was supplied — then
//                          rule 6's transit half stays silent, the discipline F5 keeps without sources
//   Dependencies: FRD_FORM, fact, offer, outCandidates
//   Antecedent:   nodes — parseNodes' Map; values — parseValues' Map (a missing one is read as an
//                 empty dictionary, and then every id a contract names is unknown, which is true);
//                 frd — an object, a missing `failures` read as empty; known — a Set or null
//   Consequent:   success: Fact[] in the report's own order — per node first (rule 6's two halves, the
//                          ids outside the dictionary, the edges leaving the graph), then rule 14 for
//                          the nodes with a delta, then rule 14 for the `touched` paths, then rule 13,
//                          then rule 15, then the failures nobody hands out
//                 failure: none — total, "the graph is bad" is DATA, not a function failure
//   Purity:       pure
export function graphFacts({ nodes = new Map(), values = new Map(), frd = {}, known = null } = {}) {
  const B = []

  for (const n of nodes.values()) {
    // Rule 6, first half — the vocabulary. One word for one fact across the whole pipeline: the form
    // is DECIDED at step 6 and weighed at step 7, so a design that renames it makes the two artifacts
    // unjoinable by anything but a translation table.
    if (n.delta && !FRD_FORM.deltaForms.includes(n.delta)) {
      B.push(fact(6, `6 узел ${n.path}: delta="${n.delta}" — допустимо ${FRD_FORM.deltaForms.join(" | ")}`, { path: n.path, local: true }))
    }
    // Rule 6, second half — a transit node cannot be invented. A node WITH a delta may legitimately
    // be absent from the subgraph: that is a NEW module, and inventing one is exactly the designer's
    // judgement. A node WITHOUT a delta is a claim about what already exists, and the only place it
    // may come from is the subgraph the order carried.
    if (!n.delta && known && !known.has(n.path)) {
      B.push(fact(6, `6 узел без delta вне подграфа ряби — ${n.path}: транзитный узел копируется из .agent/ripple.xml, выдумать его нельзя`, { path: n.path, local: true }))
    }

    // A contract speaks NAMES, and a name that was never declared resolves to nothing: assembly would
    // substitute emptiness into `<contract>` and the route of pass C would refer to a value no card
    // shows. This is what makes the dictionary load-bearing rather than decorative — without it the
    // pass would happily accept a graph whose ids are private to itself.
    for (const [side, ids] of [["in", n.in], ["out", n.out]]) {
      for (const id of ids) {
        if (!values.has(id)) B.push(fact(0, `узел ${n.path}: в ${side} стоит ${id}, которого нет в словаре — контракт называет значение по имени, выдумать имя нельзя`, { path: n.path, local: true }))
      }
    }

    // An edge lands INSIDE this file or it is not an edge of this graph. Rule 3 of pass C walks the
    // route k→k+1 along `<dep>`, and a dep pointing outside gives it nothing to walk on; the ripple
    // subgraph is not a substitute, because a transit node must be COPIED here to carry its contract
    // (docs/data-flow.md §4) — `expand` has no other source for the values of a step.
    //
    // THE WHOLE'S FINDING, NOT THE PART'S (D28): a part carries the nodes ITS scenario owns and the
    // PATHS of their neighbours, so every edge crossing into another part leaves the part's own file.
    // Measured on the graph of run 35972d1c: 5 of its 17 edges cross a part boundary, and asked of a
    // part they are a defect no part could ever repair.
    for (const d of n.deps) {
      if (!nodes.has(d)) B.push(fact(0, `узел ${n.path}: <dep path="${d}"> — такого узла в этом файле нет; ребро ведёт наружу графа, и шагнуть по нему маршруту будет некуда`, { path: n.path }))
    }
  }

  // The half of rule 8 that its move to pass A could not take with it. Over the flat dictionary the
  // rule only decides "the failure is DECLARED somewhere"; today it decided "declared in some node's
  // `out`" (steps/design/design.mjs, the note where the rule stood: `flatMap(n => n.out)`). Nothing
  // else in the pipeline closes the difference — rule 7 judges the alternatives OF A NODE, not the
  // rows of the dictionary, so a failure nobody produces would reach step 15 unimplemented exactly as
  // before pass A existed (backlog, «Что концепт обещает, а код не подтвердил», п. 2).
  //
  // One blocker per FAILURE, not per value: the substring comparison is rule 8's (a value names both
  // the failure and how the module hands it out — `404 FRUIT_NOT_FOUND`), and a code no value carries
  // at all is rule 8's finding, judged one artifact earlier. One defect, one blocker.
  // Rule 14. A node the NEXT pass is obliged to put on a route must have something to walk with. The
  // obligation is not a preference: rule 2 demands a delta node on some route and rule 5 demands the
  // same of every `touched` path, while a step is written with a value taken from `out`
  // (steps/design/routes.mjs). With `out` empty the three requirements have no common solution — no
  // routes.xml exists that satisfies them — and pass C spends its whole loop discovering that.
  //
  // BUG_FIX_CONTEXT: live run 1df91a31-4c96-4999-b7ac-353b330f2694. `fruits.html delta="Changed"
  //   … out=""` passed this guardrail green (`function/design/3`: nodes 3) and pass C escalated after
  //   three attempts, its first and third reports identical to the character. The rule is here and not
  //   in pass C because here it is REPAIRABLE: the graph is what has to change.
  //
  // THE BLOCKER NAMES ITS EXITS, and the rule is not relaxed by that: an empty `out` stays red. Run
  // 088fb3ee is the price of the other shape — see outCandidates' BUG_FIX_CONTEXT. Where the FRD left
  // nothing to offer, the blocker says whose deficit that is and which rail leads out of it, because
  // a role told only the law invents a repair (steps/intake/frd.mjs::provenance, run e132f0a1).
  //
  // ITS TWO HALVES SPLIT ON THE OPERAND (D28). A node WITH a delta is judged inside the part that owns
  // it — the delta, the `out` and the candidates all live on that one node. A `touched` PATH is judged
  // on the whole: "the path is absent from the graph" is a statement about the union of every part's
  // file, and a part that does not own that path would report it missing every single round.
  for (const n of nodes.values()) {
    if (n.delta && !n.out.length) {
      B.push(fact(14, `14 узел ${n.path} с delta="${n.delta}": out пуст — маршрут обязан пройти через него (правило 2), а шаг пишется значением из out${offer(outCandidates(n, frd, values))}`, { path: n.path, local: true }))
    }
  }
  for (const t of frd.touched || []) {
    const path = String(t || "").trim()
    if (!path) continue
    const n = nodes.get(path)
    if (!n) B.push(fact(14, `14 touched-путь FRD ${path} отсутствует в графе — маршрут обязан пройти через него (правило 5), а узла нет`, { path }))
    else if (!n.out.length) B.push(fact(14, `14 touched-путь FRD ${path}: out пуст — маршрут обязан пройти через него (правило 5), а шаг пишется значением из out${offer(outCandidates(n, frd, values))}`, { path }))
  }

  // Rule 13. The end of a use case is not only NAMED (rule 12, one artifact earlier) — it is SEATED:
  // the value closing an end stands in the contract of a node the FRD's scenario for that use case
  // names. This is the machine form of the third ground of §4 — what the change hands OUT of the graph
  // — and it is what gives pass B a concrete repair instead of "the page needs something".
  // A use case whose scenarios name no node is not judged: there is no candidate to point at, and a
  // blocker with no address costs a redelegation and buys nothing.
  //
  // NEVER ASKED OF A PART (D28): the seats of one use case are the nodes of ALL its scenarios, and on
  // `eddi` UC5 has two of them. A part holding S5 cannot see whether S6's node seated the value, so on
  // its own file the rule is red on a graph that is right — the phantom no repair can silence.
  const seats = new Map()   // uc -> Set<path> of the nodes its scenarios name
  for (const s of frd.scenarios || []) {
    const uc = String((s && s.uc) || "").trim()
    if (!uc) continue
    const paths = tokens(s && s.nodes)
    if (!seats.has(uc)) seats.set(uc, new Set())
    for (const p of paths) seats.get(uc).add(p)
  }
  for (const [id, ends] of values.closes || []) {
    for (const token of ends) {
      const [uc, tail] = String(token).split("/")
      const where = seats.get(uc)
      if (!where || !where.size) continue
      const side = tail === "in" ? "in" : "out"
      const seated = [...where].some((p) => (nodes.get(p) || { in: [], out: [] })[side].includes(id))
      if (!seated) {
        B.push(fact(13, `13 значение ${id} закрывает ${token}, но не стоит в ${side} ни одного узла сценария этого use case — ${[...where].join(", ")}`, { uc }))
      }
    }
  }

  const produced = new Set([...nodes.values()].flatMap((n) => n.out))

  // Rule 15. A value a node ACCEPTS has somebody who HANDS IT OVER. `in` is one half of a node's unit
  // list exactly as `out` is the other (rule 10, docs/data-flow.md §6), and a value no node produces
  // cannot be delivered by any route that could be written: pass C meets it as rule 10 and cannot
  // repair it — a route to a value nobody emits does not exist to be found, however many rounds it is
  // given. The defect is the GRAPH's, and here it is one edit away from a repair.
  //
  // THE ENTRIES OF THE CHANGE ARE NOT JUDGED. A value closing `UCx/in` is brought in by the ACTOR —
  // that is why rule 13 seats it in `in` and not in `out` — so no node of this graph emits it and none
  // ever will. Drop the exception and the dictionary of run 5bbe5de4 answers with 11 blockers about
  // its 11 use case entries, every one of them false.
  //
  // BUG_FIX_CONTEXT: live run 5bbe5de4 (sandbox/runbox/eddi). `v47 «readGlossaries()»` stood in `in`
  //   of `IResourceSource.java` and in no node's `out`. Passes A and B closed green, rule 10 found it
  //   on pass C, and `blameOf` leaves a rule-10 line with pass C — the router, which cannot produce a
  //   value. Eleven role runs went round that circle: 2 455 854 tokens, $3.39, no `.agent/plan-index.json`.
  const entries = new Set()
  for (const [id, ends] of values.closes || []) {
    if (ends.some((t) => String(t).split("/")[1] === "in")) entries.add(id)
  }
  for (const n of nodes.values()) {
    for (const id of n.in) {
      // An id outside the dictionary is the unnumbered check's finding above — one defect, one blocker.
      if (!values.has(id) || entries.has(id) || produced.has(id)) continue
      B.push(fact(15, `15 значение ${id} «${values.get(id)}» стоит в in узла ${n.path}, но не стоит в out ни одного узла: отдавать его некому. Назови узел, который его производит, либо убери из in.`, { path: n.path }))
    }
  }

  for (const f of frd.failures || []) {
    const code = String((f && f.code) || "").trim()
    if (!code) continue
    const named = [...values].filter(([, text]) => String(text).includes(code)).map(([id]) => id)
    if (named.length && !named.some((id) => produced.has(id))) {
      // THE ADDRESS IS THE FRD'S OWN `from`: a failure declares which ends of which use cases it comes
      // out of, so the parts that own those use cases' nodes are exactly who must hand it out. Without
      // this field the line has no addressee at all, and the swarm answers a repairable defect with an
      // escalation — measured on run 35972d1c, where it was one of the three live blockers.
      const ucs = [...new Set(tokens(f && f.from).map((t) => t.split("/")[0].trim()).filter(Boolean))]
      B.push(fact(0, `отказ ${code} назван значением ${named.join(", ")}, но ни один узел не отдаёт его в out — отдавать отказ некому, маршрута у него не будет, значит не будет и юнита`, { uc: ucs.join(" ") }))
    }
  }

  return B
}

// FUNCTION_CONTRACT: checkNodes — the findings a PART of pass B can be judged by, alone
//   Input:        { nodes, values, frd, known } — as graphFacts takes them, `nodes` being ONE part's
//                 nodes or the whole graph
//   Dependencies: graphFacts
//   Antecedent:   the same as graphFacts'
//   Consequent:   success: Fact[] — the subset whose operands lie inside one node: rule 6 (both
//                          halves), an id outside the dictionary, rule 14 for a node with a delta.
//                          Every one of them is MONOTONE in the graph — red on a part is red on the
//                          whole — so the merge can only add findings, never remove one
//                 failure: none — total
//   Purity:       pure
//   Interface:    checkNodes({ nodes, values, frd, known }) -> Fact[]
//
// The whole is judged by `checkGraph` after the merge and by nothing else (ext/index.mjs::design): no
// rule is relaxed here, four of them are simply unanswerable by one part.
export const checkNodes = (input) => graphFacts(input).filter((f) => f.local)

// FUNCTION_CONTRACT: checkGraph — the guardrail of pass B: the WHOLE graph, all its rules
//   Input:        { nodes, values, frd, known } — as graphFacts takes them
//   Dependencies: graphFacts
//   Antecedent:   the same as graphFacts'
//   Consequent:   success: string[] of blockers, empty = green. Rules 6, 13, 14 and 15 keep the numbers
//                          they have in docs/data-flow.md §6; the three checks the graph owns beside
//                          them (an id outside the dictionary, an edge out of the file, rule 8's
//                          other half) carry no number, because §6's table is the single declaration
//                          of the numbers and they are not in it
//                 failure: none — total, "the graph is bad" is DATA, not a function failure
//   Purity:       pure
//   Interface:    checkGraph({ nodes, values, frd, known }) -> string[]
//
// THE ORDER OF THE LINES IS THE CONTRACT, and it is the order this report had before the decomposition
// — which is why steps/design/nodes.test.mjs judges D28 without an edit. It is kept by CONSTRUCTION:
// one loop produces the records, and this function only renders them.
export function checkGraph(input = {}) {
  return graphFacts(input).map((f) => f.text)
}

// The card is read by a ROLE, so it speaks the language of the order — Russian (standards/code.md,
// constraint 8: English is what a machine reads, and this text is not read by one).
const NO_TEXT = "(нет в словаре)"
const NOTHING = "—"
const SEP = " · "
// The label column is padded so the three rows line up under each other: the role scans DOWN one
// column for the name it needs, which is the whole reason the card exists rather than a sentence.
const LABEL = "принимает:".length
const row = (label, cells) => `  ${(label + ":").padEnd(LABEL)} ${cells.length ? cells.join(SEP) : NOTHING}`

// FUNCTION_CONTRACT: cards — the frozen passes A and B as the data block of pass C's order
//   Input:        values — the dictionary AS steps/design/values.mjs::parseValues returns it: Map<id, text>
//                 nodes  — the graph AS parseNodes returns it: Map<path, Node>
//   Dependencies: row, NO_TEXT/NOTHING/SEP — private
//   Antecedent:   any value — a missing dictionary is an empty one and a missing graph an empty card
//                 block; totality is what keeps a malformed artifact a red check instead of a crash,
//                 exactly as for parseNodes above
//   Consequent:   success: one card per node in the graph's order, cards separated by a blank line.
//                          A card is a path with its delta, then `принимает:` / `отдаёт:` — the
//                          contract's alternatives, EACH AS A PAIR `<id> <text>` — then `соседи:`,
//                          the `<dep>` paths in full. An empty side is `—`, never a dropped row; an
//                          id the dictionary does not carry is `<id> (нет в словаре)`, never the bare
//                          id — the pair is the invariant, and a half of it would be the very shape
//                          this function exists to abolish. No positional `#n` is produced anywhere
//                 failure: none — total
//   Purity:       pure
//   Interface:    cards(values?: Map<id, text>, nodes?: Map<path, Node>) -> string
//
//   BUG_FIX_CONTEXT: live run 0bbf7054-3b8c-400f-b46f-83625777e097 (sandbox/runbox/eddi), rule 1's
//     blockers: «нет альтернативы #12», 5 and 6 lines of them. The order carried `ripple.xml` and no
//     contracts, so a route's step could only refer to a value BY POSITION — and the position was
//     counted by the role in its own freshly written string, over `|` separators, from memory. The
//     card replaces `ripple.xml` in that order whole (docs/design-step-by-step.md §4.C): the role
//     picks a name it SEES. This is the same device as `izi_answer` reading a question's number out
//     of `.agent/pending.json` instead of recalling it (CLAUDE.md, constraint 4).
//
// The neighbours are printed as FULL paths where docs/design-step-by-step.md §4.C abbreviates them
// to `…/IGlossaryStore.java`. The doc is illustrating the shape on a 60-character Java path; a route
// step is written `path@v9` with that very path, so an abbreviated neighbour would be a name the
// role cannot copy — and copying it is the point.
export function cards(values = new Map(), nodes = new Map()) {
  const named = (id) => `${id} ${(values && values.get(id)) || NO_TEXT}`
  return [...nodes.values()].map((n) => [
    // A node with no delta is not a node with an empty one: it is TRANSIT, copied from the ripple
    // subgraph (docs/data-flow.md §4), and the word says so instead of leaving empty brackets that
    // read as a broken card. The delta words themselves are FRD_FORM's and are printed verbatim.
    `${n.path}   (${n.delta || "транзит"})`,
    row("принимает", n.in.map(named)),
    row("отдаёт", n.out.map(named)),
    row("соседи", [...n.deps]),
  ].join("\n")).join("\n\n")
}
