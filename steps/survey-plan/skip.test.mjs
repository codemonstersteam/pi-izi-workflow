// Slice `survey-plan`: the skip predicate — a PURE core. Its caller (ext/index.mjs::walk) is an io
// pipe proven by a live run, and that is exactly why THIS file exists: the acceptance form holds no
// `vendor/`, no `.min.js` and no hashed bundle, so a live run can never turn red on a broken rule
// (backlog W1). Formula: one pair — kept and dropped — per rule, because a rule with only positive
// cases silently eats the repository it was meant to trim.

import test from "node:test"
import assert from "node:assert/strict"
import { skipDir, skipFile, whySkipped } from "./skip.mjs"

test("directories: the harness, build output and vendored code go; the application stays", () => {
  for (const d of ["steps", "core", "node_modules", "dist", "target", "vendor", "third_party", ".git", ".idea"]) {
    assert.equal(skipDir(d), true, d)
  }
  for (const d of ["src", "cmd", "lib", "packages", "app", "internal", "testdata", ".github"]) {
    assert.equal(skipDir(d), false, d)
  }
})

test("files: every rule drops its shape and keeps the source that merely resembles it", () => {
  const cases = [
    // [path, expected rule name — "" means the file stays in the graph]
    ["api/v1/user.pb.go", "generated"],
    ["api/v1/user.pb.gw.go", "generated"],
    ["internal/store/mock_repository.go", "generated"],
    ["k8s/zz_generated.deepcopy.go", "generated"],
    ["proto/user_pb2.py", "generated"],
    ["src/api.generated.ts", "generated"],
    ["internal/store/repository.go", ""],            // …but a hand-written neighbour stays
    ["internal/mockingbird.go", ""],                 // `mock_` is a prefix, not a substring
    ["src/generation.go", ""],

    ["static/app.4f3c2b1a.js", "bundled"],
    ["static/main.0badc0de9f1e.css", "bundled"],
    ["src/app.config.js", ""],                       // a dotted segment that is not a content hash
    ["src/app.js", ""],

    ["web/vendor.min.js", "minified"],
    ["web/site.min.css", "minified"],
    ["web/admin.js", ""],                            // `min` is a suffix of its own, not of a word

    ["dist/app.js.map", "sourcemap"],
    ["src/mapper.js", ""],

    ["ui/fonts/Inter.woff2", "asset"],
    ["docs/diagram.png", "asset"],
    ["ui/icons/logo.svg", "asset"],
    ["lib/libz.so", "asset"],
    ["fixtures/seed.sqlite3", "asset"],
    ["src/Logo.java", ""],                           // an asset EXTENSION, not an asset-ish name
    ["src/png.go", ""],

    [".gitignore", "vendored-name"],          // a node no step can ever act on — run 615192d7 vs dc415b95
    ["src/main/docker/.dockerignore", "vendored-name"],
    [".env", ""],                             // …but the spine's own files stay: this one is configuration
    [".editorconfig", ""],
    ["mvnw", "vendored-name"],
    ["package-lock.json", "vendored-name"],
    ["go.sum", "vendored-name"],
    ["package.json", ""],                            // the manifest is the spine's, not the lock's
    ["go.mod", ""],
  ]
  for (const [path, why] of cases) {
    assert.equal(whySkipped(path), why, path)
    assert.equal(skipFile(path), why !== "", path)
  }
})

test("harness inputs are the CALLER's list, not this module's — and they are named as such", () => {
  const extra = new Set(["TASK.md", "izi.config.json"])
  assert.equal(whySkipped("TASK.md", extra), "harness-input")
  assert.equal(whySkipped("TASK.md"), "")            // without the caller's list it is an ordinary file
  assert.equal(whySkipped("README.md", extra), "")
})
