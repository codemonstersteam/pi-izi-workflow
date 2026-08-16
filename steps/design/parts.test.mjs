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
import { routeParts, mergeParts, blameByScenario } from "./parts.mjs"
import { parseValues } from "./values.mjs"
import { parseNodes } from "./nodes.mjs"
import { parseFrd } from "../intake/frd.mjs"

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
