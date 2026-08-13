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
- analogue: the existing mechanism this work is modelled on — ONE word, same rule as a subject,
  because step 3b greps the repository with it; an explanation may follow after a dash. If there is
  no model to follow, say so: `none — <why>`
- subjects[]: {SUBJECTS_MIN}..{SUBJECTS_MAX} of them; each one — {SUBJECT_RULE}
- an anchor is a NOUN from the request, not your evaluation of it: `record`, not `retention` —
  step 3 greps it over the repository, and an evaluation matches no file
- `verify:` of a restriction checks the call the restriction APPLIES TO. If another `R` forbids
  changing that same call, the two contradict: the restriction's scope is wrong or unstated, and
  an unstated scope is a question, never your choice
$END_CONSTRAINTS

$START_FEEDBACK
Evidence from the last red check on `.agent/staging/brd.md`, if this is a redelegation. Empty means
this is the first attempt — nothing to fix yet. Non-empty: repair EXACTLY the `R` it names before
anything else — a question about another requirement leaves this blocker where it is.
$START_CONTENT
{FEEDBACK}
$END_CONTENT
$END_FEEDBACK

$START_OUTPUT
path: {STAGING}
schema:
  R<N> <statement: what, not how>
     fit:    <value | range | enum | format | predicate>
     verify: <command | artifact>
  analogue: <OneWord> — по образцу чего делается работа (или: none — почему образца нет)
  subjects[]: <term> · <term> · …
  open-questions: 0
check: {CHECK}
return: call workflow_result — the shape and the choice of rail are declared by your ROLE's
OUTPUT_FORMAT
$END_OUTPUT
