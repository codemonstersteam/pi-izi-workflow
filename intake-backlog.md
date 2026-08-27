# Бэклог раскладки: шаг 6 (intake) — пласты становятся модулями-папками

Нарезка утверждённого плана раскладки `steps/intake` на тикеты. Форма — `brd-backlog.md`
(у него — от `redesign-backlog.md`). Концептуальный дизайн и data-flow — `steps/intake/data-flow.md`
(рождается тикетом 10; до того живёт в этом файле, раздел «Дизайн»).

**Граница поставки.** Только `steps/intake/**`. `ext/state.mjs`, `ext/bridge.mjs`, `ext/roles.mjs`,
`workflows/izi.js`, `steps/`-соседи — НЕ МЕНЯЮТСЯ; их неизменность входит в приёмку последнего
тикета (git diff пуст по этим путям).

**Что переделывается.** Ничего по существу. Это рефакторинг-раскладка: шесть пластов intake
(scenarios → owners → contracts → data-failures → coverage → critic) сегодня — порции одной
головы с файлами в одной плоской папке; после раскладки каждый пласт — папка-модуль со своим
нарядом и слайсом сборки наряда. Поведение не меняется вовсе: **линия `node --test` зелёная
ЦЕЛИКОМ (сейчас 533/533) — инвариант КАЖДОГО тикета, проверяется после каждого.**

**Почему одна голова, а не подшаги-шаги как brd/normalize.** Починки intake ходят ЧЕРЕЗ пласты:
rtm-блокеры с coverage уезжают на owners (V2), F19 с critic — на contracts (T70), вопросы
артефакта — в ask-рельсу (T64). Всё это — логика ОДНОЙ головы над порциями; разрезав на шаги
хоста, пришлось бы переносить доказанную живыми прогонами маршрутизацию в обёртку `izi.js`.
Прецедент папки-модуля без своего `.step.mjs` — `steps/brd/hits/` и `steps/brd/spread/`.

## Дизайн (цель тикета 10 — перенести в `steps/intake/data-flow.md`)

```
steps/intake/
  intake.step.mjs      ГОЛОВА: id "intake"; порции-пласты; маршрутизация T64/T69/T70; promote
  intake.md            РОЛЬ (одна на все пласты; реестр ROLES["intake"] не меняется)
  frd.mjs · frd.test.mjs          грамматика FRD, checkFrd, RULE_PASS — общее ядро (как brd.mjs)
  rtm.mjs · rtm.test.mjs · rtm-build.mjs    матрица трассируемости: разбор + суд + сборка скриптом
  map.mjs · map.test.mjs · lookup.mjs · lookup.test.mjs · cut.mjs · inputs.mjs · route.mjs · judge.mjs   общие ядра
  docs/data-flow.md    концептуальный дизайн + step-by-step + место форка T76 (docs/ — каталог, который реестр ролей не объявляет)
  scenarios/     order-scenarios.tpl · order.mjs (слайс) · order.test.mjs
  owners/        order-owners.tpl · order.mjs (слайс) · b0.mjs · b0.test.mjs
  contracts/     order-contracts.tpl · order.mjs (слайс) · order.test.mjs
  data-failures/ order-data-failures.tpl · order.mjs (слайс) · order.test.mjs
  coverage/      order-coverage.tpl · order.mjs (слайс) · order.test.mjs
  critic/        order-critic.tpl · order.mjs (слайс) · order.test.mjs
  component/     intake.component.test.mjs — ОДИН компонентный тест на шаг
  docs/          passes.md, passes-data-flow.md остаются как есть
```

Интерфейс модуля-папки один для всех шести (имя — `order.mjs`, как `steps/brd/anchors/`:
шов S4 `ext/design.test.mjs` читает слоты из файлов с basename `order*.mjs` — слайс обязан
носить это имя): `order.mjs` экспортирует
`orderSlice(state, prev)` → `{ "{СЛОТ}": "текст", … }` — строки слотов своего пласта.
`order.mjs` остаётся головой-сборщиком: подставляет общие слоты ({STAGING} {PREVIOUS}
{FEEDBACK} {CLOSED} {ANSWERED} {ANSWERS} {CHECK} + справку lookup T69), зовёт слайс пласта,
проверяет тотальность (дыра слота — отказ). Перенос `git mv` — история сохраняется.

## Общие правила всех тикетов

1. **Verify = `node --test` зелёный ЦЕЛИКОМ.** Красное — стоп, тикет не закрыт, чинить до зелёного.
2. **Никаких изменений поведения.** Дифф каждого тикета — переносы файлов, импорты, актуализация
   MODULE_CONTRACT/FUNCTION_CONTRACT (имя модуля и путь). Логика не переписывается.
3. **Не трогать:** `ext/**`, `workflows/**`, `standards/**`, `component-tests/**`,
   `steps/{task,brd,scope,graph,plan,weight,ripple,design,review}/**`.
4. После каждого тикета — короткий отчёт: что перенесено, что правлено, результат линии.

**Волны работ** (по `blocked_by`):

```
волна 1   01                      каркас: папки + .tpl + пути order.mjs
волна 2   02 03 04 05 06 07       слайсы шести пластов (независимы между собой)
волна 3   08 09                   голова-сборщик + чистка головы шага
волна 4   10 11                   data-flow.md + финальная сверка целостности
```

---

### TICKET 01 — каркас: шесть папок пластов, наряды переезжают к своим пластам

```yaml
id: 01
type: refactor
slice: intake/каркас
blocked_by: []
inputs: [steps/intake/order-*.tpl (6 шт.), steps/intake/order.mjs]
outputs: [steps/intake/{scenarios,owners,contracts,data-failures,coverage,critic}/order-*.tpl, steps/intake/order.mjs]
io: fs
```

**Суть тикета одной фразой.** Каждый наряд лежит в папке своего пласта; `order.mjs` находит
шаблон по карте пласт→папка.

**Инструкция:**
- `mkdir steps/intake/{scenarios,owners,contracts,data-failures,coverage,critic}`;
- `git mv` каждого `order-<pass>.tpl` в свою папку (имя файла не менять);
- `order.mjs`: функция `tpl(pass)` читает `./${pass}/order-${pass}.tpl` вместо `./order-${pass}.tpl`
  (import.meta.url); актуализировать MODULE_CONTRACT (пути шаблонов — в подпапках пластов);
- прогнать линию.

**Verify:** `node --test` — зелёный целиком.
**Acceptance:** все шесть .tpl в своих папках; наряды собираются байт-в-байт как до переноса
(юниты order.test.mjs зелёные без правок их ожиданий, кроме путей чтения фикстур, если такие есть).

---

### TICKET 02 — слайс scenarios: {BRD} {NORMALIZED} переезжают в модуль пласта

```yaml
id: 02
type: refactor
slice: intake/scenarios
blocked_by: [01]
inputs: [steps/intake/order.mjs (блок if (pass === "scenarios")), steps/brd/brd.mjs]
outputs: [steps/intake/scenarios/order.mjs, steps/intake/scenarios/order.test.mjs]  # СДЕЛАНО (переименовано из scenarios.mjs по шву S4)
io: fs
```

**Суть.** Блок `if (pass === "scenarios") { slots["{BRD}"] = brdText(state); … }` из `order.mjs`
становится функцией `orderSlice(state, prev)` в `scenarios/scenarios.mjs`; `order.mjs` зовёт её.
MODULE_CONTRACT нового модуля по standards/code.md; юнит: слайс возвращает оба слота на фикстуре
эталона (`component-tests/etalon-eddi/.agent/brd.md`, `normalized.md`).
**Verify:** линия зелёная. **Acceptance:** блок if из order.mjs удалён, слоты приходят из слайса.

---

### TICKET 03 — слайс owners: кандидаты, чертёж, типы и b0 переезжают в модуль пласта

```yaml
id: 03
type: refactor
slice: intake/owners
blocked_by: [01]
inputs: [steps/intake/order.mjs (блок owners), steps/intake/b0.mjs, steps/intake/b0.test.mjs, steps/intake/cut.mjs (b0Of, blueprintOf, typesOf)]
outputs: [steps/intake/owners/order.mjs, steps/intake/owners/order.test.mjs, steps/intake/owners/b0.mjs, steps/intake/owners/b0.test.mjs]
io: fs
```

**Суть.** Самый большой слайс: {CANDIDATES} {BLUEPRINT} {ANALOGUE} {TYPES} + запись
`intake-b0.json` и скелета `rtm.md` — всё в `owners/owners.mjs` (orderSlice). Ядро кандидатов
`b0.mjs`/`b0.test.mjs` — `git mv` в `owners/` (это ядро ТОЛЬКО этого пласта). Импортёры
`b0.mjs` (grep по репо: cut.mjs? judgeArgs? component-тест) переключить на новый путь.
**Verify:** линия зелёная. **Acceptance:** order.mjs не знает про кандидатов; b0 живёт в owners/.

---

### TICKET 04 — слайс contracts: {OWNERS} {MAPSLICE} {DELTA_FORMS}

```yaml
id: 04
type: refactor
slice: intake/contracts
blocked_by: [01]
inputs: [steps/intake/order.mjs (блок contracts), steps/intake/frd.mjs (parseFrd, FRD_FORM)]
outputs: [steps/intake/contracts/order.mjs, steps/intake/contracts/order.test.mjs]
io: fs
```

**Суть.** Блок `if (pass === "contracts")` → `contracts/contracts.mjs::orderSlice`:
таблица владельцев машиной из prev-слоя, срез карты, формы дельт. Юнит на фикстуре слоя
owners (`component-tests/steps/intake/2-owners/out/frd~owners.xml`).
**Verify:** линия зелёная. **Acceptance:** как в 02.

---

### TICKET 05 — слайс data-failures: {BRD} {NORMALIZED} {SOURCES}

```yaml
id: 05
type: refactor
slice: intake/data-failures
blocked_by: [01]
inputs: [steps/intake/order.mjs (блок data-failures), steps/intake/frd.mjs (FRD_FORM.sources)]
outputs: [steps/intake/data-failures/order.mjs, steps/intake/data-failures/order.test.mjs]
io: fs
```

**Суть.** Блок `if (pass === "data-failures")` → `datafailures.mjs::orderSlice`. Юнит: слайс
несёт {SOURCES} с легальными источниками чисел.
**Verify:** линия зелёная. **Acceptance:** как в 02.

---

### TICKET 06 — слайс coverage: {OWED} и подключение rtm-суда

```yaml
id: 06
type: refactor
slice: intake/coverage
blocked_by: [01]
inputs: [steps/intake/order.mjs (блок coverage), steps/intake/cut.mjs (brdText)]
outputs: [steps/intake/coverage/order.mjs, steps/intake/coverage/order.test.mjs]
io: fs
```

**Суть.** Блок `if (pass === "coverage")` ({OWED} — список R-id из brd.md) → `coverage.mjs::orderSlice`.
Сам rtm-суд (rtm.mjs) остаётся общим ядром в корне — им пользуются и судьи других пластов (F19).
**Verify:** линия зелёная. **Acceptance:** как в 02.

---

### TICKET 07 — слайс critic: рубрика

```yaml
id: 07
type: refactor
slice: intake/critic
blocked_by: [01]
inputs: [steps/intake/order.mjs (блок critic)]
outputs: [steps/intake/critic/order.mjs, steps/intake/critic/order.test.mjs]
io: fs
```

**Суть.** Блок `if (pass === "critic")` (сегодня зануляет {BRD}) → `critic.mjs::orderSlice`.
Юнит: слайс возвращает пустой {BRD} (данные критика — весь артефакт в {PREVIOUS}).
**Verify:** линия зелёная. **Acceptance:** как в 02.

---

### TICKET 08 — order.mjs становится головой-сборщиком над шестью слайсами

```yaml
id: 08
type: refactor
slice: intake/сборка
blocked_by: [02, 03, 04, 05, 06, 07]
inputs: [steps/intake/order.mjs, steps/intake/<pass>/order.mjs (6 слайсов)]
outputs: [steps/intake/order.mjs]
io: fs
```

**Суть.** Все блоки `if (pass === …)` удалены; orderText = общие слоты + справка lookup (T69,
остаётся здесь же) + `orderSlice(state, previous)` пласта по карте pass→модуль. Тотальность
(дыра слота — отказ) и семантика PREVIOUS/FEEDBACK — без изменений. MODULE_CONTRACT описывает
новую роль головы.
**Verify:** линия зелёная + юнит на тотальность (недоподставленный слот даёт {why}).
**Acceptance:** в order.mjs нет знаний о содержании пластов; длина файла заметно падает.

---

### TICKET 09 — чистка головы шага и импортёров

```yaml
id: 09
type: refactor
slice: intake/голова
blocked_by: [08]
inputs: [steps/intake/intake.step.mjs, все импортеры перенесённых модулей]
outputs: [steps/intake/intake.step.mjs, точечные правки импортов]
io: fs
```

**Суть.** Актуализировать импорты и контракты: intake.step.mjs (b0 → owners/, пути), judge.mjs,
cut.mjs (если b0Of переехал — реэкспорт или прямой импорт), component/intake.component.test.mjs.
Проверить grep'ом, что ни один файл не импортирует `steps/intake/b0.mjs` по старому пути.
**Verify:** линия зелёная. **Acceptance:** grep по старым путям пуст; MODULE_CONTRACT актуальны.

---

### TICKET 10 — data-flow.md: концептуальный дизайн шага на его месте

```yaml
id: 10
type: docs
slice: intake/документация
blocked_by: [09]
inputs: [раздел «Дизайн» этого бэклога, steps/brd/data-flow.md (форма), backlog-small-task.md, component-tests/quarkus-rest-json-app-v2-t1-3-test.md (замеры цен)]
outputs: [steps/intake/docs/data-flow.md]  # docs/, не корень: корень intake — объявленный каталог ролей, хост сканирует каждый .md как роль (шов vocabulary.test, урок 24.08)
io: none
```

**Суть.** `steps/intake/docs/data-flow.md` по образцу `steps/brd/data-flow.md`: (1) концептуальный
дизайн — один шаг, одна голова, шесть модулей-пластов, общие ядра, почему не подшаги-шаги
(маршрутизация T64/T69/T70); (2) step-by-step: для каждого пласта in → наряд (слоты) →
артефакт-слой → суд (правила RULE_PASS) с ценой из замеров quarkus/eddi; (3) маршрутизация
блокеров между пластами; (4) раздел «Маленькая задача (T76, backlog-small-task.md)»: развилка
isSmall на первом next, укороченный трек, слияние в promote, падение на полный путь —
место будущего форка в архитектуре показано, реализация НЕ входит.
Старый `docs/data-flow.md` поглотить новым файлом и удалить (дублей нет); docs/passes*.md остаются.
**Verify:** `node --test` (файлы не код, но линия обязана остаться зелёной).
**Acceptance:** каждый файл целевой раскладки упомянут; форк T76 показан на схеме.

---

### TICKET 11 — финальная сверка целостности

```yaml
id: 11
type: verify
slice: intake/приёмка
blocked_by: [10]
inputs: [всё дерево steps/intake]
outputs: [отчёт тикета]
io: fs
```

**Суть.** Сверка с разведкой: все 27 файлов исходной плоской раскладки имеют место в новой
(перенесены или поглощены); `git diff --name-only` НЕ содержит `ext/**`, `workflows/**`,
`standards/**`, соседние `steps/**`; линия зелёная; `git status` без неожиданных файлов.
**Verify:** `node --test` зелёный целиком.
**Acceptance:** отчёт: таблица «файл → куда делся», список изменённых путей вне steps/intake
(должен быть пуст), вердикт.
