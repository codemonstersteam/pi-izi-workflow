// Швы шага 9D. Предмет — сборка: волны из `needs`, дословная величина, отсутствие заглушек.
import test from "node:test"
import assert from "node:assert/strict"
import { BANNED, wavesOf, planDoc, checkBook } from "./book.mjs"
import { parseFrd } from "../../intake/frd.mjs"

const FRD = parseFrd(`<frd grammar="1" goal="store documents">
  <usecase id="UC1" actor="client" goal="store a document">
    <pre>up</pre><post>stored</post>
    <step n="1">client sends POST /store</step>
    <step n="2">system stores the document</step>
    <ext id="1a" error="NAME_INVALID" outcome="rejected"/>
  </usecase>
  <field name="name" in="Doc" type="string" domain="pattern ^[a-z]+$" required="yes" error="NAME_INVALID" source="brd.md (R1)"/>
  <failure code="NAME_INVALID" status="400" client="rejected" operator="check the name" from="UC1/1a"/>
  <nfr subject="doc-cache-ttl" fit="5 minutes" source="brd.md (R7)"/>
  <delta op="POST /store" form="Added" node="src/rest/RestStore.java" new="yes" from="none" to="door"/>
  <scenario id="S1" uc="UC1" before="absent" after="present" nodes="src/rest/RestStore.java src/mongo/Store.java src/model/Doc.java"/>
</frd>`)

const TREE = `<tree task="T" goal="store documents">
  <module path="src/model/Doc.java" delta="Added" io="none">
    <hides>форма записи</hides><owns type="Doc"/><twin kind="twin" path="src/model/Old.java"></twin>
    <needs></needs>
    <contract><sig>public class Doc</sig><pre>нет</pre><post>поля name</post><fail>нет</fail></contract>
  </module>
  <module path="src/mongo/Store.java" delta="Added" io="db">
    <hides>хранение и проверка имени</hides><owns type=""/><twin kind="twin" path="src/mongo/OldStore.java"></twin>
    <needs><need path="src/model/Doc.java" why="параметр типа"/></needs>
    <contract><sig>public class Store</sig><pre>монго доступна</pre><post>записан (UC1/2)</post><fail>NAME_INVALID</fail></contract>
  </module>
  <module path="src/rest/RestStore.java" delta="Added" io="http">
    <hides>перевод HTTP в вызов хранилища</hides><owns type=""/><twin kind="twin" path="src/rest/OldRest.java"></twin>
    <needs><need path="src/mongo/Store.java" why="делегирует"/><need path="src/model/Doc.java" why="тип тела"/></needs>
    <contract><sig>public class RestStore</sig><pre>тело разобрано</pre><post>201 (UC1/1)</post><fail>нет</fail></contract>
  </module>
</tree>`

const FLOWS = `<flows task="T">
  <flow id="UC1" uc="UC1" goal="store">
    <step n="1" module="src/rest/RestStore.java" in="POST /store (doc)" out="Doc (черновик)" role="порождаю" closes="UC1/1"/>
    <step n="2" module="src/mongo/Store.java" in="Doc (черновик)" out="Doc (записан)" role="порождаю" closes="UC1/2"/>
  </flow>
  <flow id="UC11a" uc="UC1" branch="1a" goal="NAME_INVALID">
    <step n="1" module="src/mongo/Store.java" in="Doc (черновик)" out="NAME_INVALID" role="отвергаю" closes="UC1/1a"/>
    <step n="2" module="src/rest/RestStore.java" in="NAME_INVALID" out="400 NAME_INVALID" role="порождаю" closes="UC1/1a"/>
  </flow>
</flows>`

const DEC = `# Решения

## Как проверяется имя
ответ: проверка живёт в хранилище
опора: src/mongo/OldStore.java:44
маршрут: repo
чем: у близнеца проверка стоит там же
`

// ВОЛНА — ЭТО «МОЖНО ПИСАТЬ ОДНОВРЕМЕННО». Всё, без чего модуль не написать, лежит строго раньше.
test("волны считаются по needs: объявления первыми, потребители следом", () => {
  const { waves, cycle } = wavesOf({ tree: TREE })
  assert.deepEqual(cycle, [])
  assert.deepEqual(waves, [["src/model/Doc.java"], ["src/mongo/Store.java"], ["src/rest/RestStore.java"]])

  const circle = TREE.replace('<needs></needs>', '<needs><need path="src/rest/RestStore.java" why="ошибка"/></needs>')
  const c = wavesOf({ tree: circle })
  assert.equal(c.waves.length, 0, "круг обязан оставить волны пустыми — по нему работать нельзя")
  assert.ok(c.cycle.length, "круг не назван путём")

  assert.deepEqual(wavesOf({}).waves, [], "пустое дерево — пустые волны, а не бросок")
})

// ДОКУМЕНТ СОБИРАЕТСЯ, А НЕ СОЧИНЯЕТСЯ: каждая его строка — вырезка из дерева, потоков и требования.
test("план: волны, общие ограничения дословно, шаги и отказы по модулям, журнал решений", () => {
  const doc = planDoc({ frd: FRD, tree: TREE, flows: FLOWS, decisions: DEC, key: "DOS-1" })

  assert.match(doc, /## Волна 1[\s\S]*Doc\.java/, "первой волной идёт не объявление")
  assert.ok(doc.indexOf("Волна 2") < doc.indexOf("RestStore.java"), "потребитель встал раньше того, без чего его не написать")

  assert.match(doc, /величина `doc-cache-ttl` = `5 minutes`/, "величина не доехала дословно")
  assert.match(doc, /отказ `NAME_INVALID` → статус `400`/)
  assert.match(doc, /поле `name` в `Doc`: pattern \^\[a-z\]\+\$ иначе `NAME_INVALID`/)

  assert.match(doc, /закрывает шаги: UC1\/2 · UC1\/1a/, "шаги модуля берутся из потоков")
  assert.match(doc, /порождает отказы: `NAME_INVALID` → 400/)
  assert.match(doc, /без чего не написать: ни от чего не зависит, пишется первым/)
  assert.match(doc, /Как проверяется имя \| проверка живёт в хранилище \| `src\/mongo\/OldStore.java:44` \| repo/)

  assert.match(planDoc({ frd: FRD, tree: TREE, flows: FLOWS, key: "DOS-1" }), /Ни одного: требование ответило на всё само/)
})

// СБОРЩИК ДЕТЕРМИНИРОВАН — ЭТИ ПРОВЕРКИ СТОРОЖАТ ЕГО ВХОД.
test("сборка сверяется с тем, из чего собрана: модуль, величина, код отказа, заглушка", () => {
  const doc = planDoc({ frd: FRD, tree: TREE, flows: FLOWS, decisions: DEC, key: "DOS-1" })
  assert.deepEqual(checkBook({ plan: doc, frd: FRD, tree: TREE }), [])

  assert.match(checkBook({ plan: doc.replace(/src\/model\/Doc\.java/g, "х"), frd: FRD, tree: TREE }).join("\n"), /Doc\.java есть в дереве, но в плане о нём ни строки/)
  assert.match(checkBook({ plan: doc.replace("5 minutes", "пять минут"), frd: FRD, tree: TREE }).join("\n"), /исполнитель поставит своё число/)
  assert.match(checkBook({ plan: doc.replace(/NAME_INVALID/g, "ошибка"), frd: FRD, tree: TREE }).join("\n"), /в плане не назван/)

  // ЗАГЛУШКА. Список — приём superpowers, и он краснит, а не советует.
  assert.ok(BANNED.length >= 8, "список запрещённых фраз усох")
  assert.match(checkBook({ plan: `${doc}\n- TODO: остальное по аналогии с волной 1`, frd: FRD, tree: TREE }).join("\n"), /стоит заглушка «TODO»/)
})
