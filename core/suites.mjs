// MODULE_CONTRACT: suites — what a test suite claims and what it can OBSERVE
// Purpose:    one decision per question, each shared by several slices. WHICH files a
//             `<suite path match>` runs: step 4 judges the suite the scout wrote (P8: a pattern that
//             picks up nothing), step 5 binds every test file to its suite (suiteFor). WHAT a suite's
//             execution reaches: step 6's gate (blindNodes) and step 11's R6. Two spellings of either
//             rule would let a suite pass P8 and still drop its files at the merge — or let the gate
//             and the critic disagree about whether a node is witnessed at all — so both live here.
// io:         none
// EXTERNAL_DEPENDENCY: steps/intake/map.mjs — parseMap's parse is the shape `reachedBy`/`hasOwnCheck`
//             read (`nodeTests`, `suites`, `edges`). It is not imported: this module is the LEAF the
//             map's consumers share, and importing its parser back would close a cycle.
// Invariants: every function is total and pure; an empty pattern, a null map or an unknown suite
//             answers false / the empty set rather than throwing, because a half-written suite is
//             DATA a guardrail reports, not a crash
// Interface:  matches(path, pattern) -> boolean; under(path, dir) -> boolean
//             reachedBy(map, suite) -> Set<path>; hasOwnCheck(map, path) -> boolean
//             WRAPPERS — the build wrappers a repository ships, each against the bare runner
//
// `*` is the only wildcard: the patterns this reads come from build manifests (`*Test.java`,
// `*IT.java`, `test_*.py`), and a full glob engine would be a dependency to interpret three
// characters. The comparison is against the file NAME, never the path — a suite's folder is the
// separate `path` question, answered by `under`.
export function matches(path, pattern) {
  const name = String(path).slice(String(path).lastIndexOf("/") + 1)
  const re = new RegExp(`^${String(pattern).split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`)
  return re.test(name)
}

export const under = (path, dir) => Boolean(dir) && (path === dir || path.startsWith(`${dir}/`))

// The build wrappers a repository ships to pin its own toolchain version, each against the BARE
// runner it replaces. A suite whose command names the bare one while the wrapper sits in the root is
// a command that may not start at all (P9, live run 0aa13bff: `mvn test` with `mvnw` in the tree and
// no `mvn` on the machine).
export const WRAPPERS = Object.freeze([
  Object.freeze({ file: "mvnw", bare: "mvn" }),
  Object.freeze({ file: "gradlew", bare: "gradle" }),
])

// FUNCTION_CONTRACT: reachedBy — what a suite's tests can observe, walked over the map's edges
//   Input:        map — parseMap's parse; suite — a suite id
//   Dependencies: —
//   Antecedent:   map may be null and the suite unknown — both answer an empty set
//   Consequent:   success: Set<path> — the tests of that suite and everything their execution
//                          travels to along `<edge from to>`. The direction is the one the map
//                          records: `from` uses `to`, so a test reaches what it calls, and a page
//                          calling an endpoint does NOT make the endpoint's test reach the page
//                 failure: none — total
//   Purity:       pure
//
// TWO CONSUMERS, ONE EXPRESSION: step 11's R6 asks it about the command a critic named
// (steps/review/review.mjs), and step 6's gate asks it about every node of the change's width
// (steps/ripple/ripple.mjs::blindNodes). A second copy is how the gate would wave a node through that
// the critic then stops the band on — the very sequence live run 21dd9b34 paid 167 805 tokens for.
export function reachedBy(map, suite) {
  const seen = new Set()
  if (!map || !suite) return seen
  const out = new Map()
  for (const e of map.edges || []) {
    if (!out.has(e.from)) out.set(e.from, [])
    out.get(e.from).push(e.to)
  }
  const queue = []
  for (const rows of (map.nodeTests || new Map()).values()) {
    for (const t of rows || []) if (t.suite === suite && t.path) queue.push(t.path)
  }
  while (queue.length) {
    const at = queue.shift()
    if (seen.has(at)) continue
    seen.add(at)
    for (const next of out.get(at) || []) queue.push(next)
  }
  return seen
}

// FUNCTION_CONTRACT: hasOwnCheck — can this node be closed by a command OF ITS OWN
//   Input:        map — parseMap's parse; path — a module's path
//   Dependencies: —
//   Antecedent:   any values — a null map or an unknown path answers false
//   Consequent:   success: true when the map binds a `<test>` to this node whose `suite` is a suite
//                          the map DECLARES. A test bound to a suite nobody declared is not a command
//                          — there is no `cmd` to run it with
//                 failure: none — total
//   Purity:       pure
//
// TWO CONSUMERS: step 10 decides by it whether a one-node scenario needs a node of its own
// (steps/plan/plan.mjs, live run 03b598c7), and step 6's gate uses it as the first half of "no suite
// exercises this node". The two must not disagree about what "the node closes itself" means.
export function hasOwnCheck(map, path) {
  const declared = new Set(((map && map.suites) || []).map((s) => s && s.id).filter(Boolean))
  return (((map && map.nodeTests) || new Map()).get(path) || []).some((t) => t && declared.has(t.suite))
}
