# Root cause: 5/7 функций, подстановка без проводника — backlog-intake

## Замер (прогон qwen3.8-27b, 26.08.2026, критик APPROVE, frd.xml sha1 d580a51a2e8c)

| узел плана | функция | работает? | что не хватает |
|---|---|---|---|
| RestGlossaryStore (new) | CRUD REST | ✅ | — |
| GlossaryStore mongo (new) | CRUD persistence | ✅ | — |
| GlossaryService (new) | подстановка, кэш | ⚠️ сервис есть | **кто вызывает?** MemoryItemConverter без дельты |
| RestExportService | экспорт ZIP | ✅ | — |
| RestImportService + UpgradeExecutor | импорт + merge | ✅ | — |
| IRestAgentStore + AgentConfiguration | привязка | ✅ | — |
| — | проводка подстановки | ❌ | MemoryItemConverter не в дельтах |
| — | зеркала квинтеты | ❌ | GlossaryConfiguration, IGlossaryStore, IRestGlossaryStore |
| — | синк-источники | ❌ | IResourceSource, Zip, RemoteApi, Matcher |

---

## Корень 1: owners назначил только 8 узлов — НЕ contracts сжал

**Доказательство**: staging/frd~owners.xml имеет 32 owner-СТРОКИ, но **8 уникальных узлов**
(каждый узел — владелец нескольких шагов). RTM корректно собран из owners → 8 узлов. F19
корректно зелёный (все 8 имеют дельты). Проблема: **owners сам не назначил 11 модулей**.

## Корень 2: blueprint «package» — соседи по КАТАЛОГУ, не СЛОЙ

**Код**: `rtmArgs: pkg = nodes.filter(n => dirOf(n) === dirOf(path))` — только same-dir.
Blueprint для RestPromptSnippetStore несёт 2 файла из `configs/snippets/rest/`, а не квинтету
из `configs/snippets/`. Правило b1 «зеркало» судит по подкаталогам КОРНЯ СЛОЯ — но слой в
blueprint не попал → зеркало не сработало → GlossaryConfiguration не назначен.

## Корень 3: b2 callers из map.edges, не computed.edges

**Код**: `rtmArgs: callers = map.edges.filter(e.to === path).map(e.from)` — рёбра карты роя.
Карта роя может не нести ребро MemoryItemConverter→PromptSnippetService. Computed graph
строит рёбра из импортов по всему репозиторию — проводник гарантированно есть. b2 без
правильного ребра молчал → подстановка мёртвым кодом.

## Корень 4: b2 «хоть один звонящий» вместо «правильного проводника»

CounterweightService (тот же каталог modules/llm/impl/) — сосед, не проводник.
MemoryItemConverter (engine/memory/) — проводник (делает инъекцию). Прежнее правило
удовлетворялось соседом → GlossaryService создан, но никто извне пакета его не вызывает.

---

## Правки (T68, этап 1 — код)

### T68-1: blueprint слой вместо каталога
`rtmArgs` — package = все узлы в `layerRoot(path)`, не `dirOf(path)`.
**Живой шов**: blueprint для RestPromptSnippetStore теперь несёт PromptSnippet.java,
PromptSnippetStore.java, RestPromptSnippetStore.java (вся квинтета в корне snippets/).

### T68-2: callers из computed.edges
`rtmArgs` — callers из `parseComputed(graph-computed.xml).edges`, не из map.edges.
**Живой шей**: звонящие PromptSnippetService из computed включают MemoryItemConverter,
LlmTask, RestTemplatePreview (5 не-тестовых + тестовые).

### T68-3: проводник = звонящий из ДРУГОГО пакета
`rtm.mjs::b2` — звонящие из `dirOf(caller) !== dirOf(pattern)` обязаны быть со-владельцами.
Сосед из того же каталога не считается.
**Живой шей**: b2 блокирует GlossaryService — «звонящие из ДРУГОГО пакета:
RestPromptSnippetStore, MemoryItemConverter — ни один не владеет».
**Юнит**: сосед не закрывает проводника; проводник закрывает; все в том же каталоге — молчит.

### T68-4: наряд починки с соседями (этап 3)
FEEDBACK при rtm-кластерах перечисляет ВСЕХ соседей ядра с ролями.

---

## T69: рельса lookup обслуживается скриптом, а не горит токенами (живой круг 26.08, 16:05–16:20)

### Замер дефекта

Прогон DOS-535, починка owners после rtm:backward-кластера: **14 запусков роли, 488k
токенов, артефакт не менялся 15 минут**. Роль круг за кругом возвращала
`track:err, kind:lookup, items:[LlmModule, AgentOrchestrator, …]` — список только
расширялся. Три факта по коду:

1. `intake.step.mjs:141` — конверт `err` с `kind ≠ question` падает в `put(state, {})`:
   НИ круг не потрачен, НИ ответ не приготовлен. Рельса lookup не обслуживается никем.
2. `order.mjs::orderText` подставляет `{FEEDBACK}` с ИМЕНАМИ соседей (rtm-блокер их
   называет), но не их ПУТИ. Модель просит пути — наряд приходит без них — и по кругу.
3. Страж `next()` (`p.round > intakeLoops`) не срабатывает: round не двигается, потому
   что круг «не тратится». Вечный круг без эскалации — страж разоружён самим дефектом.

Пути в карте ЕСТЬ: LlmModule — 4 упоминания в appgraph, AgentOrchestrator — 5. Вопрос
вычислим; по философии проекта его считает скрипт, а не модель.

### Data-flow: как должно работать

```
роль вернула { track:"err", kind:"lookup", items:[имена] }
  │  fold (intake.step.mjs), ветка рядом с question
  ▼
portion.lookup = resolveItems(items)              ← скрипт, 0 токенов
  │   источник — typesOf(state) (cut.mjs:39): name · path · kind из graph-computed;
  │   совпадение по basename без расширения. Найдено: полный путь + kind.
  │   НЕ найдено: «нет в карте» — модель перестаёт искать, идёт в question если нужно.
  ▼
next(): orderText(state, pass, { previous, feedback, closed, lookup })
  │   lookup непуст → в конец наряда ДОБАВЛЯЕТСЯ раздел (не слот шаблона — шаблоны
  │   тотальны, дырявить четыре .tpl ради машинного блока не нужно):
  │     $START_DOCUMENT path: .agent/map-lookup (machine-answered)
  │     LlmModule → src/main/java/ai/labs/eddi/modules/llm/impl/LlmModule.java · kind
  │     FooService → нет в карте
  ▼
роль получает ответ ДО того, как спросить повторно; круг не тратится, staging цел

БЮДЖЕТ: portion.lookups += 1 на каждый lookup; lookups > budgets.lookupLoops (2)
  → escalate «lookup по <items> не разрешается за N кругов» — именованный конец
  вместо вечного цикла. Страж восстанавливается: счётчик двигается даже тогда,
  когда круг роли «бесплатный».
```

### Правки

| где | что |
|---|---|
| `intake.step.mjs` fold | ветка `kind === "lookup"`: `resolveItems` → `portion.lookup`, `portion.lookups + 1`; сверх бюджета — escalate |
| `intake.step.mjs` next | `orderText(..., { lookup: p.lookup })`; после выдачи наряда `portion.lookup` чистится (ответ доставлен) |
| `order.mjs::orderText` | параметр `lookup`; непустой — блок `$START_DOCUMENT path: .agent/map-lookup` в конец текста |
| `cut.mjs` | `resolveItems(state, names)` — по `typesOf`, basename-совпадение |
| `ext/state.mjs` | `DEFAULT_BUDGETS.lookupLoops: 2` |
| T68-4 (остаётся) | FEEDBACK rtm-кластеров несёт соседей сразу с путями — тогда lookup в этом сценарии не возникает вовсе |

### Seam (принимается пере-внедрением дефекта)

Компонентный тест: роль дважды возвращает `kind:lookup, items:["LlmTask"]` —
второй наряд уже содержит раздел map-lookup с путём, третий не выдаётся (escalate).
Без правки: наряды идут без ответа — тест красный ровно на этом.

---

## T70: F19-блокер маршрутизируется на contracts, а не жжёт круги критика (живой круг 26.08, 16:33–16:50)

### Замер дефекта

Прогон DOS-535 (возобновление), подшаг 6: **5 кругов критика по одному блокеру,
escalate «порция critic: круг 5 за пределом бюджета 3», frd.xml не продвинут.**
Блокер один и тот же: `F19 владелец «AbstractBackupService.java» заявлен в rtm.md,
но без дельты и без touched`.

Цепочка: (1) coverage-суд нашёл rtm:backward-кластер → маршрутизация переоткрыла
owners; (2) owners-починка ДОБАВИЛА со-владельцев (AbstractBackupService на R3) —
законно; (3) contracts был закрыт РАНЬШЕ починки — дельты на новый узел нет;
(4) F19 судит полный двор на критике — критик писать дельты не может, его слой
критика; (5) круг гонял блокер до бюджета.

Тот же класс, что и rtm:→owners: блокер называет работу ДРУГОГО пласта — маршрута
F19→contracts нет.

### Правка

`intake.step.mjs` fold, ветка блокеров (рядом с rtm:→owners): строки `F19` при
`p.id !== "contracts"` → contracts получает `todo` + эти строки своим FEEDBACK,
текущий пласт остаётся `todo` БЕЗ них, круг текущего не тратится. Contracts,
получив F19 в СВОЁМ круге, чинится как обычно (обычный repair-круг).

### Data-flow

```
суд пласта X (любой, чаще critic) вернул блокеры
  │  строки вида «F19 …»?
  ▼
contracts: status=todo, blockers=«F19 …»        ← круг имеет чем закрыть: дельта/touched
X: остаётся todo, блокеры БЕЗ F19-строк          ← круг X не потрачен
  ▼
next() берёт contracts (первый todo) → наряд починки несёт FEEDBACK=F19
```

### Seam

Компонентный тест: tmp-cwd с rtm.md (R1 → владельец src/Foo.java без new) и
артефактом critic без дельты на Foo.java → fold: F19-блокер уходит на contracts
(todo + FEEDBACK), critic без F19-строк, его round не двигается.

---

## T71: resume отличает «артефакт написан» от «пласт принят» (приёмка 26.08, два случая)

### Замер дефекта

Приёмка подшага 6, дважды за день: прогон умирает с красным critic (5 кругов, F19) →
артефакт `staging/frd~critic.xml` остаётся на диске → СЛЕДУЮЩИЙ прогон завершается
за 0,2 с: recon (`ext/recon.mjs:81`) помечает ВСЕ пласты `green` по существованию
файлов, intake говорит `done`, weight отвечает «frd.xml не существует». Оператор
выносит труп-артефакт руками — это ручная правка рант-стейта.

### Root cause

«Файл есть» ≠ «суд зелёный»: verdicts умирающего прогона не читаются, последний
пласт без продвижения неотличим от принятого.

### Правка

Recon: последний пласт intake (`critic`) зелёный ТОЛЬКО при продвинутом `.agent/frd.xml`;
иначе `todo` (артефакт на диске — черновик круга починки, PREVIOUS-режим его подхватит).
Шов: tmp-cwd с critic-артефактом без frd.xml → next() эмитит role, не done.

---

## T72: вывод доминирует — два разреза нарядов (замер субагента 26.08)

### Замер

| пласт | наряд | PREVIOUS-копия | пишет модель | живое время |
|---|---|---|---|---|
| data-failures | 28,4 КБ | 15,4 КБ | ~18 КБ (все слои + свой) | 4–7 мин |
| coverage | 22,5 КБ | 17,4 КБ | ~19 КБ | минуты |
| critic | 39,9 КБ | 17,9 КБ | ~18 КБ ради ОДНОЙ строки вердикта | 4–5 мин/круг |
| contracts | 4,7 КБ | — | мало | ~20 с (контроль: время следует за выводом) |

Root cause: наряды требуют «пиши весь накопительный артефакт + свой слой».

### Правки (по выигрыш/риск)

1. **Критик пишет только вердикт**: OUTPUT в order-critic.tpl — одна строка;
   склейка `&lt;critique/&gt;` в fold перед promote (прецедент — writeRtmFromArtifact).
   Суд не меняется; вывод −2 порядка.
2. **data-failures/coverage пишут слой-файл** `frd~&lt;pass&gt;.layer.xml`, склейка
   mergeLayers в fold → `frd~&lt;pass&gt;.xml` на прежнем пути. PREVIOUS остаётся полным
   (ввод дёшев). Идемпотентность склейки — юнит; «слой в чужом файле → invalid» — seam.
   Вывод −4…6×, починные круги дешевеют.

Не трогать: owners (его 4 мин — thinking над 23 КБ кандидатов, вывод мал; уже раз
облегчен T63: 107 КБ → 36 КБ) и scenarios.

---

## T73: F19 невидим при грязном артефакте (найдено при отладке T70)

### Замер

`judge.mjs`: если `newFrd` (frd.mjs:1219) находит чужие блокеры, judgePass возвращает
их — а checkFrd первого прохода зовётся БЕЗ rtm → F19 не родится, «сжатие contracts»
увидится кругом позже (когда форма починена).

### Правка

Передать rtm в checkFrd первого прохода newFrd. Шов: артефакт с чужим блокером И
rtm-владельцем без дельты → оба блокера в одном ответе суда.

---

## T74: расхождение с эталоном — проводник, синк-кластер, интерфейсы квинтеты (РЕШЕНИЕ ОПЕРАТОРА)

Финал DOS-535: 9 узлов против 18 эталонных, 7/7 функций. Отсутствуют:
MemoryItemConverter (проводник подстановки — T68-3 требовал, contracts-круг легально
сбросил со-владельца, backward-кластер после этого не повторялся: coverage был зелёный,
маршрут T70 вёл только F19→contracts), синк-кластер импорта (IResourceSource/Zip/
RemoteApi/StructuralMatcher — merge лёг на RestImportService+UpgradeExecutor),
интерфейсы квинтеты (тип уложен в 3 файла).

Возможная правка МЕХАНИКИ (если оператор решит дожимать): повтор backward-суда после
КАЖДОЙ contracts-починки по маршруту T70 — сегодня суд повторяется только на coverage.
Решение: принять лёгкий план ИЛИ дать круг на дожим.

---

## Мысленный эксперимент: доказательство сходимости

### Текущее поведение (без T68)

```
1. Owners → 8 узлов (шаги UC → модули)
   Blueprint RestPromptSnippetStore = [IPromptSnippetStore, PromptSnippet] (same dir)
   → b1 НЕ видит model/, mongo/ в слое → зеркало НЕ требуется
   → GlossaryConfiguration НЕ назначен
   b2: callers PromptSnippetService = [map.edges] → может быть пусто
   → GlossaryService без проводника → b2 молчит
   → MemoryItemConverter НЕ назначен

2. Contracts → 8 дельт (F19 зелёный — все RTM-узлы покрыты)
3. Plan → 8 модулей → 5/7 функций
```

### После T68

```
1. Owners → 8 узлов
   Blueprint RestPromptSnippetStore = ВСЯ квинтета (T68-1: layerRoot)
   → b1 требует зеркала model/, mongo/, rest/ + интерфейсы в корне
   → модель ДОЛЖНА назначить GlossaryConfiguration, IGlossaryStore, IRestGlossaryStore
   → owners: 8 + 3 зеркала = 11

   b2: GlossaryService after=PromptSnippetService
   callers ИЗ computed (T68-2) включают MemoryItemConverter (engine/memory ≠ modules/llm)
   проводник из ДРУГОГО пакета (T68-3) → MemoryItemConverter обязан быть со-владельцем
   → owners: 11 + MemoryItemConverter = 12

   b3: RestExportService/RestImportService в ядре
   → со-владельцы-соседи (T68-4 наряд перечисляет)
   → owners: 12 + AbstractBackupService + CallbackMatcher + RemoteApi + SourceUrlValidator = 16

2. Contracts → F19 держит → 16 дельт (или touched)
3. Plan → ≥12 модулей
4. Функции:
   ✅ CRUD (квинтета целиком: model + interfaces + mongo + rest)
   ✅ Подстановка (GlossaryService + MemoryItemConverter — ПРОВОДКА!)
   ✅ Экспорт (RestExportService)
   ✅ Импорт + merge (RestImportService + UpgradeExecutor)
   ✅ Привязка (AgentConfiguration + IRestAgentStore)
   ✅ Версионирование (наследуется)
   ✅ Синк (IResourceSource, Zip, RemoteApi, Matcher — кластер)
   = 7/7 функций решены
```

### Индукция

**База**: F19 сейчас правильно требует «каждый RTM-владелец имеет дельту» — все 8 узлов
покрыты. F19 работает.

**Шаг**: если owners назначит больше узлов (T68-1 зеркала + T68-2/3 проводник + T68-4
соседи), F19 потребует дельты на них. Количество узлов монотонно не убывает (F19 запрещает
усадку). T68 только добавляет требования, не снимает.

**Следствие**: итог ≥ 8 + 4 (минимум: 3 зеркала + проводник) = 12.

**Предел**: квинтета (5) + проводник (1) + синк (4) + существующие (8, из них 3
дублируются с квинтетой) = ~15-16 уникальных модулей. Достаточно для 7/7 функций.
```

---

## Этапы

### Этап 1 — код (сделано): T68-1..3 в rtm.mjs + intake.step.mjs, линия 529/529

### Этап 2 — оператор: настройка провайдера
Оператор переключает модель в settings.json под нового провайдера.
Требование: модель ≥27B, tools (write + workflow_result).

### Этап 3 — прогон (после подтверждения): T68-4 + рунбокс + полный intake
1. T68-4 в order-owners.tpl FEEDBACK
2. Рунбокс начисто: staging/frd~*.xml + rtm.md + intake-b0.xml + frd.xml → удалить
3. Переустановка харнеса
4. Полный intake v2 (6 подшагов с нуля) на новом провайдере
5. Мониторинг по 6 сигналам
6. Анализ: ≥12 дельт, MemoryItemConverter + квинтета + синк в плане, эталон ≥14/19

---

## T78: forward-суд признаёт carried-by-nfr носителем (тупик quarkus 27.08, 44 красных круга)

### Замер дефекта

Живой прогон FRUIT-1 (после падения fast-трека в полный путь): R3 «preserve | existing calls»
красный **44 раза**, пинг-понг one↔coverage↔owners, 24 агента, 269k токенов, frd.xml нет.

Логическая цепочка тупика:
1. Артефакт несёт `<carried req="R3" by="nfr:backward-compatibility"/>` — требование унесено
   нфр-гарантией, и это ПРАВИЛЬНАЯ форма для ограничения «не ломать существующее».
2. forward-суд (`rtm.mjs`) признаёт носителем только owners ИЛИ questions — carried он не видит.
3. Глагол `preserve` не входит в PROPERTY_VERBS (define/set/name/constrain/restrict/limit) —
   exemption не спасает.
4. Модель не может назначить владельца на «сохранить как есть» — это не действие; каждый
   owners-круг зелёный, coverage краснеет снова. Два правила требуют несовместимого = ТУПИК.

Прогон 26.08 прошёл случайно: его глагол попал в exemption-список.

### Правка

- `rtm.mjs::rtmJudge` — новый параметр `carriedBy: Set<req>`; forward проходит при
  owners ИЛИ questions ИЛИ `carriedBy.has(req)`. НЕ любой carried: by="UC1/2" носителем
  НЕ считается (F11 и так требует carried на каждое R — иначе forward пуст; работу делает
  owner, UC-ссылка — не гарантия). Носитель — только `by="nfr:…"`: ограничение, унесенное
  гарантией.
- `intake.step.mjs::rtmArgs(state, staged)` — собирает carriedBy из parseFrd(staged).carried
  (фильтр `by` начинается с `nfr:`); оба вызова rtmJudge (coverage, one) передают staged.

### Seam

Юнит rtm.test.mjs: R без owners/questions + carried by="nfr:x" → блокера НЕТ; carried
by="UC1/2" → блокер ЕСТЬ. Реинтродукция: убрать carriedBy из условия — первый красный.
