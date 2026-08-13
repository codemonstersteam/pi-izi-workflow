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
import { newDesign, parseDesign, parseRoutes, expand, assemble } from "./design.mjs"
import { parseValues } from "./values.mjs"
import { parseNodes } from "./nodes.mjs"
import { parseRoutes as parseWorkRoutes } from "./routes.mjs"
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

// The seam of live run ffe8cb7b, the half of it that belongs to THIS file: what starts a scenario is
// named, and `walk` copies THAT alternative into the flow's first line. Reintroducing the defect —
// `in: k === 0 ? n.in[0] : …` in walk — turns the assertion below red. The other half, the BLOCKER
// that demands the entry be named, moved with rule 1 (steps/design/routes.mjs).
test("the entry of a route is a copy of the named alternative, never in[0] by position", () => {
  const flow = expand(parseDesign(GRAPH), parseRoutes(GRAPH.replace('scenario="S1" entry="1"', 'scenario="S1" entry="2"')))
  assert.match(flow, /^1\. src\/BookingResource\.java : Booked\(bookingId\) -> book\(slotId,userId\)$/m)
})

// NOT ONE RULE'S SEAM IS IN THIS FILE ANY MORE, and each moved BESIDE the rule it proves — otherwise
// the next reader deletes a rule and watches a green suite:
//   8 → steps/design/values.test.mjs ("rule 8"), with the rule, backlog D1;
//   6 → steps/design/nodes.test.mjs (the two "rule 6" tests), backlog D2;
//   1, 2, 3, 4, 5, 7 → steps/design/routes.test.mjs, backlog D4 — and their blockers were REWRITTEN
//     there as facts (docs/design-step-by-step.md §8), which is why they could not be moved verbatim.
// What is left here is `checkDesign` deciding nothing at all (see its contract) — untested on purpose:
// a test that no code change can turn red is a comment (standards/code.md). D5 replaces the function
// with `assemble` and the round trip that proves it.

// The seam the SLICE keeps outside the core: the order carries exactly the keys the workflow passes.
// `steps/scope/part.test.mjs` keeps the same one for its own slice — the device is the repository's,
// not this file's invention.
const ORDER_KEYS = ["FRD", "RIPPLE", "ANSWERS", "MODE", "DELTA_FORMS", "FEEDBACK", "STAGING", "CHECK"]

test("order.tpl uses exactly the keys the workflow passes", () => {
  const tpl = readFileSync(new URL("order.tpl", import.meta.url), "utf8")
  const keys = [...tpl.matchAll(/{{|}}|{([A-Za-z_$][\w$]*)}/g)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]))
  assert.deepEqual([...new Set(keys)].sort(), [...ORDER_KEYS].sort())
})

// One vocabulary: the slice used to carry its own words for a delta's form in three prose places
// (discrepancy C). The vocabulary arrives SUBSTITUTED, and the seam is that the template does not
// spell it out again. Its twin for the pass-B order lives in steps/design/nodes.test.mjs.
test("order.tpl names no delta word of its own — the vocabulary is substituted", () => {
  const tpl = readFileSync(new URL("order.tpl", import.meta.url), "utf8")
  assert.doesNotMatch(tpl, /delta="(add|change|remove)"/)
  assert.match(tpl, /{DELTA_FORMS}/)
})

// THE ROLE'S SEAMS ARE NOT IN THIS FILE ANY MORE EITHER (backlog D8). `designer.md` became the role
// of pass B — it writes the GRAPH and no routes — so the assertions that grepped it moved to
// steps/design/nodes.test.mjs, BESIDE the guardrail that now judges what they claim:
//   the `description:` colon (the YAML trap that cost a whole run), the delta vocabulary,
//   «as rule 6» and «Do NOT write a number of tests» — moved as they were;
//   «`entry` is the NUMBER of an `in` alternative» and «machine-checked as rule 1 …» — DELETED with
//     the routes: rule 1 and rule 7 judge `staging/routes.xml` (steps/design/routes.mjs), and the
//     role that must name them is `router.md`, which backlog D9 writes. Asserting them against a
//     role that no longer writes a route would be asserting that the pass did not happen;
//   «as rule 7» — the same, and one step further: rule 7 blames the ROUTE, not the graph
//     (docs/design-step-by-step.md §7, the table of blame), so pass B may not claim it at all.

test("totality of parsing: garbage and undefined are read as an empty graph, not thrown", () => {
  assert.equal(parseDesign(undefined).size, 0)
  assert.deepEqual(parseRoutes(null), [])
  assert.equal(expand(parseDesign(GRAPH), []), "")
})

// --- D5: assembly. THE ROUND TRIP IS THE SEAM ------------------------------------------------
//
// Passes A/B/C write by ID; steps 10 and 14, `parseDesign`, `parseRoutes` and `expand` read TEXT and
// `#n`. `assemble` is the only place that translates, so the only honest proof that the deliverable
// did not move is to read its output back with TODAY's readers and get the same change.

const WORK_VALUES = `<values>
  <value id="v1" text="POST /bookings {slotId,userId}"/>
  <value id="v2" text="book(slotId,userId)"/>
  <value id="v3" text="lock(slotId,ttl)"/>
  <value id="v4" text="409 {conflict}"/>
  <value id="v5" text="Taken"/>
  <value id="v6" text="Conflict(slotId)"/>
  <value id="v7" text="Booked(bookingId)"/>
  <value id="v8" text="201 {bookingId}"/>
  <value id="v9" text="save(slotId,lock)"/>
  <value id="v10" text="Saved"/>
  <value id="v11" text="Lock"/>
</values>`

// The SAME change as GRAPH above, in the working form: contracts speak ids, routes name values.
const WORK_NODES = `<design mode="major" base=".agent/appgraph.xml">
  <module path="src/BookingResource.java" delta="Changed">
    <role>REST-точка брони</role>
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

const WORK_ROUTES = `<routes>
  <route scenario="S1" entry="v1" steps="src/BookingResource.java@v2 -> src/BookingService.java@v3 -> src/SlotLock.java@v5 -> src/BookingService.java@v6 -> src/BookingResource.java@v4"/>
  <route scenario="S2" entry="v1" steps="src/BookingResource.java@v2 -> src/BookingService.java@v3 -> src/SlotLock.java@v9 -> src/SlotRepo.java@v10 -> src/SlotLock.java@v11 -> src/BookingService.java@v7 -> src/BookingResource.java@v8"/>
</routes>`

const assembled = () => assemble({
  values: parseValues(WORK_VALUES),
  nodes: parseNodes(WORK_NODES),
  routes: parseWorkRoutes(WORK_ROUTES),
  mode: "major",
})

test("assembly: what the passes wrote by id, today's readers read as the change they read yesterday", () => {
  const out = assembled()
  const back = parseDesign(out)
  const backRoutes = parseRoutes(out)
  const was = parseDesign(GRAPH)

  // structure: the same nodes, the same deltas, the same edges
  assert.deepEqual([...back.keys()], [...was.keys()])
  for (const [path, n] of was) {
    assert.equal(back.get(path).delta, n.delta, path)
    assert.deepEqual(back.get(path).deps, n.deps, path)
    assert.deepEqual(back.get(path).in, n.in, `in of ${path}`)     // ids became TEXTS
    assert.deepEqual(back.get(path).out, n.out, `out of ${path}`)
  }

  // time: the same routes, with the positions a SCRIPT computed instead of a model counting
  assert.deepEqual(backRoutes, parseRoutes(GRAPH))

  // and the deliverable step 14 cuts: identical, line for line
  assert.equal(expand(back, backRoutes), expand(was, parseRoutes(GRAPH)))
})

test("assembly: the number is the position of the NAMED value, and off-by-one is visible", () => {
  const out = assembled()
  // `entry` names v1 — the FIRST `in` of the first node, so `entry="1"`, never 0 and never 2.
  assert.match(out, /entry="1"/)
  // S1's last step hands back v4, the THIRD alternative of BookingResource's out.
  assert.match(out, /src\/BookingResource\.java#3"/)
  // Reintroduction: number from zero in assemble — both assertions above and the round trip go red.
  assert.doesNotMatch(out, /#0/)

  // `<role>` is read by NO guardrail, and precisely therefore it needs a seam: a projection that
  // quietly drops a section of the deliverable would pass every other test in this file.
  assert.match(out, /<role>REST-точка брони<\/role>/)
})
