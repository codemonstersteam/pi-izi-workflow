// КОМПОНЕНТНЫЙ ТЕСТ ПОДШАГА 2C — подшаг целиком, в изоляции. ЕДИНСТВЕННОЕ описание его поведения:
// таблица SCENARIOS ниже и есть документ.
//
// Читают её двое. Человек: `node steps/brd/anchors/component/anchors.component.test.mjs` печатает
// таблицу Gherkin'ом. Машина: тесты ниже поднимают названную фикстуру и гоняют подшаг ТЕМ ЖЕ
// приводом, что полоса. Второго файла с тем же содержанием нет намеренно.
//
// ЭТАЛОН — МЕРА, А НЕ ИЛЛЮСТРАЦИЯ. `answer-analogue.txt` это ответ роли `analogue`, снятый с живой
// модели на заказе eddi 23.08.2026 (замер `component-tests/steps/brd/4-anchors/`: наряд
// `order.analogue.md`, сырой ответ `raw.json`, ~512 токенов и 29 с, повтор дал побайтово тот же
// ответ). Руками он не правится: порча делается В ТЕСТЕ, в открытую, на названный дефект
// (standards/component-test.md). Он играет две роли:
//   1. заглушка — то, что подкладывается вместо модели;
//   2. ЗАМОК НА ГАРДРЕЙЛ — правило уедет, и красной станет строка, которую конвейер однажды принял.
// Побайтовой меры продвинутого артефакта здесь БОЛЬШЕ НЕТ, и это следствие переработки: артефакт
// пишет не модель, а скрипт (`assemble.mjs`), поэтому сверяется СОСТАВ собранного — R-строки против
// строк таблицы, строка аналога против ответа роли, `subjects[]` против счёта.
//
// ФИКСТУРА `eddi` — МИНИ-РЕПОЗИТОРИЙ, А НЕ ОДИН ФАЙЛ, и это требование гардрейла, а не удобство:
// правило T4 судит ЧИСЛОМ таблицы попаданий, и на дереве из одного файла оно либо молчит, либо
// обвиняет эталон в том, чего он не писал. Двенадцать файлов повторяют форму настоящего eddi:
// `PromptSnippet` (аналог эталона) стоит в шести из них, `glossary` — почти ни в одном, потому что
// это и есть создаваемая вещь.
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import * as step from "../anchors.step.mjs"
import { start, sha1of } from "../../../../ext/state.mjs"
import { instruction } from "../../../../ext/values.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
// Шапка записанного ответа — не часть строки: строки с «#» снимаются, остальное едет байт в байт.
const ETALON = readFileSync(join(HERE, "answer-analogue.txt"), "utf8")
  .split("\n").filter((l) => !l.startsWith("#")).join("\n").trim() + "\n"

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// ЧТО ДЕЛАЕТ ПОДШАГ 2C — В ВИДЕ ДАННЫХ.
//
// ФОРМУЛА (codemonsters.team, «Мифология тестирования: компонентные тесты»):
//     N = 1 (штатное) + Σ (различимых ветвей в адаптере i)
// Адаптера ТРИ: файловая система (таблица действий и дерево), МОДЕЛЬ (роль analogue) и оператор
// (вопрос роли). Ветвей семь, значит сценариев восемь. Само правило T4 сюда НЕ входит: контроль
// его диапазона — работа юнита (steps/brd/anchors/judge/T4.test.mjs).

export const STEP = Object.freeze({
  id: "brd/anchors",
  title: "таблица действий + попадания → аналог, следствия и якоря",
  role: "analogue",
  in: [".agent/normalized.md", ".agent/answers.md", "дерево проекта"],
  out: [".agent/hits.txt", ".agent/staging/analogue.txt", ".agent/brd.md", ".agent/anchors.json",
        "state.at.brd", "state.at.anchors", "state.verdicts[]"],
  adapters: ["файловая система (таблица действий и дерево)", "модель (роль analogue)", "канал ответов оператора"],
})

export const SCENARIOS = Object.freeze([
  { n: 1, kind: "happy", branch: null, fixture: "eddi",
    name: "роль назвала аналог, артефакт собрал скрипт",
    given: "таблица действий подшага 2A из 16 строк и мини-репозиторий из 12 файлов",
    when: "роль ответила ОДНОЙ строкой, снятой с живой модели",
    then: ["наряд показал роли пронумерованные требования и таблицу попаданий и попросил одну строку",
           "таблица попаданий легла в .agent/hits.txt и приехала в наряд ТЕМ ЖЕ текстом: счёт один за проход",
           "гардрейл ПРИНЯЛ строку живой модели на настоящей таблице попаданий",
           "артефакт собрал СКРИПТ: 16 R-строк — копия строк таблицы, строка аналога — ответ роли",
           "subjects[] посчитаны по счёту файлов, и аналог стоит в них последним",
           "сразу за ним лёг .agent/anchors.json: файлы якорей, пакеты и файлы аналога",
           "отпечатки легли в at.brd и at.anchors", "собранный черновик из staging убран"],
    expect: { done: true, stamped: "brd", verdicts: 1, rows: 16, anchors: true } },

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

  { n: 5, kind: "adapter", branch: "invalid-analogue", fixture: "eddi",
    name: "роль назвала слово с нулевым счётом — наряд ПОЧИНКИ несёт задачу и ничего лишнего",
    given: "строка аналога со словом, у которого в таблице попаданий 0 файлов",
    when: "подшаг разобрал ответ и выдал следующий наряд",
    then: ["вердикт красный, круг потрачен — это ОТВЕТ роли, а не обрыв",
           "артефакт НЕ собран и НЕ продвинут, карты обхода нет",
           "наряд починки несёт находку с адресом, прошлый ответ роли и таблицу попаданий",
           "и НЕ несёт требований: чинится одна строка, а не выбор заново"],
    expect: { red: /0 файлов/, promoted: false, round: 2, fixOrder: true } },

  { n: 6, kind: "adapter", branch: "analogue-absent", fixture: "eddi",
    name: "роль объявила, что образца в репозитории нет",
    given: "строка `analogue: none — …`, которую правило T4 принимает",
    when: "подшаг попробовал собрать артефакт",
    then: ["сборщик отказал: без аналога нет ни subjects[], ни покрытия для карты обхода",
           "отказ приехал роли БЛОКЕРОМ С ВЫХОДОМ, а не отказом прогона",
           "артефакт НЕ продвинут"],
    expect: { red: /Назови ОДНО слово с ненулевым счётом/, promoted: false, round: 2 } },

  { n: 7, kind: "adapter", branch: "crashed", fixture: "eddi",
    name: "связь оборвалась",
    given: "конверт track:err kind:crashed",
    when: "подшаг разобрал ответ",
    then: ["подшаг не закрылся на обрыве", "артефакт не написан", "КРУГ НЕ ПОТРАЧЕН"],
    expect: { round: 1, verdicts: 1 } },

  { n: 8, kind: "adapter", branch: "question", fixture: "eddi",
    name: "роль задала вопрос оператору",
    given: "конверт track:err kind:question с двумя пунктами",
    when: "подшаг разобрал ответ",
    then: ["следующая инструкция — ask", "имя паузы без косой черты и уникально по ходу",
           "круг НЕ потрачен"],
    expect: { do: "ask", name: /^brd-anchors-q1$/, items: 2, round: 1 } },
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
  const cwd = mkdtempSync(join(tmpdir(), `izi-anchors-${fixture}-`))
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

// Заглушка роли делает то же, что роль руками: пишет ОДНУ строку по staging-пути и возвращает
// конверт с ПУТЁМ. Текста в конверте нет и быть не может — документ по RPC не едет.
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
  const rowsText = readFileSync(join(s0.cwd, ".agent/normalized.md"), "utf8")

  const said = run.trace.find((i) => i.do === "say")
  assert.ok(said, "подшаг не сказал, что посчитал")
  assert.match(said.line, /строк таблицы действий 16/)

  const order = run.trace.find((i) => i.do === "role")
  assert.ok(order, "наряда не было")
  assert.equal(order.role, "analogue")
  assert.equal(order.staging, ".agent/staging/analogue.txt", "роль послана не в свой файл — артефакт затрёт её ответ либо наоборот")
  assert.ok(!/\{[A-Z_]+\}/.test(order.text), "слот остался незаполненным — данные не доехали")
  assert.match(order.text, /PromptSnippet · files \d+/, "в наряд не приехала таблица попаданий")
  assert.match(order.text, /^R1 create \| Glossary configuration \|/m, "R-строки собрал не скрипт — их нет в наряде")

  // ТАБЛИЦА ПОПАДАНИЙ ЛЕЖИТ НА ДИСКЕ, а не живёт внутри наряда (тикет A01): после прогона на вопрос
  // «почему выбраны эти якоря» отвечает файл, а не пересчёт. Путь разрешён от cwd ПРОГОНА.
  const hits = readFileSync(join(run.state.cwd, ".agent/hits.txt"), "utf8")
  assert.match(hits, /PromptSnippet · files \d+ · weight/, ".agent/hits.txt не содержит счёта аналога")
  assert.ok(order.text.includes(hits.trim()), "наряд и файл разошлись — счёт посчитан дважды")

  assert.equal(run.last.do, "done", `подшаг не дошёл: ${JSON.stringify(run.last).slice(0, 160)}`)
  assert.equal(run.state.verdicts.length, 1)
  assert.equal(run.state.verdicts[0].ok, true, `ГАРДРЕЙЛ ОТБИЛ ОТВЕТ ЖИВОЙ МОДЕЛИ — правило уехало:\n${run.state.verdicts[0].blockers}`)
  assert.equal(run.state.at.brd.path, ".agent/brd.md")

  // АРТЕФАКТ СОБРАН СКРИПТОМ, и сверяется его СОСТАВ, а не байты чужого ответа.
  const art = laid(run.state).split("\n")
  const rows = rowsText.split("\n").filter((l) => l.includes("|"))
  assert.equal(art.filter((l) => /^R\d+ /.test(l)).length, 16, "R-строк не столько, сколько строк таблицы")
  rows.forEach((row, i) => assert.equal(art[i], `R${i + 1} ${row}`, `R${i + 1} не копия строки таблицы — номер или текст переписаны`))
  assert.equal(art[16], ETALON.trim(), "строка аналога в артефакте — не то, что написала роль")
  assert.match(art[17], /^subjects\[\]: /)
  const subjects = art[17].replace("subjects[]: ", "").split(" · ")
  assert.ok(subjects.length >= 3, `якорей ${subjects.length} — карта обхода строилась бы на одном`)
  assert.equal(subjects[subjects.length - 1], "PromptSnippet", "аналог не стоит в якорях последним")
  assert.equal(run.state.at.brd.sha1, sha1of(laid(run.state)))
  assert.ok(!existsSync(join(run.state.cwd, ".agent/staging/brd.md")), "собранный черновик остался в staging")

  // КАРТА ОБХОДА — ЧАСТЬ ТОГО ЖЕ ХОДА. Без неё шаг 3 пошёл бы искать места по путям, а на eddi это
  // 0 файлов аналога из 10 (steps/brd/spread/spread.mjs).
  const map = JSON.parse(readFileSync(join(run.state.cwd, ".agent/anchors.json"), "utf8"))
  assert.equal(run.state.at.anchors.path, ".agent/anchors.json")
  assert.equal(map.files, 12, "карта посчитана не по всему дереву фикстуры")
  assert.deepEqual(map.anchors.map((a) => a.word), subjects, "карта размечена не теми якорями, что стоят в артефакте")
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

test(`подшаг 2C · сценарий 5 [invalid-analogue] ${SCENARIOS[4].name}`, () => {
  const s0 = arrange("eddi")
  // Порча ровно на том правиле, ради которого подшаг существует: слово с нулевым счётом. `assign` —
  // глагол таблицы действий: он В ТАБЛИЦЕ ПОПАДАНИЙ ЕСТЬ и стоит там с нулём файлов.
  const zero = "analogue: assign — files 0; так называется действие, которого в этом коде нет\n"
  // Два хода: состав работы и один ответ роли. Наряд починки берётся СЛЕДУЮЩИМ next, не свёрнутым:
  // свернуть его значило бы ответить на него второй раз тем же мусором и потратить лишний круг.
  const run = drive(s0, writes(s0.cwd, zero), 2)

  assert.match(red(run.state), SCENARIOS[4].expect.red)
  assert.match(red(run.state), /assign/, "блокер не назвал слово, о котором он")
  assert.equal(laid(run.state), null, "артефакт продвинут при красном вердикте")
  assert.ok(!existsSync(join(run.state.cwd, ".agent/staging/brd.md")), "артефакт СОБРАН при красном вердикте")
  assert.ok(!existsSync(join(run.state.cwd, ".agent/anchors.json")), "карта обхода посчитана по отбитому ответу")
  assert.equal(run.state.portions[0].round, 2, "круг не потрачен — это ОТВЕТ роли, а не обрыв")

  const fix = step.next(run.state)
  assert.equal(fix.do, "role", `второго наряда не было: ${JSON.stringify(fix).slice(0, 160)}`)
  assert.match(fix.text, /Findings: 1/, "наряд починки не открывается числом находок")
  assert.match(fix.text, /^\s*1\. /m, "у находки нет номера — роль пойдёт искать место по всему документу")
  assert.match(fix.text, /analogue: assign — files 0/, "прошлый ответ роли не доехал")
  assert.match(fix.text, /PromptSnippet · files \d+/, "находка про аналог не привезла таблицу попаданий")
  assert.ok(!/^R1 create \|/m.test(fix.text), "в наряд починки приехали требования, которых находка не касается")
})

test(`подшаг 2C · сценарий 6 [analogue-absent] ${SCENARIOS[5].name}`, () => {
  const s0 = arrange("eddi")
  // `none` — ЗАКОННЫЙ ответ правила T4 и НЕГОДНЫЙ вход сборщика: `subjects[]` без аналога не
  // строится, а покрытие карты 2D меряется его файлами. Расхождение разрешает голова подшага, и
  // разрешает в пользу выхода: роли уезжает блокер с готовой строкой правки, а не отказ прогона.
  const run = drive(s0, writes(s0.cwd, "analogue: none — nothing here resembles a glossary\n"), 2)

  assert.ok(!run.refused, `подшаг уронил прогон вместо блокера: ${run.refused && run.refused.detail}`)
  assert.match(red(run.state), SCENARIOS[5].expect.red)
  assert.equal(laid(run.state), null, "артефакт продвинут без аналога")
  assert.equal(run.state.portions[0].round, 2)
})

test(`подшаг 2C · сценарий 7 [crashed] ${SCENARIOS[6].name}`, () => {
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
  assert.ok(laid(run.state), "после обрыва подшаг не дошёл до артефакта")
})

test(`подшаг 2C · сценарий 8 [question] ${SCENARIOS[7].name}`, () => {
  const s0 = arrange("eddi")
  const run = drive(s0, (it) => (it.do === "role"
    ? { track: "err", kind: "question", items: ["Предел ключа — 64 символа?", "Версионирование как у сниппета?"] }
    : null), 6)
  assert.equal(run.last.do, "ask")
  assert.match(run.last.name, SCENARIOS[7].expect.name)
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
  for (const cls of declared) {
    assert.ok(covered.has(cls), `класс «${cls}» подшаг умеет вернуть, а сценария на него НЕТ`)
  }
  // Ветви, опознаваемые НЕ классом гардрейла: две — формой конверта роли (обрыв и вопрос), одна —
  // классом отказа СБОРЩИКА, который голова переводит в блокер (`anchors.step.mjs::ROLE_FAULT`).
  const head = readFileSync(join(HERE, "..", "anchors.step.mjs"), "utf8")
  const faults = [...(head.match(/const ROLE_FAULT = Object\.freeze\(\[([^\]]*)\]\)/) || ["", ""])[1]
    .matchAll(/"([^"]+)"/g)].map((m) => m[1])
  assert.ok(faults.length, "ROLE_FAULT в голове не разобран — шов ослеп на переводе отказа сборщика в блокер")
  const words = new Set(["crashed", "question", ...faults])
  for (const b of covered) {
    assert.ok(declared.has(b) || words.has(b), `в SCENARIOS есть ветвь «${b}», которой в коде подшага нет`)
  }
  assert.equal(SCENARIOS.filter((s) => s.kind === "happy").length, 1, "штатное поведение должно быть ровно одно")
  assert.equal(SCENARIOS.length, 1 + SCENARIOS.filter((s) => s.kind === "adapter").length, "в таблице строка, которая ни штатная, ни ветвь адаптера")
  assert.equal(STEP.adapters.length, 3, "у подшага 2C три адаптера — файлы, модель и оператор")
})

if (!process.env.NODE_TEST_CONTEXT) process.stdout.write(gherkin())
