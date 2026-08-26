# RECHECK — перепроверка эталона mvp (T32)

Дата перепроверки: **24.08.2026**, после прогонов 613c8a1a (brd) и 3c6542e7 (brd + scope).
Перепроверка ОТДЕЛЬНА от сверки: этот файл доказывает, что эталону можно верить, ДО того, как по
нему будут судить сквозной прогон (T31). Три сверки по билету:

## 1. Внутренняя согласованность — `check.mjs`, десять проверок

Прогон `node .agent/mvp/check.mjs` от 24.08.2026: **10 из 10 СОШЛОСЬ, НЕ СОШЛОСЬ: ничего**.
Модули ↔ дельты (12/12), needs ацикличны, волны раньше потребителя, у каждого значения один
порождающий, потоки (48 шагов) закрыты, дерево ↔ потоки сходятся, отказы (3 кода) порождены и
доезжают до статуса, PLAN.md покрывает все модули, NFR `glossary-cache-ttl = 5 minutes` доехал.

## 2. Решения оператора — таблица 15/15

Каждое решение из `TASK.md` («не спрашивать заново») найдено в эталоне — файлом и строкой:

| # | решение оператора | где в эталоне |
|---|---|---|
| 1 | версионирование = механизм Prompt Snippet | module-tree: `GlossaryStore` — версии как у сниппетов; PLAN 1.1 «по образцу» |
| 2 | импорт: merge по resource URI, новая версия побеждает | data-flow S7 (шаги import/merge/upgrade); tree `RestImportService` |
| 3 | Термин = только key + value | tree `Glossary.java`: `terms: Map<String,String>`; PLAN 1.1 |
| 4 | ключ ≤ 64, lowercase, alnum + `_` | data-flow S2a: `TERM_KEY_INVALID`; PLAN 1.1 «валидация ключа» |
| 5 | REST путь `/glossarystore/glossaries` | data-flow S1/S2: `GET/POST /glossarystore/glossaries` |
| 6 | подстановка только по привязанным | tree `GlossaryService`: карта ПО АГЕНТУ, не глобально |
| 7 | совпадение key: последняя загрузка побеждает | tree `GlossaryService.post`: «ПОЗДНИЙ глоссарий переопределяет ранний (UC5/3, R13)» |
| 8 | поля ресурса id + version + terms | tree `Glossary.java`; PLAN 1.1 (закрывает R14, R2, R8, R9) |
| 9 | длина value не ограничена | PLAN 1.1: «value без ограничения» (не несёт модуля — правильно) |
| 10 | ключ шаблона `glossary`, Qute `{glossary.<term>}` | tree `LlmTask.twin`: `put("glossary", …)` рядом со сниппетами |
| 11 | кэш Caffeine, TTL = PromptSnippetService | nfr `glossary-cache-ttl = 5 minutes` (check №10 доехал до плана) |
| 12 | удалённый глоссарий у агента — ошибка рендера | data-flow: ветвление рендера с кодом отказа |
| 13 | ZIP: `{id}.glossary.json` + `{id}.descriptor.json` | tree `RestExportService.post`: «те же имена, что читает импорт (UC6/2)» |
| 14 | глоссарий — reference в agent config | tree `AgentConfiguration` (правка, волна 1): `List<URI> glossaries` |
| 15 | глобальных глоссариев не подставляем | tree `AgentConfiguration` примечание: сниппеты глобальны, глоссарии — НЕТ |

**15/15 — решений, не отражённых в эталоне, нет.**

## 3. Кодовая реальность — перекрёстная сверка с `component-tests/eddi-by-zai.md`

Проработка агента (zai) закрывала задачу чтением ~12 файлов независимо от эталона. Сверка точек
интеграции:

| точка | zai (код) | эталон | вердикт |
|---|---|---|---|
| сбор карты подстановки | `LlmTask.java:216` `put("snippets",…)` | `LlmTask` twin: строка 214, тот же приём | совпало |
| кэш | `PromptSnippetService.java:84` Caffeine `expireAfterWrite(5 мин)` | nfr 5 minutes | совпало |
| ресурсный тип | `IRestPromptSnippetStore.java:34` `eddi://ai.labs.snippet` | `eddi://ai.labs.glossary` (по образцу) | совпало |
| REST-слой | `RestPromptSnippetStore` → `/glossarystore/glossaries` | data-flow S1/S2 | совпало |
| экспорт | `RestExportService` (SNIPPET_REF_PATTERN, ZIP) | tree `RestExportService` (правка, волна 3) | совпало |
| импорт | `RestImportService` (merge по URI, StructuralMatcher, UpgradeExecutor) | tree `RestImportService` + S7 | совпало |
| привязка к агенту | zai: «references как snippets»; **эталон: как `workflows` (List URI)** | tree 1.2 примечание | **РАСХОЖДЕНИЕ РАЗРЕШЕНО В ПОЛЬЗУ ЭТАЛОНА** |
| сьюты | pom: surefire `*Test` / failsafe `*IT` | PLAN: проверки `*Test`/`*IT` | совпало |

**Одно расхождение найдено и разрешено**: zai предлагал привязку «по образцу сниппетов», эталон —
по образцу поля `workflows` (`List<URI>`), с доказательством из кода: сниппеты к агенту НЕ
привязываются вовсе (глобальные, `PromptSnippetService.getAll()`), и слова «snippet» в
`AgentConfiguration` нет. Эталон прав по коду; проработка zai поправлена этой строкой.

## Вердикт

Эталон **ПЕРЕПРОВЕРЕН 24.08.2026** и годен как оракул сквозной сверки (T31): внутренне согласован
(10/10), полон по решениям оператора (15/15), точки интеграции совпадают с кодом eddi (7/8
буквально, 1/8 разрешён проверкой по коду в пользу эталона).
