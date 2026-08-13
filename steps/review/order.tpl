$START_TASK
Judge the work plan as a program: does every instruction's antecedent follow from what stands before
it, and do the consequents together deliver the requirement's goal. Return a verdict.
$END_TASK

$START_DATA
$START_DOCUMENT
path: .agent/plan-index.json
the plan whole — `order[]` is the sequence of instructions, and each node carries its `kind`, its
`delta`, its `deps`, its check commands and the scenarios that cover it. An id of this file is the
only address a finding of yours may have
$END_DOCUMENT
$START_CONTENT
{PLAN}
$END_CONTENT
$START_DOCUMENT
path: .agent/frd.xml
what must be true after the work — the goal, the use cases with their steps and `<post>`, the
scenarios with `before`/`after`, the deltas and the failure map. This is the requirement the plan
above owes; it is not a plan and it is not yours to change
$END_DOCUMENT
$START_CONTENT
{FRD}
$END_CONTENT
$END_DATA

$START_CONSTRAINTS
- vocabulary of `code`: {CODES} — a finding outside it is rejected before anyone reads it
- `node` of a blocker is an id of `.agent/plan-index.json`, character for character, `scenario:` ids
  included
- `evidence` is fixed BY the code: `unreachable-antecedent` takes the id of the plan node whose
  result is missing — that pair is the edge a script then applies; `goal-not-delivered` takes the id
  of the FRD element nobody delivers (a use case, a scenario, a failure's code, a delta's `op`)
- one line of text per blocker, in the language of the documents above
- do NOT report what earlier steps already refuse: node membership, the topological order, a node
  without a command or a scenario, an unresolved touched path, contracts that do not stitch, a route
  missing for a scenario, a declared failure named in no contract
- do NOT judge whether a check command would turn red — that is measured after the work, against the
  branch baseline
- do NOT turn a declared gap of the plan into a blocker: the operator reads `gaps` on the plan itself
$END_CONSTRAINTS

$START_FEEDBACK
Evidence from the last red check, if this is a redelegation. Empty means the first attempt. Every
blocker here is about the FORM of your file — an unknown code, an address that resolves to nothing —
never about your judgement: keep the finding and fix its address.
$START_CONTENT
{FEEDBACK}
$END_CONTENT
$END_FEEDBACK

$START_OUTPUT
path: {STAGING}
schema:
  <review verdict="Pass | Reject" grammar="1">
    <blocker code="…" node="…" evidence="…">one line: what does not compose</blocker>
  </review>
  a Pass carries no blocker at all: <review verdict="Pass" grammar="1"/>
check: {CHECK}
return: call workflow_result — the shape and the choice of rail are declared by your ROLE's
OUTPUT_FORMAT
$END_OUTPUT
