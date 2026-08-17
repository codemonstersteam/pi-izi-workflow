// Pass B of the slice `design`: the chains — a PURE core; its io lives in ext/index.mjs
// (standards/code.md: an io pipe is not unit-tested). Formula: 1 happy + Σ antecedent branches with a
// DISTINGUISHABLE consequent. The branches are what the role can do wrong to a green skeleton (a row
// lost or added, a start/finish moved, a step through an alien node, a value outside the dictionary,
// a chain that stops short of its end, a set of chains whose order does not exist) plus the two
// decisions the skeleton itself makes (one chain per END, the entry taken from the dictionary).
//
// The fixtures are PARSED, never typed: the FRD arrives as steps/intake/frd.mjs hands it over and the
// dictionary as pass A wrote it, so a change to either grammar reddens here instead of drifting.

import test from "node:test"
import assert from "node:assert/strict"
import { routesSkeleton, parseChains, checkChains, assemble } from "./routes.mjs"
import { parseValues, valuesSkeleton } from "./values.mjs"
import { parseDesign, parseRoutes, expand, unitsByPath } from "./design.mjs"
import { parseFrd } from "../intake/frd.mjs"

// Two nodes and one use case with a failure branch: the smallest change that has a JOINT (the page
// hands the call to the resource) and TWO ends (a card and a 404). Everything this pass decides is
// visible on it.
const FRD_XML = `<frd grammar="1" goal="карточка фрукта по имени">
  <usecase id="UC1" actor="user" goal="открыть карточку фрукта">
    <post>карточка фрукта отрисована</post>
    <step n="1">пользователь выбирает фрукт в списке</step>
    <ext id="2a" error="FRUIT_NOT_FOUND" outcome="карточка не отрисована, показана ошибка"/>
  </usecase>
  <delta op="GET /fruits/{name}" form="Added" node="src/FruitResource.java" from="одиночного фрукта нет" to="фрукт по имени"/>
  <delta op="карточка" form="Changed" node="src/fruits.html" from="только список" to="список и карточка"/>
  <scenario id="S1" uc="UC1" before="карточки нет" after="карточка открывается" nodes="src/fruits.html src/FruitResource.java"/>
  <failure code="FRUIT_NOT_FOUND" status="404" client="показать ошибку" operator="—" from="UC1/2a"/>
</frd>`

const RIPPLE = `<ripple grammar="1" mode="minor" seeds="2" nodes="2">
  <module path="src/FruitResource.java" pkg="src" component="rest" level="1" seed="yes" cut="no">
    <role>REST-ресурс фруктов</role>
    <api name="GET /fruits" kind="http" scope="public" via="jaxrs"/>
    <dep path="src/Fruit.java"/>
  </module>
  <module path="src/fruits.html" pkg="src" component="ui" level="1" seed="yes" cut="no">
    <role>страница списка</role>
  </module>
</ripple>`

const FRD = parseFrd(FRD_XML)
// The dictionary as pass A leaves it: the skeleton with its blanks named. Written as a FUNCTION of
// pass A on purpose — a hand-typed dictionary would stop being pass A's output the day it moved.
const VALUES = parseValues(valuesSkeleton({ frd: FRD, ripple: RIPPLE }).xml
  .replace('closes="UC1/in" side="in" text=""', 'closes="UC1/in" side="in" text="Выбор(name)"')
  .replace('closes="UC1/post" side="out" text=""', 'closes="UC1/post" side="out" text="Карточка(name,description)"'))

const skeleton = () => routesSkeleton({ frd: FRD, values: VALUES })
const chainsOf = (xml) => parseChains(xml)
const blockersOf = (staged, edges = []) => checkChains({ staged, frd: FRD, values: VALUES, edges })

// The ids the dictionary gave: v1 = вход UC1, v2 = карточка (UC1/post), v3 = 404 (UC1/2a),
// v4/v5 = операции дельт, v6 = вызов из ряби.
const V = (text) => [...VALUES].find(([, t]) => t === text)[0]
const IN = V("Выбор(name)"), CARD = V("Карточка(name,description)"), NF = V("404 FRUIT_NOT_FOUND")
const OP = V("GET /fruits/{name}")

const GREEN = skeleton().xml
  .replace('id="S1" scenario="S1" uc="UC1" end="UC1/post"', 'id="S1" scenario="S1" uc="UC1" end="UC1/post"')
  .replace(/(id="S1"[^>]*?)steps=""/, `$1steps="src/fruits.html@${OP} -> src/FruitResource.java@${CARD} -> src/fruits.html@${CARD}"`)
  .replace(/(id="S1b"[^>]*?)steps=""/, `$1steps="src/fruits.html@${OP} -> src/FruitResource.java@${NF} -> src/fruits.html@${NF}"`)

test("happy: скелет даёт цепочку на КАЖДЫЙ конец, роль проводит её — зелено", () => {
  const s = skeleton()
  // Один сценарий, два выходных конца use case — две цепочки, и вторая названа буквой.
  assert.equal(s.chains, 2)
  const [a, b] = chainsOf(s.xml)
  assert.deepEqual([a.id, b.id], ["S1", "S1b"])
  // Начало и конец даёт СЛОВАРЬ: роль их не выбирает.
  assert.deepEqual([a.entry, a.exit, a.end], [IN, CARD, "UC1/post"])
  assert.deepEqual([b.entry, b.exit, b.end], [IN, NF, "UC1/2a"])
  assert.deepEqual(a.nodes, ["src/fruits.html", "src/FruitResource.java"])
  assert.equal(a.steps.length, 0)

  assert.deepEqual(blockersOf(GREEN), [])
})

test("состав — функция входов: два вычисления одного FRD и одного словаря совпадают байт в байт", () => {
  assert.equal(skeleton().xml, routesSkeleton({ frd: parseFrd(FRD_XML), values: VALUES }).xml)
})

test("тотальность: без требования цепочек нет, мусор читается как пустой файл", () => {
  assert.equal(routesSkeleton().chains, 0)
  assert.deepEqual(parseChains(undefined), [])
  assert.deepEqual(parseChains("<routes/>"), [])
})

test("маршрут потерян или дописан: состав цепочек считает скрипт", () => {
  assert.match(blockersOf(GREEN.replace(/\n.*id="S1b".*/, "")).join("\n"), /S1b/)
  assert.match(blockersOf(GREEN.replace("</routes>", '  <route id="S9" scenario="S9" uc="UC9" end="UC9/post" entry="v1" exit="v2" nodes="src/fruits.html" steps="src/fruits.html@v2"/>\n</routes>')).join("\n"), /S9/)
})

test("начало и конец переписаны: их называет словарь, а не роль", () => {
  assert.match(blockersOf(GREEN.replace(`exit="${CARD}"`, `exit="${NF}"`)).join("\n"), /exit/)
  assert.match(blockersOf(GREEN.replace('nodes="src/fruits.html src/FruitResource.java"', 'nodes="src/fruits.html"')).join("\n"), /узлы сценария называет шаг 6/)
})

test("шаг через чужой узел или несуществующее значение — разбор до обхода", () => {
  const alien = blockersOf(GREEN.replace("src/FruitResource.java@", "src/Fruit.java@"))
  assert.match(alien.join("\n"), /src\/Fruit.java — этого узла нет в nodes/)
  const ghost = blockersOf(GREEN.replace(`@${CARD} -> `, "@v99 -> "))
  assert.match(ghost.join("\n"), /значения v99 нет в словаре/)
})

test("цепочка не доходит до своего конца — это и есть предмет прохода", () => {
  const short = blockersOf(GREEN.replace(` -> src/FruitResource.java@${CARD} -> src/fruits.html@${CARD}"`, '"'))
  assert.equal(short.length, 1)
  assert.match(short[0], new RegExp(`маршрут S1 кончается значением ${OP}.*UC1/post`))
})

test("пустой steps: роли сказано, откуда и куда вести", () => {
  const b = blockersOf(skeleton().xml)
  assert.equal(b.length, 2)
  assert.match(b[0], new RegExp(`от entry="${IN}" до exit="${CARD}"`))
})

// Живой прогон f7bf154a: шаг 10 упал `err("cycle")` — у шага плана роли нет, чинить круг некому.
// Рёбра карты входят в тот же счёт: круг может замкнуться цепочкой ПОВЕРХ уже существующего вызова.
test("круг: порядок работ не строится — судится здесь, потому что на шаге 10 чинить его некому", () => {
  // ВОЗВРАТ КРУГОМ НЕ БЫВАЕТ, и это свойство деривации, а не милость: маршрут разматывается по уже
  // пройденным узлам, `A -> B -> A` говорит «A зовёт B» и ничего больше (forwardLegs). Зелёная
  // цепочка выше именно такая, и она законна.
  assert.deepEqual(blockersOf(GREEN), [])
  // Круг замыкается ребром КАРТЫ: репозиторий уже зовёт в обратную сторону, и порядок работ исчезает.
  const viaMap = blockersOf(GREEN, [{ from: "src/FruitResource.java", to: "src/fruits.html" }])
  assert.equal(viaMap.length, 1)
  assert.match(viaMap[0], /замкнуты в круг/)
})

test("сборка: контракты, рёбра и поток выводятся из цепочек — роль их не писала", () => {
  const a = assemble({ chains: chainsOf(GREEN), values: VALUES, frd: FRD, ripple: RIPPLE, mode: "minor" })
  const nodes = parseDesign(a.xml)
  const routes = parseRoutes(a.xml)

  assert.equal(a.nodes, 2)
  assert.equal(a.unstepped.length, 0)
  // `in` НЕ писала роль: у страницы это вход сценария, у ресурса — то, что страница отдала.
  assert.deepEqual(nodes.get("src/fruits.html").in, ["Выбор(name)", "Карточка(name,description)", "404 FRUIT_NOT_FOUND"])
  assert.deepEqual(nodes.get("src/FruitResource.java").in, ["GET /fruits/{name}"])
  assert.deepEqual(nodes.get("src/FruitResource.java").out, ["Карточка(name,description)", "404 FRUIT_NOT_FOUND"])
  // Ребро стыка выведено, хотя в ряби его нет: изменение заводит вызов, которого репозиторий не знает.
  assert.equal(nodes.get("src/fruits.html").deps.includes("src/FruitResource.java"), true)
  // Форма дельты — из FRD, роль модуля — из ряби; ни то, ни другое роль не набирала.
  assert.equal(nodes.get("src/FruitResource.java").delta, "Added")
  assert.match(a.xml, /<role>REST-ресурс фруктов<\/role>/)
  // Номер альтернативы считает скрипт, и он никогда не ноль.
  assert.doesNotMatch(a.xml, /#0/)
  assert.deepEqual(routes.map((r) => r.scenario), ["S1", "S1b"])

  // Поток и юниты — те же шаги, дважды сгруппированные; DoD не пуст ни у одного узла.
  const flow = expand(nodes, routes)
  assert.match(flow, /^1\. src\/fruits\.html : Выбор\(name\) -> GET \/fruits\/\{name\}$/m)
  assert.match(flow, /\$START_TESTS path="src\/FruitResource\.java"/)
  assert.equal([...unitsByPath(nodes, routes).values()].every((u) => u.length > 0), true)
  assert.equal(a.units, [...unitsByPath(nodes, routes).values()].flat().length)
})

test("узел изменения, через который не идёт ни одна цепочка, ПОСЧИТАН, а не забыт", () => {
  // У него не будет юнитов, значит тикет приедет без определения готовности (прогон d8ef8c60).
  // Правилом это не судится — число печатает воркфлоу, и по нему решают, что делать дальше.
  const one = chainsOf(GREEN).filter((c) => c.id === "S1").map((c) => ({ ...c, steps: c.steps.slice(0, 1) }))
  const a = assemble({ chains: one, values: VALUES, frd: FRD, ripple: RIPPLE, mode: "minor" })
  assert.deepEqual(a.unstepped, ["src/FruitResource.java"])
})
