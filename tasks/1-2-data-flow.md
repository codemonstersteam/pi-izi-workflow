# Шаги 1–2: как прогон идёт в фоне и как ходят данные

Улики — по исходнику `/Users/mac/IdeaProjects/codemonstersdev/pi-extensible-workflows/packages/core/src`.

## 1. Механика фонового прогона

`/izi` — шаблон промпта; модель делает один вызов tool `workflow` с `foreground: false`
(`host.ts:967`). Tool возвращает `{ runId, state: "running" }` немедленно, скрипт исполняется в
песочнице хоста.

Дальше сессия и прогон общаются **сообщениями**:

| событие | что приходит в чат |
|---|---|
| пауза | `Workflow izi checkpoint brd-q1: <текст> \nContext: {...} \nRespond with workflow_respond.` (`host.ts:673-677`) |
| финал | `Workflow izi completed: {...}` — один follow-up |

Ответ прогону отдаётся tool'ом `workflow_respond({ runId, name, approved })`.

## 2. Поток данных по шагам

```
оператор → TASK.md
   ↓ checkTask()                        функция расширения, 0 токенов
шаг 1 закрыт

   ↓ readText("steps/brd/order.tpl") + readText("TASK.md") + answers()
   ↓ prompt(tpl, {TASK, ANSWERS, FEEDBACK})
роль gilb ⇒ конверт (outputSchema) + запись .agent/staging/brd.md

   ├─ track:"err", kind:"question"
   │    setPending({subject})           → .agent/pending.json
   │    checkpoint(prompt)              → сообщение в чат, прогон в awaiting_input
   │    оператор печатает ответ         → модель зовёт izi_answer({text})
   │    izi_answer берёт ключ из pending.json → .agent/answers.md
   │    workflow_respond(approved)      → прогон читает answers() заново
   │    ответа нет на диске → переспрос, роль НЕ зовётся
   │
   └─ track:"ok"
        checkBrd(".agent/staging/brd.md")   ← судит скрипт, не роль
        зелёный → promote(staging → .agent/brd.md) → track:"ok", code 0
        красный → feedback = blockers → пере-делегация (до 3)
        попытки исчерпаны → escalate с последним блокером
```

Все пути резолвятся от **cwd прогона** (`context.run.cwd`, `types.ts:120-122`), не от каталога
харнеса — иначе установленный проект читает чужие файлы (дефект S14, прогон `2e71776f`).

## 3. Почему фон

`foreground: true` + `checkpoint()` = модальный `ui.select` (`host.ts:686`), он забирает ввод всего
окна: напечатать ответ нельзя, `esc` перерисовывает те же Approve/Reject
(`if (!choice) { if (isForeground()) continue; }`). Проверено вживую — оператор заперт.

`foreground: false` доставляет паузу сообщением, редактор свободен, ответ печатается там же.
Это единственная конфигурация, в которой вопрос роли вообще может получить текстовый ответ:
канал `checkpoint` возвращает только `approved | rejected` (`validation.ts:17-22`).

## 4. Практики пакета, на которые опирались

| практика | где взята | как применена |
|---|---|---|
| функции расширения вместо процессов | `examples/workflow-extension-template/index.js` | `readText`, `answers`, `checkTask`, `checkBrd`, `promote` — типизированный вход/выход, журналируются и реплеятся |
| `outputSchema` только там, где результат потребляет другая фаза | `skills/…/SKILL.md` | конверт роли валидирует хост, парсер не пишем |
| скрипт песочницы не знает про fs/процессы | `SKILL.md`: «no imports, filesystem, network, process» | вся работа с диском — в функциях хоста |
| `shell()` — для проверок, не для мутаций | `SKILL.md` | `shell()` вовсе не используется |
| роль как файл `<имя>.md` в `roleDirectories` | `llm.md`, «Packaged roles» | `steps/brd/gilb.md`, отдаётся расширением |
| `log()` для короткого статуса оператору | `SKILL.md`, «Rules» | границы шагов, переспросы, диагноз |
| не выдумывать бюджеты без запроса | `SKILL.md`, «Rules» | `budget` не объявлен; литералы попыток в скрипте |

## 5. Наблюдаемость: что есть, чего не хватает

**Сейчас видно** (`/workflow` → выбрать прогон):
- дашборд фаз и агентов, состояние, `runtime=` (`host-view.ts:120,150`);
- блок `Logs` — всё, что писал `log()`; `ctrl+o` разворачивает (`host-view.ts:112`);
- действия: `Pause`, `Resume`, `Stop`, `Review <checkpoint>`, `Open script in editor`, `Agents…`,
  `Copy run path` / `Copy run ID` (`host-navigator.ts:307-336`).

**На диске** — `~/.pi/workflows/projects/<slug>/sessions/<sid>/runs/<runId>/`:
`state.json`, `result.json`, `summary.json` (tokens/cost/agentLaunches), `journal.json` (каждый
вызов функции и агента с его значением), `system-prompts.json`, `workflow.js`.

**Чего не хватает:** прогон в фоне не пишет в чат ничего между стартом и паузой — `log()` виден
только внутри пикера, и оператор о нём не знает.

**Варианты, по возрастанию цены:**

1. **`/workflow` как штатный экран прогона.** Ничего не писать: после `/izi` открыть пикер и
   держать. Цена — ноль, даёт фазы, логи и живой статус.
2. **Дублировать ключевые `log()` в чат.** Расширение регистрирует функцию `say({text})`, которая
   зовёт `deliver(pi, …)` — тем же каналом, которым приходит пауза (`host.ts:676`). Прогон сам
   рассказывает о себе в чате: «шаг task закрыт», «пере-делегация 2/3, блокеры: …».
3. **`herdr` fully-inspectable mode.** `settings.json`:
   `{"extensions":{"herdr":{"enableFullyInspectableMode":true}}}` — каждый агент прогона поднимается
   в отдельной именованной панели herdr, видно живую сессию роли, а не только её результат
   (`packages/extensions/herdr/README.md`).
4. **Свой раннер на `runWorkflow(script, args, bridge, signal)`** (`execution.ts:422`) — мост
   печатает каждый вызов в терминал. Полный контроль над выводом ценой того, что персистенс,
   чекпоинты и восстановление придётся написать самим (~1100 строк `host.ts`).

Рекомендация: 1 + 2. Первое бесплатно, второе — одна функция расширения и три вызова в скрипте.

## 6. Что дал herdr (S15, проверено)

| | без herdr | с herdr fully-inspectable |
|---|---|---|
| прогресс прогона | только в `/workflow` → дашборд фаз и блок `Logs` | то же плюс живая сессия каждого агента в отдельной панели |
| ошибка роли | видна постфактум в `journal.json` | видна в момент, в панели агента |
| цена | ноль | ядро pi-extensible-workflows приходится держать репозиторной сборкой |

**Условие, которого нет в документации.** `herdr`-расширение репозиторное и написано под
репозиторное ядро: его регистрация несёт только `version` + `headline`, а npm-ядро 5.1.1 требует
ещё и `description` (`npm/.../registry.ts:42` против `repo/packages/core/src/registry.ts:46` при
одинаковой версии `5.1.1`). Поэтому режим включается только так:

```bash
cd <repo>/pi-extensible-workflows && npm ci
npm run build -w pi-extensible-workflows && npm run build -w @piewf/herdr
pi remove npm:pi-extensible-workflows          # два ядра разом → Tool "workflow" conflicts
pi install <repo>/packages/core
pi install <repo>/packages/extensions/herdr
# ~/.pi/agent/pi-extensible-workflows/settings.json:
# { "extensions": { "herdr": { "enableFullyInspectableMode": true } } }
```

Регресс на репозиторном ядре пройден: прогон `8814d8a4-7263-4cf0-bb54-f0361bddbdd9` в
`/tmp/quarkus-rest-json-app-v2-t1-3` дошёл до `.agent/brd.md`, реестр функций расширения виден
(`workflow_catalog` → семь наших функций).

Откат: `pi remove <repo>/packages/extensions/herdr && pi remove <repo>/packages/core && pi install npm:pi-extensible-workflows`.
