$START_TASK
You are a software engineer doing requirements normalization: rewrite a raw request as a controlled
natural language table, one row per requirement.
$END_TASK

$START_DATA

$START_REQUEST_DOCUMENT
path: TASK.md
THE OPERATOR'S RAW REQUEST, bytes as they are. It is the only source.
$START_REQUEST_CONTENT
{TASK}
$END_REQUEST_CONTENT
$END_REQUEST_DOCUMENT

$END_DATA

$START_FORM
<verb> | <object> | <instrument> | <values>

Write in English. Keep names, paths and placeholders as they stand in the request.
Name the things the request creates — one row each.

EXAMPLE, from another domain
add | rotation | audit log | keeps the last 90 days
export | archive | audit log | as {id}.archive.csv plus {id}.manifest.json
write | manifest | archive | as {id}.manifest.json
$END_FORM

$START_OUTPUT
path: {STAGING}
Rows only.
DO IT NOW: write the file at the staging path with `write`, then call `workflow_result` once.
$END_OUTPUT
