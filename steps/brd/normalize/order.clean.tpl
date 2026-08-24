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
{TASK}
$END_REQUEST

TABLE
$START_TABLE
{ROWS}
$END_TABLE

DO IT NOW
Write the cleaned rows to {STAGING} with `write`, then call `workflow_result` once:
{ "track": "ok", "artifact": "{STAGING}", "requirements": <rows written> }
