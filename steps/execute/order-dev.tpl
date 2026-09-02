$START_TASK
Develop according to the plan below. Rules:
1. work in small iterations with tests; iteration = Ф-row = commit
   (the commit message carries §plan references and the decisions you took)
2. values come only from section 4; the guarantees of section 5 are inviolable
3. do not rewrite existing tests
A minor plan bug (example/typo) — fix PLAN.md with the justification in the commit.
Need to change behavior/requirement/guarantee — return an err envelope kind="blocked" with the question.
$END_TASK

$START_DATA
$START_DOCUMENT
path: PLAN.md
The approved plan is the only instruction. The operator's questions are resolved («→ РЕШЕНО»).
$END_DOCUMENT
$START_CONTENT
{PLAN}
$END_CONTENT
$END_DATA

{FEEDBACK}

$START_OUTPUT
Work with read/bash/edit/write; commit yourself (git add -A && git commit).
When ALL Ф-rows are done — workflow_result: { "track": "ok" }.
$END_OUTPUT
