// КОМПОНЕНТНЫЙ ТЕСТ ПОДШАГА 2C — подшаг целиком, в изоляции. ЕДИНСТВЕННОЕ описание его поведения:
// таблица SCENARIOS ниже и есть документ.
//
// Читают её двое. Человек: `node steps/brd/gate/component/gate.component.test.mjs` печатает таблицу
// Gherkin'ом. Машина: тесты ниже поднимают названную фикстуру и гоняют подшаг ТЕМ ЖЕ приводом, что
// полоса. Второго файла с тем же содержанием нет намеренно.
//
// ЭТАЛОН — МЕРА, А НЕ ИЛЛЮСТРАЦИЯ. `answer-gate-eddi.txt` это ответ роли `gate`, записанный с живой
// модели на заказе eddi 22.08.2026 (qwen3.6-27b, effort low, 12 с). Он играет три роли сразу:
//   1. заглушка — то, что подкладывается вместо модели;
//   2. ЗАМОК НА ГАРДРЕЙЛ — правило уедет, и красным станет документ, который конвейер однажды
//      принял на живом прогоне;
//   3. мера продвижения — продвинутый артефакт сверяется с ним ПОБАЙТОВО.
//
// ФИКСТУРА `eddi` — МИНИ-РЕПОЗИТОРИЙ, А НЕ ОДИН ФАЙЛ, и это требование гардрейла, а не удобство:
// правила T3 и T4 судят ЧИСЛАМИ таблицы попаданий, и на дереве из одного файла они либо молчат,
// либо обвиняют эталон в том, чего он не писал. Двенадцать файлов повторяют форму настоящего eddi:
// `PromptSnippet` (аналог эталона) стоит в шести из них, `glossary` — ни в одном, потому что это и
// есть создаваемая вещь.
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import * as step from "../gate.step.mjs"
import { orderText } from "../order.mjs"
import { start, sha1of } from "../../../../ext/state.mjs"
import { instruction } from "../../../../ext/values.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
// Шапка записанного ответа — не часть артефакта: строки с «#» снимаются, остальное едет байт в байт.
const ETALON = readFileSync(join(HERE, "answer-gate-eddi.txt"), "utf8")
  .split("\n").filter((l) => !l.startsWith("#")).join("\n").trim() + "\n"

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// ЧТО ДЕЛАЕТ ПОДШАГ 2C — В ВИДЕ ДАННЫХ.
//
// ФОРМУЛА (codemonsters.team, «Мифология тестирования: компонентные тесты»):
//     N = 1 (штатное) + Σ (различимых ветвей в адаптере i)
// Адаптера ТРИ: файловая система (таблица действий и дерево), МОДЕЛЬ (роль gate) и оператор
// (вопрос роли). Ветвей восемь, значит сценариев девять. Пять правил гардрейла сюда НЕ входят:
// контроль каждого — работа юнита (steps/brd/gate/judge/T1..T5.test.mjs).

export const STEP = Object.freeze({
  id: "brd/gate",
  title: "таблица действий → вердикт, следствия и якоря",
  role: "gate",
  in: [".agent/normalized.md", "TASK.md", ".agent/answers.md", "дерево проекта"],
  out: [".agent/brd.md", ".agent/anchors.json", "state.at.brd", "state.at.anchors", "state.verdicts[]"],
  adapters: ["файловая система (таблица действий и дерево)", "модель (роль gate)", "канал ответов оператора"],
})

export const SCENARIOS = Object.freeze([
  { n: 1, kind: "happy", branch: null, fixture: "eddi",
    name: "роль вернула эталонный BRD",
    given: "таблица действий подшага 2A, заказ eddi и мини-репозиторий из 12 файлов",
    when: "роль ответила эталонным документом",
    then: ["гардрейл ПРИНЯЛ эталон на настоящих источниках и настоящей таблице попаданий",
           "артефакт лёг в .agent/brd.md и совпал с эталоном ПОБАЙТОВО",
           "сразу за ним лёг .agent/anchors.json: файлы якорей, пакеты и файлы аналога",
           "отпечатки легли в at.brd и at.anchors", "черновик из staging убран"],
    expect: { done: true, stamped: "brd", etalon: true, verdicts: 1, anchors: true } },

  { n: 2, kind: "adapter", branch: "no-normalized", fixture: "no-normalized",
    name: "таблицы действий нет — подшаг 2A не закрыт",
    given: "каталог прогона без .agent/normalized.md",
    when: "подшаг сделал первый ход",
    then: ["отказ blocked класса no-normalized", "отказ называет ФАЙЛ и того, кто его пишет",
           "модель не звалась"],
    expect: { do: "err", cls: "no-normalized", subject: /normalized\.md.*brd\/normalize/s, calledModel: false } },

  { n: 3, kind: "adapter", branch: "unreadable-normalized", fixture: "prose-rows",
    name: "вместо таблицы действий лежит проза",
    given: ".agent/normalized.md без единой строки с четырьмя колонками",
    when: "подшаг сделал первый ход",
    then: ["отказ класса unreadable-normalized", "отказ называет форму строки и что переиграть",
           "модель не звалась"],
    expect: { do: "err", cls: "unreadable-normalized", subject: /переиграй brd\/normalize/, calledModel: false } },

  { n: 4, kind: "adapter", branch: "normalized-changed", fixture: "eddi",
    name: "таблицу действий правили после подшага 2A",
    given: "отпечаток таблицы в состоянии не совпадает с файлом на диске",
    when: "подшаг сделал первый ход",
    then: ["отказ класса normalized-changed", "отказ говорит, ЧТО переиграть"],
    expect: { do: "err", cls: "normalized-changed", subject: /переиграй brd\/normalize/, calledModel: false } },

  { n: 5, kind: "adapter", branch: "no-file", fixture: "eddi",
    name: "роль вернула ok, ничего не записав",
    given: "конверт track:ok с верным путём, но файла по нему нет",
    when: "подшаг разобрал ответ",
    then: ["вердикт красный", "артефакт НЕ продвинут", "круг потрачен — это ответ, а не обрыв"],
    expect: { red: /пуст|не записав/, promoted: false, round: 2 } },

  { n: 6, kind: "adapter", branch: "invalid", fixture: "eddi",
    name: "роль вернула прозу вместо BRD",
    given: "ответ без единой строки вида R1 и без строки вердикта",
    when: "подшаг разобрал ответ",
    then: ["вердикт invalid, а не молчание", "блокер показывает начало ответа"],
    expect: { red: /^invalid: ответ не похож на BRD/m, promoted: false } },

  { n: 7, kind: "adapter", branch: "invalid-verdict", fixture: "eddi",
    name: "гардрейл отбил — наряд ПОЧИНКИ несёт задачу и ничего лишнего",
    given: "эталон, испорченный вердиктом вне закрытого словаря",
    when: "подшаг выдал следующий наряд",
    then: ["вердикт назвал класс invalid-verdict",
           "наряд починки несёт находку с АДРЕСОМ verdict и прошлый ответ роли",
           "и НЕ несёт ни таблицы действий, ни таблицы попаданий: находка их не касается",
           "находка про якорь, наоборот, привозит таблицу попаданий"],
    expect: { fixOrder: true, promoted: false } },

  { n: 8, kind: "adapter", branch: "crashed", fixture: "eddi",
    name: "связь оборвалась",
    given: "конверт track:err kind:crashed",
    when: "подшаг разобрал ответ",
    then: ["подшаг не закрылся на обрыве", "артефакт не написан", "КРУГ НЕ ПОТРАЧЕН"],
    expect: { round: 1, verdicts: 1 } },

  { n: 9, kind: "adapter", branch: "question", fixture: "eddi",
    name: "роль задала вопрос оператору",
    given: "конверт track:err kind:question с двумя пунктами",
    when: "подшаг разобрал ответ",
    then: ["следующая инструкция — ask", "имя паузы без косой черты и уникально по ходу",
           "круг НЕ потрачен"],
    expect: { do: "ask", name: /^brd-gate-q1$/, items: 2, round: 1 } },
])

// FUNCTION_CONTRACT: gherkin — таблица как текст для человека
//   Consequent:   success: Feature/Scenario/Given/When/Then одной строкой на пункт
//   Purity:       pure
export function gherkin() {
  const head = [
    `# ЭТО НЕ ОТДЕЛЬНЫЙ ДОКУМЕНТ, а печать таблицы из ЭТОГО ЖЕ файла — правится в SCENARIOS.`,
    `# N = 1 (штатное) + ${SCENARIOS.filter((s) => s.kind === "adapter").length} (ветви адаптеров) = ${SCENARIOS.length}`,
    ``,
    `Feature: подшаг 2C «${STEP.title}» — роль ${STEP.role}`,
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
const arrange = (fixture, { stale = false } = {}) => {
  const src = join(HERE, "fixture", fixture)
  assert.ok(existsSync(src), `фикстуры ${fixture} нет`)
  const cwd = mkdtempSync(join(tmpdir(), `izi-gate-${fixture}-`))
  cpSync(src, cwd, { recursive: true })
  mkdirSync(join(cwd, ".agent", "staging"), { recursive: true })
  const s = start({ cwd, run: `component-${fixture}`, key: "DOS-535" }).value
  const rows = join(cwd, ".agent", "normalized.md")
  if (!existsSync(rows)) return s
  // Отпечаток таблицы кладёт подшаг 2A; для ветви normalized-changed он намеренно от ДРУГОГО текста.
  const text = readFileSync(rows, "utf8")
  const sha = stale ? sha1of(`${text}\nправка руками | и | ещё | одна`) : sha1of(text)
  return { ...s, at: { normalized: { path: ".agent/normalized.md", sha1: sha } } }
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
    if (it.do === "err" || it.do === "ask") return { state, trace, calledModel, last: it }
    const r = step.fold(state, { do: it.do, instruction: it, result: answer(it) })
    if (!r.ok) return { state, trace, calledModel, refused: r.error }
    state = r.value
    // БЮДЖЕТ ХОДОВ, А НЕ УТВЕРЖДЕНИЕ О СХОДИМОСТИ: обрыв связи круга не тратит, и роль, отвечающая
    // обрывом вечно, будет вечно получать тот же наряд — это ПРАВИЛЬНО.
    if (trace.length >= cap) return { state, trace, calledModel, capped: true, last: { do: "capped" } }
  }
  return { state, trace, calledModel, last: { do: "done" } }
}

const laid = (s) => (s.at && s.at.brd ? readFileSync(join(s.cwd, s.at.brd.path), "utf8") : null)
const red = (s) => (s.verdicts.filter((v) => !v.ok).slice(-1)[0] || {}).blockers || ""

// --- сценарии ---------------------------------------------------------------------------------------
test(`подшаг 2C · сценарий 1 [happy] ${SCENARIOS[0].name}`, () => {
  const s0 = arrange("eddi")
  const run = drive(s0, writes(s0.cwd, ETALON))

  const said = run.trace.find((i) => i.do === "say")
  assert.ok(said, "подшаг не сказал, что посчитал")
  assert.match(said.line, /строк таблицы действий 16/)

  const order = run.trace.find((i) => i.do === "role")
  assert.ok(order, "наряда не было")
  assert.equal(order.role, "gate")
  assert.ok(!/\{[A-Z_]+\}/.test(order.text), "слот остался незаполненным — данные не доехали")
  assert.match(order.text, /PromptSnippet · files \d+/, "в наряд не приехала таблица попаданий")

  assert.equal(run.last.do, "done", `подшаг не дошёл: ${JSON.stringify(run.last).slice(0, 160)}`)
  assert.equal(run.state.verdicts.length, 1)
  assert.equal(run.state.verdicts[0].ok, true, `ГАРДРЕЙЛ ОТБИЛ ЭТАЛОН — правило уехало:\n${run.state.verdicts[0].blockers}`)
  assert.equal(run.state.at.brd.path, ".agent/brd.md")
  assert.equal(laid(run.state), ETALON, "продвинутый артефакт РАЗОШЁЛСЯ с эталоном — подшаг переписал ответ роли")
  assert.equal(run.state.at.brd.sha1, sha1of(ETALON))
  assert.ok(!existsSync(join(run.state.cwd, ".agent/staging/brd.md")), "принятый черновик остался в staging")

  // КАРТА ОБХОДА — ЧАСТЬ ТОГО ЖЕ ХОДА. Без неё шаг 3 пошёл бы искать места по путям, а на eddi это
  // 0 файлов аналога из 10 (steps/brd/spread/spread.mjs).
  const map = JSON.parse(readFileSync(join(run.state.cwd, ".agent/anchors.json"), "utf8"))
  assert.equal(run.state.at.anchors.path, ".agent/anchors.json")
  assert.equal(map.files, 12, "карта посчитана не по всему дереву фикстуры")
  assert.deepEqual(map.anchors.map((a) => a.word), ["glossary", "term", "prompt", "agent", "configuration", "version"])
  assert.equal(map.analogue.word, "PromptSnippet")
  assert.ok(map.analogue.files.length > 0, "аналог не нашёл ни одного файла — грепа по тексту не было")
  assert.ok(map.marked.length > 0, "ни один файл не помечен якорями")
})

for (const n of [2, 3, 4]) {
  const s = SCENARIOS[n - 1]
  test(`подшаг 2C · сценарий ${n} [${s.branch}] ${s.name}`, () => {
    const s0 = arrange(s.fixture, { stale: s.branch === "normalized-changed" })
    const run = drive(s0, () => { throw new Error("модель позвана на негодном входе") })
    assert.equal(run.last.do, "err")
    assert.equal(run.last.cls, s.branch)
    assert.match(String(run.last.subject), s.expect.subject)
    assert.equal(run.calledModel, false)
  })
}

test(`подшаг 2C · сценарий 5 [no-file] ${SCENARIOS[4].name}`, () => {
  const s0 = arrange("eddi")
  // Два хода: состав работы и один ответ роли. Дальше смотреть нечего.
  const run = drive(s0, (it) => (it.do === "role" ? { track: "ok", artifact: it.staging } : null), 2)
  assert.match(red(run.state), SCENARIOS[4].expect.red)
  assert.equal(laid(run.state), null, "артефакт продвинут при красном вердикте")
  assert.ok(!existsSync(join(run.state.cwd, ".agent/anchors.json")), "карта обхода посчитана по отбитому артефакту")
  assert.equal(run.state.portions[0].round, 2, "круг не потрачен — это ОТВЕТ роли, а не обрыв")
})

test(`подшаг 2C · сценарий 6 [invalid] ${SCENARIOS[5].name}`, () => {
  const s0 = arrange("eddi")
  const run = drive(s0, writes(s0.cwd, "Извините, я не смогла составить требование: заказ неоднозначен.\n"), 3)
  assert.match(red(run.state), SCENARIOS[5].expect.red)
  assert.match(red(run.state), /Извините/, "блокер не показал начало ответа")
  assert.equal(laid(run.state), null)
})

test(`подшаг 2C · сценарий 7 [invalid-verdict] ${SCENARIOS[6].name}`, () => {
  const s0 = arrange("eddi")
  // Порча ровно на том правиле, ради которого ворота существуют: вердикт вне закрытого словаря.
  const broken = ETALON.replace("verdict: solvable", "verdict: maybe")
  assert.notEqual(broken, ETALON, "порча не применилась — тест судит не то, что думает")

  // Три хода: состав, испорченный ответ, и НАРЯД ПОЧИНКИ — ради него сценарий и существует.
  const run = drive(s0, writes(s0.cwd, broken), 3)

  const v = run.state.verdicts.find((x) => !x.ok)
  assert.ok(v, "гардрейл пропустил вердикт вне словаря")
  assert.deepEqual(run.state.portions[0].classes, ["invalid-verdict"], `классы находок: ${run.state.portions[0].classes}`)
  assert.equal(laid(run.state), null, "артефакт продвинут при красном вердикте")

  const fix = run.trace.filter((i) => i.do === "role")[1]
  assert.ok(fix, "второго наряда не было")
  assert.match(fix.text, /Находок: 1/, "наряд починки не открывается числом находок")
  assert.match(fix.text, /^\s*1\. \[verdict\]/m, "у находки нет АДРЕСА — роль пойдёт искать место по всему документу")
  assert.match(fix.text, /ТВОЙ ПРОШЛЫЙ ОТВЕТ|ЭТО ТВОЙ ФАЙЛ/, "наряд починки не несёт прошлый ответ роли")
  assert.match(fix.text, /verdict: maybe/, "прошлый ответ доехал не целиком")
  // Целимся в ЗАГОЛОВОК БЛОКА, а не в подстроку: слова заказа стоят и в прошлом ответе роли.
  assert.ok(!/ТАБЛИЦА ДЕЙСТВИЙ/.test(fix.text), "в наряд починки приехала таблица действий, которой находка про вердикт не касается")
  assert.ok(!/ТАБЛИЦА ПОПАДАНИЙ/.test(fix.text), "в наряд починки приехала таблица попаданий, которой находка про вердикт не касается")
  // ПРЯМОЕ доказательство условности: тот же наряд с находками ДРУГИХ классов везёт другие блоки.
  const wide = orderText(run.state, { previous: broken, feedback: "T3 subjects[]: «glossary» — создаваемая сущность", classes: ["missing-anchor", "restated-request"] })
  assert.ok(/ТАБЛИЦА ПОПАДАНИЙ/.test(wide.text), "находка про якорь не привезла таблицу попаданий")
  assert.ok(/ТАБЛИЦА ДЕЙСТВИЙ/.test(wide.text), "находка про пересказ не привезла таблицу действий")
})

test(`подшаг 2C · сценарий 8 [crashed] ${SCENARIOS[7].name}`, () => {
  const s0 = arrange("eddi")
  let n = 0
  const run = drive(s0, (it) => {
    if (it.do !== "role") return null
    if (++n === 1) return { track: "err", kind: "crashed", subject: "connection reset by peer" }
    writeFileSync(join(s0.cwd, it.staging), ETALON)
    return { track: "ok", artifact: it.staging }
  })
  assert.equal(n, 2, "после обрыва подшаг не переспросил роль")
  assert.equal(run.state.verdicts.length, 1, "обрыв попал в вердикты — его судили как ответ")
  assert.equal(run.state.verdicts[0].round, 1, "ОБРЫВ СЪЕЛ КРУГ ПОЧИНКИ")
  assert.equal(laid(run.state), ETALON)
})

test(`подшаг 2C · сценарий 9 [question] ${SCENARIOS[8].name}`, () => {
  const s0 = arrange("eddi")
  const run = drive(s0, (it) => (it.do === "role"
    ? { track: "err", kind: "question", items: ["Предел ключа — 64 символа?", "Версионирование как у сниппета?"] }
    : null), 6)
  assert.equal(run.last.do, "ask")
  assert.match(run.last.name, SCENARIOS[8].expect.name)
  assert.ok(!run.last.name.includes("/"), "в имени паузы косая черта — хост ключует паузу по имени")
  assert.equal(run.last.items.length, 2)
  assert.equal(run.state.verdicts.length, 0, "вопрос роли судили как ответ")
  assert.equal(run.state.portions[0].round, 1, "вопрос роли съел круг починки")
})

// --- ШОВ: формула исполняема ------------------------------------------------------------------------
test("подшаг 2C · формула: на каждую ветвь кода есть сценарий, и наоборот", () => {
  const declared = new Set()
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { if (e.name !== "component" && e.name !== "fixture") walk(join(dir, e.name)); continue }
      if (!e.name.endsWith(".mjs") || e.name.endsWith(".test.mjs")) continue
      const m = readFileSync(join(dir, e.name), "utf8").match(/export const CLASSES = Object\.freeze\(\[([^\]]*)\]\)/)
      if (m) for (const c of m[1].matchAll(/"([^"]+)"/g)) declared.add(c[1])
    }
  }
  walk(join(HERE, ".."))
  assert.ok(declared.size, "ни один модуль подшага не объявил CLASSES — шов ослеп")

  const covered = new Set(SCENARIOS.map((s) => s.branch).filter(Boolean))
  // Классы ПРАВИЛ ворот (judge/T1..T5.mjs) — территория юнитов: контроль диапазона считает юнит, а
  // не сценарий (standards/component-test.md). `invalid-verdict` тем не менее в таблице есть: на нём
  // стоит сценарий про НАРЯД ПОЧИНКИ, а не про само правило.
  const units = new Set(["restated-request", "missing-anchor", "invalid-analogue", "unselective-anchor"])
  for (const cls of declared) {
    if (units.has(cls)) continue
    assert.ok(covered.has(cls), `класс «${cls}» подшаг умеет вернуть, а сценария на него НЕТ`)
  }
  // Ветви, опознаваемые формой ответа роли и словом инструкции, а не классом гардрейла.
  const words = new Set(["no-file", "crashed", "question"])
  for (const b of covered) {
    assert.ok(declared.has(b) || words.has(b), `в SCENARIOS есть ветвь «${b}», которой в коде подшага нет`)
  }
  assert.equal(SCENARIOS.filter((s) => s.kind === "happy").length, 1, "штатное поведение должно быть ровно одно")
  assert.equal(SCENARIOS.length, 1 + SCENARIOS.filter((s) => s.kind === "adapter").length, "в таблице строка, которая ни штатная, ни ветвь адаптера")
  assert.equal(STEP.adapters.length, 3, "у подшага 2C три адаптера — файлы, модель и оператор")
})

if (!process.env.NODE_TEST_CONTEXT) process.stdout.write(gherkin())
