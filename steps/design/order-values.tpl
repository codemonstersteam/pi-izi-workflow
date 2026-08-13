$START_TASK
Extract the dictionary of this change: every value its nodes hand to each other, declared once, under
a name the two passes after you will write instead of the text.
$END_TASK

$START_DATA
$START_DOCUMENT
path: .agent/frd.xml
the delta, its scenarios, its touched nodes and its failure codes — what must change. Its
`<failure code status>` rows and its `<delta op>` operations are two of the four sources of a value
$END_DOCUMENT
$START_CONTENT
{FRD}
$END_CONTENT
$START_DOCUMENT
path: .agent/ripple.xml
the subgraph reachable from the touched nodes — what exists. `<api name>` and `<decl name>` are the
other two sources of a value, and their text is copied from the attribute, not paraphrased. There are
no `<contract>`s here and none are asked of you: which node speaks which value is the NEXT pass's
file. `<decl more="N"/>` means the remainder was cut by the map's cap and is not in your input
$END_DOCUMENT
$START_CONTENT
{RIPPLE}
$END_CONTENT
$END_DATA

$START_CONSTRAINTS
- one value — one row; `id` unique across the file, `text` never empty
- ids run `v1`, `v2`, `v3` … in writing order, appended, never renumbered
- the text of a call is copied CHARACTER FOR CHARACTER from the `name=` it comes from
- every `<failure code>` of the FRD stands inside the text of some value, together with its status —
  and the domain value the node below the boundary answers with is a row of its own
- a node whose `<decl>`s are `kind="field"` is ONE value, the record itself, not one value per field
- no `<module>`, `<contract>`, `<dep>`, `<route>`, path, count or prose in this file: the graph is the
  next pass's artifact and is judged by its own guardrail
$END_CONSTRAINTS

$START_FEEDBACK
Evidence from the last red check on the staging file, if this is a redelegation. Empty means the first
attempt. Each blocker names the row that is broken — an id, or the failure code no value carries.
Repair exactly those rows and change nothing else.
$START_CONTENT
{FEEDBACK}
$END_CONTENT
$END_FEEDBACK

$START_OUTPUT
path: {STAGING}
schema:
  <values>
    <value id="v1" text="…"/>
  </values>
check: {CHECK}
return: call workflow_result — the shape and the choice of rail are declared by your ROLE's
OUTPUT_FORMAT
$END_OUTPUT
