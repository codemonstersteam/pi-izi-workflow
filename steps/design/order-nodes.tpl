$START_TASK
Project the decided change onto its MODULES: every node the change touches or the data passes
through, with the contract it speaks — in the NAMES of the dictionary below. No routes: this file
carries no time at all.
$END_TASK

$START_DATA
$START_DOCUMENT
path: .agent/values.xml
the DICTIONARY — every value this change exchanges, declared once, already accepted by its own
guardrail. A contract names a value by its `id`; the text is substituted by a script later. The
dictionary is CLOSED to you: an id that is not here blocks the check, and adding a row is not among
your outputs
$END_DOCUMENT
$START_CONTENT
{VALUES}
$END_CONTENT
$START_DOCUMENT
path: .agent/frd.xml
the delta, its scenarios and its touched nodes — what must change
$END_DOCUMENT
$START_CONTENT
{FRD}
$END_CONTENT
$START_DOCUMENT
path: .agent/ripple.xml
the subgraph reachable from the touched nodes — what exists, with its `<api>` and `<decl>` but
WITHOUT contracts: the contract of a node you copy is derived from those and named with the ids
above. The full application graph is not here and is not needed: a node outside this subgraph is
outside this change, unless you are adding it
$END_DOCUMENT
$START_CONTENT
{RIPPLE}
$END_CONTENT
$START_DOCUMENT
path: .agent/answers.md
what the operator has already answered in this run — the VALUE of an answer, not the wording of its
question. A contract you asked about and got an answer for is settled: do not ask again
$END_DOCUMENT
$START_CONTENT
{ANSWERS}
$END_CONTENT
$END_DATA

$START_CONSTRAINTS
- weight of the change: {MODE} — goes into `mode` of the root element
- vocabulary of `delta`: {DELTA_FORMS} — the same word step 6 used for that node, never a synonym
- `in` and `out` carry IDS of the dictionary, separated by ` | `, never the text of a value
- every node the change touches is here with a `delta`; every node the data passes through is here
  too, copied from the subgraph WITHOUT `delta`
- every `<dep path>` names a `<module>` of this same file
- the value that carries an FRD failure code stands in the `out` of the node that hands it out
- not one `<route>`, `entry` or step list: the routes are written by another pass over this file,
  once it is frozen
$END_CONSTRAINTS

$START_FEEDBACK
Evidence from the last red check, if this is a redelegation. Empty means the first attempt. Each
blocker names the node to repair — repair exactly what it names, first.
$START_CONTENT
{FEEDBACK}
$END_CONTENT
$END_FEEDBACK

$START_OUTPUT
path: {STAGING}
schema:
  <design mode="{MODE}" base=".agent/appgraph.xml">
    <module path="…" delta="…">
      <role>…</role>
      <contract in="v3 | v10" out="v5 | v9"/>
      <dep path="…"/>
    </module>
  </design>
check: {CHECK}
return: call workflow_result — the shape and the choice of rail are declared by your ROLE's
OUTPUT_FORMAT
$END_OUTPUT
