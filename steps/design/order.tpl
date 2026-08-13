$START_TASK
Design the decided change as two aligned projections: the modules it touches with their contracts,
and one route per BRANCH of every FRD scenario.
$END_TASK

$START_DATA
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
WITHOUT contracts: the contract of a node you copy is derived from those, not copied. The full
application graph is not here and is not needed: a node outside this subgraph is outside this
change, unless you are adding it
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
- a route step names the node and the NUMBER of its `out` alternative, never the value: the script
  copies values from your contracts
- every route carries `entry="<n>"` — the NUMBER of the `in` alternative of its FIRST node the
  scenario arrives through. No such alternative means the node's contract is missing its inbound
  side; add it rather than pointing at a return value
- `out` of a step must appear VERBATIM among `in` of the next node
- consecutive route steps must be joined by `<dep>`, in either direction
- every node a route passes through is in the file, including an unchanged one — copied from the
  subgraph without `delta`
- every alternative you declare in `out` must be taken by some route
$END_CONSTRAINTS

$START_FEEDBACK
Evidence from the last red check, if this is a redelegation. Empty means the first attempt. Each
blocker carries its rule number, the scenario and the step — repair exactly what it names, first.
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
      <contract in="… | …" out="… | …"/>
      <dep path="…"/>
    </module>
    <route scenario="…" entry="n" steps="path#n -> path#n"/>
  </design>
check: {CHECK}
return: call workflow_result — the shape and the choice of rail are declared by your ROLE's
OUTPUT_FORMAT
$END_OUTPUT
