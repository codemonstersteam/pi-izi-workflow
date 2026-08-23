$START_TASK
The check returned your table. Findings: {COUNT}. Do exactly this and nothing else:

{TASKLIST}

Each finding names the ROW by its number in your answer. Fix that row and copy every other row
BACK LETTER FOR LETTER — the rows nothing is said about have already been accepted, and rewriting
them loses what was accepted.
$END_TASK

$START_DATA

$START_WORK_DOCUMENT
path: {STAGING}
THIS IS YOUR FILE — the table you wrote last time. Fix it and write the whole of it back.
$START_WORK_CONTENT
{PREVIOUS}
$END_WORK_CONTENT
$END_WORK_DOCUMENT

$START_REQUEST_DOCUMENT
path: TASK.md
THE OPERATOR'S RAW REQUEST, bytes as they are. Names, paths and placeholders are copied from here
WHOLE, exactly as they stand.
$START_REQUEST_CONTENT
{TASK}
$END_REQUEST_CONTENT
$END_REQUEST_DOCUMENT

$END_DATA

$START_FORM
<verb> | <object> | <instrument> | <values>

Rows only. No new rows: a finding asks you to fix a row, never to add one.
$END_FORM

$START_OUTPUT
path: {STAGING}
DO IT NOW: go through the findings top down, fix the rows they name, write the whole file at the
staging path with `write`, then call `workflow_result` once.
$END_OUTPUT
