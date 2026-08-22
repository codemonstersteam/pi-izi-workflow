$START_TASK
Judge this request: is it solvable, does it make sense, does it belong to THIS repository.
Then write its consequences and the anchors the pipeline will search by.
$END_TASK

$START_DATA

$START_REQUEST_DOCUMENT
path: TASK.md
THE OPERATOR'S RAW REQUEST, bytes as they are. It also fixes the LANGUAGE of your artifact.
$START_REQUEST_CONTENT
{TASK}
$END_REQUEST_CONTENT
$END_REQUEST_DOCUMENT

$START_HITS_DOCUMENT
path: computed by script over {FILES} files of this repository, 0 tokens
HOW OFTEN EACH WORD OF THE REQUEST OCCURS HERE. Substring match, case-insensitive, path and text.
This is the only fact about the repository you get at this step — nobody has read the code yet.
WHAT AN ANCHOR IS FOR, because that is what decides your choice: the next step MARKS every file whose
text contains the anchor, and the step after it NARROWS the survey to those files when the repository
is too large to read whole. So an anchor must point AT THE PLACE THE WORK LANDS — the thing that gets
changed — not at the technology used to do it.

AN ANCHOR IS ONE LOWERCASE COMMON NOUN naming a thing your own R lines CREATE or CHANGE. Build the
list FROM YOUR R LINES, created things first: a created thing is not in the table and its count is
zero — that is the work. A changed thing is already in the table — copy the word as it stands there.
A word with no work on it is not an anchor, however high its count.
A COMPOUND NAME GIVES TWO ANCHORS — the thing and its kind: `queue screen` → `queue` · `screen`.

    request:  the nightly backup must skip archived tenants, write a report of what it skipped
              and show that report on a new screen
    table:    backup:19  tenant:14  archive:6  name:11
    subjects[]: report · screen · backup · tenant · archive

    `report` and `screen` are created, so they lead and carry no count. `name` stands in the table with 11
    and is not an anchor: nothing in this request changes it.

Zero on the NEW entity is EXPECTED — it does not exist yet, that is the work. Include it anyway: the
swarm must know what it is looking to create. Zero on the ANALOGUE is a defect — you named something
this repository does not have.
$START_HITS_CONTENT
{HITS}
$END_HITS_CONTENT
$END_HITS_DOCUMENT

$START_ANSWERS_DOCUMENT
path: .agent/answers.md
OPERATOR ANSWERS, accumulated. Only what stands inside `<answer_N>` is a fact.
$START_ANSWERS_CONTENT
{ANSWERS}
$END_ANSWERS_CONTENT
$END_ANSWERS_DOCUMENT

$END_DATA

$START_FORM
subjects[]: {SUBJECTS_MIN}..{SUBJECTS_MAX} of them, taken from your own R lines, created first:
  every thing your R lines CREATE — one lowercase noun each, count zero, listed anyway;
  then every thing your R lines CHANGE — copied from the hit table as it stands there.
verdict: one of `solvable` · `unclear` · `not-this-repo`.
open-questions: 0 — whatever you could not resolve is a question, not a line in the artifact.
$END_FORM

$START_OUTPUT
path: {STAGING}
schema:
  verdict: <one of three>
  R<N> <what changes>
  analogue: <OneWord> — <what makes it the model>
  subjects[]: <term> · <term> · <term>
  open-questions: 0
check: {CHECK}
DO IT NOW: write the file at the staging path with `write`, then call `workflow_result` once.
$END_OUTPUT
