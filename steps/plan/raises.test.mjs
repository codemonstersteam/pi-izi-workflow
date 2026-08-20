// Срез `raises`: кто ПОДНИМАЕТ отказ по развёрнутым цепочкам. Фикстура — форма настоящего
// `.agent/data-flow.md` прогона 19.08.2026, домен чужой (посылки, не глоссарий).
import test from "node:test"
import assert from "node:assert/strict"
import { raisesOf, raisesBlock, measuresOf } from "./raises.mjs"

const FLOW = `$START_FLOW id="S1"
1. src/rest/IRestParcelStore.java : POST /parcels {body} -> REST /parcels
2. src/rest/RestParcelStore.java : REST /parcels -> CRUD parcels
3. src/store/IParcelStore.java : CRUD parcels -> 400 KEY_INVALID
4. src/rest/RestParcelStore.java : 400 KEY_INVALID -> 400 KEY_INVALID
$END_FLOW
$START_FLOW id="S2"
1. src/store/mongo/ParcelStore.java : CRUD parcels -> 404 PARCEL_GONE
$END_FLOW`
const CODES = ["KEY_INVALID", "PARCEL_GONE"]

test("happy: поднявший отличается от пронёсшего, и у каждого назван адрес цепочки", () => {
  const m = raisesOf(FLOW, CODES)
  assert.deepEqual([...m.keys()], ["src/store/IParcelStore.java", "src/store/mongo/ParcelStore.java"])
  assert.deepEqual(m.get("src/store/IParcelStore.java"), [{ code: "KEY_INVALID", chain: "S1", step: 3 }])
  // шаг 4 ПРОНЁС код: слева он тот же — модуль в карту не попадает
  assert.equal(m.has("src/rest/RestParcelStore.java"), false, "пронёсший записан как поднявший")
})

// Первая редакция считала кодом всякое слово в верхнем регистре и объявила отказами REST, CRUD, JSON.
// Что такое код, объявлено в артефакте — в карте отказов FRD.
test("кодом считается только то, что названо картой отказов", () => {
  assert.equal(raisesOf(FLOW, []).size, 0, "без карты отказов судить нечем")
  const m = raisesOf(FLOW, ["KEY_INVALID"])
  assert.equal(m.size, 1, "в карту попал код, которого карта отказов не называет")
})

test("блок помечен производным и несёт ссылку на цепочку; без отказов блока нет", () => {
  const b = raisesBlock(raisesOf(FLOW, CODES).get("src/store/IParcelStore.java"))
  assert.match(b, /^raises: \(собрано из \.agent\/data-flow\.md, не написано ролью\)/)
  assert.match(b, /KEY_INVALID — цепочка S1, шаг 3/)
  assert.equal(raisesBlock([]), "")
  assert.equal(raisesBlock(), "")
})

test("тотальность: мусор и пустота дают пустую карту, а не бросок", () => {
  assert.equal(raisesOf().size, 0)
  assert.equal(raisesOf("не поток вовсе", CODES).size, 0)
  assert.equal(raisesOf(FLOW, [""]).size, 0)
})

// Величина узнаётся ЧИСЛОМ С ЕДИНИЦЕЙ: голое `5` встречается в плане десятками способов — «R5»,
// «S5», «5 модулей», — и проверка по нему сказала бы «величина на месте» о плане, где её нет.
test("measuresOf: число с единицей, код, имя с точкой; словесная величина знаков не даёт", () => {
  assert.deepEqual(measuresOf("5 minutes"), ["5 minutes"])
  assert.deepEqual(measuresOf("до 64 символов"), ["64 символов"])
  assert.ok(measuresOf("код TERM_KEY_INVALID").includes("TERM_KEY_INVALID"))
  assert.ok(measuresOf("тип eddi.labs.glossary").includes("eddi.labs.glossary"))
  assert.deepEqual(measuresOf("по образцу соседнего модуля"), [], "словесную величину судить нечем")
  assert.deepEqual(measuresOf(), [])
})
