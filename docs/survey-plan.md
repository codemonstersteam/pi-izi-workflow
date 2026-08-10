# Шаг 3 `survey-plan` — раскладка разведки

Карточка шага — `docs/workflow.md` §3.3, обоснование — `docs/concept.md` («Разведка (шаги 3–5)»).
Здесь: что строится, каким кодом и как встаёт в `workflows/izi.js`.

**РЕАЛИЗОВАНО (S15).** Код — `steps/survey-plan/plan.mjs` (+ `plan.test.mjs`),
`ext/index.mjs::survey`, третья фаза `workflows/izi.js::surveyPlan`. Живой прогон в чужом проекте:
`cffa2e65-4c68-48ae-840c-a32c6dd28bae` (`/private/tmp/quarkus-rest-json-app-v2-t1-3`) — `track:"ok"`,
`.agent/survey-plan.json`, `files=20 bytes=28549 cells=2`, `c0` = `pom.xml` + `README.md`.
Блоки кода ниже — ЗАМЫСЕЛ на момент утверждения; источник истины — файлы, а не этот документ.

---

## 1. Что решает шаг

Рой скаутов (шаг 4) не грепает и не выбирает себе файлы — список приезжает в наряде. Значит кто-то
обязан этот список посчитать. Считает **скрипт за 0 токенов**, и решение у него ровно одно:
**как порезать дерево репозитория на клетки, которые скаут физически способен прочесть**.

| | |
|---|---|
| **вход** | дерево файлов от cwd прогона, `.agent/brd.md` (только `subjects[]`) |
| **выход** | `.agent/survey-plan.json` |
| **род** | `script` — роли нет, вызовов модели нет, **оператора нет** |
| **приёмка** | клетки покрывают ВСЕ просканированные файлы без пересечений и без потерь |
| **вырождение** | сканировать нечего (ноль файлов) → `blocked` с диагнозом |

### Якорь — пометка, а не фильтр

Первая редакция брала в план только файлы, попавшие под якоря `subjects[]`. Живой факт на
квaркус-проекте это опроверг: `Legume.java`, `LegumeResource.java` и два их теста под якоря не
попали, а требование R3 «существующие вызовы не меняются» — именно про них. **Ложный пропуск здесь
дороже ложного попадания**: лишний файл стоит скауту абзаца, потерянный — стоит графу узла, которого
никто уже не хватится.

Инженер читает репозиторий целиком и находит нужное по контексту — так же работает и рой. Поэтому
в план едут **все** файлы, а якоря остаются **пометкой** на файле и на клетке: скаут видит, за что
именно тут зацепились, и `gaps` по-прежнему сигналят («якорь `search` не встретился нигде — поиска
в проекте ещё нет»).

### Автомат вместо вопроса

Клетка закрывается по правилу **20 файлов ИЛИ ~200 КБ — что раньше**. Число клеток не ограничено:
`maxParallel = 8` у pi — это размер БАТЧА (шаг 4 гоняет клетки пачками), а не потолок их количества.
200 файлов → 10 клеток → 2 батча, без единого вопроса.

Байты в правиле не для красоты: 20 крошечных html и 20 файлов по две тысячи строк — разная работа, и
вторая клетка вынесет контекст скаута. Правило остаётся автоматом: считает скрипт, оператор молчит.

Цена, которую автомат не отменяет: монорепо в 2000 файлов — это 100 клеток и весь бюджет роя.
Поэтому шаг 3 **логирует числа** (`files`, `cells`, `bytes`) перед роем: стоимость видна в
`journal.json` ДО запуска, а решение «столько не читаем» принимается на шаге 4, где ему и место.

### Форма артефакта

```json
{
  "files": 18,
  "bytes": 41230,
  "subjects": ["fruit", "search", "filter", "limit", "backward-compatibility"],
  "gaps": ["search", "backward-compatibility"],
  "cells": [
    { "id": "c0", "kind": "spine", "subjects": [], "bytes": 3120,
      "files": [ { "path": "pom.xml", "bytes": 3120, "subjects": [] } ] },
    { "id": "c1", "kind": "survey", "subjects": ["fruit", "filter", "limit"], "bytes": 38110,
      "files": [ { "path": "src/main/java/org/acme/rest/json/FruitResource.java", "bytes": 1180, "subjects": ["fruit"] } ] }
  ]
}
```

Три поля здесь стоят ради ШАГОВ 4-5, а не ради красоты (пробег по концепту вперёд):

- **`subjects` целиком** — шаг 5 обязан проверить «ни один якорь плана не потерян». Выводить его из
  `gaps` плюс попадания можно, но проверка не должна ничего выводить: список лежит.
- **`kind`** — у `c0` другой наряд, чем у обычной клетки (см. ниже). Шаг 4 выбирает шаблон по полю,
  а не разбирая строку внутри `subjects`.
- **`bytes`** — стоимость клетки видна до запуска роя и ею же режется клетка.

`gaps` — якорь, не встретившийся нигде. Он **объявлен**, а не выброшен: скаут закрывает такой якорь
как `<gap>` (`docs/concept.md`: «нулевые якоря закрыты как `<gap>`»).

### Граница обхода — cwd прогона минус список пропуска

`docs/concept.md` и `docs/workflow.md` называли входом каталог **`app/`**. Литерал снят решением
оператора: он диктует чужому репозиторию раскладку ровно там, где концепт требует обратного —
«семантика, не механизм; conform к тому, как сделан репозиторий». В реальных репозиториях код лежит
в `src/`, `lib/`, `packages/`, `cmd/`.

**Принятая цена, названная вслух.** `bin/install.mjs` копирует харнес В проект, поэтому имена
`workflows/`, `steps/`, `core/`, `bin/`, `ext/`, `prompts/` в списке пропуска — в установленном
проекте они принадлежат конвейеру. Проект, у которого СВОЙ каталог зовётся так же, потеряет его из
разведки.

Туда же — вендоренные обёртки сборщика (`mvnw`, `mvnw.cmd`, `gradlew`, `gradlew.bat`): чужой код,
который рою читать незачем.

И туда же — **входы самого харнеса**: `TASK.md` (требование оператора, вход шага 1) и
`izi.config.json` (бюджеты прогона). Куплено живым прогоном `6e3b9455`: `TASK.md` попал в клетку
`c1`, и часть вернулась с `<module path="TASK.md">` — требование стало узлом графа приложения. Скаут
здесь ни при чём, наряд обязывает его закрыть каждый файл клетки; отсеивать вход конвейера — работа
шага 3.

**Матч якоря — подстрока, без учёта регистра.** Проверено и отвергнуто фактом: матч по границе слова
теряет `fruits` при якоре `fruit` и `FruitResourceIT` целиком — в коде якорь живёт во множественном
числе и в CamelCase.

### Клетка `c0` — хребет: манифест сборки и конфиги

Граф шага 5 обязан ответить на шесть вопросов: **как тестировать**, **как менять**, **как выключают**
(механизм тоглов), **как здесь ветвятся** (соглашение об именах), **чем описан внешний контракт** и
**с какими внешними системами** проект говорит (последнее — из конфигурации, поэтому в клетку
хребта собираются и `resources/application.*`, `.env`, `config/`). Живой факт: в квaркус-проекте
единственное место, где написано про раннер (`quarkus-junit`, `rest-assured`, surefire/failsafe), —
`pom.xml`. Он попал бы в общую клетку рядовым файлом, и скаут описал бы его как ещё один модуль.
Хребет вынесен в отдельную клетку `c0` **ради наряда**: не «опиши модули», а «назови команду сборки,
раннер тестов, механизм тоглов и соглашение о ветках — или объяви, что их нет».

| экосистема / слой | что попадает в `c0` |
|---|---|
| Maven | `pom.xml` |
| Gradle | `build.gradle(.kts)`, `settings.gradle(.kts)`, `gradle.properties` |
| Go | `go.mod`, `Makefile` |
| Node | `package.json` |
| конфиг-слой любой | `**/resources/application.*`, `.env*`, `config/*` |
| CI | `.github/workflows/*`, `.gitlab-ci.yml`, `Jenkinsfile` |
| соглашения | `README*`, `CONTRIBUTING*` |

CI и `CONTRIBUTING` здесь ради четвёртого вопроса: имя ветки шаг 10 обязан ВЫВЕСТИ, а живёт это
соглашение только там. `.github/` — **исключение из правила «точечные каталоги пропускаем»**: без
него ответ «как тестировать» в половине репозиториев теряется.

Список имён зашит в код — это знание об ЭКОСИСТЕМАХ, не о раскладке конкретного репозитория. Ни одно
имя не совпало → клетки `c0` нет, граф пишет «раннер не найден», вопрос уезжает оператору на шаге 10:
список — ускоритель, а не условие работы.

---

## 2. Раскладка среза

```
steps/survey-plan/
  plan.mjs        ЧИСТОЕ ядро: newPlan({files, spine, subjects, cellFiles, cellBytes}) -> Result
  plan.test.mjs   1 happy + Σ ветвей антецедента = 3 юнита
```

Роли нет → нет `<role>.md`, нет `order.tpl`, нет staging/promote: staging существует, чтобы артефакт
РОЛИ не закрыл шаг до зелёного чека. Здесь артефакт производит сам чек — он пишется **после**
решения его принять и только на нём (`standards/code.md`, ограничение 6).

Io-обвязка — одна новая функция хоста в `ext/index.mjs` (`survey`), по тому же контракту, что
`checkTask`/`checkBrd`: пути якорятся к `context.run.cwd`, «нечего картировать» — это ДАННЫЕ
(`ok:false`), а не исключение.

---

## 3. Чистое ядро — `steps/survey-plan/plan.mjs`

```js
// MODULE_CONTRACT: plan — раскладка разведки: дерево репозитория → клетки роя
// Purpose:    одно решение — где кончается клетка, чтобы скаут шага 4 получил список файлов, который
//             он физически способен прочесть. ЧИСТОЕ: диска не знает, io держит ext/index.mjs.
// io:         none
// Invariants: CELL_FILES/CELL_BYTES фиксированы при загрузке; клетки — последовательные куски
//             отсортированного списка, поэтому «покрывают всё без пересечений» держится
//             конструкцией, а не проверкой после; файл хребта в клетки разведки не попадает;
//             newPlan чиста — результат зависит только от аргументов
// Interface:  CELL_FILES — потолок файлов в клетке
//             CELL_BYTES — потолок байтов в клетке
//             newPlan(input) -> Result<Plan, "no-files">

import { ok, err } from "../../core/result.mjs"

export const CELL_FILES = 20
export const CELL_BYTES = 200 * 1024

// FUNCTION_CONTRACT: newPlan — клетки роя из дерева репозитория
//   Input:        { files, spine, subjects, cellFiles, cellBytes }
//                 files — [{ path, bytes, subjects }], ВСЕ просканированные файлы; subjects —
//                         пометка попавших якорей, НЕ условие включения файла в план
//                 spine — [{ path, bytes }], манифест сборки и конфиги; пусто → клетки c0 нет
//   Dependencies: —
//   Antecedent:   files непуст ИЛИ spine непуст — иначе картировать нечего. Числа клеток не
//                 ограничены: потолок параллелизма pi — размер батча на шаге 4, а не потолок клеток
//   Consequent:   success: { files, bytes, subjects, gaps, cells } — cells[0] с kind "spine", если
//                          spine непуст; далее клетки kind "survey", покрывающие ВСЕ прочие файлы
//                          без пересечений и без потерь; клетка закрывается по cellFiles ИЛИ
//                          cellBytes — что раньше; gaps — якоря, не встретившиеся ни в одном файле
//                 failure: "no-files" — ноль файлов: пустой репозиторий, картировать нечего
export function newPlan({ files = [], spine = [], subjects = [], cellFiles = CELL_FILES, cellBytes = CELL_BYTES }) {
  const inSpine = new Set(spine.map((f) => f.path))
  const rest = files.filter((f) => !inSpine.has(f.path)).sort((a, b) => a.path.localeCompare(b.path))
  if (!rest.length && !spine.length) {
    return err("no-files", "ни одного файла вне списка пропуска — картировать нечего")
  }

  // Клетка закрывается по числу файлов ИЛИ по байтам: один файл больше потолка едет клеткой сам —
  // порезать его нельзя, а молча выкинуть значит потерять узел графа.
  const chunks = []
  let cur = []
  let bytes = 0
  for (const f of rest) {
    if (cur.length && (cur.length >= cellFiles || bytes + f.bytes > cellBytes)) { chunks.push(cur); cur = []; bytes = 0 }
    cur.push(f)
    bytes += f.bytes
  }
  if (cur.length) chunks.push(cur)

  const cell = (id, kind, part) => Object.freeze({
    id,
    kind,
    subjects: Object.freeze([...new Set(part.flatMap((f) => f.subjects || []))]),
    bytes: part.reduce((n, f) => n + f.bytes, 0),
    files: Object.freeze(part.map((f) => Object.freeze({ path: f.path, bytes: f.bytes, subjects: Object.freeze([...(f.subjects || [])]) }))),
  })

  const covered = new Set(files.flatMap((f) => f.subjects || []))
  return ok(Object.freeze({
    files: rest.length + spine.length,
    bytes: [...rest, ...spine].reduce((n, f) => n + f.bytes, 0),
    subjects: Object.freeze([...subjects]),
    gaps: Object.freeze(subjects.filter((s) => !covered.has(s))),
    cells: Object.freeze([
      ...(spine.length ? [cell("c0", "spine", spine)] : []),
      ...chunks.map((part, i) => cell(`c${i + 1}`, "survey", part)),
    ]),
  }))
}
```

**Тест (`plan.test.mjs`) — по формуле, 3 юнита:**
1. happy — `c0` первая и `kind:"spine"`; объединение файлов клеток разведки === все файлы вне
   хребта, повторов нет, `subjects` и `gaps` на месте;
2. шов автомата — файлов меньше `cellFiles`, но байтов больше `cellBytes` → клеток две (иначе
   правило по байтам тихо не работает, а тест этого не видит);
3. `no-files`.

---

## 4. Io — `ext/index.mjs`, функция `survey`

```js
// SKIP — граница обхода вместо каталога app/ (см. §1). Первые шесть имён — сам харнес: install.mjs
// копирует его В проект, поэтому там они принадлежат конвейеру, а не приложению.
const SKIP = new Set(["workflows", "steps", "core", "bin", "ext", "prompts",
                      "node_modules", "dist", "build", "target", "coverage"])  // + любой каталог на точку
const SKIP_FILES = new Set(["mvnw", "mvnw.cmd", "gradlew", "gradlew.bat",      // вендоренные обёртки сборщика
                            TASK_PATH, BUDGETS_PATH])                          // входы харнеса: конвейер, не приложение
const KEEP_DOTS = new Set([".github"])   // исключение из «точечные каталоги пропускаем»: там CI
const MAX_BYTES = 512 * 1024                                                   // файл крупнее не читаем

// SPINE — хребет: где живут ответы на четыре вопроса графа (§1). Имена экосистем, не раскладка
// конкретного репозитория. Ни одно не совпало → клетки c0 нет, и это ДАННЫЕ, а не отказ.
const SPINE = [/^pom\.xml$/, /^build\.gradle(\.kts)?$/, /^settings\.gradle(\.kts)?$/, /^gradle\.properties$/,
               /^package\.json$/, /^go\.mod$/, /^Makefile$/, /^pyproject\.toml$/,
               /resources\/application\.[^/]+$/, /(^|\/)\.env/, /(^|\/)config\//,
               /^\.github\/workflows\//, /^\.gitlab-ci\.yml$/, /^Jenkinsfile$/,   // как тестировать
               /^README/i, /^CONTRIBUTING/i]                                       // как ветвятся

// walk/hitsFor — io-обвязка, юнитами не покрывается (standards/code.md: io-трубу доказывает живой
// прогон). Якорь считается попавшим, если встречается в ПУТИ или в тексте файла, без учёта регистра.
function walk(root, rel, out) { /* обход: SKIP/SKIP_FILES/точечные (кроме KEEP_DOTS)/>MAX_BYTES — мимо */ }

export const survey = {
  description: "Build .agent/survey-plan.json: the run's whole file tree minus the skip list, cut into scout cells. Anchors from .agent/brd.md annotate files; they never filter them.",
  input: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
  output: { /* ok, why, files, bytes, cells, gaps, at */ },
  run({ path }, context) {
    const root = runRoot(context)                                        // cwd ПРОГОНА, не этого репозитория
    const { subjects } = parseBrd(readIfExists(root, ".agent/brd.md"))    // правило разбора — одно, из steps/brd
    const anchors = subjects || []                                       // пометка; пустой список планa не рушит
    const scanned = walk(root, "", [])
    const isSpine = (p) => SPINE.some((re) => re.test(p))
    const spine = scanned.filter((f) => isSpine(f.path)).map((f) => ({ path: f.path, bytes: f.bytes, subjects: [] }))
    const files = scanned.map((f) => ({ path: f.path, bytes: f.bytes, subjects: hitsFor(f, anchors) }))

    const r = newPlan({ files, spine, subjects: anchors })
    if (!r.ok) return { ok: false, why: r.error.detail }                  // единственный отказ — no-files
    mkdirSync(dirname(at(root, path)), { recursive: true })               // пишем ПОСЛЕ решения принять
    writeFileSync(at(root, path), JSON.stringify(r.value, null, 2))
    return { ok: true, files: r.value.files, bytes: r.value.bytes, cells: r.value.cells.length,
             gaps: r.value.gaps, at: new Date().toISOString() }
  },
}
```

---

## 5. Встройка в `workflows/izi.js`

Оператора на этом шаге нет, значит нет ни `checkpoint`, ни `setPending`, ни разбора чисел из
ответов — правки ровно две:

```js
// 1) brd() на зелёном чеке больше НЕ выходит из прогона — возвращает управление:
    if (check.ok) {
      await promote({ from: STAGING, to: ".agent/brd.md" });
      log(`brd: ok, requirements=${check.requirements}`);
      return;                                   // было exit(ok(...)) — дальше идёт survey-plan
    }

// 2) третья именованная фаза — той же рукой, тем же стилем
async function surveyPlan() {
  const PLAN = ".agent/survey-plan.json";
  const p = await survey({ path: PLAN });
  if (!p.ok) exit(err("blocked", { subject: p.why }));
  log(`survey-plan: files=${p.files} bytes=${p.bytes} cells=${p.cells}`);  // стоимость роя ДО роя
  exit(ok({ artifact: PLAN, files: p.files, cells: p.cells, gaps: p.gaps }));
}

phase("task"); await task();
phase("brd"); await brd();
phase("survey-plan"); await surveyPlan();
```

Порядок остаётся **кодом**, а не `pipeline.json`: третья фаза — ещё одна именованная функция, а не
запись в манифесте. `docs/workflow.md` §5 требует принять это решение именно здесь, с фактами трёх
шагов на руках: три ручных вызова подряд дешевле, чем манифест + диспетчер + их тесты — манифест не
возвращаем.

---

## 6. Чего этот срез НЕ делает

- не зовёт скаутов (шаг 4) и не строит граф (шаг 5) — только раскладка;
- не читает содержимое требований `R<n>` — из BRD берёт **только** `subjects[]`, и то как пометку;
- не спрашивает оператора вовсе: раскладка вычислима, а вычислимое считает скрипт за 0 токенов;
- не решает, дорого ли читать репозиторий: печатает числа и отдаёт решение шагу 4;
- не заводит квитанции и не делает прогон возобновляемым — это по-прежнему отложено.

## 7. Что доказывает готовность

1. `node --test` зелёный целиком.
2. Живой прогон **в другом проекте** (не в этом репозитории) доходит до `.agent/survey-plan.json`,
   и в плане есть `c0` с манифестом сборки — единственный тест, ловящий дефекты якорения cwd.
3. Шов автомата проверен внесением дефекта: убрать проверку по байтам → юнит 2 краснеет; вернуть.
