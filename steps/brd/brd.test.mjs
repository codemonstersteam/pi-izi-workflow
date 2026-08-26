// Артефакт шага 2 как значение: как он читается (`parseBrd`, `analogueTerm`) и что в тексте
// считается числом (`numbersIn` — провенанс, его судит шаг 6).
//
// Юниты `numbersIn` перенесены сюда БЕЗ ПРАВОК из прежнего теста ядра: каждый куплен живым
// прогоном, и переписывать их вместе с ролью `gilb` было бы потерей улик.
import test from "node:test"
import assert from "node:assert/strict"
import { numbersIn, parseBrd, analogueTerm, closedSets } from "./brd.mjs"
import { parseRows } from "./normalize/normalize.mjs"

// --- numbersIn: обозначение формата против числа-меры -----------------------------------------------
//
// FOUND BY LIVE RUN S11 (booking task): `fit: … (ISO-8601)` read `8601` as a number-magnitude,
// demanded a source that exists neither in the task nor in the answers, and the role got
// `invented-default` for a format it never invented.

test("decimals and leading zeros are normalized", () => {
  assert.deepEqual([...numbersIn("0.5 · 007 · 1,5")].sort(), ["0.5", "1.5", "7"])
})

test("format designations are not number-magnitudes", () => {
  for (const s of ["ISO-8601", "UTF-8", "SHA-256", "RFC 3339", "base64", "p95"]) {
    assert.deepEqual([...numbersIn(s)], [], `${s} не должен дать число`)
  }
})

test("number-magnitudes remain numbers next to any words", () => {
  assert.deepEqual([...numbersIn("20")], ["20"])
  assert.deepEqual([...numbersIn("90 дней")], ["90"])
  assert.deepEqual([...numbersIn("1..100")].sort(), ["1", "100"])
  assert.deepEqual([...numbersIn("не более 20")], ["20"])
  assert.deepEqual([...numbersIn("300ms")], ["300"]) // a unit suffix AFTER the number is not adjacency
})

// РЕГУЛЯРКА — НЕ ИСТОЧНИК ЧИСЕЛ, И ЭТО ТУПИК, А НЕ НЕТОЧНОСТЬ.
//
// Живой прогон eddi 19.08.2026: роль написала домен ключа термина верно — `^[a-z0-9_]{1,64}$`, —
// а провенанс прочитал квантор `{1,64}` как число «1.64» и класс `a-z0-9` как «9». Блокер обвинил
// роль в значении, которого в артефакте НЕТ: починить его нечем, кроме удаления правильной
// регулярки. Верни `[…]`/`{…}` в разбор — и тупик вернётся вместе с ними.
test("numbersIn: цифры внутри класса символов и квантора мерой не считаются", () => {
  assert.deepEqual([...numbersIn("^[a-z0-9_]{1,64}$")], [])
  assert.deepEqual([...numbersIn("[0-9]{3}")], [])
  // Число в ПРОЗЕ рядом с регуляркой по-прежнему видно: правило не ослаблено, сужено.
  assert.deepEqual([...numbersIn("^[a-z]+$ до 64 символов")], ["64"])
  assert.deepEqual([...numbersIn("1,5 сек")], ["1.5"])
})

test("numbersIn МОЛЧАНИЕ: текста нет — пустое множество, а не отказ", () => {
  assert.deepEqual([...numbersIn(undefined)], [])
  assert.deepEqual([...numbersIn("")], [])
})

// --- parseBrd: разбор артефакта подшага 2C -----------------------------------------------------------
//
// ФОРМА АРТЕФАКТА ИЗМЕНИЛАСЬ (тикет A05): его собирает СКРИПТ
// (`steps/brd/anchors/assemble.mjs`) из трёх частей — R-строк, `analogue:` и `subjects[]`. Строк
// `verdict:` и `open-questions:` в нём нет, и разбирать их больше нечем: поля сняты тикетом A06.
// Номер `R<n>` РАВЕН номеру строки `.agent/normalized.md`, а текст `R<n>` — сама строка таблицы.

const DOC = [
  "R1 add | Glossary | configuration type | dictionary of bot terms, CRUD with versioning",
  "R2 constrain | Term key | format | up to 64 characters, lowercase,",
  "   alphanumeric and underscore",
  "analogue: PromptSnippet — the existing configuration type the new one is modelled on",
  "subjects[]: Glossary · terms · PromptSnippet",
].join("\n")

test("parseBrd happy: требования с адресом строкой таблицы, аналог и якоря", () => {
  const d = parseBrd(DOC)
  assert.equal(d.requirements.length, 2)
  assert.equal(d.requirements[0].id, "R1")
  assert.equal(d.requirements[0].line, 1, "адрес требования — номер строки, по нему чинит наряд починки")
  assert.match(d.requirements[1].statement, /alphanumeric and underscore$/, "перенос строки не подклеился к формулировке")
  assert.equal(d.analogue, "PromptSnippet — the existing configuration type the new one is modelled on")
  assert.deepEqual(d.subjects, ["Glossary", "terms", "PromptSnippet"])
})

// КРУГЛЫЙ ХОД ЧЕРЕЗ ФОРМАТ ТАБЛИЦЫ. `R<n>` — это строка `.agent/normalized.md`, скопированная
// целиком, и в этом весь выигрыш тикета A06: значение требования едет ВМЕСТЕ с требованием, а не
// ищется по смыслу в соседнем файле. Читается оно тем единственным разбором, который знает, что
// такое строка, — `normalize.mjs::parseRows`. Сломай копирование в `assemble.mjs::numbered` или
// склей в `parseBrd` лишнюю строку — колонка `values` разъедется здесь.
test("parseBrd: текст требования — строка таблицы, из него читаются колонки со значениями", () => {
  const d = parseBrd(DOC)
  const [row] = parseRows(d.requirements[0].statement)
  assert.equal(row.verb, "add")
  assert.equal(row.object, "Glossary")
  assert.equal(row.instrument, "configuration type")
  assert.equal(row.values, "dictionary of bot terms, CRUD with versioning")
})

// «Строки нет» и «строка пуста» — находки РАЗНЫХ правил, и парсер обязан их различать
// (standards/code.md, ограничение 2: отсутствие — это случай, а не пустое значение).
test("parseBrd: строки, которой не было, — null, а не пустое значение", () => {
  const d = parseBrd("R1 что-то одно")
  assert.equal(d.analogue, null)
  assert.equal(d.subjects, null)
})

test("parseBrd МОЛЧАНИЕ: текста нет — пустой разбор, а не исключение", () => {
  const d = parseBrd(undefined)
  assert.deepEqual(d.requirements, [])
  assert.equal(d.analogue, null)
  assert.equal(d.subjects, null)
})

// --- analogueTerm: грепаемая голова строки -------------------------------------------------------------
//
// BUG_FIX_CONTEXT: eddi. Роль написала `analogue: Prompt Snippet (PromptSnippetService, …) — по
// образцу него`, шаг 3б искал в репозитории ВСЮ строку и не нашёл ничего: фокус упал до 1 файла из 10.
test("analogueTerm: имя до тире, объявленное отсутствие даёт пустую строку", () => {
  assert.equal(analogueTerm("PromptSnippet — CRUD и версионирование по его образцу"), "PromptSnippet")
  assert.equal(analogueTerm("none — ничего похожего нет"), "")
  assert.equal(analogueTerm(null), "")
})

// T54 — ЗАМКНУТЫЕ ПЕРЕЧИСЛЕНИЯ. Эталон живого прогона несёт три «only»: R7 и R13 — перечни полей
// (их читает F16 шага 6), R11 — «only for glossaries bound» — перечень НЕ поля, и регулярка его
// не берёт: список после «only» связан « + », а не пробелом. Молчание здесь честнее шума.
test("closedSets: перечень полей после «only … + …» вынут дословно; не-перечень и пустота молчат", () => {
  const etalon = [
    "R7 define | Term | Glossary | only key + value, no description, no category",
    "R11 constrain | substitution scope | Glossary | only for glossaries bound to agent, no global",
    "R13 define | Glossary fields | Glossary resource | only id + version + terms",
  ].join("\n")
  const sets = closedSets(etalon)
  assert.equal(sets.length, 2, "R11 — не перечень полей: список не связан « + »")
  assert.deepEqual(sets[0], { req: "R7", line: 1, entity: "Term", names: new Set(["key", "value"]) })
  assert.deepEqual(sets[1], { req: "R13", line: 3, entity: "Glossary fields", names: new Set(["id", "version", "terms"]) })

  assert.deepEqual(closedSets(""), [], "пустой brd — пустой ответ, не ошибка")
  assert.deepEqual(closedSets("R1 add | Glossary | new type | dictionary of terms"), [],
    "«only» нет — правило молчит: перечень замкнуло требование, не суд")
})
