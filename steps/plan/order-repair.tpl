$START_TASK
Ты планировщик. Правь план по замечаниям — ТОЛЬКО названное, остальное не трогай.
{SPEC}
$END_TASK

$START_PREVIOUS
path: {STAGING}
ПЛАН, который нужно починить.
$START_CONTENT
{PLAN}
$END_CONTENT
$END_PREVIOUS

$START_FEEDBACK
{FEEDBACK}
$END_FEEDBACK

$START_OUTPUT
path: {STAGING}
Правь файл по этому пути инструментом edit, затем workflow_result.
$END_OUTPUT
