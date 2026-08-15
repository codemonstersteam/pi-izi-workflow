// Pass A of the slice `design`: the dictionary of values — a PURE core; its io lives in ext/index.mjs
// (standards/code.md: an io pipe is not unit-tested). Formula: 1 happy + Σ antecedent branches with a
// DISTINGUISHABLE consequent. The branches are the two checks the dictionary owns (a name is declared
// once, a name carries a text) plus rule 8 of docs/data-flow.md §6, which moved here whole from
// steps/design/design.mjs — number unchanged, operand now the dictionary instead of the `out`
// alternatives. Each was built by REINTRODUCING the defect into a green fixture.
//
// The FRD fixture is PARSED, not typed: `frd` reaches this core exactly as steps/intake/frd.mjs hands
// it over, and a fixture that invents its own shape is how discrepancy A got in (steps/design/design.mjs,
// BUG_FIX_CONTEXT of checkDesign: rule 5 reddening on every real artifact with «[object Object]»).

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { parseValues, checkValues } from "./values.mjs"
import { parseFrd } from "../intake/frd.mjs"

// The dictionary of the booking change: an external entry point, two domain calls and the failure the
// FRD declares — the four sources §4a names, one row each. The failure's text carries BOTH the code
// and how the module hands it out, which is why rule 8 compares by substring.
const VALUES = `<values>
  <value id="v1" text="POST /bookings {slotId,userId}" closes="UC1/in"/>
  <value id="v2" text="book(slotId,userId)"/>
  <value id="v3" text="lock(slotId,ttl)"/>
  <value id="v4" text="409 SLOT_TAKEN"/>
  <value id="v5" text="Booked(slotId,until)" closes="UC1/post"/>
</values>`

const FRD_XML = `<frd grammar="1" goal="бронь слота с блокировкой">
  <usecase id="UC1" actor="client" goal="забронировать слот">
    <post>слот забронирован либо отказ 409</post>
    <step n="1">клиент отправляет POST /bookings</step>
  </usecase>
  <delta op="POST /bookings" form="Changed" node="src/BookingResource.java" from="бронь без блокировки" to="бронь с блокировкой слота"/>
  <scenario id="S1" uc="UC1" before="двойная бронь проходит" after="вторая бронь получает 409" nodes="src/BookingResource.java"/>
  <failure code="SLOT_TAKEN" status="409" client="показать занятость" operator="—" from="UC1/1a"/>
</frd>`

const FRD = parseFrd(FRD_XML)
const blockersOf = (xml, frd = FRD) => checkValues({ values: parseValues(xml), frd })

test("happy: every value is a name and a text, and the failure the FRD declared is among them", () => {
  const values = parseValues(VALUES)
  assert.equal(values.size, 5)
  // Rule 12's attribution rides on the Map, next to `dups`, and rule 13 reads it one pass later.
  assert.deepEqual([...values.closes], [["v1", ["UC1/in"]], ["v5", ["UC1/post"]]])
  // The text is the whole value, punctuation included — a later pass substitutes it verbatim.
  assert.equal(values.get("v3"), "lock(slotId,ttl)")
  assert.equal(values.get("v1"), "POST /bookings {slotId,userId}")
  assert.deepEqual(values.dups, [])
  assert.deepEqual(checkValues({ values, frd: FRD }), [])
})

test("one name, one value: a repeated id makes every reference to it ambiguous", () => {
  const b = blockersOf(VALUES.replace('id="v3"', 'id="v2"'))
  assert.deepEqual(b, ["значение v2 объявлено дважды — имя выдаётся один раз, иначе ссылка из контракта неоднозначна"])
  // The FIRST declaration survives: resolving a repeat by write order is what the collection avoids.
  assert.equal(parseValues(VALUES.replace('id="v3"', 'id="v2"')).get("v2"), "book(slotId,userId)")
})

test("both halves are load-bearing: no text, and no id at all", () => {
  assert.deepEqual(blockersOf(VALUES.replace('text="lock(slotId,ttl)"', 'text=""')),
    ["значение v3 без text — подставлять при сборке нечего"])
  // A row with no id is not dropped from the parse: the role has to repair the artifact it wrote,
  // and a silently swallowed row is a defect nobody is told about.
  const b = blockersOf(VALUES.replace('id="v3" ', ""))
  assert.deepEqual(b, ['значение без id: text="lock(slotId,ttl)" — на него нечем сослаться из контракта, имя обязательно'])
})

// Rule 8 (S30-1), moved here whole from design.mjs. There it read the `out` alternatives of the
// design graph; the dictionary is the EARLIEST place the failure is decidable, and everything
// downstream refers to values by id — a failure absent from here is one no contract can name.
// Delete the rule 8 block and the first half goes red.
test("rule 8: a failure declared by the FRD that the dictionary does not carry", () => {
  assert.deepEqual(blockersOf(VALUES.replace('text="409 SLOT_TAKEN"', 'text="409 {conflict}"')), [
    "8 отказ SLOT_TAKEN объявлен в FRD, но не назван ни одним значением — маршрута у него не будет, значит не будет и юнита; объяви значение, которым узел его отдаёт",
  ])
  // A SUBSTRING, because the value says both which failure it is and how it leaves the module.
  assert.deepEqual(blockersOf(VALUES.replace("409 SLOT_TAKEN", "409 SLOT_TAKEN {slotId}")), [])
  // An FRD that declares no failure at all says nothing here: F6 of step 6 judges that, not this.
  assert.deepEqual(blockersOf(VALUES, parseFrd(FRD_XML.replace(/<failure .*\/>/, ""))), [])
})

// --- D7: the role of pass A and its order. THE SEAMS THE SLICE KEEPS OUTSIDE THE CORE ----------
//
// Same pair as `steps/design/design.test.mjs` keeps for the designer and `steps/scope/part.test.mjs`
// for its own slice — the order carries exactly the keys the workflow passes, and the role's
// frontmatter survives YAML — plus one seam this pass can afford and the others cannot: pass A's
// artifact is small enough that its EXAMPLE is a whole artifact, so the example is run through the
// real guardrail instead of being read by eye.

const role = () => readFileSync(new URL("valuer.md", import.meta.url), "utf8")
const ORDER_KEYS = ["FRD", "RIPPLE", "FEEDBACK", "STAGING", "CHECK"]

// No ANSWERS, no MODE, no DELTA_FORMS: the dictionary has no question rail (docs/design-step-by-step.md
// §7 leaves it to B and C), and neither the weight nor the vocabulary of `delta` reaches a file whose
// root element carries no attribute at all.
test("order-values.tpl uses exactly the keys the workflow passes", () => {
  const tpl = readFileSync(new URL("order-values.tpl", import.meta.url), "utf8")
  const keys = [...tpl.matchAll(/{{|}}|{([A-Za-z_$][\w$]*)}/g)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]))
  assert.deepEqual([...new Set(keys)].sort(), [...ORDER_KEYS].sort())
})

// BUG_FIX_CONTEXT: the first launch of step 9 never reached the role at all — pi refused the whole
//   workflow at metadata validation, because `description:` carried a second «: » inside an unquoted
//   YAML scalar, which YAML reads as a nested mapping. The cost is the whole run before a single token
//   is spent (steps/design/design.test.mjs keeps the same seam for the designer), so every new role of
//   this slice buys the millisecond too.
test("role frontmatter: the description carries no bare colon — YAML would read it as a nested mapping", () => {
  const line = (role().match(/^description:.*$/m) || [""])[0]
  assert.doesNotMatch(line.slice("description:".length), /:\s/)
})

// The seam this pass can afford: the example IS an artifact, so it is judged by the artifact's judge.
// A role whose worked example does not pass its own guardrail teaches the form of a red run — and the
// FRD of the same example supplies rule 8's operand, so the example proves the pair, not one half.
test("the role's own example passes the real guardrail with zero blockers", () => {
  const text = role()
  const xml = (text.match(/<values>[\s\S]*?<\/values>/) || [""])[0]
  const frdXml = (text.match(/<frd\b[\s\S]*?<\/frd>/) || [""])[0]
  const values = parseValues(xml)
  const frd = parseFrd(frdXml)

  assert.equal(values.size, 8)
  assert.equal(frd.failures.length, 1)
  assert.deepEqual(checkValues({ values, frd }), [])

  // …and the example carries none of the shapes the role is forbidden to write: a `<module>` or a
  // `<route>` inside the dictionary would be the prepared answer a live run copies (standards/role.md,
  // constraint 3 — this has happened).
  assert.doesNotMatch(xml, /<module|<route|<contract|<dep/)
})

// The example must SHOW the law, not merely be compatible with it: a use case with one step teaches
// that one end is enough. This is the same discipline as running the example through the guardrail —
// the example is what a weak tier copies.
test("the role's example shows both ends of its use case", () => {
  const text = role()
  const uc = (text.match(/<usecase[\s\S]*?<\/usecase>/) || [""])[0]
  assert.equal((uc.match(/<step n=/g) || []).length, 2, "a first step and a last one")
  // Пример учит СЧЁТУ, а не «добавь строку»: у UC1 три конца и восемь рядов, потому что конец
  // ветвления уже назван рядом LAW 4. Без этого пункта слабый тир заведёт девятый ряд с тем же
  // текстом — прямой запрет LAW 3, который `checkValues` не ловит.
})

test("totality: garbage, undefined and no argument at all are read as an empty dictionary, not thrown", () => {
  assert.equal(parseValues(undefined).size, 0)
  assert.equal(parseValues(null).size, 0)
  assert.deepEqual(parseValues("<design><module path=\"a.js\"/></design>").dups, [])
  assert.deepEqual(checkValues({}), [])
  assert.deepEqual(checkValues(), [])
})

// Rule 12, reintroduced from the artifacts that bought it. The dictionary of the live run carries no
// attribution at all, and every end of both use cases is open. Removing the rule turns this fixture
// green again — and the run it came from escalated at pass C for exactly that reason.
const FRD_1DF9 = parseFrd(`<frd grammar="1" goal="один фрукт по имени и карточка на странице списка">
  <usecase id="UC1" actor="http-client" goal="получить один фрукт по имени">
    <post>вернён JSON-объект одного фрукта либо 404</post>
    <step n="1">клиент отправляет GET /fruits/{name}</step>
    <ext id="3a" error="none" outcome="фрукт не найден, сервер возвращает HTTP 404"/>
  </usecase>
  <usecase id="UC2" actor="user" goal="увидеть карточку фрукта inline на странице списка">
    <post>карточка выбранного фрукта показана inline, URL не изменён</post>
    <step n="1">пользователь выбирает фрукт из списка</step>
    <step n="2">страница показывает карточку фрукта inline на том же месте</step>
  </usecase>
  <delta op="GET /fruits/{name}" form="Added" node="src/main/java/org/acme/rest/json/FruitResource.java"/>
  <scenario id="S1" uc="UC1" before="эндпоинта нет" after="эндпоинт отдаёт один фрукт" nodes="src/main/java/org/acme/rest/json/FruitResource.java"/>
  <scenario id="S2" uc="UC2" before="карточки нет" after="карточка раскрыта inline" nodes="src/main/resources/META-INF/resources/fruits.html"/>
  <touched path="src/main/resources/META-INF/resources/fruits.html" why="добавлен inline-показ карточки"/>
</frd>`)

const VALUES_1DF9 = `<values>
  <value id="v1" text="GET /fruits/{name} {name}"/>
  <value id="v2" text="Выбор(name)"/>
  <value id="v13" text="200 {Fruit}"/>
  <value id="v14" text="404 Not Found"/>
</values>`

// Токены открытых концов — блокер называет их первым словом после «12 конец».
const openEnds = (b) => b.filter((l) => l.startsWith("12 конец")).map((l) => l.match(/^12 конец (\S+)/)[1])

test("12: каждый конец use case закрыт значением — дословный словарь прогона 1df91a31", () => {
  const b = checkValues({ values: parseValues(VALUES_1DF9), frd: FRD_1DF9 })
  assert.deepEqual(openEnds(b), ["UC1/in", "UC1/post", "UC1/3a", "UC2/in", "UC2/post"], b.join("\n"))
  // Блокер несёт ТЕКСТ конца из FRD — роли есть из чего сформулировать значение.
  assert.match(b[4], /карточка выбранного фрукта показана inline/)

  // …и с атрибуцией он зелен. `UC2` без единого `<ext>` — токен post есть всё равно.
  const closed = VALUES_1DF9
    .replace('id="v1" text="GET /fruits/{name} {name}"', 'id="v1" text="GET /fruits/{name} {name}" closes="UC1/in"')
    .replace('id="v2" text="Выбор(name)"', 'id="v2" text="Выбор(name)" closes="UC2/in"')
    .replace('id="v13" text="200 {Fruit}"', 'id="v13" text="200 {Fruit}" closes="UC1/post"')
    .replace('id="v14" text="404 Not Found"', 'id="v14" text="404 Not Found" closes="UC1/3a"')
    .replace("</values>", '  <value id="v15" text="Карточка(name,description)" closes="UC2/post"/>\n</values>')
  assert.deepEqual(checkValues({ values: parseValues(closed), frd: FRD_1DF9 }), [])
})

test("12: токен, который не резолвится в конец FRD, — зеркало правила 1", () => {
  const bad = VALUES_1DF9.replace('id="v1" text="GET /fruits/{name} {name}"', 'id="v1" text="GET /fruits/{name} {name}" closes="UC9/post"')
  const b = checkValues({ values: parseValues(bad), frd: FRD_1DF9 }).filter((l) => l.includes("не резолвится"))
  assert.equal(b.length, 1)
  assert.match(b[0], /значение v1: closes="UC9\/post"/)
  assert.match(b[0], /UC1\/in, UC1\/post, UC1\/3a, UC2\/in, UC2\/post/)
})

test("12: несколько токенов на одном значении, и FRD без use case ничего не требует", () => {
  const two = VALUES_1DF9.replace('id="v14" text="404 Not Found"', 'id="v14" text="404 Not Found" closes="UC1/3a UC1/post"')
  assert.deepEqual(openEnds(checkValues({ values: parseValues(two), frd: FRD_1DF9 })), ["UC1/in", "UC2/in", "UC2/post"])
  assert.deepEqual(checkValues({ values: parseValues(VALUES_1DF9), frd: {} }), [])
})
