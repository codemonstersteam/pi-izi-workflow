// Слайс `brd`: BRD как доменное значение. Тестов на фабрику — 1 happy + число РАЗЛИЧИМЫХ исходов
// (standards/code.md §5). Диапазон входа проверяет та фабрика, которой поле принадлежит; newBrd
// отвечает лишь за то, что добавляет сам: собрать все блокеры разом и вынести улики на успех.

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { newFit, newRequirement, newSubjects, adviceFor, newBrd, numbersIn, languageDrifted } from "./brd.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const BRD = (fit) => `R1 Размер ответа ограничен\n   fit:    ${fit}\n   verify: GET /x\n\nsubjects[]: a · b · c\nopen-questions: 0\n`
const R = (over) => ({ id: "R1", statement: "Размер ответа ограничен", fit: "20 записей", verify: "GET /x", line: 1, ...over })

// --- newFit: 1 happy + 3 различимых исхода ---------------------------------------------------------
// invented-default — смысл существования шага: он ловит число, взятое моделью из головы.

test("критерий с измеримым токеном строится", () => {
  assert.equal(newFit("20 записей", null).ok, true)
})

test("нет fit — требование без измеримости не сдано", () => {
  assert.equal(newFit("", null).error.cls, "no-fit")
})

test("fit без измеримого токена — не критерий", () => {
  assert.equal(newFit("как обычно", null).error.cls, "fit-not-measurable")
})

test("число, которого нет в источниках, — умолчание подставлено, а не спрошено", () => {
  const known = new Set([...numbersIn("Нужно ограничение на размер")])
  assert.equal(newFit("20 записей", known).error.cls, "invented-default")
})

test("число из ответа оператора легально", () => {
  const known = new Set([...numbersIn("- вопрос: предел?\n  ответ: 20")])
  assert.equal(newFit("20 записей", known).ok, true)
})

// Спросил про дефолт, но максимум подставил сам — ловится: сверяется КАЖДОЕ число.
test("частично подтверждённые числа не спасают выдуманное", () => {
  const known = new Set([...numbersIn("ответ: 20")])
  assert.match(newFit("20 по умолчанию, 100 максимум", known).error.detail, /100/)
})

// «Источников нет» — это НЕ «нарушений нет»: правило молчит, потому что сверять не с чем.
test("источников нет — правило молчит, а не обвиняет наугад", () => {
  assert.equal(newFit("20 записей", null).ok, true)
})

// Нормализация: ведущие нули срезаются, запятая приводится к точке. Утверждение взято из прежнего
// теста дословно — оно было верным, а моя первая версия («20.0 → 20») выдавала желаемое за факт.
test("десятичные и ведущие нули нормализуются", () => {
  assert.deepEqual([...numbersIn("0.5 · 007 · 1,5")].sort(), ["0.5", "1.5", "7"])
})

// --- newRequirement: 1 happy + 2 своих исхода ------------------------------------------------------
// Отказ newFit пробрасывается — проверяется, что он не теряется, а не заново весь его набор.

test("требование строится", () => {
  assert.equal(newRequirement(R(), null).ok, true)
})

test("пустая формулировка — требования нет", () => {
  assert.match(newRequirement(R({ statement: "" }), null).error.detail, /формулировка пуста/)
})

test("требование без способа проверки — утверждение, а не требование", () => {
  assert.match(newRequirement(R({ verify: "" }), null).error.detail, /нет способа проверки/)
})

test("отказ критерия пробрасывается с именем требования", () => {
  assert.match(newRequirement(R({ fit: "как обычно" }), null).error.detail, /R1: fit не несёт/)
})

// --- newSubjects: 1 happy + 3 исхода ---------------------------------------------------------------

test("якоря строятся", () => {
  assert.equal(newSubjects(["a", "b", "c"]).ok, true)
})

test("якорей меньше минимума", () => {
  assert.match(newSubjects(["a"]).error.detail, /допустимо/)
})

// ЖИВОЙ ПРОГОН 01.08: якорь — это ОДНО слово. Правило «subject обязан встречаться в тексте R» было
// неверным и заставляло роль портить корректный артефакт, подгоняя якоря под язык требования.
test("фраза с пробелом — не якорь", () => {
  assert.match(newSubjects(["поиск фруктов", "b", "c"]).error.detail, /фраза, а не якорь/)
})

test("повтор якоря", () => {
  assert.match(newSubjects(["a", "b", "a"]).error.detail, /повторяется/)
})

// --- adviceFor: улики, которые НЕ роняют приёмку ---------------------------------------------------

test("желание без измеримого рядом — улика", () => {
  const a = adviceFor(R({ statement: "Ответ должен быть быстрым", fit: "быстро" }))
  assert.equal(a[0].code, "wish-not-requirement")
})

// ЖИВОЙ ПРОГОН 04: правило валило «limit (default 20, VALID range 1..100)» — слово-желание стояло
// рядом с точным диапазоном. Желание — это ОТСУТСТВИЕ критерия, а не наличие слова.
test("желание рядом с измеримым уликой не является", () => {
  assert.deepEqual(adviceFor(R({ statement: "valid range", fit: "1..100" })), [])
})

test("путь в формулировке — улика про механизм", () => {
  const a = adviceFor(R({ statement: "Реализация в src/handlers/limit.go" }))
  assert.equal(a[0].code, "design-leak")
})

// --- newBrd: 1 happy + свои исходы -----------------------------------------------------------------

test("BRD строится и несёт требования и якоря", () => {
  assert.equal(newBrd(BRD("20 записей")).value.requirements.length, 1)
})

test("без единого R не сдаётся", () => {
  assert.match(newBrd("subjects[]: a · b · c\nopen-questions: 0\n").error.detail, /нет ни одного требования/)
})

test("открытый вопрос не сдаётся", () => {
  const t = BRD("20 записей").replace("open-questions: 0", "open-questions: 1")
  assert.match(newBrd(t).error.detail, /не сдаётся с открытыми вопросами/)
})

test("строки open-questions нет вовсе", () => {
  const t = BRD("20 записей").replace("\nopen-questions: 0\n", "\n")
  assert.match(newBrd(t).error.detail, /обязан её нести/)
})

test("строки subjects нет вовсе", () => {
  const t = BRD("20 записей").replace(/subjects\[\].*\n/, "")
  assert.match(newBrd(t).error.detail, /нечем грепать/)
})

// То, ради чего блокеры собираются, а не отдаются по одному: BRD чинит МОДЕЛЬ, и каждый ретрай —
// это вызов. Отдать ей один блокер из трёх значит заплатить тремя вызовами за одно сообщение.
test("все блокеры отдаются разом, а не первый", () => {
  const t = "R1 Пусто\n   fit:\n   verify:\n\nopen-questions: 1\n"
  assert.ok(newBrd(t).error.detail.split("\n").length >= 2)
})

// Улика едет на УСПЕХЕ: правило-суждение не имеет права ронять приёмку и командовать
// пере-делегированием владельца артефакта.
test("улика не роняет приёмку, а едет вместе с построенным BRD", () => {
  const t = "R1 Реализация в src/x.go\n   fit:    20 записей\n   verify: GET /x\n\nsubjects[]: a · b · c\nopen-questions: 0\n"
  const b = newBrd(t)
  assert.equal(b.ok && b.value.advice[0].code, "design-leak")
})

// --- реестр и роль не разошлись --------------------------------------------------------------------

// izi-pi-v2 (S9): роль живёт рядом с ядром среза, как у донора izi-flow-v2 — steps/brd/, а не
// отдельный каталог roles/ (docs/workflow.md §1). S11: файл роли называется по имени РОЛИ,
// steps/brd/gilb.md, а не steps/brd/role.md — расширение объявляет steps/brd/ как roleDirectories
// (ext/index.mjs), и pi-extensible-workflows резолвит роль по имени файла (<role>.md), не по
// каталогу шага; role.md было бы установлено как роль «role», не «gilb».
const ROLE_PATH = join(HERE, "gilb.md")
test("роль знает про invented-default", () => {
  assert.match(readFileSync(ROLE_PATH, "utf8"), /invented-default/)
})

// F17 (run-5) как корпусный тест: число ИЗ ОТВЕТА оператора остаётся законным, число из списка
// альтернатив его же вопроса — нет. Обе стороны нужны: правило, которое краснеет на всём, роль
// заставит портить корректный артефакт.
test("число из ответа оператора законно, число из альтернатив вопроса — нет", () => {
  const known = new Set([...numbersIn("20")])
  assert.equal(newFit("20 records by default", known).ok, true)
  assert.equal(newFit("20 records by default, 100 maximum", known).error.cls, "invented-default")
})

// --- languageDrifted: 1 happy + 4 различимых исхода ------------------------------------------------
//
// F20 (run-6) и F16 (run-5): при русской задаче формулировки требований приходили русскими, а
// критерии — английскими. Артефакт производится наполовину из промпта, и для человека, который его
// принимает, это документ на двух языках; для приёмки — неразличимо.

const RU = "нужен поиск по части имени с ограничением размера ответа"
const EN = "search users by partial name with a response size limit"

test("русский вход, английский критерий — дрейф", () => {
  assert.equal(languageDrifted("match = substring at any position, case folded", RU), true)
})

test("правило работает в обе стороны — английский вход, русский критерий", () => {
  assert.equal(languageDrifted("подстрока в любой позиции имени", EN), true)
})

// Ниже порога букв текст языка не несёт: судить `≤ 200 мс` не по чему.
test("критерий без букв языком не обладает", () => {
  assert.equal(languageDrifted("≤ 200", RU), false)
})

// Источника нет — сверять не с чем, и молчание честнее обвинения наугад (правило invented-default
// молчит по тому же основанию).
test("источник не подан — правило молчит", () => {
  assert.equal(languageDrifted("response time ≤ 200 ms", ""), false)
})

test("смешанный источник не решает ничего — правило молчит", () => {
  assert.equal(languageDrifted("response time ≤ 200 ms", "search по name, limit 20, response не больше 200 ms"), false)
})

// Корпусный: артефакт run-6 дословно. Он прошёл приёмку зелёным, и это ровно тот двуязычный
// документ, ради которого правило заведено — теперь он обязан краснеть, а диагноз обязан называть
// требование и код.
test("артефакт run-6 краснеет на дрейфе языка, а не проходит зелёным", () => {
  const t = "R1 Пользователи ищутся по подстроке в имени/фамилии, без учёта регистра\n"
    + "   fit:    match = substring at any position in name/surname, case folded; result true | false\n"
    + "   verify: search query with partial name returns matching users\n\n"
    + "subjects[]: users · search · errors\nopen-questions: 0\n"
  const r = newBrd(t, [RU])
  assert.match(r.error.detail, /R1 \[language-drift\]/)
})

// `verify` объявлен ролью и нарядом как «команда | артефакт» и английский по природе: правило,
// краснеющее на верно исполненной форме, отправляет роль портить корректный артефакт.
test("verify языком не судится — он команда, а не проза", () => {
  const t = "R1 Пользователи ищутся по подстроке в имени\n"
    + "   fit:    подстрока в любой позиции, без учёта регистра; результат — да | нет\n"
    + "   verify: GET /users?q=part returns matching users\n\n"
    + "subjects[]: users · search · errors\nopen-questions: 0\n"
  assert.equal(newBrd(t, [RU]).ok, true)
})
