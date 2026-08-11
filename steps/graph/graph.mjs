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
const DECL_CAP = 12

// matches — a suite's `match` against a file NAME. `*` is the only wildcard: the patterns this reads
// come from build manifests (`*Test.java`, `*IT.java`, `test_*.py`), and a full glob engine would be
// a dependency to interpret three characters.
function matches(path, pattern) {
  const name = path.slice(path.lastIndexOf("/") + 1)
  const re = new RegExp(`^${String(pattern).split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`)
  return re.test(name)
}

const under = (path, dir) => Boolean(dir) && (path === dir || path.startsWith(`${dir}/`))

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
//                 parts — [{ id, kind, xml }] one per plan cell, in plan order
//                 computed — parseComputed's shape
//                 plan — { subjects[], gaps[] } of .agent/survey-plan.json
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
export function mergeGraph({ parts = [], computed = {}, plan = {} } = {}) {
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
  const edges = (computed.edges || []).map((e) => ({ from: e.from, to: e.to, via: e.via, by: "" }))
  for (const u of computed.use || []) {
    for (const to of providers.get(u.path) || []) {
      if (to !== u.at) edges.push({ from: u.at, to, via: u.via, by: "use" })
    }
  }

  const paths = [...byPath.keys()].sort()
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

  return Object.freeze({
    grammar: GRAMMAR_VERSION,
    modules: Object.freeze(modules),
    duplicates: Object.freeze(duplicates),
    edges: Object.freeze(edges),
    components: L.components,
    isolated: L.isolated,
    cycle: L.cycle,
    subjects: Object.freeze(subjects.map((name) => ({ name, found: planGaps.has(name) ? "no" : "" }))),
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
//   Antecedent:   every plan cell has a part (the CALLER proves this — ext/index.mjs::buildGraph —
//                 because only it knows which file was missing)
//   Consequent:   success: the merged Graph, ready for graphXml
//                 failure: "no-suite" when the only blocker is the missing test suite — the one
//                          refusal a human fixes with a separate task; "invalid-graph" otherwise,
//                          meaning an invariant of steps 3-4 is broken. Both details are RUSSIAN:
//                          they reach the operator through err("blocked"), not a role
//   Purity:       pure
//   Interface:    newGraph({ parts, computedXml, plan }) -> Result<Graph, "no-suite"|"invalid-graph">
export function newGraph({ parts = [], computedXml = "", plan = {} } = {}) {
  const graph = mergeGraph({ parts, computed: parseComputed(computedXml), plan })
  const blockers = checkGraph(graph, plan)
  if (!blockers.length) return ok(graph)
  const onlySuite = blockers.length === 1 && !graph.suites.length
  return err(onlySuite ? "no-suite" : "invalid-graph", blockers.join("\n  "))
}

const attr = (name, value) => ` ${name}="${esc(value)}"`

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
  L.push(`<appgraph grammar="${esc(g.grammar || "")}" modules="${modules.length}" components="${(g.components || []).length}" isolated="${(g.isolated || []).length}" levels="${modules.reduce((n, m) => Math.max(n, m.level), 0)}">`)

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
  for (const s of g.subjects || []) L.push(`  <subject name="${esc(s.name)}"${s.found === "no" ? ' found="no"' : ""}/>`)
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

  for (const e of g.edges || []) L.push(`  <edge from="${esc(e.from)}" to="${esc(e.to)}" via="${esc(e.via)}"${e.by ? attr("by", e.by) : ""}/>`)

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
