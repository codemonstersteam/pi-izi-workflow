$START_TASK
Design the decided change as two aligned projections: the modules it touches with their contracts,
and one route per FRD scenario.
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
the subgraph reachable from the touched nodes — what exists. The full application graph is not here
and is not needed: a node outside this subgraph is outside this change
$END_DOCUMENT
$START_CONTENT
{RIPPLE}
$END_CONTENT
$END_DATA

$START_CONSTRAINTS
- weight of the change: {MODE} — goes into `mode` of the root element
- a route step names the node and the NUMBER of its `out` alternative, never the value: the script
  copies values from your contracts
- `out` of a step must appear VERBATIM among `in` of the next node
- consecutive route steps must be joined by `<dep>`, in either direction
- every node a route passes through is in the file, including an unchanged one — copied from the
  subgraph with its contract and without `delta`
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
    <module path="…" delta="add|change|remove">
      <role>…</role>
      <contract in="… | …" out="… | …"/>
      <dep path="…"/>
    </module>
    <route scenario="…" steps="path#n -> path#n"/>
  </design>
check: {CHECK}
return: call workflow_result — the shape and the choice of rail are declared by your ROLE's
OUTPUT_FORMAT
$END_OUTPUT
