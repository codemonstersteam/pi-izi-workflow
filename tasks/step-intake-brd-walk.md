# Наряд: шаг 6 — обход BRD с проектированием вперёд; вопрос задаётся, а не объявляется

## 0. Улика (проверено по диску, не по выводу модели)

Форма `sandbox/runbox/quarkus-rest-json-app-v2-t2`, требование — «эндпоинт одного фрукта по имени»
(`TASK.md`, BRD R1..R3 в `.agent/brd.md`). Журналы:
`~/.pi/workflows/projects/quarkus-rest-json-app-v2-t2-ec952fd2246f/sessions/*/runs/{c64dbd32…,79650c98…}/journal.json`.

- `c64dbd32`: `function/checkFrd/1` — `ok:true, questions:1`; ни одного `checkpoint/intake-q*`.
  Роль ЗНАЛА дыру — записала `<question subject="fruit-not-found">` и `<ext id="2a">` в оба UC
  (зафиксировано в `tasks/step-review-checklist.md:8`) — и не спросила, при 5 нетронутых кругах
  (`questionRounds: 5`, `core/budgets.mjs:55`). Шаг 11 дал ложный Pass — полоса ушла с дырой.
- `79650c98` (после D21): та же картина на первом проходе (`checkFrd/1 questions:1`), блокер
  `open-question · fruit-not-found` от скрипта критика (`function/review/1`), перемотка на шаг 6,
  ТОЛЬКО ТОГДА батч с вопросом (`agent/callsite…: track err, kind question, items=[«при отсутствии
  фрукта … HTTP 404 …»]`), `checkpoint/intake-q2`, ответ в одно слово, `checkFrd/2 questions:0`.

Вопрос был дешёвым и обязательным: без ответа «а если фрукта нет» ветка контракта (`<ext>`,
`<failure status>`) непроектируема. Цена молчания — полная перемотка полосы 6→11. Триггер,
отложенный в D21 («вопрос дважды сжёг полную полосу», `tasks/step-review-checklist.md:259`),
сработал: c64dbd32 + 79650c98. Этот наряд — та отложенная работа, и гейт встаёт не на 7/10, а
внутрь шага 6, где единственная в полосе рельса вопроса (`workflows/izi.js:690-704`).

## 1. Первопричина — три места текста учат НЕ спрашивать

1. `steps/intake/intake.md:29-31` (LAW 7): «An open question is a first-class OUTPUT … Pause the run
   only for a gap you cannot write the FRD around». Роль МОЖЕТ написать FRD «вокруг» любой дыры
   (расплывчатый `<ext outcome>` + `<question>`) — правило легализует уклонение. Это перегиб S33:
   потолок кругов стал отказом (`core/findings.mjs:103-114`), а формулировка сделала `<question>`
   равноправной альтернативой вопросу при живых кругах.
2. `steps/intake/intake.md:53-54` (STRATEGY 5): «a gap is something the CHECK will name». Критерий
   привязан к F1..F7, а F-правила судят ФОРМУ (`docs/intake.md` §4): заполненный `<ext>` с любым
   outcome зелен — значит дыра проектного решения по этому критерию «не пробел».
3. `steps/intake/order.tpl:33-34`: «a gap you cannot close is a `<question>` in the artifact» — тот
   же перекос в наряде.

Плюс: обхода нет как алгоритма — STRATEGY 1-4 (`intake.md:48-52`) идут «цель → акторы → UC →
термины», нигде нет «по каждому R и по каждой ветке — что уже определено, что нет». Против:
`docs/concept.md:321-322` — «пробел закрывается вопросом, а не правдоподобным умолчанием — первое
правило навыка и LAW 1 роли».

## 2. Решение

### 2.1. Приём критика (D21) — что переносится, что нет

Оценка по `steps/review/review.mjs` (`owedItems:173`, `autoFindings:221`, R5 `:289-309`) и
`steps/brd/brd.mjs:188-197`. **Частично подходит.**

- **Машинные id у строк BRD ЕСТЬ**: `parseBrd` возвращает `requirements[].id` = `R1..RN`
  (`brd.mjs:196-197`), и `checkFrd` УЖЕ читает `.agent/brd.md` этим парсером
  (`ext/index.mjs:1164-1165`). Строки чек-листа бесплатны — ничего заводить не надо.
- **Переносится**: (а) список R-строк как ДАННЫЕ наряда (`{RLIST}`), роль id копирует, не сочиняет;
  (б) закрытие каждой строки ровно один раз, двумя способами; (в) полноту считает гардрейл — новое
  правило F8; (г) принцип autoFindings «вычислимое — скриптом за 0 токенов» переносится КАК РЕЛЬСА
  РАНЬШЕ: `<question>` при живых кругах ловится скриптом на шаге 6, а не на шаге 11 (§2.4).
- **НЕ переносится целиком, и это надо сказать честно**: гранулярность R не ловит живую улику.
  R1 был «покрыт» (UC1 есть) — дыра сидела в ВЕТКЕ UC1, а ветки/поля/границы из BRD машинно не
  вычислимы: их открытие и есть работа роли. У критика owedItems перечисляет консеквенты, которые
  УЖЕ стоят в FRD; у intake неопределённости до работы роли не существуют как данные. Поэтому
  чек-лист принуждает к ОБХОДУ (каждый R взят в руки — форма, а не просьба), а глубину обхода внутри
  R держат алгоритм (§2.2) и рельса (§2.4).
- **Обратной болезни (вопрос ради строки) форма не порождает**: вторая опция закрытия — «определено,
  вот чем» — это скопировать id элементов, которые роль только что написала (`by="UC1 S1"`), дешевле
  любого вопроса. Принудительного вопроса в механике нет вообще: рельса §2.4 срабатывает только на
  `<question>`, который роль САМА объявила, — она конвертирует объявление в вопрос, а не рождает его.
- **Бюджеты**: батч и круги не трогаются (`charge`, `workflows/izi.js:319-323`; отказ потолка —
  `core/findings.mjs:113-114`). Отскок рельсы стоит одну попытку `INTAKE_LOOPS` (6,
  `core/budgets.mjs:55`) вместо полной перемотки 6→11 ценой `reviewRounds`.

### 2.2. Алгоритм обхода — STRATEGY, сутевые команды

Заменяет STRATEGY 1-5 (`intake.md:47-59`), нумерация сквозная, у каждого шага стоп-условие:

1. Goal — как сейчас (`intake.md:48`).
2. **Walk the BRD: take `{RLIST}` row by row.** For each R name the FRD elements it must become:
   usecase, its `<ext>` branches, fields, failure rows, delta, scenario, nfr.
3. **Per element, per attribute — fill from a source or mark a gap.** Sources, in order: the R's own
   `fit`/`verify`; the answers block; the map — the same operation's existing idiom and the
   `analogue`'s behaviour; `TASK.md`. Stop condition: the attribute has a value with a source, OR it
   is a gap.
4. **Branches are walked, not waited for.** Every step of a usecase that can fail — a lookup, a
   parse, an external call — is an `<ext>`; an `<ext>` whose outcome (status, body, what the client
   does) no source fixes is a gap. Stop condition: every step has its branches listed, every branch
   has outcome+failure filled or a gap.
5. **The batch is the walk's output.** Finish the walk over ALL rows first; every gap becomes one
   closed question with a recommended answer and alternatives; return them in ONE call (текущие
   формулировки батча `intake.md:54-59` живут здесь). A second round is only for what the answers
   themselves reveal — правило уже есть (`intake.md:59`), остаётся.
6. Дальше — нынешние STRATEGY 6-12 (словарь, отказная карта, дельта, сценарии, NFR, FEEDBACK,
   запись) без изменения сути; в шаге записи добавляется строка `<covers>` на каждый R (§2.4).

### 2.3. Критерий «это вопрос, а не выдумка» — LAW, взамен хвоста LAW 7

**Ask when and only when a named FRD element cannot be written without the answer** — ветка `<ext>`,
строка `<failure>`, `<field domain/required>`, число `fit`, граница сценария. Каждый вопрос батча
НАЗЫВАЕТ элемент, который он блокирует (поле `evidence` уже это требует — `intake.md:153-154`);
вопрос, не блокирующий ни одного элемента, — выдумка («а вдруг пригодится» не проходит: элемента
нет). Вопрос о способе ПОСТРОЙКИ — шага 9, не твой (правило уже есть, `intake.md:56-57`, остаётся).

**Чем вопрос отличается от `<question>` в артефакте**: `<question>` законен ТОЛЬКО когда FEEDBACK
говорит, что круги кончились (маркер `OUT_OF_ROUNDS`, `core/findings.mjs:113-114`) — тогда это
честный результат по S33. При живых кругах объявление вместо вопроса — уклонение, и его отвергает
машина (§2.4), не совесть роли. `Unknown` не меняется: это про карту, ответ оператора его не чинит.

### 2.4. Машинные рельсы — гардрейл решает, не роль (CLAUDE.md, constraint 1)

**F8 — полнота обхода.** Грамматика FRD получает `<covers r="R1" by="UC1 S1"/>`. Правило: каждый
`R<n>` из `.agent/brd.md` (`parseBrd`, уже под рукой у `checkFrd` — `ext/index.mjs:1164`) закрыт
ровно одной строкой; `by` непуст, каждый токен резолвится в элемент ЭТОГО артефакта (usecase id,
scenario id, ext `UC1/2a`, field name, failure code, `nfr:<subject>`, delta op, question subject);
`r`, которого нет в BRD, — блокер («строки выдаёт машина»). `reqs=[]` (BRD не читается) → F8 молчит,
та же дисциплина, что F5 при `known=null` (`frd.mjs:161-169`). Это форма, в которой «в целом
покрыл» невыразимо — приём R5 критика (`review.mjs:289-309`).

**Рельса «спроси, не объявляй».** `workflows/izi.js::intake`: локальный флаг `roundsOver` — ставится
в ветке `q.spent` (`izi.js:694-700`). После зелёного `checkFrd` (`izi.js:707-715`): если
`check.questions > 0 && !roundsOver` — НЕ промоутить; `feedback` через `carried({askFirst: true})`,
`attempt++`, continue. Симметрично `outOfRounds`: константа `ASK_FIRST` в `core/findings.mjs` рядом
с `OUT_OF_ROUNDS` («guardrail: в артефакте `<question>`, а круги к оператору ещё есть — задай их
батчем items; объявление вместо вопроса не принимается»), префиксуется в `carriedBlockers`
(`findings.mjs:132-146`). Промоут с `<question>` возможен только после `roundsOver` — окно
c64dbd32 закрыто у источника; `open-question` критика (D21) остаётся страховкой для вопросов,
переживших потолок. Ограниченность: отскок тратит попытку из `INTAKE_LOOPS`, упрямая роль умирает
на `izi.js:721` как сейчас.

### 2.5. Порядок и упаковка

Батч уже канон (`intake.md:20-22`, `izi.js:675-703`, `docs/intake.md` §5) — не меняется. Обход
обязан собрать ВСЕ пробелы до возврата: §2.2 шаг 5 — «finish the walk over ALL rows first». Позже
всплывшее: из ответов — второй круг (легален, `intake.md:59`); при записи после ответов — тоже
вопрос, пока круги живы (рельса §2.4 не даст сдать `<question>`); после потолка — `<question>` в
артефакте (S33, без изменений).

### 2.6. Что вычислимо — не спрашивается

Стоп-условие §2.2 шаг 3 требует пройти источники ДО записи пробела. В FORBIDDEN добавляется запрет
с ценником: «Do NOT ask what a source already fixes — the R's `fit`/`verify`, an answer, the map's
idiom for the same operation, the `analogue`'s behaviour; the same defect as an invented number,
priced in the operator's time». Переспрос ответов уже запрещён (`intake.md:59`); юнитом «не спросила
ли лишнего» не проверить — это живой прогон (DoD, пункт «ни одного вопроса с готовым ответом»).

## 3. Внимание LLM (`openrouter/qwen/qwen3.6-27b`, слабый тир)

Замер: `intake.md` 219 строк — LAW 15 (:18-32), STRATEGY 71 (:47-117), FORBIDDEN 26 (:119-144),
EXAMPLE 54 (:161-214); `order.tpl` 94, CONSTRAINTS :32-42.

Размещение: **алгоритм — в STRATEGY** (процедура прогона, слабая модель исполняет нумерованные шаги
сверху вниз; `standards/role.md`: step = verb + stop condition); **критерий iff и легальность
`<question>` — в LAW** (правило, держится на каждом прогоне); **`{RLIST}` — в наряде как данные**
(роль не вспоминает список — он перед ней, приём D21 §2.5); **полнота — в гардрейле** (F8), роль её
не декларирует.

Что СОКРАЩАЕТСЯ (файл не растёт, бюджет ≤ 219 строк): STRATEGY 1-5 (13 строк) → обход (~18);
EXAMPLE: полный XML (:186-206, 21 строка) режется до фрагмента ~8 строк (ext+failure+covers,
рождённые из ответа), взамен ~8 строк ТРАССЫ ОБХОДА — «R1 → элементы → ветка „черновика нет“:
fit молчит, ответов нет, карта не знает → вопрос №1» — пример показывает ОБХОД, а не результат
(домен прежний — черновики, `standards/role.md` C3). LAW 7 переписывается в тот же объём.
`order.tpl`: :33-34 заменяется легальностью `<question>` (±0), `+5` строк DOCUMENT-блок `{RLIST}`,
`+1` строка `<covers>` в схеме (:80-90) — данные, не проза; итог ≤ 101.

## 4. Правки по файлам

- `steps/intake/intake.md` — LAW 7 хвост, STRATEGY 1-5 → обход, FORBIDDEN +1 (−1: «gap you cannot
  close» из наряда), EXAMPLE — трасса.
- `steps/intake/order.tpl` — CONSTRAINTS :33-34, `{RLIST}`, `<covers>` в схеме.
- `steps/intake/frd.mjs` — `parseFrd` +`covers` (:73-118), F8, `newFrd({… reqs})` (:416).
  **Расширение ШАПКИ newFrd — потребители названы** (CLAUDE.md, constraint 5): `ext/index.mjs:1173`
  (передаёт `reqs: parseBrd(...).requirements.map(r => r.id)` — parseBrd там уже вызван),
  `steps/intake/frd.test.mjs` (все вызовы newFrd — параметр опционален, default `[]`, существующие
  зелены без правок). Выход `checkFrd` не ширится.
- `core/findings.mjs` — `ASK_FIRST`, `carriedBlockers({askFirst})`; `core/findings.test.mjs` — юнит.
  Потребители `carried`: схема `ext/index.mjs` (+`askFirst` в input), `workflows/izi.js:695` (не
  меняется), новый вызов в intake().
- `ext/index.mjs` — `frdForm` (:252) читает `.agent/brd.md`, отдаёт `reqs` для `{RLIST}` (io, как
  `checkFrd:1164`). **Потребители frdForm**: `workflows/izi.js:655` (intake — берёт), `:862`
  (designing — игнорирует, поле аддитивно), схема функции, `ext/index.test.mjs`.
- `workflows/izi.js::intake` — `roundsOver`, ветка «questions при живых кругах → красный», `RLIST` в
  prompt (:665-674).
- `steps/intake/frd.test.mjs` — ORDER_KEYS `+RLIST` (:331), F8-юниты, грепы роли (§5).
- `docs/intake.md` — §3 грамматика (+covers), §4 (+F8), §5 (легальность `<question>`, рельса).

## 5. Швы — каждый с реинтродукцией

Провереяемо юнитами (фикстуры — домен parcels, дисциплина `frd.test.mjs:12`):

1. **F8** (`frd.test.mjs`): `reqs=["R1","R2"]` — нет `<covers r="R2">` → красный; `covers r="R9"` →
   красный; `by` с нерезолвящимся токеном → красный; `reqs=[]` → молчит. Реинтродукция: убрать F8 из
   `newFrd` → красный.
2. **ASK_FIRST** (`findings.test.mjs`): `carriedBlockers({askFirst:true})` префиксует константу;
   убрать флаг → красный.
3. **Грепы роли** (`frd.test.mjs:340-385`, правится существующий тест — это смена правила со сменой
   шва, не подгонка под зелень; доказательство: вернуть старую фразу LAW 7 → новый греп красный):
   match — фраза обхода (`row by row` + stop condition), критерий (`when and only when` /
   `cannot be written without the answer`), `names the element it blocks`, `only when FEEDBACK` про
   `<question>`; doesNotMatch — `Pause the run only for` (роль) и `a gap you cannot close is a
   <question>` (наряд). Снимаются asserts `:379-380` (`first-class OUTPUT` остаётся — S33 жив,
   `Pause the run only…` уходит вместе с правилом).
4. **ORDER_KEYS** (`frd.test.mjs:331,335-338`): `+RLIST` — расхождение шаблона и `intake()` убивает
   запуск (prompt(), `izi.js:33-36`) и тест.
5. **frdForm io-шов** (`ext/index.test.mjs`): `reqs` из настоящего brd.md-текста.

Юнитом НЕ проверяемо, и наряд это говорит прямо: «задала ли роль ПРАВИЛЬНЫЙ вопрос и не задала ли
лишний» — суждение о смысле, résolver'а нет (`core/findings.mjs:26-31`). Доказывается только живым
прогоном (DoD 3-4). Рельса `roundsOver` — workflow-скрипт, по `standards/code.md` (таблица видов)
доказывается живым прогоном; реинтродукция — убрать ветку → на t2 воспроизводится c64dbd32
(промоут с `questions:1` без паузы).

## 6. DoD

1. `node --test` целиком зелен; швы §5 доказаны реинтродукцией (красный увиден, восстановлено).
2. Роль и наряд: бюджет строк §3 соблюдён (замер `wc -l` до/после в отчёте).
3. **Живой прогон формы t2** по `$START_RUN` (рунбук, рестарт pi, чистые roles/, запуск из каталога
   формы; `.agent` и `answers.md` ОЧИЩЕНЫ — содержимое, не каталог: память
   `never-rm-rf-sandbox-dir`). По `journal.json`, не по выводу модели: шаг 6 в ПЕРВОМ проходе
   возвращает батч, где стоит закрытый вопрос про «фрукта нет» (статус/тело, с рекомендацией и
   альтернативами); `checkpoint/intake-q1` — до промоута, без участия шага 11.
4. В том же батче НЕТ ни одного вопроса, чей ответ стоит в `brd.md` (fit/verify R1..R3) или в
   `appgraph.xml` — сверка руками по journal против артефактов.
5. Промоут `.agent/frd.xml`: `questions:0`, `<ext>` несёт отвеченный outcome, `<covers>` закрывает
   R1..R3; шаг 11 — без `open-question`, перемотки полосы нет.

## 7. Чего наряд НЕ делает

- Не переносит чек-лист критика целиком: строк тоньше R (ветки, поля) машина из BRD не выведет —
  сказано в §2.1, глубина остаётся за алгоритмом роли и живым прогоном.
- Не трогает `gilb` (шаг 2), роли шагов 9-11, `checkFrd` F1..F7, вес, рябь, план.
- Не возвращает бюджет числа вопросов (S33 в силе, `core/budgets.mjs:24-36`) и не меняет `charge`/
  `askOperator`/`ENVELOPE`.
- Не убирает `<question>` из грамматики и не отменяет S33: после потолка объявление — законный
  результат (`OUT_OF_ROUNDS`).
- Не снимает `open-question` у критика — страховка для вопросов, переживших потолок кругов.
- Не строит индексов карты, не правит `backlog.md`, `CLAUDE.md`, мастер-форму.
