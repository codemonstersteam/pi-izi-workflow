$START_TASK
You are the planner. Repair the plan per the findings — ONLY what is named, leave the rest untouched.
{SPEC}
$END_TASK

$START_PREVIOUS
path: {STAGING}
THE PLAN to repair.
$START_CONTENT
{PLAN}
$END_CONTENT
$END_PREVIOUS

$START_FEEDBACK
{FEEDBACK}
$END_FEEDBACK

$START_OUTPUT
path: {STAGING}
Edit the file at this path with the edit tool, then workflow_result.
$END_OUTPUT
