// Ядро шага 14 — чистое; io живёт в ext/index.mjs. Формула: 1 happy + Σ ветвей антецедента с
// различимым следствием. Ветви здесь — владение шагом (один закрыватель, несколько, зовомый),
// нарезка теста по use case, порядок «тест раньше модуля» и шесть правил гардрейла.
import test from "node:test"
import assert from "node:assert/strict"
import { parseFrd } from "../intake/frd.mjs"
import { ownerOf, ticketsOf, checkTickets, ticketText } from "./tickets.mjs"

const FRD = parseFrd(`<frd grammar="1" goal="хранилище словарей">
  <usecase id="UC1" actor="api" goal="создать">
    <post>создан</post>
    <step n="1">POST /store с документом</step>
    <step n="2">система пишет запись</step>
    <ext id="2a" error="CONFLICT" outcome="дубль отклонён"/>
  </usecase>
  <usecase id="UC2" actor="api" goal="прочитать">
    <post>прочитан</post>
    <step n="1">GET /store/{id}</step>
    <step n="2">система читает запись</step>
  </usecase>
  <failure code="CONFLICT" status="409" client="дубль" operator="—" from="UC1/2a"/>
  <delta op="POST /store" form="Added" node="src/rest/RestStore.java" new="yes"/>
  <scenario id="S1" uc="UC1" before="нет" after="есть" nodes="src/rest/RestStore.java src/mongo/Store.java src/model/Doc.java"/>
  <scenario id="S2" uc="UC2" before="нет" after="есть" nodes="src/rest/RestStore.java src/mongo/Store.java src/model/Doc.java"/>
</frd>`)

// Разделы, как их пишет роль: точка входа зовёт стор, стор зовёт запись. Шаг UC1/1 закрывает только
// точка входа; шаг UC1/2 закрывают все трое — и это норма, он через них и проходит.
const SECTIONS = [
  {
    path: "src/model/Doc.java", calls: [], checks: true,
    closes: ["UC1/2", "UC2/2"],
    body: "что это: запись\nсигнатуры: getName() : String\nзовёт: нет\nпо образцу: src/model/Old.java — стиль\nзакрывает: UC1 шаг 2 · UC2 шаг 2\nпроверка: ./mvnw test -Dtest=DocTest · DocTest\n",
  },
  {
    path: "src/mongo/Store.java", calls: ["src/model/Doc.java"], checks: true,
    closes: ["UC1/2", "UC1/2a", "UC2/2"],
    body: "что это: монго-хранилище\nсигнатуры: create(Doc d) : Id · read(String id) : Doc\nзовёт: src/model/Doc.java — запись\nпо образцу: src/mongo/OldStore.java — стиль\nзакрывает: UC1 шаг 2 · UC1 шаг 2a · UC2 шаг 2\nпроверка: ./mvnw test -Dtest=StoreTest · StoreTest\n",
  },
  {
    path: "src/rest/RestStore.java", calls: ["src/mongo/Store.java", "src/model/Doc.java"], checks: true,
    closes: ["UC1/1", "UC2/1"],
    body: "что это: точка входа\nсигнатуры: post(Doc d) : Response · get(String id) : Response\nзовёт: src/mongo/Store.java — хранит · src/model/Doc.java — модель\nпо образцу: src/rest/OldRest.java — стиль\nзакрывает: UC1 шаг 1 · UC2 шаг 1\nпроверка: ./mvnw test -Dtest=RestStoreTest · RestStoreTest\n",
  },
]
const ORDER = ["src/model/Doc.java", "src/mongo/Store.java", "src/rest/RestStore.java"]
const cut = (over = {}) => ticketsOf({
  sections: SECTIONS, order: ORDER, frd: FRD, key: "DOS-1", branch: "feature/DOS-1",
  match: "*Test.java", testDir: "src/test/java", ...over,
})

// ГЛАВНОЕ ПРАВИЛО ШАГА. Один шаг требования проходит через несколько модулей, и все они называют его
// в «закрывает». Владельцем становится тот, через кого шаг наблюдаем: зовомый выбывает.
test("владелец шага — тот, через кого он наблюдаем, и он один", () => {
  const owner = ownerOf({ sections: SECTIONS, order: ORDER })

  // UC1/2 закрывают все трое; Store зовёт Doc, RestStore не закрывает этот шаг — владелец Store.
  assert.equal(owner.get("UC1/2"), "src/mongo/Store.java")
  assert.equal(owner.get("UC2/2"), "src/mongo/Store.java")
  // Шаги входа закрывает только точка входа.
  assert.equal(owner.get("UC1/1"), "src/rest/RestStore.java")
  // Ветка отказа — у того, кто её порождает.
  assert.equal(owner.get("UC1/2a"), "src/mongo/Store.java")
  // Ни один шаг не достался двоим.
  assert.equal(new Set(owner.keys()).size, owner.size)
})

// Правило графовое: модуль отпадает не потому, что «интерфейс» или «модель», а потому что его зовёт
// другой закрыватель. Убери ребро «зовёт» — и владение переедет, как и должно.
test("правило смотрит на рёбра, а не на вид модуля", () => {
  const noCall = SECTIONS.map((s) => (s.path === "src/mongo/Store.java" ? { ...s, calls: [] } : s))
  const owner = ownerOf({ sections: noCall, order: ORDER })
  // Store больше не зовёт Doc, оба закрывают UC1/2 — побеждает последний в очереди работ.
  assert.equal(owner.get("UC1/2"), "src/mongo/Store.java")
})

test("тесты режутся по use case, модуль ждёт свои тесты", () => {
  const t = cut()
  const tests = t.filter((x) => x.kind === "test")
  const mods = t.filter((x) => x.kind === "module")

  assert.equal(mods.length, 3, "модульный тикет на каждый раздел")
  // Store владеет шагами двух use case → два тестовых тикета, а не один на пять проверок.
  const storeTests = tests.filter((x) => x.module === "src/mongo/Store.java")
  assert.deepEqual(storeTests.map((x) => x.uc).sort(), ["UC1", "UC2"])
  // Doc не владеет ничем — теста нет: его корректность видна через того, кто его зовёт.
  assert.equal(tests.some((x) => x.module === "src/model/Doc.java"), false)

  const store = mods.find((x) => x.module === "src/mongo/Store.java")
  for (const x of storeTests) assert.ok(store.blocked_by.includes(x.id), `модуль ждёт тест ${x.id}`)
  assert.ok(store.wave > Math.max(...storeTests.map((x) => x.wave)), "модуль идёт волной позже своих тестов")
})

// Имя теста выводится из шаблона сьюта, найденного разведкой, а не придумывается: восемь тикетов
// одного модуля обязаны писать в восемь РАЗНЫХ файлов, иначе восемь исполнителей сядут на один.
test("файл теста — из шаблона сьюта, с пакетом модуля и без двойного суффикса", () => {
  const t = cut()
  const one = t.find((x) => x.kind === "test" && x.module === "src/mongo/Store.java" && x.uc === "UC1")
  assert.deepEqual([...one.outputs], ["src/test/java/mongo/StoreUC1Test.java"])
  assert.match(one.verify, /-Dtest=StoreUC1Test$/)

  // Другой проект — другой шаблон и другой корень; кода это не касается.
  const py = cut({ match: "test_*.py", testDir: "tests" })
  const first = py.find((x) => x.kind === "test")
  assert.match(first.outputs[0], /^tests\//)
  assert.match(first.outputs[0], /\.py$/)
})

test("гардрейл зелен на исправной нарезке", () => {
  assert.deepEqual(checkTickets({ tickets: cut(), sections: SECTIONS, frd: FRD }), [])
})

test("гардрейл ловит шесть потерь, и каждую называет", () => {
  const t = cut()

  // 1 — модуль плана без тикета
  assert.match(checkTickets({ tickets: t.filter((x) => x.module !== "src/model/Doc.java"), sections: SECTIONS, frd: FRD }).join("\n"),
    /модули плана без тикета: src\/model\/Doc.java/)

  // 2а — шаг проверяется дважды
  const twice = [...t, { ...t.find((x) => x.kind === "test"), id: "99", name: "dup" }]
  assert.match(checkTickets({ tickets: twice, sections: SECTIONS, frd: FRD }).join("\n"), /проверяемые дважды/)

  // 2б — шаг требования без единой проверки
  const noUc2 = t.filter((x) => !(x.kind === "test" && x.uc === "UC2"))
  assert.match(checkTickets({ tickets: noUc2, sections: SECTIONS, frd: FRD }).join("\n"), /без единой проверки: UC2\/1, UC2\/2/)

  // 3 — один путь в двух тикетах
  const clash = t.map((x) => (x.kind === "test" && x.uc === "UC2" ? { ...x, outputs: t.find((y) => y.kind === "test" && y.uc === "UC1").outputs } : x))
  assert.match(checkTickets({ tickets: clash, sections: SECTIONS, frd: FRD }).join("\n"), /один путь в двух тикетах/)

  // 4 — тикет без команды проверки
  const mute = t.map((x) => (x.kind === "module" ? { ...x, verify: "" } : x))
  assert.match(checkTickets({ tickets: mute, sections: SECTIONS, frd: FRD }).join("\n"), /без команды проверки/)

  // 5 — модуль не ждёт свои тесты: реализация опередит проверку
  const early = t.map((x) => (x.kind === "module" ? { ...x, blocked_by: [] } : x))
  assert.match(checkTickets({ tickets: early, sections: SECTIONS, frd: FRD }).join("\n"), /не ждёт свои тесты/)

  // 5б — модуль пишет в тестовый файл: подгонка теста под реализацию
  const testOut = t.find((x) => x.kind === "test").outputs[0]
  const rewrite = t.map((x) => (x.kind === "module" && x.module === "src/mongo/Store.java" ? { ...x, outputs: [...x.outputs, testOut] } : x))
  assert.match(checkTickets({ tickets: rewrite, sections: SECTIONS, frd: FRD }).join("\n"), /пишет в тестовый файл/)

  // 6 — ждёт несуществующий тикет
  const ghost = t.map((x) => (x.kind === "module" ? { ...x, blocked_by: [...x.blocked_by, "99"] } : x))
  assert.match(checkTickets({ tickets: ghost, sections: SECTIONS, frd: FRD }).join("\n"), /ждёт несуществующие 99/)
})

test("тело тикета — вырезки: шаги дословно, код отказа из карты, сигнатуры из раздела", () => {
  const t = cut()
  const testTicket = t.find((x) => x.kind === "test" && x.module === "src/mongo/Store.java" && x.uc === "UC1")
  const text = ticketText(testTicket)

  assert.match(text, /kind: test/)
  assert.match(text, /UC1 шаг 2: система пишет запись/)
  // Ветка отказа приезжает с кодом из карты отказов — тесту есть что утверждать.
  assert.match(text, /UC1 шаг 2a: CONFLICT — дубль отклонён — HTTP 409/)
  assert.match(text, /create\(Doc d\) : Id/)
  assert.match(text, /обязан УПАСТЬ/)

  const mod = ticketText(t.find((x) => x.kind === "module" && x.module === "src/mongo/Store.java"))
  assert.match(mod, /kind: module/)
  assert.match(mod, /что это: монго-хранилище/)
  assert.match(mod, /тестовые файлы не трогай/)
  // Строки «закрывает» и «проверка» в тело не дублируются — они уже в заголовке и в секциях.
  assert.doesNotMatch(mod, /^закрывает:/m)
})

test("тотальность: без входов — пусто, и ни одного броска", () => {
  assert.equal(ownerOf().size, 0)
  assert.deepEqual([...ticketsOf()], [])
  assert.deepEqual(checkTickets(), [])
  assert.equal(typeof ticketText(), "string")
})
