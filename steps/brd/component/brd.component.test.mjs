// КОМПОНЕНТНЫЙ ТЕСТ ШАГА 2 — шаг целиком, в изоляции. ЕДИНСТВЕННЫЙ компонентный тест этого шага и
// ЕДИНСТВЕННОЕ описание его поведения: таблица SCENARIOS ниже и есть документ.
//
// Читают её двое. Человек: `node steps/brd/component/brd.component.test.mjs` печатает таблицу
// Gherkin'ом. Машина: тесты ниже поднимают названную фикстуру и гоняют шаг ТЕМ ЖЕ приводом, что
// полоса. Второго файла с тем же содержанием нет намеренно.
//
// ЭТАЛОН — МЕРА, А НЕ ИЛЛЮСТРАЦИЯ. `answer-gilb.md` это `.agent/brd.md`, который роль `gilb`
// написала на живом прогоне eddi 20.08.2026 (component-tests/etalon-eddi/). Он играет три роли
// сразу, и это разные утверждения:
//   1. заглушка — то, что подкладывается вместо модели;
//   2. ЗАМОК НА ГАРДРЕЙЛ — правило уедет, и красным станет документ, который конвейер однажды
//      принял на живом прогоне, а не абстрактная фикстура;
//   3. мера продвижения — продвинутый артефакт сверяется с ним ПОБАЙТОВО: шаг не вправе переписать,
//      дополнить или нормализовать ответ роли.
// Судится он НАСТОЯЩИМИ источниками — задачей и значениями ответов того же прогона: с пустым
// списком правило про число в `fit` молчит, и зелёный вердикт не доказывает ничего.
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import * as step from "../brd.step.mjs"
import { orderText } from "../order.mjs"
import { start, sha1of } from "../../../ext/state.mjs"
import { instruction } from "../../../ext/values.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const ETALON = readFileSync(join(HERE, "answer-gilb.md"), "utf8")

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// ЧТО ДЕЛАЕТ ШАГ 2 — В ВИДЕ ДАННЫХ.
//
// ФОРМУЛА (codemonsters.team, «Мифология тестирования: компонентные тесты»):
//     N = 1 (штатное) + Σ (различимых ветвей в адаптере i)
// Адаптера ТРИ, и в этом отличие от шага 1: файловая система, МОДЕЛЬ (роль gilb) и оператор.
// Ветвей восемь, значит сценариев девять. Семнадцать различимых блокеров гардрейла сюда НЕ входят:
// контроль диапазона — работа юнита (steps/brd/judge/judge.test.mjs).

export const STEP = Object.freeze({
  id: "brd",
  title: "сырое требование → измеримые R1..RN",
  role: "gilb",
  in: ["TASK.md", ".agent/answers.md", "state.key"],
  out: [".agent/brd.md", "state.at.brd", "state.verdicts[]"],
  adapters: ["файловая система", "модель (роль gilb)", "канал ответов оператора"],
})

export const SCENARIOS = Object.freeze([
  { n: 1, kind: "happy", branch: null, fixture: "good",
    name: "роль вернула эталонный BRD",
    given: "TASK.md и ответы оператора живого прогона eddi",
    when: "роль ответила эталонным документом",
    then: ["гардрейл ПРИНЯЛ эталон на настоящих источниках",
           "артефакт лёг в .agent/brd.md и совпал с эталоном ПОБАЙТОВО",
           "отпечаток лёг в at.brd", "черновик из staging убран"],
    expect: { done: true, stamped: "brd", etalon: true, verdicts: 1 } },

  { n: 2, kind: "adapter", branch: "no-task", fixture: "no-task",
    name: "TASK.md нет вовсе",
    given: "каталог прогона без TASK.md",
    when: "шаг сделал первый ход",
    then: ["отказ blocked класса no-task", "модель не звалась"],
    expect: { do: "err", cls: "no-task", calledModel: false } },

  { n: 3, kind: "adapter", branch: "no-key", fixture: "no-key",
    name: "шаг 1 не закрыт — ключа нет",
    given: "TASK.md на месте, но ключа в состоянии нет",
    when: "шаг сделал первый ход",
    then: ["отказ blocked класса no-key", "отказ называет, чем ключ важен"],
    expect: { do: "err", cls: "no-key", subject: /ветк|тикет|план/ } },

  { n: 4, kind: "adapter", branch: "task-changed", fixture: "task-changed",
    name: "TASK.md правили после шага 1",
    given: "отпечаток задачи в состоянии не совпадает с файлом на диске",
    when: "шаг сделал первый ход",
    then: ["отказ класса task-changed", "отказ говорит, ЧТО переиграть"],
    expect: { do: "err", cls: "task-changed", subject: /переиграй task/ } },

  { n: 5, kind: "adapter", branch: "no-file", fixture: "good",
    name: "роль вернула ok, ничего не записав",
    given: "конверт track:ok с верным путём, но файла по нему нет",
    when: "шаг разобрал ответ",
    then: ["вердикт красный", "артефакт НЕ продвинут", "круг потрачен — это ответ, а не обрыв"],
    expect: { red: /пуст|не записав/, promoted: false, round: 2 } },

  { n: 6, kind: "adapter", branch: "invalid", fixture: "good",
    name: "роль вернула прозу вместо BRD",
    given: "ответ без единой строки вида R1",
    when: "шаг разобрал ответ",
    then: ["вердикт invalid, а не молчание", "блокер показывает начало ответа"],
    expect: { red: /^invalid: ответ не похож на BRD/m, promoted: false } },

  { n: 7, kind: "adapter", branch: "repair", fixture: "good",
    name: "гардрейл отбил — наряд ПОЧИНКИ несёт задачу и ничего лишнего",
    given: "эталон, испорченный выдуманным числом в fit",
    when: "шаг выдал следующий наряд",
    then: ["вердикт назвал класс invented-default",
           "наряд починки несёт находку с АДРЕСОМ R и прошлый ответ роли",
           "он несёт задачу и ответы — источники числа",
           "и НЕ несёт правил про subjects и analogue: их находка не касается"],
    expect: { fixOrder: true } },

  { n: 8, kind: "adapter", branch: "crashed", fixture: "good",
    name: "связь оборвалась",
    given: "конверт track:err kind:crashed",
    when: "шаг разобрал ответ",
    then: ["шаг не закрылся", "артефакт не написан", "КРУГ НЕ ПОТРАЧЕН"],
    expect: { round: 1, promoted: false, verdicts: 0 } },

  { n: 9, kind: "adapter", branch: "question", fixture: "good",
    name: "роль задала вопрос оператору",
    given: "конверт track:err kind:question с двумя пунктами",
    when: "шаг разобрал ответ",
    then: ["следующая инструкция — ask", "имя паузы уникально по ходу", "круг НЕ потрачен"],
    expect: { do: "ask", name: /^brd-q1$/, items: 2, round: 1 } },
])

export function gherkin() {
  const head = [
    `# ЭТО НЕ ОТДЕЛЬНЫЙ ДОКУМЕНТ, а печать таблицы из ЭТОГО ЖЕ файла — правится в SCENARIOS.`,
    `# N = 1 (штатное) + ${SCENARIOS.filter((s) => s.kind === "adapter").length} (ветви адаптеров) = ${SCENARIOS.length}`,
    ``,
    `Feature: шаг 2 «${STEP.title}» — роль ${STEP.role}`,
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

const arrange = (fixture, { key = "DOS-535", stamp = true } = {}) => {
  const src = join(HERE, "fixture", fixture)
  assert.ok(existsSync(src), `фикстуры ${fixture} нет`)
  const cwd = mkdtempSync(join(tmpdir(), `izi-brd-${fixture}-`))
  cpSync(src, cwd, { recursive: true })
  mkdirSync(join(cwd, ".agent", "staging"), { recursive: true })
  const s = start({ cwd, run: `component-${fixture}`, key: fixture === "no-key" ? "" : key }).value
  if (!stamp || fixture === "no-task") return s
  const task = readFileSync(join(cwd, "TASK.md"), "utf8")
  // Отпечаток задачи кладёт шаг 1; для ветви task-changed он намеренно от ДРУГОГО текста.
  const sha = fixture === "task-changed" ? sha1of(`${task}\n<!-- правка руками -->`) : sha1of(task)
  return { ...s, at: { task: { path: "TASK.md", sha1: sha } } }
}

// Заглушка роли: делает то, что роль делает руками — пишет файл по staging-пути и возвращает
// конверт с ПУТЁМ. Текста в конверте нет и быть не может.
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
    // БЮДЖЕТ ХОДОВ, А НЕ УТВЕРЖДЕНИЕ О СХОДИМОСТИ. Шаг вправе не сходиться: обрыв связи круга не
    // тратит, и роль, которая отвечает обрывом вечно, будет вечно получать тот же наряд — это
    // ПРАВИЛЬНО. Сценарий, который смотрит на один ход, обязан остановить привод сам.
    if (trace.length >= cap) return { state, trace, calledModel, capped: true, last: { do: "capped" } }
  }
  return { state, trace, calledModel, last: { do: "done" } }
}

const laid = (s) => (s.at && s.at.brd ? readFileSync(join(s.cwd, s.at.brd.path), "utf8") : null)
const red = (s) => (s.verdicts.filter((v) => !v.ok).slice(-1)[0] || {}).blockers || ""

// --- сценарии ---------------------------------------------------------------------------------------
test(`шаг 2 · сценарий 1 [happy] ${SCENARIOS[0].name}`, () => {
  const s0 = arrange("good")
  const run = drive(s0, writes(s0.cwd, ETALON))

  assert.equal(run.last.do, "done", `шаг не дошёл: ${JSON.stringify(run.last).slice(0, 160)}`)
  assert.equal(run.state.verdicts.length, 1)
  assert.equal(run.state.verdicts[0].ok, true, `ГАРДРЕЙЛ ОТБИЛ ЭТАЛОН — правило уехало:\n${run.state.verdicts[0].blockers}`)
  assert.equal(run.state.at.brd.path, ".agent/brd.md")
  assert.equal(laid(run.state), ETALON, "продвинутый артефакт РАЗОШЁЛСЯ с эталоном — шаг переписал ответ роли")
  assert.equal(run.state.at.brd.sha1, sha1of(ETALON))
  assert.ok(!existsSync(join(run.state.cwd, ".agent/staging/brd.md")), "принятый черновик остался в staging")
})

for (const n of [2, 3, 4]) {
  const s = SCENARIOS[n - 1]
  test(`шаг 2 · сценарий ${n} [${s.branch}] ${s.name}`, () => {
    const run = drive(arrange(s.fixture), () => { throw new Error("модель позвана на негодном входе") })
    assert.equal(run.last.do, "err")
    assert.equal(run.last.cls, s.branch)
    if (s.expect.subject) assert.match(String(run.last.subject), s.expect.subject)
    if (s.expect.calledModel === false) assert.equal(run.calledModel, false)
  })
}

test(`шаг 2 · сценарий 5 [no-file] ${SCENARIOS[4].name}`, () => {
  const s0 = arrange("good")
  // Два хода: состав работы и один ответ роли. Дальше смотреть нечего — шаг уже всё сказал.
  const run = drive(s0, (it) => (it.do === "role" ? { track: "ok", artifact: it.staging } : null), 2)
  assert.match(red(run.state), SCENARIOS[4].expect.red)
  assert.equal(laid(run.state), null, "артефакт продвинут при красном вердикте")
  assert.equal(run.state.portions[0].round, 2, "круг не потрачен — это ОТВЕТ роли, а не обрыв")
})

test(`шаг 2 · сценарий 6 [invalid] ${SCENARIOS[5].name}`, () => {
  const s0 = arrange("good")
  const run = drive(s0, writes(s0.cwd, "Извините, я не смогла составить требование: заказ неоднозначен.\n"), 6)
  assert.match(red(run.state), SCENARIOS[5].expect.red)
  assert.match(red(run.state), /Извините/, "блокер не показал начало ответа")
  assert.equal(laid(run.state), null)
})

test(`шаг 2 · сценарий 7 [repair] ${SCENARIOS[6].name}`, () => {
  const s0 = arrange("good")
  // Порча ровно на том правиле, ради которого шаг существует: число в fit без источника.
  const broken = ETALON.replace(/fit:\s*([^\n]*)/, "fit:    не дольше 137 миллисекунд")
  assert.notEqual(broken, ETALON, "порча не применилась — тест судит не то, что думает")

  // Три хода: состав, испорченный ответ, и НАРЯД ПОЧИНКИ — ради него сценарий и существует.
  const run = drive(s0, (it) => {
    if (it.do !== "role") return null
    writeFileSync(join(s0.cwd, it.staging), broken)
    return { track: "ok", artifact: it.staging }
  }, 3)

  const v = run.state.verdicts.find((x) => !x.ok)
  assert.ok(v, "гардрейл пропустил выдуманное число")
  assert.deepEqual(run.state.portions[0].classes, ["invented-default"], `классы находок: ${run.state.portions[0].classes}`)

  // НАРЯД ПОЧИНКИ — конкретная задача и ничего лишнего.
  const fix = run.trace.filter((i) => i.do === "role")[1]
  assert.ok(fix, "второго наряда не было")
  assert.match(fix.text, /Находок: 1/, "наряд починки не открывается числом находок")
  assert.match(fix.text, /^\s*1\. \[R\d+\]/m, "у находки нет АДРЕСА — роль пойдёт искать место по всему документу")
  assert.match(fix.text, /ТВОЙ ПРОШЛЫЙ ОТВЕТ|ЭТО ТВОЙ ФАЙЛ/, "наряд починки не несёт прошлый ответ роли")
  assert.match(fix.text, /137 миллисекунд/, "прошлый ответ доехал не целиком")
  assert.match(fix.text, /СЫРОЙ ЗАКАЗ ОПЕРАТОРА/, "находка про источник числа, а задачи в наряде нет")
  assert.match(fix.text, /ОТВЕТЫ ОПЕРАТОРА/, "второй законный источник числа не приехал")
  // Целимся в БЛОК ПРАВИЛА, а не в подстроку: `subjects[]:` и `analogue:` стоят и в прошлом ответе
  // роли, который наряд починки обязан нести целиком. Первая версия утверждения этого не различала
  // и краснела на самом документе.
  assert.ok(!/Якорь — СУЩЕСТВИТЕЛЬНОЕ/.test(fix.text), "в наряд починки приехало правило про subjects, которого находка не касается")
  assert.ok(!/Образца нет — так и напиши/.test(fix.text), "в наряд починки приехало правило про analogue, которого находка не касается")
  // ПРЯМОЕ доказательство условности: тот же наряд, но с находками ДРУГИХ классов, несёт другие
  // блоки и оттого длиннее. Сравнение с нарядом первого захода такой мерой быть не может — наряд
  // починки законно несёт прошлый ответ роли, которого у первого нет, и потому длиннее по природе.
  const wide = orderText(run.state, { previous: broken, feedback: "R1: нет способа проверки", classes: ["invalid-subjects", "invalid-brd"] })
  assert.ok(/Якорь — СУЩЕСТВИТЕЛЬНОЕ/.test(wide.text), "находка про subjects не привезла своего правила")
  assert.ok(/Образца нет — так и напиши/.test(wide.text), "находка про форму не привезла правила про analogue")
  assert.ok(!/СЫРОЙ ЗАКАЗ ОПЕРАТОРА/.test(wide.text), "находке про subjects задача не нужна, а она приехала")
})

test(`шаг 2 · сценарий 8 [crashed] ${SCENARIOS[7].name}`, () => {
  const s0 = arrange("good")
  let n = 0
  const run = drive(s0, (it) => {
    if (it.do !== "role") return null
    if (++n === 1) return { track: "err", kind: "crashed", subject: "connection reset by peer" }
    writeFileSync(join(s0.cwd, it.staging), ETALON)
    return { track: "ok", artifact: it.staging }
  })
  assert.equal(n, 2, "после обрыва шаг не переспросил роль")
  assert.equal(run.state.verdicts.length, 1, "обрыв попал в вердикты — его судили как ответ")
  assert.equal(run.state.verdicts[0].round, 1, "ОБРЫВ СЪЕЛ КРУГ ПОЧИНКИ")
  assert.equal(laid(run.state), ETALON)
})

test(`шаг 2 · сценарий 9 [question] ${SCENARIOS[8].name}`, () => {
  const s0 = arrange("good")
  const run = drive(s0, (it) => (it.do === "role"
    ? { track: "err", kind: "question", items: ["Предел ключа — 64 символа?", "Версионирование как у сниппета?"] }
    : null), 6)
  assert.equal(run.last.do, "ask")
  assert.match(run.last.name, SCENARIOS[8].expect.name)
  assert.equal(run.last.items.length, 2)
  assert.equal(run.state.verdicts.length, 0, "вопрос роли судили как ответ")
  assert.equal(run.state.portions[0].round, 1, "вопрос роли съел круг починки")
})

// --- ШОВ: формула исполняема ------------------------------------------------------------------------
test("шаг 2 · формула: на каждую ветвь кода есть сценарий, и наоборот", () => {
  const declared = new Set()
  for (const f of readdirSync(join(HERE, "..")).filter((n) => n.endsWith(".mjs"))) {
    const m = readFileSync(join(HERE, "..", f), "utf8").match(/export const CLASSES = Object\.freeze\(\[([^\]]*)\]\)/)
    if (m) for (const c of m[1].matchAll(/"([^"]+)"/g)) declared.add(c[1])
  }
  assert.ok(declared.size, "ни один подмодуль не объявил CLASSES — шов ослеп")

  const covered = new Set(SCENARIOS.map((s) => s.branch).filter(Boolean))
  // Классы ГАРДРЕЙЛА — территория юнитов: контроль диапазона считает юнит, а не сценарий.
  const units = new Set(["invalid-brd", "invalid-requirement", "invalid-subjects", "no-fit", "invented-default"])
  for (const cls of declared) {
    if (units.has(cls)) continue
    assert.ok(covered.has(cls), `класс «${cls}» шаг умеет вернуть, а сценария на него НЕТ`)
  }
  const words = new Set(["no-file", "repair", "crashed", "question"])
  for (const b of covered) {
    assert.ok(declared.has(b) || words.has(b), `в SCENARIOS есть ветвь «${b}», которой в коде нет`)
  }
  assert.equal(SCENARIOS.filter((s) => s.kind === "happy").length, 1)
  assert.equal(STEP.adapters.length, 3, "у шага 2 три адаптера — файлы, модель и оператор")
})

if (!process.env.NODE_TEST_CONTEXT) process.stdout.write(gherkin())
