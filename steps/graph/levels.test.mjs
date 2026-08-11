// Slice `graph`: the architecture computed from edges — a PURE core. Formula: 1 happy + Σ antecedent
// branches with a DISTINGUISHABLE consequent — a cycle (no level is defined, and it must not eat the
// acyclic part) and totality. The happy path is the LIVE form
// /tmp/quarkus-rest-json-app-v2-t1-3, so the numbers here are the ones a real run produced.

import test from "node:test"
import assert from "node:assert/strict"
import { newLevels } from "./levels.mjs"

const M = "src/main/java/org/acme/rest/json"
const T = "src/test/java/org/acme/rest/json"
const W = "src/main/resources/META-INF/resources"

// Every node of the live form's survey cell, and every edge `graph-computed.xml` carried plus the two
// `<use>` edges step 5 resolves into providers.
const NODES = [
  `${M}/Fruit.java`, `${M}/FruitResource.java`, `${M}/Legume.java`, `${M}/LegumeResource.java`,
  `${M}/LoggingFilter.java`,
  `${T}/FruitResourceIT.java`, `${T}/FruitResourceTest.java`,
  `${T}/LegumeResourceIT.java`, `${T}/LegumeResourceTest.java`,
  `${W}/fruits.html`, `${W}/legumes.html`,
  "src/main/docker/Dockerfile.jvm", "src/main/docker/Dockerfile.native",
]
const EDGES = [
  { from: `${M}/FruitResource.java`, to: `${M}/Fruit.java` },
  { from: `${M}/LegumeResource.java`, to: `${M}/Legume.java` },
  { from: `${T}/FruitResourceIT.java`, to: `${T}/FruitResourceTest.java` },
  { from: `${T}/LegumeResourceIT.java`, to: `${T}/LegumeResourceTest.java` },
  { from: `${W}/fruits.html`, to: `${M}/FruitResource.java` },
  { from: `${W}/legumes.html`, to: `${M}/LegumeResource.java` },
  { from: `${T}/FruitResourceTest.java`, to: `${M}/FruitResource.java` },
  { from: `${T}/LegumeResourceTest.java`, to: `${M}/LegumeResource.java` },
]

test("happy: the live form falls into slices and layers of subordination, and coupling is a number", () => {
  const g = newLevels({ nodes: NODES, edges: EDGES })

  // Two slices, and NOBODY declared them — they are computed from what calls what. This is what
  // makes step 6 able to land a requirement instead of scanning a flat list.
  assert.deepEqual(g.components.map((c) => c.id), ["c1", "c2"])
  assert.deepEqual(g.components.map((c) => c.modules), [5, 5])
  assert.equal(g.component[`${M}/FruitResource.java`], g.component[`${W}/fruits.html`])
  assert.notEqual(g.component[`${M}/FruitResource.java`], g.component[`${M}/LegumeResource.java`])

  // The orphans are a DIFFERENT fact, not a slice of one: three modules nothing calls and that call
  // nothing. Calling each of them a component would give a real repository hundreds of "slices".
  assert.deepEqual(g.isolated, [`${M}/LoggingFilter.java`, "src/main/docker/Dockerfile.jvm", "src/main/docker/Dockerfile.native"].sort())
  assert.equal(g.component[`${M}/LoggingFilter.java`], "")

  // Four levels: UI and integration tests on top, the resource as the hub, the model at the bottom.
  assert.equal(g.level[`${W}/fruits.html`], 1)
  assert.equal(g.level[`${T}/FruitResourceIT.java`], 1)
  assert.equal(g.level[`${T}/FruitResourceTest.java`], 2)
  assert.equal(g.level[`${M}/FruitResource.java`], 3)  // longest path, not shortest: via the test, not the page
  assert.equal(g.level[`${M}/Fruit.java`], 4)
  assert.equal(Math.max(...Object.values(g.level)), 4)

  // Coupling: the resource is the hub of its slice, and that is why a delta on it ripples widest.
  assert.equal(g.fanin[`${M}/FruitResource.java`], 2)
  assert.equal(g.fanout[`${M}/FruitResource.java`], 1)
  assert.equal(g.fanin[`${M}/LoggingFilter.java`], 0)
  assert.equal(g.fanout[`${M}/LoggingFilter.java`], 0)

  // Heads of a slice = its entry points. For the isolated component every node is its own head.
  assert.deepEqual(g.components[0].heads.length, 2)
  assert.deepEqual(g.cycle, [])
})

test("a cycle: no level is defined there, it is DATA — and the acyclic part is still layered", () => {
  // Circular dependencies are legal in java; a terminal refusal here would stop the pipeline on a
  // healthy repository. Kahn gives the detection for free: what the layers did not peel is the cycle.
  const g = newLevels({
    nodes: ["a.java", "b.java", "c.java", "solo.java"],
    edges: [{ from: "a.java", to: "b.java" }, { from: "b.java", to: "a.java" },
            { from: "solo.java", to: "c.java" }],
  })
  assert.deepEqual(g.cycle, ["a.java", "b.java"])
  assert.equal(g.level["a.java"], 0)          // 0 means "not defined", never "the first level"
  assert.equal(g.level["b.java"], 0)
  assert.equal(g.level["solo.java"], 1)       // the healthy part keeps its layering
  assert.equal(g.level["c.java"], 2)
  assert.equal(g.component["a.java"], g.component["b.java"])
})

test("totality: no nodes, a dangling edge and undefined — empty tables, never a throw", () => {
  assert.deepEqual(newLevels().components, [])
  assert.deepEqual(newLevels({}).cycle, [])

  // An edge onto a path that is not a node of this graph is the CALLER's business to declare (a
  // library outside the run's tree, a file that went into a <gap>). Crashing here would turn data
  // into a crash; counting it would invent a node.
  const g = newLevels({ nodes: ["a.java"], edges: [{ from: "a.java", to: "vendor/lib.java" }, { from: "a.java", to: "a.java" }] })
  assert.equal(g.fanout["a.java"], 0)
  assert.equal(g.level["a.java"], 1)
  assert.deepEqual(g.components, [])
  assert.deepEqual(g.isolated, ["a.java"])
})
