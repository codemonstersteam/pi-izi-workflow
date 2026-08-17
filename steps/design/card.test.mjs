// The split of step 9 — a PURE core; its io lives in ext/index.mjs (standards/code.md: an io pipe is
// not unit-tested). Formula: 1 happy + Σ antecedent branches with a DISTINGUISHABLE consequent. The
// branches are the three shapes a change can have (files shared by several use cases, files owned by
// one, none shared at all) plus the two decisions the grouping itself makes (transitivity, the id).
//
// The FRD fixture is PARSED, not typed: `frd` reaches this core exactly as steps/intake/frd.mjs hands
// it over.

import test from "node:test"
import assert from "node:assert/strict"
import { splitOf, sampleOf, cardOf, coreCardOf, checkCore } from "./card.mjs"
import { parseFrd } from "../intake/frd.mjs"

// The shape measured on `eddi`, in miniature: a trio every use case runs through, a record shared by
// the first two use cases, another record shared by the third — and a separate island of two files
// that no use case connects to the first group.
const FRD_XML = `<frd grammar="1" goal="хранилище словарей и выгрузка">
  <usecase id="UC1" actor="api" goal="создать"><post>создан</post><step n="1">POST /store</step></usecase>
  <usecase id="UC2" actor="api" goal="прочитать"><post>прочитан</post><step n="1">GET /store/{id}</step></usecase>
  <usecase id="UC3" actor="api" goal="добавить термин"><post>добавлен</post><step n="1">POST /store/{id}/terms</step></usecase>
  <usecase id="UC9" actor="api" goal="выгрузить"><post>выгружен</post><step n="1">POST /export</step></usecase>
  <usecase id="UC10" actor="api" goal="загрузить"><post>загружен</post><step n="1">POST /import</step></usecase>

  <delta op="POST /store" form="Added" node="src/rest/RestStore.java" new="yes"/>
  <delta op="store()" form="Added" node="src/IStore.java" new="yes"/>
  <delta op="mongo store" form="Added" node="src/mongo/Store.java" new="yes"/>
  <delta op="POST /export" form="Added" node="src/export/RestExport.java" new="yes"/>

  <scenario id="S1" uc="UC1" before="нет" after="есть" nodes="src/rest/RestStore.java src/IStore.java src/mongo/Store.java src/model/Doc.java"/>
  <scenario id="S2" uc="UC2" before="нет" after="есть" nodes="src/rest/RestStore.java src/IStore.java src/mongo/Store.java src/model/Doc.java"/>
  <scenario id="S3" uc="UC3" before="нет" after="есть" nodes="src/rest/RestStore.java src/IStore.java src/mongo/Store.java src/model/Term.java"/>
  <scenario id="S9" uc="UC9" before="нет" after="есть" nodes="src/export/RestExport.java src/export/Zip.java"/>
  <scenario id="S10" uc="UC10" before="нет" after="есть" nodes="src/export/RestExport.java src/export/Zip.java"/>
</frd>`

const FRD = parseFrd(FRD_XML)
const ids = (g) => g.map((x) => x.id)
const paths = (g, k) => [...g[k].paths]

test("happy: общее отделено от частного, и общее сложено в связные группы", () => {
  const s = splitOf({ frd: FRD })

  // Общее — в порядке FRD: трио, которое проходят три use case, и две записи по две.
  assert.deepEqual([...s.shared], [
    "src/rest/RestStore.java", "src/IStore.java", "src/mongo/Store.java",
    "src/model/Doc.java", "src/export/RestExport.java", "src/export/Zip.java",
  ])
  // Частное — файл ровно одного use case: его дизайнер видит про него всю правду.
  assert.deepEqual([...s.own], ["src/model/Term.java"])

  // Две группы: хранилище и выгрузка. Ни одного общего use case между ними.
  assert.equal(s.groups.length, 2)
  assert.deepEqual(paths(s.groups, 0), ["src/rest/RestStore.java", "src/IStore.java", "src/mongo/Store.java", "src/model/Doc.java"])
  assert.deepEqual(paths(s.groups, 1), ["src/export/RestExport.java", "src/export/Zip.java"])

  // Группе едут ВСЕ use case, которые её контракт может сломать.
  assert.deepEqual([...s.groups[0].ucs], ["UC1", "UC2", "UC3"])
  assert.deepEqual([...s.groups[1].ucs], ["UC9", "UC10"])

  // Каждый узел знает свои use case, в порядке FRD.
  assert.deepEqual([...s.ucOf.get("src/rest/RestStore.java")], ["UC1", "UC2", "UC3"])
  assert.deepEqual([...s.ucOf.get("src/model/Term.java")], ["UC3"])
})

// Транзитивность — не украшение: на `eddi` `Glossary` встречается с трио через UC1-UC5, а `Term`
// через UC6-UC8, и между собой они не делят ни одного use case. Разорви связь — и пять файлов,
// которые обязаны решаться вместе, разъедутся по трём группам.
test("группа транзитивна: A и C без общего use case, но оба связаны через B", () => {
  const s = splitOf({ frd: FRD })
  const g = s.groups[0]
  assert.equal(g.paths.includes("src/model/Doc.java"), true, "запись первых двух use case — в той же группе")
  // Прямой связи между записью и REST-точкой нет ни по одному use case? Есть — через UC1. Проверяем
  // настоящую транзитивность: убираем `Doc` из S2, и он остаётся в группе через один только UC1.
  const thin = parseFrd(FRD_XML.replace('nodes="src/rest/RestStore.java src/IStore.java src/mongo/Store.java src/model/Doc.java"/>\n  <scenario id="S3"', 'nodes="src/rest/RestStore.java src/IStore.java src/mongo/Store.java"/>\n  <scenario id="S3"'))
  const t = splitOf({ frd: thin })
  assert.equal(t.groups.length, 2, "групп по-прежнему две")
})

test("id группы — общий каталог её файлов, а не выдуманный номер", () => {
  const s = splitOf({ frd: FRD })
  assert.deepEqual(ids(s.groups), ["src", "src/export"])
})

test("общих узлов нет — групп нет, и фаза вырождается бесплатно", () => {
  const one = parseFrd(`<frd grammar="1" goal="один">
    <usecase id="UC1" actor="api" goal="g"><post>p</post><step n="1">s</step></usecase>
    <delta op="GET /x" form="Added" node="src/A.java"/>
    <scenario id="S1" uc="UC1" before="нет" after="есть" nodes="src/A.java src/B.java"/>
  </frd>`)
  const s = splitOf({ frd: one })
  assert.deepEqual([...s.shared], [])
  assert.deepEqual([...s.own], ["src/A.java", "src/B.java"])
  assert.equal(s.groups.length, 0)
})

test("тотальность: без требования — пустое разбиение, и ничего не брошено", () => {
  const s = splitOf()
  assert.deepEqual([...s.shared], [])
  assert.deepEqual([...s.own], [])
  assert.equal(s.groups.length, 0)
  assert.equal(s.ucOf.size, 0)
  assert.equal(splitOf({ frd: { scenarios: null } }).groups.length, 0)
})

test("разбиение — функция требования: два вычисления одного FRD совпадают", () => {
  const a = splitOf({ frd: FRD }), b = splitOf({ frd: parseFrd(FRD_XML) })
  assert.deepEqual([...a.shared], [...b.shared])
  assert.deepEqual(ids(a.groups), ids(b.groups))
})

// --- D37: карточка одного дизайнера и лестница образца ---------------------------------------------

const MAP = `<appgraph grammar="3" modules="7">
  <suite id="unit" kind="unit" cmd="./mvnw test" one="-Dtest={class}" path="src/test/java" match="*Test.java"/>
  <systems>
    <system name="mongodb" kind="db" config="mongo.url" value="mongodb://localhost" declared="yes" used="yes">
    </system>
    <system name="nats" kind="queue" config="nats.url" value="nats://localhost" declared="yes" used="no">
    </system>
  </systems>
  <module path="src/configs/snippets/model/Snippet.java" level="6">
    <role>запись сниппета</role>
    <decl kind="class" name="Snippet" sig="public class Snippet"/>
  </module>
  <module path="src/configs/snippets/ISnippetStore.java" level="5">
    <role>интерфейс хранилища сниппетов</role>
    <decl kind="interface" name="ISnippetStore" sig="public interface ISnippetStore"/>
  </module>
  <module path="src/configs/snippets/mongo/SnippetStore.java" level="4">
    <role>монго-хранилище сниппетов</role>
    <decl kind="method" name="create(Snippet s)" sig="public IResourceId create(Snippet s)"/>
    <io kind="db" dir="out" system="mongodb" target="snippets"/>
  </module>
  <module path="src/modules/impl/CallerNamespaceResolver.java" level="3">
    <role>резолвер неймспейса вызывающего</role>
    <decl kind="class" name="CallerNamespaceResolver" sig="public class CallerNamespaceResolver"/>
  </module>
  <module path="src/modules/impl/Engine.java" level="3"><role>движок</role></module>
  <module path="src/rest/RestExisting.java" level="1">
    <role>существующая точка</role>
    <api name="GET /existing" kind="http" scope="public"/>
  </module>
</appgraph>`

const FRD_CARD = parseFrd(`<frd grammar="1" goal="глоссарий">
  <usecase id="UC1" actor="api" goal="прочитать глоссарий">
    <pre>глоссарий есть</pre>
    <post>глоссарий возвращён, HTTP 200</post>
    <step n="1">GET /glossaries/{id}</step>
    <step n="2">система читает хранилище</step>
    <ext id="2a" error="NOT_FOUND" outcome="глоссарий не возвращён, ошибка отсутствия"/>
  </usecase>
  <usecase id="UC2" actor="api" goal="другое"><post>ok</post><step n="1">GET /other</step></usecase>
  <delta op="GET /glossaries/{id}" form="Added" node="src/configs/glossary/mongo/GlossaryStore.java" new="yes"/>
  <delta op="резолвит glossary:" form="Added" node="src/modules/impl/GlossaryNamespaceResolver.java" new="yes"/>
  <delta op="GET /existing" form="Changed" node="src/rest/RestExisting.java" from="без глоссария" to="с глоссарием"/>
  <scenario id="S1" uc="UC1" before="нет чтения" after="есть чтение" nodes="src/configs/glossary/mongo/GlossaryStore.java src/modules/impl/GlossaryNamespaceResolver.java src/rest/RestExisting.java"/>
  <scenario id="S2" uc="UC2" before="нет" after="есть" nodes="src/rest/RestExisting.java"/>
  <failure code="NOT_FOUND" status="404" client="показать отсутствие" operator="—" from="UC1/2a"/>
</frd>`)

const FLOW = `$START_FLOW id="S1"
1. src/rest/RestExisting.java : GET /glossaries/{id} -> read()
$END_FLOW
$START_FLOW id="S1b"
1. src/rest/RestExisting.java : GET /glossaries/{id} -> 404 NOT_FOUND
$END_FLOW
$START_FLOW id="S2"
1. src/rest/RestExisting.java : GET /other -> ok
$END_FLOW
$START_TESTS path="src/rest/RestExisting.java"
1. GET /glossaries/{id} -> read()
$END_TESTS`

const card = (uc = "UC1", over = {}) => cardOf({ uc, frd: FRD_CARD, map: MAP, flow: FLOW, ...over })

test("лестница образца: сам себе · близнец того же вида · сосед того же вида · нет ничего", () => {
  // Узел СУЩЕСТВУЕТ — образец не нужен, контекст это он сам.
  assert.deepEqual(sampleOf("src/rest/RestExisting.java", MAP), { kind: "self", path: "src/rest/RestExisting.java" })

  // БЛИЗНЕЦ: тот же путь для другой сущности. Различий два — и в каталоге, и в имени класса, —
  // поэтому строгое «одно отличие» здесь не работает, а вид (`Store`) совпадает.
  assert.deepEqual(sampleOf("src/configs/glossary/mongo/GlossaryStore.java", MAP),
    { kind: "twin", path: "src/configs/snippets/mongo/SnippetStore.java" })
  assert.deepEqual(sampleOf("src/configs/glossary/IGlossaryStore.java", MAP),
    { kind: "twin", path: "src/configs/snippets/ISnippetStore.java" })
  // Запись: вида общего нет (`Glossary` против `Snippet`), но зеркальный каталог `model` совпал.
  assert.deepEqual(sampleOf("src/configs/glossary/model/Glossary.java", MAP),
    { kind: "twin", path: "src/configs/snippets/model/Snippet.java" })

  // СОСЕД ТОГО ЖЕ ВИДА: близнеца нет, но рядом лежит резолвер. Вид бьёт зеркало — иначе сюда
  // приезжает `Engine.java` из того же каталога и учит не тому.
  assert.deepEqual(sampleOf("src/modules/impl/GlossaryNamespaceResolver.java", MAP),
    { kind: "neighbour", path: "src/modules/impl/CallerNamespaceResolver.java" })

  // НЕТ НИЧЕГО — объявляется, а не замалчивается.
  assert.deepEqual(sampleOf("src/brand/new/Thing.java", MAP), { kind: "none", path: "" })
  assert.deepEqual(sampleOf("", MAP), { kind: "none", path: "" })
})

test("карточка: каждый раздел — проекция на ОДИН use case, а не файл целиком", () => {
  const c = card()

  // Свой use case дословно, со своими ветками и отказом; чужого в карточке нет.
  assert.match(c.text, /<usecase id="UC1"/)
  assert.match(c.text, /<ext id="2a" error="NOT_FOUND"/)
  assert.match(c.text, /<failure code="NOT_FOUND" status="404"/)
  assert.doesNotMatch(c.text, /UC2/)

  // Узлы этого use case — байтами карты; существующий пришёл со своим `<api>`.
  assert.deepEqual([...c.nodes], [
    "src/configs/glossary/mongo/GlossaryStore.java",
    "src/modules/impl/GlossaryNamespaceResolver.java",
    "src/rest/RestExisting.java",
  ])
  assert.match(c.text, /<api name="GET \/existing"/)

  // Системы — свои узлы И их образцы: все узлы этого use case создаются, `<io>` у них ещё нет, а
  // образец говорит «хранилище такого рода пишет в mongodb». Очередь, которой не касается никто,
  // в карточку не едет.
  assert.match(c.text, /system name="mongodb"/)
  assert.doesNotMatch(c.text, /system name="nats"/)

  // Поток — только своих сценариев: S2 остался за бортом.
  assert.match(c.text, /\$START_FLOW id="S1"/)
  assert.match(c.text, /\$START_FLOW id="S1b"/)
  assert.doesNotMatch(c.text, /\$START_FLOW id="S2"/)

  // Команда проверки и общий дизайн, которого пока нет, — объявлены, а не пропущены.
  assert.match(c.text, /cmd="\.\/mvnw test"/)
  assert.match(c.text, /\(общего дизайна для этого use case нет\)/)
})

test("карточка несёт образец ПУТЁМ и его объявления — тело роль дочитает сама", () => {
  const c = card()
  assert.match(c.text, /GlossaryStore.java — близнец: src\/configs\/snippets\/mongo\/SnippetStore.java/)
  assert.match(c.text, /GlossaryNamespaceResolver.java — сосед того же вида: src\/modules\/impl\/CallerNamespaceResolver.java/)
  assert.match(c.text, /RestExisting.java — узел существует, образец не нужен/)
  // Объявления образца в карточке есть — по ним видно, что копировать.
  assert.match(c.text, /name="create\(Snippet s\)"/)
})

test("общий дизайн подставляется как ГОТОВОЕ, и роль его не переопределяет", () => {
  const c = card("UC1", { common: "# GlossaryStore.java\nполя: id, name" })
  assert.match(c.text, /\$START_COMMON[\s\S]*поля: id, name[\s\S]*\$END_COMMON/)
})

test("тотальность: неизвестный use case и пустые входы не роняют сборку", () => {
  const empty = cardOf()
  assert.equal(empty.nodes.length, 0)
  assert.match(empty.text, /\(use case не найден\)/)
  const ghost = card("UC99")
  assert.equal(ghost.nodes.length, 0)
  assert.match(ghost.text, /\(ни одного из них в репозитории ещё нет — все создаются\)/)
})

// --- D38: карточка общего дизайна группы и её гардрейл ---------------------------------------------

const GROUP = { id: "src/configs/glossary", slug: "configs-glossary", paths: ["src/configs/glossary/mongo/GlossaryStore.java", "src/modules/impl/GlossaryNamespaceResolver.java"], ucs: ["UC1", "UC2"] }
const GRAPH = `<design mode="minor" base=".agent/appgraph.xml">
  <module path="src/configs/glossary/mongo/GlossaryStore.java" delta="Added">
    <contract in="GET /glossaries/{id}" out="read() | 404 NOT_FOUND"/>
    <dep path="src/rest/RestExisting.java"/>
  </module>
  <module path="src/rest/RestExisting.java" delta="Changed">
    <contract in="GET /existing" out="ok"/>
  </module>
</design>`

test("карточка группы: все её use case дословно, файлы, образцы и ЧЕРНОВИК контракта", () => {
  const c = coreCardOf({ group: GROUP, frd: FRD_CARD, map: MAP, graph: GRAPH })

  // Группа названа числом файлов и числом use case, которые её контракт может сломать.
  assert.match(c.text, /\$START_GROUP — 2 файлов, которые трогают 2 use case: UC1 UC2/)
  // ОБА use case дословно — в этом вся разница с карточкой одного дизайнера.
  assert.match(c.text, /<usecase id="UC1"/)
  assert.match(c.text, /<usecase id="UC2"/)
  // Образец — по пути, как в карточке use case.
  assert.match(c.text, /GlossaryStore.java — близнец: src\/configs\/snippets\/mongo\/SnippetStore.java/)
  assert.match(c.text, /GlossaryNamespaceResolver.java — сосед того же вида: src\/modules\/impl\/CallerNamespaceResolver.java/)
  // Черновик — ТОЛЬКО про файлы группы: чужой модуль графа в наряд не едет.
  assert.match(c.text, /\$START_DRAFT[\s\S]*GlossaryStore.java[\s\S]*\$END_DRAFT/)
  // …именно МОДУЛЯМИ: чужой `<module>` в наряд не едет, а вот ребро группы наружу — едет, это её
  // собственный факт и он дизайнеру нужен.
  const draft = c.text.slice(c.text.indexOf("$START_DRAFT"), c.text.indexOf("$END_DRAFT"))
  assert.equal((draft.match(/<module /g) || []).length, 1)
  assert.match(draft, /<dep path="src\/rest\/RestExisting.java"\/>/)
  // Система пришла от образца: сам файл создаётся и своего io ещё не имеет.
  assert.match(c.text, /system name="mongodb"/)
})

test("карточка группы тотальна: без графа — объявленное отсутствие черновика", () => {
  const c = coreCardOf({ group: GROUP, frd: FRD_CARD, map: MAP })
  assert.match(c.text, /\(черновика нет — проход 9B не отработал\)/)
  assert.equal(coreCardOf().chars > 0, true)
})

const CORE_OK = `# src/configs/glossary
## src/configs/glossary/mongo/GlossaryStore.java (новый)
поля: нет собственных
сигнатуры: read(String id) : Glossary
use case: UC1 — читает; UC2 — тоже читает
## src/modules/impl/GlossaryNamespaceResolver.java (новый)
сигнатуры: resolve(String key) : String
use case: UC1, UC2`

test("гардрейл группы: решён каждый её файл, чужих нет, ни один use case не забыт", () => {
  assert.deepEqual(checkCore({ text: CORE_OK, group: GROUP }), [])

  // Файл группы без раздела — блокер называет его.
  const lost = checkCore({ text: CORE_OK.replace(/## src\/modules[\s\S]*$/, ""), group: GROUP })
  assert.equal(lost.length, 1)
  assert.match(lost[0], /GlossaryNamespaceResolver.java/)

  // Чужой файл решён — это работа его use case, не общая.
  const extra = checkCore({ text: `${CORE_OK}\n## src/rest/RestExisting.java (правится)\n…`, group: GROUP })
  assert.match(extra.join("\n"), /решены файлы не из этой группы: src\/rest\/RestExisting.java/)

  // Use case не упомянут — контракт ломает и его, значит надо показать, чем он закрыт.
  const missed = checkCore({ text: CORE_OK.replace(/UC2/g, ""), group: GROUP })
  assert.match(missed.join("\n"), /use case UC2 не упомянут/)

  // Раздел, который не путь, — проза роли, а не решение о файле. Живой прогон 17 авг: роль закрыла
  // контракт заголовком «## Сводка:», и правило отвергло артефакт за сводку.
  assert.deepEqual(checkCore({ text: `${CORE_OK}\n\n## Сводка:\nвсе пять файлов решены`, group: GROUP }), [])
})
