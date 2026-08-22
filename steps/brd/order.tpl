$START_TASK
Turn the raw business request into a measurable BRD.

This is the FIRST pass: nothing has been written yet, and there is nothing to repair. Collect every
gap and ask every clarifying question AT ONCE — a second exchange costs the operator another wait.
$END_TASK

$START_DATA

$START_REQUEST_DOCUMENT
path: TASK.md
THE OPERATOR'S RAW REQUEST, bytes as they are. Do not go looking for the file — it is right here.
This is also what fixes the LANGUAGE of your artifact: the BRD is written in the language of this
text, every `fit:` included.
$START_REQUEST_CONTENT
{TASK}
$END_REQUEST_CONTENT
$END_REQUEST_DOCUMENT

$START_ANSWERS_DOCUMENT
path: .agent/answers.md
OPERATOR ANSWERS to your earlier questions, accumulated across exchanges. Only what stands inside
`<answer_N>` is a fact. A number inside `<question_N>` is your own alternative from last time — it
proves nothing and cannot justify a `fit:`.
$START_ANSWERS_CONTENT
{ANSWERS}
$END_ANSWERS_CONTENT
$END_ANSWERS_DOCUMENT

$END_DATA

$START_FORM
subjects[]: {SUBJECTS_MIN}..{SUBJECTS_MAX} of them; each one — {SUBJECT_RULE}
An anchor is a NOUN FROM THE REQUEST, not your evaluation of it: `record`, not `retention`. Step 3
greps it across the repository, and an evaluation matches no file.

analogue: the existing mechanism this work is modelled on — {ANALOGUE_RULE}. No model to follow —
say so: `none — <why>`. "There is no model" is a conclusion, not a skipped line.

open-questions: 0. A BRD is not delivered with open questions: whatever you could not resolve is a
question to the operator, not a line in the artifact.
$END_FORM

$START_CONSTRAINTS
- `verify:` of a restriction checks the call the restriction APPLIES TO. If another `R` forbids
  changing that same call, the two contradict: the restriction's scope is wrong or unstated, and an
  unstated scope is a question, never your choice.
$END_CONSTRAINTS

$START_OUTPUT
path: {STAGING}
schema:
  R<N> <statement: what, not how>
     fit:    <value | range | enum | format | predicate>
     verify: <command | artifact>
  analogue: <OneWord> — <what makes it the model>   (or: none — <why there is none>)
  subjects[]: <term> · <term> · …
  open-questions: 0
check: {CHECK}
DO IT NOW: write the file at the staging path with the `write` tool; only then call
`workflow_result` — the shape and the choice of rail are declared by your ROLE's OUTPUT_FORMAT.
$END_OUTPUT
