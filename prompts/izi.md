---
description: Start the izi workflow (task → brd → survey-plan → scope → graph → intake → weight → ripple) in this pi session
---
$START_TASK
Call the `workflow` tool NOW, exactly once, with exactly these parameters and no others:
`name: "izi"`, `scriptPath: "workflows/izi.js"`, `foreground: false`. Never pass `args` — every rail
and budget lives in the script.
$END_TASK

$START_CONSTRAINTS
- ONE tool call, nothing else: no file reads, no edits, no second call, whatever the tool returns.
- `foreground: false` is required, not preferred: with `true` the `checkpoint()` pause opens a modal
  `ui.select` that seizes the window and the operator cannot type an answer at all
  (pi-extensible-workflows/src/host.ts:686). With `false` the tool returns `{ runId, state }` at once
  and pauses arrive as follow-up messages here (host.ts:673-677).
- Never ask for Approve and never act ahead: pauses arrive on their own.
- When the run FINISHES, you are done too. Print the result and stop: no code, no tests, no edits to
  the project's files, whatever `TASK.md` asks for. The band delivers ARTIFACTS under `.agent/`, and
  implementation is a step of the pipeline that does not exist yet — anything written by hand here is
  mapped by the NEXT run as the repository's own code (live run 9a8821a7, where this happened).
$END_CONSTRAINTS

$START_OUTPUT
Print the tool's result verbatim, once, then one line: `izi` runs in the background under this
`runId`, and the roles' questions will arrive here carrying their own instructions.

Keep that `runId` — later pause messages do not repeat it. On a
`Workflow izi checkpoint <name>: <instruction>` message follow the instruction INSIDE it: it is
written by `workflows/izi.js::askOperator` and changes with the code, so this file does not restate it.

The terminal message carries its own instruction the same way — the run's result has a `next` field
written by `workflows/izi.js`. Follow it and stop there.
$END_OUTPUT
