# Шаг 4 `scope` — рой скаутов

Карточка шага — `docs/workflow.md` §3.4, обоснование — `docs/concept.md` («Разведка (шаги 3–5)»).
Здесь: что строится, каким кодом и как встаёт в `workflows/izi.js`.

**РЕАЛИЗОВАНО (S17).** Код — `steps/scope/{scout.md, order.survey.tpl, order.spine.tpl, part.mjs,
part.test.mjs}`, `core/xml.mjs`, `ext/index.mjs::{cells, checkPart}`, четвёртая фаза
`workflows/izi.js::scope`. Живой прогон в чужом проекте (quarkus `rest-json-quickstart`,
`/private/tmp/izi-sandbox-scope`), runId `dee73d00-7b6e-4e8f-9e43-5f8afd5eef04`: `track:"ok"`,
`cells=2 modules=18 gaps=0`, обе части промоутнуты в `.agent/graph-parts/`. Числа читаются из
`journal.json` (`function/scope-batch/s2/checkPart/1` → `{ok:true, modules:18}`), а не из того, что
напечатала модель. Источник истины — файлы среза, а не этот документ.

---

## 1. Что решает шаг

Шаг 3 порезал дерево репозитория на клетки. Шаг 5 сольёт части в `appgraph.xml` скриптом. Между ними
— единственное место полосы, где **кто-то читает чужой код и судит о нём**, и потому единственное, где
здесь зовётся модель.

| | |
|---|---|
| **вход** | клетка плана (`.agent/survey-plan.json`), `.agent/brd.md` |
| **выход** | `.agent/graph-parts/<клетка>.xml` — по файлу на клетку |
| **род** | `role scout`, **веер**: клетки гоняются батчами по `maxParallel` |
| **приёмка** | `checkPart` по staging: часть замкнута грамматикой, покрывает файлы клетки, у узла объявлены зависимости, непрочитанное объявлено `<gap>` |
| **оператор** | нет вовсе — вопросов на этом шаге не существует (§6) |

### Часть — фрагмент грамматики, а не документ

Слияние на шаге 5 делает скрипт, а свободный markdown скриптом не сливается. Поэтому скаут возвращает
не «описание модулей», а те же теги, из которых состоит `appgraph.xml`, и ключ моноида — `path` —
объявлен один раз, в `docs/concept.md`.

### Скаут не выбирает себе файлы

Список приезжает **в наряде**, и это не гигиена, а условие приёмки: гардрейл сверяет покрытие части со
списком файлов клетки, взятым **из плана машиной**, а не из того, что решил прочесть скаут. Роли
запрещены `grep`, `glob` и `list`; `read` разрешён ровно по путям наряда. Скаут, ушедший читать соседа,
получает красный чек по правилу S2 («чужих путей в части нет»), а не устный выговор.

### Непрочитанное объявляется, а не умалчивается

Файл, который скаут не осилил (минифицированный бандл, гигантский sql-дамп, бинарь с текстовым
расширением), закрывается `<gap path why>`. Это тот же принцип, что `Unknown` в дельте шага 6: молчание
неотличимо от «прочитал и ничего не нашёл», а `<gap>` доезжает до шага 5 и дальше — вопросом на шаге 10.

### Два наряда, выбор по полю, а не разбором строк

`kind` клетки решён шагом 3, здесь он только **выбирает шаблон** — `TPL[cell.kind]`, обращение к полю:

| `kind` | наряд просит |
|---|---|
| `survey` | опиши модули: роль одной строкой и ЧЕТЫРЕ измерения — **поверхность** (`api` с `kind`/`scope`), **зависимости**, **внешние точки** (`io`), **тесты** — каждое со значением или с явным `none` |
| `spine` | перечисли ВСЕ сьюты (род, команда, папка, форма прогона одного файла); назови команду сборки, механизм тоглов, соглашения о ветках и коммитах, описание внешнего контракта с валидатором, **внешние системы из конфигурации** (`integration`) — **или объяви, что их нет** |

Тем же приёмом на шаге 14 выбираются пять шаблонов тикета. Разбор строк («если в файле есть слово
pom…») здесь не нужен: решение уже принято и лежит данными.

---

## 2. Грамматика части

`kind: "survey"`:

```xml
<part cell="c1" kind="survey">
  <module path="src/main/java/org/acme/rest/json/FruitResource.java" io="none">
    <role>REST resource for fruits</role>
    <api name="GET /fruits" kind="http" scope="public"/>
    <dep path="src/main/java/org/acme/rest/json/Fruit.java"/>
    <test path="src/test/java/org/acme/rest/json/FruitResourceTest.java" suite="unit"/>
  </module>
  <module path="src/main/java/org/acme/rest/json/FruitRepository.java" api="none" tests="none">
    <role>fruit storage</role>
    <dep path="src/main/java/org/acme/rest/json/Fruit.java"/>
    <io kind="db" dir="out" system="fruit-db" config="quarkus.datasource.jdbc.url" target="fruits table"/>
  </module>
  <module path="src/main/java/org/acme/Legume.java" deps="none" io="none" api="none" tests="none">
    <role>plain data record</role>
  </module>
  <gap path="src/main/resources/import.sql" why="not read: 480 KB of seed data, no module in it"/>
</part>
```

`kind: "spine"`:

```xml
<part cell="c0" kind="spine">
  <suite id="unit" kind="unit" cmd="./mvnw -q test" one="./mvnw -q test -Dtest={class}" path="src/test/java"/>
  <suite id="it" kind="component" cmd="./mvnw -q verify -Pit" one="" path="src/it"/>
  <build cmd="./mvnw -q package"/>
  <toggles found="no"/>
  <branching branches="feature/&lt;ticket&gt;-&lt;slug&gt;" commits="conventional-commits"/>
  <contract found="no"/>
  <integration kind="db" system="fruit-db" config="quarkus.datasource.jdbc.url" value="jdbc:postgresql://db/fruits"/>
</part>
```

Три решения этой грамматики названы вслух:

1. **`deps="none"` — не украшение.** Модуль без зависимостей и модуль, у которого их забыли назвать,
   в XML выглядят одинаково. `standards/code.md` §2 запрещает это ровно так: отсутствие — случай, а не
   пустое значение. Без рёбер неисполним шаг 8 (`ripple`), поэтому «забыл» здесь стоит дороже всего.
2. **`found="no"` — валидный ответ хребта.** Механизма тоглов, соглашения о ветках или спеки в
   репозитории может не быть; это решение оператора на шаге 10, а не догадка скаута. Единственное
   исключение — сьюты: «ни одного `<suite>`» останавливает полосу, но **на шаге 5**, а не здесь.
   Скаут обязан сказать правду, а не назначить репозиторий негодным.
3. **Пустой `one` — валидное значение.** Форма прогона одного файла есть не у всякого сьюта; пустая
   строка означает «шаг 15 гоняет сьют целиком», и эта цена пишется в лог, а не умалчивается.

---

## 3. Гардрейл `checkPart` — правила, объявленные ОДИН раз

Здесь и нигде больше. Роль и наряды на них ссылаются, но не пересказывают (`standards/role.md` §1).
Все правила — **о составе**, ни одно не судит формулировку: живой прогон `ed1d4094` уже показал цену
гардрейла, судящего смысл фразы, — три пере-делегации, сожжённые на ложном красном (`docs/workflow.md`
§3.2, S16).

**Общее (C1)** — корень `<part cell kind>` совпадает с заказанной клеткой. Не совпал — скаут ответил
не на тот наряд, и остальные правила проверять не о чем.

**`kind: "survey"`:**

| # | правило | почему |
|---|---|---|
| S1 | каждый файл клетки закрыт `<module path>` **или** `<gap path>` | покрытие без потерь; потерянный файл — потерянный узел графа, которого никто не хватится |
| S2 | каждый `path` части принадлежит клетке | скаут не выбирает себе файлы; чужой файл — работа соседней клетки, и он приедет дважды |
| S3 | у `<module>` непустой `<role>` | узел без роли неотличим от строчки в `ls` |
| S4 | зависимости **объявлены**: ≥1 `<dep path>` либо `deps="none"`; `path` непуст и не равен своему | без рёбер неисполним шаг 8 |
| S5 | `<gap>` несёт непустой `why` | «не прочитал» без причины не отличить от «поленился» |
| S6 | внешние точки **объявлены**: ≥1 `<io>` либо `io="none"` | молчание неотличимо от «не смотрел» — та же болезнь, что лечит S4 |
| S7 | форма `<io>`: `kind` из `IO_KINDS`, `dir` ∈ `in\|out`, непустой `system`, непусто `config` **или** `target` | точка без адреса и без ключа конфигурации — догадка, а не факт; `config` — ключ сшивки на шаге 5 |
| S8 | тесты **объявлены**: ≥1 `<test path>` либо `tests="none"`; `path` непуст | измерение, которого никто не требует, исчезает первым: прогон `03bc51ef` потерял все четыре привязки `<test>`, что были в `e51553dc` |
| S9 | поверхность **объявлена**: ≥1 `<api>` либо `api="none"` | модуль с тремя роутами и без `<api>` был зелёным: «наружу ничего» = «не смотрел» |
| S10 | форма `<api>`: `kind` из `API_KINDS`, `scope` ∈ `public\|internal`, непустое `name`, для `kind="http"` — канон `METHOD /path` | `scope` и есть ответ «что выставлено наружу»; канон имени даёт шагу 5 однозначную ссылку потребителя |

**`kind: "spine"`:**

| # | правило | почему |
|---|---|---|
| P1 | присутствуют все шесть ответов: сьюты (≥1 `<suite>` либо `<suites found="no"/>`), `<build>`, `<toggles>`, `<branching>`, `<contract>`, интеграции (≥1 `<integration>` либо `<integrations found="no"/>`) — со значением или с `found="no"` | шесть вопросов графа (`docs/concept.md`); молчание по любому из них встаёт шагом 5, 10 или 17 |
| P2 | у `<suite>` непусты `id`, `kind`, `cmd`, `path`; `one` может быть пуст | команда без папки или без рода на шаге 10 не соберётся в команду узла |
| P3 | `id` сьютов уникальны | `<test suite="unit">` узла обязан резолвиться в ровно один сьют |
| P4 | форма `<integration>`: `kind` из `IO_KINDS`, непустые `system` и `config`; `value` необязателен | `config` — ключ, по которому шаг 5 сшивает `<io>` модуля с системой; секрет в граф не едет, поэтому `value` не обязателен |
| P5 | `system` интеграций уникальны | двойник расщепляет одну систему на два узла при слиянии — как двойной `id` сьюта |

Красный чек едет блокерами в `FEEDBACK` пере-делегации — тем же способом, что `newBrd` и `newDesign`:
одной строкой через `\n  `, каждый блокер с номером правила и путём.

---

## 4. Раскладка среза

```
steps/scope/
  scout.md           роль (ИМЯ ФАЙЛА = имя роли, так резолвит pi; roleDirectories += steps/scope/)
  order.survey.tpl   наряд клетки kind="survey"
  order.spine.tpl    наряд клетки kind="spine"
  part.mjs           ЧИСТОЕ ядро: parsePart · checkPart · newPart
  part.test.mjs      тест по формуле: 1 happy + Σ ветвей антецедента
core/xml.mjs         сканер тегов (attrs · ATTRS · tag), вынут из steps/design/design.mjs —
                     грамматика одна на два среза, машинка разбора не должна расходиться
core/budgets.mjs     + maxParallel (умолчание 8) — размер батча роя, в izi.config.json рядом с loops
ext/index.mjs        + cells({path}) · checkPart({path, cell}); roleDirectories += steps/scope/
workflows/izi.js     + фаза scope() и её рабочая функция scout()
```

### Чистое ядро — `steps/scope/part.mjs`

```
parsePart(xml)               -> { cell, kind, modules[], gaps[], spine{} }   тотальна, мусор = пустой разбор
checkPart({ part, cell })    -> string[]   блокеры; пусто = зелёный. Правила §3, номера совпадают
newPart({ xml, cell })       -> Result<Part, "invalid-part">
```

`cell` — клетка из плана целиком (`{id, kind, files[]}`), а не её id: список файлов нужен правилам S1 и
S2, и берёт его ядро **из аргумента**, то есть из плана, а не из части, которую судит.

### Io — `ext/index.mjs`

```
cells({ path })          -> { ok, cells: [{ id, kind, subjects[], files: [{path, bytes}] }] } | { ok:false, why }
checkPart({ path, cell }) -> { ok, modules, gaps, blockers }
```

`cells` существует по одной причине: воркфлоу-скрипт не разбирает JSON и не знает о процессах — он
знает только функции хоста (`docs/workflow.md` §2). `checkPart` принимает **id** клетки и сам читает
`.agent/survey-plan.json`, чтобы список файлов приехал в гардрейл из плана машиной, а не через модель
и не через скрипт — тот же приём, которым `izi_answer` копирует ключ вопроса из `pending.json`.

---

## 5. Встройка в `workflows/izi.js`

```js
async function scope() {
  const plan = await cells({ path: PLAN });
  if (!plan.ok) exit(err("blocked", { subject: plan.why }));
  const BRD = await readText({ path: ".agent/brd.md" });
  const TPL = { survey: await readText({ path: "steps/scope/order.survey.tpl" }),
                spine:  await readText({ path: "steps/scope/order.spine.tpl" }) };

  const width = Math.min(MAX_PARALLEL, SWARM_WIDTH);   // SWARM_WIDTH = 8 — ЛИТЕРАЛ, см. факт 4 ниже
  let modules = 0, gaps = 0;
  for (let i = 0; i < plan.cells.length; i += width) {
    const batch = plan.cells.slice(i, i + width);
    const done = await parallel("scope-batch", {          // имя и запись задач — литералы, иначе
      s1: () => slot(batch, 0, TPL, BRD),                 // хост не запустит скрипт вовсе
      s2: () => slot(batch, 1, TPL, BRD),
      // … s3..s8: слот берёт i-ю клетку батча, а если её нет — возвращает null и ничего не стоит
    });
    const results = ["s1", "s2", /* … */ "s8"].map((k) => done[k]).filter((r) => r);
    const bad = results.filter((r) => !r.ok);
    if (bad.length) exit(err("blocked", { subject: bad.map((r) => r.why).join("\n  ") }));
    for (const r of results) { modules += r.modules; gaps += r.gaps; }
  }
  log(`scope: cells=${plan.cells.length} modules=${modules} gaps=${gaps}`);
  exit(ok({ artifact: ".agent/graph-parts/", cells: plan.cells.length, modules, gaps }));
}

async function scout(cell, orderTpl, BRD) {           // одна клетка: наряд → роль → чек → промоут
  const STAGING = `.agent/staging/graph-parts/${cell.id}.xml`;
  let feedback = "(none — first attempt)";
  for (let attempt = 0; attempt < LOOPS; attempt++) {
    const order = prompt(orderTpl, { CELL: cell.id, BRD, STAGING, CHECK, FEEDBACK: feedback,
      SUBJECTS: cell.subjects.join(" · ") || "(no anchors on this cell)",
      FILES: cell.files.map((f) => `- ${f.path} (${f.bytes} b)`).join("\n") });
    const env = await agent(order, { role: "scout", outputSchema: ENVELOPE });
    if (env.track === "err") return { ok: false, why: `${cell.id}: ${env.kind} — ${env.subject}` };
    const check = await checkPart({ path: STAGING, cell: cell.id });   // чек ПО STAGING, до промоута
    if (check.ok) {
      await promote({ from: STAGING, to: `.agent/graph-parts/${cell.id}.xml` });
      return { ok: true, modules: check.modules, gaps: check.gaps };
    }
    feedback = check.blockers;
  }
  return { ok: false, why: `${cell.id}: цикл исчерпан за ${LOOPS} попыток — ${feedback}` };
}
```

Порядок остаётся кодом: `phase("scope"); await scope();` четвёртой строкой в хвосте, `surveyPlan()`
меняет `exit(ok(…))` на `log(…) + return` — ровно тем же движением, каким `brd()` перестал быть концом
прогона в S15.

### Четыре факта хоста, на которых это стоит

1. **`parallel(name, record)`** принимает ЗАПИСЬ `{имя: () => …}`, не массив, и возвращает
   `{имя: значение}` (`pi-extensible-workflows/packages/core/src/execution.ts:245-266`). Имена задач —
   id клеток: стабильные, из плана.
2. **Отказ едет ЗНАЧЕНИЕМ, не исключением.** `parallel` ловит любую ошибку задачи и бросает СВОЙ
   `workflowError` (`execution.ts:253-262`) — класс `Exit` до `catch` в хвосте `izi.js` не доедет, и
   прогон вернул бы `crashed` вместо `blocked` с именем клетки и блокерами гардрейла.
3. **Одинаковый call-site `agent(...)` в N задачах роя легален** внутри `parallel`: ключ инфлайта —
   `[inheritedAgentPath, callSite]`, а `parallel` даёт каждой задаче свой путь (`execution.ts:107-130,
   253`). Вне `parallel` тот же код — `INVALID_METADATA`.

4. **Веер не может быть динамическим — это проверяется ДО запуска.** Хост валидирует исходник
   воркфлоу статически и требует у `parallel` литеральное имя и литеральную запись задач
   (`validation.ts:755`). Живой запуск с `Object.fromEntries(batch.map(...))` — как было в первой
   редакции этого документа — не начался вовсе: `The workflow metadata is invalid: parallel requires
   an operation name string and tasks record`. Отсюда фиксированные слоты `s1..s8` и `SWARM_WIDTH`
   **литералом в коде**; бюджет `maxParallel` из `izi.config.json` может только ОПУСТИТЬ ширину
   (`Math.min`), поднять — нет. Пустой слот возвращает `null` и не стоит ничего.

Потолка параллелизма у песочницы нет вовсе (`Promise.all` без ограничителя), поэтому батчи — наши.
Цена этого решения названа: ширина роя живёт в двух местах — литералом в коде (потолок) и бюджетом в
конфиге (фактическая), и первое поднять правкой конфига нельзя.

---

## 6. Почему на этом шаге нет оператора

Единственный кандидат в вопросы — «я не смог прочесть файл», и у него уже есть форма ответа: `<gap>`.
Вопрос стоил бы паузы на каждой клетке роя (десятки на живом репозитории), а даёт ровно то же знание,
что `<gap>`, только дороже и позже. Всё остальное, чего разведка не нашла (тоглы, ветки, спека),
превращается в вопрос **на шаге 10**, где решение принимает человек, а не там, где он ещё не видел
плана.

Клетка, не сошедшаяся за `LOOPS` пере-делегаций, — терминальный `blocked` с id клетки и блокерами
гардрейла. Пропустить её и «собрать граф из остального» нельзя: потерянный узел не хватится никто, а
именно этого шаг 5 и не переживёт.

---

## 7. Комментарии — Zero-Context Survival

Решение оператора, действующее с этого среза: файл обязан объясняться **сам**, без чата и без соседей.
`MODULE_CONTRACT` в начале, `FUNCTION_CONTRACT` на каждой функции, `BUG_FIX_CONTEXT` там, где решение
куплено живым дефектом, `EXTERNAL_DEPENDENCY` на всё, чего в файле физически нет.

Первым это получает `workflows/izi.js`: у него сегодня прозаическая шапка и ноль контрактов, а внешних
зависимостей — четыре класса (функции расширения, `izi.config.json`, роли `gilb`/`scout`, глобалы
песочницы). Само правило живёт в `standards/code.md` — один раз, а не пересказом в каждом документе.

**Язык.** Код, комментарии, роль `scout.md`, оба наряда, описания функций хоста и тексты тестов —
**английский**: их читает модель. Русский остаётся там, где читает оператор: `subject` вопросов,
`blocked`-диагнозы, `log(…)`, `docs/*.md`, `backlog.md`. LAW роли «артефакт говорит языком наряда» это
не отменяет: русский `TASK.md` по-прежнему даёт русский BRD.

---

## 8. Чего этот срез НЕ делает

- **Не сливает части.** `appgraph.xml` — шаг 5, скрипт, коммутативный моноид по `path`. Скаут не знает
  о существовании других клеток и не должен.
- **Не судит, годен ли репозиторий.** «Ни одного `<suite>` ⇒ СТОП» — правило шага 5. Здесь `found="no"`
  есть честный ответ, а не приговор.
- **Не решает, что делать с `<gap>`.** Разрыв едет данными дальше; вопросом он становится на шаге 10.
- **Не читает файлы за пределами клетки** — включая те, на которые сам же сослался `<dep>`. Ребро в
  чужую клетку нормально: граф глобален, часть — локальна.

---

## 9. Что доказывает готовность

1. `node --test` зелёный целиком.
2. Живой прогон **в чужом проекте** (`/private/tmp/quarkus-rest-json-app-v2-*`), дошедший до
   `.agent/graph-parts/` с числом файлов, равным числу клеток плана; `track:"ok"`, числа читаются из
   `journal.json`, а не из того, что напечатала модель.
3. Шов правила S4 проверен реинтродукцией дефекта: убрать `deps="none"` из части — юнит краснеет.
4. Часть клетки `c0` содержит все шесть ответов хребта — со значениями или с `found="no"`.
