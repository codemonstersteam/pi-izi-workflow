GOAL
Return the table below with its duplicates merged and its invented rows deleted. Nothing else changes.

CONSTRAINTS
- Copy every row you keep LETTER FOR LETTER. Do not reword, reorder or renumber.
- Two rows with the same verb and the same object are one requirement: merge them into one row and
  keep every value of both.
- A row whose values are not in the request is invented: delete it.
- Never add a row. Never invent a value.
- Tools available: `write`, `workflow_result`. Nothing else.

FORMAT
<verb> | <object> | <instrument> | <values>
Rows only: no title, no fence, no comment.

SUCCESS
- no two rows share a verb and an object
- no value stands in two rows
- every row traces to the request

EXAMPLE
request:
  The nightly backup is archived as {id}.archive.csv, alongside the job.
table in:
  archive | backup | archive file | alongside the job
  archive | backup | archive file | as {id}.archive.csv
  encrypt | backup | AES-256 | with a rotating key
table out:
  archive | backup | archive file | alongside the job, as {id}.archive.csv

REQUEST
$START_REQUEST
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

$END_REQUEST

TABLE
$START_TABLE
create | Glossary | configuration type | dictionary of bot terms
provide | CRUD | Glossary | with versioning
version | Glossary | same mechanism | as Prompt Snippet
add | resource type | Glossary | eddi://ai.labs.glossary
enable | substitution | prompts | {{glossary.<term>}} on par with snippets
export | Glossary | agent ZIP archive | as {id}.glossary.json plus {id}.descriptor.json
import | Glossary | agent ZIP archive | with comparison to existing and upgrade
merge | Glossary | import | by resource URI, new version wins
limit | Term | key value | key + value only, no description and no category
restrict | Term key | value | up to 64 characters, lowercase, alphanumeric and underscore
add | reference | agent config | Glossary like snippets
serve | REST path | Glossary | /glossarystore/glossaries following *store/* pattern
allow | substitution | only | glossaries attached to agent, no global ones
resolve | key collision | priority | last load wins, order in configuration set determines priority
limit | Glossary resource | fields | id + version + terms only
keep | Term value | length | unlimited
set | key | template data model | glossary with Qute syntax {glossary.<term>}
cache | Glossary | Caffeine | same TTL as PromptSnippetService
raise | error | prompt rendering | when deleted glossary is attached to agent
$END_TABLE

DO IT NOW
Write the cleaned rows to .agent/staging/normalized.clean.md with `write`, then call `workflow_result` once:
{ "track": "ok", "artifact": ".agent/staging/normalized.clean.md", "requirements": <rows written> }
