$START_TASK
One decision: for EVERY step of every use case below, name the module that will carry it.
You do NOT classify forms, do NOT write scenarios, do NOT invent operations — owners only.
When the script's candidates tie at the top, the choice belongs to the OPERATOR: ask.
$END_TASK

$START_DATA
$START_DOCUMENT
path: .agent/staging/frd~scenarios.xml
The use cases every step of which needs an owner. Their layer is closed — do not touch it.
$END_DOCUMENT
$START_CONTENT
{PREVIOUS}
$END_CONTENT

$START_DOCUMENT
CANDIDATES — computed by script: each use case step × the repository map (a module's role,
its api names, its file name; neighbours over import edges). The same table judges your answer.
`via` names the edge source when a module is a candidate by NEIGHBOURHOOD, not by its own words.
`DISPUTED` — the top scores tie: the choice is the operator's, not yours.
A step with no candidates is a NEW module: owner with new="yes" — but first look twice at the
analogue block below: the analogue already performs this function somewhere.
$END_DOCUMENT
$START_CONTENT
{CANDIDATES}
$END_CONTENT

$START_DOCUMENT
THE ANALOGUE BLUEPRINT — the connected core of the analogue's files, with roles and calls.
This is the ARCHITECTURE your new modules mirror: a new configuration type here has the same
layering as the blueprint shows (model, store interface, REST interface, implementations).
When a step names a module «same as X» / «after X» — X is the PATTERN, not the owner: the work
belongs to a NEW module of this change built after that pattern, or to a module the candidates
name. A module that only appears as a pattern is not an owner.
$END_DOCUMENT
$START_CONTENT
{BLUEPRINT}
$END_CONTENT

$START_DOCUMENT
TYPES THE REPOSITORY DECLARES — name · path · kind. New modules follow the naming convention
visible here; a type name is copied, not invented.
$END_DOCUMENT
$START_CONTENT
{TYPES}
$END_CONTENT

$START_DOCUMENT
THE ANALOGUE — functions, not structure: which analogue file a step's function already lives in.
A function the analogue already performs must be inherited by an owner IN ITS OWN HOME (that
file or its neighbourhood), or explained by a question. A new module for a function the
repository already has is the most expensive mistake of this pass.
$END_DOCUMENT
$START_CONTENT
{ANALOGUE}
$END_CONTENT
$END_DATA

$START_CONSTRAINTS
- THIS PASS WRITES THREE THINGS: `<owner>` and `<question>` into the artifact, AND the
  traceability matrix row into `.agent/rtm.md`: one line per requirement —
  `R3 | owners: path/A.java, new/B.java(new, after=path/C.java) | questions: …`.
  The matrix is judged BOTH ways (coverage substep): a requirement without an owner is LOST work;
  an owner without a requirement is INVENTED work. The blueprint's layer mirrors, the wiring
  callers, and the cluster neighbours all land in the matrix here.
- Every step gets EXACTLY ONE of: an `<owner step="UC1/2" node="path"/>`, an owner with
  `new="yes"` (the file is created by this change), or a `<question step="UC1/2" …/>`.
- `node` is copied from the candidates verbatim, or is a new path with `new="yes"`.
  Never invent a path that exists — check the candidates first.
- One module may own many steps. A step's owner list is ONE module; if two must share a step,
  that is a DISPUTE — ask.
- A `DISPUTED` step without a `<question>` is a refusal: the tie is the operator's decision.
- When the artifact carries `<question>` and ANSWERED holds the operator's replies: replace
  every answered question with its `<owner>` — the answer names the module. A question with no
  answer yet stays a question.
- Questions are ONE batch, each naming the step(s) and the tied candidates; one question
  may cover the steps of ONE dispute: step="UC5/1 UC5/2 UC5/3".
- TWO-FILTER QUESTION TRIAGE — a question must DIE at one of the filters before it reaches
  the operator: (1) can the map, the TYPES table or the blueprint answer it? → answer it
  yourself from the order, it is not a question; (2) is there a defensible default? → ADOPT
  it and RECORD it in .agent/assumptions.md, one line per adoption:
      assumption: <what was unclear> | default: <what you chose> | rationale: <why defensible> | reversible: yes/no
  Only what survives both filters is a question: a decision the OWNER must make — a trade-off,
  an irreversible choice, a policy the requirement does not settle. Every question names its
  candidates and a recommended answer.
- ATTRIBUTE VALUES ARE PLAIN WORDS: no `<`, no `>`, no `&` inside a value — a value carrying
  `<` is not read at all, the element disappears, and the check says MISSING for what you wrote.

      WRONG   subject="глоссарий как <code>{glossary.x}</code> в промпте"
      RIGHT   subject="глоссарий как glossary.x в промпте"

  Name a code fragment in words. If you must show one, write it without angle brackets.
$END_CONSTRAINTS

$START_PREVIOUS
$START_DOCUMENT
path: {STAGING}
THE ARTIFACT AS IT STANDS. Layers already closed: {CLOSED}.
$END_DOCUMENT
$START_CONTENT
{PREVIOUS}
$END_CONTENT
$END_PREVIOUS

$START_ANSWERED
{ANSWERED}
$END_ANSWERED

$START_FEEDBACK
Evidence of the last failed check (empty = first attempt).
COUNT THE LINES AND CLOSE THEM ALL: F17a — a step without owner/question; F17b — a node that
does not exist and is not new; F17c — a disputed step without a question; F17d — an analogue
function nobody inherited nor explained.
- A line starting with a RULE CODE (F17…) — the artifact's FORM is broken. Fix the named
  element, touch nothing else.
- A line starting with `critic:` — step 11 read this FRD against `TASK.md` and `brd.md`. The form
  is intact; the CONTENT does not add up. THE CODE DECIDES THE REPAIR, and your ROLE names the
  repair of every code. Deleting the named element repairs nothing.
$START_CONTENT
{FEEDBACK}
$END_CONTENT
$END_FEEDBACK

$START_SELFCHECK
Before writing the file, list:

1. Count of use case steps, count of owners, count of questions. owners + questions = steps.
2. Every owner node — present in the candidates table (which row), or `new="yes"`.
3. Every DISPUTED step — has a question naming the tied candidates.
4. The analogue block — every function with a step match is an owner or has a question.

If the list matches — write the file. If it does not — fix the artifact, not the list.
$END_SELFCHECK

$START_OUTPUT
path: TWO files in this pass:
  {STAGING} — the elements YOU add, into the file that already carries the use cases:
    <owner step="UC1/2" node="path from the candidates"/>
    <owner step="UC1/2" node="new/path/Module.java" new="yes" after="blueprint/path/of/pattern"/>
    <question step="UC7/1" subject="…" why="…"/>
  .agent/rtm.md — REWRITE the whole file, one line per requirement of brd.md, in order:
    R1 | owners: src/A.java, src/new/B.java(new, after=blueprint/P.java) | questions: спорный-вопрос
    R2 | owners: src/C.java
    (owners column: every module that carries this requirement — existing path, or new path with
    (new, after=<blueprint pattern>); questions column: open operator questions for this row)
check: {CHECK}
return: call workflow_result according to the OUTPUT_FORMAT of your ROLE
