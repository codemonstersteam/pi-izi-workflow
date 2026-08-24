// КОМПОНЕНТНЫЙ ТЕСТ ПОДШАГА 2A — подшаг целиком, в изоляции, на НАСТОЯЩЕМ ответе роли.
// ЕДИНСТВЕННОЕ описание его поведения: таблица SCENARIOS ниже и есть документ.
//
// Читают её двое. Человек: `node steps/brd/normalize/component/normalize.component.test.mjs`
// печатает таблицу Gherkin'ом. Машина: тесты ниже поднимают названную фикстуру и гоняют подшаг ТЕМ
// ЖЕ приводом, что полоса. Второго файла с тем же содержанием нет намеренно.
//
// ЗАГЛУШКА — ЗАПИСАННЫЙ ОТВЕТ: `answer-normalize.txt` это таблица, которую роль написала на живом
// заказе eddi 22.08.2026 (qwen3.6-27b, effort low, 60 с, 4514 токенов). Шапка «#» — метка
// записи, а не часть ответа: она снимается, дальше документ едет байт в байт.
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import * as step from "../normalize.step.mjs"
import { parseRows } from "../normalize.mjs"
import { start, sha1of } from "../../../../ext/state.mjs"
import { instruction } from "../../../../ext/values.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const ANSWER = readFileSync(join(HERE, "answer-normalize.txt"), "utf8")
  .split("\n").filter((l) => !l.startsWith("#")).join("\n").trim() + "\n"

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// ЧТО ДЕЛАЕТ ПОДШАГ 2A — В ВИДЕ ДАННЫХ.
//
// ФОРМУЛА (codemonsters.team, «Мифология тестирования: компонентные тесты»):
//     N = 1 (штатное) + Σ (различимых ветвей в адаптере i)
// Адаптера ДВА: файловая система (TASK.md) и МОДЕЛЬ (роль normalizer, которую подшаг зовёт ДВАЖДЫ —
// проход 1 пишет таблицу, проход 2 её чистит). Оператора среди них нет: нормализация переписывает
// заказ, а не решает о нём, и спрашивать ей не о чем. Ветвей восемь, значит сценариев девять.
// Различимые блокеры судей сюда НЕ входят: контроль формы строки и сохранность литералов — работа
// юнитов (normalize.test.mjs, clean.test.mjs). Исключение то же, что и раньше: класс, на котором
// стоит сценарий про НАРЯД ПОЧИНКИ, а не про само правило.

export const STEP = Object.freeze({
  id: "brd/normalize",
  title: "проза заказа → таблица действий → чистка дублей",
  role: "normalizer",
  roleClean: "cleaner",
  in: ["TASK.md", "state.key", "state.at.task"],
  out: [".agent/normalized.md", "state.at.normalized", "state.verdicts[]"],
  adapters: ["файловая система (TASK.md)", "модель (роль normalizer, ДВА прохода)"],
  passes: ["1 — таблица по прозе заказа", "2 — чистка: слить дубли, убрать выдуманное"],
})

export const SCENARIOS = Object.freeze([
  { n: 1, kind: "happy", branch: null, fixture: "good",
    name: "роль вернула таблицу живого прогона",
    given: "TASK.md заказа eddi и ключ задачи в состоянии",
    when: "роль ответила записанной таблицей из 16 строк",
    then: ["гардрейл ПРИНЯЛ записанный ответ на ОБОИХ проходах",
           "чистке нечего было слить — она вернула ту же таблицу",
           "таблица легла в .agent/normalized.md и совпала с ответом ПОБАЙТОВО",
           "отпечаток лёг в at.normalized — ворота узнают, что таблицу не правили",
           "оба черновика из staging убраны"],
    expect: { done: true, stamped: "normalized", etalon: true, verdicts: 2, rows: 16 } },

  { n: 2, kind: "adapter", branch: "no-task", fixture: "no-task",
    name: "TASK.md нет вовсе",
    given: "каталог прогона без TASK.md",
    when: "подшаг сделал первый ход",
    then: ["отказ blocked класса no-task", "модель не звалась"],
    expect: { do: "err", cls: "no-task", calledModel: false } },

  { n: 3, kind: "adapter", branch: "no-key", fixture: "no-key",
    name: "шаг 1 не закрыт — ключа нет",
    given: "TASK.md на месте, но ключа в состоянии нет",
    when: "подшаг сделал первый ход",
    then: ["отказ blocked класса no-key", "отказ называет, чем ключ важен"],
    expect: { do: "err", cls: "no-key", subject: /ветк|тикет|план/, calledModel: false } },

  { n: 4, kind: "adapter", branch: "task-changed", fixture: "task-changed",
    name: "TASK.md правили после шага 1",
    given: "отпечаток задачи в состоянии не совпадает с файлом на диске",
    when: "подшаг сделал первый ход",
    then: ["отказ класса task-changed", "отказ говорит, ЧТО переиграть"],
    expect: { do: "err", cls: "task-changed", subject: /переиграй task/, calledModel: false } },

  { n: 5, kind: "adapter", branch: "no-file", fixture: "good",
    name: "роль вернула ok, ничего не записав",
    given: "конверт track:ok с верным путём, но файла по нему нет",
    when: "подшаг разобрал ответ",
    then: ["вердикт красный", "таблица НЕ продвинута", "круг потрачен — это ответ, а не обрыв"],
    expect: { red: /пуст|не записав/, promoted: false, round: 2 } },

  { n: 6, kind: "adapter", branch: "invalid", fixture: "good",
    name: "роль вернула прозу вместо строк",
    given: "ответ, в котором ни в одной строке нет «|»",
    when: "подшаг разобрал ответ",
    then: ["вердикт invalid, а не молчание судьи",
           "блокер называет форму строки и показывает начало ответа"],
    expect: { red: /^invalid: ответ не похож на таблицу действий/m, promoted: false } },

  { n: 7, kind: "adapter", branch: "columns", fixture: "good",
    name: "гардрейл отбил строку без колонки — наряд ПОЧИНКИ несёт задачу и прошлый ответ",
    given: "записанный ответ, у которого из одной строки убрана колонка",
    when: "подшаг выдал следующий наряд",
    then: ["вердикт назвал находку columns с номером строки",
           "наряд починки несёт находку с АДРЕСОМ строки и прошлый ответ роли",
           "таблица НЕ продвинута"],
    expect: { fixOrder: true, promoted: false } },

  { n: 8, kind: "adapter", branch: "crashed", fixture: "good",
    name: "связь оборвалась",
    given: "конверт track:err kind:crashed",
    when: "подшаг разобрал ответ",
    then: ["подшаг не закрылся на обрыве", "таблица не написана", "КРУГ НЕ ПОТРАЧЕН"],
    expect: { round: 1, verdicts: 2, retried: true } },

  { n: 9, kind: "adapter", branch: "duplicate-row", fixture: "good",
    name: "ПРОХОД ЧИСТКИ вернул таблицу с дублем — наряд починки чистки несёт находку и свой прошлый ответ",
    given: "проход 1 зелен, проход 2 вернул таблицу, где один глагол над одним объектом стоит дважды",
    when: "подшаг выдал следующий наряд",
    then: ["вердикт назвал находку duplicate-row с номерами ОБЕИХ строк",
           "наряд починки адресован ЧИСТКЕ: несёт её прошлый ответ, а не таблицу прохода 1",
           "таблица НЕ продвинута — подшаг не закрылся дублем",
           "круг прохода 1 не тронут: чинится чистка, а не нормализация"],
    expect: { fixOrder: true, promoted: false } },
])

// FUNCTION_CONTRACT: gherkin — таблица как текст для человека
//   Consequent:   success: Feature/Scenario/Given/When/Then одной строкой на пункт
//   Purity:       pure
export function gherkin() {
  const head = [
    `# ЭТО НЕ ОТДЕЛЬНЫЙ ДОКУМЕНТ, а печать таблицы из ЭТОГО ЖЕ файла — правится в SCENARIOS.`,
    `# N = 1 (штатное) + ${SCENARIOS.filter((s) => s.kind === "adapter").length} (ветви адаптеров) = ${SCENARIOS.length}`,
    ``,
    `Feature: подшаг 2A «${STEP.title}» — роль ${STEP.role}`,
    `  вход:  ${STEP.in.join(" · ")}`,
    `  выход: ${STEP.out.join(" · ")}`,
    `  адаптеры: ${STEP.adapters.join(" · ")}`,
    ``,
  ]
  const body = SCENARIOS.flatMap((s) => [
    `  Scenario: ${s.name}${s.branch ? `   # ветвь ${s.branch}` : "   # штатное поведение"}`,
    `    Given ${s.given}`,
    `      And фикстура component/fixture/${s.fixture}/`,
    `    When ${s.when}`,
    ...s.then.map((t, i) => `    ${i ? "  And" : "Then"} ${t}`),
    ``,
  ])
  return [...head, ...body].join("\n")
}
// ══════════════════════════════════════════════════════════════════════════════════════════════════

// --- ARRANGE: фикстура — КАТАЛОГ НА ДИСКЕ. Пути разрешаются от cwd ПРОГОНА, никогда от репозитория.
const arrange = (fixture) => {
  const src = join(HERE, "fixture", fixture)
  assert.ok(existsSync(src), `фикстуры ${fixture} нет`)
  const cwd = mkdtempSync(join(tmpdir(), `izi-normalize-${fixture}-`))
  cpSync(src, cwd, { recursive: true })
  mkdirSync(join(cwd, ".agent", "staging"), { recursive: true })
  const s = start({ cwd, run: `component-${fixture}`, key: fixture === "no-key" ? "" : "DOS-535" }).value
  if (fixture === "no-task") return s
  const task = readFileSync(join(cwd, "TASK.md"), "utf8")
  // Отпечаток задачи кладёт шаг 1; для ветви task-changed он намеренно от ДРУГОГО текста.
  const sha = fixture === "task-changed" ? sha1of(`${task}\n<!-- правка руками -->`) : sha1of(task)
  return { ...s, at: { task: { path: "TASK.md", sha1: sha } } }
}

// Заглушка роли делает то же, что роль руками: пишет файл по staging-пути и возвращает конверт с
// ПУТЁМ. Текста в конверте нет и быть не может — документ по RPC не едет.
const writes = (cwd, body) => (it) => {
  if (it.do !== "role") return null
  writeFileSync(join(cwd, it.staging), body)
  return { track: "ok", artifact: it.staging }
}

const drive = (state, answer = () => null, cap = 12) => {
  const trace = []
  let calledModel = false
  for (let it = step.next(state); it.do !== "done"; it = step.next(state)) {
    assert.equal(instruction(it).ok, true, `инструкция не проходит конструктор: ${JSON.stringify(it).slice(0, 160)}`)
    trace.push(it)
    if (it.do === "role") calledModel = true
    if (it.do === "err") return { state, trace, calledModel, last: it }
    const r = step.fold(state, { do: it.do, instruction: it, result: answer(it) })
    if (!r.ok) return { state, trace, calledModel, refused: r.error }
    state = r.value
    // БЮДЖЕТ ХОДОВ, А НЕ УТВЕРЖДЕНИЕ О СХОДИМОСТИ: обрыв связи круга не тратит, и роль, отвечающая
    // обрывом вечно, будет вечно получать тот же наряд — это ПРАВИЛЬНО.
    if (trace.length >= cap) return { state, trace, calledModel, capped: true, last: { do: "capped" } }
  }
  return { state, trace, calledModel, last: { do: "done" } }
}

const laid = (s) => (s.at && s.at.normalized ? readFileSync(join(s.cwd, s.at.normalized.path), "utf8") : null)
const red = (s) => (s.verdicts.filter((v) => !v.ok).slice(-1)[0] || {}).blockers || ""

// --- сценарии ---------------------------------------------------------------------------------------
test(`подшаг 2A · сценарий 1 [happy] ${SCENARIOS[0].name}`, () => {
  const s0 = arrange("good")
  const run = drive(s0, writes(s0.cwd, ANSWER))

  const said = run.trace.find((i) => i.do === "say")
  assert.ok(said, "подшаг не сказал, что посчитал")
  assert.match(said.line, /два прохода/)

  const orders = run.trace.filter((i) => i.do === "role")
  assert.equal(orders.length, 2, "проходов должно быть два: таблица и её чистка")
  const [order, clean] = orders
  assert.equal(order.role, "normalizer")
  assert.ok(!/\{[A-Z_]+\}/.test(order.text), "слот остался незаполненным — данные не доехали")
  assert.match(order.text, /Термин/, "в наряд не приехал заказ — роли нечего нормализовать")

  // РОЛЬ ЧИСТКИ СВОЯ И ПУСТАЯ. `normalizer` для неё не годится: та запрещает сливать две строки в
  // одну — ровно то, ради чего проход существует. Файл роли пуст (`overrideSystemPrompt: true`),
  // поэтому в модель уходит только наряд; шов на существование файла — ext/vocabulary.test.mjs.
  assert.equal(clean.role, "cleaner", "проход чистки послан ролью прохода таблицы")
  assert.notEqual(clean.role, order.role, "оба прохода зовут одну роль — противоречие наряду чистки")
  assert.equal(clean.staging, ".agent/staging/normalized.clean.md", "чистка пишет по СВОЕМУ пути")
  assert.ok(!/\{[A-Z_]+\}/.test(clean.text), "в наряде чистки остался незаполненный слот")
  // ПРАЙМИНГ ЖИВЁТ В РОЛИ, А НЕ В НАРЯДЕ (core/form.mjs: роль — «что мне вообще позволено», наряд —
  // «что именно сегодня»), поэтому наряд чистки опознаётся по СВОЕЙ работе, а не по заголовку.
  assert.match(clean.text, /^GOAL$/m, "наряд чистки не открывается целью")
  assert.match(clean.text, /duplicates merged and its invented rows deleted/, "второй наряд — не наряд чистки")
  assert.match(clean.text, /assign \| resource type \| Glossary/, "в наряд чистки не приехала таблица прохода 1")

  assert.equal(run.last.do, "done", `подшаг не дошёл: ${JSON.stringify(run.last).slice(0, 160)}`)
  assert.equal(run.state.verdicts.length, 2, "вердикт на каждый проход")
  assert.ok(run.state.verdicts.every((v) => v.ok), `ГАРДРЕЙЛ ОТБИЛ ЗАПИСАННЫЙ ОТВЕТ — правило уехало:\n${(run.state.verdicts.find((v) => !v.ok) || {}).blockers}`)
  assert.equal(run.state.at.normalized.path, ".agent/normalized.md")
  assert.equal(laid(run.state), ANSWER, "продвинутая таблица РАЗОШЛАСЬ с ответом роли — подшаг переписал ответ")
  assert.equal(run.state.at.normalized.sha1, sha1of(ANSWER))
  assert.equal(parseRows(laid(run.state)).length, SCENARIOS[0].expect.rows)
  for (const rel of [".agent/staging/normalized.md", ".agent/staging/normalized.clean.md"]) {
    assert.ok(!existsSync(join(run.state.cwd, rel)), `принятый черновик остался в staging: ${rel}`)
  }
})

for (const n of [2, 3, 4]) {
  const s = SCENARIOS[n - 1]
  test(`подшаг 2A · сценарий ${n} [${s.branch}] ${s.name}`, () => {
    const run = drive(arrange(s.fixture), () => { throw new Error("модель позвана на негодном входе") })
    assert.equal(run.last.do, "err")
    assert.equal(run.last.cls, s.branch)
    if (s.expect.subject) assert.match(String(run.last.subject), s.expect.subject)
    assert.equal(run.calledModel, false)
  })
}

test(`подшаг 2A · сценарий 5 [no-file] ${SCENARIOS[4].name}`, () => {
  const s0 = arrange("good")
  // Два хода: состав работы и один ответ роли. Дальше смотреть нечего.
  const run = drive(s0, (it) => (it.do === "role" ? { track: "ok", artifact: it.staging } : null), 2)
  assert.match(red(run.state), SCENARIOS[4].expect.red)
  assert.equal(laid(run.state), null, "таблица продвинута при красном вердикте")
  assert.equal(run.state.portions[0].round, 2, "круг не потрачен — это ОТВЕТ роли, а не обрыв")
})

test(`подшаг 2A · сценарий 6 [invalid] ${SCENARIOS[5].name}`, () => {
  const s0 = arrange("good")
  const run = drive(s0, writes(s0.cwd, "Извините, требование сформулировано неоднозначно, и таблицу я не составила.\n"), 3)
  assert.match(red(run.state), SCENARIOS[5].expect.red)
  assert.match(red(run.state), /Извините/, "блокер не показал начало ответа")
  assert.match(red(run.state), /verb.*object.*instrument.*values/, "блокер не назвал форму строки — роли нечем чинить")
  assert.equal(laid(run.state), null)
})

test(`подшаг 2A · сценарий 7 [columns] ${SCENARIOS[6].name}`, () => {
  const s0 = arrange("good")
  // Порча ровно на том правиле, ради которого судья таблицы существует: у строки убрана колонка.
  const WHOLE = "assign | resource type | Glossary | as `eddi://ai.labs.glossary`"
  const broken = ANSWER.replace(WHOLE, "assign | resource type | as `eddi://ai.labs.glossary`")
  assert.notEqual(broken, ANSWER, "порча не применилась — тест судит не то, что думает")

  // Три хода: состав, испорченный ответ, и НАРЯД ПОЧИНКИ — ради него сценарий и существует.
  const run = drive(s0, writes(s0.cwd, broken), 3)

  const v = run.state.verdicts.find((x) => !x.ok)
  assert.ok(v, "гардрейл пропустил строку без колонки")
  assert.match(v.blockers, /^columns row \d+:/m, "находка без кода правила и номера строки")
  assert.equal(laid(run.state), null, "таблица продвинута при красном вердикте")

  const fix = run.trace.filter((i) => i.do === "role")[1]
  assert.ok(fix, "второго наряда не было")
  assert.match(fix.text, /Findings: 1/, "наряд починки не открывается числом находок")
  assert.match(fix.text, /^\s*1\. \[row \d+\]/m, "у находки нет АДРЕСА — роль пойдёт искать место по всем строкам")
  assert.match(fix.text, /THIS IS YOUR FILE/, "наряд починки не несёт прошлый ответ роли")
  assert.match(fix.text, /assign \| resource type \| as/, "прошлый ответ доехал не целиком")
})

test(`подшаг 2A · сценарий 8 [crashed] ${SCENARIOS[7].name}`, () => {
  const s0 = arrange("good")
  let n = 0
  const run = drive(s0, (it) => {
    if (it.do !== "role") return null
    if (++n === 1) return { track: "err", kind: "crashed", subject: "connection reset by peer" }
    writeFileSync(join(s0.cwd, it.staging), ANSWER)
    return { track: "ok", artifact: it.staging }
  })
  assert.equal(n, 3, "после обрыва подшаг не переспросил роль — ходов роли должно быть три: обрыв, проход 1, чистка")
  assert.equal(run.state.verdicts.length, 2, "обрыв попал в вердикты — его судили как ответ")
  assert.equal(run.state.verdicts[0].round, 1, "ОБРЫВ СЪЕЛ КРУГ ПОЧИНКИ")
  assert.equal(laid(run.state), ANSWER)
})

test(`подшаг 2A · сценарий 9 [duplicate-row] ${SCENARIOS[8].name}`, () => {
  const s0 = arrange("good")
  // Порча ровно на том правиле, ради которого проход чистки существует: чистка вернула таблицу,
  // где одно требование стоит двумя строками. Значения обеих взяты из ANSWER — выдуманного нет,
  // и находка обязана быть ровно одна, про дубль.
  const rows = ANSWER.trim().split("\n")
  const dirty = `${rows.join("\n")}\n${rows[0]}\n`
  let n = 0
  // Четыре хода: состав, проход 1, чистка с дублем, НАРЯД ПОЧИНКИ ЧИСТКИ — ради него сценарий и есть.
  const run = drive(s0, (it) => {
    if (it.do !== "role") return null
    writeFileSync(join(s0.cwd, it.staging), ++n === 1 ? ANSWER : dirty)
    return { track: "ok", artifact: it.staging }
  }, 4)

  const v = run.state.verdicts.find((x) => !x.ok)
  assert.ok(v, "гардрейл чистки пропустил дубль")
  assert.match(v.blockers, /^duplicate-row rows \d+ and \d+:/m, "находка без кода правила и номеров ОБЕИХ строк")
  assert.equal(laid(run.state), null, "таблица продвинута при красном вердикте чистки")

  const one = run.state.portions.find((p) => p.id === "1")
  assert.equal(one.round, 1, "круг ПРОХОДА 1 потрачен на находку чистки — проходы чинятся врозь")

  const fix = run.trace.filter((i) => i.do === "role")[2]
  assert.ok(fix, "наряда починки чистки не было")
  assert.equal(fix.role, "cleaner", "починку чистки послали ролью прохода таблицы")
  assert.equal(fix.staging, ".agent/staging/normalized.clean.md")
  assert.match(fix.text, /Findings: 1/, "наряд починки не открывается числом находок")
  assert.match(fix.text, /^\s*1\. \[rows \d+ and \d+\]/m, "у находки нет АДРЕСА — роль пойдёт искать место по всем строкам")
  assert.match(fix.text, /YOUR TABLE/, "наряд починки не несёт прошлый ответ ЧИСТКИ")
})

// --- ШОВ: формула исполняема ------------------------------------------------------------------------
test("подшаг 2A · формула: на каждую ветвь кода есть сценарий, и наоборот", () => {
  const declared = new Set()
  // ДВА КАТАЛОГА, И ЭТО НЕ ЛЕНЬ. Судья таблицы живёт в подшаге, а СУД ВХОДА — на уровне шага
  // (`steps/brd/inputs.mjs`): заказ и ключ у подшагов 2A и 2C общие, и правило про них написано
  // ОДИН раз. Шов обязан видеть оба места, иначе классы `no-task`/`no-key`/`task-changed` станут
  // ветвями, которых он не считает.
  const collect = (dir, deep) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { if (deep && e.name !== "component" && e.name !== "fixture") collect(join(dir, e.name), deep); continue }
      if (!e.name.endsWith(".mjs") || e.name.endsWith(".test.mjs")) continue
      const m = readFileSync(join(dir, e.name), "utf8").match(/export const CLASSES = Object\.freeze\(\[([^\]]*)\]\)/)
      if (m) for (const c of m[1].matchAll(/"([^"]+)"/g)) declared.add(c[1])
    }
  }
  collect(join(HERE, ".."), true)          // подшаг 2A целиком
  collect(join(HERE, "..", ".."), false)   // общие модули шага 2, верхний уровень
  assert.ok(declared.size, "ни один модуль не объявил CLASSES — шов ослеп")

  const covered = new Set(SCENARIOS.map((s) => s.branch).filter(Boolean))
  // Классы ПРАВИЛ судьи таблицы — территория юнитов: контроль формы строки считает юнит, а не
  // сценарий (standards/component-test.md). `columns` тем не менее в таблице есть: на нём стоит
  // сценарий про НАРЯД ПОЧИНКИ, а не про само правило.
  const units = new Set(["clipped-value", "lost-value", "invented-value"])
  for (const cls of declared) {
    if (units.has(cls)) continue
    assert.ok(covered.has(cls), `класс «${cls}» подшаг умеет вернуть, а сценария на него НЕТ`)
  }
  // Ветви, опознаваемые не классом, а формой ответа роли.
  const words = new Set(["no-file", "invalid", "crashed"])
  for (const b of covered) {
    assert.ok(declared.has(b) || words.has(b), `в SCENARIOS есть ветвь «${b}», которой в коде подшага нет`)
  }
  assert.equal(SCENARIOS.filter((s) => s.kind === "happy").length, 1, "штатное поведение должно быть ровно одно")
  assert.equal(SCENARIOS.length, 1 + SCENARIOS.filter((s) => s.kind === "adapter").length, "в таблице строка, которая ни штатная, ни ветвь адаптера")
  assert.equal(STEP.adapters.length, 2, "у подшага 2A два адаптера — файлы и модель")
  assert.equal(STEP.passes.length, 2, "подшаг 2A ходит к модели ДВАЖДЫ — таблица и её чистка")
  assert.notEqual(STEP.role, STEP.roleClean, "у проходов должны быть РАЗНЫЕ роли")
})

if (!process.env.NODE_TEST_CONTEXT) process.stdout.write(gherkin())
