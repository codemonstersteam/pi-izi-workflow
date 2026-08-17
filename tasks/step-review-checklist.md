# Наряд: чек-лист критика по FRD + определение тогла

Улика: прогон `c64dbd32`, форма `sandbox/runbox/quarkus-rest-json-app-v2-t2`. Шаг 11 вернул
`<review verdict="Pass" grammar="1"/>` (`.agent/review.xml`) при трёх дефектах плана. Артефакты
проверены на диске: `.agent/plan-index.json` (узел `toggle` ПЕРВЫЙ в `order`, механизм
`maven profiles (-Pnative for native build)` из строки 6 `.agent/appgraph.xml`; `fruits.html`
`check: []`, закрыт `scenario:S2` командами `mvn test` / `mvn verify -Pnative`), `.agent/frd.xml`
(`<question subject="fruit-not-found">`, `<ext id="2a">` в UC1 и UC2), `.agent/brd.md`
(R2 `verify: UI-тест`). `TASK.md` и BRD про переключатели не говорят ничего.

## 1. Первопричины, по дефектам

**Д1 — узел `toggle` из галлюцинации.**
- `steps/scope/order.spine.tpl:3-5` и `steps/scope/scout.md:199` спрашивают «how features are
  SWITCHED OFF» — определения, что считается механизмом, нет нигде.
- `steps/scope/part.mjs:59` — `SPINE_ANSWERS` для `toggles` проверяет только непустоту `mechanism`
  (P1, `part.mjs:291-303`); строка «maven profiles» проходит любой существующий гардрейл.
- `steps/plan/plan.mjs:186-196` доверяет механизму (`source: "graph"`), `plan.mjs:270` ставит каждый
  `code`-узел с дельтой за тоглом — отсюда `toggle` первый в `order`.
- Критику обратная проверка ЗАПРЕЩЕНА дословно: `steps/review/critic.md:33-34` — «The other
  direction is not yours to check: the plan's nodes come from the FRD's own touched paths and deltas,
  so a node nothing asks for cannot occur». Посылка ложная: узлы `toggle` и `scenario:*` синтезирует
  сам `plan.mjs` (`:190`, `:223`) — не из FRD.

**Д2 — потерянная ветка требования.**
- `steps/review/critic.md:31-32` (LAW 2.2): консеквенты, которые план должен, — только `<post>` и
  `after`. `<ext>` не в списке.
- `steps/review/review.mjs:96-101` — `frdIds` знает usecase/scenario/failure/delta; id расширения
  (`UC1/2a`) и subject вопроса улика нести НЕ может — R4 отверг бы честную находку.
- `steps/intake/frd.mjs:115` парсит `<question>`, но потребителя нет ни одного
  (grep по `steps/ core/ ext/ workflows/` — ноль чтений `frd.questions` вне парсера): открытый
  вопрос доезжает до плана молча.

**Д3 — непроверяемый узел.**
- `steps/review/critic.md:45-47` (LAW 4) + `steps/review/order.tpl:38-39` запрещают судить команду
  вовсе; `review.mjs:35` — словарь из двух кодов, «команда физически не исполняет узел» невыразимо.
- `docs/review.md` §2.2 вычеркнул `check-not-witnessing` — для СВОЕГО случая верно (java-узел, чей
  будущий тест ляжет под маску сьюта), но вместе с ним исчез и вопрос «есть ли канал наблюдения
  вообще». Для `fruits.html` его нет: обе команды S2 гоняют java-сьюты (`match="*Test.java"` /
  `*IT.java"`, `appgraph.xml:3-4`), поведение страницы не исполняет ни одна.

## 2. Часть 1 — чек-лист вместо суждения «в целом»

### 2.1. Словарь кодов: два существующих + три новых

| код | пишет | node | evidence (R4) | culprit | owner | ловит |
|---|---|---|---|---|---|---|
| `unreachable-antecedent` | роль | узел плана | id узла плана | plan-index.json | 10 | как сейчас |
| `goal-not-delivered` | роль | узел плана | id FRD, **расширен**: + `UC*/ext` (`UC1/2a`), + `nfr:<subject>` | frd.xml | 6 | Д2 (ветка) |
| `open-question` (нов.) | **скрипт** | `question:<subject>` (синтетический) | subject вопроса | frd.xml | 6 | Д2 (вопрос) |
| `node-not-required` (нов.) | роль | узел плана | тот же id узла (адрес и есть улика) | appgraph.xml | `operator` | Д1 |
| `unverifiable-node` (нов.) | роль | узел плана | id FRD (сценарий/ext, чьё поведение не наблюдается) | frd.xml | 6 | Д3 |

Правки таблиц: `review.mjs:35` (`CODES`), `:40-60` (`CODE_CULPRIT`/`CODE_OWNER`/`CODE_EVIDENCE`).
Новое значение владельца `operator` — третья ветка маршрутизации в `workflows/izi.js:1137-1144`:
блокер с owner `operator` ⇒ `escalate` с находками (машинной починки нет, перемотка на 6 не властна
над картой). `open-question`/`unverifiable-node` едут перемоткой на 6 существующей рельсой
(`docs/review.md` §6): intake задаёт вопрос оператору либо перекраивает сценарий — рельса вопросов у
шага 6 есть.

### 2.2. Механика чек-листа: скрипт считает пункты, роль судит соответствие

**Что вычислимо — вычисляется скриптом за 0 токенов** (`docs/concept.md`, правило 3; `CLAUDE.md`
constraint 1). Три новых чистых функции в `steps/review/review.mjs`:

1. `owedItems(frd, plan)` — список пунктов, которые план ДОЛЖЕН, с машинными id:
   `UC1/post`, `UC2/post`, `S1`, `S2` (after), `UC1/2a`, `UC2/2a` (ext), `nfr:existing-contracts`,
   плюс по одному синтетическому пункту на каждый узел плана, которого FRD не называет (сегодня —
   `toggle`: пункт несёт строку механизма). Id генерирует машина — роль их копирует, не сочиняет
   (`CLAUDE.md` constraint 4).
2. `autoFindings({plan, frd})` — находки без роли: каждый `<question>` FRD ⇒ блокер `open-question`.
   Вызывается из `review({path})` (`ext/index.mjs`) и сливается с вердиктом роли: скриптовая находка
   делает итог `Reject` даже при `Pass` роли (R1 продолжает судить только файл роли).
3. Кандидаты для роли, подставляемые в наряд: `UNCHECKED` — `code`-узлы с `check: []` и команды их
   сценариев (на `c64dbd32` — ровно `fruits.html`).

**Наряд (`order.tpl`) получает чек-лист как ДАННЫЕ**, не как декларацию: `{OWED}` — готовая таблица
пунктов, `{UNCHECKED}` — готовый список узлов. Считает их `reviewForm` (`ext/index.mjs:1572-1583`,
читает те же два файла, что и `review()`); `workflows/izi.js:1012` передаёт два новых ключа.

**Роль заполняет таблицу, а не пишет эссе.** Грамматика артефакта, версия 2:

```xml
<review verdict="Pass | Reject" grammar="2">
  <covers item="UC1/post" node="src/.../FruitResource.java"/>
  <!-- по строке на КАЖДЫЙ пункт {OWED}; либо вместо строки — блокер с evidence=этот id -->
  <blocker code="…" node="…" evidence="…">…</blocker>
</review>
```

Два новых правила гардрейла (рядом с R1..R4 в `newReview`, `review.mjs:117-165`):

- **R5 — полнота**: каждый id из `owedItems` закрыт ровно одним из двух — `<covers item node>` с
  `node`, резолвящимся в узел плана, ЛИБО блокером с `evidence`=этот id. Пункт без того и другого,
  как и лишний/дублирующий `item`, — красная ФОРМА (пере-делегация критику). «В целом да» перестаёт
  существовать: Pass без полной таблицы не проходит гардрейл.
- **R6 — обратная половина**: узел плана, которого не называет ни `<touched>`, ни `<delta>`, ни
  `<scenario nodes>` FRD (вычислимое множество; на `c64dbd32` — ровно `{toggle}`), обязан либо
  встретиться в `covers@node`, либо нести блокер `node-not-required`. Решение по каждому такому узлу
  принудительно; обычные `code`-узлы ширины под R6 не попадают — ноль шума на честном плане.

`GRAMMAR_VERSION` review — 2. Потребители грамматики `.agent/review.xml`: `ext/index.mjs::review`,
`docs/review.md` §7; шага 12 нет (constraint 5 — потребители названы, форма `covers` аддитивна).

### 2.3. Что судит роль (и только это)

1. Антецеденты по `order` — как сейчас (`unreachable-antecedent`).
2. Каждая строка `{OWED}`: «какой узел производит этот пункт» — сопоставление прозы с планом,
   множеством не выражается. Не производит никто ⇒ `goal-not-delivered`.
3. Строка синтетического пункта узла вне FRD (тогл): «механизм переключает поведение работающего
   приложения без пересборки?» — определение (§3) подставлено в строку. Нет ⇒ `node-not-required`.
4. Каждый узел из `{UNCHECKED}`: «какая из команд его сценариев ИСПОЛНЯЕТ поведение узла, требуемое
   его пунктами FRD?» Назвать нечего ⇒ `unverifiable-node`. LAW 4 сужается, не отменяется:
   «покраснеет ли команда» — по-прежнему шаг 16 фактом (§2.2 `docs/review.md` в силе); «исполняет ли
   хоть одна команда узел вообще» — теперь вопрос критика, эмпирики в нём нет.

### 2.4. Покрытие грамматики FRD — каждому элементу назначен проверяющий

| элемент (`frd.mjs::parseFrd`) | кто проверяет |
|---|---|
| `<usecase>/<post>` | таблица `{OWED}` → роль → `goal-not-delivered` |
| `<usecase>/<step>` | проход антецедентов → роль → `unreachable-antecedent` |
| `<ext>` | таблица `{OWED}` (id `UC*/ext`) → роль |
| `<scenario>` (`after`) | таблица `{OWED}`; наличие узла/маршрута — построение `plan.mjs` + `checkDesign` 5 |
| `<delta>`, `<touched>` | узлы плана ПО ПОСТРОЕНИЮ (`plan.mjs:133,158` — ширина); повторно не судится (LAW 3) |
| `<failure>` | правило 8 шага 9 (`docs/review.md` §2.4) — не критик |
| `<field>` | шаг 6 (F5 provenance); плану отдельно от своей операции ничего не должен |
| `<nfr>` | таблица `{OWED}` (`nfr:<subject>`) → роль |
| `<question>` | `autoFindings` → `open-question`, 0 токенов |

Ни один элемент не остаётся без назначенного судьи — и ни один не судится дважды.

### 2.5. Внимание LLM: где стоит чек-лист и что сокращается

Модель ролей — `openrouter/qwen/qwen3.6-27b`, слабый тир. Замер сегодня: `critic.md` — 206 строк,
LAW 7 правил (стр. 21-59), FORBIDDEN 10 запретов (стр. 99-121), EXAMPLE 46 строк; `order.tpl` — 62
строки, CONSTRAINTS 14 строк.

Размещение: **LAW** держит только правила суждения (что значит «пункт покрыт»); **наряд** несёт
ЭКЗЕМПЛЯР чек-листа — подставленные `{OWED}`/`{UNCHECKED}` (по-строчному: прочитал строку → назвал
узел или блокер); **гардрейл** держит полноту (R5/R6). Пошаговость обеспечена формой: незаполненная
строка — красная форма, а не пропущенное суждение, и модели не нужно ПОМНИТЬ список — он перед ней.

Сокращения в `critic.md`: LAW 2.2 теряет ложное «other direction is not yours to check» (стр. 32-34
— удаляется, его место занимает обязанность таблицы); LAW 4 ужимается до одной строки («красноту
меряет шаг 16»); STRATEGY шаги 2-3 заменяются заполнением таблицы. Бюджет: роль ≤ 210 строк
(рост ≤ 4), LAW ≤ 7 правил, FORBIDDEN ≤ 11; `order.tpl` +≈12 строк — данные, не проза. EXAMPLE
переписывается под `covers`-таблицу, домен прежний (library loans, `standards/role.md` C3).

### 2.6. Что правится / что не правится

Правится: `steps/review/review.mjs` (CODES, таблицы кодов, `owedItems`, `autoFindings`, R5/R6,
grammar 2), `steps/review/critic.md`, `steps/review/order.tpl`, `ext/index.mjs` (`reviewForm`,
слияние autoFindings в `review()`), `workflows/izi.js` (`reviewing():1012` — два ключа; `band():1137`
— ветка owner `operator`; `CHECK:1005`), `steps/review/review.test.mjs`, `docs/review.md` §3-§5, §7.

НЕ правится: `steps/plan/plan.mjs` — построение узлов и `uncovered-node` верны (кроме §3: перенос
`config` в узел тогла); `checkDesign` и роль `designer` — их правила не пересматриваются (LAW 3);
роль `intake` — префикс `critic:` в FEEDBACK уже описан (`docs/review.md` §6); решение §2.2 об
удалении `check-not-witnessing` — остаётся, `unverifiable-node` уже (см. §2.3 п.4);
`steps/review/program-correctness.md`, `backlog.md`, `CLAUDE.md` — не трогаются.

## 3. Часть 2 — тогл определён, а не угадан

**Определение (одно, проверяемый вопрос к репозиторию).** Тогл — механизм, которым РАБОТАЮЩЕЕ
приложение переключает поведение БЕЗ пересборки и передеплоя: ключ конфигурации, читаемый в
рантайме, флаг в БД, библиотека фиче-флагов. НЕ тогл: профиль сборки (maven/gradle `-P…`), флаг
компилятора/упаковки, переменная выбора среды деплоя, ветка. Проверяемая форма вопроса: «назови
КЛЮЧ (свойство, флаг, запись), который читает работающее приложение, и где он читается». Нет такого
ключа — `found="no"`, и это законный ответ: узел `toggle` тогда не заводится, пробел объявляется
(`plan.mjs:194` уже делает ровно это — `gaps: ["toggle"]`; ничего в plan.mjs для этого менять не
надо).

**Носитель определения — грамматика, не проза.** `<toggles>` расширяется:
`<toggles mechanism="…" config="<ключ, который читает рантайм>"/>` — тот же приём join-ключа, что
`<io config>`/`<integration config>` (`part.mjs:332`). У профиля сборки рантайм-ключа НЕТ — честно
заполнить `config` нечем, и галлюцинация умирает на гардрейле, а не на вкусе.

Правки (все места со словом toggle найдены грепом):
- `steps/scope/order.spine.tpl`: строка TASK (`:4` «how features are SWITCHED OFF» → «как поведение
  переключается В РАНТАЙМЕ»), CONSTRAINTS +2 строки (определение и «профиль сборки/флаг компилятора
  — ответ `found="no"`»), схема `:92` — `config` в `<toggles>`.
- `steps/scope/scout.md`: LAW 5 (`:50-53`) — одна фраза-отсылка к определению наряда; схема `:199`.
  Слов живого домена нет: «ключ конфигурации», «профиль сборки» — слова инструментов, фрукты и
  quarkus остаются в фикстурах.
- `steps/scope/part.mjs`: `SPINE_ANSWERS:59` без изменения ключей; новое правило **P7** в
  `checkSpine` — `<toggles mechanism>` без `config` — блокер; `found="no"` — зелен.
  `GRAMMAR_VERSION` `"3"` → `"4"` в ТОМ ЖЕ изменении (`part.mjs:40` — правило кэша).
- `steps/plan/plan.mjs:190`: узел `toggle` несёт `config` из хребта — тикету нужен ключ.
- Доки: `docs/scope.md` §3 (P7), `docs/plan.md` §6 (config в узле), `docs/concept.md` не правится —
  §«Тоггл и транк» (стр. 63-73) определению не противоречит, он его источник.

**Расширение формы `<toggles>` — обход потребителей** (`CLAUDE.md` constraint 5):
`part.mjs:59` (ключи ответа — без изменений, `config` судит P7), `steps/intake/map.mjs:195`
(`spineAnswer` отдаёт атрибуты как есть — переживает), `steps/graph/graph.mjs:492` (`answerXml`
сериализует атрибуты — переживает, проверить тестом), `plan.mjs:186` (читает `mechanism`, добавляет
чтение `config`). Других потребителей нет.

## 4. Швы — каждый доказуем реинтродукцией

Фикстуры КОПИРУЮТСЯ из живых артефактов `c64dbd32` (`.agent/plan-index.json`, `.agent/frd.xml`
формы t2) — дисциплина `review.test.mjs:3-5`. Имена: `PLAN_T2`, `FRD_T2`.

`steps/review/review.test.mjs`:
- `"owedItems: post, after, ext, nfr и узел вне FRD получают id — и только они"` — убрать ext из
  `owedItems` → красный (шов Д2-ветки).
- `"autoFindings: открытый <question> — блокер open-question за 0 токенов"` на `FRD_T2`
  (`fruit-not-found`) — убрать цикл по questions → красный.
- `"R4: goal-not-delivered резолвит UC2/2a и nfr:existing-contracts"` — убрать расширение `frdIds`
  → красный.
- `"R5: Pass без covers по одному из owed — красная форма"` — убрать R5 → красный.
- `"R6: toggle без covers и без node-not-required — красная форма; с блокером — зелен"` на `PLAN_T2`
  — убрать R6 → красный.
- `"owner=operator у node-not-required, culprit=appgraph.xml"` — таблицы кодов.
- ORDER_KEYS (`review.test.mjs:150-156`) += `OWED`, `UNCHECKED` — расхождение шаблона и `reviewing()`
  краснеет при запуске.
- шов словаря (`:169-175`) ловит новые коды в `critic.md` автоматически (итерирует `CODES`).

`steps/scope/part.test.mjs`:
- `"P7: <toggles mechanism> без config — блокер; found=no — зелен; mechanism+config — зелен"` —
  фикстура-строка скопирована из `appgraph.xml:6` формы t2; убрать P7 → красный.

`steps/plan/plan.test.mjs`:
- к тесту `:273` — `"узел toggle несёт config хребта"`; убрать перенос → красный.

`ext/index.test.mjs`: существующий io-шов (красная форма ⇒ нет `.agent/review.xml`) остаётся и
покрывает grammar 2; + `"review(): autoFindings сливаются в вердикт — Pass роли при открытом
question даёт Reject"`.

`workflows` (санity через существующий приём протяжки): блокер с owner `operator` ⇒ `escalate`, не
перемотка — проверяется юнитом маршрутизации, если таковой есть; иначе живым прогоном DoD.

## 5. DoD — критик ловит все три дефекта `c64dbd32`

Детерминированно (юниты, `node --test` целиком зелен):
1. `autoFindings(PLAN_T2, FRD_T2)` содержит `open-question` с evidence `fruit-not-found` — Д2
   ловится ДО вызова роли, 0 токенов.
2. `newReview` на `PLAN_T2`: файл роли без решения по узлу `toggle` (нет ни `covers`, ни
   `node-not-required`) — красная форма R6; с блокером — зелен. Д1 не может быть промолчан.
3. R4 принимает `unverifiable-node node="…fruits.html" evidence="S2"`; наряд, собранный
   `reviewForm` на артефактах t2, несёт `fruits.html` в `{UNCHECKED}` — Д3 предъявлен роли
   по-строчно, а не оставлен общему чтению.
4. P7 краснеет на дословной строке `<toggles mechanism="maven profiles (-Pnative for native
   build)"/>` без `config`.

Живой прогон (главный критерий; по правилам `$START_RUN` — рунбук, мастер-форма, журнал, не вывод
модели):
5. Переигрыш шага 4 на форме t2: хребет отвечает `<toggles found="no"/>` (рантайм-ключа в
   репозитории нет) ⇒ план БЕЗ узла `toggle`, `gaps: ["toggle","spec"]` — Д1 устранён у источника.
6. Переигрыш шага 11 на нетронутых артефактах `c64dbd32`: ожидаемый вердикт `Reject`, блокеры —
   `node-not-required·toggle`, `open-question·fruit-not-found`, `unverifiable-node·fruits.html`.
   Проверка по `journal.json` и `.agent/review.xml`.

## 6. Чего этот наряд НЕ делает

- Не строит рельсу перемотки к шагу 4: ложный тогл гибнет на P7 внутри шага 4 (пере-делегация
  скауту), а долетевший — на `escalate` через owner `operator`.
- Не переносит гейт открытых вопросов раньше (на шаг 7/10): рельса перемотки на 6 есть только у
  шага 11; перенос — отдельная работа с триггером «вопрос дважды сжёг полную полосу».
- Не возвращает `check-not-witnessing` и не предсказывает красноту команд — шаг 16 фактом
  (`docs/review.md` §2.2 в силе).
- Не заводит первый UI-сьют для t2 и не судит, нужен ли он, — `unverifiable-node` доносит факт до
  оператора, решение о новом сьюте — самостоятельная работа со своим гейтом (как первый тогл,
  `docs/plan.md` §6).
- Не расширяет `<toggles>` до списка механизмов с `remote=` — отложено с триггером
  (`docs/plan.md` §6, `docs/triggers.md`).
- Не трогает шаги 1-5 сверх P7 и двух строк наряда хребта, не правит `checkDesign`, вес, рябь,
  `backlog.md` и роли `intake`/`designer`.
