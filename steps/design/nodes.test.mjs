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
import { readFileSync } from "node:fs"
import { parseNodes, checkGraph, cards } from "./nodes.mjs"
import { parseValues, checkValues } from "./values.mjs"
import { parseFrd } from "../intake/frd.mjs"

// The dictionary of the booking change — every value the graph below is allowed to speak of.
const VALUES_XML = `<values>
  <value id="v1" text="POST /bookings {slotId,userId}" closes="UC1/in"/>
  <value id="v2" text="book(slotId,userId)"/>
  <value id="v3" text="lock(slotId,ttl)"/>
  <value id="v4" text="409 SLOT_TAKEN"/>
  <value id="v5" text="Taken"/>
  <value id="v6" text="Conflict(slotId)"/>
  <value id="v7" text="Booked(bookingId)"/>
  <value id="v8" text="201 {bookingId}" closes="UC1/post"/>
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

// The card is what pass C's order carries INSTEAD of ripple.xml (docs/design-step-by-step.md §4.C).
// Its one job is that every value stands as a PAIR — the id the route will write and the text that
// says what it is — so the role picks a name it sees instead of counting `|` separators in its own
// string. That is the seam of rule 1, and it is proven by taking a half of the pair away.
test("the card names every value by id AND text, and never by position", () => {
  const block = cards(parseValues(VALUES_XML), parseNodes(GRAPH))

  assert.equal(block.split("\n\n")[2], [
    "src/SlotLock.java   (Added)",
    "  принимает: v3 lock(slotId,ttl) · v10 Saved",
    "  отдаёт:    v5 Taken · v9 save(slotId,lock) · v11 Lock",
    "  соседи:    src/SlotRepo.java",
  ].join("\n"))

  // Rule 1's disease: a positional reference. Nothing in the card may offer one.
  assert.doesNotMatch(block, /#\d/)

  // And the pair is the invariant of EVERY cell, not of the one asserted above: strip the id or
  // strip the text in `cards` and this goes red on the whole block.
  const cells = block.split("\n").filter((l) => /(принимает|отдаёт):/.test(l))
    .flatMap((l) => l.split(/:\s+/)[1].split(" · "))
  assert.equal(cells.length, 19)
  for (const c of cells) assert.match(c, /^v\d+ \S/, `значение показано половиной пары: "${c}"`)
})

test("the card is total: absence is shown, never dropped — no delta, no neighbours, no such id", () => {
  // A transit node: no delta (it is COPIED from the ripple subgraph, docs/data-flow.md §4), no
  // `<dep>` at all. Both absences are printed, because a missing row reads as a broken card and the
  // role would look for the neighbour it is not allowed to step to.
  assert.equal(cards(parseValues(VALUES_XML), parseNodes(GRAPH)).split("\n\n")[3], [
    "src/SlotRepo.java   (транзит)",
    "  принимает: v9 save(slotId,lock)",
    "  отдаёт:    v10 Saved",
    "  соседи:    —",
  ].join("\n"))

  // An id the dictionary does not carry — checkGraph blocks that graph, so the card is only ever
  // built on a green one; it still may not answer with a bare id, which is the shape rule 1 died of.
  assert.match(cards(new Map(), parseNodes(GRAPH)), /принимает: v1 \(нет в словаре\)/)

  assert.equal(cards(), "")
  assert.equal(cards(parseValues(VALUES_XML), parseNodes(undefined)), "")
})

// --- D8: the role of this pass and its order ------------------------------------------------------
//
// The two seams the slice keeps outside the core, in the shape design.test.mjs and part.test.mjs use:
// the order carries exactly the keys the band passes, and the role names the checks it claims. Both
// are here rather than in design.test.mjs because `designer.md` is now the role of THIS pass and
// `checkGraph` above is the judge of what it writes.
const ROLE = readFileSync(new URL("designer.md", import.meta.url), "utf8")
const ORDER_NODES = readFileSync(new URL("order-nodes.tpl", import.meta.url), "utf8")

// The keys the band substitutes for pass B (backlog D10 writes `designing()`; this list is the
// contract it must satisfy). VALUES is the one the pass exists for: the dictionary arrives as DATA,
// so a contract's name is READ, not recalled (docs/design-step-by-step.md §4.A).
//
// PREVIOUS is the artifact of the LAST attempt, and it is a key of this order and not of the other two:
// pass B is the only one whose role is asked to REPAIR a file rather than write one (run 088fb3ee,
// where attempt 2 regenerated the graph and lost a node attempt 1 had gotten right).
const ORDER_KEYS = ["VALUES", "FRD", "RIPPLE", "ANSWERS", "MODE", "DELTA_FORMS", "PREVIOUS", "FEEDBACK", "STAGING", "CHECK"]

test("order-nodes.tpl uses exactly the keys the band passes, and names no delta word of its own", () => {
  const keys = [...ORDER_NODES.matchAll(/{{|}}|{([A-Za-z_$][\w$]*)}/g)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]))
  assert.deepEqual([...new Set(keys)].sort(), [...ORDER_KEYS].sort())

  // Discrepancy C: the vocabulary arrives SUBSTITUTED, and neither file spells it out a second time.
  for (const text of [ROLE, ORDER_NODES]) assert.doesNotMatch(text, /delta="(add|change|remove)"/)
  assert.match(ORDER_NODES, /{DELTA_FORMS}/)
})

// BUG_FIX_CONTEXT: the first launch of step 9 never reached the role at all — pi refused the whole
//   workflow at metadata validation: «Invalid role frontmatter: Nested mappings are not allowed in
//   compact mappings at line 1, column 14». The `description:` line carried a second «: » inside an
//   unquoted YAML scalar, which YAML reads as a nested mapping. The cost is the whole run, before a
//   single token is spent, and the message names YAML rather than the file's purpose — so the seam
//   is here, where it costs a millisecond. (Moved from design.test.mjs with the role, backlog D8.)
test("role frontmatter: the description carries no bare colon — YAML would read it as a nested mapping", () => {
  const line = (ROLE.match(/^description:.*$/m) || [""])[0]
  assert.doesNotMatch(line.slice("description:".length), /:\s/)
})

// The strongest seam available to a role file: its EXAMPLE is run through the real guardrail. A role
// whose own example blocks teaches the model exactly the artifact the check refuses — and that is not
// a hypothetical, it is discrepancy A's shape one layer up (a fixture that invented its own form).
test("the role's example is a green graph — parseNodes + checkGraph, zero blockers", () => {
  const xml = [...ROLE.matchAll(/```xml\n([\s\S]*?)```/g)].map((m) => m[1])
  assert.equal(xml.length, 2, "the example shows the dictionary it reads and the graph it writes")

  const exValues = parseValues(xml[0])
  const exNodes = parseNodes(xml[1])
  assert.equal(exNodes.size, 5)
  // The node D20 added: a module the change CREATES, whose `out` is not readable off a neighbour and
  // is the value it took — `in="v8" out="v8"`. It is here because run 088fb3ee had no example of it.
  assert.deepEqual(exNodes.get("src/Discount.java").out, ["v8"])
  assert.deepEqual(exNodes.get("src/Discount.java").in, ["v8"])

  // The FRD and the subgraph of the example's own prose: `COUPON_EXPIRED` is its failure, and the two
  // nodes it says come from the ripple subgraph are what `known` may contain.
  const exFrd = parseFrd(`<frd grammar="1" goal="купоны на чекауте">
    <failure code="COUPON_EXPIRED" status="410" client="показать срок" operator="—" from="UC1/1a"/>
  </frd>`)
  const exKnown = new Set(["src/CouponRepo.java", "src/Coupon.java"])

  assert.deepEqual(checkGraph({ nodes: exNodes, values: exValues, frd: exFrd, known: exKnown }), [])

  // …and the guardrail really ran on it: take the failure's value out of the dictionary and the same
  // call reddens twice — an unknown id in a contract, and rule 8's half that lives here.
  const short = parseValues(xml[0].replace(/<value id="v12"[^>]*\/>/, ""))
  assert.equal(checkGraph({ nodes: exNodes, values: short, frd: exFrd, known: exKnown }).length, 1)
})

// The strongest half of D18, and the one a grep cannot fake: the EXAMPLE has to SHOW a narrow
// contract. Before this it consumed the dictionary whole — 13 ids declared, 13 used — and for a weak
// tier that is the lesson «every id must find a home», which is exactly the defect.
test("the example of pass B leaves ids OUT of the contracts, and says which and why", () => {
  const xml = [...ROLE.matchAll(/```xml\n([\s\S]*?)```/g)].map((m) => m[1])
  const declared = [...parseValues(xml[0]).keys()]
  const used = new Set([...parseNodes(xml[1]).values()].flatMap((n) => [...n.in, ...n.out]))
  const unused = declared.filter((id) => !used.has(id))

  assert.ok(declared.length > used.size, `словарь ${declared.length}, использовано ${used.size} — пример потребляет всё`)
  assert.ok(unused.length >= 2, `не вошло ${unused.length} — одного мало, чтобы это читалось правилом`)
  // …and the commentary NAMES them: an id silently absent teaches nothing, an id whose absence is
  // explained is the rule itself.
  for (const id of unused) assert.match(ROLE, new RegExp(`\`${id}\``), `${id} не вошёл и не объяснён`)
  // The third ground is shown too, not only stated: a value with no consumer in the graph that stays
  // IN because the FRD names it.
})

test("totality: garbage, undefined and no argument at all are read as an empty graph, not thrown", () => {
  assert.equal(parseNodes(undefined).size, 0)
  assert.equal(parseNodes(null).size, 0)
  assert.equal(parseNodes('<values><value id="v1" text="POST /bookings"/></values>').size, 0)
  assert.deepEqual(checkGraph({}), [])
  assert.deepEqual(checkGraph(), [])
})

// --- Правила 13 и 14, реинтродукция из прогона 1df91a31 -----------------------------------------
//
// Дословный граф того прогона: у страницы `out` пуст. Гардрейл принял его зелёным
// (`function/design/3`: nodes 3), и проход C сжёг три круга, потому что легального routes.xml при
// `delta ≠ "" ∧ out = ∅` не существует: шаг пишется значением из `out` (routes.mjs), а правила 2 и 5
// требуют этот узел на маршруте. Снять правило 14 — фикстура снова зелёная, и цена известна.
const FRD_1DF9 = parseFrd(`<frd grammar="1" goal="один фрукт по имени и карточка на странице списка">
  <usecase id="UC1" actor="http-client" goal="получить один фрукт по имени">
    <post>вернён JSON-объект одного фрукта либо 404</post>
    <step n="1">клиент отправляет GET /fruits/{name}</step>
  </usecase>
  <usecase id="UC2" actor="user" goal="увидеть карточку фрукта inline">
    <post>карточка выбранного фрукта показана inline</post>
    <step n="1">пользователь выбирает фрукт из списка</step>
    <step n="2">страница показывает карточку фрукта inline</step>
  </usecase>
  <delta op="GET /fruits/{name}" form="Added" node="src/main/java/org/acme/rest/json/FruitResource.java"/>
  <scenario id="S1" uc="UC1" before="эндпоинта нет" after="эндпоинт отдаёт один фрукт" nodes="src/main/java/org/acme/rest/json/FruitResource.java"/>
  <scenario id="S2" uc="UC2" before="карточки нет" after="карточка раскрыта inline" nodes="src/main/resources/META-INF/resources/fruits.html"/>
  <touched path="src/main/resources/META-INF/resources/fruits.html" why="добавлен inline-показ карточки"/>
</frd>`)

const PAGE = "src/main/resources/META-INF/resources/fruits.html"
const RES = "src/main/java/org/acme/rest/json/FruitResource.java"

const VALUES_1DF9 = parseValues(`<values>
  <value id="v1" text="GET /fruits/{name} {name}" closes="UC1/in"/>
  <value id="v2" text="Выбор(name)" closes="UC2/in"/>
  <value id="v3" text="Fruit(name,description)"/>
  <value id="v13" text="200 {Fruit}" closes="UC1/post"/>
  <value id="v15" text="Карточка(name,description)" closes="UC2/post"/>
</values>`)

const GRAPH_1DF9 = `<design mode="minor" base=".agent/appgraph.xml">
  <module path="${RES}" delta="Added">
    <contract in="v1 | v3" out="v13"/>
    <dep path="${PAGE}"/>
  </module>
  <module path="${PAGE}" delta="Changed">
    <contract in="v2 | v3" out=""/>
    <dep path="${RES}"/>
  </module>
</design>`

const graphOf = (xml) => checkGraph({ nodes: parseNodes(xml), values: VALUES_1DF9, frd: FRD_1DF9, known: new Set([RES, PAGE]) })

test("14: узел с delta и пустым out — маршрута через него не написать", () => {
  const b = graphOf(GRAPH_1DF9).filter((l) => l.startsWith("14 "))
  assert.equal(b.length, 2, b.join("\n"))
  assert.match(b[0], new RegExp(`^14 узел ${PAGE} с delta="Changed": out пуст`))
  // Та же дыра со стороны правила 5: touched-путь обязан лежать на маршруте.
  assert.match(b[1], new RegExp(`^14 touched-путь FRD ${PAGE}: out пуст`))

  // Заполненный out — зелено по правилу 14.
  assert.deepEqual(graphOf(GRAPH_1DF9.replace('out=""', 'out="v15"')).filter((l) => l.startsWith("14 ")), [])
})

test("14: touched-путь FRD, которого нет в графе вовсе", () => {
  const b = graphOf(GRAPH_1DF9.replace(new RegExp(`  <module path="${PAGE}"[\\s\\S]*?</module>\n`), "")).filter((l) => l.startsWith("14 "))
  assert.deepEqual(b, [`14 touched-путь FRD ${PAGE} отсутствует в графе — маршрут обязан пройти через него (правило 5), а узла нет`])
})

test("13: закрывающее значение поселено в контракте узла своего сценария", () => {
  // v15 закрывает UC2/post, сценарий S2 называет страницу — значит v15 обязан стоять в её `out`.
  const b = graphOf(GRAPH_1DF9).filter((l) => l.startsWith("13 "))
  assert.deepEqual(b, [`13 значение v15 закрывает UC2/post, но не стоит в out ни одного узла сценария этого use case — ${PAGE}`])
  assert.deepEqual(graphOf(GRAPH_1DF9.replace('out=""', 'out="v15"')).filter((l) => l.startsWith("13 ")), [])

  // Вход судится по той же схеме, но по `in`: убрать v2 из `in` страницы — красное.
  const noEntry = GRAPH_1DF9.replace('in="v2 | v3" out=""', 'in="v3" out="v15"')
  assert.deepEqual(graphOf(noEntry).filter((l) => l.startsWith("13 ")),
    [`13 значение v2 закрывает UC2/in, но не стоит в in ни одного узла сценария этого use case — ${PAGE}`])
})

// --- Правило 14 НАЗЫВАЕТ кандидатов, реинтродукция из прогона 088fb3ee ---------------------------
//
// Дословные фрагменты живых артефактов (`sandbox/runbox/eddi/.agent/{frd.xml,values.xml}` и графа
// первой попытки прохода B). Правило не ослаблено: пустой `out` по-прежнему красный — меняется только
// текст блокера, потому что «назови, что этот узел отдаёт» роль не смогла выполнить трижды подряд.
const G_MODEL = "src/main/java/ai/labs/eddi/configs/glossary/model/Glossary.java"
const G_IFACE = "src/main/java/ai/labs/eddi/configs/glossary/IGlossaryStore.java"
const G_REST_IFACE = "src/main/java/ai/labs/eddi/configs/glossary/IRestGlossaryStore.java"
const G_REST = "src/main/java/ai/labs/eddi/configs/glossary/rest/RestGlossaryStore.java"
const G_OPS = "GET /glossarystore/glossaries/descriptors, POST /glossarystore/glossaries"

const FRD_088 = parseFrd(`<frd grammar="1" goal="Глоссарии агента с Терминами">
  <usecase id="UC1" actor="api-client" goal="CRUD Глоссариев">
    <post>CRUD Глоссариев работает с кодами 200/201/204</post>
    <step n="1">клиент вызывает эндпоинт Глоссариев</step>
  </usecase>
  <delta op="-" form="Added" node="${G_MODEL}" new="yes"/>
  <delta op="-" form="Added" node="${G_IFACE}" new="yes"/>
  <delta op="${G_OPS}" form="Added" node="${G_REST_IFACE}" new="yes"/>
  <scenario id="S1" uc="UC1" before="GET /glossarystore/glossaries → 404" after="CRUD Глоссариев работает" nodes="${G_REST} ${G_MODEL}"/>
</frd>`)

const VALUES_088 = parseValues(`<values>
  <value id="v9" text="${G_OPS}" closes="UC1/in"/>
  <value id="v16" text="GET /glossarystore/glossaries/descriptors"/>
  <value id="v18" text="POST /glossarystore/glossaries"/>
  <value id="v94" text="Glossary(id, version, terms)"/>
  <value id="v95" text="200 {glossary}" closes="UC1/post"/>
</values>`)

// Граф первой попытки: три создаваемых узла с пустым `out` — ровно то, что прогон отдал в `design/3`.
const GRAPH_088 = `<design mode="major" base=".agent/appgraph.xml">
  <module path="${G_REST_IFACE}" delta="Added"><contract in="" out=""/></module>
  <module path="${G_IFACE}" delta="Added"><contract in="" out=""/></module>
  <module path="${G_MODEL}" delta="Added"><contract in="v94" out=""/></module>
</design>`

const of088 = (xml = GRAPH_088) => checkGraph({ nodes: parseNodes(xml), values: VALUES_088, frd: FRD_088, known: null })

test("14: у узла с настоящим op блокер перечисляет кандидатов и говорит, откуда взят каждый", () => {
  const b = of088().filter((l) => l.includes(G_REST_IFACE))
  assert.equal(b.length, 1, b.join("\n"))
  // Правило то же самое — красное, по тому же номеру и той же причине.
  assert.match(b[0], new RegExp(`^14 узел ${G_REST_IFACE} с delta="Added": out пуст`))
  // …и оно НАЗЫВАЕТ выходы: каждый id, чей текст стоит в `op` дельты FRD этого узла.
  assert.match(b[0], /кандидаты — v9 \(текст значения стоит в op дельты FRD этого узла\) · v16 \(текст значения стоит в op дельты FRD этого узла\) · v18 \(текст значения стоит в op дельты FRD этого узла\): возьми из них, а не придумывай$/)

  // Три основания сразу: `in` узла и конец use case, чей сценарий его называет.
  const model = of088().filter((l) => l.startsWith("14 ") && l.includes(G_MODEL))
  assert.equal(model.length, 1, model.join("\n"))
  assert.match(model[0], /кандидаты — v94 \(уже в in этого узла: узел-транзит отдаёт то, что принял\) · v95 \(закрывает конец UC1\/post, сценарий которого называет этот узел\)/)
})

test("14: кандидатов нет — блокер адресует дефицит шагу 6, а не требует выдумки", () => {
  // `op="-"` у шага 6, узла нет ни в одном сценарии, `in` пуст: предложить нечего, и это факт о FRD.
  const b = of088().filter((l) => l.includes(G_IFACE))
  assert.equal(b.length, 1, b.join("\n"))
  assert.match(b[0], /Кандидатов нет: FRD не сказал, что этот узел заводит \(<delta op> пуст или заглушка\)\. Это дефицит шага 6, а не твоя выдумка — верни track:"err" kind:"question"$/)

  // Заглушка судится ровно как пустой op: верни настоящую операцию — и кандидаты появляются.
  const real = checkGraph({
    nodes: parseNodes(GRAPH_088),
    values: VALUES_088,
    frd: parseFrd(`<frd grammar="1" goal="g"><delta op="${G_OPS}" form="Added" node="${G_IFACE}" new="yes"/></frd>`),
  }).filter((l) => l.includes(G_IFACE))
  assert.match(real[0], /кандидаты — v9 .* · v16 .* · v18 /)
})

test("14: правило НЕ ослаблено — пустой out остаётся красным на каждом из трёх узлов", () => {
  assert.equal(of088().filter((l) => l.startsWith("14 ")).length, 3)
  // Заполненный `out` — зелено по правилу 14 у всех троих.
  const filled = GRAPH_088.replace(/out=""/g, 'out="v94"')
  assert.deepEqual(of088(filled).filter((l) => l.startsWith("14 ")), [])
})

test("13: use case, чьи сценарии не называют узлов, не судится — блокеру некуда указать", () => {
  const frd = parseFrd(`<frd grammar="1" goal="g">
    <usecase id="UC2" actor="user" goal="g"><post>p</post><step n="1">s</step></usecase>
    <scenario id="S2" uc="UC2" before="b" after="a"/>
  </frd>`)
  const b = checkGraph({ nodes: parseNodes(GRAPH_1DF9.replace('out=""', 'out="v15"')), values: VALUES_1DF9, frd, known: null })
  assert.deepEqual(b.filter((l) => l.startsWith("13 ")), [])
})

// --- Правило 15, реинтродукция из прогона 5bbe5de4 -----------------------------------------------
//
// Живые артефакты прогона: 14 узлов, 137 значений, `v47 «readGlossaries()»` в `in` у IResourceSource
// и ни в одном `out`. Проходы A и B закрылись зелёными, правило 10 нашло сироту на проходе C, а
// `blameOf` оставляет строку правила 10 проходу C — роутеру, который значение произвести не может.
// Одиннадцать запусков ролей, 2 455 854 токена, $3.39, `.agent/plan-index.json` не написан.
//
// Фикстура ДОСЛОВНА. `design-nodes.xml` — целиком; `values.xml` — строки 1-64, 145-158 и 194-206
// (`~/IdeaProjects/codemonstersdev/sandbox/runbox/eddi/.agent/`). Выброшен ripple-блок: 70 значений,
// которых не называет ни один контракт этого графа. Что выписка ничего не исказила, проверяет сам
// тест: безномерный чек «нет в словаре» молчит, а значит все имена графа на месте.
const VALUES_5BBE = `<values>
  <!-- ===== FAILURE DOMAIN VALUES (LAW 4: node-detecting-node answer) ===== -->
  <value id="v1" text="GlossaryNotFound(id)"/>
  <value id="v2" text="TermKeyInvalid(key)"/>
  <value id="v3" text="TermKeyDuplicate(key)"/>
  <value id="v4" text="VersionConflict(expected,actual)"/>
  <value id="v5" text="TermNotFound(key)"/>
  <value id="v6" text="AgentNotFound(agentId)"/>
  <value id="v7" text="ImportInvalidData()"/>

  <!-- ===== FAILURE HTTP STATUS STRINGS (LAW 4: boundary-to-client string) ===== -->
  <value id="v8" text="404 GLOSSARY_NOT_FOUND"/>
  <value id="v9" text="400 TERM_KEY_INVALID"/>
  <value id="v10" text="409 TERM_KEY_DUPLICATE"/>
  <value id="v11" text="409 VERSION_CONFLICT"/>
  <value id="v12" text="404 TERM_NOT_FOUND"/>
  <value id="v13" text="404 AGENT_NOT_FOUND"/>
  <value id="v14" text="400 IMPORT_INVALID_DATA"/>

  <!-- ===== USE CASE ENTRIES (= first step) ===== -->
  <!-- v15-v22 are also glossary CRUD endpoints (new modules from delta) -->
  <value id="v15" text="POST /glossarystore/glossaries {body}" closes="UC1/in"/>
  <value id="v16" text="GET /glossarystore/glossaries/{id}?version=N" closes="UC2/in"/>
  <value id="v17" text="PUT /glossarystore/glossaries/{id}?version=N {body}" closes="UC3/in"/>
  <value id="v18" text="DELETE /glossarystore/glossaries/{id}?version=N" closes="UC4/in"/>
  <value id="v19" text="POST /glossarystore/glossaries/{id}/terms {key,value}" closes="UC5/in"/>
  <value id="v20" text="GET /glossarystore/glossaries/{id}/terms" closes="UC6/in"/>
  <value id="v21" text="PUT /glossarystore/glossaries/{id}/terms/{key}?version=N {key,value}" closes="UC7/in"/>
  <value id="v22" text="DELETE /glossarystore/glossaries/{id}/terms/{key}?version=N" closes="UC8/in"/>
  <!-- UC9 entry = LlmTask.execute (merged with ripple v104) -->
  <value id="v23" text="execute(IConversationMemory memory, Object component)" closes="UC9/in"/>
  <!-- UC10 entry = POST /backup/export/{agentId} (merged with ripple v49) -->
  <value id="v24" text="POST /backup/export/{agentId}" closes="UC10/in"/>
  <!-- UC11 entry = POST /backup/import (merged with ripple v51) -->
  <value id="v25" text="POST /backup/import {ZIP}" closes="UC11/in"/>

  <!-- ===== EXTENSION OUTCOME VALUES (one per ext id, LAW 6) ===== -->
  <value id="v26" text="Глоссарий не вернут, HTTP 404" closes="UC2/2a"/>
  <value id="v27" text="Глоссарий не обновлён, HTTP 404" closes="UC3/3a"/>
  <value id="v28" text="Глоссарий не обновлён, HTTP 409" closes="UC3/3b"/>
  <value id="v29" text="Глоссарий не удалён, HTTP 404" closes="UC4/4a"/>
  <value id="v30" text="Глоссарий не удалён, HTTP 409" closes="UC4/4b"/>
  <value id="v31" text="Термин не создан, HTTP 404" closes="UC5/5a"/>
  <value id="v32" text="Термин не создан, HTTP 400" closes="UC5/5b"/>
  <value id="v33" text="Термин не создан, HTTP 409" closes="UC5/5c"/>
  <value id="v34" text="Термины не вернут, HTTP 404" closes="UC6/6a"/>
  <value id="v35" text="Термин не обновлён, HTTP 404 (Глоссарий)" closes="UC7/7a"/>
  <value id="v36" text="Термин не обновлён, HTTP 404 (Термин)" closes="UC7/7b"/>
  <value id="v37" text="Термин не обновлён, HTTP 409" closes="UC7/7c"/>
  <value id="v38" text="Термин не удалён, HTTP 404 (Глоссарий)" closes="UC8/8a"/>
  <value id="v39" text="Термин не удалён, HTTP 404 (Термин)" closes="UC8/8b"/>
  <value id="v40" text="Термин не удалён, HTTP 409" closes="UC8/8c"/>
  <value id="v41" text="{{glossary.&lt;key&gt;}} не заменён — Глоссарий удалён" closes="UC9/9a"/>
  <value id="v42" text="{{glossary.&lt;key&gt;}} не заменён — Термин отсутствует" closes="UC9/9b"/>
  <value id="v43" text="экспорт не выполнен, HTTP 404" closes="UC10/10a"/>
  <value id="v44" text="Глоссарий не импортирован, HTTP 400" closes="UC11/11a"/>

  <!-- ===== DATA RECORDS (from FRD data dictionary, all kind="field") ===== -->
  <value id="v45" text="Glossary(id,resourceType,version,terms)"/>
  <value id="v46" text="Term(key,value)"/>

  <!-- ===== DELTA: NEW METHOD added to 3 modules ===== -->
  <value id="v47" text="readGlossaries()"/>

  <!-- PromptSnippetService (seed, changed by delta) -->
  <value id="v102" text="getAll()"/>
  <value id="v103" text="invalidateCache()"/>

  <!-- LlmTask (seed, changed by delta) — execute merged with UC9 entry v23 -->
  <value id="v104" text="configure(Map&lt;String, Object&gt; configuration, Map&lt;String, Object&gt; extensions)"/>
  <value id="v105" text="getId()"/>
  <value id="v106" text="getType()"/>
  <value id="v107" text="getExtensionDescriptor()"/>

  <!-- TemplatingEngine (seed, changed by delta) -->
  <value id="v108" text="TemplatingEngine(Engine engine)"/>
  <value id="v109" text="processTemplate(String template, Map&lt;String, Object&gt; dynamicAttributesMap)"/>
  <value id="v110" text="processTemplate(String template, Map&lt;String, Object&gt; dynamicAttributesMap, TemplateMode templateMode)"/>
  <!-- ===== POST-SUCCESS VALUES (last step of each usecase, LAW 6) ===== -->
  <value id="v129" text="201 Created {Location}" closes="UC1/post"/>
  <value id="v130" text="200 {Glossary(id,version,terms)}" closes="UC2/post"/>
  <value id="v131" text="200 {Glossary(id,version,terms)}" closes="UC3/post"/>
  <value id="v132" text="200 OK" closes="UC4/post"/>
  <value id="v133" text="201 Created {Location}" closes="UC5/post"/>
  <value id="v134" text="200 {List&lt;Term&gt;}" closes="UC6/post"/>
  <value id="v135" text="200 {Glossary(id,version,terms)}" closes="UC7/post"/>
  <value id="v136" text="200 {Glossary(id,version,terms)}" closes="UC8/post"/>
  <value id="v137" text="RenderedTemplate(template)" closes="UC9/post"/>
  <value id="v138" text="200 {ZIP}" closes="UC10/post"/>
  <value id="v139" text="200 OK" closes="UC11/post"/>
</values>`

const NODES_5BBE = `<design mode="major" base=".agent/appgraph.xml">
  <!-- ===== NEW GLOSSARY MODULES ===== -->

  <module path="src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java" delta="Added">
    <role>REST boundary for Glossary CRUD: /glossarystore/glossaries, /glossarystore/glossaries/{id}/terms</role>
    <contract in="v15 | v16 | v17 | v18 | v19 | v20 | v21 | v22 | v1 | v2 | v3 | v4 | v5 | v45 | v8 | v9 | v10 | v11 | v12"
              out="v45 | v46 | v8 | v9 | v10 | v11 | v12 | v129 | v130 | v131 | v132 | v133 | v134 | v135 | v136 | v26 | v27 | v28 | v29 | v30 | v31 | v32 | v33 | v34 | v35 | v36 | v37 | v38 | v39 | v40"/>
    <dep path="src/main/java/ai/labs/eddi/configs/glossaries/IGlossaryStore.java"/>
    <dep path="src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java"/>
  </module>

  <module path="src/main/java/ai/labs/eddi/configs/glossaries/IGlossaryStore.java" delta="Added">
    <role>Domain interface for Glossary persistence operations</role>
    <contract in="v45 | v46"
              out="v1 | v2 | v3 | v4 | v5"/>
    <dep path="src/main/java/ai/labs/eddi/configs/glossaries/mongo/GlossaryStore.java"/>
  </module>

  <module path="src/main/java/ai/labs/eddi/configs/glossaries/mongo/GlossaryStore.java" delta="Added">
    <role>MongoDB persistence for Glossary: CRUD, version checks, readGlossaries for template injection</role>
    <contract in="v45 | v46 | v1 | v2 | v3 | v4 | v5"
              out="v45 | v1 | v2 | v3 | v4 | v5 | v41 | v42"/>
    <dep path="src/main/java/ai/labs/eddi/configs/glossaries/IGlossaryStore.java"/>
    <dep path="src/main/java/ai/labs/eddi/configs/glossaries/model/Glossary.java"/>
    <dep path="src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java"/>
  </module>

  <module path="src/main/java/ai/labs/eddi/configs/glossaries/model/Glossary.java" delta="Added">
    <role>Glossary data model: id, resourceType, version, terms</role>
    <contract in="v45 | v46" out="v45"/>
  </module>

  <!-- ===== BACKUP: EXPORT (UC10) ===== -->

  <module path="src/main/java/ai/labs/eddi/backup/impl/RestExportService.java" delta="Added">
    <role>Export agent + glossaries as ZIP: POST /backup/export/{agentId}</role>
    <contract in="v24 | v45 | v13"
              out="v138 | v13 | v43"/>
    <dep path="src/main/java/ai/labs/eddi/backup/IResourceSource.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/RestExportService.java"/>
  </module>

  <module path="src/main/java/ai/labs/eddi/backup/IResourceSource.java" delta="Added">
    <role>Resource source interface with readGlossaries() for export/import flows</role>
    <contract in="v47" out="v45"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/RestExportService.java"/>
  </module>

  <module path="src/main/java/ai/labs/eddi/backup/impl/RemoteApiResourceSource.java" delta="Added">
    <role>Reads agent resources including glossaries from remote EDDI instance</role>
    <contract in="" out="v45"/>
    <dep path="src/main/java/ai/labs/eddi/backup/IResourceSource.java"/>
  </module>

  <module path="src/main/java/ai/labs/eddi/backup/impl/ZipResourceSource.java" delta="Added">
    <role>Reads agent resources including glossaries from unzipped ZIP directory</role>
    <contract in="v45" out="v45"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/RestImportService.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/IResourceSource.java"/>
  </module>

  <!-- ===== BACKUP: IMPORT (UC11) ===== -->

  <module path="src/main/java/ai/labs/eddi/backup/impl/RestImportService.java" delta="Added">
    <role>Import agent + glossaries from ZIP: POST /backup/import</role>
    <contract in="v25 | v45 | v7 | v14" out="v45 | v7 | v139 | v14 | v44"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/ZipResourceSource.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/StructuralMatcher.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/RestImportService.java"/>
  </module>

  <module path="src/main/java/ai/labs/eddi/backup/impl/StructuralMatcher.java" delta="Added">
    <role>Structurally matches imported glossaries against existing local glossaries by resource URI</role>
    <contract in="v45" out="v45"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/RestImportService.java"/>
  </module>

  <module path="src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java" delta="Added">
    <role>Creates new or merges imported glossaries into existing ones: new version takes priority</role>
    <contract in="v45" out="v45"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/RestImportService.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/StructuralMatcher.java"/>
  </module>

  <!-- ===== TEMPLATE SUBSTITUTION (UC9) ===== -->

  <module path="src/main/java/ai/labs/eddi/modules/llm/impl/LlmTask.java" delta="Changed">
    <role>LLM task orchestrator: resolves connected glossaries, prepares template context with glossary terms</role>
    <contract in="v23 | v45 | v102 | v137 | v41 | v42"
              out="v45 | v102 | v109 | v137 | v41 | v42"/>
    <dep path="src/main/java/ai/labs/eddi/configs/glossaries/mongo/GlossaryStore.java"/>
    <dep path="src/main/java/ai/labs/eddi/modules/llm/impl/PromptSnippetService.java"/>
    <dep path="src/main/java/ai/labs/eddi/modules/templating/impl/TemplatingEngine.java"/>
    <dep path="src/main/java/ai/labs/eddi/modules/llm/impl/LlmTask.java"/>
  </module>

  <module path="src/main/java/ai/labs/eddi/modules/llm/impl/PromptSnippetService.java" delta="Changed">
    <role>Returns Snippets and Glossary Terms combined for template substitution via getAll()</role>
    <contract in="v45 | v102"
              out="v102"/>
    <dep path="src/main/java/ai/labs/eddi/modules/llm/impl/LlmTask.java"/>
  </module>

  <module path="src/main/java/ai/labs/eddi/modules/templating/impl/TemplatingEngine.java" delta="Changed">
    <role>Qute-based templating engine with glossary namespace support for {{glossary.&lt;key&gt;}} substitution</role>
    <contract in="v109" out="v137"/>
    <dep path="src/main/java/ai/labs/eddi/modules/llm/impl/LlmTask.java"/>
  </module>
</design>`

const of5bbe = (xml = NODES_5BBE) => checkGraph({ nodes: parseNodes(xml), values: parseValues(VALUES_5BBE), frd: {}, known: null })

const EXPORT_OUT = 'out="v138 | v13 | v43"'
const SOURCE = "src/main/java/ai/labs/eddi/backup/IResourceSource.java"

test("15: значение, принятое узлом, отдаёт кто-то — сирота ровно одна, и это v47", () => {
  // Весь отчёт по живому графу — одна строка. Снять правило 15, и дефект, стоивший прогона, зелен.
  assert.deepEqual(of5bbe(), [
    `15 значение v47 «readGlossaries()» стоит в in узла ${SOURCE}, но не стоит в out ни одного узла: отдавать его некому. Назови узел, который его производит, либо убери из in.`,
  ])

  // Ремонт — одно слово в `out` узла, который это значение производит (вызывающий его RestExportService).
  assert.deepEqual(of5bbe(NODES_5BBE.replace(EXPORT_OUT, 'out="v138 | v13 | v43 | v47"')), [])
})

test("15: входные значения не судятся — их приносит актёр, эмитента у них нет", () => {
  const values = parseValues(VALUES_5BBE)
  const nodes = parseNodes(NODES_5BBE)
  const entries = [...values.closes].filter(([, ts]) => ts.some((t) => t.endsWith("/in"))).map(([id]) => id)
  const accepted = new Set([...nodes.values()].flatMap((n) => n.in))
  const produced = new Set([...nodes.values()].flatMap((n) => n.out))

  // Одиннадцать входов use case, каждый стоит в `in` какого-то узла и ни один — ни в одном `out`:
  // ровно те одиннадцать ложных блокеров, которые даёт правило без исключения.
  assert.equal(entries.length, 11)
  for (const id of entries) {
    assert.equal(accepted.has(id), true, id)
    assert.equal(produced.has(id), false, id)
    assert.equal(of5bbe().some((l) => l.startsWith(`15 значение ${id} `)), false, id)
  }
})
