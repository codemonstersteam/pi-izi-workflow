// Фазы ⑥⑦⑧ — чистое ядро; io живёт в ext/index.mjs. Формула: 1 happy + Σ ветвей антецедента с
// различимым следствием. Ветви здесь — три дыры полноты, круг в порядке работ и два источника рёбер.
import test from "node:test"
import assert from "node:assert/strict"
import { parseFrd } from "../intake/frd.mjs"
import { sectionsOf } from "./card.mjs"
import { partsOf } from "./card.mjs"
import { coverageOf, orderOf, planDoc, gateView, readGate } from "./plandoc.mjs"

const FRD = parseFrd(`<frd grammar="1" goal="хранилище словарей">
  <usecase id="UC1" actor="api" goal="создать">
    <post>создан</post>
    <step n="1">POST /store</step>
    <step n="2">система пишет запись</step>
    <ext id="2a" error="CONFLICT" outcome="дубль отклонён"/>
  </usecase>
  <usecase id="UC2" actor="api" goal="прочитать">
    <post>прочитан</post>
    <step n="1">GET /store/{id}</step>
  </usecase>
  <delta op="POST /store" form="Added" node="src/rest/RestStore.java" new="yes"/>
  <scenario id="S1" uc="UC1" before="нет" after="есть" nodes="src/rest/RestStore.java src/model/Doc.java"/>
  <scenario id="S2" uc="UC2" before="нет" after="есть" nodes="src/rest/RestStore.java src/model/Doc.java"/>
</frd>`)

const { modules } = partsOf({ frd: FRD })

// План партии, каким его пишет роль: раздел на модуль, «зовёт» путями, шаги по номерам.
// Ветка отказа названа ТОЙ ЖЕ буквой, что в FRD: единообразие обеспечивает гардрейл фазы ⑤.
const PLAN = `# src — хранилище

## src/rest/RestStore.java  (новый)
что это: REST-точка
зовёт: src/model/Doc.java — принимает запись
закрывает: UC1 шаг 1 · UC1 шаг 2 · UC1 шаг 2a · UC2 шаг 1
проверка: ./mvnw test -Dtest=RestStoreTest · RestStoreTest

## src/model/Doc.java  (новый)
что это: запись
поля: name: String — имя
зовёт: нет
закрывает: UC1 шаг 2 · UC2 шаг 1
проверка: ./mvnw test -Dtest=DocTest · DocTest
`
const SECTIONS = sectionsOf(PLAN)

test("полнота: все модули решены, все use case и все их шаги закрыты — зелено", () => {
  assert.deepEqual(coverageOf({ frd: FRD, modules, sections: SECTIONS }), [])
})

test("полнота ловит три дыры, и каждую называет поимённо", () => {
  // 1. модуль без раздела — работа, которую никто не планировал
  const one = sectionsOf(PLAN.replace(/## src\/model[\s\S]*$/, ""))
  assert.match(coverageOf({ frd: FRD, modules, sections: one }).join("\n"), /модули изменения без раздела: src\/model\/Doc.java/)

  // 2. use case, не названный нигде — требование, которое ничем не закрыто
  const noUc2 = sectionsOf(PLAN.replace(/ · UC2 шаг 1/g, ""))
  assert.match(coverageOf({ frd: FRD, modules, sections: noUc2 }).join("\n"), /use case UC2 не назван/)

  // 3. ветка отказа, которую никто не закрыл — половина use case, тихо не уехавшая
  const noExt = sectionsOf(PLAN.replace(" · UC1 шаг 2a", ""))
  assert.match(coverageOf({ frd: FRD, modules, sections: noExt }).join("\n"), /у UC1 не закрыты шаги: 2a/)
})

// Живой прогон e79a460e: FRD нумерует ветки латиницей (`2a`), роль писала кириллицей (`2а`) — и
// иногда наоборот, в одном файле. Единообразие держит гардрейл фазы ⑤, а не нормализация здесь:
// иначе дефект становится невидимым — покрыто на бумаге, набрано другой буквой на диске.
test("номер другой буквой — дыра полноты, а не молчаливое совпадение", () => {
  const cyr = sectionsOf(PLAN.replace("UC1 шаг 2a", "UC1 шаг 2а"))
  assert.match(coverageOf({ frd: FRD, modules, sections: cyr }).join("\n"), /у UC1 не закрыты шаги: 2a/)
})

test("порядок: зовомый раньше зовущего, и он функция объявлений", () => {
  const { order, cycle } = orderOf({ sections: SECTIONS, modules })
  assert.deepEqual([...cycle], [])
  assert.deepEqual([...order], ["src/model/Doc.java", "src/rest/RestStore.java"])
})

test("круг из объявлений — отказ с именами: чинить его есть кому, строки писала роль", () => {
  const both = sectionsOf(PLAN.replace("зовёт: нет", "зовёт: src/rest/RestStore.java — обратно"))
  const { order, cycle } = orderOf({ sections: both, modules })
  assert.equal(cycle.length > 0, true)
  assert.deepEqual([...order], [])
  assert.equal(cycle.includes("src/rest/RestStore.java"), true)
})

test("рёбра карты входят в порядок только для СУЩЕСТВУЮЩИХ модулей", () => {
  // Оба модуля здесь создаются, значит карта о них ничего сказать не может — её ребро игнорируется.
  const edges = [{ from: "src/model/Doc.java", to: "src/rest/RestStore.java" }]
  const { cycle } = orderOf({ sections: SECTIONS, modules, edges })
  assert.deepEqual([...cycle], [], "ребро карты о создаваемом файле не создаёт круга")
})

test("PLAN.md несёт разделы ДОСЛОВНО и в порядке работ", () => {
  const { order } = orderOf({ sections: SECTIONS, modules })
  const text = planDoc({ frd: FRD, sections: SECTIONS, order, modules })

  assert.match(text, /# План доработки — 2 модулей, 2 use case/)
  // Порядок в шапке и в теле — один и тот же.
  assert.ok(text.indexOf("## 1. src/model/Doc.java") < text.indexOf("## 2. src/rest/RestStore.java"))
  // Тело раздела скопировано, а не пересказано: тикет режется из этих же строк.
  assert.match(text, /проверка: \.\/mvnw test -Dtest=DocTest · DocTest/)
  assert.match(text, /зовёт: src\/model\/Doc\.java — принимает запись/)
})

test("тотальность: без входов — пустой план и ни одного броска", () => {
  assert.deepEqual(coverageOf(), [])
  assert.deepEqual([...orderOf().order], [])
  assert.equal(typeof planDoc(), "string")
})

// --- гейт 1: вид и разбор ответа --------------------------------------------------------------------
const PART = { id: "src", slug: "src-rest", modules: ["src/rest/RestStore.java", "src/model/Doc.java"], ucs: ["UC1", "UC2"], neighbours: [] }

test("вид гейта: каждая строка — вырезка или счёт, ни одного нового слова", () => {
  const { order } = orderOf({ sections: SECTIONS, modules })
  const v = gateView({ frd: FRD, modules, parts: [PART], sections: SECTIONS, order, key: "DOS-42", base: "main" })

  assert.match(v, /^ГЕЙТ 1 · DOS-42 · план: task\/DOS-42\/PLAN\.md/)
  // Цель — дословно из FRD, а не пересказ.
  assert.ok(v.includes(FRD.goal))
  // Ветвь партии: диапазон use case, slug, счёт модулей и сколько из них новых.
  assert.match(v, /UC1-UC2\s+──► src-rest · 2 модуля \(все новые\)/)
  // Что писать первым и сколько модулей его зовут — из порядка ⑦ и строк «зовёт».
  assert.match(v, /первым Doc\.java, его зовут 1 из 2/)
  // Команды считаются по самой команде: оператор видит цену проверки.
  assert.match(v, /Проверка: 2 команд — \.\/mvnw test ×2/)
  assert.match(v, /Ветка: feature\/DOS-42 от main/)
  assert.match(v, /Ответ: approve · rework: <что не так> · stop/)
})

test("вид тотален: без плана и без ключа не роняет полосу", () => {
  assert.equal(typeof gateView(), "string")
  assert.match(gateView(), /Ветка: feature\/<КЛЮЧ> от <транк>/)
})

// Решение гейта — слово, а не проза: на нём ветвится полоса, и разбор из предложения был бы решением,
// которое следующий прогон не воспроизведёт.
test("ответ оператора разбирается в одно из трёх решений", () => {
  assert.equal(readGate("approve").kind, "approve")
  assert.equal(readGate("  APPROVE  ").kind, "approve")
  assert.equal(readGate("stop").kind, "stop")

  const r = readGate("rework: экспорт должен уметь выборочные глоссарии")
  assert.equal(r.kind, "rework")
  assert.equal(r.comment, "экспорт должен уметь выборочные глоссарии")

  // «rework» без слов — не решение: шагу 6 нечего читать, гейт спросит заново.
  assert.equal(readGate("rework:").kind, "")
  assert.equal(readGate("ну в общем нормально").kind, "")
  assert.equal(readGate().kind, "")
})
