// Slice `design`: the two projections of a change — a PURE core; its io lives in ext/index.mjs
// (standards/code.md: an io pipe is not unit-tested). Formula: 1 happy + Σ antecedent branches with a
// DISTINGUISHABLE consequent. The branches are the five rules of docs/data-flow.md §6 plus "not one
// <module>"; each was built by REINTRODUCING the defect into a green fixture, so the seam is proven
// rather than claimed.

import test from "node:test"
import assert from "node:assert/strict"
import { newDesign, parseDesign, parseRoutes, expand, checkDesign } from "./design.mjs"

// Fixture: booking a taken slot (S1 → 409) and a successful booking (S2 → 201). The return unwinds
// along the same edges backwards — which is why rule 3 checks an edge UNDIRECTED.
const GRAPH = `<design mode="major" base=".agent/appgraph.xml">
  <module path="src/BookingResource.java" delta="change">
    <contract in="POST /bookings {slotId,userId} | Booked(bookingId) | Conflict(slotId)"
              out="book(slotId,userId) | 201 {bookingId} | 409 {conflict}"/>
    <dep path="src/BookingService.java"/>
  </module>
  <module path="src/BookingService.java" delta="change">
    <contract in="book(slotId,userId) | Taken | Lock"
              out="lock(slotId,ttl) | Conflict(slotId) | Booked(bookingId)"/>
    <dep path="src/SlotLock.java"/>
  </module>
  <module path="src/SlotLock.java" delta="add">
    <contract in="lock(slotId,ttl) | Saved" out="Taken | save(slotId,lock) | Lock"/>
    <dep path="src/SlotRepo.java"/>
  </module>
  <module path="src/SlotRepo.java" delta="add">
    <contract in="save(slotId,lock)" out="Saved"/>
  </module>
  <route scenario="S1" steps="src/BookingResource.java#1 -> src/BookingService.java#1 -> src/SlotLock.java#1 -> src/BookingService.java#2 -> src/BookingResource.java#3"/>
  <route scenario="S2" steps="src/BookingResource.java#1 -> src/BookingService.java#1 -> src/SlotLock.java#2 -> src/SlotRepo.java#1 -> src/SlotLock.java#3 -> src/BookingService.java#3 -> src/BookingResource.java#2"/>
</design>`

const FRD = {
  scenarios: ["S1", "S2"],
  touched: ["src/BookingResource.java", "src/BookingService.java", "src/SlotLock.java", "src/SlotRepo.java"],
}

const blockersOf = (xml, frd = FRD) => checkDesign({ nodes: parseDesign(xml), routes: parseRoutes(xml), frd })

test("happy: both projections agree, and the flow is expanded OUT of the contracts", () => {
  const r = newDesign({ xml: GRAPH, frd: FRD })
  assert.equal(r.ok, true)

  const { nodes, routes, flow } = r.value
  assert.equal(nodes.size, 4)
  assert.deepEqual(routes.map((x) => x.scenario), ["S1", "S2"])

  // The values in the flow are a copy of the contracts, not the role's own: a route carried only `path#alt`.
  assert.match(flow, /\$START_FLOW id="S1"/)
  assert.match(flow, /^3\. src\/SlotLock\.java : lock\(slotId,ttl\) -> Taken$/m)
  assert.match(flow, /^5\. src\/BookingResource\.java : Conflict\(slotId\) -> 409 \{conflict\}$/m)
  assert.match(flow, /^4\. src\/SlotRepo\.java : save\(slotId,lock\) -> Saved$/m)
  assert.equal(flow.match(/\$END_FLOW/g).length, 2)
})

test("not one <module> — there is nothing to map the change onto", () => {
  const r = newDesign({ xml: "<design></design>", frd: FRD })
  assert.equal(r.ok, false)
  assert.equal(r.error.cls, "invalid-design")
  assert.match(r.error.detail, /ни одного <module>/)
})

test("rule 1: a made-up module — one blocker, the rest of the pair's checks are short-circuited", () => {
  const xml = GRAPH.replace('src/BookingService.java#1 -> src/SlotLock.java#1', 'src/Nope.java#1')
  const b = blockersOf(xml)
  assert.equal(b.filter((x) => x.startsWith("1 ")).length, 1)
  assert.match(b[0], /узла нет в дизайн-графе — src\/Nope\.java/)
  assert.equal(b.filter((x) => x.startsWith("3 ") || x.startsWith("4 ")).length, 0)
})

test("rule 1: the node has no #alt alternative", () => {
  const b = blockersOf(GRAPH.replace("src/SlotLock.java#1 ->", "src/SlotLock.java#9 ->"))
  assert.equal(b.length, 1)
  assert.match(b[0], /нет альтернативы #9 в out/)
})

test("rule 2: a node with a delta that no route passes through", () => {
  const xml = GRAPH.replace("<route", `<module path="src/AuditLog.java" delta="add">
    <contract in="Booked(bookingId)" out="ok"/>
  </module>
  <route`)
  const b = blockersOf(xml)
  assert.equal(b.length, 1)
  assert.match(b[0], /2 узел с delta="add" не встречен ни в одном маршруте — src\/AuditLog\.java/)
})

test("rule 3: no <dep> edge between the route's neighbors", () => {
  // Tokens join up (Booked(bookingId) is a legitimate input for Notifier), but there is no edge:
  // rule 4 stays silent, exactly rule 3 goes red.
  const xml = GRAPH
    .replace("<route", `<module path="src/Notifier.java" delta="add">
    <contract in="Booked(bookingId)" out="sent"/>
  </module>
  <route`)
    .replace('src/BookingService.java#3 -> src/BookingResource.java#2', 'src/BookingService.java#3 -> src/Notifier.java#1')
  const b = blockersOf(xml)
  assert.equal(b.length, 1)
  assert.match(b[0], /3 S2#6: нет ребра <dep> между src\/BookingService\.java и src\/Notifier\.java/)
})

test("rule 4's seam: neighboring contracts diverged — the only place with manual role input", () => {
  const b = blockersOf(GRAPH.replace('out="Taken |', 'out="Occupied |'))
  assert.equal(b.length, 1)
  assert.match(b[0], /4 S1#3: out «Occupied» не среди in узла src\/BookingService\.java/)
})

test("rule 5: an FRD scenario without a route, and touched outside all routes", () => {
  const b = blockersOf(GRAPH, { scenarios: ["S1", "S2", "S3"], touched: [...FRD.touched, "src/Mailer.java"] })
  assert.deepEqual(b, [
    "5 у сценария FRD S3 нет маршрута",
    "5 touched FRD не встречен ни в одном маршруте — src/Mailer.java",
  ])
})

test("totality of parsing: garbage and undefined are read as an empty graph, not thrown", () => {
  assert.equal(parseDesign(undefined).size, 0)
  assert.deepEqual(parseRoutes(null), [])
  assert.equal(expand(parseDesign(GRAPH), []), "")
})
