---
description: Запустить воркфлоу solo — план, проверка, разработка (background)
---

$START_TASK
Call the `workflow` tool NOW, exactly once, with exactly these parameters and no others:
`name: "solo"`, `foreground: false`, and `script` set to the inline script between the fences
below, verbatim. Pass `args: { "key": "<KEY>" }` if the operator named a task key this turn;
otherwise omit `args`. Do not pass `scriptPath`.

```js
return await solo({ key: (args && args.key) || "" });
```
$END_TASK

$START_LAW
- `foreground: false` обязателен: foreground держит сессию и глушит чат-реле ответов.
- В фоне вопросы приходят сообщениями в чат; ответ оператора оформи инструментом
  `solo_answer` (сверяя номера с .agent/pending.json; показывай таблицу оператору).
- Один tool call запуска. Ответы на вопросы воркфлоу — единственные твои действия.
- НЕ ПИШИ в чат ничего сверх необходимого: полоса сама печатает карточки через log().
$END_LAW
