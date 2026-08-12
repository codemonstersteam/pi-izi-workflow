// Slice `ripple`: step 8's pure core — the design flag and the subgraph handed to step 9. Its io
// lives in ext/index.mjs (standards/code.md: an io pipe is not unit-tested). Formula: 1 happy + Σ
// antecedent branches with a DISTINGUISHABLE consequent, and every branch built by REINTRODUCING the
// defect the concept named (docs/ripple.md §2, discrepancies A, B and C).

import test from "node:test"
import assert from "node:assert/strict"
import { newRipple, DESIGN_TABLE } from "./ripple.mjs"
import { parseMap } from "../intake/map.mjs"
// The CONSUMER's parser, imported by the test and never by the module: `ripple.xml` is written for
// step 9, so the cheapest proof that the two agree on the grammar is to read this file's output with
// the code that will read it for real (steps/design/design.mjs::parseDesign).
import { parseDesign } from "../design/design.mjs"

// Fixture: parcels, a different domain from any live input — a fixture indistinguishable from live
// input stops testing the code. The shape is what the live map has: a chain of four modules, a
// frontend calling the resource, and a test bound to its module both by an edge and by <test>.
const MAP_XML = `<appgraph grammar="3" modules="6">
  <suite id="unit" kind="unit" cmd="mvn test" one="-Dtest={class}" path="src/test" match="*Test.java"/>
  <module path="src/ui/parcels.html" component="c1" level="1" fanin="0" fanout="1">
    <role>страница поиска посылок</role>
  </module>
  <module path="src/ParcelResource.java" pkg="acme.parcel" component="c1" level="3" fanin="2" fanout="1">
    <role>REST-ресурс посылок</role>
    <api name="GET /parcels" kind="http" scope="public" via="@GET public Set&lt;Parcel&gt; list()"/>
    <test path="src/test/ParcelResourceTest.java" suite="unit"/>
  </module>
  <module path="src/ParcelRepo.java" pkg="acme.parcel" component="c1" level="4" fanin="1" fanout="1">
    <role>хранилище посылок</role>
  </module>
  <module path="src/Db.java" pkg="acme.db" component="c1" level="5" fanin="1" fanout="0"/>
  <module path="src/Unrelated.java" level="1" fanin="0" fanout="0"/>
  <module path="src/test/ParcelResourceTest.java" kind="test" suite="unit" component="c1" level="2" fanin="0" fanout="1">
    <role>юнит-тест ресурса посылок</role>
  </module>
  <edge from="src/ui/parcels.html" to="src/ParcelResource.java" via="url: '/parcels'" by="use"/>
  <edge from="src/ParcelResource.java" to="src/ParcelRepo.java" via="private ParcelRepo repo"/>
  <edge from="src/ParcelRepo.java" to="src/Db.java" via="private Db db"/>
  <edge from="src/test/ParcelResourceTest.java" to="src/ParcelResource.java" via=".when().get(&quot;/parcels&quot;)" by="use"/>
</appgraph>`

const MAP = parseMap(MAP_XML)
const RESOURCE = "src/ParcelResource.java"
const REPO = "src/ParcelRepo.java"

const frd = (over = {}) => ({
  deltas: [{ op: "GET /parcels", form: "Added", node: RESOURCE }],
  touched: [RESOURCE],
  scenarios: [{ id: "S1", nodes: RESOURCE }],
  ...over,
})

const build = (over = {}, mode = "minor", cap) =>
  newRipple({ xml: MAP_XML, frd: frd(over), mode, map: MAP, cap })

test("happy: a moved contract orders a design, and the subgraph is the node with its direct neighbours", () => {
  const r = build()
  assert.equal(r.ok, true)

  const v = r.value
  // A moved contract always earns a design: keeping contracts consistent is what step 9 is FOR, and
  // the weight answers a different question entirely (docs/ripple.md §3).
  assert.equal(v.design, "needed")
  assert.deepEqual([...v.seeds], [RESOURCE])
  assert.deepEqual([...v.nodes], ["src/ui/parcels.html", RESOURCE, REPO])   // map's own order
  assert.equal(v.nodes.includes("src/Db.java"), false, "radius 1: a neighbour's neighbour is out")
  assert.equal(v.nodes.includes("src/Unrelated.java"), false)

  // Discrepancy C: a test is never a node of the ripple — it rides inside its module, where the map
  // already bound it, and step 10 takes both the file and the check command from there.
  assert.equal(v.xml.includes("<module path=\"src/test/ParcelResourceTest.java\""), false)
  assert.match(v.xml, /<test path="src\/test\/ParcelResourceTest.java" suite="unit"\/>/)

  // The consumer reads what we wrote: nodes with their deps, in the grammar checkDesign judges.
  const seen = parseDesign(v.xml)
  assert.deepEqual([...seen.keys()], ["src/ui/parcels.html", RESOURCE, REPO])
  assert.deepEqual(seen.get(RESOURCE).deps, ["src/ui/parcels.html", REPO])
  assert.deepEqual(seen.get("src/ui/parcels.html").deps, [RESOURCE])

  // fanin/fanout of the FULL graph beside a list cut to radius 1 would be two places for one fact;
  // what the radius hid is said by `cut` instead — one for the repo, whose Db neighbour is out.
  assert.equal(/fanin=|fanout=/.test(v.xml), false)
  assert.match(v.xml, new RegExp(`<module path="${REPO}"[^>]*cut="1"`))
  assert.equal(/cut=/.test(v.xml.split(REPO)[0]), false, "a node hiding nothing carries no cut")
  assert.match(v.xml, /^<ripple grammar="1" mode="minor" seeds="1" nodes="3">/)
  assert.match(v.xml, new RegExp(`<module path="${RESOURCE}" seed="yes" pkg="acme.parcel"`))
})

test("the flag is the table and the WIDTH — every row of docs/ripple.md §3 is reachable", () => {
  const two = { deltas: [...frd().deltas, { op: "findByTrack", form: "Added", node: REPO }], touched: [RESOURCE, REPO] }

  assert.equal(build().value.design, "needed")                            // minor, one node
  assert.equal(build(two).value.design, "needed")                         // minor, two nodes
  assert.equal(build({}, "major").value.design, "needed")                 // major, one node
  // `patch` is the one row the width decides: the contract does not move, so a single node has
  // nothing to synchronise with — while a fix spread over modules still cuts into two tickets that
  // must not drift apart (docs/ripple.md §3, the operator's rule).
  assert.equal(build({}, "patch").value.design, "skip")                   // patch, one node
  assert.equal(build(two, "patch").value.design, "needed")                // patch, two nodes
  assert.deepEqual(Object.keys(DESIGN_TABLE), ["major", "minor", "patch"])
})

// The regression of live run c4b7cea5 (sandbox/runbox/quarkus-rest-json-app-v2-t2): ONE delta on the
// resource and a second node — the page — touched but deltaless, because a page has no contract of
// its own to move. Counting delta nodes gave `skip`, and the two sides of that very joint were left
// to agree by luck. The WIDTH is the touched nodes; this case reddens the moment it is not.
test("width is the TOUCHED nodes: one delta, two touched, contract unmoved → a design is ordered", () => {
  const spread = {
    deltas: [{ op: "fix double counting", form: "Fixed", node: RESOURCE }],
    touched: [RESOURCE, "src/ui/parcels.html"],
    scenarios: [{ id: "S1", nodes: `src/ui/parcels.html ${RESOURCE}` }],
  }
  assert.equal(build(spread, "patch").value.design, "needed")
})

test("a node a scenario merely passes through is IN the subgraph — step 9 has no other source for it", () => {
  // The repo carries no delta and is not touched; the scenario names it, so the route of step 9 will
  // step through it and checkDesign rule 1 will demand its contract, which the role copies from here.
  const r = newRipple({
    xml: MAP_XML,
    frd: { deltas: [{ op: "GET /parcels", form: "Added", node: RESOURCE }], touched: [], scenarios: [{ id: "S1", nodes: `${RESOURCE} ${REPO}` }] },
    mode: "patch",
    map: MAP,
  })
  assert.equal(r.ok, true)
  assert.deepEqual([...r.value.seeds], [RESOURCE, REPO])
  // The repo is a SEED (the route runs through it) but not WIDTH: the change does not touch it, so
  // it is context for the designer, not a ticket. Counting seeds instead of touched would order a
  // design here on a one-node fix.
  assert.equal(r.value.design, "skip")
})

// The module the change CREATES: declared at step 6 as `<delta new="yes">` (F3n) and absent from the
// map by definition. Reintroducing the defect — dropping the `created` filter — turns this red with
// `unknown-node`, which is exactly how the band died in live run b857d4a0, one step earlier.
const CARD = "src/ui/parcel-card.html"

test("a module this change creates is not a missing node and not a seed — there is nothing to cut around it", () => {
  const r = build({
    deltas: [{ op: "GET /parcels", form: "Added", node: RESOURCE }, { op: "card page", form: "Added", node: CARD, new: "yes" }],
    touched: [RESOURCE, CARD],
    scenarios: [{ id: "S1", nodes: RESOURCE }, { id: "S2", nodes: `${CARD} ${RESOURCE}` }],
  })
  assert.equal(r.ok, true)
  assert.equal(r.value.design, "needed")
  // The subgraph is cut around what EXISTS; the new page is in neither the seeds nor the nodes, and
  // step 9 reads it out of the FRD its order carries whole.
  assert.equal(r.value.nodes.includes(CARD), false)
  assert.deepEqual(r.value.seeds, [RESOURCE])
})

test("a change that ONLY adds modules: an empty subgraph is a legal state, not a refusal", () => {
  const r = build({
    deltas: [{ op: "card page", form: "Added", node: CARD, new: "yes" }],
    touched: [CARD],
    scenarios: [{ id: "S1", nodes: CARD }],
  })
  assert.equal(r.ok, true)
  assert.equal(r.value.design, "needed")   // minor: the contract grew, and the new module has two sides
  assert.deepEqual(r.value.nodes, [])
  assert.match(r.value.xml, /^<ripple grammar="1" mode="minor" seeds="0" nodes="0">/)
})

test("refusals are data: no weight, a foreign weight, nothing to ripple from, a path the map denies, a subgraph too big", () => {
  const cls = (r) => (r.ok ? "ok" : r.error.cls)

  assert.equal(cls(newRipple({ xml: MAP_XML, frd: frd(), mode: "", map: MAP })), "no-mode")
  assert.equal(cls(newRipple({ xml: MAP_XML, frd: frd(), mode: "huge", map: MAP })), "bad-mode")
  assert.equal(cls(build({ deltas: [] })), "no-delta")
  // A delta on a test node: step 6 forbids it (F2/F3), and an frd.xml older than that rule still
  // reaches this core — which then has no module to ripple from.
  assert.equal(cls(build({ deltas: [{ op: "x", form: "Added", node: "src/test/ParcelResourceTest.java" }], touched: [], scenarios: [] })), "no-delta")
  assert.equal(cls(build({ touched: ["src/Invented.java"] })), "unknown-node")
  // The ceiling is a parameter with the map's own default, so this branch is reached by an argument
  // rather than by a synthetic repository — a seam no code change can redden is a comment.
  assert.equal(cls(build({}, "minor", 200)), "over-cap")
  assert.match(newRipple({ xml: MAP_XML, frd: frd(), mode: "minor", map: MAP, cap: 200 }).error.detail, /выше потолка чтения 200 Б/)
})

test("total on garbage: no argument at all is a refusal, never a throw", () => {
  for (const bad of [undefined, {}, { mode: "minor" }, { mode: "minor", frd: {}, map: {} }]) {
    const r = newRipple(bad)
    assert.equal(r.ok, false)
    assert.ok(r.error.cls.length > 0)
  }
})
