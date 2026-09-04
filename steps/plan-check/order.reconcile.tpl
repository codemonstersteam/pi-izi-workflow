$START_TASK
You are the planner. The plan below carries the operator's decisions («→ RESOLVED» in section 6).
RECONCILE every decision against ALL sections of the plan:

1. REQUIREMENTS — is every RESOLVED closed by an R-row?
2. CHANGES — is every RESOLVED implemented by a C-row?
   No → ADD it (number, file, contract, requirement).
   A C-row CONTRADICTS the decision → FIX it.
3. SCENARIOS — is every RESOLVED reflected in after? No → ADD it.
4. VALUES — is the value from RESOLVED present? Source = "operator's answer".
5. GUARANTEES — does RESOLVED break none? If it breaks → fix the C-row.

If EVERYTHING converges — change nothing.
$END_TASK

$START_PREVIOUS
path: .agent/PLAN.md
The plan with the operator's decisions.
$START_CONTENT
{PLAN}
$END_CONTENT
$END_PREVIOUS

$START_OUTPUT
path: {STAGING}
The updated plan with the write tool at this path.
$END_OUTPUT
