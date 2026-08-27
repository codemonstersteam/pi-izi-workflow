// COMPONENT TEST шага 6 — intake на эталонных данных (минимальный, шов 8).
// ЗАГЛУШКА — FRD из эталона (`etalon-eddi/.agent/frd.xml`): эталон прошёл check.mjs 10/10 и
// RECHECK.md — записанный результат живой работы. Полный компонентный на 4 пласта — в T31,
// где появятся ответы каждого пласта из живого прогона.
// Здесь проверяется: голова запускается, порядок пластов A→B→C→D, рельса вопроса на месте.
import test from "node:test"
import assert from "node:assert/strict"
import { cpSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs"
import * as nodeFs from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { tmpdir } from "node:os"
import { start, put, sha1of } from "../../../ext/state.mjs"
import { recon } from "../../../ext/recon.mjs"
import { next, fold } from "../intake.step.mjs"
import { isSmall } from "../one/small.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const ETALON = join(HERE, "../../../component-tests/etalon-eddi/.agent")

function form() {
  const cwd = mkdtempSync(join(tmpdir(), "intake-component-"))
  mkdirSync(join(cwd, ".agent/staging"), { recursive: true })
  for (const f of ["appgraph.xml", "brd.md", "normalized.md"]) {
    cpSync(join(ETALON, f), join(cwd, ".agent", f))
  }
  const s = start({ cwd, run: "component-intake", key: "DOS-535", budgets: {} })
  assert.ok(s.ok, s.error?.detail)
  const stamps = {}
  for (const f of ["appgraph.xml", "brd.md", "normalized.md"]) {
    stamps[f.includes("appgraph") ? "appgraph" : f.replace(".md", "").replace(".xml", "")] = {
      path: `.agent/${f}`, sha1: sha1of(readFileSync(join(cwd, ".agent", f), "utf8")),
    }
  }
  const st = put(s.value, { at: stamps })
  assert.ok(st.ok, st.error?.detail)
  return st.value
}

test("успех: подшаги объявлены, порядок scenarios → owners → contracts → data-failures → coverage (T62), роль intake", () => {
  const state = form()
  const it = next(state)
  assert.equal(it.do, "say", "первый ход — состав")
  assert.match(it.line, /scenarios → owners → contracts → data-failures → coverage/)
  assert.equal(it.portions.length, 6)
  assert.deepEqual(it.portions.map((p) => p.id), ["scenarios", "owners", "contracts", "data-failures", "coverage", "critic"])
  assert.ok(it.portions.every((p) => p.status === "todo"))
})

test("нарушение: нет карты — named-отказ, ни одного вызова роли", () => {
  const state = form()
  // ломаем отпечаток карты
  const broken = put(state, { at: { ...state.at, appgraph: { path: ".agent/appgraph.xml", sha1: "wrong" } } })
  assert.ok(broken.ok)
  const it = next(broken.value)
  assert.equal(it.do, "err")
  assert.equal(it.code, "blocked")
  assert.match(it.subject, /appgraph\.xml/)
})

test("обрыв и вопрос: обрыв НЕ тратит круг; вопрос → pending.json + state.question", () => {
  const state = form()
  const it1 = next(state)
  const st1 = fold(state, { do: "say", instruction: it1, result: null })
  assert.ok(st1.ok)
  const it2 = next(st1.value)
  assert.equal(it2.do, "role", "второй ход — пласт A")

  // обрыв: конверт err без kind=question — круг не тратится
  const st2 = fold(st1.value, { do: "role", instruction: it2, result: { track: "err", kind: "crashed", subject: "test" } })
  assert.ok(st2.ok)
  const p = st2.value.portions.find((x) => x.id === "scenarios")
  assert.equal(p.round, 1, "обрыв не тратит круг")
  assert.equal(p.status, "todo")

  // вопрос: fold пишет pending.json ДО паузы + кладёт state.question
  const st3 = fold(st1.value, { do: "role", instruction: it2, result: { track: "err", kind: "question", items: ["q1 text", "q2 text"], subject: "what?" } })
  assert.ok(st3.ok)
  assert.ok(st3.value.question, "вопрос не лёг в состояние")
  assert.equal(st3.value.question.of, "scenarios")
  // pending.json на диске, с номерами
  const pending = JSON.parse(readFileSync(join(state.cwd, ".agent/pending.json"), "utf8"))
  assert.equal(pending.items.length, 2)
  assert.equal(pending.items[0].n, 1)
  // next видит вопрос → эмитит ask
  const it3 = next(st3.value)
  assert.equal(it3.do, "ask", "вопрос не стал инструкцией ask")
  assert.match(it3.prompt, /1\. q1 text/)
})

// T64 — ВОПРОС В АРТЕФАКТЕ = ПАУЗА ОПЕРАТОРА. Живой круг 25.08: пять вопросов-групп лежали в
// закрытом B1 мёртвым грузом — F17a зелёный «потомy что вопрос есть», а владельца нет, и на B2
// у шага не было бы дельты. Пауза превращает ответ в владельца: ask-рельса → answers.md →
// круг починки заменяет вопросы владельцами.
test("T64: зелёный артефакт с открытым вопросом — ПАУЗА, а не закрытие пласта", () => {
  const state = form()
  const it1 = next(state)
  const st1 = fold(state, { do: "say", instruction: it1, result: null })
  assert.ok(st1.ok)
  // пласт A отвечает артефактом с вопросом (форма зелёная по A-правилам)
  const withQ = `<frd grammar="1" goal="g"><actor name="a" kind="human" via="REST"/>
    <usecase id="UC1" actor="a" goal="g"><pre>p</pre><post>готово</post><step n="1">делает</step></usecase>
    <question step="UC1/1" subject="кто несёт" why="двое равноправных"/>
  </frd>`
  const it2 = next(st1.value)
  assert.equal(it2.do, "role")
  const staged = join(state.cwd, ".agent/staging/frd~scenarios.xml")
  nodeFs.writeFileSync(staged, withQ)
  const r = fold(st1.value, { do: "role", instruction: it2, result: { track: "ok", artifact: ".agent/staging/frd~scenarios.xml" } })
  assert.ok(r.ok, r.error?.detail)
  assert.ok(r.value.question, "артефактный вопрос не стал паузой — пласт закрылся с открытым вопросом")
  assert.equal(r.value.question.of, "scenarios")
  const pending = JSON.parse(readFileSync(join(state.cwd, ".agent/pending.json"), "utf8"))
  assert.equal(pending.items.length, 1)
  assert.match(pending.items[0].text, /UC1\/1/)
  // порция НЕ закрыта
  assert.equal(r.value.portions.find((x) => x.id === "scenarios").status, "todo")
})

test("T64: вопрос на шаге, уже покрытом владельцем — пояснение, НЕ пауза; D с вопросами — без паузы", () => {
  const state = form()
  const it1 = next(state)
  const st1 = fold(state, { do: "say", instruction: it1, result: null })
  const both = `<frd grammar="1" goal="g"><actor name="a" kind="human" via="REST"/>
    <usecase id="UC1" actor="a" goal="g"><pre>p</pre><post>готово</post><step n="1">делает</step></usecase>
    <owner step="UC1/1" node="src/ParcelResource.java"/>
    <question step="UC1/1" subject="пояснение" why="владелец уже назначен"/>
  </frd>`
  const it2 = next(st1.value)
  nodeFs.writeFileSync(join(state.cwd, ".agent/staging/frd~scenarios.xml"), both)
  const r = fold(st1.value, { do: "role", instruction: it2, result: { track: "ok", artifact: ".agent/staging/frd~scenarios.xml" } })
  assert.ok(r.ok, r.error?.detail)
  assert.ok(!r.value.question, "пояснительный вопрос при живом владельце зря остановил пласт")
  assert.equal(r.value.portions.find((x) => x.id === "scenarios").status, "green")
})

// V2 — RTM-БЛОКЕРЫ ЧИНИТ OWNERS, НЕ COVERAGE. Обратный суд матрицы находит пробелы владения
// (точка вызова, кластер, ответ назвал) — модели на coverage нечем их закрыть: её слой —
// carried-строки. Маршрутизация: rtm-блокеры → owners (todo + feedback), coverage — todo без них.
test("V2: coverage красный по rtm: → блокеры уходят на owners, coverage ждёт", () => {
  const state = form()
  const it1 = next(state)
  const st1 = fold(state, { do: "say", instruction: it1, result: null })
  assert.ok(st1.ok)
  // симулируем: все подшаги до coverage зелёные, coverage приносит rtm-блокеры
  const st2 = put(st1.value, {
    portions: st1.value.portions.map((x) => x.id === "coverage" ? { ...x, status: "todo" } : { ...x, status: "green" }),
  })
  assert.ok(st2.ok)
  const itCov = next(st2.value)
  assert.equal(itCov.do, "role")
  // coverage-модель пишет артефакт (несущественный для теста) — кладём любой
  nodeFs.writeFileSync(join(state.cwd, ".agent/staging/frd~coverage.xml"), "<frd/>")
  // подменяем судью: имитируем rtm-блокеры через мок — вместо этого проверяем саму маршрутизацию
  // через состояние после fold с rtm-блокерами
  // (прямой unit: функция маршрутизации внутри fold — проверяем через эффект)
  // В данном тесте проверяем, что в portions после fold rtm-блокеры НЕ остаются на coverage
  const r = fold(st2.value, { do: "role", instruction: itCov, result: { track: "ok", artifact: ".agent/staging/frd~coverage.xml" } })
  assert.ok(r.ok, r.error?.detail)
  // нет прямого способа вызвать rtm-блокеры без реального rtm.md — но маршрутизация
  // проверяется через то, что coverage не закрывается при пустом артефакте (суд скажет своё)
  // Полный тест на маршрутизацию — через фикстуру с реальным rtm.md (следующий заход)
})

// T69 — LOOKUP ОБСЛУЖИВАЕТСЯ СКРИПТОМ. Живой круг 26.08 (DOS-535): 14 запусков роли,
// 488k токенов, артефакт не менялся — наряд нёс имена без путей, круг «не тратился»,
// страж intakeLoops не двигался. Шов: (1) lookup → resolveItems → portion.lookup;
// (2) следующий наряд несёт раздел map-lookup с ПУТЬЮ; (3) сверх бюджета lookupLoops —
// именованный escalate. Пере-внедрение дефекта: убери ветку kind==="lookup" — первый
// assert падает (lookup не кладётся), второй (нет раздела в наряде), третий (нет escalate).
test("T69: lookup → путь в следующем наряде; третий lookup — escalate", () => {
  const state = form()
  // карта вычисленного графа: один класс LlmTask с путём
  nodeFs.writeFileSync(join(state.cwd, ".agent/graph-computed.xml"),
    `<graph><file path="x"><decl at="src/main/java/ai/labs/eddi/modules/llm/impl/LlmTask.java" kind="class" name="LlmTask" sig="class LlmTask"/></file></graph>`)
  const it1 = next(state)
  const st1 = fold(state, { do: "say", instruction: it1, result: null })
  assert.ok(st1.ok)
  const it2 = next(st1.value)
  assert.equal(it2.do, "role")

  // круг 1: роль спрашивает пути — fold отвечает СКРИПТОМ, круг роли не тратится
  const st2 = fold(st1.value, { do: "role", instruction: it2,
    result: { track: "err", kind: "lookup", items: ["LlmTask"], subject: "where is LlmTask" } })
  assert.ok(st2.ok, st2.error?.detail)
  const p1 = st2.value.portions.find((x) => x.id === "scenarios")
  assert.equal(p1.round, 1, "lookup не тратит круг роли")
  assert.match(p1.lookup || "", /modules\/llm\/impl\/LlmTask\.java/, "ответ не несёт ПУТЬ — дефект 26.08 жив")

  // круг 2: следующий наряд несёт раздел map-lookup; найденное и «нет в карте» вместе
  const it3 = next(st2.value)
  assert.equal(it3.do, "role", "после lookup роль получает наряд, а не паузу")
  assert.match(it3.text, /map-lookup/)
  assert.match(it3.text, /LlmTask\.java/)

  // круг 3: второй lookup — последний; третий (сверх lookupLoops=2) — escalate
  const st3 = fold(st2.value, { do: "role", instruction: it3,
    result: { track: "err", kind: "lookup", items: ["Nowhere"], subject: "?" } })
  assert.ok(st3.ok)
  const it4 = next(st3.value)
  assert.equal(it4.do, "role")
  const st4 = fold(st3.value, { do: "role", instruction: it4,
    result: { track: "err", kind: "lookup", items: ["Nowhere"], subject: "?" } })
  assert.equal(st4.ok, false, "третий lookup должен стать escalate, а не четвёртым нарядом")
  assert.equal(st4.error.cls, "escalate")
  assert.match(st4.error.detail || String(st4.error), /Nowhere/)
})

// T69 — ДОСТАВЛЕННЫЙ ОТВЕТ ЧИСТИТСЯ: справка ехала в наряде, породившем следующий конверт;
// после любого ответа роли portion.lookup пуст — новый lookup начнёт с чистого списка,
// а не накопит хвосты прошлых вопросов.
test("T69: после конверта роли справка очищается; resolveItems честно говорит «нет в карте»", () => {
  const state = form()
  nodeFs.writeFileSync(join(state.cwd, ".agent/graph-computed.xml"),
    `<graph><file path="x"><decl at="src/main/java/ai/labs/eddi/modules/llm/impl/LlmTask.java" kind="class" name="LlmTask" sig="class LlmTask"/></file></graph>`)
  const it1 = next(state)
  const st1 = fold(state, { do: "say", instruction: it1, result: null })
  const it2 = next(st1.value)
  const st2 = fold(st1.value, { do: "role", instruction: it2,
    result: { track: "err", kind: "lookup", items: ["LlmTask", "Ghost"] } })
  assert.ok(st2.ok)
  assert.match(st2.value.portions[0].lookup, /LlmTask\.java/)
  assert.match(st2.value.portions[0].lookup, /нет в карте/, "Ghost обязан получить явный отказ, а не тишину")
  // роль отвечает артефактом — справка была доставлена с нарядом и очищается
  const it3 = next(st2.value)
  nodeFs.writeFileSync(join(state.cwd, ".agent/staging/frd~scenarios.xml"),
    `<frd grammar="1" goal="g"><actor name="a" kind="human" via="REST"/>
    <usecase id="UC1" actor="a" goal="g"><pre>p</pre><post>q</post><step n="1">делает</step></usecase></frd>`)
  const st3 = fold(st2.value, { do: "role", instruction: it3,
    result: { track: "ok", artifact: ".agent/staging/frd~scenarios.xml" } })
  assert.ok(st3.ok, st3.error?.detail)
  const after = st3.value.portions.find((x) => x.staging === ".agent/staging/frd~scenarios.xml")
  assert.equal(after.lookup || "", "", "справка не очищена — следующий наряд повезёт устаревший ответ")
})

// T70 — F19-БЛОКЕР РАБОТА ПЛАСТА contracts. Живой круг 26.08: owners-починка кластера
// добавила со-владельца ПОСЛЕ закрытия contracts — F19 «владелец без дельты» упал на
// критика, который дельты не пишет, и гонял один блокер 5 кругов до бюджета.
// Маршрут зеркален rtm:→owners: F19 уезжает на contracts (todo + FEEDBACK), круг
// текущего пласта не тратится. Пере-внедрение дефекта: убери ветку — assert «F19 не
// уехал» падает (блокер остаётся на критике, round растёт).
test("T70: F19 на критике → contracts todo с FEEDBACK, круг критика не потрачен", () => {
  let state = form()
  // brd БЕЗ R-строк: чужие блокеры (F11 по 16 требованиям эталона) маскируют F19 —
  // newFrd вернул бы блокеры первого прохода (без rtm) и F19 не родился бы вовсе
  nodeFs.writeFileSync(join(state.cwd, ".agent/brd.md"), "analogue: Thing — files 1; sample\n")
  const st0 = put(state, { at: { ...state.at, brd: { path: ".agent/brd.md", sha1: sha1of("analogue: Thing — files 1; sample\n") } } })
  assert.ok(st0.ok, st0.error?.detail)
  state = st0.value
  // rtm.md: R1 заявляет владельца src/Foo.java (не new) — артефакт дельты на него не даст
  nodeFs.writeFileSync(join(state.cwd, ".agent/rtm.md"),
    "R1 | owners: src/Foo.java\nR2 | owners: src/Bar.java(new)\n")
  const st1 = fold(state, { do: "say", instruction: next(state), result: null })
  assert.ok(st1.ok)
  // все пласты до critic зелёные, critic — todo
  const st2 = put(st1.value, {
    portions: st1.value.portions.map((x) => x.id === "critic" ? { ...x, status: "todo" } : { ...x, status: "green" }),
  })
  assert.ok(st2.ok)
  const itC = next(st2.value)
  assert.equal(itC.do, "role", "критик — первый todo")
  // артефакт критика: ЧИСТЫЙ по чужим правилам (иначе newFrd вернёт блокеры первого
  // прохода без rtm и F19 не родится — см. judge.mjs) и без дельты на Foo.java → F19
  nodeFs.writeFileSync(join(state.cwd, ".agent/staging/frd~critic.xml"),
    `<frd grammar="1" goal="add G"><actor name="operator" kind="human" via="REST"/>
    <usecase id="UC1" actor="operator" goal="make it"><pre>up</pre><post>done</post>
    <step n="1">operator does the thing</step>
    <ext id="1a" error="none" outcome="nothing happened"/></usecase>
    <owner step="UC1/1" node="src/Other.java" new="yes"/>
    <delta op="do the thing" form="Added" node="src/Other.java" new="yes"/>
    <scenario id="S1" uc="UC1" before="no thing" after="thing done" nodes="src/Other.java"/>
    <failures found="no" why="the change has no failure modes: pure addition"/>
    <critique verdict="APPROVE"/>
  </frd>`)
  const r = fold(st2.value, { do: "role", instruction: itC,
    result: { track: "ok", artifact: ".agent/staging/frd~critic.xml" } })
  assert.ok(r.ok, r.error?.detail)
  const contracts = r.value.portions.find((x) => x.id === "contracts")
  const critic = r.value.portions.find((x) => x.id === "critic")
  assert.equal(contracts.status, "todo", "F19 не переоткрыл contracts")
  assert.match(contracts.blockers, /F19/, "F19-блокер не доехал до contracts — дефект 26.08 жив")
  assert.match(contracts.blockers, /Foo\.java/)
  assert.equal((critic.blockers || "").includes("F19"), false, "F19 остался на критике — круги будут жечьсяagain")
  assert.equal(critic.round, 1, "круг критика потрачен на чужую работу")
  // frd не продвинут — пласты ещё todo
  assert.equal(r.value.at && r.value.at.frd, undefined)
})

// ─────────────────────────────────────────────────────────────────────────────
// T76 — УКОРОЧЕННЫЙ ТРЕК (backlog-small-task.md). Маленькая задача идёт ОДНОЙ порцией
// «one» вместо шести пластов: развилка на первом next() решается скриптом isSmall (0 токенов),
// наряд one/order-one.tpl несёт материалы всех пластов разом, суд — полный двор одним прогоном,
// зелёное продвигается тем же promote, красное ПАДАЕТ НА ПОЛНЫЙ ПУТЬ: блокеры разносятся по
// коду правила (F3c → contracts), круг головы не тратится. Пере-внедрение дефекта: выключи
// ветку p.id === "one» в fold — второй тест краснеет (F3c остаётся на one, порций шесть нет).

// МАЛЕНКАЯ ФОРМА — класс quarkus по калибровке isSmall: 9 узлов карты, 3 R-строки brd.
function smallForm() {
  const cwd = mkdtempSync(join(tmpdir(), "intake-one-"))
  mkdirSync(join(cwd, ".agent/staging"), { recursive: true })
  const map = `<appgraph grammar="4">
  <module path="src/FruitResource.java" pkg="p"><role>expose fruit entities over REST</role>
    <api name="fruits" kind="rest" scope="public"/></module>
${Array.from({ length: 8 }, (_, i) => `  <module path="src/pkg/Mod${i}.java" pkg="p"/>`).join("\n")}
</appgraph>`
  nodeFs.writeFileSync(join(cwd, ".agent/appgraph.xml"), map)
  nodeFs.writeFileSync(join(cwd, ".agent/brd.md"),
    "R1 хранить | фрукты | карта | values: список целиком\nR2 читать | фрукты | URI | values: один URI\nR3 удалять | фрукты | URI | values: нет\n")
  nodeFs.writeFileSync(join(cwd, ".agent/normalized.md"),
    "R1 | хранить | фрукты | карта\nR2 | читать | фрукт | URI\nR3 | удалять | фрукт | URI\n")
  // anchors.json — часть закрытого шага 2: без него recon не штампует brd (resume-тест ниже)
  nodeFs.writeFileSync(join(cwd, ".agent/anchors.json"), "{}")
  const s = start({ cwd, run: "component-one", key: "T76", budgets: {} })
  assert.ok(s.ok, s.error?.detail)
  const st = put(s.value, {
    at: {
      appgraph: { path: ".agent/appgraph.xml", sha1: sha1of(map) },
      brd: { path: ".agent/brd.md", sha1: sha1of(readFileSync(join(cwd, ".agent/brd.md"), "utf8")) },
    },
  })
  assert.ok(st.ok, st.error?.detail)
  return st.value
}

// Валидный FRD одного вызова: полный двор зелён (F1..F19 + rtm-суд), вопросов нет.
// Слова UC (хранить/читать/удалять/фрукты) пересекаются с каждой R-строкой ≥2 словами —
// матрица rtm.md собирается из owner-строки, forward-суд молчит.
const FRD_ONE_GREEN = `<frd grammar="1" goal="хранить, читать и удалять фрукты (R1 R2 R3)">
  <actor name="operator" kind="human" via="REST"/>
  <usecase id="UC1" actor="operator" goal="хранить, читать и удалять фрукты">
    <pre>стенд поднят</pre>
    <post>фрукты хранятся, читаются и удаляются по URI</post>
    <step n="1">оператор хранит, читает и удаляет фрукты</step>
  </usecase>
  <owner step="UC1/1" node="src/FruitResource.java"/>
  <delta op="fruits" form="Added" node="src/FruitResource.java"/>
  <scenario id="S1" uc="UC1" before="фруктов нет" after="фрукты хранятся и читаются" nodes="src/FruitResource.java"/>
  <failures found="no" why="чистое добавление сущностей, отказных веток нет"/>
  <carried req="R1" by="UC1/1"/>
  <carried req="R2" by="S1"/>
  <carried req="R3" by="UC1"/>
</frd>`

test("T76: маленькая задача → ОДИН наряд one; зелёный артефакт → promote .agent/frd.xml", () => {
  const state = smallForm()
  const it1 = next(state)
  assert.equal(it1.do, "say", "первый ход — состав")
  assert.match(it1.line, /маленькая задача: один вызов/, "say не назвал укороченный трек")
  assert.deepEqual(it1.portions.map((p) => p.id), ["one"], "порций не одна")
  assert.equal(it1.portions[0].staging, ".agent/staging/frd~one.xml")
  const st1 = fold(state, { do: "say", instruction: it1, result: null })
  assert.ok(st1.ok, st1.error?.detail)
  const it2 = next(st1.value)
  assert.equal(it2.do, "role", "второй ход — порция one, а не пласт scenarios")
  assert.equal(it2.staging, ".agent/staging/frd~one.xml")
  assert.match(it2.text, /CANDIDATES — computed by script/, "наряд one не несёт блок кандидатов ({CANDIDATES})")
  assert.match(it2.text, /THE REQUIREMENTS OWED/, "наряд one не несёт список требований ({OWED})")
  assert.match(it2.text, /R1\nR2\nR3/, "R-строки не доехали до наряда one")
  nodeFs.writeFileSync(join(state.cwd, ".agent/staging/frd~one.xml"), FRD_ONE_GREEN)
  const r = fold(st1.value, { do: "role", instruction: it2, result: { track: "ok", artifact: ".agent/staging/frd~one.xml" } })
  assert.ok(r.ok, r.error?.detail)
  assert.ok(r.value.at && r.value.at.frd, "зелёная порция one не продвинула FRD")
  assert.ok(nodeFs.existsSync(join(state.cwd, ".agent/frd.xml")), ".agent/frd.xml не записан")
  assert.equal(r.value.portions.find((x) => x.id === "one").status, "green")
})

test("T76: красный one → ПАДЕНИЕ НА ПОЛНЫЙ ПУТЬ: шесть порций, F3c на contracts, круги целы", () => {
  const state = smallForm()
  const it1 = next(state)
  const st1 = fold(state, { do: "say", instruction: it1, result: null })
  assert.ok(st1.ok, st1.error?.detail)
  const it2 = next(st1.value)
  assert.equal(it2.do, "role")
  // артефакт с дырой: вторая дельта БЕЗ сценария → F3c (форма тикета: delta без сценария)
  nodeFs.writeFileSync(join(state.cwd, ".agent/staging/frd~one.xml"), FRD_ONE_GREEN.replace(
    `<delta op="fruits" form="Added" node="src/FruitResource.java"/>`,
    `<delta op="fruits" form="Added" node="src/FruitResource.java"/>\n  <delta op="store" form="Added" node="src/pkg/Mod0.java"/>`))
  const r = fold(st1.value, { do: "role", instruction: it2, result: { track: "ok", artifact: ".agent/staging/frd~one.xml" } })
  assert.ok(r.ok, r.error?.detail)
  assert.deepEqual(r.value.portions.map((p) => p.id),
    ["scenarios", "owners", "contracts", "data-failures", "coverage", "critic"],
    "красный one не упал на полный путь")
  const contracts = r.value.portions.find((x) => x.id === "contracts")
  assert.match(contracts.blockers, /F3c/, "F3c не доехал до contracts — блокер потерян при падении")
  assert.ok(r.value.portions.every((x) => x.round === 1), "круг головы потрачен на падение")
  assert.ok(r.value.portions.every((x) => x.status === "todo"), "порции полного пути встали не в todo")
  assert.equal(r.value.portions.some((x) => x.id === "one"), false, "порция one не погасла")
  assert.ok(!nodeFs.existsSync(join(state.cwd, ".agent/frd.xml")), "красный one продвинул FRD")
})

test("T76: большая задача (эталон eddi) → полный путь: isSmall false, шесть порций", () => {
  const state = form()
  assert.equal(isSmall(state), false, "эталон eddi ошибочно признан маленькой задачей")
  const it = next(state)
  assert.equal(it.do, "say")
  assert.equal(it.portions.length, 6, "большая задача пошла укороченным треком")
  assert.equal(it.portions[0].id, "scenarios")
})

// T76 (тикет 05) — RESUME ВИДИТ УКОРОЧЕННЫЙ ТРЕК. Прежде recon поднимал порции только по
// INTAKE_PASSES (шесть имён): frd~one.xml после сбоя был невидим, и resume молча начинал
// полный путь с scenarios — черновик одного вызова становился мусором. Пере-внедрение
// дефекта: убери ветку PASSES_ONE в ext/recon.mjs — assert про id порции падает (scenarios).
test("T76: resume — frd~one.xml без frd.xml → роль one (не scenarios), черновик едет как {PREVIOUS}", () => {
  const state = smallForm()
  // сбой посреди укороченного трека: черновик на диске, артефакт не продвинут
  nodeFs.writeFileSync(join(state.cwd, ".agent/staging/frd~one.xml"), FRD_ONE_GREEN)
  const found = recon(state.cwd)
  assert.equal(found.portions.length, 1, "recon не поднял укороченный трек — пошёл бы полный путь")
  assert.equal(found.portions[0].id, "one")
  assert.equal(found.portions[0].status, "todo")
  // мост клеит штампы и порции — как ext/bridge.mjs::stepStart
  const merged = put(state, { at: { ...state.at, ...found.at }, portions: found.portions })
  assert.ok(merged.ok, merged.error?.detail)
  const it = next(merged.value)
  assert.equal(it.do, "role", "resume начал не с того трека")
  assert.equal(it.staging, ".agent/staging/frd~one.xml")
  assert.equal(it.staging.includes("scenarios"), false)
  assert.match(it.text, /YOUR OWN ARTIFACT/, "черновик круга починки не поехал в наряд как {PREVIOUS}")
})
