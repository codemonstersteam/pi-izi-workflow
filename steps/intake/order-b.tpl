$START_TASK  
Name the files this change touches, for every use case already written.  
Do not touch the requirement: the use cases below are closed — a check already accepted them.  
$END_TASK

$START_DATA  
$START_DOCUMENT  
path: .agent/appgraph.xml  
As-is repository map — what currently exists.  
`path` of `<module>` is the NODE KEY. This is the only kind of path you may write.  
`<api>` — what the repository exposes externally.  
`<suite>` / `<test>` — how it is verified.  
`<systems>` — what it talks to.  
`found="no"` means the repository gave no answer on this point.  
$END_DOCUMENT  
$START_CONTENT  
{MAP}  
$END_CONTENT  

$START_DOCUMENT  
path: .agent/graph-computed.xml — the types this repository already declares  
Every capitalized name of the BRD, the task and the answers that EXISTS in this repository,  
resolved by SCRIPT over ALL its files: `name · path · kind · what it declares`.  
The map above is the swarm's, and the swarm read only the cells of the focus — this table is the rest  
of the repository, and its paths are facts.  
NEVER ask the operator where one of these types lives: the answer is already in front of you.  
A name that is ABSENT from this table is absent from the repository — either this change creates it,  
or the operator is the only one who can say where it is. That question is legal; the other one is not.  
$END_DOCUMENT  
$START_CONTENT  
{TYPES}  
$END_CONTENT  

$START_DOCUMENT  
SUBJECTS OF THE REQUIREMENT WHOSE MODULES WERE NOT READ. The map does not describe them: the survey
never opened those files, so it carries no contract, no io, no purpose for them. Their PATH you may
still have — ask for it (`track:"err", kind:"lookup"`, the names in `items`). Anything BEYOND the path
you do not know: do not invent an operation and do not invent its contract.  
$END_DOCUMENT  
$START_CONTENT  
{UNCOVERED}  
$END_CONTENT  
$END_DATA

$START_CONSTRAINTS  
- THIS PASS WRITES ONE LAYER: `<delta>`, `<scenario>`, `<touched>`.  
  Do not add or edit `<usecase>`, `<actor>`, `<pre>`, `<post>`, `<step>`, `<ext>` — that layer is
  closed. Do not write `<field>`, `<failure>`, `<nfr>`, `<carried>` — later passes write them.  

- ATTRIBUTE VALUES ARE PLAIN WORDS. No `<`, no `>`, no `&`, no tags of any kind inside a value.
  A value carrying `<` is not read at all: the scanner ends the element there, and the whole element
  disappears — the check then says the element is MISSING, and you will be told to write what you
  already wrote.  

      WRONG   before="no substitution; <code>{{parcel.<field>}}</code> stays unresolved"
      RIGHT   before="no substitution; the placeholder stays unresolved"

  Name a code fragment in words. If you must show one, write it without angle brackets:
  `{{parcel.FIELD}}`.  

- Delta form must be exactly one of: {DELTA_FORMS}. No other forms exist.  

- `node` is a path that EXISTS: a `path` of the map, or a path from the type table above.  
  A file this change CREATES carries `new="yes"` and no other spelling of newness exists.  
  Do not remember a path. Copy it, or ask for it with a `lookup`.  

- Every `<usecase>` gets its own `<scenario uc="…">`. A scenario is attached to a use case, never to a
  delta. Its `before` and `after` must differ, and its `nodes` list the paths the case runs through.  

- Every `<delta node>` is named in the `nodes` of at least one scenario. If no scenario runs through
  it, the delta has no use case — either the case is missing, or the delta is.  

- `<touched>` is ONLY for a node that changes and carries NO delta: a page, a template, a build
  script — anything with no contract to shift. It needs a `why`: what changes inside it.  
  A node already named in a `<delta>` must NOT be repeated as `<touched>`.  

- A question to the operator here is about the WORK, not about the requirement: which module carries
  it, extend an existing type or create a new one. Ask in a SINGLE BATCH.  
$END_CONSTRAINTS

$START_PREVIOUS
Non-empty ALWAYS here: the previous pass wrote the use cases. `edit` — add your layer to this file.  
Writing it from scratch throws away a layer a check already accepted.  
  
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
Evidence of the last failed check (empty = first attempt at this layer).  
COUNT THE LINES AND CLOSE THEM ALL IN THIS ANSWER. The check runs on the WHOLE file.  

- A line starting with a RULE CODE (F2, F3, F4…) — the artifact's FORM is broken. Fix the named
  element, touch nothing else.  
- A line starting with `lookup:` — this is an ANSWER to your question, not a defect. Nobody
  complained. Use the paths it gives.  
- A line starting with `critic:` — step 11 read this FRD against `TASK.md` and `brd.md`. The form is
  intact; the CONTENT does not add up. THE CODE DECIDES THE REPAIR, and your ROLE names the repair of
  every code. Deleting the named element repairs nothing.  
$START_CONTENT  
{FEEDBACK}  
$END_CONTENT  
$END_FEEDBACK

$START_SELFCHECK  
Before writing the file, list the answers. An answer is a number, a list of ids, or a table.  

1. Count of `<delta>` and count of `<touched>`. Zero deltas → F7.  

2. Every `<delta node>` — as a table: `node` · found in the map / found in the type table / `new="yes"`.  
   A path found in neither and not declared new → F3.  
   A path of a TEST → F3: a test is the `<dod>` of a change, not the change.  
   `Changed` or `Fixed` with equal or missing `from`/`to` → F3b.  

3. Every `<delta node>` — which scenario names it in `nodes` → F3c.  

4. Every `<usecase id>` — its `<scenario uc="this id">` → F4b.  
   A scenario with empty or equal `before`/`after`, or with an empty `nodes` → F4.  

5. Every `<touched path>` — exists in the map, is not a test, is not already a delta node, has a
   non-empty `why` → F2, F2b, F2c.  

5a. THE SUBJECTS of the requirement — as a list, and against each: does ANY module of your change sit
   in that subject's own package? A subject the repository already has a package for, with no module
   of yours in it, is work nobody will do → F14.
   Not every subject is work: one you must not touch gets a `<question>` saying why, not silence.  

6. Every `<usecase>` that enters by a different path than its neighbour for the same actor has its own
   `via`, and the nodes of its scenario own that channel → F10.  

If the list matches — write the file. If it does not — fix the artifact, not the list.  
$END_SELFCHECK

$START_OUTPUT  
path: {STAGING}  
schema — the elements YOU add, into the file that already carries the use cases:  
    <delta op="operation" form="…" node="path from the map" from="…" to="…"/>  
    <delta op="operation" form="…" node="path" new="yes" from="нет" to="…"/>  
    <delta op="operation" form="Unknown" why="why classification failed"/>  
    <scenario id="S1" uc="UC1" before="…" after="…" nodes="path path"/>  
    <touched path="path from the map" why="what changes in this node"/>  
    <question subject="…" why="…"/>  
check: {CHECK}  
return: call workflow_result according to the OUTPUT_FORMAT of your ROLE
