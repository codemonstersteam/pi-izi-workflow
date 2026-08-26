# DOS-535 глазами агента: проработка и план разработки

Как я решал бы задачу `sandbox/runbox/eddi/TASK.md` (Glossary по образцу Prompt Snippet), прочитав ровно
столько исходников, сколько нужно для плана. Назначение документа: (1) показать, какой объём чтения
реально закрывает планирование, — против 45 клеток роя (см. `run-2026-08-24.md`); (2) дать шагу
intake образец того, что достаточно знать о репозитории.

## Как я шёл — step by step data-flow

Форма записи — как у `steps/data-flow.md`: шаг → вход → что читал на диске → что из этого следует.

```
TASK.md
  │ шаг 1  задача + 15 решений оператора            читал: TASK.md (1 файл)
  │        вывод: Глоссарий = механика Prompt Snippet; вопросы сняты решениями
  ▼
образец модели
  │ шаг 2  из чего состоит тип конфигурации         читал: configs/snippets/model/PromptSnippet.java,
  │        вывод: поля name/category/description/   configs/snippets/IPromptSnippetStore.java (2)
  │        content/tags/templateEnabled; Глоссарию нужно МЕНЬШЕ: id + version + terms (key→value)
  ▼
ресурс и REST
  │ шаг 3  тип ресурса и путь                       читал: configs/snippets/IRestPromptSnippetStore.java:34
  │        вывод: eddi://ai.labs.snippet → делаю eddi://ai.labs.glossary;
  │                путь /glossarystore/glossaries (паттерн *store/*, решение оператора)
  ▼
подстановка
  │ шаг 4  где собирается карта шаблона             читал: modules/llm/impl/LlmTask.java:210-223,
  │        вывод: put("glossary", …) рядом с         modules/llm/impl/PromptSnippetService.java (2)
  │        put("snippets", …); кэш Caffeine TTL 5 мин — зеркалю; карта — ТОЛЬКО по
  │        глоссариям агента; коллизия ключей: порядок подключения, последний побеждает
  ▼
экспорт / импорт
  │ шаг 5  что уезжает в ZIP агента                 читал: backup/impl/RestExportService.java,
  │        вывод: глоссарии по references агента →  backup/impl/RestImportService.java,
  │        {id}.glossary.json + {id}.descriptor.json; merge по resource URI, новая версия
  │        побеждает; сравнение/апгрейд уже есть (StructuralMatcher, UpgradeExecutor) (4)
  ▼
сборка и проверки
  │ шаг 6  чем собирается и чем проверяется         читал: pom.xml (surefire *Test,
  │        вывод: unit = *Test.java (mvn test),     failsafe *IT), один тест-образец
  │        component = *IT.java (mvn verify);       snippets/rest как образец REST-слоя (2)
  ▼
план: 4 волны, 9 новых файлов, 3 правки — ниже
```

Прочитано **≈ 11–13 файлов**, один проход, без роя. Этого хватило: каждый новый файл плана
опирается на конкретный образец из прочитанного, каждая проверка — на сьют из pom.

## План разработки

### Волна 1 — ядро CRUD (по образцу `configs/snippets`)

| новый файл | образец |
|---|---|
| `configs/glossaries/model/Glossary.java` — поля только `id`, `version`, `terms: Map<String,String>`; валидация ключа термина: ≤64, `[a-z0-9_]+`; value без ограничения | `PromptSnippet.java` |
| `configs/glossaries/IGlossaryStore.java` — CRUD с версионированием через `IResourceStore`/`IDescriptorStore` | `IPromptSnippetStore.java` |
| `configs/glossaries/mongo/GlossaryStore.java` | `snippets/mongo/PromptSnippetStore.java` |
| `configs/glossaries/rest/IRestGlossaryStore.java` — `resourceBaseType = "eddi://ai.labs.glossary"` | `IRestPromptSnippetStore.java:34` |
| `configs/glossaries/rest/RestGlossaryStore.java` — путь `/glossarystore/glossaries` | `RestPromptSnippetStore.java` |

Версионирование — механизм сниппета, своего не описываем (решение оператора).

### Волна 2 — подстановка в промпты

| файл | что делаю | образец |
|---|---|---|
| `modules/llm/impl/GlossaryService.java` (новый) | карта терминов ДЛЯ АГЕНТА по его references; Caffeine `expireAfterWrite(5 мин)`; коллизия key — последний подключённый побеждает (порядок в configuration set); отсутствующий reference — ошибка ПРИ РЕНДЕРИНГЕ промпта | `PromptSnippetService.java` |
| `modules/llm/impl/LlmTask.java` (правка) | рядом с `templateDataObjects.put("snippets", …)` — `put("glossary", …)` из GlossaryService | строка 216 |
| agent config (правка модели) | поле `glossaries` — references, как snippets | конфиг сниппетов |

Синтаксис — стандартный Qute `{glossary.<term>}`; глобальных глоссариев в карту не кладём.

### Волна 3 — экспорт и импорт агента

| файл | что делаю | образец |
|---|---|---|
| `backup/impl/RestExportService.java` (правка) | глоссарии агента (по references) → в ZIP как `{id}.glossary.json` + `{id}.descriptor.json` | ветка сниппетов (`SNIPPET_REF_PATTERN` → для глоссария берём references, не текст) |
| `backup/impl/RestImportService.java` (правка) | `addGlossaryDiffs`: merge по resource URI, новая версия побеждает, апгрейд существующего | `addSnippetDiffs` (строка 223) |

StructuralMatcher и UpgradeExecutor переиспользуются как есть — comparison/upgrade уже обобщены.

### Волна 4 — проверки (сьюты из pom)

| проверка | файл | сьют/команда |
|---|---|---|
| валидация ключа термина | `GlossaryTest.java` | unit — `*Test.java`, `mvn test` |
| карта: привязка, коллизия, TTL | `GlossaryServiceTest.java` | unit — `mvn test` |
| CRUD через REST | `GlossaryCrudIT.java` | component — `*IT.java`, `mvn verify` (образец `PromptSnippetCrudIT`) |
| экспорт/импорт глоссария | `GlossaryImportExportIT.java` | component — `mvn verify` |

### Порядок работ

Волны 1 → 2 → 3 строго по зависимостям (карта и экспорт требуют store); волна 4 — по ходу каждой
волны. Правки трёх существующих файлов точечные (одна строка-вставка в LlmTask, одна ветка в
экспорте, один diff-метод в импорте) — остальное новые файлы по образцам.

## Чем это отличается от обхода роя

Рой обошёл 45 клеток, чтобы карта репозитория была «полной»; плану выше понадобились: один образец
слоя (snippets), одна точка сборки карты (LlmTask + сервис), одна пара экспорт/импорт, spine
(сборка/сьюты) и agent config. Это и есть ответ на вопрос «что достаточно step 6 (intake)»:
**образец паттерна + точки интеграции + spine**, а не вся карта. Отсюда оптимизация фокуса в
`run-2026-08-24.md`.
