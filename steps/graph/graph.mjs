// MODULE_CONTRACT: graph — step 5 `graph`: the swarm's parts + the script's facts → one `appgraph.xml`
// Purpose:    one decision — what the pipeline's MAP is. A module is a FILE (one name, one function
//             in one phrase, one declared entry, a black box to its neighbours); a package and an
//             artifact are its ADDRESS, never a node; and the hierarchy is SUBORDINATION computed
//             from edges, not nesting declared by a manifest (docs/graph.md §1-§2). The merge is a
//             commutative monoid over the node path, so the order the scouts finished in cannot
//             change the result. PURE: knows no disk; the io lives in ext/index.mjs::buildGraph.
// io:         none
// EXTERNAL_DEPENDENCY: steps/scope/part.mjs::parsePart — the parts are read with the grammar that
//             JUDGED them, so this step cannot disagree with the guardrail about what a part said;
//             GRAMMAR_VERSION is stamped on the artifact because the graph is exactly as new as the
//             parts it was merged from.
// EXTERNAL_DEPENDENCY: steps/scope/computed.mjs::parseComputed — `.agent/graph-computed.xml`, what a
//             script could read for 0 tokens: edges, routes, drivers, consumers, packages, borders.
// EXTERNAL_DEPENDENCY: steps/graph/levels.mjs::newLevels — components, levels and coupling.
// EXTERNAL_DEPENDENCY (conceptual, not an import): `plan` is `.agent/survey-plan.json` from step 3.
//             The FULL anchor list is copied from there, never derived from the parts: an anchor that
//             matched no file exists only in the plan, and deriving it would silently lose it (G2).
// Invariants: every export is total on garbage input except newGraph, which refuses with a Result;
//             a refusal is TERMINAL — this step has no role and no repair rail, so anything a
//             redelegation could not fix becomes a DECLARATION (`found="no"`, `<gap>`, `<cycle>`,
//             `<ambiguous>`) instead of a blocker; a node key is the repo-relative path and nothing
//             else, because steps 6, 8, 10 and 14 reference nodes by it.
// Interface:  mergeGraph({ parts, computed, plan }) -> Graph
//             checkGraph(graph) -> string[]   — blockers; empty means green
//             newGraph({ parts, computedXml, plan }) -> Result<Graph, "no-suite"|"invalid-graph">
//             graphXml(graph) -> string

import { ok, err } from "../../core/result.mjs"
import { esc } from "../../core/xml.mjs"
import { matches, under } from "../../core/suites.mjs"
import { parsePart, GRAMMAR_VERSION, SPINE_ANSWERS } from "../scope/part.mjs"
import { parseComputed } from "../scope/computed.mjs"
import { newLevels } from "./levels.mjs"

// LISTED — the two spine answers carried by a LIST of elements rather than by their own attributes.
// Declared here as well as in part.mjs::checkSpine because the two modules ask different questions of
// the same shape: there "is it answered", here "how is it serialised".
const LISTED = new Set(["suites", "integrations"])
const text = (s) => String(s == null ? "" : s).trim()

// DECL_CAP — how many `<decl>` one module carries before the rest become a counted remainder.
//
// The map has a measured ceiling: 32 000 tokens ≈ 530 nodes at 216 bytes per node (docs/concept.md,
// "Как карта читается"). Every `<decl>` raises bytes per node and therefore LOWERS that ceiling in
// nodes, so an uncapped list would quietly shrink the repository the pipeline can still read whole.
//
// MEASURED (backlog G8e) on a live java tree — 287 nodes, 537 public declarations:
//   no cap → +208 B/node, the map holds 301 nodes;  cap 12 → +120 B/node, 381 nodes;
//   cap 8  → +103 B/node, 401 nodes;                cap 6  →  +88 B/node, 421 nodes.
// 12 is where the curve flattens: going to 6 buys 40 nodes of ceiling and hides 80 more declarations,
// and the nodes over any of these caps are the same 9 god-classes.
//
// The remainder is DECLARED (`<decl more="N"/>`), never silently dropped — the same discipline the
// order digest already uses ("… N more declarations"). At cap 12 that remainder is large (252 of 537
// declarations live in those 9 nodes), and it says so on the node instead of the map pretending the
// class is small.
export const DECL_CAP = 12

// `matches` and `under` live in core/suites.mjs: step 4 judges the suite by the same rule this step
// binds files with (P8), and a second spelling would let a suite pass there and drop its files here.

// FUNCTION_CONTRACT: suiteFor — which suite runs this test file
//   Input:        path — a repo-relative file path; suites — the spine's <suite> list
//   Dependencies: under, matches
//   Antecedent:   suites may be empty; a suite may carry no `match`
//   Consequent:   success: the id of the ONE suite that runs this file, or "" when none does or the
//                          answer is ambiguous. The deepest `path` wins first (a suite in `src/it`
//                          beats one in `src`); a tie is broken by `match`, and a tie that `match`
//                          cannot break stays UNBOUND rather than guessed
//                 failure: none — total
//   Purity:       pure
//   Interface:    suiteFor(path: string, suites: Suite[]) -> string
//
// BUG_FIX_CONTEXT: the live spine of /tmp/quarkus-rest-json-app-v2-t1-3 — `unit` and
//   `component-native` BOTH on path="src/test/java" (backlog G0).
//   Previous: bind by path alone, first match wins.
//   Problem:  FruitResourceIT would bind to `unit`, step 10 would build `mvn test -Dtest=…IT`, and
//             surefire does not pick that file up — a GREEN run that executed zero tests.
//   Fix:      rule P6 makes `match` mandatory exactly where the ambiguity exists, and this function
//             uses it. Where P6 was satisfied, the answer is a fact; where it cannot be, "" is honest.
export function suiteFor(path, suites = []) {
  const candidates = suites.filter((s) => s.found !== "no" && under(path, s.path))
  if (!candidates.length) return ""
  const deepest = Math.max(...candidates.map((s) => s.path.length))
  const best = candidates.filter((s) => s.path.length === deepest)
  if (best.length === 1) return best[0].id || ""
  const named = best.filter((s) => text(s.match) && matches(path, s.match))
  return named.length === 1 ? named[0].id || "" : ""
}

// FUNCTION_CONTRACT: mergeGraph — every part and every computed fact as one map
//   Input:        { parts, computed, plan }
//                 parts — [{ id, kind, xml }] one per cell of the FOCUS, in plan order
//                 computed — parseComputed's shape
//                 plan — { subjects[], gaps[], cells[] } of .agent/survey-plan.json
//                 focus — { chosen[], cells[], repoFiles } of .agent/focus.json, or null when the
//                         plan fitted whole. A focus naming every cell of the plan is NOT partial:
//                         "the focus is everything" and "there is no focus" mean the same map
//   Dependencies: parsePart, newLevels, suiteFor, EXTERNAL SPINE_ANSWERS
//   Antecedent:   any values; missing ones read as empty. Parts are assumed to have PASSED checkPart
//                 — this function merges, it does not re-judge a part
//   Consequent:   success: {
//                   modules  — [{ path, role, pkg, kind, suite, api[], decls[], declsMore, io[],
//                              tests[], component, level, fanin, fanout }] keyed by path, in path
//                              order. `decls` is what the SCRIPT read of the node's public surface,
//                              capped at DECL_CAP with the remainder counted in `declsMore`
//                   duplicates — [string] paths declared by more than one part (checkGraph's G1)
//                   edges, components, isolated, cycle, subjects, gaps, suites, answers, systems,
//                   surface, langs, declKinds, ambiguous, unanswered
//                 }
//                 failure: none — total. "The graph is bad" is checkGraph's verdict, not a throw
//   Purity:       pure
//   Interface:    mergeGraph({ parts, computed, plan }) -> Graph
export function mergeGraph({ parts = [], computed = {}, plan = {}, focus = null } = {}) {
  const parsed = parts.map((p) => ({ id: p.id, kind: p.kind, part: parsePart(p.xml) }))

  // The spine's answers and lists. A missing spine cell is not an error — a repository may have no
  // manifest this walk recognised — but it must not become silence either: every unanswered question
  // is serialised as found="no", the same value a scout writes when it looked and found nothing.
  const spine = parsed.find((p) => p.kind === "spine")
  const answers = {}
  for (const { el } of SPINE_ANSWERS) answers[el] = (spine && spine.part.answers[el]) || null
  const suites = spine ? spine.part.suites.filter((s) => s.found !== "no") : []
  const integrations = spine ? spine.part.integrations.filter((i) => i.found !== "no") : []
  const unanswered = SPINE_ANSWERS
    .filter(({ el, keys }) => {
      if (el === "suites") return !suites.length
      if (el === "integrations") return !integrations.length
      const a = answers[el]
      return !a || a.found === "no" || !keys.some((k) => text(a[k]))
    })
    .map(({ el }) => el)

  // One path, one node. A duplicate is collected rather than resolved: choosing a winner would make
  // the graph depend on which scout finished first, and the merge stops being a monoid.
  const byPath = new Map()
  const duplicates = []
  for (const { part } of parsed) {
    for (const m of part.modules) {
      if (!m.path) continue
      if (byPath.has(m.path)) { duplicates.push(m.path); continue }
      byPath.set(m.path, m)
    }
  }

  // A file is a TEST when a suite's folder holds it or when some module named it as its test. Without
  // this a test file is an ordinary code node, and step 10 opens a ticket to implement it.
  const testRefs = new Set(parsed.flatMap(({ part }) => part.modules.flatMap((m) => m.tests.map((t) => t.path))))
  const isTest = (path) => testRefs.has(path) || suites.some((s) => under(path, s.path))

  const pkgOf = new Map((computed.pkgs || []).map((p) => [p.at, p.name]))
  const apiAt = new Map()
  for (const a of computed.api || []) {
    if (!apiAt.has(a.at)) apiAt.set(a.at, [])
    apiAt.get(a.at).push(a)
  }

  // <use> resolved: a literal that matched a route path becomes an EDGE to the file providing it.
  // Step 4 could not do this — a consumer and its provider live in different cells — and without it a
  // contract delta at step 6 never reaches the page that calls the route.
  const providers = new Map()
  for (const a of computed.api || []) {
    const p = a.name.slice(a.name.indexOf(" ") + 1)
    if (!providers.has(p)) providers.set(p, new Set())
    providers.get(p).add(a.at)
  }
  const paths = [...byPath.keys()].sort()

  // Only edges with BOTH ends in the map. `computed` covers the whole repository — it is written by
  // step 3, which walks the tree before anything is narrowed — while the modules of this map are the
  // cells of the FOCUS. An edge to a node the reader cannot see says nothing it can act on.
  //
  // BUG_FIX_CONTEXT: this is the defect that made step 3b pointless on a monolith, and the numbers
  //   are eddi's. Previous: every computed edge was serialised. On the acceptance forms that is
  //   invisible — t3 has 17 modules and 8 edges, none of them dangling, so this filter is a
  //   byte-for-byte identity there. On eddi it is 8253 edges ≈ 1855 KB against a 115 KB ceiling: the
  //   map could not be read no matter how narrow the focus, and the refusal would arrive at step 6,
  //   AFTER the swarm — precisely the cost step 3b exists to avoid. Filtered: ≈246 edges ≈ 56 KB.
  // The rule is not new, only unenforced: `<focus local="level fanin fanout component">` already
  // declares that this map's numbers are computed from what got in, and both readers of the grammar
  // tolerate a dangling end (steps/intake/map.mjs::parseMap keeps them, levels.mjs ignores them).
  const inMap = new Set(paths)
  const edges = (computed.edges || [])
    .filter((e) => inMap.has(e.from) && inMap.has(e.to))
    .map((e) => ({ from: e.from, to: e.to, via: e.via, by: "" }))
  for (const u of computed.use || []) {
    if (!inMap.has(u.at)) continue
    for (const to of providers.get(u.path) || []) {
      if (to !== u.at && inMap.has(to)) edges.push({ from: u.at, to, via: u.via, by: "use" })
    }
  }

  const L = newLevels({ nodes: paths, edges })

  const declAt = new Map()
  for (const d of computed.decls || []) {
    if (!declAt.has(d.at)) declAt.set(d.at, [])
    declAt.get(d.at).push(d)
  }

  const modules = paths.map((path) => {
    const m = byPath.get(path)
    const own = new Map(m.api.map((a) => [a.name, { ...a, via: "" }]))
    for (const a of apiAt.get(path) || []) own.set(a.name, { name: a.name, kind: a.kind, scope: a.scope, via: a.via })
    const all = declAt.get(path) || []
    return Object.freeze({
      path,
      role: m.role,
      pkg: pkgOf.get(path) || "",
      decls: Object.freeze(all.slice(0, DECL_CAP).map((d) => ({ kind: d.kind, name: d.name, sig: d.sig }))),
      declsMore: Math.max(0, all.length - DECL_CAP),
      kind: isTest(path) ? "test" : "",
      suite: isTest(path) ? suiteFor(path, suites) : "",
      api: Object.freeze([...own.values()].sort((a, b) => a.name.localeCompare(b.name))),
      io: m.io,
      tests: Object.freeze(m.tests.map((t) => ({ path: t.path, suite: suiteFor(t.path, suites) }))),
      component: L.component[path] || "",
      level: L.level[path] || 0,
      fanin: L.fanin[path] || 0,
      fanout: L.fanout[path] || 0,
    })
  })

  // The external world, stitched by the CONFIGURATION KEY: <io> is what the code does, <integration>
  // is what the configuration declares, and only the key can tell that they are one system. A side
  // with no counterpart is declared, never dropped — step 8 must ripple to an io point whose
  // configuration nobody wrote, and step 10 must see a declared system nobody uses.
  const systems = new Map()
  const key = (x) => text(x.config) || text(x.system)
  for (const i of integrations) {
    systems.set(key(i), { system: i.system || "", kind: i.kind || "", config: i.config || "", value: i.value || "", declared: true, at: [] })
  }
  for (const m of modules) {
    for (const p of m.io) {
      const k = key(p)
      if (!systems.has(k)) systems.set(k, { system: p.system || "", kind: p.kind || "", config: p.config || "", value: "", declared: false, at: [] })
      systems.get(k).at.push({ path: m.path, dir: p.dir || "", target: p.target || "" })
    }
  }

  // A module that is CALLED and whose entry NOBODY can name — neither the role's `<api>` nor a single
  // public declaration the script could read. The graph can say this because it knows both sides; a
  // scout cannot, because it sees one cell. It is a <gap>, not a blocker.
  //
  // BUG_FIX_CONTEXT: backlog G8d, live run c4fde2f3.
  //   Previous: `!m.api.length && m.fanin > 0` — the gap was raised on the ROLE's silence.
  //   Problem:  `api="none"` came back from 13 modules of 15 because checkPart reads no files and
  //             cannot falsify it, so every POJO with public fields was reported as an unknown entry.
  //             A gap that fires on the cheapest legal answer is noise, and noise is what step 6 then
  //             has to read past.
  //   Fix:      the gap now means what it says — the entry is UNREADABLE, not merely unsaid. It
  //             survives exactly where nothing can be computed either: a binary, a language with no
  //             reader (`<lang decls="no-rules">`), a file whose public surface is genuinely empty.
  const gaps = parsed.flatMap(({ part }) => part.gaps.map((g) => ({ path: g.path, why: g.why })))
  for (const m of modules) {
    if (m.kind !== "test" && !m.api.length && !m.decls.length && m.fanin > 0) {
      gaps.push({ path: m.path, why: `called by ${m.fanin} module(s); neither a declared entry point nor a readable public declaration` })
    }
    // A test file NO suite runs. suiteFor already refuses to guess — an uncovered path or a tie it
    // cannot break yields "" — and this is the only place that sees both sides, the spine's <suite>
    // and the node. Declared, never a blocker: a repository may legitimately hold a test outside
    // every suite (a scratch test, a Go suite told apart by a build tag).
    //
    // BUG_FIX_CONTEXT: live run 899494cc. The spine came back with match="*Test"/"*IT" — no `.java`
    //   — so `matches` compared `^.*Test$` with `FruitResourceTest.java` and bound NOTHING. All four
    //   tests reached the map as suite="", the run exited green and `gaps=0` claimed the map had no
    //   holes while every test in it was unrunnable. Silence is what this repository forbids, and it
    //   was worse than a red check because nothing about the artifact looked wrong.
    //
    // `suites.length` guards the OTHER fact: with no suite at all, checkGraph already stops the run
    // (no-suite). "There are no suites" and "the suites miss" must not read as the same finding.
    if (m.kind === "test" && !m.suite && suites.length) {
      gaps.push({ path: m.path, why: "test file bound to no suite — no <suite> path/match covers it" })
    }
  }

  const subjects = [...(plan.subjects || [])]
  const planGaps = new Set(plan.gaps || [])

  // The FOCUS, and the one thing the map must not do quietly: narrow itself. `focus` is null on
  // every run whose plan fitted the reading cap — then the map covers the repository exactly as it
  // always has and nothing below fires.
  //
  // `found` grows a THIRD value because two were no longer enough. It is read off the PLAN (an
  // anchor that matched no file exists nowhere else — checkGraph's G2 depends on that), and the plan
  // covers the whole repository, so under a partial focus an anchor whose files all stayed outside
  // would arrive at step 6 as FOUND. The role would then look in the map for what the pipeline
  // decided not to put there, and answer with a guess instead of `Unknown`:
  //   ""        — carried by a cell of the focus: it is in this map
  //   "no"      — matched no file in the repository at all (plan.gaps)
  //   "outside" — matched files, and every one of them is outside the focus
  const planCells = plan.cells || []
  const inFocus = focus && Array.isArray(focus.cells) ? new Set(focus.cells) : null
  const partial = Boolean(inFocus) && planCells.some((c) => !inFocus.has(c.id))
  const focused = partial ? new Set(planCells.filter((c) => inFocus.has(c.id)).flatMap((c) => c.subjects || [])) : null
  const foundOf = (name) => (planGaps.has(name) ? "no" : partial && !focused.has(name) ? "outside" : "")

  return Object.freeze({
    grammar: GRAMMAR_VERSION,
    modules: Object.freeze(modules),
    duplicates: Object.freeze(duplicates),
    edges: Object.freeze(edges),
    components: L.components,
    isolated: L.isolated,
    cycle: L.cycle,
    subjects: Object.freeze(subjects.map((name) => ({ name, found: foundOf(name) }))),
    focus: partial
      ? Object.freeze({
          slices: [...(focus.chosen || [])].join(" "),
          cells: inFocus.size,
          of: planCells.length,
          nodes: modules.length,
          repo: focus.repoFiles || 0,
          // What the ceiling left out, carried from step 3b — BOTH numbers. Zero is written too:
          // "nothing was dropped" and "nobody counted" must not read the same in a file a human
          // diagnoses from. Cells matter more than cones here: on eddi a run dropped 5 cones and 144
          // cells, and a map that reported only the cones told the smaller half of the truth.
          dropped: (focus.dropped && focus.dropped.slices) || 0,
          droppedCells: (focus.dropped && focus.dropped.cells) || 0,
        })
      : null,
    gaps: Object.freeze(gaps),
    suites: Object.freeze(suites),
    answers: Object.freeze(answers),
    unanswered: Object.freeze(unanswered),
    systems: Object.freeze([...systems.values()]),
    surface: Object.freeze(modules.flatMap((m) => m.api.filter((a) => a.scope === "public").map((a) => ({ name: a.name, kind: a.kind, at: m.path })))),
    langs: Object.freeze(computed.langs || []),
    declKinds: Object.freeze(computed.declKinds || []),
    routed: Object.freeze(computed.routed || []),
    ambiguous: Object.freeze(computed.ambiguous || []),
  })
}

// FUNCTION_CONTRACT: checkGraph — is this map fit to be the pipeline's map
//   Input:        graph — mergeGraph's result; plan — { subjects[] } of step 3
//   Dependencies: —
//   Antecedent:   graph is a merge result
//   Consequent:   success: string[] of blockers, empty means green. Every blocker is TERMINAL and
//                          written for a HUMAN: this step has no role to redelegate to
//                 failure: none — total
//   Purity:       pure
//   Interface:    checkGraph(graph, plan) -> string[]
//
// Only THREE rules, and only one of them is about the repository. The rest of what a merge could
// complain about is declared in the artifact instead (docs/graph.md §5): a guardrail that stops the
// pipeline on a fact the operator cannot act on is a defect of this step, not a finding about the code.
export function checkGraph(graph, plan = {}) {
  const B = []

  // G3 — no test suite at all. THE refusal about the repository: with no suite, step 10 cannot build
  // a node's check command, step 15 cannot close a node and step 16 degenerates into "we changed
  // something". Inventing a suite is separate work with its own gate, so the pipeline stops here.
  if (!graph.suites.length) {
    B.push("репозиторий к работе не готов — ни одного тест-сьюта не найдено; нужна отдельная задача на его создание")
  }

  // G1 — one path, one node. Cells do not overlap (step 3) and S2 forbids strangers (step 4), so a
  // duplicate means one of those invariants broke, not that the operator did anything wrong.
  for (const p of new Set(graph.duplicates)) {
    B.push(`один путь объявлен двумя частями — ${p} (клетки плана не пересекаются: сломан инвариант шага 3 или 4)`)
  }

  // G2 — an anchor of the plan must survive the merge. The full list lives in the plan precisely
  // because an anchor that matched no file exists NOWHERE else; deriving it from the parts loses it.
  const carried = new Set(graph.subjects.map((s) => s.name))
  for (const name of plan.subjects || []) {
    if (!carried.has(name)) B.push(`якорь плана потерян при слиянии — ${name} (список берётся из плана, а не выводится из частей)`)
  }

  return B
}

// FUNCTION_CONTRACT: newGraph — the step's artifact from the parts, the computed facts and the plan
//   Input:        { parts, computedXml, plan } — parts as [{ id, kind, xml }]; computedXml is the
//                 text of .agent/graph-computed.xml; plan is the parsed .agent/survey-plan.json
//   Dependencies: mergeGraph, checkGraph, parseComputed
//   Antecedent:   every cell OF THE FOCUS has a part (the CALLER proves this — ext/index.mjs::
//                 buildGraph — because only it knows which file was missing). Before step 3b the
//                 quantifier ran over the plan; a cell the focus left out has no part by decision,
//                 and demanding one would refuse every narrowed run
//   Consequent:   success: the merged Graph, ready for graphXml
//                 failure: "no-suite" when the only blocker is the missing test suite — the one
//                          refusal a human fixes with a separate task; "invalid-graph" otherwise,
//                          meaning an invariant of steps 3-4 is broken. Both details are RUSSIAN:
//                          they reach the operator through err("blocked"), not a role
//   Purity:       pure
//   Interface:    newGraph({ parts, computedXml, plan }) -> Result<Graph, "no-suite"|"invalid-graph">
export function newGraph({ parts = [], computedXml = "", plan = {}, focus = null } = {}) {
  const graph = mergeGraph({ parts, computed: parseComputed(computedXml), plan, focus })
  const blockers = checkGraph(graph, plan)
  if (!blockers.length) return ok(graph)
  const onlySuite = blockers.length === 1 && !graph.suites.length
  return err(onlySuite ? "no-suite" : "invalid-graph", blockers.join("\n  "))
}

const attr = (name, value) => ` ${name}="${esc(value)}"`

// PATH_PREFIX_MIN — below this the dictionary costs more than it saves, so it is not written at all.
// A form with fifteen files has no common root worth naming; a monolith has one in every path.
const PATH_PREFIX_MIN = 512

// bestPrefix — the directory prefix whose removal saves the most bytes across every path the map
// writes, counting each path once per OCCURRENCE (a node names its path once, an edge names two).
//
// This is front coding, the oldest trick in the index-compression book: one shared head is declared
// once and replaced by a sigil everywhere it appears. Measured on eddi's live map (run fb57f506):
// `src/main/java/ai/labs/eddi/` is 27 characters over 352 occurrences — 9 504 B, 8% of the file,
// with nothing lost.
function bestPrefix(occurrences) {
  const count = new Map()
  for (const p of occurrences) {
    for (let i = p.indexOf("/"); i > 0; i = p.indexOf("/", i + 1)) {
      const pre = p.slice(0, i + 1)
      count.set(pre, (count.get(pre) || 0) + 1)
    }
  }
  let best = "", saved = 0
  for (const [pre, n] of count) {
    const s = (pre.length - 1) * n              // one sigil replaces the prefix
    if (s > saved) { saved = s; best = pre }
  }
  return saved >= PATH_PREFIX_MIN ? best : ""
}

// answerXml — one spine answer, with its own attributes or with found="no". `found="no"` is written
// even where the scout simply never produced the element: at step 10 the operator answers a question
// about a missing toggle mechanism, and "nobody looked" must not be indistinguishable from "there is
// none" by the time the question is asked.
function answerXml(el, a, listedEmpty) {
  if (LISTED.has(el)) return listedEmpty ? `  <${el} found="no"/>` : ""
  if (!a || a.found === "no") return `  <${el} found="no"/>`
  const body = Object.entries(a).filter(([k]) => k !== "found").map(([k, v]) => attr(k, v)).join("")
  return `  <${el}${body}/>`
}

// FUNCTION_CONTRACT: graphXml — the `.agent/appgraph.xml` artifact
//   Input:        graph — mergeGraph's result
//   Dependencies: answerXml, attr, esc
//   Antecedent:   any value; missing fields read as empty lists
//   Consequent:   success: XML in the grammar of the parts — one scanner (core/xml.mjs) reads both,
//                          so no reader of this map ever grows a second parser. The header carries
//                          the counts a human checks a run by; `<module>` means what it means in a
//                          part, a FILE, so nothing is renamed between step 4 and step 6
//                 failure: none — total
//   Purity:       pure
//   Interface:    graphXml(graph) -> string
export function graphXml(graph) {
  const g = graph || {}
  const modules = g.modules || []
  const L = []

  // The dictionary is computed over every path this file will WRITE — node paths once, edge ends
  // twice — because that is what it pays for.
  const edgesAll = g.edges || []
  // The dictionary is computed over the EDGE ends only, and only they are written short.
  //
  // BUG_FIX_CONTEXT: the first live run with compression (eddi). A node's path is its IDENTITY, and
  //   the map is read by a MODEL as well as by parseMap: step 6's role copied `~modules/llm/impl/
  //   LlmTask.java` out of a `<module>` line straight into its FRD, and the guardrail refused a path
  //   that does not exist. Abbreviating what a reader must quote back is a trap regardless of how
  //   well the parser expands it. The measurement says the price is small: of the 9 504 B the
  //   dictionary saved on that map, 7 911 were in edge ends and only 1 593 in node paths.
  const prefix = bestPrefix(edgesAll.flatMap((e) => [e.from, e.to]))
  const P = (p) => (prefix && String(p).startsWith(prefix) ? `~${String(p).slice(prefix.length)}` : String(p))
  L.push(`<appgraph grammar="${esc(g.grammar || "")}" modules="${modules.length}" components="${(g.components || []).length}" isolated="${(g.isolated || []).length}" levels="${modules.reduce((n, m) => Math.max(n, m.level), 0)}">`)

  // The boundary, declared in ONE line and only when there is one. A per-edge `<outside path why
  // via>` was the first shape and it is deferred with a trigger (docs/big-projects-solution.md §11):
  // it repeats a single statement dozens of times in a file that is fighting a 115 KB cap, while a
  // dangling edge end is already legal grammar here. What this line says is what no reader can work
  // out for itself — the map covers `nodes` of `repo`, and that is a DECISION, not an omission.
  // `local` names the numbers computed from what got in, so a `level` or a `component` in this map
  // never silently claims to speak about the whole tree.
  if (g.focus) {
    L.push(`  <focus slices="${esc(g.focus.slices)}" cells="${g.focus.cells}" of="${g.focus.of}" nodes="${g.focus.nodes}" repo="${g.focus.repo}" dropped="${g.focus.dropped}" dropped-cells="${g.focus.droppedCells}" local="level fanin fanout component"/>`)
  }

  if (prefix) L.push(`  <paths prefix="${esc(prefix)}"/>`)   // every `~` below stands for it

  L.push(answerXml("artifact", (g.answers || {}).artifact))
  for (const s of g.suites || []) L.push(`  <suite${Object.entries(s).map(([k, v]) => attr(k, v)).join("")}/>`)
  L.push(answerXml("suites", null, !(g.suites || []).length))
  for (const el of ["build", "toggles", "branching", "contract"]) L.push(answerXml(el, (g.answers || {})[el]))

  // The borders of the computable, carried whole. `decls` names the KINDS the reader of that language
  // can see, not a yes/no: a graph where `<lang id="ts" decls="class,function,…">` says for itself
  // that no field of an interface was ever looked for, so "the rule is missing" and "the file has
  // none" never collapse into the same silence (source.mjs::DECL_KINDS).
  for (const l of g.langs || []) {
    const r = (g.routed || []).find((x) => x.lang === l.lang)
    const k = (g.declKinds || []).find((x) => x.lang === l.lang)
    L.push(`  <lang id="${esc(l.lang)}" files="${l.files}" edges="${l.rules ? "yes" : "no-rules"}" routes="${r && r.rules ? "yes" : "no-rules"}" decls="${esc(k && k.kinds ? k.kinds : "no-rules")}"/>`)
  }
  for (const s of g.subjects || []) L.push(`  <subject name="${esc(s.name)}"${s.found ? attr("found", s.found) : ""}/>`)
  for (const c of g.components || []) L.push(`  <component id="${esc(c.id)}" modules="${c.modules}" heads="${esc(c.heads.join(" "))}"/>`)

  for (const m of modules) {
    const head = `  <module path="${esc(m.path)}"${m.pkg ? attr("pkg", m.pkg) : ""}${m.kind ? attr("kind", m.kind) : ""}${m.kind === "test" ? attr("suite", m.suite) : ""}` +
      `${m.component ? attr("component", m.component) : ""} level="${m.level}" fanin="${m.fanin}" fanout="${m.fanout}">`
    L.push(head)
    if (m.role) L.push(`    <role>${esc(m.role)}</role>`)
    for (const a of m.api) L.push(`    <api${Object.entries(a).filter(([, v]) => v !== "").map(([k, v]) => attr(k, v)).join("")}/>`)
    // What this node OFFERS its caller, as the declaration line the file carries verbatim. `scope` is
    // not written: only public declarations ever get here (computed.mjs), so the attribute would carry
    // one value forever. The remainder is DECLARED rather than dropped — see DECL_CAP.
    for (const d of m.decls) L.push(`    <decl kind="${esc(d.kind)}" name="${esc(d.name)}" sig="${esc(d.sig)}"/>`)
    if (m.declsMore) L.push(`    <decl more="${m.declsMore}"/>`)
    for (const p of m.io) L.push(`    <io${Object.entries(p).map(([k, v]) => attr(k, v)).join("")}/>`)
    for (const t of m.tests) L.push(`    <test path="${esc(t.path)}" suite="${esc(t.suite)}"/>`)
    L.push("  </module>")
  }

  // `via` is the EVIDENCE of an edge — and half of it says nothing the edge does not already say.
  //
  // BUG_FIX_CONTEXT: live run fa8def32 (eddi). The map came out 121 384 B against a 117 760 B
  //   ceiling — over by 3% — and step 6 refused after the swarm had been paid for. Of that file,
  //   edges were 41 417 B and their `via` 11 901 B; 93 of the 185 carried nothing but
  //   `import ai.labs.eddi.configs.snippets.model.PromptSnippet;` — the fully qualified name of the
  //   node the `to` attribute already names, one fact written twice (standards/code.md §1). Dropping
  //   exactly those brought the map to 115 698 B: it fits, with every cell and every node kept.
  //   The alternative measured against this one was a safety margin on the focus estimate, and it
  //   was worse: the value that saved the run (×1.2) also dropped `modules/templating`, real work.
  // The other 92 keep theirs: a signature or an `extends` line is not derivable from two paths, and
  // it is what lets a role say WHY a node depends on another.
  const restatesTo = (e) => {
    const fq = String(e.to).replace(/^.*java\//, "").replace(/\.java$/, "").replace(/\//g, ".")
    return /^import\s+(static\s+)?[\w.]+;?$/.test(String(e.via || "").trim()) && String(e.via).includes(fq)
  }
  // CSR, and it is the standard sparse-graph layout rather than a trick of this file: a list of
  // (from, to) pairs is a coordinate list, and grouping by source turns it into compressed rows. On
  // eddi's live map 216 edges came from 60 sources — the `from` path was written 156 times for
  // nothing. An edge that still carries evidence (`via`, `by`) keeps its own line: the row form has
  // nowhere to put a value that differs per element.
  const rows = new Map()
  for (const e of edgesAll) {
    const via = restatesTo(e) ? "" : esc(e.via)
    if (via || e.by) {
      L.push(`  <edge from="${esc(P(e.from))}" to="${esc(P(e.to))}"${via ? ` via="${via}"` : ""}${e.by ? attr("by", e.by) : ""}/>`)
      continue
    }
    if (!rows.has(e.from)) rows.set(e.from, [])
    rows.get(e.from).push(e.to)
  }
  for (const [from, tos] of rows) L.push(`  <edges from="${esc(P(from))}" to="${esc(tos.map(P).join(" "))}"/>`)

  L.push("  <surface>")
  for (const a of g.surface || []) L.push(`    <api name="${esc(a.name)}" kind="${esc(a.kind)}" at="${esc(a.at)}"/>`)
  L.push("  </surface>")

  L.push((g.systems || []).length ? "  <systems>" : "  <systems/>")
  for (const s of g.systems || []) {
    L.push(`    <system name="${esc(s.system)}" kind="${esc(s.kind)}" config="${esc(s.config)}" value="${esc(s.value)}" declared="${s.declared ? "yes" : "no"}" used="${s.at.length ? "yes" : "no"}">`)
    for (const a of s.at) L.push(`      <at path="${esc(a.path)}" dir="${esc(a.dir)}"${a.target ? attr("target", a.target) : ""}/>`)
    L.push("    </system>")
  }
  if ((g.systems || []).length) L.push("  </systems>")

  for (const p of g.isolated || []) L.push(`  <isolated path="${esc(p)}"/>`)
  for (const gap of g.gaps || []) L.push(`  <gap path="${esc(gap.path)}" why="${esc(gap.why)}"/>`)
  if ((g.cycle || []).length) L.push(`  <cycle modules="${esc(g.cycle.join(" "))}"/>`)
  for (const a of g.ambiguous || []) L.push(`  <ambiguous from="${esc(a.from)}" spec="${esc(a.spec)}" candidates="${esc((a.candidates || []).join(" "))}"/>`)

  L.push("</appgraph>")
  return `${L.filter((line) => line !== "").join("\n")}\n`
}
