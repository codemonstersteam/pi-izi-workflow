<exchange>
  <question_1>Синтаксис подстановки в промптах — `{glossary.<term>}` (стандартный Qute, одинарные фигурные скобки) или `{{glossary.<term>}}` (двойные скобки)?</question_1>
  <answer_1>синтаксис двойные фигурные скобки {{glossary.<term>}}</answer_1>
  <question_2>Код ошибки при рендеринге промпта с подключённым но удалённым Глоссарием — 500 Internal Server Error (альтернативы: 422 Unprocessable Entity, 404 Not Found)?</question_2>
  <answer_2>код ошибки 422 Unprocessable Entity</answer_2>
</exchange>
<exchange>
  <question_1>missing glossary key during prompt rendering — placeholder left as-is (alternatives: error thrown, empty string)? R12 covers unbound glossaries and R18 covers deleted ones, but no requirement specifies what happens when a key simply does not exist in any bound glossary.</question_1>
  <answer_1>плейсхолдер остаётся как есть, ошибки нет</answer_1>
  <question_2>import glossary merge at term level — terms are replaced entirely by the imported set (alternatives: terms merged at individual key level)? R5 states merge by resource URI but the granularity is unclear.</question_2>
  <answer_2>замена набора терминов целиком, новая версия побеждает</answer_2>
  <question_3>GET single glossary by id — not required, list only (alternatives: yes, add GET /glossarystore/glossaries/{id})? R10 specifies the list endpoint but is silent on individual retrieval.</question_3>
  <answer_3>да, нужен GET /glossarystore/glossaries/{id}</answer_3>
</exchange>
<exchange>
  <question_1>ГЕЙТ 1 · DOS-535 · план: task/DOS-535/PLAN.md

Цель: add Glossary as a new configuration type with CRUD, versioning, prompt substitution, and agent export/import

  7 use case ─└─ UC1-UC7 ──► labs-eddi · 11 модулей (6 новых)

  Работ: 11 модулей, 6 новых · первым Glossary.java, его зовут 3 из 11
  Проверка: 11 команд — ./mvnw test ×11
  Ветка: feature/DOS-535 от main

Ответ: approve · rework: <что не так> · stop</question_1>
  <answer_1>rework: требование R11 не реализовано — глоссарий должен подключаться к агенту ссылкой в AgentConfiguration, по образцу snippets. Нужен use case привязки глоссария к агенту и дельта на src/main/java/ai/labs/eddi/configs/agents/model/AgentConfiguration.java</answer_1>
</exchange>
