// Ядро шага 9 — ЧИСТОЕ; его io живёт в ext/index.mjs (standards/code.md: труба io не покрывается
// юнитом). Формула: 1 happy + Σ ветвей антецедента с РАЗЛИЧИМЫМ следствием. Ветви здесь — три формы,
// которые может принять изменение (модуль существует, модуль создаётся, партий несколько), плюс пять
// правил гардрейла партии.
//
// The FRD fixture is PARSED, not typed: `frd` reaches this core exactly as steps/intake/frd.mjs hands
// it over.

import test from "node:test"
import assert from "node:assert/strict"
import { partsOf, sampleOf, partCardOf, sectionsOf, checkPart } from "./card.mjs"
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

// --- D44: дерево модулей и партии ------------------------------------------------------------------
// Рябь той же формы, что живая: модуль ЕСТЬ в ней только если файл существует. На `eddi` рябь знает
// 6 модулей из 13 — остальные создаются, и состав изменения приходится брать из FRD.
const RIPPLE_TREE = `<ripple>
  <module path="src/rest/RestStore.java" level="2">
    <role>REST-точка хранилища</role>
    <dep path="src/IStore.java"/>
    <dep path="src/common/Base.java"/>
  </module>
  <module path="src/export/RestExport.java" level="1">
    <role>выгрузка</role>
    <dep path="src/common/Base.java"/>
  </module>
</ripple>`

test("дерево: состав из FRD, факты из ряби — создаваемый модуль не теряется", () => {
  const { modules } = partsOf({ frd: FRD, ripple: RIPPLE_TREE })

  // Все семь модулей изменения на месте, хотя рябь знает только два.
  assert.equal(modules.size, 7)
  const rest = modules.get("src/rest/RestStore.java")
  assert.equal(rest.new, false, "рябь его знает — файл существует")
  assert.deepEqual(rest.deps, ["src/IStore.java", "src/common/Base.java"])
  assert.deepEqual(rest.ucs, ["UC1", "UC2", "UC3"])

  const doc = modules.get("src/model/Doc.java")
  assert.equal(doc.new, true, "ряби неизвестен — создаётся")
  assert.deepEqual(doc.deps, [], "у создаваемого файла зависимостей быть не может")

  // Возьми состав из РЯБИ — и потеряешь пять модулей из семи. Ради этого правила тест и стоит.
  assert.equal([...modules.values()].filter((m) => m.new).length, 5)
})

test("партии: модуль ровно в одной — это и есть невозможность дубля", () => {
  const { modules, parts } = partsOf({ frd: FRD, ripple: RIPPLE_TREE })

  // Две партии: хранилище (UC1-UC3) и выгрузка (UC9, UC10).
  assert.equal(parts.length, 2)
  assert.deepEqual([...parts[0].ucs], ["UC1", "UC2", "UC3"])
  assert.deepEqual([...parts[1].ucs], ["UC9", "UC10"])

  // ИНВАРИАНТ: сумма модулей партий равна числу модулей, пересечений нет.
  const all = parts.flatMap((p) => [...p.modules])
  assert.equal(all.length, modules.size)
  assert.equal(new Set(all).size, all.length, "модуль не может попасть в две партии")

  // Соседи — то, что партия зовёт, но НЕ решает: чужой файл в список модулей не попадает.
  assert.deepEqual([...parts[0].neighbours], ["src/common/Base.java"])
  assert.equal(parts[0].modules.includes("src/common/Base.java"), false)

  // Slug именует артефакты партии и выводится из путей, а не выдумывается.
  assert.equal(parts[1].slug, "src-export")
})

test("партия несёт СВОИХ соседей в карточку, и раздела по ним нет", () => {
  const { parts } = partsOf({ frd: FRD, ripple: RIPPLE_TREE })
  const c = partCardOf({ part: parts[0], frd: FRD, map: MAP })
  assert.match(c.text, /\$START_NEIGHBOURS/)
  assert.match(c.text, /src\/common\/Base\.java/)
  // Партия, все модули которой создаются, соседей иметь не может — и объявляет это словами.
  const { parts: noRipple } = partsOf({ frd: FRD })
  const alone = partCardOf({ part: noRipple[0], frd: FRD, map: MAP })
  assert.match(alone.text, /рябь зависимостей не знает/)
})

test("тотальность дерева: без FRD и без ряби — пусто, и ничего не брошено", () => {
  const t = partsOf()
  assert.equal(t.modules.size, 0)
  assert.equal(t.parts.length, 0)
  assert.equal(partsOf({ frd: FRD }).parts.length, 2, "без ряби партии те же — состав даёт FRD")
})

// --- D45: гардрейл партии — пять правил ------------------------------------------------------------
const PART = {
  id: "src", slug: "src-rest",
  modules: ["src/rest/RestStore.java", "src/model/Doc.java"],
  ucs: ["UC1", "UC2"],
  // Номера шагов приезжают в партию из FRD — по ним правило 3 судит, что «закрывает» ссылается
  // на существующий шаг, а не на выдуманный и не на тот же номер другой буквой.
  steps: ["UC1/1", "UC1/2a", "UC2/1"],
  neighbours: ["src/common/Base.java"],
}
const KNOWN = ["src/common/Base.java", "src/model/Doc.java", "src/rest/RestSnippets.java"]

const GREEN_PART = `# src — хранилище

## src/rest/RestStore.java  (новый)
что это: REST-точка хранилища
сигнатуры: create(Doc doc) : IResourceId
зовёт: src/model/Doc.java — принимает и отдаёт запись
по образцу: src/rest/RestSnippets.java — @Path, @ApplicationScoped
закрывает: UC1 шаг 1 · UC2 шаг 1
проверка: ./mvnw test -Dtest=RestStoreTest · RestStoreTest

## src/model/Doc.java  (новый)
что это: запись хранилища
поля: name: String — имя записи
зовёт: нет
закрывает: UC1 шаг 1
проверка: ./mvnw test -Dtest=DocTest · DocTest
`
const part = (text) => checkPart({ text, part: PART, known: KNOWN })

test("гардрейл партии: решён каждый модуль, чужих нет, use case закрыты, есть чем проверить и что звать", () => {
  assert.deepEqual(part(GREEN_PART), [])

  // 1 — модуль партии без раздела: работа потеряна.
  assert.match(part(GREEN_PART.replace(/## src\/model[\s\S]*$/, "")).join("\n"),
    /нет решения по модулям: src\/model\/Doc.java/)

  // 2 — чужой модуль: его решает свой вызов, и раздел по СОСЕДУ тоже чужой.
  assert.match(part(`${GREEN_PART}\n## src/common/Base.java (правится)\nзовёт: нет\nзакрывает: UC1 шаг 1\nпроверка: x · Y\n`).join("\n"),
    /решены модули не из этой партии: src\/common\/Base.java/)

  // 3 — use case, который ничем не закрыт: требование потеряно молча.
  assert.match(part(GREEN_PART.replace(" · UC2 шаг 1", "")).join("\n"),
    /use case UC2 не закрыт ни одним разделом/)

  // 4а — раздел без «проверки»: тикет нечем закрыть (прогон d8ef8c60).
  assert.match(part(GREEN_PART.replace("проверка: ./mvnw test -Dtest=DocTest · DocTest", "")).join("\n"),
    /у разделов src\/model\/Doc.java нет строки «проверка/)

  // 4б — раздел без «зовёт»: порядок работ строить не из чего. Замер на живых контрактах: 8 разделов
  // дали 2 ребра, потому что строка была необязательной.
  assert.match(part(GREEN_PART.replace("зовёт: нет\n", "")).join("\n"),
    /у разделов src\/model\/Doc.java нет строки «зовёт/)

  // 5 — «зовёт» на файл, которого нет нигде: адрес, который никуда не ведёт.
  assert.match(part(GREEN_PART.replace("зовёт: src/model/Doc.java — принимает и отдаёт запись", "зовёт: src/ghost/Nope.java — выдумка")).join("\n"),
    /ссылается на src\/ghost\/Nope.java/)

  // Проза разделом не считается — то же правило, что у контракта группы (прогон 17 авг, «## Сводка:»).
  assert.deepEqual(part(`${GREEN_PART}\n## Итог:\nдва модуля`), [])
})

test("разбор партии один на двоих: гардрейл и сборка PLAN.md читают одно и то же", () => {
  const s = sectionsOf(GREEN_PART)
  assert.deepEqual(s.map((x) => x.path), PART.modules)
  // Рёбра порядка работ — из строки «зовёт», и «нет» даёт пустой список, а не отсутствие строки.
  assert.deepEqual([...s[0].calls], ["src/model/Doc.java"])
  assert.deepEqual([...s[1].calls], [])
  assert.equal(s[1].says, true, "«нет» — это ответ")
  // Закрытые шаги — с номерами: по ним фаза ⑥ считает полноту.
  assert.deepEqual([...s[0].closes], ["UC1/1", "UC2/1"])
})
