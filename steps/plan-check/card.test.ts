// Units of the plan card: counts and the link line.
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buildCard } from "./card.ts"

const PLAN = `# П
## 1. ТРЕБОВАНИЯ
| № | Цитата | Где |
|---|---|---|
| Т1 | «а» | Ф1 |
| Т2 | «б» | Ф1 |

## 2. ИЗМЕНЕНИЯ
| № | Файл | A/C | К | Тр |
|---|---|---|---|---|
| Ф1 | src/There.java | Changed | x | Т1 |
| Ф2 | src/New.java | Added | новый. Образец: src/There.java | Т2 |

## 3. СЦЕНАРИИ
### Сценарий 1
- До: а. После: б.

## 4. ВЕЛИЧИНЫ
| В | З | Источник |
|---|---|---|
| v | 1 | TASK |

## 5. ГАРАНТИИ
1. Не трогаем.

## 6. ОТКРЫТЫЕ ВОПРОСЫ
| Вопрос | Рекомендация |
|---|---|
| Q1 | r |
`

test("карточка: ссылка, счётчики, новые/существующие файлы", () => {
  const cwd = mkdtempSync(join(tmpdir(), "solo-card-"))
  mkdirSync(join(cwd, "src"), { recursive: true })
  writeFileSync(join(cwd, "src/There.java"), "x")
  try {
    const card = buildCard(PLAN, cwd)
    assert.match(card, /ПЛАН ГОТОВ/)
    assert.match(card, /\.agent\/PLAN\.md/)
    assert.match(card, /2 требований/)
    assert.match(card, /2 строк изменений \(1 новых файлов, 1 существующих\)/)
    assert.match(card, /1 величин/)
    assert.match(card, /открытых вопросов осталось: 1/)
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})
