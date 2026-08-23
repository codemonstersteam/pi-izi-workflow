// АВТОПРОВЕРКИ ДИЗАЙНА. Тикет T09. По шву на правило standards/workflow-design.md.
// Правила 3, 7, 10, 12 (словарь, размер головы, литеральный рой, имена ролей) живут в
// ext/vocabulary.test.mjs — они про ПОЛОСУ; здесь то, что про ШАГ.
//
// Шов сторожит СМЫСЛ правила, а не его формулировку: роль и наряд меняют язык по мере созревания
// (standards/role.md §5), и шов, привязанный к русской фразе, краснеет на переводе — это отметка о
// ревизии, а не дефект.
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs"
import { join, dirname, basename } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const rel = (p) => p.replace(`${ROOT}/`, "")

const walk = (dir, hit, out = []) => {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, hit, out)
    else if (hit(e.name)) out.push(p)
  }
  return out
}
const steps = () => walk(join(ROOT, "steps"), (n) => n.endsWith(".step.mjs"))

// Тело функции верхнего уровня по имени — грубо, но достаточно: шов ищет ВЫЗОВЫ, а не разбирает AST.
const bodyOf = (text, name) => {
  const i = text.search(new RegExp(`export (?:function|const) ${name}\\b`))
  if (i < 0) return ""
  const rest = text.slice(i)
  const end = rest.search(/\n(?:export |\/\/ FUNCTION_CONTRACT|\/\/ MODULE_CONTRACT)/)
  return end < 0 ? rest : rest.slice(0, end)
}

test("шов 1: шаг выставляет РОВНО id, next, fold", () => {
  assert.ok(steps().length, "модулей шагов не найдено — шов ослеп")
  for (const f of steps()) {
    const names = [...readFileSync(f, "utf8").matchAll(/^export (?:const|function|async function) (\w+)/gm)].map(([, n]) => n)
    assert.deepEqual([...names].sort(), ["fold", "id", "next"],
      `${rel(f)} выставляет ${names.join(", ")} — третий экспорт значит, что кишки шага зовут мимо его головы`)
  }
})

test("шов 2: next не зовёт модель и не продвигает — пишет только подготовку доставки", () => {
  for (const f of steps()) {
    const body = bodyOf(readFileSync(f, "utf8"), "next")
    assert.ok(body, `${rel(f)}: next не найден`)
    for (const bad of ["agent(", "promote(", "writeFileSync(", "checkpoint("]) {
      assert.ok(!body.includes(bad), `${rel(f)}: next зовёт ${bad} — решение и действие смешались`)
    }
    // rmSync законен: чистка пути доставки — это подготовка, а не запись состояния.
  }
})

test("шов 4: fold кладёт вердикт хода в состояние", () => {
  for (const f of steps()) {
    const text = readFileSync(f, "utf8")
    if (!/do: "role"/.test(text)) continue                      // шаг без роли судить нечего
    assert.match(text, /verdicts:\s*\[\.\.\.state\.verdicts,/,
      `${rel(f)}: fold не дописывает вердикт хода — «артефакт лёг» перестанет означать «гардрейл принял»`)
    assert.match(text, /newVerdict\(|verdict\(\{/, `${rel(f)}: вердикт строится не конструктором`)
  }
})

test("шов 5: артефакт продвигается только из route и только после зелёного вердикта", () => {
  for (const f of steps()) {
    const dir = dirname(f)
    const text = readFileSync(f, "utf8")
    if (!text.includes("promote")) continue
    assert.ok(existsSync(join(dir, "route.mjs")), `${rel(f)}: продвижение есть, а route.mjs нет`)
    const route = readFileSync(join(dir, "route.mjs"), "utf8")
    assert.match(route, /export function promote/, `${rel(dir)}/route.mjs не владеет продвижением`)
    // ПРОДВИЖЕНИЕ ПОСЛЕ СУДА, и шов проверяет ПРАВИЛО, а не форму конкретного шага: у одного шага
    // суд целого живёт в отдельной функции, у другого — прямо в fold. Общее одно: КАЖДЫЙ вызов
    // promote стоит ПОЗЖЕ ближайшей охраны `if (blockers)`, которая возвращает управление.
    const guards = [...text.matchAll(/if \(blockers\)/g)].map((m) => m.index)
    assert.ok(guards.length, `${rel(f)}: продвижение есть, а охраны «if (blockers)» нет — артефакт ляжет с любым вердиктом`)
    for (const m of text.matchAll(/\bpromote\(/g)) {
      if (text.slice(Math.max(0, m.index - 60), m.index).includes("import")) continue
      assert.ok(guards.some((g) => g < m.index),
        `${rel(f)}: promote на позиции ${m.index} стоит раньше любой охраны по блокерам — артефакт может лечь с красным вердиктом`)
    }
  }
})

test("шов 6: в состоянии нет документов шага", () => {
  const shape = readFileSync(join(ROOT, "ext", "state.mjs"), "utf8")
  const fields = [...shape.matchAll(/return ok\(\{([^}]*)\}\)/g)].map(([, f]) => f).join(" ")
  for (const k of ["text", "xml", "answer", "order", "body", "content"]) {
    assert.ok(!new RegExp(`\\b${k}:`).test(fields), `в форме состояния есть поле «${k}» — документ поехал по RPC`)
  }
  // Блокеры — диагностика, а не документ, и живут в состоянии намеренно: без них наряд починки пуст.
  assert.match(fields, /verdicts/, "вердикты обязаны быть в состоянии")
})

test("шов 8: у каждого шага есть компонентный тест", () => {
  for (const f of steps()) {
    const dir = dirname(f)
    const head = readFileSync(f, "utf8").includes("// голова")
    if (head) continue
    const c = join(dir, "component")
    assert.ok(existsSync(c) && statSync(c).isDirectory(), `${rel(f)}: нет component/ — шаг доказывается только живым прогоном`)
    assert.ok(readdirSync(c).some((n) => n.endsWith(".component.test.mjs")), `${rel(c)}: каталог есть, теста нет`)
  }
})

test("шов 9: пятёрка тотальна — судья ЕСТ мусор и возвращает вердикт, а не бросает", async () => {
  // Шов ПОВЕДЕНЧЕСКИЙ, а не текстовый. Первая версия искала в файле слово «invalid» и не краснела,
  // когда ветвь удаляли: слово оставалось в комментарии. Шов, который нельзя покрасить, — комментарий.
  const GARBAGE = [
    "", "   \n\n  ",
    "Извините, я не смог построить дерево: требование неоднозначно.",
    "<tree task=\"X\"><module path=",                       // оборван на середине
    "{\"track\":\"ok\"}",                                    // роль вернула конверт вместо артефакта
    "\u0000\u0001 \\ ]]> <![CDATA[",                          // просто мусор
  ]
  let judged = 0
  for (const f of steps()) {
    const judge = join(dirname(f), "judge.mjs")
    if (!existsSync(judge)) continue
    // ТОЛЬКО СУДЬИ МОДЕЛЬНОГО АРТЕФАКТА. У шага без роли (task) судья судит текст ЧЕЛОВЕКА, и проза
    // там — законный вход, а не мусор. Требовать от него блокера на «Извините, я не смог» значит
    // требовать отбивать нормальную задачу. Правило тотальности при этом остаётся общим — оно ниже,
    // в assert.doesNotThrow, — а «не молчи на мусор» касается того, кто читает ответ модели.
    if (!/do: "roles?"/.test(readFileSync(f, "utf8"))) continue
    const mod = await import(judge)
    for (const [name, fn] of Object.entries(mod)) {
      if (typeof fn !== "function" || !/^judge/.test(name)) continue
      for (const bad of GARBAGE) {
        let out
        assert.doesNotThrow(() => { out = fn({ text: bad, mine: ["src/A.java"], kin: [], known: [], frd: {} }) },
          `${rel(judge)}::${name} БРОСИЛ на «${bad.slice(0, 24)}» — исключение уйдёт через границу процессов мимо всей ROP-цепочки`)
        assert.ok(Array.isArray(out), `${rel(judge)}::${name} вернул не список блокеров`)
        assert.ok(out.length > 0, `${rel(judge)}::${name} ПРОМОЛЧАЛ на «${bad.slice(0, 24)}» — мусор проехал суд`)
        judged += 1
      }
    }
  }
  assert.ok(judged > 0, "ни один судья не проверен — шов ослеп")
})

test("шов 11: next первым делом судит СВОЙ вход", () => {
  for (const f of steps()) {
    const dir = dirname(f)
    assert.ok(existsSync(join(dir, "inputs.mjs")), `${rel(f)}: нет inputs.mjs — «вход зелен» останется комментарием`)
    const body = bodyOf(readFileSync(f, "utf8"), "next")
    const first = body.split("\n").find((l) => /^\s{2}\w/.test(l) && !l.trim().startsWith("//"))
    assert.match(first || "", /inputs\(state\)/,
      `${rel(f)}: первый ход next — не суд входа, а «${(first || "").trim()}»`)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// ТИКЕТ T09. Пять швов на правила ПЕРЕДЕЛКИ ШАГА 2 (brd-backlog.md, T09). Правила выше — про ФОРМУ
// шага (standards/workflow-design.md); эти — про то, что переделка ввела сверх формы: артефакт со
// названным потребителем, счёт в одном месте, судья против наряда своей роли, наряд без дыр,
// селективность, которая СЧИТАЕТСЯ, а не описана.
//
// Каждый шов читает ФАЙЛЫ и судит их состав; модель в них не участвует. Каждый обязан называть ОБЕ
// стороны расхождения — иначе находка не чинится: «судья требует X» без «а наряд его не просит»
// заставляет искать вторую половину руками.

const read = (p) => readFileSync(p, "utf8")
const BRD = join(ROOT, "steps", "brd")

// Подшаги шага 2 — каталоги при головах `steps/brd/**/*.step.mjs`.
const brdDirs = () => steps().filter((f) => f.startsWith(`${BRD}/`)).map(dirname)

// ЧТО ШАГ ПИШЕТ НА ДИСК, взято из КОДА, а не из документа: `route.mjs` — единственное место
// продвижения (шов 5), и `writeFileSync(join(cwd, X))` там называет константу пути. Значение
// константы читается из `steps/brd/paths.mjs` — второго списка путей у шага нет.
const pathValues = () => Object.fromEntries(
  [...read(join(BRD, "paths.mjs")).matchAll(/export const (\w+)\s*=\s*"([^"]+)"/g)].map(([, n, v]) => [n, v]))

// АРТЕФАКТ РОЛИ И АРТЕФАКТ СКРИПТА РАЗЛИЧАЮТСЯ, и различает их `promote`: то, что ложится через
// продвижение, роль написала своими полями (`verdict`, `subjects[]`), и в таблице потребителей оно
// законно стоит по полю. Всё, что route пишет ПОМИМО продвижения (карта обхода), полей не имеет и
// обязано быть названо ПУТЁМ — иначе строка о чужом поле молча закрывает дыру.
const artifactsOf = (dir) => {
  const P = pathValues()
  const out = []
  for (const r of walk(dir, (n) => n === "route.mjs")) {
    const text = read(r)
    const promoted = bodyOf(text, "promote")
    for (const m of text.matchAll(/writeFileSync\(join\([^,]+,\s*(\w+)\s*\)/g)) {
      if (!P[m[1]] || P[m[1]].includes("/staging/")) continue
      out.push({ path: P[m[1]], at: r, role: promoted.includes(`, ${m[1]})`) })
    }
  }
  return out
}

// Модули подшага, которые СУДЯТ: `judge*` по имени файла либо по экспортированной функции.
const judgesOf = (dir) => walk(dir, (n) => n.endsWith(".mjs") && !n.includes(".test."))
  .filter((f) => /(^|\/)judge/.test(f.slice(dir.length)) || /export (?:function|const) judge\w*/.test(read(f)))

// ПОЛЯ АРТЕФАКТА, КОТОРЫХ ТРЕБУЕТ СУДЬЯ — из двух мест и оба формальны:
//   · голова блокера по standards/guardrail.md — `<код правила> <ЭЛЕМЕНТ>: …`;
//   · регулярка разбора строки артефакта — `/^\s*<поле>\s*:/`.
// Артефакт не строчного вида (XML шагов 9А-9В) полей так не даёт, и шов на нём МОЛЧИТ — судить
// нечего, а не «зелено».
const fieldsOf = (dir) => {
  const out = new Map()
  for (const f of judgesOf(dir)) {
    const t = read(f)
    for (const m of t.matchAll(/["'`]\s*[A-Z]\d+[a-z]?\s+([A-Za-z][\w-]*(?:\[\s*\])?)\s*:/g)) if (!out.has(m[1])) out.set(m[1], f)
    for (const m of t.matchAll(/\/\^\\s\*([a-zA-Z][\w-]*)\\s\*:/g)) if (!out.has(m[1])) out.set(m[1], f)
  }
  return out
}

// ТАБЛИЦА ПОТРЕБИТЕЛЕЙ. Тикет называет `steps/data-flow.md`; физически раздел «Что уходит дальше»
// стоит в `steps/brd/data-flow.md`, и оба документа — поток одной и той же полосы. Шов сторожит
// ПРАВИЛО (у артефакта назван потребитель), а не адрес файла, поэтому читает оба и краснеет, только
// если раздела нет НИГДЕ.
const FLOW_DOCS = [join(ROOT, "steps", "data-flow.md"), join(BRD, "data-flow.md")]
const CONSUMERS = "Что уходит дальше"
const consumerTable = () => {
  for (const doc of FLOW_DOCS) {
    if (!existsSync(doc)) continue
    const text = read(doc)
    const i = text.indexOf(`## ${CONSUMERS}`)
    if (i < 0) continue
    const rows = text.slice(i).split(/\n## /)[0].split("\n")
      .filter((l) => l.trim().startsWith("|"))
      .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()))
      .filter((c) => c.length >= 2 && !/^[-: ]+$/.test(c[0]))
    return { doc, rows }
  }
  return { doc: null, rows: [] }
}

test("шов S1: у каждого артефакта шага 2 назван потребитель", () => {
  const { doc, rows } = consumerTable()
  assert.ok(doc, `раздела «${CONSUMERS}» нет ни в ${rel(FLOW_DOCS[0])}, ни в ${rel(FLOW_DOCS[1])} — шов ослеп: артефакты есть, а сверять их не с чем`)
  assert.ok(rows.length > 1, `${rel(doc)}: раздел «${CONSUMERS}» есть, а строк в таблице нет`)
  let checked = 0
  for (const dir of brdDirs()) {
    // Имя артефакта в таблице — либо ПУТЬ, либо ПОЛЕ этого артефакта: `.agent/brd.md` уезжает
    // дальше по частям (`subjects[]` в шаг 3, `R1..Rn` в шаг 11), и строка на поле — это тот же
    // названный потребитель, а не поблажка. Поля берутся из судьи, а не из головы автора шва.
    const aliases = [...fieldsOf(dir).keys()]
    for (const a of artifactsOf(dir)) {
      const keys = a.role ? [a.path, ...aliases] : [a.path]
      const row = rows.find((c) => keys.some((k) => c[0].includes(k)))
      assert.ok(row, `${a.path} пишется в ${rel(a.at)}, а строки о нём в таблице «${CONSUMERS}» (${rel(doc)}) нет: артефакт есть в коде, потребителя нет в документе — впиши строку «${a.path} | <шаг-потребитель> | <во что превращается>»`)
      assert.ok(row[1], `${rel(doc)}, строка «${row[0]}»: колонка потребителя пуста — артефакт ${a.path} уезжает в никуда`)
      checked += 1
    }
  }
  assert.ok(checked >= 2, `шов ослеп: у шага 2 найдено артефактов ${checked} — разбор route.mjs перестал их видеть`)
})

test("шов S2: подстрочный грeп по дереву репозитория живёт в ОДНОМ месте", () => {
  // ГРЕП ОПОЗНАЁТСЯ ПО СОСТАВУ, А НЕ ПО ИМЕНИ ФУНКЦИИ: обход каталогов + чтение содержимого +
  // подстрочное сравнение. Это ровно та работа, которую шаг 2 делает один раз и кладёт в
  // `.agent/anchors.json`; повторить её у себя — значит считать заново посчитанное и разойтись с
  // ним в числах (замер: поиск мест ПО ПУТЯМ находил 1 файл эталона из 10, греп по тексту — 10).
  const mods = walk(join(ROOT, "steps"), (n) => n.endsWith(".mjs") && !n.includes(".test."))
    .filter((f) => { const t = read(f); return /readdirSync/.test(t) && /readFileSync\(/.test(t) && /\.includes\(/.test(t) })
  assert.ok(mods.length, "ни один модуль дерева не грепает — шов ослеп: так шаг 2 работать не может")
  const home = mods.filter((f) => f.startsWith(`${BRD}/`)).map(rel)
  assert.ok(home.length, `грeп по дереву есть, но в ${rel(BRD)} его нет — счёт уехал из шага, который им владеет`)
  for (const f of mods) {
    assert.ok(f.startsWith(`${BRD}/`),
      `${rel(f)} обходит дерево и грепает его текст заново — это уже посчитано шагом 2 (${home.join(" · ")}) и лежит в .agent/anchors.json: читай артефакт, а не считай второй раз`)
  }
})

test("шов S3: судья не требует поля, которого нет в форме артефакта его роли", () => {
  // КЛАСС ДЕФЕКТА, ПРОЖИТЫЙ РУКАМИ: гардрейл требовал `fit:` и `verify:`, а наряд роли этих строк
  // не просил. По отдельности обе стороны зелены — юнит судьи проходит, наряд собирается, — и
  // расхождение видно только отсюда: роль физически не может закрыть блокер про поле, о котором ей
  // не сказали.
  let checked = 0
  for (const f of steps()) {
    const dir = dirname(f)
    if (!/do: "roles?"/.test(read(f))) continue                    // шаг без роли — наряда нет
    const tpls = walk(dir, (n) => n.endsWith(".tpl") && !n.endsWith(".fix.tpl"))
    if (!tpls.length) continue                                     // отсутствие наряда судит шов S4
    const shown = tpls.map(read).join("\n")
    for (const [field, at] of fieldsOf(dir)) {
      assert.ok(shown.includes(field),
        `${rel(at)} требует от артефакта поле «${field}», а наряд ${tpls.map(rel).join(" · ")} его не просит — роль о нём не знает и закрыть блокер ей нечем: либо впиши «${field}: …» в FORM наряда, либо сними правило`)
      checked += 1
    }
    // ФОРМА, ОБЪЯВЛЕННАЯ СУДЬЁЙ, ПОКАЗЫВАЕТСЯ РОЛИ ДОСЛОВНО. `export const FORM` — это то, по чему
    // судья считает колонки; наряд обязан показывать ТУ ЖЕ строку, а не её пересказ.
    for (const m of walk(dir, (n) => n.endsWith(".mjs") && !n.includes(".test.")).flatMap((mod) =>
      [...read(mod).matchAll(/export const FORM\s*=\s*"([^"]+)"/g)].map((x) => [x[1], mod]))) {
      assert.ok(shown.includes(m[0]),
        `${rel(m[1])} судит по форме «${m[0]}», а наряд ${tpls.map(rel).join(" · ")} показывает роли другую — форма подставляется из судьи, а не переписывается`)
      checked += 1
    }
  }
  assert.ok(checked > 0, "ни одно поле не сверено — шов ослеп: разбор блокеров и форм перестал их находить")
})

test("шов S4: у подшага с ролью свой наряд, и слот в нём заполнен", () => {
  for (const f of steps()) {
    const dir = dirname(f)
    if (!/do: "roles?"/.test(read(f))) continue
    const tpls = walk(dir, (n) => n.endsWith(".tpl"))
    assert.ok(tpls.length, `${rel(f)}: подшаг зовёт роль, а наряда в ${rel(dir)} нет — инструкция уедет из чужого каталога либо из головы модели`)
    const orders = walk(dir, (n) => /^order.*\.mjs$/.test(n) && !n.includes(".test."))
    assert.ok(orders.length, `${rel(dir)}: наряды есть (${tpls.map(rel).join(" · ")}), а сборщика order.mjs нет — слоты некому подставлять`)
    const code = orders.map(read).join("\n")
    for (const t of tpls) {
      for (const slot of [...new Set([...read(t).matchAll(/\{([A-Z_]+)\}/g)].map((m) => m[1]))]) {
        assert.ok(code.includes(slot),
          `${rel(t)} просит слот {${slot}}, а ${orders.map(rel).join(" · ")} его не кладёт — в собранном наряде останется «{${slot}}», и роль будет выдумывать данные вместо него`)
      }
    }
    // НЕПОДСТАВЛЕННЫЙ СЛОТ — ОТКАЗ, А НЕ ПУСТОТА. Проверка остатка живёт в сборщике: наряд с дырой
    // не должен доехать до роли ни при каком входе.
    assert.ok(code.includes("([A-Z_]+)"),
      `${orders.map(rel).join(" · ")}: остаток слотов не проверяется — наряд с «{SLOT}» уедет роли молча`)
    assert.match(code, /return \{ why: `[^`]*слот/,
      `${orders.map(rel).join(" · ")}: остаток слотов найден, но это не ОТКАЗ — наряд с дырой обязан вернуть { why }, а не текст`)
  }
})

// ШОВ S5 СНЯТ 23.08.2026 ВМЕСТЕ С ПРАВИЛОМ. Селективность судила ДОЛЮ помеченных файлов, а якорь
// отвечает на другой вопрос — лежит ли здесь работа. Замер на eddi показал, что доля этих двух
// вопросов не разделяет: нужный якорь `agent` метит 48,3% дерева и стоит вплотную между фоновыми
// `value` (51,8%) и `type` (46,0%). Любой порог либо выбрасывает нужное, либо пропускает фон — это
// дефект признака, а не калибровки. Правило вернётся, когда будет мерить ДОМ слова (в каком пакете
// собраны помеченные файлы), и калибровать его будет вторая задача с эталоном, а не одна.
