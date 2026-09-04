---
description: Run the solo workflow — plan, review, development (background)
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
- `foreground: false` is mandatory: foreground holds the session and silences the chat
  relay of answers.
- In the background, questions arrive as chat messages; format the operator's reply with
  the `solo_answer` tool (matching numbers against .agent/pending.json; show the table
  to the operator).
- One tool call to start. Answering workflow questions is your only action.
- OUTPUT ONLY the `solo_answer` tool call. NO text before or after. Do not paraphrase
  the questions, do not echo the answers in prose, do not print them line by line —
  solo_answer shows the table itself. Your output = one tool call, zero text.
- The workflow prints its cards via log() itself. If the operator asks — answer in one
  sentence, then again only the tool call.
$END_LAW
