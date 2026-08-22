# Пятьдесят пять функций хоста: куда уехала каждая

Сегодня расширение экспортирует 55 функций (`grep -c '^export const' ext/index.mjs`). После
переработки — три: `stepStart`, `stepNext`, `stepFold` (`plan-app-graph.xml#bridge`). Плюс не
экспорт, а РЕГИСТРАЦИЯ: тул `izi_answer` и `roleDirectories`.

Эта таблица существует, чтобы исполнитель тикета T20 не решал судьбу каждой функции заново
пятьдесят пять раз. Колонка «куда» — адрес в новой конструкции; «удалена» значит, что решение,
которое функция принимала, принимается теперь в другом месте, и это место названо.

`ШАГ` в колонке «куда» означает: уезжает в пятёрку своего шага (`inputs` · `cut` · `order` ·
`judge` · `route`) и функцией хоста быть перестаёт — модуль шага живёт в том же процессе, что и
расширение, и звать самого себя через RPC ему незачем.

| # | функция | куда | тикет |
|---|---|---|---|
| 1 | `readText` | удалена: модуль шага читает диск сам | T20 |
| 2 | `answers` | ШАГ `intake` → `fold`, ветвь события `ask` | T15 |
| 3 | `checkTask` | ШАГ `task` → `judge` | T11 |
| 4 | `checkBrd` | ШАГ `brd` → `judge` | T12 |
| 5 | `brdForm` | ШАГ `brd` → `order` (форма подставляется как ДАННЫЕ) | T12 |
| 6 | `carried` | ШАГ (общее) → `route`, перенос находок между кругами | T08 |
| 7 | `frdForm` | ШАГ `intake` → `order` | T15 |
| 8 | `orderLine` | ШАГ (общее) → `order`, проверка `budgets.orderCap` | T08 |
| 9 | `budgets` | `state`: `DEFAULT_BUDGETS` + чтение `izi.config.json` | T04 |
| 10 | `herdrStatus` | удалена: наблюдаемость прогона — дело трейса | T20 |
| 11 | `setPending` | ШАГ → `next`, подготовка доставки перед `ask` | T15 |
| 12 | `clearPending` | ШАГ → `fold`, ветвь события `ask` | T15 |
| 13 | `newRun` | `state.start` (перенос в `.agent/prev`, чистка staging) | T04 |
| 14 | `promote` | ШАГ → `route`, только после зелёного вердикта | T08 |
| 15 | `survey` | ШАГ `scope` → `cut` | T13 |
| 16 | `focus` | ШАГ `scope` → `cut` | T13 |
| 17 | `cells` | ШАГ `scope` → `cut` | T13 |
| 18 | `checkPart` | ШАГ `scope` → `judge` | T13 |
| 19 | `digest` | ШАГ `scope` → `order` | T13 |
| 20 | `reuse` | ШАГ `scope` → `cut`, кэш части с пересудом СЕЙЧАС | T13 |
| 21 | `remember` | ШАГ `scope` → `route` | T13 |
| 22 | `buildGraph` | ШАГ `graph` → `cut` | T14 |
| 23 | `graphMap` | ШАГ `graph` → `judge`; читателям — через `inputs` | T14 |
| 24 | `checkFrd` | ШАГ `intake` → `judge`, разрезанный на 20 судей | T15 |
| 25 | `weight` | ШАГ `weight` → `cut` + `judge` | T16 |
| 26 | `ripple` | ШАГ `ripple` → `cut` + `judge` | T17 |
| 27 | `values` | ШАГ `plan/values` → `cut` + `judge` | T10 |
| 28 | `tree` | ШАГ `plan/tree` → `cut` + `judge` | T08 |
| 29 | `treeJoin` | ШАГ `plan/tree` → `route` (склейка порций) | T08 |
| 30 | `neighbours` | ШАГ `plan/tree` → `order` (блок NEIGHBOURS) | T08 |
| 31 | `twin` | ШАГ `plan/tree` → `order` (выжимка образца) | T08 |
| 32 | `treeOrder` | ШАГ `plan/tree` → `order` | T08 |
| 33 | `flows` | ШАГ `plan/flows` → `cut` + `judge` | T18 |
| 34 | `flowsJoin` | ШАГ `plan/flows` → `route` | T18 |
| 35 | `repair` | ШАГ (общее) → `route`, наряд починки с адресом | T08 |
| 36 | `planbook` | ОТЛОЖЕНА вместе с `plan/book` (`ship="0"`) | после T21 |
| 37 | `decision` | ШАГ `intake` → `fold`, журнал решений | T15 |
| 38 | `gate1` | ОТЛОЖЕНА вместе с `gate1` (`ship="0"`) | после T21 |
| 39 | `runlogRead` | `runlog.read` | T05 |
| 40 | `runlogMark` | `runlog.end` | T05 |
| 41 | `runlogTicket` | удалена: тикеты за границей поставки | T20 |
| 42 | `runlogPending` | `state.question` — вопрос живёт в состоянии | T04 |
| 43 | `branch` | В ЧЕРДАК вместе с `steps/branch/` | T20 |
| 44 | `tickets` | В ЧЕРДАК вместе с `steps/tickets/` | T20 |
| 45 | `plan` | В ЧЕРДАК: `steps/plan/plan.mjs` без хозяина | T20 |
| 46 | `reviewForm` | ОТЛОЖЕНА вместе с `review` (`ship="0"`) | после T21 |
| 47 | `review` | ОТЛОЖЕНА вместе с `review` (`ship="0"`) | после T21 |
| 48 | `nodeFacts` | ШАГ `plan/tree` → `cut` (факты ряби в скелете) | T08 |
| 49 | `frdAdopt` | ШАГ `intake` → `route` | T15 |
| 50 | `clearStaged` | ШАГ → `next`, чистка пути доставки перед вызовом | T08 |
| 51 | `planReview` | ОТЛОЖЕНА вместе с `review` | после T21 |
| 52 | `planFix` | ОТЛОЖЕНА вместе с `review` | после T21 |
| 53 | `planRoute` | ОТЛОЖЕНА вместе с `review` | после T21 |
| 54 | `planFeedback` | ОТЛОЖЕНА вместе с `review` | после T21 |
| 55 | `iziAnswer` | ОСТАЁТСЯ как тул `izi_answer` — без него оператор не может ответить | T06 |

**Итого:** уезжает в шаги 33, становится службой 6, отложено вместе с `ship="0"` 8, в чердак 3,
удалено 4, остаётся тулом 1.

`roleDirectories` тоже остаётся, но состав СЧИТАЕТСЯ из дерева `steps/**` — файл `*.md` рядом со
`*.step.mjs`. Сегодня каталоги перечислены поимённо, и чистка сделала бы один из них
несуществующим: расширение перестало бы регистрироваться, а отказ на краю сказал бы «перезапусти
pi», что неверно и уводит оператора в сторону.
