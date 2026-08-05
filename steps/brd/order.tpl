$START_TASK
Turn the raw business request into a measurable BRD.
$END_TASK

$START_DATA
$START_DOCUMENT
path: TASK.md
the operator's raw request, bytes as they are — do not go looking for the file
$END_DOCUMENT
$START_CONTENT
{TASK}
$END_CONTENT
$START_DOCUMENT
path: .agent/answers.md
operator answers to your earlier questions, accumulated
$END_DOCUMENT
$START_CONTENT
{ANSWERS}
$END_CONTENT
$END_DATA

$START_CONSTRAINTS
- subjects[]: 3..7 of them; each one — greppable: one word, not a phrase; in the language of the
  repository, not of the request
$END_CONSTRAINTS

$START_FEEDBACK
Evidence from the last red check on `.agent/staging/brd.md`, if this is a redelegation. Empty means
this is the first attempt — nothing to fix yet.
$START_CONTENT
{FEEDBACK}
$END_CONTENT
$END_FEEDBACK

$START_OUTPUT
path: {STAGING}
schema:
  R<N> <statement: what, not how>
     fit:    <value | range | enum | format>
     verify: <command | artifact>
  subjects[]: <term> · <term> · …
  open-questions: 0
check: {CHECK}
return: call workflow_result — the shape and the choice of rail are declared by your ROLE's
OUTPUT_FORMAT
$END_OUTPUT
