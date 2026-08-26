# Data flow шага 6: требования → FRD по слоям над матрицей трассируемости

Что здесь: как шаг 6 устроен ПОСЛЕ переделки v2 — вход, выход, кто работает, чем судится, что
уезжает дальше. Форма та же, что у `steps/brd/data-flow.md`.

Правило, вокруг которого построено всё: **прожарка судится двусторонней матрицей
трассируемости** (IEEE 29148). Прямое направление: каждое требование → носитель («ничего не
упущено»). Обратное: каждый модуль изменения → требование-обоснование («ничего не выдумано»).
До v2 суд шёл только вперёд и по производным сущностям — живые дефекты (модель-класс без
владельца, конвертер без проводки, синк-кластер мимо) были механике невидимы.

**Состояние на 26.08.2026.** Прогон eddi дошёл до coverage: 5/6 подшагов легли зелёными
(scenarios 1 круг, owners 1, contracts 1, data-failures 2). Coverage + RTM-починка зациклилась
на R15 (определение без носителя) и недедуплицированных кластерных блокерах — оба корня
починены (exemption + дедуп). Resume работает: перезапуск пропускает закрытые подшаги за
секунды, 0 токенов.

---

## Шаг 6 целиком

```
.agent/brd.md  ·  .agent/normalized.md  ·  .agent/appgraph.xml  ·  .agent/answers.md
  │                    вход: требование + карта + ответы оператора
  │
  │ 🟢 1 scenarios     требование → use cases (актёры, шаги, ветки)       роль, ~90 с
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
  │ 🔴 5 coverage      carried-строки + двусторонний суд матрицы             роль + скрипт rtmJudge
  ▼
frd~coverage.xml       слой 5: + <carried req by> · rtmJudge forward/backward
  │ 🚧 6 critic        последний взгляд: исполнимость, ≤3 блокеров          роль
  ▼
frd~critic.xml         слой 6: + <critique verdict>  → promote → .agent/frd.xml
```

---

## 🟢 1 — scenarios (требование → use cases)

```
решение  «Кто что делает»: актёр → действие → гарантия → ветки отказов
вход     .agent/brd.md (R1-Rn + аналог) · .agent/normalized.md · .agent/answers.md
наряд    order-scenarios.tpl ~18К: TASK + DATA (brd, normalized, answers) + two-filter
роль     intake (одна на все подшаги), модель execution
выход    frd~scenarios.xml: <frd goal> <actor> <usecase id actor goal>
           <pre> <post> <step n> <ext id error outcome> <question>
суд      F1 (актёр/гарантия/шаги) · F6c (разные концы) — ЗЕЛЁНЫЙ с 1 круга (живой eddi)
цена     один вызов ~90 с
```

**Что смотрит оператор:** каждое R имеет use case; ветки различны; решения оператора видны.

---

## 🟢 2 — owners (требование → модуль-владелец)

```
решение  «Кто понесёт»: на каждый шаг UC — существующий модуль, новый (по образцу), или вопрос
вход     frd~scenarios.xml (предыдущий слой) · appgraph.xml (карта: модули+роли+api)
         graph-computed.xml (типы+рёбра) · anchors.json (файлы аналога) · brd.md · answers.md
скрипт   ДО роли:   b0Of → intake-b0.json (кандидаты шаг×карта, IDF-фильтр, via-edge,
                   спорность) + blueprintOf (чертёж ядра аналога) + skeleton rtm.md
         ПОСЛЕ роли: writeRtmFromArtifact → rtm.md (матрица из owner-строк, СКРИПТОМ —
                   модель форму роли с одним write не может писать два файла)
наряд    order-owners.tpl ~35К: TASK + {CANDIDATES} топ-4/шаг + {BLUEPRINT} + {TYPES}
         + {ANALOGUE} + two-filter + леджер допущений
выход    frd~owners.xml: + <owner step="UC1/2" node="…" new="yes" after="…"/> <question>
         .agent/rtm.md: R3 | owners: path/A, new/B(new, after=P) | questions: …
         .agent/intake-b0.json: кандидатная таблица (наряд и суд читают ОДНУ)
суд      F17a (разность шагов−владельцев=∅) · F17b (узел существует) · F17c (спорный→вопрос)
         F17d (функция аналога унаследована) — ЗЕЛЁНЫЙ с 1 круга (живой eddi)
цена     один вызов ~4 мин
```

**Что смотрит оператор:** все шаги закрыты; новые файлы несут after= (образец); споры — вопросами.

---

## 🟢 3 — contracts (формы дельт + сценарии проводки)

```
решение  «Что сдвигается»: форма на каждом владельце + сценарий через узлы
вход     frd~owners.xml · appgraph.xml (срез ролей/api выбранных узлов) · answers.md
наряд    order-contracts.tpl ~15К: {OWNERS} машиной + {MAPSLICE} + {DELTA_FORMS}
выход    frd~contracts.xml: + <delta op form node from to new> <scenario id uc before
         after nodes> <touched path why>
суд      F2/F3/F4/F7/F10/F14/F17e — ЗЕЛЁНЫЙ с 1 круга (живой eddi)
цена     один вызов ~4 мин
```

**Словарь форм — про КОНТРАКТ (docs/intake.md §8):** `Added` = контракт вырос (может быть на
существующем файле); `new="yes"` = файл создаётся. Дерево (шаг 9B) переводит: узел в карте →
`Changed`; `new="yes"` → `Added` (T6 страховка, не первый судья).

---

## 🟢 4 — data-failures (величины: поля, отказы, нфт)

```
решение  «Сколько и что при ошибке»: домены полей, коды/статусы отказов, нфт с источниками
вход     frd~contracts.xml · brd.md · normalized.md · answers.md
наряд    order-data-failures.tpl ~20К: {SOURCES} (легальные источники чисел)
выход    frd~data-failures.xml: + <field name in type domain required error source>
         <failure code status client operator from> <nfr subject fit source>
суд      F5 (источник числа) · F6/F6d (карта отказов↔ветки) · F15 (status="0" заглушка)
         F16 (поле вне замкнутого перечня) — 2 круга на живом eddi (F5 → починка → зелёный)
цена     один вызов ~2-4 мин
```

---

## 🔴 5 — coverage (carried + двусторонний суд матрицы)

```
решение  «Ничего не упущено, ничего не выдумано»: carried-строки на каждое R + RTM-суд
вход     frd~data-failures.xml · brd.md (R-id) · rtm.md (матрица) · answers.md
         anchors.json (аналог) · appgraph.xml (узлы) · graph-computed.xml (чертёж)
скрипт   rtmArgs → rtmJudge:
           FORWARD:  R без owners и без questions → блокер «требование никто не понесёт»
                     EXEMPTION: R с глаголом define/set/name/constrain — свойство, не функция
           BACKWARD: b1 зеркало (слой образца не отзеркален каталогами)
                     b2 точка вызова (новый сервис без звонящего = мёртвый код)
                     b3 кластер (владелец ядра без соседей-со-владельцев, ДЕДУП по файлу)
                     b4 ответ назвал (узел из ответа не в owners)
наряд    order-coverage.tpl: {OWED} список R-id из brd.md
выход    frd~coverage.xml: + <carried req by> / <question subject="R7">
суд      F11 (разность R-id списков) · F8 (поле в чужой сущности) + rtmJudge
маршрут  rtm:-блокеры → OWNERS (todo + FEEDBACK), coverage → todo БЕЗ них
цена     один вызов + круги починки owners при rtm-блокерах
```

---

## 🚧 6 — critic (исполнимость, последний взгляд)

```
решение  «Может ли разработчик выполнить этот FRD без зависания?» — APPROVE / REJECT
вход     frd~coverage.xml (весь артефакт) · answers.md
наряд    order-critic.tpl: рубрика 4 пункта (плейсхолдеры, образец у нового файла,
         ответы потрачены, полнота матрицы), уклон к одобрению, ≤3 блокеров
выход    frd~critic.xml: + <critique verdict="APPROVE"/> или <critique verdict="REJECT">
         <blocker rubric node>…</blocker></critique>
суд      Полный суд всех правил (forPass до последнего) + зелёный критик → promote
цена     один вызов
```

---

## Рельса вопроса (сквозная)

```
роль возвращается kind="question"  →  pending.json (вопросы с номерами) + state.question
                                    ↓
next() видит вопрос → ask           →  headless: question.txt + answer.txt (30 мин)
                                    →  pi: TUI-диалог
оператор отвечает по номерам        →  answers.md (расширение дописывает)
fold перечитывает answers.md        →  все номера есть → вопрос снят, круг НЕ потрачен
                                    →  наряд следующего круга несёт {ANSWERED}
модель заменяет вопросы владельцами/значениями
```

## Круги починки

```
зелёный подшаг → следующий
красный        → round+1, blockers как FEEDBACK, previous = свой staging (T44)
rtm: блокеры   → owners (todo + FEEDBACK), coverage → todo БЕЗ них
все зелёные    → critic → APPROVE → promote → .agent/frd.xml
```

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
