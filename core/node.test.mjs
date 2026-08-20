// TEST_CONTRACT: core/node.mjs — один ответ на вопрос «что такое узел», четыре состояния.
//
// Швы куплены тремя остановками живого прогона eddi 19.08.2026 подряд: F2 шага 6 на существующем
// файле, F3 шага 6 «ломаться нечему», `unknown-node` шага 8 — полоса встала между двумя своими же
// шагами, по-разному ответившими про один путь.
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { nodeKind, pathsOf, KINDS } from "./node.mjs"

const SWARM = "src/rest/RestStore.java"
const REPO = "src/main/java/app/configs/AgentConfiguration.java"
const NEW = "src/rest/RestGlossary.java"
const kind = nodeKind({ nodes: new Set([SWARM]), paths: new Set([SWARM, REPO]), created: new Set([NEW]) })

test("четыре состояния, и каждое означает своё", () => {
  assert.equal(kind(SWARM), KINDS.SWARM, "рой читал — известны контракты")
  assert.equal(kind(REPO), KINDS.REPO, "файл есть, рой не читал — известен только путь")
  assert.equal(kind(NEW), KINDS.NEW, "файла нет, его создаёт это изменение")
  assert.equal(kind("src/Nowhere.java"), KINDS.NONE, "нет нигде — выдумка")
})

test("порядок проверок: создаваемое раньше существующего, рой раньше графа", () => {
  // Путь, объявленный создаваемым И существующий, остаётся `new`: расхождение ловит F3 шага 6 своим
  // блокером «new=yes, но файл ЕСТЬ», а не это множество.
  const clash = nodeKind({ nodes: new Set([REPO]), paths: new Set([REPO]), created: new Set([REPO]) })
  assert.equal(clash(REPO), KINDS.NEW)
  // Узел, который знают обе карты, — `swarm`: ответ роя богаче, и это важнее факта существования.
  assert.equal(kind(SWARM), KINDS.SWARM)
})

test("тотальность: без карт всё — выдумка, и ничего не брошено", () => {
  const blind = nodeKind()
  assert.equal(blind("src/A.java"), KINDS.NONE)
  assert.equal(blind(""), KINDS.NONE)
  assert.equal(blind(undefined), KINDS.NONE)
  assert.equal(nodeKind({ nodes: null, paths: undefined, created: 0 })("src/A.java"), KINDS.NONE)
})

test("pathsOf: пути вычисленного графа одним выражением, мусор даёт пусто", () => {
  assert.deepEqual([...pathsOf({ decls: [{ at: "src/A.java" }, { at: "src/A.java" }, { at: "" }, null] })], ["src/A.java"])
  assert.equal(pathsOf(null).size, 0)
  assert.equal(pathsOf({ decls: "мусор" }).size, 0)
  assert.equal(pathsOf().size, 0)
})

// СОГЛАСИЕ ШАГОВ — то, ради чего модуль и заведён.
//
// Живой прогон eddi 19.08.2026: шаг 6 принял `AgentConfiguration.java`, шаг 8 тот же путь отверг
// `unknown-node`, и полоса встала между двумя своими же правилами. Здесь оба спрашивают ОДНУ функцию
// на ОДНИХ картах и обязаны ответить одинаково; разведи их — и остановка вернётся.
test("шаги 6 и 8 отвечают про один путь одинаково", async () => {
  const { checkFrd } = await import("../steps/intake/frd.mjs")
  const { newRipple } = await import("../steps/ripple/ripple.mjs")
  const { parseFrd } = await import("../steps/intake/frd.mjs")
  const { parseMap } = await import("../steps/intake/map.mjs")

  const outside = "src/main/java/app/configs/AgentConfiguration.java"
  const xml = `<frd grammar="1" goal="привязка">
  <usecase id="UC1" actor="api" goal="привязать"><post>сохранено</post><step n="1">клиент шлёт PUT</step></usecase>
  <delta op="glossaries field" form="Changed" node="${outside}" from="нет поля" to="список ссылок"/>
  <touched path="${outside}" why="появляется список ссылок"/>
  <scenario id="S1" uc="UC1" before="нет" after="есть" nodes="${outside}"/>
</frd>`
  const frd = parseFrd(xml)
  const map = parseMap('<appgraph grammar="4"><module path="src/rest/Store.java" pkg="rest"/></appgraph>')
  const members = new Map([[outside, new Set(["AgentConfiguration"])]])

  // Шаг 6: узел вне фокуса, но существующий — не блокер.
  const six = checkFrd({ frd, nodes: map.nodes, members }).filter((b) => /^F[234] /.test(b))
  assert.deepEqual(six, [], "шаг 6 отверг существующий файл")

  // Шаг 8 на ТЕХ ЖЕ картах — тоже пропускает.
  const eight = newRipple({ xml: "<appgraph/>", frd, mode: "minor", map, repo: new Set([outside]) })
  assert.equal(eight.error?.cls, undefined, `шаг 8 отверг то, что принял шаг 6: ${eight.error?.detail || ""}`)

  // И оба одинаково отвергают выдумку.
  const ghost = parseFrd(xml.replace(new RegExp(outside, "g"), "src/Nowhere.java"))
  assert.ok(checkFrd({ frd: ghost, nodes: map.nodes, members }).some((b) => b.startsWith("F2 ")))
  assert.equal(newRipple({ xml: "<appgraph/>", frd: ghost, mode: "minor", map, repo: new Set([outside]) }).error.cls, "unknown-node")
})

// ШОВ УРОВНЯ РЕПОЗИТОРИЯ: вопрос о существовании файла задаётся ТОЛЬКО через core/node.mjs.
//
// DoD наряда J17: в `steps/*` не должно остаться прямых `nodes.has(path)` там, где спрашивают, есть
// ли такой файл. Оставшиеся `nodes.has` в ripple — про ГРАФ карты (какие рёбра внутри подграфа), а не
// про существование, и это разные вопросы.
test("шаги спрашивают о существовании через один модуль, а не через карту напрямую", () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8")
  for (const f of ["../steps/intake/frd.mjs", "../steps/ripple/ripple.mjs"]) {
    const src = read(f)
    assert.match(src, /from "\.\.\/\.\.\/core\/node\.mjs"/, `${f} не спрашивает core/node.mjs`)
    assert.match(src, /nodeKind\(\{/, `${f} импортирует, но не зовёт`)
  }
  // Отказ шага 8 больше не называет двух неверных причин и называет ВЫХОД (standards/guardrail.md).
  const ripple = read("../steps/ripple/ripple.mjs")
  assert.equal(/frd\.xml старше appgraph\.xml либо путь выдуман/.test(ripple), false, "старая формулировка отказа вернулась")
  assert.match(ripple, /файла нет ни в карте роя, ни в репозитории/)
  assert.match(ripple, /kind:"lookup"/)
  assert.match(ripple, /new="yes"/)
})
