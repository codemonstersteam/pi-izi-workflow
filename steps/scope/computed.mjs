// MODULE_CONTRACT: computed — what the SCRIPT contributes to the graph, as an artifact of its own
// Purpose:    one decision, bought by the question "where do computed edges land" (backlog W4a):
//             computed facts are NOT patched into the role's part. The part stays exactly what the
//             role produced; the computed facts live beside it, each with its own evidence, and step
//             5 merges the two. Otherwise `.agent/graph-parts/*.xml` stops answering "what did the
//             model say", and the first disputed fact becomes unarguable. PURE: knows no disk.
// io:         none
// EXTERNAL_DEPENDENCY: steps/scope/edges.mjs::newEdges — edges, the language declaration and the
//             refusals; steps/scope/source.mjs — the shape of a file's facts (`decls`, `drivers`,
//             `pkg`, `literals`).
// EXTERNAL_DEPENDENCY: steps/scope/part.mjs::HTTP_API_NAME — the canonical form of an http name is
//             declared THERE because it is judged there; here it is only applied.
// EXTERNAL_DEPENDENCY: core/xml.mjs — `esc` encodes what `attrs` decodes; both live there so a value
//             cannot survive one round trip of this grammar and not the next.
// Invariants: newComputed is total; every fact carries `at` (the file) and `via` (the line it was
//             read from) — a computed fact must be as checkable as a declared one; a route is derived
//             ONLY from an annotation, never from a method name; a language with no routing rules is
//             declared in `<lang>` instead of staying silent.
// EXTERNAL_DEPENDENCY: steps/scope/source.mjs::DECL_KINDS — the per-language capability that
//             `<lang decls="…">` publishes; declared there because the readers live there.
// Interface:  ROUTE_RULES — the annotations an http route is read from
//             newComputed({ sources, paths, goModule }) -> Computed
//             computedXml(computed) -> string
//             parseComputed(xml) -> Computed

import { newEdges } from "./edges.mjs"
import { DECL_KINDS } from "./source.mjs"
import { attrs, tag, esc } from "../../core/xml.mjs"
import { HTTP_API_NAME } from "./part.mjs"

// ROUTE_RULES — the annotations an http route is computable from. JAX-RS (`@GET` + `@Path`) and
// Spring's short form (`@GetMapping`) both declare the method and the path DECLARATIVELY, so a script
// can read them. Routing registered by CALLS in the body (chi, gin, echo, net/http, express) is
// absent here ON PURPOSE: a regex cannot read it, it stays the role's, and docs/scope.md §3 says so.
export const ROUTE_RULES = Object.freeze({
  GET: [/^@GET\b/, /^@GetMapping\b/],
  POST: [/^@POST\b/, /^@PostMapping\b/],
  PUT: [/^@PUT\b/, /^@PutMapping\b/],
  PATCH: [/^@PATCH\b/, /^@PatchMapping\b/],
  DELETE: [/^@DELETE\b/, /^@DeleteMapping\b/],
  HEAD: [/^@HEAD\b/],
  OPTIONS: [/^@OPTIONS\b/],
})

// NAMESPACED — the languages whose `package` clause is a FULLY QUALIFIED name, and therefore an
// identity a merge can group by.
//
// BUG_FIX_CONTEXT: caught while writing this step's unit, before any live run.
//   Previous plan: emit `<pkg>` for every file whose `package` clause source.mjs could read.
//   Problem:  Go's clause is a SHORT name — `internal/store/s.go` and `vendor/b/store/s.go` both say
//             `package store`. Step 5 groups modules by `pkg` when it is present, so two unrelated
//             directories would have merged into one module, and the graph would claim a cohesion the
//             repository never declared. Python has no clause at all; ts/js none either.
//   Fix:      only java/kotlin/scala declare a namespace here. Everywhere else the DIRECTORY is the
//             package identity (in Go literally so), and step 5 groups by directory — which is the
//             correct rule for those languages, not a fallback.
const NAMESPACED = new Set(["java", "kotlin", "scala"])

// pathOf — the path inside an annotation: `@Path("/fruits")`, `@GetMapping("/fruits")`,
// `@RequestMapping(value = "/fruits")`. An annotation with no string argument yields an empty path,
// which is normal: `@GET` on a class carrying `@Path("/fruits")` gives `GET /fruits`.
const pathOf = (annotations, only) => {
  for (const a of annotations) {
    if (only && !only.test(a)) continue
    const m = a.match(/\(\s*(?:value\s*=\s*)?"([^"]*)"/)
    if (m) return m[1]
  }
  return ""
}

const joinPath = (base, tail) => {
  const p = `/${[base, tail].map((s) => String(s || "").replace(/^\/|\/$/g, "")).filter(Boolean).join("/")}`
  return p === "/" ? "/" : p
}

// routesOf — the http routes of one file. The base comes from the CLASS annotation
// (`@Path`/`@RequestMapping`), the verb and the tail from the declaration's own. Not one heuristic on
// names: a method called `getFruits()` with no annotation is not a route — otherwise the computed
// fact becomes the same guess the role's silence was.
function routesOf(src) {
  const cls = src.decls.find((d) => d.kind === "class" || d.kind === "interface")
  const base = cls ? pathOf(cls.annotations, /^@(Path|RequestMapping)\b/) : ""
  const out = []
  for (const d of src.decls) {
    if (d.kind !== "method") continue
    for (const [verb, res] of Object.entries(ROUTE_RULES)) {
      const hit = d.annotations.find((a) => res.some((re) => re.test(a)))
      if (!hit) continue
      const tail = pathOf(d.annotations, /^@(Path|\w*Mapping)\b/)
      const name = `${verb} ${joinPath(base, tail)}`
      if (HTTP_API_NAME.test(name)) out.push({ at: src.path, name, kind: "http", scope: "public", via: `${hit} ${d.line}`.trim() })
      break
    }
  }
  return out
}

// FUNCTION_CONTRACT: newComputed — everything about the graph a script could say
//   Input:        { sources, paths, goModule } — as for newEdges
//   Dependencies: newEdges, routesOf, EXTERNAL steps/scope/source.mjs (the Source shape)
//   Antecedent:   any values; missing ones read as empty
//   Consequent:   success: { edges, langs, ambiguous, api, use, drivers, routed, pkgs, decls,
//                          declKinds }
//                          decls — [{ at, kind, name, sig }] the PUBLIC declarations of a file, `sig`
//                                being the declaration line verbatim: what a module offers whoever
//                                calls it. Only public — an internal declaration crosses no boundary;
//                          declKinds — [{ lang, kinds }] which KINDS of declaration that language's
//                                reader can see at all, so "the rule is missing" and "the file has
//                                none" stay distinguishable (source.mjs::DECL_KINDS);
//                          pkgs — [{ at, name }] the NAMESPACE a file declares about itself, and only
//                                for the languages where that is a fully qualified name (NAMESPACED
//                                below). It is the address of a module, never a module (a package has
//                                no single entry and no single function — docs/graph.md §1); step 5
//                                carries it onto the node as `pkg` and groups by the DIRECTORY where
//                                it is absent. Nothing is computed here that source.mjs did not
//                                already read — the point of G1 is that this fact stops being lost
//                                between the disk and the graph, not that it is derived twice;
//                          api — [{ at, name, kind, scope, via }] only the entry points visible in an
//                                ANNOTATION; use — [{ at, path, via }] a file naming the PATH of
//                                somebody else's route (the consumer, not the provider); drivers —
//                                [{ at, kind, spec, via }] an external system named by the import
//                                alone (no `system`/`config`: an import does not carry them, and
//                                filling them in would be a guess — that stays the role's);
//                          routed — [{ lang, rules }]: whose routes are computable at all
//                 failure: none — total
//   Purity:       pure
//   Interface:    newComputed({ sources, paths, goModule }) -> Computed
export function newComputed({ sources = [], paths = [], goModule = "" } = {}) {
  const { edges, langs, ambiguous } = newEdges({ sources, paths, goModule })
  const api = []
  const drivers = []
  for (const src of sources) {
    for (const r of routesOf(src)) api.push(r)
    for (const d of src.drivers) drivers.push({ at: src.path, kind: d.kind, spec: d.spec, via: d.via })
  }

  // <use> — the CONSUMER of a route. The grammar knew only providers, so a contract delta at step 6
  // could never reach the UI: `fruits.html` calls `/fruits`, and the graph said that nowhere.
  //
  // Computed by the script rather than declared by the role, for the same reason as edges: a fifth
  // declared dimension changes the role's economics, and the dimension nobody demands disappears
  // first under load (`03bc51ef` — `<io>` and `<api>` were added, every `<test>` vanished). The
  // heuristic limits itself exactly like the capitalised token in java: a literal becomes a fact ONLY
  // if it matches a route path this same repository declares. `/usr/bin` and `/etc/hosts` are
  // collected into `literals` and die right here.
  //
  // The PATH is recorded, not `METHOD /path`: the verb of a call sits next to the literal
  // (`$http.get`, `fetch(…, {method})`), no regex reads it reliably, and an invented verb would be a
  // guess. Step 5 resolves the path to the providing node — enough for a ripple, which walks nodes.
  const routePaths = new Map()                       // "/fruits" → Set(providing files)
  for (const a of api) {
    const p = a.name.slice(a.name.indexOf(" ") + 1)
    if (!routePaths.has(p)) routePaths.set(p, new Set())
    routePaths.get(p).add(a.at)
  }
  const use = []
  const seenUse = new Set()
  for (const src of sources) {
    for (const lit of src.literals || []) {
      const providers = routePaths.get(lit.value)
      if (!providers || providers.has(src.path)) continue   // a provider does not consume itself
      const k = `${src.path}|${lit.value}`
      if (seenUse.has(k)) continue
      seenUse.add(k)
      use.push({ at: src.path, path: lit.value, via: lit.via })
    }
  }
  // <decl> — the module's own entry points, as the SIGNATURE LINE the file carries, verbatim.
  //
  // BUG_FIX_CONTEXT: live run c4fde2f3 (backlog G8). `<api>` came back `none` from 13 modules of 15,
  //   and two of those had incoming edges — they are called, and they declare no entry. That is not
  //   negligence: checkPart reads no files, so `api="none"` is UNFALSIFIABLE and therefore always the
  //   cheapest green answer (the same economics that emptied the edges in 337b957f). A rule cannot
  //   fix it. A script can: the visibility of a declaration is computable, so it is computed.
  //
  // Why the raw line and not a parsed in/out: `<contract in out>` at step 9 is a token of a DATA FLOW
  // compared by string equality between neighbours (docs/data-flow.md §6, rule 4) — a signature is
  // not that token, it is the SOURCE a role reads to write one. Parsing it into parts would also
  // demand a parser per language (Go returns `(T, error)`, python annotations are optional, generics
  // carry commas), and the shape would be guessed for step 9, which does not exist yet.
  //
  // PUBLIC only: an internal declaration does not cross the module's boundary, so it can be nobody's
  // in or out. That is a principle, not a size threshold.
  const decls = []
  for (const src of sources) {
    for (const d of src.decls || []) {
      if (d.visibility !== "public") continue
      decls.push({ at: src.path, kind: d.kind, name: d.name, sig: d.line })
    }
  }

  // Routes are read from annotations only — so they exist only where annotations do.
  const ROUTED = new Set(["java", "kotlin"])
  return {
    decls,
    declKinds: langs.map((l) => ({ lang: l.lang, kinds: DECL_KINDS[l.lang] || "" })),
    edges,
    langs,
    ambiguous,
    api,
    use,
    drivers,
    pkgs: sources.filter((s) => s.pkg && NAMESPACED.has(s.lang)).map((s) => ({ at: s.path, name: s.pkg })),
    routed: langs.map((l) => ({ lang: l.lang, rules: ROUTED.has(l.lang) })),
  }
}

// FUNCTION_CONTRACT: computedXml — the `.agent/graph-computed.xml` artifact
//   Input:        computed — the result of newComputed
//   Dependencies: esc
//   Antecedent:   any value; missing fields read as empty lists
//   Consequent:   success: XML in the same grammar as the parts — one scanner (core/xml.mjs) reads
//                          both, so step 5 never grows a second parser. `<lang>` comes FIRST and
//                          always: a file with no `<edge>` at all must say why
//                 failure: none — total
//   Purity:       pure
//   Interface:    computedXml(computed) -> string
export function computedXml(computed) {
  const c = computed || {}
  const L = []
  L.push('<computed by="script">')
  for (const l of c.langs || []) {
    const routed = (c.routed || []).find((r) => r.lang === l.lang)
    const kinds = (c.declKinds || []).find((d) => d.lang === l.lang)
    L.push(`  <lang id="${esc(l.lang)}" files="${l.files}" edges="${l.rules ? "yes" : "no-rules"}" routes="${routed && routed.rules ? "yes" : "no-rules"}" decls="${esc(kinds && kinds.kinds ? kinds.kinds : "no-rules")}"/>`)
  }
  for (const p of c.pkgs || []) L.push(`  <pkg at="${esc(p.at)}" name="${esc(p.name)}"/>`)
  for (const d of c.decls || []) L.push(`  <decl at="${esc(d.at)}" kind="${esc(d.kind)}" name="${esc(d.name)}" sig="${esc(d.sig)}"/>`)
  for (const e of c.edges || []) L.push(`  <edge from="${esc(e.from)}" to="${esc(e.to)}" via="${esc(e.via)}"/>`)
  for (const a of c.api || []) L.push(`  <api at="${esc(a.at)}" name="${esc(a.name)}" kind="${esc(a.kind)}" scope="${esc(a.scope)}" via="${esc(a.via)}"/>`)
  for (const u of c.use || []) L.push(`  <use at="${esc(u.at)}" path="${esc(u.path)}" via="${esc(u.via)}"/>`)
  for (const d of c.drivers || []) L.push(`  <driver at="${esc(d.at)}" kind="${esc(d.kind)}" via="${esc(d.via)}"/>`)
  for (const a of c.ambiguous || []) L.push(`  <ambiguous from="${esc(a.from)}" spec="${esc(a.spec)}" candidates="${esc((a.candidates || []).join(" "))}"/>`)
  L.push("</computed>")
  return `${L.join("\n")}\n`
}

// FUNCTION_CONTRACT: parseComputed — the artifact back into facts
//   Input:        xml — the text of `.agent/graph-computed.xml`; type unconstrained
//   Dependencies: attrs, tag (core/xml.mjs — the same scanner the parts are read with)
//   Antecedent:   any value; undefined/garbage read as an empty set of facts
//   Consequent:   success: { edges, api, use, drivers, langs, ambiguous, pkgs, decls, declKinds }
//                 failure: none — total
//   Purity:       pure
//   Interface:    parseComputed(xml: unknown) -> Computed
//
// Why reading it back exists at all: step 4 builds an order PER CELL, while everything is computed in
// one pass at step 3. Recomputing the repository per cell is O(cells × files); reading this artifact
// is O(1) per cell. Step 5, which merges the computed facts into `appgraph.xml`, enters here too.
export function parseComputed(xml) {
  const src = String(xml || "")
  const list = (name) => [...src.matchAll(tag(name))].map((m) => attrs(m[1]))
  return {
    langs: list("lang").map((a) => ({ lang: a.id || "", files: Number(a.files || 0), rules: a.edges === "yes" })),
    routed: list("lang").map((a) => ({ lang: a.id || "", rules: a.routes === "yes" })),
    pkgs: list("pkg").map((a) => ({ at: a.at || "", name: a.name || "" })),
    decls: list("decl").map((a) => ({ at: a.at || "", kind: a.kind || "", name: a.name || "", sig: a.sig || "" })),
    declKinds: list("lang").map((a) => ({ lang: a.id || "", kinds: a.decls === "no-rules" ? "" : (a.decls || "") })),
    edges: list("edge").map((a) => ({ from: a.from || "", to: a.to || "", via: a.via || "" })),
    api: list("api").map((a) => ({ at: a.at || "", name: a.name || "", kind: a.kind || "", scope: a.scope || "", via: a.via || "" })),
    use: list("use").map((u) => ({ at: u.at || "", path: u.path || "", via: u.via || "" })),
    drivers: list("driver").map((a) => ({ at: a.at || "", kind: a.kind || "", via: a.via || "" })),
    ambiguous: list("ambiguous").map((a) => ({ from: a.from || "", spec: a.spec || "", candidates: (a.candidates || "").split(" ").filter(Boolean) })),
  }
}
