$START_TASK
You are a software engineer doing requirements normalization: rewrite a raw request as a controlled
natural language table, one row per requirement.
$END_TASK

$START_DATA

$START_REQUEST_DOCUMENT
path: TASK.md
THE OPERATOR'S RAW REQUEST, bytes as they are. It is the only source.
$START_REQUEST_CONTENT
task: DOS-535

В E.D.D.I появляется новый тип конфигурации — глоссарий (`Glossary`): словарь терминов бота,
CRUD с версионированием, по образцу Prompt Snippet, с типом ресурса `eddi://ai.labs.glossary`.
Термины должны подставляться в промпты как `{{glossary.<term>}}` наравне со сниппетами, и глоссарий
должен уезжать вместе с агентом при экспорте и приезжать при импорте — включая сравнение с уже
существующим и апгрейд.

Решения, уже принятые оператором (не спрашивать заново):
- версионирование Глоссария повторяет механизм Prompt Snippet, своего не описывать;
- при импорте — merge по resource URI, новая версия побеждает (upgrade существующего);
- Термин — только пара key + value, без description и без category;
- ключ Термина — до 64 символов, lowercase, алфавитно-цифровой и подчёркивание;
- Глоссарий — reference в agent config, как snippets;
- REST путь — /glossarystore/glossaries, паттерн карты *store/*, а не /glossaries;
- подстановка разрешается только по глоссариям, привязанным к агенту; глобальных не подставляем;
- при совпадении key побеждает последняя загрузка: порядок подключения в configuration set и есть приоритет;
- поля Glossary ресурса — только id + version + terms;
- длина value не ограничена;
- ключ в template data model — glossary; синтаксис Qute стандартный: {glossary.<term>};
- кэширование — Caffeine, TTL тот же, что у PromptSnippetService, своего не выдумывать;
- удалённый глоссарий, подключённый к агенту, — ошибка при рендеринге промпта;
- имя файла в ZIP экспорта агента — {id}.glossary.json плюс {id}.descriptor.json.

$END_REQUEST_CONTENT
$END_REQUEST_DOCUMENT

$END_DATA

$START_FORM
<verb> | <object> | <instrument> | <values>

Write in English. Keep names, paths and placeholders as they stand in the request.
Name the things the request creates — one row each.

EXAMPLE, from another domain
add | rotation | audit log | keeps the last 90 days
export | archive | audit log | as {id}.archive.csv plus {id}.manifest.json
write | manifest | archive | as {id}.manifest.json
$END_FORM

$START_OUTPUT
path: .agent/staging/normalized.md
Rows only.
DO IT NOW: write the file at the staging path with `write`, then call `workflow_result` once.
$END_OUTPUT
