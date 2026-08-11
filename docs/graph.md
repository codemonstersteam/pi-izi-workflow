# Шаг 5 `graph` — слияние частей в `appgraph.xml`

Карточка шага — `docs/workflow.md` §3.5, обоснование — `docs/concept.md` («Разведка, шаги 3–5»),
вход — `docs/scope.md` (части роя и `graph-computed.xml`). Здесь: **что** мы собираем, **почему
именно так** и **чего это стоит**. Источник истины по правилам — `steps/graph/`; документ объясняет
решения, а не пересказывает код.

**Каждый раздел помечен статусом.** `[СДАНО]` — работает в коде и покрыто юнитами либо доказано
живым прогоном; `[РЕШЕНО]` — решение принято, кода нет. На сегодня решений без кода в этом срезе нет.

**Статус среза: сдано.** Два живых прогона на форме `/tmp/quarkus-rest-json-app-v2-t1-3`:
`c4fde2f3-1520-4357-845b-48e5a6c02291` (чистый: `track:"ok"`, 4 запуска ролей, 49 143 токена) и
`06c4172c-b23a-4ad8-b6c3-c177a5dc6a51` (по кэшу: `track:"ok"`, **1** запуск, 9 333 токена — обе клетки
`reuse → hit`). Артефакт: 15 модулей, 2 компоненты, 5 изолированных, 4 уровня, 8 рёбер, 2 сьюта,
поверхность 4, циклов 0.

---

## 1. Что такое модуль, и почему это решение стоило трёх переделок концепта `[СДАНО]`

Модуль — **файл**: имя (`path`), одна функция одной фразой (`<role>`), объявленный вход (`<api>`),
чёрный ящик для соседей. Это определение классической модульности (один вход — один выход, одна
функция целиком, вызов по имени, связность и зацепление как критерии), и шаг 4 уже производит
ровно его: `<module path><role>…</role><api …/></module>`. Правило `S3` («непустой `<role>`») — это
и есть проверка связности: функция, которую нельзя выразить одной фразой, модулем не является.

**Пакет, каталог и артефакт сборки модулями НЕ являются.** У них нет ни единственного входа, ни
одной функции, и чёрным ящиком они не работают. Поэтому в графе они — **адрес**, а не узел:
атрибут `pkg` у модуля и один элемент `<artifact>` на репозиторий.

Три редакции этого решения, и почему две первые отвергнуты фактом формы
`/tmp/quarkus-rest-json-app-v2-t1-3` (17 файлов, 15 из них — приложение):

| редакция | сколько модулей дала | почему отвергнута |
|---|---|---|
| модуль = клетка плана | 1 (`root`) | число верное, причина нет: клетка закрылась по бюджету роя (20 файлов / 200 КБ), а не по структуре. На eddi та же формула даёт 291 «модуль» при одном артефакте |
| модуль = каталог файла | 4 | это **source sets** (рецепты сборки, статика, тесты), а не модули. Ребро `resources → java` архитектору не сообщает ничего, и оно уже сказано точнее: `<edge from="fruits.html" to="FruitResource.java" via="uses /fruits"/>` |
| **модуль = файл, иерархия вычисляется** | 15 модулей, 2 компоненты, 5 изолированных, 4 уровня | принято |

Факт репозитория, с которым всё это сверялось: **один** maven-артефакт (`rest-json-quickstart`,
`<modules>` нет), **один** java-пакет (`org.acme.rest.json`).

---

## 2. Иерархия — вычисляется, а не объявляется `[СДАНО]`

Архитектура — это иерархия **подчинения** (верхний уровень решает, нижний детализирует, вбок и
вверх не вызывают), а не иерархия **вложенности** (пакет внутри артефакта). Вложенность — адрес;
подчинение — смысл. Подчинение вычислимо из рёбер, которые скрипт уже посчитал на шаге 3, поэтому у
роли не спрашивается НИЧЕГО нового:

| факт | как считается | потребитель |
|---|---|---|
| `component` | связная компонента графа рёбер (без учёта направления) — это и есть вертикальный срез. Группа из ОДНОГО модуля срезом не считается: это изолированный модуль, и он объявляется отдельно, иначе живой репозиторий получит сотни «срезов» по файлу | шаг 6: требование приземляется в компоненту, а не в плоский список |
| `level` | слои Кана: `level(v) = 1 + max(level(предшественников))`, `L1` — узлы без входящих | шаг 6 (навигация сверху вниз), шаг 10 (топосорт уже посчитан) |
| `fanin` / `fanout` | степень узла по рёбрам | шаг 8: рябь шире всего там, где `fanin` велик; шаг 10: где резать узел |
| `<cycle>` | то, что осталось непокрытым после слоения Кана | шаг 10: цикл ломает топосорт — объявлен здесь, а не всплывает там |

Живой замер на форме (рёбра `graph-computed.xml` плюс резолюция `<use>`):

```
component c1 (5 модулей)              component c2 (5 модулей)           isolated (5)
L1  fruits.html · FruitResourceIT     legumes.html · LegumeResourceIT    LoggingFilter
L2  FruitResourceTest                 LegumeResourceTest                 4×Dockerfile
L3  FruitResource  fanin=2 fanout=1   LegumeResource  fanin=2 fanout=1   (fanin=fanout=0)
L4  Fruit          fanin=1 fanout=0   Legume          fanin=1 fanout=0
```

UI и тесты сверху, ресурсы — хабы посередине, модели внизу, изолированные объявлены изолированными.
Требование BRD «поиск по части названия фрукта» приземляется на `L3 FruitResource` компоненты `c1`.
`level` — ДЛИННЕЙШИЙ путь, а не кратчайший: `FruitResource` на третьем уровне через тест, а не на
втором через страницу, иначе «глубина подчинения» зависела бы от того, каким маршрутом до узла дошли.

**Цикл — объявление, а не отказ.** Циклические зависимости в java законны и встречаются; терминальный
отказ на них останавливал бы полосу на исправном репозитории. Слоение Кана даёт детекцию бесплатно:
что не сняли слои — то и есть цикл, ему пишется `<cycle>`, а `level` у таких модулей пуст.

---

## 3. Грамматика `appgraph.xml` `[СДАНО]`

Одно слово — один предмет. `<module>` значит то же, что в части (файл), поэтому слияние ничего не
переименовывает, а шаг 6 не учит два словаря.

```xml
<appgraph grammar="3" modules="15" components="2" isolated="5" levels="4">
  <artifact name="rest-json-quickstart" root="."/>          <!-- команда сборки — в <build>, не здесь -->

  <suite id="unit" kind="unit" cmd="mvn test" one="-Dtest={class}" path="src/test/java" match="*Test.java"/>
  <suite id="component-native" kind="component" cmd="mvn verify -Pnative" one="-Dit.test={class}"
         path="src/test/java" match="*IT.java"/>
  <build cmd="mvn package"/><toggles found="no"/><branching found="no"/><contract found="no"/>

  <lang id="java" files="9" edges="yes" routes="yes"
        decls="class,interface,enum,record,method,field"/>       <!-- границы вычислимого -->
  <subject name="fruit"/><subject name="search" found="no"/>    <!-- якоря плана, полным списком -->
  <component id="c1" modules="5" heads="src/main/resources/META-INF/resources/fruits.html"/>

  <module path="src/main/java/org/acme/rest/json/FruitResource.java"
          pkg="org.acme.rest.json" component="c1" level="3" fanin="2" fanout="1">
    <role>REST resource for fruit CRUD operations</role>
    <api name="GET /fruits" kind="http" scope="public" via="@GET public Set&lt;Fruit&gt; list()"/>
    <decl kind="method" name="list()" sig="public Set&lt;Fruit&gt; list()"/>   <!-- что узел даёт вызывающему -->
    <decl more="3"/>                                            <!-- остаток объявлен, а не выброшен -->
    <test path="src/test/java/org/acme/rest/json/FruitResourceTest.java" suite="unit"/>
  </module>
  <module path="src/main/java/org/acme/rest/json/Fruit.java"
          pkg="org.acme.rest.json" component="c1" level="4" fanin="1" fanout="0">
    <role>Fruit domain model POJO</role>
    <decl kind="field" name="name" sig="public String name"/>   <!-- контракт POJO — это его поля -->
    <decl kind="field" name="description" sig="public String description"/>
  </module>
  <module path="src/test/java/org/acme/rest/json/FruitResourceIT.java" kind="test" suite="component-native"
          pkg="org.acme.rest.json" component="c1" level="1" fanin="0" fanout="1">
    <role>Quarkus integration test marker for FruitResource</role>
  </module>

  <edge from="…/FruitResource.java" to="…/Fruit.java" via="private Set&lt;Fruit&gt; fruits = …"/>
  <edge from="…/fruits.html" to="…/FruitResource.java" via="url: '/fruits'," by="use"/>

  <surface>
    <api name="GET /fruits" kind="http" at="…/FruitResource.java"/>
  </surface>
  <systems/>                                   <!-- пусто — и это ОТВЕТ, а не молчание -->

  <gap path="…" why="…"/>
  <cycle modules="…"/>
  <ambiguous from="…" spec="org.acme.Model" candidates="a/…/Model.java b/…/Model.java"/>
</appgraph>
```

`grammar` — версия грамматики ЧАСТЕЙ (`steps/scope/part.mjs::GRAMMAR_VERSION`), а не второй счётчик:
граф ровно настолько нов, насколько новы части, из которых он слит.

---

## 4. Что откуда берётся `[СДАНО]`

| элемент | источник | правило слияния |
|---|---|---|
| `<module>` + `<role>` `<api>` `<io>` `<test>` | части ролей | ключ — `path`; один путь дважды = отказ |
| `<api … via>` | `graph-computed.xml` | доливается к модулю, дедуп по `name`; наличие `via` показывает, что факт вычислен, а не сказан |
| `pkg` | `graph-computed.xml` (`<pkg>`) | `source.mjs` уже считает `package`; роли не касается |
| `<decl>` | `graph-computed.xml` (`<decl>`) | ТОЛЬКО `visibility="public"` — внутреннее объявление границу модуля не пересекает; `sig` — строка объявления дословно; сверх `DECL_CAP=12` пишется `<decl more="N"/>` |
| `kind="test"` | пути сьютов ∪ ссылки `<test path>` | закрывает дефект «тестовый файл — обычный узел кода», иначе шаг 10 заведёт на него тикет |
| `suite` у `<test>` и у тестового модуля | `<suite path>` + `<suite match>` | самый длинный подходящий `path`, затем отсев по `match` |
| `<edge>` | computed | как есть; `<use>` резолвится в узел-поставщик маршрута и едет `by="use"` |
| `component` `level` `fanin` `fanout` `<cycle>` | рёбра | §2 |
| `<surface>` | `<api scope="public">` всех модулей | проекция, а не новое знание |
| `<systems>` | `<io config>` × `<integration config>` | сшивка по ключу конфигурации; `<io>` без `<integration>` → `declared="no"`, наоборот → `used="no"` |
| `<artifact>` `<suite>` `<build>` `<toggles>` `<branching>` `<contract>` | хребтовая часть | нет хребта → каждый пишется `found="no"`; списочное `<integrations found="no"/>` переводится в пустой `<systems/>` |
| `<subject>` | **план**, полным списком | `gaps` плана → `found="no"`; выводить якоря из частей запрещено — это и есть шов правила G2 |
| `<lang>` `<ambiguous>` | computed | границы вычислимого обязаны пережить слияние |

---

## 5. Гардрейл: у скриптового шага нет рельсы починки `[СДАНО]`

Роли на шаге нет, значит любой блокер — терминальный `blocked` для человека, а не пере-делегация.
Поэтому отказов ровно четыре, и только один из них — про репозиторий:

| отказ | смысл | чинит |
|---|---|---|
| `no-suite` | ни одного `<suite>`: *репозиторий к работе не готов — тест-сьюта нет, нужна отдельная задача на его создание* | человек, отдельной задачей |
| `no-part <клетка>` | план несёт клетку, части нет | инвариант шага 4 сломан |
| `duplicate-module <путь>` | один путь объявлен двумя частями | инвариант шагов 3–4 сломан (клетки не пересекаются, `S2` запрещает чужаков) |
| `lost-subject <якорь>` | якорь плана не доехал в граф | инвариант слияния сломан |

**Всё остальное превращается в объявление, а не в остановку:** ответ хребта не найден → `found="no"`;
неразрешимый импорт → `<ambiguous>`; цикл → `<cycle>`; модуль, который вызывают, а вход его
**нечитаем** — ни `<api>` от роли, ни одного `<decl>` от скрипта при `fanin > 0` → `<gap>`; тест,
которого не ловит ни один сьют → `suite=""` **и `<gap>`**.

Последнее — правка после прогона `899494cc`. Пустого `suite=""` НЕ ХВАТАЕТ: хребет вернул `match`
без `.java`, ни один тест не привязался, и прогон вышел зелёным с `gaps=0` — карта объявила себя
целой, пока ни один тест в ней нельзя было запустить. Отказом это не делается (тест вне сьютов
бывает законен — черновой тест, Go-сьют по build-тегу), но и молчать об этом нельзя.
Известный предел: `<gap>` пишется на УЗЕЛ, поэтому `<test path="…">`, указывающий на файл вне
клеток плана, узлом не стал и в пробелы не попадёт.

Последнее слово важно, и это замер: на живом прогоне **13 из 15 модулей вернулись с `api="none"`**,
и у части из них есть входящие рёбра. Это та же экономика роли, что убила рёбра (`337b957f`):
`checkPart` файлов не читает, значит `api="none"` НЕОПРОВЕРЖИМ и потому всегда самый дешёвый зелёный
ответ. Гардрейлом это не лечится — лечится тем, что вход **вычислим**: `source.mjs` считает
объявления с видимостью, `<decl>` кладёт их на узел (G8), и `<gap>` теперь срабатывает только там,
где не смог никто — бинарь, язык без читателя (`<lang decls="no-rules">`), пустая публичная
поверхность.

---

## 6. Программа и её интеграция `[СДАНО]`

Род шага — **скрипт**: ни роли, ни оператора, ни staging. Форма ровно как у `survey` (шаг 3): решает
чистое ядро, пишет хост, воркфлоу только называет фазу и разбирает вердикт.

`workflows/izi.js` — новая фаза целиком:

```js
// FUNCTION_CONTRACT: graph — step 5: the swarm's parts + the script's facts → one map
//   Input:        —
//   Dependencies: EXTERNAL — buildGraph (ext/index.mjs → steps/graph/graph.mjs::newGraph)
//   Antecedent:   step 4 promoted a part for EVERY cell of .agent/survey-plan.json
//   Consequent:   success: exits ok with .agent/appgraph.xml — the first artifact that knows the
//                          repository. The merge is a commutative monoid over the node path, so the
//                          order of the scouts never mattered and no batch order is replayed here
//                 failure: exits err("blocked"). Only ONE of the four refusals is about the
//                          repository itself — no-suite, which a human fixes with a separate task;
//                          the other three mean an invariant of steps 3-4 is broken (docs/graph.md §5)
//   Purity:       io (through the host)
async function graph() {
  const g = await buildGraph({ path: ".agent/appgraph.xml" });
  if (!g.ok) exit(err("blocked", { subject: g.why }));
  log(`graph: modules=${g.modules} components=${g.components} levels=${g.levels} edges=${g.edges} gaps=${g.gaps}`);
  // What the repository did NOT answer is printed BEFORE step 10 asks the operator about it: a
  // `found="no"` that stays inside the artifact is indistinguishable from a step that did not run.
  if (g.unanswered.length) log(`graph: не найдено в репозитории — ${g.unanswered.join(", ")}`);
  if (g.cycles) log(`graph: циклов ${g.cycles} — топосорт шага 10 их не переживёт, см. <cycle> в артефакте`);
  exit(ok({ artifact: ".agent/appgraph.xml", modules: g.modules, components: g.components }));
}
```

Интеграция — две строки, и одна правка соседа:

```js
  phase("survey-plan"); await surveyPlan();
  phase("scope");       await scope();      // exit(ok(…)) → return: scope перестаёт быть концом прогона
  phase("graph");       await graph();      // ← новая фаза; та же правка, что S15 сделала с brd()
```

Порядок остаётся КОДОМ, а не `pipeline.json`: пятая фаза — ещё одна именованная функция. Решение
пересматривается тогда, когда цена ручного перечисления фаз превысит цену манифеста с диспетчером и
их тестами, — не раньше (`docs/concept.md`, «Что отложено и почему»).

Функция хоста `buildGraph` (`ext/index.mjs`, io-модуль — юнитами не покрывается, его доказывает живой
прогон):

```
buildGraph({ path }) -> { ok, why?, modules, components, levels, edges, gaps, cycles, unanswered[] }
```
читает `.agent/survey-plan.json`, части **по плану** (`.agent/graph-parts/<клетка>.xml` — не листингом
каталога: отсутствующая часть есть потерянное поддерево, и она обязана быть названа) и
`.agent/graph-computed.xml`; пишет артефакт ПОСЛЕ зелёного `newGraph`, потому что артефакт создаётся
только после решения его принять (`standards/code.md` §6).

Чистое ядро — два модуля, оба без диска и без второго парсера (`parsePart` из `steps/scope/part.mjs`,
`parseComputed` из `steps/scope/computed.mjs`, сканер `core/xml.mjs`):

```
steps/graph/levels.mjs  newLevels({ nodes, edges }) -> { components, level, fanin, fanout, cycle }
steps/graph/graph.mjs   mergeGraph({ parts, computed, plan }) -> Graph
                        checkGraph(graph) -> string[]
                        newGraph({ parts, computedXml, plan }) -> Result<Graph, "no-suite"|"invalid-graph">
                        graphXml(graph) -> string
```

## 7. Вход узла вычисляет скрипт — G8 `[СДАНО]`

Прогон `c4fde2f3` показал дыру: `Fruit.java` и `Legume.java` **вызывают** (`fanin=1`), а `<api>` у них
`none` — карта не отвечает на вопрос «что этот узел даёт вызывающему», и шагу 9 неоткуда взять
`<contract in out>`. Ответ роли лечению не поддаётся: `checkPart` файлов не читает.

| | что сделано |
|---|---|
| G8a | `source.mjs` читает публичные **поля** — java (модификатор доступа на строке = поле по грамматике языка) и struct-поля go. Контракт POJO — это его поля: тело JSON `{name, description}` |
| G8b | `<decl kind name sig/>` в `graph-computed.xml` и на узле графа; `sig` — строка объявления **дословно** (`d.line`), ноль нового парсинга. Только `scope="public"` |
| G8c | `<lang … decls="class,…,field \| no-rules">` — граница названа вслух списком КИНДОВ, а не да/нет: читатель сам видит, что у ts поля интерфейса не искали |
| G8d | `<gap>` переписан: срабатывает, когда вход **нечитаем** (ни `<api>`, ни одного `<decl>` при `fanin > 0`), а не когда роль сказала `api="none"` |
| G8e | замер потолка (ниже) и `DECL_CAP = 12` с объявленным остатком `<decl more="N"/>` |

**Замер G8e — потолок.** Выбор `DECL_CAP` считался статикой на чужом java-дереве (287 узлов, 537
публичных объявлений):

| потолок `<decl>` | байт/узел сверху | карта держит узлов | узлов сверх потолка |
|---|---|---|---|
| без потолка | +208 | 301 | — |
| 12 | +120 | 381 | 9 |
| 8 | +103 | 401 | 14 |
| 6 | +88 | 421 | 20 |

Взят **12**: спуск к 6 покупает 40 узлов потолка и прячет ещё 80 объявлений, а сверх любого из этих
порогов вылезают одни и те же 9 god-классов. Остаток объявлен на узле, а не выброшен молча.

**Живой прогон `c166bd87` подтвердил механику и поправил цену вверх** (форма
`quarkus-rest-json-app-v2-t1-3`, 15 узлов, 27 объявлений): блок `<module>` весит **417 б/узел**, из
них `<decl>` — **148**, то есть без объявлений было бы 270. Карта держит **≈306 узлов** вместо ≈474.
Статический замер (+120) занижал: там половина узлов чужого дерева — файлы без публичной поверхности,
здесь публичен почти каждый. Потолок `DECL_CAP` на этой форме не достигнут ни разу (`<decl more>`
нет), так что цена измерена без урезания.

**Чего G8 не делает:** не разбирает сигнатуру на `in`/`out`. `<contract in out>` шага 9 — это токены
ПОТОКА, сверяемые строгим совпадением строк (`docs/data-flow.md` §6, правило 4), а не сигнатура;
парсер пришлось бы писать на каждый язык, и форма угадывалась бы под шаг, которого в программе нет.

Грамматика ЧАСТЕЙ не изменилась: `GRAMMAR_VERSION` остался `3`, кэш жив, рой не перепрогонялся.

---

## 8. Что этот шаг НЕ делает `[СДАНО]`

Не судит качество кода, не говорит с оператором, не зовёт ни одной роли, не строит индексную форму
(она — чтение карты, работа шага 6, и посчитается там на живых фактах), не чинит части и не
переспрашивает скаутов.
