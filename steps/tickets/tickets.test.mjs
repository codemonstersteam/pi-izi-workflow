// Ядро шага 14 — чистое; io живёт в ext/index.mjs. Формула: 1 happy + Σ ветвей антецедента с
// различимым следствием. Ветви здесь — владение шагом (один закрыватель, несколько, зовомый),
// нарезка теста по use case, порядок «тест раньше модуля» и шесть правил гардрейла.
import test from "node:test"
import assert from "node:assert/strict"
import { parseFrd } from "../intake/frd.mjs"
import { ownerOf, layersOf, ticketsOf, checkTickets, ticketText } from "./tickets.mjs"

const FRD = parseFrd(`<frd grammar="1" goal="хранилище словарей">
  <actor name="api" kind="system" via="HTTP /store"/>
  <field name="key" in="Term" type="string" domain="1–64 символа, lowercase" required="yes" error="CONFLICT" source="brd.md"/>
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
// Карта знает и то, что план правит, и образцы, с которых он списывает. Всё, чего в ней нет и что не
// пишет план, — проза, а не вход.
// Сьют НЕ-unit — тот, которым репозиторий гоняет программу снаружи. Есть он — есть куда положить
// граничную проверку; нет — все шаги достаются владельцам.
const OUTER = { cmd: "./mvnw verify", one: "-Dit.test={class}", path: "src/test/java", match: "*IT.java" }
const BUILD = "./mvnw -q -DskipTests package"
// Существующие тесты внешнего сьюта: их находит io по <suite path>/<suite match>. Из них берётся
// ОБРАЗЕЦ — единственный факт, который сообщает исполнителю фреймворк, базовый класс, авторизацию и
// уборку. Без него слабая модель подставляет самый частый фреймворк и файл не компилируется.
const SAMPLES = ["src/test/java/app/integration/OldStoreCrudIT.java", "src/test/java/app/integration/HealthIT.java"]
const KNOWN = new Set(["src/model/Doc.java", "src/mongo/Store.java", "src/rest/RestStore.java",
  "src/model/Old.java", "src/mongo/OldStore.java", "src/rest/OldRest.java"])
const cut = (over = {}) => ticketsOf({
  sections: SECTIONS, order: ORDER, frd: FRD, key: "DOS-1", branch: "feature/DOS-1",
  match: "*Test.java", testDir: "src/test/java", known: KNOWN, outer: OUTER, build: BUILD, samples: SAMPLES, ...over,
})

// ГЛАВНОЕ ПРАВИЛО ШАГА. Один шаг требования проходит через несколько модулей, и все они называют его
// в «закрывает». Владельцем становится тот, кто может шаг проверить: зовомый выбывает.
test("владелец шага — тот, кто может его проверить, и он один", () => {
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

test("гардрейл зелен на исправной нарезке", () => {
  assert.deepEqual(checkTickets({ tickets: cut(), sections: SECTIONS, frd: FRD }), [])
})

test("тотальность: без входов — пусто, и ни одного броска", () => {
  assert.equal(ownerOf().size, 0)
  assert.deepEqual([...ticketsOf()], [])
  assert.deepEqual(checkTickets(), [])
  assert.equal(typeof ticketText(), "string")
})

// Д1. Роль переносит длинные перечни на следующие строки — это НОРМА формата раздела, и живой план
// eddi так и написан: у `IRestGlossaryStore` пять сигнатур, первая в строке `сигнатуры:`, остальные
// продолжениями. Читая одну физическую строку, тикет уносил первую и молчал про остальные: тесту на
// СОЗДАНИЕ глоссария предъявляли сигнатуру ЧТЕНИЯ дескрипторов. Восемь разделов, семнадцать тикетов.
test("многострочный перечень доезжает в тикет целиком", () => {
  const many = SECTIONS.map((s) => (s.path !== "src/mongo/Store.java" ? s : {
    ...s,
    body: s.body.replace("сигнатуры: create(Doc d) : Id · read(String id) : Doc",
      "сигнатуры: create(Doc d) : Id\n           read(String id) : Doc\n           delete(String id) : void"),
  }))
  const t = ticketsOf({ sections: many, order: ORDER, frd: FRD, key: "DOS-1", match: "*Test.java", testDir: "src/test/java", known: KNOWN, outer: OUTER, build: BUILD, samples: SAMPLES })
  const one = t.find((x) => x.kind === "module" && x.module === "src/mongo/Store.java")
  for (const sig of ["create(Doc d) : Id", "read(String id) : Doc", "delete(String id) : void"]) {
    assert.match(one.signatures, new RegExp(sig.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `сигнатура потеряна: ${sig}`)
  }
  assert.match(ticketText(one), /delete\(String id\) : void/, "в теле тикета контракт всё ещё обрезан")

  // Та же обрезка била по образцу: со второй строки пути не доезжали.
  const sample = SECTIONS.map((s) => (s.path !== "src/rest/RestStore.java" ? s : {
    ...s, body: s.body.replace("по образцу: src/rest/OldRest.java — стиль", "по образцу: src/rest/OldRest.java — стиль\n            src/mongo/OldStore.java — тоже"),
  }))
  const t2 = ticketsOf({ sections: sample, order: ORDER, frd: FRD, key: "DOS-1", match: "*Test.java", testDir: "src/test/java", known: KNOWN, outer: OUTER, build: BUILD, samples: SAMPLES })
  assert.ok(t2.find((x) => x.kind === "module" && x.module === "src/rest/RestStore.java").inputs.includes("src/mongo/OldStore.java"))
})

// Д3. `по образцу` — проза с путями внутри, и в ней встречается всё: URI ресурса, пакет, ссылка.
// Живой план eddi писал `eddi://ai.labs.glossary`, и во входы тикета уезжало `//ai.labs.glossary` —
// исполнителю велели прочитать то, чего нет. Вход обязан быть путём, который знает карта или план.
test("во входах только пути, известные карте или плану", () => {
  const prose = SECTIONS.map((s) => (s.path !== "src/mongo/Store.java" ? s : {
    ...s, body: s.body.replace("по образцу: src/mongo/OldStore.java — стиль",
      "по образцу: src/mongo/OldStore.java — стиль, ресурс eddi://ai.labs.glossary, пакет com/example/Thing.class"),
  }))
  const t = ticketsOf({ sections: prose, order: ORDER, frd: FRD, key: "DOS-1", match: "*Test.java", testDir: "src/test/java", known: KNOWN, outer: OUTER, build: BUILD, samples: SAMPLES })
  const mod = t.find((x) => x.kind === "module" && x.module === "src/mongo/Store.java")
  assert.ok(mod.inputs.includes("src/mongo/OldStore.java"), "настоящий образец потерялся")
  assert.deepEqual(mod.inputs.filter((p) => !KNOWN.has(p) && !p.startsWith("src/test/")), [],
    `во входах путь, которого не знает ни карта, ни план: ${mod.inputs.join(", ")}`)

  // И гардрейл говорит об этом вслух, а не молчит.
  const bad = t.map((x) => (x === mod ? { ...x, inputs: [...x.inputs, "//ai.labs.glossary"] } : x))
  assert.match(checkTickets({ tickets: bad, sections: prose, frd: FRD, known: KNOWN }).join("\n"), /\/\/ai\.labs\.glossary/)
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// НОВАЯ НАРЕЗКА: граница снаружи, модули снизу вверх.
//
// Эмуляция 35 нарядов живого прогона показала, что порядок неисполним: тестовый тикет ПЕРЕД модульным
// не компилируется (тест ссылается на класс, которого нет), а модуль без своих шагов закрывался
// тестами зовущих, которые зеленеют только волнами позже. Оба изученных конвейера — sdlc-skills
// и oh-my-openagent — независимо пришли к одному: юнит-тест живёт в тикете модуля, а неподгоняемая
// проверка выносится на ГРАНИЦУ программы, где она не ссылается ни на один новый класс.

test("слои считаются по рёбрам «зовёт», снизу вверх", () => {
  const L = layersOf({ sections: SECTIONS, order: ORDER })
  assert.deepEqual(L, [["src/model/Doc.java"], ["src/mongo/Store.java"], ["src/rest/RestStore.java"]])

  // Ребро исчезло — слои сплющиваются: правило смотрит на граф, а не на порядок в списке.
  const flat = SECTIONS.map((s) => ({ ...s, calls: [] }))
  assert.deepEqual(layersOf({ sections: flat, order: ORDER }).length, 1)
  assert.deepEqual(layersOf(), [])
})

test("граничный тикет — на use case, чей вход несёт api, и он не знает ни одного нового класса", () => {
  const t = cut()
  const bs = t.filter((x) => x.kind === "boundary")
  assert.deepEqual(bs.map((x) => x.uc).sort(), ["UC1", "UC2"], "граница заводится на каждый use case входа")

  const one = bs.find((x) => x.uc === "UC1")
  assert.equal(one.wave, 0, "граница пишется первой волной — до всякого кода")
  assert.deepEqual(one.blocked_by, [])

  // ГЛАВНОЕ СВОЙСТВО: текст не называет ни одного пути, который эта же нарезка только собирается
  // создать. Иначе тест не скомпилируется до кода, и его «красный» будет ошибкой сборки, а не проверкой.
  const text = ticketText(one)
  for (const s of SECTIONS) assert.doesNotMatch(text, new RegExp(s.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `граница ссылается на новый класс: ${s.path}`)
  assert.match(text, /HTTP \/store/, "граница обязана звать систему через её канал")
  assert.doesNotMatch(one.outputs[0], /RestStore/, "имя граничного класса собрано из модуля, которого ещё нет")
  assert.match(text, /обязан быть КРАСНЫМ/)
})

test("шаги делятся без догадок: вход и ветки с кодом — границе, остальное — владельцу", () => {
  const t = cut()
  const at = (kind, uc) => t.filter((x) => x.kind === kind && x.uc === uc).flatMap((x) => x.steps.map((s) => s.step))

  // UC1: шаг 1 — внешний вход, 2a — ветка с кодом 409. Оба у границы.
  assert.deepEqual(at("boundary", "UC1").sort(), ["UC1/1", "UC1/2a"])
  // Шаг 2 — внутренний, он у своего владельца.
  const mods = t.filter((x) => x.kind === "module").flatMap((x) => (x.steps || []).map((s) => s.step))
  assert.ok(mods.includes("UC1/2"), "внутренний шаг потерялся")
  assert.equal(mods.includes("UC1/1"), false, "внешний вход проверяется дважды")

  // Каждый шаг требования покрыт РОВНО ОДИН раз — это и судит правило 2 гардрейла.
  const all = [...t.filter((x) => x.kind === "boundary"), ...t.filter((x) => x.kind === "module")]
    .flatMap((x) => (x.steps || []).map((s) => s.step))
  assert.equal(all.length, new Set(all).size, `шаг покрыт дважды: ${all.join(" ")}`)
})

test("модуль и его тесты — один тикет, ворота — сборка и ТОЛЬКО свои тесты", () => {
  const t = cut()
  const store = t.find((x) => x.kind === "module" && x.module === "src/mongo/Store.java")

  assert.equal(t.some((x) => x.kind === "test"), false, "остался отдельный тестовый тикет — компиляция снова сломана")
  assert.ok(store.outputs.includes("src/mongo/Store.java"))
  assert.ok(store.outputs.some((p) => p.startsWith("src/test/java/")), "тест не в outputs — его пишет кто-то другой")

  assert.match(store.verify, /-q -DskipTests package/, "ворота не включают сборку")
  assert.match(store.verify, /-Dtest=StoreTest/, "ворота не включают свои тесты")
  // И НИКОГДА чужие: зовущий реализуется позже, его тесты на этой волне зелёными быть не могут.
  const alien = t.filter((x) => x.kind === "module" && x.module !== store.module).flatMap((x) => x.testClass ? [x.testClass] : [])
  for (const a of alien) assert.doesNotMatch(store.verify, new RegExp(a), `в воротах чужой тест ${a}`)
})

test("модуль без своих шагов закрывается одной сборкой, и волна зовомого меньше волны зовущего", () => {
  const t = cut()
  const doc = t.find((x) => x.kind === "module" && x.module === "src/model/Doc.java")
  const store = t.find((x) => x.kind === "module" && x.module === "src/mongo/Store.java")

  // Doc владеет UC1/2 и UC2/2 — у него ЕСТЬ шаги. Возьмём модуль без шагов отдельным раскладом.
  const bare = SECTIONS.map((s) => (s.path === "src/model/Doc.java" ? { ...s, closes: [], body: s.body.replace("закрывает: UC1 шаг 2 · UC2 шаг 2", "закрывает: нет") } : s))
  const t2 = ticketsOf({ sections: bare, order: ORDER, frd: FRD, key: "DOS-1", match: "*Test.java", testDir: "src/test/java", known: KNOWN, outer: OUTER, build: BUILD, samples: SAMPLES })
  const bareDoc = t2.find((x) => x.kind === "module" && x.module === "src/model/Doc.java")
  assert.equal(bareDoc.verify, BUILD, "модуль без шагов закрывается не одной сборкой")
  assert.deepEqual(bareDoc.outputs, ["src/model/Doc.java"], "у модуля без шагов появился тестовый файл")

  assert.ok(doc.wave < store.wave, "зовомый обязан лежать волной раньше зовущего")
  assert.ok(store.blocked_by.includes(doc.id), "модуль не ждёт того, кого зовёт")
})

test("гардрейл судит новую нарезку и называет каждую потерю", () => {
  const t = cut()
  const ok = (list) => checkTickets({ tickets: list, sections: SECTIONS, frd: FRD, known: KNOWN, outer: OUTER })
  assert.deepEqual(ok(t), [], `зелёная нарезка признана красной: ${ok(t).join(" · ")}`)

  // 4 — чужой тест в воротах модуля
  const alienGate = t.map((x) => (x.kind === "module" && x.module === "src/model/Doc.java" ? { ...x, verify: "./mvnw test -Dtest=StoreTest" } : x))
  assert.match(ok(alienGate).join("\n"), /чуж/)

  // 5 — граница ссылается на класс, которого ещё нет
  const leaky = t.map((x) => (x.kind === "boundary" ? { ...x, inputs: ["src/mongo/Store.java"] } : x))
  assert.match(ok(leaky).join("\n"), /src\/mongo\/Store\.java/)

  // 6 — зовомый оказался волной позже зовущего
  const late = t.map((x) => (x.module === "src/model/Doc.java" ? { ...x, wave: 9 } : x))
  assert.match(ok(late).join("\n"), /волн/)

  // 8 — ОТОРВАННЫЙ модуль без шагов: его не проверит ничто. Связь считается в обе стороны: реализацию
  // интерфейса никто не зовёт по имени, но она зовёт интерфейс — и её проверяет компилятор и граница.
  // Оторванный модуль: шагов нет, никто не зовёт ЕГО и он не зовёт никого.
  const orphan = [...SECTIONS.map((s) => (s.path === "src/model/Doc.java" ? { ...s, closes: [], calls: [] } : { ...s, calls: s.calls.filter((c) => c !== "src/model/Doc.java") }))]
  const t3 = ticketsOf({ sections: orphan, order: ORDER, frd: FRD, key: "DOS-1", match: "*Test.java", testDir: "src/test/java", known: KNOWN, outer: OUTER, build: BUILD, samples: SAMPLES })
  assert.match(checkTickets({ tickets: t3, sections: orphan, frd: FRD, known: KNOWN, outer: OUTER }).join("\n"), /не связан с изменением/)
})

// Карта, снятая до того, как разведку стали спрашивать о команде сборки, команды не несёт. Запасной
// путь обязан оставаться честным: сырая строка «проверка» раздела называет тест РЕАЛИЗАЦИИ, то есть
// чужой класс, который позеленеет волнами позже. Живой прогон уперся ровно в это.
test("без команды сборки модуль без шагов закрывается сьютом без флага, а не чужим тестом", () => {
  const bare = SECTIONS.map((s) => (s.path === "src/model/Doc.java"
    ? { ...s, closes: [], body: s.body.replace("закрывает: UC1 шаг 2 · UC2 шаг 2", "закрывает: нет").replace("-Dtest=DocTest · DocTest", "-Dtest=StoreTest · StoreTest") }
    : s))
  const t = ticketsOf({ sections: bare, order: ORDER, frd: FRD, key: "DOS-1", match: "*Test.java", testDir: "src/test/java", known: KNOWN, outer: OUTER })
  const doc = t.find((x) => x.kind === "module" && x.module === "src/model/Doc.java")
  assert.equal(doc.verify, "./mvnw test", `ворота несут чужое: ${doc.verify}`)
  assert.deepEqual(checkTickets({ tickets: t, sections: bare, frd: FRD, known: KNOWN }), [])
})

// Эмуляция на слабой модели: ей выдали граничный тикет и запретили читать репозиторий — она написала
// тест на Spring Boot для проекта на Quarkus, и файл не собрался бы. Не выдумка от лени: в тикете
// стояло только «проект: Java». У модульного тикета есть строка «по образцу», у граничного не было
// ничего — и это единственный факт, который чинит разом фреймворк, базовый класс, авторизацию и
// уборку за собой: исполнитель читает образец и берёт оттуда всё.
test("граница несёт ОБРАЗЕЦ существующего теста и кладёт файл рядом с ним", () => {
  const one = cut().find((x) => x.kind === "boundary" && x.uc === "UC1")
  assert.ok(one.inputs.some((p) => SAMPLES.includes(p)), `образца нет во входах: ${one.inputs.join(", ")}`)
  assert.match(ticketText(one), /[Пп]о образцу/, "тело не называет образец — исполнителю неоткуда взять фреймворк")

  // Файл ложится ТУДА, ГДЕ ЖИВУТ такие тесты, а не в пакет модуля: иначе пакет и каталог разойдутся.
  assert.match(one.outputs[0], /^src\/test\/java\/app\/integration\//, `граница уехала не в свой каталог: ${one.outputs[0]}`)

  // Ближайший образец, а не первый попавшийся: у входа образец OldRest — берётся OldStoreCrudIT.
  assert.ok(one.inputs.includes("src/test/java/app/integration/OldStoreCrudIT.java"))
})

// Ветка отказа даёт КОД, но не даёт правила, которое она нарушает: правило живёт в <field domain> и
// уходило владельцу шага. Модель угадывала, чем вызвать 400.
test("граница несёт правила полей — чем вызвать отказ, а не только его код", () => {
  const text = ticketText(cut().find((x) => x.kind === "boundary" && x.uc === "UC1"))
  assert.match(text, /key/)
  assert.match(text, /1–64 символа, lowercase/, "правило, которое нарушает ветка отказа, не приехало")
})

// Сьют объявлен, а ни одного его файла нет — писать границу не по чему. Это отказ шага, а не повод
// выдумать: пустой `samples` при живом `outer` означает, что карта и репозиторий разошлись.
test("сьют без единого своего файла — граница не режется вовсе", () => {
  const t = cut({ samples: [] })
  assert.equal(t.some((x) => x.kind === "boundary"), false)
  // И тогда шаги входа достаются владельцам: требование не остаётся без проверки.
  const steps = t.flatMap((x) => (x.steps || []).map((s) => s.step))
  assert.ok(steps.includes("UC1/1"), "шаг внешнего входа потерян вместе с границей")
})

// Эмуляция на слабой модели: она создала ТРИ файла вне своих outputs — интерфейс и модель, — назвав
// это «поддерживающими файлами». В тикете не было сказано ни слова о том, что этого делать нельзя,
// и уж тем более не названы файлы, за которые отвечают другие наряды.
//
// Список собирается машиной и бьёт точно в соблазн: не «все чужие файлы», а те модули плана, чьи
// имена ВСТРЕЧАЮТСЯ В ТЕЛЕ этого тикета — в сигнатурах, в «зовёт», в «по образцу».
test("модульный тикет называет чужие файлы поимённо, с номерами их нарядов", () => {
  const t = cut()
  const store = t.find((x) => x.kind === "module" && x.module === "src/mongo/Store.java")
  const text = ticketText(store)

  assert.match(text, /## Запрещено/)
  // Doc назван в «зовёт» и в сигнатурах — его файл обязан быть в запрете, вместе с номером наряда.
  const doc = t.find((x) => x.kind === "module" && x.module === "src/model/Doc.java")
  assert.match(text, new RegExp(`src/model/Doc\\.java\\s+— наряд ${doc.id}`), "чужой файл не назван с номером наряда")
  // А свой файл в запрете стоять не может — это его работа.
  assert.doesNotMatch(text.split("## Запрещено")[1], /src\/mongo\/Store\.java/)
  // И тавтология названа прямо.
  assert.match(text, /assertTrue\(true\)/)

  // Модуль, ничьих имён не поминающий, лишнего раздела не получает.
  const bare = t.find((x) => x.kind === "module" && x.module === "src/model/Doc.java")
  assert.doesNotMatch(ticketText(bare), /## Запрещено/)
})
