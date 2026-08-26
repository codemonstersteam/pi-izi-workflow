// Units of the ticket cutter's pure core. By the formula of standards/code.md:
//     N = 1 happy path + Σ antecedent branches with a DISTINGUISHABLE consequent + 1 silence
import test from "node:test"
import assert from "node:assert/strict"
import { cutTickets } from "./tickets.mjs"

const TREE = `<tree task="" goal="g">
  <module path="src/model/Glossary.java" delta="Added" io="">
    <hides>поля и сериализация</hides>
    <twin kind="twin" path="src/model/PromptSnippet.java" candidates="src/model/PromptSnippet.java"></twin>
    <contract><sig>public class Glossary</sig><pre>нет</pre><post>создан с version=1</post><fail>нет</fail></contract>
  </module>
  <module path="src/Store.java" delta="Added" io="db">
    <needs><need path="src/model/Glossary.java" why="тип параметра"/></needs>
    <contract><sig>public class Store</sig></contract>
  </module>
  <module path="src/Rest.java" delta="Changed" io="http">
    <needs><need path="src/Store.java" why="вызывает"/><need path="src/pom.xml" why="существующий файл репозитория"/></needs>
    <contract><sig>public class Rest</sig></contract>
  </module>
</tree>`

const FLOWS = `<flows task="">
  <flow id="UC1" uc="UC1" goal="создать">
    <step n="1" module="src/Rest.java" in="POST" out="черновик" role="порождаю" closes="UC1/1"/>
    <step n="2" module="src/Store.java" in="черновик" out="создан" role="порождаю" closes="UC1/2"/>
  </flow>
</flows>`

test("волны по needs внутри дерева; need на существующий файл репозитория — не работа", () => {
  const { files, waves, cycleNote } = cutTickets({ treeXml: TREE, flowsXml: FLOWS })
  assert.equal(cycleNote, "")
  assert.equal(waves.length, 3, `три волны: Glossary → Store → Rest, got ${JSON.stringify(waves)}`)
  assert.deepEqual(waves, [["src/model/Glossary.java"], ["src/Store.java"], ["src/Rest.java"]])
  assert.equal(files.length, 4, "три тикета + README")

  const rest = files.find((f) => f.name.startsWith("03-"))
  assert.match(rest.text, /дельта|Дельта/)
  assert.match(rest.text, /Changed — файл СУЩЕСТВУЕТ: правь его, НЕ создавай новый/)
  assert.match(rest.text, /Тикет 02 — Store\.java: вызывает/, "нужды ссылаются номерами тикетов")
  assert.doesNotMatch(rest.text, /pom\.xml/, "need на существующий файл репозитория не заказывает работу")
  assert.match(rest.text, /UC1\/1.*POST → черновик/, "поток модуля выписан строкой")
})

test("Added диктует глагол создания; twin и owns отсутствуют — разделы говорят «нет», не выдумывают", () => {
  const { files } = cutTickets({ treeXml: TREE, flowsXml: "" })
  const store = files.find((f) => f.name.startsWith("02-"))
  assert.match(store.text, /Added — файла НЕТ, создаётся этим тикетом/)
  assert.match(store.text, /Образец \(twin\):\*\* нет — пиши по контракту/)
  assert.doesNotMatch(store.text, /## Потоки/, "flows.xml пуст — раздела потоков нет, а не пустой раздел")
})

test("цикл в needs не отказ: остаток едет одной волной с пометкой", () => {
  const cycle = `<tree><module path="src/A.java" delta="Added"><needs><need path="src/B.java" why="x"/></needs></module>
  <module path="src/B.java" delta="Added"><needs><need path="src/A.java" why="y"/></needs></module></tree>`
  const { waves, cycleNote } = cutTickets({ treeXml: cycle })
  assert.equal(waves.length, 1)
  assert.match(cycleNote, /цикл в needs: A\.java ← B\.java/)
})

test("SILENCE: пустое дерево — пустая нарезка, не бросок", () => {
  assert.deepEqual(cutTickets({ treeXml: "", flowsXml: "" }).files.map((f) => f.name), ["README.md"])
})
