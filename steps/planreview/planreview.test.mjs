// Срез `planreview`: второй судья над планом. Фикстуры — НАСТОЯЩИЕ находки эксперимента 19.08.2026
// (квен на артефактах прогона, забракованного гейтом 1), а не выдуманная форма. Слова протокола с
// тех пор переведены на английский — их пишет роль, а всё, что роль пишет, в этом конвейере
// английское (steps/intake/intake.md, ЗАКОН 6).
import test from "node:test"
import assert from "node:assert/strict"
import { findingsOf, routeOf, applyPatch, feedbackFor, KINDS, hiddenHeads } from "./planreview.mjs"

const VERDICT = `R1 | PLAN LOST | src/main/java/ai/labs/eddi/configs/glossaries/model/Glossary.java | добавить поле resourceUri со значением eddi://ai.labs.glossary
R11 | NOT WRITTEN | добавить список ссылок на Глоссарии в модель AgentConfiguration | иначе план не знает, откуда загружать привязанные Глоссарии
R18 | PLAN LOST | (no such module) | add the exception that becomes HTTP 422
пояснение, которое роль дописала от себя — не находка`

const PLAN = `## 1. src/main/java/ai/labs/eddi/configs/glossaries/model/Glossary.java
fields: id: String — auto-generated unique identifier
        terms: Map<String, String> — key-value term pairs`

test("happy: вердикт разбирается в находки, мусорная строка не становится одной из них", () => {
  const f = findingsOf(VERDICT)
  assert.equal(f.length, 3)
  assert.deepEqual(f.map((x) => x.req), ["R1", "R11", "R18"])
  assert.equal(f[0].kind, KINDS.LOST)
  assert.equal(f[1].kind, KINDS.UNWRITTEN)
  assert.match(f[0].at, /model\/Glossary\.java$/)
  assert.match(f[2].what, /HTTP 422/)
})

// Три маршрута — три разных цены, и путать их дорого: правка не того места стоит больше, чем лишняя
// пересборка (docs/plan-loop.md).
test("маршрут: правка раздела — на месте, потерянный модуль — через требование и переигрывание", () => {
  const f = findingsOf(VERDICT)
  const frd = `<delta node="src/main/java/ai/labs/eddi/modules/glossaries/GlossaryService.java"/>`
  assert.deepEqual(routeOf(f[0], { plan: PLAN, frd }), ["plan"], "раздел есть — правка по якорю, и только")
  // Модуля нет ни в плане, ни в требовании: его вход в план — `<scenario nodes>` (card.mjs::partsOf),
  // и патчем документа он туда не попадёт.
  assert.deepEqual(routeOf(f[1], { plan: PLAN, frd }), ["frd"], "потерянный модуль чинится требованием")
  assert.deepEqual(routeOf(f[2], { plan: PLAN, frd }), ["plan"],
    "«(no such module)» без единого пути — это не новый модуль, а правка того, что уже в плане")
  const named = { ...f[2], what: "add the field to src/main/java/ai/labs/eddi/configs/glossaries/model/Glossary.java" }
  assert.deepEqual(routeOf(named, { plan: PLAN, frd }), ["plan"], "модуль есть в плане — правка на месте")
  const knownToFrd = { ...f[2], what: "add the exception in src/main/java/ai/labs/eddi/modules/glossaries/GlossaryService.java" }
  assert.deepEqual(routeOf(knownToFrd, { plan: PLAN, frd }), ["design"],
    "требование модуль знает, а раздела нет — не отработал шаг 9")
  const lost = { ...f[2], what: "add the field to src/main/java/lib/agents/AgentConfiguration.java" }
  assert.deepEqual(routeOf(lost, { plan: PLAN, frd }), ["frd"], "требование о модуле молчит — чинится оно")
  assert.deepEqual(routeOf(lost, { plan: PLAN, frd: `<scenario nodes="src/main/java/lib/agents/AgentConfiguration.java"/>` }),
    ["design"], "требование модуль знает, а плана нет — не отработал шаг 9, план переигрывается")
})

test("тотальность: пустое, мусор и незнакомое едут в самый ДОРОГОЙ маршрут, а не в дешёвый", () => {
  assert.deepEqual(findingsOf(), [])
  assert.deepEqual(findingsOf("замечаний нет"), [])
  assert.deepEqual(routeOf(), ["plan"])
  assert.deepEqual(routeOf({ kind: KINDS.UNWRITTEN, at: "" }, { plan: PLAN }), ["frd"])
})

// Якорь — договор между ролью и машиной: нашли строку дословно или отказали. Иначе фиксер,
// промахнувшийся якорем, тихо пишет не туда (прогон 19.08.2026: пласт A переписал FRD с нуля).
test("правка по якорю: заменяет, вставляет, и ОТКАЗЫВАЕТ на ненайденном", () => {
  const one = applyPatch({
    text: PLAN,
    patch: "REPLACE: fields: id: String — auto-generated unique identifier\nfields: id: String — идентификатор ресурса",
  })
  assert.equal(one.ok, true)
  assert.match(one.value, /идентификатор ресурса/)
  assert.equal(one.value.includes("auto-generated"), false)

  const two = applyPatch({
    text: PLAN,
    patch: "INSERT AFTER: ## 1. src/main/java/ai/labs/eddi/configs/glossaries/model/Glossary.java\nwhat: модель глоссария",
  })
  assert.equal(two.ok, true)
  assert.match(two.value, /Glossary\.java\n\s+what: модель глоссария/)

  const miss = applyPatch({ text: PLAN, patch: "REPLACE: строки, которой нет\nчто-то" })
  assert.equal(miss.ok, false)
  assert.equal(miss.error.cls, "no-anchor")
  assert.match(miss.error.detail, /no such line in the file/)

  assert.equal(applyPatch({ text: PLAN, patch: "просто текст без правок" }).ok, false)
})

// Строка FEEDBACK помечена ИСТОЧНИКОМ: роль чинит находку критика и собственную опечатку по-разному,
// и различает их по префиксу — тот же договор, что у шага 11 (steps/review/review.mjs::feedbackLines).
test("feedbackFor: `critic:` про содержание, `guardrail:` про свой прошлый ответ", () => {
  const out = feedbackFor({
    findings: "R17 | PLAN LOST | GlossaryService.java | заменить Map на Caffeine",
    rejected: "no such line in the file:\n  fields: cache: Map\nNothing was applied.",
  })
  const lines = out.split("\n")
  assert.match(lines[0], /^critic: R17 \| PLAN LOST/)
  assert.ok(lines.some((l) => l.startsWith("guardrail: no such line")), "промах не помечен источником")

  // без промаха — только строки критика; без находок — только промах; пусто — пустая строка
  assert.equal(feedbackFor({ findings: "a\nb" }).split("\n").every((l) => l.startsWith("critic: ")), true)
  assert.equal(feedbackFor({ rejected: "x" }), "guardrail: x")
  assert.equal(feedbackFor(), "")
})

// «Раздела в плане нет» — это ещё не «пересобери план». Пересборка читает ТРЕБОВАНИЕ: модуля, о
// котором оно молчит, она не создаст, а дизайнеру запрещено добавлять модули от себя.

// Заголовок с отступом — не раздел, а текст внутри соседа: его не видит ни покрытие, ни нарезка.
test("hiddenHeads: заголовок с отступом найден, обычный — нет", () => {
  const good = "## src/app/A.java\nwhat: работа\n\n## src/app/B.java\nwhat: ещё\n"
  assert.deepEqual(hiddenHeads(good), [])
  const bad = `${good}  ## src/app/C.java  (edited)\n  what: невидимая работа\n`
  assert.deepEqual(hiddenHeads(bad).length, 1)
  assert.match(hiddenHeads(bad)[0], /C\.java/)
  assert.deepEqual(hiddenHeads(), [])
  assert.deepEqual(hiddenHeads("  ## просто заголовок без пути"), [], "прозу с отступом не судим")
})

// «ПУТЬ ЕСТЬ В ПЛАНЕ» — ЭТО РАЗДЕЛ, А НЕ УПОМИНАНИЕ. Путь модуля встречается в плане ещё и строкой
// `sample:` (образец стиля для соседа) и в `calls:` (кого зовут). Правка по якорю в таком месте
// закрыла бы находку строкой внутри ЧУЖОГО раздела — работа, которую никто не нарежет.
//
// BUG_FIX_CONTEXT: прогон 4f938cfe (20.08.2026). Критик впервые назвал путь
// `…/configs/agents/model/AgentConfiguration.java`, и маршрут отдал находку фиксеру ПЛАНА: путь
// стоял в плане строкой `sample:` соседа. Модуля в плане не было — чинить следовало требование.
test("routeOf: путь в `sample:` не делает модуль разделом плана", () => {
  const plan = ["## 3. src/app/Glossary.java",
    "sample: src/app/AgentConfiguration.java — POJO с полями и геттерами",
    "calls: src/app/Other.java"].join("\n")
  const f = { req: "R11", kind: KINDS.LOST, at: "src/app/AgentConfiguration.java", what: "добавить поле ссылок" }
  assert.deepEqual(routeOf(f, { plan, frd: "" }), ["frd"], "упоминание в `sample:` засчитано за раздел")
  assert.deepEqual(routeOf(f, { plan, frd: `<scenario nodes="src/app/AgentConfiguration.java"/>` }), ["design"],
    "требование модуль знает — виноват шаг 9, а не требование")
  assert.deepEqual(routeOf({ ...f, at: "src/app/Glossary.java" }, { plan, frd: "" }), ["plan"], "раздел есть — правка на месте")
  // Нумерация раздела не мешает: `## 3. <путь>` и `## <путь>` — одно и то же.
  assert.deepEqual(routeOf({ ...f, at: "src/app/Glossary.java" }, { plan: "## src/app/Glossary.java\nwhat: x", frd: "" }), ["plan"])
})
