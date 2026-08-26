$START_TASK  
Put the values on the change: fields, their domains, the failure map.  
Every number comes from a file below and names it. Do not touch the layers already written.  
$END_TASK

$START_DATA  
$START_DOCUMENT  
path: .agent/brd.md  
Measurable business requirement. Every number in it already has a source.  
$END_DOCUMENT  
$START_CONTENT  
{BRD}  
$END_CONTENT  

$START_DOCUMENT  
path: .agent/normalized.md  
The request normalized into rows, one per requirement: `verb | object | instrument | values`.  
Column `values` IS the measurement the operator already decided. Quote it into `fit` and `domain`
WORD FOR WORD as it stands in the row, and write `source="normalized.md"`.  
A value standing in that column is never a question: asking it re-asks what is already answered.  

    ROW     export | Glossary | agent ZIP archive | as {id}.glossary.json plus {id}.descriptor.json
    VALUE   fit="agent ZIP export carries {id}.glossary.json plus {id}.descriptor.json" source="normalized.md"
$END_DOCUMENT  
$START_CONTENT  
{NORMALIZED}  
$END_CONTENT  

$START_DOCUMENT  
path: .agent/answers.md  
Accumulated answers from the operator. The VALUE of an answer is a legal source of a number.  
$END_DOCUMENT  
$START_CONTENT  
{ANSWERS}  
$END_CONTENT  
$END_DATA

$START_CONSTRAINTS  
- THIS PASS WRITES ONE LAYER: `<field>`, `<failure>` / `<failures>`, `<nfr>`.  
  Do not add or edit use cases, deltas, scenarios or touched — those layers are closed.  
  Do not write `<carried>` — the last pass writes it.  

- ONE EXCEPTION, AND IT IS PART OF YOUR LAYER: the `error` attribute of an existing `<ext>`.  
  A CODE IS A VALUE, and values are this pass's work — the pass that wrote the branches had no
  vocabulary to name one and left `error="none"`.  
  You may CHANGE `error="none"` to a code on a branch that is a failure. You may not add a branch,
  remove one, reorder them, or touch its `outcome`, its `id`, or anything else of a use case.  
  A branch that is NOT a failure — an alternative course that succeeds — keeps `error="none"`.  


- TWO-FILTER QUESTION TRIAGE — a question must DIE at one of the filters before it reaches
  the operator: (1) can the map, the TYPES table or the blueprint answer it? → answer it
  yourself from the order, it is not a question; (2) is there a defensible default? → ADOPT
  it and RECORD it in .agent/assumptions.md, one line per adoption:
      assumption: <what was unclear> | default: <what you chose> | rationale: <why defensible> | reversible: yes/no
  Only what survives both filters is a question: a decision the OWNER must make — a trade-off,
  an irreversible choice, a policy the requirement does not settle. Every question names its
  candidates and a recommended answer.
- ATTRIBUTE VALUES ARE PLAIN WORDS. No `<`, no `>`, no `&`, no tags inside a value.
  A value carrying `<` is not read at all: the scanner ends the element there and the whole element
  disappears — the check then says it is MISSING, and you are told to write what you already wrote.  

      WRONG   type="array<Term>"     domain="map<string,string>"
      RIGHT   type="array of Term"    domain="map of string to string"

- Every quantity (range, enum, format, limit) carries a `source`.  
  Source is one of: {SOURCES}. Source = the file that CONTAINS the value.  
  Naming a format instead of its concrete measurements is forbidden.  
  A quantity you cannot point to in one of these files → ASK the operator, in one batch.  
  `<question>` only when FEEDBACK says the rounds are spent — never a source "from memory", and never
  a filed question while a pause is still available: step 11 turns it into a Reject.  

- One error code `<ext>` → one `<failure>` line, and its `from` lists ALL branches of that code:  
  `from="UC1/1a UC2/2a"`.  

- The change may genuinely have no failure modes. Then write `<failures found="no" why="…"/>`.  
  One of the two variants is mandatory: an empty failure map is not an answer.  

- `<field in="…">` names the operation or the ENTITY the field belongs to. If that entity is an
  existing type of this repository, the change must already carry its module — look at the deltas
  written by the previous pass. If it does not, the field belongs to no module, and that is a
  `<question>`, not a value.  

- A question here is about a VALUE: a limit, a code, a format nobody named. Ask in a SINGLE BATCH.  
$END_CONSTRAINTS

$START_PREVIOUS
Non-empty ALWAYS here. `edit` — add your layer to this file.  
  
$START_DOCUMENT  
path: {STAGING}  
THE ARTIFACT AS IT STANDS. Layers already closed: {CLOSED}.  
The `<ext>` branches below are what your failure map must cover. A branch already carrying a code
keeps it — do not rename it. A failing branch carrying `error="none"` is waiting for YOU to name its
code: nobody before you could.  
$END_DOCUMENT  
$START_CONTENT  
{PREVIOUS}  
$END_CONTENT  
$END_PREVIOUS

$START_ANSWERED  
{ANSWERED}  
$END_ANSWERED

$START_FEEDBACK  
Evidence of the last failed check (empty = first attempt at this layer).  
COUNT THE LINES AND CLOSE THEM ALL IN THIS ANSWER. Each line starts with a RULE CODE (F5, F6, F6d).  
- A line starting with `critic:` — step 11 read this FRD against `TASK.md` and `brd.md`. The form is
  intact; the CONTENT does not add up. THE CODE DECIDES THE REPAIR, and your ROLE names the repair of
  every code. Deleting the named element repairs nothing.  
$START_CONTENT  
{FEEDBACK}  
$END_CONTENT  
$END_FEEDBACK

$START_SELFCHECK  
Before writing the file, list the answers. An answer is a number, a list of ids, or a table.  

1. Every number in `domain` and in `fit` — as a table: value · the file it occurs in.  
   A value you cannot place in one of {SOURCES} → it is a `<question>`, not a value → F5.  

2. Every `<ext>` in the artifact — as a table: `UC<id>/<branch id>` · its `outcome` · its `error`.  
   A branch whose outcome is a FAILURE and whose `error` is still `none` → give it a code NOW: it is
   your layer, and the failure map cannot cover a branch that names none.  
   Against each code: its `<failure code>` line → F6.  
   A branch whose code is not listed in the `from` of that code’s failure line → F6d.  
   A `<failure>` code met by no `<ext>` → F6.  

3. If there is no `<failure>` line at all — is `<failures found="no" why="…"/>` written → F6.  

If the list matches — write the file. If it does not — fix the artifact, not the list.  
$END_SELFCHECK

$START_OUTPUT  
path: {STAGING}  
schema — the elements YOU add, into the file that already carries use cases, deltas and scenarios:  
    <field name="…" in="operation or entity" type="…" domain="range | enum | format"  
           required="yes|no" error="CODE" source="…"/>  
    <failure code="CODE" status="real code from the requirement or repository — «0» is a stub the judge refuses" client="…" operator="…" from="UC1/1a UC2/2a"/>  
    <failures found="no" why="…"/>  
    <nfr subject="…" fit="…" source="…"/>  
    <question subject="…" why="…"/>  
check: {CHECK}  
return: call workflow_result according to the OUTPUT_FORMAT of your ROLE
