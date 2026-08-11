// Slice `intake`: the requirement fried against the map — a PURE core; its io lives in ext/index.mjs
// (standards/code.md: an io pipe is not unit-tested). Formula: 1 happy + Σ antecedent branches with a
// DISTINGUISHABLE consequent — here the seven rules of docs/intake.md §5, each built by REINTRODUCING
// the defect into a green fixture, so the seam is proven rather than claimed.

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { newFrd, parseFrd, checkFrd, FRD_FORM } from "./frd.mjs"

// Fixture: a DIFFERENT domain from any live input (parcels, not fruits) — the same reason the role's
// own EXAMPLE is foreign: a fixture indistinguishable from live input stops testing the code.
const NODES = new Set(["src/ParcelResource.java", "src/ParcelRepo.java", "src/Parcel.java", "src/test/ParcelResourceTest.java"])
const TESTS = new Set(["src/test/ParcelResourceTest.java"])
const SOURCES = ["Нужен поиск посылки по части трек-номера, в ответе не больше 20 записей."]

const FRD = `<frd grammar="1" goal="искать посылку по части трек-номера">
  <actor name="operator-ui" kind="human" via="HTTP GET /parcels"/>

  <usecase id="UC1" actor="operator-ui" goal="найти посылку по части трек-номера">
    <pre>реестр посылок непуст</pre>
    <post>вернулись только посылки, чей трек содержит подстроку</post>
    <step n="1">клиент шлёт GET /parcels?track=AB</step>
    <step n="2">система отбирает посылки по подстроке трек-номера</step>
    <ext id="2a" error="TRACK_TOO_SHORT" outcome="отказ, поиск не выполняется"/>
  </usecase>

  <field name="track" in="GET /parcels" type="string" domain="подстрока трек-номера, регистронезависимо"
         required="no" error="TRACK_TOO_SHORT" source="TASK.md"/>
  <failure code="TRACK_TOO_SHORT" status="400" client="показать подсказку" operator="—" from="UC1/2a"/>

  <delta op="GET /parcels" form="Changed" node="src/ParcelResource.java" from="list()" to="list(track)"/>
  <delta op="findByTrack" form="Added" node="src/ParcelRepo.java"/>
  <scenario id="S1" uc="UC1" before="GET /parcels?track=AB отдаёт весь реестр"
            after="отдаёт только посылки с AB в треке" nodes="src/ParcelResource.java"/>
  <touched path="src/ParcelResource.java"/>
  <touched path="src/ParcelRepo.java"/>

  <nfr subject="response-size" fit="не больше 20 записей" source="answers.md"/>
</frd>`

const build = (xml = FRD) => newFrd({ xml, nodes: NODES, tests: TESTS, sources: SOURCES })
const blockersOf = (xml) =>
  checkFrd({ frd: parseFrd(xml), nodes: NODES, tests: TESTS, known: new Set(["20"]) })

test("happy: the FRD is built, and it carries what steps 7-9 consume", () => {
  const r = build()
  assert.equal(r.ok, true)

  const v = r.value
  assert.equal(v.goal, "искать посылку по части трек-номера")
  assert.equal(v.deltas.length, 2)
  assert.equal(v.unknown, 0)                                   // step 7 may derive a weight
  assert.deepEqual(v.touched, ["src/ParcelResource.java", "src/ParcelRepo.java"])   // step 8's input
  assert.deepEqual(v.scenarios.map((s) => s.id), ["S1"])
  assert.equal(v.usecases[0].steps.length, 2)
  assert.equal(v.usecases[0].exts[0].error, "TRACK_TOO_SHORT")
  assert.equal(v.usecases[0].post, "вернулись только посылки, чей трек содержит подстроку")
})

test("parse is total: garbage, undefined and an empty string yield an empty FRD, never a throw", () => {
  for (const bad of [undefined, null, "", "<frd", "не xml вовсе"]) {
    const f = parseFrd(bad)
    assert.equal(f.goal, "")
    assert.deepEqual([...f.deltas], [])
    assert.deepEqual([...f.touched], [])
  }
  const r = newFrd({ xml: "<frd grammar=\"1\"></frd>", nodes: NODES, sources: SOURCES })
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /грамматика не распознана/)
})

test("F1: no goal, a use case without post, without actor and without a step", () => {
  assert.match(blockersOf(FRD.replace(' goal="искать посылку по части трек-номера"', "")).join("\n"), /F1 <frd goal> пуст/)
  assert.match(blockersOf(FRD.replace(/\n\s*<post>[^<]*<\/post>/, "")).join("\n"), /F1 UC1: нет <post>/)
  assert.match(blockersOf(FRD.replace(' actor="operator-ui" goal="найти', ' goal="найти')).join("\n"), /F1 UC1: нет actor/)
  assert.match(blockersOf(FRD.replace(/\n\s*<step n="1">[^<]*<\/step>\n\s*<step n="2">[^<]*<\/step>/, "")).join("\n"), /F1 UC1: нет ни одного <step>/)
})

test("F2: a touched that resolves to no node of the map", () => {
  const told = FRD.replace('<touched path="src/ParcelRepo.java"/>', '<touched path="src/Invented.java"/>')
  assert.match(blockersOf(told).join("\n"), /F2 touched «src\/Invented\.java» не резолвится/)
})

test("F3: an invented form, an Unknown without why, a node outside the map and outside touched", () => {
  assert.match(blockersOf(FRD.replace('form="Added"', 'form="Modified"')).join("\n"), /F3 findByTrack: form="Modified"/)
  assert.match(blockersOf(FRD.replace('form="Added" node="src/ParcelRepo.java"', 'form="Unknown"')).join("\n"), /F3 findByTrack: Unknown без why/)
  assert.match(blockersOf(FRD.replace('node="src/ParcelRepo.java"', 'node="src/Invented.java"')).join("\n"), /F3 findByTrack: узла «src\/Invented\.java» нет в карте/)
  // In the map, but never declared touched — step 8 would not reach it when computing the ripple.
  assert.match(blockersOf(FRD.replace('node="src/ParcelRepo.java"', 'node="src/Parcel.java"')).join("\n"), /не объявлен <touched>/)
  // `Fixed` is a form like the other three — it carries a node and passes. Without it a
  // contract-stable bug fix would have to be declared `Changed`, and step 7 could never weigh a
  // `patch` (docs/weight.md §3).
  assert.deepEqual(blockersOf(FRD.replace('form="Added"', 'form="Fixed"')), [])
})

// Live run 1d804798: beside the delta on FruitResource.java the artifact carried one on
// FruitResourceTest.java and passed. Step 10 makes a plan node per delta, so that would have become
// two tickets and the test would have been written by a different executor than the code.
test("F2/F3: a test file is not a delta and not touched — it is the DoD of the change", () => {
  const withTest = FRD.replace(
    '  <touched path="src/ParcelRepo.java"/>',
    '  <delta op="testList" form="Changed" node="src/test/ParcelResourceTest.java" from="тест списка" to="тесты поиска"/>\n  <touched path="src/ParcelRepo.java"/>\n  <touched path="src/test/ParcelResourceTest.java"/>',
  )
  const b = blockersOf(withTest).join("\n")
  assert.match(b, /F3 testList: узел «src\/test\/ParcelResourceTest\.java» — тест/)
  assert.match(b, /F2 touched «src\/test\/ParcelResourceTest\.java» — тест/)
  assert.match(b, /<dod> изменения, а не изменение/)
  assert.deepEqual(blockersOf(FRD), [])   // the green fixture stays green
})

test("F4: a scenario that does not distinguish, and an FRD with no scenario at all", () => {
  const same = FRD.replace('after="отдаёт только посылки с AB в треке"', 'after="GET /parcels?track=AB отдаёт весь реестр"')
  assert.match(blockersOf(same).join("\n"), /F4 S1: before и after совпадают/)
  assert.match(blockersOf(FRD.replace(/<scenario[\s\S]*?\/>/, "")).join("\n"), /F4 ни одного <scenario>/)
  assert.match(blockersOf(FRD.replace('uc="UC1"', 'uc="UC9"')).join("\n"), /F4 S1: uc="UC9" — такого <usecase> нет/)
})

test("F5: a number with no source among the sources, and a source outside the vocabulary", () => {
  const invented = FRD.replace('fit="не больше 20 записей"', 'fit="не больше 50 записей"')
  assert.match(blockersOf(invented).join("\n"), /F5 нфт response-size \[invented-default\]: число 50/)
  assert.match(blockersOf(FRD.replace('source="TASK.md"', 'source="здравый смысл"')).join("\n"), /F5 поле track: source="здравый смысл"/)

  // The counting window is narrow ON PURPOSE: status/step/grammar numbers are not the requirement's
  // quantities, and counting them would fail an honest artifact (docs/intake.md §5, run ed1d4094).
  assert.deepEqual(blockersOf(FRD.replace('status="400"', 'status="418"')), [])
})

test("F6: the failure map and the extensions must be 1:1 in both directions", () => {
  assert.match(blockersOf(FRD.replace('error="TRACK_TOO_SHORT" outcome', 'error="TRACK_UNKNOWN" outcome')).join("\n"),
    /F6 код «TRACK_UNKNOWN» из <ext> не описан/)
  assert.match(blockersOf(FRD.replace(/\n\s*<ext[^>]*\/>/, "")).join("\n"),
    /F6 код «TRACK_TOO_SHORT» карты отказов не встречен/)
})

// Live run e82192db: an artifact with no <failure> and no `error` anywhere passed, because the rule
// above compared two EMPTY sets. The service was then read by hand and had no failure modes at all —
// so the answer is not "invent a code" but "say so", the way the map says found="no".
test("F6a: an empty failure map is a blocker unless it is DECLARED empty, with a reason", () => {
  const noFailures = FRD.replace(/\n\s*<failure [^>]*\/>/, "").replace(' error="TRACK_TOO_SHORT"', "")
  assert.match(blockersOf(noFailures).join("\n"), /F6 карта отказов пуста и не объявлена/)

  const declaredNoWhy = noFailures.replace("</frd>", '  <failures found="no"/>\n</frd>')
  assert.match(blockersOf(declaredNoWhy).join("\n"), /F6 <failures found="no"> без why/)

  const declared = noFailures.replace("</frd>", '  <failures found="no" why="в сервисе нет ни кодов ошибок, ни статусов, ни валидации"/>\n</frd>')
  assert.deepEqual(blockersOf(declared), [])
})

test("F7: an FRD with use cases but not a single delta", () => {
  assert.match(blockersOf(FRD.replace(/<delta[\s\S]*?\/>\n\s*<delta[\s\S]*?\/>/, "")).join("\n"), /F7 ни одной <delta>/)
})

test("Unknown is a legal artifact: it passes acceptance and is COUNTED, for step 7 to refuse on", () => {
  const told = FRD.replace('form="Added" node="src/ParcelRepo.java"', 'form="Unknown" why="в карте два кандидата"')
    .replace('  <touched path="src/ParcelRepo.java"/>\n', "")
  const r = newFrd({ xml: told, nodes: NODES, sources: SOURCES })
  assert.equal(r.ok, true)
  assert.equal(r.value.unknown, 1)
})

test("no sources supplied — the number rule stays silent, the rest still judges", () => {
  const r = newFrd({ xml: FRD.replace('fit="не больше 20 записей"', 'fit="не больше 50 записей"'), nodes: NODES, sources: [] })
  assert.equal(r.ok, true)
})

// The order is a file the host reads, not code, but prompt() demands an EXACT bidirectional match
// between its placeholders and the values the workflow passes (execution.ts: "Missing prompt value" /
// "Unused prompt value" both throw) — a mismatch kills the run at launch, not at review.
const ORDER_KEYS = ["BRD", "MAP", "ANSWERS", "FEEDBACK", "STAGING", "CHECK", "DELTA_FORMS", "SOURCES", "QUESTIONS_LEFT"]
const placeholders = (tpl) =>
  [...tpl.matchAll(/{{|}}|{([A-Za-z_$][\w$]*)}/g)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]))

test("order.tpl uses exactly the keys the workflow passes", () => {
  const tpl = readFileSync(new URL("order.tpl", import.meta.url), "utf8")
  assert.deepEqual([...new Set(placeholders(tpl))].sort(), [...ORDER_KEYS].sort())
})

test("role: intake.md names the machine check behind each of its prohibitions", () => {
  // The role file is named by ROLE, not by step: pi resolves agent({role: "intake"}) by FILENAME
  // inside the declared roleDirectories (ext/index.mjs), so intake/role.md would install as "role".
  const role = readFileSync(new URL("intake.md", import.meta.url), "utf8")
  // `\s+`, not a space: the prohibition wraps, and a rule that only passes on one line-breaking
  // whim of the editor is a seam that fails for the wrong reason.
  for (const rule of ["F1", "F2", "F3", "F4", "F5", "F6", "F7"]) assert.match(role, new RegExp(`machine-checked as\\s+\`${rule}\``))
  assert.match(role, /Unknown/)            // the form that carries "could not classify" to the operator
  assert.doesNotMatch(role, /\bmvn\b|@GET|src\/main\//)   // no design, no repository idiom in the role
})

// S21, the operator's decision: grilling a requirement takes 25-30 questions, and the ROUND is what
// costs context — the role re-reads the BRD and the whole map on every trip. The rule the role
// inherited from gilb ("ONE closed question") forbade exactly the batch, so its absence is the seam.
test("role and order: questions travel in a BATCH, not one per exchange", () => {
  const role = readFileSync(new URL("intake.md", import.meta.url), "utf8")
  const tpl = readFileSync(new URL("order.tpl", import.meta.url), "utf8")
  assert.match(role, /ONE batch|one batch|ONE call|BATCHES/)
  assert.match(role, /"items"/)             // the questions travel as a LIST, unnumbered
  // Live run 6350f09b: the role sent one question in `items` and `questions: 3` — the number copied
  // off this very example. The size of a batch is the length of the list and lives nowhere else, so
  // the example must not carry a count for the role to imitate.
  assert.doesNotMatch(role, /"questions":/)
  assert.doesNotMatch(role, /You do number them/)
  // The CLI key path is gone from this role: an answer_cmd carrying a six-line key is unusable, and
  // the answer travels by NUMBER through the chat tool (run 46edab60).
  assert.doesNotMatch(role, /answer_cmd/)
  assert.match(tpl, /IN ONE BATCH/)
})

test("the form the order substitutes is the SAME data the guardrail judges by", () => {
  const tpl = readFileSync(new URL("order.tpl", import.meta.url), "utf8")
  assert.doesNotMatch(tpl, /Added \| Changed \| Removed/)              // substituted, never retyped
  assert.deepEqual([...FRD_FORM.deltaForms], ["Added", "Changed", "Removed", "Fixed", "Unknown"])
  assert.ok(FRD_FORM.sources.includes("appgraph.xml"))
  // The forms are chosen by the EFFECT ON AN EXISTING CALL, and that definition lives in the role —
  // not in the order and not in this pipeline's prose (docs/weight.md §3). Without it `Fixed` is a
  // word without a rule, and the live run S21 defect (an additive change declared `Changed`, weighing
  // major for one node) comes straight back.
  const role = readFileSync(new URL("intake.md", import.meta.url), "utf8")
  assert.match(role, /`Fixed` — the contract does not move/)
  assert.match(role, /what happens to a call that exists TODAY/)
})
