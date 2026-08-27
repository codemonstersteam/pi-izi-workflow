---
description: Запустить воркфлоу solo — план по спеке, вопросы в чат, разработка по строкам (foreground)
---

$START_TASK
Call the `workflow` tool NOW, exactly once, with exactly these parameters and no others:
`name: "solo"`, `foreground: false`, and `script` set to the inline script between the fences
below, verbatim. Pass `args: { "key": "<KEY>" }` if the operator named a task key this turn;
otherwise omit `args`. Do not pass `scriptPath`. When the launch completes — finished: no code,
no tests, no file edits of your own. When the workflow asks the operator questions in chat,
relay the operator's reply through the `solo_answer` tool exactly once per batch.

```js
const ok = (v) => ({ track: "ok", value: v });
const err = (kind, subject) => ({ track: "err", kind, subject });
const ENVELOPE = {
  type: "object",
  properties: {
    track: { type: "string", enum: ["ok", "err"] },
    artifact: { type: "string" }, verdict: { type: "string" },
    blockers: { type: "array", items: { type: "string" } },
    questions: { type: "array", items: { type: "string" } },
    kind: { type: "string", enum: ["blocked", "invalid", "question", "lookup", "escalate", "crashed"] },
    subject: { type: "string" },
  },
  required: ["track"],
  additionalProperties: false,
  allOf: [{ if: { properties: { track: { const: "err" } }, required: ["track"] }, then: { required: ["kind", "subject"] } }],
};
const started = await soloStart({ key: (args && args.key) || "" });
if (started.track === "err") return err(started.kind || "crashed", started.subject || "start failed");
let state = started.state;
for (;;) {
  const it = await soloNext({ state });
  if (it.do === "done") return ok({ station: "done", value: it.state });
  if (it.do === "err") return err(it.kind || "crashed", it.subject || "");
  let result = null;
  if (it.do === "say") { log(it.line); continue; }
  if (it.do === "role") log("→ фаза " + state.phase + ": наряд роли " + it.role + (state.round > 1 ? " (круг " + state.round + ")" : ""));
  if (it.do === "ask") log("⏸ фаза " + state.phase + ": вопросы оператору (" + (it.items || []).length + ") — жду ответа в чате");
  if (it.do === "role") result = await agent(it.text, { role: it.role, outputSchema: ENVELOPE }, "solo:agent");
  else if (it.do === "ask") {
    const r = await ask({ items: (it.items || []).map((t) => ({ text: String(t) })) });
    result = (r && r.answers) || [];
  } else if (it.do === "checkpoint") {
    result = await checkpoint({ name: it.name, prompt: it.prompt });
  }
  const folded = await soloFold({ state, event: { do: it.do, instruction: it, result } });
  if (folded.track === "err") return folded;
  state = folded.value;
}
```
$END_TASK

$START_LAW
- `foreground: false` обязателен: foreground держит сессию и глушит чат-реле ответов.
  В фоне вопросы приходят сообщениями в чат; ответ оператора оформи инструментом
  `solo_answer` (сверяя номера с .agent/pending.json; показывай таблицу оператору).
  Подтверждение плана — тоже слова оператора («да»/«нет: причина») через solo_answer.
- Один tool call запуска. Ответы на вопросы воркфлоу — единственные твои действия
  после запуска: реле, не исполнитель.
$END_LAW
