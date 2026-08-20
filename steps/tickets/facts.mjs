// MODULE_CONTRACT: facts — what the REPOSITORY says about the file a ticket orders
// Purpose:    one decision — of everything the map already knows, what does the EXECUTOR of a ticket
//             need in order to write the file without guessing. Four answers, all cut from the map
//             and none invented: the stack it is written in, the package the file declares, the
//             signature of a type it is told to call, and the external system its sample touches.
//             Costs no tokens: the map was paid for on step 5.
// io:         none
// EXTERNAL_DEPENDENCY: steps/intake/map.mjs::parseMap — the ONE reader of the map's grammar. This
//             module takes its OBJECT, never the xml: a second parse of one file is how an artifact
//             judged green comes to mean two different things.
// Invariants: factsOf is TOTAL — any input, including undefined, yields an object whose every lookup
//             answers "" or null and never throws; the answers are a FUNCTION of the map alone, so
//             two runs over one repository agree byte for byte.
// Interface:  factsOf(map, computed?) -> { stack, roots, pkgOf(path), declOf(name), systemsOf(path) }
//             computed — разбор .agent/graph-computed.xml (steps/scope/computed.mjs::parseComputed):
//             ВТОРОЙ источник типов. Рой читает только клетки фокуса (живая карта eddi: 230
//             объявлений), скрипт шага 3 — ВСЕ файлы репозитория (6070). Тип, которого в карте роя
//             нет, находится здесь за 0 токенов: живой счёт eddi — IDocumentDescriptorStore,
//             MeterRegistry, IResourceStorageFactory названы в конструкторах нарядов без единой
//             сигнатуры. Карта роя остаётся ПЕРВЫМ источником: её объявления богаче (есть members).
//             namedTypes(text, facts) -> [{ name, path, kind, members }] — ТОТ ЖЕ резолвер, второй
//             потребитель: наряд шага 6. typesBlock(rows, cap?) -> string — эти строки как текст
//             наряда; MEMBERS_PER_TYPE и TYPES_CAP_BYTES — его потолки, и они живут только здесь.
//
// WHY THIS EXISTS AT ALL. Read `15-glossarystore.md` of the live `eddi` run with the eyes of the
// executor: it says WHAT (the steps of the requirement, verbatim from the FRD) and WHERE (inputs,
// outputs, the command), and it does not say IN WHAT. Not the language, not the framework, not the
// package, not the constructor of the factory its own signature takes. A small model fills every one
// of those holes by guessing, and the guesses were measured: an emulation of the boundary ticket on
// Haiku produced a Spring Boot test for a Quarkus project — twice.
//
// EVERY HOLE HERE IS CLOSED FROM THE MAP, NOT FROM A ROLE. The facts existed before the ticket did;
// they simply never travelled to it.

// The source root is DERIVED, never configured: a module that declares a package also proves where
// its package starts — strip the package's segments off its directory and what is left is the root.
// `src/main/java/ai/labs/eddi/configs/snippets/mongo` minus `ai.labs.eddi.configs.snippets.mongo`
// gives `src/main/java`. A repository has SEVERAL roots (main and test at least), so they are kept as
// a set and the longest one that prefixes a path wins — that is what makes the package of a file that
// DOES NOT EXIST YET computable, which is the whole point.
const rootsOf = (pkgs) => {
  const seen = new Map()
  for (const [path, pkg] of pkgs || []) {
    const dir = String(path).split("/").filter(Boolean).slice(0, -1)
    const own = String(pkg).split(".").filter(Boolean)
    if (own.length > dir.length) continue
    // The package must actually STAND at the tail of the directory; a repository whose layout does
    // not mirror its namespace (Go's `module`, a flat C project) simply yields no root, and the
    // package line is then absent from the ticket instead of being wrong in it.
    if (own.some((seg, k) => dir[dir.length - own.length + k] !== seg)) continue
    const root = dir.slice(0, dir.length - own.length).join("/")
    seen.set(root, (seen.get(root) || 0) + 1)
  }
  return Object.freeze([...seen.keys()].sort((a, b) => b.length - a.length))
}

// FUNCTION_CONTRACT: factsOf — the repository's own answers, ready for a ticket body
//   Input:        map — the object of steps/intake/map.mjs::parseMap
//   Dependencies: rootsOf
//   Antecedent:   any value; a missing or empty map yields empty answers, never a throw
//   Consequent:   success: { stack, roots, pkgOf, declOf, systemsOf }
//                          (declOf's shape gained `kind` for namedTypes — one answer, not two)
//                          stack     — one line of PRIMING: the languages by weight, the toggle
//                                      mechanism the repository uses, the build command, and how the
//                                      test files of each suite are named and run. Empty when the map
//                                      declares no language: silence beats a made-up stack
//                          roots     — the source roots, longest first
//                          pkgOf     — the namespace a path declares, "" when the layout has none
//                          declOf    — { path, kind, sig, members } of a type that EXISTS in this
//                                      repository, or null. Members are that module's other
//                                      declarations, in the map's order
//                          systemsOf — the external systems a path touches (`mongodb`, `nats`)
//                 failure: none — total
//   Purity:       pure
//   Interface:    factsOf(map: unknown) -> Facts
export function factsOf(map = {}, computed = {}) {
  const m = map || {}
  const c = computed || {}
  const cdecls = Array.isArray(c.decls) ? c.decls : []
  const pkgs = m.pkgs instanceof Map ? m.pkgs : new Map()
  const decls = m.decls instanceof Map ? m.decls : new Map()
  const systems = m.nodeSystems instanceof Map ? m.nodeSystems : new Map()
  const langs = Array.isArray(m.langs) ? m.langs : []
  const suites = Array.isArray(m.suites) ? m.suites : []
  const build = m.build || {}
  const spine = m.spine || {}

  const roots = rootsOf(pkgs)

  // The type index: a NAME to the module that declares it. Only the types are indexed, never the
  // methods — a ticket names `IResourceStorageFactory` in its signature, and what it needs back is
  // that file plus everything it can call on it.
  const TYPE = new Set(["class", "interface", "enum", "record", "type", "struct"])
  const byName = new Map()
  for (const [path, own] of decls) {
    for (const d of own) {
      if (!TYPE.has(d.kind)) continue
      if (!byName.has(d.name)) byName.set(d.name, path)
    }
  }
  // Пробелы карты роя закрывает вычисленный граф: имя, которого в нём нет, по-прежнему отвечает
  // null — выдумывать объявление не по чему.
  for (const d of cdecls) {
    if (!TYPE.has(d.kind)) continue
    if (d.at && d.name && !byName.has(d.name)) byName.set(d.name, d.at)
  }

  // ONE LANGUAGE, THE BIGGEST. `eddi` declares `java` at 1576 files and `ts` at 4, and naming both
  // primes the executor with a language this change is not written in — the opposite of what the line
  // is for. Which language a particular file is in, the path and the sample say by themselves.
  const stack = [
    (langs[0] || {}).id || "",
    (spine.toggles || {}).mechanism || "",
    build.compile ? `build: ${build.compile}` : build.cmd ? `build: ${build.cmd}` : "",
    ...suites.filter((s) => s.cmd).map((s) => `${s.kind || s.id} tests: ${s.match || "?"} run by ${s.cmd}`),
  ].filter(Boolean).join(" · ")

  return Object.freeze({
    stack: langs.length ? stack : "",
    roots,

    pkgOf(path) {
      const p = String(path || "")
      const root = roots.find((r) => r && p.startsWith(`${r}/`))
      if (root === undefined) return ""
      const dir = p.split("/").filter(Boolean).slice(0, -1)
      return dir.slice(String(root).split("/").filter(Boolean).length).join(".")
    },

    declOf(name) {
      const path = byName.get(String(name || ""))
      if (!path) return null
      // Первый источник — карта роя; её запись богаче. Тип найден только в вычисленном графе —
      // members собираются из его же строк по тому же пути.
      const own = decls.has(path) ? decls.get(path) : cdecls.filter((d) => d.at === path)
      const self = own.find((d) => d.name === name && TYPE.has(d.kind))
      return Object.freeze({
        path,
        // `kind` — КАКОГО ВИДА эта сущность (class | interface | enum | record | …). Оно уже лежало в
        // объявлении и просто не выезжало наружу; наряд шага 6 (namedTypes ниже) без него не может
        // сказать «интерфейс» там, где роль иначе напишет «класс» и придумает конструктор.
        kind: (self && self.kind) || "",
        sig: (self && self.sig) || "",
        members: Object.freeze(own.filter((d) => d !== self).map((d) => d.sig || d.name)),
      })
    },

    systemsOf(path) {
      return systems.get(String(path || "")) || []
    },
  })
}

// ---------------------------------------------------------------------------------------------
// THE SAME RESOLVER, A SECOND CONSUMER — the ORDER of step 6, not only the ticket of step 12.
//
// WHY THIS LIVES HERE AND NOT IN steps/intake/. `factsOf` above is already the one place that reads
// BOTH maps and answers "in which file is E declared" — the swarm map first (its record is richer),
// the computed graph of step 3 behind it. Step 6 needs exactly that answer and nothing else, so it
// gets the SAME function: a resolver written a second time under steps/intake/ would be two answers
// to one question, and the first artifact judged by one and read by the other would be unarguable.
// The direction is one-way (intake's io calls this module; this module imports nothing), so nothing
// here knows about step 6 either.
//
// BUG_FIX_CONTEXT: live run of 19.08.2026 on form `eddi` (DOS-535). The role of step 6 spent a trip
//   to the operator on «AgentConfiguration model class path (not in appgraph.xml — needed for R3
//   `glossaries` field delta; recommended to search agentstore or engine packages)». The fact was on
//   disk the whole time: `.agent/graph-computed.xml` carries
//   `<decl at="src/main/java/ai/labs/eddi/configs/agents/model/AgentConfiguration.java" kind="class"
//   name="AgentConfiguration"/>` among 6890 declarations over all 1856 files, while the swarm map the
//   order hands the role covers the 86 nodes of the focus and does not mention the name once. The
//   band has TWO maps and the language of every step below step 5 knew one.

// NAME_IN_TEXT — what counts as a name a TEXT calls a type by: a capitalized identifier, three
// characters or more. Deliberately crude, because the GRAPH is the filter that follows: `REST`,
// `CRUD` and `R12` cost one lookup each and yield no row, while a rule clever enough to reject them
// in advance would be a second definition of "type name" with nothing to check it against.
const NAME_IN_TEXT = /\b[A-Z][A-Za-z0-9_]{2,}\b/g

// MEMBERS_PER_TYPE — how many declarations of a resolved type the table shows. `AgentConfiguration`
// of the live form carries 150 (13 nested classes plus getters and setters); the whole list is 7 262 B
// for one row, and the answer the role came for is the PATH. 24 shows the nested types and reaches
// the accessors, and the tail is stated as a number instead of being silently dropped.
// TYPES_CAP_BYTES — the ceiling on the whole table. It is not the order's ceiling (that one is
// core/budgets.mjs::ORDER_CAP_CHARS, and workflows/izi.js::sized measures the assembled order against
// it with this table as one of its addends); it is the ceiling on how much of the order ONE
// substitution may claim, so a task text naming three hundred types cannot push the map out of the
// window.
export const MEMBERS_PER_TYPE = 24
export const TYPES_CAP_BYTES = 8 * 1024

// FUNCTION_CONTRACT: namedTypes — the names a text calls, resolved to what the repository declares
//   Input:        text — any text the run already has (TASK.md, .agent/brd.md, the answers), joined
//                        by the caller; facts — the object of factsOf, the ONE resolver
//   Dependencies: factsOf's declOf (through the given object), NAME_IN_TEXT
//   Antecedent:   any value; a text with no names, or facts that cannot resolve, yield []
//   Consequent:   success: frozen [{ name, path, kind, members }], in the order the text names them,
//                          each name once. A name the graph does not carry gets NO ROW — that is the
//                          whole point: the table answers where a type IS, and a type that is
//                          nowhere stays a legal reason for the role to ask the operator
//                 failure: none — total
//   Purity:       pure
//   Interface:    namedTypes(text: unknown, facts: Facts) -> Row[]
export function namedTypes(text, facts) {
  const f = facts && typeof facts.declOf === "function" ? facts : null
  if (!f) return Object.freeze([])
  const seen = new Set()
  const rows = []
  for (const m of String(text == null ? "" : text).matchAll(NAME_IN_TEXT)) {
    if (seen.has(m[0])) continue
    seen.add(m[0])
    const d = f.declOf(m[0])
    if (!d) continue
    rows.push(Object.freeze({ name: m[0], path: d.path, kind: d.kind, members: d.members }))
  }
  return Object.freeze(rows)
}

// FUNCTION_CONTRACT: typesBlock — those rows as the text that travels in an order
//   Input:        rows — namedTypes' value; cap — the ceiling in BYTES (default TYPES_CAP_BYTES)
//   Dependencies: MEMBERS_PER_TYPE
//   Antecedent:   any value; a non-array or an empty list yields "" — and "there is no table" is the
//                 CALLER's wording to substitute (workflows/izi.js), never invented here
//   Consequent:   success: one line per row — `name · path · kind · declares …` — under the cap. A row
//                          that would cross it is not written, and the count of the dropped ones is
//                          the last line: a table silently shorter than the repository is how a role
//                          learns a type does not exist when it does
//                 failure: none — total
//   Purity:       pure
//   Interface:    typesBlock(rows: unknown, cap?: number) -> string
export function typesBlock(rows, cap = TYPES_CAP_BYTES) {
  const list = Array.isArray(rows) ? rows : []
  const out = []
  let bytes = 0
  let dropped = 0
  for (const r of list) {
    const own = Array.isArray(r && r.members) ? r.members : []
    const shown = own.slice(0, MEMBERS_PER_TYPE)
    const rest = own.length - shown.length
    const tail = shown.length ? ` · declares ${shown.join(", ")}${rest > 0 ? ` …+${rest}` : ""}` : ""
    const line = `${(r && r.name) || ""} · ${(r && r.path) || ""} · ${(r && r.kind) || "?"}${tail}`
    const size = Buffer.byteLength(line, "utf8") + 1
    if (bytes + size > cap) { dropped++; continue }
    bytes += size
    out.push(line)
  }
  if (dropped) out.push(`… ${dropped} more names resolve in this repository, dropped at the ${cap} B ceiling of this table`)
  return out.join("\n")
}
