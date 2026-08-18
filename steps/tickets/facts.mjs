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
// Interface:  factsOf(map) -> { stack, roots, pkgOf(path), declOf(name), systemsOf(path) }
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
//                          stack     — one line of PRIMING: the languages by weight, the toggle
//                                      mechanism the repository uses, the build command, and how the
//                                      test files of each suite are named and run. Empty when the map
//                                      declares no language: silence beats a made-up stack
//                          roots     — the source roots, longest first
//                          pkgOf     — the namespace a path declares, "" when the layout has none
//                          declOf    — { path, sig, members } of a type that EXISTS in this
//                                      repository, or null. Members are that module's other
//                                      declarations, in the map's order
//                          systemsOf — the external systems a path touches (`mongodb`, `nats`)
//                 failure: none — total
//   Purity:       pure
//   Interface:    factsOf(map: unknown) -> Facts
export function factsOf(map = {}) {
  const m = map || {}
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
      const own = decls.get(path) || []
      const self = own.find((d) => d.name === name && TYPE.has(d.kind))
      return Object.freeze({
        path,
        sig: (self && self.sig) || "",
        members: Object.freeze(own.filter((d) => d !== self).map((d) => d.sig || d.name)),
      })
    },

    systemsOf(path) {
      return systems.get(String(path || "")) || []
    },
  })
}
