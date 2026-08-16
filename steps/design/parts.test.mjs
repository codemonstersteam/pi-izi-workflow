// D26: pass C собирается РОЕМ — один агент на сценарий FRD. Здесь швы двух вещей: разложения
// `checkRoutes` на `checkSteps` (часть) и `checkCoverage` (целое), и самой единицы роя
// (`steps/design/parts.mjs`). Порядок строк отчёта и все девять правил судит
// `steps/design/routes.test.mjs` — он остался без единой правки, и это шов разложения.
//
// ФИКСТУРА — ДОСЛОВНАЯ ВЫПИСКА живых артефактов прогона `c433e01d`
// (`sandbox/runbox/eddi/.agent/`): три сценария FRD из одиннадцати (S1, S2, S10) с их use case и
// кодами сбоев, словарь тех значений, что называют контракты, граф целиком (15 узлов, две связные
// компоненты по 7 плюс одиночка) и шесть маршрутов, которые роль записала на живом прогоне
// (`prev/staging/routes.xml`). Выдуманная фикстура здесь стоила бы ровно того, чем уже заплатил
// `checkDesign` (docs/design.md §3, расхождение A): правило краснеет на КАЖДОМ настоящем артефакте.
//
// S1 и S10 в одной фикстуре — не совпадение: `S10`.startsWith(`S1`), и до D26 маршрут S10 читался
// как маршрут сценария S1.

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { parseRoutes, checkRoutes, checkSteps, checkCoverage, blockerLine, scenarioOf } from "./routes.mjs"
import { routeParts, mergeParts, blameByScenario, changeRipple, nodeParts, nodeOwner, mergeNodes, blameNodes } from "./parts.mjs"
import { parseValues } from "./values.mjs"
import { parseNodes, checkNodes, checkGraph, graphFacts } from "./nodes.mjs"
import { parseFrd } from "../intake/frd.mjs"
import { parseMap } from "../intake/map.mjs"
import { attrs, elem } from "../../core/xml.mjs"

export const FRD_XML = `<frd grammar="1" goal="В E.D.D.I появляется новый тип конфигурации Глоссарий с CRUD, версионированием, подстановкой Терминов в промпты и экспортом/импортом/слиянием">
  <usecase id="UC1" actor="api-client" goal="создать Глоссарий">
    <pre>клиент аутентифицирован</pre>
    <post>Глоссарий сохранён с type=eddi://ai.labs.glossary, вернулась HTTP 201 Created с URI ресурса</post>
    <step n="1">клиент отправляет POST /glossarystore/glossaries с телом Глоссария</step>
    <step n="2">система создаёт Глоссарий с версии 1 и сохраняет в MongoDB</step>
    <step n="3">система возвращает HTTP 201 Created с Location заголовком</step>
  </usecase>
  <usecase id="UC2" actor="api-client" goal="прочитать Глоссарий по ID">
    <pre>Глоссарий G с ID=id существует</pre>
    <post>Глоссарий G вернут с HTTP 200</post>
    <step n="1">клиент отправляет GET /glossarystore/glossaries/{id}?version=N</step>
    <step n="2">система считывает версию N Глоссария из MongoDB</step>
    <step n="3">система возвращает HTTP 200 с телом Глоссария</step>
    <ext id="2a" error="GLOSSARY_NOT_FOUND" outcome="Глоссарий не вернут, клиент получит HTTP 404"/>
  </usecase>
  <usecase id="UC10" actor="api-client" goal="экспортировать Глоссарий вместе с агентом">
    <pre>агент A подключён к Глоссарию G с Терминами</pre>
    <post>ZIP-архив содержит конфигурацию агента A и Глоссарий G со всеми Терминами</post>
    <step n="1">клиент отправляет POST /backup/export/{agentId}</step>
    <step n="2">система считывает агента и все подключённые Глоссарии через IResourceSource</step>
    <step n="3">Глоссарии включены в ZIP-архив</step>
    <step n="4">система возвращает HTTP 200 с ZIP</step>
    <ext id="10a" error="AGENT_NOT_FOUND" outcome="экспорт не выполнен, клиент получит HTTP 404"/>
  </usecase>
  <delta op="Glossary data model" form="Added" node="src/main/java/ai/labs/eddi/configs/glossaries/model/Glossary.java" new="yes"/>
  <delta op="Glossary store interface" form="Added" node="src/main/java/ai/labs/eddi/configs/glossaries/IGlossaryStore.java" new="yes"/>
  <failure code="GLOSSARY_NOT_FOUND" status="404" client="Глоссарий не доступен по запрошенному ID" operator="-" from="UC2/2a UC3/3a UC4/4a UC5/5a UC6/6a UC7/7a UC8/8a UC9/9a"/>
  <failure code="AGENT_NOT_FOUND" status="404" client="Агент для экспорта не найден" operator="-" from="UC10/10a"/>
  <scenario id="S1" uc="UC1" before="POST /glossarystore/glossaries -&gt; 404 (endpoint не существует)" after="POST /glossarystore/glossaries -&gt; 201 Created с Location" nodes="src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java src/main/java/ai/labs/eddi/configs/glossaries/IGlossaryStore.java src/main/java/ai/labs/eddi/configs/glossaries/mongo/GlossaryStore.java src/main/java/ai/labs/eddi/configs/glossaries/model/Glossary.java"/>
  <scenario id="S2" uc="UC2" before="GET /glossarystore/glossaries/{id} -&gt; 404 (endpoint не существует)" after="GET /glossarystore/glossaries/{id}?version=N -&gt; 200 с Глоссарием версии N" nodes="src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java src/main/java/ai/labs/eddi/configs/glossaries/IGlossaryStore.java src/main/java/ai/labs/eddi/configs/glossaries/mongo/GlossaryStore.java"/>
  <scenario id="S10" uc="UC10" before="ZIP-архив агента не содержит Глоссарии" after="ZIP-архив агента содержит Глоссарии со всеми Терминами" nodes="src/main/java/ai/labs/eddi/backup/impl/RestExportService.java src/main/java/ai/labs/eddi/backup/IResourceSource.java"/>
</frd>`

export const VALUES_XML = `<values>
  <value id="v1" text="GlossaryNotFound(id)"/>
  <value id="v2" text="TermKeyInvalid(key)"/>
  <value id="v3" text="TermKeyDuplicate(key)"/>
  <value id="v4" text="VersionConflict(expected,actual)"/>
  <value id="v5" text="TermNotFound(key)"/>
  <value id="v6" text="AgentNotFound(agentId)"/>
  <value id="v7" text="ImportInvalidData()"/>
  <value id="v8" text="404 GLOSSARY_NOT_FOUND"/>
  <value id="v9" text="400 TERM_KEY_INVALID"/>
  <value id="v10" text="409 TERM_KEY_DUPLICATE"/>
  <value id="v11" text="409 VERSION_CONFLICT"/>
  <value id="v12" text="404 TERM_NOT_FOUND"/>
  <value id="v13" text="404 AGENT_NOT_FOUND"/>
  <value id="v14" text="400 IMPORT_INVALID_DATA"/>
  <value id="v15" text="POST /glossarystore/glossaries {body}" closes="UC1/in"/>
  <value id="v16" text="GET /glossarystore/glossaries/{id}?version=N" closes="UC2/in"/>
  <value id="v24" text="POST /backup/export/{agentId}" closes="UC10/in"/>
  <value id="v26" text="Глоссарий не вернут, HTTP 404" closes="UC2/2a"/>
  <value id="v43" text="экспорт не выполнен, HTTP 404" closes="UC10/10a"/>
  <value id="v45" text="Glossary(id,resourceType,version,terms)"/>
  <value id="v46" text="Term(key,value)"/>
  <value id="v47" text="readGlossaries()"/>
  <value id="v102" text="getAll()"/>
  <value id="v104" text="configure(Map&lt;String, Object&gt; configuration, Map&lt;String, Object&gt; extensions)"/>
  <value id="v109" text="processTemplate(String template, Map&lt;String, Object&gt; dynamicAttributesMap)"/>
  <value id="v129" text="201 Created {Location}" closes="UC1/post"/>
  <value id="v130" text="200 {Glossary(id,version,terms)}" closes="UC2/post"/>
  <value id="v138" text="200 {ZIP}" closes="UC10/post"/>
</values>`

export const NODES_XML = `<design mode="major" base=".agent/appgraph.xml">
  <!-- ===== NEW GLOSSARY MODULES ===== -->

  <module path="src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java" delta="Added">
    <role>REST endpoint for glossary CRUD: boundary node converting HTTP to domain and back</role>
    <contract in="v1 | v4 | v5 | v15 | v16 | v17 | v18 | v19 | v20 | v21 | v22 | v45 | v46 | v47 | v129 | v130 | v131 | v132 | v133 | v134 | v135 | v136" out="v2 | v3 | v8 | v9 | v10 | v11 | v12 | v26 | v27 | v28 | v29 | v30 | v31 | v32 | v33 | v34 | v35 | v36 | v37 | v38 | v39 | v40 | v45 | v46 | v47 | v129 | v130 | v131 | v132 | v133 | v134 | v135 | v136"/>
    <dep path="src/main/java/ai/labs/eddi/configs/glossaries/IGlossaryStore.java"/>
  </module>

  <module path="src/main/java/ai/labs/eddi/configs/glossaries/IRestGlossaryStore.java" delta="Added">
    <role>REST interface contract for glossary endpoints</role>
    <contract in="v15 | v16 | v17 | v18 | v19 | v20 | v21 | v22" out="v15 | v16 | v17 | v18 | v19 | v20 | v21 | v22"/>
  </module>

  <module path="src/main/java/ai/labs/eddi/configs/glossaries/IGlossaryStore.java" delta="Added">
    <role>Internal service interface for glossary CRUD operations</role>
    <contract in="v45 | v46 | v47" out="v1 | v4 | v5 | v45 | v46 | v47"/>
    <dep path="src/main/java/ai/labs/eddi/configs/glossaries/model/Glossary.java"/>
    <dep path="src/main/java/ai/labs/eddi/configs/glossaries/mongo/GlossaryStore.java"/>
  </module>

  <module path="src/main/java/ai/labs/eddi/configs/glossaries/mongo/GlossaryStore.java" delta="Added">
    <role>MongoDB persistence for glossaries and terms</role>
    <contract in="v45 | v46 | v47" out="v1 | v4 | v5 | v45 | v46 | v47"/>
    <dep path="src/main/java/ai/labs/eddi/configs/glossaries/model/Glossary.java"/>
  </module>

  <module path="src/main/java/ai/labs/eddi/configs/glossaries/model/Glossary.java" delta="Added">
    <role>Glossary data model: id, resourceType, version, terms</role>
    <contract in="v45" out="v45"/>
  </module>

  <!-- ===== TEMPLATE SUBSTITUTION FLOW (UC9) — EXISTING MODULES ===== -->

  <module path="src/main/java/ai/labs/eddi/modules/llm/impl/LlmTask.java" delta="Changed">
    <role>LLM lifecycle task: prepares Snippets and Glossary Terms for template context</role>
    <contract in="v1 | v5 | v23 | v102 | v109" out="v23 | v102 | v104 | v109 | v137 | v41 | v42"/>
    <dep path="src/main/java/ai/labs/eddi/modules/llm/impl/PromptSnippetService.java"/>
    <dep path="src/main/java/ai/labs/eddi/modules/templating/impl/TemplatingEngine.java"/>
  </module>

  <module path="src/main/java/ai/labs/eddi/modules/llm/impl/PromptSnippetService.java" delta="Changed">
    <role>Returns Snippets and Glossary Terms for template substitution of {{glossary.&lt;key&gt;}}</role>
    <contract in="v1 | v5 | v102" out="v1 | v5 | v102"/>
    <dep path="src/main/java/ai/labs/eddi/configs/glossaries/mongo/GlossaryStore.java"/>
  </module>

  <module path="src/main/java/ai/labs/eddi/modules/templating/impl/TemplatingEngine.java" delta="Changed">
    <role>Qute templating engine supporting glossary namespace through GlossaryNamespaceResolver</role>
    <contract in="v109" out="v137"/>
  </module>

  <!-- ===== EXPORT FLOW (UC10) — EXISTING MODULES ===== -->

  <module path="src/main/java/ai/labs/eddi/backup/impl/RestExportService.java" delta="Added">
    <role>Export agent with glossaries: boundary for UC10</role>
    <contract in="v24 | v45 | v47" out="v6 | v13 | v43 | v47 | v138"/>
    <dep path="src/main/java/ai/labs/eddi/backup/IResourceSource.java"/>
  </module>

  <!-- ===== IMPORT FLOW (UC11) — EXISTING MODULES ===== -->

  <module path="src/main/java/ai/labs/eddi/backup/impl/RestImportService.java" delta="Added">
    <role>Import agent with glossaries: boundary for UC11</role>
    <contract in="v7 | v25 | v45 | v47" out="v7 | v14 | v44 | v47 | v139"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/ZipResourceSource.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/StructuralMatcher.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/IResourceSource.java"/>
  </module>

  <module path="src/main/java/ai/labs/eddi/backup/impl/ZipResourceSource.java" delta="Added">
    <role>Reads glossaries from ZIP for import operations</role>
    <contract in="v47" out="v7 | v45 | v47"/>
    <dep path="src/main/java/ai/labs/eddi/backup/IResourceSource.java"/>
  </module>

  <module path="src/main/java/ai/labs/eddi/backup/impl/RemoteApiResourceSource.java" delta="Added">
    <role>Reads glossaries from remote EDDI instance for live sync</role>
    <contract in="v47" out="v45 | v47"/>
    <dep path="src/main/java/ai/labs/eddi/backup/IResourceSource.java"/>
  </module>

  <module path="src/main/java/ai/labs/eddi/backup/impl/StructuralMatcher.java" delta="Added">
    <role>Matches imported snippets and glossaries by resource URI for sync preview</role>
    <contract in="v45 | v47" out="v45 | v47"/>
    <dep path="src/main/java/ai/labs/eddi/backup/IResourceSource.java"/>
  </module>

  <module path="src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java" delta="Added">
    <role>Executes upgrade/sync: creates new or merges snippets and glossaries</role>
    <contract in="v45 | v47" out="v45 | v47"/>
    <dep path="src/main/java/ai/labs/eddi/backup/IResourceSource.java"/>
  </module>

  <module path="src/main/java/ai/labs/eddi/backup/IResourceSource.java" delta="Added">
    <role>Interface for reading agent, workflow, snippet and glossary source data</role>
    <contract in="v47" out="v45 | v47"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/ZipResourceSource.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/RemoteApiResourceSource.java"/>
  </module>
</design>`

export const ROUTES_XML = `<routes>
  <route scenario="S1" entry="v15" steps="src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java@v45 -> src/main/java/ai/labs/eddi/configs/glossaries/mongo/GlossaryStore.java@v45 -> src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java@v129"/>
  <route scenario="S1b" entry="v15" steps="src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java@v45 -> src/main/java/ai/labs/eddi/configs/glossaries/mongo/GlossaryStore.java@v45 -> src/main/java/ai/labs/eddi/configs/glossaries/model/Glossary.java@v45"/>
  <route scenario="S2" entry="v16" steps="src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java@v45 -> src/main/java/ai/labs/eddi/configs/glossaries/mongo/GlossaryStore.java@v45 -> src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java@v130"/>
  <route scenario="S2b" entry="v16" steps="src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java@v45 -> src/main/java/ai/labs/eddi/configs/glossaries/mongo/GlossaryStore.java@v45 -> src/main/java/ai/labs/eddi/configs/glossaries/IGlossaryStore.java@v1 -> src/main/java/ai/labs/eddi/configs/glossaries/mongo/GlossaryStore.java@v1 -> src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java@v26"/>
  <route scenario="S10" entry="v24" steps="src/main/java/ai/labs/eddi/backup/impl/RestExportService.java@v47 -> src/main/java/ai/labs/eddi/backup/IResourceSource.java@v45 -> src/main/java/ai/labs/eddi/backup/impl/RestExportService.java@v45 -> src/main/java/ai/labs/eddi/backup/impl/RestExportService.java@v138"/>
  <route scenario="S10b" entry="v24" steps="src/main/java/ai/labs/eddi/backup/impl/RestExportService.java@v13 -> src/main/java/ai/labs/eddi/backup/impl/RestExportService.java@v43"/>
</routes>`

const FRD = parseFrd(FRD_XML)
const VALUES = parseValues(VALUES_XML)
const NODES = parseNodes(NODES_XML)
const ROUTES = parseRoutes(ROUTES_XML)
const PARTS = routeParts({ frd: FRD, values: VALUES, nodes: NODES, text: FRD_XML })

// Маршруты ОДНОЙ части — те, чей id принадлежит её сценарию, и ничьи больше.
const routesOf = (id) => ROUTES.filter((r) => scenarioOf(r.scenario, [id]) === id)
// …и файл, который эта часть записала бы в `.agent/staging/routes-parts/<id>.xml`.
const partXml = (id) => `<routes>\n${routesOf(id).map((r) => `  <route scenario="${r.scenario}" entry="${r.entry}" steps="${r.steps.map((s) => `${s.path}@${s.value}`).join(" -> ")}"/>`).join("\n")}\n</routes>`
const textsOf = (facts, rules) => new Set(facts.filter((f) => rules.includes(f.rule)).map((f) => f.text))
const STEP_RULES = [1, 3, 4, 9, 11]
const COVER_RULES = [2, 5, 7, 10]

// --- единица роя ----------------------------------------------------------------------------------
//
// Замер на всех одиннадцати сценариях `eddi` (здесь три из них): наряд части — 4 221-7 762 символа
// против 32 779 у прохода целиком, `entry` совпадает с `closes="UCx/in"` во всех одиннадцати, и
// компонента у каждого сценария равна 7 узлам из 15.
test("часть = один сценарий: свой entry, свои id маршрутов, карточки СВОЕЙ компоненты", () => {
  assert.deepEqual(PARTS.map((p) => p.id), ["S1", "S2", "S10"])

  const [s1, s2, s10] = PARTS
  // entry — это значение с closes="UCx/in", и оно же стоит в живом маршруте.
  assert.equal(s1.entry, "v15")
  assert.equal(s1.entry, ROUTES.find((r) => r.scenario === "S1").entry)
  assert.equal(s10.entry, "v24")

  // Id назначает ХОСТ: первый маршрут закрывает `<post>`, дальше по одному на `<ext>` в порядке FRD.
  assert.deepEqual(s1.routes.map((r) => [r.id, r.closes]), [["S1", "UC1/post"]])
  assert.deepEqual(s2.routes.map((r) => [r.id, r.closes]), [["S2", "UC2/post"], ["S2b", "UC2/2a"]])
  assert.deepEqual(s10.routes.map((r) => r.id), ["S10", "S10b"])

  // Компонента, а не срез по `nodes`: у S1 объявлено 4 узла, а связная компонента — 7 из 15, и
  // маршрут за неё выйти не может, потому что перехода без ребра <dep> не бывает (правило 3).
  assert.equal(s1.nodes.length, 7)
  assert.equal(NODES.size, 15)
  for (const r of routesOf("S1")) for (const s of r.steps) assert.ok(s1.nodes.includes(s.path), s.path)
  // …и компонента экспорта — ДРУГАЯ семёрка: ни одного узла глоссария в ней нет.
  assert.equal(s10.nodes.length, 7)
  assert.equal(s10.nodes.filter((p) => s1.nodes.includes(p)).length, 0)

  // Проекция FRD — дословные байты артефакта, и ничего чужого: свой сценарий, свой use case, свои
  // коды сбоев. Целый FRD в наряде части и есть то, из-за чего замер И2 обещанного размера не даёт.
  assert.match(s2.frd, /<scenario id="S2"/)
  assert.match(s2.frd, /<usecase id="UC2"[\s\S]*<\/usecase>/)
  assert.match(s2.frd, /<failure code="GLOSSARY_NOT_FOUND"/)
  assert.doesNotMatch(s2.frd, /<scenario id="S1"/)
  assert.doesNotMatch(s2.frd, /<usecase id="UC10"/)
  assert.ok(s2.frd.length + s2.ends.length + s2.cards.length < 12000)

  // Таблица концов называет маршрут, его конец и значение — и следующий СВОБОДНЫЙ id для маршрута,
  // который ни одного конца FRD не закрывает (служебный заход на узел).
  assert.match(s2.ends, /S2 — конец UC2\/post: последний шаг отдаёт v130/)
  assert.match(s2.ends, /S2b — конец UC2\/2a: последний шаг отдаёт v26/)
  assert.match(s2.ends, /entry ВСЕХ этих маршрутов: v16/)
  assert.match(s2.ends, /следующий свободный id S2c, затем S2d/)
})

// --- ШОВ РАЗЛОЖЕНИЯ: множество фактов частей ≡ множеству фактов целого по {1,3,4,9,11} ------------
//
// Замер на всех одиннадцати частях `eddi`: 21 = 21, промахов 0, ложных 0. Сравниваются ФАКТЫ, а не
// строки: у целого в хвосте строки стоят все сценарии, встретившие факт, у части — только её.
// Убери правило 4 из checkSteps — часть перестанет видеть стык, и промах станет ненулевым.
test("шов: объединение checkSteps частей равно вердикту целого по правилам 1, 3, 4, 9, 11", () => {
  const whole = textsOf(checkSteps({ routes: ROUTES, nodes: NODES, values: VALUES, frd: FRD }), STEP_RULES)
  const union = new Set()
  for (const p of PARTS) {
    for (const t of textsOf(checkSteps({ routes: routesOf(p.id), nodes: NODES, values: VALUES, frd: FRD }), STEP_RULES)) union.add(t)
  }
  assert.ok(whole.size > 0, "фикстура обязана нести факты — иначе шов ничего не держит")
  assert.deepEqual([...whole].filter((t) => !union.has(t)), [], "промахи: целое видит, части нет")
  assert.deepEqual([...union].filter((t) => !whole.has(t)), [], "ложные: части видят, целое нет")
  // …и правило 4 в этом множестве действительно есть — иначе тест зелен по пустоте.
  assert.ok([...whole].some((t) => t.startsWith("4 ")), [...whole].join("\n"))
})

// --- ШОВ: покровные правила НЕ судятся на части --------------------------------------------------
//
// Если пустить их на часть, одна S2 выдаёт 51 фантомную строку по правилам 2 и 7 плюс 10 по правилу
// 5 — и каждая из них ложь про маршрут, который уже написала другая часть.
test("шов: checkSteps части не выдаёт ни одной строки правил 2, 5, 7, 10", () => {
  for (const p of PARTS) {
    const mine = checkSteps({ routes: routesOf(p.id), nodes: NODES, values: VALUES, frd: FRD })
    assert.deepEqual(mine.filter((f) => COVER_RULES.includes(f.rule)), [], p.id)
  }
  // …а покровные правила на той же части — именно фантомы: их операнда у части нет.
  const phantom = checkCoverage({ routes: routesOf("S2"), nodes: NODES, values: VALUES, frd: FRD })
  assert.ok(phantom.filter((f) => [2, 7].includes(f.rule)).length > 10, phantom.length)
  assert.equal(phantom.filter((f) => f.rule === 5).length, 2, "S2 «не покрывает» два чужих сценария")
})

// --- ШОВ: после слияния покровные правила живы ---------------------------------------------------
test("шов: правила 2, 5, 7, 10 судят СЛИЯНИЕ — их убирает только правка checkCoverage", () => {
  const merged = mergeParts(PARTS.map((p) => ({ id: p.id, xml: partXml(p.id) })))
  const whole = checkRoutes({ routes: parseRoutes(merged.xml), nodes: NODES, values: VALUES, frd: FRD })
  assert.ok(whole.some((l) => l.startsWith("7 ")), "ветка без маршрута — правило 7")
  assert.ok(whole.some((l) => l.startsWith("2 ")), "узел с delta вне маршрутов — правило 2")
  // Правила 10 здесь нет, и это не пробел фикстуры: узлы, у которых вход не доставлен, уже названы
  // правилами 4 и 7 — один дефект, один блокер (routes.mjs, `refused`).
  assert.deepEqual(whole.filter((l) => l.startsWith("10 ")), [])
})

// --- ШОВ: атрибуция части. `S10` — не маршрут сценария `S1` ---------------------------------------
//
// `scenario === id || scenario.startsWith(id)` держался до D26, а `eddi` объявляет одиннадцать
// сценариев: часть S1 забрала бы себе файл части S10, и слияние получило бы один маршрут дважды.
test("шов: базовый id сравнивается ЦЕЛИКОМ — суффикс это одна строчная буква и ничего больше", () => {
  assert.equal(scenarioOf("S10", ["S1"]), "", "S10 не принадлежит сценарию S1")
  assert.equal(scenarioOf("S1b", ["S1"]), "S1")
  assert.equal(scenarioOf("S10", ["S1", "S10"]), "S10")
  assert.equal(scenarioOf("S10b", ["S1", "S10"]), "S10")
  assert.equal(scenarioOf("S1_notfound", ["S1"]), "")
  assert.equal(scenarioOf("", ["S1"]), "")

  // И это же держит правило 1 на живой фикстуре: маршрут S10 при FRD без сценария S10 — блокер.
  const frdNoS10 = parseFrd(FRD_XML.replace(/<scenario id="S10"[\s\S]*?\/>/, ""))
  const b = checkRoutes({ routes: routesOf("S10"), nodes: NODES, values: VALUES, frd: frdNoS10 })
  assert.ok(b.some((l) => l.startsWith("1 маршрут S10:")), b.join("\n"))
})

// --- ШОВ: слияние ничего не теряет ---------------------------------------------------------------
test("шов: слияние частей — union без разрешения конфликтов, и потерянная часть краснеет правилом 5", () => {
  const files = PARTS.map((p) => ({ id: p.id, xml: partXml(p.id) }))
  const all = mergeParts(files)
  assert.equal(parseRoutes(all.xml).length, ROUTES.length, "шесть маршрутов трёх частей")
  assert.deepEqual(parseRoutes(all.xml).map((r) => r.scenario), ROUTES.map((r) => r.scenario))
  // owner — это адрес починки: какая ЧАСТЬ написала этот маршрут. Читать id маршрута для этого нельзя.
  assert.equal(all.owner.get("S2b"), "S2")
  assert.equal(all.owner.get("S10b"), "S10")

  const lost = mergeParts(files.filter((f) => f.id !== "S2"))
  const b = checkCoverage({ routes: parseRoutes(lost.xml), nodes: NODES, values: VALUES, frd: FRD }).map(blockerLine)
  assert.ok(b.includes("5 у сценария FRD S2 нет маршрута"), b.join("\n"))
})

// Формат, который этот репозиторий и пишет, и читает: круг обязан сходиться на самом трудном
// законном значении (standards/code.md). Трудное здесь — `->` внутри значения атрибута, `@` в пути и
// кириллица; именно `steps="a -> b"` однажды обрезала разбор всех маршрутов (core/xml.mjs, ATTRS).
test("круг: parseRoutes(mergeParts(...)) — те же маршруты, что легли в части", () => {
  const hard = '<routes><route scenario="S1" entry="v15" steps="src/Файл@Тест.java@v45 -> src/B.java@v1"/></routes>'
  const { xml, owner } = mergeParts([{ id: "S1", xml: hard }])
  assert.deepEqual(parseRoutes(xml), parseRoutes(hard))
  assert.deepEqual(parseRoutes(xml)[0].steps[0], { path: "src/Файл@Тест.java", value: "v45" })
  assert.equal(owner.get("S1"), "S1")
  assert.deepEqual(mergeParts(), { xml: "<routes>\n\n</routes>\n", owner: new Map() })
})

// --- ВИНА ПОСЛЕ СЛИЯНИЯ --------------------------------------------------------------------------
//
// Замер на живом артефакте `eddi`: 47 строк из 49 получают адресата, а две остаются без него — узлы с
// `delta`, которых не называет ни один `<scenario nodes>`. Это дефицит шага 6, и рельсы починки у
// прохода C для них нет: `workflows/izi.js` отвечает на них escalate, а не рассылкой всем частям.
test("вина: 1, 9, 11 — по маршрутам из where; 2, 7, 10 — по узлу; без адресата — никому", () => {
  const facts = [
    ...checkSteps({ routes: ROUTES, nodes: NODES, values: VALUES, frd: FRD }),
    ...checkCoverage({ routes: ROUTES, nodes: NODES, values: VALUES, frd: FRD }),
  ]
  const owner = new Map(ROUTES.map((r) => [r.scenario, scenarioOf(r.scenario, PARTS.map((p) => p.id))]))
  const blame = blameByScenario({ facts, frd: FRD, owner })
  const to = new Map(blame.map((b) => [b.scenario, b.lines]))

  // Правило 4 встретили маршруты S1 и S1b — обе строки уехали в часть S1 и ни в какую другую.
  const four = facts.find((f) => f.rule === 4)
  assert.ok(four, "фикстура обязана нести стык")
  assert.ok((to.get(four.where[0]) || to.get(scenarioOf(four.where[0], ["S1", "S2", "S10"])) || []).includes(blockerLine(four)))

  // Правило 2 про узел, который называет `<scenario nodes>` S10, — адресат S10.
  const two = facts.filter((f) => f.rule === 2 && f.path.includes("IResourceSource"))
  if (two.length) assert.ok((to.get("S10") || []).includes(blockerLine(two[0])))

  // …а узел с delta, которого не называет ни один сценарий, адресата не получает вовсе.
  const orphan = facts.find((f) => f.rule === 2 && f.path.includes("IRestGlossaryStore"))
  assert.ok(orphan, "в графе eddi такой узел есть — на нём куплено правило escalate")
  assert.deepEqual(blame.filter((b) => b.lines.includes(blockerLine(orphan))), [])
})

// --- ШОВ: ключи наряда части ≡ плейсхолдеры шаблона -----------------------------------------------
//
// `prompt()` требует ТОЧНОГО двустороннего совпадения: лишний ключ или лишний плейсхолдер роняет
// запуск — после гейта, словаря и графа, то есть после всех токенов проходов A и B.
const ORDER_PART = readFileSync(new URL("order-routes-part.tpl", import.meta.url), "utf8")
const ORDER_NODES_WHOLE = readFileSync(new URL("order-nodes.tpl", import.meta.url), "utf8")
const IZI = readFileSync(new URL("../../workflows/izi.js", import.meta.url), "utf8")

test("наряд части: плейсхолдеры шаблона — ровно те ключи, что подставляет полоса", () => {
  const keys = [...ORDER_PART.matchAll(/{{|}}|{([A-Za-z_$][\w$]*)}/g)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]))
  assert.deepEqual([...new Set(keys)].sort(), ["ANSWERS", "CARDS", "CHECK", "ENDS", "FEEDBACK", "FRD", "PREVIOUS", "STAGING"])
  // …и это РОВНО тот список, что стоит в вызове prompt() части: `prompt()` требует двустороннего
  // совпадения, поэтому лишний ключ здесь так же смертелен, как лишний плейсхолдер там.
  const call = IZI.slice(IZI.indexOf("await agent(prompt(tplPart, {"), IZI.indexOf("}), { role: \"router\""))
  const passed = [...call.matchAll(/^\s{4}([A-Z_]+)[,:]/gm)].map((m) => m[1])
  assert.deepEqual([...new Set(passed)].sort(), [...new Set(keys)].sort())
  // Часть не отвечает за покрытие всего графа — и её наряд этого не требует.
  assert.doesNotMatch(ORDER_PART, /У каждого сценария FRD должен быть маршрут/)
  assert.match(ORDER_PART, /За покрытие всего графа ты не отвечаешь/)
})

test("тотальность: без FRD, без словаря и без графа частей просто нет", () => {
  assert.deepEqual(routeParts(), [])
  assert.deepEqual(routeParts({ frd: {}, values: new Map(), nodes: new Map(), text: "" }), [])
  assert.deepEqual(blameByScenario(), [])
})

// --- D28: ПРОХОД B СОБИРАЕТСЯ ТЕМ ЖЕ РОЕМ ---------------------------------------------------------
//
// ФИКСТУРА — ДОСЛОВНАЯ ВЫПИСКА живых артефактов прогона `35972d1c` (`sandbox/runbox/eddi/.agent/`):
// три сценария FRD из шести (S3, S5, S6 — S5 и S6 закрывают ОДИН use case UC5 и делят четыре узла),
// их use case и код сбоя, дельты их узлов, `<touched>`, словарь тех значений, что называют контракты,
// граф этих десяти узлов из `staging/design-nodes.xml` — файл, на котором прогон и умер, — и четыре
// модуля ряби. Прогон: 3 вызова роли `designer`, 23 536 / 27 547 / 1 889 токенов входа, 14 157 /
// 20 260 / 98 304 выхода, $0.5437 из $0.9093 всего прогона, ноль артефактов.
export const FRD_B = `<frd grammar="1" goal="в E.D.D.I появляется новый тип конфигурации Глоссарий с CRUD, версионированием, подстановкой в промпты и экспортом/импортом вместе с агентом">
<usecase id="UC3" actor="prompt-renderer" goal="подставить значения Терминов в промпт по шаблону {{glossary.&lt;key&gt;}}">
    <pre>промпт содержит выражение {{glossary.&lt;key&gt;}} и соответствующий Термин с данным key существует</pre>
    <post>все выражения {{glossary.&lt;key&gt;}} заменены на значения Терминов, промпт рендерен без ошибок</post>
    <step n="1">LlmTask или OutputTemplateTask вызывает ITemplatingEngine.processTemplate с промптом</step>
    <step n="2">Qute Engine встречает выражение с namespace \`glossary\`</step>
    <step n="3">GlossaryNamespaceResolver получает key из выражения</step>
    <step n="4">GlossaryService ищет Термин по key среди всех Глоссариев (из кэша или MongoDB)</step>
    <step n="5">значение Термина подставляется в шаблон на место {{glossary.&lt;key&gt;}}</step>
    <ext id="3a" error="GLOSSARY_TERM_KEY_MISSING" outcome="промпт не рендерен, система вернула ошибку: ключ Термина не найден ни в одном Глоссарии"/>
  </usecase>
<usecase id="UC5" actor="import-client" goal="восстановить Глоссарий при импорте агента со слиянием по URI">
    <pre>ZIP-архив содержит директорию glossaries/ с JSON-файлами Глоссариев</pre>
    <post>Глоссарии доступны в системе; при наличии существующих — Термины слиты по resource URI, импортированная версия приоритетнее</post>
    <step n="1">клиент вызывает POST /backup/import</step>
    <step n="2">ZipResourceSource.readGlossaries читает JSON-файлы из директории glossaries/ распакованного ZIP</step>
    <step n="3">UpgradeExecutor.dispatchGlossaries для каждого Глоссария применяет стратегию merge по resource URI</step>
    <step n="4">если Глоссарий существует — Термины слиты, новая версия побеждает; если нет — создан новый</step>
    <step n="5">система инвалидирует кэш GlossaryService</step>
  </usecase>
<failure code="GLOSSARY_TERM_KEY_MISSING" status="500"
           client="—"
           operator="промпт не рендерен, система вернула ошибку"
           from="UC3/3a"/>
<delta op="resolve glossary namespace" form="Added" node="src/main/java/ai/labs/eddi/modules/templating/impl/GlossaryNamespaceResolver.java" new="yes"
         from="—" to="Qute namespace resolver \`glossary\` для подстановки {{glossary.&lt;key&gt;}}"/>
<delta op="getAll()" form="Added" node="src/main/java/ai/labs/eddi/modules/llm/impl/GlossaryService.java" new="yes"
         from="—" to="сервис загрузки Глоссариев с кэшированием, аналог PromptSnippetService"/>
<delta op="POST /backup/import" form="Changed" node="src/main/java/ai/labs/eddi/backup/impl/RestImportService.java"
         from="импорт агента без Глоссариев" to="импорт агента восстанавливает Глоссарии со слиянием по URI"/>
<delta op="readGlossaries()" form="Added" node="src/main/java/ai/labs/eddi/backup/impl/ZipResourceSource.java"
         from="чтение agent/workflows/snippets из ZIP" to="чтение agent/workflows/snippets/glossaries из ZIP"/>
<delta op="dispatchGlossaries" form="Added" node="src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java"
         from="upgrade agent/workflows/snippets/extensions" to="upgrade agent/workflows/snippets/glossaries/extensions"/>
<delta op="buildGlossaryDiff" form="Added" node="src/main/java/ai/labs/eddi/backup/impl/StructuralMatcher.java"
         from="matching agent/workflows/snippets/extensions" to="matching agent/workflows/snippets/glossaries/extensions"/>
<delta op="readGlossaries()" form="Added" node="src/main/java/ai/labs/eddi/backup/IResourceSource.java"
         from="interface с readAgent/readWorkflows/readSnippets" to="interface с readAgent/readWorkflows/readSnippets/readGlossaries"/>
<delta op="GlossaryStore" form="Added" node="src/main/java/ai/labs/eddi/configs/glossary/mongo/GlossaryStore.java" new="yes"
         from="—" to="MongoDB-реализация хранилища, коллекция glossaries"/>
<delta op="readGlossaries()" form="Added" node="src/main/java/ai/labs/eddi/backup/impl/RemoteApiResourceSource.java"
         from="чтение agent/workflows/snippets/dictionaries/rulesets/apicalls/llms/propertysetters/outputsets/mcpcalls/rags с удалённого EDDI" to="чтение agent/workflows/snippets/glossaries/dictionaries/rulesets/apicalls/llms/propertysetters/outputsets/mcpcalls/rags с удалённого EDDI"/>
<scenario id="S3" uc="UC3"
            before="{{glossary.&lt;key&gt;}} не распознаётся Qute Engine, шаблон остаётся без изменений или падает"
            after="{{glossary.&lt;key&gt;}} заменён на value Термина; при отсутствии key → ошибка рендеринга GLOSSARY_TERM_KEY_MISSING"
            nodes="src/main/java/ai/labs/eddi/modules/templating/impl/GlossaryNamespaceResolver.java
                   src/main/java/ai/labs/eddi/modules/llm/impl/GlossaryService.java
                   src/main/java/ai/labs/eddi/modules/templating/impl/extensions/EddiTemplateExtensions.java"/>
<scenario id="S5" uc="UC5"
            before="импорт агента не восстанавливает Глоссарии, glossaries/ в ZIP игнорируется"
            after="POST /backup/import восстанавливает Глоссарии; при наличии существующих — merge по resource URI, новая версия приоритетнее"
            nodes="src/main/java/ai/labs/eddi/backup/impl/RestImportService.java
                   src/main/java/ai/labs/eddi/backup/impl/ZipResourceSource.java
                   src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java
                   src/main/java/ai/labs/eddi/backup/impl/StructuralMatcher.java
                   src/main/java/ai/labs/eddi/backup/IResourceSource.java
                   src/main/java/ai/labs/eddi/configs/glossary/mongo/GlossaryStore.java"/>
<scenario id="S6" uc="UC5"
            before="синхронизация с удалённым EDDI не переносит Глоссарии"
            after="POST /backup/import/sync переносит Глоссарии с удалённого EDDI через /glossarystore/glossaries/"
            nodes="src/main/java/ai/labs/eddi/backup/impl/RemoteApiResourceSource.java
                   src/main/java/ai/labs/eddi/backup/impl/RestImportService.java
                   src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java
                   src/main/java/ai/labs/eddi/backup/impl/StructuralMatcher.java"/>
<touched path="src/main/java/ai/labs/eddi/modules/templating/impl/extensions/EddiTemplateExtensions.java"
           why="регистрация GlossaryNamespaceResolver как нового Qute namespace CDI bean"/>
</frd>`

export const VALUES_B = `<values>
  <value id="v9" text="GlossaryTermKeyMissing(key)"/>
  <value id="v10" text="500 GLOSSARY_TERM_KEY_MISSING" closes="UC3/3a"/>
  <value id="v11" text="Glossary(resourceURI, version)"/>
  <value id="v12" text="Term(key, value)"/>
  <value id="v14" text="getAll()"/>
  <value id="v15" text="resolve glossary namespace" closes="UC3/in"/>
  <value id="v17" text="POST /backup/import" closes="UC5/in"/>
  <value id="v18" text="readGlossaries()"/>
  <value id="v19" text="dispatchGlossaries"/>
  <value id="v20" text="buildGlossaryDiff"/>
  <value id="v54" text="ResolvedTermValue(key, value)" closes="UC3/post"/>
  <value id="v56" text="200 {merged}" closes="UC5/post"/>
</values>`

export const NODES_B = `<design mode="major" base=".agent/appgraph.xml">
  <module path="src/main/java/ai/labs/eddi/modules/templating/impl/GlossaryNamespaceResolver.java" delta="Added">
    <role>Qute namespace resolver glossary для подстановки {{glossary.&lt;key&gt;}}</role>
    <contract in="v14 | v15" out="v9 | v54"/>
    <dep path="src/main/java/ai/labs/eddi/modules/llm/impl/GlossaryService.java"/>
  </module>
  <module path="src/main/java/ai/labs/eddi/modules/llm/impl/GlossaryService.java" delta="Added">
    <role>сервис загрузки Глоссариев с кэшированием, аналог PromptSnippetService</role>
    <contract in="v11 | v12" out="v11 | v12 | v14"/>
    <dep path="src/main/java/ai/labs/eddi/configs/glossary/mongo/GlossaryStore.java"/>
  </module>
  <module path="src/main/java/ai/labs/eddi/modules/templating/impl/extensions/EddiTemplateExtensions.java">
    <role>регистрация GlossaryNamespaceResolver как нового Qute namespace CDI bean</role>
    <contract in="" out=""/>
    <dep path="src/main/java/ai/labs/eddi/modules/templating/impl/GlossaryNamespaceResolver.java"/>
  </module>
  <module path="src/main/java/ai/labs/eddi/backup/impl/RestImportService.java" delta="Changed">
    <role>импорт агента восстанавливает Глоссарии со слиянием по URI</role>
    <contract in="v17" out="v19 | v56"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java"/>
  </module>
  <module path="src/main/java/ai/labs/eddi/backup/impl/ZipResourceSource.java" delta="Changed">
    <role>чтение agent/workflows/snippets/glossaries из ZIP</role>
    <contract in="v18" out="v11 | v12"/>
    <dep path="src/main/java/ai/labs/eddi/backup/IResourceSource.java"/>
  </module>
  <module path="src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java" delta="Changed">
    <role>upgrade agent/workflows/snippets/glossaries/extensions</role>
    <contract in="v11 | v12 | v18 | v19" out="v11 | v12 | v19"/>
    <dep path="src/main/java/ai/labs/eddi/backup/IResourceSource.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/StructuralMatcher.java"/>
    <dep path="src/main/java/ai/labs/eddi/configs/glossary/mongo/GlossaryStore.java"/>
  </module>
  <module path="src/main/java/ai/labs/eddi/backup/impl/StructuralMatcher.java" delta="Changed">
    <role>matching agent/workflows/snippets/glossaries/extensions</role>
    <contract in="v11 | v12 | v18" out="v11 | v12 | v20"/>
    <dep path="src/main/java/ai/labs/eddi/backup/IResourceSource.java"/>
  </module>
  <module path="src/main/java/ai/labs/eddi/backup/IResourceSource.java" delta="Changed">
    <role>interface с readAgent/readWorkflows/readSnippets/readGlossaries</role>
    <contract in="" out="v18"/>
  </module>
  <module path="src/main/java/ai/labs/eddi/configs/glossary/mongo/GlossaryStore.java" delta="Added">
    <role>MongoDB-реализация хранилища, коллекция glossaries</role>
    <contract in="v11 | v12" out="v11 | v12"/>
    <dep path="src/main/java/ai/labs/eddi/configs/glossary/model/Glossary.java"/>
    <dep path="src/main/java/ai/labs/eddi/configs/glossary/model/Term.java"/>
  </module>
  <module path="src/main/java/ai/labs/eddi/backup/impl/RemoteApiResourceSource.java" delta="Changed">
    <role>чтение agent/workflows/snippets/glossaries/dictionaries/rulesets/apicalls/llms/propertysetters/outputsets/mcpcalls/rags с удалённого EDDI</role>
    <contract in="v18" out="v11 | v12"/>
    <dep path="src/main/java/ai/labs/eddi/backup/IResourceSource.java"/>
  </module>
</design>`

export const RIPPLE_B = `<ripple grammar="1" mode="major" seeds="8" nodes="17">
  <module path="src/main/java/ai/labs/eddi/modules/templating/impl/extensions/EddiTemplateExtensions.java" seed="yes" pkg="ai.labs.eddi.modules.templating.impl.extensions" component="c2" level="2">
    <role>Qute template extension registrations for uuidUtils, json (serialize/deserialize), and encoder (base64) namespaces</role>
    <decl kind="class" name="EddiTemplateExtensions" sig="public class EddiTemplateExtensions"/>
  </module>
  <module path="src/main/java/ai/labs/eddi/backup/IResourceSource.java" seed="yes" pkg="ai.labs.eddi.backup" component="c1" level="5">
    <role>Interface and record types for reading agent, workflow, and snippet source data from a backup source</role>
    <decl kind="interface" name="IResourceSource" sig="public interface IResourceSource"/>
    <dep path="src/main/java/ai/labs/eddi/configs/snippets/model/PromptSnippet.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/RemoteApiResourceSource.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/StructuralMatcher.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/ZipResourceSource.java"/>
  </module>
  <module path="src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java" seed="yes" pkg="ai.labs.eddi.backup.impl" component="c1" level="3">
    <role>Application-scoped service that executes upgrade/sync operations by creating or updating agent resources, workflows, extensions, and snippets from source data</role>
    <decl kind="class" name="UpgradeExecutor" sig="public class UpgradeExecutor"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/RestImportService.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/StructuralMatcher.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/IResourceSource.java"/>
    <dep path="src/main/java/ai/labs/eddi/configs/snippets/IRestPromptSnippetStore.java"/>
  </module>
  <module path="src/main/java/ai/labs/eddi/backup/impl/StructuralMatcher.java" seed="yes" pkg="ai.labs.eddi.backup.impl" component="c1" level="4">
    <role>Application-scoped service that structurally matches imported agent resources against existing local agents for sync preview with content diffs</role>
    <decl kind="class" name="StructuralMatcher" sig="public class StructuralMatcher"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/RestImportService.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/IResourceSource.java"/>
    <dep path="src/main/java/ai/labs/eddi/configs/snippets/IRestPromptSnippetStore.java"/>
    <dep path="src/main/java/ai/labs/eddi/configs/snippets/model/PromptSnippet.java"/>
  </module>
</ripple>`

const FRD_D28 = parseFrd(FRD_B)
const VALUES_D28 = parseValues(VALUES_B)
const NODES_D28 = parseNodes(NODES_B)
const KNOWN_D28 = parseMap(RIPPLE_B).nodes
const OWNER_D28 = nodeOwner(FRD_D28)
const NODE_PARTS = nodeParts({ frd: FRD_D28, ripple: RIPPLE_B, text: FRD_B })

// Файл, который часть <id> записала бы в `.agent/staging/nodes-parts/<id>.xml`: её узлы графа и
// только они. Разрез делает ВЛАДЕНИЕ, ровно как в ext/index.mjs::design.
const nodeXml = (id, text = NODES_B) =>
  `<design mode="major" base=".agent/appgraph.xml">\n${[...text.matchAll(elem("module"))]
    .filter((m) => OWNER_D28.get(String(attrs(m[1]).path || "").trim()) === id)
    .map((m) => `  ${m[0]}`).join("\n")}\n</design>\n`
const graphOf = (xml, values = VALUES_D28) => ({ nodes: parseNodes(xml), values, frd: FRD_D28, known: KNOWN_D28 })
const textsOfB = (facts) => new Set(facts.map((f) => f.text))

// --- единица роя ----------------------------------------------------------------------------------
//
// Замер на всех шести сценариях живого FRD: 16 узлов, 6 из них названы двумя-четырьмя сценариями,
// частей выходит пять (S2 не владеет ничем — все её узлы уже названы S1), наряд части 4 281-10 874
// символа против 47 246 у наряда, который прогон 35972d1c не осилил.
test("часть прохода B = один сценарий: узлы по ПЕРВОМУ называющему, соседи — чужие пути без карточек", () => {
  assert.deepEqual(NODE_PARTS.map((p) => p.id), ["S3", "S5", "S6"])
  const [s3, s5, s6] = NODE_PARTS

  // S5 и S6 делят четыре узла, и все четыре достались S5 — она названа раньше. У S6 остаётся один.
  assert.deepEqual(s6.paths, ["src/main/java/ai/labs/eddi/backup/impl/RemoteApiResourceSource.java"])
  assert.equal(s5.paths.length, 6)
  assert.equal(s3.paths.length, 3)
  // …и объединение путей частей не пересекается: файлы частей дизъюнктны по построению.
  const all = NODE_PARTS.flatMap((p) => p.paths)
  assert.equal(new Set(all).size, all.length, "один узел — одна часть")

  // Соседи — пути ДРУГИХ частей, и ни одной их карточки: S6 видит путь UpgradeExecutor, но не его
  // контракт. Ребро туда провести можно, написать <module> — нельзя.
  assert.ok(s6.neighbours.includes("src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java"))
  assert.deepEqual(s6.neighbours.filter((p) => s6.paths.includes(p)), [])
  assert.match(s6.nodes, /На них можно только сослаться <dep path/)
  assert.doesNotMatch(s6.nodes, /<contract/)

  // Проекция FRD — дословные байты артефакта, и ничего чужого: свой сценарий, свой use case, дельты
  // СВОИХ узлов, коды сбоев своего use case.
  assert.match(s3.frd, /<scenario id="S3"/)
  assert.match(s3.frd, /<usecase id="UC3"[\s\S]*<\/usecase>/)
  assert.match(s3.frd, /<failure code="GLOSSARY_TERM_KEY_MISSING"/)
  assert.match(s3.frd, /<delta op="resolve glossary namespace"/)
  assert.doesNotMatch(s3.frd, /<scenario id="S5"/)
  assert.doesNotMatch(s3.frd, /<delta op="dispatchGlossaries"/)
  // Рябь — тоже проекция: свои узлы и только они.
  assert.match(s3.ripple, /EddiTemplateExtensions\.java/)
  assert.doesNotMatch(s3.ripple, /IResourceSource\.java" seed/)
  // Транзитный узел назван транзитным, узел с дельтой несёт слово шага 6 дословно.
  assert.match(s3.nodes, /EddiTemplateExtensions\.java — транзит/)
  assert.match(s3.nodes, /delta="Added", дельта FRD: getAll\(\)/)
  assert.ok(s5.chars < 12000, s5.chars)
})

// --- ШОВ РАЗЛОЖЕНИЯ: объединение частных вердиктов ≡ вердикту целого по частным правилам ----------
//
// Дефекты внесены в живой артефакт нарочно — по одному на каждое частное правило: слово `delta` не из
// словаря шага 6, id вне словаря, пустой `out` у узла с дельтой. Убери любое из трёх правил из
// `local`, и объединение перестанет сходиться с целым.
const BROKEN_B = NODES_B
  .replace('path="src/main/java/ai/labs/eddi/backup/impl/RemoteApiResourceSource.java" delta="Changed"',
           'path="src/main/java/ai/labs/eddi/backup/impl/RemoteApiResourceSource.java" delta="changed"')
  .replace('<contract in="v14 | v15" out="v9 | v54"/>', '<contract in="v14 | v99" out="v9 | v54"/>')
  .replace('<contract in="v11 | v12 | v18" out="v11 | v12 | v20"/>', '<contract in="v11 | v12 | v18" out=""/>')

test("шов: объединение checkNodes частей равно вердикту целого по частным правилам", () => {
  const whole = textsOfB(checkNodes(graphOf(BROKEN_B)))
  const union = new Set()
  for (const p of NODE_PARTS) for (const f of checkNodes(graphOf(nodeXml(p.id, BROKEN_B)))) union.add(f.text)
  assert.equal(whole.size, 3, [...whole].join("\n"))
  assert.deepEqual([...whole].filter((t) => !union.has(t)), [], "промахи: целое видит, части нет")
  assert.deepEqual([...union].filter((t) => !whole.has(t)), [], "ложные: части видят, целое нет")
  // …и это ровно три правила, а не три строки одного: 6, словарь, 14.
  const rules = checkNodes(graphOf(BROKEN_B)).map((f) => f.rule).sort((a, b) => a - b)
  assert.deepEqual(rules, [0, 6, 14])
})

// --- ШОВ: правила ЦЕЛОГО на части — фантомы -------------------------------------------------------
//
// Замер на живом прогоне 35972d1c: пять частей отвечают правилами целого 103 строками там, где целое
// отвечает тремя. Здесь, на трёх частях — 22 против 5. И это не шум: у узла с четырьмя
// совладельцами правило 13 видит отсутствующего соседа как ПЕРМАНЕНТНЫЙ дефект, и часть не позеленеет.
test("шов: checkNodes части не выдаёт ни одной строки правил целого — а те на части фантомны", () => {
  let phantom = 0
  for (const p of NODE_PARTS) {
    const input = graphOf(nodeXml(p.id))
    assert.deepEqual(checkNodes(input), [], p.id)
    const all = graphFacts(input)
    assert.deepEqual(all.filter((f) => f.local), [], p.id)
    phantom += all.length
  }
  assert.equal(phantom, 22, "правила целого на трёх частях")
  assert.equal(checkGraph(graphOf(NODES_B)).length, 5, "целое на том же графе")
  // Фантом именно ложный: rule 13 краснеет на части S5, потому что второй сценарий UC5 — в части S6.
  const s5 = graphFacts(graphOf(nodeXml("S5"))).filter((f) => f.rule === 13)
  assert.ok(s5.length > 0, "UC5 закрывают два сценария, и часть видит только свою половину")
  assert.deepEqual(checkGraph(graphOf(NODES_B)).filter((l) => l.startsWith("13 значение v56")), [])
})

// --- ШОВ: слияние ничего не теряет и ничего не удваивает ------------------------------------------
test("круг: части → mergeNodes → parseNodes — тот же граф, ни одного пути дважды", () => {
  const files = NODE_PARTS.map((p) => ({ id: p.id, xml: nodeXml(p.id) }))
  const { xml, owner } = mergeNodes(files, { mode: "major" })
  const back = parseNodes(xml)
  assert.equal(back.size, NODES_D28.size, "десять узлов трёх частей")
  assert.deepEqual([...back.keys()].sort(), [...NODES_D28.keys()].sort())
  for (const [path, n] of back) assert.deepEqual(n, NODES_D28.get(path), path)
  assert.equal(new Set([...xml.matchAll(elem("module"))].map((m) => attrs(m[1]).path)).size, back.size, "путь дважды")
  // owner — это адрес починки: какая ЧАСТЬ написала этот узел. Читать путь для этого нельзя.
  assert.equal(owner.get("src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java"), "S5")
  assert.equal(owner.get("src/main/java/ai/labs/eddi/backup/impl/RemoteApiResourceSource.java"), "S6")
  // Корень несёт вес шага 7 и базу — форма §4 не меняется от того, что файл собрал скрипт.
  assert.match(xml, /^<design mode="major" base="\.agent\/appgraph\.xml">/)

  // Один путь в ДВУХ файлах — победа за первым, и в слиянии он ровно один раз. Так выглядит часть,
  // написанная против прежнего FRD и оставшаяся в каталоге: без дедупликации граф понёс бы узел дважды,
  // а parseNodes прочёл бы ПОСЛЕДНИЙ — тихую подмену контракта.
  const stale = { id: "S9", xml: nodeXml("S5").replace(/delta="Changed"/g, 'delta="Added"') }
  const twice = mergeNodes([{ id: "S5", xml: nodeXml("S5") }, stale], { mode: "major" })
  const upgrade = "src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java"
  assert.equal([...twice.xml.matchAll(elem("module"))].length, 6, "шесть узлов S5, ни одного дважды")
  assert.equal(parseNodes(twice.xml).get(upgrade).delta, "Changed", "победа за ПЕРВЫМ файлом")
  assert.equal(twice.owner.get(upgrade), "S5")

  // Формат, который репозиторий и пишет, и читает, на самом трудном законном значении: кириллица,
  // `@` в пути, `<` и `>` внутри значения атрибута, многострочный <role>.
  const hard = `<design mode="minor" base=".agent/appgraph.xml">
  <module path="src/Файл@Тест.java" delta="Changed">
    <role>роль с &lt;угловыми&gt; скобками
и переводом строки</role>
    <contract in="v1 | v2" out="v3"/>
    <dep path="src/Б.java"/>
  </module>
</design>`
  assert.deepEqual(parseNodes(mergeNodes([{ id: "S1", xml: hard }], { mode: "minor" }).xml), parseNodes(hard))
  assert.deepEqual(mergeNodes(), { xml: `<design mode="" base=".agent/appgraph.xml">\n\n</design>\n`, owner: new Map() })
})

// --- ВИНА ПОСЛЕ СЛИЯНИЯ ---------------------------------------------------------------------------
//
// Живой вердикт прогона 35972d1c по его же `staging/design-nodes.xml`: три блокера, все три про UC3.
// До D28 они возвращались роли на ВЕСЬ граф, и роль переписывала все шестнадцать модулей ради трёх
// строк — вторая попытка заплатила за ремонт регрессией на узле, который был зелен.
test("вина: три живых блокера про UC3 уезжают в ОДНУ часть, сирот ноль", () => {
  const facts = graphFacts(graphOf(NODES_B))
  const merged = mergeNodes(NODE_PARTS.map((p) => ({ id: p.id, xml: nodeXml(p.id) })), { mode: "major" })
  const blame = blameNodes({ facts, frd: FRD_D28, owner: merged.owner })
  const to = new Map(blame.map((b) => [b.scenario, b.lines]))

  const uc3 = facts.filter((f) => /UC3|GLOSSARY_TERM_KEY_MISSING|EddiTemplateExtensions/.test(f.text))
  assert.equal(uc3.length, 3, uc3.map((f) => f.text).join("\n"))
  for (const f of uc3) assert.ok((to.get("S3") || []).includes(f.text), f.text)
  // Ни одна из трёх не уехала никому ещё — иначе просыпается часть, которой чинить нечего.
  for (const [id, lines] of to) if (id !== "S3") for (const f of uc3) assert.ok(!lines.includes(f.text), `${id}: ${f.text}`)
  // Сирот нет: у ребра наружу графа адресат — часть, которая это ребро написала.
  const addressed = new Set(blame.flatMap((b) => b.lines))
  assert.deepEqual(facts.map((f) => f.text).filter((t) => !addressed.has(t)), [])

  // …а адрес — ПОЛЕ, не регулярка: сотри `path` у факта, и он остаётся без адресата.
  const blind = blameNodes({ facts: facts.map((f) => ({ ...f, path: "", uc: "" })), frd: FRD_D28, owner: merged.owner })
  assert.deepEqual(blind, [])
})

// --- ШОВ: возврат из прохода C будит ОДНУ часть прохода B ------------------------------------------
//
// Без этого возврат из прохода C отдаёт свой отчёт всем частям сразу: шесть ролей переписывают шесть
// файлов ради трёх строк про один узел — то есть повторная плата за 35972d1c, умноженная на рой.
test("вина: факты прохода C, чинимые проходом B, адресуются по УЗЛУ той части, что его написала", () => {
  const facts = [
    { rule: 3, text: "3 A недостижим из B — нет ребра <dep> между ними", path: "src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java", where: ["S5"] },
    { rule: 4, text: "4 X не принимает v18 от Y", path: "src/main/java/ai/labs/eddi/backup/impl/RemoteApiResourceSource.java", where: ["S6", "S5"] },
  ]
  const blame = blameNodes({ facts, frd: FRD_D28, owner: nodeOwner(FRD_D28) })
  assert.deepEqual(blame.map((b) => [b.scenario, b.lines.length]), [["S5", 1], ["S6", 1]])
  // Строка правила 4 несёт хвост со сценариями-свидетелями — тот же blockerLine, что печатает отчёт.
  assert.equal(blame.find((b) => b.scenario === "S6").lines[0], "4 X не принимает v18 от Y (S6, S5)")
})

// --- ШОВ: ключи наряда части ≡ плейсхолдеры шаблона ------------------------------------------------
const ORDER_NODE_PART = readFileSync(new URL("order-nodes-part.tpl", import.meta.url), "utf8")

test("наряд части прохода B: плейсхолдеры шаблона — ровно те ключи, что подставляет полоса", () => {
  const keys = [...ORDER_NODE_PART.matchAll(/{{|}}|{([A-Za-z_$][\w$]*)}/g)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]))
  assert.deepEqual([...new Set(keys)].sort(), ["ANSWERS", "CHECK", "DELTA_FORMS", "FEEDBACK", "FRD", "MODE", "NODES", "PREVIOUS", "RIPPLE", "STAGING", "VALUES"])
  const call = IZI.slice(IZI.indexOf("await agent(prompt(tplNodePart, {"), IZI.indexOf("}), { role: \"designer\""))
  const passed = [...call.matchAll(/^\s{4}([A-Z_]+)[,:]/gm)].map((m) => m[1])
  assert.deepEqual([...new Set(passed)].sort(), [...new Set(keys)].sort())
  // Часть не отвечает за полноту графа — и её наряд этого не требует. Наряд ЦЕЛОГО прохода не тронут.
  assert.match(ORDER_NODE_PART, /За полноту всего графа ты не отвечаешь/)
  assert.doesNotMatch(ORDER_NODE_PART, /каждый узел, который изменение затрагивает/)
  assert.match(ORDER_NODES_WHOLE, /каждый узел, который изменение затрагивает/)
})

test("тотальность: без FRD, без ряби и без графа частей прохода B просто нет", () => {
  assert.deepEqual(nodeParts(), [])
  assert.deepEqual(nodeParts({ frd: {}, ripple: "", text: "" }), [])
  assert.deepEqual(nodeOwner(), new Map())
  assert.deepEqual(blameNodes(), [])
  // Вырождение: у формы `t2` сценариев два, частей выходит две, и порог SWARM_MIN (ext/index.test.mjs)
  // превращает их в сегодняшний единственный наряд — рой там был бы чистыми накладными.
  const two = parseFrd(FRD_B.replace(/<scenario id="S6"[\s\S]*?\/>/, ""))
  assert.equal(nodeParts({ frd: two, ripple: RIPPLE_B, text: FRD_B }).length, 2)
})

// --- D29a: ПРОХОД A ЧИТАЕТ РЯБЬ, СПРОЕЦИРОВАННУЮ НА УЗЛЫ ИЗМЕНЕНИЯ --------------------------------
//
// ФИКСТУРА — ДОСЛОВНАЯ ВЫПИСКА живых артефактов прогона `d5f1d0b4` (`sandbox/runbox/eddi/.agent/`):
// все тринадцать `<delta>`, два `<scenario>` из двенадцати (S1 и S10), все шесть `<touched>` — и из
// ряби те шесть `<module>`, которые несут узлы изменения, плюс два соседних модуля из оставшихся
// двадцати трёх. Прогон: наряд прохода A 49 884 символа, выход 98 304 = 3 x 32 768, ноль вызовов
// инструментов, `crashed`, 1 104 секунды.
//
// ЧИСЛА ЖИВОЙ ФОРМЫ. Рябь целиком — 29 модулей, 30 281 символ, 106 объявлений (86 `<decl>` + 20
// `<api>`). Проекция — 6 модулей, 9 573 символа, 37 объявлений; соседи 23 пути, 1 592 символа.
// Отдай роли рябь целиком (`paths` = все модули ряби) — краснеют все три числа разом.
const R_EDDI = `<ripple grammar="1" mode="major" seeds="6" nodes="29">
  <module path="src/main/java/ai/labs/eddi/backup/IResourceSource.java" seed="yes" pkg="ai.labs.eddi.backup" component="c1" level="5">
    <role>Interface and record types for reading agent, workflow, and snippet source data from a backup source</role>
    <decl kind="interface" name="IResourceSource" sig="public interface IResourceSource"/>
    <dep path="src/main/java/ai/labs/eddi/configs/snippets/model/PromptSnippet.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/RemoteApiResourceSource.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/StructuralMatcher.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/ZipResourceSource.java"/>
  </module>
  <module path="src/main/java/ai/labs/eddi/backup/IZipArchive.java" pkg="ai.labs.eddi.backup" component="c1" level="3" cut="1">
    <role>Interface for zip archive creation and extraction operations</role>
    <decl kind="interface" name="IZipArchive" sig="public interface IZipArchive"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/RestExportService.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/RestImportService.java"/>
  </module>
  <module path="src/main/java/ai/labs/eddi/backup/impl/RestExportService.java" seed="yes" pkg="ai.labs.eddi.backup.impl" component="c1" level="1">
    <role>REST service for exporting agents as ZIP archives with selective resource export and snippet reference scanning</role>
    <api name="GET /backup/export/{agentFilename}" kind="http" scope="public"/>
    <api name="POST /backup/export/{agentId}" kind="http" scope="public"/>
    <api name="POST /backup/export/{agentId}/preview" kind="http" scope="public"/>
    <decl kind="class" name="RestExportService" sig="public class RestExportService"/>
    <decl kind="method" name="getAgentZipArchive(String agentFilename)" sig="public Response getAgentZipArchive(String agentFilename)"/>
    <decl kind="method" name="exportAgent(String agentId, Integer agentVersion, String selectedResourceIds)" sig="public Response exportAgent(String agentId, Integer agentVersion, String selectedResourceIds)"/>
    <decl kind="method" name="previewExport(String agentId, Integer agentVersion)" sig="public ExportPreview previewExport(String agentId, Integer agentVersion)"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/AbstractBackupService.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/CallbackMatcher.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/IRestExportService.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/IZipArchive.java"/>
    <dep path="src/main/java/ai/labs/eddi/configs/snippets/IPromptSnippetStore.java"/>
    <dep path="src/main/java/ai/labs/eddi/configs/snippets/model/PromptSnippet.java"/>
  </module>
  <module path="src/main/java/ai/labs/eddi/backup/impl/RestImportService.java" seed="yes" pkg="ai.labs.eddi.backup.impl" component="c1" level="2">
    <role>REST service for importing agents from ZIP files and executing live instance-to-instance sync with merge/upgrade strategies</role>
    <api name="GET /backup/import/sync/agents" kind="http" scope="public"/>
    <api name="POST /backup/import" kind="http" scope="public"/>
    <api name="POST /backup/import/initialAgents" kind="http" scope="public"/>
    <api name="POST /backup/import/preview" kind="http" scope="public"/>
    <api name="POST /backup/import/sync" kind="http" scope="public"/>
    <api name="POST /backup/import/sync/batch" kind="http" scope="public"/>
    <api name="POST /backup/import/sync/preview" kind="http" scope="public"/>
    <api name="POST /backup/import/sync/preview/batch" kind="http" scope="public"/>
    <decl kind="class" name="RestImportService" sig="public class RestImportService"/>
    <decl kind="method" name="importInitialAgents()" sig="public List&lt;AgentDeploymentStatus&gt; importInitialAgents()"/>
    <decl kind="method" name="previewImport(InputStream zippedAgentConfigFiles, String targetAgentId)" sig="public ImportPreview previewImport(InputStream zippedAgentConfigFiles, String targetAgentId)"/>
    <decl kind="method" name="listRemoteAgents(String sourceUrl, String sourceAuth)" sig="public List&lt;DocumentDescriptor&gt; listRemoteAgents(String sourceUrl, String sourceAuth)"/>
    <decl kind="method" name="previewSyncBatch(String sourceUrl, List&lt;SyncMapping&gt; mappings, String sourceAuth)" sig="public List&lt;ImportPreview&gt; previewSyncBatch(String sourceUrl, List&lt;SyncMapping&gt; mappings, String sourceAuth)"/>
    <decl kind="method" name="executeSyncBatch(String sourceUrl, List&lt;SyncRequest&gt; requests, String sourceAuth)" sig="public Response executeSyncBatch(String sourceUrl, List&lt;SyncRequest&gt; requests, String sourceAuth)"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/AbstractBackupService.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/StructuralMatcher.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/CallbackMatcher.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/ZipResourceSource.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/SourceUrlValidator.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/RemoteApiResourceSource.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/IRestImportService.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/IZipArchive.java"/>
    <dep path="src/main/java/ai/labs/eddi/configs/snippets/IRestPromptSnippetStore.java"/>
    <dep path="src/main/java/ai/labs/eddi/configs/snippets/model/PromptSnippet.java"/>
  </module>
  <module path="src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java" seed="yes" pkg="ai.labs.eddi.backup.impl" component="c1" level="3">
    <role>Application-scoped service that executes upgrade/sync operations by creating or updating agent resources, workflows, extensions, and snippets from source data</role>
    <decl kind="class" name="UpgradeExecutor" sig="public class UpgradeExecutor"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/RestImportService.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/StructuralMatcher.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/IResourceSource.java"/>
    <dep path="src/main/java/ai/labs/eddi/configs/snippets/IRestPromptSnippetStore.java"/>
  </module>
  <module path="src/main/java/ai/labs/eddi/backup/impl/ZipResourceSource.java" seed="yes" pkg="ai.labs.eddi.backup.impl" component="c1" level="3">
    <role>Reads agent, workflow, and snippet source data from an unzipped ZIP directory structure for import operations</role>
    <decl kind="class" name="ZipResourceSource" sig="public class ZipResourceSource"/>
    <decl kind="method" name="ZipResourceSource(Path unzippedDirectory, IJsonSerialization jsonSerialization)" sig="public ZipResourceSource(Path unzippedDirectory, IJsonSerialization jsonSerialization)"/>
    <decl kind="method" name="readAgent()" sig="public AgentSourceData readAgent()"/>
    <decl kind="method" name="readWorkflows()" sig="public List&lt;WorkflowSourceData&gt; readWorkflows()"/>
    <decl kind="method" name="readSnippets()" sig="public List&lt;SnippetSourceData&gt; readSnippets()"/>
    <decl kind="method" name="close()" sig="public void close()"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/RestImportService.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/impl/AbstractBackupService.java"/>
    <dep path="src/main/java/ai/labs/eddi/backup/IResourceSource.java"/>
    <dep path="src/main/java/ai/labs/eddi/configs/snippets/model/PromptSnippet.java"/>
  </module>
  <module path="src/main/java/ai/labs/eddi/modules/llm/impl/ConversationHistoryBuilder.java" pkg="ai.labs.eddi.modules.llm.impl" component="c1" level="3" cut="1">
    <role>CDI-scoped builder that converts ConversationLog entries into langchain4j ChatMessage lists for LLM context windows</role>
    <dep path="src/main/java/ai/labs/eddi/modules/llm/impl/LlmTask.java"/>
  </module>
  <module path="src/main/java/ai/labs/eddi/modules/llm/impl/LlmTask.java" seed="yes" pkg="ai.labs.eddi.modules.llm.impl" component="c1" level="2">
    <role>LLM lifecycle task that orchestrates agent/assistant LLM interactions, tool calling, HITL gating, RAG context injection, streaming and legacy chat dispatch, and token/cost accumulation</role>
    <decl kind="class" name="LlmTask" sig="public class LlmTask"/>
    <decl kind="method" name="getId()" sig="public TaskId getId()"/>
    <decl kind="method" name="getType()" sig="public String getType()"/>
    <decl kind="method" name="execute(IConversationMemory memory, Object component)" sig="public void execute(IConversationMemory memory, Object component)"/>
    <decl kind="method" name="configure(Map&lt;String, Object&gt; configuration, Map&lt;String, Object&gt; extensions)" sig="public Object configure(Map&lt;String, Object&gt; configuration, Map&lt;String, Object&gt; extensions)"/>
    <decl kind="method" name="getExtensionDescriptor()" sig="public ExtensionDescriptor getExtensionDescriptor()"/>
    <decl kind="field" name="ID" sig="public static final String ID = &quot;ai.labs.llm&quot;"/>
    <decl kind="field" name="TASK_ID" sig="public static final TaskId TASK_ID = new TaskId(ID)"/>
    <dep path="src/main/java/ai/labs/eddi/modules/llm/impl/ChatModelRegistry.java"/>
    <dep path="src/main/java/ai/labs/eddi/modules/llm/impl/ConversationHistoryBuilder.java"/>
    <dep path="src/main/java/ai/labs/eddi/modules/llm/impl/LegacyChatExecutor.java"/>
    <dep path="src/main/java/ai/labs/eddi/modules/llm/impl/StreamingLegacyChatExecutor.java"/>
    <dep path="src/main/java/ai/labs/eddi/modules/llm/impl/CascadingModelExecutor.java"/>
    <dep path="src/main/java/ai/labs/eddi/modules/llm/impl/RagContextProvider.java"/>
    <dep path="src/main/java/ai/labs/eddi/modules/llm/impl/TokenCounterFactory.java"/>
    <dep path="src/main/java/ai/labs/eddi/modules/llm/impl/ConversationSummarizer.java"/>
    <dep path="src/main/java/ai/labs/eddi/modules/llm/impl/PromptSnippetService.java"/>
    <dep path="src/main/java/ai/labs/eddi/modules/llm/impl/CounterweightService.java"/>
    <dep path="src/main/java/ai/labs/eddi/modules/llm/impl/IdentityMaskingService.java"/>
    <dep path="src/main/java/ai/labs/eddi/modules/templating/ITemplatingEngine.java"/>
  </module>
</ripple>
`

const F_EDDI = `<frd grammar="1" goal="Глоссарии">
  <delta op="CRUD Glossary" form="Added" node="src/main/java/ai/labs/eddi/configs/glossary/model/Glossary.java" new="yes"/>
  <delta op="GET glossarystore/glossaries/{id}" form="Added" node="src/main/java/ai/labs/eddi/configs/glossary/rest/RestGlossaryStore.java" new="yes"/>
  <delta op="Term" form="Added" node="src/main/java/ai/labs/eddi/configs/glossary/model/Term.java" new="yes"/>
  <delta op="IGlossaryStore CRUD" form="Added" node="src/main/java/ai/labs/eddi/configs/glossary/IGlossaryStore.java" new="yes"/>
  <delta op="MongoDB Glossary store" form="Added" node="src/main/java/ai/labs/eddi/configs/glossary/mongo/GlossaryStore.java" new="yes"/>
  <delta op="GlossaryService getAll" form="Added" node="src/main/java/ai/labs/eddi/modules/llm/impl/GlossaryService.java" new="yes"/>
  <delta op="resolve glossary:" form="Added" node="src/main/java/ai/labs/eddi/modules/templating/impl/GlossaryNamespaceResolver.java" new="yes"/>
  <delta op="readGlossaries()" form="Added" node="src/main/java/ai/labs/eddi/backup/IResourceSource.java" from="readSnippets()" to="readSnippets() + readGlossaries()"/>
  <delta op="POST /backup/export/{agentId}" form="Changed" node="src/main/java/ai/labs/eddi/backup/impl/RestExportService.java" from="экспорт Агента, Workflow, Snippets" to="экспорт Агента, Workflow, Snippets, Glossaries"/>
  <delta op="POST /backup/import" form="Changed" node="src/main/java/ai/labs/eddi/backup/impl/RestImportService.java" from="импорт без Глоссариев" to="импорт с восстановлением Глоссариев"/>
  <delta op="readGlossaries()" form="Added" node="src/main/java/ai/labs/eddi/backup/impl/ZipResourceSource.java" from="readSnippets()" to="readSnippets() + readGlossaries()"/>
  <delta op="executeUpgrade()" form="Changed" node="src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java" from="обновление Snippets, Workflow, Extensions" to="обновление Snippets, Workflow, Extensions, Glossaries с merge по URI"/>
  <delta op="execute" form="Changed" node="src/main/java/ai/labs/eddi/modules/llm/impl/LlmTask.java" from="решение Snippets и глобальных переменных в шаблонах" to="решение Snippets, глобальных переменных и Glossary значений в шаблонах"/>
  <scenario id="S1" uc="UC1" before="нет операции создания Глоссария" after="POST glossarystore/glossaries создаёт Глоссарий с HTTP 201"
            nodes="src/main/java/ai/labs/eddi/configs/glossary/model/Glossary.java src/main/java/ai/labs/eddi/configs/glossary/rest/RestGlossaryStore.java src/main/java/ai/labs/eddi/configs/glossary/IGlossaryStore.java src/main/java/ai/labs/eddi/configs/glossary/mongo/GlossaryStore.java"/>
  <scenario id="S10" uc="UC10" before="экспорт агента не включает Глоссарии" after="экспорт агента сканирует configuration set на ссылки Глоссариев и включает их в ZIP-архив"
            nodes="src/main/java/ai/labs/eddi/backup/impl/RestExportService.java src/main/java/ai/labs/eddi/backup/IResourceSource.java src/main/java/ai/labs/eddi/backup/impl/ZipResourceSource.java"/>
  <touched path="src/main/java/ai/labs/eddi/backup/IResourceSource.java" why="добавлен метод readGlossaries() и тип GlossarySourceData"/>
  <touched path="src/main/java/ai/labs/eddi/backup/impl/RestExportService.java" why="сканирование configuration set на ссылки Глоссариев и включение их в экспорт"/>
  <touched path="src/main/java/ai/labs/eddi/backup/impl/RestImportService.java" why="извлечение Глоссариев из ZIP и восстановление с merge по URI"/>
  <touched path="src/main/java/ai/labs/eddi/backup/impl/ZipResourceSource.java" why="добавлен метод readGlossaries() для чтения Глоссариев из распакованного ZIP"/>
  <touched path="src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java" why="добавлена обработка Глоссариев при upgrade с merge-стратегией по resource URI"/>
  <touched path="src/main/java/ai/labs/eddi/modules/llm/impl/LlmTask.java" why="добавлено разрешение Glossary значений при рендеринге шаблонов промптов"/>
</frd>
`

const declsIn = (s) => (String(s).match(/<decl\b/g) || []).length + (String(s).match(/<api\b/g) || []).length

test("D29a: наряд прохода A несёт модули УЗЛОВ ИЗМЕНЕНИЯ — 6 модулей, 9 573 символа, 37 объявлений", () => {
  const p = changeRipple({ frd: parseFrd(F_EDDI), ripple: R_EDDI })

  assert.equal(p.paths.length, 6, "модулей в проекции")
  const bytes = [...R_EDDI.matchAll(elem("module"))]
    .filter((m) => p.paths.includes(attrs(m[1]).path))
    .reduce((a, m) => a + m[0].length, 0)
  assert.equal(bytes, 9573, "байты <module> проекции — то, что реально едет в наряд")
  assert.equal(declsIn(p.text), 37, "объявлений в проекции")

  // Семь узлов изменения из тринадцати — `<delta new="yes">`: их в подграфе нет и быть не может,
  // и это случай, а не дефект — модуль заводит само изменение.
  const width = new Set([...parseFrd(F_EDDI).deltas.map((d) => d.node), ...parseFrd(F_EDDI).touched])
  assert.equal(width.size, 13)
})

test("D29a: пути соседей едут ОБЯЗАТЕЛЬНО, и едут именно путями — без единого объявления", () => {
  const p = changeRipple({ frd: parseFrd(F_EDDI), ripple: R_EDDI })

  // Операнд правила 6 (транзитный узел вне ряби, steps/design/nodes.mjs): узел без дельты законен
  // ровно тогда, когда подграф его объявляет. Спрячь эти пути — и словарь не назовёт значение, за
  // которое такой узел отвечает, а следующий проход упрётся в id, который никуда не резолвится.
  assert.deepEqual([...p.neighbours], [
    "src/main/java/ai/labs/eddi/backup/IZipArchive.java",
    "src/main/java/ai/labs/eddi/modules/llm/impl/ConversationHistoryBuilder.java",
  ])
  for (const path of p.neighbours) assert.match(p.text, new RegExp(`^  ${path.replace(/[.]/g, "\\.")}$`, "m"))
  // …и ни строчки их содержимого: объявления соседа — это те самые 68 % байт, ради которых всё
  // затевалось (на форме `t2` из 16 значений словаря до поставки доехали 5).
  assert.doesNotMatch(p.text, /name="IZipArchive"/)
  assert.doesNotMatch(p.text, /name="ConversationHistoryBuilder"/)
})

test("D29a: узел, названный ТОЛЬКО сценарием, — узел изменения; чужой узел — сосед", () => {
  const frd = parseFrd(`<frd grammar="1" goal="g">
  <scenario id="S1" uc="UC1" before="a" after="b" nodes="src/a.js"/>
</frd>`)
  const ripple = `<ripple grammar="1">
  <module path="src/a.js"><decl kind="fn" name="a" sig="a()"/></module>
  <module path="src/b.js"><decl kind="fn" name="b" sig="b()"/></module>
</ripple>`
  const p = changeRipple({ frd, ripple })

  // Транзит без дельты и без `<touched>` — самый случай правила 6: его объявления и есть то, из чего
  // словарь называет значение, которое он передаёт дальше.
  assert.deepEqual([...p.paths], ["src/a.js"])
  assert.deepEqual([...p.neighbours], ["src/b.js"])
  assert.match(p.text, /name="a"/)
  assert.doesNotMatch(p.text, /name="b"/)
})

test("тотальность: без FRD и без ряби проекция пуста и не бросает", () => {
  assert.deepEqual(changeRipple().paths, [])
  assert.deepEqual(changeRipple({ frd: {}, ripple: "" }).neighbours, [])
  // Без FRD весь подграф — соседи: это правда, и увидеть её должен вызвавший, а не догадываться.
  const p = changeRipple({ frd: {}, ripple: R_EDDI })
  assert.equal(p.paths.length, 0)
  assert.equal(p.neighbours.length, 8)
})

// --- ШОВ: полоса отдаёт проходу A ПРОЕКЦИЮ, а не файл ряби -----------------------------------------
test("D29a: наряд прохода A получает проекцию хоста, а не .agent/ripple.xml целиком", () => {
  assert.match(IZI, /const CHANGE = await design\(\{ pass: "values", ripple: true \}\);/)
  assert.match(IZI, /values: \{ FRD, RIPPLE: CHANGE\.text,/)
  // …а проход B по-прежнему читает подграф ЦЕЛИКОМ: его правило 6 судит транзит по всей ряби.
  assert.match(IZI, /nodes: \{ VALUES, FRD, RIPPLE,/)
})

// --- D30, ШОВ D: `from` — СПИСОК, И ЕГО РАЗДЕЛИТЕЛЬ ОБЪЯВЛЕН НА КЛАСС -----------------------------
//
// D22 починил `from` как список, но только у ОДНОГО читателя из четырёх — `steps/intake/frd.mjs`.
// Здесь читателей два (`routeParts` и `nodeParts`), и оба резали атрибут по пробелам: отказ, чьи
// ветки принадлежат ДВУМ use case, доезжал в наряд не каждой части, а той, чей токен оказался первым
// куском. Черта без пробелов — ровно та форма, которой схемы конвейера учат перечислять всё, и
// которая убила прогон 27b37fdb на шаге 9.
const FRD_D30_XML = `<frd grammar="1" goal="карточка фрукта одним запросом и на странице списка">
  <usecase id="UC1" actor="api-client" goal="получить фрукт по имени">
    <post>вернулся один фрукт</post>
    <step n="1">клиент отправляет GET /fruits/{name}</step>
    <ext id="1a" error="FRUIT_NOT_FOUND" outcome="фрукт не найден, вернуто HTTP 404"/>
  </usecase>
  <usecase id="UC2" actor="list-page-user" goal="увидеть карточку фрукта на странице списка">
    <post>карточка показана inline</post>
    <step n="1">пользователь выбирает фрукт из списка</step>
    <ext id="2a" error="FRUIT_NOT_FOUND" outcome="карточка не открылась, показано «фрукт не найден»"/>
  </usecase>
  <delta op="GET /fruits/{name}" form="Added" node="src/FruitResource.java" from="—" to="эндпоинт отдаёт один фрукт"/>
  <delta op="карточка inline" form="Changed" node="src/fruits.html" from="карточки нет" to="карточка раскрыта inline"/>
  <scenario id="S1" uc="UC1" before="эндпоинта нет" after="эндпоинт отдаёт фрукт" nodes="src/FruitResource.java"/>
  <scenario id="S2" uc="UC2" before="карточки нет" after="карточка раскрыта" nodes="src/fruits.html"/>
  <failure code="FRUIT_NOT_FOUND" status="404" client="показать «фрукт не найден»" operator="—" from="UC1/1a | UC2/2a"/>
</frd>`
const RIPPLE_D30 = `<ripple grammar="1" mode="minor" seeds="2" nodes="2">
  <module path="src/FruitResource.java" seed="yes" level="1"><role>fruits endpoint</role></module>
  <module path="src/fruits.html" seed="yes" level="1"><role>list page</role></module>
</ripple>`

test("D30 шов D: `<failure from=\"UC1/1a | UC2/2a\">` адресует блокер ОБЕИМ частям", () => {
  const frd = parseFrd(FRD_D30_XML)
  // Обе ветки резолвятся: это ОДИН отказ двух use case, а не два отказа.
  assert.deepEqual(frd.failures.map((f) => f.from), ["UC1/1a | UC2/2a"])

  for (const sep of [" | ", "|", " ", ","]) {
    const xml = FRD_D30_XML.replace('from="UC1/1a | UC2/2a"', `from="UC1/1a${sep}UC2/2a"`)
    const f = parseFrd(xml)

    const byNodes = nodeParts({ frd: f, ripple: RIPPLE_D30, text: xml })
    assert.deepEqual(byNodes.map((p) => p.id), ["S1", "S2"], JSON.stringify(sep))
    for (const p of byNodes) assert.match(p.frd, /<failure code="FRUIT_NOT_FOUND"/, `${p.id} @ ${JSON.stringify(sep)}`)

    const values = parseValues(`<values>
      <value id="v1" text="GET /fruits/{name}" closes="UC1/in"/>
      <value id="v2" text="Выбор(name)" closes="UC2/in"/>
      <value id="v3" text="200 {Fruit}" closes="UC1/post"/>
      <value id="v4" text="Карточка(name)" closes="UC2/post"/>
      <value id="v5" text="404 FRUIT_NOT_FOUND" closes="UC1/1a | UC2/2a"/>
    </values>`)
    const nodes = parseNodes(`<design mode="minor" base=".agent/appgraph.xml">
      <module path="src/FruitResource.java" delta="Added"><role>fruits endpoint</role><contract in="v1" out="v3 | v5"/></module>
      <module path="src/fruits.html" delta="Changed"><role>list page</role><contract in="v2" out="v4 | v5"/></module>
    </design>`)
    const byRoutes = routeParts({ frd: f, values, nodes, text: xml })
    assert.deepEqual(byRoutes.map((p) => p.id), ["S1", "S2"], JSON.stringify(sep))
    for (const p of byRoutes) assert.match(p.frd, /<failure code="FRUIT_NOT_FOUND"/, `${p.id} @ ${JSON.stringify(sep)}`)
    // …и один и тот же id закрывает конец у обеих частей: значение объявлено ОДИН раз (LAW 3 роли).
    for (const p of byRoutes) assert.ok(p.routes.some((r) => r.value === "v5"), `${p.id} @ ${JSON.stringify(sep)}`)
  }
})
