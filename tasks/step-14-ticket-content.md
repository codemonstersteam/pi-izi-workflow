# Шаг 14 — наряд, исполнимый слабой моделью

## Контекст

Полоса доходит до нарядов (`task/<КЛЮЧ>/tickets/`, 24 штуки на форме `eddi`), но наряд не исполним
слабой моделью. Читая `15-glossarystore.md` глазами исполнителя, не видно, **в чём** писать код: нет
языка, нет стека, нет объявления класса, нет образца теста. Живой счёт: эмуляция граничного наряда на
Haiku дважды дала файл на Spring Boot в проекте на Quarkus.

Разобрано по живым артефактам `~/IdeaProjects/codemonstersdev/sandbox/runbox/eddi/`
(`.agent/appgraph.xml`, `.agent/frd.xml`, `task/DOS-535/`), контракт шага —
`steps/tickets/data-flow.md`.

**Что уже верно и не трогается.** Последовательность нарядов правильная: волны `0·1·2·3·4·5` —
граница снаружи, дальше слои графа «зовёт» снизу вверх (`10-iglossarystore` → `15-glossarystore` →
`21-restglossarystore` → `24-restimportservice`), `blocked_by` резолвится, волна зовомого строго
меньше волны зовущего. Требование «сначала низ графа, потом вверх» ВЫПОЛНЕНО.

**Что чиним.** Наряд отвечает на *ЧТО* (шаги FRD дословно) и *ГДЕ* (`inputs`/`outputs`/`verify`), и
почти не отвечает на **В ЧЁМ**.

## Диагноз — шесть дыр, мерка из `tasks/step-9-impruv.md`

| # | дыра | что делает слабая модель | носитель | цена |
|---|---|---|---|---|
| G0 | **Наряд по-русски.** Исполнитель — SLM, пишущая Java в английском репозитории | читает требование на одном языке, код пишет на другом | язык артефактов ниже FRD | см. решение |
| G1 | **PRIMING нет.** Ни «Java», ни «Quarkus», ни «MongoDB», ни «JUnit» | пишет на Spring Boot (счёт: Haiku, дважды) | `<lang>`, `<build>`, `<suite>`, `<toggles>` карты | 0 |
| G2 | **Объявления нет.** `extends`/`implements`/`@ApplicationScoped` живут ПРОЗОЙ внутри строки образца | угадывает базовый класс либо не наследует | новая строка карточки шага 9 | **платно** |
| G3 | **Сигнатур существующих типов нет.** `GlossaryStore(IResourceStorageFactory, IDocumentBuilder)` — типы названы, взять негде | выдумывает конструктор фабрики | `<decl sig=…>` appgraph (230 деклараций в `eddi`) | 0 |
| G4 | **Образца теста нет.** «по образцу» указывает на модуль; чем тестируют — не сказано | берёт чужой фреймворк | `testPath(образец)` ∩ узлы карты | 0 |
| G5 | **Пакета нет.** Первая строка Java-файла ниоткуда не следует | выводит из пути | `<pkg at=…>` `graph-computed.xml` | 0 |
| G6 | **Критерий закрытия — одна команда.** «Готово, когда» не сказано | считает готовым компилируемое | шаблон | 0 |

Пять из шести — факты, которые **уже лежат в карте и графе** и не доезжают до тела наряда. Роли на
шаге 14 нет и не появится.

## Решения оператора

**Граница языка — на FRD.** `TASK.md` и `brd.md` остаются на языке заказа (русский, гейт человека).
`frd.xml`, карточки партий, `PLAN.md` и наряды — **по-английски**. Шаг 14 остаётся 0 токенов, цитата
шага FRD остаётся дословной вырезкой. Гейт 1 человек читает по-английски.

**G2 берётся платно** — строкой `declares:` в карточке шага 9, а не цитированием шапки образца:
карточка и так обязана знать, что модуль наследует, а образец наследует не всегда то же самое.

## Что получается — наряд `15-glossarystore` после правки

```
---
id: 15                     kind: module      wave: 2      blocked_by: [10]
inputs:  [src/main/java/.../snippets/mongo/PromptSnippetStore.java,
          src/test/java/.../snippets/mongo/PromptSnippetStoreTest.java,   ← G4
          src/main/java/.../glossaries/IGlossaryStore.java]
outputs: [src/main/java/.../glossaries/mongo/GlossaryStore.java,
          src/test/java/.../glossaries/mongo/GlossaryStoreTest.java]
verify: ./mvnw package -DskipTests && ./mvnw test -Dtest=GlossaryStoreTest
---
## Stack                                                                    ← G1
Java · Quarkus CDI · MongoDB · JUnit 5 · build: ./mvnw package -DskipTests

## Goal
Write the MongoDB-backed glossary store: collection "glossaries", term keys validated.

## Declaration                                                              ← G2 + G5
package ai.labs.eddi.configs.glossaries.mongo
@ApplicationScoped
public class GlossaryStore extends ResourceStore<Glossary> implements IGlossaryStore
  GlossaryStore(IResourceStorageFactory storageFactory, IDocumentBuilder documentBuilder)
  create(Glossary) : IResourceId · update(String, Integer, Glossary) : Integer · …

## What you call — signatures                                               ← G3
src/main/java/.../glossaries/IGlossaryStore.java        (this change, ticket 10)
  create(Glossary) : IResourceId · …
src/main/java/.../datastore/IResourceStorageFactory.java (exists in the repo)
  <T> IResourceStorage<T> newResourceStorage(…)

## What you must prove — steps this module owns
UC1 step 2: the system validates every key: ≤64 chars, lowercase, [a-z0-9_]
…

## Order of work
Test first, from the TEXT of the step above — not from what is convenient to implement. …

## Done when                                                                ← G6
every file in outputs exists · every step above is asserted by a test that quotes its text ·
verify is green

## Follow the sample — how THIS repository does it                          ← G4
module: src/main/java/.../snippets/mongo/PromptSnippetStore.java — @ApplicationScoped, super(f,
        "glossaries", b, Glossary.class), Pattern validation, @ConfigurationUpdate
test:   src/test/java/.../snippets/mongo/PromptSnippetStoreTest.java — framework, base class,
        how dependencies are faked. Invent none of it; the project already decided.

## Do not touch
Files not in your outputs. Other tickets write them:
  src/main/java/.../glossaries/IGlossaryStore.java  — ticket 10
  src/main/java/.../glossaries/model/Glossary.java  — ticket 12

## How to run
./mvnw package -DskipTests && ./mvnw test -Dtest=GlossaryStoreTest
```

## Поток данных шага 14 после правки

```
①  план партии       task/<КЛЮЧ>/design/<партия>.md   → Section[]        card.mjs::sectionsOf
①′ ФАКТЫ РЕПО        .agent/appgraph.xml              → Facts            НОВОЕ, 0 токенов
       stack ← <lang> · <build cmd|compile> · <suite> · <toggles>
       decls ← <decl kind name sig> по имени типа
       pkgOf ← <pkg at=…> либо путь
       testOf← testPath(образец) ∩ узлы карты
②  слои              Section.calls                    → string[][]        layersOf
③  владелец шага                                       → Map<шаг, модуль> ownerOf
④  граница           FRD + <actor via> + сьют         → boundary + stack
⑤  модульные наряды  Section + шаги + слой + Facts    → module            тело переписано
⑥  гардрейл                                            → 8 правил + 4 новых
⑦  файлы             task/<КЛЮЧ>/tickets/<NN>-*.md
```

## Сделано — `node --test` 468 из 468

| работа | где |
|---|---|
| обратный шов языка: `cyrillicWords` + тесты | `core/lang.mjs` |
| факты репозитория (новый модуль) | `steps/tickets/facts.mjs`, `parseMap` расширен аддитивно |
| грамматика карточки по-английски + `declares` | `steps/design/card.mjs::SECTION_KEYS` |
| гардрейл партии: правила 4' и 8 | `steps/design/card.mjs::checkPart` |
| тело наряда по-английски, порядок промпта SLM | `steps/tickets/tickets.mjs::ticketText` |
| гардрейл наряда: правила 9-12 со швами | `steps/tickets/tickets.mjs::checkTickets` |
| зеркало теста образца | `steps/tickets/tickets.mjs::mirrorTest` |
| `PLAN.md` по-английски | `steps/design/plandoc.mjs::planDoc` |
| закон языка в ролях | `intake.md`, `core-designer.md`, `router.md`, `valuer.md`, `critic.md`, `review/order.tpl` |
| шаблон и самопроверка карточки | `steps/design/order-part.tpl` |
| проводка шага | `ext/index.mjs::tickets` |

Замена на сохранённых артефактах `eddi`, 0 токенов: 24 наряда, волны `0·1·2·3·4·5`; у наряда 15 во
входах `PromptSnippetStoreTest.java`, в теле — `java · Quarkus MicroProfile Config · … · mongodb` и
`package ai.labs.eddi.configs.glossaries.mongo`. На старых РУССКИХ карточках правила 10 и 12
краснеют: 25 блокеров, все по делу.

Осталось живое: прогон `eddi` с шага 6, наряд `15-glossarystore` на `qwen3.6-27b`, форма `t2`.

## Работы

### 1. Язык — граница на FRD

- **Закон в ролях**: `steps/intake/intake.md:30`, `steps/design/core-designer.md:129`,
  `steps/design/router.md:84`, `steps/design/valuer.md:82`, `steps/review/critic.md:83` и `:157`,
  `steps/review/order.tpl:100` — «на языке заказа» → «артефакт пишется по-английски». `steps/brd/gilb.md`
  **не трогается**: BRD остаётся на языке заказа, и шов `languageDrifted` (`core/lang.mjs`,
  единственная проводка — `steps/brd/brd.mjs:356-364`) остаётся как есть.
- **Обратный шов**: `core/lang.mjs` получает `cyrillicFree(text)` — ни одной кириллической буквы в
  авторском тексте английского артефакта. Ставится в существующие гардрейлы: `checkFrd`
  (`steps/intake/frd.mjs`), `checkPart` (`steps/design/card.mjs`), `values.mjs`, `routes.mjs`,
  `checkTickets` (`steps/tickets/tickets.mjs`). `PLAN.md` производный — своей проверки не нужно.

### 2. Грамматика карточки — ключи по-английски + `declares:` (G2, платно)

Словарь объявлен один раз — `steps/design/card.mjs::SECTION_KEYS`:

```
что это → what      поля → fields        сигнатуры → signatures    зовёт → calls
по образцу → sample закрывает → closes   проверка → verify         + declares   ← НОВОЕ
```

Кроме словаря меняются встроенные регулярки в `card.mjs::sectionsOf` (`зовёт:`, `проверка:`,
`UC\d+ шаг N` → `UC\d+ step N`) и места разбора в `steps/tickets/tickets.mjs` (4 вызова
`block`/`line`), `steps/design/plandoc.mjs`, `steps/design/values.mjs`, `steps/plan/plan.mjs`,
`steps/scope/part.mjs`.

`declares:` — одна строка: пакет, аннотации, `class X extends Y implements Z`. Потребители, которых
надо пройти по антецедентам (CLAUDE.md, ограничение 5): `card.mjs` (грамматика + блокер «у нового
модуля нет объявления»), `tickets.mjs` (блок `## Declaration`), `plandoc.mjs` (`PLAN.md`).
Шаблон и самопроверка — `steps/design/order-part.tpl` (schema + пункт «откуда взято объявление:
из образца, из DRAFT или из USECASES — ни одного придуманного»).

### 3. Факты репозитория — `steps/tickets/facts.mjs` (НОВЫЙ, 0 токенов)

`factsOf(mapXml) → { stack, decls, pkgOf, testOf }`, чистая, со своим тестом. Ни одного имени
проекта в коде — всё из карты. `parseMap` (`steps/intake/map.mjs:180`) расширяется **аддитивно**
полями `lang`, `build`, `decls`; форма существующих полей не меняется, поэтому антецеденты остальных
потребителей (`ripple`, `plan`, `design`, гардрейл FRD) не трогаются — но каждый прочитать и
убедиться.

### 4. Тело наряда — `steps/tickets/tickets.mjs::ticketText`

Порядок блоков по структуре промпта для SLM: `Stack · Goal · Declaration · What you call · What you
must prove · Order of work · Done when · Follow the sample · Do not touch · How to run`.
Весь фиксированный текст — по-английски. `ticketsOf` принимает `facts`. Граничный наряд получает те
же `Stack` и английский текст правила.

### 5. Гардрейл — четыре новых правила со швами

| # | правило | что ловит |
|---|---|---|
| 9 | стек непуст, когда карта объявила язык | наряд без PRIMING |
| 10 | у нового модуля есть `Declaration` | наряд, где базовый класс угадывается |
| 11 | образец теста стоит, когда файл существует | наряд, где фреймворк выдумывается |
| 12 | в наряде нет кириллицы | утечку языка заказа к исполнителю |

Каждое правило краснеет при возврате дефекта — иначе шва нет.

### 6. Документы

`steps/tickets/data-flow.md` (фазы ①′ и новые правила), `steps/design-data-flow.md` (строка
`declares:`), `backlog.md` (образец теста снят — закрывается G4), `tasks/step-14-ticket-content.md`
(рабочая запись задачи).

## Проверка

1. `node --test` — целиком зелёный. Каждое новое правило: вернуть дефект → красное → снять.
2. **Замена на сохранённых артефактах `eddi`, 0 токенов** — 24 наряда пересобираются из `.agent/` и
   `task/DOS-535/design/`; диффом видно `Stack`, `Declaration`, `package`, тест-образец
   `PromptSnippetStoreTest.java` у наряда 15; ни одной кириллической буквы.
3. **Живой прогон `eddi`** с шага 6 (intake) — FRD, карточки и `PLAN.md` выходят по-английски, гейт 1
   проходится, наряды режутся.
4. **Один наряд слабой моделью**: `15-glossarystore` отдаётся `openrouter/qwen3.6-27b` в `pi` по
   рунбуку `~/IdeaProjects/codemonstersdev/sandbox/pi-runbox.md`. Приёмка: пишет `GlossaryStore.java`
   и `GlossaryStoreTest.java` укладом Quarkus, не создаёт ни одного файла вне `outputs`.
5. **Форма `t2`** — прогон до `PLAN.md`, чтобы убедиться: ни одного имени `eddi` в коде шага 14.
