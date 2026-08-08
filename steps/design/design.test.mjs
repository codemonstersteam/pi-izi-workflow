// Срез `design`: две проекции изменения — ЧИСТОЕ ядро, io держит ext/index.mjs (standards/code.md:
// io-трубу юнитами не покрываем). Формула §5: 1 happy + Σ ветвей антецедента с РАЗЛИЧИМЫМ
// следствием. Ветви — пять правил docs/data-flow.md §6 плюс «ни одного <module>»; каждая заведена
// РЕИНТРОДУКЦИЕЙ дефекта в зелёную фикстуру, чтобы шов был доказан, а не заявлен.

import test from "node:test"
import assert from "node:assert/strict"
import { newDesign, parseDesign, parseRoutes, expand, checkDesign } from "./design.mjs"

// Фикстура: бронь занятого слота (S1 → 409) и успешная бронь (S2 → 201). Возврат разматывается по
// тем же рёбрам назад — поэтому правило 3 и проверяет ребро НЕНАПРАВЛЕННО.
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

test("happy: обе проекции сходятся, поток развёрнут ИЗ контрактов", () => {
  const r = newDesign({ xml: GRAPH, frd: FRD })
  assert.equal(r.ok, true)

  const { nodes, routes, flow } = r.value
  assert.equal(nodes.size, 4)
  assert.deepEqual(routes.map((x) => x.scenario), ["S1", "S2"])

  // Значения в потоке — копия контрактов, а не набор роли: маршрут нёс только `path#alt`.
  assert.match(flow, /\$START_FLOW id="S1"/)
  assert.match(flow, /^3\. src\/SlotLock\.java : lock\(slotId,ttl\) -> Taken$/m)
  assert.match(flow, /^5\. src\/BookingResource\.java : Conflict\(slotId\) -> 409 \{conflict\}$/m)
  assert.match(flow, /^4\. src\/SlotRepo\.java : save\(slotId,lock\) -> Saved$/m)
  assert.equal(flow.match(/\$END_FLOW/g).length, 2)
})

test("ни одного <module> — картировать изменение нечем", () => {
  const r = newDesign({ xml: "<design></design>", frd: FRD })
  assert.equal(r.ok, false)
  assert.equal(r.error.cls, "invalid-design")
  assert.match(r.error.detail, /ни одного <module>/)
})

test("правило 1: выдуманный модуль — один блокер, остальные проверки пары закорочены", () => {
  const xml = GRAPH.replace('src/BookingService.java#1 -> src/SlotLock.java#1', 'src/Nope.java#1')
  const b = blockersOf(xml)
  assert.equal(b.filter((x) => x.startsWith("1 ")).length, 1)
  assert.match(b[0], /узла нет в дизайн-графе — src\/Nope\.java/)
  assert.equal(b.filter((x) => x.startsWith("3 ") || x.startsWith("4 ")).length, 0)
})

test("правило 1: альтернативы #alt у узла нет", () => {
  const b = blockersOf(GRAPH.replace("src/SlotLock.java#1 ->", "src/SlotLock.java#9 ->"))
  assert.equal(b.length, 1)
  assert.match(b[0], /нет альтернативы #9 в out/)
})

test("правило 2: узел с дельтой, которого не проходит ни один маршрут", () => {
  const xml = GRAPH.replace("<route", `<module path="src/AuditLog.java" delta="add">
    <contract in="Booked(bookingId)" out="ok"/>
  </module>
  <route`)
  const b = blockersOf(xml)
  assert.equal(b.length, 1)
  assert.match(b[0], /2 узел с delta="add" не встречен ни в одном маршруте — src\/AuditLog\.java/)
})

test("правило 3: ребра <dep> между соседями маршрута нет", () => {
  // Токены стыкуются (Booked(bookingId) — законный вход Notifier), а ребра нет: правило 4 молчит,
  // краснеет ровно правило 3.
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

test("шов правила 4: контракты соседей разошлись — единственное место с ручным вводом роли", () => {
  const b = blockersOf(GRAPH.replace('out="Taken |', 'out="Occupied |'))
  assert.equal(b.length, 1)
  assert.match(b[0], /4 S1#3: out «Occupied» не среди in узла src\/BookingService\.java/)
})

test("правило 5: сценарий FRD без маршрута и touched вне маршрутов", () => {
  const b = blockersOf(GRAPH, { scenarios: ["S1", "S2", "S3"], touched: [...FRD.touched, "src/Mailer.java"] })
  assert.deepEqual(b, [
    "5 у сценария FRD S3 нет маршрута",
    "5 touched FRD не встречен ни в одном маршруте — src/Mailer.java",
  ])
})

test("тотальность разбора: мусор и undefined читаются как пустой граф, а не бросают", () => {
  assert.equal(parseDesign(undefined).size, 0)
  assert.deepEqual(parseRoutes(null), [])
  assert.equal(expand(parseDesign(GRAPH), []), "")
})
