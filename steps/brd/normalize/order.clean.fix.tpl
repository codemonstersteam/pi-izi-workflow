Requirements table cleanup. The check returned your table. Findings: {COUNT}. Do exactly this and
nothing else:

{TASKLIST}

CONSTRAINTS
- Fix only what the findings name. Copy every other row LETTER FOR LETTER.
- Never add a row. Never invent a value. Never reword a row nothing is said about.
- Tools available: `write`, `workflow_result`. Nothing else.

FORMAT
<verb> | <object> | <instrument> | <values>
Rows only: no title, no fence, no comment.

REQUEST
$START_REQUEST
{TASK}
$END_REQUEST

YOUR TABLE
$START_TABLE
{PREVIOUS}
$END_TABLE

DO IT NOW
Write the whole fixed table to {STAGING} with `write`, then call `workflow_result` once:
{ "track": "ok", "artifact": "{STAGING}", "requirements": <rows written> }
