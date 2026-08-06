# izi-pi-v2

Первые два шага конвейера `izi-flow-v2` (`task → brd`), перенесённые на `pi-extensible-workflows`
(pi v5.1.1) и переписанные на функции расширения (S11). Оба шага и их бюджеты пере-делегации —
код `workflows/izi.js`, не файл конфигурации: на двух шагах платить за policy-as-data было бы
украшением, не механизмом. Роль `gilb` превращает сырое требование оператора в измеримый BRD.
Подробности программы — `docs/workflow.md`; принципы и что из них отложено на двух шагах —
`docs/concept.md`.

## Установка

```bash
cd ext && npm install && cd ..
pi install ./ext
```

`ext/` — pi-extension: семь функций хоста для воркфлоу-песочницы (`readText`, `answers`,
`checkTask`, `checkBrd`, `promote`, `setPending`, `clearPending`), `roleDirectories: [steps/brd/]`,
откуда pi резолвит роль `gilb` по имени файла `gilb.md`, и (S13) tool `izi_answer`, зарегистрированный
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
  роль НЕ зовётся заново — переспрос не тратит бюджет пере-делегации (LOOPS=3)
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
останавливается терминально. Бюджет вопросов на весь прогон — `QUESTIONS=3` (литерал в
`workflows/izi.js`); исчерпан → терминальный `err(question)` с диагнозом, а не `escalate`: роль не
отказывалась и не получала плохого ответа, оператор просто не ответил вовремя. `LOOPS=3` и
`QUESTIONS=3` — разные счётчики: пере-делегация тратит `LOOPS` (оплаченный вызов `agent()` по
красному чеку гардрейла), обмен с оператором — `QUESTIONS`, и виток «Approve подтверждён» не
трогает `LOOPS` вовсе.

## Проверка BRD — по staging, до промоута

`brd` пишет черновик в `.agent/staging/brd.md`. `checkBrd({ path })` (функция расширения,
`ext/index.mjs`, подключает `steps/brd/brd.mjs::newBrd` к диску) читает именно этот путь — не
`.agent/brd.md` — и судит числа критерия ТОЛЬКО по `TASK.md` и ЗНАЧЕНИЯМ ответов оператора, не по
тексту его вопросов (роль не имеет права цитировать собственные альтернативы как источник числа).
Зелёный чек → `promote({ from: ".agent/staging/brd.md", to: ".agent/brd.md" })` копирует staging в
`out`; отсутствие staging на этом шаге — отказ с диагнозом (`promote` бросает исключение), а не
тихий успех. Красный чек возвращает `blockers`, они едут в `FEEDBACK` следующей пере-делегации.

## Что где лежит

```
TASK.md                       вход конвейера — кладёт оператор, ≤300 строк, непуст
workflows/izi.js               вся программа: task() → brd(), литералы LOOPS/QUESTIONS/
                                CHECKPOINT_RETRIES, ok/err/exit, ENVELOPE (outputSchema)

ext/index.mjs                  pi-extension: readText/answers/checkTask/checkBrd/promote/setPending/
                                clearPending — глобалы внутри workflows/izi.js; roleDirectories →
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

prompts/izi.md                 pi prompt template — источник /izi; foreground: false (S13);
                                устанавливается вместе с ext/ (pi.prompts в ext/package.json)

core/answers.mjs               разбор .agent/answers.md в значения {question, text};
                                looksLikeTemplate(text) — общая проверка на шаблон-плейсхолдер
                                (S13: один правило, два вызывающих — bin/answer.mjs и izi_answer)
core/form.mjs                  реестр формы BRD и слоёв промпта — наряд/роль подставляют, не пересказывают
core/findings.mjs              severityOf: находка роняет приёмку (blocker) или едет уликой (advice)
core/result.mjs                Result<T,E> — общий конверт фабрик

bin/answer.mjs                 CLI-обёртка: записывает ответ оператора в .agent/answers.md по ключу
                                вопроса — запасной вход помимо чата (izi_answer — основной, S13)
bin/write-answer.mjs           S13: общая io-запись answers.md (mkdir/read/dedupe/write) — используют
                                И bin/answer.mjs, И ext/index.mjs::izi_answer, не два раза одна логика
bin/cli-entry.mjs               isMain(): guard `main()` в bin/answer.mjs
bin/decisions-log.mjs           append-only .agent/decisions.log

.agent/                        состояние ОДНОГО прогона (gitignored)
  staging/brd.md                  черновик роли ДО чека
  brd.md                          артефакт ПОСЛЕ промоута (только на зелёном чеке)
  answers.md                      накопленные ответы оператора
  pending.json                    S13: {subject, evidence} текущего открытого вопроса — пишет
                                   setPending() ДО checkpoint(), izi_answer берёт из него ключ,
                                   clearPending() снимает ПОСЛЕ подтверждённого ответа
  decisions.log                   журнал переходов (пишет bin/answer.mjs, не модель)

standards/{protocol.md,code.md,role.md}   контракты конверта/кода/роли — не пересказываются здесь
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
