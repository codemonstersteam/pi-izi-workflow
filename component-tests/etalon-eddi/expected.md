# Эталон DOS-535 v2 — Glossary как агентный тип конфигурации

Происхождение: решение Claude в `sandbox/runbox/eddi-claude`, ветка `feat/dos-535-glossary`,
коммит `74edeae` (50 файлов, +4194/−31), верифицировано против `TASK.md` 24.08.2026 — все 14
решений оператора реализованы (таблица ниже с file:line). Эталон v1 (`component-tests/eddi-by-zai.md`)
остаётся историей; где v2 расходится с ним — прав v2, расхождения перечислены в конце.

Эталон судит ПЛАН КОНВЕЙЕРА (`.agent/tree.xml` и соседи), не код: строки матрицы — то, что план
обязан назвать. `check.mjs` читает эту матрицу как данные: таблица ниже — единственное место, где
живёт список модулей.

## Матрица модулей

`дельта` — строка `<module … delta=…>` в tree.xml обязана существовать и совпадать.
`touch` — правка в диффе решения; для конвейера законна и как `<touched>`, и как дельта.

| модуль | путь | дельта | уровень | что делает | источник |
|---|---|---|---|---|---|
| GlossaryConfiguration | src/main/java/ai/labs/eddi/configs/glossary/model/GlossaryConfiguration.java | Added | дельта | модель: тело документа — только `terms` (id/version — идентичность в URI и сторе) | T01 |
| IGlossaryStore | src/main/java/ai/labs/eddi/configs/glossary/IGlossaryStore.java | Added | дельта | контракт стора, extends IResourceStore | T01 |
| IRestGlossaryStore | src/main/java/ai/labs/eddi/configs/glossary/IRestGlossaryStore.java | Added | дельта | @Path("/glossarystore/glossaries"), resourceBaseType eddi://ai.labs.glossary | T01 |
| GlossaryStore | src/main/java/ai/labs/eddi/configs/glossary/mongo/GlossaryStore.java | Added | дельта | Mongo стор, коллекция "glossaries", validateTerms: ^[a-z0-9_]{1,64}$, дубли ключей | T01 |
| RestGlossaryStore | src/main/java/ai/labs/eddi/configs/glossary/rest/RestGlossaryStore.java | Added | дельта | REST CRUD через RestVersionInfo (версионирование наследуется, не копируется) | T01 |
| GlossaryService | src/main/java/ai/labs/eddi/modules/llm/impl/GlossaryService.java | Added | дельта | карта терминов агента: Caffeine TTL 5 мин, порядок списка = приоритет, ошибка на удалённом | T02 |
| GlossaryResolutionException | src/main/java/ai/labs/eddi/modules/llm/impl/GlossaryResolutionException.java | Added | дельта | непроверяемое — проходит convert() насквозь до LlmTask | T02 |
| AgentConfiguration | src/main/java/ai/labs/eddi/configs/agents/model/AgentConfiguration.java | Changed | дельта | упорядоченный List<URI> glossaries — привязка и приоритет | T02 |
| MemoryItemConverter | src/main/java/ai/labs/eddi/engine/memory/MemoryItemConverter.java | Changed | дельта | ТОЧКА ПОДСТАНОВКИ: put("glossary", …) в конвертере, не в LlmTask | T03 |
| RestTemplatePreview | src/main/java/ai/labs/eddi/modules/templating/rest/RestTemplatePreview.java | Changed | touch | образцовая карта в preview без conversationId | T03 |
| OpenApiConfig | src/main/java/ai/labs/eddi/configs/OpenApiConfig.java | Changed | touch | @Tag "Configuration / Glossaries" | T01 |
| IResourceSource | src/main/java/ai/labs/eddi/backup/IResourceSource.java | Changed | дельта | + readGlossaries(), record GlossarySourceData(sourceId, contentJson) | T06 |
| ZipResourceSource | src/main/java/ai/labs/eddi/backup/impl/ZipResourceSource.java | Changed | дельта | чтение glossaries/*.glossary.json из архива | T06 |
| RemoteApiResourceSource | src/main/java/ai/labs/eddi/backup/impl/RemoteApiResourceSource.java | Changed | дельта | readGlossaries() по /glossarystore/glossaries | T06 |
| StructuralMatcher | src/main/java/ai/labs/eddi/backup/impl/StructuralMatcher.java | Changed | дельта | buildGlossaryDiff: сопоставление по resource URI, SKIP/UPDATE/CREATE | T06 |
| UpgradeExecutor | src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java | Changed | дельта | processGlossary ПЕРВЫМ + перепривязка glossaries агента (дозакрытие, см. ниже) | T06 |
| RestExportService | src/main/java/ai/labs/eddi/backup/impl/RestExportService.java | Changed | дельта | exportGlossaries из agentConfig.getGlossaries(), {id}.glossary.json + descriptor, scrubbing | T04 |
| RestImportService | src/main/java/ai/labs/eddi/backup/impl/RestImportService.java | Changed | дельта | importGlossaries ДО агента, merge по originId, remapGlossaryUris с сохранением порядка | T05 |
| AbstractBackupService | src/main/java/ai/labs/eddi/backup/impl/AbstractBackupService.java | Changed | touch | константа GLOSSARY_EXT | T04 |
| ExportPreview | src/main/java/ai/labs/eddi/backup/model/ExportPreview.java | Changed | touch | javadoc: тип "glossary" в превью | T04 |
| ImportPreview | src/main/java/ai/labs/eddi/backup/model/ImportPreview.java | Changed | touch | javadoc: ResourceDiff типа "glossary" | T05 |

Итог для tree.xml: **7 Added + 9 Changed = 16 модулей-дельт** + 5 touch-строк (законны как touched).

Сьюты (план epилога —tickets обязан нести): GlossaryStoreTest · GlossaryServiceTest ·
GlossaryCrudIT · ImportMergeIT · Zip/RemoteApi/Matcher/Upgrade-тесты · RestExport/Import*Test ·
MemoryItemConverterNamespacesTest · PlaceholderSyntaxContractTest.
Документация: docs/glossary-guide.md · SUMMARY · agent-sync-architecture · import-export-an-agent ·
changelog · AGENTS.md (URI-строка eddi://ai.labs.glossary/…).

## Четырнадцать решений оператора — как исполнены

| # | решение | где | доказательство (eddi-claude) |
|---|---|---|---|
| 1 | версионирование — механизм сниппета | GlossaryStore extends AbstractResourceStore → HistorizedResourceStore; REST — RestVersionInfo | configs/glossary/mongo/GlossaryStore.java:32 |
| 2 | импорт — merge по resource URI, новая версия побеждает | findLocalUriByOriginId → update → version+1; глоссарии импортируются ДО агента | backup/impl/RestImportService.java:1040-1126, 475-477 |
| 3 | термин — только key + value | Term {key, value}, ничего больше | configs/glossary/model/GlossaryConfiguration.java:68-104 |
| 4 | ключ ^[a-z0-9_]{1,64}$ | validateTerms в сторе (покрывает и импорт/синк — они идут мимо REST) | configs/glossary/mongo/GlossaryStore.java:34,89-102 |
| 5 | глоссарий — reference в agent config | List<URI> glossaries, порядок = приоритет | configs/agents/model/AgentConfiguration.java:36,138-144 |
| 6 | REST путь /glossarystore/glossaries | @Path + RolesAllowed как у сниппета | configs/glossary/IRestGlossaryStore.java:30-34 |
| 7 | подстановка только по глоссариям агента | loadForAgent идёт только по списку конфига | modules/llm/impl/GlossaryService.java:153-159 |
| 8 | совпал key — последний в списке побеждает | LinkedHashMap + put по порядку; remap сохраняет порядок | GlossaryService.java:181-187; RestImportService.java:1149-1155 |
| 9 | поля ресурса — id + version + terms | id/version — идентичность URI/стора, тело — terms (доопределение, см. ниже) | GlossaryConfiguration.java:40 |
| 10 | длина value не ограничена | только null-проверка | GlossaryStore.java:96-98 |
| 11 | ключ "glossary", Qute {glossary.<term>} | KEY_GLOSSARY в конвертере; docs — одинарные скобки | engine/memory/MemoryItemConverter.java:30,172 |
| 12 | Caffeine, TTL как у PromptSnippetService | expireAfterWrite(5 мин) — то же число, что у сниппета | GlossaryService.java:89-92; PromptSnippetService.java:82-85 |
| 13 | удалённый глоссарий — ошибка при рендеринге | GlossaryResolutionException из loadForAgent, addGlossary НЕ ловит; провал не кэшируется | GlossaryService.java:168-174; MemoryItemConverter.java:160-174 |
| 14 | в ZIP {id}.glossary.json + {id}.descriptor.json | MessageFormat("{0}.{1}.json") + writeDocumentDescriptor в glossaries/ | RestExportService.java:727-737; AbstractBackupService.java:27 |

## Обязательные дозакрытия (дефекты решения, эталон их требует)

1. **Синк не перепривязывает глоссарии агента.** `UpgradeExecutor.processGlossary` обрабатывает
   глоссарии первыми, но `updateAgentConfig` (UpgradeExecutor.java:536-576) переписывает только
   workflow-URI: CREATE даёт осиротевший ресурс, UPDATE не вступает в силу — агент держит старую
   версию, а GlossaryService резолвит именно приколотую версию. ZIP-путь делает это правильно
   (`remapGlossaryUris`). Правка: собирать карту новых URI из processGlossary и переписывать
   `AgentConfiguration.glossaries` в шаге 5 апгрейда, с сохранением порядка.
2. **`GlossaryService.invalidateCache()` — мёртвая проводка.** Javadoc обещает вызов из REST-слоя,
   но `RestGlossaryStore` его не зовёт; сниппетный REST зовёт (RestPromptSnippetStore.java:61,68,75).
   Правка: вызывать в create/update/delete, как у сниппета.

## Известные ограничения (записаны, не чинятся)

- `RemoteApiResourceSource.readGlossaries` тянет ВСЕ глоссарии инстанса, а не список агента-источника.
- Частичный export (`selectedResourceIds`) оставляет в JSON агента ссылку на исключённый глоссарий —
  импорт даст агента, падающего на каждом ходе (политика решения 13, но неожиданная для частичных выгрузок).
- Одиночные сбои глоссариев проглатываются с логом (export/import/upgrade) — выгрузка может молча
  уехать без глоссария.
- Литерал `"ai.labs.glossary"` в RestGlossaryStore дублирует константу resourceBaseType.

## Расхождения с эталоном v1 (by-zai) и их разрешение

| вопрос | v1 (by-zai) | v2 (решение) | право |
|---|---|---|---|
| пакет | configs/glossaries | configs/glossary | v2: в репозитории смешано (snippets/agents мн., admin/patch ед.); наш конвейер тоже выбрал ед.ч. |
| модель | Glossary | GlossaryConfiguration | v2: конвенция новых типов (RagConfiguration) |
| поля тела | id + version + terms | только terms | v2: id/version — идентичность URI/стора, иначе разъезжаются на update; доопределение решения 9 |
| точка подстановки | правка LlmTask | MemoryItemConverter, LlmTask НЕ трогается | v2: javadoc конвертера — инъекцию неймспейсов перенесли в него; LlmTask получает карту через convert() |
| синк-путь | IResourceSource + Zip | + RemoteApi, StructuralMatcher, UpgradeExecutor | v2: «сравнение и апгрейд» — это Matcher+Executor, без них сравнение наполовину |
| синтаксис в docs | — | одинарные скобки Qute | v2: {{...}} рендерится буквально; преамбула TASK противоречит решению 11 |
| UI Manager | — | нет экрана | граница поставки: UI собран статикой в другом репозитории |
