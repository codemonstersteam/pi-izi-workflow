$START_TASK
Play the decided change out in TIME: one route per scenario over the frozen graph below — which node
acts, which value it hands on, which node takes it next. The graph is not yours to change.
$END_TASK

$START_DATA
$START_DOCUMENT
path: .agent/frd.xml
the delta, its scenarios, its touched nodes and its failure codes. Its `<scenario id>` rows are the
ids your routes carry — copied, never composed
$END_DOCUMENT
$START_CONTENT
{FRD}
$END_CONTENT
$START_DOCUMENT
path: (собрано хостом из .agent/values.xml и .agent/design-nodes.xml)
the CARDS — one per node of the design graph, both frozen passes read together: `принимает:` is what
the node takes, `отдаёт:` what it hands on, `соседи:` the only nodes a step may move onto, and each
value is printed as its `id` plus its text. A step writes the ID. `(транзит)` means the change does
not touch that node. This is the whole world of names: the subgraph the graph was drawn from is NOT
in this order, and a name that is not on a card is not a name
$END_DOCUMENT
$START_CONTENT
{CARDS}
$END_CONTENT
$START_DOCUMENT
path: .agent/answers.md
what the operator has already answered in this run — the VALUE of an answer, not the wording of its
question. A route you asked about and got an answer for is settled: do not ask again
$END_DOCUMENT
$START_CONTENT
{ANSWERS}
$END_CONTENT
$END_DATA

$START_CONSTRAINTS
- a step is `path@id` — the node's path off a card and the id of the value it hands on; the position
  of an alternative does not exist in this grammar
- `entry` is the id of the value the scenario is STARTED by, and it stands in `принимает:` of the
  route's first node
- the first route of an FRD scenario carries that scenario's id character for character; another
  route through the same scenario is that id plus `b`, then `c`
- every FRD scenario has a route, and every `touched` path of the FRD lies on one
- every node with a delta lies on some route, and every id of its `отдаёт:` is handed on by some route
- a step moves only onto a node listed in `соседи:` of the previous one, and only with a value that
  node's `принимает:` carries
- not one `<module>`, `<contract>`, `<dep>` or `<value>`: the dictionary and the graph are frozen and
  are judged by their own passes
$END_CONSTRAINTS

$START_FEEDBACK
Evidence from the last red check on the staging file, if this is a redelegation. Empty means the first
attempt. Each blocker is ONE fact, and the scenarios that met it stand in its tail as evidence —
repair the fact, not every route that names it.
$START_CONTENT
{FEEDBACK}
$END_CONTENT
$END_FEEDBACK

$START_OUTPUT
path: {STAGING}
schema:
  <routes>
    <route scenario="S1" entry="v1" steps="src/A.java@v2 -> src/B.java@v5 -> src/A.java@v7"/>
  </routes>
check: {CHECK}
return: call workflow_result — the shape and the choice of rail are declared by your ROLE's
OUTPUT_FORMAT
$END_OUTPUT
