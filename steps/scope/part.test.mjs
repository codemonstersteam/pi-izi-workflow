// Slice `scope`: the guardrail of step 4 — a PURE core; its io (ext/index.mjs::checkPart) is proven
// by a live run, not by units (standards/code.md). Formula: 1 happy + Σ antecedent branches with a
// DISTINGUISHABLE consequent — here, one happy path per cell kind, totality, and one unit per rule
// that can silently degrade (S1, S2, S4, S6..S10, P1, P3, P4). Rule numbers are docs/scope.md §3.

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { parsePart, checkPart, newPart } from "./part.mjs"

const surveyCell = {
  id: "c1",
  kind: "survey",
  files: [{ path: "src/Api.java" }, { path: "src/Model.java" }, { path: "src/import.sql" }],
}

const SURVEY_XML = `
<part cell="c1" kind="survey">
  <module path="src/Api.java">
    <role>REST endpoint for orders</role>
    <api name="GET /orders" kind="http" scope="public"/>
    <dep path="src/Model.java" via="import com.acme.Model"/>
    <io kind="db" dir="out" system="orders-db" config="spring.datasource.url" target="orders table"/>
    <test path="src/test/ApiTest.java"/>
  </module>
  <module path="src/Model.java" deps="none" io="none" api="none" tests="none">
    <role>plain data record</role>
  </module>
  <gap path="src/import.sql" why="not read: 480 KB of seed data, no module in it"/>
</part>`

const spineCell = { id: "c0", kind: "spine", files: [{ path: "pom.xml" }, { path: "README.md" }] }

const SPINE_XML = `
<part cell="c0" kind="spine">
  <suite id="unit" kind="unit" cmd="./mvnw -q test" one="./mvnw -q test -Dtest={class}" path="src/test/java"/>
  <suite id="component-it" kind="component" cmd="./mvnw -q verify -Pit" one="" path="src/it"/>
  <integration system="orders-db" kind="db" config="spring.datasource.url" value="jdbc:postgresql://db/orders"/>
  <build cmd="./mvnw -q package"/>
  <toggles found="no"/>
  <branching branches="feature/&lt;slug&gt;" commits="conventional-commits"/>
  <contract found="no"/>
</part>`

test("happy survey: modules, gap and edges parsed; part is green", () => {
  const part = parsePart(SURVEY_XML)
  assert.equal(part.cell, "c1")
  assert.equal(part.kind, "survey")
  assert.deepEqual(part.modules.map((m) => m.path), ["src/Api.java", "src/Model.java"])
  assert.deepEqual(part.modules[0].deps, [{ path: "src/Model.java", via: "import com.acme.Model" }])
  assert.deepEqual(part.modules[0].api, [{ name: "GET /orders", kind: "http", scope: "public" }])
  assert.equal(part.modules[0].io[0].system, "orders-db")   // the external system, not a <dep>
  assert.deepEqual(part.modules[0].tests, [{ path: "src/test/ApiTest.java", suite: "" }])
  assert.equal(part.modules[1].depsNone, true) // absence declared, not omitted
  assert.equal(part.modules[1].ioNone, true)   // …of every dimension: edges, external points,
  assert.equal(part.modules[1].apiNone, true)  // …and the exposed surface
  assert.equal(part.gaps[0].path, "src/import.sql")

  assert.deepEqual(checkPart({ part, cell: surveyCell }), [])
  const r = newPart({ xml: SURVEY_XML, cell: surveyCell })
  assert.equal(r.ok, true)
  assert.equal(r.value.modules.length, 2)
})

test("happy spine: five answers, empty `one` and found=\"no\" are valid", () => {
  const part = parsePart(SPINE_XML)
  assert.deepEqual(part.suites.map((s) => s.id), ["unit", "component-it"])
  assert.equal(part.suites[1].one, "") // valid: step 15 runs the whole suite and logs that price
  assert.equal(part.answers.toggles.found, "no")
  assert.equal(part.answers.branching.commits, "conventional-commits")
  assert.deepEqual(checkPart({ part, cell: spineCell }), [])
})

test("totality: garbage parses to an empty part, and C1 refuses it — never a throw", () => {
  const empty = parsePart(undefined)
  assert.deepEqual(empty.modules, [])
  assert.deepEqual(empty.gaps, [])
  assert.equal(empty.cell, "")

  const r = newPart({ xml: "not xml at all", cell: surveyCell })
  assert.equal(r.ok, false)
  assert.equal(r.error.cls, "invalid-part")
  assert.match(r.error.detail, /^C1 c1:/)
})

test("S1: a cell file closed by neither <module> nor <gap> is a blocker", () => {
  const xml = SURVEY_XML.replace(/  <gap[^>]*\/>\n/, "")
  const blockers = checkPart({ part: parsePart(xml), cell: surveyCell })
  assert.deepEqual(blockers, ["S1 c1: file is closed by neither <module> nor <gap> — src/import.sql"])
})

test("S2: a path outside the cell is a blocker — the scout does not pick its own files", () => {
  const xml = SURVEY_XML.replace("src/Model.java\" deps", "src/Other.java\" deps")
  const blockers = checkPart({ part: parsePart(xml), cell: surveyCell })
  assert.ok(blockers.some((b) => b.startsWith("S2 c1: path does not belong to this cell — src/Other.java")))
})

test("S4: a module with neither <dep> nor deps=\"none\" is a blocker; deps=\"none\" is an answer", () => {
  const silent = SURVEY_XML.replace(' deps="none"', "")
  assert.deepEqual(checkPart({ part: parsePart(silent), cell: surveyCell }),
    ['S4 c1: neither <dep> nor deps="none" — src/Model.java'])

  const selfEdge = SURVEY_XML.replace('<dep path="src/Model.java"', '<dep path="src/Api.java"')
  assert.ok(checkPart({ part: parsePart(selfEdge), cell: surveyCell })
    .some((b) => b === 'S4 c1: <dep> points at its own module — src/Api.java'))

  // An edge with no evidence: the run c9580ff8 invented `Fruit → FruitResource` on a POJO with no
  // imports at all, and the invented pair closed a cycle step 10 cannot topologically sort.
  const invented = SURVEY_XML.replace(' via="import com.acme.Model"', "")
  assert.ok(checkPart({ part: parsePart(invented), cell: surveyCell })
    .some((b) => b.startsWith('S4 c1: <dep path="src/Model.java"> has no via')))
})

test("S6/S7: an external point is declared and its form is closed — io=\"none\" is an answer", () => {
  const silent = SURVEY_XML.replace(/\n    <io [^>]*\/>/, "")
  assert.deepEqual(checkPart({ part: parsePart(silent), cell: surveyCell }),
    ['S6 c1: neither <io> nor io="none" — src/Api.java'])

  const invented = SURVEY_XML.replace('kind="db" dir="out"', 'kind="postgres" dir="both"')
  const blockers = checkPart({ part: parsePart(invented), cell: surveyCell })
  assert.ok(blockers.some((b) => b.startsWith('S7 c1: <io kind="postgres">')))
  assert.ok(blockers.some((b) => b.startsWith('S7 c1: <io dir="both">')))

  const homeless = SURVEY_XML.replace(' config="spring.datasource.url" target="orders table"', "")
  assert.ok(checkPart({ part: parsePart(homeless), cell: surveyCell })
    .some((b) => b.startsWith("S7 c1: <io> has neither config nor target")))
})

test("S8: the tests are declared like every other dimension — tests=\"none\" is an answer", () => {
  const silent = SURVEY_XML.replace(/\n    <test [^>]*\/>/, "")
  assert.deepEqual(checkPart({ part: parsePart(silent), cell: surveyCell }),
    ['S8 c1: neither <test> nor tests="none" — src/Api.java'])
})

test("S9/S10: the exposed surface is declared, scoped and canonically named", () => {
  const silent = SURVEY_XML.replace(/\n    <api [^>]*\/>/, "")
  assert.deepEqual(checkPart({ part: parsePart(silent), cell: surveyCell }),
    ['S9 c1: neither <api> nor api="none" — src/Api.java'])

  // The whole point of `scope`: without it the graph cannot answer "what is exposed outward".
  const unscoped = SURVEY_XML.replace(' kind="http" scope="public"', ' kind="http"')
  assert.ok(checkPart({ part: parsePart(unscoped), cell: surveyCell })
    .some((b) => b.startsWith('S10 c1: <api scope="">')))

  const freeform = SURVEY_XML.replace('name="GET /orders"', 'name="orders endpoint"')
  assert.ok(checkPart({ part: parsePart(freeform), cell: surveyCell })
    .some((b) => b.startsWith('S10 c1: <api kind="http"> name must be "METHOD /path"')))
})

test("P1: a missing spine answer is a blocker; suites are answered by <suite> or found=\"no\"", () => {
  const noToggles = SPINE_XML.replace('  <toggles found="no"/>\n', "")
  assert.ok(checkPart({ part: parsePart(noToggles), cell: spineCell })
    .some((b) => b.startsWith("P1 c0: <toggles> is missing or empty")))

  const noSuites = SPINE_XML.replace(/  <suite [^>]*\/>\n/g, "")
  assert.ok(checkPart({ part: parsePart(noSuites), cell: spineCell })
    .some((b) => b.startsWith("P1 c0: no <suite> and no <suites")))

  const declaredAbsent = noSuites.replace("<build", '<suites found="no"/>\n  <build')
  assert.deepEqual(checkPart({ part: parsePart(declaredAbsent), cell: spineCell }), [])
})

test("P4/P5: an integration without its config key, with an invented kind, or declared twice", () => {
  const noKey = SPINE_XML.replace(' config="spring.datasource.url"', "")
  assert.ok(checkPart({ part: parsePart(noKey), cell: spineCell })
    .some((b) => b.startsWith('P4 c0: <integration system="orders-db"> has no config')))

  const invented = SPINE_XML.replace('kind="db"', 'kind="postgres"')
  assert.ok(checkPart({ part: parsePart(invented), cell: spineCell })
    .some((b) => b.startsWith('P4 c0: <integration system="orders-db"> kind="postgres"')))

  const twice = SPINE_XML.replace("  <build", '  <integration system="orders-db" kind="db" config="spring.datasource.username"/>\n  <build')
  assert.ok(checkPart({ part: parsePart(twice), cell: spineCell })
    .some((b) => b === 'P5 c0: duplicate <integration system="orders-db">'))
})

test("P2/P3: a suite without cmd, with an invented kind, with a drifting id, or declared twice", () => {
  const broken = SPINE_XML
    .replace('cmd="./mvnw -q verify -Pit" one="" path="src/it"', 'cmd="" one="" path="src/it"')
    .replace('id="component-it"', 'id="unit"')
  const blockers = checkPart({ part: parsePart(broken), cell: spineCell })
  assert.ok(blockers.some((b) => b === 'P2 c0: <suite id="unit"> has empty cmd'))
  assert.ok(blockers.some((b) => b === 'P3 c0: duplicate <suite id="unit">'))

  // Four live runs named one suite `integ-native`, `integration`, `native-it`, `native-integration`.
  // The kind is now a vocabulary and the id must start with it, so none of those four can recur.
  const inventedKind = SPINE_XML.replace('kind="component"', 'kind="integration"')
  assert.ok(checkPart({ part: parsePart(inventedKind), cell: spineCell })
    .some((b) => b.startsWith('P2 c0: <suite kind="integration">')))

  const drifting = SPINE_XML.replace('id="component-it"', 'id="native-it"')
  assert.ok(checkPart({ part: parsePart(drifting), cell: spineCell })
    .some((b) => b === 'P2 c0: <suite id="native-it"> must start with its kind — "component" or "component-<what tells it apart>"'))
})

// The role and its two orders are files the host reads, not code — but two of their properties can
// degrade silently and cost a live run each, so they carry a seam here.
//
// 1. prompt() demands an EXACT bidirectional match between a template's placeholders and the values
//    the workflow passes (execution.ts: "Missing prompt value" / "Unused prompt value" both throw).
//    A key added to one order and forgotten in the other kills the run at launch, not at review.
//    This is also why `-Dtest={{class}}` in the spine order is doubled: `{class}` would read as a
//    placeholder the workflow never passes.
// 2. standards/role.md: every prohibition in a role names the machine check that catches it.
const ORDER_KEYS = ["CELL", "FILES", "SUBJECTS", "BRD", "FEEDBACK", "STAGING", "CHECK"]
const placeholders = (tpl) =>
  [...tpl.matchAll(/{{|}}|{([A-Za-z_$][\w$]*)}/g)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]))

test("orders: both templates use exactly the keys the workflow passes", () => {
  for (const file of ["order.survey.tpl", "order.spine.tpl"]) {
    const tpl = readFileSync(new URL(file, import.meta.url), "utf8")
    assert.deepEqual([...new Set(placeholders(tpl))].sort(), [...ORDER_KEYS].sort(), file)
  }
})

test("role: scout.md names the machine check behind each of its prohibitions", () => {
  // The role file is named by ROLE, not by step: pi resolves `agent({role: "scout"})` by FILENAME
  // inside the declared roleDirectories (ext/index.mjs), so scope/role.md would install as "role".
  const role = readFileSync(new URL("scout.md", import.meta.url), "utf8")
  for (const rule of ["S1", "S2", "S3", "S4", "S5", "S6", "S8", "S9", "P4"]) assert.match(role, new RegExp(`machine-checked as \`${rule}\``))
  assert.match(role, /deps="none"/)   // the dependency answer, not silence (LAW 3)
  assert.match(role, /found="no"/)    // "not found" is an answer, not a guess (LAW 5)
})
