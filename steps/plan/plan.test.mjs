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
import { parseDesign, parseRoutes } from "../design/design.mjs"
import { forwardLegs } from "../design/routes.mjs"
import { newPlanIndex, TASK_KEY, KEY_QUESTION, GRAMMAR_VERSION } from "./plan.mjs"
import { unitsByPath } from "../design/design.mjs"

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

// The routes of the live t3 design graph, in their live shape: the page navigates to the card, and
// the card calls the resource and comes BACK to itself. Both legs are here on purpose — the return is
// what the forward-only rule exists to ignore.
const ROUTED = `<design mode="minor">
  <module path="${CARD}" delta="Added">
    <role>card page</role>
    <contract in="navigate | Fruit" out="GET /fruits/{id} | rendered card"/>
    <dep path="${RESOURCE}"/>
    <dep path="${FRUIT}"/>
  </module>
  <route scenario="S1" entry="1" steps="${LIST}#1 -> ${CARD}#1"/>
  <route scenario="S2" entry="1" steps="${CARD}#1 -> ${RESOURCE}#1 -> ${CARD}#2"/>
</design>`

const ANSWERED = [{ question: KEY_QUESTION, text: "DOS-42" }]

const run = (over = {}) => newPlanIndex({
  frd: parseFrd(over.frd || FRD),
  map: parseMap(over.map || MAP),
  mode: "mode" in over ? over.mode : "minor",
  design: over.design === null ? null : parseDesign(over.design || DESIGN),
  routes: over.design === null ? [] : parseRoutes(over.design || DESIGN),
  trunk: "trunk" in over ? over.trunk : "main",
  answers: over.answers || ANSWERED,
  edges: over.edges,
  units: "units" in over ? over.units : (over.design === null ? new Map() : unitsByPath(parseDesign(over.design || DESIGN), parseRoutes(over.design || DESIGN))),
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

// S30-0. The map cannot carry an edge INTO a file the change creates — it was built before that file
// existed — so the page ends up ordered before the page it links to. The routes can: they are
// directed by construction. Drop the route pass and this goes red on the very ordering the live t3
// run produced (docs/review.md §2.1).
test("the route's forward leg orders a created module before the node that links to it", () => {
  const withoutRoutes = idsOf(run().value)
  assert.ok(withoutRoutes.indexOf(LIST) < withoutRoutes.indexOf(CARD), "the map alone puts the page first — the defect")

  const order = idsOf(run({ design: ROUTED }).value)
  assert.ok(order.indexOf(CARD) < order.indexOf(LIST), "the card exists before the page links to it")
  assert.ok(run({ design: ROUTED }).value.nodes.find((n) => n.id === LIST).deps.includes(CARD))
})

// The other half of the same rule: a route comes BACK. Taking every consecutive pair would make
// CARD → RESOURCE → CARD a two-node cycle — exactly what disqualified <dep> as the source of order.
test("the RETURN leg of a route is not an edge", () => {
  const r = run({ design: ROUTED })
  assert.equal(r.ok, true, r.ok ? "" : r.error.detail)
  assert.deepEqual(r.value.nodes.find((n) => n.id === RESOURCE).deps.filter((d) => d === CARD), [], "the return does not order the callee after its caller")
  assert.ok(idsOf(r.value).indexOf(RESOURCE) < idsOf(r.value).indexOf(CARD), "the callee still comes first")
})

// D17. The defect live run f7bf154a died on, reproduced HERE — this is the step that names it, and
// that is the whole problem: `cycle` is a refusal on a step with no role, no operator and no repair
// rail, so the band ends holding a diagnosis nobody can act on. The route below is the live shape:
// rule 7 of step 9 demanded a branch be walked, no FRD scenario exercised it, and pass C took it by
// handing the value to the node that CALLS this one. The map already says `LIST -> RESOURCE`.
//
// Step 9's rule 9 now refuses that set of routes BEFORE it reaches here (steps/design/routes.mjs), and
// it refuses it by `forwardLegs` — the very function this module orders by. These two tests are what
// keep the two ends honest: the first proves this step still dies on the inverted route, the second
// proves the way out step 9 offers the role actually reaches a plan.
const INVERTING = ROUTED.replace("</design>", `  <route scenario="S3" entry="1" steps="${RESOURCE}#1 -> ${LIST}#1"/>\n</design>`)
const SHORTENED = ROUTED.replace("</design>", `  <route scenario="S3" entry="1" steps="${RESOURCE}#1"/>\n</design>`)

test("a route asserting the direction the map already declares closes the order — the f7bf154a refusal", () => {
  const r = run({ design: INVERTING })
  assert.equal(r.ok, false)
  assert.equal(r.error.cls, "cycle")
  assert.match(r.error.detail, new RegExp(`${RESOURCE}|${LIST}`))
})

test("the way out of rule 9 reaches a plan: a route that ENDS on the node that produced the value", () => {
  const r = run({ design: SHORTENED })
  assert.equal(r.ok, true, r.ok ? "" : r.error.detail)
  // …and it added no edge at all: a one-step route has no forward leg to assert.
  assert.deepEqual(r.value.nodes.find((n) => n.id === RESOURCE).deps.filter((d) => d === LIST), [])
})

// The order this step builds comes from ONE derivation, and step 9's rule 9 promises "this will sort"
// by calling the same function. Re-inline the loop in plan.mjs and the promise becomes a promise about
// a different graph — this test is what notices.
test("plan orders by forwardLegs itself — one derivation, two callers", () => {
  const r = run({ design: ROUTED })
  assert.equal(r.ok, true, r.ok ? "" : r.error.detail)
  const legs = forwardLegs(parseRoutes(ROUTED))
  assert.ok(legs.length, "фикстура обязана нести хотя бы один прямой участок")
  for (const l of legs) {
    assert.ok(r.value.nodes.find((n) => n.id === l.from).deps.includes(l.to), `${l.from} → ${l.to}`)
  }
})

// D18c. Run 53592269 shipped four false flows in `data-flow.md`, and NONE of them reached the plan —
// the scenario nodes here are cut from the FRD's `<scenario>` rows, not from the routes. That held by
// construction and by nothing else: no test said so, and the next person to source a scenario node
// from the design would have removed the only thing keeping a lie out of the tickets. It is a seam
// now. Source `frd.scenarios` from `routes` in plan.mjs and this goes red.
test("a flow the FRD does not declare produces no plan node — the routes never become work", () => {
  const invented = ROUTED.replace("</design>", `  <route scenario="S9invented" entry="1" steps="${RESOURCE}#1"/>\n</design>`)
  const r = run({ design: invented })
  assert.equal(r.ok, true, r.ok ? "" : r.error.detail)
  assert.deepEqual(idsOf(r.value).filter((id) => id.startsWith("scenario:")), ["scenario:S1", "scenario:S2"])
  assert.equal(idsOf(r.value).includes("scenario:S9invented"), false, "маршрут вне FRD не становится работой")
})

// S30e. A blocker of step 11 whose two ends the guardrail resolved to plan ids IS an edge, and the
// script applies it — no role is re-delegated for a repair that is a substitution (docs/review.md §6).
test("an edge asserted by the critic reorders the plan, and one that closes it is named apart", () => {
  const fixed = run({ edges: [{ from: LIST, to: CARD }] })
  assert.equal(fixed.ok, true, fixed.ok ? "" : fixed.error.detail)
  assert.ok(idsOf(fixed.value).indexOf(CARD) < idsOf(fixed.value).indexOf(LIST), "the asserted edge is what ordered them")

  const closed = run({ edges: [{ from: LIST, to: CARD }, { from: CARD, to: LIST }] })
  assert.equal(closed.ok, false)
  assert.equal(closed.error.cls, "cycle-from-review", "a cycle the REVIEW made is not the repository's cycle")
  assert.match(closed.error.detail, /fruit-card\.html/)

  // an edge naming something outside the plan is ignored, not a crash: the guardrail already refused
  // such a blocker (R3/R4), and this core stays total
  assert.equal(run({ edges: [{ from: LIST, to: "nowhere.java" }, null] }).ok, true)
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

// --- R-shippable: тикет режется из ПЛАНА, значит сдаточное знание обязано лежать в плане ----------
//
// Живой прогон d8ef8c60 (форма quarkus-rest-json-app-v2-t2) сдал план, по которому работу нельзя
// СДАТЬ: у узла ресурса команда `mvn test -Dtest=FruitResourceTest` зелена ДО работы (в классе только
// testList/testAdd), а какие тесты причитаются — знал шаг 9 и не передал; узел страницы приехал с
// `delta: []` и не сказал исполнителю ничего, хотя FRD объявлял работу дословно в `<touched why>`.
// Оба факта уже лежали на диске. Убери любой перенос — соответствующий тест краснеет.
test("dod узла — юниты его пути, перенесённые из шага 9, а не посчитанные заново", () => {
  const r = run({ design: ROUTED })
  assert.equal(r.ok, true, r.ok ? "" : r.error.detail)
  const units = unitsByPath(parseDesign(ROUTED), parseRoutes(ROUTED))
  for (const n of r.value.nodes) {
    if (n.kind !== "code") continue
    assert.deepEqual(n.dod, [...(units.get(n.id) || [])], n.id)
  }
  // У узла, через который идут маршруты, DoD непустой — иначе тикет закрывать нечем.
  assert.ok(r.value.nodes.find((n) => n.id === CARD).dod.length > 0)
})

test("шаг 9 пропущен ⇒ dod: [] и узел жив — объявлено, а не домыслено", () => {
  const r = run({ design: null })
  assert.equal(r.ok, true, r.ok ? "" : r.error.detail)
  for (const n of r.value.nodes) if (n.kind === "code") assert.deepEqual(n.dod, [])
})

test("узел ширины несёт why из <touched> — он не немой даже без delta", () => {
  const r = run({ design: ROUTED })
  const pojo = r.value.nodes.find((n) => n.id === FRUIT)
  assert.deepEqual(pojo.delta, [], "у этого узла дельты нет — ровно случай fruits.html прогона d8ef8c60")
  assert.equal(pojo.why, "поле cardUrl", "работа названа FRD в <touched why> и обязана доехать до тикета")
  // А узел, названный дельтой, why не требует: его работа уже в delta.
  assert.equal(typeof r.value.nodes.find((n) => n.id === RESOURCE).why, "string")
})

test("новые поля не породили новых узлов: состав и порядок прежние, grammar поднята", () => {
  const r = run({ design: ROUTED })
  assert.deepEqual(idsOf(r.value), [FRUIT, RESOURCE, CARD, LIST, "scenario:S1", "scenario:S2"])
  assert.equal(r.value.index.grammar, GRAMMAR_VERSION)
  assert.equal(GRAMMAR_VERSION, 2, "форма артефакта расширена — версия поднята в том же изменении")
})
