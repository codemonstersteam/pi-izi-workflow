// КОМПОНЕНТНЫЙ ТЕСТ ШАГА 9B — шаг целиком, от артефактов на входе до продвинутого дерева, с
// НАСТОЯЩИМ ответом модели и настоящими гардрейлами. Юниты рядом (../tree.test.mjs) судят функции;
// здесь судится ШАГ: скрипт посчитал → наряд собрался → роль ответила → гардрейл принял → артефакт лёг.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ РОД ТЕСТА. Полоса исполняется в песочнице хоста и никем не импортируется: до этого
// теста единственным способом узнать, работает ли шаг, был живой прогон — 4-9 минут на вызов роли и
// отдельная сессия pi. Здесь тот же путь проходится за миллисекунды, потому что ответ модели снят
// один раз и лежит рядом файлом.
//
// ЗАГЛУШКА МОДЕЛИ — ЭТО ЗАПИСАННЫЙ ОТВЕТ, А НЕ ВЫДУМАННЫЙ. `answer-qwen.txt` получен запросом к
// openrouter (qwen3.6-27b, temperature 0) на наряд, который собирает ЭТОТ ЖЕ код: 6 120 токенов
// входа, 7 835 выхода, из них 6 462 рассуждений. Выдуманный ответ проверял бы наши ожидания от
// модели, а не саму модель.
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import { tree, treeOrder, treeJoin, repair } from "../../../../ext/index.mjs"
import { parseTree } from "../tree.mjs"
import { wavesOf } from "../../book/book.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..", "..", "..", "..")
const ctx = (root) => ({ run: { cwd: root } })

// --- ARRANGE: артефакты на входе шага, все рядом в fixture/ ---------------------------------------
//
//   .agent/frd.xml       требование: UC1 «продлить займ», 4 дельты, ветвление LOAN_OVERDUE, поля
//   .agent/ripple.xml    что задето: объявления mongo-хранилища
//   .agent/appgraph.xml  карта репозитория: семья `books` — она и даст образцы
//   src/books/*.java     живые файлы образцов: из них скрипт соберёт выжимку с номерами строк
//
// Больше шагу 9B не нужно ничего: словарь значений (9A) он не читает, потоки (9C) идут после него.
const arrange = () => {
  const root = mkdtempSync(join(tmpdir(), "izi-tree-"))
  cpSync(join(HERE, "fixture"), root, { recursive: true })
  mkdirSync(join(root, ".agent", "staging"), { recursive: true })
  for (const p of [".agent/frd.xml", ".agent/ripple.xml", ".agent/appgraph.xml", "src/books/mongo/BookStore.java"]) {
    assert.ok(existsSync(join(root, p)), `фикстура неполна: нет ${p}`)
  }
  return root
}

// Заглушка модели: то, что роль делает своими руками — пишет файл по staging-пути. Возвращает то же,
// что вернул бы конверт роли.
const llmStub = (answer) => (root, staging) => {
  writeFileSync(join(root, staging), answer.replace(/^```xml\n?|```\s*$/g, ""))
  return { track: "ok", artifact: staging }
}

const ANSWER = readFileSync(join(HERE, "answer-qwen.txt"), "utf8")

// --- ШАГ ЦЕЛИКОМ ----------------------------------------------------------------------------------
// Порядок ровно тот, которым идёт полоса: скелет → наряд → роль → суд порции → склейка → суд целого.
const runStep = (root, respond) => {
  const skeleton = tree.run({}, ctx(root))
  const orders = []
  const verdicts = []
  for (let n = 1; n <= skeleton.portions; n++) {
    const o = treeOrder.run({ slice: n }, ctx(root))
    const tpl = readFileSync(join(ROOT, "steps/plan/tree/order-tree.tpl"), "utf8")
    let text = tpl
    for (const [k, v] of Object.entries(o.slots)) text = text.split(`{${k}}`).join(v)
    orders.push(text)
    respond(root, `.agent/staging/tree~${n}.xml`)
    verdicts.push(tree.run({ path: `.agent/staging/tree~${n}.xml`, slice: n }, ctx(root)))
  }
  const joined = treeJoin.run({ portions: skeleton.portions }, ctx(root))
  const whole = tree.run({ path: ".agent/staging/tree.xml", composed: true }, ctx(root))
  return { skeleton, orders, verdicts, joined, whole }
}

test("шаг 9B на настоящем ответе модели: скелет → наряд → роль → гардрейл → артефакт", () => {
  const root = arrange()

  // ACT
  const run = runStep(root, llmStub(ANSWER))

  // ASSERT — скрипт посчитал состав сам
  assert.equal(run.skeleton.ok, true)
  assert.equal(run.skeleton.modules, 4, "состав считается из дельт и узлов сценария требования")
  assert.equal(run.skeleton.portions, 1)

  // ASSERT — наряд несёт то, без чего роль не ответит
  const order = run.orders[0]
  assert.match(order, /BookStore\.java/, "в наряде нет образца — роль будет выдумывать базовый класс")
  assert.match(order, /extends AbstractResourceStore<Book> implements IBookStore/, "выжимка не донесла объявление образца")
  assert.match(order, /@ConfigurationUpdate/, "выжимка потеряла аннотацию изменяющей операции")
  assert.match(order, /^\s*\d+: @ApplicationScoped/m, "у строк выжимки нет номеров — роль не сможет дочитать точечно")
  // Наряд дерева переведён оператором на английский — это отметка о ревизии (standards/role.md §5),
  // и шов сторожит СМЫСЛ правила, а не его язык.
  assert.match(order, /WITHOUT WHICH I CANNOT BE WRITTEN|БЕЗ ЧЕГО МЕНЯ НЕ НАПИСАТЬ/, "главное правило наряда пропало")
  assert.match(order, /interface does NOT need its own implementation|интерфейс в своей реализации НЕ нуждается/i,
    "наряд не говорит того, ради чего переписан весь шаг")
  assert.ok(!order.includes("{SKELETON}") && !order.includes("{TWIN}"), "слот остался незаполненным — данные не доехали")

  // ASSERT — гардрейл порции принял ответ модели
  assert.deepEqual(run.verdicts[0].blockers, undefined, `порция отбита: ${run.verdicts[0].blockers}`)
  assert.equal(run.verdicts[0].ok, true)

  // ASSERT — суд целого принял и продвинул артефакт
  assert.equal(run.joined.ok, true)
  assert.equal(run.whole.ok, true, `целое отбито: ${run.whole.blockers}`)
  assert.equal(run.whole.at, ".agent/tree.xml")
  assert.ok(existsSync(join(root, ".agent/tree.xml")), "дерево не легло на диск")

  // ASSERT — и главное: модель поняла, ЧТО такое `needs`. Это и есть вопрос всей переделки шага 9.
  const { modules } = parseTree(readFileSync(join(root, ".agent/tree.xml"), "utf8"))
  const need = new Map(modules.map((m) => [m.path, m.needs.map((n) => n.path)]))
  assert.deepEqual(need.get("src/loans/model/Loan.java"), [], "модель данных не зависит ни от кого")
  assert.deepEqual(need.get("src/loans/ILoanStore.java"), ["src/loans/model/Loan.java"], "интерфейс нуждается в своём типе")
  assert.ok(need.get("src/loans/mongo/LoanStore.java").includes("src/loans/ILoanStore.java"), "реализация не объявила свой интерфейс")
  assert.ok(!need.get("src/loans/ILoanStore.java").includes("src/loans/mongo/LoanStore.java"),
    "ИНТЕРФЕЙС ОБЪЯВИЛ СВОЮ РЕАЛИЗАЦИЮ — это `calls`, а не `needs`, и ровно этот маятник переписывал шаг 9")

  // ASSERT — очередь работ считается и она ациклична
  const { waves, cycle } = wavesOf({ tree: readFileSync(join(root, ".agent/tree.xml"), "utf8") })
  assert.deepEqual(cycle, [], "в needs круг")
  assert.deepEqual(waves[0], ["src/loans/model/Loan.java"], "первой волной идёт не объявление")
  assert.equal(waves.length, 3, "волны: модель → интерфейс → реализации")
})

// ОТБИТЫЙ ОТВЕТ — ТОЖЕ РЕЗУЛЬТАТ ШАГА, и путь починки обязан быть проверен тем же способом.
// Портится ровно тот случай, ради которого шаг переписан: интерфейс объявляет свою реализацию.
test("шаг 9B на испорченном ответе: гардрейл ловит круг и наряд починки несёт адрес правки", () => {
  const root = arrange()
  const broken = ANSWER.replace(
    `<needs>\n      <need path="src/loans/model/Loan.java" why="параметр типа IResourceStore&lt;Loan&gt;"/>\n    </needs>`,
    `<needs>\n      <need path="src/loans/model/Loan.java" why="параметр типа IResourceStore&lt;Loan&gt;"/>\n      <need path="src/loans/mongo/LoanStore.java" why="зовёт реализацию"/>\n    </needs>`)
  assert.notEqual(broken, ANSWER, "порча не применилась — тест судит не то, что думает")

  const run = runStep(root, llmStub(broken))

  // Порция зелена: круг — свойство ЦЕЛОГО, порция его видеть не может.
  assert.equal(run.verdicts[0].ok, true)
  assert.equal(run.whole.ok, false, "суд целого пропустил круг в needs")
  assert.match(run.whole.blockers, /needs замкнуто в круг/)
  assert.match(run.whole.blockers, /не от объявления, а от вызова/, "блокер не объясняет, ЧТО не так с ребром")
  assert.ok(!existsSync(join(root, ".agent/tree.xml")), "отбитое дерево всё равно легло на диск")

  // Наряд починки: задача из вердикта, у находки — адрес правки.
  const todo = repair.run({ blockers: run.whole.blockers }, ctx(root))
  assert.equal(todo.count, 1)
  assert.match(todo.text, /^1\. \[src\/loans\/[\w/]+\.java\]/, "у находки нет адреса — роль пойдёт искать место по всему файлу")

  const fix = treeOrder.run({ slice: 1, previous: broken, feedback: run.whole.blockers, fix: true }, ctx(root))
  assert.equal(fix.fix, true)
  assert.ok(fix.slots.TASKLIST.includes("круг"), "наряд починки не несёт находку")
  assert.equal(fix.slots.COUNT, "1")
  assert.ok(!("SKELETON" in fix.slots), "в наряд починки попал скелет — на починке он мёртвый груз")
  assert.ok(fix.slots.PREVIOUS.includes("LoanStore"), "наряд починки не несёт прошлый ответ роли")
})
