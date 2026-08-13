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
import { parseRoutes, checkRoutes } from "./routes.mjs"
import { parseNodes } from "./nodes.mjs"
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
const blockersOf = (routes = ROUTES, { graph = GRAPH, values = VALUES_XML, frd = FRD } = {}) =>
  checkRoutes({ routes: parseRoutes(routes), nodes: parseNodes(graph), values: parseValues(values), frd })

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

test("totality: garbage, undefined and no argument at all are read as no routes, not thrown", () => {
  assert.deepEqual(parseRoutes(undefined), [])
  assert.deepEqual(parseRoutes(null), [])
  assert.deepEqual(parseRoutes('<values><value id="v1" text="POST /bookings"/></values>'), [])
  assert.deepEqual(checkRoutes({}), [])
  assert.deepEqual(checkRoutes(), [])
})
