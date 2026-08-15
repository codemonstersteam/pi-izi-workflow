// MODULE_CONTRACT: suites — how a test suite claims a file: its folder and its name pattern
// Purpose:    one decision, shared by two slices: WHICH files a `<suite path match>` runs. Step 4
//             judges the suite the scout wrote (P8: a pattern that picks up nothing), step 5 binds
//             every test file to its suite (suiteFor). Two spellings of this rule would let a suite
//             pass P8 and still drop its files at the merge, which is exactly the shape of the defect
//             P8 exists to catch — so the rule lives here and nowhere else.
// io:         none
// Invariants: both functions are total and pure; an empty pattern or dir answers false rather than
//             throwing, because a half-written suite is DATA a guardrail reports, not a crash
// Interface:  matches(path, pattern) -> boolean; under(path, dir) -> boolean
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
