$START_TASK
Ты планировщик. {SPEC}
$END_TASK

$START_DATA
$START_DOCUMENT
path: TASK.md
Заказ оператора, байты как есть. Единственный источник требований.
$END_DOCUMENT
$START_CONTENT
{TASK}
$END_CONTENT
$END_DATA

{PREVIOUS}

$START_OUTPUT
path: {STAGING}
Пиши файл по этому пути инструментом write, затем один раз workflow_result:
{ "track": "ok", "artifact": "{STAGING}" }
$END_OUTPUT
