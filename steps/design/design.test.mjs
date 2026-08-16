// The GRAMMAR of step 9's deliverable — a PURE reader; its io lives in ext/index.mjs
// (standards/code.md: an io pipe is not unit-tested). Formula: 1 happy + Σ antecedent branches with a
// DISTINGUISHABLE consequent.
//
// WHAT THIS FILE STOPPED TESTING, AND WHY. Until step 9 was rewritten this module also ASSEMBLED the
// deliverable out of the three working artifacts and EXPANDED it into `.agent/data-flow.md`. Both
// functions were deleted with the passes that fed them: nothing writes the working artifacts any
// more, so `assemble` had no caller and `expand` had no input, and code only a test can reach is a
// test no edit of the code can turn red. What is left is what step 10 READS — the nodes, the routes
// and the units each node owes — and those three keep their seams here.
//
// The fixture is the PROMOTED form on purpose: it is the form step 10 receives, and a reader tested
// against a form nobody stores is a reader tested against nothing.

import test from "node:test"
import assert from "node:assert/strict"
import { parseDesign, parseRoutes, unitsByPath } from "./design.mjs"

// Fixture: booking a taken slot (S1 → 409) and a successful booking (S2 → 201). The return unwinds
// along the same edges backwards — which is why a route may name a node it has already walked.
const GRAPH = `<design mode="major" base=".agent/appgraph.xml">
  <module path="src/BookingResource.java" delta="Changed">
    <role>REST-точка брони</role>
    <contract in="POST /bookings {slotId,userId} | Booked(bookingId) | Conflict(slotId)"
              out="book(slotId,userId) | 201 {bookingId} | 409 {conflict}"/>
    <dep path="src/BookingService.java"/>
  </module>
  <module path="src/BookingService.java" delta="Changed">
    <contract in="book(slotId,userId) | Taken | Lock"
              out="lock(slotId,ttl) | Conflict(slotId) | Booked(bookingId)"/>
    <dep path="src/SlotLock.java"/>
  </module>
  <module path="src/SlotLock.java" delta="Added">
    <contract in="lock(slotId,ttl) | Saved" out="Taken | save(slotId,lock) | Lock"/>
    <dep path="src/SlotRepo.java"/>
  </module>
  <module path="src/SlotRepo.java">
    <contract in="save(slotId,lock)" out="Saved"/>
  </module>
  <route scenario="S1" entry="1" steps="src/BookingResource.java#1 -> src/BookingService.java#1 -> src/SlotLock.java#1 -> src/BookingService.java#2 -> src/BookingResource.java#3"/>
  <route scenario="S2" entry="1" steps="src/BookingResource.java#1 -> src/BookingService.java#1 -> src/SlotLock.java#2 -> src/SlotRepo.java#1 -> src/SlotLock.java#3 -> src/BookingService.java#3 -> src/BookingResource.java#2"/>
</design>`

test("happy: узлы, их контракты и маршруты читаются так, как их пишет поставка", () => {
  const nodes = parseDesign(GRAPH)
  const routes = parseRoutes(GRAPH)
  assert.equal(nodes.size, 4)
  assert.deepEqual(routes.map((r) => r.scenario), ["S1", "S2"])
  // Альтернативы контракта режутся ТОЛЬКО по `|`: текст значения несёт и пробелы, и запятые.
  assert.deepEqual(nodes.get("src/BookingService.java").out, ["lock(slotId,ttl)", "Conflict(slotId)", "Booked(bookingId)"])
  assert.deepEqual(nodes.get("src/BookingResource.java").deps, ["src/BookingService.java"])
  assert.equal(nodes.get("src/SlotLock.java").delta, "Added")
})

// R-shippable: одна деривация, два потребителя. Шаг 9 кладёт юниты узла в поставку, шаг 10 кладёт их
// же на узел плана как `dod` — тикет режется из ПЛАНА, и без DoD исполнителю нечем закрыть узел
// (живой прогон d8ef8c60: команда узла зелена до начала работы).
test("юниты узла — пары «вход -> выход», по одной на РАЗЛИЧИМУЮ, в порядке первого появления", () => {
  const units = unitsByPath(parseDesign(GRAPH), parseRoutes(GRAPH))
  // BookingService входят тремя различимыми путями за два сценария, и `book -> lock` случается в
  // обоих — одна строка, не две. Счастливый путь это первая строка, а не слагаемое сверху.
  assert.deepEqual(units.get("src/BookingService.java"), [
    "book(slotId,userId) -> lock(slotId,ttl)",
    "Taken -> Conflict(slotId)",
    "Lock -> Booked(bookingId)",
  ])
  // Узел, через который не идёт ни один маршрут, в карте ОТСУТСТВУЕТ — не лежит там с пустым списком.
  assert.equal([...units.values()].every((l) => l.length > 0), true)
  assert.equal(units.size, 4)
})

// Шов живого прогона ffe8cb7b: чем маршрут НАЧИНАЕТСЯ — названо, и `walk` копирует именно ту
// альтернативу. Вернуть дефект (`in: k === 0 ? n.in[0] : …` в walk) — и утверждение краснеет.
test("вход маршрута — копия НАЗВАННОЙ альтернативы, а не in[0] по позиции", () => {
  const moved = GRAPH.replace('scenario="S1" entry="1"', 'scenario="S1" entry="2"')
  const units = unitsByPath(parseDesign(moved), parseRoutes(moved))
  assert.equal(units.get("src/BookingResource.java")[0], "Booked(bookingId) -> book(slotId,userId)")
})

test("тотальность чтения: мусор и undefined читаются как пустая поставка, а не бросают", () => {
  assert.equal(parseDesign(undefined).size, 0)
  assert.deepEqual(parseRoutes(null), [])
  assert.equal(unitsByPath(parseDesign(GRAPH), []).size, 0)
})
