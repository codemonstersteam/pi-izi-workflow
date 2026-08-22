// КОМПОНЕНТНЫЙ ТЕСТ ШАГА 1 — шаг целиком, в изоляции. ЕДИНСТВЕННЫЙ компонентный тест этого шага и
// ЕДИНСТВЕННОЕ описание его поведения: таблица SCENARIOS ниже и есть документ.
//
// Читают её двое. Человек: `node steps/task/component/task.component.test.mjs` печатает таблицу
// Gherkin'ом. Машина: тесты ниже поднимают названную фикстуру и гоняют шаг ТЕМ ЖЕ приводом, что
// полоса, проверяя `expect`. Второго файла с тем же содержанием нет намеренно — он разъехался бы
// с этим молча, а разъехавшееся описание хуже отсутствующего.
//
// ФОРМУЛА (codemonsters.team, «Мифология тестирования: компонентные тесты»):
//     N = 1 (штатное) + Σ (различимых ветвей в адаптере i)
// и она здесь ИСПОЛНЯЕМАЯ: последний тест файла сверяет состав таблицы С КОДОМ шага в обе стороны.
// Класс отказа, который шаг умеет вернуть, но которого нет в таблице, — красный тест. Строка
// таблицы, называющая класс, которого в коде нет, — тоже красный.
//
// Роли у шага 1 нет: модель не участвует ни в одном сценарии, и заглушка LLM здесь не нужна вовсе.
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, cpSync, readFileSync, readdirSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import * as step from "../task.step.mjs"
import { start, sha1of } from "../../../ext/state.mjs"
import { instruction } from "../../../ext/values.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// ЧТО ДЕЛАЕТ ШАГ 1 — В ВИДЕ ДАННЫХ. Таблицу читают двое: человек (она же и есть описание шага,
// а `node steps/task/component/task.component.test.mjs` печатает её Gherkin'ом) и машина (тесты
// ниже гоняют каждую строку через модуль шага). ОДНО описание, две дороги — дублей нет и быть не
// может: второй файл с тем же содержанием разъехался бы с этим молча.
//
// ФОРМУЛА (codemonsters.team, «Мифология тестирования: компонентные тесты»):
//     N = 1 (штатное поведение) + Σ (различимых ветвей в адаптере i)
// Адаптеров у шага 1 два: файловая система (TASK.md) и канал ответов оператора
// (.agent/answers.md). Ветвей пять, значит сценариев шесть. И это не дисциплина автора:
// последний тест файла сверяет состав таблицы С КОДОМ шага в обе стороны.

export const STEP = Object.freeze({
  id: "task",
  title: "ключ задачи",
  role: null,                       // роли нет: шаг целиком скрипт, 0 токенов, модель не зовётся
  in: ["TASK.md", ".agent/answers.md"],
  out: ["state.key", "state.at.task", "state.verdicts[]"],
  adapters: ["файловая система (TASK.md)", "канал ответов оператора (.agent/answers.md)"],
})

// `branch` — КЛАСС отказа либо слово инструкции, которым ветвь опознаётся в коде. Это ключ, по
// которому шов связывает строку таблицы с кодом; `null` только у штатного поведения.
// `expect` — то, что проверяет машина. `then` — то же самое словами, для человека.
export const SCENARIOS = Object.freeze([
  {
    n: 1, kind: "happy", branch: null, fixture: "good",
    name: "ключ объявлен в задаче",
    given: "TASK.md с непустым требованием и строкой `task: DOS-535`",
    when: "шаг отработал",
    then: [
      "ключ DOS-535 лёг в состояние",
      "отпечаток входа лёг в at.task — по нему шаги 2+ узнают, что TASK.md не правили",
      "вердикт шага зелен и лежит в состоянии",
      "модель не звалась ни разу",
    ],
    expect: { done: true, key: "DOS-535", stamped: "task", verdicts: 1, calledModel: false },
  },
  {
    n: 2, kind: "adapter", branch: "no-task", fixture: "missing",
    name: "TASK.md нет вовсе",
    given: "каталог прогона без TASK.md",
    when: "шаг отработал",
    then: [
      "отказ blocked класса no-task",
      "отказ называет ИМЯ файла и того, кто его кладёт",
      "ключ НЕ лёг",
    ],
    expect: { do: "err", code: "blocked", cls: "no-task", subject: /TASK\.md.*оператор/s, key: "" },
  },
  {
    n: 3, kind: "adapter", branch: "empty", fixture: "empty",
    name: "TASK.md пуст по словам",
    given: "TASK.md из одних пробелов, табуляций и переводов строк",
    when: "шаг отработал",
    then: [
      "отказ blocked класса empty",
      "отказ говорит «молчание не является требованием»",
      "ключ НЕ лёг, хотя файл существует и читается",
    ],
    expect: { do: "err", code: "blocked", cls: "empty", subject: /молчание/, key: "" },
  },
  {
    n: 4, kind: "adapter", branch: "too-long", fixture: "too-long",
    name: "TASK.md длиннее предела",
    given: "TASK.md на 306 строк при пределе 300",
    when: "шаг отработал",
    then: [
      "отказ blocked класса too-long",
      "отказ называет ПРЕДЕЛ, а не просто «слишком длинно»",
      "ключ НЕ лёг, хотя строка `task:` в файле есть",
    ],
    expect: { do: "err", code: "blocked", cls: "too-long", subject: /300/, key: "" },
  },
  {
    n: 5, kind: "adapter", branch: "ask", fixture: "no-key",
    name: "ключа нет ни в задаче, ни в ответах",
    given: "TASK.md без строки `task:` и пустой канал ответов",
    when: "шаг сделал первый ход",
    then: [
      "шаг СПРАШИВАЕТ оператора, а не выдумывает ключ",
      "имя паузы уникально по ходу — иначе второй вопрос до оператора не доедет",
      "вопрос несёт форму ключа, а не просто «назови ключ»",
    ],
    expect: { do: "ask", name: "task-q1", prompt: /2-20 заглавных|TASK-номер/, items: 1 },
  },
  {
    n: 6, kind: "adapter", branch: "re-ask", fixture: "bad-key",
    name: "оператор ответил, но не ключом",
    given: "TASK.md без ключа и ответ оператора «да, заводи как обычно»",
    when: "шаг получил approved и перечитал ответ с диска",
    then: [
      "ключ НЕ принят: approved это барьер над ФАКТОМ, а не сам факт",
      "шаг переспрашивает с НОВЫМ именем паузы",
      "счётчик переспросов вырос",
    ],
    expect: { reask: true, key: "" },
  },
])

// FUNCTION_CONTRACT: gherkin — таблица как текст для человека
//   Input:        —
//   Antecedent:   —
//   Consequent:   success: Feature/Scenario/Given/When/Then одной строкой на пункт
//   Purity:       pure
//   Interface:    gherkin() -> string
export function gherkin() {
  const head = [
    `# ЭТО НЕ ОТДЕЛЬНЫЙ ДОКУМЕНТ, а печать таблицы из ЭТОГО ЖЕ файла — правится в SCENARIOS ниже.`,
    `# N = 1 (штатное) + ${SCENARIOS.filter((s) => s.kind === "adapter").length} (ветви адаптеров) = ${SCENARIOS.length}`,
    ``,
    `Feature: шаг 1 «${STEP.title}» — ${STEP.role ? `роль ${STEP.role}` : "роли нет, скрипт, 0 токенов"}`,
    `  вход:  ${STEP.in.join(" · ")}`,
    `  выход: ${STEP.out.join(" · ")}`,
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


// --- ARRANGE: фикстура — КАТАЛОГ НА ДИСКЕ, а не строка в коде ------------------------------------
// Так её можно подмонтировать в контейнер и так её читает человек. Пути шага разрешаются от cwd
// ПРОГОНА, никогда от этого репозитория (CLAUDE.md, ограничение 6).
const arrange = (fixture) => {
  const src = join(HERE, "fixture", fixture)
  assert.ok(existsSync(src), `фикстуры ${fixture} нет — таблица называет каталог, которого не существует`)
  const cwd = mkdtempSync(join(tmpdir(), `izi-task-${fixture}-`))
  cpSync(src, cwd, { recursive: true })
  mkdirSync(join(cwd, ".agent", "staging"), { recursive: true })
  return start({ cwd, run: `component-${fixture}` }).value
}

// ТОТ ЖЕ ПОРЯДОК ХОДОВ, ЧТО В ПОЛОСЕ. Копия сторожится швом словаря (ext/vocabulary.test.mjs).
const drive = (state) => {
  const trace = []
  let calledModel = false
  for (let it = step.next(state); it.do !== "done"; it = step.next(state)) {
    assert.equal(instruction(it).ok, true, `шаг выдал инструкцию, которую конструктор не принимает: ${JSON.stringify(it).slice(0, 140)}`)
    trace.push(it)
    if (it.do === "role" || it.do === "roles") calledModel = true
    if (it.do === "err") return { state, trace, calledModel, last: it }
    if (it.do === "ask") return { state, trace, calledModel, last: it }   // пауза: дальше ведёт полоса
    const r = step.fold(state, { do: it.do, instruction: it, result: null })
    if (!r.ok) return { state, trace, calledModel, refused: r.error }
    state = r.value
    assert.ok(trace.length < 10, "шаг не сходится — привод крутится на одном ходе")
  }
  return { state, trace, calledModel, last: { do: "done" } }
}

// --- каждая строка таблицы — свой тест -------------------------------------------------------------
for (const s of SCENARIOS) {
  test(`шаг 1 · сценарий ${s.n} [${s.branch || "happy"}] ${s.name}`, () => {
    const s0 = arrange(s.fixture)
    const run = s.n === 6 ? reask(s0) : drive(s0)
    const e = s.expect

    if (e.done) {
      assert.equal(run.last.do, "done", `шаг не дошёл до конца: ${JSON.stringify(run.last).slice(0, 140)}`)
    }
    if (e.do) assert.equal(run.last.do, e.do, `ждали ${e.do}, получили ${run.last.do}`)
    if (e.code) assert.equal(run.last.code, e.code)
    if (e.cls) assert.equal(run.last.cls, e.cls, `класс отказа не тот: ${run.last.cls} вместо ${e.cls}`)
    if (e.subject) assert.match(String(run.last.subject || ""), e.subject)
    if (e.name) assert.equal(run.last.name, e.name, "имя паузы не то — хост ключует паузу по имени")
    if (e.prompt) assert.match(String(run.last.prompt || ""), e.prompt)
    if (e.items) assert.equal((run.last.items || []).length, e.items)
    if (e.key !== undefined) assert.equal(run.state.key, e.key, e.key ? "ключ не лёг" : "ключ лёг при отбитом входе")
    if (e.verdicts !== undefined) assert.equal(run.state.verdicts.length, e.verdicts)
    if (e.calledModel !== undefined) assert.equal(run.calledModel, e.calledModel, "у шага 1 роли нет — модель не должна зваться")
    if (e.stamped) {
      const at = run.state.at[e.stamped]
      assert.ok(at, `отпечаток ${e.stamped} не лёг — следующий шаг поверит на слово`)
      assert.equal(at.sha1, sha1of(readFileSync(join(run.state.cwd, at.path), "utf8")), "отпечаток не совпал с содержимым")
    }
    if (e.reask) {
      assert.equal(run.last.do, "ask", "шаг не переспросил")
      assert.notEqual(run.last.name, "task-q1", "переспрос ушёл под ТЕМ ЖЕ именем паузы — оператор его не увидит")
    }
  })
}

// Сценарий 6 идёт на ход дальше: оператор «нажал Approve», и шаг обязан перечитать ответ с ДИСКА.
function reask(s0) {
  const first = step.next(s0)
  assert.equal(first.do, "ask", "первый ход не вопрос — фикстура bad-key собрана неверно")
  const folded = step.fold(s0, { do: "ask", instruction: first, result: "approved" })
  assert.equal(folded.ok, true, `fold отказал: ${!folded.ok && folded.error.detail}`)
  return { ...drive(folded.value), state: folded.value }
}

// --- ШОВ: формула исполняема ------------------------------------------------------------------------
test("шаг 1 · формула: на каждую ветвь кода есть сценарий, и наоборот", () => {
  // Классы отказа собираются ИЗ КОДА подмодулей шага, а не из веры автора таблицы.
  const declared = new Set()
  for (const f of readdirSync(join(HERE, "..")).filter((n) => n.endsWith(".mjs"))) {
    const text = readFileSync(join(HERE, "..", f), "utf8")
    const m = text.match(/export const CLASSES = Object\.freeze\(\[([^\]]*)\]\)/)
    if (m) for (const c of m[1].matchAll(/"([^"]+)"/g)) declared.add(c[1])
  }
  assert.ok(declared.size, "ни один подмодуль шага не объявил CLASSES — шов ослеп")

  const covered = new Set(SCENARIOS.map((s) => s.branch).filter(Boolean))
  for (const cls of declared) {
    assert.ok(covered.has(cls), `класс отказа «${cls}» шаг умеет вернуть, а сценария на него в SCENARIOS НЕТ — ветвь не проверена ничем`)
  }
  // Обратная сторона: строка таблицы, называющая класс, которого в коде нет, сторожит переименование.
  const words = new Set(["ask", "re-ask"])          // ветви, опознаваемые словом инструкции, а не классом
  for (const b of covered) {
    assert.ok(declared.has(b) || words.has(b), `в SCENARIOS есть ветвь «${b}», которой в коде шага нет — переименовали класс и забыли таблицу`)
  }

  // И сама формула: одно штатное поведение плюс по сценарию на ветвь.
  const happy = SCENARIOS.filter((s) => s.kind === "happy").length
  const adapters = SCENARIOS.filter((s) => s.kind === "adapter").length
  assert.equal(happy, 1, "штатное поведение должно быть ровно одно")
  assert.equal(SCENARIOS.length, happy + adapters, "в таблице строка, которая ни штатная, ни ветвь адаптера")
  assert.ok(STEP.adapters.length >= 1, "у шага не объявлено ни одного адаптера — считать нечего")
})

// --- ЧТЕНИЕ ДЛЯ ЧЕЛОВЕКА --------------------------------------------------------------------------
// `node steps/task/component/task.component.test.mjs` печатает таблицу как Gherkin.
// Под `node --test` раннер выставляет NODE_TEST_CONTEXT — тогда печати нет, идут тесты.
if (!process.env.NODE_TEST_CONTEXT) process.stdout.write(gherkin())
