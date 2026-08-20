// TEST_CONTRACT: steps/review/review.mjs — критик судит ТРЕБОВАНИЕ, и его вердикт судится по форме
//
// Срез переписан нарядами J6a-J6c (`tasks/j6-critic-frd.md`): предмет шага 11 — не план, а FRD
// против TASK.md и brd.md. Отсюда всё остальное: чек-листов два (долг перед требованиями и
// обратный ход — элементы артефакта, которых не просило ни одно требование), адрес находки —
// элемент FRD, словарь кодов сокращён до четырёх, а правило R6 (узел без своей команды проверки)
// ушло вместе с планом: верифицируемость узла — свойство РЕПОЗИТОРИЯ, и её судит гейт шага 6.
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { parseFrd } from "../intake/frd.mjs"
import { newReview, parseReview, owedItems, unbackedItems, autoFindings, feedbackLines, frdIds, passOf, criticEntry, CODES, CODE_CULPRIT, CODE_OWNER, OPERATOR_NOTE } from "./review.mjs"

const FRD = parseFrd(`<frd grammar="1" goal="искать посылку по номеру">
  <actor name="api" kind="system" via="HTTP /parcels"/>
  <usecase id="UC1" actor="api" goal="найти посылку">
    <pre>реестр не пуст</pre>
    <post>вернулись только совпавшие</post>
    <step n="1">клиент шлёт GET /parcels?track=…</step>
    <step n="2">система сужает реестр до совпавших</step>
    <ext id="2a" error="NOT_FOUND" outcome="совпадений нет, вернулся пустой список"/>
  </usecase>
  <usecase id="UC9" actor="api" goal="выгрузить архив посылок в S3">
    <post>архив лежит в бакете</post>
    <step n="1">админ просит выгрузку</step>
  </usecase>
  <failure code="NOT_FOUND" status="404" client="ничего не найдено" operator="—" from="UC1/2a"/>
  <delta op="GET /parcels" form="Changed" node="src/ParcelResource.java" from="list()" to="list(track)"/>
  <delta op="ArchiveJob" form="Added" node="src/ArchiveJob.java" new="yes"/>
  <scenario id="S1" uc="UC1" before="весь реестр" after="только совпавшие" nodes="src/ParcelResource.java"/>
  <nfr subject="latency" fit="p95 &lt; 200 мс" source="brd.md"/>
  <carried req="R1" by="UC1/2"/>
  <carried req="R2" by="nfr:latency"/>
</frd>`)
const REQS = [
  { id: "R1", statement: "Посылку можно найти по номеру", fit: "список сужается до совпавших" },
  { id: "R2", statement: "Задержка поиска не растёт", fit: "p95 < 200 мс" },
]
const judge = (xml, over = {}) => newReview({ xml, frd: FRD, requirements: REQS, ...over })

// --- чек-листы: два хода одного вопроса ----------------------------------------------------------

test("долг считается из ТРЕБОВАНИЙ, и id строки — номер требования, который роль копирует", () => {
  const rows = owedItems({ requirements: REQS })
  assert.deepEqual(rows.map((r) => r.id), ["R1", "R2"])
  assert.match(rows[0].what, /Посылку можно найти по номеру · fit: список сужается/)
  // Плана в сигнатуре нет вовсе: шаг 11 переехал ВЫШЕ него.
  assert.deepEqual(owedItems({}), [])
  assert.deepEqual(owedItems(), [])
})

// ОБРАТНЫЙ ХОД куплен ручным прогоном роли по артефактам eddi (19.08.2026): прямой закрыл все 18
// строк долга и не заметил целого use case UC8 — синхронизации с удалённым инстансом, которой не
// просит ни TASK.md, ни одно требование BRD. Четыре наряда работы, которую никто не заказывал.
test("обратный ход: элемент, которого не просило ни одно требование, становится строкой", () => {
  const rows = unbackedItems({ frd: FRD })
  const ids = rows.map((r) => r.id)
  assert.ok(ids.includes("UC9"), `UC9 никем не заявлен: ${ids.join(", ")}`)
  assert.ok(ids.includes("src/ArchiveJob.java"), "дельта, не лежащая ни на одном заявленном сценарии")
  assert.match(rows.find((r) => r.id === "UC9").what, /use case «выгрузить архив посылок в S3»/)

  // ПРИНАДЛЕЖНОСТЬ ТРАНЗИТИВНА: строка `by="UC1/2"` заявляет весь UC1, его сценарий S1 и узлы, через
  // которые тот проходит. Без этого список кричал бы на каждую дельту заявленного требования.
  assert.equal(ids.includes("UC1"), false)
  assert.equal(ids.includes("S1"), false)
  assert.equal(ids.includes("src/ParcelResource.java"), false)

  // Ни одной строки `<carried>` — судить не по чему, и «всё подозрительно» не рассуждение.
  const bare = parseFrd('<frd grammar="1" goal="x"><usecase id="UC1" actor="a" goal="g"><step n="1">s</step></usecase></frd>')
  assert.deepEqual(unbackedItems({ frd: bare }), [])
  assert.deepEqual(unbackedItems({}), [])
})

test("frdIds: адресом может быть use case, его ШАГ, ветвление, сценарий, код отказа, op дельты, nfr", () => {
  const ids = frdIds(FRD)
  for (const one of ["UC1", "UC1/post", "UC1/1", "UC1/2", "UC1/2a", "S1", "NOT_FOUND", "GET /parcels", "nfr:latency"]) {
    assert.ok(ids.has(one), `${one} не резолвится`)
  }
})

// --- вердикт как форма ---------------------------------------------------------------------------

const PASS = `<review verdict="Pass" grammar="2">
  <covers item="R1" node="UC1/2"/>
  <covers item="R2" node="nfr:latency"/>
  <covers item="UC9" node="UC9"/>
  <covers item="src/ArchiveJob.java" node="UC9"/>
</review>`

test("Pass закрывает ОБА списка и не несёт ни одного блокера", () => {
  const r = judge(PASS)
  assert.equal(r.ok, true, r.ok ? "" : r.error.detail)
  assert.equal(r.value.verdict, "Pass")
  assert.deepEqual([...r.value.blockers], [])
})

test("R5: незакрытая строка ЛЮБОГО из двух списков — красная форма, и она называет список", () => {
  const noDebt = PASS.replace('  <covers item="R2" node="nfr:latency"/>\n', "")
  assert.match(judge(noDebt).error.detail, /R5 «долг» — пункт "R2"/)
  const noSuspect = PASS.replace('  <covers item="UC9" node="UC9"/>\n', "")
  assert.match(judge(noSuspect).error.detail, /R5 «не заявлено» — пункт "UC9"/)
  // Дважды закрытая строка — тоже дефект: один пункт, одна строка.
  const twice = PASS.replace('<covers item="R1" node="UC1/2"/>', '<covers item="R1" node="UC1/2"/><covers item="R1" node="UC1/1"/>')
  assert.match(judge(twice).error.detail, /R5 пункт "R1" закрыт 2 раз/)
  // Пункт, которого в списках нет, роль сочинила: пункты выдаёт машина.
  const invented = PASS.replace('<covers item="R1" node="UC1/2"/>', '<covers item="R1" node="UC1/2"/><covers item="R7" node="UC1"/>')
  assert.match(judge(invented).error.detail, /R5 <covers item="R7"\/> — такого пункта в списках нет/)
})

test("R7: строку закрывает ЭЛЕМЕНТ FRD, а не что попало", () => {
  const alien = PASS.replace('<covers item="R1" node="UC1/2"/>', '<covers item="R1" node="src/Nowhere.java"/>')
  assert.match(judge(alien).error.detail, /R7 <covers item="R1" node="src\/Nowhere\.java"\/> — node не элемент FRD/)
})

test("R1: вердикт и его тело обязаны говорить одно", () => {
  assert.match(judge('<review verdict="Maybe" grammar="2"/>').error.detail, /R1 verdict="Maybe"/)
  assert.match(judge('<review verdict="Reject" grammar="2"/>').error.detail, /R1 verdict=Reject, но ни одного <blocker>/)
  assert.match(judge(PASS.replace("</review>", '<blocker code="invented-value" node="UC9" evidence="в задаче нет выгрузки">x</blocker></review>')).error.detail,
    /R1 verdict=Pass при 1 <blocker>/)
})

test("R2: код вне словаря замыкает свой блокер — три блокера на один дефект стоят трёх починок", () => {
  const bad = `<review verdict="Reject" grammar="2"><blocker code="made-up" node="UC1" evidence="R1">x</blocker></review>`
  const detail = judge(bad).error.detail
  assert.match(detail, /R2 блокер 1: code="made-up" вне словаря/)
  assert.equal(/R3 блокер 1/.test(detail), false, "код решает, что значат остальные правила")
})

test("R3: адрес находки — элемент FRD; у open-question его нет по существу", () => {
  const ghost = `<review verdict="Reject" grammar="2"><blocker code="goal-not-delivered" node="UC7" evidence="UC1/post">x</blocker></review>`
  assert.match(judge(ghost).error.detail, /R3 блокер 1 \(goal-not-delivered\): node="UC7" не элемент FRD/)
  const q = `<review verdict="Reject" grammar="2"><blocker code="open-question" node="question:track-format" evidence="UC1">x</blocker></review>`
  assert.equal(/R3 /.test(judge(q).error.detail || ""), false, "находка о ТРЕБОВАНИИ адресуется синтетически")
})

test("R4: род улики задан кодом — требование, цитата или элемент FRD", () => {
  const wrongReq = `<review verdict="Reject" grammar="2"><blocker code="requirement-not-carried" node="UC1" evidence="R9">x</blocker></review>`
  assert.match(judge(wrongReq).error.detail, /R4 блокер 1 \(requirement-not-carried\): evidence="R9" не номер требования BRD/)
  const noQuote = `<review verdict="Reject" grammar="2"><blocker code="invented-value" node="UC9" evidence="">x</blocker></review>`
  assert.match(judge(noQuote).error.detail, /R4 блокер 1 \(invented-value\): улика пуста/)
  const wrongFrd = `<review verdict="Reject" grammar="2"><blocker code="goal-not-delivered" node="UC1" evidence="S9">x</blocker></review>`
  assert.match(judge(wrongFrd).error.detail, /R4 блокер 1 \(goal-not-delivered\): evidence="S9" не id FRD/)
  const noText = `<review verdict="Reject" grammar="2"><blocker code="requirement-not-carried" node="UC1" evidence="R2"></blocker></review>`
  assert.match(judge(noText).error.detail, /текст блокера пуст/)
})

// Живая улика прогона eddi: `resourceURI` в словаре при BRD «only id + version + terms». Машине это
// недоступно — значение ЕСТЬ в источнике, но источник его ЗАПРЕЩАЕТ; поэтому улика здесь ЦИТАТА.
test("Reject разрешается, и виновник с владельцем ВЫВЕДЕНЫ из кода, а не прочитаны из файла", () => {
  const xml = `<review verdict="Reject" grammar="2">
  <covers item="R1" node="UC1/2"/>
  <covers item="R2" node="nfr:latency"/>
  <covers item="src/ArchiveJob.java" node="UC9"/>
  <blocker code="invented-value" node="UC9" evidence="BRD: выгрузки в S3 не просит ни одно требование">целый use case, которого нет ни в задаче, ни в BRD</blocker>
</review>`
  const r = judge(xml)
  assert.equal(r.ok, true, r.ok ? "" : r.error.detail)
  assert.equal(r.value.verdict, "Reject")
  assert.deepEqual(r.value.blockers.map((b) => [b.code, b.culprit, b.owner]), [["invented-value", "frd.xml", 6]])
  // Блокер закрывает строку обратного списка своим АДРЕСОМ — второй раз её закрывать не нужно.
  assert.equal(r.value.blockers[0].node, "UC9")
})

test("отказы названы, ядро тотально", () => {
  assert.equal(newReview({}).error.cls, "empty")
  assert.equal(newReview({ xml: "" }).error.cls, "empty")
  assert.equal(judge('<review verdict="Pass" grammar="2"/>', { frd: parseFrd("<frd/>") }).error.cls, "no-frd")
  assert.equal(parseReview(undefined).found, false)
  assert.equal(parseReview("мусор").found, false)
})

test("разбор тотален и держит текст блокера ОДНОЙ строкой — его несёт рельса починки", () => {
  const p = parseReview(`<review verdict="Reject" grammar="2"><blocker code="invented-value" node="UC9" evidence="цитата">первая
  вторая   строка</blocker></review>`)
  assert.equal(p.found, true)
  assert.equal(p.blockers[0].text, "первая вторая строка")
})

// --- вопросы: находка, которой не нужна роль -----------------------------------------------------

test("открытый вопрос — блокер БЕЗ роли: его пишет машина, и он адресуется синтетически", () => {
  const withQ = parseFrd(`<frd grammar="1" goal="x">
  <usecase id="UC1" actor="a" goal="g"><step n="1">s</step></usecase>
  <question subject="track-format" why="формат трек-номера не определён"/>
</frd>`)
  const found = autoFindings({ frd: withQ })
  assert.equal(found.length, 1)
  assert.deepEqual([found[0].code, found[0].node], ["open-question", "question:track-format"])
  assert.match(found[0].text, /формат трек-номера не определён/)
  assert.deepEqual(autoFindings({}), [])
})

// --- словарь живёт в одном месте -----------------------------------------------------------------

test("словарь кодов один: код, роль и таблицы функций от него не расходятся", () => {
  assert.deepEqual([...CODES], ["requirement-not-carried", "invented-value", "goal-not-delivered", "open-question"])
  for (const code of CODES) {
    assert.equal(CODE_CULPRIT[code], "frd.xml", `${code}: критик судит требование — виновник всегда его артефакт`)
    assert.equal(CODE_OWNER[code], 6, `${code}: чинит роль шага 6, у артефакта одна роль`)
  }
  // Ни у одного кода нет адреса `operator`: все четыре чинятся переписыванием артефакта.
  assert.deepEqual(Object.keys(OPERATOR_NOTE), [])
  // Роль объявляет ТОТ ЖЕ словарь: разойдутся — этот тест краснеет раньше живого прогона.
  const role = readFileSync(new URL("critic.md", import.meta.url), "utf8")
  for (const code of CODES) assert.match(role, new RegExp(code), `роль не объявляет ${code}`)
  for (const gone of ["unreachable-antecedent", "node-not-required", "unverifiable-node"]) {
    assert.equal(role.includes(gone), false, `роль всё ещё несёт код плановой эпохи: ${gone}`)
  }
})

test("role frontmatter: описание роли не несёт голого двоеточия", () => {
  const role = readFileSync(new URL("critic.md", import.meta.url), "utf8")
  const line = role.split("\n").find((l) => l.startsWith("description:"))
  assert.ok(line, "у роли нет строки description")
  assert.equal(/^description:\s*[^"'].*:/.test(line), false, `${line} — двоеточие в незакавыченном YAML ломает разбор`)
})

// ФОРМА СТРОКИ FEEDBACK — КОНТРАКТ МЕЖДУ ДВУМЯ РОЛЯМИ, И ОНА СУДИТСЯ ЗДЕСЬ.
//
// Критик пишет, роль шага 6 разбирает: по префиксу `critic:` она отличает суждение о СОДЕРЖАНИИ от
// блокера гардрейла о ФОРМЕ, по коду выбирает ремонт (удалить — только для `invented-value`, для
// остальных запрещено). Пока строка собиралась в `workflows/izi.js`, проверить её было нечем, кроме
// регулярки по исходнику полосы — а такая проверка видит, что строка собрана, и не видит, из чего.
// Ровно так соседняя рельса уехала со счётчиком вместо таблицы на прогоне 64cebdda.
test("feedbackLines: префикс, код, адрес и улика — всё, по чему роль выбирает ремонт", () => {
  const line = feedbackLines([{ code: "invented-value", node: "UC7", evidence: "brd.md: экспорта не просит никто", text: "целый use case, которого нет в требовании" }])
  assert.match(line, /^critic: invented-value · UC7 · улика brd\.md: экспорта не просит никто — целый use case/)

  // Несколько находок — несколько строк, и роль обязана закрыть их все за один круг (её правило).
  const two = feedbackLines([
    { code: "requirement-not-carried", node: "UC1", evidence: "R2", text: "нечем" },
    { code: "goal-not-delivered", node: "UC3", evidence: "UC3/post", text: "недостижим" },
  ])
  assert.equal(two.split("\n").length, 2)
  assert.match(two, /critic: requirement-not-carried · UC1 · улика R2/)

  // Тотальность: пустой список — пустая строка, мусор отфильтрован, недостающие поля не рвут строку.
  assert.equal(feedbackLines(), "")
  assert.equal(feedbackLines([null, { text: "без кода" }]), "")
  assert.match(feedbackLines([{ code: "open-question" }]), /critic: open-question · — · улика —/)
})

// P5 — МАРШРУТ НАХОДКИ. Фикстура одна: чтобы «код не решает» было видно, все три случая ниже несут
// ОДИН код и разные элементы.
const ROUTED = parseFrd(`<frd goal="глоссарий подставляется в промпт">
  <actor name="оператор" kind="human" via="REST"/>
  <usecase id="UC1" actor="оператор" goal="завести термин">
    <pre>агент есть</pre><post>термин доступен</post><step n="1">оператор шлёт термин</step>
    <ext id="1a" error="GLOSSARY_KEY_INVALID" outcome="термин не заведён"/>
  </usecase>
  <delta op="POST /glossaries" form="Added" node="src/GlossaryResource.java" from="нет" to="есть"/>
  <scenario id="S1" uc="UC1" before="нет глоссария" after="есть" nodes="src/GlossaryResource.java"/>
  <touched path="src/ui/agents.html" why="ссылка на глоссарий"/>
  <field name="terms" in="Glossary" type="map" domain="1..64" required="yes" error="GLOSSARY_KEY_INVALID" source="brd.md"/>
  <failure code="GLOSSARY_KEY_INVALID" status="400" client="ключ неверен" operator="—" from="UC1/1a"/>
  <nfr subject="glossary-cache" fit="60s" source="brd.md"/>
  <carried req="R1" by="UC1/1"/>
</frd>`)

test("passOf — один код invented-value уезжает в три разных прохода", () => {
  const code = "invented-value"
  assert.equal(passOf({ code, node: "UC1" }, ROUTED), "A")
  assert.equal(passOf({ code, node: "src/GlossaryResource.java" }, ROUTED), "B")
  assert.equal(passOf({ code, node: "field:terms" }, ROUTED), "C")
})

test("passOf — адреса пласта A: шаг, конец, ветка и актёр принадлежат своему use case", () => {
  for (const node of ["UC1", "UC1/1", "UC1/post", "UC1/1a", "оператор"]) {
    assert.equal(passOf({ code: "goal-not-delivered", node }, ROUTED), "A", `адрес ${node} потерял пласт A`)
  }
})

test("passOf — адреса пласта B: операция, узел, тронутый путь, сценарий", () => {
  for (const node of ["POST /glossaries", "src/GlossaryResource.java", "src/ui/agents.html", "S1"]) {
    assert.equal(passOf({ code: "invented-value", node }, ROUTED), "B", `адрес ${node} потерял пласт B`)
  }
})

test("passOf — адреса пласта C: поле, нфт и код отказа", () => {
  for (const node of ["field:terms", "nfr:glossary-cache", "GLOSSARY_KEY_INVALID"]) {
    assert.equal(passOf({ code: "invented-value", node }, ROUTED), "C", `адрес ${node} потерял пласт C`)
  }
})

test("passOf — элемент двух пластов уезжает в РАННИЙ", () => {
  // Сегодня адресные пространства пластов не пересекаются, и держит их врозь только ПОРЯДОК проверок
  // в passOf. Фикстура ниже сталкивает их нарочно: один и тот же `X` — и id use case (пласт A), и id
  // сценария (пласт B). Артефакт странный, но грамматике не противоречит, и в живом прогоне такое
  // столкновение появится в тот день, когда роль назовёт сценарий именем случая.
  const collide = parseFrd(`<frd goal="g">
    <usecase id="X" actor="оператор" goal="g"><post>p</post><step n="1">s</step></usecase>
    <scenario id="X" uc="X" before="нет" after="есть" nodes="src/A.java"/>
    <field name="X" in="Glossary" type="string" domain="1..8" required="yes" source="brd.md"/>
  </frd>`)
  assert.equal(passOf({ code: "invented-value", node: "X" }, collide), "A")
})

test("passOf — requirement-not-carried и open-question едут в A, а не в D", () => {
  // F11 не выпускает пласт D без строки на каждое требование: у находки критика строка ЕСТЬ и она
  // ложна — носителя нет, и пишет его пласт A
  assert.equal(passOf({ code: "requirement-not-carried", node: "R7" }, ROUTED), "A")
  assert.equal(passOf({ code: "open-question", node: "R7" }, ROUTED), "A")
})

test("passOf — тотальна: незнакомый элемент, пустой FRD, мусор", () => {
  assert.equal(passOf({ code: "invented-value", node: "чего-в-артефакте-нет" }, ROUTED), "A")
  assert.equal(passOf({ code: "invented-value", node: "UC1" }, {}), "A")
  assert.equal(passOf(), "A")
  assert.equal(passOf(null, null), "A")
})

test("criticEntry — вход в РАННИЙ из названных проходов, и без находок это A", () => {
  const f = (node) => ({ code: "invented-value", node })
  assert.equal(criticEntry([f("field:terms"), f("src/GlossaryResource.java")], ROUTED), "B")
  assert.equal(criticEntry([f("field:terms"), f("UC1")], ROUTED), "A")
  assert.equal(criticEntry([f("field:terms")], ROUTED), "C")
  assert.equal(criticEntry([], ROUTED), "A")
  assert.equal(criticEntry(), "A")
})
