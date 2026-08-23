// Артефакт шага 2 как значение: как он читается (`parseBrd`, `analogueTerm`) и что в тексте
// считается числом (`numbersIn` — провенанс, его судит шаг 6).
//
// Юниты `numbersIn` перенесены сюда БЕЗ ПРАВОК из прежнего теста ядра: каждый куплен живым
// прогоном, и переписывать их вместе с ролью `gilb` было бы потерей улик.
import test from "node:test"
import assert from "node:assert/strict"
import { numbersIn, parseBrd, analogueTerm } from "./brd.mjs"

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

// --- parseBrd: разбор артефакта ворот -----------------------------------------------------------------

const DOC = [
  "verdict: solvable",
  "R1 A new endpoint returns one fruit by its name",
  "   and the list keeps working",
  "R2 Existing calls remain unchanged",
  "analogue: list — the existing list the new endpoint is modelled on",
  "subjects[]: endpoint · card · fruit",
  "open-questions: 0",
].join("\n")

test("parseBrd happy: вердикт, требования с адресом, аналог, якоря и открытые вопросы", () => {
  const d = parseBrd(DOC)
  assert.equal(d.verdict, "solvable")
  assert.equal(d.requirements.length, 2)
  assert.equal(d.requirements[0].id, "R1")
  assert.equal(d.requirements[0].line, 2, "адрес требования — номер строки, по нему чинит наряд починки")
  assert.match(d.requirements[0].statement, /and the list keeps working$/, "перенос строки не подклеился к формулировке")
  assert.equal(d.analogue, "list — the existing list the new endpoint is modelled on")
  assert.deepEqual(d.subjects, ["endpoint", "card", "fruit"])
  assert.equal(d.openQuestions, "0")
})

// «Строки нет» и «строка пуста» — находки РАЗНЫХ правил, и парсер обязан их различать
// (standards/code.md, ограничение 2: отсутствие — это случай, а не пустое значение).
test("parseBrd: строки, которой не было, — null, а не пустое значение", () => {
  const d = parseBrd("R1 что-то одно")
  assert.equal(d.verdict, null)
  assert.equal(d.analogue, null)
  assert.equal(d.subjects, null)
  assert.equal(d.openQuestions, null)
})

test("parseBrd МОЛЧАНИЕ: текста нет — пустой разбор, а не исключение", () => {
  const d = parseBrd(undefined)
  assert.deepEqual(d.requirements, [])
  assert.equal(d.verdict, null)
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
