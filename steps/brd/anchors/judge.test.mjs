// ГОЛОВА ГАРДРЕЙЛА ЯКОРЕЙ. Само правило судится своими юнитами (`judge/T4.test.mjs`); здесь
// проверяется ровно то, что добавляет голова: поиск строки аналога в ответе роли, класс у каждой
// находки и ТОТАЛЬНОСТЬ — ответ, не похожий на строку аналога, получает вердикт, а не молчание.
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { judgeAnalogue, CLASSES, RULES } from "./judge.mjs"
import { parseTable } from "../hits/hits.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const FIX = join(HERE, "../../../component-tests/steps/brd/4-anchors")

// ЗАПИСАННЫЙ ОТВЕТ ЖИВОЙ МОДЕЛИ — МЕРА, А НЕ ИЛЛЮСТРАЦИЯ. Правило уедет — красным станет строка,
// которую написала настоящая роль на настоящем заказе (eddi, `qwen3.6-27b`, 23.08.2026; два
// прогона при temperature 0 дали её побайтово одинаковой), и таблица попаданий ТОГО ЖЕ прохода.
const RECORDED = readFileSync(join(FIX, "answer.analogue.txt"), "utf8")
const { hits: HITS } = parseTable(readFileSync(join(FIX, "in/hits.txt"), "utf8"))

test("judge happy: записанный ответ живой модели проходит правило", () => {
  const b = judgeAnalogue({ text: RECORDED, hits: HITS })
  assert.deepEqual(b, [], `гардрейл отбил живой ответ:\n${b.map((x) => x.text).join("\n")}`)
})

test("judge: ответ не похож на строку аналога — вердикт, а не молчание", () => {
  const b = judgeAnalogue({ text: "Извините, ничего похожего я не нашёл.", hits: HITS })
  assert.equal(b.length, 1)
  assert.equal(b[0].cls, "invalid-analogue")
  assert.match(b[0].text, /Извините/, "блокер не показал начало ответа")
  assert.match(b[0].text, /analogue: none/, "блокер не назвал законный выход «ничего похожего нет»")
})

test("judge: пустой ответ — вердикт, а не молчание", () => {
  const b = judgeAnalogue({ text: "", hits: HITS })
  assert.equal(b.length, 1)
  assert.equal(b[0].cls, "invalid-analogue")
})

// Роль зовут ради одной строки, но модель кладёт вокруг неё рамку. Голова берёт строку из текста —
// иначе рамка читалась бы как «ответ не похож на строку аналога» и правило вообще не работало бы.
test("judge: строка найдена в рамке из прозы, и находка правила получила класс", () => {
  const framed = ["Вот моё решение:", "```", "analogue: glossaries — files 1; по образцу него", "```", "Готово."].join("\n")
  const zero = { ...HITS, glossaries: 0 }
  const b = judgeAnalogue({ text: framed, hits: zero })
  assert.equal(b.length, 1)
  assert.equal(b[0].cls, "invalid-analogue")
  assert.match(b[0].text, /^T4 analogue/, "голова не позвала правило, а ответила сама")
})

test("judge МОЛЧАНИЕ: таблицы попаданий нет — правило не судит, а не краснит", () => {
  assert.deepEqual(judgeAnalogue({ text: "analogue: Frobnicator — files 3; по образцу него" }), [])
})

// ШОВ: объявленный класс достижим, и у правила он свой. Мёртвый класс означал бы наряд починки,
// который никогда не привезёт свой источник.
test("judge: объявленный класс достижим, и правило не делит его с головой вслепую", () => {
  const seen = new Set()
  for (const f of judgeAnalogue({ text: "проза", hits: HITS })) seen.add(f.cls)
  for (const f of judgeAnalogue({ text: "analogue: glossaries — files 1; по образцу него", hits: { ...HITS, glossaries: 0 } })) seen.add(f.cls)
  for (const c of CLASSES) assert.ok(seen.has(c), `класс «${c}» объявлен, но ни одна ветвь его не вернула`)
  for (const c of seen) assert.ok(CLASSES.includes(c), `класс «${c}» возвращён, но не объявлен в CLASSES`)
  assert.equal(new Set(RULES.map((r) => r.cls)).size, RULES.length, "два правила пишутся одним классом — наряд починки не разведёт их источники")
})
