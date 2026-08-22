# План работ DOS-535 — глоссарии как новый тип конфигурации

Собран по `.agent/mvp/module-tree.xml` (что за модули и без чего их не написать) и
`.agent/mvp/data-flow.xml` (что происходит с данными в рантайме). Требование — `.agent/frd.xml`.

**Порядок работ взят из отношения `needs`, а не из потока данных.** Поток цикличен по природе: запрос
идёт вниз, ответ вверх. `needs` — «без чего этот файл не скомпилируется» — направлен в одну сторону и
кругов не даёт.

12 модулей · 4 волны · 7 use case · 3 кода отказа · 1 NFR.

---

## Волна 1 — объявления. Ни от чего не зависят, пишутся параллельно

### 1.1 `configs/glossaries/model/Glossary.java` (новый)
POJO по образцу `configs/snippets/model/PromptSnippet.java`: пустой конструктор, конструктор с
полями, геттеры и сеттеры. Поля: `id: String`, `version: Integer`, `terms: Map<String,String>`.
**Закрывает:** field:id (R14), field:version (R2, R8), field:terms (R9, R14).
**Проверка:** юнит на сериализацию/десериализацию JSON — те же поля, что уйдут в экспорт.

### 1.2 `configs/agents/model/AgentConfiguration.java` (правка)
Добавить `private List<URI> glossaries = new ArrayList<>()` с геттером и сеттером — ровно по образцу
соседнего поля `workflows`. **Порядок элементов значим**: UC5/3 требует, чтобы поздний глоссарий
переопределял ранний.
**Закрывает:** UC5/1, R11.
**Проверка:** юнит — порядок в списке сохраняется после сериализации конфигурации.

> **Решено по репозиторию** (см. таблицу в конце): повторяется привязка `workflows`, а не сниппетов —
> сниппеты к агенту не привязываются вовсе. Сути R11 «reference в agent config» это не меняет.

### 1.3 `backup/IResourceSource.java` (правка)
Добавить `List<GlossarySourceData> readGlossaries()` и `record GlossarySourceData(String id, Integer
version, Map<String,String> terms, String resourceUri)` — рядом с существующими `readSnippets()` и
`SnippetSourceData`.
**Закрывает:** UC7/1 (объявление способности).
**Проверка:** компиляция реализаций интерфейса.

> **Решено по репозиторию** (см. таблицу в конце): URI ресурса — соглашение платформы, выводится из
> `id` и `version`; в модели `Glossary` не хранится, живёт только здесь, в данных импорта.

---

## Волна 2 — контракты хранения и внешний адрес

### 2.1 `configs/glossaries/IGlossaryStore.java` (новый) — needs: `Glossary`
`public interface IGlossaryStore extends IResourceStore<Glossary> { List<Glossary> readAll() throws
ResourceStoreException; }` — по образцу `IPromptSnippetStore`.
**Закрывает:** UC1/2 (через `readAll`), CRUD-операции наследуются от `IResourceStore`.
**Проверка:** компиляция.

### 2.2 `configs/glossaries/IRestGlossaryStore.java` (новый) — needs: `Glossary`
`@Path("/glossarystore/glossaries")` с четырьмя методами: `@GET readGlossaries`, `@POST
createGlossary`, `@PUT @Path("/{id}") updateGlossary`, `@DELETE @Path("/{id}") deleteGlossary`.
Статусы отказов объявляются здесь как `@APIResponse`: 400 `TERM_KEY_INVALID`, 404 `GLOSSARY_NOT_FOUND`.
**Закрывает:** UC1/1, UC2/1, UC3/1, UC4/1.
**Проверка:** компиляция + наличие четырёх адресов в OpenAPI-выдаче.

### 2.3 `backup/impl/ZipResourceSource.java` (правка) — needs: `IResourceSource`
Реализовать `readGlossaries()`: читать `<id>.glossary.json` и `<id>.descriptor.json` — те же имена,
под которыми пишет экспорт (UC6/2). Глоссариев в архиве нет — пустой список, не ошибка.
**Закрывает:** UC7/1.
**Проверка:** юнит на архиве-фикстуре: с глоссариями и без.

---

## Волна 3 — реализации. Здесь появляются все отказы

### 3.1 `configs/glossaries/mongo/GlossaryStore.java` (новый) — needs: `IGlossaryStore`, `Glossary`
`@ApplicationScoped`, `extends AbstractResourceStore<Glossary> implements IGlossaryStore`,
`@ConfigurationUpdate` на изменяющих операциях — по образцу `PromptSnippetStore`.
**Здесь и только здесь** проверяются ключи терминов по `^[a-z0-9_]{1,64}$`.
**Закрывает:** UC1/2, UC2/2, UC2/3, UC3/2, UC3/3, UC4/2, UC5/2, UC7/2, UC7/3.
**Порождает отказы:** `TERM_KEY_INVALID` (UC2/2a, UC3/2a), `GLOSSARY_NOT_FOUND` (UC3/3a, UC4/2a).
**Проверка:** юниты — ключ по шаблону и против шаблона; version 1 на создании; version+1 на
обновлении; удаление несуществующего.

### 3.2 `modules/glossaries/GlossaryService.java` (новый) — needs: `IGlossaryStore`, `Glossary`, `AgentConfiguration`
`@ApplicationScoped`, кэш `Caffeine.newBuilder().expireAfterWrite(Duration.ofMinutes(5))` и
`invalidateCache()` — по образцу `PromptSnippetService`. Метод
`Map<String,String> resolveGlossaryTerms(List<URI> boundGlossaries)`: читает глоссарии **в порядке
конфигурации**, поздний переопределяет раннего.
**Закрывает:** UC5/3 (R13), NFR `glossary-cache-ttl = 5 minutes` (R17).
**Порождает отказ:** `GLOSSARY_DELETED` (UC5/2a, R18).
**Проверка:** юниты — конфликт ключей решается в пользу позднего; TTL кэша 5 минут; удалённый
привязанный глоссарий даёт `GLOSSARY_DELETED`.

### 3.3 `backup/impl/RestExportService.java` (правка) — needs: `IGlossaryStore`, `Glossary`, `AgentConfiguration`
Дописать в `exportAgent` выгрузку привязанных глоссариев рядом с существующей выгрузкой сниппетов:
`<id>.glossary.json` и `<id>.descriptor.json`.
**Закрывает:** UC6/1, UC6/2 (R19), UC6/3.
**Проверка:** компонентный сценарий — в архиве есть оба файла на каждый привязанный глоссарий.

### 3.4 `backup/impl/RestImportService.java` (правка) — needs: `IResourceSource`, `IGlossaryStore`, `Glossary`, `AgentConfiguration`
Дописать в `importInitialAgents` ветку глоссариев: совпал `resourceUri` — обновить существующий
импортированными `version` и `terms`; не совпал — создать новый; затем привязать к импортированному
агенту.
**Закрывает:** UC7/2, UC7/3 (R5), UC7/4.
**Проверка:** компонентные сценарии — импорт в пустую базу (создание) и импорт поверх существующего
(обновление).

---

## Волна 4 — внешний слой и точка встраивания в промпт

### 4.1 `configs/glossaries/rest/RestGlossaryStore.java` (новый) — needs: `IRestGlossaryStore`, `IGlossaryStore`, `Glossary`, `GlossaryService`
`@ApplicationScoped implements IRestGlossaryStore`, делегирует в `IGlossaryStore`, переводит
исключения хранилища в статусы. Своих отказов не порождает.
На POST, PUT и DELETE вызывает `glossaryService.invalidateCache()` — соглашение репозитория:
`RestPromptSnippetStore.java:61,68,75`, `RestGlobalVariableStore.java:74,85`,
`RestSecretStore.java:110,140`. Без него правка глоссария не видна промпту до пяти минут, а R3
требует работы «наравне со сниппетами».
**Закрывает:** UC1/3, UC2/4, UC3/4, UC4/3 и перевод отказов в 400 / 404.
**Проверка:** компонентные сценарии на четыре адреса + два отказных + сценарий «правка видна
следующему рендерингу промпта сразу».

### 4.2 `modules/llm/impl/LlmTask.java` (правка) — needs: `GlossaryService`
Инжектировать `GlossaryService` и в `execute(...)` положить разрешённые термины в
`templateDataObjects` — тем же приёмом, что строкой 214 кладутся сниппеты.
**Закрывает:** UC5/4 (R12, R16), UC5/5, UC5/4a (нерезолвленные плейсхолдеры остаются как есть).
**Пробрасывает отказ:** 422 `GLOSSARY_DELETED`.
**Проверка:** компонентный сценарий — промпт с известным и с неизвестным плейсхолдером.

---

## Карта отказов

| код | статус | где порождается | из каких шагов |
|---|---|---|---|
| `TERM_KEY_INVALID` | 400 | `mongo/GlossaryStore` | UC2/2a, UC3/2a |
| `GLOSSARY_NOT_FOUND` | 404 | `mongo/GlossaryStore` | UC3/3a, UC4/2a |
| `GLOSSARY_DELETED` | 422 | `modules/glossaries/GlossaryService` | UC5/2a |

## Решения, принятые по репозиторию

Ответ на каждый нашёлся в коде и **не противоречит** `frd.xml` и `brd.md`, поэтому применён без
остановки прогона. Оператору остаётся утвердить направление, а не разбираться в пустом месте.

| вопрос | ответ репозитория | опора в требовании |
|---|---|---|
| R11 «по образцу snippets» | сниппеты к агенту не привязываются вовсе (`LlmTask.java:214`), слова «snippet» в `AgentConfiguration` нет; привязка по URI живёт в соседнем поле `workflows` | R11 «reference в agent config» — суть сохранена; R13 требует ПОРЯДКА, который даёт только список |
| `resourceUri` не описан | платформа уже разбирает `eddi://ai.labs.snippet/snippetstore/snippets/<id>?version=1` (`PromptSnippetService.java:188`); URI выводится из id и version, в модели не хранится | R5 сам вводит понятие resource URI |
| инвалидация кэша | REST-слой сбрасывает кэш на каждой изменяющей операции — три семейства из трёх: снippets, variables, secrets | R3 «наравне со сниппетами»; R17 «тем же TTL, что у PromptSnippetService» |

**Цена третьего решения видна в плане:** `RestGlossaryStore` теперь зависит от `GlossaryService` и
переехал из волны 3 в волну 4.

## К оператору — нет

Ни одного вопроса, на который ответ не нашёлся бы в репозитории или в требовании.
