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
- ВЫВОДИ ТОЛЬКО вызов инструмента `solo_answer`. НИКАКОГО текста до или после.
  Не пересказывай вопросы, не дублируй ответы словами, не выводи их построчно —
  solo_answer сам покажет таблицу. Твой вывод = один tool call, ноль текста.
- Полоса сама печатает карточки через log(). Если оператор спросил — ответь одним
  предложением, затем снова только tool call.
$END_LAW
