// Наряд — единственный канал между полосой и ролью, и он собирается ПОДСТАНОВКОЙ: `{SLOT}` шаблона
// против ключей, которые перечисляет `sized(...)` в workflows/izi.js. Подстановка молчалива в обе
// стороны: слот без ключа приезжает роли ПУСТЫМ (а «пусто» у шага 6 значит «первая попытка»), ключ
// без слота не приезжает вовсе. Ни то ни другое не ловится ни одним гардрейлом — они судят артефакт,
// а не заказ, — и увидеть это можно только в живом прогоне, по тому, что роль ведёт себя странно.
//
// Шов заведён вместе со слотом PREVIOUS (прогон 7f3a8431): роль переписывала FRD с нуля каждый круг,
// потому что своего прошлого ответа не получала.
//
// Хост требует ТОЧНОГО совпадения в обе стороны: `prompt()` бросает и на «Missing prompt value», и на
// «Unused prompt value» (execution.ts) — то есть расхождение убивает прогон на запуске, а не на
// разборе. Раньше это сверялось в steps/intake/frd.test.mjs со списком ключей, набранным в тесте
// руками: такой список сходится с шаблоном всегда, потому что третьей стороны договора — полосы — в
// сверке нет. S33 — след того же места: ключ `QUESTIONS_LEFT` ушёл вместе с бюджетом вопросов, и
// счётчик, выданный роли как «осталось в прогоне», два живых прогона читали как разрешение потратить.
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const WORKFLOW = readFileSync(join(ROOT, "workflows/izi.js"), "utf8")

// Ключи одного вызова: `sized("intake", orderTpl, { BRD, MAP: map.text, … })` — читается имя шага и
// имена ключей объекта, до закрывающей скобки. Ключ стоит в начале объекта или после запятой, и
// пишется двумя способами: `MAP: map.text` и сокращённо `CHECK` — второй бывает и последним, перед
// самой скобкой, поэтому конец объекта здесь такая же граница, как запятая.
// ПУТЬ ШАБЛОНА БЕРЁТСЯ ИЗ ПРОВОДКИ, А НЕ ИЗ ИМЕНИ ШАГА. Раньше он выводился по соглашению
// `steps/<шаг>/order.tpl` — и соглашение сломалось на шаге 6, у которого четыре наряда по числу
// пластов (steps/intake/passes-data-flow.md). Соглашение и не проверяло ничего: шов должен идти по
// той же дороге, что и данные, — переменная, в которую readText положил шаблон, и есть эта дорога.
// Одно и то же имя (`orderTpl`) держит шаблон разных шагов, поэтому берётся ПОСЛЕДНЕЕ присваивание
// ДО вызова — то, что реально стоит в переменной в этой точке полосы.
const tplOf = (src, name, before) => {
  let last = null
  for (const m of src.matchAll(new RegExp(`const\\s+${name}\\s*=([^;]*)`, "g"))) {
    // Присваивание из ДРУГОЙ функции — не эта переменная: `scout(cell, orderTpl, BRD)` принимает
    // шаблон параметром, и `orderTpl` шага 2, объявленный выше по файлу, к нему отношения не имеет.
    // Граница функции — единственный признак, доступный разбору текста.
    if (m.index < before && !/\n(?:async )?function /.test(src.slice(m.index, before))) last = m[1]
  }
  // Присваивание НЕ из файла (шаг 9 берёт шаблон прохода из своей таблицы) пути не даёт, и вызов
  // остаётся без сверки — но и не сверяется с чужим шаблоном, что было бы хуже молчания.
  const hit = last && last.match(/await readText\(\{\s*path:\s*"([^"]+\.tpl)"/)
  return hit ? hit[1] : ""
}

const callsOf = (src) =>
  [...src.matchAll(/sized\(\s*[`"]([^`"]+)[`"]\s*,\s*(\w+)\s*,\s*\{([^}]*)\}/g)].map((m) => ({
    step: m[1],
    tpl: tplOf(src, m[2], m.index),
    keys: new Set([...`{${m[3]}}`.matchAll(/[{,]\s*([A-Z_]+)\s*(?=[:,}])/g)].map((k) => k[1])),
  }))

const slotsOf = (tpl) => new Set([...tpl.matchAll(/\{([A-Z_]+)\}/g)].map((m) => m[1]))

test("у каждого слота наряда есть ключ в полосе, и наоборот", () => {
  const calls = callsOf(WORKFLOW)
  assert.ok(calls.length >= 3, `в полосе найдено вызовов sized: ${calls.length} — разбор сломался`)

  for (const { step, tpl, keys } of calls) {
    if (!tpl) continue // шаблон собран не из файла (шаг 9 подставляет один из трёх по роли)
    const path = join(ROOT, tpl)
    assert.ok(existsSync(path), `${step}: полоса читает ${tpl}, а такого файла нет`)
    const slots = slotsOf(readFileSync(path, "utf8"))

    const empty = [...slots].filter((s) => !keys.has(s))
    assert.deepEqual(empty, [], `${step}: слот шаблона без ключа полосы — роль получит пустоту: ${empty.join(", ")}`)

    const lost = [...keys].filter((k) => !slots.has(k))
    assert.deepEqual(lost, [], `${step}: ключ полосы без слота шаблона — данные не доедут: ${lost.join(", ")}`)
  }
})

// ПРОШЛЫЙ ОТВЕТ РОЛИ КОПИРУЕТ МАШИНА. Читать его с диска — ДЕЙСТВИЕ, а действие роль на `thinking:
// low` может тихо не сделать; наряд не приехать не может. Та же дисциплина, что у ключа вопроса в
// `.agent/pending.json` (CLAUDE.md, ограничение 4).
test("починка шага 6 несёт прошлый ответ роли, а не путь к нему", () => {
  for (const pass of ["a", "b", "c", "d"]) {
    const tpl = readFileSync(join(ROOT, `steps/intake/order-${pass}.tpl`), "utf8")
    assert.ok(slotsOf(tpl).has("PREVIOUS"), `в наряде intake/${pass.toUpperCase()} нет слота PREVIOUS`)
  }
  assert.match(WORKFLOW, /const PREVIOUS = await readText\(\{ path: STAGING \}\)/)

  const role = readFileSync(join(ROOT, "steps/intake/intake.md"), "utf8")
  assert.match(role, /PREVIOUS/, "текст роли не называет блок, в котором приезжает её прошлый ответ")
})

// Шаблоны шагов не должны расходиться со списком слотов ВООБЩЕ: пустой слот — это тихая потеря.
test("ни один наряд не оставлен без разбора", () => {
  // Файл наряда, который полоса не читает, — мёртвый текст: правка в нём не доедет до роли никогда, и
  // заметить это можно только по странному поведению живого прогона. Считаются ВСЕ `.tpl` шагов, а не
  // только `order.tpl`: у шага 6 их четыре, у шага 9 — три.
  const files = readdirSync(join(ROOT, "steps"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => readdirSync(join(ROOT, "steps", d.name))
      .filter((f) => f.endsWith(".tpl"))
      .map((f) => `steps/${d.name}/${f}`))
  // Путь наряда бывает и ДАННЫМИ: шаг 9 выбирает шаблон прохода по роли (`tpl: "steps/design/…"` в
  // его таблице проходов) и читает его переменной. Считается всякое упоминание пути в полосе.
  const read = new Set([...WORKFLOW.matchAll(/"(steps\/[^"]+\.tpl)"/g)].map((m) => m[1]))
  // ПРИПАРКОВАННЫЙ НАРЯД — ЭТО ОБЪЯВЛЕНИЕ, А НЕ ИСКЛЮЧЕНИЕ. Шаг 9 переписывается (docs/plan.md): его
  // проводка удалена 21.08.2026, а материал словаря значений оставлен решением оператора. Пока
  // читателя нет, наряд обязан стоять В ЭТОМ СПИСКЕ — иначе «мёртвый текст» и «текст, ждущий нового
  // шага» неотличимы, и первый тихо доживёт до прогона.
  const PARKED = new Map([
    ["steps/design/order-values.tpl", "шаг 9A: словарь значений ждёт проводки нового шага 9"],
  ])
  for (const [f] of PARKED) assert.ok(files.includes(f), `припаркован наряд, которого нет: ${f} — список протух`)
  for (const [f] of PARKED) assert.ok(!read.has(f), `наряд ${f} уже читается полосой — сними его с парковки`)
  const orphans = files.filter((f) => !read.has(f) && !PARKED.has(f))
  assert.deepEqual(orphans, [], `наряд есть, а полоса его не читает: ${orphans.join(", ")}`)
})

// ШАГ БЕЗ ОТМЕТКИ МОЛЧА ЛОМАЕТ ВОЗОБНОВЛЕНИЕ. Лестница (core/runlog.mjs::resumeAt) входит в ПЕРВЫЙ
// шаг без отметки — значит шаг, который отработал и ничего не записал, будет переигрываться вечно, а
// весь путь за ним никогда не откроется. Увидеть это можно только в живом прогоне, поэтому проверка
// статическая: каждая ветка `if (from <= N)` полосы обязана нести `runlogMark({ step: N`.
test("каждый шаг полосы кончается отметкой в журнале", () => {
  const guards = [...WORKFLOW.matchAll(/if \(from0? <= (\d+)\)/g)].map((m) => Number(m[1]))
  const marked = new Set([...WORKFLOW.matchAll(/runlogMark\(\{ step: (\d+)/g)].map((m) => Number(m[1])))
  // Шаги, отложенные до своего наряда (10 и 11 — их артефакты не собираются сегодня), не в счёт.
  const alive = [...new Set(guards)].filter((n) => n !== 10 && n !== 11).sort((a, b) => a - b)

  const mute = alive.filter((n) => !marked.has(n))
  assert.deepEqual(mute, [], `шаги без отметки — возобновление будет входить в них вечно: ${mute.join(", ")}`)
  assert.ok(marked.has(1), "шаг 1 не отмечается — лестница не сдвинется с первой ступени")
})

// САМОПРОВЕРКА РОЛИ — ЭТО НЕ УКРАШЕНИЕ, А ЕДИНСТВЕННОЕ МЕСТО, ГДЕ ЛОВИТСЯ НЕНАБЛЮДАЕМЫЙ ШАГ ДО
// ГАРДРЕЙЛА. Живой прогон: план объявил, что монго-хранилище закрывает шаг про кэш чужого сервиса;
// исполнителю нечем было это проверить, и слабая модель закрыла шаг требования `assertTrue(true)`.
// Гардрейл партии ловит это правилом 6, но роль должна увидеть раньше — выписав таблицу «шаг → чем
// он проверяется» своей же рукой.
test("наряды, которые пишут решения, требуют выписанной самопроверки", () => {
  // Шаг 9 в списке не стоит: его наряды удалены вместе со старым шагом (docs/plan.md), а наряд
  // нового дерева модулей ещё не написан. Вернуть сюда «design» обязан тот, кто его напишет.
  for (const step of ["intake"]) {
    const files = readdirSync(join(ROOT, "steps", step)).filter((f) => f.endsWith(".tpl"))
    const withCheck = files.filter((f) => readFileSync(join(ROOT, "steps", step, f), "utf8").includes("$START_SELFCHECK"))
    assert.ok(withCheck.length, `${step}: ни один наряд не требует самопроверки`)
  }
})

// НАРЯД С КРУГОМ ПОЧИНКИ НЕСЁТ ПРОШЛЫЙ ОТВЕТ РОЛИ. Иначе роль каждый круг пишет заново, ориентируясь
// на претензии к документу, которого не видит: шаг 6 дал 10 → 4 → 6 блокеров и эскалацию, шаг 9 —
// 5 → 5 → 4 → 6 и её же. С блоком PREVIOUS оба сошлись за два круга.
//
// Признак круга починки — слот FEEDBACK: наряд, которому шлют блокеры, обязан показывать и то, что
// эти блокеры описывают.
test("наряд, которому шлют блокеры, несёт и текст, который они описывают", () => {
  const mute = []
  for (const dir of readdirSync(join(ROOT, "steps"), { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const f of readdirSync(join(ROOT, "steps", dir.name)).filter((x) => x.endsWith(".tpl"))) {
      const tpl = readFileSync(join(ROOT, "steps", dir.name, f), "utf8")
      const slots = slotsOf(tpl)
      if (slots.has("FEEDBACK") && !slots.has("PREVIOUS")) mute.push(`${dir.name}/${f}`)
    }
  }
  assert.deepEqual(mute, [], `наряды чинят вслепую — роль не видит, что написала: ${mute.join(", ")}`)
})

// НАРЯД ОБЕЩАЕТ РОЛИ РОВНО ТО, ЧЕМ ЕЁ БУДУТ СУДИТЬ. Шаг 6 идёт четырьмя проходами
// (steps/intake/passes-data-flow.md), и у каждого своя пачка правил (steps/intake/frd.mjs::RULE_PASS).
// Наряд, забывший правило своего пласта, отправляет роль на блокер, которого она не ждала; наряд,
// назвавший чужое, гонит её чинить то, чего этот проход не пишет. Ни то ни другое не видно из
// артефакта — только из живого прогона, по лишним кругам.
//
// `*`-правило (F9, сторож перемотки) в этот счёт не входит: оно стоит во всех четырёх проходах и
// срабатывает лишь на возврате от критика, а самоповерка наряда — про то, что роль пишет СЕЙЧАС.
test("самоповерка наряда прохода называет ровно правила своего пласта", async () => {
  const { RULE_PASS } = await import("../steps/intake/frd.mjs")
  const owned = (pass) => Object.keys(RULE_PASS).filter((c) => RULE_PASS[c] === pass).sort()

  for (const pass of ["A", "B", "C", "D"]) {
    const tpl = readFileSync(join(ROOT, `steps/intake/order-${pass.toLowerCase()}.tpl`), "utf8")
    const named = new Set()
    for (const code of Object.keys(RULE_PASS)) {
      if (new RegExp(`\\b${code}\\b`).test(tpl)) named.add(code)
    }
    const mine = owned(pass)
    const missing = mine.filter((c) => !named.has(c))
    assert.deepEqual(missing, [], `наряд ${pass}: правило пласта не названо в самоповерке — роль узнает о нём только из блокера: ${missing.join(", ")}`)

    const foreign = [...named].filter((c) => RULE_PASS[c] !== pass && RULE_PASS[c] !== "*").sort()
    assert.deepEqual(foreign, [], `наряд ${pass}: обещано чужое правило — этот проход его пласт не пишет: ${foreign.join(", ")}`)
  }
})

// ПРАВИЛО СУДИТ ПЛАСТ ПО ЭЛЕМЕНТУ, ПИСАТЬ КОТОРЫЙ ЭТОМУ ПЛАСТУ РАЗРЕШЕНО. Наряд, запрещающий трогать
// то, что судит его же гардрейл, — тупик: роль не выйдет из него ни за один круг, и это ровно то, что
// `standards/guardrail.md` называет «два правила, требующих несовместимого».
//
// BUG_FIX_CONTEXT: живой прогон eddi 19.08.2026, второй запуск. Пласт A написал `error="none"` во
//   ВСЕХ семи ветках — как ему и велено: код это величина, а величин у пласта A нет. Пласт C судится
//   по F6/F6d, то есть по `<ext error>`, и его наряд при этом запрещал править use case целиком.
//   Роль пласта C обязана была построить карту отказов по кодам, которых нет, и не имела права их
//   проставить. Дефект найден чтением артефакта до того, как стоил круга.
test("наряд пласта C вправе ставить то, чем его судят: код ветки", () => {
  const a = readFileSync(join(ROOT, "steps/intake/order-a.tpl"), "utf8")
  const c = readFileSync(join(ROOT, "steps/intake/order-c.tpl"), "utf8")

  // A откладывает код и говорит, КТО его поставит — иначе роль либо выдумает код, либо оставит
  // ветку без него навсегда
  assert.match(a, /the values pass names it later/, "наряд A не говорит, что код проставит следующий проход")

  // C разрешает менять ИМЕННО атрибут error и ничего больше
  assert.match(c, /the `error` attribute of an existing `<ext>`/, "наряд C не даёт права поставить код")
  assert.match(c, /You may not add a branch,\s+remove one, reorder them/, "наряд C не ограничил это право")
  // и его самоповерка велит закрыть оставшиеся `none` на отказных ветках
  assert.match(c, /whose `error` is still `none`/, "самоповерка C не ловит ветку без кода")
})

// НАРЯД ПЛАСТА D ВЕЛИТ ПИСАТЬ, А НЕ ВОЗДЕРЖИВАТЬСЯ. Слабая модель читает буквально, и «write nothing
// new» она прочла как «не пиши»: живой прогон eddi 19.08.2026, третий запуск — пласт D вернул файл
// БЕЗ ЕДИНОЙ строки `<carried>`, и F11 покраснел на всех семнадцати требованиях сразу. Во втором
// круге та же роль написала все семнадцать, и они были осмысленны — значит дело было в тексте.
test("наряд пласта D требует ДОБАВИТЬ строки, а не «ничего не писать»", () => {
  const d = readFileSync(join(ROOT, "steps/intake/order-d.tpl"), "utf8")
  const task = (d.match(/\$START_TASK[\s\S]*?\$END_TASK/) || [""])[0]
  assert.match(task, /ADD one `<carried>` row for EVERY line/, "задача не называет действие приказом")
  assert.doesNotMatch(task, /Write nothing new/, "вернулась формулировка, прочитанная как «не пиши»")
  assert.match(d, /you must add it/, "не сказано, что писать ОБЯЗАТЕЛЬНО")
  // и самоповерка требует ДВА числа, а не согласия «равны»
  assert.match(d, /WRITE BOTH NUMBERS DOWN/, "самоповерка не заставляет посчитать строки")
})

// ЧЕК-ЛИСТ ДОЛГА СОБИРАЕТСЯ В ТОЧКЕ ПРИМЕНЕНИЯ. Вызов в начале шага 6 подставлял в наряд прохода D
// значение, снятое ДО того, как артефакт появился (живой прогон 19.08.2026: `OWED 24` вместо 2141).
test("шаг 6: долг перед требованиями считается в проходе D, а не в начале шага", () => {
  const intake = WORKFLOW.slice(WORKFLOW.indexOf("// $START_INTAKE"), WORKFLOW.indexOf("// $END_INTAKE"))
  const call = intake.indexOf("await reviewForm({})")
  const passD = intake.indexOf('sized("intake/D"')
  assert.ok(call > 0, "полоса не собирает чек-лист вовсе")
  assert.ok(passD - call < 400 && passD > call, "чек-лист считается далеко от прохода D — значит до появления артефакта")
})

// ПРОБЕЛ СПРАШИВАЮТ, А НЕ СДАЮТ. `<question>` в артефакте — не «законный результат»: закрыть его не
// умеет ни один проход (каждый умеет только добавить свой), а шаг 11 превращает КАЖДЫЙ открытый
// вопрос в `open-question` скриптом (steps/review/review.mjs::autoFindings) — Reject и перезаход шага
// с первого прохода.
//
// BUG_FIX_CONTEXT: живой прогон eddi 19.08.2026. Пласт A записал три пробела требования в артефакт —
// строго по тогдашнему ЗАКОНУ 7 («an open question is first-class OUTPUT»). Критик вернул Reject с
// пятью блокерами, из них ТРИ автоматических — ровно эти вопросы. Оператора при этом не спросили ни
// разу: пауза стоила бы одного круга, а сдача пробела стоила четырёх проходов.
test("роль и наряды: пробел спрашивают у оператора, `<question>` — только при исчерпанных кругах", () => {
  const role = readFileSync(join(ROOT, "steps/intake/intake.md"), "utf8")
  assert.match(role, /A GAP IS ASKED, NOT FILED/, "закон роли не велит спрашивать")
  assert.match(role, /ONLY when the FEEDBACK tells you the operator rounds are spent/)
  assert.doesNotMatch(role, /first-class OUTPUT/, "вернулась формулировка, из-за которой пробелы сдавали в файл")

  for (const pass of ["a", "c"]) {
    const tpl = readFileSync(join(ROOT, `steps/intake/order-${pass}.tpl`), "utf8")
    assert.match(tpl, /ASK the operator|is ASKED, not filed/i, `наряд ${pass.toUpperCase()} не велит спрашивать`)
    assert.match(tpl, /rounds are spent/, `наряд ${pass.toUpperCase()} не называет условие для <question>`)
  }
})

// У ПРОБЕЛА ДВА ИСХОДА, И ОБА ВИДИМЫ. Запретив сдавать пробел в артефакт, легко получить третий путь,
// самый дешёвый для слабой модели, — обойти его молча.
//
// BUG_FIX_CONTEXT: живой прогон eddi 19.08.2026, пятый запуск. С правкой «спроси, а не сдавай» пласт A
// вышел зелёным за круг и БЕЗ единого вопроса: ветка про отсутствующий ключ исчезла, R8 (ссылка на
// глоссарий в конфиге агента) не упомянут ни одним словом — 0 совпадений на bind/attach/reference.
// Предыдущий прогон те же три пробела СДАВАЛ в файл: это стоило Reject на шаге 11, но было ВИДНО.
test("роль и наряд A запрещают обходить пробел молча, а не только сдавать его в файл", () => {
  const role = readFileSync(join(ROOT, "steps/intake/intake.md"), "utf8")
  const a = readFileSync(join(ROOT, "steps/intake/order-a.tpl"), "utf8")
  assert.match(role, /A GAP HAS EXACTLY TWO ENDINGS, AND BOTH ARE VISIBLE/)
  assert.match(role, /WALKING AROUND IT IS NEITHER/)
  assert.match(role, /only the successful course/, "не назван признак, по которому роль узнаёт свой обход")
  assert.match(a, /NEVER WALKED AROUND/, "наряд A не запрещает обход")
})

// `approved` — ЭТО «ОТВЕТ ДОСТАВЛЕН», А НЕ «ОПЕРАТОР СОГЛАСЕН». Решение живёт в тексте ответа, и
// читает его полоса: гейт 1 ждёт `approve · rework · stop`, и у `rework` есть готовая ветка —
// возврат на шаг 6 с пометкой «оператор на гейте 1».
//
// BUG_FIX_CONTEXT: живой прогон eddi 19.08.2026. Полоса впервые дошла до гейта 1 — план из 11 модулей,
// сухая нарезка 16 нарядов. Оператор ответил «rework: R11 не реализовано», курьер прочёл это как
// отказ и вызвал `workflow_respond({approved:false})`; полоса взяла ветку
// `if (decision !== "approved") exit(err("escalate"))` и УМЕРЛА. Ветка `rework` оказалась недостижима
// через курьера в принципе, и стоило это всего прогона.
test("инструкция курьеру различает «ответ доставлен» и «оператор согласен»", () => {
  assert.match(WORKFLOW, /approved:true значит «ОТВЕТ ПОЛУЧЕН И ЗАПИСАН», а НЕ «оператор согласен»/)
  assert.match(WORKFLOW, /Ответил «rework» или «stop»\? Всё равно approved:true/)
  assert.match(WORKFLOW, /approved:false — ТОЛЬКО когда оператор отказался отвечать вовсе/)
  assert.doesNotMatch(WORKFLOW, /Отказ оператора — approved: false\./, "вернулась формулировка, убившая прогон")
})

// ПОЛОСА ОБЯЗАНА РАЗБИРАТЬСЯ. Её никто не импортирует: она исполняется в песочнице хоста, и до этой
// проверки ни один тест не читал файл КАК КОД — швы брали из него срезы регулярками.
//
// BUG_FIX_CONTEXT: 19.08.2026. Правка `answeredBlock` записала в `.join("…")` НАСТОЯЩИЙ перевод
// строки вместо `\n`. Файл перестал быть валидным JavaScript, 568 тестов остались зелёными, и узнать
// об этом можно было только запуском: полоса умерла бы на загрузке, потратив старт сессии и рой.
test("workflows/izi.js — валидный JavaScript, а не только набор строк для регулярок", () => {
  assert.doesNotThrow(() => new Function(`return (async () => {\n${WORKFLOW}\n})`),
    "полоса не разбирается как код — прогон умрёт на загрузке")
})

// ОТМЕТКА ПЕРЕИГРЫВАНИЯ СТАВИТСЯ ОДНИМ ПОМОЩНИКОМ, И ОН СЛЫШИТ ОТКАЗ ЖУРНАЛА.
//
// BUG_FIX_CONTEXT: прогон 5b52f76d (20.08.2026). Четыре места писали эту отметку руками, каждое со
// своим `note: <текст>.slice(0, 80)`. Сухая нарезка вернула двухстрочный блокер, срез оставил в нём
// перенос, писатель журнала отказал, ext бросил исключение — и прогон умер как `crashed` через
// секунды после того, как PLAN.md был собран. Ни одно из четырёх мест отказа не слушало.
test("полоса: переигрывание отмечается помощником rework, а не четырьмя копиями", () => {
  const at = WORKFLOW.indexOf("const rework = async (steps, note)")
  assert.ok(at > 0, "помощника rework нет")
  // Тело помощника вырезается: единственный законный вызов живёт ИМЕННО в нём.
  const outside = WORKFLOW.slice(0, at) + WORKFLOW.slice(WORKFLOW.indexOf("};", at) + 2)
  const hand = [...outside.matchAll(/runlogMark\(\{[^}]*status:\s*"rework"/g)]
  assert.equal(hand.length, 0,
    "отметка переигрывания снова пишется руками — значит отказ журнала снова некому услышать")
  assert.match(WORKFLOW, /if \(m\.why\) log\(/, "отказ журнала не читается — он опять станет крахом полосы")
})

// УДАЛЕНО 21.08.2026 вместе с onePart: правило про адресата блокера жило в порционном разборе
// карточки партии. Карточек нет, порций нет — сторожить нечего. Само правило («суд целого обязан
// быть услышан тем, кто его провалил») переезжает в новый шаг 9 вместе со своим швом.


// СЛОВАРЬ БЛОКОВ НАРЯДА ЗАКРЫТ. Имя блока — это то, ЧТО роль должна с текстом делать, и она обучена
// этим словам всеми нарядами конвейера сразу: `PREVIOUS` — твой прошлый ответ, правь его;
// `FEEDBACK` — почему он вернулся, строки помечены источником; `DATA` — факты для чтения. У блока с
// новым именем такого прошлого нет, и роль читает его как обычный текст.
//
// BUG_FIX_CONTEXT: наряд фиксера шага 10в (19.08.2026) сперва нёс выдуманный `$START_REJECTED` и
// ключ `{FILE}` вместо `{PREVIOUS}`. Замечание о СОБСТВЕННОЙ опечатке роли приезжало в блоке, чьё имя
// ей ничего не говорило, а рядом стоял блок находок с приказом «закрой каждую» — то есть промах
// якорем читался как замечание о плане. Шов слотов↔ключей этого не ловит: он сверяет ИМЕНА КЛЮЧЕЙ,
// а не словарь блоков.
test("наряды говорят словарём харнеса, а не изобретают свои блоки", () => {
  const KNOWN = new Set(["TASK", "DATA", "DOCUMENT", "CONTENT", "CONSTRAINTS", "PREVIOUS", "FEEDBACK",
    "ANSWERED", "SELFCHECK", "OUTPUT", "SKILL", "EXAMPLE"])
  const files = readdirSync(join(ROOT, "steps"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => readdirSync(join(ROOT, "steps", d.name))
      .filter((f) => f.endsWith(".tpl"))
      .map((f) => [`steps/${d.name}/${f}`, readFileSync(join(ROOT, "steps", d.name, f), "utf8")]))
  assert.ok(files.length >= 10, `нарядов найдено ${files.length} — разбор сломался`)

  for (const [name, text] of files) {
    const blocks = [...new Set([...text.matchAll(/\$START_([A-Z_]+)/g)].map((m) => m[1]))]
    const strange = blocks.filter((b) => !KNOWN.has(b))
    assert.deepEqual(strange, [], `${name}: блок вне словаря харнеса — роль не знает, что с ним делать: ${strange.join(", ")}`)
  }
})

// РОЛЬ ОТДАЁТ РАБОТУ ФАЙЛОМ, А НЕ ПОЛЕМ КОНВЕРТА. `ENVELOPE` объявлен с `additionalProperties: false`
// и несёт только рельсу — `track`, `kind`, `subject`, счётчики. Поля с текстом артефакта в нём нет.
//
// BUG_FIX_CONTEXT: луп шага 10в (19.08.2026) читал вердикт критика как `env.text` и патч фиксера как
// `fixed.text`. Оба поля не существуют: вердикт всегда приходил ПУСТЫМ, находок было ноль, и луп на
// каждом прогоне молча говорил «план чист, идём к гейту». Ни один тест этого не видел — стенд
// подставляет свой `agent`, а полосу целиком никто не исполняет.
test("каждая роль отдаёт работу по staging-пути: наряд несёт {STAGING}, полоса его читает", () => {
  const withRole = [...WORKFLOW.matchAll(/sized\(\s*[`"]([^`"]+)[`"]\s*,\s*(\w+)\s*,\s*\{([^}]*)\}/g)]
    .filter((m) => /agent\([\s\S]{0,200}?role: "/.test(WORKFLOW.slice(m.index, m.index + 2600)))
  assert.ok(withRole.length >= 8, `сборок наряда с вызовом роли: ${withRole.length} — разбор сломался`)
  for (const m of withRole) {
    assert.match(m[3], /\bSTAGING\b/, `наряд ${m[1]} не называет роли, куда писать: нет ключа STAGING`)
  }
  // и ни один вызов не читает текст из конверта — его там нет
  assert.equal(/\benv\.text\b|\bfixed\.text\b/.test(WORKFLOW), false,
    "полоса снова читает текст артефакта из конверта, где такого поля нет")
})

// УДАЛЕНО 21.08.2026 вместе с placeValues: величина ставилась в карточку партии после каждой
// правки. Карточек нет; как величина попадает в новый план — решается новым шагом.


// ПРАВКА КОММЕНТАРИЕМ — НЕ ПРАВКА. Роль, которой нечем закрыть блокер, пишет отговорку в
// `<!-- … -->`: формально знак в файле есть, а для всех, кто читает артефакт дальше, его нет.
//
// BUG_FIX_CONTEXT: проигрыш 20.08.2026, два захода подряд. Фиксер получил F13 «ответ оператора не
// потрачен: GET /glossarystore/glossaries/{id}» и оба раза дописал
// `<!-- PENDING: … out of scope -->`. Правило чинено там же (steps/intake/frd.mjs::spentAnswers
// вырезает комментарии), но текст обязан сказать это роли ДО того, как она попробует.
test("наряд фиксера запрещает закрывать находку комментарием", () => {
  const tpl = readFileSync(join(ROOT, "steps/planreview/order.fix.tpl"), "utf8")
  assert.match(tpl, /COMMENT IS NOT AN EDIT/,
    "фиксер не предупреждён, что отговорка в комментарии ничего не закрывает")
})

// РОЛЬ, КОТОРОЙ ВЕЛЕНО ПИСАТЬ ФАЙЛ, ОБЯЗАНА ИМЕТЬ ЧЕМ. Конверт роли текста не несёт (ENVELOPE,
// additionalProperties: false): единственный канал доставки работы — файл по `{STAGING}`. Роль с
// `tools: [read]` физически не может его написать, и полоса получает ПУСТОТУ, неотличимую от
// «работы нет».
//
// BUG_FIX_CONTEXT: живой прогон 20.08.2026. `plan-fixer` шёл с `tools: [read]`; правку он СОЧИНИЛ
// верно и напечатал в чат, `.agent/staging/planfix.txt` остался пуст, `planFix` ответил «the answer
// carries no edit». У `plan-critic` было то же самое, и его пустой вердикт означал бы «находок нет —
// план идёт к гейту»: луп молча пропустил бы неосуждённый план.
test("роль, чей наряд несёт {STAGING}, объявляет инструмент записи", () => {
  // Судим РОЛИ — те имена, которыми полоса зовёт агента. Навык (`steps/review/program-correctness.md`)
  // и перевод для человека ролью не являются: их хост не резолвит и наряда им не шлют.
  const called = new Set([...WORKFLOW.matchAll(/\brole:\s*"([^"]+)"/g)].map((m) => m[1]))
  const dirs = readdirSync(join(ROOT, "steps"), { withFileTypes: true }).filter((d) => d.isDirectory())
  let judged = 0
  for (const d of dirs) {
    const files = readdirSync(join(ROOT, "steps", d.name))
    const staged = files.filter((f) => f.endsWith(".tpl"))
      .some((f) => readFileSync(join(ROOT, "steps", d.name, f), "utf8").includes("{STAGING}"))
    if (!staged) continue
    for (const role of files.filter((f) => f.endsWith(".md") && called.has(f.replace(/\.md$/, "")))) {
      const head = readFileSync(join(ROOT, "steps", d.name, role), "utf8").split("---")[1] || ""
      const tools = (head.match(/^tools:\s*\[([^\]]*)\]/m) || [, ""])[1]
      assert.match(tools, /\bwrite\b/,
        `steps/${d.name}/${role}: наряды среза велят писать по {STAGING}, а роль объявила tools: [${tools}] — работа не доедет никогда`)
      judged++
    }
  }
  assert.ok(judged >= 5, `шов смотрит не туда: судимых ролей ${judged}`)
})

// РОЛЬ ПИШЕТСЯ ПО ОДНОМУ СТАНДАРТУ. `standards/role.md` называет слои, и они не украшение: слабая
// модель делает то, что написано, а не то, что подразумевалось. Роль без `$START_OUTPUT_FORMAT` не
// знает, что у неё есть артефакт; без `$START_STRATEGY` — когда остановиться; без `$START_EXAMPLE` —
// как выглядит правильный ответ.
//
// BUG_FIX_CONTEXT: живой прогон 20.08.2026, два перезапуска. `plan-fixer` и `plan-critic` были
// написаны в три блока — ROLE, LAW, OUTPUT. Наряд велел писать по `{STAGING}`, а роль о записи не
// говорила НИ СЛОВА и ссылалась на «OUTPUT_FORMAT of your ROLE», которого у неё не было. Фиксер
// сочинил правку верно и напечатал её в чат: файл пуст, `planFix` — «the answer carries no edit».
// Инструмент записи роли выдали кругом раньше — не помогло: писать было велено НАРЯДОМ, а роль
// читает СЕБЯ.
test("каждая роль несёт слои standards/role.md", () => {
  const LAYERS = ["ROLE", "LAW", "INPUT", "STRATEGY", "FORBIDDEN", "OUTPUT_FORMAT", "EXAMPLE"]
  const called = new Set([...WORKFLOW.matchAll(/\brole:\s*"([^"]+)"/g)].map((m) => m[1]))
  let judged = 0
  for (const d of readdirSync(join(ROOT, "steps"), { withFileTypes: true }).filter((x) => x.isDirectory())) {
    for (const f of readdirSync(join(ROOT, "steps", d.name)).filter((x) => x.endsWith(".md") && called.has(x.replace(/\.md$/, "")))) {
      const text = readFileSync(join(ROOT, "steps", d.name, f), "utf8")
      for (const l of LAYERS) {
        assert.ok(text.includes(`$START_${l}`), `steps/${d.name}/${f}: нет слоя $START_${l} — роль не сказали, ${
          l === "OUTPUT_FORMAT" ? "что у неё есть артефакт" : l === "STRATEGY" ? "когда остановиться" : "чего от неё ждут"}`)
      }
      judged++
    }
  }
  assert.ok(judged >= 5, `шов смотрит не туда: судимых ролей ${judged}`)
})

// ПРИМЕР — САМАЯ СИЛЬНАЯ ЧАСТЬ РОЛИ ДЛЯ СЛАБОЙ МОДЕЛИ. Роль, которая правит ДВА разных артефакта,
// показанная на одном, учит форме одного — и модель повторяет её на другом.
//
// BUG_FIX_CONTEXT: живой прогон 20.08.2026, круг 1 лупа. Наряд говорил
// «ANCHORED EDITS to .agent/frd.xml», PREVIOUS нёс требование, а единственный пример роли был
// разделом плана (`fields: … Map<…>`). Фиксер вернул якорь ИЗ ПЛАНА — строку, которой в требовании
// нет: `planFix` отказал, круг потрачен впустую. Артефакт уцелел только потому, что правка
// применяется по якорю.
test("фиксер показан на ОБОИХ артефактах, которые правит", () => {
  const role = readFileSync(join(ROOT, "steps/planreview/plan-fixer.md"), "utf8")
  const ex = role.slice(role.indexOf("$START_EXAMPLE"))
  assert.match(ex, /fields:|module:/, "нет примера на ПЛАНЕ")
  assert.match(ex, /<failure|<delta|<scenario/, "нет примера на ТРЕБОВАНИИ — модель повторит форму плана на XML")
  assert.match(role, /SEARCH PREVIOUS for every anchor/,
    "роль не велит проверить якорь по PREVIOUS — промах артефактом останется незамеченным до гардрейла")
})

// РАЗДЕЛ, КОТОРОГО НЕТ, ПИШЕТ ФИКСЕР — И ЭТО НЕ ПОСЛАБЛЕНИЕ, А ЦЕНА. Пересборка шагов 7-9 стоит два
// вызова роли плюс новый круг критика; раздел — часть одной правки. Судит его сухая нарезка: она
// читает РАЗДЕЛЫ плана, и дописанный режется в наряд наравне с рождённым сборкой.
test("фиксер умеет дописать раздел и показан на этом", () => {
  const role = readFileSync(join(ROOT, "steps/planreview/plan-fixer.md"), "utf8")
  const tpl = readFileSync(join(ROOT, "steps/planreview/order.fix.tpl"), "utf8")
  assert.equal(/You do not create sections/.test(role), false, "роли всё ещё запрещено писать раздел")
  assert.match(role, /WRITING THAT SECTION/, "роль не сказали, чем закрывается находка без раздела")
  assert.match(role.slice(role.indexOf("$START_EXAMPLE")), /## src\//, "нет примера дописанного раздела")
  assert.match(role, /ADDRESS BOOK|address book/, "путь нового раздела берётся не из книги")
  assert.match(tpl, /closed by writing that section/, "наряд не говорит, как закрыть находку без раздела")
})

// АДРЕС НАХОДКИ — ПУТЬ, И ЭТО НЕ СТИЛЬ, А МАРШРУТ. По второму полю строки машина решает, где чинить:
// раздел плана — правкой карточки, файл без раздела — усыновлением в требование. Поле, которое не
// разбирается в путь, уводит находку не в тот артефакт.
//
// BUG_FIX_CONTEXT: прогон da99bbae (20.08.2026), круг 1. Критик написал
// `R11 | PLAN LOST | (no such module) | agent configuration model change …`: пути в строке нет
// вовсе, и находка про модуль, которого нет в плане, уехала фиксеру ПЛАНА вместо требования.
test("критик получает адресную книгу и обязан называть путь", () => {
  const tpl = readFileSync(join(ROOT, "steps/planreview/order.tpl"), "utf8")
  const role = readFileSync(join(ROOT, "steps/planreview/plan-critic.md"), "utf8")
  assert.match(tpl, /\{KNOWN\}/, "у критика нет адресной книги — путь взять неоткуда")
  assert.match(tpl, /Never `\(no such module\)`/, "наряд не запрещает безадресную находку")
  assert.match(tpl, /R<number> \| PLAN LOST\s+\| <path of the module>/, "схема наряда всё ещё просит «модуль», а не путь")
  assert.match(role, /an address is a PATH/, "роль не сказала, что адрес — это путь")
  assert.match(role.slice(role.indexOf("$START_EXAMPLE")), /\(no such module\)/,
    "нет примера НЕПРАВИЛЬНОЙ безадресной находки")
  assert.match(WORKFLOW, /KNOWN: src\.known,/, "полоса не подставляет книгу в наряд критика")
})

// Роль обязана знать, что `INSERT AFTER` наследует отступ якоря: заголовок раздела с пробелами
// слева — не раздел (прогон 7d8e36b5, работа по R11 стала текстом внутри соседа).
test("фиксеру сказано ставить заголовок раздела на нулевую колонку", () => {
  const role = readFileSync(join(ROOT, "steps/planreview/plan-fixer.md"), "utf8")
  const tpl = readFileSync(join(ROOT, "steps/planreview/order.fix.tpl"), "utf8")
  assert.match(role, /COLUMN ZERO/, "роль не предупреждена про отступ")
  assert.match(tpl, /COLUMN ZERO/, "наряд не предупреждён про отступ")
  const ex = role.slice(role.indexOf("$START_EXAMPLE"))
  assert.match(ex, /column zero IN THE FILE/, "пример не объясняет, что отступ примера — не отступ файла")
})

// ПОКРЫТИЕ — РАЗДЕЛ СВОЕГО МОДУЛЯ, а не слова о нём внутри чужого. Нарезка режет ПО РАЗДЕЛАМ:
// работа, описанная под чужим заголовком, наряда не получит.
//
// BUG_FIX_CONTEXT: прогон 7d8e36b5 (20.08.2026). Раздел про `AgentConfiguration.java` оказался с
// отступом внутри соседнего — и следующий круг критика, увидев в плане слова `boundGlossaryIds` и
// `closes: R11`, промолчал: план ушёл на гейт с работой, которую никто не нарежет.
test("критик знает, что покрытие — это раздел, а не упоминание", () => {
  const role = readFileSync(join(ROOT, "steps/planreview/plan-critic.md"), "utf8")
  const tpl = readFileSync(join(ROOT, "steps/planreview/order.tpl"), "utf8")
  assert.match(role, /THAT MODULE'S OWN SECTION/, "роль засчитает упоминание за покрытие")
  assert.match(tpl, /Coverage is a SECTION OF ITS OWN/, "наряд не говорит, что покрытие — раздел")
})

// УДАЛЕНО 21.08.2026 вместе с steps/design/order-part.tpl: наряда карточки партии не существует.


// ВАЖНОЕ ПРАВИЛО СТОИТ В НАЧАЛЕ И ПОВТОРЕНО В КОНЦЕ. Слабая модель читает голову и хвост наряда,
// середину — по диагонали: правило, лежащее только в `$START_CONSTRAINTS`, для неё всё равно что
// не написано.
//
// BUG_FIX_CONTEXT: живой прогон 20.08.2026, две попытки подряд. Правило про экранирование XML
// стояло в середине наряда values и в тексте роли — и роль дважды написала
// `text="create(List<T> configs)"` вместо `text="create(List&lt;T&gt; configs)"`. Сырой «<»
// заканчивает элемент, и строка исчезает для парсера: словарь терял значение молча.
test("важное правило наряда стоит в начале И повторено в конце", () => {
  const block = (text, name) =>
    (text.match(new RegExp(`\\$START_${name}[\\s\\S]*?\\$END_${name}`)) || [""])[0]

  // Наряд цепочек удалён вместе со старым шагом 9 (docs/plan.md); словарь значений припаркован и
  // правило про экранирование в нём сторожится по-прежнему — материал переживает переделку.
  for (const tpl of ["steps/design/order-values.tpl"]) {
    const text = readFileSync(join(ROOT, tpl), "utf8")
    const task = block(text, "TASK")
    const output = block(text, "OUTPUT")
    assert.ok(task, `${tpl}: не нашёлся блок TASK — шов смотрит не туда`)
    assert.ok(output, `${tpl}: не нашёлся блок OUTPUT — шов смотрит не туда`)

    assert.ok(task.includes("&lt;"),
      `${tpl}: правила про экранирование нет в НАЧАЛЕ наряда — середину роль читает по диагонали`)
    assert.ok(output.includes("&lt;"),
      `${tpl}: правило про экранирование не повторено в КОНЦЕ наряда — последнее, что роль прочтёт, о нём молчит`)
  }
})
