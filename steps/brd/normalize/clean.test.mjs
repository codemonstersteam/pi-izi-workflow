// Units of the guardrail of the SECOND pass of substep 2A. By the formula of standards/code.md:
//     N = 1 happy path + Σ antecedent branches with a DISTINGUISHABLE consequent + 1 silence
//
// THE HAPPY PATH IS THE ETALON, not an invented pair: `component-tests/steps/brd/1-normalize/` holds
// the table the first pass wrote on the eddi order and the table the cleanup pass returned from it —
// both live answers of 24.08.2026. Every branch below is that same accepted pair with ONE defect put
// back into it: a rule proven only on invented text is proven against itself.
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { CLASSES, literalsOf, judgeClean } from "./clean.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const FIX = join(HERE, "../../../component-tests/steps/brd/1-normalize")
const TASK = readFileSync(join(FIX, "in/TASK.md"), "utf8")
const AFTER = readFileSync(join(FIX, "answer.clean.txt"), "utf8")
// Таблица ДО чистки — та, что ушла в проход чистки: она лежит в сыром ответе прохода 1.
const BEFORE = (() => {
  const d = JSON.parse(readFileSync(join(FIX, "raw.normalize.json"), "utf8"))
  const w = d.choices[0].message.tool_calls.find((c) => c.function.name === "write")
  return JSON.parse(w.function.arguments).content
})()

const cls = (r) => r.blockers.map((b) => b.cls)

test("the eddi etalon: the live cleanup pass of 24.08.2026 is accepted", () => {
  const r = judgeClean(BEFORE, AFTER, TASK)
  assert.equal(r.silent, false)
  assert.equal(r.blockers.length, 0,
    `ГАРДРЕЙЛ ОТБИЛ ПРИНЯТУЮ ЧИСТКУ — правило уехало:\n${r.blockers.map((b) => b.text).join("\n")}`)
  assert.equal(r.judged, 17, "судится КАЖДАЯ строка очищенной таблицы")
  // Та самая работа, ради которой проход существует: две строки `export | Glossary` стали одной.
  assert.equal(BEFORE.split("\n").filter((l) => l.includes("|")).length, 18)
})

test("duplicate-row: одно требование, написанное дважды, — находка с номерами ОБЕИХ строк", () => {
  const rows = AFTER.trim().split("\n")
  const r = judgeClean(BEFORE, `${rows.join("\n")}\n${rows[0]}\n`, TASK)
  assert.deepEqual(cls(r), ["duplicate-row"], "дубль не назван, либо назван вместе с чужой находкой")
  assert.match(r.blockers[0].text, /^duplicate-row rows 1 and 18:/, "находка без адреса ОБЕИХ строк")

  // РАЗНЫЕ ГЛАГОЛЫ НАД ОДНИМ ОБЪЕКТОМ — НЕ ДУБЛЬ, и это измеренное решение: `add | Glossary` и
  // `version | Glossary` несут разную работу (завести тип и переиспользовать чужой механизм).
  const twoVerbs = "add | Glossary | type | new\nversion | Glossary | mechanism | like Prompt Snippet\n"
  assert.equal(judgeClean(twoVerbs, twoVerbs, TASK).blockers.length, 0)
})

test("lost-value: литерал заказа, стоявший в таблице и пропавший после чистки", () => {
  const cut = AFTER.split("\n").filter((l) => !l.includes("glossarystore")).join("\n")
  const r = judgeClean(BEFORE, cut, TASK)
  assert.ok(cls(r).includes("lost-value"), "чистка выбросила требование с путём заказа, а гардрейл смолчал")
  assert.match(r.blockers.find((b) => b.cls === "lost-value").text, /glossarystore/)

  // ЛИТЕРАЛ, КОТОРОГО В ЗАКАЗЕ НЕТ, УДАЛЯТЬ МОЖНО: ради этого проход и существует — выдуманная
  // строка не несёт ни одного значения оператора, и её исчезновение не находка.
  const before = `${AFTER.trim()}\nencrypt | Glossary | AES-256 | with a rotating key\n`
  assert.equal(judgeClean(before, AFTER, TASK).blockers.length, 0, "удаление выдуманной строки принято за потерю")
})

test("invented-value: значение, которого нет ни в поданной таблице, ни в заказе", () => {
  const r = judgeClean(BEFORE, `${AFTER.trim()}\ncache | Glossary | Redis | with TTL 300 seconds\n`, TASK)
  const found = r.blockers.filter((b) => b.cls === "invented-value").map((b) => b.text).join(" ")
  assert.match(found, /300/, "выдуманное число прошло гардрейл")
})

test("МОЛЧАНИЕ: чистка вернула прозу — судить нечего, а не «пусто это не дубль»", () => {
  for (const nothing of ["", "   \n\n", "I merged the duplicate rows for you.", null, undefined]) {
    const r = judgeClean(BEFORE, nothing, TASK)
    assert.equal(r.silent, true, `«${nothing}» несёт ноль строк — правилу не над чем работать`)
    assert.equal(r.blockers.length, 0)
    assert.equal(r.judged, 0)
  }
})

test("literalsOf: копируется то, что человек скопировал бы, а не пересказал", () => {
  const l = literalsOf("expose | REST path | Glossary | `/glossarystore/glossaries`, eddi://ai.labs.glossary, " +
    "{{glossary.<term>}}, up to 64 characters, PromptSnippetService")
  for (const want of ["/glossarystore/glossaries", "eddi://ai.labs.glossary", "{{glossary.<term>}}", "64", "promptsnippetservice"]) {
    assert.ok(l.has(want), `литерал «${want}» не опознан — правило про потерю значений его не увидит`)
  }
  // Обычные слова НЕ литералы: чистке разрешено слить две строки и сформулировать слияние своими
  // словами, и правило над прозой краснело бы на законной работе.
  for (const no of ["expose", "path", "characters", "up"]) assert.ok(!l.has(no), `«${no}» — проза, а не литерал`)
})

test("шов: каждый класс модуля возвращается хотя бы одним правилом", () => {
  const rows = AFTER.trim().split("\n")
  const Q_TASK = "UI тянет весь список фруктов, чтобы найти один. Нужен поиск по части имени,\nс ограничением на размер ответа. Существующие вызовы ломать нельзя.\n"
  const seen = new Set([
    ...cls(judgeClean(BEFORE, `${rows.join("\n")}\n${rows[0]}\n`, TASK)),
    ...cls(judgeClean(BEFORE, AFTER.split("\n").filter((l) => !l.includes("glossarystore")).join("\n"), TASK)),
    ...cls(judgeClean(BEFORE, `${AFTER.trim()}\ncache | Glossary | Redis | with TTL 300 seconds\n`, TASK)),
    ...cls(judgeClean("x | y | z | w\n", "x | y | z | w\n", Q_TASK)),  // T79: constraint-row
  ])
  for (const c of CLASSES) assert.ok(seen.has(c), `класс «${c}» объявлен, а вернуть его не может ни одно правило`)
})

// T79 — CONSTRAINT-ROW: предложение-ограничение заказа обязано иметь строку-носитель.
// Кейс живого прогона FRUIT-1 (27.08): TASK с «Существующие вызовы ломать нельзя», таблица
// без preserve-строки. Реинтродукция: убрать constraintRows из judgeClean — первые два краснеют.
const Q_TASK = "UI тянет весь список фруктов, чтобы найти один. Нужен поиск по части имени,\nс ограничением на размер ответа. Существующие вызовы ломать нельзя.\n"
const Q_TWO = "search | fruits | partial name | by part of name\nlimit | response size | search | with a limit on response size\n"

test("T79: ограничение заказа без строки — блокер цитирует предложение", () => {
  const r = judgeClean(Q_TWO, Q_TWO, Q_TASK)
  assert.ok(r.blockers.some((b) => b.cls === "constraint-row"), "потерянное ограничение прошло молча")
  const b = r.blockers.find((x) => x.cls === "constraint-row")
  assert.match(b.text, /существующие вызовы ломать нельзя/, "блокер не цитирует предложение поимённо")
})

test("T79: preserve-строка и строка-цитата закрывают ограничение", () => {
  const withPreserve = Q_TWO + "preserve | existing calls | the change | must not break them — «существующие вызовы ломать нельзя»\n"
  assert.equal(judgeClean(withPreserve, withPreserve, Q_TASK).blockers.filter((b) => b.cls === "constraint-row").length, 0)
  const withQuote = Q_TWO + "keep | существующие вызовы | изменение | не ломать\n"
  assert.equal(judgeClean(withQuote, withQuote, Q_TASK).blockers.filter((b) => b.cls === "constraint-row").length, 0)
})

test("T79: эталон eddi — маркерных предложений нет, суд молчит", () => {
  const t = readFileSync(join(HERE, "../../../component-tests/steps/brd/1-normalize/in/TASK.md"), "utf8")
  const tab = readFileSync(join(HERE, "../../../component-tests/steps/brd/1-normalize/out/normalized.md"), "utf8")
  assert.equal(judgeClean(tab, tab, t).blockers.filter((b) => b.cls === "constraint-row").length, 0,
    "ложное срабатывание на эталоне")
})
