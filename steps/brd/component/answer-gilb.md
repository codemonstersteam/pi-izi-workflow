R1 Глоссарий — новый тип конфигурации с ресурсом `eddi://ai.labs.glossary`
   fit:    ресурс типа `Glossary` с resource URI `eddi://ai.labs.glossary`
   verify: декларация сущности Glossary содержит URI `eddi://ai.labs.glossary`

R2 Версионирование Глоссария повторяет механизм Prompt Snippet
   fit:    схема версионирования соответствует реализации Prompt Snippet
   verify: создание и обновление Глоссария порождает новую версию ресурса

R3 Термины подставляются в промпты наравне со сниппетами
   fit:    шаблон промпта разрешает подстановку `{{glossary.<term>}}` в value термина
   verify: рендеринг промпта с `{{glossary.<term>}}` возвращает value термина

R4 Глоссарий экспортируется вместе с агентом
   fit:    ZIP-архив экспорта агента содержит файлы `{id}.glossary.json` и `{id}.descriptor.json`
   verify: архив экспорта агента включает указанные файлы для каждого подключённого Глоссария

R5 При импорте агента Глоссарии объединяются по resource URI (merge)
   fit:    существующий Глоссарий обновляется (upgrade) новой версией при совпадении resource URI
   verify: импорт агента с Глоссарием, совпадающим по URI, обновляет существующий ресурс

R6 Термин состоит только из пары key + value, без description и category
   fit:    модель Термина содержит ровно два поля: key и value
   verify: схема Термина не содержит полей description, category

R7 Ключ Термина — до 64 символов, lowercase, алфавитно-цифровой и подчёркивание
   fit:    key соответствует паттерну `^[a-z0-9_]{1,64}$` в пределах Термина Глоссария
   verify: валидация key Термина отклоняет значения, не соответствующие паттерну

R8 При изменении Глоссария номер версии увеличивается
   fit:    version при каждом обновлении Глоссария увеличивается согласно механизму Prompt Snippet
   verify: обновление Глоссария изменяет поле version с v на v+1

R9 Поле terms Глоссария — JSON-объект с парами key-value
   fit:    terms — объект вида `{"<key>": "<value>", ...}` в ресурсе Глоссария
   verify: десериализация поля terms возвращает мапу key → value

R10 REST путь для Глоссариев — `/glossarystore/glossaries`
   fit:    REST путь `/glossarystore/glossaries` обслуживает CRUD Глоссариев
   verify: GET /glossarystore/glossaries → список Глоссариев

R11 Глоссарий подключён к агенту как reference в agent config, по образцу snippets
   fit:    конфигурация агента содержит ссылку на Глоссарий в том же паттерне, что snippets
   verify: agent config содержит ссылку на ресурс Глоссария

R12 Подстановка разрешается только по Глоссариям, привязанным к агенту
   fit:    `{{glossary.<term>}}` с непривязанным Глоссарием не разрешается
   verify: подстановка `{{glossary.<term>}}` из непривязанного Глоссария не даёт value

R13 При совпадении key в нескольких Глоссариях побеждает последняя загрузка по порядку configuration set
   fit:    приоритет разрешения key определяется порядком Глоссариев в configuration set агента — последняя загрузка побеждает
   verify: при одинаковых key в двух Глоссариях возвращается value из Глоссария с большим индексом в configuration set

R14 Поля ресурса Глоссария — только id, version, terms
   fit:    ресурс Глоссария содержит ровно три поля: id, version, terms
   verify: схема Глоссария включает id, version, terms и исключает иные поля

R15 Длина value Термина не ограничена
   fit:    value Термина не имеет ограничения по длине в ресурсе Глоссария
   verify: сохранение Термина со значением произвольной длины проходит валидацию

R16 Ключ в модели данных шаблона — `glossary`, синтаксис подстановки `{{glossary.<term>}}`
   fit:    синтаксис подстановки `{{glossary.<term>}}` (стандартный Qute, двойные фигурные скобки)
   verify: шаблон `{{glossary.my_term}}` разрешается в value термина с key `my_term`

R17 Кэширование — Caffeine с тем же TTL, что у PromptSnippetService
   fit:    кэш Глоссариев использует Caffeine с TTL, совпадающим с PromptSnippetService
   verify: GlossaryService использует Caffeine cache с TTL, равным TTL PromptSnippetService

R18 Удалённый Глоссарий, подключённый к агенту — ошибка при рендеринге промпта
   fit:    рендеринг промпта агента с подключённым но удалённым Глоссарием завершается с HTTP 422 Unprocessable Entity
   verify: удаление Глоссария, подключённого к агенту, и последующий рендеринг промпта → HTTP 422

R19 Файлы Глоссария в ZIP-экспорте агента — `{id}.glossary.json` и `{id}.descriptor.json`
   fit:    для каждого Глоссария в ZIP экспорта агента присутствуют два файла: `{id}.glossary.json` + `{id}.descriptor.json`
   verify: ZIP агента содержит пары файлов с именами `{id}.glossary.json` и `{id}.descriptor.json`

analogue: PromptSnippet — CRUD, версионирование, подстановка, экспорт/импорт, кэширование моделируются по Prompt Snippet
subjects[]: Glossary · PromptSnippet · agent · export · descriptor · configuration
open-questions: 0