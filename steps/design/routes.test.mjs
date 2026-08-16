// Pass C of the slice `design`: the routes and the joint they make with the graph — a PURE core; its
// io lives in ext/index.mjs (standards/code.md: an io pipe is not unit-tested). Formula:
// 1 happy + Σ antecedent branches with a DISTINGUISHABLE consequent. The branches are rules 1, 2, 3,
// 4, 5 and 7 of docs/data-flow.md §6, which moved here whole from steps/design/design.mjs — numbers
// unchanged — plus the SHAPE of the report itself (one line per fact, scenarios in the tail, rules 3
// and 4 grouped by the receiving node), which is a rule of its own and has its own seam. Each was
// built by REINTRODUCING the defect into a green fixture.
//
// The FRD fixture is PARSED, not typed, and so are the DICTIONARY and the GRAPH: all three reach this
// core exactly as steps/intake/frd.mjs, steps/design/values.mjs and steps/design/nodes.mjs hand them
// over. A fixture that invents its own shape is how discrepancy A got in (steps/design/design.mjs,
// BUG_FIX_CONTEXT of checkDesign: rule 5 reddening on every real artifact with «[object Object]»).

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { parseRoutes, checkRoutes } from "./routes.mjs"
import { parseNodes, cards } from "./nodes.mjs"
import { parseValues } from "./values.mjs"
import { parseFrd } from "../intake/frd.mjs"

// The same change as steps/design/nodes.test.mjs' fixture — the dictionary and the graph of the
// booking, frozen by their own passes before this one starts.
const VALUES_XML = `<values>
  <value id="v1" text="POST /bookings {slotId,userId}"/>
  <value id="v2" text="book(slotId,userId)"/>
  <value id="v3" text="lock(slotId,ttl)"/>
  <value id="v4" text="409 SLOT_TAKEN"/>
  <value id="v5" text="Taken"/>
  <value id="v6" text="Conflict(slotId)"/>
  <value id="v7" text="Booked(bookingId)"/>
  <value id="v8" text="201 {bookingId}"/>
  <value id="v9" text="save(slotId,lock)"/>
  <value id="v10" text="Saved"/>
  <value id="v11" text="Lock"/>
</values>`

const GRAPH = `<design mode="major" base=".agent/appgraph.xml">
  <module path="src/BookingResource.java" delta="Changed">
    <contract in="v1 | v7 | v6" out="v2 | v8 | v4"/>
    <dep path="src/BookingService.java"/>
  </module>
  <module path="src/BookingService.java" delta="Changed">
    <contract in="v2 | v5 | v11" out="v3 | v6 | v7"/>
    <dep path="src/SlotLock.java"/>
  </module>
  <module path="src/SlotLock.java" delta="Added">
    <contract in="v3 | v10" out="v5 | v9 | v11"/>
    <dep path="src/SlotRepo.java"/>
  </module>
  <module path="src/SlotRepo.java">
    <contract in="v9" out="v10"/>
  </module>
</design>`

// Three scenarios of one use case: the slot is taken (S1), the slot is taken and the lock was written
// first (S1b), the booking succeeds (S2). S1 and S1b are DIFFERENT routes that meet the SAME joint
// SlotLock -> BookingService — that is what makes the dedup of §8 provable rather than a coincidence
// of two identical strings.
const ROUTES = `<routes>
  <route scenario="S1" entry="v1" steps="src/BookingResource.java@v2 -> src/BookingService.java@v3 -> src/SlotLock.java@v5 -> src/BookingService.java@v6 -> src/BookingResource.java@v4"/>
  <route scenario="S1b" entry="v1" steps="src/BookingResource.java@v2 -> src/BookingService.java@v3 -> src/SlotLock.java@v9 -> src/SlotRepo.java@v10 -> src/SlotLock.java@v5 -> src/BookingService.java@v6 -> src/BookingResource.java@v4"/>
  <route scenario="S2" entry="v1" steps="src/BookingResource.java@v2 -> src/BookingService.java@v3 -> src/SlotLock.java@v9 -> src/SlotRepo.java@v10 -> src/SlotLock.java@v11 -> src/BookingService.java@v7 -> src/BookingResource.java@v8"/>
</routes>`

const FRD_XML = `<frd grammar="1" goal="бронь слота с блокировкой">
  <usecase id="UC1" actor="client" goal="забронировать слот">
    <post>слот забронирован либо отказ 409</post>
    <step n="1">клиент отправляет POST /bookings</step>
  </usecase>
  <delta op="POST /bookings" form="Changed" node="src/BookingResource.java" from="бронь без блокировки" to="бронь с блокировкой слота"/>
  <scenario id="S1" uc="UC1" before="двойная бронь проходит" after="вторая бронь получает 409" nodes="src/BookingResource.java"/>
  <scenario id="S1b" uc="UC1" before="блокировка не пишется" after="блокировка записана, вторая бронь получает 409" nodes="src/SlotLock.java"/>
  <scenario id="S2" uc="UC1" before="бронь не ставит блокировку" after="бронь ставит блокировку слота" nodes="src/BookingResource.java"/>
  <touched path="src/BookingResource.java" why="ветка 409"/>
  <touched path="src/BookingService.java" why="блокировка перед записью"/>
  <touched path="src/SlotLock.java" why="новый модуль блокировки"/>
</frd>`

const FRD = parseFrd(FRD_XML)

// `values` and `nodes` arrive already parsed — pass C judges the STITCH of two frozen artifacts and
// re-judges neither (docs/design-step-by-step.md §7).
const blockersOf = (routes = ROUTES, { graph = GRAPH, values = VALUES_XML, frd = FRD, edges = [] } = {}) =>
  checkRoutes({ routes: parseRoutes(routes), nodes: parseNodes(graph), values: parseValues(values), frd, edges })

test("happy: every step names a value the node produces, every neighbour accepts it, every branch is taken", () => {
  const routes = parseRoutes(ROUTES)
  assert.deepEqual(routes.map((r) => r.scenario), ["S1", "S1b", "S2"])
  // A step refers to a value by NAME, and so does the entry — nothing here is a position
  // (docs/data-flow.md §4a).
  assert.equal(routes[0].entry, "v1")
  assert.deepEqual(routes[0].steps[2], { path: "src/SlotLock.java", value: "v5" })

  assert.deepEqual(blockersOf(), [])
})

// THE SEAM OF RULE 4, and of the report's shape at the same time. Renaming what SlotLock hands over
// breaks one JOINT, and two scenarios walk through it: the report must carry ONE line with both of
// them at the end. Put the old `<scenario>#<k>` prefix back — the same defect becomes two facts, the
// count below goes to 2, and `core/findings.mjs::carriedBlockers` starts reading a repaired blocker
// as a new one every round (docs/design-step-by-step.md §8, live run 0bbf7054: 81 lines / 48 facts).
test("rule 4's seam: the neighbour does not accept what it is handed — one fact, two scenarios in the tail", () => {
  const b = blockersOf(
    ROUTES.replaceAll("src/SlotLock.java@v5", "src/SlotLock.java@v12"),
    {
      graph: GRAPH.replace('out="v5 | v9 | v11"', 'out="v12 | v9 | v11"'),
      values: VALUES_XML.replace("</values>", '  <value id="v12" text="Occupied"/>\n</values>'),
    },
  )
  assert.deepEqual(b, [
    "4 src/BookingService.java не принимает v12 «Occupied» от src/SlotLock.java (S1, S1b)",
  ])
})

// The other half of §8: the facts of rules 3 and 4 are emitted grouped by the node that must be
// REPAIRED, not in the order the walk met them. Here the walk of S1 meets BookingService, then
// SlotLock, then BookingService again — remove the grouping and the two facts about BookingService
// fall apart with SlotLock's between them.
test("rules 3 and 4 group by the receiving node — the report is the list of places to repair", () => {
  const b = blockersOf(
    ROUTES.replaceAll("src/BookingResource.java@v2", "src/BookingResource.java@v13")
      .replaceAll("src/BookingService.java@v3", "src/BookingService.java@v14")
      .replaceAll("src/SlotLock.java@v5", "src/SlotLock.java@v12"),
    {
      graph: GRAPH.replace('out="v2 | v8 | v4"', 'out="v13 | v8 | v4"')
        .replace('out="v3 | v6 | v7"', 'out="v14 | v6 | v7"')
        .replace('out="v5 | v9 | v11"', 'out="v12 | v9 | v11"'),
      values: VALUES_XML.replace("</values>", '  <value id="v12" text="Occupied"/>\n  <value id="v13" text="book(slotId)"/>\n  <value id="v14" text="lock(slotId)"/>\n</values>'),
    },
  )
  assert.deepEqual(b, [
    "4 src/BookingService.java не принимает v13 «book(slotId)» от src/BookingResource.java (S1, S1b, S2)",
    "4 src/BookingService.java не принимает v12 «Occupied» от src/SlotLock.java (S1, S1b)",
    "4 src/SlotLock.java не принимает v14 «lock(slotId)» от src/BookingService.java (S1, S1b, S2)",
  ])
})

// The seam of the whole pass: the role picks a name it SEES on its card. A number it counted out of a
// contract is what live run 0bbf7054 got «нет альтернативы #12» for — five and six lines of it.
test("rule 1: the blocker speaks the NAME — of the value, of the entry, of the node", () => {
  // A value the node does not produce. One fact, and the text of the dictionary is beside the id
  // because a bare id is not a diagnosis.
  const off = blockersOf(ROUTES.replace("src/SlotLock.java@v5 ->", "src/SlotLock.java@v99 ->"))
  assert.deepEqual(off, ["1 у узла src/SlotLock.java нет значения v99 в out (S1)"])
  for (const x of off) assert.doesNotMatch(x, /#/)

  // An invented module: short-circuited, and the two scenarios that stepped into it ride in the tail
  // of ONE line, not of three (the third scenario walks a different step).
  const gone = blockersOf(ROUTES.replaceAll("src/SlotRepo.java@v10", "src/Nope.java@v10"))
  assert.equal(gone.filter((x) => x.startsWith("1 ")).length, 1)
  assert.equal(gone[0], "1 узла нет в дизайн-графе — src/Nope.java (S1b, S2)")
  assert.equal(gone.filter((x) => x.startsWith("3 ") || x.startsWith("4 ")).length, 0)

  // The entry: what STARTS a scenario is named, never taken as `in[0]` by position (the defect of
  // live run ffe8cb7b — steps/design/design.mjs, walk's BUG_FIX_CONTEXT). Not named at all is the
  // case the run produced: the attribute is simply absent.
  const bare = blockersOf(ROUTES.replaceAll(' entry="v1"', ""))
  assert.equal(bare[0], "1 у первого узла src/BookingResource.java нет значения (значение не названо) в in — маршрут обязан НАЗВАТЬ, каким внешним вызовом он запущен; если подходящего значения нет, значит вход в контракте узла не объявлен (S1, S1b, S2)")
})

test("rule 2: a node with a delta that no route passes through — and rule 7 stays silent about it", () => {
  const graph = GRAPH.replace("</design>", `  <module path="src/AuditLog.java" delta="Added">
    <contract in="v7" out="v10"/>
  </module>
</design>`)
  assert.deepEqual(blockersOf(ROUTES, { graph }), ['2 узел с delta="Added" не встречен ни в одном маршруте — src/AuditLog.java'])
})

test("rule 3: the route teleports past the dependencies — and the branch it abandoned loses its unit", () => {
  // The values join up (v7 is a legitimate input for Notifier), but there is no edge: rule 4 stays
  // silent, exactly rule 3 goes red.
  const graph = GRAPH.replace("</design>", `  <module path="src/Notifier.java" delta="Added">
    <contract in="v7" out="v10"/>
  </module>
</design>`)
  const b = blockersOf(ROUTES.replace("src/BookingService.java@v7 -> src/BookingResource.java@v8", "src/BookingService.java@v7 -> src/Notifier.java@v10"), { graph })
  assert.deepEqual(b, [
    "3 src/Notifier.java недостижим из src/BookingService.java — нет ребра <dep> между ними (S2)",
    // Cutting the last step of S2 also took the `201 {bookingId}` branch out of every route — rule 7
    // says so on its own line. That is the connection rule 7 exists for: a branch nobody routes has
    // no unit in the ticket, and nothing else in the pipeline would have noticed.
    '7 узел src/BookingResource.java с delta="Changed": значение v8 «201 {bookingId}» в out не пройдено ни одним маршрутом — ветка мертва либо сценария FRD не хватает',
  ])
})

test("rule 5: an FRD scenario without a route, and touched outside all routes", () => {
  const frd = parseFrd(FRD_XML.replace("</frd>", `
    <scenario id="S3" uc="UC1" before="письмо не уходит" after="письмо уходит" nodes="src/BookingResource.java"/>
    <touched path="src/Mailer.java" why="письмо о брони"/>
  </frd>`))
  assert.deepEqual(blockersOf(ROUTES, { frd }), [
    "5 у сценария FRD S3 нет маршрута",
    "5 touched FRD не встречен ни в одном маршруте — src/Mailer.java",
  ])
})

test("rule 7: an out branch no route takes has no unit in the ticket", () => {
  assert.deepEqual(
    blockersOf(ROUTES, {
      graph: GRAPH.replace('out="v5 | v9 | v11"', 'out="v5 | v9 | v11 | v12"'),
      values: VALUES_XML.replace("</values>", '  <value id="v12" text="Expired"/>\n</values>'),
    }),
    ['7 узел src/SlotLock.java с delta="Added": значение v12 «Expired» в out не пройдено ни одним маршрутом — ветка мертва либо сценария FRD не хватает'],
  )
})

// --- R1, rule 10: the mirror of rule 7, on the live artifacts that shipped without it -------------
//
// Run 79650c98 (form quarkus-rest-json-app-v2-t2). The FRD declared a branch in BOTH use cases
// («карточка не отображается»), pass B put it honestly into the page's `in` as v15, and pass C ran
// the route as far as the resource and stopped: the failure never travelled back to the page. Step 9
// went green with two units for that node and none for the branch — the unit of a declared branch
// dropped out of the future ticket's `<dod>`, which is exactly what rule 7 exists to prevent, on the
// other side of the contract. Fixtures are the artifacts VERBATIM.
const NODES_79 = `<design mode="minor" base=".agent/appgraph.xml">
  <module path="src/main/java/org/acme/rest/json/FruitResource.java" delta="Added">
    <contract in="v1" out="v14 | v15 | v16"/>
  </module>
  <module path="src/main/resources/META-INF/resources/fruits.html" delta="Changed">
    <contract in="v2 | v15 | v16" out="v1 | v17"/>
    <dep path="src/main/java/org/acme/rest/json/FruitResource.java"/>
  </module>
</design>`
const VALUES_79 = `<values>
  <value id="v1" text="GET /fruits/{name} {name}"/>
  <value id="v2" text="выбор фрукта в списке {name}"/>
  <value id="v14" text="NotFound(name)"/>
  <value id="v15" text="404 NOT_FOUND"/>
  <value id="v16" text="200 {name, description}"/>
  <value id="v17" text="карточка {name, description}"/>
</values>`
const RES_79 = "src/main/java/org/acme/rest/json/FruitResource.java"
const PAGE_79 = "src/main/resources/META-INF/resources/fruits.html"
const FRD_79 = parseFrd(`<frd grammar="1" goal="эндпоинт одного элемента и карточка">
  <scenario id="S1" uc="UC1" before="нет" after="есть" nodes="${RES_79}"/>
  <scenario id="S2" uc="UC2" before="нет" after="есть" nodes="${PAGE_79} ${RES_79}"/>
</frd>`)
// The routes as the run wrote them: S2b stops at the resource with the failure in hand.
const ROUTES_79 = `<routes>
  <route scenario="S1" entry="v1" steps="${RES_79}@v16"/>
  <route scenario="S1b" entry="v1" steps="${RES_79}@v14"/>
  <route scenario="S2" entry="v2" steps="${PAGE_79}@v1 -> ${RES_79}@v16 -> ${PAGE_79}@v17"/>
  <route scenario="S2b" entry="v2" steps="${PAGE_79}@v1 -> ${RES_79}@v15"/>
</routes>`
const r79 = (routes = ROUTES_79) => checkRoutes({
  routes: parseRoutes(routes), nodes: parseNodes(NODES_79), values: parseValues(VALUES_79), frd: FRD_79,
})

test("rule 10's seam: an `in` the FRD declared and no route delivers — on the live artifacts", () => {
  const b = r79().filter((l) => l.startsWith("10 "))
  assert.equal(b.length, 1, r79().join("\n"))
  assert.match(b[0], new RegExp(`^10 узел ${PAGE_79} с delta="Changed": значение v15`))
  assert.match(b[0], /в in не доставлено ни одним маршрутом/)
})

test("the way out of rule 10: carry the route back to the node that declared the input", () => {
  // S2b continues to the page, which renders «no card». The branch is delivered, the unit exists.
  const fixed = ROUTES_79.replace(`steps="${PAGE_79}@v1 -> ${RES_79}@v15"`, `steps="${PAGE_79}@v1 -> ${RES_79}@v15 -> ${PAGE_79}@v17"`)
  assert.deepEqual(r79(fixed).filter((l) => l.startsWith("10 ")), [])
})

test("rule 10 judges only nodes with a delta, and stays silent where 4 or 7 already spoke", () => {
  // A transit node keeps as many inputs as it likes — no ticket will be written for it.
  const transit = NODES_79.replace('path="src/main/resources/META-INF/resources/fruits.html" delta="Changed"', 'path="src/main/resources/META-INF/resources/fruits.html"')
  assert.deepEqual(
    checkRoutes({ routes: parseRoutes(ROUTES_79), nodes: parseNodes(transit), values: parseValues(VALUES_79), frd: FRD_79 }).filter((l) => l.startsWith("10 ")),
    [],
  )
  // And one missing step is ONE defect: where rule 7 already named the untaken branch, rule 10 does
  // not name its other half. Drop the `refused` guard and this goes to two lines.
  const cut = ROUTES_79.replace(` -> ${PAGE_79}@v17"`, '"')
  const b = r79(cut)
  assert.equal(b.filter((l) => l.startsWith("7 ")).length, 1, b.join("\n"))
  assert.equal(b.filter((l) => l.startsWith("10 ") && l.includes(PAGE_79)).length, 0, "одна дыра — одна строка")
})

test("rule 1 at the ID: a route's scenario is derived from the FRD, never composed", () => {
  // Rule 5 walks FRD → routes; nothing walked the other way, so `S9x` — a typo or an invention — was
  // accepted in silence, and the flow section of the deliverable is cut BY this id.
  const bogus = ROUTES_79.replace('scenario="S1b"', 'scenario="S9x"')
  const b = r79(bogus).filter((l) => l.startsWith("1 маршрут"))
  assert.equal(b.length, 1, r79(bogus).join("\n"))
  assert.match(b[0], /^1 маршрут S9x: такого сценария в FRD нет/)
  // …and the legitimate second route through a scenario keeps passing: `S1b` derives from `S1`.
  assert.deepEqual(r79().filter((l) => l.startsWith("1 маршрут")), [])
})

const RES_09 = "src/main/java/org/acme/rest/json/FruitResource.java"
const FRUIT_09 = "src/main/java/org/acme/rest/json/Fruit.java"
const PAGE_09 = "src/main/resources/META-INF/resources/fruits.html"

// --- Rule 11: a failure branch may not end in success — on the artifacts that nearly shipped it ---
//
// Live run 09d11a84. The dictionary had no value for the page's not-found ending, so rule 10's demand
// could only be met by writing «404 → the card WITH THE FRUIT'S DATA is shown». The role wrote it
// twice; the run stopped by ACCIDENT, on rule 9, and only because one of the two forms starts at the
// resource. The other form — the one that RETURNS to the page — is green under all ten rules, and the
// lie would have shipped into the ticket's units. Fixtures are that round's artifacts VERBATIM.
const NODES_09 = `<design mode="minor" base=".agent/appgraph.xml">
  <module path="src/main/java/org/acme/rest/json/FruitResource.java" delta="Added">
    <contract in="v3 | v7" out="v2 | v6 | v16"/>
    <dep path="src/main/java/org/acme/rest/json/Fruit.java"/>
  </module>
  <module path="src/main/java/org/acme/rest/json/Fruit.java">
    <contract in="v6" out="v7"/>
  </module>
  <module path="src/main/resources/META-INF/resources/fruits.html" delta="Changed">
    <contract in="v2 | v4 | v16" out="v3 | v17"/>
    <dep path="src/main/java/org/acme/rest/json/FruitResource.java"/>
  </module>
</design>`
const VALUES_09 = `<values>
  <value id="v2" text="404 404"/>
  <value id="v3" text="GET /fruits/{name} {name}"/>
  <value id="v4" text="выбор фрукта на странице списка {name}"/>
  <value id="v6" text="Fruit(String name, String description)"/>
  <value id="v7" text="Fruit(name, description)"/>
  <value id="v16" text="200 Fruit(name, description)"/>
  <value id="v17" text="карточка с данными фрукта"/>
</values>`
const FRD_09 = parseFrd(`<frd grammar="1" goal="один фрукт по имени и карточка">
  <usecase id="UC1" actor="client-ui" goal="получить один фрукт">
    <ext id="2a" error="404" outcome="фрукт не найден, возвращается статус 404 с пустым телом"/>
  </usecase>
  <usecase id="UC2" actor="client-ui" goal="увидеть карточку">
    <ext id="3a" error="404" outcome="фрукт не найден, карточка не отображается"/>
  </usecase>
  <failure code="404" status="404" client="не отображать карточку" operator="—" from="UC1/2a"/>
  <scenario id="S1" uc="UC1" before="нет" after="есть" nodes="${RES_09}"/>
  <scenario id="S2" uc="UC2" before="нет" after="есть" nodes="${PAGE_09} ${RES_09}"/>
</frd>`)
const r09 = (routes) => checkRoutes({
  routes: parseRoutes(routes), nodes: parseNodes(NODES_09), values: parseValues(VALUES_09), frd: FRD_09,
})
// Круг 3 без S1b — набор, который СЕГОДНЯ зелен и лжив.
const LIE_09 = `<routes>
  <route scenario="S1" entry="v3" steps="${RES_09}@v6 -> ${FRUIT_09}@v7 -> ${RES_09}@v16"/>
  <route scenario="S2" entry="v4" steps="${PAGE_09}@v3 -> ${RES_09}@v6 -> ${FRUIT_09}@v7 -> ${RES_09}@v16 -> ${PAGE_09}@v17"/>
  <route scenario="S2b" entry="v4" steps="${PAGE_09}@v3 -> ${RES_09}@v2 -> ${PAGE_09}@v17"/>
</routes>`

test("rule 11's seam: «404 → карточка с данными» — ложь, которая была зелёной по всем десяти правилам", () => {
  const b = r09(LIE_09)
  const eleven = b.filter((l) => l.startsWith("11 "))
  assert.equal(eleven.length, 1, b.join("\n"))
  assert.match(eleven[0], new RegExp(`^11 узел ${PAGE_09}: на отказ v2`))
  assert.match(eleven[0], /отвечает тем же значением v17/)
  // Блокер обязан назвать ВЫХОД и АДРЕС — иначе роль C будет жечь круги на дефекте прохода A.
  assert.match(eleven[0], /его нет в СЛОВАРЕ, и чинить надо там/)
})

test("rule 11 молчит на честном наборе: у ветки отказа свой конец", () => {
  // Словарь получил v18 — конец ветвления UC2/3a, страница им и отвечает.
  const values = VALUES_09.replace("</values>", '  <value id="v18" text="карточка не отображается"/>\n</values>')
  const nodes = NODES_09.replace('out="v3 | v17"', 'out="v3 | v17 | v18"')
  const honest = LIE_09.replace(`${RES_09}@v2 -> ${PAGE_09}@v17`, `${RES_09}@v2 -> ${PAGE_09}@v18`)
  const b = checkRoutes({ routes: parseRoutes(honest), nodes: parseNodes(nodes), values: parseValues(values), frd: FRD_09 })
  assert.deepEqual(b, [])
})

// ГЛАВНЫЙ КАПКАН реализации: пара «вход → ответ» считается ПО ВХОЖДЕНИЮ. Множество доставленных ×
// множество отданных спарит отказ v2 с успешным v17 уже на ЧЕСТНОМ наборе, и правило покраснеет на
// правильном артефакте. Замени `answered(...)` на пару множеств — этот тест ловит.
test("rule 11 судит только узлы с delta и говорит роли, ГДЕ чинить", () => {
  // Транзитный узел тикета не получит — спрашивать с него различимость ветвей не за чем; та же
  // причина, по которой правила 7 и 10 судят только изменяемые узлы.
  const transit = NODES_09.replace(`path="${PAGE_09}" delta="Changed"`, `path="${PAGE_09}"`)
  const b = checkRoutes({ routes: parseRoutes(LIE_09), nodes: parseNodes(transit), values: parseValues(VALUES_09), frd: FRD_09 })
  assert.equal(b.filter((l) => l.startsWith("11 ")).length, 0, b.join("\n"))

  // И роль C обязана знать это правило по НОМЕРУ — иначе красное 11 она чинить не умеет и жжёт круги.
})

test("rule 11 считает пару ПО ВХОЖДЕНИЮ, а не по множествам", () => {
  const values = VALUES_09.replace("</values>", '  <value id="v18" text="карточка не отображается"/>\n</values>')
  const nodes = NODES_09.replace('out="v3 | v17"', 'out="v3 | v17 | v18"')
  // Страница в одном наборе отвечает и v17 (на 200), и v18 (на 404) — множества дали бы ложь.
  const honest = LIE_09.replace(`${RES_09}@v2 -> ${PAGE_09}@v17`, `${RES_09}@v2 -> ${PAGE_09}@v18`)
  const b = checkRoutes({ routes: parseRoutes(honest), nodes: parseNodes(nodes), values: parseValues(values), frd: FRD_09 })
  assert.equal(b.filter((l) => l.startsWith("11 ")).length, 0, b.join("\n"))
})

// --- D17, rule 9: the order of the work must exist, and it is judged where a role can repair it ----
//
// Live run f7bf154a (sandbox/runbox/quarkus-rest-json-app-v2-t2). Rule 7 demanded a route through an
// `out` branch that predates the change; no FRD scenario exercises it, and pass C took the branch by
// handing it to the node that CALLS this one — a leg the map already declares the other way round.
// Step 9 went green and step 10 died on `неразрешимый порядок среди узлов плана`, a refusal on a step
// with no role, no operator and no repair rail.
//
// The fixture reproduces that move inside this file's own domain: `S1c` starts at the lock and hands
// its value UP to the service, while S1, S1b and S2 all walk service → lock. Rules 1, 3 and 4 are
// silent on it — the entry is a real `in`, the value a real `out`, the `<dep>` exists (undirected by
// design) and the neighbour accepts what it is handed. Nothing but rule 9 sees it.
const INVERTED = ROUTES.replace(
  "</routes>",
  '  <route scenario="S1c" entry="v3" steps="src/SlotLock.java@v5 -> src/BookingService.java@v6"/>\n</routes>',
)
// The WAY OUT, and the reason rule 7 is not weakened: the same branch, taken by a route that simply
// ENDS on the node that produced the value. One step is a legal route (checkRoutes has no `next` at
// k=0, and steps/design/design.mjs::walk expands it into one line of flow and one unit).
const SHORTENED = ROUTES.replace(
  "</routes>",
  '  <route scenario="S1c" entry="v3" steps="src/SlotLock.java@v5"/>\n</routes>',
)

test("rule 9's seam: a route asserting the direction another route already walks — ONE blocker for the pair", () => {
  const b = blockersOf(INVERTED)
  assert.equal(b.length, 1, b.join("\n"))
  // The FACT is the pair, not the leg: both legs are the same defect and one of the two has to go, so
  // §8.1's "one line per fact" means one line here. Key by the leg instead and the count goes to 2 —
  // and `core/findings.mjs::carriedBlockers` starts reading a half-repaired pair as a new blocker.
  assert.match(b[0], /^9 src\/BookingService\.java и src\/SlotLock\.java зовут друг друга/)
  // …and it names WHO asserts each direction, which is what makes the line actionable: a route the
  // role can rewrite, or an edge of the map it cannot.
  assert.match(b[0], /src\/BookingService\.java → src\/SlotLock\.java \(маршрут S1\)/)
  assert.match(b[0], /src\/SlotLock\.java → src\/BookingService\.java \(маршрут S1c\)/)
  assert.match(b[0], /\(S1, S1b, S2, S1c\)$/)
})

test("the way out is real: the same branch taken by a route that ENDS on the node that produced it", () => {
  // Green — and green with the extra route still there, so rule 7 is satisfied by it and nothing was
  // weakened to make rule 9 quiet. Delete the `!seen.has(next.path)` guard in forwardLegs, or lengthen
  // this route back, and the test above is what comes back.
  assert.deepEqual(blockersOf(SHORTENED), [])
  const routes = parseRoutes(SHORTENED)
  assert.equal(routes[3].steps.length, 1, "один шаг — маршруту дальше идти не к кому")
})

test("rule 9 reads the MAP's direction too — the same operand step 10 sorts by", () => {
  // Nothing in the design graph can say who calls whom: rule 3 walks a `<dep>` BOTH ways on purpose.
  // So the direction a repository already has enters here as the map's `<edge from to/>`, and one such
  // edge against one forward leg is a cycle exactly as two routes are.
  const b = blockersOf(ROUTES, { edges: [{ from: "src/BookingService.java", to: "src/BookingResource.java" }] })
  assert.equal(b.length, 1, b.join("\n"))
  assert.match(b[0], /^9 src\/BookingResource\.java и src\/BookingService\.java зовут друг друга/)
  assert.match(b[0], /src\/BookingResource\.java → src\/BookingService\.java \(маршрут S1\)/)
  assert.match(b[0], /src\/BookingService\.java → src\/BookingResource\.java \(ребро карты\)/)
})

test("a cycle the MAP carries alone is not this artifact's — pass C is not blamed for it", () => {
  // Two map edges closing on each other, and no route walking either pair member forward. Blaming the
  // routes would order pass C to repair a repository it cannot reach; step 5 declares such a cycle
  // (`<cycle>`) and step 10 refuses on it by its own rule (steps/plan/plan.mjs, `inCycle`).
  const b = blockersOf("<routes></routes>", {
    edges: [
      { from: "src/SlotRepo.java", to: "src/SlotLock.java" },
      { from: "src/SlotLock.java", to: "src/SlotRepo.java" },
    ],
  })
  assert.equal(b.filter((l) => l.startsWith("9 ")).length, 0, b.join("\n"))
})

// --- D9: the role of this pass and its order ------------------------------------------------------
//
// Same two seams as pass B keeps (steps/design/nodes.test.mjs, D8): the order carries exactly the keys
// the band passes, and the role names the checks it claims — plus one this pass alone can afford, the
// role's own EXAMPLE run through the real guardrail.
const ROLE = readFileSync(new URL("router.md", import.meta.url), "utf8")
const ORDER_ROUTES = readFileSync(new URL("order-routes.tpl", import.meta.url), "utf8")

// The keys the band substitutes for pass C (backlog D10 writes `designing()`; this list is the
// contract it must satisfy). CARDS is the key the whole pass exists for — and RIPPLE is the key that
// must NOT be here: the cards replace the subgraph WHOLE (docs/design-step-by-step.md §4.C), and that
// is the only reason this order is four times lighter than pass B's. Put `{RIPPLE}` back into the
// template and this goes red.
//
// PREVIOUS is the key D25 added, and it is the artifact of the LAST attempt of THIS pass: run
// 5bbe5de4 sent the router back three times and showed it nothing it had written, so it wrote 33
// routes anew on every circle. Drop the key here (or the placeholder from the template) and `prompt()`
// throws AT LAUNCH — an exact bidirectional match is what it demands.
const ORDER_KEYS = ["FRD", "CARDS", "ANSWERS", "PREVIOUS", "FEEDBACK", "STAGING", "CHECK"]

test("order-routes.tpl uses exactly the keys the band passes — cards instead of the ripple subgraph", () => {
  const keys = [...ORDER_ROUTES.matchAll(/{{|}}|{([A-Za-z_$][\w$]*)}/g)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]))
  assert.deepEqual([...new Set(keys)].sort(), [...ORDER_KEYS].sort())
  assert.doesNotMatch(ORDER_ROUTES, /RIPPLE|ripple\.xml/)
  // …and the role says the same thing, so a model that remembers yesterday's order does not go
  // looking for a file that is not there.
})

// BUG_FIX_CONTEXT: the first launch of step 9 never reached the role at all — pi refused the whole
//   workflow at metadata validation: «Invalid role frontmatter: Nested mappings are not allowed in
//   compact mappings at line 1, column 14». The `description:` line carried a second «: » inside an
//   unquoted YAML scalar, which YAML reads as a nested mapping. The cost is the whole run, before a
//   single token is spent, and the message names YAML rather than the file's purpose.
test("role frontmatter: the description carries no bare colon — YAML would read it as a nested mapping", () => {
  const line = (ROLE.match(/^description:.*$/m) || [""])[0]
  assert.doesNotMatch(line.slice("description:".length), /:\s/)
})

// The strongest seam available to a role file: its EXAMPLE is run through the real guardrail — and
// here through TWO of them, because pass C's order is a DERIVED document. The cards printed in the
// role must be the cards `cards()` really emits, or the role teaches a shape no run will ever hand
// it; and the routes it shows must pass `checkRoutes` on those very cards.
const EX_VALUES = `<values>
  <value id="v1" text="POST /doors/{id}/open {badgeId}"/>
  <value id="v2" text="open(doorId,badgeId)"/>
  <value id="v3" text="findBadge(badgeId)"/>
  <value id="v4" text="Badge(badgeId,revoked)"/>
  <value id="v5" text="Opened(doorId)"/>
  <value id="v6" text="Revoked(badgeId)"/>
  <value id="v7" text="200 {doorId}"/>
  <value id="v8" text="403 BADGE_REVOKED"/>
</values>`

const EX_GRAPH = `<design mode="minor" base=".agent/appgraph.xml">
  <module path="src/AccessGate.java" delta="Changed">
    <role>door endpoint</role>
    <contract in="v1 | v5 | v6" out="v2 | v7 | v8"/>
    <dep path="src/AccessPolicy.java"/>
  </module>
  <module path="src/AccessPolicy.java" delta="Added">
    <role>badge rules</role>
    <contract in="v2 | v4" out="v3 | v5 | v6"/>
    <dep path="src/BadgeRepo.java"/>
  </module>
  <module path="src/BadgeRepo.java">
    <role>badge storage</role>
    <contract in="v3" out="v4"/>
  </module>
</design>`

test("the role's example is a green set of routes — parseRoutes + checkRoutes, zero blockers", () => {
  const xml = [...ROLE.matchAll(/```xml\n([\s\S]*?)```/g)].map((m) => m[1])
  assert.equal(xml.length, 2, "the example shows the FRD it reads and the routes it writes")
  const exValues = parseValues(EX_VALUES)
  const exNodes = parseNodes(EX_GRAPH)
  const exFrd = parseFrd(xml[0])

  // The card block of the example is not prose: it is the output of the host function that builds
  // pass C's order. Reformat a row by hand and this goes red.
  const block = (ROLE.match(/```\n(src\/AccessGate\.java[\s\S]*?)```/) || ["", ""])[1].trimEnd()
  assert.equal(block, cards(exValues, exNodes))

  const exRoutes = parseRoutes(xml[1])
  assert.deepEqual(exRoutes.map((r) => r.scenario), ["S1", "S1b"])
  assert.deepEqual(checkRoutes({ routes: exRoutes, nodes: exNodes, values: exValues, frd: exFrd }), [])

  // …and the guardrail really ran on it: compose the first route's id the way live run 0bbf7054 did
  // and the report names BOTH facts the artifact carries — an id no scenario of the FRD owns, and a
  // scenario left with no route. The example is judged, not merely parsed.
  //
  // D26 narrowed the id test (steps/design/routes.mjs::scenarioOf): `startsWith` accepted `S1_ok` —
  // and, on an FRD with eleven scenarios, `S10` as a route of `S1`. Only rule 5 spoke here until then.
  const invented = parseRoutes(xml[1].replace('scenario="S1"', 'scenario="S1_ok"'))
  assert.deepEqual(checkRoutes({ routes: invented, nodes: exNodes, values: exValues, frd: exFrd }), [
    "1 маршрут S1_ok: такого сценария в FRD нет — id маршрута это id сценария FRD дословно либо он же с суффиксом (S1)",
    "5 у сценария FRD S1 нет маршрута",
  ])
})

// --- D14: a bare path, and the one card that is a question ---------------------------------------
//
// Live run a900de7b, round 3: the role wrote `steps="… -> fruits.html"` — a path with no `@id` at
// all. It did that while holding a blocker it could not act on, and `router.md` was at that moment
// instructing it that a card which does not offer what a scenario needs «is not a question, but an
// honest route». Both halves are addressed here: the bare path is named as rule 1 AND as this pass's
// own fault, and the ONE case that really is a question is stated so it cannot be read as licence for
// the other one.
//
// The first assertion is functional, not a grep: what the role is told the check says is what the
// check actually says. Reword the blocker in routes.mjs and this goes red.
test("a step with no `@id` is rule 1 against the ROUTE, and the value reads back as unnamed", () => {
  const nodes = parseNodes(EX_GRAPH)
  const values = parseValues(EX_VALUES)
  const bare = parseRoutes('<routes><route scenario="S1" entry="v1" steps="src/AccessGate.java"/></routes>')
  assert.deepEqual(bare[0].steps, [{ path: "src/AccessGate.java", value: "" }])

  const blockers = checkRoutes({ routes: bare, nodes, values, frd: { scenarios: [{ id: "S1" }] } })
  const rule1 = blockers.filter((l) => l.startsWith("1 "))
  assert.equal(rule1.length, 1, blockers.join("\n"))
  assert.match(rule1[0], /\(значение не названо\)/)
  // …and the role quotes THAT text, so what it is warned about is what it will be handed.
})

test("totality: garbage, undefined and no argument at all are read as no routes, not thrown", () => {
  assert.deepEqual(parseRoutes(undefined), [])
  assert.deepEqual(parseRoutes(null), [])
  assert.deepEqual(parseRoutes('<values><value id="v1" text="POST /bookings"/></values>'), [])
  assert.deepEqual(checkRoutes({}), [])
  assert.deepEqual(checkRoutes(), [])
})
