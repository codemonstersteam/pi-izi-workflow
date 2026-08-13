// Pass B of the slice `design`: the graph of the change — a PURE core; its io lives in ext/index.mjs
// (standards/code.md: an io pipe is not unit-tested). Formula: 1 happy + Σ antecedent branches with a
// DISTINGUISHABLE consequent. The branches are rule 6 of docs/data-flow.md §6, which moved here whole
// from steps/design/design.mjs — number unchanged — plus the three checks the graph owns: a contract's
// name is declared in the dictionary, an edge lands on a node of this same file, and a failure the
// dictionary carries is produced by SOME node's `out`. Each was built by REINTRODUCING the defect into
// a green fixture.
//
// The FRD fixture is PARSED, not typed, and so is the DICTIONARY: both reach this core exactly as
// steps/intake/frd.mjs and steps/design/values.mjs hand them over. A fixture that invents its own
// shape is how discrepancy A got in (steps/design/design.mjs, BUG_FIX_CONTEXT of checkDesign: rule 5
// reddening on every real artifact with «[object Object]»).

import test from "node:test"
import assert from "node:assert/strict"
import { parseNodes, checkGraph } from "./nodes.mjs"
import { parseValues, checkValues } from "./values.mjs"
import { parseFrd } from "../intake/frd.mjs"

// The dictionary of the booking change — every value the graph below is allowed to speak of.
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

// The same change as steps/design/design.test.mjs' fixture, in the form of pass B: contracts speak
// IDS, and there is not one `<route>` — this pass has no time in it.
//
// `src/SlotLock.java` carries a delta and is NOT in the subgraph: a NEW module is the designer's own
// judgement (rule 6). `src/SlotRepo.java` is the mirror case — no delta, so it may only be COPIED
// from the subgraph.
const GRAPH = `<design mode="major" base=".agent/appgraph.xml">
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

const FRD_XML = `<frd grammar="1" goal="бронь слота с блокировкой">
  <usecase id="UC1" actor="client" goal="забронировать слот">
    <post>слот забронирован либо отказ 409</post>
    <step n="1">клиент отправляет POST /bookings</step>
  </usecase>
  <delta op="POST /bookings" form="Changed" node="src/BookingResource.java" from="бронь без блокировки" to="бронь с блокировкой слота"/>
  <scenario id="S1" uc="UC1" before="двойная бронь проходит" after="вторая бронь получает 409" nodes="src/BookingResource.java"/>
  <failure code="SLOT_TAKEN" status="409" client="показать занятость" operator="—" from="UC1/1a"/>
</frd>`

const FRD = parseFrd(FRD_XML)
// The ripple subgraph as step 8 cuts it: what EXISTS. SlotLock is absent on purpose — it is new.
const KNOWN = new Set(["src/BookingResource.java", "src/BookingService.java", "src/SlotRepo.java"])

const blockersOf = (xml, { values = VALUES_XML, frd = FRD, known = KNOWN } = {}) =>
  checkGraph({ nodes: parseNodes(xml), values: parseValues(values), frd, known })

test("happy: contracts speak the dictionary's names, every edge lands inside, and the failure is produced", () => {
  const nodes = parseNodes(GRAPH)
  assert.equal(nodes.size, 4)

  // The contract carries IDS, not texts: that is what pass A bought, and the whole reason `out` of one
  // node and `in` of its neighbour can no longer drift by spelling (docs/data-flow.md §4a).
  const lock = nodes.get("src/SlotLock.java")
  assert.deepEqual(lock.in, ["v3", "v10"])
  assert.deepEqual(lock.out, ["v5", "v9", "v11"])
  assert.deepEqual(lock.deps, ["src/SlotRepo.java"])
  assert.equal(lock.delta, "Added")
  // A node the change does not touch carries no delta, and `<role>` is not part of the contract.
  assert.equal(nodes.get("src/SlotRepo.java").delta, "")

  assert.deepEqual(checkGraph({ nodes, values: parseValues(VALUES_XML), frd: FRD, known: KNOWN }), [])
})

test("rule 6: one vocabulary for the pipeline — the word comes from step 6, not from the designer", () => {
  const b = blockersOf(GRAPH.replace('delta="Added"', 'delta="add"'))
  assert.equal(b.length, 1)
  assert.match(b[0], /^6 узел src\/SlotLock\.java: delta="add" — допустимо Added \| Changed \| Removed \| Fixed \| Unknown$/)
})

test("rule 6: a transit node cannot be invented, a new module can", () => {
  // The subgraph forgot SlotRepo: a node with no delta claims something about what EXISTS, and the
  // order carried only one source for that claim.
  const b = blockersOf(GRAPH, { known: new Set(["src/BookingResource.java", "src/BookingService.java"]) })
  assert.deepEqual(b, ["6 узел без delta вне подграфа ряби — src/SlotRepo.java: транзитный узел копируется из .agent/ripple.xml, выдумать его нельзя"])
  // The mirror case is already green in the happy test: SlotLock is absent from KNOWN too, and it
  // passes — because it carries a delta and is therefore declared NEW.

  // With no subgraph supplied at all the rule stays silent — the discipline F5 keeps without sources.
  assert.deepEqual(blockersOf(GRAPH, { known: null }), [])
})

test("every reference resolves: a contract's name in the dictionary, an edge on a node of this file", () => {
  // A name private to the graph: assembly would substitute emptiness, and the card of pass C would
  // show a value pass A never declared.
  assert.deepEqual(blockersOf(GRAPH.replace('in="v3 | v10"', 'in="v3 | v99"')),
    ["узел src/SlotLock.java: в in стоит v99, которого нет в словаре — контракт называет значение по имени, выдумать имя нельзя"])

  // An edge out of the graph: rule 3 of pass C walks k→k+1 along `<dep>`, and there is nothing here
  // for it to walk on — a transit node is COPIED into this file precisely so it carries its contract.
  assert.deepEqual(blockersOf(GRAPH.replace('<dep path="src/SlotRepo.java"/>', '<dep path="src/Nope.java"/>')),
    ['узел src/SlotLock.java: <dep path="src/Nope.java"> — такого узла в этом файле нет; ребро ведёт наружу графа, и шагнуть по нему маршруту будет некуда'])
})

// The half of rule 8 its move to pass A could not take with it (backlog, «Что концепт обещает, а код
// не подтвердил», п. 2). The dictionary can only decide "declared"; "produced by some node" is
// decidable HERE and nowhere else — rule 7 judges the alternatives of a node, not the rows of the
// dictionary. Delete the block and this test goes red while checkValues stays green.
test("the failure the dictionary carries is named by SOME node's out — the hole rule 8's move opened", () => {
  const xml = GRAPH.replace('out="v2 | v8 | v4"', 'out="v2 | v8"')
  assert.deepEqual(blockersOf(xml), [
    "отказ SLOT_TAKEN назван значением v4, но ни один узел не отдаёт его в out — отдавать отказ некому, маршрута у него не будет, значит не будет и юнита",
  ])
  // And the dictionary is still green on that very artifact: the value IS declared. That is exactly
  // the width of the hole this check closes.
  assert.deepEqual(checkValues({ values: parseValues(VALUES_XML), frd: FRD }), [])

  // A code no value carries at all is rule 8's finding, judged one artifact earlier — one defect,
  // one blocker, and it is not repeated here.
  assert.deepEqual(blockersOf(xml, { values: VALUES_XML.replace('text="409 SLOT_TAKEN"', 'text="409 {conflict}"') }), [])
  // An FRD that declares no failure at all says nothing here.
  assert.deepEqual(blockersOf(xml, { frd: parseFrd(FRD_XML.replace(/<failure .*\/>/, "")) }), [])
})

test("totality: garbage, undefined and no argument at all are read as an empty graph, not thrown", () => {
  assert.equal(parseNodes(undefined).size, 0)
  assert.equal(parseNodes(null).size, 0)
  assert.equal(parseNodes('<values><value id="v1" text="POST /bookings"/></values>').size, 0)
  assert.deepEqual(checkGraph({}), [])
  assert.deepEqual(checkGraph(), [])
})
