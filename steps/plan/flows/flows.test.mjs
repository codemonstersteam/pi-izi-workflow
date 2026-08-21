// Швы шага 9C. Предмет — ПОКРЫТИЕ требования потоком и сходимость значений; порядок работ здесь не
// судится вовсе, он живёт в `needs` дерева.
import test from "node:test"
import assert from "node:assert/strict"
import { ROLES, flowsSkeleton, parseFlows, checkFlows } from "./flows.mjs"
import { parseFrd } from "../../intake/frd.mjs"

const FRD = parseFrd(`<frd grammar="1" goal="store documents">
  <usecase id="UC1" actor="client" goal="store a document">
    <pre>up</pre><post>stored</post>
    <step n="1">client sends POST /store</step>
    <step n="2">system stores the document</step>
    <ext id="1a" error="NAME_INVALID" outcome="rejected"/>
  </usecase>
  <failure code="NAME_INVALID" status="400" client="rejected" operator="check the name" from="UC1/1a"/>
  <delta op="POST /store" form="Added" node="src/rest/RestStore.java" new="yes" from="none" to="door"/>
  <scenario id="S1" uc="UC1" before="absent" after="present" nodes="src/rest/RestStore.java src/mongo/Store.java"/>
</frd>`)

const TREE = `<tree task="T" goal="g">
  <module path="src/rest/RestStore.java" delta="Added" io="http">
    <hides>дверь</hides><owns type=""/>
    <needs><need path="src/mongo/Store.java" why="делегирует"/><need path="src/model/Doc.java" why="тип тела"/></needs>
    <contract><sig>public class RestStore</sig><pre>нет</pre><post>200</post><fail>нет</fail></contract>
  </module>
  <module path="src/mongo/Store.java" delta="Added" io="db">
    <hides>хранение</hides><owns type=""/>
    <needs><need path="src/model/Doc.java" why="тип"/></needs>
    <contract><sig>public class Store</sig><pre>монго доступна</pre><post>записан</post><fail>NAME_INVALID</fail></contract>
  </module>
  <module path="src/model/Doc.java" delta="Added" io="none">
    <hides>форма записи</hides><owns type="Doc"/>
    <needs></needs>
    <contract><sig>public class Doc</sig><pre>нет</pre><post>поля</post><fail>нет</fail></contract>
  </module>
</tree>`

const flow = (rows) => `<flows task="T">\n${rows}\n</flows>\n`
const GREEN = flow(`  <flow id="UC1" uc="UC1" goal="store">
    <step n="1" module="src/rest/RestStore.java" in="POST /store (doc)" out="Doc (черновик)" role="порождаю" closes="UC1/1"/>
    <step n="2" module="src/mongo/Store.java" in="Doc (черновик)" out="Doc (записан)" role="порождаю" closes="UC1/2"/>
    <step n="3" module="src/rest/RestStore.java" in="Doc (записан)" out="201 (id)" role="порождаю" closes="UC1/2"/>
  </flow>
  <flow id="UC11a" uc="UC1" branch="1a" goal="NAME_INVALID">
    <step n="1" module="src/mongo/Store.java" in="Doc (черновик)" out="NAME_INVALID" role="отвергаю" closes="UC1/1a"/>
    <step n="2" module="src/rest/RestStore.java" in="NAME_INVALID" out="400 NAME_INVALID" role="порождаю" closes="UC1/1a"/>
  </flow>`)

const one = (text) => checkFlows({ text, frd: FRD, tree: TREE, only: "UC1", portion: true })
const all = (text) => checkFlows({ text, frd: FRD, tree: TREE, whole: true })

// СКЕЛЕТ СТАВИТ НОМЕР ШАГА САМ: цитата требования, набранная ролью руками, однажды приехала
// кириллической «2а» вместо латинской «2a», и покрытие стало ложью.
test("скелет: поток на use case и на каждое ветвление, closes проставлен скриптом", () => {
  const s = flowsSkeleton({ frd: FRD })
  assert.equal(s.flows, 2, "ветвление не получило своего потока")
  assert.equal(s.steps, 3, "строк меньше, чем шагов требования")
  const { flows } = parseFlows(s.xml)
  assert.deepEqual(flows.flatMap((f) => f.steps.map((x) => x.closes)), ["UC1/1", "UC1/2", "UC1/1a"])
  assert.equal(flows[1].branch, "1a")
  assert.equal(flows[0].steps.every((x) => !x.module && !x.in && !x.out), true, "скелет решил за роль")
  assert.equal(flows[1].steps[0].role, "отвергаю", "ветвление — это всегда отказ, и скрипт это знает")
})

// ПОРЦИЯ ОТВЕЧАЕТ ЗА СВОЙ USE CASE И БОЛЬШЕ НИ ЗА ЧТО.
test("порция: все шаги и ветвления закрыты, модуль из дерева, роль из словаря", () => {
  assert.deepEqual(one(GREEN), [])

  const lost = flow(`  <flow id="UC1" uc="UC1" goal="store">
    <step n="1" module="src/rest/RestStore.java" in="POST /store (doc)" out="Doc (черновик)" role="порождаю" closes="UC1/1"/>
  </flow>`)
  const b = one(lost).join("\n")
  assert.match(b, /шаг UC1 шаг 2 требования не закрыт/)
  assert.match(b, /шаг UC1 шаг 1a требования не закрыт/)

  assert.match(one(GREEN.replace('module="src/mongo/Store.java" in="Doc (черновик)" out="Doc (записан)"', 'module="src/nope/X.java" in="Doc (черновик)" out="Doc (записан)"')).join("\n"),
    /называет модуль src\/nope\/X.java, которого нет в дереве/)
  assert.match(one(GREEN.replace('role="проношу"', 'role="передаю"').replace('role="порождаю" closes="UC1\/1"', 'role="creates" closes="UC1/1"')).join("\n"),
    new RegExp(ROLES.join(" · ")))
  assert.match(one(GREEN.replace('out="Doc (записан)"', 'out=""')).join("\n"), /пуст out/)
})

// ЦЕЛОЕ: СХОДИМОСТЬ ЗНАЧЕНИЙ, КОТОРУЮ ПОРЦИЯ УВИДЕТЬ НЕ МОЖЕТ.
test("целое: один порождающий на значение, вход порождён или внешний, отказ доехал до статуса", () => {
  assert.deepEqual(all(GREEN), [])

  // ДВОЕ ПОРОЖДАЮЩИХ — ЭТО РАЗНЫЕ МОДУЛИ. Тот же модуль, порождающий значение в двух потоках, —
  // одно и то же место в коде, и это законно.
  const twice = GREEN.replace('in="Doc (черновик)" out="Doc (записан)"', 'in="Doc (черновик)" out="Doc (черновик)"')
  assert.match(all(twice).join("\n"), /порождают 2 модуля/)

  const orphanIn = GREEN.replace('in="Doc (записан)"', 'in="Doc (сохранён)"')
  assert.match(all(orphanIn).join("\n"), /никто не порождает и оно не входит извне/)

  const noCode = GREEN.replace('out="NAME_INVALID" role="отвергаю"', 'out="ошибка" role="отвергаю"')
  assert.match(all(noCode).join("\n"), /код отказа NAME_INVALID .* ни одна строка его не порождает/s)

  const noStatus = GREEN.replace('out="400 NAME_INVALID"', 'out="ответ клиенту"')
  assert.match(all(noStatus).join("\n"), /нигде не превращается в статус 400/)
})

// ОБЪЯВЛЕНИЕ ДОКАЗЫВАЕТСЯ `needs`, А НЕ УЧАСТИЕМ В ПОТОКЕ.
test("целое: модель данных вне потоков — не дефект, пока до неё дотягивается needs", () => {
  assert.deepEqual(all(GREEN), [], "Doc.java в потоке не участвует и краснеть не должен")

  const cut = TREE.replace('<needs><need path="src/model/Doc.java" why="тип"/></needs>', "<needs></needs>")
    .replace('<need path="src/model/Doc.java" why="тип тела"/>', "")
  assert.match(checkFlows({ text: GREEN, frd: FRD, tree: cut, whole: true }).join("\n"),
    /src\/model\/Doc.java не работают ни в одном потоке, и до них не дотягивается needs/)
})

// СЛОВАРЬ ГРАНИЦЫ ДОЛЖЕН КЕМ-ТО ЧИТАТЬСЯ. Шаг 9A пишет values.xml, и до 21.08.2026 его не читал
// НИКТО: подшаг был мёртвым грузом, а роль потока называла адреса и статусы своей рукой, совпадая со
// словарём только по удаче. Внутренние значения словарём не судятся — их судит «один порождающий».
test("граница пишется словом из словаря, внутреннее значение — как угодно", () => {
  const VALUES = `<values grammar="2">
    <value id="v1" text="POST /store (doc)"/>
    <value id="v2" text="201 (id)"/>
    <value id="v3" text="NAME_INVALID"/>
    <value id="v4" text="400 NAME_INVALID"/>
  </values>`
  const withDict = (text) => checkFlows({ text, frd: FRD, tree: TREE, values: VALUES, whole: true })

  assert.deepEqual(withDict(GREEN), [], "зелёный поток покраснел от словаря: «Doc (черновик)» это ВНУТРЕННЕЕ значение")

  // Написание разъехалось — блокер обязан показать, КАК пишет словарь.
  const drift = GREEN.replace('in="POST /store (doc)"', 'in="POST /store(doc)"')
  const b = withDict(drift).join("\n")
  assert.match(b, /словарь границы пишет это же значение как «POST \/store \(doc\)»/)

  // Адрес, которого в словаре нет вовсе.
  const alien = GREEN.replace('out="201 (id)"', 'out="202 (accepted)"')
  assert.match(withDict(alien).join("\n"), /смотрит наружу, но такого значения нет в словаре границы/)

  // ГОЛЫЙ КОД ОТКАЗА — ВНУТРЕННЕЕ ЗНАЧЕНИЕ, и словарём он не судится. Он рождается в хранилище и
  // едет к тому, кто отвечает наружу; наружу выходит уже «400 NAME_INVALID», и только эта форма
  // стоит в словаре. Первая версия правила требовала взять из словаря то, чего там нет.
  assert.deepEqual(withDict(GREEN).filter((b) => b.includes("NAME_INVALID") && !b.includes("400")), [],
    "голый код отказа объявлен границей — правило требует того, чего в словаре нет по построению")

  // Один блокер на значение, а не на каждое его вхождение: роль чинит значение, а не строки.
  const twice = GREEN.replace(/201 \(id\)/g, "202 (accepted)")
  assert.equal(withDict(twice).filter((b) => b.includes("202 (accepted)")).length, 1, "блокер задвоился")

  // Без словаря правило МОЛЧИТ — судить не по чему, та же дисциплина, что у правила про модули.
  assert.deepEqual(checkFlows({ text: GREEN, frd: FRD, tree: TREE, whole: true }), [])
})
