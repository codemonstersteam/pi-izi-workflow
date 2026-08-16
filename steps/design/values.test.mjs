// Pass A of the slice `design`: the dictionary — a PURE core; its io lives in ext/index.mjs
// (standards/code.md: an io pipe is not unit-tested). Formula: 1 happy + Σ antecedent branches with a
// DISTINGUISHABLE consequent. The branches are the four things the role can get wrong to a green
// skeleton (a row lost, a row added, an end re-attributed, a prefilled text edited, a blank left
// blank) plus the two decisions the skeleton itself makes (which texts it can write, which calls are
// values at all). Each was built by REINTRODUCING the defect into a green fixture.
//
// The FRD fixture is PARSED, not typed: `frd` reaches this core exactly as steps/intake/frd.mjs hands
// it over, and a fixture that invents its own shape is how discrepancy A got in (steps/design/design.mjs,
// BUG_FIX_CONTEXT of checkDesign: rule 5 reddening on every real artifact with «[object Object]»).

import test from "node:test"
import assert from "node:assert/strict"
import { parseValues, valuesSkeleton, normalize, checkValues, VALUES_GRAMMAR } from "./values.mjs"
import { parseFrd } from "../intake/frd.mjs"

const FRD_XML = `<frd grammar="1" goal="бронь слота с блокировкой">
  <usecase id="UC1" actor="client" goal="забронировать слот">
    <post>слот забронирован, вернулся идентификатор брони</post>
    <step n="1">клиент отправляет POST /bookings</step>
    <ext id="1a" error="SLOT_TAKEN" outcome="бронь не создана, клиент получил отказ"/>
  </usecase>
  <delta op="POST /bookings" form="Changed" node="src/BookingResource.java" from="бронь без блокировки" to="бронь с блокировкой слота"/>
  <scenario id="S1" uc="UC1" before="двойная бронь проходит" after="вторая бронь получает 409" nodes="src/BookingResource.java"/>
  <failure code="SLOT_TAKEN" status="409" client="показать занятость" operator="—" from="UC1/1a"/>
</frd>`

// The ripple carries TWO modules: the node of the change and a neighbour it only reads through. The
// neighbour's declarations must not enter the dictionary — that cut is D29a's, and here it is a rule.
const RIPPLE = `<ripple grammar="1" mode="minor" seeds="1" nodes="2">
  <module path="src/BookingResource.java" pkg="src" component="rest" level="1" seed="yes" cut="no">
    <role>принимает бронь</role>
    <api name="POST /bookings" kind="http" scope="public" via="jaxrs"/>
    <decl kind="method" name="book(slotId,userId)" sig="Booking book(String,String)"/>
    <decl kind="field" name="repo" sig="BookingRepo"/>
    <dep path="src/SlotRepo.java"/>
  </module>
  <module path="src/SlotRepo.java" pkg="src" component="store" level="2" seed="no" cut="no">
    <role>хранит слоты</role>
    <decl kind="method" name="lock(slotId,ttl)" sig="void lock(String,long)"/>
  </module>
</ripple>`

const FRD = parseFrd(FRD_XML)
const skeleton = () => valuesSkeleton({ frd: FRD, ripple: RIPPLE })
const blockersOf = (staged) => checkValues({ staged, frd: FRD, ripple: RIPPLE })
// The green artifact: the skeleton with every blank named. This is the ONLY thing the role does, and
// the fixture says so — three names, and nothing else moves.
const GREEN = skeleton().xml
  .replace('id="v1" closes="UC1/in" side="in" text=""', 'id="v1" closes="UC1/in" side="in" text="POST /bookings {slotId,userId}"')
  .replace('id="v2" closes="UC1/post" side="out" text=""', 'id="v2" closes="UC1/post" side="out" text="Booked(slotId,until)"')

test("happy: скрипт составил словарь, роль назвала пустые — зелено", () => {
  const s = skeleton()
  // Три конца use case (вход, выход, ветка) и ОДИН вызов узла изменения: `<api>` и `<decl
  // kind="method">` этого узла — поле и объявления соседа значениями не являются.
  assert.equal(s.rows, 5)
  assert.equal(s.filled, 3)  // ветка с кодом + два вызова узла изменения
  assert.equal(s.blank, 2)   // вход и выход — их называет роль
  const v = parseValues(s.xml)
  assert.deepEqual([...v.closes], [["v1", ["UC1/in"]], ["v2", ["UC1/post"]], ["v3", ["UC1/1a"]]])
  assert.equal(v.get("v3"), "409 SLOT_TAKEN")
  assert.deepEqual([...v.values()].slice(3), ["POST /bookings", "book(slotId,userId)"])
  assert.deepEqual(blockersOf(GREEN), [])
})

test("состав — функция входов: два вычисления одного FRD и одной ряби совпадают байт в байт", () => {
  assert.equal(skeleton().xml, valuesSkeleton({ frd: parseFrd(FRD_XML), ripple: RIPPLE }).xml)
})

test("скелет тотален: без требования строк нет, без ряби остаются одни концы", () => {
  assert.equal(valuesSkeleton().rows, 0)
  assert.equal(valuesSkeleton({ frd: FRD }).rows, 3)
})

test("ветка с кодом отказа заполнена скриптом: «статус код» — и роль её не пишет", () => {
  // Шов: снимаем строку отказа из карты — текст ветки становится пустым, и его называет роль.
  const noMap = parseFrd(FRD_XML.replace(/<failure [^>]*\/>/, ""))
  const s = valuesSkeleton({ frd: noMap, ripple: RIPPLE })
  assert.equal(parseValues(s.xml).get("v3"), "")
  assert.equal(s.blank, 3)
})

test("одно имя — одно значение: метод, объявленный дважды, даёт одну строку", () => {
  const twice = RIPPLE.replace("<dep path=\"src/SlotRepo.java\"/>", '<decl kind="method" name="book(slotId,userId)" sig="Booking book(String,String)"/>')
  assert.equal(valuesSkeleton({ frd: FRD, ripple: twice }).rows, 5)
})

test("строка потеряна: состав словаря считает скрипт, и удалить строку роль не вправе", () => {
  const b = blockersOf(GREEN.replace(/\n.*id="v4".*/, ""))
  assert.equal(b.length, 1)
  assert.match(b[0], /v4/)
})

test("строка дописана: значения, которого нет в скелете, в словаре быть не может", () => {
  const b = blockersOf(GREEN.replace("</values>", '  <value id="v99" text="Booked(slotId)"/>\n</values>'))
  assert.equal(b.length, 1)
  assert.match(b[0], /v99/)
})

test("конец переприписан: какую ветку закрывает строка, решает скрипт", () => {
  const b = blockersOf(GREEN.replace('id="v3" closes="UC1/1a"', 'id="v3" closes="UC1/post"'))
  assert.equal(b.length, 1)
  assert.match(b[0], /UC1\/1a/)
})

test("заполненный скриптом текст правлен: копия перестала быть копией", () => {
  const b = blockersOf(GREEN.replace('text="409 SLOT_TAKEN"', 'text="409 занято"'))
  assert.equal(b.length, 1)
  assert.match(b[0], /409 SLOT_TAKEN/)
})

test("пустой текст: строка, которую никто не назвал, — один блокер на строку", () => {
  const b = blockersOf(skeleton().xml)
  assert.equal(b.length, 2)
  assert.match(b.join("\n"), /UC1\/in/)
  assert.match(b.join("\n"), /UC1\/post/)
})

test("повтор id: ссылаться на такое значение нельзя ни одному следующему проходу", () => {
  const b = blockersOf(GREEN.replace('id="v5"', 'id="v4"'))
  assert.match(b.join("\n"), /v4 объявлено дважды/)
})

test("правило 8 держится ПОСТРОЕНИЕМ: код каждого отказа встречается в тексте зелёного словаря", () => {
  // Оно больше не судится отдельным правилом — F6 шага 6 делает каждый код кодом какой-то ветки,
  // ветка это конец, конец это строка, а строка ветки с кодом заполняется скриптом. Шов держит
  // именно этот вывод: сломай заполнение — и утверждение станет ложным раньше, чем правило вернут.
  const dict = [...parseValues(GREEN).values()]
  for (const f of FRD.failures) assert.ok(dict.some((t) => t.includes(f.code)), f.code)
})

test("промоут снимает леса: наружу уходят id, text и closes — и ничего из того, что читала роль", () => {
  const out = normalize(GREEN)
  assert.equal(out.includes("side="), false)
  assert.equal(out.includes("end="), false)
  assert.equal(out.includes("src="), false)
  assert.equal(out.includes('form="skeleton"'), false)
  assert.match(out, new RegExp(`^<values grammar="${VALUES_GRAMMAR}">`))
  // Ни одной строки не потеряно, и attribution конца пережила нормализацию.
  const v = parseValues(out)
  assert.equal(v.size, 5)
  assert.deepEqual(v.closes.get("v3"), ["UC1/1a"])
  assert.equal(v.get("v1"), "POST /bookings {slotId,userId}")
})
