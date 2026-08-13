# Бенчмарк «Glossary» на eddi — izi против omo

Одна задача, один репозиторий, один эталон. Считается не «кто лучше пишет код», а **сколько файлов
изменения воркфлоу нашёл и почём**. Задача устроена так, что 10 файлов из 16 нельзя найти по имени —
только по обратным рёбрам от аналога; это и есть измеряемое свойство.

Замеры шапки сняты 2026-08-13 на `sandbox/eddi` (1945 файлов в дереве обзора после `skip.mjs`).
Прогонять на копии в `runbox/`, не в `sandbox/eddi` — там же лежит MASTER-форма
(`~/IdeaProjects/codemonstersdev/sandbox/pi-runbox.md`).

---

## 1. Задача — текст `TASK.md`, вводится дословно

> В E.D.D.I появляется новый тип конфигурации — **глоссарий** (`Glossary`): словарь терминов бота,
> CRUD с версионированием, по образцу Prompt Snippet, с типом ресурса `eddi://ai.labs.glossary`.
> Термины должны подставляться в промпты как `{{glossary.<term>}}` наравне со сниппетами, и глоссарий
> должен уезжать вместе с агентом при экспорте и приезжать при импорте — включая сравнение с уже
> существующим и апгрейд.

Две фразы. Названы в них пять файлов из шестнадцати.

## 2. Почему именно эта задача

Обработка типов конфигурации в бэкапе **захардкожена по типу**, а не обобщена. Улики:

- `backup/IResourceSource.java:31` — `List<SnippetSourceData> readSnippets()`, отдельный метод на тип;
- `backup/IResourceSource.java:116` — `record SnippetSourceData(...)`, отдельная запись на тип;
- `backup/impl/RestExportService.java:75,101` — своё поле `snippetStore` и своя регулярка
  `SNIPPET_REF_PATTERN`;
- `backup/impl/StructuralMatcher.java:60,130` — сниппеты матчатся отдельной веткой «по имени»;
- `backup/impl/UpgradeExecutor.java:128-131` — «snippets first, они должны существовать до того, как
  на них сошлются» — порядок, который новый тип обязан повторить.

Ни один из этих файлов не содержит слова «глоссарий» и не будет найден ни грепом по задаче, ни
семантическим поиском по формулировке. Их находит только обход от аналога (`PromptSnippet`) вверх по
вызовам. То же со второй половиной задачи: `engine/memory/MemoryItemConverter.java:27` держит
`KEY_SNIPPETS = "snippets"` — место, где новый неймспейс шаблона обязан появиться рядом.

## 3. Эталон

Выведен механически: файлы, упоминающие `PromptSnippet` вне пакета `configs/snippets`, минус
специфика сниппетов (кэш пресетов `CounterweightService`, потребление в `LlmTask` учтено отдельно).

### 3.1 Новые файлы (6)

```
src/main/java/ai/labs/eddi/configs/glossary/IRestGlossaryStore.java
src/main/java/ai/labs/eddi/configs/glossary/IGlossaryStore.java
src/main/java/ai/labs/eddi/configs/glossary/model/GlossaryEntry.java
src/main/java/ai/labs/eddi/configs/glossary/mongo/GlossaryStore.java
src/main/java/ai/labs/eddi/configs/glossary/rest/RestGlossaryStore.java
src/main/java/ai/labs/eddi/modules/llm/impl/GlossaryService.java
```

Образец — `configs/snippets/*` (5 файлов) и `modules/llm/impl/PromptSnippetService.java`.

### 3.2 Правки — бэкап (7)

```
src/main/java/ai/labs/eddi/backup/IResourceSource.java
src/main/java/ai/labs/eddi/backup/impl/RestExportService.java
src/main/java/ai/labs/eddi/backup/impl/RestImportService.java
src/main/java/ai/labs/eddi/backup/impl/StructuralMatcher.java
src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java
src/main/java/ai/labs/eddi/backup/impl/ZipResourceSource.java
src/main/java/ai/labs/eddi/backup/impl/RemoteApiResourceSource.java
```

### 3.3 Правки — подстановка в промпты (3)

```
src/main/java/ai/labs/eddi/engine/memory/MemoryItemConverter.java
src/main/java/ai/labs/eddi/modules/templating/rest/RestTemplatePreview.java
src/main/java/ai/labs/eddi/modules/llm/impl/LlmTask.java
```

**Итого 16 файлов основного кода.**

### 3.4 Тесты — второй уровень эталона (9)

```
src/test/java/ai/labs/eddi/backup/impl/RestExportServiceTest.java
src/test/java/ai/labs/eddi/backup/impl/RestImportServiceExtendedTest.java
src/test/java/ai/labs/eddi/backup/impl/StructuralMatcherTest.java
src/test/java/ai/labs/eddi/backup/impl/UpgradeExecutorTest.java
src/test/java/ai/labs/eddi/backup/impl/ZipResourceSourceTest.java
src/test/java/ai/labs/eddi/backup/impl/RemoteApiResourceSourceTest.java
src/test/java/ai/labs/eddi/engine/memory/MemoryItemConverterNamespacesTest.java
src/test/java/ai/labs/eddi/modules/templating/rest/RestTemplatePreviewTest.java
src/test/java/ai/labs/eddi/integration/GlossaryCrudIT.java        (новый, образец — PromptSnippetCrudIT)
```

Считается отдельно от основного кода: полоса izi команду проверки НАЗЫВАЕТ, а omo тест ПИШЕТ — это
разные результаты, складывать их в одно число нельзя.

## 4. Что izi сделает — посчитано до прогона

Конусы входов задачи (наши рёбра, `steps/scope/computed.mjs`, дерево eddi):

| вход | узлов конуса |
|---|---|
| `configs/snippets/rest/RestPromptSnippetStore.java` | 17 |
| `backup/impl/RestExportService.java` | 67 |
| `backup/impl/RestImportService.java` | 96 |
| `modules/templating/rest/RestTemplatePreview.java` | 52 |
| **объединение** | **141 узел ≈ 57 КБ** |

Объединение конусов проходит потолок с запасом вдвое. Но фокус берёт **клетки целиком** (§5 концепта,
перебор ×4), и по клеткам картина другая:

| объём задачи | клеток из 306 | файлов | оценка карты | ожидаемое поведение |
|---|---|---|---|---|
| глоссарий + экспорт | 30 | 236 | 96 КБ | проходит молча; эталон падает до ~8 файлов — мало |
| + импорт, без подстановки | 40 | 299 | 122 КБ | `ask`, один вопрос; эталон 13 файлов |
| **полная (эта задача)** | **47** | **362** | **147 КБ** | **`ask`; эталон 16 файлов** |

**`ask` здесь ожидаем и не является сбоем** — это рельса §7. Сработавшая на живой задаче, она сама по
себе результат: причина не в конусах (57 КБ), а в дискретности клетки. Если прогон покажет, что
оператор снимает срез и вместе с ним теряется часть эталона, — это первое живое наблюдение под
отложенное «фильтровать файлы внутри клетки» (§11 концепта), и оно едет в `docs/triggers.md` с числом.

## 5. Метрика — одна на оба воркфлоу

Артефакты разные (izi отдаёт план, omo — код), поэтому меряется **множество файлов**, а не текст.

1. **Recall / precision** против §3, раздельно по основному коду и по тестам;
2. **Чем найден каждый файл**: назван в задаче (5 из 16) или выведен от аналога (11 из 16). Интересны
   только вторые — первые находит греп;
3. **Цена**: входные и выходные токены, wall-clock, число вопросов оператору;
4. **Гейт**: omo — `mvn -q -DskipTests compile` зелёный; izi — `.agent/plan-index.json`, у каждого узла
   есть команда проверки. Mongo и LLM не поднимаются, приложение не запускается.

Числа izi берутся из `~/.pi/workflows/projects/<slug>/sessions/<sid>/runs/<runId>/journal.json`, а не
из вывода модели. Числа omo — из его лога сессии и `.omo/evidence/`.

## 6. Подсчёт recall

Для izi множество файлов — узлы `plan-index.json`; для omo — `git status --porcelain` в его рабочем
дереве. Дальше одинаково:

```bash
# expected.txt — §3.1–§3.3, по одному пути в строке (16 строк)
# actual.txt   — файлы, названные прогоном
comm -12 <(sort expected.txt) <(sort actual.txt) | tee hit.txt | wc -l   # найдено
comm -23 <(sort expected.txt) <(sort actual.txt)                        # пропущено
comm -13 <(sort expected.txt) <(sort actual.txt)                        # лишнее
```

Лишнее не штрафуется автоматически: файл вне эталона может быть правомерной находкой (эталон выведен
от одного аналога и полным быть не обязан). Каждый такой файл разбирается глазами и, если находка
верна, **дописывается в эталон этого документа** — с указанием, каким прогоном найден.

## 7. Порядок прогона

1. Копия eddi в `runbox/` (не `sandbox/eddi`), `.git` не нужен;
2. **omo первым** — он не меняет дерево до тех пор, пока не начнёт писать; после прогона дерево
   выбрасывается и копируется заново;
3. **izi вторым** — на свежей копии: `node bin/install.mjs --to=<копия>`, преконды по
   `sandbox/pi-runbox.md` (перезапуск pi; пусто в `~/.pi/agent/pi-extensible-workflows/roles/`; `pi`
   запускается ИЗ каталога прогона), затем `/izi`;
4. Оба результата и обе цены — в этот файл, разделом «Результаты» с датой и id прогонов.

## 8. Когда это делать

**После B11** (`backlog-big-project.md`) — до фокуса izi на eddi просто не дойдёт: сегодня карта
встаёт на шаге 6 (`docs/big-projects-problems.md`). Раньше можно прогнать только omo — его число от
izi не зависит и лежать до сравнения может сколько угодно.
