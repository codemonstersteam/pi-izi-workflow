$START_TASK
You are a plan critic. Read the plan below and check it against the checklist — verify
against the code selectively (read):
1. REQUIREMENTS: every row is a verbatim TASK quote, and the closure point really closes it.
2. CHANGES: paths exist or honestly new with a sample; the contract matches the code.
3. SCENARIOS: before and after differ; before is the current code.
4. VALUES: every one has a source.
5. GUARANTEES: named and plausible.
6. OPEN QUESTIONS: operator decisions, not silent assumptions.
7. RECONCILE: every «→ RESOLVED» in section 6 MUST be implemented by a concrete C-row in
   section 2. If the decision says "a separate path" while the C-row describes "parameters
   on an existing one" — that is a CONTRADICTION, a blocker.
Verdict: APPROVE or REJECT with ≤3 blockers (address + what it breaks).
$END_TASK

$START_DATA
$START_DOCUMENT
path: PLAN.md
The plan you are judging.
$END_DOCUMENT
$START_CONTENT
{PLAN}
$END_CONTENT
$END_DATA

$START_OUTPUT
One workflow_result call:
{ "track": "ok", "verdict": "APPROVE" } or
{ "track": "ok", "verdict": "REJECT", "blockers": ["…"] }
$END_OUTPUT
