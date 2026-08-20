$START_TASK  
ADD one `<carried>` row for EVERY line of THE REQUIREMENTS OWED below. Count that list: your file must
gain exactly that many rows, no fewer.  
This is the only thing you add — and you must add it. Nothing else in the file changes.  
$END_TASK

$START_DATA  
$START_DOCUMENT  
THE REQUIREMENTS OWED. Every line below needs one `<carried>` row. The ids are COPIED from here —
do not retype them from the BRD and do not renumber them.  
$END_DOCUMENT  
$START_CONTENT  
{OWED}  
$END_CONTENT  
$END_DATA

$START_CONSTRAINTS  
- THIS PASS WRITES ONE LAYER: `<carried>`. Nothing else is added, nothing else is edited.
  "Nothing else" is not "nothing": a file that comes back without new `<carried>` rows fails every
  requirement at once, and that is the most expensive round this pass can spend.  

- ATTRIBUTE VALUES ARE PLAIN WORDS. No `<`, no `>`, no `&`, no tags inside a value.
  A value carrying `<` is not read at all: the scanner ends the element there and the whole element
  disappears — the check then says it is MISSING, and you are told to write what you already wrote.  

      WRONG   why="R7 needs <code>Parcel.status</code> and nothing provides it"
      RIGHT   why="R7 needs the parcel status field and nothing provides it"

- Carrier is an id that EXISTS in this same file: a use-case id, its step (`UC1/2`), a scenario id, a
  delta node, or an nfr subject. A requirement "covered by meaning" is not carried.  

- A requirement nothing carries is NOT to be papered over with a row pointing at the nearest element.
  Say so as a `<question subject="R7" why="nothing in the artifact carries it"/>` — a false row costs
  more than an honest gap. Expect this step to run again: only pass A can add a carrier, and the
  critic turns your question into a Reject.  

- Walk the list ONE BY ONE, top to bottom. Do not group, do not summarise.  
$END_CONSTRAINTS

$START_PREVIOUS
Non-empty ALWAYS here. `edit` — add your rows to this file.  
  
$START_DOCUMENT  
path: {STAGING}  
THE ARTIFACT AS IT STANDS. Layers already closed: {CLOSED}.  
Everything you may name as a carrier is inside this text.  
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
COUNT THE LINES AND CLOSE THEM ALL IN THIS ANSWER.  
Each line starts with a RULE CODE (F8, F11) and names the requirement or the field.  
$START_CONTENT  
{FEEDBACK}  
$END_CONTENT  
$END_FEEDBACK

$START_SELFCHECK  
Before writing the file, list the answers.  

1. WRITE BOTH NUMBERS DOWN: lines in THE REQUIREMENTS OWED, and `<carried>` rows in your file.
   Equal → good. Your file has FEWER (zero counts) → you have not done this pass at all → F11 on every
   missing one.  

2. Every `<carried by>` value — find it in the artifact by search. Not found → the row is false.  

3. Every `<field in="E">` whose entity E is an existing type of the repository — is E's module named by
   a `<delta node>` or a `<touched path>` in this artifact → F8.  
   It is not, and the field is new → the module that will hold it is missing from the change: say it
   as a `<question>`, do not invent a delta here.  

If the list matches — write the file. If it does not — fix the artifact, not the list.  
$END_SELFCHECK

$START_OUTPUT  
path: {STAGING}  
schema — the element YOU add, into the file that already carries everything else:  
    <carried req="R1" by="UC1/2"/>  
    <question subject="R7" why="…"/>  
check: {CHECK}  
return: call workflow_result according to the OUTPUT_FORMAT of your ROLE
