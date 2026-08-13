// Units for steps/review/review.mjs — one per rule that can degrade silently (docs/review.md §11).
//
// The fixture is COPIED from the live artifacts of runbox/quarkus-rest-json-app-v2-t3 (the run of
// steps 1-10 this slice was designed against), not invented — the same discipline steps 9 and 10 were
// given after a hand-written fixture disagreed with the first real input it met.
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { parseFrd } from "../intake/frd.mjs"
import { newReview, parseReview, CODES, CODE_CULPRIT, CODE_OWNER } from "./review.mjs"

const RESOURCE = "src/main/java/org/acme/rest/json/FruitResource.java"
const LIST = "src/main/resources/META-INF/resources/fruits.html"
const CARD = "src/main/resources/META-INF/resources/fruit-card.html"

const PLAN = {
  grammar: 1,
  mode: "minor",
  branch: { task: "IZI-3", name: "feature/IZI-3", base: "main", source: "operator-answer" },
  gaps: ["toggle", "spec"],
  order: [RESOURCE, LIST, CARD, "scenario:S1", "scenario:S2"],
  nodes: [
    { id: RESOURCE, kind: "code", new: false, delta: ["GET /fruits/{name} (Added)"], deps: [], check: [{ suite: "unit", cmd: "mvn test -Dtest=FruitResourceTest" }], coveredBy: ["scenario:S2"] },
    { id: LIST, kind: "code", new: false, delta: [], deps: [RESOURCE], check: [], coveredBy: ["scenario:S1"] },
    { id: CARD, kind: "code", new: true, delta: ["GET /fruit-card.html (Added)"], deps: [RESOURCE], check: [], coveredBy: ["scenario:S1", "scenario:S2"] },
    { id: "scenario:S1", kind: "scenario", scenario: "S1", deps: [LIST, CARD], check: [{ suite: "unit", cmd: "mvn test" }], coveredBy: [] },
    { id: "scenario:S2", kind: "scenario", scenario: "S2", deps: [CARD, RESOURCE], check: [{ suite: "unit", cmd: "mvn test" }], coveredBy: [] },
  ],
}

const FRD = parseFrd(`<frd grammar="1" goal="страница карточки фрукта">
  <usecase id="UC1" actor="user" goal="перейти на карточку">
    <post>браузер перешёл на fruit-card.html</post>
    <step n="1">fruits.html выводит anchor на fruit-card.html?name={name}</step>
  </usecase>
  <usecase id="UC2" actor="user" goal="просмотреть карточку">
    <post>на странице отображаются name и description</post>
    <step n="1">fruit-card.html выполняет GET /fruits/{name}</step>
  </usecase>
  <failure code="FRUIT_NOT_FOUND" status="404" client="сообщение" operator="—" from="UC2/3a"/>
  <delta op="GET /fruits/{name}" form="Added" node="${RESOURCE}"/>
  <delta op="GET /fruit-card.html" form="Added" node="${CARD}" new="yes"/>
  <scenario id="S1" uc="UC1" before="нет ссылок" after="есть ссылки" nodes="${LIST} ${CARD}"/>
  <scenario id="S2" uc="UC2" before="страницы нет" after="страница есть" nodes="${CARD} ${RESOURCE}"/>
  <touched path="${RESOURCE}" why="эндпоинт"/>
  <touched path="${LIST}" why="ссылки"/>
  <touched path="${CARD}" why="новая страница"/>
</frd>`)

const review = (xml, over = {}) => newReview({ xml, plan: "plan" in over ? over.plan : PLAN, frd: over.frd || FRD })

const REJECT = `<review verdict="Reject" grammar="1">
  <blocker code="unreachable-antecedent" node="${LIST}" evidence="${CARD}">
    Страница списка ссылается на карточку раньше, чем карточка создана.
  </blocker>
</review>`

test("happy: a Pass carries no blocker and closes the step", () => {
  const r = review('<review verdict="Pass" grammar="1"/>')
  assert.equal(r.ok, true, r.ok ? "" : r.error.detail)
  assert.equal(r.value.verdict, "Pass")
  assert.deepEqual(r.value.blockers, [])
})

test("a Reject resolves, and the culprit and the owner are DERIVED from the code", () => {
  const r = review(REJECT)
  assert.equal(r.ok, true, r.ok ? "" : r.error.detail)
  assert.equal(r.value.verdict, "Reject")
  assert.equal(r.value.blockers.length, 1)
  const b = r.value.blockers[0]
  assert.equal(b.node, LIST)
  assert.equal(b.evidence, CARD)
  // never read out of the role's file: the model addresses a finding, it does not address a step
  assert.equal(b.culprit, "plan-index.json")
  assert.equal(b.owner, 10)
  assert.ok(b.text.startsWith("Страница списка"), "the text travels to the operator as written")
})

// R1 in BOTH directions: a Pass hiding a blocker would drop a finding nobody routes, a Reject with
// none would stop the band on nothing.
test("R1: the verdict and its body must agree", () => {
  assert.match(review(REJECT.replace('verdict="Reject"', 'verdict="Pass"')).error.detail, /R1 verdict=Pass при 1/)
  assert.match(review('<review verdict="Reject" grammar="1"/>').error.detail, /R1 verdict=Reject, но ни одного/)
  assert.match(review('<review verdict="Approve" grammar="1"/>').error.detail, /R1 verdict="Approve"/)
})

test("R2: a code outside the vocabulary short-circuits its blocker", () => {
  const r = review(REJECT.replace("unreachable-antecedent", "check-not-witnessing"))
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /R2 блокер 1: code="check-not-witnessing" вне словаря/)
  assert.equal(r.error.detail.split("\n").length, 1, "one unknown code is ONE blocker, not three")
})

// R3: a path that exists in the repository, in the map and in the FRD is still not an address here —
// the plan is what step 11 judges, and a node outside it cannot be repaired by any owner.
test("R3: the node must be an id of the PLAN, not merely a real path", () => {
  const r = review(REJECT.replace(`node="${LIST}"`, 'node="src/main/java/org/acme/rest/json/Fruit.java"'))
  assert.match(r.error.detail, /R3 блокер 1 \(unreachable-antecedent\): node=.*Fruit\.java.* не узел плана/)
  assert.equal(review(REJECT.replace(`node="${LIST}"`, 'node="scenario:S1"')).ok, true, "a scenario node is an id like any other")
})

// R4 is per CODE, and that is the rule that makes a blocker REPAIRABLE: (node, evidence) of an
// unreachable-antecedent IS the missing edge steps/plan/plan.mjs applies, so an FRD id there names no
// edge at all — the finding would be true and unusable.
test("R4: the KIND of evidence is fixed by the code", () => {
  assert.match(review(REJECT.replace(`evidence="${CARD}"`, 'evidence="UC1"')).error.detail, /R4 .*НЕДОСТАЮЩЕЕ РЕБРО/)
  assert.match(review(REJECT.replace(`evidence="${CARD}"`, 'evidence="страница карточки"')).error.detail, /R4 /)

  const goal = REJECT.replace("unreachable-antecedent", "goal-not-delivered").replace(`evidence="${CARD}"`, 'evidence="UC2"')
  const r = review(goal)
  assert.equal(r.ok, true, r.ok ? "" : r.error.detail)
  assert.equal(r.value.blockers[0].culprit, "frd.xml")
  assert.equal(r.value.blockers[0].owner, 6, "the FRD has a role, so its repair is a re-delegation")
  // every kind of FRD id resolves: a scenario, a failure's code, a delta's op
  for (const id of ["S1", "FRUIT_NOT_FOUND", "GET /fruits/{name}"]) {
    assert.equal(review(goal.replace('evidence="UC2"', `evidence="${id}"`)).ok, true, `${id} is an FRD id`)
  }
  // and a plan node is NOT an FRD id
  assert.match(review(goal.replace('evidence="UC2"', `evidence="${CARD}"`)).error.detail, /R4 .*не id FRD/)
})

test("R4: a blocker with no text is refused — the repair rail would carry nothing", () => {
  const empty = `<review verdict="Reject" grammar="1"><blocker code="goal-not-delivered" node="${LIST}" evidence="UC1"></blocker></review>`
  assert.match(review(empty).error.detail, /текст блокера пуст/)
})

test("refusals: every absence is named, and the core is total", () => {
  assert.equal(newReview().error.cls, "empty")
  assert.equal(review("тут вообще не xml").error.cls, "empty")
  assert.equal(review(REJECT, { plan: { nodes: [] } }).error.cls, "no-plan")
  assert.equal(review(REJECT, { plan: null }).error.cls, "no-plan")
  assert.equal(review(REJECT.replace(`evidence="${CARD}"`, 'evidence="nope"')).error.cls, "invalid-review")
})

test("parsing is total and keeps the text as one line for the feedback rail", () => {
  assert.deepEqual(parseReview(undefined), { verdict: "", blockers: [], found: false })
  const multi = `<review verdict="Reject" grammar="1">
  <blocker code="goal-not-delivered" node="${LIST}" evidence="UC1">
    Первая строка
    и вторая.
  </blocker>
</review>`
  assert.equal(parseReview(multi).blockers[0].text, "Первая строка и вторая.")
})

// The two seams the SLICE keeps outside the core, the same pair steps/design/design.test.mjs holds:
// the order carries exactly the keys the workflow passes (prompt() demands a bidirectional match and
// throws at LAUNCH otherwise), and the role's frontmatter survives YAML.
const ORDER_KEYS = ["PLAN", "FRD", "CODES", "FEEDBACK", "STAGING", "CHECK"]

test("order.tpl uses exactly the keys the workflow passes", () => {
  const tpl = readFileSync(new URL("order.tpl", import.meta.url), "utf8")
  const keys = [...tpl.matchAll(/{{|}}|{([A-Za-z_$][\w$]*)}/g)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]))
  assert.deepEqual([...new Set(keys)].sort(), [...ORDER_KEYS].sort())
})

// A bare colon in a frontmatter value makes YAML read it as a nested mapping and the host rejects the
// whole run on metadata validation — the price is known: run ffe8cb7b was thrown away for it.
test("role frontmatter: the description carries no bare colon", () => {
  const role = readFileSync(fileURLToPath(new URL("./critic.md", import.meta.url)), "utf8")
  const line = role.split("\n").find((l) => l.startsWith("description:"))
  assert.ok(line, "the role declares a description")
  assert.ok(!line.slice("description:".length).includes(":"), `no bare colon inside the value: ${line}`)
})

// The seam of the vocabulary: the role is what the model reads, CODES is what runs. Two texts of one
// rule drift in silence (standards/code.md §1) — the same device steps/brd/brd.test.mjs holds.
test("the vocabulary lives in one place: the code and the role agree", () => {
  const role = readFileSync(fileURLToPath(new URL("./critic.md", import.meta.url)), "utf8")
  for (const code of CODES) assert.ok(role.includes(code), `steps/review/critic.md must carry ${code} verbatim`)
  assert.ok(!role.includes("check-not-witnessing"), "a code cut from the vocabulary must not survive in the role")
  assert.deepEqual(Object.keys(CODE_CULPRIT).sort(), [...CODES].sort(), "every code names its culprit")
  assert.deepEqual(Object.keys(CODE_OWNER).sort(), [...CODES].sort(), "every code names the step that repairs it")
})
