$START_TASK  
Turn the requirement into use cases.  
Do not reason about the repository: it is not in this order, and no file of it is shown to you.  
$END_TASK

$START_DATA  
$START_DOCUMENT  
path: .agent/brd.md  
Measurable business requirement — what is wanted.  
Every number in it already has a source.  
$END_DOCUMENT  
$START_CONTENT  
{BRD}  
$END_CONTENT  

$START_DOCUMENT  
path: .agent/normalized.md  
The request normalized into rows, one per requirement: `verb | object | instrument | values`.  
`verb` and `object` are what a use case is made of — the action and the thing it acts on.  
Leave `values` alone here: numbers, formats and limits are written by a later pass.  
$END_DOCUMENT  
$START_CONTENT  
{NORMALIZED}  
$END_CONTENT  

$START_DOCUMENT  
path: .agent/answers.md  
Accumulated answers from the operator to your previous questions.  
$END_DOCUMENT  
$START_CONTENT  
{ANSWERS}  
$END_CONTENT  
$END_DATA

$START_CONSTRAINTS  
- THIS PASS WRITES ONE LAYER: `<actor>`, `<usecase>` with `<pre>`, `<post>`, `<step>`, `<ext>`, and
  `<question>`. Nothing else. No `<delta>`, no `<scenario>`, no `<touched>`, no `<field>`, no
  `<failure>`, no `<nfr>`, no `<carried>` — the passes after this one write them, against data you do
  not have here.  

- ATTRIBUTE VALUES ARE PLAIN WORDS. No `<`, no `>`, no `&`, no tags inside a value.
  A value carrying `<` is not read at all: the scanner ends the element there and the whole element
  disappears — the check then says it is MISSING, and you are told to write what you already wrote.  

      WRONG   outcome="the placeholder {{parcel.<field>}} is left unresolved"
      RIGHT   outcome="the placeholder is left unresolved"

- One external input → one `<usecase>`.  
  One alternative / failing branch → one `<ext>`.  

- Branch `outcome` is the negation of the `<post>` of its use case, worded from the actor's perspective.  
  Two ends must not carry identical text — not two branches, and not two use cases.  

- `<ext error="CODE">` names the code only when the requirement or the operator named it. Otherwise
  write `error="none"`: the code is a VALUE, the values pass names it later, and it is allowed to
  change `none` to a code on your branch. Leaving `none` costs nothing; inventing a code costs a
  round.  

- All gaps that block this layer must be asked in a SINGLE BATCH. Nothing else.  
  A gap the BRD and the answers do not settle is ASKED, not filed — one batch, this pass.  
  AND NEVER WALKED AROUND: a use case written with only its successful course, because the failing
  one was unclear, hides the gap from everyone downstream. The gap is the question.  
  Write `<question>` only when FEEDBACK says the operator rounds are spent: a filed question is a
  Reject at step 11 and this whole step runs again.  
  Ask about the REQUIREMENT — who enters, what counts as success, whether the case exists at all.  
  Do not ask where a class lives: that question belongs to the next pass, which will have the map.  
$END_CONSTRAINTS

$START_PREVIOUS
Empty here means NOTHING IS WRITTEN YET — first attempt. Then `write`.  
Non-empty means your own artifact: `edit` it in the places FEEDBACK names, and leave the rest alone.  
  
$START_DOCUMENT  
path: {STAGING}  
YOUR OWN ARTIFACT as it stands on disk right now.  
WHY it came back is in FEEDBACK, and only there. Do not hunt this text for a fault nobody reported.  
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
COUNT THE LINES AND CLOSE THEM ALL IN THIS ANSWER. The check runs on the WHOLE file.  
Each line starts with a RULE CODE (F1, F6c). Fix exactly the named rule and element, touch nothing else.  
- A line starting with `critic:` — step 11 read this FRD against `TASK.md` and `brd.md`. The form is
  intact; the CONTENT does not add up. THE CODE DECIDES THE REPAIR, and your ROLE names the repair of
  every code. Deleting the named element repairs nothing.  
$START_CONTENT  
{FEEDBACK}  
$END_CONTENT  
$END_FEEDBACK

$START_SELFCHECK  
Before writing the file, list the answers. An answer is a number, a list of ids, or a table. "Yes" is not an answer.  

1. IDs of all `<usecase>` — as a list. Against each: its `actor`, its `<post>`, the count of its
   `<step>`. An empty cell anywhere → F1.  

2. Ends of all use cases — as a table: `UC<id>/post` and `UC<id>/<branch id>` · their text.  
   Two ends of different use cases with identical text → F6c.  

If the list matches — write the file. If it does not — fix the artifact, not the list.  
$END_SELFCHECK

$START_OUTPUT  
path: {STAGING}  
schema:  
  <frd grammar="1" goal="one phrase">  
    <actor name="…" kind="human|system" via="interface on this boundary"/>  
    <usecase id="UC1" actor="…" goal="…">  
      <pre>…</pre>  
      <post>success guarantee</post>  
      <step n="1">…</step>  
      <ext id="1a" error="CODE" outcome="…"/>  
      <ext id="1b" error="none" outcome="…"/>  
    </usecase>  
    <question subject="…" why="…"/>  
  </frd>  
check: {CHECK}  
return: call workflow_result according to the OUTPUT_FORMAT of your ROLE
