// ГОЛОВА ГАРДРЕЙЛА ВОРОТ. Правила судятся своими юнитами (T1.test.mjs … T5.test.mjs); здесь
// проверяется ровно то, что добавляет голова: разбор текста, ВСЕ находки сразу, класс у каждой и
// тотальность — ответ, не похожий на артефакт, получает вердикт, а не молчание.
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { judgeBrd, CLASSES, RULES } from "../judge.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))

// ЗАПИСАННЫЙ ОТВЕТ ЖИВОЙ МОДЕЛИ — МЕРА, А НЕ ИЛЛЮСТРАЦИЯ. Правило уедет — красным станет документ,
// который написала настоящая роль на настоящем заказе (`component/answer-gate.txt`, quarkus-t2).
const RECORDED = readFileSync(join(HERE, "..", "component", "answer-gate.txt"), "utf8")
  .split("\n").filter((l) => !l.startsWith("#")).join("\n").trim() + "\n"

const REQUEST = "A new endpoint is needed that returns ONE fruit by its name instead of the whole list. "
  + "The page with the list of fruits must be able to show the card of the selected fruit by requesting it "
  + "from this endpoint. Existing calls must not be broken."
// Таблица попаданий того же прогона: 22 файла, `list` и `fruit` существуют, `endpoint` и `card` — нет.
const HITS = { fruit: 9, list: 6, page: 2, endpoint: 0, card: 0 }
const FILES = 22

test("judge happy: записанный ответ живой модели проходит все пять правил", () => {
  const b = judgeBrd({ text: RECORDED, sources: [REQUEST], hits: HITS, files: FILES })
  assert.deepEqual(b, [], `гардрейл отбил живой ответ:\n${b.map((x) => x.text).join("\n")}`)
})

test("judge: ответ не похож на артефакт ворот — вердикт invalid, а не молчание", () => {
  const b = judgeBrd({ text: "Извините, требование неоднозначно.", sources: [REQUEST] })
  assert.equal(b.length, 1)
  assert.equal(b[0].cls, "invalid")
  assert.match(b[0].text, /Извините/, "блокер не показал начало ответа")
})

test("judge: пустой ответ — вердикт invalid", () => {
  assert.equal(judgeBrd({ text: "", sources: [] })[0].cls, "invalid")
})

// Артефакт чинит МОДЕЛЬ, и каждый круг — это вызов. Отдать один блокер из четырёх значит заплатить
// четыре вызова за то, что закрывается одним сообщением.
test("judge: находки собираются ВСЕ сразу, а не первая", () => {
  const broken = [
    "verdict: maybe",
    "R1 A new endpoint returns one fruit by its name",
    "analogue: endpoint — the thing it is modelled on",
    "subjects[]: fruit · list · page",
    "open-questions: 0",
  ].join("\n")
  const b = judgeBrd({ text: broken, sources: [REQUEST], hits: HITS, files: FILES })
  const cls = new Set(b.map((x) => x.cls))
  assert.ok(cls.has("invalid-verdict"), `вердикт вне словаря не пойман: ${[...cls]}`)
  assert.ok(cls.has("invalid-analogue"), `нулевой аналог не пойман: ${[...cls]}`)
  assert.ok(cls.has("missing-anchor"), `созданная сущность вне якорей не поймана: ${[...cls]}`)
  assert.ok(b.length >= 3, "голова остановилась на первой находке")
})

test("judge МОЛЧАНИЕ: таблицы попаданий нет — правила про якоря не судят, а не краснят", () => {
  const noHits = [
    "verdict: solvable",
    "R1 A new endpoint returns one fruit by its name",
    "analogue: endpoint — the thing it is modelled on",   // нулевой счёт, но счёта никто не дал
    "subjects[]: fruit",
    "open-questions: 0",
  ].join("\n")
  assert.deepEqual(judgeBrd({ text: noHits, sources: [REQUEST] }), [])
})

// ШОВ: каждый объявленный класс достижим, и у каждого правила свой класс. Мёртвый класс означал бы
// наряд починки, который никогда не привезёт свой источник.
test("judge: все объявленные классы достижимы, и ни одно правило не делит класс с соседом", () => {
  const seen = new Set(["invalid"])
  const wide = [
    "verdict: maybe",                                            // T1
    "R1 Existing calls must not be broken",                      // T2 — предложение заказа слово в слово
    "R2 A new endpoint returns one fruit by its name",           // T3 — `endpoint` создаётся и вне якорей
    "analogue: endpoint — по образцу него",                      // T4 — счёт ноль
    "subjects[]: list · page",                                   // T5 — `list` метит половину дерева
    "open-questions: 0",
  ].join("\n")
  // Знаменатель настоящего репозитория: коридор селективности на малом дереве молчит намеренно
  // (`judge/T5.mjs::MIN_FILES`).
  const big = { fruit: 900, list: 900, page: 900, endpoint: 0, card: 0 }
  for (const f of judgeBrd({ text: wide, sources: [REQUEST], hits: big, files: 1854 })) seen.add(f.cls)
  for (const c of CLASSES) assert.ok(seen.has(c), `класс «${c}» объявлен, но ни одна ветвь его не вернула`)
  assert.equal(new Set(RULES.map((r) => r.cls)).size, RULES.length, "два правила пишутся одним классом — наряд починки не разведёт их источники")
})
