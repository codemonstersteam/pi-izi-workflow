# Маленькая задача: укороченный трек intake — ОДИН вызов вместо шести, суд ТОТ ЖЕ

База: коммит 46565bf (шаг 6 разложен на модули-папки; линия node --test = 542/542).
Замер-повод: `component-tests/quarkus-rest-json-app-v2-t1-3-test.md` — тривиальная задача
(3 строки заказа, 9 java-файлов) прошла через всю механику: 15 вызовов LLM, ~203k биллинговых
токенов, ~45 мин. Концептуальный дизайн шага — `steps/intake/docs/data-flow.md`, раздел
«Маленькая задача».

**Граница поставки.** Только `steps/intake/**` плюс ОДНА правка в `ext/recon.mjs` (тикет 05).
Всё остальное — `ext/**`, `workflows/**`, `standards/**`, `component-tests/**`, соседние
`steps/**` — НЕ трогать.

**ЖЕЛЕЗНЫЕ ПРАВИЛА (читать перед каждым тикетом):**
1. После КАЖДОГО тикета: `node --test` — зелёный ЦЕЛИКОМ (542/542 на старте). Красное — стоп,
   чинить до зелёного. Тесты не переписывать под решение (легально только добавлять НОВЫЕ тесты
   и обновлять ПУТИ, если файл переехал).
2. Каждый новый/изменённый модуль несёт MODULE_CONTRACT, каждая экспортная функция —
   FUNCTION_CONTRACT (форма — standards/code.md; пример живого слайса —
   `steps/intake/scenarios/order.mjs`).
3. Имя слайса — `order.mjs` (шов S4 `ext/design.test.mjs` читает слоты .tpl только из файлов
   с basename `order*.mjs`). Имя шаблона — `order-<pass>.tpl` в папке пласта.
4. Стоп-условие: инструкция противоречит коду — НЕ обходить молча, остановиться и описать.

## Архитектура (куда встраивается)

Шаг 6 сегодня — ОДИН шаг хоста с головой `steps/intake/intake.step.mjs` и шестью
порциями-пластами (PASSES в `steps/intake/frd.mjs:367`). Укороченный трек — СЕДЬМОЙ «пласт»
`one`, который замещает собой все шесть на маленьких задачах. Голова полосы `workflows/izi.js`,
словарь STEPS, реестр ROLES — НЕ меняются: форк живёт на первом `next()` головы.

```
normalized.md + карта (appgraph.xml)
  │  скрипт isSmall (0 токенов): узлов карты ≤ 32 И R-строк в brd.md ≤ 5 ?
  ├─ НЕТ → полный путь: 6 порций, 6 нарядов, суд после каждого (как сегодня)
  └─ ДА  → ОДНА порция "one": слайс one/order.mjs (пишет материалы суда как owners)
           + наряд one/order-one.tpl (все шесть решений сразу)
           → staging/frd~one.xml → ПОЛНЫЙ двор одним прогоном
  ЗЕЛЁНЫЙ → promote → .agent/frd.xml (тот же route.mjs)
  <question> в артефакте → та же ask-рельса (T64), ответы {ANSWERED}, круг 2
  КРАСНЫЙ → ПАДЕНИЕ НА ПОЛНЫЙ ПУТЬ: порция one гаснет, порции 6 пластов todo,
            блокеры разносятся по пластам (тикет 03)
```

Инварианты (нарушить нельзя): суд один и тот же (меняется число вызовов модели, НЕ число
проверок); артефакт и потребители одни (weight/ripple/plan не знают, каким путём собран
frd.xml); быстрый путь не прячет дефект (красный → полный путь).

**Волны:** 01 → 02 → 03 → 04 → 05 → 06.

---

### TICKET 01 — порог isSmall: скрипт решает, маленькая ли задача

```yaml
id: 01
type: feature
slice: intake/one
blocked_by: []
inputs: [steps/intake/map.mjs (parseMap, mapOf), steps/intake/cut.mjs (brdText)]
outputs: [steps/intake/one/small.mjs, steps/intake/one/small.test.mjs]
io: fs
```

**Суть.** `isSmall(state) → boolean`: `mapOf(state).nodes.size <= 12` И
`[...brdText(state).matchAll(/^R\d+ /gm)].length <= 5`. Пороги — константы в коде
(`MAX_NODES = 12`, `MAX_REQUIREMENTS = 5`), откалиброваны двумя эталонами: quarkus
(карта 24 узла — 12 файлов в двух префиксных вариантах, 3 строки → true, запас ×1,3) и
eddi (карта 71 узел обследованного фокуса, 16 строк → false, запас ×2,2). Перекалибровано
27.08: первый порог 12 был посчитан по java-файлам, а порог читает УЗЛЫ КАРТЫ — живой прогон
ушёл в полный путь и поймал это. Конфигом не делаем.
Пустая карта или пустый brd → false (нет данных решать — идём полным путём).
**Юниты (обе стороны порога):** 9 узлов/3 строки → true; 13 узлов → false; 6 строк → false;
пустая карта → false. Фикстуры — в тесте строками (mapxml минимальный), эталон не нужен.
**Verify:** `node --test` зелёный. **Acceptance:** MODULE_CONTRACT/FUNCTION_CONTRACT на месте.

---

### TICKET 02 — слайс one: наряд одного вызова и материалы суда

```yaml
id: 02
type: feature
slice: intake/one
blocked_by: [01]
inputs: [steps/intake/owners/order.mjs (образец: {CANDIDATES}{BLUEPRINT}{ANALOGUE}{TYPES} + запись intake-b0.json и скелета rtm.md), steps/intake/coverage/order.mjs ({OWED}), steps/intake/cut.mjs, steps/intake/order.mjs (карта SLICES)]
outputs: [steps/intake/one/order-one.tpl, steps/intake/one/order.mjs, steps/intake/one/order.test.mjs]
io: fs
```

**Суть.** По образцу `steps/intake/owners/order.mjs` — слайс `one/order.mjs::orderSlice(state, previous)`:

- слоты: `{CANDIDATES}` `{BLUEPRINT}` `{ANALOGUE}` `{TYPES}` (как owners — кандидаты и чертёж
  нужны для решения о владельцах) + `{OWED}` (R-id, как coverage) + `{SOURCES}`
  (легальные источники чисел, как data-failures) + `{BRD}` `{NORMALIZED}`;
- побочно пишет НА ДИСК материалы суда — те же, что owners: `.agent/intake-b0.json` (b0Of) и
  скелет `.agent/rtm.md` (R-строки с пустыми owners, БЕЗ затирания начатого);
- шаблон `one/order-one.tpl` — ТЕКСТ наряда: одна задача «принеси весь FRD целиком» — use cases,
  владельцы (или `<question>` на спорных), дельты-формы, величины/отказы, carried-строки на
  каждое R; форма артефакта — грамматика `steps/intake/frd.mjs` (FRD_FORM/parseFrd);
  «не трогай принятых слоёв — их нет, файл твой целиком»; самокритика в конце (как critic).
  Слот `{STAGING}` = `.agent/staging/frd~one.xml`. Наряд пишется по мотивам шести существующих
  шаблонов (прочитай один-два: `scenarios/order-scenarios.tpl`, `owners/order-owners.tpl`).
- подключить в `steps/intake/order.mjs` карту SLICES: `"one"` → слайс (общие слоты и справка
  lookup достанутся ему автоматически — голова-сборщик уже так работает).

**Юниты:** слайс возвращает все слоты непустыми на фикстуре-строке (минимальный mapxml + brd);
intake-b0.json и скелет rtm.md записаны; слот в шаблоне без значения в слайсе → сборка даёт
`{why}` (тотальность головы — уже есть, проверить).
**Verify:** линия зелёная. **Acceptance:** S4 зелёный (слоты .tpl встречаются в one/order.mjs).

---

### TICKET 03 — голова: развилка на первом next и падение на полный путь

```yaml
id: 03
type: feature
slice: intake/голова
blocked_by: [02]
inputs: [steps/intake/intake.step.mjs, steps/intake/one/small.mjs, steps/intake/frd.mjs (PASSES, RULE_PASS, passOfBlocker)]
outputs: [steps/intake/intake.step.mjs]
io: fs
```

**Суть.** В `next()`, там где сегодня `portions: PASSES.map(...)` (intake.step.mjs:55, ветка
say первого хода): если `isSmall(state)` → portions = `[{ id: "one", staging: ".agent/staging/frd~one.xml", status: "todo", round: 1, blockers: "" }]`,
строка say упоминает «маленькая задача: один вызов». Иначе — как сегодня.

В `fold()`, ветка роли:
- `writeRtmFromArtifact` после зелёного конверта — как для owners/contracts (intake.step.mjs:150-158):
  добавить `p.id === "one"` к существующим условиям (матрица из owner-строк артефакта);
- `rtmJudge` подключить и для `p.id === "one"` (сегодня только coverage, intake.step.mjs:199);
- КРАСНЫЙ `one` → ПАДЕНИЕ НА ПОЛНЫЙ ПУТЬ: вместо своего round+1 порция one получает
  `status: "done"`-эквивалент... нет — порции не имеют done: СДЕЛАТЬ так: portions заменяются
  на ПОЛНЫЙ список шести пластов; блокеры разносятся: каждая строка блокера начинается с кода
  правила (F3c, F17a, …) — `passOfBlocker` из frd.mjs даёт пласт; строки `rtm:` → owners;
  строки без распознанного кода → первому пласту (scenarios) с пометкой. Порции получают
  `status: "todo"` + `blockers` = свои строки; круг головы НЕ тратится (round остаётся 1).
  Это обобщение уже существующих маршрутов T70 (F19→contracts) и coverage (rtm:→owners) —
  прочитай их в fold и делай ПО ОБРАЗЦУ.
- зелёный `one` → тот же promote, что у critic (найти ветку `p.id === "critic"` с promote
  в конце fold — добавить "one" рядом);

**Вопросы артефакта** (`<question>` на непокрытом шаге) — существующая ветка T64 работает для
любого пласта, не трогать.
**Verify:** линия зелёная. **Acceptance:** юниты ниже зелёные.

---

### TICKET 04 — компонентные швы укороченного трека

```yaml
id: 04
type: test
slice: intake/one
blocked_by: [03]
inputs: [steps/intake/component/intake.component.test.mjs (форма: form(), next, fold), steps/intake/one/*]
outputs: [steps/intake/component/intake.component.test.mjs (+3 теста)]
io: fs
```

**Суть.** Дописать в существующий компонентный тест ТРИ сценария (форма tmp-cwd как в тестах
T69/T70 этого же файла):
1. **маленькая задача → один наряд:** форма с 9 узлами карты и brd на 3 R → next() say с одной
   порцией one → role с нарядом, содержащим {CANDIDATES} и {OWED}; артефакт (валидный FRD по
   грамматике) → fold → promote: `.agent/frd.xml` записан.
2. **красный one → полный путь:** тот же вход, артефакт с дырой (например delta без сценария →
   F3c) → fold: порции стали шесть, contracts несёт F3c в blockers, round всех = 1 (круг не
   потрачен), frd.xml НЕ записан.
3. **большая задача → полный путь:** форма эталона eddi (существующая form() уже такая) →
   say с ШЕСТЬЮ порциями (существующие тесты это уже проверяют — тест только фиксирует, что
   isSmall на эталоне false).

**Verify:** линия зелёная. **Acceptance:** три сценария зелёные; реинтродукция: выключить
маршрутизацию из тикета 03 — сценарий 2 краснеет (проверить и вернуть).

---

### TICKET 05 — resume видит укороченный трек

```yaml
id: 05
type: feature
slice: intake/recon
blocked_by: [03]
inputs: [ext/recon.mjs (INTAKE_PASSES, строки 70-90), steps/intake/frd.mjs]
outputs: [ext/recon.mjs, steps/intake/frd.mjs (+экспорт PASSES_ONE)]
io: fs
```

**Суть.** Сегодня recon поднимает порции по `INTAKE_PASSES` (шесть имён) — `frd~one.xml` после
сбоя невидим, и resume молча начнёт полный путь с scenarios. Правка: `frd.mjs` экспортирует
`PASSES_ONE = Object.freeze(["one"])`; recon: если `frd~one.xml` существует и `.agent/frd.xml`
нет → порция `one` todo (артефакт — черновик круга починки). Это ЕДИНСТВЕННАЯ правка вне
steps/intake — она в бэклоге разрешена явно.
**Verify:** линия зелёная. **Acceptance:** юнит/компонент: tmp-cwd с frd~one.xml без frd.xml →
next() даёт роль one (не scenarios).

---

### TICKET 06 — документация и приёмка

```yaml
id: 06
type: docs
slice: intake/docs
blocked_by: [04, 05]
inputs: [steps/intake/docs/data-flow.md, component-tests/quarkus-rest-json-app-v2-t1-3-test.md]
outputs: [steps/intake/docs/data-flow.md]
io: none
```

**Суть.** Обновить раздел «Маленькая задача» в data-flow.md: раскладка one/ (small.mjs,
order.mjs, order-one.tpl), развилка в next(), падение на полный путь, resume-поведение,
пороги и их калибровка (quarkus/eddi). Обновить целевые метры: ожидание ≤ ⅓ токенов и ≤ ⅓
времени intake на quarkus-классе задач.
**Verify:** линия зелёная. **Acceptance:** раздел соответствует коду (имена файлов/функций
совпадают с сделанным).

---

## Живой прогон (за пределами бэклога — отдельное решение оператора)

После зелёной линии: quarkus-форма начисто (`sandbox/runbox/quarkus-rest-json-app-v2-t1-3`),
интерактивный pi + /izi, стоп по появлению frd.xml; сверка метров с замером 26.08
(`component-tests/quarkus-rest-json-app-v2-t1-3-test.md`, data-flow-таблица): цель —
вызовов intake ≤ 2, токенов intake ≤ ⅓. Расхождения с прошлым frd.xml разбираются с оператором
поимённо (правило приёмки тест-плана component-tests/steps/intake/test-plan.md).

---

## Отложено (НЕ делать в этом бэклоге): дедуп путей карты

Карта quarkus несёт каждый файл дважды (12 файлов × 2 префиксных варианта = 24 узла). Порог
32 калиброван ПО КАРТЕ КАК ЕСТЬ — это честно, но чинить надо причину, не подгонять порог:
дедуп путей в parseMap/сборке appgraph сожмёт 24 → 12, и тогда порог можно ужать до ~16 с
теми же эталонами. Отдельный тикет про качество карты, не про T76.
