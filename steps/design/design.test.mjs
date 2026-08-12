// Slice `design`: the two projections of a change — a PURE core; its io lives in ext/index.mjs
// (standards/code.md: an io pipe is not unit-tested). Formula: 1 happy + Σ antecedent branches with a
// DISTINGUISHABLE consequent. The branches are the seven rules of docs/data-flow.md §6 plus "not one
// <module>"; each was built by REINTRODUCING the defect into a green fixture, so the seam is proven
// rather than claimed.
//
// The FRD fixture is PARSED, not typed: `frd` reaches this core exactly as steps/intake/frd.mjs hands
// it over, and a fixture that invents its own shape is how discrepancy A got in (rule 5 reddening on
// every real artifact with «[object Object]» — steps/design/design.mjs, BUG_FIX_CONTEXT of checkDesign).

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { newDesign, parseDesign, parseRoutes, expand, checkDesign } from "./design.mjs"
import { parseFrd } from "../intake/frd.mjs"

// Fixture: booking a taken slot (S1 → 409) and a successful booking (S2 → 201). The return unwinds
// along the same edges backwards — which is why rule 3 checks an edge UNDIRECTED.
//
// `src/SlotLock.java` carries a delta and is NOT in the subgraph: a NEW module is the designer's own
// judgement (rule 6). `src/SlotRepo.java` is the mirror case — no delta, so it may only be COPIED
// from the subgraph.
const GRAPH = `<design mode="major" base=".agent/appgraph.xml">
  <module path="src/BookingResource.java" delta="Changed">
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

const FRD_XML = `<frd grammar="1" goal="бронь слота с блокировкой">
  <usecase id="UC1" actor="client" goal="забронировать слот">
    <post>слот забронирован либо отказ 409</post>
    <step n="1">клиент отправляет POST /bookings</step>
  </usecase>
  <delta op="POST /bookings" form="Changed" node="src/BookingResource.java" from="бронь без блокировки" to="бронь с блокировкой слота"/>
  <scenario id="S1" uc="UC1" before="двойная бронь проходит" after="вторая бронь получает 409" nodes="src/BookingResource.java"/>
  <scenario id="S2" uc="UC1" before="бронь не ставит блокировку" after="бронь ставит блокировку слота" nodes="src/BookingResource.java"/>
  <touched path="src/BookingResource.java" why="ветка 409"/>
  <touched path="src/BookingService.java" why="блокировка перед записью"/>
  <touched path="src/SlotLock.java" why="новый модуль блокировки"/>
</frd>`

const FRD = parseFrd(FRD_XML)
// The ripple subgraph as step 8 cuts it: what EXISTS. SlotLock is absent on purpose — it is new.
const KNOWN = new Set(["src/BookingResource.java", "src/BookingService.java", "src/SlotRepo.java"])

const blockersOf = (xml, frd = FRD, known = KNOWN) =>
  checkDesign({ nodes: parseDesign(xml), routes: parseRoutes(xml), frd, known })

test("happy: both projections agree, the flow is expanded OUT of the contracts, and the units are the flow regrouped", () => {
  const r = newDesign({ xml: GRAPH, frd: FRD, known: KNOWN })
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

  // The unit list of a node is the SAME lines grouped by path and deduplicated — the happy path is the
  // first line, never a summand on top (docs/design.md §2). BookingService is entered three
  // DISTINGUISHABLE ways across the two scenarios, and `book(slotId,userId) -> lock(slotId,ttl)`
  // happens in both — one line, not two.
  assert.match(flow, /\$START_TESTS path="src\/BookingService\.java"\n1\. book\(slotId,userId\) -> lock\(slotId,ttl\)\n2\. Taken -> Conflict\(slotId\)\n3\. Lock -> Booked\(bookingId\)\n\$END_TESTS/)
  // No count beside the list: the count IS the list (docs/ripple.md §4, why fanin is not copied).
  assert.doesNotMatch(flow, /tests="/)
  assert.equal(flow.match(/\$START_TESTS/g).length, 4)
})

test("not one <module> — there is nothing to map the change onto", () => {
  const r = newDesign({ xml: "<design></design>", frd: FRD, known: KNOWN })
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

// The seam of live run ffe8cb7b: what STARTS a scenario is named by number, never taken by position.
// Reintroducing the defect — `in: k === 0 ? n.in[0] : …` in walk, and dropping the boundary half of
// rule 1 — turns this test green again while the flow's first line goes back to lying (design.mjs,
// walk's BUG_FIX_CONTEXT).
test("rule 1 at the boundary: the route names its entry, and the script never guesses in[0]", () => {
  // Not named at all — the случай the live run produced: the whole `entry` attribute is absent.
  const b = blockersOf(GRAPH.replaceAll(' entry="1"', ""))
  const named = b.filter((x) => x.startsWith("1 "))
  assert.equal(named.length, 2)   // one per route: neither scenario says what starts it
  for (const x of named) assert.match(x, /entry=\(не назван\) — у первого узла src\/BookingResource\.java нет такой альтернативы in/)
  // Both first steps dropped out of the walk, so nothing takes BookingResource's out#1 any more —
  // rule 7 says that on its own line. One defect, two truths, and they do not hide each other.
  assert.equal(b.filter((x) => x.startsWith("7 ")).length, 1)

  // Named, but pointing outside the contract.
  const off = blockersOf(GRAPH.replace('scenario="S2" entry="1"', 'scenario="S2" entry="9"'))
  assert.deepEqual(off.map((x) => x.slice(0, 15)), ['1 S2: entry="9"'])

  // Named correctly — the flow's first line is a COPY of that alternative, not of the first one.
  const flow = expand(parseDesign(GRAPH), parseRoutes(GRAPH.replace('scenario="S1" entry="1"', 'scenario="S1" entry="2"')))
  assert.match(flow, /^1\. src\/BookingResource\.java : Booked\(bookingId\) -> book\(slotId,userId\)$/m)
})

test("rule 1: the node has no #alt alternative", () => {
  const b = blockersOf(GRAPH.replace("src/SlotLock.java#1 ->", "src/SlotLock.java#9 ->"))
  assert.equal(b.filter((x) => x.startsWith("1 ")).length, 1)
  assert.match(b[0], /нет альтернативы #9 в out/)
})

test("rule 2: a node with a delta that no route passes through — and rule 7 stays silent about it", () => {
  const xml = GRAPH.replace("<route", `<module path="src/AuditLog.java" delta="Added">
    <contract in="Booked(bookingId)" out="ok"/>
  </module>
  <route`)
  const b = blockersOf(xml)
  assert.deepEqual(b, ['2 узел с delta="Added" не встречен ни в одном маршруте — src/AuditLog.java'])
})

test("rule 3: no <dep> edge between the route's neighbors", () => {
  // Tokens join up (Booked(bookingId) is a legitimate input for Notifier), but there is no edge:
  // rule 4 stays silent, exactly rule 3 goes red.
  const xml = GRAPH
    .replace("<route", `<module path="src/Notifier.java" delta="Added">
    <contract in="Booked(bookingId)" out="sent"/>
  </module>
  <route`)
    .replace('src/BookingService.java#3 -> src/BookingResource.java#2', 'src/BookingService.java#3 -> src/Notifier.java#1')
  const b = blockersOf(xml)
  assert.deepEqual(b.filter((x) => x.startsWith("3 ")), ["3 S2#6: нет ребра <dep> между src/BookingService.java и src/Notifier.java"])
  // Cutting the last step of S2 also took the `201 {bookingId}` branch out of every route — rule 7
  // says so on its own line. That is the connection rule 7 exists for: a branch nobody routes has no
  // unit in the ticket, and nothing else in the pipeline would have noticed.
  assert.deepEqual(b.filter((x) => x.startsWith("7 ")), ['7 узел src/BookingResource.java с delta="Changed": альтернатива out «201 {bookingId}» не пройдена ни одним маршрутом — она мертва либо сценария FRD не хватает'])
})

test("rule 4's seam: neighboring contracts diverged — the only place with manual role input", () => {
  const b = blockersOf(GRAPH.replace('out="Taken |', 'out="Occupied |'))
  assert.equal(b.length, 1)
  assert.match(b[0], /4 S1#3: out «Occupied» не среди in узла src\/BookingService\.java/)
})

test("rule 5: an FRD scenario without a route, and touched outside all routes", () => {
  const frd = parseFrd(FRD_XML.replace("</frd>", `
    <scenario id="S3" uc="UC1" before="письмо не уходит" after="письмо уходит" nodes="src/BookingResource.java"/>
    <touched path="src/Mailer.java" why="письмо о брони"/>
  </frd>`))
  assert.deepEqual(blockersOf(GRAPH, frd), [
    "5 у сценария FRD S3 нет маршрута",
    "5 touched FRD не встречен ни в одном маршруте — src/Mailer.java",
  ])
})

test("rule 6: a transit node cannot be invented, a new module can", () => {
  // The subgraph forgot SlotRepo: a node with no delta claims something about what EXISTS, and the
  // order carried only one source for that claim.
  const b = blockersOf(GRAPH, FRD, new Set(["src/BookingResource.java", "src/BookingService.java"]))
  assert.deepEqual(b, ["6 узел без delta вне подграфа ряби — src/SlotRepo.java: транзитный узел копируется из .agent/ripple.xml, выдумать его нельзя"])
  // The mirror case is already green in the happy test: SlotLock is absent from KNOWN too, and it
  // passes — because it carries a delta and is therefore declared NEW.

  // With no subgraph supplied at all the rule stays silent — the discipline F5 keeps without sources.
  assert.deepEqual(blockersOf(GRAPH, FRD, null), [])
})

test("rule 6: one vocabulary for the pipeline — the word comes from step 6, not from the designer", () => {
  const b = blockersOf(GRAPH.replace('delta="Added"', 'delta="add"'))
  assert.equal(b.length, 1)
  assert.match(b[0], /^6 узел src\/SlotLock\.java: delta="add" — допустимо Added \| Changed \| Removed \| Fixed \| Unknown$/)
})

test("rule 7: an out alternative no route takes has no unit in the ticket", () => {
  const b = blockersOf(GRAPH.replace('out="Taken | save(slotId,lock) | Lock"', 'out="Taken | save(slotId,lock) | Lock | Expired"'))
  assert.deepEqual(b, ['7 узел src/SlotLock.java с delta="Added": альтернатива out «Expired» не пройдена ни одним маршрутом — она мертва либо сценария FRD не хватает'])
})

// The two seams the SLICE keeps outside the core: the order carries exactly the keys the workflow
// passes, and the role names no rule twice. `steps/scope/part.test.mjs` keeps the same pair for its
// own slice — the device is the repository's, not this file's invention.
const ORDER_KEYS = ["FRD", "RIPPLE", "ANSWERS", "MODE", "DELTA_FORMS", "FEEDBACK", "STAGING", "CHECK"]

test("order.tpl uses exactly the keys the workflow passes", () => {
  const tpl = readFileSync(new URL("order.tpl", import.meta.url), "utf8")
  const keys = [...tpl.matchAll(/{{|}}|{([A-Za-z_$][\w$]*)}/g)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]))
  assert.deepEqual([...new Set(keys)].sort(), [...ORDER_KEYS].sort())
})

// BUG_FIX_CONTEXT: the first launch of step 9 never reached the role at all — pi refused the whole
//   workflow at metadata validation: «Invalid role frontmatter: Nested mappings are not allowed in
//   compact mappings at line 1, column 14». The `description:` line carried a second «: » inside an
//   unquoted YAML scalar, which YAML reads as a nested mapping. The cost is the whole run, before a
//   single token is spent, and the message names YAML rather than the file's purpose — so the seam
//   is here, where it costs a millisecond.
test("role frontmatter: the description carries no bare colon — YAML would read it as a nested mapping", () => {
  const role = readFileSync(new URL("designer.md", import.meta.url), "utf8")
  const line = (role.match(/^description:.*$/m) || [""])[0]
  assert.doesNotMatch(line.slice("description:".length), /:\s/)
})

test("role and order: one vocabulary, and no number of tests anywhere", () => {
  // The role file is named by ROLE, not by step: pi resolves `agent({role: "designer"})` by FILENAME
  // inside the declared roleDirectories (ext/index.mjs), so design/role.md would install as "role".
  const role = readFileSync(new URL("designer.md", import.meta.url), "utf8")
  const tpl = readFileSync(new URL("order.tpl", import.meta.url), "utf8")

  // Discrepancy C: the slice used to carry its own words for a delta's form in three prose places.
  // The vocabulary now arrives SUBSTITUTED, and the seam is that neither file spells it out again.
  for (const text of [role, tpl]) assert.doesNotMatch(text, /delta="(add|change|remove)"/)
  assert.match(tpl, /{DELTA_FORMS}/)

  // standards/role.md: every prohibition names the machine check that catches it.
  assert.match(role, /machine-checked as rule 6|as rule 6/)
  assert.match(role, /as rule 7/)
  // The entry is a NUMBER in both the law and the prohibition — the one place a value could be typed
  // a second time (design.mjs::parseRoutes, why `entry` is not text).
  assert.match(role, /`entry` is the NUMBER of an `in` alternative, never its text/)
  assert.match(role, /machine-checked as rule 1 against the first node's contract/)
  // The unit list is the script's projection of the routes — the role writes no count (docs/design.md §2).
  assert.match(role, /Do NOT write a number of tests/)
})

test("totality of parsing: garbage and undefined are read as an empty graph, not thrown", () => {
  assert.equal(parseDesign(undefined).size, 0)
  assert.deepEqual(parseRoutes(null), [])
  assert.equal(expand(parseDesign(GRAPH), []), "")
})
