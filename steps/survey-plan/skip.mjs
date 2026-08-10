// MODULE_CONTRACT: skip — what is NOT a node of the application graph
// Purpose:    one decision — which paths the survey walk (step 3) never puts into a cell. It lives
//             in a PURE module rather than inside ext/index.mjs's walk() for one reason: the walk is
//             an io pipe proven by a live run, and a live run on the acceptance form proves nothing
//             here — that form holds no `vendor/`, no `*.min.js` and no hashed bundle. A predicate
//             with no unit is a predicate nobody can refute (backlog W1).
// io:         none
// EXTERNAL_DEPENDENCY (conceptual): ext/index.mjs::walk is the only caller; it owns the two harness
//             inputs (TASK.md, izi.config.json) that are skipped for a DIFFERENT reason — they are
//             the pipeline, not the application — and passes them in via `extraFiles`.
// Invariants: every export is total; a decision is made on the path as the walk sees it (relative to
//             the run's cwd, "/"-separated), never on disk contents. Skipping is a FALSE-NEGATIVE
//             risk by construction: a file dropped here is a graph node nobody will ever miss, so
//             every rule names a shape that cannot hold code of this repository.
// Interface:  SKIP_DIRS · KEEP_DOTS — directory names, and the dotted exception
//             skipDir(name) -> boolean
//             skipFile(path, extra?) -> boolean
//             whySkipped(path, extra?) -> string   — the rule that fired, or "" when kept

// SKIP_DIRS — a directory whose whole subtree is outside the graph.
//
// The first six names are THE HARNESS ITSELF: bin/install.mjs copies them INTO the project, so in an
// installed project they belong to the pipeline, not to the application. The accepted price is named
// out loud (docs/survey-plan.md §1): a project whose OWN directory is called `steps` loses it.
//
// The rest are either build output (`dist`, `build`, `target`, `out`, `.next` via the dot rule) or
// third-party code checked into the tree (`vendor`, `third_party`, `Pods`, `Godeps`). Vendored code
// is not this repository's to change: a ticket cannot land in it, so a node there is a node no step
// can act on.
export const SKIP_DIRS = new Set([
  "workflows", "steps", "core", "bin", "ext", "prompts",     // the harness, copied into the project
  "node_modules", "dist", "build", "target", "coverage", "out",
  "vendor", "third_party", "thirdparty", "Pods", "Godeps",   // checked-in third-party code
])

// KEEP_DOTS — the exception to "a dotted directory is not the application": CI lives in `.github`,
// and "how is this repository built and tested" is one of the six questions the spine cell answers.
export const KEEP_DOTS = new Set([".github"])

// SKIP_NAMES — exact file names. Vendored build wrappers (`mvnw` and its kin) are somebody else's
// code; lock files are machine-written inventories with no module in them and, on a real repository,
// the largest text files in the tree (`package-lock.json` alone routinely passes 1 MB).
//
// The ignore files are the third group, and they were bought by a live run: in `615192d7` the scout
// dutifully made `.gitignore` and `.dockerignore` into graph nodes with a `<role>` about ignore
// patterns, and in `dc415b95` it closed the same two with `<gap>` — two runs, two graphs, on one
// tree. Neither reading is wrong, because no step of the pipeline can ever act on such a file: it is
// not a node, and the cheapest way to stop asking is to not put it in a cell.
//
// Deliberately NOT here: `.env*`, `.editorconfig` and everything under `.github/` — those answer the
// spine's questions (how this repository is configured, built and changed), so they stay.
export const SKIP_NAMES = new Set([
  "mvnw", "mvnw.cmd", "gradlew", "gradlew.bat",
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "go.sum",
  "Cargo.lock", "poetry.lock", "Gemfile.lock", "composer.lock",
  ".gitignore", ".dockerignore", ".gitattributes", ".npmignore", ".eslintignore", ".prettierignore",
])

// SKIP_RULES — [name, test] pairs, in the order they are tried. The NAME is not decoration: it is
// what whySkipped() returns, so `.agent/survey-plan.json`'s own diagnosis says which rule dropped a
// file instead of leaving the operator to guess between five plausible ones.
//
// Every rule answers "what shape can this repository's own source NOT have":
//   generated — the tool that wrote it rewrites it; a ticket editing it is undone by the next build
//   bundled   — output of a bundler, keyed by a content hash: `app.4f3c2b1a.js`
//   minified  — one line, no structure a scout can read, and a copy of source that IS in the tree
//   asset     — bytes with no code in them at all: fonts, images, media, archives, binaries
//   sourcemap — a machine index into a file already in the tree
const RULES = Object.freeze([
  Object.freeze(["generated", /(^|\/)(zz_)?generated[_.]|(^|\/)mock_[^/]*$|\.pb(\.gw)?\.go$|_pb2\.py$|\.g\.dart$|\.generated\.[^/]+$/]),
  Object.freeze(["bundled", /\.[0-9a-f]{8,32}\.(js|mjs|cjs|css|map)$/]),
  Object.freeze(["minified", /\.min\.(js|mjs|css)$/]),
  Object.freeze(["sourcemap", /\.map$/]),
  Object.freeze(["asset", new RegExp(
    "\\.(" +
    "woff2?|ttf|otf|eot|" +                                   // fonts
    "png|jpe?g|gif|bmp|ico|webp|avif|tiff?|svg|psd|" +        // images
    "mp3|mp4|wav|ogg|webm|mov|avi|" +                         // media
    "zip|tar|gz|tgz|bz2|xz|7z|rar|jar|war|ear|" +             // archives
    "exe|dll|so|dylib|a|o|class|wasm|bin|dat|" +              // binaries
    "pdf|doc|docx|xls|xlsx|ppt|pptx|" +                       // office
    "ttc|icns|db|sqlite3?" +
    ")$", "i")]),
])

// FUNCTION_CONTRACT: skipDir — is this directory outside the graph
//   Input:        name — one path SEGMENT, not a path
//   Dependencies: SKIP_DIRS, KEEP_DOTS
//   Antecedent:   any value; undefined/null read as ""
//   Consequent:   success: true when the whole subtree is outside the graph — a listed name, or a
//                          dotted directory other than the CI exception
//                 failure: none — total
//   Purity:       pure
//   Interface:    skipDir(name: unknown) -> boolean
export function skipDir(name) {
  const n = String(name == null ? "" : name)
  if (SKIP_DIRS.has(n)) return true
  return n.startsWith(".") && !KEEP_DOTS.has(n)
}

// FUNCTION_CONTRACT: whySkipped — which rule drops this file, if any
//   Input:        path — the file's path relative to the run's cwd, "/"-separated
//                 extra — additional exact names the caller owns (the harness inputs), optional
//   Dependencies: SKIP_NAMES, RULES
//   Antecedent:   any value; undefined/null read as ""
//   Consequent:   success: the rule name ("harness-input" | "vendored-name" | one of RULES), or ""
//                          when the file stays in the graph
//                 failure: none — total
//   Purity:       pure
//   Interface:    whySkipped(path: unknown, extra?: Set<string>) -> string
export function whySkipped(path, extra) {
  const p = String(path == null ? "" : path)
  const name = p.slice(p.lastIndexOf("/") + 1)
  if (extra && extra.has(name)) return "harness-input"
  if (SKIP_NAMES.has(name)) return "vendored-name"
  for (const [why, re] of RULES) if (re.test(p)) return why
  return ""
}

// FUNCTION_CONTRACT: skipFile — is this file outside the graph
//   Input:        path, extra — as whySkipped
//   Dependencies: whySkipped
//   Antecedent:   any value
//   Consequent:   success: true when some rule fires
//                 failure: none — total
//   Purity:       pure
//   Interface:    skipFile(path: unknown, extra?: Set<string>) -> boolean
export const skipFile = (path, extra) => whySkipped(path, extra) !== ""
