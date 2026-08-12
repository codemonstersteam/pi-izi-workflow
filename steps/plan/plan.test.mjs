// Units for steps/plan/plan.mjs — one per rule that can degrade silently (docs/plan.md §11).
//
// The fixture is COPIED from the live artifacts of runbox/quarkus-rest-json-app-v2-t3 (the run of
// steps 1-9 that this slice was designed against), not invented: step 9 already paid for a fixture
// written from the head — its core was built before its input existed and disagreed with it in three
// places (docs/design.md, header).
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { parseMap } from "../intake/map.mjs"
import { parseFrd } from "../intake/frd.mjs"
import { parseDesign } from "../design/design.mjs"
import { newPlanIndex, TASK_KEY, KEY_QUESTION } from "./plan.mjs"

const RESOURCE = "src/main/java/org/acme/rest/json/FruitResource.java"
const FRUIT = "src/main/java/org/acme/rest/json/Fruit.java"
const LIST = "src/main/resources/META-INF/resources/fruits.html"
const CARD = "src/main/resources/META-INF/resources/fruit-card.html"
const TEST = "src/test/java/org/acme/rest/json/FruitResourceTest.java"
const IT = "src/test/java/org/acme/rest/json/FruitResourceIT.java"

const MAP = `<appgraph grammar="3" modules="5">
  <suite id="unit" kind="unit" cmd="mvn test" one="-Dtest={class}" path="src/test/java" match="*Test.java"/>
  <suite id="component-native" kind="component" cmd="mvn verify -Pnative" one="-Dit.test={class}" path="src/test/java" match="*IT.java"/>
  <toggles found="no"/>
  <branching found="no"/>
  <contract found="no"/>
  <module path="${FRUIT}" level="4"><role>POJO</role></module>
  <module path="${RESOURCE}" level="3">
    <role>JAX-RS resource</role>
    <api name="GET /fruits" kind="http" scope="public"/>
    <test path="${TEST}" suite="unit"/>
    <test path="${IT}" suite="component-native"/>
  </module>
  <module path="${LIST}" level="1"><role>page</role></module>
  <module path="${TEST}" kind="test" suite="unit" level="2"/>
  <module path="${IT}" kind="test" suite="component-native" level="1"/>
  <edge from="${RESOURCE}" to="${FRUIT}" via="private Set&lt;Fruit&gt; fruits"/>
  <edge from="${LIST}" to="${RESOURCE}" via="url: '/fruits'," by="use"/>
  <edge from="${TEST}" to="${RESOURCE}" via=".get(&quot;/fruits&quot;)" by="use"/>
</appgraph>`

const FRD = `<frd grammar="1" goal="карточка фрукта">
  <delta op="GET /fruits/{id}" form="Added" node="${RESOURCE}"/>
  <delta op="GET /fruit-card.html" form="Added" node="${CARD}" new="yes"/>
  <delta op="GET /fruits.html" form="Added" node="${LIST}"/>
  <scenario id="S1" uc="UC1" before="нет" after="есть" nodes="${RESOURCE} ${FRUIT} ${CARD}"/>
  <scenario id="S2" uc="UC2" before="нет" after="есть" nodes="${RESOURCE} ${FRUIT} ${LIST}"/>
  <touched path="${RESOURCE}" why="эндпоинт"/>
  <touched path="${FRUIT}" why="поле cardUrl"/>
  <touched path="${LIST}" why="ссылка"/>
  <touched path="${CARD}" why="новая страница"/>
</frd>`

const DESIGN = `<design mode="minor">
  <module path="${CARD}" delta="Added">
    <role>card page</role>
    <contract in="Fruit" out="rendered card"/>
    <dep path="${RESOURCE}"/>
    <dep path="${FRUIT}"/>
  </module>
</design>`

const ANSWERED = [{ question: KEY_QUESTION, text: "DOS-42" }]

const run = (over = {}) => newPlanIndex({
  frd: parseFrd(over.frd || FRD),
  map: parseMap(over.map || MAP),
  mode: "mode" in over ? over.mode : "minor",
  design: over.design === null ? null : parseDesign(over.design || DESIGN),
  trunk: "trunk" in over ? over.trunk : "main",
  answers: over.answers || ANSWERED,
})

const idsOf = (v) => v.order

test("happy path: the t3 change plans as six nodes, ordered by the MAP's directed edges", () => {
  const r = run()
  assert.equal(r.ok, true, r.ok ? "" : r.error && r.error.detail)
  assert.deepEqual(idsOf(r.value), [FRUIT, RESOURCE, LIST, CARD, "scenario:S1", "scenario:S2"])
  assert.deepEqual(r.value.branch, { task: "DOS-42", name: "feature/DOS-42", base: "main", source: "operator-answer" })
  // the toggle mechanism and the spec are both absent from this repository — declared, never invented
  assert.deepEqual(r.value.gaps, ["toggle", "spec"])
})

// The seam of discrepancy A (docs/plan.md §2): the order comes from the map's DIRECTED edges. The
// design graph's `<dep>` is mutual by construction (the ripple projects every edge both ways), so
// sourcing the order from it gives a cycle on this very fixture — this asserts direction, not merely
// "some order": the used node comes BEFORE its user.
test("order follows the edge direction: a node comes after everything it uses", () => {
  const order = idsOf(run().value)
  assert.ok(order.indexOf(FRUIT) < order.indexOf(RESOURCE), "Fruit before FruitResource")
  assert.ok(order.indexOf(RESOURCE) < order.indexOf(LIST), "FruitResource before fruits.html")
  assert.ok(order.indexOf(CARD) < order.indexOf("scenario:S1"), "the scenario greens last")
})

test("a created module takes its deps from the design graph; without step 9 it has none", () => {
  const withDesign = run().value.nodes.find((n) => n.id === CARD)
  assert.equal(withDesign.new, true)
  assert.deepEqual(withDesign.deps, [RESOURCE, FRUIT])

  const skipped = run({ design: null })
  assert.equal(skipped.ok, true)
  assert.deepEqual(skipped.value.nodes.find((n) => n.id === CARD).deps, [], "no design ⇒ declared empty, not a refusal")
})

// The seam of discrepancy B: three of four code nodes have no <test> of their own and never will.
test("a code node without <test> carries no command and is closed by a scenario", () => {
  const n = run().value.nodes
  const resource = n.find((x) => x.id === RESOURCE)
  assert.deepEqual(resource.check, [
    { suite: "unit", cmd: "mvn test -Dtest=FruitResourceTest" },
    { suite: "component-native", cmd: "mvn verify -Pnative -Dit.test=FruitResourceIT" },
  ])
  for (const id of [FRUIT, LIST, CARD]) {
    const node = n.find((x) => x.id === id)
    assert.deepEqual(node.check, [], `${id} has no command of its own`)
    assert.ok(node.coveredBy.length, `${id} is distinguished by a scenario`)
  }
  // the scenario runs the suites WHOLE — its own test file does not exist yet
  assert.deepEqual(n.find((x) => x.id === "scenario:S1").check, [
    { suite: "unit", cmd: "mvn test" },
    { suite: "component-native", cmd: "mvn verify -Pnative" },
  ])
})

test("an empty `one` means the whole suite, and the suite is named in the node", () => {
  const map = MAP.replace('one="-Dtest={class}"', 'one=""')
  const resource = run({ map }).value.nodes.find((n) => n.id === RESOURCE)
  assert.equal(resource.check[0].cmd, "mvn test", "no per-file form in the repository ⇒ the suite runs whole")
  assert.equal(resource.check[0].suite, "unit")
})

test("a code node with neither a command nor a scenario is uncovered-node", () => {
  const frd = FRD.replace(/<scenario[\s\S]*?\/>\n  <scenario[\s\S]*?\/>/, "")
  const r = run({ frd })
  assert.equal(r.ok, false)
  assert.equal(r.error.cls, "uncovered-node")
  assert.match(r.error.detail, /Fruit\.java/)
})

// The seam of the SECOND finding of live run 03b598c7: the FRD distinguished `fruits.html` with a
// scenario over that one node. A page carries no delta and has no <test> in the map — it cannot close
// itself — so dropping its one-node scenario left it uncoverable and refused the whole plan. Restore
// `if (over.length < 2) continue` and this goes red.
test("a one-node scenario IS a node when that node cannot close itself", () => {
  const frd = FRD.replace(`nodes="${RESOURCE} ${FRUIT} ${LIST}"`, `nodes="${LIST}"`)
  const r = run({ frd })
  assert.equal(r.ok, true, r.ok ? "" : r.error.detail)
  assert.ok(idsOf(r.value).includes("scenario:S2"), "the page has no units of its own — the scenario owns its test")
  assert.deepEqual(r.value.nodes.find((n) => n.id === LIST).coveredBy, ["scenario:S2"])
})

test("a scenario over one code node is not a node; over two it is", () => {
  // S3 is added rather than S1 shrunk: shrinking S1 would strip fruit-card.html of its only cover and
  // the run would legitimately refuse with uncovered-node, testing a different rule than this one.
  const frd = FRD.replace("</frd>", `  <scenario id="S3" uc="UC3" before="нет" after="есть" nodes="${RESOURCE}"/>\n</frd>`)
  const order = idsOf(run({ frd }).value)
  assert.ok(!order.includes("scenario:S3"), "one node ⇒ its own units distinguish it")
  assert.ok(order.includes("scenario:S2"), "two ⇒ nobody owns the test but the scenario")
})

test("the toggle is read off the map: absent ⇒ a gap, present ⇒ a node every delta depends on", () => {
  const map = MAP.replace('<toggles found="no"/>', '<toggles mechanism="quarkus config property fruit.card.enabled"/>')
  const r = run({ map })
  assert.equal(r.ok, true)
  const toggle = r.value.nodes.find((n) => n.id === "toggle")
  assert.equal(toggle.mechanism, "quarkus config property fruit.card.enabled")
  assert.equal(toggle.source, "graph", "the mechanism comes from the repository, not from an answer")
  assert.deepEqual(r.value.gaps, ["spec"])
  // the flag exists before the capability it switches — asserted as the DAG states it, on the nodes
  // that actually depend on it. A node with no delta (Fruit) does not, and ordering it against the
  // toggle would be asserting an edge nobody wrote.
  assert.ok(r.value.nodes.find((n) => n.id === RESOURCE).deps.includes("toggle"))
  const order = idsOf(r.value)
  assert.ok(order.indexOf("toggle") < order.indexOf(RESOURCE), "toggle before every node it switches")
  assert.ok(order.indexOf("toggle") < order.indexOf(CARD))
  // patch never carries a toggle: nothing was added
  assert.deepEqual(run({ map, mode: "patch" }).value.gaps, ["spec"])
})

test("the task key: asked until it matches, and the weight picks the prefix", () => {
  for (const text of ["", "dos-42", "DOS-", "D-1", "DOS42", "DOS-1234567"]) {
    const r = run({ answers: [{ question: KEY_QUESTION, text }] })
    assert.equal(r.ok, false, `"${text}" must not pass`)
    assert.equal(r.error.cls, "ask")
    assert.ok(r.error.detail.startsWith(KEY_QUESTION), "the rail re-asks this value, refused ones carry the reason")
  }
  assert.equal(run({ answers: [] }).error.cls, "ask")
  // the last answer wins — an operator who mistyped answers again
  const fixed = run({ answers: [{ question: KEY_QUESTION, text: "oops" }, { question: KEY_QUESTION, text: "BIL-317" }] })
  assert.equal(fixed.value.branch.name, "feature/BIL-317")
  assert.equal(run({ mode: "patch" }).value.branch.name, "bugfix/DOS-42", "only Fixed deltas ⇒ a bugfix branch")
})

// The seam of live run 03b598c7: a REJECTED answer must produce a DIFFERENT question, or the operator
// is never re-asked. askOperator judges "answered" by the question's text, so re-asking with the same
// string finds the bad answer already on disk, returns without pausing, and the phase spends every
// round in seconds. Restore `err("ask", KEY_QUESTION)` for the rejected branch and this goes red.
test("a rejected answer is re-asked as a NEW question carrying the refused value", () => {
  const bad = run({ answers: [{ question: KEY_QUESTION, text: "T3-1" }] })
  assert.equal(bad.error.cls, "ask")
  assert.notEqual(bad.error.detail, KEY_QUESTION, "the same text again would never reach the operator")
  assert.ok(bad.error.detail.startsWith(KEY_QUESTION), "the stem stays, so the answer still addresses this value")
  assert.match(bad.error.detail, /T3-1/, "the refused value is quoted back")

  // and the answer to THAT re-ask is recognised — the stem is what binds question to answer
  const fixed = run({ answers: [
    { question: KEY_QUESTION, text: "T3-1" },
    { question: bad.error.detail, text: "TASK-3" },
  ] })
  assert.equal(fixed.ok, true, fixed.ok ? "" : fixed.error.detail)
  assert.equal(fixed.value.branch.name, "feature/TASK-3")
})

test("a document is a node with no command and needs no scenario", () => {
  const frd = FRD.replace(`<touched path="${LIST}" why="ссылка"/>`, '<touched path="README.md" why="раздел про карточку"/>')
                 .replace(`<delta op="GET /fruits.html" form="Added" node="${LIST}"/>`, "")
                 .replace(` ${LIST}"`, '"')
  const r = run({ frd })
  assert.equal(r.ok, true, r.ok ? "" : r.error.detail)
  const doc = r.value.nodes.find((n) => n.id === "README.md")
  assert.equal(doc.kind, "doc")
  assert.deepEqual(doc.check, [])
  assert.deepEqual(doc.coveredBy, [], "no scenario, and no uncovered-node either — the gate judges a document")
})

test("refusals: every absence is named, and the core is total", () => {
  assert.equal(newPlanIndex().error.cls, "no-mode")
  assert.equal(run({ mode: "" }).error.cls, "no-mode")
  assert.equal(run({ mode: "MAJOR" }).error.cls, "bad-mode")
  assert.equal(run({ frd: "<frd/>" }).error.cls, "no-width")
  assert.equal(run({ trunk: "" }).error.cls, "no-trunk")
  assert.equal(run({ map: MAP.replace("</appgraph>", `<cycle modules="${RESOURCE} ${FRUIT}"/></appgraph>`) }).error.cls, "cycle")
  const noSuite = run({ map: MAP.replace(/<suite[\s\S]*?\/>\n  <suite[\s\S]*?\/>/, "") })
  // A map with NO suite at all: the scenario has neither its nodes' suites nor the map's, and that is
  // the one case the refusal was written for — step 5 does not release such a map (docs/graph.md).
  assert.equal(noSuite.error.cls, "no-suite")
})

// The seam of the skill: the convention a human reads and the constant that runs are ONE rule
// (standards/code.md §1), held together the way steps/brd/brd.test.mjs holds its role's wording.
test("the key's shape lives in one place: the code and the skill agree", () => {
  const skill = readFileSync(fileURLToPath(new URL("./git-conventions.md", import.meta.url)), "utf8")
  assert.ok(skill.includes(TASK_KEY.source), `steps/plan/git-conventions.md must carry ${TASK_KEY.source} verbatim`)
})
