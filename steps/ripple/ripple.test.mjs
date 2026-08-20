// Slice `ripple`: step 8's pure core — the design flag and the subgraph handed to step 9. Its io
// lives in ext/index.mjs (standards/code.md: an io pipe is not unit-tested). Formula: 1 happy + Σ
// antecedent branches with a DISTINGUISHABLE consequent, and every branch built by REINTRODUCING the
// defect the concept named (docs/ripple.md §2, discrepancies A, B and C).

import test from "node:test"
import assert from "node:assert/strict"
import { newRipple, DESIGN_TABLE, blindNodes, waiverFor, BLIND_STEM, BLIND_TAIL, WAIVER_WORDS } from "./ripple.mjs"
import { parseMap } from "../intake/map.mjs"
import { parseFrd } from "../intake/frd.mjs"
import { newExchange, newAnswers } from "../../core/answers.mjs"
// The CONSUMER's parser, imported by the test and never by the module: `ripple.xml` is written for
// step 9, so the cheapest proof that the two agree on the grammar is to read this file's output with
// the code that will read it for real (steps/design/design.mjs::parseDesign).
import { parseDesign } from "../design/design.mjs"

// Fixture: parcels, a different domain from any live input — a fixture indistinguishable from live
// input stops testing the code. The shape is what the live map has: a chain of four modules, a
// frontend calling the resource, and a test bound to its module both by an edge and by <test>.
const MAP_XML = `<appgraph grammar="3" modules="6">
  <suite id="unit" kind="unit" cmd="mvn test" one="-Dtest={class}" path="src/test" match="*Test.java"/>
  <module path="src/ui/parcels.html" component="c1" level="1" fanin="0" fanout="1">
    <role>страница поиска посылок</role>
  </module>
  <module path="src/ParcelResource.java" pkg="acme.parcel" component="c1" level="3" fanin="2" fanout="1">
    <role>REST-ресурс посылок</role>
    <api name="GET /parcels" kind="http" scope="public" via="@GET public Set&lt;Parcel&gt; list()"/>
    <test path="src/test/ParcelResourceTest.java" suite="unit"/>
  </module>
  <module path="src/ParcelRepo.java" pkg="acme.parcel" component="c1" level="4" fanin="1" fanout="1">
    <role>хранилище посылок</role>
  </module>
  <module path="src/Db.java" pkg="acme.db" component="c1" level="5" fanin="1" fanout="0"/>
  <module path="src/Unrelated.java" level="1" fanin="0" fanout="0"/>
  <module path="src/test/ParcelResourceTest.java" kind="test" suite="unit" component="c1" level="2" fanin="0" fanout="1">
    <role>юнит-тест ресурса посылок</role>
  </module>
  <edge from="src/ui/parcels.html" to="src/ParcelResource.java" via="url: '/parcels'" by="use"/>
  <edge from="src/ParcelResource.java" to="src/ParcelRepo.java" via="private ParcelRepo repo"/>
  <edge from="src/ParcelRepo.java" to="src/Db.java" via="private Db db"/>
  <edge from="src/test/ParcelResourceTest.java" to="src/ParcelResource.java" via=".when().get(&quot;/parcels&quot;)" by="use"/>
</appgraph>`

const MAP = parseMap(MAP_XML)
const RESOURCE = "src/ParcelResource.java"
const REPO = "src/ParcelRepo.java"

const frd = (over = {}) => ({
  deltas: [{ op: "GET /parcels", form: "Added", node: RESOURCE }],
  touched: [RESOURCE],
  scenarios: [{ id: "S1", nodes: RESOURCE }],
  ...over,
})

const build = (over = {}, mode = "minor", cap) =>
  newRipple({ xml: MAP_XML, frd: frd(over), mode, map: MAP, cap })

test("happy: a moved contract orders a design, and the subgraph is the node with its direct neighbours", () => {
  const r = build()
  assert.equal(r.ok, true)

  const v = r.value
  // A moved contract always earns a design: keeping contracts consistent is what step 9 is FOR, and
  // the weight answers a different question entirely (docs/ripple.md §3).
  assert.equal(v.design, "needed")
  assert.deepEqual([...v.seeds], [RESOURCE])
  assert.deepEqual([...v.nodes], ["src/ui/parcels.html", RESOURCE, REPO])   // map's own order
  assert.equal(v.nodes.includes("src/Db.java"), false, "radius 1: a neighbour's neighbour is out")
  assert.equal(v.nodes.includes("src/Unrelated.java"), false)

  // Discrepancy C: a test is never a node of the ripple — it rides inside its module, where the map
  // already bound it, and step 10 takes both the file and the check command from there.
  assert.equal(v.xml.includes("<module path=\"src/test/ParcelResourceTest.java\""), false)
  assert.match(v.xml, /<test path="src\/test\/ParcelResourceTest.java" suite="unit"\/>/)

  // The consumer reads what we wrote: nodes with their deps, in the grammar checkDesign judges.
  const seen = parseDesign(v.xml)
  assert.deepEqual([...seen.keys()], ["src/ui/parcels.html", RESOURCE, REPO])
  assert.deepEqual(seen.get(RESOURCE).deps, ["src/ui/parcels.html", REPO])
  assert.deepEqual(seen.get("src/ui/parcels.html").deps, [RESOURCE])

  // fanin/fanout of the FULL graph beside a list cut to radius 1 would be two places for one fact;
  // what the radius hid is said by `cut` instead — one for the repo, whose Db neighbour is out.
  assert.equal(/fanin=|fanout=/.test(v.xml), false)
  assert.match(v.xml, new RegExp(`<module path="${REPO}"[^>]*cut="1"`))
  assert.equal(/cut=/.test(v.xml.split(REPO)[0]), false, "a node hiding nothing carries no cut")
  assert.match(v.xml, /^<ripple grammar="1" mode="minor" seeds="1" nodes="3">/)
  assert.match(v.xml, new RegExp(`<module path="${RESOURCE}" seed="yes" pkg="acme.parcel"`))
})

test("the flag is the table and the WIDTH — every row of docs/ripple.md §3 is reachable", () => {
  const two = { deltas: [...frd().deltas, { op: "findByTrack", form: "Added", node: REPO }], touched: [RESOURCE, REPO] }

  assert.equal(build().value.design, "needed")                            // minor, one node
  assert.equal(build(two).value.design, "needed")                         // minor, two nodes
  assert.equal(build({}, "major").value.design, "needed")                 // major, one node
  // `patch` is the one row the width decides: the contract does not move, so a single node has
  // nothing to synchronise with — while a fix spread over modules still cuts into two tickets that
  // must not drift apart (docs/ripple.md §3, the operator's rule).
  assert.equal(build({}, "patch").value.design, "skip")                   // patch, one node
  assert.equal(build(two, "patch").value.design, "needed")                // patch, two nodes
  assert.deepEqual(Object.keys(DESIGN_TABLE), ["major", "minor", "patch"])
})

// The regression of live run c4b7cea5 (sandbox/runbox/quarkus-rest-json-app-v2-t2): ONE delta on the
// resource and a second node — the page — touched but deltaless, because a page has no contract of
// its own to move. Counting delta nodes gave `skip`, and the two sides of that very joint were left
// to agree by luck. The WIDTH is the touched nodes; this case reddens the moment it is not.
test("width is the TOUCHED nodes: one delta, two touched, contract unmoved → a design is ordered", () => {
  const spread = {
    deltas: [{ op: "fix double counting", form: "Fixed", node: RESOURCE }],
    touched: [RESOURCE, "src/ui/parcels.html"],
    scenarios: [{ id: "S1", nodes: `src/ui/parcels.html ${RESOURCE}` }],
  }
  assert.equal(build(spread, "patch").value.design, "needed")
})

test("a node a scenario merely passes through is IN the subgraph — step 9 has no other source for it", () => {
  // The repo carries no delta and is not touched; the scenario names it, so the route of step 9 will
  // step through it and checkDesign rule 1 will demand its contract, which the role copies from here.
  const r = newRipple({
    xml: MAP_XML,
    frd: { deltas: [{ op: "GET /parcels", form: "Added", node: RESOURCE }], touched: [], scenarios: [{ id: "S1", nodes: `${RESOURCE} ${REPO}` }] },
    mode: "patch",
    map: MAP,
  })
  assert.equal(r.ok, true)
  assert.deepEqual([...r.value.seeds], [RESOURCE, REPO])
  // The repo is a SEED (the route runs through it) but not WIDTH: the change does not touch it, so
  // it is context for the designer, not a ticket. Counting seeds instead of touched would order a
  // design here on a one-node fix.
  assert.equal(r.value.design, "skip")
})

// The module the change CREATES: declared at step 6 as `<delta new="yes">` (F3n) and absent from the
// map by definition. Reintroducing the defect — dropping the `created` filter — turns this red with
// `unknown-node`, which is exactly how the band died in live run b857d4a0, one step earlier.
const CARD = "src/ui/parcel-card.html"

test("a module this change creates is not a missing node and not a seed — there is nothing to cut around it", () => {
  const r = build({
    deltas: [{ op: "GET /parcels", form: "Added", node: RESOURCE }, { op: "card page", form: "Added", node: CARD, new: "yes" }],
    touched: [RESOURCE, CARD],
    scenarios: [{ id: "S1", nodes: RESOURCE }, { id: "S2", nodes: `${CARD} ${RESOURCE}` }],
  })
  assert.equal(r.ok, true)
  assert.equal(r.value.design, "needed")
  // The subgraph is cut around what EXISTS; the new page is in neither the seeds nor the nodes, and
  // step 9 reads it out of the FRD its order carries whole.
  assert.equal(r.value.nodes.includes(CARD), false)
  assert.deepEqual(r.value.seeds, [RESOURCE])
})

test("a change that ONLY adds modules: an empty subgraph is a legal state, not a refusal", () => {
  const r = build({
    deltas: [{ op: "card page", form: "Added", node: CARD, new: "yes" }],
    touched: [CARD],
    scenarios: [{ id: "S1", nodes: CARD }],
  })
  assert.equal(r.ok, true)
  assert.equal(r.value.design, "needed")   // minor: the contract grew, and the new module has two sides
  assert.deepEqual(r.value.nodes, [])
  assert.match(r.value.xml, /^<ripple grammar="1" mode="minor" seeds="0" nodes="0">/)
})

test("refusals are data: no weight, a foreign weight, nothing to ripple from, a path the map denies, a subgraph too big", () => {
  const cls = (r) => (r.ok ? "ok" : r.error.cls)

  assert.equal(cls(newRipple({ xml: MAP_XML, frd: frd(), mode: "", map: MAP })), "no-mode")
  assert.equal(cls(newRipple({ xml: MAP_XML, frd: frd(), mode: "huge", map: MAP })), "bad-mode")
  assert.equal(cls(build({ deltas: [] })), "no-delta")
  // A delta on a test node: step 6 forbids it (F2/F3), and an frd.xml older than that rule still
  // reaches this core — which then has no module to ripple from.
  assert.equal(cls(build({ deltas: [{ op: "x", form: "Added", node: "src/test/ParcelResourceTest.java" }], touched: [], scenarios: [] })), "no-delta")
  assert.equal(cls(build({ touched: ["src/Invented.java"] })), "unknown-node")
  // The ceiling is a parameter with the map's own default, so this branch is reached by an argument
  // rather than by a synthetic repository — a seam no code change can redden is a comment.
  assert.equal(cls(build({}, "minor", 200)), "over-cap")
  assert.match(newRipple({ xml: MAP_XML, frd: frd(), mode: "minor", map: MAP, cap: 200 }).error.detail, /выше потолка чтения 200 Б/)
})

test("total on garbage: no argument at all is a refusal, never a throw", () => {
  for (const bad of [undefined, {}, { mode: "minor" }, { mode: "minor", frd: {}, map: {} }]) {
    const r = newRipple(bad)
    assert.equal(r.ok, false)
    assert.ok(r.error.cls.length > 0)
  }
})

// --- ГЕЙТ ШАГА 6: узлы изменения, которых не исполняет ни один сьют --------------------------------
//
// Фикстуры — ВЫПИСКИ ДОСЛОВНО с диска (sandbox/runbox/<форма>/.agent/), не синтетика: правило судит
// репозиторий, и его цена измерена на этих самых артефактах (наряд D23). Из карты взяты сьюты, узлы
// ширины со своими <test> и рёбра вокруг них; из FRD — <delta>, <scenario> и <touched> как есть.
// Замер по ПОЛНЫМ файлам: слепых по всему репо 7 / 9 / 9 / 57 на t1-3 / t2 / t3 / eddi, ширина
// 1 / 2 / 3 / 16, пересечение — 0 / 1 / 1 / None.

// sandbox/runbox/quarkus-rest-json-app-v2-t2/.agent/appgraph.xml (строки 1, 3-4, 44-58, 79-81, 85-95,
// 106, 108, 110). Карта формы t3 в этих узлах та же самая — обе выписки читают один репозиторий.
const MAP_T2_XML = `<appgraph grammar="4" modules="17" components="2" isolated="7" levels="4">
  <suite id="unit" kind="unit" cmd="mvn test" one="-Dtest={class}" path="src/test/java" match="*Test.java"/>
  <suite id="component-native" kind="component" cmd="mvn verify -Pnative" one="-Dit.test={class}" path="src/test/java" match="*IT.java"/>
  <module path="src/main/java/org/acme/rest/json/FruitResource.java" pkg="org.acme.rest.json" component="c1" level="3" fanin="2" fanout="1">
    <role>JAX-RS REST resource for fruit CRUD operations with in-memory storage</role>
    <api name="GET /fruits" kind="http" scope="public" via="@GET public Set&lt;Fruit&gt; list()"/>
    <test path="src/test/java/org/acme/rest/json/FruitResourceTest.java" suite="unit"/>
    <test path="src/test/java/org/acme/rest/json/FruitResourceIT.java" suite="component-native"/>
  </module>
  <module path="src/main/resources/META-INF/resources/fruits.html" component="c1" level="1" fanin="0" fanout="1">
    <role>AngularJS-based HTML page for fruit management, consumes /fruits endpoints</role>
  </module>
  <module path="src/test/java/org/acme/rest/json/FruitResourceIT.java" pkg="org.acme.rest.json" kind="test" suite="component-native" component="c1" level="1" fanin="0" fanout="1">
    <role>Integration test delegate for FruitResource, extends FruitResourceTest</role>
  </module>
  <module path="src/test/java/org/acme/rest/json/FruitResourceTest.java" pkg="org.acme.rest.json" kind="test" suite="unit" component="c1" level="2" fanin="1" fanout="1">
    <role>Unit test for FruitResource endpoints using QuarkusTest</role>
  </module>
  <edge from="src/test/java/org/acme/rest/json/FruitResourceIT.java" to="src/test/java/org/acme/rest/json/FruitResourceTest.java" via="public class FruitResourceIT extends FruitResourceTest {"/>
  <edge from="src/main/resources/META-INF/resources/fruits.html" to="src/main/java/org/acme/rest/json/FruitResource.java" via="url: '/fruits'," by="use"/>
  <edge from="src/test/java/org/acme/rest/json/FruitResourceTest.java" to="src/main/java/org/acme/rest/json/FruitResource.java" via=".when().get(&quot;/fruits&quot;)" by="use"/>
</appgraph>`

const RESOURCE_JAVA = "src/main/java/org/acme/rest/json/FruitResource.java"
const FRUITS_HTML = "src/main/resources/META-INF/resources/fruits.html"
const CARD_HTML = "src/main/resources/META-INF/resources/fruit-card.html"

// sandbox/runbox/quarkus-rest-json-app-v2-t2/.agent/frd.xml (строки 1, 29, 31-32, 34)
const FRD_T2_XML = `<frd grammar="1" goal="новый эндпоинт отдаёт один фрукт по имени в пути, страница фруктов показывает карточку выбранного фрукта">
  <delta op="GET /fruits/{name}" form="Added" node="src/main/java/org/acme/rest/json/FruitResource.java"/>
  <scenario id="S1" uc="UC1" before="GET /fruits/{name} не существует" after="GET /fruits/{name} возвращает 200 с одним фруктом или 404" nodes="src/main/java/org/acme/rest/json/FruitResource.java"/>
  <scenario id="S2" uc="UC2" before="страница фруктов не показывает карточку отдельного фрукта" after="страница показывает карточку с name и description при выборе фрукта" nodes="src/main/resources/META-INF/resources/fruits.html src/main/java/org/acme/rest/json/FruitResource.java"/>
  <touched path="src/main/resources/META-INF/resources/fruits.html" why="добавляется карточка фрукта, запрашивающая GET /fruits/{name} и отображающая name и description"/>
</frd>`

// sandbox/runbox/quarkus-rest-json-app-v2-t3/.agent/frd.xml (строки 1, 35-37, 43-45): та же карта,
// шире изменение — и третий узел ширины изменение СОЗДАЁТ (`new="yes"`).
const FRD_T3_XML = `<frd grammar="1" goal="отдельная страница карточки фрукта со своим адресом, отображающая имя и описание">
  <delta op="GET /fruits/{id}" form="Added" node="src/main/java/org/acme/rest/json/FruitResource.java" from="endpoint отсутствует" to="endpoint возвращает Fruit по name (200) или 404"/>
  <delta op="GET /fruit-card.html" form="Added" node="src/main/resources/META-INF/resources/fruit-card.html" new="yes"/>
  <delta op="list-page navigation" form="Added" node="src/main/resources/META-INF/resources/fruits.html" from="имя фрукта не кликабельно" to="имя фрукта — ссылка &lt;a href=&quot;/fruit-card.html?id={name}&quot;&gt;"/>
  <touched path="src/main/java/org/acme/rest/json/FruitResource.java" why="добавлен метод findByName() с @PathParam для GET /fruits/{id}"/>
  <touched path="src/main/resources/META-INF/resources/fruits.html" why="имя фрукта в списке обёрнуто в &lt;a&gt; со ссылкой на карточку"/>
  <touched path="src/main/resources/META-INF/resources/fruit-card.html" why="новый HTML-файл страницы карточки, загружающий данные по GET /fruits/{id}"/>
</frd>`

// sandbox/runbox/quarkus-rest-json-app-v2-t1-3/.agent/frd.xml (строки 1, 24, 26, 28): изменение
// трогает ОДИН узел, и у него есть свои тесты — правило обязано молчать.
const FRD_T1_3_XML = `<frd grammar="1" goal="поиск фруктов по части имени с ограничением ответа до 10 записей">
  <delta op="GET /fruits" form="Added" node="src/main/java/org/acme/rest/json/FruitResource.java" from="list() без параметров возвращает все фрукты" to="list(search) с опциональным query-параметром, фильтрацией по name без учёта регистра и лимитом 10 записей"/>
  <scenario id="S1" uc="UC1" before="GET /fruits?search=any игнорирует неизвестный параметр и возвращает все фрукты" after="GET /fruits?search=apple возвращает только фрукты с подстрокой &quot;apple&quot; в name без учёта регистра, не более 10" nodes="src/main/java/org/acme/rest/json/FruitResource.java"/>
  <touched path="src/main/java/org/acme/rest/json/FruitResource.java"/>
</frd>`

const T2 = { map: parseMap(MAP_T2_XML), frd: parseFrd(FRD_T2_XML) }
const T3 = { map: parseMap(MAP_T2_XML), frd: parseFrd(FRD_T3_XML) }
const T1_3 = { map: parseMap(MAP_T2_XML), frd: parseFrd(FRD_T1_3_XML) }

test("шов 1: слепой узел ширины — ровно fruits.html, и создаваемый узел в счёт не идёт", () => {
  // Форма t2: ширина — ресурс и страница. У ресурса есть свои <test> обоих сьютов; до страницы не
  // доходит ни один тест — ребро идёт ОТ неё к ресурсу. Ровно этот узел остановил прогон 21dd9b34 на
  // шаге 11, заплатив 167 805 токенов между зелёным шагом 6 и остановкой.
  const t2 = blindNodes(T2)
  assert.equal(t2.known, true)
  assert.deepEqual([...t2.nodes], [FRUITS_HTML])

  // Форма t3: ширина шире на узел, который изменение СОЗДАЁТ. Карта старше файла по построению —
  // операнда у правила нет, и ответ обязан остаться одним узлом. Снять `map.nodes.has(p)` — и сюда
  // приедет fruit-card.html, про который оператору сказать нечего.
  const t3 = blindNodes(T3)
  assert.equal(t3.known, true)
  assert.deepEqual([...t3.nodes], [FRUITS_HTML])
  assert.equal(t3.nodes.includes(CARD_HTML), false, "создаваемый узел карта содержать не может — судить его нечем")
})

test("шов 2: карта без единой привязки <test> мнения не имеет — None, а не «слепы все»", () => {
  // sandbox/runbox/eddi/.agent/appgraph.xml — 92 узла, 57 code, и НИ ОДНОГО <test> внутри модуля
  // (grep -c "<test " = 0). Выписка дословная: строки 1, 3, 5-6, 28-32, 69-70.
  const EDDI_MAP = `<appgraph grammar="3" modules="92" components="4" isolated="8" levels="6">
  <paths prefix="src/main/java/ai/labs/eddi/"/>
  <suite id="unit" kind="unit" cmd="./mvnw test" one="-Dtest={class}" path="src/test/java" match="*Test.java"/>
  <suite id="component" kind="component" cmd="./mvnw verify" one="-Dit.test={class}" path="src/test/java" match="*IT.java"/>
  <module path="src/main/java/ai/labs/eddi/backup/IResourceSource.java" pkg="ai.labs.eddi.backup" component="c1" level="5" fanin="9" fanout="1">
    <role>Interface defining data source contracts for reading agent, workflow, and snippet backup resources</role>
    <api name="IResourceSource.readAgent, readWorkflows, readSnippets" kind="lib" scope="internal"/>
  </module>
  <module path="src/main/java/ai/labs/eddi/backup/impl/RestExportService.java" pkg="ai.labs.eddi.backup.impl" component="c1" level="1" fanin="0" fanout="6">
    <role>REST service for exporting agent configurations to ZIP archives with preview support</role>
    <api name="GET /backup/export/{agentFilename}" kind="http" scope="public"/>
  </module>
  <edges from="~backup/impl/RestExportService.java" to="~backup/IResourceSource.java"/>
</appgraph>`
  // sandbox/runbox/eddi/.agent/frd.xml (строки 1, 66, 99-100)
  const EDDI_FRD = `<frd grammar="1" goal="ввести глобальный ресурс глоссарий с CRUD, подстановкой в промпты и поддержкой экспорта/импорта">
  <delta op="IResourceSource.readGlossaries" form="Added" node="src/main/java/ai/labs/eddi/backup/IResourceSource.java" from="readAgent, readWorkflows, readSnippets" to="readAgent, readWorkflows, readSnippets, readGlossaries"/>
  <touched path="src/main/java/ai/labs/eddi/backup/IResourceSource.java" why="новый метод readGlossaries() в интерфейсе ресурсного источника"/>
  <touched path="src/main/java/ai/labs/eddi/backup/impl/RestExportService.java" why="добавлена запись {id}.glossary.json в ZIP-архив экспорта"/>
</frd>`
  const map = parseMap(EDDI_MAP)
  assert.equal(map.nodeTests.size, 0, "в карте eddi нет ни одной привязки теста к модулю")

  const r = blindNodes({ frd: parseFrd(EDDI_FRD), map })
  // «Ни один сьют не доходит» здесь неотличимо от «никто не записал, какие тесты есть»: ответ — None.
  // Вернуть сюда список — и на полной карте оператора спросят про все 16 узлов ширины, а роль сгорит
  // в LOOPS, не имея честной починки (standards/code.md, ограничение 2).
  assert.equal(r.known, false)
  assert.deepEqual([...r.nodes], [])
})

test("шов 3: ложной тревоги нет — правило считается по ШИРИНЕ, а не по репозиторию", () => {
  // Форма t1-3: изменение трогает один узел, у него есть свои тесты. По всему репо слепых узлов там
  // семь (страницы, модели, конфиги) — если считать по репозиторию, гейт задаст оператору семь
  // вопросов про файлы, которых изменение не касается.
  const r = blindNodes(T1_3)
  assert.equal(r.known, true)
  assert.deepEqual([...r.nodes], [])

  // И то же самое доказано с другой стороны: страница слепа в этом репозитории всегда, но пока
  // изменение её не трогает — это свойство репозитория, а не находка.
  assert.equal(blindNodes(T2).nodes.includes(FRUITS_HTML), true)
})

test("шов 4: ответ находится по СТВОЛУ вопроса — сьюты и их команды в текст не попадают", () => {
  const first = waiverFor({ node: FRUITS_HTML, answers: [] })
  assert.equal(first.word, "")
  assert.equal(first.question, `${BLIND_STEM(FRUITS_HTML)}${BLIND_TAIL}`)
  // Ствол — функция ОДНОГО аргумента: узла. Вложить в него список сьютов и их команды — и вопрос
  // перестанет совпадать со своим ответом, как только в репозитории поменяется `cmd` (класс 46edab60,
  // steps/plan/plan.mjs:57-58). Факты о репозитории едут в evidence, не в текст.
  assert.equal(BLIND_STEM.length, 1)
  assert.equal(/mvn|mvnw|cmd=|suite=/.test(first.question), false, first.question)

  // Круг целиком, через тот самый формат, которым ответ едет на диск.
  const file = newExchange([{ n: 1, question: first.question, text: "accept" }])
  assert.equal(file.ok, true)
  const said = newAnswers(file.value).value
  assert.equal(waiverFor({ node: FRUITS_HTML, answers: said }).word, "accept")
  // Вопрос адресован УЗЛУ: ответ про страницу не отвечает за ресурс.
  assert.equal(waiverFor({ node: RESOURCE_JAVA, answers: said }).word, "")

  // Ответ вне словаря — пере-спрос с ПРИЧИНОЙ, приписанной к тому же стволу: текст НОВЫЙ (иначе
  // askOperator не поставит паузу — прогон 03b598c7), а адрес прежний.
  const junk = newAnswers(newExchange([{ n: 1, question: first.question, text: "не знаю" }]).value).value
  const again = waiverFor({ node: FRUITS_HTML, answers: junk })
  assert.equal(again.word, "")
  assert.notEqual(again.question, first.question)
  assert.ok(again.question.startsWith(BLIND_STEM(FRUITS_HTML)))
  assert.match(again.question, /не знаю/)

  // Последний ответ побеждает: оператор, поправивший себя, отвечает ещё раз.
  const fixed = [...junk, ...newAnswers(newExchange([{ n: 1, question: again.question, text: "SUITE" }]).value).value]
  assert.equal(waiverFor({ node: FRUITS_HTML, answers: fixed }).word, "suite")
  assert.deepEqual([...WAIVER_WORDS], ["suite", "drop", "accept"])
})

// УЗЕЛ ВНЕ ФОКУСА — НЕ ВЫДУМКА. Живой прогон eddi 19.08.2026: шаг 6 закрылся зелёным с дельтой на
// `configs/agents/model/AgentConfiguration.java` (файл существует, вычисленный граф шага 3 его
// несёт), а шаг 8 отказал `unknown-node — узла нет в карте`. Полоса встала между двумя своими же
// шагами, по-разному отвечавшими на вопрос «что такое узел». Сними `repo` — отказ вернётся.
test("рябь: путь, известный вычисленному графу, засчитывается затравкой", () => {
  const outside = "src/main/java/app/configs/AgentConfiguration.java"
  const frd = parseFrd(`<frd grammar="1" goal="привязка">
  <delta op="glossaries field" form="Changed" node="${outside}" from="нет поля" to="список ссылок"/>
</frd>`)
  const map = parseMap(`<appgraph grammar="4">
  <module path="src/rest/Store.java" pkg="rest"/>
</appgraph>`)
  const blind = newRipple({ xml: "<appgraph/>", frd, mode: "minor", map })
  assert.equal(blind.ok, false)
  assert.equal(blind.error.cls, "unknown-node")

  const seeing = newRipple({ xml: "<appgraph/>", frd, mode: "minor", map, repo: new Set([outside]) })
  assert.equal(seeing.error?.cls, undefined, `узел из репозитория всё ещё отвергнут: ${seeing.error?.detail || ""}`)

  // Выдуманный путь остаётся выдумкой при любом графе.
  const invented = parseFrd(`<frd grammar="1" goal="x"><delta op="o" form="Changed" node="src/Nowhere.java" from="a" to="b"/></frd>`)
  assert.equal(newRipple({ xml: "<appgraph/>", frd: invented, mode: "minor", map, repo: new Set([outside]) }).error.cls, "unknown-node")
})
