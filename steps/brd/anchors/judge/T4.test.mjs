// T4 — образец существует в этом репозитории. Юниты по формуле `standards/code.md`:
//     N = 1 штатный + Σ ветвей антецедента с РАЗЛИЧИМЫМ следствием + 1 молчание
//
// Различимые ветви: объявленное отсутствие · слово не названо · слова нет в таблице · у слова ноль.
// МОЛЧАНИЕ — таблицы попаданий нет: счёт брать неоткуда, и зелёное здесь не доказательство.
//
// Форма строки взята у живой модели: `component-tests/steps/brd/4-anchors/answer.analogue.txt`,
// `analogue: PromptSnippet — files 62; …` (eddi, qwen3.6-27b, 23.08.2026, два прогона побайтово).
import test from "node:test"
import assert from "node:assert/strict"
import { T4 } from "./T4.mjs"

const HITS = { PromptSnippet: 62, agent: 890, glossary: 0 }

test("T4 happy: строка живой формы — слово со счётом, число и объяснение после тире", () => {
  assert.deepEqual(T4({ line: "analogue: PromptSnippet — files 62; the existing configuration type the new Glossary is modelled after", hits: HITS }), [])
})

test("T4: `none` — законный вход, а не пропуск", () => {
  assert.deepEqual(T4({ line: "analogue: none — ничего похожего в репозитории нет", hits: HITS }), [])
  assert.deepEqual(T4({ line: "analogue: none", hits: HITS }), [])
})

test("T4: аналог с нулевым счётом — назвали то, чего в репозитории нет", () => {
  const b = T4({ line: "analogue: glossary — files 0; по образцу него", hits: HITS })
  assert.equal(b.length, 1)
  assert.match(b[0], /0 файлов/)
  assert.match(b[0], /PromptSnippet|agent/, "блокер не предложил ни одного слова со счётом")
  assert.match(b[0], /analogue: none/, "блокер не назвал второй законный выход")
})

test("T4: слова нет в таблице попаданий — счёт никто не считал", () => {
  assert.match(T4({ line: "analogue: Frobnicator — files 3; по образцу него", hits: HITS })[0], /в таблице попаданий нет/)
})

test("T4: слово не названо — строки нет, строка пуста, один заголовок", () => {
  for (const line of [null, "", "analogue:", "   "]) {
    const b = T4({ line, hits: HITS })
    assert.equal(b.length, 1, `строка «${line}» не дала блокера`)
    assert.match(b[0], /слово не названо/)
    assert.match(b[0], /analogue: none/, "блокер не назвал второй законный выход")
  }
})

test("T4 МОЛЧАНИЕ: таблицы попаданий нет — счёт брать неоткуда", () => {
  assert.deepEqual(T4({ line: "analogue: glossary — files 0; по образцу него", hits: null }), [])
  assert.deepEqual(T4({ line: "analogue: glossary — files 0; по образцу него", hits: {} }), [])
  assert.deepEqual(T4(), [])
})
