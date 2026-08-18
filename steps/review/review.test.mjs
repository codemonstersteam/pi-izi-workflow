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
import { newReview, parseReview, owedItems, autoFindings, frdIds, askedNodes, createdNodes, CODES, CODE_CULPRIT, CODE_OWNER, OPERATOR_NOTE } from "./review.mjs"
// reachedBy MOVED to core/suites.mjs (D23): step 6's gate asks the same question of the same map, and
// the units of R6 below are unchanged by the move — that is the seam of the move itself.
import { reachedBy } from "../../core/suites.mjs"
import { parseMap } from "../intake/map.mjs"
// The gate of step 6 owns the text of the question whose answer R6 reads (D23).
import { BLIND_STEM, BLIND_TAIL } from "../ripple/ripple.mjs"
import { newExchange, newAnswers } from "../../core/answers.mjs"

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

// D21: the checklist is DATA, and every fixture below has to close it — that is the rule, not the
// boilerplate. This FRD owes four rows: a `<post>` per use case and an `after` per scenario. No
// `<ext>`, no `<nfr>`, and every plan node is named by the FRD, so there is no "node nobody asked
// for" row here — that one has its own fixture at the bottom of this file.
const COVERS = [
  `<covers item="UC1/post" node="${CARD}"/>`,
  `<covers item="UC2/post" node="${CARD}"/>`,
  `<covers item="S1" node="${LIST}"/>`,
  `<covers item="S2" node="${RESOURCE}"/>`,
].join("\n  ")
// R2: у code-узла без своей команды своя таблица и своё правило — назвать КОМАНДУ, дословно из плана.
// Строка ровно одна: `CARD` изменение СОЗДАЁТ, наряд про него не спрашивает, и фикстура, отвечающая
// больше, чем спрошено, перестаёт быть ответом роли на наряд (askedNodes — одно множество на обоих).
const WITNESS = `<witness node="${LIST}" cmd="mvn test"/>`
const pass = (body = "") => `<review verdict="Pass" grammar="2">\n  ${COVERS}\n  ${WITNESS}\n  ${body}\n</review>`

const REJECT = `<review verdict="Reject" grammar="2">
  ${COVERS}
  ${WITNESS}
  <blocker code="unreachable-antecedent" node="${LIST}" evidence="${CARD}">
    Страница списка ссылается на карточку раньше, чем карточка создана.
  </blocker>
</review>`

test("happy: a Pass carries no blocker and closes the step", () => {
  const r = review(pass())
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
  // the blocker's own node, not the checklist row that happens to name the same path
  const blockerNode = `code="unreachable-antecedent" node="${LIST}"`
  const r = review(REJECT.replace(blockerNode, 'code="unreachable-antecedent" node="src/main/java/org/acme/rest/json/Fruit.java"'))
  assert.match(r.error.detail, /R3 блокер 1 \(unreachable-antecedent\): node=.*Fruit\.java.* не узел плана/)
  assert.equal(review(REJECT.replace(blockerNode, 'code="unreachable-antecedent" node="scenario:S1"')).ok, true, "a scenario node is an id like any other")
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
  assert.deepEqual(parseReview(undefined), { verdict: "", blockers: [], covers: [], witness: [], found: false })
  const multi = `<review verdict="Reject" grammar="1">
  <blocker code="goal-not-delivered" node="${LIST}" evidence="UC1">
    Первая строка
    и вторая.
  </blocker>
</review>`
  assert.equal(parseReview(multi).blockers[0].text, "Первая строка и вторая.")
})

// The false premise that made the whole thing possible, and it has to STAY dead. `critic.md` used to
// say the reverse direction was not the critic's to check «because the plan's nodes come from the
// FRD's own touched paths and deltas, so a node nothing asks for cannot occur» — which is untrue of
// every node steps/plan/plan.mjs synthesises itself.
test("D21: the role answers a LIST, and the premise that forbade half of it is gone", () => {
  const role = readFileSync(fileURLToPath(new URL("./critic.md", import.meta.url)), "utf8")
  assert.doesNotMatch(role, /a node\s+nothing asks for cannot occur/)
  assert.doesNotMatch(role, /The other direction is not\s+yours to check/)
  assert.match(role, /YOU ANSWER A LIST, NOT AN IMPRESSION/)
  assert.match(role, /<covers item="<id>" node="<plan node>"\/>/)
  assert.match(role, /synthesised by the planning step out of the repository's own\s+answers/)
  // …and the role knows which finding is NOT its to write, or it would duplicate the script.
  assert.match(role, /`open-question` is not yours to write/)
})

// The band has to have somewhere to put `operator`: without the branch, a finding no machine can
// repair rewinds to step 6, burns every role of steps 6-11 for REVIEW_ROUNDS and escalates anyway.
// `workflows/` is covered by no test of its own (it runs in a host vm sandbox), so the seam is the
// source, the same device the ENVELOPE and $START_BLAME tests use.
//
// The PROSE for `operator` moved out of this call site (П2, live run 508d74fa): with a second
// `operator` code (`unverifiable-node`) beside `node-not-required`, one hardcoded sentence would have
// been wrong for half of them. band() now prints each finding's own `note` — a function OF THE CODE,
// derived in review.mjs exactly as `culprit`/`owner` are.
test("D21: an `operator` owner stops the band instead of rewinding it, printing each finding's OWN note", () => {
  const izi = readFileSync(fileURLToPath(new URL("../../workflows/izi.js", import.meta.url)), "utf8")
  assert.match(izi, /blockers\.filter\(\(b\) => b\.owner === "operator"\)/)
  assert.match(izi, /mine\.map\(\(b\) => b\.note\)/)
  assert.doesNotMatch(izi, /перемотка полосы над картой не властна/, "the sentence lives in review.mjs's OPERATOR_NOTE now, not composed at the call site")
  assert.match(OPERATOR_NOTE["node-not-required"], /перемотка полосы над картой не властна/)
  // and it is decided BEFORE the rewind branches — otherwise it never runs
  assert.ok(izi.indexOf('b.owner === "operator"') < izi.indexOf("b.owner === 10"), "ветка operator стоит до перемоток")
  assert.match(izi, /OWED: FORM\.owed, UNCHECKED: FORM\.unchecked/)
})

// OPERATOR_NOTE is a function OF THE CODE (docs/review.md §4), the same device CODE_CULPRIT and
// CODE_OWNER are — so every code whose owner is "operator" must have a row, or the band prints "".
// Remove a row and this reddens; the vocabulary test below (near the end of this file) holds the
// mirror direction — no row for a code whose owner is NOT operator.
test("OPERATOR_NOTE определён для каждого кода с owner=operator", () => {
  const operatorCodes = CODES.filter((c) => CODE_OWNER[c] === "operator")
  assert.ok(operatorCodes.length >= 2, operatorCodes.join(", "))   // node-not-required + unverifiable-node
  for (const c of operatorCodes) assert.ok(OPERATOR_NOTE[c], `OPERATOR_NOTE["${c}"] must be non-empty`)
})

// --- D21: the three defects live run c64dbd32 shipped past a green Pass -------------------------
//
// Fixtures COPIED from that run's artifacts (form quarkus-rest-json-app-v2-t2), not invented: the
// plan whose FIRST node is `toggle` — synthesised by steps/plan/plan.mjs out of a spine answer that
// read `maven profiles (-Pnative for native build)` — a page node with no check command of its own,
// and an FRD carrying an unanswered `<question>` plus an `<ext>` branch in both use cases.
const T2_RES = "src/main/java/org/acme/rest/json/FruitResource.java"
const T2_PAGE = "src/main/resources/META-INF/resources/fruits.html"

const PLAN_T2 = {
  grammar: 1,
  order: ["toggle", T2_RES, T2_PAGE, "scenario:S2"],
  gaps: ["spec"],
  nodes: [
    { id: "toggle", kind: "toggle", mechanism: "maven profiles (-Pnative for native build)", deps: [], check: [{ suite: "unit", cmd: "mvn test" }], coveredBy: [] },
    { id: T2_RES, kind: "code", delta: ["GET /fruits/{name} (Added)"], deps: ["toggle"], check: [{ suite: "unit", cmd: "mvn test -Dtest=FruitResourceTest" }], coveredBy: ["scenario:S2"] },
    { id: T2_PAGE, kind: "code", delta: [], deps: [T2_RES], check: [], coveredBy: ["scenario:S2"] },
    { id: "scenario:S2", kind: "scenario", scenario: "S2", deps: [T2_PAGE, T2_RES], check: [{ suite: "unit", cmd: "mvn test" }], coveredBy: [] },
  ],
}

const FRD_T2 = parseFrd(`<frd grammar="1" goal="эндпоинт одного элемента по имени и карточка на странице">
  <usecase id="UC1" actor="client" goal="получить один элемент">
    <post>ответ содержит ровно одну запись</post>
    <step n="1">клиент отправляет запрос по имени</step>
    <ext id="2a" error="none" outcome="элемент с таким именем не найден"/>
  </usecase>
  <usecase id="UC2" actor="user" goal="увидеть карточку">
    <post>карточка выбранного элемента отображена</post>
    <step n="1">пользователь выбирает элемент на странице</step>
    <ext id="2a" error="none" outcome="элемент не найден — карточка не отображается"/>
  </usecase>
  <delta op="GET /items/{name}" form="Added" node="${T2_RES}"/>
  <scenario id="S1" uc="UC1" before="эндпоинта нет" after="эндпоинт отдаёт одну запись" nodes="${T2_RES}"/>
  <scenario id="S2" uc="UC2" before="карточки нет" after="выбор показывает карточку" nodes="${T2_PAGE} ${T2_RES}"/>
  <touched path="${T2_PAGE}" why="вызов и карточка"/>
  <nfr subject="existing-contracts" fit="без_изменений" source="brd.md"/>
  <question subject="not-found" why="ТЗ не определяет ответ при отсутствии элемента"/>
</frd>`)

// Д4 прогона 79650c98 — И ЭТО БЫЛ ДЕФЕКТ САМОЙ ПОЧИНКИ D21. Код `unverifiable-node` был в словаре,
// `{UNCHECKED}` подставлялся в наряд — и ни одно правило не требовало ответа, поэтому роль прошла
// мимо узла с `check: []`, закрытого командами, которые его не исполняют, и вердикт был Pass.
// R2 даёт таблице своё правило, и ответом стала КОМАНДА: назвать узел легко, назвать команду — уже
// решение, и её машина сверяет по плану.
const T2_WITNESS = `<witness node="${T2_PAGE}" cmd="mvn test"/>`
// Узел, который ЧЕСТНО закрывает строку: UC1 и S1 живут на ресурсе, UC2 и S2 — на сценарии S2.
const t2node = (id) => (id.startsWith("UC2") || id === "S2" ? "scenario:S2" : T2_RES)
const t2covers = (skip = "") => owedItems(FRD_T2, PLAN_T2).filter((r) => r.id !== skip)
  .map((r) => `<covers item="${r.id}" node="${t2node(r.id)}"/>`).join("")

test("R6: узел без своей команды закрыт КОМАНДОЙ из плана — молчание и выдумка красят форму", () => {
  const covers = t2covers()
  const silent = newReview({ xml: `<review verdict="Pass" grammar="2">${covers}</review>`, plan: PLAN_T2, frd: FRD_T2 })
  assert.equal(silent.ok, false)
  assert.match(silent.error.detail, /R6 узел .*fruits\.html без своей команды/)

  const good = newReview({ xml: `<review verdict="Pass" grammar="2">${covers}${T2_WITNESS}</review>`, plan: PLAN_T2, frd: FRD_T2 })
  assert.equal(good.ok, true, good.ok ? "" : good.error.detail)

  // Сочинённая команда — красная форма: список команд машина знает и сверяет.
  const made = newReview({ xml: `<review verdict="Pass" grammar="2">${covers}<witness node="${T2_PAGE}" cmd="npm run e2e"/></review>`, plan: PLAN_T2, frd: FRD_T2 })
  assert.equal(made.ok, false)
  assert.match(made.error.detail, /команда КОПИРУЕТСЯ из списка/)

  // Две строки на один узел — тоже красная форма: одна команда, одна строка.
  const twice = newReview({ xml: `<review verdict="Pass" grammar="2">${covers}${T2_WITNESS}${T2_WITNESS}</review>`, plan: PLAN_T2, frd: FRD_T2 })
  assert.equal(twice.ok, false)
  assert.match(twice.error.detail, /2 <witness>/)

  // И блокер закрывает узел вместо witness — это и есть честный ответ «такой команды нет».
  const blamed = newReview({
    xml: `<review verdict="Reject" grammar="2">${covers}<blocker code="unverifiable-node" node="${T2_PAGE}" evidence="S2">ни одна команда сценария не открывает страницу</blocker></review>`,
    plan: PLAN_T2, frd: FRD_T2,
  })
  assert.equal(blamed.ok, true, blamed.ok ? "" : blamed.error.detail)
})

// Д3 — привязку `covers` не судил никто, и `covers item="S1" node="scenario:S2"` уехал в зелёный Pass.
test("R7: строку закрывает узел, который может иметь к ней отношение", () => {
  const rows = owedItems(FRD_T2, PLAN_T2)
  const rest = rows.filter((r) => r.id !== "S1").map((r) => `<covers item="${r.id}" node="${t2node(r.id)}"/>`).join("")
  // дословная ложь прогона: сценарий S1 живёт на ресурсе, узла scenario:S1 в плане нет вовсе
  const lie = newReview({ xml: `<review verdict="Pass" grammar="2">${rest}<covers item="S1" node="scenario:S2"/>${T2_WITNESS}</review>`, plan: PLAN_T2, frd: FRD_T2 })
  assert.equal(lie.ok, false)
  assert.match(lie.error.detail, /R7 <covers item="S1" node="scenario:S2"\/> — этот узел к пункту отношения не имеет/)

  const truth = newReview({ xml: `<review verdict="Pass" grammar="2">${rest}<covers item="S1" node="${T2_RES}"/>${T2_WITNESS}</review>`, plan: PLAN_T2, frd: FRD_T2 })
  assert.equal(truth.ok, true, truth.ok ? "" : truth.error.detail)
})

// Д1. The checklist has a row for `toggle`, and the role cannot stay silent about it. Remove the
// second half of owedItems (the nodes the FRD names nowhere) and this goes green — which is exactly
// the state that shipped a "switch this endpoint with a maven profile" ticket.
test("D21/Д1: a node the FRD names nowhere becomes a checklist row — silence about it is a red form", () => {
  const rows = owedItems(FRD_T2, PLAN_T2)
  const row = rows.find((r) => r.id === "toggle")
  assert.ok(row, rows.map((r) => r.id).join(", "))
  assert.match(row.what, /механизм «maven profiles/)
  // …and the scenario carrier, also synthesised by plan.mjs, is NOT a row: it answers to its own
  // scenario, so demanding a decision about it would be noise on every honest plan.
  assert.equal(rows.some((r) => r.id === "scenario:S2"), false)

  const covers = t2covers("toggle") + T2_WITNESS
  const silent = newReview({ xml: `<review verdict="Pass" grammar="2">${covers}</review>`, plan: PLAN_T2, frd: FRD_T2 })
  assert.equal(silent.ok, false)
  assert.match(silent.error.detail, /R5 пункт "toggle"/)

  const named = newReview({
    xml: `<review verdict="Reject" grammar="2">${covers}<blocker code="node-not-required" node="toggle" evidence="toggle">профиль сборки не переключает поведение работающего приложения</blocker></review>`,
    plan: PLAN_T2, frd: FRD_T2,
  })
  assert.equal(named.ok, true, named.ok ? "" : named.error.detail)
  assert.equal(named.value.blockers[0].owner, "operator", "чинит оператор: узел выведен из карты, а не из требования")
})

// Д2. Two halves: the open question costs no role call at all, and the `<ext>` branch — which the
// role CAN see — is now an address R4 resolves. Before D21 it rejected the honest finding.
test("D21/Д2: an open question is a finding without a role, and an <ext> branch is an address", () => {
  const auto = autoFindings({ frd: FRD_T2 })
  assert.equal(auto.length, 1)
  assert.equal(auto[0].code, "open-question")
  assert.equal(auto[0].evidence, "not-found")
  assert.deepEqual(autoFindings({ frd: parseFrd("<frd/>") }), [])

  const rows = owedItems(FRD_T2, PLAN_T2).map((r) => r.id)
  assert.ok(rows.includes("UC1/2a") && rows.includes("UC2/2a"), rows.join(", "))
  assert.ok(rows.includes("nfr:existing-contracts"), rows.join(", "))

  // R4 accepts the extension id — remove the exts from frdIds and this is a red form again.
  const covers = t2covers("UC1/2a") + T2_WITNESS
  const r = newReview({
    xml: `<review verdict="Reject" grammar="2">${covers}<blocker code="goal-not-delivered" node="${T2_RES}" evidence="UC1/2a">ветку «не найден» не выполняет ни один узел плана</blocker></review>`,
    plan: PLAN_T2, frd: FRD_T2,
  })
  assert.equal(r.ok, true, r.ok ? "" : r.error.detail)
})

// Д3. The page has no command of its own and the scenario that closes it runs java suites: the role
// is handed the node by name and answers which command executes it. `unverifiable-node` is the answer
// when none does — and R4 now takes an FRD id as its evidence.
test("D21/Д3: a node whose only command cannot witness it is expressible", () => {
  const covers = t2covers("S2") + T2_WITNESS
  const r = newReview({
    xml: `<review verdict="Reject" grammar="2">${covers}<blocker code="unverifiable-node" node="${T2_PAGE}" evidence="S2">ни одна команда сценария не исполняет страницу</blocker></review>`,
    plan: PLAN_T2, frd: FRD_T2,
  })
  assert.equal(r.ok, true, r.ok ? "" : r.error.detail)
  // П1 (live run 508d74fa): step 6 has NO honest repair for "no suite exercises this node" — F2
  // forbids a touched/delta on a test, and no rewording of the requirement creates a suite. The old
  // owner (6) rewound to intake, and the only way the role could silence the blocker was deleting the
  // page from the requirement. Reintroduce `"unverifiable-node": 6` in CODE_OWNER and this reddens.
  assert.equal(r.value.blockers[0].owner, "operator", "нет владельца-роли: чинится оператором, а не перемоткой")
  assert.equal(r.value.blockers[0].culprit, "appgraph.xml", "виновник — карта сьютов репозитория, не требование")
  assert.ok(OPERATOR_NOTE["unverifiable-node"], "оператор должен получить три честных выхода, а не пустую строку")
})

// --- 508d74fa: the R4×R5 deadlock over `UC*/post` -------------------------------------------------
// Fixtures COPIED VERBATIM from the live artifacts of sandbox/runbox/quarkus-rest-json-app-v2-t2, run
// 508d74fa (~/.pi/workflows/projects/quarkus-rest-json-app-v2-t2-ec952fd2246f/sessions/
// 01a000f2-11ca-742a-bb41-4a44e9d2ffd4/runs/508d74fa-8966-42b4-aeeb-68a5006cebc2/). FRD_508 is
// `.agent/frd.xml` as it stood on disk — the FRD ALREADY shrunk by one honest-but-cornered rewind
// (`<touched>` empty; `S2@nodes` cut to the resource alone). UC2 and its `<post>` survive. REVIEW_508
// is `.agent/staging/review.xml`, the critic's HONEST answer against that same FRD: three
// `goal-not-delivered` blockers, `UC2/post` among them. PLAN_508 is `.agent/plan-index.json`, one node.
const T508_RES = "src/main/java/org/acme/rest/json/FruitResource.java"

const FRD_508 = parseFrd(`<frd grammar="1" goal="новый эндпоинт одного фрукта по имени и карточка на странице списка">
  <actor name="api-client" kind="system" via="HTTP GET /fruits/{name}"/>
  <actor name="fruits-page-user" kind="human" via="page fruits.html"/>
  <usecase id="UC1" actor="api-client" goal="получить один фрукт по имени">
    <pre>фрукт с заданным именем существует в хранилище</pre>
    <post>получен JSON-объект одного фрукта, имя которого совпадает с запрошенным</post>
    <step n="1">клиент отправляет GET /fruits/{name}</step>
    <step n="2">FruitResource ищет фрукт по имени во внутреннем хранилище</step>
    <step n="3">система возвращает 200 с JSON-объектом фрукта</step>
    <ext id="2a" error="404" outcome="фрукт не найден, возвращается 404 с пустым телом"/>
  </usecase>
  <usecase id="UC2" actor="fruits-page-user" goal="отобразить карточку выбранного фрукта">
    <pre>пользователь на странице списка фруктов</pre>
    <post>карточка с данными выбранного фрукта отображена на странице</post>
    <step n="1">пользователь кликает на фрукт в списке</step>
    <step n="2">страница делает GET /fruits/{name}</step>
    <step n="3">полученный результат отображается в карточке</step>
    <ext id="2a" error="404" outcome="фрукт не найден, карточка не отображается"/>
  </usecase>
  <field name="name" in="GET /fruits/{name}" type="string" domain="fruit name" required="yes" error="404" source="brd.md"/>
  <failure code="404" status="404" client="карточка не отображается" operator="—" from="UC1/2a"/>
  <delta op="GET /fruits/{name}" form="Added" node="${T508_RES}"/>
  <scenario id="S1" uc="UC1" before="эндпоинт GET /fruits/{name} отсутствует" after="эндпоинт возвращает один фрукт по имени (200) или 404" nodes="${T508_RES}"/>
  <scenario id="S2" uc="UC2" before="страница не вызывает GET /fruits/{name} и не показывает карточку" after="страница вызывает GET /fruits/{name} и показывает карточку" nodes="${T508_RES}"/>
  <nfr subject="existing-endpoints" fit="unchanged" source="brd.md"/>
</frd>`)

const PLAN_508 = {
  grammar: 2,
  order: [T508_RES],
  nodes: [{
    id: T508_RES, kind: "code", new: false, delta: ["GET /fruits/{name} (Added)"], deps: [],
    check: [
      { suite: "unit", cmd: "mvn test -Dtest=FruitResourceTest" },
      { suite: "component-native", cmd: "mvn verify -Pnative -Dit.test=FruitResourceIT" },
    ],
    coveredBy: [],
  }],
}

const REVIEW_508 = `<review verdict="Reject" grammar="2">
  <covers item="UC1/post" node="${T508_RES}"/>
  <covers item="UC1/2a" node="${T508_RES}"/>
  <covers item="S1" node="${T508_RES}"/>
  <covers item="nfr:existing-endpoints" node="${T508_RES}"/>
  <blocker code="goal-not-delivered" node="${T508_RES}" evidence="UC2">
    Карточка с данными выбранного фрукта не отображается на странице — нет узла фронтенда.
  </blocker>
  <blocker code="goal-not-delivered" node="${T508_RES}" evidence="UC2/2a">
    Ветвление 404 карточки не реализовано — нет узла фронтенда, который скрывает карточку при ошибке.
  </blocker>
  <blocker code="goal-not-delivered" node="${T508_RES}" evidence="S2">
    Сценарий S2 не выполнен: страница не вызывает GET /fruits/{name} и не показывает карточку.
  </blocker>
</review>`

// review/1 (the live journal): the critic's FIRST honest verdict, against the FULL pre-shrink FRD,
// raised `unverifiable-node · fruits.html`. That blocker is not reproduced here — this fixture is the
// SHRUNK FRD the role produced trying to silence it, and the deadlock this section proves is the ONE
// the role hit next, reaching for the honest repair instead: `goal-not-delivered evidence="UC2"`, an
// FRD id (UC2 exists) that R5 refuses as unrelated to `UC2/post`'s own row.
test("R4: goal-not-delivered резолвит UC2/post — reintroduction: убери UC*/post из frdIds и это краснеет", () => {
  assert.ok(frdIds(FRD_508).has("UC2/post"), "frdIds несёт UC*/post (П3) — без него это пусто")
  // review/2, verbatim: the live run's blocker named `evidence="UC2/post"`, not `"UC2"` — the row R5
  // owes is the `<post>` itself, and only that id closes it (R5, `byEvidence.has(row.id)`).
  const withPostEvidence = REVIEW_508.replace('evidence="UC2"', 'evidence="UC2/post"')
  const r = newReview({ xml: withPostEvidence, plan: PLAN_508, frd: FRD_508 })
  assert.equal(r.ok, true, r.ok ? "" : r.error.detail)
  // Removing the `UC*/post` line from frdIds (steps/review/review.mjs) reproduces review/2 verbatim:
  // `r.error.detail` would read `R4 блокер 1 (goal-not-delivered): evidence="UC2/post" не id FRD`.
})

// review/3 and review/4 (the live journal, identical text twice — the role tried the same move again):
// with `evidence="UC2"` instead (an id R4 already accepted before П3, since UC2 itself always
// resolved), the `UC2/post` ROW stays open — R5 counts by id, and `UC2` closes no `UC2/post` row.
// This is the deadlock's other face: the honest evidence R4 wants is the one string R5 will accept.
test("R4×R5 дедлок review/3: evidence=\"UC2\" не закрывает строку \"UC2/post\" — нужен именно этот id", () => {
  const r = newReview({ xml: REVIEW_508, plan: PLAN_508, frd: FRD_508 })   // verbatim disk content
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /R5 пункт "UC2\/post"/)
  assert.match(r.error.detail, /не закрыт/)
})

// The fix in one shape: the SAME plan and FRD, with evidence naming the row directly, is green by
// FORM and the row is closed — R4 and R5 are simultaneously satisfiable once frdIds knows `UC*/post`.
test("R4×R5 совместны: Reject с evidence=\"UC2/post\" на PLAN_508+FRD_508 зелен по форме, строка закрыта", () => {
  const r = newReview({ xml: REVIEW_508.replace('evidence="UC2"', 'evidence="UC2/post"'), plan: PLAN_508, frd: FRD_508 })
  assert.equal(r.ok, true, r.ok ? "" : r.error.detail)
  assert.equal(r.value.verdict, "Reject")
  assert.ok(r.value.blockers.some((b) => b.evidence === "UC2/post" && b.owner === 6), "goal-not-delivered остаётся у шага 6")
})

// The two seams the SLICE keeps outside the core, the same pair steps/design/design.test.mjs holds:
// the order carries exactly the keys the workflow passes (prompt() demands a bidirectional match and
// throws at LAUNCH otherwise), and the role's frontmatter survives YAML.
// Слоты против ключей полосы судит core/orders.test.mjs — для ВСЕХ нарядов сразу и читая
// workflows/izi.js. Список, набранный здесь руками, сходился с шаблоном всегда.

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

// --- R6, вторая половина: witness обязан быть достижим тестом сьюта --------------------------------
//
// Реинтродукция прогонов 79650c98 и 0aa13bff (форма quarkus-rest-json-app-v2-t2): критик закрыл
// статическую страницу командой java-сьюта, который её не открывает, и оба вердикта были Pass.
// Карта знала это всё время — у страницы `fanin="0"`, ни одно ребро в неё не ведёт.
const APPGRAPH = `<appgraph grammar="3">
  <suite id="unit" kind="unit" cmd="mvn test" one="-Dtest={class}" path="src/test/java" match="*Test.java"/>
  <module path="${RESOURCE}" kind="code">
    <test path="src/test/java/org/acme/rest/json/FruitResourceTest.java" suite="unit"/>
  </module>
  <module path="${LIST}" kind="code"/>
  <module path="${CARD}" kind="code"/>
  <module path="src/test/java/org/acme/rest/json/FruitResourceTest.java" kind="test" suite="unit"/>
  <edge from="src/test/java/org/acme/rest/json/FruitResourceTest.java" to="${RESOURCE}" via=".when().get(&quot;/fruits&quot;)" by="use"/>
  <edge from="${LIST}" to="${RESOURCE}" via="url: '/fruits'," by="use"/>
  <edge from="src/test/java/org/acme/rest/json/FruitResourceTest.java" to="${CARD}" via=".when().get(&quot;/fruit-card.html&quot;)" by="use"/>
</appgraph>`

const MAP = parseMap(APPGRAPH)
const reviewMapped = (xml) => newReview({ xml, plan: PLAN, frd: FRD, map: MAP })

test("R6: witness командой, которая до узла не доходит, — не свидетель", () => {
  // LIST закрывается сценарием S1 с командой `mvn test`, и роль назвала её свидетелем. В карте от
  // тестов сьюта `unit` до страницы пути нет: ребро идёт ОТ страницы к ресурсу, а не к ней.
  const xml = `<review verdict="Pass" grammar="2">${COVERS}
    <witness node="${LIST}" cmd="mvn test"/>
  </review>`
  const r = reviewMapped(xml)
  assert.equal(r.ok, false)
  assert.match(r.error.detail, new RegExp(`R6 <witness node="${LIST}" cmd="mvn test"/> — эту команду не исполняет ни один тест`))
  assert.match(r.error.detail, /блокер unverifiable-node, а не свидетель/)

  // Без карты правило молчит — ровно тот зелёный, который выдали оба живых прогона.
  assert.equal(newReview({ xml, plan: PLAN, frd: FRD }).ok, true)
})

test("R6: узел, до которого тест сьюта доходит по ребру, свидетелем закрывается", () => {
  // Достижимость, а не наличие собственного теста: ресурс в карте достижим из FruitResourceTest.
  const reach = reachedBy(MAP, "unit")
  assert.ok(reach.has(RESOURCE), [...reach].join(" "))
  assert.ok(!reach.has(LIST))

  // Тот же артефакт, где страница закрыта честным блокером, а не свидетелем, — форма зелёная.
  const xml = `<review verdict="Reject" grammar="2">${COVERS}
    <blocker code="unverifiable-node" node="${LIST}" evidence="S1">ни одна команда сценария не открывает страницу</blocker>
  </review>`
  const r = reviewMapped(xml)
  assert.equal(r.ok, true, r.ok ? "" : r.error.detail)
  assert.equal(r.value.blockers[0].owner, "operator")
})

test("R6: несуществующий сьют у команды — тоже не свидетель", () => {
  // Команда скопирована верно, но её сьют карте неизвестен: доказать наблюдение нечем.
  const plan = { ...PLAN, nodes: PLAN.nodes.map((n) => (n.id === "scenario:S1" ? { ...n, check: [{ suite: "e2e", cmd: "mvn test" }] } : n)) }
  const xml = `<review verdict="Pass" grammar="2">${COVERS}
    <witness node="${LIST}" cmd="mvn test"/>
  </review>`
  const r = newReview({ xml, plan, frd: FRD, map: MAP })
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /R6 <witness node=/)
})

// --- D23: чего R6 не судит — операнд оператора и два операнда, которых нет вовсе ------------------
//
// Гейт шага 6 спрашивает оператора про узел, который не исполняет ни один сьют (steps/ripple/
// ripple.mjs::blindNodes), и ответ живёт в .agent/answers.md. Здесь — вторая половина того же
// решения: узел с ответом `accept` из цикла R6 уходит, иначе шаг 11 останавливает полосу на вопросе,
// на который оператор уже ответил (эскалация прогона 21dd9b34).
const waiverAnswers = (node, word) =>
  newAnswers(newExchange([{ n: 1, question: `${BLIND_STEM(node)}${BLIND_TAIL}`, text: word }]).value).value

test("шов 5: R6 молчит про узел, неверифицируемость которого оператор принял на гейте шага 6", () => {
  // Страницу не закрывает ни свидетель, ни блокер — сегодняшний красный R6.
  const xml = `<review verdict="Pass" grammar="2">${COVERS}</review>`
  const red = newReview({ xml, plan: PLAN, frd: FRD, map: MAP })
  assert.equal(red.ok, false)
  assert.match(red.error.detail, /R6 узел .*fruits\.html без своей команды/)

  // Тот же артефакт при ответе `accept` на диске — зелёный: убрать операнд `answers`, и он снова
  // красный, то есть оператора спрашивают второй раз о том, что он уже решил.
  const green = newReview({ xml, plan: PLAN, frd: FRD, map: MAP, answers: waiverAnswers(LIST, "accept") })
  assert.equal(green.ok, true, green.ok ? "" : green.error.detail)

  // Waiver — это именно `accept`: «заведу сьют» полосу не пропускает, и шаг 11 остаётся страховкой.
  const suite = newReview({ xml, plan: PLAN, frd: FRD, map: MAP, answers: waiverAnswers(LIST, "suite") })
  assert.equal(suite.ok, false)
})

// Карта формы quarkus-rest-json-app-v2-t3, ВЫПИСКА ДОСЛОВНО (appgraph.xml: строки 1, 3-4, 44, 54-55,
// 79, 108, 110): fruit-card.html в ней НЕТ и быть не может — карта построена до того, как файл создан.
const APPGRAPH_T3 = `<appgraph grammar="4" modules="17" components="2" isolated="7" levels="4">
  <suite id="unit" kind="unit" cmd="mvn test" one="-Dtest={class}" path="src/test/java" match="*Test.java"/>
  <suite id="component-native" kind="component" cmd="mvn verify -Pnative" one="-Dit.test={class}" path="src/test/java" match="*IT.java"/>
  <module path="${RESOURCE}" pkg="org.acme.rest.json" component="c1" level="3" fanin="2" fanout="1">
    <test path="src/test/java/org/acme/rest/json/FruitResourceTest.java" suite="unit"/>
    <test path="src/test/java/org/acme/rest/json/FruitResourceIT.java" suite="component-native"/>
  </module>
  <module path="${LIST}" component="c1" level="1" fanin="0" fanout="1"/>
  <module path="src/test/java/org/acme/rest/json/FruitResourceTest.java" pkg="org.acme.rest.json" kind="test" suite="unit" component="c1" level="2" fanin="1" fanout="1"/>
  <edge from="${LIST}" to="${RESOURCE}" via="url: '/fruits'," by="use"/>
  <edge from="src/test/java/org/acme/rest/json/FruitResourceTest.java" to="${RESOURCE}" via=".when().get(&quot;/fruits&quot;)" by="use"/>
</appgraph>`

test("шов 6: R6 не судит создаваемый узел ВОВСЕ — операнда нет ни у одной половины", () => {
  // Замена над сохранёнными артефактами t3 (0 токенов) показала это: R6 краснел на fruit-card.html —
  // узле с `new: true`, которого в карте нет и никогда не будет, потому что карта старше файла.
  // Узел уходит из правила целиком и ОДНИМ выражением: убрать `!n.new` из askedNodes — и роль,
  // ответившая наряду дословно (наряд про этот узел не спрашивает), получает блокер обратно.
  const map = parseMap(APPGRAPH_T3)
  assert.equal(map.nodes.has(CARD), false, "создаваемого узла в карте нет по построению")

  const xml = `<review verdict="Reject" grammar="2">${COVERS}
    <blocker code="unverifiable-node" node="${LIST}" evidence="S1">ни одна команда сценария не открывает страницу</blocker>
  </review>`
  const r = newReview({ xml, plan: PLAN, frd: FRD, map })
  assert.equal(r.ok, true, r.ok ? "" : r.error.detail)

  // Наряд и правило спрашивают одно множество: создаваемого узла нет ни там, ни там.
  assert.equal(askedNodes({ plan: PLAN }).map((n) => n.id).includes(CARD), false)
  assert.deepEqual(createdNodes({ plan: PLAN }).map((n) => n.id), [CARD])
})

test("шов 10: выдуманный <witness> на создаваемый узел МОЛЧИТ — судить его нечем", () => {
  // Обратная сторона шва 6, и она стоит отдельного юнита: половина «команда КОПИРУЕТСЯ из списка»
  // тоже осталась без операнда — команды, исполняющей файл, которого ещё нет, нет ни у кого, а
  // сочинённая роль не наказывается только потому, что про такой узел не спрашивают. Вернуть цикл R6
  // по всем узлам плана — и строка снова судится.
  const map = parseMap(APPGRAPH_T3)
  const xml = `<review verdict="Reject" grammar="2">${COVERS}
    <witness node="${CARD}" cmd="npx playwright test"/>
    <blocker code="unverifiable-node" node="${LIST}" evidence="S1">ни одна команда сценария не открывает страницу</blocker>
  </review>`
  const r = newReview({ xml, plan: PLAN, frd: FRD, map })
  assert.equal(r.ok, true, r.ok ? "" : r.error.detail)
})

test("шов 7: карта без единой привязки теста мнения не имеет — половина карты молчит", () => {
  // Форма eddi: 92 узла, ни одного <test> внутри модуля. Выписка карты дословная (appgraph.xml:
  // строки 1, 3, 5-6, 28, 69); плана у этой формы на диске нет — прогон встал раньше шага 10, — так
  // что план здесь построен над её же узлами. Вернуть `if (map)` без проверки nodeTests — и роль
  // получает блокер на каждом узле ширины, честной починки у неё нет, LOOPS сгорают.
  const EDDI_MAP = parseMap(`<appgraph grammar="3" modules="92" components="4" isolated="8" levels="6">
  <paths prefix="src/main/java/ai/labs/eddi/"/>
  <suite id="unit" kind="unit" cmd="./mvnw test" one="-Dtest={class}" path="src/test/java" match="*Test.java"/>
  <suite id="component" kind="component" cmd="./mvnw verify" one="-Dit.test={class}" path="src/test/java" match="*IT.java"/>
  <module path="src/main/java/ai/labs/eddi/backup/IResourceSource.java" pkg="ai.labs.eddi.backup" component="c1" level="5" fanin="9" fanout="1">
    <role>Interface defining data source contracts for reading agent, workflow, and snippet backup resources</role>
  </module>
  <module path="src/main/java/ai/labs/eddi/backup/impl/RestExportService.java" pkg="ai.labs.eddi.backup.impl" component="c1" level="1" fanin="0" fanout="6">
    <role>REST service for exporting agent configurations to ZIP archives with preview support</role>
  </module>
</appgraph>`)
  assert.equal(EDDI_MAP.nodeTests.size, 0)

  const SRC = "src/main/java/ai/labs/eddi/backup/IResourceSource.java"
  const EXPORT = "src/main/java/ai/labs/eddi/backup/impl/RestExportService.java"
  const plan = {
    grammar: 1,
    order: [SRC, EXPORT, "scenario:S1"],
    nodes: [
      { id: SRC, kind: "code", delta: ["IResourceSource.readGlossaries (Added)"], deps: [], check: [], coveredBy: ["scenario:S1"] },
      { id: EXPORT, kind: "code", delta: ["RestExportService (Added)"], deps: [SRC], check: [], coveredBy: ["scenario:S1"] },
      { id: "scenario:S1", kind: "scenario", scenario: "S1", deps: [SRC, EXPORT], check: [{ suite: "unit", cmd: "./mvnw test" }], coveredBy: [] },
    ],
  }
  const frd = parseFrd(`<frd grammar="1" goal="ввести глобальный ресурс глоссарий">
  <usecase id="UC1" actor="admin" goal="экспортировать глоссарии">
    <post>архив содержит глоссарии</post>
    <step n="1">админ запрашивает экспорт</step>
  </usecase>
  <delta op="IResourceSource.readGlossaries" form="Added" node="${SRC}"/>
  <scenario id="S1" uc="UC1" before="экспорт без глоссариев" after="экспорт включает глоссарии" nodes="${SRC} ${EXPORT}"/>
  <touched path="${EXPORT}" why="добавлена запись {id}.glossary.json в ZIP-архив экспорта"/>
</frd>`)
  const xml = `<review verdict="Pass" grammar="2">
    <covers item="UC1/post" node="scenario:S1"/>
    <covers item="S1" node="scenario:S1"/>
    <witness node="${SRC}" cmd="./mvnw test"/>
    <witness node="${EXPORT}" cmd="./mvnw test"/>
  </review>`
  const r = newReview({ xml, plan, frd, map: EDDI_MAP })
  assert.equal(r.ok, true, r.ok ? "" : r.error.detail)
})
