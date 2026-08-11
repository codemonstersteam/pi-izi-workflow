// Slice `scope`: the edges a SCRIPT computes — a PURE core (its io is ext/index.mjs::survey, proven
// by a live run). Formula: 1 happy per rule set + the branches whose consequent must be
// DISTINGUISHABLE — a library that is not an edge, a base-name collision that must REFUSE rather than
// pick, and a language with no rules that must SAY SO. The last two are the whole point of backlog
// W4b: without them "no edges" is indistinguishable from a broken regex (run 337b957f).

import test from "node:test"
import assert from "node:assert/strict"
import { readSource } from "./source.mjs"
import { newEdges } from "./edges.mjs"

const build = (files, goModule = "") => {
  const paths = files.map(([path]) => path)
  const sources = files.map(([path, text]) => readSource({ path, text }))
  return newEdges({ sources, paths, goModule })
}

test("java: package = directory; a same-package reference is an edge with no import line at all", () => {
  const r = build([
    ["src/main/java/org/acme/FruitResource.java", `
      package org.acme;
      import jakarta.ws.rs.GET;
      import org.acme.Fruit;
      public class FruitResource { }`],
    ["src/main/java/org/acme/Fruit.java", "package org.acme;\npublic class Fruit { }"],
    ["src/test/java/org/acme/FruitResourceTest.java", "package org.acme;\npublic class FruitResourceTest { }"],
    ["src/test/java/org/acme/FruitResourceIT.java", "package org.acme;\npublic class FruitResourceIT extends FruitResourceTest { }"],
  ])

  // Exactly the two edges of the quarkus form that the backlog named as this stage's gate — and no framework one.
  assert.deepEqual(r.edges.map((e) => `${e.from} -> ${e.to}`), [
    "src/main/java/org/acme/FruitResource.java -> src/main/java/org/acme/Fruit.java",
    "src/test/java/org/acme/FruitResourceIT.java -> src/test/java/org/acme/FruitResourceTest.java",
  ])
  assert.equal(r.edges[0].via, "import org.acme.Fruit;")      // the evidence is the line, not a paraphrase
  assert.equal(r.edges[1].via, "public class FruitResourceIT extends FruitResourceTest { }")
  assert.deepEqual(r.ambiguous, [])
})

test("base-name collision: two Model.java — a refusal with evidence, never a coin flip", () => {
  const r = build([
    ["a/src/main/java/org/acme/Api.java", "package org.acme;\nimport org.acme.Model;\nclass Api {}"],
    ["a/src/main/java/org/acme/Model.java", "package org.acme;\nclass Model {}"],
    ["b/src/main/java/org/acme/Model.java", "package org.acme;\nclass Model {}"],
  ])
  // No edges at all: two `Model.java` are indistinguishable by package tail, and picking one is not
  // allowed. Nor does either `Model.java` get an edge onto the OTHER: its own name is not a reference.
  assert.deepEqual(r.edges, [])
  // One unresolvable target set is one refusal, though it arrived both from an import and from a body reference.
  assert.equal(r.ambiguous.length, 1)
  assert.equal(r.ambiguous[0].spec, "org.acme.Model")
  assert.equal(r.ambiguous[0].candidates.length, 2)
})

test("go by go.mod, ts by relative path; an import outside the repository never becomes an edge", () => {
  const go = build([
    ["cmd/api/main.go", `package main
      import (
        "fmt"
        "github.com/acme/svc/internal/store"
      )`],
    ["internal/store/store.go", "package store"],
    ["internal/store/store_test.go", "package store"],
  ], "github.com/acme/svc")
  assert.deepEqual(go.edges.map((e) => e.to), ["internal/store/store.go"])   // a _test.go is never a target
  assert.equal(go.edges[0].via, 'import "github.com/acme/svc/internal/store"')

  const ts = build([
    ["web/src/app.ts", `import axios from "axios"\nimport { tax } from "./billing/tax"\nimport { fmt } from "../util"`],
    ["web/src/billing/tax.ts", "export const tax = 1"],
    ["web/util.ts", "export const fmt = 1"],
  ])
  assert.deepEqual(ts.edges.map((e) => e.to), ["web/src/billing/tax.ts", "web/util.ts"])  // axios is not a file
})

test("a language with no rules is DECLARED: \"zero edges\" and \"no rules\" are different facts", () => {
  const r = build([
    ["src/Main.kt", "package org.acme\nimport org.acme.Fruit"],
    ["src/Fruit.kt", "package org.acme"],
    ["Makefile", "all:\n\techo hi"],
  ])
  assert.deepEqual(r.edges, [])
  assert.deepEqual(r.langs, [
    { lang: "(unknown)", rules: false, files: 1 },
    { lang: "kotlin", rules: false, files: 2 },
  ])

  // The same for a language whose rule EXISTS but does not apply: go without go.mod says so too.
  const go = build([["cmd/main.go", 'package main\nimport "x/y"']])
  assert.deepEqual(go.langs, [{ lang: "go", rules: false, files: 1 }])
})
