$START_TASK
Fry the BRD against the repository's map: return the functional requirements and the delta of the
contract, expressed over nodes of that map.
$END_TASK

$START_DATA
$START_DOCUMENT
path: .agent/brd.md
the measurable business requirement — what is wanted; every number in it already has a source
$END_DOCUMENT
$START_CONTENT
{BRD}
$END_CONTENT
$START_DOCUMENT
path: .agent/answers.md
operator answers to your earlier questions, accumulated
$END_DOCUMENT
$START_CONTENT
{ANSWERS}
$END_CONTENT
$START_DOCUMENT
path: .agent/appgraph.xml
the map of the repository as it is today — what exists. `path` on a `<module>` is the NODE KEY: the
only kind of path you may write. `<api>` is what the repository exposes, `<suite>`/`<test>` how it is
checked, `<systems>` what it talks to. `found="no"` means the repository did not answer that question
$END_DOCUMENT
$START_CONTENT
{MAP}
$END_CONTENT
$END_DATA

$START_CONSTRAINTS
- questions left in this run: {QUESTIONS_LEFT}. Ask every gap you have IN ONE BATCH, not one per
  exchange: each exchange costs a full re-read of the BRD and of the map
- a delta's form is one of: {DELTA_FORMS} — nothing else is a form
- a quantity (range, enum, format, limit) carries `source`, and it is one of: {SOURCES}
- one external input — one `<usecase>`; one alternate or failing branch — one `<ext>`; one `<ext>`
  code — one `<failure>` row, in both directions
- a `<scenario>` states what happens before the change and what happens after, and the two differ
$END_CONSTRAINTS

$START_FEEDBACK
Evidence from the last red check on the staging file, if this is a redelegation. Empty means this is
the first attempt — nothing to fix yet. Non-empty: repair EXACTLY the rule and the element it names,
before anything else. A question about something else leaves the blocker where it is.
$START_CONTENT
{FEEDBACK}
$END_CONTENT
$END_FEEDBACK

$START_OUTPUT
path: {STAGING}
schema:
  <frd grammar="1" goal="one phrase">
    <actor name="…" kind="human|system" via="the interface at this boundary"/>
    <usecase id="UC1" actor="…" goal="…">
      <pre>…</pre>
      <post>the success guarantee</post>
      <step n="1">…</step>
      <ext id="1a" error="CODE" outcome="…"/>
    </usecase>
    <field name="…" in="the operation or entity" type="…" domain="range | enum | format"
           required="yes|no" error="CODE" source="…"/>
    <failure code="CODE" status="…" client="…" operator="…" from="UC1/1a"/>
    <failures found="no" why="…"/>   <!-- instead of the <failure> rows when the change has no failure
                                          modes at all; one of the two is mandatory -->

    <delta op="the operation" form="…" node="path from the map" from="…" to="…"/>
    <delta op="the operation" form="Unknown" why="why it could not be classified"/>
    <scenario id="S1" uc="UC1" before="…" after="…" nodes="path path"/>
    <touched path="path from the map" why="what changes in this node"/>
    <nfr subject="…" fit="…" source="…"/>
    <question subject="…" why="…"/>
  </frd>
check: {CHECK}
return: call workflow_result — the shape and the choice of rail are declared by your ROLE's
OUTPUT_FORMAT
$END_OUTPUT
