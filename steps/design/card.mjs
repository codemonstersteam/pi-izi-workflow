// MODULE_CONTRACT: card — step 9's split, and the CARD one designer is handed
// Purpose:    two decisions, and both are the machine's. First: can a use case be designed ALONE — a
//             file touched by one use case can, a file touched by several cannot, so the shared ones
//             are grouped and decided once, before the swarm. Second: what ONE designer sees — its
//             use case, the repository's own facts about the files that use case walks, and a SAMPLE
//             of how such a file is already written here. Everything is a projection: the card is
//             10 KB where the map and the FRD together are 126 KB.
//             PURE: knows nothing of disk, io lives in ext/index.mjs. The flow — docs/design.md §1.
// io:         none
// EXTERNAL_DEPENDENCY: core/xml.mjs — tokens (a list-of-tokens attribute is cut in one place for the
//             whole repository; three copies of that split are how one artifact means three route
//             sets, live run 27b37fdb) and attrs/elem/tag for the map's own grammar.
// Invariants: every function here is TOTAL — any input, including undefined, yields an empty result
//             and never throws; the split and the card are FUNCTIONS of their inputs, so two runs
//             over one requirement agree byte for byte; the order of everything is the FRD's own.
// Interface:  splitOf({ frd }) -> { ucOf, shared, own, groups }
//             sampleOf(path, map) -> { kind, path }   — the ladder: self · twin · neighbour · none
//             cardOf({ uc, frd, map, flow, common }) -> { text, nodes, samples, chars }
//             coreCardOf({ group, frd, map, graph }) -> { text, chars }   — what the COMMON designer sees
//             checkCore({ text, group }) -> string[]  — blockers of a group contract, empty = green
//
// THE MEASUREMENT THAT MAKES THIS STEP NECESSARY. On form `eddi`: 13 nodes of the change, and **8 of
// them are touched by two or more use cases** — `RestGlossaryStore`, `IGlossaryStore` and
// `GlossaryStore` by EIGHT each. A swarm cut by use case would hand those eight files to two-to-eight
// independent designers. It is not an edge case, it is the majority of the change. On `t2` the same
// count is zero, and this whole phase costs nothing there.
//
// The collision is not hypothetical either: in a live run the designer of UC2 wrote `terms` as a
// nested class while UC6-UC8 create a separate `model/Term.java` — two designs of one file, from two
// designers who could not see each other.

import { attrs, elem, tag, tokens } from "../../core/xml.mjs"

// The longest directory both paths share, as the group's readable name. A group's id is never
// invented (`g1`, `g2`): it is read by a human on the gate and printed in the order's header, and a
// name that says `configs/glossary` explains the grouping by itself.
const commonDir = (paths) => {
  if (!paths.length) return ""
  const parts = paths.map((p) => p.split("/").slice(0, -1))
  const head = parts[0]
  let k = 0
  while (k < head.length && parts.every((p) => p[k] === head[k])) k++
  return head.slice(0, k).join("/")
}

// FUNCTION_CONTRACT: splitOf — the change cut into what one use case owns and what several share
//   Input:        { frd } — parseFrd's object
//   Dependencies: core/xml.mjs::tokens
//   Antecedent:   any value; a missing/garbage FRD yields an empty split
//   Consequent:   success: { ucOf, shared, own, groups }
//                          ucOf   — Map<path, readonly uc[]>: every path any `<scenario nodes>` names,
//                                   with the use cases that reach it, both in the FRD's order
//                          shared — paths named by TWO or more use cases, in the FRD's order
//                          own    — paths named by exactly one, in the FRD's order
//                          groups — [{ id, paths, ucs }]: the connected components of `shared` over
//                                   the relation "these two files are touched by a common use case",
//                                   `id` being the directory the group's paths share
//                 failure: none — total
//   Purity:       pure
//   Interface:    splitOf({ frd }) -> { ucOf, shared, own, groups }
//
// WHY THE COMPONENT IS OVER USE CASES AND NOT OVER PACKAGES OR EDGES.
//
// A package name is a naming convention, and this pipeline runs on repositories that keep theirs
// badly or not at all. The map's edges are worse still for this question: 7 of eddi's 13 nodes are
// CREATED by the change, so the map — built before those files existed — carries no edge for them at
// all, and the whole glossary quintet would fall apart into five groups of one.
//
// "Touched by a common use case" needs neither. It is also the exact statement of the obligation: if
// one use case runs through two files, their contracts must agree, so they must be decided together.
// Measured: `eddi` 8 shared files → 2 groups (the glossary five, the backup three), `t3` 1 → 1,
// `t2` 0 → 0.
export function splitOf({ frd = {} } = {}) {
  const ucOf = new Map()
  for (const s of (frd && frd.scenarios) || []) {
    const uc = String((s && s.uc) || "").trim()
    if (!uc) continue
    for (const p of tokens(s && s.nodes)) {
      if (!ucOf.has(p)) ucOf.set(p, [])
      if (!ucOf.get(p).includes(uc)) ucOf.get(p).push(uc)
    }
  }

  const shared = [...ucOf].filter(([, u]) => u.length > 1).map(([p]) => p)
  const own = [...ucOf].filter(([, u]) => u.length === 1).map(([p]) => p)

  // Union-find over `shared`: two files are in one group when SOME use case reaches both. The
  // relation is transitive by construction — `Glossary` meets the trio through UC1-UC5 and `Term`
  // meets it through UC6-UC8, so all five decide together even though `Glossary` and `Term` share no
  // use case of their own.
  const parent = new Map(shared.map((p) => [p, p]))
  const find = (x) => { while (parent.get(x) !== x) x = parent.get(x); return x }
  for (const a of shared) {
    for (const b of shared) {
      if (a >= b) continue
      if (!ucOf.get(a).some((u) => ucOf.get(b).includes(u))) continue
      const ra = find(a), rb = find(b)
      if (ra !== rb) parent.set(ra, rb)
    }
  }

  const byRoot = new Map()
  for (const p of shared) {
    const r = find(p)
    if (!byRoot.has(r)) byRoot.set(r, [])
    byRoot.get(r).push(p)
  }
  const groups = [...byRoot.values()].map((paths) => Object.freeze({
    id: commonDir(paths) || paths[0],
    // The id is a PATH, and a path is not a file name. The slug is what the group's artifacts are
    // named by — `.agent/staging/core/<slug>.txt`, `docs/design/core/<slug>.md` — and it is derived,
    // never invented, so a human reading the directory sees which package a contract belongs to.
    slug: (commonDir(paths) || paths[0]).split("/").filter(Boolean).slice(-2).join("-") || "core",
    paths: Object.freeze(paths),
    // The use cases of a group, in the FRD's order: this is what the common designer is handed, and
    // it must be every use case that can be broken by the group's contract.
    ucs: Object.freeze([...new Set(paths.flatMap((p) => ucOf.get(p)))]),
  }))

  return Object.freeze({
    ucOf,
    shared: Object.freeze(shared),
    own: Object.freeze(own),
    groups: Object.freeze(groups),
  })
}

// The LAST capitalised word of a file name — its KIND, as this repository writes kinds:
// `GlossaryStore` and `PromptSnippetStore` are both a `Store`, `IGlossaryStore` and
// `IPromptSnippetStore` too, `GlossaryNamespaceResolver` and `CallerNamespaceResolver` are both a
// `Resolver`. Everything before the last word is the ENTITY, and the entity is exactly what differs
// between a file and its sample.
//
// It is the last word and not «everything after the first» — measured: with the latter
// `IGlossaryStore` (→ `GlossaryStore`) and `IPromptSnippetStore` (→ `PromptSnippetStore`) stopped
// matching, and `eddi`'s interface was left with no sample at all.
const kindOf = (path) => {
  const file = String(path || "").split("/").pop() || ""
  const words = file.replace(/\.[^.]+$/, "").match(/[A-Z][a-z0-9]*/g) || []
  return words.length ? words[words.length - 1] : file.replace(/\.[^.]+$/, "")
}
const dirOf = (path) => String(path || "").split("/").slice(0, -1).join("/")
const tailOf = (path) => String(path || "").split("/").slice(-2, -1)[0] || ""

// FUNCTION_CONTRACT: sampleOf — how a file of this kind is ALREADY written in this repository
//   Input:        path — the node of the change; map — the TEXT of `.agent/appgraph.xml`
//   Dependencies: core/xml.mjs
//   Antecedent:   any values
//   Consequent:   success: { kind, path } — `kind` is one of
//                          `self`      — the node exists; the sample is the node itself
//                          `twin`      — the same path for another entity
//                          `neighbour` — a file of the same kind in the same directory
//                          `none`      — nothing found, and the card says so out loud
//                 failure: none — total
//   Purity:       pure
//   Interface:    sampleOf(path: string, map: unknown) -> { kind, path }
//
// WHY A SAMPLE AT ALL, AND WHY BY PATH RATHER THAN BY BODY. Measured on a live run: a designer given
// the twin's PATH read three files itself and named six classes — `AbstractResourceStore`,
// `RestVersionInfo`, `IResourceStore`, `IDocumentDescriptorStore`, `@ConfigurationUpdate`,
// `sneakyThrow` — and all six exist in the repository. Without a sample the same model wrote «CRUD
// Glossary» and a class with no fields. Shipping the body instead of the path would pay for what the
// role may never open.
//
// THE TWIN IS FOUND BY THE FORM OF THE PATH, not by one differing segment. The entity's name sits in
// the directory AND in the class name at once — `glossary/mongo/GlossaryStore` against
// `snippets/mongo/PromptSnippetStore` differ twice — so a strict «one difference» rule finds ZERO
// twins on `eddi`. The rule here is: the same number of segments, exactly one differing DIRECTORY
// segment, and then either the same kind (`Store`) or the same last directory (`model`).
export function sampleOf(path, map) {
  const p = String(path || "")
  const paths = [...String(map || "").matchAll(elem("module"))].map((m) => attrs(m[1]).path).filter(Boolean)
  if (!p) return Object.freeze({ kind: "none", path: "" })
  if (paths.includes(p)) return Object.freeze({ kind: "self", path: p })

  const seg = p.split("/")
  const kind = kindOf(p)
  const twins = paths.filter((q) => {
    const s = q.split("/")
    if (s.length !== seg.length) return false
    let diff = 0
    for (let i = 0; i < seg.length - 1; i++) if (s[i] !== seg[i]) diff++
    if (diff !== 1) return false
    return kindOf(q) === kind || tailOf(q) === tailOf(p)
  })
  const near = paths.filter((q) => dirOf(q) === dirOf(p) && q !== p)

  // THE KIND OUTRANKS THE MIRROR, and that order is measured. A twin of the same kind teaches most:
  // `PromptSnippetStore` shows `GlossaryStore` its base class, its collection and its annotations.
  // A file of the same kind in the SAME directory teaches next — `CallerNamespaceResolver` for a new
  // `GlossaryNamespaceResolver`. Only then a mirror directory of another kind, which is a weak hint.
  // With the mirror ranked first, `eddi` handed `GlossaryService` a resolver from another package and
  // `GlossaryNamespaceResolver` an executor — samples crossed over, both useless.
  const twinSame = twins.find((q) => kindOf(q) === kind)
  if (twinSame) return Object.freeze({ kind: "twin", path: twinSame })
  const nearSame = near.find((q) => kindOf(q) === kind)
  if (nearSame) return Object.freeze({ kind: "neighbour", path: nearSame })
  if (twins.length) return Object.freeze({ kind: "twin", path: twins[0] })
  if (near.length) return Object.freeze({ kind: "neighbour", path: near[0] })

  return Object.freeze({ kind: "none", path: "" })
}

// The `<module>` bytes of the map, by path — the same device the ripple's projection uses: CUT, never
// re-render. What the role reads is what the map says, character for character.
const moduleXml = (map, want) => {
  const out = []
  for (const m of String(map || "").matchAll(elem("module"))) {
    if (want.includes(attrs(m[1]).path)) out.push(m[0])
  }
  return out
}

// FUNCTION_CONTRACT: cardOf — everything ONE designer of ONE use case is given
//   Input:        { uc, frd, map, flow, common }
//                 uc     — the use case id; frd — parseFrd's object; map — text of appgraph.xml
//                 flow   — text of `.agent/data-flow.md`, or "" when step 9B was skipped
//                 common — text of the already decided contracts of the shared files, or ""
//   Dependencies: sampleOf, moduleXml, core/xml.mjs
//   Antecedent:   any values; an unknown `uc` yields a card with an empty use case section
//   Consequent:   success: { text, nodes, samples, chars } — `text` is the card, `nodes` the paths of
//                          this use case, `samples` the ladder's answer per node
//                 failure: none — total
//   Purity:       pure
//   Interface:    cardOf({ uc, frd, map, flow, common }) -> { text, nodes, samples, chars }
//
// EVERY SECTION IS A PROJECTION, and the numbers say why: the map is 110 KB and the FRD 17 KB, while
// one use case needs 3-4 modules of the first and one `<usecase>` of the second. The flow of step 9B
// is 16 KB whole and 1,1 KB for one scenario — 7 %. Measured on `eddi`: the card comes out at 6-10 KB
// against 126 KB, and a live run over it produced a plan naming six classes that all exist.
export function cardOf({ uc = "", frd = {}, map = "", flow = "", common = "" } = {}) {
  const id = String(uc || "").trim()
  const usecases = (frd && frd.usecases) || []
  const one = usecases.find((u) => String((u && u.id) || "").trim() === id)
  const scen = ((frd && frd.scenarios) || []).filter((s) => String((s && s.uc) || "").trim() === id)
  const nodes = [...new Set(scen.flatMap((s) => tokens(s && s.nodes)))]

  const line = (o, keys) => keys.filter((k) => o && o[k]).map((k) => `${k}="${o[k]}"`).join(" ")
  const ucBlock = one ? [
    `<usecase id="${id}" actor="${one.actor || ""}" goal="${one.goal || ""}">`,
    one.pre ? `  <pre>${one.pre}</pre>` : "",
    `  <post>${one.post || ""}</post>`,
    ...(one.steps || []).map((t, k) => `  <step n="${k + 1}">${t}</step>`),
    ...(one.exts || []).map((e) => `  <ext ${line(e, ["id", "error", "outcome"])}/>`),
    "</usecase>",
  ].filter(Boolean).join("\n") : "(use case не найден)"

  const scenBlock = scen.map((s) => `<scenario ${line(s, ["id", "uc", "before", "after"])} nodes="${tokens(s.nodes).join(" ")}"/>`).join("\n")
  const deltaBlock = ((frd && frd.deltas) || []).filter((d) => nodes.includes(d.node))
    .map((d) => `<delta ${line(d, ["op", "form", "node", "new", "from", "to"])}/>`).join("\n")
  const failBlock = ((frd && frd.failures) || []).filter((f) => ((one && one.exts) || []).some((e) => e.error === f.code))
    .map((f) => `<failure ${line(f, ["code", "status", "client", "operator", "from"])}/>`).join("\n")
  const fieldBlock = ((frd && frd.fields) || []).filter((f) => nodes.includes(f.in) || ((one && one.exts) || []).some((e) => e.error === f.error))
    .map((f) => `<field ${line(f, ["name", "in", "type", "domain", "required", "error"])}/>`).join("\n")

  const mods = moduleXml(map, nodes)
  const samples = nodes.map((p) => Object.freeze({ node: p, ...sampleOf(p, map) }))
  const sampleXml = moduleXml(map, samples.filter((s) => s.kind === "twin" || s.kind === "neighbour").map((s) => s.path))

  // The external systems these nodes touch — and only they: `eddi` declares thirteen, and a use case
  // that writes to one collection has no business reading about the other twelve.
  //
  // THE SAMPLE'S `<io>` COUNTS TOO, and that is not generosity: a CREATED node has no io yet, and on
  // `eddi` every node of eight use cases out of twelve is created — the section would be empty for
  // all of them. What the sample says («a store of this kind writes to mongodb, collection
  // `promptsnippets`») is precisely the fact the designer needs to write the new one.
  const used = new Set([...mods, ...sampleXml].flatMap((m) => [...m.matchAll(tag("io"))].map((io) => attrs(io[1]).system).filter(Boolean)))
  // `elem` and not `tag`: the map writes `<system …>…</system>` WITH a body and `<suite …/>` without
  // one, and a matcher for the self-closing form alone found zero systems on the live `eddi` map
  // while the unit fixture — written self-closing by hand — stayed green. One reader for both shapes.
  const systems = [...String(map || "").matchAll(elem("system"))].map((m) => m[0])
    .filter((s) => [...used].some((u) => s.includes(`name="${u}"`)))
  const suites = [...String(map || "").matchAll(elem("suite"))].map((m) => m[0])

  const sampleHead = samples.map((s) => s.kind === "self"
    ? `${s.node} — узел существует, образец не нужен`
    : s.kind === "none"
      ? `${s.node} — образца в репозитории нет, проектируй от use case`
      : `${s.node} — ${s.kind === "twin" ? "близнец" : "сосед того же вида"}: ${s.path}`)

  // The flow of THIS use case's scenarios only: 1,1 KB of the 16 KB file on `eddi`.
  const flows = scen.flatMap((s) => [...String(flow || "").matchAll(new RegExp(`\\$START_FLOW id="${s.id}[a-z]?"[\\s\\S]*?\\$END_FLOW`, "g"))].map((m) => m[0]))

  const text = [
    "$START_USECASE", ucBlock, scenBlock, deltaBlock, failBlock, fieldBlock, "$END_USECASE", "",
    "$START_NODES — узлы этого use case, как их видит репозиторий",
    mods.join("\n") || "(ни одного из них в репозитории ещё нет — все создаются)",
    "$END_NODES", "",
    "$START_SAMPLE — как файл такого рода уже написан ЗДЕСЬ; читай его по пути сам",
    sampleHead.join("\n"), sampleXml.length ? "" : null, sampleXml.join("\n"),
    "$END_SAMPLE", "",
    "$START_SYSTEMS — внешние системы, которых эти узлы касаются",
    systems.join("\n") || "(нет)",
    "$END_SYSTEMS", "",
    "$START_CHECK — чем проверяется",
    suites.join("\n") || "(в карте нет ни одного сьюта)",
    "$END_CHECK", "",
    "$START_COMMON — файлы, решённые общим дизайном; ИСПОЛЬЗУЙ, не переопределяй",
    String(common || "").trim() || "(общего дизайна для этого use case нет)",
    "$END_COMMON", "",
    "$START_FLOW_TODAY — поток его сценариев, как его посчитал проход 9B",
    flows.join("\n") || "(не посчитан)",
    "$END_FLOW_TODAY", "",
  ].filter((x) => x !== null).join("\n")

  return Object.freeze({ text, nodes: Object.freeze(nodes), samples: Object.freeze(samples), chars: text.length })
}

// FUNCTION_CONTRACT: coreCardOf — everything the designer of ONE GROUP of shared files is given
//   Input:        { group, frd, map, graph }
//                 group — one element of splitOf's `groups`; frd — parseFrd's object
//                 map   — text of appgraph.xml; graph — text of design-graph.xml, or ""
//   Dependencies: sampleOf, moduleXml, core/xml.mjs
//   Antecedent:   any values; a missing group yields a card with no files
//   Consequent:   success: { text, chars }
//                 failure: none — total
//   Purity:       pure
//   Interface:    coreCardOf({ group, frd, map, graph }) -> { text, chars }
//
// WHY THE GROUP IS DESIGNED BEFORE THE SWARM. On `eddi` eight files of thirteen are touched by two or
// more use cases, three of them by eight each. Handed out by use case, those eight files get two to
// eight independent designs — and that is not a hypothesis: a live run produced `terms` as a nested
// class in the plan of UC2 while UC6-UC8 create a separate `model/Term.java`. Deciding the shared
// files ONCE, with every use case that touches them in view, prevents the duplicate instead of
// reconciling it afterwards.
//
// The draft from `design-graph.xml` rides along as a DRAFT and as a visible hole: for this group it
// carries the contract accumulated across all use cases — on `configs/glossary` that is 9 in / 19 out
// for `RestGlossaryStore` and EMPTY for `Glossary.java`. Half of its values are labels
// (`IGlossaryStore CRUD` stands as the input of eleven rows), so the role replaces them with
// signatures read off the sample; what the draft is good for is the edges between files the map
// cannot know, because 7 of eddi's 13 nodes do not exist yet.
export function coreCardOf({ group = {}, frd = {}, map = "", graph = "" } = {}) {
  const paths = [...((group && group.paths) || [])]
  const ucs = [...((group && group.ucs) || [])]

  const line = (o, keys) => keys.filter((k) => o && o[k]).map((k) => `${k}="${o[k]}"`).join(" ")
  const ucBlocks = ucs.map((id) => {
    const u = ((frd && frd.usecases) || []).find((x) => String((x && x.id) || "").trim() === id)
    if (!u) return ""
    return [
      `<usecase id="${id}" actor="${u.actor || ""}" goal="${u.goal || ""}">`,
      u.pre ? `  <pre>${u.pre}</pre>` : "",
      `  <post>${u.post || ""}</post>`,
      ...(u.steps || []).map((t, k) => `  <step n="${k + 1}">${t}</step>`),
      ...(u.exts || []).map((e) => `  <ext ${line(e, ["id", "error", "outcome"])}/>`),
      "</usecase>",
    ].filter(Boolean).join("\n")
  }).filter(Boolean)

  const deltas = ((frd && frd.deltas) || []).filter((d) => paths.includes(d.node))
    .map((d) => `<delta ${line(d, ["op", "form", "node", "new", "from", "to"])}/>`)
  const fails = ((frd && frd.failures) || []).filter((f) => ucs.some((id) => {
    const u = ((frd && frd.usecases) || []).find((x) => String((x && x.id) || "").trim() === id)
    return ((u && u.exts) || []).some((e) => e.error === f.code)
  })).map((f) => `<failure ${line(f, ["code", "status", "client", "operator", "from"])}/>`)
  const fields = ((frd && frd.fields) || []).map((f) => `<field ${line(f, ["name", "in", "type", "domain", "required", "error"])}/>`)

  const mods = moduleXml(map, paths)
  const samples = paths.map((p) => ({ node: p, ...sampleOf(p, map) }))
  const sampleXml = moduleXml(map, samples.filter((x) => x.kind === "twin" || x.kind === "neighbour").map((x) => x.path))
  const sampleHead = samples.map((x) => x.kind === "self"
    ? `${x.node} — файл существует, образец не нужен`
    : x.kind === "none"
      ? `${x.node} — образца в репозитории нет, проектируй от use case`
      : `${x.node} — ${x.kind === "twin" ? "близнец" : "сосед того же вида"}: ${x.path}`)

  const used = new Set([...mods, ...sampleXml].flatMap((m) => [...m.matchAll(tag("io"))].map((io) => attrs(io[1]).system).filter(Boolean)))
  const systems = [...String(map || "").matchAll(elem("system"))].map((m) => m[0])
    .filter((x) => [...used].some((u) => x.includes(`name="${u}"`)))
  const suites = [...String(map || "").matchAll(elem("suite"))].map((m) => m[0])
  const draft = moduleXml(graph, paths)

  const text = [
    `$START_GROUP — ${paths.length} файлов, которые трогают ${ucs.length} use case: ${ucs.join(" ")}`,
    paths.join("\n"),
    "$END_GROUP", "",
    "$START_USECASES — все use case, чей контракт зависит от этих файлов",
    ucBlocks.join("\n"), deltas.join("\n"), fails.join("\n"), fields.join("\n"),
    "$END_USECASES", "",
    "$START_NODES — что репозиторий знает об этих файлах",
    mods.join("\n") || "(ни одного из них ещё нет — все создаются)",
    "$END_NODES", "",
    "$START_SAMPLE — как файл такого рода уже написан ЗДЕСЬ; читай его по пути сам",
    sampleHead.join("\n"), sampleXml.length ? "" : null, sampleXml.join("\n"),
    "$END_SAMPLE", "",
    "$START_SYSTEMS — внешние системы, которых эти файлы касаются",
    systems.join("\n") || "(нет)",
    "$END_SYSTEMS", "",
    "$START_CHECK — чем проверяется",
    suites.join("\n") || "(в карте нет ни одного сьюта)",
    "$END_CHECK", "",
    "$START_DRAFT — накопленный по всем use case контракт этих файлов, ЧЕРНОВИК",
    draft.join("\n") || "(черновика нет — проход 9B не отработал)",
    "$END_DRAFT", "",
  ].filter((x) => x !== null).join("\n")

  return Object.freeze({ text, chars: text.length })
}

// FUNCTION_CONTRACT: checkCore — did the role decide THIS group, all of it and nothing else
//   Input:        { text, group } — what the role wrote, and the group it was given
//   Dependencies: —
//   Antecedent:   any values
//   Consequent:   success: string[] — one blocker per defect, empty means green
//   Purity:       pure
//   Interface:    checkCore({ text, group }) -> string[]
//
// THREE RULES, ALL STRUCTURAL. What a contract MEANS is read by a human at the gate; what a script
// can tell is whether every file of the group got a decision, whether a file outside it was decided
// by mistake, and whether every use case whose contract depends on the group was looked at. Judging
// the meaning is what cost this pipeline forty rules on one step and a week of runs.
export function checkCore({ text = "", group = {} } = {}) {
  const B = []
  const paths = [...((group && group.paths) || [])]
  const ucs = [...((group && group.ucs) || [])]
  // A section is a FILE section when its heading is a path — it carries a `/` or a file extension.
  // Everything else is prose the role added of its own accord, and prose is not a defect.
  //
  // BUG_FIX_CONTEXT: live run of 17 Aug on `eddi`, group `backup`. The role closed its contract with
  // a `## Сводка:` heading, and this rule read it as a decision about a file named «Сводка:» —
  // «решены файлы не из этой группы». A guardrail that refuses an artifact for a summary line is a
  // guardrail that teaches the role to write worse documents.
  const isPath = (x) => x.includes("/") || /\.[A-Za-z0-9]+$/.test(x)
  const said = [...String(text || "").matchAll(/^##\s+(\S+)/gm)].map((m) => m[1].trim()).filter(isPath)

  const lost = paths.filter((p) => !said.includes(p))
  const extra = said.filter((p) => !paths.includes(p))
  if (lost.length) B.push(`нет решения по файлам: ${lost.join(", ")} — у каждого файла группы должен быть свой раздел «## <путь>»`)
  if (extra.length) B.push(`решены файлы не из этой группы: ${extra.join(", ")} — их проектирует свой use case, не ты`)

  const missed = ucs.filter((id) => !new RegExp(`\\b${id}\\b`).test(String(text || "")))
  if (missed.length) B.push(`use case ${missed.join(", ")} не упомянут ни в одном разделе — контракт этих файлов ломает и их тоже, покажи, чем именно они закрыты`)

  return B
}
