---
description: Запустить воркфлоу solo — план по спеке и разработка (foreground, без участия чат-модели после запуска)
---

$START_TASK
Call the `workflow` tool NOW, exactly once, with exactly these parameters and no others:
`name: "solo"`, `foreground: true`, and `script` set to the inline script between the fences
below, verbatim. Pass `args: { "key": "<KEY>" }` if the operator named a task key this turn;
otherwise omit `args`. Do not pass `scriptPath`. When the launch completes — finished: no code,
no tests, no file edits of your own.

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
  if (it.do === "role") result = await agent(it.text, { role: it.role, outputSchema: ENVELOPE }, "solo:agent");
  else if (it.do === "ask") {
    const r = await ask({ items: (it.items || []).map((t) => ({ text: String(t) })) });
    result = (r && r.answers) || [];
  }
  const folded = await soloFold({ state, event: { do: it.do, instruction: it, result } });
  if (folded.track === "err") return folded;
  state = folded.value;
}
```
$END_TASK

$START_LAW
- `foreground: true` обязателен: вопросы оператора идут через TUI без твоего участия.
- Один tool call. После его возвращения (итоговая карточка воркфлоу) — ответ закончен:
  перескажи карточку одним абзацем, если оператор спросит, но не предпринимай действий.
$END_LAW
