# izi-pi-v2

Первые семь шагов конвейера `izi-flow-v2` (`task → brd → survey-plan → scope → graph → intake →
weight`), перенесённые на `pi-extensible-workflows` (pi v5.1.1) и переписанные на функции расширения
(S11, S15, S17, S20, S21, S22). Порядок шагов
— код `workflows/izi.js`, а не манифест; бюджеты прогона с S16 поднимаются файлом проекта
`izi.config.json` (см. ниже). Роль `gilb` превращает сырое требование оператора
в BRD, который можно принять; шаг `survey-plan` — чистый скрипт без роли и без оператора: он режет дерево
репозитория на клетки, которые скаут шага 4 физически способен прочесть (`docs/survey-plan.md`);
шаг `scope` — рой: роль `scout` по клетке в батче, два наряда по роду клетки, гардрейл `checkPart`
судит СОСТАВ части, а не формулировки (`docs/scope.md`); шаг `graph` сливает части в
`.agent/appgraph.xml` — скриптом, за 0 токенов (`docs/graph.md`); шаг `intake` прожаривает
требование против этой карты в `.agent/frd.xml` — сценарии использования, словарь данных, карта
режимов отказа и дельта контракта по узлам карты, с вопросом оператору вместо умолчания
(`docs/intake.md`); шаг `weight` — снова чистый скрипт: он складывает ФОРМЫ дельт в одно слово
`.agent/mode` (`patch | minor | major`), а дельта, которую роль не смогла классифицировать,
останавливает полосу вместо тихого умолчания (`docs/weight.md`).
Подробности программы — `docs/workflow.md`; принципы и что из них отложено на двух шагах —
`docs/concept.md`.

## Установка

```bash
cd ext && npm install && cd ..
pi install ./ext
```

`ext/` — pi-extension: функции хоста для воркфлоу-песочницы (`readText`, `answers`, `brdForm`,
`frdForm`, `budgets`, `herdrStatus`, `checkTask`, `checkBrd`, `promote`, `setPending`,
`clearPending`, `survey`, `cells`, `digest`, `reuse`, `remember`, `checkPart`, `buildGraph`,
`graphMap`, `checkFrd`, `weight`), `roleDirectories: [steps/brd/, steps/scope/, steps/intake/]`,
откуда pi резолвит роли `gilb`, `scout` и `intake` по именам файлов `gilb.md`, `scout.md` и
`intake.md`, и (S13) tool `izi_answer`, зарегистрированный
на самой ИНТЕРАКТИВНОЙ сессии через `pi.registerTool` — не на песочнице воркфлоу, а на модели,
которая читает этот README прямо сейчас. `export default function extension(pi)` в `ext/index.mjs`
делает оба вызова разом: `pi.registerTool(...)` (обычный контракт pi-расширения,
`ExtensionFactory = (pi: ExtensionAPI) => void`, `@earendil-works/pi-coding-agent`) и
`registerWorkflowExtension(...)` (контракт `pi-extensible-workflows`). `npm install` внутри `ext/`
нужен один раз — `pi install <локальный путь>` сам его не запускает (это проверено фактом: без
`node_modules/pi-extensible-workflows` сессия `pi -p` падает на старте с `Cannot find module
'pi-extensible-workflows'`); разбор, почему `ext/package.json` несёт зависимость и это не
противоречит `standards/code.md` — в самом файле. `pi install ./ext` подключает разом функции, роль,
tool и `prompts/izi.md` (третьим полем того же `pi`-манифеста) — так `/izi` становится доступна в
терминале pi без отдельного шага установки.

Проверка: `pi list` показывает путь до `ext/` среди установленных пакетов.

## Запуск

Единственный канал — интерактивное окно pi. Headless-раннера (`bin/run.mjs`) больше нет: он
существовал ради канала `operatorChannel: "terminal"`, а с S11 оператор один — `checkpoint` внутри
живой сессии `pi`. Кладёте задачу в `TASK.md`, открываете `pi` в этом репозитории и печатаете:

```
/izi
```

Раскрывается в наряд лаунчеру: ровно один вызов tool `workflow` с `scriptPath:
"workflows/izi.js"`, `foreground: false` (S13). Tool возвращается НЕМЕДЛЕННО с `{ runId,
state: "running" }` — прогон идёт в фоне; финал и любые паузы `checkpoint()` приезжают в этот же
чат ОТДЕЛЬНЫМИ follow-up сообщениями (`pi-extensible-workflows/src/host.ts:673-677`,
`deliverBackgroundCheckpoint`).

**Почему не `foreground: true`.** Было ровно так до S13, и это заперло оператора: с
`foreground: true` пауза `checkpoint()` отдаёт Approve/Reject модальному `ui.select`
(`host.ts:686`, `checkpointBridge`), который забирает ввод у ВСЕГО окна — напечатать ответ роли
`gilb` было физически негде, `esc` просто перерисовывал те же две кнопки. `backlog.md`, «Обмен
вопрос→ответ ни разу не завершился получением `.agent/brd.md`» — это и есть причина: не логическая
ошибка обмена, а канал, в котором у оператора нет клавиатуры. `foreground: false` меняет это одним
полем: та же пауза — обычное текстовое сообщение, редактор свободен.

## Цикл вопрос → ответ

Роль `gilb` не имеет права разговаривать с оператором иначе как через `err(question)`. Барьер и
данные разделены нарочно: `checkpoint(input)` в песочнице `pi-extensible-workflows` возвращает
воркфлоу-скрипту только строку `"approved"` | `"rejected"` — текста ответа этим каналом не едет
никогда (`~/.pi/agent/npm/node_modules/pi-extensible-workflows/src/host.ts`). До S13 факт (текст
ответа) ехал ВТОРЫМ каналом — вторым терминалом, где оператор руками выполнял `bin/answer.mjs`.
С S13 факт остаётся файлом, но пишет его модель ЭТОГО ЖЕ чата, инструментом, а не человек второй
командой:

```
пауза checkpoint() — приезжает в чат обычным сообщением (foreground: false):
  "Workflow izi checkpoint <name>: <инструкция>. Context: {...}. Respond with workflow_respond."
  Перед паузой workflows/izi.js::askOperator вызвал host-функцию setPending({subject, evidence}) —
  ПОЛНЫЙ вопрос (без байтового предела) лёг в .agent/pending.json ДО того, как чат увидел паузу.

модель этого чата, следуя инструкции из сообщения:
  1. спрашивает оператора вопрос дословно ПРЯМО В ЭТОМ ЧАТЕ
     (или — если вопрос длиннее ~600 байт и не влез в prompt целиком — сперва читает его дословно
     из .agent/pending.json; сам вопрос при этом никогда не обрезается)
  2. оператор отвечает — обычным текстом, в этом же окне, без второго терминала
  3. модель вызывает tool izi_answer({ text: <ответ дословно> }) — ОДИН параметр; ключ вопроса тул
     берёт из .agent/pending.json САМ, модель его не передаёт и подменить не может
  4. модель вызывает workflow_respond({ runId, name: <label из этого же сообщения>, approved: true })

workflows/izi.js — Approve сам по себе не факт: answers({}) до и после паузы сверяются
  по subject; ответ не появился → та же пауза переспрашивается (до CHECKPOINT_RETRIES=2 раз),
  роль НЕ зовётся заново — переспрос не тратит бюджет пере-делегации (loops)
  ответ появился → clearPending() снимает .agent/pending.json, наряд собирается заново, gilb
  вызывается ещё раз
```

`izi_answer` — обычный tool (`pi.registerTool`, `ext/index.mjs`), не функция песочницы воркфлоу:
он живёт на ЭТОЙ сессии, той самой, что читает данный README. Отсутствие `.agent/pending.json` в
момент вызова — внятный отказ тула (`throw`), а не запись в никуда: без открытого вопроса писать
некуда, и тул на этом настаивает, а не молчит. Запись идёт тем же форматом и той же проверкой на
шаблон-плейсхолдер (`<ответ>`), что раньше делал только `bin/answer.mjs` — правило одно,
`bin/write-answer.mjs` + `core/answers.mjs::looksLikeTemplate`, вызывающих два. `bin/answer.mjs`
(CLI `node bin/answer.mjs --q="…" --text="…"`) никуда не делся — он остаётся рабочим запасным
входом (например, для отладки без интерактивного чата), но больше не единственный и не основной:
основной путь — печатать ответ прямо в окне pi.

**Reject** на любой паузе — вопрос уходит человеку эскалацией (`kind: escalate`), прогон
останавливается терминально. Бюджетов вопросов **два, и они считают разное** (S21): `questions` —
сколько ВОПРОСОВ можно задать за прогон (по умолчанию 60), `questionRounds` — сколько раз роль
вообще выходит к оператору (по умолчанию 3). Шаг 6 `intake` задаёт вопросы **пакетом**: прожарка
требования на живом проекте — это 25–30 вопросов, и дорог не вопрос, а круг (роль перечитывает BRD и
карту целиком на каждом). Любой исчерпан → терминальный `err(question)` с диагнозом, а не
`escalate`: роль не отказывалась и не получала плохого ответа, оператор просто не ответил вовремя.
`loops` от них независим: пере-делегация тратит `loops` (оплаченный вызов `agent()` по красному чеку
гардрейла), обмен с оператором — нет, и виток «Approve подтверждён» не трогает `loops` вовсе.

## Наблюдаемость в herdr — три переменные окружения, а не настройка (S16)

Прогон виден в herdr (панель на каждого агента, режим fully-inspectable) ТОЛЬКО если сам процесс
`pi` запущен ВНУТРИ пейна herdr. Проверка хоста — `herdrAvailable()`
(`pi-extensible-workflows/src/herdr.ts`): нужны **все три** переменные, `HERDR_ENV=1`,
`HERDR_PANE_ID`, `HERDR_SOCKET_PATH`; их выставляет herdr процессам, которые запускает сам.

Ловушка, стоившая прогона: при их отсутствии herdr-расширение **не регистрируется вовсе**
(`registerHerdrExtension` возвращает `false`) и НЕ говорит об этом ни слова, а
`~/.pi/agent/pi-extensible-workflows/settings.json` с `"enableFullyInspectableMode": true` при этом
выглядит корректным — он и есть корректный, просто инертный. `pi`, запущенный из обычного
терминала, идёт вслепую и неотличим от сломанной интеграции.

Поэтому прогон объявляет наблюдаемость ВСЛУХ, второй строкой журнала:

```
herdr: on pane=%1 fully-inspectable
herdr: off — pi запущен не в пейне herdr (нет HERDR_ENV=1, HERDR_PANE_ID, HERDR_SOCKET_PATH) — панели агентов не откроются
```

Правило доступности не пересказано в нашем коде — оно подставлено из хоста
(`ext/index.mjs::herdrStatus` зовёт `herdrAvailable`/`herdrPaneId`/`loadSettings`). Прогон при этом
не блокируется: ненаблюдаемый прогон — всё равно прогон.

**ПРОВЕРЕНО ФАКТОМ (herdr 0.8.0): пейн herdr этих переменных шеллу НЕ отдаёт.** Ни пейн, открытый в
TUI, ни пейн, созданный через `herdr tab create` — в окружении их дочернего `zsh` нет ни одной
`HERDR_*`. Значит `pi`, запущенный в пейне просто как `pi`, интеграции не получит, сколько бы
настроек ни стояло. Запускать надо так — из ТОГО пейна, в котором работаете:

```bash
HERDR_ENV=1 \
HERDR_SOCKET_PATH="$HOME/.config/herdr/herdr.sock" \
HERDR_PANE_ID="$(herdr api snapshot | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).result.snapshot.focused_pane_id))')" \
pi
```

Первый же прогон печатает вердикт сам: `herdr: on pane=w7:p3 fully-inspectable` (проверено живым
прогоном `805c26bf-d6af-4743-ac7c-dc2d1ad396d5`) либо `herdr: off — …` с перечнем недостающих
переменных.

**Расширение читается при СТАРТЕ сессии pi, воркфлоу — на каждом прогоне.** Поэтому новая функция
хоста (`budgets`, `herdrStatus`, `survey`) требует перезапуска `pi`; иначе прогон падает на
`<имя> is not defined`, и `workflows/izi.js` называет починку прямо в диагнозе.

## Бюджеты прогона — `izi.config.json` (S16)

Три числа поднимаются файлом в корне ПРОЕКТА, править код установленного харнеса не нужно:

```json
{ "loops": 5, "questions": 10, "checkpointRetries": 2 }
```

Файла нет → умолчания `3 / 3 / 2`, объявленные ОДИН раз в `core/budgets.mjs::DEFAULT_BUDGETS`.
Частичный конфиг разрешён (недостающий ключ берёт умолчание), НЕИЗВЕСТНЫЙ ключ или значение не
целое ≥ 1 — терминальный `blocked` с диагнозом: опечатка в имени бюджета иначе тихо оставила бы
старое число, и оператор считал бы, что поднял его. Прочитанные числа печатаются первой строкой
прогона (`budgets: loops=… questions=… checkpointRetries=… (izi.config.json|defaults)`).

## Проверка BRD — по staging, до промоута

`brd` пишет черновик в `.agent/staging/brd.md`. `checkBrd({ path })` (функция расширения,
`ext/index.mjs`, подключает `steps/brd/brd.mjs::newBrd` к диску) читает именно этот путь — не
`.agent/brd.md` — и судит числа критерия ТОЛЬКО по `TASK.md` и ЗНАЧЕНИЯМ ответов оператора, не по
тексту его вопросов (роль не имеет права цитировать собственные альтернативы как источник числа).
**S16:** правило «`fit` обязан нести измеримый токен» СНЯТО решением оператора — живой прогон
`ed1d4094` дал на нём ложный красный (`fit: регистронезависимое вхождение подстроки` — предикат,
проверяемый машиной, но без числа/диапазона/`|`/сравнения/формата) и сжёг все три пере-делегации.
Гардрейл судит СОСТАВ (есть `fit`, есть `verify`, у числа есть источник, якорей 3..7, открытых
вопросов ноль); качество формулировки судит человек, принимающий BRD.
Зелёный чек → `promote({ from: ".agent/staging/brd.md", to: ".agent/brd.md" })` ПЕРЕНОСИТ staging в
`out` — копирует и удаляет исходник, поэтому то, что осталось в `.agent/staging/` после прогона, это
ровно то, что гардрейл отверг; отсутствие staging на этом шаге — отказ с диагнозом (`promote`
бросает исключение), а не тихий успех. Красный чек возвращает `blockers`, они едут в `FEEDBACK` следующей пере-делегации.

## Что где лежит

```
TASK.md                       вход конвейера — кладёт оператор, ≤300 строк, непуст
workflows/izi.js               вся программа: task() → brd() → surveyPlan(), бюджеты из budgets()
                                (izi.config.json), ok/err/exit, ENVELOPE (outputSchema)
izi.config.json                НЕОБЯЗАТЕЛЬНЫЙ файл ПРОЕКТА: loops/questions/checkpointRetries;
                                нет файла — умолчания из core/budgets.mjs

ext/index.mjs                  pi-extension: readText/answers/checkTask/checkBrd/promote/setPending/
                                clearPending/survey — глобалы внутри workflows/izi.js; roleDirectories →
                                steps/brd/; ПЛЮС tool izi_answer, зарегистрированный на самой
                                интерактивной сессии через pi.registerTool (S13, не глобал воркфлоу)
ext/package.json                МИНИМАЛЬНЫЙ package.json расширения (не пайплайна) — pi.extensions,
                                pi.prompts, зависимость на pi-extensible-workflows; разбор — в файле

steps/task/task.mjs            ЧИСТОЕ правило входа: checkTaskText(text) — непуст, ≤300 строк
steps/task/task.test.mjs       тест по формуле 1 happy + Σ ветвей антецедента

steps/brd/gilb.md              роль (имя файла = имя роли — pi резолвит по нему, не по step.json)
steps/brd/order.tpl            наряд роли (TASK/ANSWERS/FEEDBACK/STAGING/CHECK → STAGING)
steps/brd/brd.mjs              ЧИСТОЕ ядро приёмки: newFit·newRequirement·newSubjects·adviceFor·newBrd
steps/brd/brd.test.mjs         тест по формуле

steps/survey-plan/plan.mjs     ЧИСТОЕ ядро раскладки: newPlan({files, spine, subjects}) — клетки роя;
                                CELL_FILES=20 · CELL_BYTES=200 КБ, клетка закрывается по тому, что
                                раньше. Роли у шага нет — ни gilb-подобного .md, ни order.tpl, ни
                                staging: артефакт производит сам чек (S15)
steps/survey-plan/plan.test.mjs тест по формуле: happy · шов по байтам · no-files

steps/scope/scout.md           роль роя (S17): читает ТОЛЬКО файлы наряда, непрочитанное — <gap>
steps/scope/order.survey.tpl   наряд клетки kind="survey" — модули, их api и зависимости
steps/scope/order.spine.tpl    наряд клетки kind="spine" — пять ответов графа или found="no"
steps/scope/part.mjs           ЧИСТОЕ ядро: parsePart · checkPart · newPart; правила C1·S1..S5·P1..P3
steps/scope/part.test.mjs      тест по формуле + швы наряда (плейсхолдеры) и роли (запрет = проверка)

steps/graph/graph.mjs          ЧИСТОЕ слияние частей и вычисленного в карту (S20); levels.mjs —
                                компоненты, слои Кана, циклы; роли у шага нет
steps/intake/intake.md         роль шага 6 (S21): прожарка требования против карты; содержание — навык
                                requirements-intake из izi-flow, вопрос оператору вместо умолчания
steps/intake/order.tpl         наряд: BRD/MAP/ANSWERS/FEEDBACK/STAGING/CHECK + словари подстановкой
steps/intake/frd.mjs           ЧИСТОЕ ядро: parseFrd · checkFrd · newFrd; правила F1..F7
steps/intake/map.mjs           ЧИСТОЕ чтение карты: parseMap (ключи узлов) · mapMeasure (цена, потолок)
steps/intake/{frd,map}.test.mjs тесты по формуле + швы наряда и роли
steps/weight/weight.mjs        ЧИСТОЕ ядро шага 7 (S22): MODE_TABLE (форма → вес) · newMode — максимум
                                по формам дельт; словарь форм берётся из steps/intake/frd.mjs
steps/weight/weight.test.mjs   тест по формуле + шов «каждая форма словаря имеет вес»

prompts/izi.md                 pi prompt template — источник /izi; foreground: false (S13);
                                устанавливается вместе с ext/ (pi.prompts в ext/package.json)

core/answers.mjs               ФОРМАТ .agent/answers.md: newExchange (запись, с отказом на том, что
                                формат не переживёт) + newAnswers (разбор в {n, question, text});
                                S21: элемент на вопрос и на ответ — многострочный пакет двухстрочная
                                запись теряла (живой прогон 46edab60);
                                looksLikeTemplate(text) — общая проверка на шаблон-плейсхолдер
                                (S13: одно правило, два вызывающих — bin/answer.mjs и izi_answer)
core/form.mjs                  реестр формы BRD и слоёв промпта — наряд/роль подставляют, не пересказывают
core/findings.mjs              severityOf: находка роняет приёмку (blocker) или едет уликой (advice)
core/budgets.mjs               ЧИСТОЕ чтение izi.config.json: DEFAULT_BUDGETS + newBudgets(raw)
core/result.mjs                Result<T,E> — общий конверт фабрик

bin/answer.mjs                 CLI-обёртка: записывает ОДИН ответ оператора в .agent/answers.md —
                                запасной вход помимо чата (izi_answer — основной, S13; пакет вопросов
                                отвечается только через него, по номерам из pending.json)
bin/write-answer.mjs           S13: общая io-запись answers.md (mkdir/read/dedupe/write) — используют
                                И bin/answer.mjs, И ext/index.mjs::izi_answer, не два раза одна логика
bin/cli-entry.mjs               isMain(): guard `main()` в bin/answer.mjs
bin/decisions-log.mjs           append-only .agent/decisions.log

.agent/                        состояние ОДНОГО прогона (gitignored)
  staging/brd.md                  черновик роли ДО чека; переживает прогон только если чек
                                   был КРАСНЫМ — промоут забирает файл с собой
  brd.md                          артефакт ПОСЛЕ промоута (только на зелёном чеке)
  answers.md                      накопленные ответы оператора
  pending.json                    S13: {subject, evidence} текущего открытого вопроса — пишет
                                   setPending() ДО checkpoint(), izi_answer берёт из него ключ,
                                   clearPending() снимает ПОСЛЕ подтверждённого ответа
  decisions.log                   журнал переходов (пишет bin/answer.mjs, не модель)

standards/{workflow.md,code.md,role.md}   контракты хоста/кода/роли — не пересказываются здесь
docs/{concept.md,workflow.md}  принципы (что отложено и почему) и механика (программа, карточки шагов)
arch/slices/{task.md,brd.md}   архитектурные заметки по срезам, унаследованные от донора — историческая
                                справка, не текущий контракт (часть упомянутых там модулей в этом
                                порту не существует, PLAN.md §2)
```

## Где искать диагноз прогона

Печать модели-лаунчера (`pi -p`) — не канал истины. Правда лежит на диске:

```
~/.pi/workflows/projects/<slug>-<hash>/sessions/<session-id>/runs/<run-id>/
  state.json      состояние (running/completed/failed/interrupted), фазы, события
  result.json     то, что вернул workflows/izi.js
  journal.json    каждый agent()/checkpoint()/function-вызов с его вводом/выводом
  summary.json    usage: tokens, costUsd, agentLaunches — сколько РЕАЛЬНО стоил прогон
```

`<slug>-<hash>` = `${basename(cwd)}-${sha256(resolve(cwd)).slice(0,12)}`.

## Прогон одной командой

```bash
node --test                          # вся линия — обязана быть зелёной до любого живого прогона
cd ext && npm install && cd ..       # один раз на машину
pi install ./ext                     # один раз на машину (глобальные settings.json/roles/prompts)
echo "…бизнес-требование…" > TASK.md
# в окне pi:
/izi
```

## Долги — названы вслух, не спрятаны

- **Права «писать только в staging» в pi нет.** `steps/brd/gilb.md` объявляет это дисциплиной
  ($START_STRATEGY, шаг 7), а не механизмом хоста: у роли `tools: [read, write]` без карты путей.
  Держит это `ext/index.mjs::promote`, который копирует именно staging-файл сам, а не доверяет
  заявлению роли, и `checkBrd`, который читает staging, а не `out`.

- **Проектные роли и project-local prompts не подхватываются без доверия к проекту.** Отсюда
  установка через ГЛОБАЛЬНЫЙ `pi install ./ext` (пишет в `~/.pi/agent/settings.json`), а не через
  `.pi/pi-extensible-workflows/`.

- **`ext/node_modules/` не коммитится и не ставится автоматически.** `pi install <локальный путь>`
  не запускает `npm install` за вас (проверено фактом на этом репозитории, не по документации) —
  забытый `cd ext && npm install` даёт `Cannot find module 'pi-extensible-workflows'` в момент
  загрузки расширения, а не в момент `pi install`, что легко спутать с успешной установкой.

- ~~`steps/brd/brd.mjs::numbersIn` не различает число критерия и число внутри токена формата.~~
  **Закрыто (S13).** Найдено живым прогоном S11 (booking-задача, `fit: … (ISO-8601)`): `ISO-8601`
  читалось как число `8601`, требовало источника, которого нет ни в `TASK.md`, ни в ответах — роль
  получала `invented-default` за формат, который сама не выдумывала. `numbersIn` теперь отличает
  обозначение формата (буква вплотную/через дефис-слэш, ЗАГЛАВНОЕ слово через один пробел) от
  числа-величины — `steps/brd/brd.mjs::isDesignationDigit`, покрыто таблицей случаев в
  `steps/brd/brd.test.mjs` (`ISO-8601`/`UTF-8`/`SHA-256`/`RFC 3339`/`base64`/`p95` — не число;
  `20`/`90 дней`/`1..100`/`не более 20`/`300ms` — число; `100` без источника краснеет и рядом с
  `ISO-8601`, шов проверен возвратом дефекта). Живьём: тот же booking-`TASK.md`, тот же `fit:
  формат времени — ISO-8601, …`, прогон `0445e4cd-2667-43e4-8db8-9102679146fb` (и повтор
  `79c0aa0a-e410-4172-a5cf-a1af6a78f8e8`) дошли до `.agent/brd.md` с `track:"ok"` — `ISO-8601` в
  `fit:` больше не требует источника.

- **`TASK.md` и `task.md` — один и тот же файл на регистронезависимой ФС** (APFS по умолчанию на
  macOS, аналогично NTFS на Windows). Код, ссылающийся на `TASK.md` литералом, не застрахован от
  коллизии с любым другим файлом того же имени в другом регистре, случайно оставленным в корне.

- Остальные пункты, унаследованные от донора как есть (агрегаторы вместо части фабрик, отсутствие
  машинного признака «стоит, не висит») — см. `standards/code.md` §8.
