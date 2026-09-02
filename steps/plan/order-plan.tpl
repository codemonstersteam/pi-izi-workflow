$START_TASK
You are the planner. {SPEC}
$END_TASK

$START_DATA
$START_DOCUMENT
path: TASK.md
The operator's order, bytes as-is. The only source of requirements.
$END_DOCUMENT
$START_CONTENT
{TASK}
$END_CONTENT
$END_DATA

{PREVIOUS}

$START_OUTPUT
path: {STAGING}
Write the file at this path with the write tool, then one workflow_result call:
{ "track": "ok", "artifact": "{STAGING}" }
$END_OUTPUT
