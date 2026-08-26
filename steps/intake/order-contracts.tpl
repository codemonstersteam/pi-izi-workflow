$START_TASK
Two decisions on the OWNED nodes: give each its delta FORM (what happens to its contract),
and weave each use case through the nodes it runs (scenario). Owners are closed — no re-choosing.
$END_TASK

$START_DATA
$START_DOCUMENT
OWNERS — confirmed by the previous pass, one row per step. This is the WHOLE of your work
surface: a delta on a node outside this table is refused (F17e).
$END_DOCUMENT
$START_CONTENT
{OWNERS}
$END_CONTENT

$START_DOCUMENT
THE OWNED MODULES OF THE MAP — role and api of each node you classify. The map is the judge
of existence: what is here EXISTS, what is absent does not.
$END_DOCUMENT
$START_CONTENT
{MAPSLICE}
$END_CONTENT
$END_DATA

$START_CONSTRAINTS
- THIS PASS WRITES ONE ELEMENT: `<delta>`. Do not touch owners, use cases or questions.
- One `<delta>` per owned node minimum (a node may carry several operations — several deltas).
- `Added` — the contract only GREW: existing callers behave as before (a new operation on an
  EXISTING file is `Added` too); `new="yes"` says the FILE itself is created by this change,
  and only a `new="yes"` node may be absent from the map.
- `Changed` — an existing call behaves differently; `from`/`to` say how it moved.
- `op` is the entry point the delta shifts, as the map spells it; a `new="yes"` module's op is
  the external point it will create — in the requirement's words.
- ATTRIBUTE VALUES ARE PLAIN WORDS: no `<`, no `>`, no `&` inside a value.

      WRONG   before="нет подстановки; <code>{{glossary.term}}</code> не разрешён"
      RIGHT   before="нет подстановки; плейсхолдер не разрешён"

  Name a code fragment in words. If you must show one, write it without angle brackets.
- THIS PASS WRITES TWO ELEMENTS: `<scenario>` and `<touched>`. Nothing else is yours.
- Every `<usecase>` gets its own `<scenario uc="…">`. Its `before` and `after` must differ —
  the change must be visible in them. `nodes` lists the paths the case runs through; every
  delta node appears in the nodes of at least one scenario (F3c).
- `<touched>` is ONLY for a node that changes and carries NO delta: a page, a template, a build
  script. It needs a `why`. A node already named in a `<delta>` must NOT repeat as touched.
- A use case entering by a different path than its neighbour for the same actor has its own
  `via`, and the nodes of its scenario own that channel (F10).
- ATTRIBUTE VALUES ARE PLAIN WORDS: no `<`, no `>`, no `&` inside a value.

      WRONG   before="нет карточки; <code>{{glossary.term}}</code> не разрешён"
      RIGHT   before="нет карточки; плейсхолдер не разрешён"

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
F3 family: a form outside the vocabulary; `new="yes"` on a file that exists; a node absent
from the map without `new="yes"`; `Changed`/`Fixed` with missing from/to. F17e: a delta on a
node B1 never chose. F7: not a single delta.
- A line starting with `critic:` — step 11 read this FRD against `TASK.md` and `brd.md`. The form
  is intact; the CONTENT does not add up. THE CODE DECIDES THE REPAIR, and your ROLE names the
  repair of every code. Deleting the named element repairs nothing.
$START_CONTENT
{FEEDBACK}
$END_CONTENT
$END_FEEDBACK

$START_SELFCHECK
Before writing the file, list:

1. Count of owned nodes, count of nodes with at least one delta. Equal.
2. Every delta node — present in the owners table (which row).
3. Every delta — form ∈ {DELTA_FORMS}; `new="yes"` only for files absent from the map;
   `Changed`/`Fixed` carry from/to.
4. `op` for a `new="yes"` node — the external point it creates, in the requirement's words.

If the list matches — write the file. If it does not — fix the artifact, not the list.
$END_SELFCHECK

$START_OUTPUT
path: {STAGING}
schema — the elements YOU add, into the file that already carries the owners:
    <delta op="operation" form="…" node="owned path" from="…" to="…"/>
    <delta op="operation" form="Added" node="new path" new="yes" from="нет" to="…"/>
    <scenario id="S1" uc="UC1" before="…" after="…" nodes="path path"/>
    <touched path="path from the map" why="what changes inside it"/>
check: {CHECK}
return: call workflow_result according to the OUTPUT_FORMAT of your ROLE
