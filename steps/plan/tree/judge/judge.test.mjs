// ЮНИТЫ ГАРДРЕЙЛА ШАГА 9B — по СУДЬЕ НА ПРАВИЛО (T1…T5), формула standards/workflow-design.md:
// 1 happy + Σ различимых ветвей + 1 молчание на внешний операнд.
// Тикет T08. Компонентный тест рядом (../component/) судит ШАГ; здесь судятся ПРАВИЛА.
import test from "node:test"
import assert from "node:assert/strict"
import { T1 } from "./T1.mjs"
import { T2 } from "./T2.mjs"
import { T3 } from "./T3.mjs"
import { T4 } from "./T4.mjs"
import { T5 } from "./T5.mjs"
import { judgePortion, judgeWhole } from "../judge.mjs"

// Полный модуль: всё, что T5 требует. Тесты портят его по одному полю за раз.
const mod = (over = {}) => ({
  path: "src/loans/model/Loan.java", delta: "Added", io: "none",
  hides: "как займ представлен", owns: "Loan", twin: "src/books/model/Book.java",
  needs: [], contract: { sig: "public class Loan", pre: "нет", post: "id и version (UC1/3)", fail: "нет" },
  ...over,
})
const xml = (body) => `<tree task="X">\n${body}\n</tree>`
// Форма дельты требования: узел зовётся `node`, а не `path` — так его называет FRD.
const FRD = { deltas: [{ node: "src/loans/model/Loan.java", form: "Added" }], scenarios: [] }

// --- T1: состав ------------------------------------------------------------------------------------
test("T1 happy: состав дерева совпал с составом требования", () => {
  assert.deepEqual(T1({ said: ["src/loans/model/Loan.java"], frd: FRD }), [])
})

test("T1: требование трогает модуль, которого в дереве нет", () => {
  const b = T1({ said: [], frd: FRD })
  assert.equal(b.length, 1)
  assert.match(b[0], /^T1 состав: требование трогает/)
  assert.match(b[0], /Loan\.java/, "блокер не назвал потерянный путь — роль не поймёт, что дописать")
})

test("T1: в дереве модуль, которого требование не трогает", () => {
  const b = T1({ said: ["src/loans/model/Loan.java", "src/чужое/Foo.java"], frd: FRD })
  assert.equal(b.length, 1)
  assert.match(b[0], /Foo\.java/)
})

test("T1 МОЛЧАНИЕ: требования нет — правило молчит, а не объявляет всё дерево лишним", () => {
  assert.deepEqual(T1({ said: ["src/loans/model/Loan.java"], frd: {} }), [])
})

// --- T2: needs это адрес ---------------------------------------------------------------------------
test("T2 happy: адрес разрешается среди модулей работы", () => {
  const m = mod({ needs: [{ path: "src/loans/ILoanStore.java", why: "параметр типа" }] })
  assert.deepEqual(T2({ modules: [m], kin: ["src/loans/ILoanStore.java"], known: [] }), [])
})

test("T2: в needs стоит не путь, а слово", () => {
  const m = mod({ needs: [{ path: "ILoanStore", why: "интерфейс" }] })
  const b = T2({ modules: [m], kin: [], known: [] })
  assert.equal(b.length, 1)
  assert.match(b[0], /это не путь/)
})

test("T2: путь не находится ни среди модулей работы, ни в репозитории", () => {
  const m = mod({ needs: [{ path: "src/нет/Такого.java", why: "зачем-то" }] })
  const b = T2({ modules: [m], kin: [], known: ["src/books/IBookStore.java"] })
  assert.equal(b.length, 1)
  assert.match(b[0], /такого файла нет/)
})

test("T2: need без why — исполнителю не сказано, ЧТО оттуда нужно", () => {
  const m = mod({ needs: [{ path: "src/loans/ILoanStore.java", why: "" }] })
  const b = T2({ modules: [m], kin: ["src/loans/ILoanStore.java"], known: [] })
  assert.equal(b.length, 1)
  assert.match(b[0], /без why/)
})

test("T2 МОЛЧАНИЕ: карты репозитория нет — правило не объявляет чужим существующий файл", () => {
  const m = mod({ needs: [{ path: "src/books/IBookStore.java", why: "образец" }] })
  assert.deepEqual(T2({ modules: [m], kin: [], known: [] }), [])
})

// --- T3: ацикличность ------------------------------------------------------------------------------
test("T3 happy: интерфейс нуждается в своём типе, круга нет", () => {
  const a = mod({ path: "src/loans/model/Loan.java", needs: [] })
  const i = mod({ path: "src/loans/ILoanStore.java", needs: [{ path: "src/loans/model/Loan.java", why: "тип" }] })
  assert.deepEqual(T3({ modules: [a, i], said: [a.path, i.path] }), [])
})

test("T3: ИНТЕРФЕЙС ОБЪЯВИЛ СВОЮ РЕАЛИЗАЦИЮ — круг, и блокер объясняет, ЧТО не так с ребром", () => {
  const i = mod({ path: "src/loans/ILoanStore.java", needs: [{ path: "src/loans/mongo/LoanStore.java", why: "зовёт реализацию" }] })
  const s = mod({ path: "src/loans/mongo/LoanStore.java", needs: [{ path: "src/loans/ILoanStore.java", why: "реализует" }] })
  const b = T3({ modules: [i, s], said: [i.path, s.path] })
  assert.equal(b.length, 1)
  assert.match(b[0], /замкнуто в круг/)
  assert.match(b[0], /не от объявления, а от вызова/, "блокер не объясняет ребро — роль снимет не то")
})

test("T3 МОЛЧАНИЕ: модулей нет — судить нечего", () => {
  assert.deepEqual(T3({ modules: [], said: [] }), [])
})

// --- T4: владелец типа и написание имени -----------------------------------------------------------
test("T4 happy: у типа один владелец, имя пишется одинаково", () => {
  assert.deepEqual(T4({ modules: [mod()], said: ["src/loans/model/Loan.java"] }), [])
})

test("T4: два модуля объявили собственностью один тип", () => {
  const a = mod({ path: "src/loans/model/Loan.java", owns: "Loan" })
  const b2 = mod({ path: "src/loans/dto/Loan.java", owns: "Loan", contract: { sig: "public class Loan", pre: "н", post: "п", fail: "н" } })
  const b = T4({ modules: [a, b2], said: [a.path, b2.path] })
  assert.ok(b.some((x) => /объявлен собственностью 2 модулей/.test(x)))
})

test("T4: НОВЫЙ модуль владеет типом, но сигнатура его не называет", () => {
  const m = mod({ delta: "Added", owns: "Loan", contract: { sig: "public class Заём", pre: "н", post: "п", fail: "н" } })
  const b = T4({ modules: [m], said: [m.path] })
  assert.ok(b.some((x) => /сигнатура этого типа не называет/.test(x)))
})

test("T4: имя типа написано в сигнатуре иначе, чем зовётся модуль дерева", () => {
  const m = mod({ path: "src/loans/ILoanStore.java", owns: "", contract: { sig: "public interface Iloanstore", pre: "н", post: "п", fail: "н" } })
  const b = T4({ modules: [m], said: [m.path] })
  assert.ok(b.some((x) => /одно имя, одно написание/.test(x)))
})

test("T4 МОЛЧАНИЕ: у ИЗМЕНЯЕМОГО модуля sig показывает дельту, и имени класса в ней нет — это законно", () => {
  const m = mod({ delta: "Modified", owns: "Loan", contract: { sig: "+ private List<URI> glossaries", pre: "н", post: "п", fail: "н" } })
  assert.deepEqual(T4({ modules: [m], said: [m.path] }).filter((x) => /не называет/.test(x)), [])
})

// --- T5: полнота решения по порции -----------------------------------------------------------------
const MINE = ["src/loans/model/Loan.java"]
test("T5 happy: по каждому модулю порции есть полное решение", () => {
  assert.deepEqual(T5({ modules: [mod()], said: MINE, mine: MINE }), [])
})

test("T5: по модулю порции решения нет", () => {
  const b = T5({ modules: [], said: [], mine: MINE })
  assert.equal(b.length, 1)
  assert.match(b[0], /нет решения по модулям/)
})

test("T5: решён модуль не из этой порции — сосед читается, но не пишется", () => {
  const m = mod({ path: "src/loans/ILoanStore.java" })
  const b = T5({ modules: [m], said: [m.path], mine: MINE })
  assert.ok(b.some((x) => /не из этой порции/.test(x)))
})

test("T5: пуст hides — не названо решение, которое модуль прячет", () => {
  assert.ok(T5({ modules: [mod({ hides: "" })], said: MINE, mine: MINE }).some((x) => /пуст <hides>/.test(x)))
})

test("T5: io вне словаря", () => {
  const b = T5({ modules: [mod({ io: "сеть" })], said: MINE, mine: MINE })
  assert.ok(b.some((x) => /слово вне словаря/.test(x)))
})

test("T5: не назван образец — исполнителю неоткуда узнать базовый класс и стиль", () => {
  assert.ok(T5({ modules: [mod({ twin: "" })], said: MINE, mine: MINE }).some((x) => /не назван образец/.test(x)))
})

test("T5: пуста sig", () => {
  const m = mod({ contract: { sig: "", pre: "н", post: "п", fail: "н" } })
  assert.ok(T5({ modules: [m], said: MINE, mine: MINE }).some((x) => /пуста <sig>/.test(x)))
})

test("T5: пуст pre", () => {
  const m = mod({ contract: { sig: "s", pre: "", post: "п", fail: "н" } })
  assert.ok(T5({ modules: [m], said: MINE, mine: MINE }).some((x) => /пуст <pre>/.test(x)))
})

test("T5: пуст post", () => {
  const m = mod({ contract: { sig: "s", pre: "н", post: "", fail: "н" } })
  assert.ok(T5({ modules: [m], said: MINE, mine: MINE }).some((x) => /пуст <post>/.test(x)))
})

test("T5 МОЛЧАНИЕ: состава порции нет — правило не объявляет чужим каждый модуль", () => {
  const m = mod({ path: "src/что/Угодно.java" })
  assert.deepEqual(T5({ modules: [m], said: [m.path], mine: [] }), [])
})

// --- голова гардрейла: тотальность ------------------------------------------------------------------
test("judge: роль вернула ПРОЗУ вместо дерева — вердикт invalid, а не молчаливое «дерево без модулей»", () => {
  const b = judgePortion({ text: "Извините, я не смог построить дерево: требование неоднозначно.", mine: [] })
  assert.equal(b.length, 1)
  assert.match(b[0], /^invalid: ответ не похож на дерево/)
  assert.match(b[0], /Извините/, "блокер не показал начало ответа — искать причину придётся в трейсе")
})

test("judge: настоящее дерево судится правилами, а не отбивается как непонятное", () => {
  const body = `  <module path="src/loans/model/Loan.java" delta="Added" io="none">
    <hides>как займ представлен</hides><owns type="Loan"/>
    <twin kind="twin" path="src/books/model/Book.java" candidates="src/books/model/Book.java"></twin>
    <needs></needs>
    <contract><sig>public class Loan</sig><pre>нет</pre><post>id (UC1/3)</post><fail>нет</fail></contract>
  </module>`
  assert.deepEqual(judgePortion({ text: xml(body), mine: MINE, kin: MINE }), [])
  assert.deepEqual(judgeWhole({ text: xml(body), frd: FRD }), [])
})
