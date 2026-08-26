// Slice `scope`: the guardrail of step 4 — a PURE core; its io (ext/index.mjs::checkPart) is proven
// by a live run, not by units (standards/code.md). Formula: 1 happy + Σ antecedent branches with a
// DISTINGUISHABLE consequent — here, one happy path per cell kind, totality, and one unit per rule
// that can silently degrade (S1, S2, S4, S6..S10, P1, P3, P4). Rule numbers are docs/scope.md §3.

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { parsePart, checkPart, newPart } from "./part.mjs"
import { SPINE_CELL } from "./plan/plan.core.mjs"

const surveyCell = {
  id: "src",
  kind: "survey",
  files: [{ path: "src/Api.java" }, { path: "src/Model.java" }, { path: "src/import.sql" }],
}

const SURVEY_XML = `
<part cell="src" kind="survey">
  <module path="src/Api.java">
    <role>REST endpoint for orders</role>
    <api name="GET /orders" kind="http" scope="public"/>
    <io kind="db" dir="out" system="orders-db" config="spring.datasource.url" target="orders table"/>
    <test path="src/test/ApiTest.java"/>
  </module>
  <module path="src/Model.java" io="none" api="none" tests="none">
    <role>plain data record</role>
  </module>
  <gap path="src/import.sql" why="not read: 480 KB of seed data, no module in it"/>
</part>`

const spineCell = { id: SPINE_CELL, kind: "spine", files: [{ path: "pom.xml" }, { path: "README.md" }] }

const SPINE_XML = `
<part cell="${SPINE_CELL}" kind="spine">
  <artifact name="orders-service" root="."/>
  <suite id="unit" kind="unit" cmd="./mvnw -q test" one="./mvnw -q test -Dtest={class}" path="src/test/java"/>
  <suite id="component-it" kind="component" cmd="./mvnw -q verify -Pit" one="" path="src/it"/>
  <integration system="orders-db" kind="db" config="spring.datasource.url" value="jdbc:postgresql://db/orders"/>
  <build cmd="./mvnw -q package"/>
  <toggles found="no"/>
  <branching branches="feature/&lt;slug&gt;" commits="conventional-commits"/>
  <contract found="no"/>
</part>`

test("happy survey: modules and gap parsed; part is green — and it carries NO edges", () => {
  const part = parsePart(SURVEY_XML)
  assert.equal(part.cell, "src")
  assert.equal(part.kind, "survey")
  assert.deepEqual(part.modules.map((m) => m.path), ["src/Api.java", "src/Model.java"])
  assert.deepEqual(part.modules[0].deps, [])   // the script owns edges: a part neither has nor may have them
  assert.deepEqual(part.modules[0].api, [{ name: "GET /orders", kind: "http", scope: "public" }])
  assert.equal(part.modules[0].io[0].system, "orders-db")   // the external system, not a <dep>
  assert.deepEqual(part.modules[0].tests, [{ path: "src/test/ApiTest.java", suite: "" }])
  assert.equal(part.modules[1].ioNone, true)   // absence DECLARED, not omitted — external points…
  assert.equal(part.modules[1].apiNone, true)  // …and the exposed surface
  assert.equal(part.modules[1].testsNone, true)
  assert.equal(part.gaps[0].path, "src/import.sql")

  assert.deepEqual(checkPart({ part, cell: surveyCell }), [])
  const r = newPart({ xml: SURVEY_XML, cell: surveyCell })
  assert.equal(r.ok, true)
  assert.equal(r.value.modules.length, 2)
})

test("happy spine: seven answers, empty `one` and found=\"no\" are valid", () => {
  const part = parsePart(SPINE_XML)
  assert.deepEqual(part.suites.map((s) => s.id), ["unit", "component-it"])
  assert.equal(part.suites[1].one, "") // valid: step 15 runs the whole suite and logs that price
  assert.equal(part.answers.artifact.name, "orders-service") // the deployable unit — step 5's address level
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
  assert.match(r.error.detail, /^C1 src:/)
})

test("S1: a cell file closed by neither <module> nor <gap> is a blocker", () => {
  const xml = SURVEY_XML.replace(/  <gap[^>]*\/>\n/, "")
  const blockers = checkPart({ part: parsePart(xml), cell: surveyCell })
  assert.deepEqual(blockers, ["S1 src: file is closed by neither <module> nor <gap> — src/import.sql"])
})

test("S2: a path outside the cell is a blocker — the scout does not pick its own files", () => {
  const xml = SURVEY_XML.replace('path="src/Model.java" io="none"', 'path="src/Other.java" io="none"')
  const blockers = checkPart({ part: parsePart(xml), cell: surveyCell })
  assert.ok(blockers.some((b) => b.startsWith("S2 src: path does not belong to this cell — src/Other.java")))
})

test("S4: edges are no longer the role's answer — <dep> and deps=\"none\" in a part are blockers", () => {
  // Three runs in a row produced three different defects of ONE dimension: framework imports as edges
  // (6e3b9455) → a backwards edge closing a cycle (c9580ff8) → zero edges (337b957f). Direction,
  // evidence and membership are computable, so steps/scope/edges.mjs computes them and a part has one
  // owner of edges: the script. Step 5 could not tell a second, hand-written source apart.
  const written = SURVEY_XML.replace("<role>REST endpoint for orders</role>",
    '<role>REST endpoint for orders</role>\n    <dep path="src/Model.java" via="import com.acme.Model"/>')
  assert.deepEqual(checkPart({ part: parsePart(written), cell: surveyCell }),
    ['S4 src: edges are computed by the script, not written here — drop <dep> and deps="none" (src/Api.java)'])

  const silent = SURVEY_XML.replace('<module path="src/Model.java" io="none"', '<module path="src/Model.java" deps="none" io="none"')
  assert.deepEqual(checkPart({ part: parsePart(silent), cell: surveyCell }),
    ['S4 src: edges are computed by the script, not written here — drop <dep> and deps="none" (src/Model.java)'])
})

test("S6/S7: an external point is declared and its form is closed — io=\"none\" is an answer", () => {
  const silent = SURVEY_XML.replace(/\n    <io [^>]*\/>/, "")
  assert.deepEqual(checkPart({ part: parsePart(silent), cell: surveyCell }),
    ['S6 src: neither <io> nor io="none" — src/Api.java'])

  const invented = SURVEY_XML.replace('kind="db" dir="out"', 'kind="postgres" dir="both"')
  const blockers = checkPart({ part: parsePart(invented), cell: surveyCell })
  assert.ok(blockers.some((b) => b.startsWith('S7 src: <io kind="postgres">')))
  assert.ok(blockers.some((b) => b.startsWith('S7 src: <io dir="both">')))

  const homeless = SURVEY_XML.replace(' config="spring.datasource.url" target="orders table"', "")
  assert.ok(checkPart({ part: parsePart(homeless), cell: surveyCell })
    .some((b) => b.startsWith("S7 src: <io> has neither config nor target")))
})

test("S8: the tests are declared like every other dimension — tests=\"none\" is an answer", () => {
  const silent = SURVEY_XML.replace(/\n    <test [^>]*\/>/, "")
  assert.deepEqual(checkPart({ part: parsePart(silent), cell: surveyCell }),
    ['S8 src: neither <test> nor tests="none" — src/Api.java'])
})

test("S9/S10: the exposed surface is declared, scoped and canonically named", () => {
  const silent = SURVEY_XML.replace(/\n    <api [^>]*\/>/, "")
  assert.deepEqual(checkPart({ part: parsePart(silent), cell: surveyCell }),
    ['S9 src: neither <api> nor api="none" — src/Api.java'])

  // The whole point of `scope`: without it the graph cannot answer "what is exposed outward".
  const unscoped = SURVEY_XML.replace(' kind="http" scope="public"', ' kind="http"')
  assert.ok(checkPart({ part: parsePart(unscoped), cell: surveyCell })
    .some((b) => b.startsWith('S10 src: <api scope="">')))

  const freeform = SURVEY_XML.replace('name="GET /orders"', 'name="orders endpoint"')
  assert.ok(checkPart({ part: parsePart(freeform), cell: surveyCell })
    .some((b) => b.startsWith('S10 src: <api kind="http"> name must be "METHOD /path"')))
})

test("P1: a missing spine answer is a blocker; suites are answered by <suite> or found=\"no\"", () => {
  const noToggles = SPINE_XML.replace('  <toggles found="no"/>\n', "")
  assert.ok(checkPart({ part: parsePart(noToggles), cell: spineCell })
    .some((b) => b.startsWith("P1 spine: <toggles> is missing or empty")))

  // The seventh question (grammar 3): what this repository BUILDS. Silence used to be legal here
  // simply because nobody asked — and step 5 then had no address level above a module at all.
  const noArtifact = SPINE_XML.replace(/  <artifact [^>]*\/>\n/, "")
  assert.ok(checkPart({ part: parsePart(noArtifact), cell: spineCell })
    .some((b) => b.startsWith("P1 spine: <artifact> is missing or empty")))

  const noSuites = SPINE_XML.replace(/  <suite [^>]*\/>\n/g, "")
  assert.ok(checkPart({ part: parsePart(noSuites), cell: spineCell })
    .some((b) => b.startsWith("P1 spine: no <suite> and no <suites")))

  const declaredAbsent = noSuites.replace("<build", '<suites found="no"/>\n  <build')
  assert.deepEqual(checkPart({ part: parsePart(declaredAbsent), cell: spineCell }), [])
})

test("P4/P5: an integration without its config key, with an invented kind, or declared twice", () => {
  const noKey = SPINE_XML.replace(' config="spring.datasource.url"', "")
  assert.ok(checkPart({ part: parsePart(noKey), cell: spineCell })
    .some((b) => b.startsWith('P4 spine: <integration system="orders-db"> has no config')))

  const invented = SPINE_XML.replace('kind="db"', 'kind="postgres"')
  assert.ok(checkPart({ part: parsePart(invented), cell: spineCell })
    .some((b) => b.startsWith('P4 spine: <integration system="orders-db"> kind="postgres"')))

  const twice = SPINE_XML.replace("  <build", '  <integration system="orders-db" kind="db" config="spring.datasource.username"/>\n  <build')
  assert.ok(checkPart({ part: parsePart(twice), cell: spineCell })
    .some((b) => b === 'P5 spine: duplicate <integration system="orders-db">'))
})

test("P2/P3: a suite without cmd, with an invented kind, with a drifting id, or declared twice", () => {
  const broken = SPINE_XML
    .replace('cmd="./mvnw -q verify -Pit" one="" path="src/it"', 'cmd="" one="" path="src/it"')
    .replace('id="component-it"', 'id="unit"')
  const blockers = checkPart({ part: parsePart(broken), cell: spineCell })
  assert.ok(blockers.some((b) => b === 'P2 spine: <suite id="unit"> has empty cmd'))
  assert.ok(blockers.some((b) => b === 'P3 spine: duplicate <suite id="unit">'))

  // Four live runs named one suite `integ-native`, `integration`, `native-it`, `native-integration`.
  // The kind is now a vocabulary and the id must start with it, so none of those four can recur.
  const inventedKind = SPINE_XML.replace('kind="component"', 'kind="integration"')
  assert.ok(checkPart({ part: parsePart(inventedKind), cell: spineCell })
    .some((b) => b.startsWith('P2 spine: <suite kind="integration">')))

  const drifting = SPINE_XML.replace('id="component-it"', 'id="native-it"')
  assert.ok(checkPart({ part: parsePart(drifting), cell: spineCell })
    .some((b) => b === 'P2 spine: <suite id="native-it"> must start with its kind — "component" or "component-<what tells it apart>"'))
})

test("P6: two suites over one folder must be told apart by file name, or step 5 binds the wrong one", () => {
  // The live spine of /tmp/quarkus-rest-json-app-v2-t1-3: `unit` (mvn test) and `component-native`
  // (mvn verify -Pnative) BOTH on src/test/java. Binding by path alone takes the first candidate, so
  // FruitResourceIT would get `unit`, step 10 would build `mvn test -Dtest=FruitResourceIT`, and
  // surefire does not pick that file up — a green run that executed nothing.
  const shared = SPINE_XML.replace('one="" path="src/it"', 'one="" path="src/test/java"')
  const blockers = checkPart({ part: parsePart(shared), cell: spineCell })
  assert.equal(blockers.length, 2, "both claimants of the folder are named, not just the second")
  assert.ok(blockers.every((b) => b.startsWith("P6 spine: <suite id=")))
  assert.ok(blockers.some((b) => b.includes('id="unit"')) && blockers.some((b) => b.includes('id="component-it"')))

  // Discriminated: green again. `match` is required by the AMBIGUITY, not by the element — one suite
  // over a folder needs none, which is why the happy spine above carries no `match` at all.
  const told = shared
    .replace('path="src/test/java"/>\n  <suite id="component-it"', 'path="src/test/java" match="*Test.java"/>\n  <suite id="component-it"')
    .replace('one="" path="src/test/java"', 'one="" path="src/test/java" match="*IT.java"')
  assert.deepEqual(checkPart({ part: parsePart(told), cell: spineCell }), [])
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
// Слоты против ключей полосы судит core/orders.test.mjs — для ВСЕХ нарядов сразу и читая
// workflows/izi.js. Список, набранный здесь руками, сходился с шаблоном всегда.

// A file-name pattern written anywhere in the spine order is copied into `match`, and `match` is
// judged by step 5 against the file NAME — extension included.
//
// BUG_FIX_CONTEXT: two runs of step 4 on one and the same pom.xml.
//   Previous: the `one` bullet listed the single-file form per TOOL and named the runners by their
//             patterns — "maven surefire (`mvn test`, `*Test`)", "failsafe (`mvn verify`, `*IT`)".
//   Problem:  run 899494cc came back with `match="*Test"` and `match="*IT"` instead of the previous
//             `*Test.java`/`*IT.java`, taken from the NEARER example rather than from the `match`
//             bullet below it. suiteFor matches `^.*Test$` against `FruitResourceTest.java`, so all
//             four test files ended up `suite=""` — unbound, in a GREEN run.
//   Fix:      the `one` bullet states the TASK ("what to add to this suite's own cmd") and names no
//             tool and no pattern at all; patterns live in the `match` bullet, with `.java` on them.
//             This assertion is the seam: a unit cannot judge what the role writes, only whether the
//             order still carries a pattern the role can copy into the wrong attribute.
test("order.spine.tpl carries no bare file-name pattern — a pattern here lands in match", () => {
  const tpl = readFileSync(new URL("parts/order.spine.tpl", import.meta.url), "utf8")
  assert.doesNotMatch(tpl, /\*(Test|IT)(?!\.java)/)
})

// P7 — D21. A TOGGLE is what a running instance switches without a rebuild, and `config` is the key
// that proves it. Live run c64dbd32: the spine answered `mechanism="maven profiles (-Pnative for
// native build)"` — a BUILD profile — P1 was satisfied (non-empty), and step 10 made `toggle` the
// FIRST ticket of a plan whose requirement never mentioned a switch. The seam is the key: a build
// profile has none, so the honest answer is `found="no"`. Delete P7 and the first branch goes green
// again — and the ticket comes back.
test("P7: a toggle without the key a RUNNING instance reads is a blocker; found=no is complete", () => {
  const withProfile = SPINE_XML.replace('<toggles found="no"/>', '<toggles mechanism="maven profiles (-Pnative for native build)"/>')
  const b = checkPart({ part: parsePart(withProfile), cell: spineCell })
  assert.equal(b.length, 1, b.join("\n"))
  assert.match(b[0], /^P7 /)
  assert.match(b[0], /name the KEY a RUNNING instance reads/)

  // A real toggle passes: the key is what the application reads at run time.
  const real = SPINE_XML.replace('<toggles found="no"/>', '<toggles mechanism="config property read at startup" config="app.feature.search.enabled"/>')
  assert.deepEqual(checkPart({ part: parsePart(real), cell: spineCell }), [])

  // …and so does the honest absence — the gap is step 10's to declare, not this rule's to force.
  assert.deepEqual(checkPart({ part: parsePart(SPINE_XML), cell: spineCell }), [])
})

// The definition itself lives where the role reads it — the order — and it is stated as a CHECKABLE
// question ("name the key"), never as taste. Without the second bullet a model that found no key has
// no sanctioned way out and invents one, which is exactly what c64dbd32 did.
test("the spine order defines a toggle by the key a running instance reads, and blesses found=no", () => {
  const tpl = readFileSync(new URL("parts/order.spine.tpl", import.meta.url), "utf8")
  assert.match(tpl, /<toggles mechanism="…" config="…"\/>/)
  assert.match(tpl, /WITHOUT being\s+rebuilt or redeployed/)
  assert.match(tpl, /a build profile \(`-P…`\), a compiler or packaging flag/)
  assert.match(tpl, /are NOT toggles/)
  assert.match(tpl, /`<toggles found="no"\/>`,\s+and that is a complete answer/)
})

test("role: scout.md names the machine check behind each of its prohibitions", () => {
  // The role file is named by ROLE, not by step: pi resolves `agent({role: "scout"})` by FILENAME
  // inside the declared roleDirectories (ext/index.mjs), so scope/role.md would install as "role".
  const role = readFileSync(new URL("parts/scout.md", import.meta.url), "utf8")
  for (const rule of ["S1", "S2", "S3", "S4", "S5", "S6", "S8", "S9", "P4", "P6"]) assert.match(role, new RegExp(`machine-checked as \`${rule}\``))
  assert.match(role, /deps="none"/)   // named ONLY to forbid it: the script owns edges now (LAW 4)
  assert.match(role, /found="no"/)    // "not found" is an answer, not a guess (LAW 5)
})

// --- P8 и P9: сьют — обещание команды, и обе его половины суть факты репозитория -------------------
//
// Инвентарь — весь список файлов обзора (ext/index.mjs::checkPart собирает его из всех клеток
// survey-plan.json): хребет отвечает `<suite>` за репозиторий, а файлы, которые сьют забирает, и
// обёртка, через которую он запускается, лежат в других клетках. Без инвентаря оба правила молчат.
const INVENTORY = [
  "pom.xml", "README.md", "mvnw",
  "src/main/java/org/acme/rest/json/FruitResource.java",
  "src/test/java/org/acme/rest/json/FruitResourceTest.java",
  "src/test/java/org/acme/rest/json/FruitResourceIT.java",
]
const spineOf = (xml, inventory = INVENTORY) => checkPart({ part: parsePart(xml), cell: spineCell, inventory })

// Хребет, который прошёл бы сегодняшний гардрейл: обёртка есть в дереве, а команды написаны без неё.
const SPINE_REAL = `
<part cell="${SPINE_CELL}" kind="spine">
  <artifact name="rest-json-quickstart" root="."/>
  <suite id="unit" kind="unit" cmd="mvn test" one="-Dtest={class}" path="src/test/java" match="*Test.java"/>
  <suite id="component-native" kind="component" cmd="mvn verify -Pnative" one="-Dit.test={class}" path="src/test/java" match="*IT.java"/>
  <integration system="orders-db" kind="db" config="quarkus.datasource.jdbc.url" value="jdbc:postgresql://db/orders"/>
  <build cmd="./mvnw package"/>
  <toggles found="no"/>
  <branching branches="feature/&lt;slug&gt;" commits="conventional-commits"/>
  <contract found="no"/>
</part>`

test("P9: репозиторий несёт mvnw — команда сьюта обязана идти через обёртку (прогон 0aa13bff)", () => {
  const b = spineOf(SPINE_REAL).filter((l) => l.startsWith("P9 "))
  assert.equal(b.length, 2, b.join("\n"))
  assert.match(b[0], /<suite id="unit" cmd="mvn test"> — the repository ships \.\/mvnw/)

  // Через обёртку — зелено; и без обёртки в инвентаре голое имя законно.
  assert.deepEqual(spineOf(SPINE_REAL.replaceAll('cmd="mvn ', 'cmd="./mvnw ')).filter((l) => l.startsWith("P9 ")), [])
  assert.deepEqual(spineOf(SPINE_REAL, INVENTORY.filter((p) => p !== "mvnw")).filter((l) => l.startsWith("P9 ")), [])
})

test("P8: match, который не забирает ни одного файла (прогон 1df91a31)", () => {
  // `*Test` вместо `*Test.java`: в том прогоне все четыре тестовых файла остались без сьюта, а
  // харнес сообщил об этом gap-ом и поехал дальше.
  const b = spineOf(SPINE_REAL.replace('match="*Test.java"', 'match="*Test"')).filter((l) => l.startsWith("P8 "))
  assert.equal(b.length, 1, b.join("\n"))
  assert.match(b[0], /<suite id="unit" match="\*Test"> matches no file under path="src\/test\/java"/)

  // Правило судит ровно ту же парой (path, match), какой шаг 5 привязывает файлы: одно правило —
  // одно место (core/suites.mjs), иначе сьют зеленеет здесь и теряет файлы там.
  assert.deepEqual(spineOf(SPINE_REAL).filter((l) => l.startsWith("P8 ")), [])
  // Сьют, объявленный отсутствующим, ничего не обещает.
  assert.deepEqual(spineOf(SPINE_REAL.replace('match="*Test"', 'match="*Test" found="no"')).filter((l) => l.startsWith("P8 ")), [])
})

test("P8/P9 без инвентаря молчат — нет источников, нет суждения", () => {
  assert.deepEqual(checkPart({ part: parsePart(SPINE_REAL), cell: spineCell }).filter((l) => /^P[89] /.test(l)), [])
})

test("P8 судит по ДЕРЕВУ плана, а не по файлам хребтовой клетки (прогон 3c6542e7, T25)", () => {
  // Три круга хребет писал правильный по смыслу сьют (surefire `*Test.java` под src/test/java) —
  // и трижды получал «matches no file», потому что вызывающий передал инвентарь ХРЕБТА (pom, README),
  // в котором тестов не бывает. Инвентарь правил P8/P9 — факты репозитория: дерево плана.
  const tree = [...INVENTORY, "src/test/java/demo/FooResourceTest.java"]
  assert.deepEqual(
    spineOf(SPINE_REAL, tree).filter((l) => l.startsWith("P8 ")), [],
    "файл под path есть в ДЕРЕВЕ — сьют зелёный, даже если в самой клетке хребта его нет")

  // Реинтродукция дефекта: инвентарь, суженный до файлов хребтовой клетки, роняет правильный ответ.
  assert.ok(spineOf(SPINE_REAL, ["pom.xml", "README.md"]).some((l) => l.startsWith("P8 ")),
    "инвентарь из одних файлов хребта роняет правильный сьют — это и был дефект прогона")
})

test("order.spine.tpl говорит про обёртку и про расширение в match — правило видно роли, не только гардрейлу", () => {
  const tpl = readFileSync(new URL("parts/order.spine.tpl", import.meta.url), "utf8")
  assert.match(tpl, /`mvnw` or `gradlew` in the root is that runner/)
  assert.match(tpl, /A bare `mvn`\/`gradle` beside a wrapper is rejected/)
  assert.match(tpl, /The file EXTENSION is part of the name a runner matches/)
})
