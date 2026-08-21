// Швы шага 9B. Формула `standards/code.md`: happy path + ветки предусловия с РАЗЛИЧИМЫМ следствием.
// Предмет здесь один — отношение `needs`, и каждый тест держит ровно одно его свойство.
import test from "node:test"
import assert from "node:assert/strict"
import { modulesOfChange, sampleOf, shapeOf, rankedCandidates, treeSkeleton, parseTree, checkTree, digestOf, IO_KINDS } from "./tree.mjs"
import { parseFrd } from "../../intake/frd.mjs"

const FRD = parseFrd(`<frd grammar="1" goal="add a document store">
  <usecase id="UC1" actor="client" goal="store a document">
    <pre>service up</pre><post>stored</post>
    <step n="1">client sends POST /store</step>
    <step n="2">system stores the document</step>
  </usecase>
  <delta op="Doc model" form="Added" node="src/model/Doc.java" new="yes" from="none" to="the record"/>
  <delta op="POST /store" form="Added" node="src/rest/RestStore.java" new="yes" from="none" to="the door"/>
  <scenario id="S1" uc="UC1" before="absent" after="present" nodes="src/rest/RestStore.java src/mongo/Store.java src/model/Doc.java"/>
</frd>`)

const MAP = `<map>
  <module path="src/model/Old.java"/>
  <module path="src/mongo/OldStore.java"/>
  <module path="src/rest/OldRest.java"/>
</map>`

const MINE = ["src/model/Doc.java", "src/mongo/Store.java", "src/rest/RestStore.java"]

const mod = (path, over = {}) => {
  const o = { io: "none", hides: "секрет", owns: "", needs: [], sig: `public class ${path.split("/").pop().replace(".java", "")}`, pre: "нет", post: "закрывает UC1/1", fail: "нет", ...over }
  return [
    `  <module path="${path}" delta="Added" io="${o.io}">`,
    `    <hides>${o.hides}</hides>`,
    `    <owns type="${o.owns}"/>`,
    `    <twin kind="twin" path="src/model/Old.java" candidates="src/model/Old.java"></twin>`,
    `    <needs>${o.needs.map((n) => `<need path="${n[0]}" why="${n[1] ?? "нужен тип"}"/>`).join("")}</needs>`,
    `    <contract><sig>${o.sig}</sig><pre>${o.pre}</pre><post>${o.post}</post><fail>${o.fail}</fail></contract>`,
    `  </module>`,
  ].join("\n")
}
const tree = (...mods) => `<tree task="T" goal="g">\n${mods.join("\n")}\n</tree>\n`

const GREEN = tree(
  mod("src/model/Doc.java", { owns: "Doc", sig: "public class Doc { String getName(); }" }),
  mod("src/mongo/Store.java", { needs: [["src/model/Doc.java"]], sig: "public class Store implements IStore" }),
  mod("src/rest/RestStore.java", { needs: [["src/mongo/Store.java"], ["src/model/Doc.java"]], sig: "public class RestStore" }),
)
const portion = (text, mine = MINE) => checkTree({ text, mine, family: MINE, known: ["src/model/Old.java"], portion: true })
const whole = (text) => checkTree({ text, mine: MINE, family: MINE, frd: FRD, whole: true })

// СОСТАВ РАБОТЫ — ДВЕ ДОРОГИ. Дельта говорит «меняется вот это», сценарий — «через это проходит
// изменение». Забыть вторую значит собрать план, в котором про модуль написано, а тикета нет.
test("состав изменения: дельты И узлы сценариев, каждый по разу", () => {
  const got = [...modulesOfChange({ frd: FRD }).keys()]
  assert.deepEqual(got, ["src/model/Doc.java", "src/rest/RestStore.java", "src/mongo/Store.java"])
  assert.equal(modulesOfChange({}).size, 0, "пустое требование — пустой состав, а не бросок")
})

// ОБРАЗЕЦ ИЩЕТСЯ ПО ФОРМЕ ПУТИ, И РОД ПЕРЕВЕШИВАЕТ ЗЕРКАЛО.
test("близнец: свой род важнее соседа, отсутствие называется словом", () => {
  assert.deepEqual(sampleOf("src/mongo/Store.java", MAP), { kind: "neighbour", path: "src/mongo/OldStore.java" })
  assert.deepEqual(sampleOf("src/model/Old.java", MAP), { kind: "self", path: "src/model/Old.java" })
  assert.deepEqual(sampleOf("src/nowhere/Thing.kt", MAP), { kind: "none", path: "" })
})

// СКЕЛЕТ СЧИТАЕТ ВСЁ, ЧТО МОЖНО ПОСЧИТАТЬ, И ОСТАВЛЯЕТ РОЛИ РОВНО ЕЁ РАБОТУ.
test("скелет: модуль на каждый узел работы, факты ряби внутри, решения роли пусты", () => {
  const s = treeSkeleton({
    frd: FRD, map: MAP,
    ripple: `<ripple><module path="src/mongo/Store.java"><decl kind="method" name="create"/><api name="POST /store"/></module></ripple>`,
  })
  assert.equal(s.modules, 3)
  const { modules } = parseTree(s.xml)
  assert.deepEqual(modules.map((m) => m.path), [...modulesOfChange({ frd: FRD }).keys()])
  assert.equal(modules.every((m) => m.hides === "" && m.contract.sig === ""), true, "скелет решил за роль")
  // ОБРАЗЕЦ ВЫБИРАЕТ РОЛЬ. Скрипт кладёт кандидатов: всякая формула выбора («первый попавшийся»,
  // «большинство», «слово из требования») дала на eddi РАЗНЫЙ ответ, а это суждение, а не вычисление.
  assert.match(s.xml, /<twin kind="neighbour" path="" candidates="src\/mongo\/OldStore.java"/, "кандидаты не предложены либо образец выбран за роль")
  assert.match(treeSkeleton({ frd: FRD, map: `<map><module path="src/model/Doc.java"/></map>` }).xml,
    /<twin kind="self" path="src\/model\/Doc.java"/, "существующий модуль сам себе образец, и это не выбор")
  assert.match(s.xml, /<decl kind="method" name="create"\/>/, "факты ряби не доехали — роль пойдёт читать файлы")
})

// ПОРЦИЯ СУДИТСЯ ТЕМ, ЧТО РОЛЬ РЕШАЕТ В МОМЕНТ НАПИСАНИЯ.
test("порция: состав, секрет, io из словаря, контракт и needs — ПУТЬ", () => {
  assert.deepEqual(portion(GREEN), [])

  assert.match(portion(tree(mod("src/model/Doc.java"))).join("\n"), /нет решения по модулям/)
  assert.match(portion(tree(...MINE.map((p) => mod(p)), mod("src/other/X.java"))).join("\n"), /не из этой порции/)
  assert.match(portion(GREEN.replace("<hides>секрет</hides>", "<hides></hides>")).join("\n"), /пуст <hides>/)
  assert.match(portion(GREEN.replace('io="none"', 'io="database"')).join("\n"), new RegExp(IO_KINDS.join(" · ").replace(/\|/g, "\\|")))
  assert.match(portion(GREEN.replace("<sig>public class Doc { String getName(); }</sig>", "<sig></sig>")).join("\n"), /пуста <sig>/)
  assert.match(portion(GREEN.replace('path="src/model/Old.java" candidates', 'path="" candidates')).join("\n"), /не назван образец/)

  // ИМЯ КЛАССА ВМЕСТО ПУТИ — ГЛАВНЫЙ ПРОМАХ РОЛИ, и блокер обязан показать выход образцом.
  const named = GREEN.replace('path="src/model/Doc.java" why', 'path="Doc" why')
  assert.match(portion(named).join("\n"), /это не путь; напиши ПУТЬ файла/)
  // Путь, которого нет ни в работе, ни в репозитории.
  assert.match(portion(GREEN.replace('path="src/mongo/Store.java" why', 'path="src/mongo/Nope.java" why')).join("\n"), /нет ни среди модулей работы, ни в репозитории/)
  // Сосед из ДРУГОЙ порции призраком не считается: family шире, чем mine.
  assert.deepEqual(checkTree({
    text: tree(mod("src/rest/RestStore.java", { needs: [["src/mongo/Store.java"]] })),
    mine: ["src/rest/RestStore.java"], family: MINE, known: [], portion: true,
  }), [])
})

// ЦЕЛОЕ СУДИТ ТО, ЧЕГО ПОРЦИЯ ЗНАТЬ НЕ МОЖЕТ.
test("целое: состав против требования, один владелец типа, needs ацикличен", () => {
  assert.deepEqual(whole(GREEN), [])

  assert.match(whole(tree(mod("src/model/Doc.java"), mod("src/mongo/Store.java"))).join("\n"), /требование трогает модули, которых в дереве нет/)
  assert.match(whole(GREEN + tree(mod("src/extra/Y.java"))).join("\n"), /которых требование не трогает/)

  const twoOwners = GREEN.replace('<owns type=""/>', '<owns type="Doc"/>')
    .replace("public class Store implements IStore", "public class Store implements IStore { Doc read(); }")
  assert.match(whole(twoOwners).join("\n"), /объявлен собственностью 2 модулей/)

  // КРУГ. `needs` описывает объявления, и круга в нём быть не может: он означает, что одно из рёбер
  // на самом деле вызов. Блокер обязан это сказать, а не просто напечатать путь.
  const circle = GREEN.replace(
    `<needs><need path="src/model/Doc.java" why="нужен тип"/></needs>`,
    `<needs><need path="src/rest/RestStore.java" why="нужен тип"/></needs>`)
  const c = whole(circle).join("\n")
  assert.match(c, /needs замкнуто в круг/)
  assert.match(c, /не от объявления, а от вызова/)
})

// РАЗЪЕХАВШЕЕСЯ ИМЯ ТИПА — БАГ, КОТОРЫЙ ВИДЕН ТОЛЬКО ПРИ СВЕРКЕ ДВУХ РАЗДЕЛОВ.
test("целое: тип пишется везде одним написанием, и владелец называет свой тип", () => {
  const drift = GREEN.replace("public class RestStore", "public class RestStore { Store store; Doc read(); }")
  assert.deepEqual(whole(drift), [], "правильное написание не должно краснеть")

  const wrong = GREEN.replace("public class RestStore", "public class RestStore { Reststore store; }")
  assert.match(whole(wrong).join("\n"), /называет «Reststore», а модуль дерева зовётся «RestStore»/)

  const mute = GREEN.replace('<owns type="Doc"/>', '<owns type="Document"/>')
  assert.match(whole(mute).join("\n"), /владеет типом «Document», но его сигнатура этого типа не называет/)

  // …но у ИЗМЕНЯЕМОГО файла объявление уже в репозитории, а <sig> показывает дельту: требовать там
  // имени класса значит требовать переписать чужой файл целиком.
  assert.deepEqual(whole(mute.replace('path="src/model/Doc.java" delta="Added"', 'path="src/model/Doc.java" delta="Changed"')), [])
})

// ВЫЖИМКА ОБРАЗЦА — ЭТО ОБЪЯВЛЕНИЯ, А НЕ ФАЙЛ. Первый живой прогон нового шага собрал наряд, где тело
// близнеца заняло 35 КБ из 55 КБ; выжимка ИЗ КАРТЫ не помогла — там `sig` усечён разведкой до
// «public class X», без `extends` и аннотаций, то есть без единственного, ради чего образец нужен.
test("выжимка берёт объявление типа с аннотациями, поля и сигнатуры — и называет отброшенное", () => {
  const java = [
    "package app.loans;", "", "import java.util.List;", "/** doc */",
    "@ApplicationScoped",
    "public class LoanStore extends AbstractStore<Loan> implements ILoanStore {",
    "    private static final Pattern NAME = Pattern.compile(\"[a-z]+\");",
    "    @Inject",
    "    public LoanStore(IStorageFactory f) {",
    "        this.f = f;",
    "    }",
    "    @Override",
    "    public List<Loan> readAll() throws StoreException {",
    "        if (x) { return List.of(); }",
    "        return storage.all();",
    "    }",
    "    public static class Nested {",
    "        private String hidden;",
    "    }",
    "}",
  ].join("\n")
  const d = digestOf(java)
  const text = d.lines.join("\n")

  assert.match(text, /@ApplicationScoped/, "аннотация типа потеряна — по ней роль узнаёт форму файла")
  assert.match(text, /public class LoanStore extends AbstractStore<Loan> implements ILoanStore/, "объявление типа обрублено")
  assert.match(text, /private static final Pattern NAME/, "поле потеряно")
  assert.match(text, /public List<Loan> readAll\(\) throws StoreException/, "сигнатура метода потеряна")

  assert.doesNotMatch(text, /return storage\.all/, "в выжимку попало ТЕЛО метода")
  assert.doesNotMatch(text, /class Nested/, "вложенный тип занял место объявлений — на eddi их двенадцать")
  assert.doesNotMatch(text, /import java/, "импорт занял строку выжимки")
  assert.ok(d.took.dropped > 0, "выжимка не сказала, сколько отбросила — тогда она притворяется файлом")
  assert.equal(d.took.methods, 2)
  assert.equal(d.took.fields, 1)

  assert.deepEqual(digestOf("").lines, [], "пустой файл — пустая выжимка, а не бросок")
})

// ФОРМА ИМЕНИ ПЕРЕВЕШИВАЕТ РОД. `IRestGlossaryStore` и `IAgentStore` кончаются одинаково — «Store», —
// но учат разному: первый это внешний адрес, второй контракт хранения. На живых артефактах eddi
// отбор по роду выдал REST-интерфейсу образцом обычное хранилище (21.08.2026).
test("образец ищется по ФОРМЕ имени: сущность вычитается по каталогу", () => {
  assert.equal(shapeOf("src/configs/glossaries/IRestGlossaryStore.java"), "I*Rest*Store")
  assert.equal(shapeOf("src/configs/agents/IRestAgentStore.java"), "I*Rest*Store", "две формы одного вида разошлись")
  assert.equal(shapeOf("src/configs/agents/IAgentStore.java"), "I*Store", "интерфейс хранения смешался с REST")

  const map = `<map>
    <module path="src/configs/agents/IAgentStore.java"/>
    <module path="src/configs/agents/IRestAgentStore.java"/>
  </map>`
  const first = rankedCandidates("src/configs/glossaries/IRestGlossaryStore.java", map)[0]
  assert.equal(first, "src/configs/agents/IRestAgentStore.java", "первым предложен образец другой формы")
  assert.equal(sampleOf("src/configs/glossaries/IRestGlossaryStore.java", map).path, "src/configs/agents/IRestAgentStore.java")
})

// РАЗОРВАННАЯ СИГНАТУРА — НОРМА JAVA, А НЕ РЕДКОСТЬ: `throws` уезжает на следующую строку. Первая
// версия выжимки потеряла у близнеца ровно `update` и `delete` — те два метода, что несут
// `@ConfigurationUpdate` на изменяющих операциях, то есть главное соглашение образца.
test("выжимка собирает сигнатуру, разорванную на строки, и несёт номер её первой строки", () => {
  const java = [
    "@ApplicationScoped",                                        // 1
    "public class Store extends AbstractStore<Doc> {",           // 2
    "    @Override",                                             // 3
    "    @ConfigurationUpdate",                                  // 4
    "    public Integer update(String id, Integer version, Doc d)", // 5
    "            throws StoreException, NotFoundException {",    // 6
    "        return super.update(id, version, d);",              // 7
    "    }",                                                     // 8
    "}",                                                         // 9
  ].join("\n")
  const text = digestOf(java).lines.join("\n")
  assert.match(text, /@ConfigurationUpdate/, "аннотация изменяющей операции потеряна")
  assert.match(text, /public Integer update\(String id, Integer version, Doc d\) throws StoreException, NotFoundException/,
    "сигнатура, разорванная на строки, не собрана — потеряется ровно то, ради чего берут образец")
  assert.match(text, /^\s*5: public Integer update/m, "номер строки не тот: роль дочитает не туда")
  assert.doesNotMatch(text, /return super/, "в выжимку попало тело")
})
