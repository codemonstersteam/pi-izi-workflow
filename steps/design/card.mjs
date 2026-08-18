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
// Interface:  partsOf({ frd, ripple }) -> { modules, parts }   — фазы ① и ②
//             sampleOf(path, map) -> { kind, path }   — the ladder: self · twin · neighbour · none
//             partCardOf({ part, frd, map, graph }) -> { text, chars }   — фаза ③
//             sectionsOf(text) -> Section[]           — ОДИН разбор плана партии
//             checkPart({ text, part, known }) -> string[]  — фаза ⑤, пять правил
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

// FUNCTION_CONTRACT: partsOf — the change as a TREE OF MODULES, cut into partitions
//   Input:        { frd, ripple } — parseFrd's object and the text of .agent/ripple.xml
//   Dependencies: core/xml.mjs::tokens, attrs, elem, tag
//   Antecedent:   any values; a missing/garbage FRD yields an empty tree
//   Consequent:   success: { modules, parts }
//                          modules — Map<path, { path, ucs, new, deps, level }> in the FRD's order
//                          parts   — [{ id, slug, modules, ucs, steps, neighbours }], the components of
//                                    «two modules some use case reaches both»
//                 failure: none — total
//   Purity:       pure
//   Interface:    partsOf({ frd, ripple }) -> { modules, parts }
//
// THE COMPOSITION COMES FROM THE FRD, THE FACTS COME FROM THE RIPPLE, and the order of those two
// sentences is the measurement: on `eddi` the change has 13 modules and the ripple knows 6 of them.
// The other 7 are CREATED, and the ripple cannot know them — it is a projection of the map, which
// was built before those files existed. Sourcing the composition from the ripple would lose more
// than half the work; sourcing the deps from the FRD is impossible, it has none.
//
// THE PARTITION IS THE UNIT OF ONE ROLE CALL, and its invariant is what makes a duplicate
// impossible: every module sits in exactly ONE partition, so no two calls can decide one file.
// That is a property of the split, not a check at the gate — the defect it replaces was live
// (run ce2ede24: `AbstractBackupService.java` wanted by UC10 and UC12 at once).
//
// WHY THE COMPONENT IS OVER USE CASES AND NOT OVER PACKAGES. Measured on three forms: by package,
// `eddi`'s UC9 falls into two calls (`modules/templating` and `modules/llm`) and the resolver stops
// seeing the service it calls; on `t3` the page and the endpoint it calls end up in different calls.
// By use case both stay together — and a package name is a naming convention this pipeline cannot
// rely on anyway.
export function partsOf({ frd = {}, ripple = "" } = {}) {
  // The step ids of every use case, EXACTLY as the FRD writes them: `<step n="1">` gives "1",
  // `<ext id="2a">` gives "2a". They travel to the guardrail so that «закрывает: UC1 шаг 2а» typed in
  // another alphabet is a REFUSAL and not a silent miss — one numbering, checked where it is written.
  const stepsOf = new Map()
  for (const u of (frd && frd.usecases) || []) {
    const id = String((u && u.id) || "").trim()
    if (!id) continue
    stepsOf.set(id, [
      ...((u.steps || []).map((_, k) => String(k + 1))),
      ...((u.exts || []).map((e) => String((e && e.id) || "").trim()).filter(Boolean)),
    ])
  }

  const modules = new Map()
  for (const s of (frd && frd.scenarios) || []) {
    const uc = String((s && s.uc) || "").trim()
    if (!uc) continue
    for (const p of tokens(s && s.nodes)) {
      if (!modules.has(p)) modules.set(p, { path: p, ucs: [], new: true, deps: [], level: 0 })
      const m = modules.get(p)
      if (!m.ucs.includes(uc)) m.ucs.push(uc)
    }
  }

  // The ripple enriches what the FRD found: a module it carries EXISTS, and what it calls today is
  // the second operand of the order of work (steps/design-data-flow.md ⑦).
  for (const m of String(ripple || "").matchAll(elem("module"))) {
    const a = attrs(m[1])
    const path = String(a.path || "").trim()
    const mine = modules.get(path)
    if (!mine) continue
    mine.new = false
    mine.level = Number(a.level || 0)
    mine.deps = [...m[2].matchAll(tag("dep"))].map((d) => String(attrs(d[1]).path || "").trim()).filter(Boolean)
  }

  const all = [...modules.keys()]
  const parent = new Map(all.map((p) => [p, p]))
  const find = (x) => { while (parent.get(x) !== x) x = parent.get(x); return x }
  for (const a of all) {
    for (const b of all) {
      if (a >= b) continue
      if (!modules.get(a).ucs.some((u) => modules.get(b).ucs.includes(u))) continue
      const ra = find(a), rb = find(b)
      if (ra !== rb) parent.set(ra, rb)
    }
  }

  const byRoot = new Map()
  for (const p of all) {
    const r = find(p)
    if (!byRoot.has(r)) byRoot.set(r, [])
    byRoot.get(r).push(p)
  }

  const parts = [...byRoot.values()].map((paths) => {
    const dir = commonDir(paths) || paths[0]
    return Object.freeze({
      id: dir,
      // The slug NAMES the partition's artifacts — `.agent/staging/parts/<slug>.txt`,
      // `docs/design/<slug>.md` — so it is derived from the paths, never invented.
      slug: dir.split("/").filter(Boolean).slice(-2).join("-") || "part",
      modules: Object.freeze(paths),
      ucs: Object.freeze([...new Set(paths.flatMap((p) => modules.get(p).ucs))]),
      steps: Object.freeze([...new Set(paths.flatMap((p) => modules.get(p).ucs))]
        .flatMap((u) => (stepsOf.get(u) || []).map((n) => `${u}/${n}`))),
      // What the partition's modules call today and does NOT decide: context to read, never a
      // section to write (steps/design-data-flow.md ③).
      neighbours: Object.freeze([...new Set(paths.flatMap((p) => modules.get(p).deps))].filter((d) => !paths.includes(d))),
    })
  })

  return Object.freeze({ modules, parts: Object.freeze(parts) })
}

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

// FUNCTION_CONTRACT: partCardOf — everything the designer of ONE PARTITION is given
//   Input:        { part, frd, map, graph }
//                 group — one element of splitOf's `groups`; frd — parseFrd's object
//                 map   — text of appgraph.xml; graph — text of design-graph.xml, or ""
//   Dependencies: sampleOf, moduleXml, core/xml.mjs
//   Antecedent:   any values; a missing group yields a card with no files
//   Consequent:   success: { text, chars }
//                 failure: none — total
//   Purity:       pure
//   Interface:    partCardOf({ part, frd, map, graph }) -> { text, chars }
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
export function partCardOf({ part = {}, frd = {}, map = "", graph = "" } = {}) {
  const paths = [...((part && part.modules) || [])]
  const ucs = [...((part && part.ucs) || [])]
  const neighbours = [...((part && part.neighbours) || [])]

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
    `$START_MODULES — ${paths.length} модулей этой партии; их трогают ${ucs.length} use case: ${ucs.join(" ")}`,
    paths.join("\n"),
    "$END_MODULES", "",
    "$START_USECASES — все use case, чей контракт зависит от этих файлов",
    ucBlocks.join("\n"), deltas.join("\n"), fails.join("\n"), fields.join("\n"),
    "$END_USECASES", "",
    "$START_NODES — что репозиторий знает об этих файлах",
    mods.join("\n") || "(ни одного из них ещё нет — все создаются)",
    "$END_NODES", "",
    "$START_NEIGHBOURS — что эти модули зовут сегодня. Читай по пути; правь МИНИМАЛЬНО и только если надо",
    neighbours.join("\n") || "(рябь зависимостей не знает — все модули создаются)",
    "$END_NEIGHBOURS", "",
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


// КЛЮЧИ РАЗДЕЛА — СЛОВАРЬ, ОБЪЯВЛЕННЫЙ ОДИН РАЗ. Роль пишет их в теле раздела, гардрейл судит по ним,
// а шаг 14 режет по ним тикеты. Читатель значения обязан знать, где значение КОНЧАЕТСЯ: длинный
// перечень роль переносит на следующие строки, и продолжение отличается от нового ключа только тем,
// что не начинается ни одним словом отсюда. Две копии этого словаря — это тикет, разошедшийся с
// планом, поэтому копия одна и живёт там же, где формат раздела.
export const SECTION_KEYS = Object.freeze([
  "что это", "поля", "сигнатуры", "зовёт", "по образцу", "закрывает", "проверка",
])

// A HEADING IS A FILE SECTION WHEN IT NAMES A PATH. Prose the role adds of its own accord is not a
// defect: a live run closed a contract with a `## Сводка:` heading and the rule read it as a
// decision about a file named «Сводка:».
const isPath = (x) => x.includes("/") || /\.[A-Za-z0-9]+$/.test(x)

// sectionsOf — the ONE parse of a partition's plan: a section per module, with its body.
// Two readers — the guardrail below and the assembly of `PLAN.md` (steps/design-data-flow.md ⑧) —
// and a second cut of the same text is how a plan judged green could carry an order nobody builds.
export function sectionsOf(text = "") {
  const src = String(text || "")
  const out = []
  const heads = [...src.matchAll(/^##\s+(\S+)[^\n]*$/gm)]
  for (const [k, h] of heads.entries()) {
    const path = h[1].trim()
    if (!isPath(path)) continue
    const from = h.index + h[0].length
    const to = k + 1 < heads.length ? heads[k + 1].index : src.length
    const body = src.slice(from, to)
    const calls = [...body.matchAll(/^\s*зовёт:\s*([^\n]*)$/gm)].map((m) => m[1])
    out.push(Object.freeze({
      path,
      body,
      // The declared calls: paths only. «нет» is a legal answer and yields an empty list — what is
      // NOT legal is the line missing altogether, because then the order of work has no operand
      // (measured: 8 sections of a live contract declared 2 edges, the rest was prose).
      says: calls.length > 0,
      calls: Object.freeze([...new Set(calls.join(" ").match(/[\w./-]+\.[A-Za-z0-9]+/g) || [])]),
      checks: /^\s*проверка:\s*\S/m.test(body),
      // «шаг 2а» пишется и латиницей, и кириллицей — обе формы наблюдались в одном живом прогоне.
      // Здесь номер берётся КАК НАПИСАН; сравнивает его с FRD фаза ⑥ (steps/design/plandoc.mjs).
      closes: Object.freeze([...body.matchAll(/(UC\d+)\s+шаг\s+([^\s·,;]+)/g)].map((m) => `${m[1]}/${m[2]}`)),
      ucs: Object.freeze([...new Set([...body.matchAll(/\bUC\d+\b/g)].map((m) => m[0]))]),
    }))
  }
  return Object.freeze(out)
}

// FUNCTION_CONTRACT: checkPart — did the role decide THIS partition, all of it and nothing else
//   Input:        { text, part, known } — what the role wrote, the partition it was given, and every
//                 path this repository can resolve (modules of the change + the map's own)
//   Dependencies: sectionsOf
//   Antecedent:   any values
//   Consequent:   success: string[] — one blocker per defect, empty means green
//   Purity:       pure
//   Interface:    checkPart({ text, part, known }) -> string[]
//
// FIVE RULES, ALL STRUCTURAL (steps/design-data-flow.md ⑤). What the plan MEANS is read by a human at
// the gate; a script can tell only whether every module of the partition got a decision, whether a
// foreign one crept in, whether every use case is shown as closed, whether the work can be checked,
// and whether what the module calls is an ADDRESS rather than prose.
export function checkPart({ text = "", part = {}, known = [], texts = {} } = {}) {
  const B = []
  const mine = [...((part && part.modules) || [])]
  const ucs = [...((part && part.ucs) || [])]
  const sections = sectionsOf(text)
  const said = sections.map((x) => x.path)

  // 1 — a section per module of the partition
  const lost = mine.filter((p) => !said.includes(p))
  if (lost.length) B.push(`нет решения по модулям: ${lost.join(", ")} — у каждого модуля партии должен быть свой раздел «## <путь>»`)

  // 2 — and not one module of another partition
  const extra = said.filter((p) => !mine.includes(p))
  if (extra.length) B.push(`решены модули не из этой партии: ${extra.join(", ")} — их решает свой вызов; соседа читают, но раздела по нему не пишут`)

  // 3 — every use case shown as closed, BY STEP, and every step number copied from the FRD.
  // The second half is not pedantry: the FRD numbers its failure branches `2a`, `2b` in LATIN, a role
  // writing Russian types `2а`, `2б` in CYRILLIC, and both were observed in ONE file of run e79a460e.
  // Two alphabets for one number make the coverage of phase ⑥ a lie, so the numbering is made uniform
  // HERE, where the line is written and where there is a role to repair it.
  const closes = sections.flatMap((x) => x.closes)
  const closed = new Set(closes.map((c) => c.split("/")[0]))
  const missed = ucs.filter((id) => !closed.has(id))
  if (missed.length) B.push(`use case ${missed.join(", ")} не закрыт ни одним разделом — покажи строкой «закрывает: ${missed[0]} шаг N», что именно его закрывает`)
  const numbered = new Set((part && part.steps) || [])
  const alien = [...new Set(closes.filter((c) => closed.has(c.split("/")[0]) && !numbered.has(c)))]
  if (alien.length) B.push(`в «закрывает» названы шаги, которых нет в use case: ${alien.map((c) => c.replace("/", " шаг ")).join(", ")} — номер копируется из заказа дословно, той же буквой (${[...numbered].slice(0, 4).map((c) => c.replace("/", " шаг ")).join(", ")}…)`)

  // 4 — every section says how it is checked and what it calls
  const dumb = sections.filter((x) => !x.checks).map((x) => x.path)
  if (dumb.length) B.push(`у разделов ${dumb.join(", ")} нет строки «проверка: <команда> · <имя тест-класса>» — без неё работу нечем закрыть`)
  const mute = sections.filter((x) => !x.says).map((x) => x.path)
  if (mute.length) B.push(`у разделов ${mute.join(", ")} нет строки «зовёт:» — напиши пути либо слово «нет»; из этой строки строится порядок работ`)

  // 5 — and what it calls is an address
  const all = new Set([...known, ...mine])
  for (const x of sections) {
    const ghost = x.calls.filter((c) => !all.has(c))
    // БЛОКЕР НАЗЫВАЕТ ВЫХОД. Роль пишет в «зовёт» то, что вызывает — `source.readGlossaries`, — и на
    // отказ «такого файла нет» чинит его перебором имён файлов. Отличить одно от другого дёшево: в
    // пути есть слэш, в вызове — точка и ни одного слэша.
    if (ghost.length) {
      const calls = ghost.filter((g) => g.includes(".") && !g.includes("/"))
      B.push(calls.length
        ? `в разделе ${x.path} «зовёт» несёт вызовы, а не пути: ${calls.join(", ")} — напиши ПУТЬ файла, а что именно вызываешь, скажи словами после тире`
        : `в разделе ${x.path} «зовёт» ссылается на ${ghost.join(", ")} — такого файла нет ни среди модулей изменения, ни в репозитории`)
    }
  }

  // 6 — ШАГ ЗАКРЫВАЕТ ТОТ, КТО МОЖЕТ ЕГО ПРОВЕРИТЬ. Если текст шага называет модуль изменения, шаг
  // закрывает либо он сам, либо тот, кто его ЗОВЁТ: иначе исполнителю нечем проверить свой же наряд.
  //
  // BUG_FIX_CONTEXT: живой прогон eddi. План объявил, что «система инвалидирует кэш GlossaryService»
  // закрывает монго-хранилище — у того в сигнатурах один CRUD, а в «зовёт» один интерфейс. Правило
  // владения шага 14 вмешаться не могло: шаг объявил ровно ОДИН раздел, отсеивать было некого. Наряд
  // дошёл до исполнителя, и слабая модель закрыла шаг требования `assertTrue(true)`.
  //
  // Сверяются имена модулей САМОГО плана, целым словом и с учётом регистра — это не разбор языка, а
  // сличение с тем, что роль написала в заголовках своих же разделов. Текстов нет — правило молчит,
  // той же дисциплиной, что F5 без источников: судить не по чему.
  const named = new Map([...mine, ...known].map((p) => [p.split("/").pop().replace(/\.[^.]+$/, ""), p]))
  for (const x of sections) {
    for (const c of x.closes) {
      const t = String(texts[c] || "")
      if (!t) continue
      const speaks = [...named].filter(([n, p]) => p !== x.path && mine.includes(p) && new RegExp(`\\b${n}\\b`).test(t))
      const blind = speaks.filter(([, p]) => !x.calls.includes(p))
      if (blind.length) {
        // БЛОКЕР НАЗЫВАЕТ КАНДИДАТА, А НЕ ТОЛЬКО ОШИБКУ. Кто зовёт названный модуль — известно из тех
        // же разделов, и роль, не получив этого имени, перебирает соседей: живой прогон переносил один
        // шаг с GlossaryStore на IGlossaryStore, потом на IRestGlossaryStore — три круга наугад.
        const who = blind.map(([, p]) => {
          const callers = sections.filter((y) => y.path !== p && y.calls.includes(p)).map((y) => y.path)
          return `${p}${callers.length ? ` (его зовёт ${callers.join(", ")})` : " — его не зовёт никто"}`
        })
        B.push(`шаг ${c.replace("/", " шаг ")} закрывает ${x.path}, а его текст говорит о ${who.join(", ")} — отдай шаг тому, кто зовёт названный модуль, либо допиши «зовёт» здесь`)
      }
    }
  }

  // 7 — МОДУЛЬ ПАРТИИ СВЯЗАН С ИЗМЕНЕНИЕМ: его зовут либо он зовёт. Оторванный не проверит ничто —
  // ни компилятор потребителя, ни граница. Связь считается в обе стороны намеренно: реализацию
  // интерфейса никто не зовёт по имени, но она объявляет «зовёт: <интерфейс> — реализует».
  //
  // BUG_FIX_CONTEXT: живой прогон eddi. `RestGlossaryStore` не объявил, что реализует
  // `IRestGlossaryStore`, хотя соседний `GlossaryStore` для своего интерфейса это объявил. Интерфейс
  // остался без шагов и без связей, и отказал шаг 14 — там, где чинить уже некому.
  //
  // Партия из одного модуля связывать не с кем — правило молчит.
  if (mine.length > 1) {
    for (const x of sections) {
      if (!mine.includes(x.path)) continue
      const uses = x.calls.some((c) => mine.includes(c) && c !== x.path)
      const used = sections.some((y) => y.path !== x.path && y.calls.includes(x.path))
      if (!uses && !used) {
        B.push(`модуль ${x.path} не связан с изменением: он никого не зовёт, и его никто не зовёт — проверить его нечем; допиши «зовёт» ему или тому, кто его реализует`)
      }
    }
  }

  return B
}
