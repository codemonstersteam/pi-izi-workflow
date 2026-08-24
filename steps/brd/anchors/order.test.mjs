// Юниты сборки наряда подшага 2C. Формула — standards/code.md §TESTS: штатный заход, ветви
// антецедента с РАЗЛИЧИМЫМ следствием (первый заход · починка · отказы) и МОЛЧАНИЕ на каждый
// внешний операнд. Отказы едут одной таблицей: следствие у них одно — `{ why }` вместо наряда, —
// и три копии одного юнита формула не считает тремя юнитами.
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { orderText, fill } from "./order.mjs"
import { STAGED_ANALOGUE } from "../paths.mjs"

const ROWS = "add | Glossary | configuration type | dictionary of bot terms\n"
  + "substitute | terms | prompts | as `{{glossary.<term>}}` alongside snippets\n"

const HITS = "Glossary · files 1 · weight 7.53\nterms · files 32 · weight 4.06\nagent · files 895 · weight 0.73"

// Прогон на диске: корень с таблицей действий и, если попросят, с таблицей попаданий прошлого хода.
const run = ({ rows = ROWS, hits = null } = {}) => {
  const d = mkdtempSync(join(tmpdir(), "izi-anchors-order-"))
  mkdirSync(join(d, ".agent"), { recursive: true })
  if (rows !== null) writeFileSync(join(d, ".agent", "normalized.md"), rows)
  if (hits !== null) writeFileSync(join(d, ".agent", "hits.txt"), hits)
  return d
}

test("наряд первого захода: пронумерованные требования, таблица попаданий и путь — и больше ничего", () => {
  const r = orderText({ cwd: run() })
  assert.equal(r.fix, false)
  assert.equal(r.staging, STAGED_ANALOGUE)
  // R-строки собрал СКРИПТ: номер равен номеру строки таблицы, строка скопирована целиком.
  assert.match(r.text, /^R1 add \| Glossary \| configuration type \| dictionary of bot terms$/m)
  assert.match(r.text, /^R2 substitute \| terms \| prompts \|/m)
  assert.match(r.text, /· files \d+ · weight /)          // таблица попаданий доехала
  assert.ok(r.text.includes(`\`${STAGED_ANALOGUE}\``))   // куда писать — сказано
  // Роль просят про ОДНО решение: одна строка, ни артефакта, ни якорей, ни вердикта.
  assert.match(r.text, /analogue: <word> — files <N>; <what makes it the model>/)
  assert.ok(!r.text.includes("YOUR PREVIOUS LINE"), "первый заход не несёт прошлого ответа — его ещё нет")
})

test("наряд починки: задача, прошлый ответ и таблица попаданий — без требований и без примера", () => {
  const cwd = run({ hits: HITS })
  const r = orderText({ cwd }, {
    previous: "analogue: fruit — files 0; ничего похожего",
    feedback: "T4 analogue: «fruit» — в таблице попаданий у него 0 файлов",
  })
  assert.equal(r.fix, true)
  assert.equal(r.staging, STAGED_ANALOGUE)
  assert.match(r.text, /Findings: 1/)
  assert.match(r.text, /^1\. .*«fruit».*0 файлов/m)                 // находка пронумерована
  assert.match(r.text, /analogue: fruit — files 0; ничего похожего/) // свой прошлый ответ
  assert.ok(r.text.includes("Glossary · files 1 · weight 7.53"), "таблица попаданий ЧИТАЕТСЯ с диска, а не считается заново")
  assert.ok(!r.text.includes("R1 add |"), "починке требования не нужны: чинится одна строка, а не выбор заново")
  assert.ok(!r.text.includes("EXAMPLE, from another domain"), "пример уже был показан на первом заходе")
})

test("отказ вместо наряда с дырой: нет таблицы действий · починка без прошлого ответа · слот не подставлен", () => {
  const cases = [
    [orderText({ cwd: run({ rows: null }) }), /normalized\.md/],
    [orderText({ cwd: run({ rows: "   \n\n" }) }), /normalized\.md/],
    [orderText({ cwd: run() }, { feedback: "T4 analogue: …" }), /прошлого ответа/],
    [fill("нужен {WORDS} и {STAGING}", { WORDS: HITS }), /слот/],
  ]
  for (const [r, why] of cases) {
    assert.ok(r.why, `ожидался отказ, а приехал наряд: ${JSON.stringify(r).slice(0, 120)}`)
    assert.equal(r.text, undefined, "отказ не приносит текста наряда — иначе дырявый наряд уедет роли")
    assert.match(r.why, why)
  }
  assert.match(fill("нужен {WORDS} и {STAGING}", { WORDS: HITS }).why, /STAGING/, "отказ называет ИМЯ пропавшего слота")
})

test("МОЛЧАНИЕ: таблицы попаданий нет — отказ, а не наряд с пустым разделом", () => {
  // Корня прогона не существует: считать попадания не по чему, читать тоже нечего. Таблица действий
  // при этом передана в аргументе — операнд ровно один, и пропал именно он. Путь берётся ВНУТРИ
  // свежего mkdtemp: `tableAt` создаёт каталог под `.agent/hits.txt`, и фиксированное имя в /tmp
  // пережило бы прогон — второй запуск нашёл бы там таблицу и юнит позеленел бы по остатку.
  const r = orderText({ cwd: join(mkdtempSync(join(tmpdir(), "izi-anchors-gone-")), "no-such-run") }, { rows: ROWS })
  assert.ok(r.why, "наряд без таблицы попаданий заставит роль назвать слово, счёт которого никто не считал")
  assert.equal(r.text, undefined)
  assert.match(r.why, /hits\.txt/)
})
