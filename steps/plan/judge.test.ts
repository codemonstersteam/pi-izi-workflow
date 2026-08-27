// Units of the plan judge: both sides of every rule; fixtures are strings.
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { judgeDraft } from "./judge.ts"

const TASK = "Нужен поиск по части имени. Существующие вызовы ломать нельзя.\n"

const GREEN = `# План

## 1. ТРЕБОВАНИЯ
| № | Цитата | Где закрыто |
|---|---|---|
| Т1 | «Нужен поиск по части имени» | Ф1 |
| Т2 | «Существующие вызовы ломать нельзя» | Ф1 (гарантии §5) |

## 2. ИЗМЕНЕНИЯ
| № | Файл | A/C | Контракт | Требование |
|---|---|---|---|---|
| Ф1 | src/App.java | Changed | новый метод search | Т1, Т2 |

## 3. СЦЕНАРИИ
### Сценарий 1
- До: нет поиска.
- После: поиск есть.

## 4. ВЕЛИЧИНЫ
| Величина | Значение | Источник |
|---|---|---|
| путь | /search | TASK: «поиск» |

## 5. ГАРАНТИИ
1. Существующие вызовы не меняются — src/App.java только расширяется.

## 6. ОТКРЫТЫЕ ВОПРОСЫ
| Вопрос | Рекомендация |
|---|---|
| Лимит по умолчанию? | 20 |
`

const stand = (files = { "src/App.java": "class App {}\n" }) => {
  const cwd = mkdtempSync(join(tmpdir(), "solo-judge-"))
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(join(cwd, p, ".."), { recursive: true })
    writeFileSync(join(cwd, p), c)
  }
  return cwd
}

test("зелёный план проходит молча (включая цитату в бэктиках)", () => {
  const cwd = stand()
  try {
    const withTicks = GREEN.replace("«Нужен поиск по части имени»", "`Нужен поиск по части имени`")
    assert.deepEqual(judgeDraft({ plan: withTicks, task: TASK, cwd }), [])
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test("потерянное требование и выдуманный путь — блокеры", () => {
  const cwd = stand()
  try {
    const bad = GREEN.replace("«Нужен поиск по части имени»", "поиск по подстроке имени")
    assert.ok(judgeDraft({ plan: bad, task: TASK, cwd }).some((b) => b.includes("не подстрока TASK")))
    const noPath = GREEN.replace("src/App.java | Changed", "src/Nope.java | Changed")
    assert.ok(judgeDraft({ plan: noPath, task: TASK, cwd }).some((b) => b.includes("файла нет в репозитории")))
    const noPat = GREEN.replace("| Ф1 | src/App.java | Changed |", "| Ф1 | src/New.java | Changed | новый модуль |")
    assert.ok(judgeDraft({ plan: noPat, task: TASK, cwd }).some((b) => b.includes("образец не назван")))
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test("величина без источника и отсутствующий раздел — блокеры; пустой план", () => {
  const cwd = stand()
  try {
    const noSrc = GREEN.replace("| путь | /search | TASK: «поиск» |", "| путь | /search |  |")
    assert.ok(judgeDraft({ plan: noSrc, task: TASK, cwd }).some((b) => b.includes("колонка источника пуста")))
    const noSec = GREEN.replace("## 5. ГАРАНТИИ", "## 5. Прочее")
    assert.ok(judgeDraft({ plan: noSec, task: TASK, cwd }).some((b) => b.includes("ГАРАНТИИ")))
    assert.deepEqual(judgeDraft({ plan: "", task: TASK, cwd }), ["формы нет: план пуст"])
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})
