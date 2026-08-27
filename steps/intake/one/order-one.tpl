$START_TASK
One call, the whole FRD. This task is SMALL (few modules, few requirements), so every decision
of the intake passes is yours in ONE file: the use cases, the owner of every step, the delta
forms, the values and the failure map, and one carried row per requirement.
There are NO closed layers: nothing before you is accepted, nothing is protected — the file is
yours entirely, from the first line to the last.
$END_TASK

$START_DATA
$START_DOCUMENT
path: .agent/brd.md
Measurable business requirement — what is wanted. Every number in it already has a source.
$END_DOCUMENT
$START_CONTENT
{BRD}
$END_CONTENT

$START_DOCUMENT
path: .agent/normalized.md
The request normalized into rows, one per requirement: `verb | object | instrument | values`.
`verb` and `object` build the use cases; column `values` IS the measurement the operator
already decided — quote it word for word and name `source="normalized.md"`.
$END_DOCUMENT
$START_CONTENT
{NORMALIZED}
$END_CONTENT

$START_DOCUMENT
CANDIDATES — computed by script: each use case step × the repository map. The same table
judges your answer (F17). On a first attempt there are no use cases yet, so the table may be
empty: choose owners by the BLUEPRINT, the TYPES table and the map below. `DISPUTED` — the top
scores tie: the choice is the operator's, not yours.
$END_DOCUMENT
$START_CONTENT
{CANDIDATES}
$END_CONTENT

$START_DOCUMENT
THE ANALOGUE BLUEPRINT — the connected core of the analogue's files, with roles and calls.
This is the ARCHITECTURE your new modules mirror: a new type here has the same layering the
blueprint shows (model, store interface, REST interface, implementations). A module that only
appears as a pattern is not an owner.
$END_DOCUMENT
$START_CONTENT
{BLUEPRINT}
$END_CONTENT

$START_DOCUMENT
TYPES THE REPOSITORY DECLARES — name · path · kind. A type name is copied, not invented.
$END_DOCUMENT
$START_CONTENT
{TYPES}
$END_CONTENT

$START_DOCUMENT
THE ANALOGUE — functions, not structure. A function the analogue already performs must be
inherited by an owner IN ITS OWN HOME, or explained by a question. A new module for a function
the repository already has is the most expensive mistake of this order.
$END_DOCUMENT
$START_CONTENT
{ANALOGUE}
$END_CONTENT

$START_DOCUMENT
THE REQUIREMENTS OWED. Every line below needs one `<carried>` row. The ids are COPIED from
here — do not retype them from the BRD and do not renumber them.
$END_DOCUMENT
$START_CONTENT
{OWED}
$END_CONTENT

$START_DOCUMENT
path: .agent/answers.md
Accumulated answers from the operator. The VALUE of an answer is a legal source of a number,
and every answer must be SPENT in the artifact.
$END_DOCUMENT
$START_CONTENT
{ANSWERS}
$END_CONTENT
$END_DATA

$START_CONSTRAINTS
- THIS ORDER WRITES THE WHOLE FILE — every element of the grammar below is yours: `<actor>`,
  `<usecase>` with `<pre>`, `<post>`, `<step>`, `<ext>`, then `<owner>` / `<question>`,
  `<delta>`, `<scenario>`, `<touched>`, `<field>`, `<failure>` / `<failures>`, `<nfr>`,
  `<carried>`. Do not hold a layer back for a "later pass" — there is no later pass; an
  element you omit is missing for good, and the full court judges the whole file at once.

- USE CASES: one external input → one `<usecase>`; one alternative / failing branch → one
  `<ext>`. Branch `outcome` is the negation of its use case's `<post>`, worded from the
  actor's perspective; two ends of different use cases must not carry identical text (F6c).

- OWNERS: every step gets EXACTLY ONE of an `<owner step="UC1/2" node="path"/>`, an owner
  with `new="yes"`, or a `<question step="UC1/2" subject="…" why="…"/>`. `node` is copied from
  the candidates, the TYPES table or the map verbatim; a path that exists is never `new="yes"`.
  A `DISPUTED` step without a `<question>` is a refusal (F17c).

- DELTAS: `Added` — the contract only GREW; `new="yes"` says the FILE itself is created by
  this change, and only such a node may be absent from the map. `Changed` — an existing call
  behaves differently, `from`/`to` say how it moved; `Fixed` is wrong→right and also carries
  both ends; `Removed` — a contract disappears. `op` is the entry point the delta shifts, as
  the map spells it; a `new="yes"` module's op is the external point it will create, in the
  requirement's words. `Unknown` requires a `why` and stops the pipeline — the last resort.

- SCENARIOS: every `<usecase>` gets its own `<scenario uc="…">`; `before` and `after` must
  differ; `nodes` lists the paths the case runs through; every delta node appears in the
  nodes of at least one scenario (F3c). `<touched>` is ONLY for a node that changes and
  carries NO delta — a page, a template, a build script — and needs a `why`.

- VALUES AND FAILURES: every quantity (range, enum, format, limit) carries a `source`, and
  source is one of: {SOURCES}. One error code of an `<ext>` → one `<failure>` line whose
  `from` lists ALL branches of that code. The change may genuinely have no failure modes —
  then `<failures found="no" why="…"/>`; one of the two variants is mandatory.

- CARRIED: one `<carried req="R1" by="UC1/2"/>` row per line of THE REQUIREMENTS OWED, no
  fewer. Carrier is an id that EXISTS in this same file. A requirement nothing carries is a
  `<question>`, not a row pointing at the nearest element.

- TWO-FILTER QUESTION TRIAGE — a question must DIE at one of the filters before it reaches
  the operator: (1) can the map, the TYPES table or the blueprint answer it? → answer it
  yourself from the order, it is not a question; (2) is there a defensible default? → ADOPT
  it and RECORD it in .agent/assumptions.md, one line per adoption:
      assumption: <what was unclear> | default: <what you chose> | rationale: <why defensible> | reversible: yes/no
  Only what survives both filters is a question: a decision the OWNER must make — a trade-off,
  an irreversible choice, a policy the requirement does not settle. Every question names its
  candidates and a recommended answer. All questions go in ONE batch.

- ATTRIBUTE VALUES ARE PLAIN WORDS. No `<`, no `>`, no `&`, no tags inside a value.
  A value carrying `<` is not read at all: the scanner ends the element there and the whole
  element disappears — the check then says it is MISSING, and you are told to write what you
  already wrote.

      WRONG   outcome="the placeholder {{parcel.<field>}} is left unresolved"
      RIGHT   outcome="the placeholder is left unresolved"
$END_CONSTRAINTS

$START_PREVIOUS
Empty means NOTHING IS WRITTEN YET — first attempt. Then `write`.
Non-empty means your own artifact came back with questions answered (or blockers): `edit` it
where FEEDBACK names, keep the rest.

$START_DOCUMENT
path: {STAGING}
YOUR OWN ARTIFACT as it stands on disk right now.
WHY it came back is in FEEDBACK, and only there. Do not hunt this text for a fault nobody
reported. Layers already closed: {CLOSED}.
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
THE FULL COURT RAN ON THE WHOLE FILE: COUNT THE LINES AND CLOSE THEM ALL IN THIS ANSWER.
Each line starts with a RULE CODE (F1…F19) and names the element — fix exactly the named rule
and element, touch nothing else.
- A line starting with `critic:` — step 11 read this FRD against `TASK.md` and `brd.md`. The
  form is intact; the CONTENT does not add up. THE CODE DECIDES THE REPAIR, and your ROLE
  names the repair of every code. Deleting the named element repairs nothing.
$START_CONTENT
{FEEDBACK}
$END_CONTENT
$END_FEEDBACK

$START_SELFCHECK
Before writing the file, list the answers. An answer is a number, a list of ids, or a table.
"Yes" is not an answer.

1. IDs of all `<usecase>` — as a list. Against each: its `actor`, its `<post>`, the count of
   its `<step>`. An empty cell anywhere → F1. Every usecase id also has a `<scenario uc>` → F4b.

2. Count of use case steps, count of owners, count of questions. owners + questions = steps →
   F17a. Every owner node — present in the candidates / TYPES / map (which row), or
   `new="yes"` → F17b.

3. Every delta — form ∈ Added · Changed · Removed · Fixed · Unknown; `new="yes"` only for
   files absent from the map; `Changed`/`Fixed` carry differing `from`/`to`. Every delta node
   appears in the `nodes` of some scenario → F3c.

4. Every number in `domain` and in `fit` — as a table: value · the file it occurs in. A value
   you cannot place in one of {SOURCES} → it is a `<question>`, not a value → F5. Every
   `<ext>` code has its `<failure>` line and stands in its `from` → F6/F6d.

5. WRITE BOTH NUMBERS DOWN: lines in THE REQUIREMENTS OWED, and `<carried>` rows in your
   file. Equal → good → F11. Every `<carried by>` value — find it in the artifact by search.

If the list matches — write the file. If it does not — fix the artifact, not the list.
$END_SELFCHECK

$START_OUTPUT
path: {STAGING}
schema — the WHOLE file is yours, write it in this order:
  <frd grammar="1" goal="one phrase">
    <actor name="…" kind="human|system" via="interface on this boundary"/>
    <usecase id="UC1" actor="…" goal="…">
      <pre>…</pre>
      <post>success guarantee</post>
      <step n="1">…</step>
      <ext id="1a" error="CODE" outcome="…"/>
    </usecase>
    <owner step="UC1/1" node="path from the candidates or the map"/>
    <owner step="UC1/2" node="new/path/Module.java" new="yes" after="blueprint/path/of/pattern"/>
    <question step="UC1/3" subject="…" why="…"/>
    <delta op="operation" form="Added|Changed|Removed|Fixed|Unknown" node="path" from="…" to="…"/>
    <scenario id="S1" uc="UC1" before="…" after="…" nodes="path path"/>
    <touched path="path from the map" why="what changes inside it"/>
    <field name="…" in="operation or entity" type="…" domain="range | enum | format" required="yes|no" error="CODE" source="…"/>
    <failure code="CODE" status="real code — «0» is a stub the judge refuses" client="…" operator="…" from="UC1/1a"/>
    <failures found="no" why="…"/>
    <nfr subject="…" fit="…" source="…"/>
    <carried req="R1" by="UC1/2"/>
  </frd>
check: {CHECK}
return: call workflow_result according to the OUTPUT_FORMAT of your ROLE
