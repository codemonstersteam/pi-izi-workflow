# Data flow шага 6: требования → FRD по слоям над матрицей трассируемости

Что здесь: концептуальный дизайн шага 6 и data-flow step by step после переделки v2 и раскладки
на модули-папки. Форма — `steps/brd/data-flow.md`. Поглотил `docs/data-flow.md` (удалён);
`docs/passes.md` и `docs/passes-data-flow.md` остаются.

Правило, вокруг которого построено всё: **прожарка судится двусторонней матрицей
трассируемости** (IEEE 29148). Прямое направление: каждое требование → носитель («ничего не
упущено»). Обратное: каждый модуль изменения → требование-обоснование («ничего не выдумано»).

**Состояние на 27.08.2026.** Все шесть пластов доказаны живыми прогонами: eddi DOS-535 —
frd.xml продвинут (13 дельт, критик APPROVE); quarkus FRUIT-1 — frd.xml продвинут (поиск по
части имени, критик APPROVE, полный суд зелёный). Раскладка на модули-папки закрыта
(`intake-backlog.md`, тикеты 01–09), линия 542/542.

---

## Концептуальный дизайн: один шаг, одна голова, шесть модулей-пластов

Шаг 6 — ОДИН шаг хоста: `intake` в `ext/state.mjs::STEPS`, голова `intake.step.mjs`
(`id, next, fold`), порции-пласты. Шесть пластов — НЕ подшаги-шаги (как `brd/normalize`),
а папки-МОДУЛИ: у пласта свой наряд и свой слайс сборки наряда, но порция, круги и
маршрутизация принадлежат голове. Прецедент папки-модуля без `.step.mjs` — `steps/brd/hits/`,
`steps/brd/spread/`.

**Почему не подшаги-шаги.** Починки intake ходят ЧЕРЕЗ пласты, и это доказанные живыми
прогонами механизмы: rtm-блокеры с coverage уезжают на owners (V2), F19 с critic — на
contracts (T70), вопросы артефакта — в ask-рельсу (T64), lookup-справка — скриптом в наряд
(T69). Всё это — решения ОДНОЙ головы над порциями; подшаги-шаги заставили бы переносить
маршрутизацию в обёртку `workflows/izi.js` и переизобретать её заново.

```
steps/intake/
  intake.step.mjs      ГОЛОВА: id "intake"; порции-пласты; маршрутизация T64/T69/T70; promote
  intake.md            РОЛЬ (одна на все пласты; реестр ROLES["intake"])
  frd.mjs (frd.test)   грамматика FRD, checkFrd, RULE_PASS — общее ядро (как brd.mjs у шага 2)
  rtm.mjs (rtm.test) · rtm-build.mjs      матрица: разбор, двусторонний суд, сборка скриптом
  map.mjs · lookup.mjs · cut.mjs · inputs.mjs · route.mjs · judge.mjs   общие ядра
  order.mjs (order.test)                  ГОЛОВА-СБОРЩИК нарядов: общие слоты + справка T69
                                           + слайс пласта по карте + тотальность (дыра = отказ)
  scenarios/     order-scenarios.tpl · order.mjs (слайс {BRD}{NORMALIZED}) · order.test.mjs
  owners/        order-owners.tpl · order.mjs (слайс {CANDIDATES}{BLUEPRINT}{ANALOGUE}{TYPES},
                 запись intake-b0.json и скелета rtm.md) · b0.mjs (кандидаты) · тесты
  contracts/     order-contracts.tpl · order.mjs ({OWNERS}{MAPSLICE}{DELTA_FORMS}) · тест
  data-failures/ order-data-failures.tpl · order.mjs ({BRD}{NORMALIZED}{SOURCES}) · тест
  coverage/      order-coverage.tpl · order.mjs ({OWED}) · тест
  critic/        order-critic.tpl · order.mjs ({BRD}="") · тест
  one/           small.mjs (порог isSmall) · order-one.tpl · order.mjs (слайс {CANDIDATES}
                 {BLUEPRINT}{ANALOGUE}{TYPES}{OWED}{SOURCES}{BRD}{NORMALIZED} + запись
                 intake-b0.json и скелета rtm.md) · тесты — укороченный трек, раздел ниже
  component/     intake.component.test.mjs — ОДИН компонентный тест на шаг
  docs/          passes.md, passes-data-flow.md — грамматики пластов
```

Имя слайса — `order.mjs`: шов S4 (`ext/design.test.mjs`) читает слоты из файлов с basename
`order*.mjs` шага, как у `steps/brd/anchors/order.mjs`. Интерфейс слайса один для всех шести:
`orderSlice(state, previous)` → `{ "{СЛОТ}": текст }`.

---

## Шаг 6 целиком

```
.agent/brd.md  ·  .agent/normalized.md  ·  .agent/appgraph.xml  ·  .agent/answers.md
  │                    вход: требование + карта + ответы оператора
  │ 🟢 1 scenarios     требование → use cases (актёры, шаги, ветки)       роль
  ▼
frd~scenarios.xml      слой 1: <frd goal> <actor> <usecase> <step> <ext>
  │ 🟢 2 owners        каждое требование → модуль-владелец                 роль + скрипт b0
  ▼                                                          скрипт собирает rtm.md ПОСЛЕ роли
frd~owners.xml         слой 2: + <owner step node> <question> · rtm.md · intake-b0.json
  │ 🟢 3 contracts     владельцы → формы дельт + сценарии проводки          роль
  ▼
frd~contracts.xml      слой 3: + <delta op form node from to> <scenario> <touched>
  │ 🟢 4 data-failures величины: поля, отказы, нфт                          роль
  ▼
frd~data-failures.xml  слой 4: + <field> <failure> <nfr>
  │ 🟢 5 coverage      carried-строки + двусторонний суд матрицы             роль + скрипт rtmJudge
  ▼
frd~coverage.xml       слой 5: + <carried req by> · rtmJudge forward/backward
  │ 🟢 6 critic        последний взгляд: исполнимость, ≤3 блокеров           роль
  ▼
frd~critic.xml         слой 6: + <critique verdict>  → promote → .agent/frd.xml
```

Слои накопительные: каждый следующий несёт принятые предыдущие (модель дописывает свой слой,
не переписывая чужие — «Do not touch the layers already written» в наряде). PREVIOUS-слот
даёт роли предыдущий слой; на починке — свой staging (T44).

---

## 🟢 1 — scenarios (требование → use cases)

```
модуль   scenarios/ — слайс {BRD} {NORMALIZED}
вход     .agent/brd.md (R1-Rn + аналог) · .agent/normalized.md · .agent/answers.md
наряд    order-scenarios.tpl: TASK + DATA (brd, normalized, answers) + two-filter
выход    frd~scenarios.xml: <frd goal> <actor> <usecase> <pre> <post> <step> <ext> <question>
суд      F1 (актёр/гарантия/шаги) · F6c (разные концы)
цена     один вызов: eddi ~90 с; quarkus 140 с / 14,7k in / 5,2k out
```

## 🟢 2 — owners (требование → модуль-владелец)

```
модуль   owners/ — слайс {CANDIDATES} {BLUEPRINT} {ANALOGUE} {TYPES}; ядро b0.mjs
вход     frd~scenarios.xml · appgraph.xml · graph-computed.xml · anchors.json · brd.md · answers.md
скрипт   ДО роли:   b0Of → intake-b0.json (кандидаты шаг×карта, IDF, via-edge, спорность)
                   + blueprintOf (чертёж ядра аналога) + скелет rtm.md
         ПОСЛЕ роли: writeRtmFromArtifact → rtm.md (матрица из owner-строк СКРИПТОМ —
                   роль с одним write не может писать два файла)
суд      F17a (шаг без владельца/вопроса) · F17b (узел существует) · F17c (спорный→вопрос)
         F17d (функция аналога унаследована)
цена     eddi 2 круга (споры → вопросы оператора → круг 2); quarkus 2 круга, 321+323 с
```

## 🟢 3 — contracts (формы дельт + сценарии проводки)

```
модуль   contracts/ — слайс {OWNERS} {MAPSLICE} {DELTA_FORMS}
вход     frd~owners.xml · appgraph.xml (срез ролей/api выбранных узлов)
выход    frd~contracts.xml: + <delta op form node from to new> <scenario> <touched>
суд      F2/F3/F4/F7/F10/F14/F17e; F19 (владелец RTM без дельты — с T70 уходит СЮДА на починку)
цена     eddi 82 с
```

Формы — про КОНТРАКТ: `Added` = контракт вырос (может быть на существующем файле);
`new="yes"` = файл создаётся. Дерево (шаг 9B) переведёт: узел в карте → `Changed`.

## 🟢 4 — data-failures (величины: поля, отказы, нфт)

```
модуль   data-failures/ — слайс {BRD} {NORMALIZED} {SOURCES}
вход     frd~contracts.xml · brd.md · normalized.md · answers.md
суд      F5 (источник числа) · F6/F6d (карта отказов↔ветки) · F15 (status="0") · F16 (перечни)
цена     eddi 2 круга (F16 resourceType → починка); quarkus 1379 с — сетевая аномалия
```

## 🟢 5 — coverage (carried + двусторонний суд матрицы)

```
модуль   coverage/ — слайс {OWED} (R-id из brd.md); суд — общее ядро rtm.mjs (rtmJudge)
вход     frd~data-failures.xml · brd.md · rtm.md · answers.md · anchors.json · карта
скрипт   FORWARD: R без owners и без questions (exemption: define/set/name/constrain)
         BACKWARD: b1 зеркало слоя · b2 точка вызова (проводник из другого пакета, T68-3)
                   b3 кластер (ДЕДУП по файлу) · b4 ответ назвал
суд      F11 (разность R-id списков) · F8 + rtmJudge
маршрут  rtm:-блокеры → OWNERS (todo + FEEDBACK), coverage → todo БЕЗ них
цена     eddi 77 с + круги owners-починки
```

## 🟢 6 — critic (исполнимость, последний взгляд)

```
модуль   critic/ — слайс {BRD}="" (данные критика — весь артефакт в {PREVIOUS})
суд      Полный суд всех правил (forPass до последнего) + зелёный критик → promote
цена     eddi 2 круга (F19 → contracts, T70); quarkus 70 с с первого круга
```

---

## Рельса вопроса (сквозная, T64 + T75)

```
вопрос РОЛИ (kind="question") ИЛИ вопрос В АРТЕФАКТЕ (<question> на непокрытом шаге)
  → pending.json (вопросы с номерами) + state.question      [ДО паузы]
  → next() эмитит ask: headless — question.txt/answer.txt; pi — TUI-диалог
  → ответы ложатся в answers.md ОБМЕННЫМ форматом <exchange><question_n>/<answer_n> (T75:
    писатель и читатель одной грамматики — core/answers.mjs; сырые строки никто не читает)
  → fold сверяет ПО ТЕКСТУ ВОПРОСА: все вопросы покрыты ответами → вопрос снят,
    круг НЕ потрачен, следующий наряд несёт {ANSWERED}
```

## Круги починки и маршрутизация блокеров

```
зелёный пласт → следующий
красный       → round+1, blockers как FEEDBACK, previous = свой staging (T44)
rtm:-блокеры  → owners (todo + FEEDBACK), coverage остаётся todo БЕЗ них
F19-блокеры   → contracts (todo + FEEDBACK), круг текущего НЕ тратится (T70: критик не
                пишет дельт — 5 кругов до смерти бюджета закрыли этот маршрут)
lookup-рельса → справка СКРИПТОМ: resolveItems → <exchange>… нет: в наряд документом
                map-lookup; бюджет lookupLoops=2, третий — escalate (T69)
все зелёные   → critic → APPROVE → promote → .agent/frd.xml
```

---

## Маленькая задача (T76, backlog-small-task.md) — укороченный трек intake

СДЕЛАНО (тикеты 01–06; линия 553/553). Повод — замер `component-tests/quarkus-rest-json-app-v2-t1-3-test.md`:
тривиальная задача (3 строки заказа, 9 java-файлов) прошла всю механику шести пластов — 15 вызовов
LLM, ~203k биллинговых токенов, ~45 мин. Раскладка:

```
steps/intake/one/
  small.mjs (small.test)   порог isSmall(state): узлов карты ≤ 32 И R-строк brd.md ≤ 5;
                            пустая карта или пустой brd → false — нет данных решать,
                            идём полным путём (отсутствие — случай, а не пустое значение)
  order.mjs (order.test)   слайс порции one: {CANDIDATES}{BLUEPRINT}{ANALOGUE}{TYPES} (как
                            owners) + {OWED} (как coverage) + {SOURCES} (как data-failures)
                            + {BRD}{NORMALIZED} (как scenarios); побочно пишет материалы
                            суда: .agent/intake-b0.json (b0Of) и скелет .agent/rtm.md из
                            R-строк, БЕЗ затирания начатого
  order-one.tpl            наряд одного вызова: «принеси весь FRD целиком» — use cases,
                            владельцы (или <question> на спорных), дельты-формы,
                            величины/отказы, carried-строка на каждое R; «закрытых слоёв
                            нет — файл твой целиком»; самокритика в конце (как critic)
```

Пороги — константы в коде (`MAX_NODES = 32`, `MAX_REQUIREMENTS = 5`), откалиброваны ЖИВЫМИ
КАРТАМИ прогонов, а не деревом репозитория (27.08, после инцидента с порогом 12): quarkus —
24 узла карты (12 файлов в двух префиксных вариантах; карта дублирует пути — до дедупа это
честная цена) и 3 R-строки → true с запасом ×1,3; eddi — 71 узел обследованного фокуса и
16 R-строк → false с запасом ×2,2. Конфигом не являются: число, которое можно подкрутить без
нового эталона, не имеет источника.

Развилка — на ПЕРВОМ `next()` головы (`intake.step.mjs`), до любого наряда, 0 токенов:

```
isSmall(state)?
  ├─ НЕТ → шесть пластов, как описано выше (ничего не меняется)
  └─ ДА  → say «маленькая задача: один вызов», portions = [one] (staging frd~one.xml;
           список порций укороченного трека — frd.mjs::PASSES_ONE, читает его же и recon)
           → наряд order-one.tpl (слайс в карте SLICES головы-сборщика — седьмой)
           → ПОЛНЫЙ двор одним прогоном: judgePass("one") не сужает (forPass не знает
             «one» → судит всеми F-правилами) + rtmJudge (матрица пересобирается из
             owner-строк артефакта тем же writeRtmFromArtifact)
           зелёный → тот же promote (route.mjs) → .agent/frd.xml; <question> в артефакте —
                     та же ask-рельса T64: круг НЕ тратится, круг 2 несёт {ANSWERED}
                     и свой черновик как {PREVIOUS}
           красный → ПАДЕНИЕ НА ПОЛНЫЙ ПУТЬ: portions = шесть пластов, все todo и round 1
                     (круг головы НЕ тратится); блокеры разносятся по passOfBlocker —
                     код правила даёт пласт (F3c → contracts, F5 → data-failures, …),
                     rtm:-строки → owners (маршрут coverage), строки без распознанного
                     кода → scenarios с пометкой [one]; черновик frd~one.xml остаётся
                     на диске
```

resume: `frd~one.xml` на диске без `.agent/frd.xml` — полоса шла одним вызовом и умерла до
продвижения (сбой, пауза). `ext/recon.mjs` поднимает порцию one todo (список `PASSES_ONE` из
frd.mjs — то же место, что и PASSES), черновик едет роли как {PREVIOUS} — resume не молчит и
не начинает полный путь с scenarios.

Инварианты (нарушить нельзя): суд один и тот же — меняется число вызовов модели, НЕ число
проверок; артефакт и потребители одни (weight/ripple/plan не знают, каким путём собран
frd.xml); быстрый путь не прячет дефект — красный уходит на полный путь.

Целевые метры (живой прогон — за пределами бэклога, отдельное решение оператора): на
quarkus-классе задач ожидание ≤ ⅓ токенов и ≤ ⅓ времени intake против замера 26.08 (15
вызовов LLM, ~203k токенов, ~45 мин; цель — вызовов intake ≤ 2). Сверка метров по правилам
приёмки `component-tests/steps/intake/test-plan.md`.

---

## Что уезжает дальше (шаги 7–9)

| поле шага 6 | кто потребитель | во что превращается |
|---|---|---|
| `.agent/frd.xml` — дельты | шаг 7 weight | Added→minor, Changed→major, Fixed→patch |
| дельты + touched | шаг 8 ripple | семена подграфа изменения |
| дельты + сценарии | шаг 9 plan/tree | модули дерева, маршруты сценариев |
| `frd.usecases[].exts` | шаг 9 plan/flows | ветки отказа в потоках |
| `frd.fields` | шаг 9 plan/tree | домены полей в контрактах |
| `rtm.md` | оператор (приёмка) | доказательство полноты: строка=упущено, сирота=выдумано |
