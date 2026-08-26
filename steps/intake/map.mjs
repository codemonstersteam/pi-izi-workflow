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
//             MAP_EST_SLACK — how far the estimate may be under the truth, measured
//             parseMap(xml) -> { nodes, tests, entries: Set<string>, edges: Edge[], count,
//                                nodeTests: Map, suites: Suite[], spine: {…}, cycles: Set<string> }
//             mapMeasure(xml, cap?) -> { bytes, nodes, overCap }
//             mapIndex(xml) -> string   — the map with everything the reader can live without
//
// FUNCTION_CONTRACT: mapIndex — the map as an INDEX: what exists and what it offers, nothing else
//   Input:        xml — the full map text
//   Dependencies: —
//   Antecedent:   any value; garbage yields a header and nothing else
//   Consequent:   success: XML in the SAME grammar, carrying `<module>` headers, their `<api>` rows
//                          and every declaration-free section of the file, and declaring itself:
//                          `form="index"` plus the list of what was left out. Declarations, the
//                          scout's prose and the edges are gone
//                 failure: none — total
//   Purity:       pure
//   Interface:    mapIndex(xml: unknown) -> string
//
// This is the form docs/concept.md promised above the ceiling and steps/triggers.md deferred until a
// repository needed it. That repository arrived: eddi's map ran 120 050 B against a 117 760 B
// ceiling and step 6 refused AFTER the swarm had been paid for. Refusing is honest but final;
// degrading is honest and lets the run continue, so long as the degradation is DECLARED — the role
// must never mistake "the map has no edges" for "this code has no dependencies".
//
// What survives and why: a node's path and kind are its identity, `<api>` is what it offers the
// outside, and the spine's answers are about the repository rather than any node. What goes is what
// the reader can obtain another way — declarations and the scout's sentence describe a file that can
// be opened, and the edges are the largest block of all (38% of eddi's map).
//
// The MEASURED price on that map: 120 050 B full, 109 188 B compressed, ≈24 000 B as an index — five
// times smaller. Its own ceiling follows from the same arithmetic: ~185 B per node means an index
// holds roughly 600 nodes, so a whole 1850-file repository does not fit even here. That number is
// the trigger for the next form, not a reason to withhold this one.
export function mapIndex(xml) {
  const s = String(xml || "")
  const lines = s.split("\n")
  const head = (lines[0] || "").match(/^<appgraph[^>]*>/)
  const out = [head ? `${head[0].slice(0, -1)} form="index" without="decl role io edge">` : '<appgraph form="index" without="decl role io edge">']

  const KEEP = /^\s*<(paths|lang|suite|suites|test|artifact|build|toggles|branching|contract|integrations|subject|component|focus|cycle|systems|system|surface|gap|isolated)\b/
  let node = null            // the open module: its header and the api rows it carries
  const flush = () => {
    if (!node) return
    // A node with api rows keeps them INSIDE its element — `entries` of parseMap is read from the
    // body, and step 6's F3 asks "can an existing call of this node break at all" through it.
    if (node.api.length) out.push(node.head.replace(/\/?>$/, ">"), ...node.api, "  </module>")
    else out.push(node.head.replace(/\/?>$/, "/>"))
    node = null
  }
  for (const line of lines.slice(1)) {
    if (/^\s*<module\b/.test(line)) { flush(); node = { head: line, api: [] }; continue }
    if (/^\s*<\/module>/.test(line)) { flush(); continue }
    if (node) { if (/^\s*<api\b/.test(line)) node.api.push(line); continue }
    if (/^\s*<(edge|edges|decl)\b/.test(line)) continue
    if (KEEP.test(line)) out.push(line)
    else if (/^<\/appgraph>/.test(line)) { flush(); out.push(line) }
  }
  flush()
  return out.join("\n")
}

// WHY A MEASUREMENT AND NOT AN INDEX. docs/concept.md promised the reader an INDEX form above the
// ceiling (a module tree with `<api scope="public">`, no declarations, no edges). This slice does not
// build it, and that is a decision with a reason, not an omission: its price has never been measured
// (docs/graph.md §7 measured the FULL form — 417 B per node on a live run — and nothing else), and on
// every repository this pipeline has actually run on the branch would not execute once. A seam that
// only a synthetic fixture can reach is a test that no edit of the code can turn red — precisely the
// test standards/code.md forbids writing. Above the ceiling the step therefore REFUSES with the
// number, and the index arrives together with the repository that needs it, priced on that repository.
import { attrs, elem, tag } from "../../core/xml.mjs"

// WHAT THIS NUMBER IS, AND WHAT IT IS NOT — rewritten after live run 162e8b02 (form eddi).
//
// It was derived as "окно 128К × ≤25 % = 32K токенов ≈ 115 КБ" (docs/concept.md). Every term of that
// derivation is now false: the window of the role's model is 262 144, and no share of it is reserved
// for the map by anyone. What the provider actually enforces is a SUM, and the map is only half of it:
//   062e8b02, role intake: 56 448 tokens of input = map 27 197 (51%) + the project's own AGENTS.md
//   16 010 (30%, pi puts it in every role's system prompt — see contextFiles: [] in steps/*/*.md)
//   + order without the map 3 112 + pi boilerplate ~4 930 + tool schemas ~1 780.
// The request then claimed `min(model.maxTokens, window − estimate − 4096)` for the OUTPUT, and since
// the catalogue declares maxTokens == contextWindow, it claimed the whole window: 205 022 tokens for
// an artifact of two kilobytes. The estimator counts characters ÷ 4 while the real rate was 3.82, so
// it undershot by 4 208 against a fixed 4 096 safety margin — 112 tokens over, HTTP 400, and the role
// never ran. The fix for THAT is not here: it is `maxTokens: 32768` in ~/.pi/agent/models.json.
//
// So this number is NOT a window budget and must not be re-derived from one — a cap that tracks the
// window would move with every model change and silently widen the focus (steps/focus/focus.mjs) and
// the ripple subgraph (steps/ripple/ripple.mjs), which read it too. It is a POLICY on how much map a
// role can read and still answer about all of it: 115 KB ≈ 32K tokens ≈ 306 nodes at the measured
// 417 B/node (docs/graph.md §7, live run c166bd87). The number lives HERE — the workflow and the role
// receive it through the host, they do not carry a copy.
//
// The guard this run showed to be missing is a different one, and it now exists: the ASSEMBLED order
// is measured against the window next to the launch — workflows/izi.js::sized, in all five places an
// order is built, against core/budgets.mjs::ORDER_CAP_CHARS (D29b). This cap cannot stand in for that
// one — it sees one of five terms — and that one cannot stand in for this: a map a role can read whole
// is a policy about reading, not about fitting.
export const MAP_CAP_BYTES = 115 * 1024

// MAP_PRICE — what each ELEMENT of the map costs, and why this is a price list rather than an average.
//
// BUG_FIX_CONTEXT: three live runs on eddi died at step 6 with the map 2-3% over the ceiling while
//   the estimate was 10-12% under it (fa8def32, fb57f506). The estimate was a flat 468 B per node.
//   Measured on the map of fb57f506 — 120 050 B over 103 nodes — that flatness hid the biggest term
//   of all:
//     <edge>            45 654 B   216 × 211      (both paths inside)
//     <decl>            25 538 B   211 × 121      ← 21% of the file, and the estimate priced it at 0
//     <module> header   19 097 B   103 × (113 + path)
//     <role>            13 755 B   103 × 134      ← prose; see MAP_ROLE_CAP in steps/graph/graph.mjs
//     <api>              5 298 B    46 × 115
//     preamble           10 300 B   ≈100 per node (lang, suite, component, subject, surface, systems)
//   Everything above except `<role>` is KNOWN before the swarm runs: the declarations and the api
//   rows are already parsed out of `.agent/graph-computed.xml`, which step 3b reads anyway. The one
//   term nobody can predict is the sentence a scout writes, and that is why it is capped instead.
export const MAP_PRICE = Object.freeze({
  node: 113,        // <module …> header without its path
  preamble: 100,    // the file's fixed sections, per node — they scale with the node count
  role: 134,        // the scout's sentence, bounded by MAP_ROLE_CAP
  decl: 121,        // one <decl kind name sig/>
  api: 115,         // one <api …/>
  edge: 67,         // <edge from to via by/> without its two paths
  // ТЕСТ СТОИТ СТРОКУ, А НЕ УЗЕЛ (M1). С 19.08.2026 тестовый файл выходит в карту как
  // `<test path suite/>` — заголовка, преамбулы, роли, объявлений и api у него нет
  // (steps/graph/graph.mjs::graphXml). Замер на живой карте eddi: 34 теста стоили 19 189 Б блоками и
  // 3 230 Б строками. Если оценка фокуса продолжит считать их узлами, освободившееся место не дойдёт
  // до якорей: на том же прогоне 35 файлов из 91 в фокусе — тесты.
  test: 95,         // <test path suite/> without its path
})

// MAP_EST_SLACK — what is left of "the estimate may be wrong" once the elements are priced.
// It stays because `<role>` is capped, not fixed, and because a part may carry `<io>` rows nobody
// predicted. It is no longer the thing holding the estimate together.
export const MAP_EST_SLACK = 1.05

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
// FIVE MORE FOR STEP 14 (steps/tickets/facts.mjs), and again no second reader of this grammar:
//   pkgs        — `<module pkg>`: the namespace a directory carries. A file that has to declare its
//                 package cannot be written without it, and a NEW file's package is derived from
//                 these, never guessed.
//   decls       — `<decl kind name sig>` per node: the signature of a type that ALREADY EXISTS here.
//                 A ticket names such types in its own signatures, and a weak model given a name with
//                 no signature invents the constructor (live count).
//   nodeSystems — the `<io system>` a node touches: `mongodb`, `nats`. It is the sample's stack, and
//                 the executor otherwise learns which store it writes to from the class name.
//   langs       — `<lang id files decls>` without the `(unknown)` bucket, biggest first. This is the
//                 PRIMING of every ticket; without it a weak model wrote Spring Boot in a Quarkus
//                 repository, twice.
//   build       — `<build cmd compile>`: `compile` closes a module with no steps of its own.
export function parseMap(xml) {
  const s = String(xml || "")
  // The map may declare a shared path head once and write `~` in its place everywhere
  // (steps/graph/graph.mjs::bestPrefix). Expanding it here keeps every consumer — ripple, plan,
  // design, the FRD guardrail — reading full paths exactly as before: the compression is a property
  // of the FILE, never of the value.
  const pre = (s.match(/<paths prefix="([^"]*)"/) || ["", ""])[1]
  const full = (p) => (pre && String(p).startsWith("~") ? pre + String(p).slice(1) : String(p))
  const nodes = new Set()
  const tests = new Set()
  const entries = new Set()
  const nodeTests = new Map()
  const pkgs = new Map()
  const decls = new Map()
  const nodeSystems = new Map()
  // T61 — РОЛЬ И API КАК ДАННЫЕ: наряд пласта B (order.mjs::{MAP}) несёт их модели — «что этот
  // файл делает», а не только путь. До этого наряд обещал карту и доставлял список путей: модель
  // выдумывала новые сервисы для функций, которые уже лежали в карте в двух шагах (замер 25.08:
  // GlossarySubstitutionService при живой роли MemoryItemConverter).
  const roles = new Map()
  const apis = new Map()
  for (const m of s.matchAll(elem("module"))) {
    const a = attrs(m[1])
    if (!a.path) continue
    const path = full(a.path)
    nodes.add(path)
    if (a.kind === "test") tests.add(path)
    if (/<api\b/.test(m[2] || "")) entries.add(path)
    if (a.pkg) pkgs.set(path, String(a.pkg))
    const body = String(m[2] || "")
    const role = (body.match(/<role>([\s\S]*?)<\/role>/) || ["", ""])[1].replace(/\s+/g, " ").trim()
    if (role) roles.set(path, role)
    const said = [...body.matchAll(tag("decl"))]
      .map((d) => attrs(d[1]))
      .filter((d) => d.name)
      .map((d) => Object.freeze({ kind: d.kind || "", name: d.name, sig: d.sig || "" }))
    if (said.length) decls.set(path, Object.freeze(said))
    const apiNames = [...new Set([...body.matchAll(/<api\b[^>]*\bname="([^"]*)"/g)].map((x) => x[1]).filter(Boolean))]
    if (apiNames.length) apis.set(path, Object.freeze(apiNames))
    const sys = [...new Set([...body.matchAll(tag("io"))].map((io) => attrs(io[1]).system).filter(Boolean))]
    if (sys.length) nodeSystems.set(path, Object.freeze(sys))
    const own = [...body.matchAll(tag("test"))]
      .map((t) => attrs(t[1]))
      .filter((t) => t.path)
      .map((t) => Object.freeze({ path: full(t.path), suite: t.suite || "" }))
    if (own.length) nodeTests.set(path, Object.freeze(own))
  }

  // ТЕСТ, НАЗВАННЫЙ СТРОКОЙ. С 19.08.2026 тестовый файл в карте не модуль, а `<test path suite>` —
  // либо внутри модуля, который он проверяет, либо строкой верхнего уровня, если такого модуля в
  // карте нет (steps/graph/graph.mjs::graphXml). Множество `tests` собирается из ОБОИХ источников:
  // из старой формы `kind="test"` — карты прошлых прогонов читаются по-прежнему — и из этих строк.
  // Правило, ради которого множество существует, от формы записи не зависит: тест не бывает
  // изменением (F2/F3, docs/intake.md §4).
  for (const t of s.matchAll(tag("test"))) {
    const a = attrs(t[1])
    if (a.path) tests.add(full(a.path))
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
  // Two shapes, one meaning: `<edge from to/>` for an edge that carries its own evidence, and
  // `<edges from to="a b c"/>` for the rows the writer compressed (CSR). A consumer sees the same
  // flat list either way.
  const edges = [
    ...[...s.matchAll(tag("edge"))]
      .map((m) => attrs(m[1]))
      .filter((a) => a.from && a.to)
      .map((a) => Object.freeze({ from: full(a.from), to: full(a.to) })),
    ...[...s.matchAll(tag("edges"))]
      .map((m) => attrs(m[1]))
      .filter((a) => a.from && a.to)
      .flatMap((a) => String(a.to).split(/\s+/).filter(Boolean).map((t) => Object.freeze({ from: full(a.from), to: full(t) }))),
  ]
  // THE STACK'S OWN FACTS — read here because they are written here, and nowhere twice. `langs` are
  // `<lang id files …>` with the unknown bucket dropped (a bucket is not a language); `build` is
  // `<build cmd compile/>`, whose `compile` is the gate of a module with no steps left.
  const langs = [...s.matchAll(tag("lang"))]
    .map((m) => attrs(m[1]))
    .filter((a) => a.id && !a.id.startsWith("("))
    .map((a) => Object.freeze({ id: a.id, files: Number(a.files || 0), decls: a.decls || "" }))
    .sort((a, b) => b.files - a.files)
  const b = (s.match(tag("build", "/?>")) || [""])[0]
  const ba = b ? attrs(b.replace(/^<build\b/, "").replace(/\/?>$/, "")) : {}
  const build = Object.freeze({ cmd: ba.cmd || "", compile: ba.compile || "" })

  return { nodes, tests, entries, edges, count: nodes.size, nodeTests, suites, spine, cycles, pkgs, decls, nodeSystems, langs, build, roles, apis }
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
