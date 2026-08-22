// КОМПОНЕНТНЫЙ ТЕСТ ШАГА 9B — шаг целиком, от артефактов на входе до продвинутого дерева, с
// НАСТОЯЩИМ ответом модели и настоящими гардрейлами. Юниты рядом (../judge/) судят ПРАВИЛА;
// здесь судится ШАГ: суд входа → скрипт посчитал → наряд собрался → роль ответила → гардрейл
// принял → артефакт лёг.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ РОД ТЕСТА. Полоса исполняется в песочнице хоста и никем не импортируется: без
// этого теста единственным способом узнать, работает ли шаг, был живой прогон — 4-9 минут на вызов
// роли и отдельная сессия pi. Здесь тот же путь проходится за миллисекунды.
//
// ЗАГЛУШКА МОДЕЛИ — ЭТО ЗАПИСАННЫЙ ОТВЕТ, А НЕ ВЫДУМАННЫЙ. `answer-qwen.txt` получен запросом к
// openrouter (qwen3.6-27b, temperature 0) на наряд, который собирает ЭТОТ ЖЕ код: 6 120 токенов
// входа, 7 835 выхода, из них 6 462 рассуждений.
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import * as step from "../tree.step.mjs"
import { parseTree } from "../tree.mjs"
import { start } from "../../../../ext/state.mjs"
import { instruction } from "../../../../ext/values.mjs"
import { repairTask } from "../../repair.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const ANSWER = readFileSync(join(HERE, "answer-qwen.txt"), "utf8")

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
  return start({ cwd: root, run: "component", key: "DOS-535" }).value
}

// ТОТ ЖЕ ПОРЯДОК ХОДОВ, ЧТО В ПОЛОСЕ. Копия неизбежна — песочница не умеет import, а
// agent/parallel/checkpoint живут только в ней, — и потому её сторожит шов
// (ext/vocabulary.test.mjs: слова модулей ↔ ключи PRIMITIVES ↔ ветви этого цикла).
const drive = (state, answer) => {
  const trace = []
  for (let it = step.next(state); it.do !== "done"; it = step.next(state)) {
    assert.equal(instruction(it).ok, true, `шаг выдал инструкцию, которую конструктор не принимает: ${JSON.stringify(it).slice(0, 120)}`)
    trace.push(it)
    if (it.do === "err") return { state, trace }
    const r = step.fold(state, { do: it.do, instruction: it, result: answer(it, trace.length) })
    if (!r.ok) return { state, trace, refused: r.error }
    state = r.value
    assert.ok(trace.length < 40, "шаг не сходится — полоса крутится на одном и том же ходе")
  }
  return { state, trace }
}

// Заглушка роли: делает то же, что роль своими руками — ПИШЕТ ФАЙЛ по staging-пути и возвращает
// конверт с ПУТЁМ. Текста в конверте нет и быть не может: документ по RPC не едет.
const respond = (state, answer) => (it) => {
  if (it.do !== "role") return null
  writeFileSync(join(state.cwd, it.staging), answer.replace(/^```xml\n?|```\s*$/g, ""))
  return { track: "ok", artifact: it.staging }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
test("9B успех: суд входа → скелет → наряд → роль → гардрейл → дерево легло", () => {
  const s0 = arrange()

  // ACT
  const run = drive(s0, respond(s0, ANSWER))

  // ASSERT — скрипт посчитал состав сам, и он лёг в состояние
  const said = run.trace.find((i) => i.do === "say")
  assert.ok(said, "шаг не сказал, что посчитал — состав работы остался невидимым")
  assert.match(said.line, /модулей 4, порций 1/, "состав считается из дельт и узлов сценария требования")

  // ASSERT — наряд несёт то, без чего роль не ответит
  const order = run.trace.find((i) => i.do === "role")
  assert.ok(order, "шаг не выдал ни одного наряда")
  assert.equal(order.role, "tree-designer")
  assert.match(order.text, /BookStore\.java/, "в наряде нет образца — роль будет выдумывать базовый класс")
  assert.match(order.text, /extends AbstractResourceStore<Book> implements IBookStore/, "выжимка не донесла объявление образца")
  assert.match(order.text, /@ConfigurationUpdate/, "выжимка потеряла аннотацию изменяющей операции")
  assert.match(order.text, /^\s*\d+: @ApplicationScoped/m, "у строк выжимки нет номеров — роль не сможет дочитать точечно")
  // Наряд переведён оператором на английский — это отметка о ревизии (standards/role.md §5), и шов
  // сторожит СМЫСЛ правила, а не его язык.
  assert.match(order.text, /WITHOUT WHICH I CANNOT BE WRITTEN|БЕЗ ЧЕГО МЕНЯ НЕ НАПИСАТЬ/, "главное правило наряда пропало")
  assert.match(order.text, /interface does NOT need its own implementation|интерфейс в своей реализации НЕ нуждается/i,
    "наряд не говорит того, ради чего переписан весь шаг")
  assert.ok(!/\{[A-Z_]+\}/.test(order.text), "слот остался незаполненным — данные не доехали")

  // ASSERT — ВЕРДИКТЫ ЛЕЖАТ В СОСТОЯНИИ: и порции, и целого
  const v = run.state.verdicts
  assert.deepEqual(v.map((x) => `${x.scope}:${x.ok}`), ["portion:true", "whole:true"],
    `вердикты не те: ${JSON.stringify(v.map((x) => [x.scope, x.ok, x.blockers]))}`)

  // ASSERT — артефакт продвинут, и его отпечаток лёг в состояние
  assert.equal(run.state.at.tree.path, ".agent/tree.xml")
  assert.ok(existsSync(join(run.state.cwd, ".agent/tree.xml")), "дерево не легло на диск")
  assert.match(run.state.at.tree.sha1, /^[0-9a-f]{40}$/, "продвинутый артефакт без отпечатка — следующий шаг поверит на слово")

  // ASSERT — и главное: модель поняла, ЧТО такое `needs`. Это и есть вопрос всей переделки шага 9.
  const { modules } = parseTree(readFileSync(join(run.state.cwd, ".agent/tree.xml"), "utf8"))
  const need = new Map(modules.map((m) => [m.path, m.needs.map((n) => n.path)]))
  assert.deepEqual(need.get("src/loans/model/Loan.java"), [], "модель данных не зависит ни от кого")
  assert.deepEqual(need.get("src/loans/ILoanStore.java"), ["src/loans/model/Loan.java"], "интерфейс нуждается в своём типе")
  assert.ok(need.get("src/loans/mongo/LoanStore.java").includes("src/loans/ILoanStore.java"), "реализация не объявила свой интерфейс")
  assert.ok(!need.get("src/loans/ILoanStore.java").includes("src/loans/mongo/LoanStore.java"),
    "ИНТЕРФЕЙС ОБЪЯВИЛ СВОЮ РЕАЛИЗАЦИЮ — это `calls`, а не `needs`, и ровно этот маятник переписывал шаг 9")
})

// ОТБИТЫЙ ОТВЕТ — ТОЖЕ РЕЗУЛЬТАТ ШАГА, и путь починки обязан быть проверен тем же способом.
// Портится ровно тот случай, ради которого шаг переписан: интерфейс объявляет свою реализацию.
test("9B нарушение: гардрейл ловит круг в needs, дерево НЕ легло, наряд починки несёт адрес", () => {
  const s0 = arrange()
  const broken = ANSWER.replace(
    `<needs>\n      <need path="src/loans/model/Loan.java" why="параметр типа IResourceStore&lt;Loan&gt;"/>\n    </needs>`,
    `<needs>\n      <need path="src/loans/model/Loan.java" why="параметр типа IResourceStore&lt;Loan&gt;"/>\n      <need path="src/loans/mongo/LoanStore.java" why="зовёт реализацию"/>\n    </needs>`)
  assert.notEqual(broken, ANSWER, "порча не применилась — тест судит не то, что думает")

  const run = drive(s0, respond(s0, broken))

  // Порция ЗЕЛЕНА: круг — свойство ЦЕЛОГО, порция его видеть не может по построению.
  const v = run.state.verdicts
  assert.equal(v[0].scope, "portion")
  assert.equal(v[0].ok, true, "порция отбита не тем правилом")
  const whole = v.find((x) => x.scope === "whole")
  assert.equal(whole.ok, false, "суд целого пропустил круг в needs")
  assert.match(whole.blockers, /needs замкнуто в круг/)
  assert.match(whole.blockers, /не от объявления, а от вызова/, "блокер не объясняет, ЧТО не так с ребром")

  // Артефакт НЕ продвинут — это отдельное утверждение, а не следствие красного вердикта.
  assert.ok(!existsSync(join(run.state.cwd, ".agent/tree.xml")), "отбитое дерево всё равно легло на диск")
  assert.equal(run.state.at.tree, undefined, "отпечаток отбитого дерева попал в состояние")

  // Порция возвращена в работу с блокером — наряд починки будет чем наполнить. Роль отвечает тем
  // же испорченным ответом, поэтому шаг доходит до конца бюджета и ЭСКАЛИРУЕТ, а не чинит вечно.
  const last = run.trace[run.trace.length - 1]
  assert.equal(last.do, "err")
  assert.equal(last.code, "escalate", `шаг не эскалировал: ${JSON.stringify(last).slice(0, 120)}`)
  const spent = run.state.portions[0].round
  assert.equal(spent, s0.budgets.loops + 1, `круги починки не потрачены (round=${spent}) — шаг чинил бы вечно`)

  // Наряд починки: задача из вердикта, у находки — АДРЕС правки.
  const todo = repairTask(whole.blockers)
  assert.equal(todo.count, 1)
  assert.match(todo.lines[0], /^1\. \[src\/loans\/[\w/]+\.java\]/, "у находки нет адреса — роль пойдёт искать место по всему файлу")

  // Наряды со второго круга — ПОЧИНКА: несут прошлый ответ роли и НЕ несут скелета.
  const fix = run.trace.filter((i) => i.do === "role")[1]
  assert.ok(fix, "второго наряда не было — круг починки не состоялся")
  assert.match(fix.text, /LoanStore/, "наряд починки не несёт прошлый ответ роли")
  assert.ok(!/\{[A-Z_]+\}/.test(fix.text), "в наряде починки остался пустой слот")
})

// ОТКАЗ ЛЛМ — ТРЕТИЙ РЕЗУЛЬТАТ ШАГА, и сегодня его не проверяет ничто, кроме живого прогона.
test("9B обрыв: связь оборвалась — шаг не закрылся, артефакт не написан, КРУГ НЕ ПОТРАЧЕН", () => {
  const s0 = arrange()

  let calls = 0
  const flaky = (it) => {
    if (it.do !== "role") return null
    calls += 1
    if (calls === 1) return { track: "err", kind: "crashed", subject: "connection reset by peer" }
    writeFileSync(join(s0.cwd, it.staging), ANSWER.replace(/^```xml\n?|```\s*$/g, ""))
    return { track: "ok", artifact: it.staging }
  }

  const run = drive(s0, flaky)

  assert.equal(calls, 2, "после обрыва шаг не переспросил роль")
  // Круг остался первым: обрыв — не ошибка роли, и платить за него бюджетом починки нельзя.
  const portionVerdicts = run.state.verdicts.filter((x) => x.scope === "portion")
  assert.equal(portionVerdicts.length, 1, "обрыв попал в вердикты — его судили как ответ")
  assert.equal(portionVerdicts[0].round, 1, "ОБРЫВ СЪЕЛ КРУГ ПОЧИНКИ — три обрыва подряд дадут escalate там, где роль не ошиблась ни разу")
  // И шаг всё-таки дошёл до конца на втором заходе.
  assert.equal(run.state.at.tree.path, ".agent/tree.xml")
})
