// Slice `intake`, the map reader: node keys and the price of handing the map to a role. PURE core;
// formula 1 happy + Σ antecedent branches. The ceiling branch is here because it DECIDES a rail (the
// step refuses above it) — not because a synthetic fixture can reach it.

import test from "node:test"
import assert from "node:assert/strict"
import { parseMap, mapMeasure, MAP_CAP_BYTES } from "./map.mjs"

// Both shapes of the grammar step 5 writes: a node with a body (it has declarations) and a
// self-closing one (it has none).
const MAP = `<appgraph grammar="3" modules="2">
  <suite id="unit" kind="unit" cmd="mvn test" one="-Dtest={class}" path="src/test/java" match="*Test.java"/>
  <module path="src/ParcelResource.java" level="3" fanin="1" fanout="1">
    <role>REST-ресурс посылок</role>
    <api name="GET /parcels" kind="http" scope="public" via="@GET public Set&lt;Parcel&gt; list()"/>
  </module>
  <module path="src/Parcel.java" level="4" fanin="1" fanout="0"/>
  <module path="src/test/ParcelResourceTest.java" kind="test" suite="unit" level="2" fanin="1" fanout="1">
    <role>юнит-тест ресурса посылок</role>
  </module>
  <edge from="src/ParcelResource.java" to="src/Parcel.java" via="private Set&lt;Parcel&gt; parcels"/>
</appgraph>`

test("happy: every module is a key, and nothing else is", () => {
  const { nodes, count } = parseMap(MAP)
  assert.equal(count, 3)
  assert.deepEqual([...nodes], ["src/ParcelResource.java", "src/Parcel.java", "src/test/ParcelResourceTest.java"])
  // An edge names paths too — and is not a node. A `from=`/`to=` counted as a key would let a touched
  // resolve against an edge and F2 would pass a path the map never declared as a module.
  assert.equal(nodes.has("src/Parcel.java"), true)
  assert.equal(nodes.size, 3)
})

// Live run 1d804798: the FRD carried a delta on the test file beside the one on its module, and
// passed — the path does resolve to a node. A test is the DoD of a change, not a change; the rule
// that says so needs to know WHICH nodes are tests.
test("a test node is a node AND is listed as a test — F2/F3 judge by this set", () => {
  const { nodes, tests } = parseMap(MAP)
  assert.deepEqual([...tests], ["src/test/ParcelResourceTest.java"])
  assert.equal(nodes.has("src/test/ParcelResourceTest.java"), true) // still a node: the map declares it
  assert.equal(tests.has("src/ParcelResource.java"), false)
})

test("parse is total: garbage, undefined and an empty map yield no keys, never a throw", () => {
  for (const bad of [undefined, null, "", "<appgraph>", "не xml"]) assert.equal(parseMap(bad).count, 0)
})

test("measure: bytes are UTF-8, not characters — the map's <role> texts are Cyrillic", () => {
  const m = mapMeasure(MAP)
  assert.equal(m.nodes, 3)
  assert.ok(m.bytes > MAP.length, "Cyrillic must cost more bytes than characters")
  assert.equal(m.overCap, false)
})

test("above the ceiling the measurement says so — the step refuses instead of degrading silently", () => {
  const big = MAP + "\n" + "<!-- ".repeat(MAP_CAP_BYTES / 5 + 1)
  const m = mapMeasure(big)
  assert.equal(m.overCap, true)
  assert.ok(m.bytes > MAP_CAP_BYTES)
  // The cap is a number with a live source: 32K tokens ≈ 115 KB (docs/concept.md), and 417 B/node
  // measured on run c166bd87 (docs/graph.md §7) makes that ≈306 nodes.
  assert.equal(MAP_CAP_BYTES, 115 * 1024)
})
