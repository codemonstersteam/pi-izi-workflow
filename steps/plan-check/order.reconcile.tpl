$START_TASK
You are the planner. The plan below carries the operator's decisions («→ РЕШЕНО» in section 6).
RECONCILE every decision against ALL sections of the plan:

1. ТРЕБОВАНИЯ — is every РЕШЕНО closed by a Т-row?
2. ИЗМЕНЕНИЯ — is every РЕШЕНО implemented by a Ф-row?
   No → ADD it (number, file, contract, requirement).
   A Ф-row CONTRADICTS the decision → FIX it.
3. СЦЕНАРИИ — is every РЕШЕНО reflected in «после»? No → ADD it.
4. ВЕЛИЧИНЫ — is the value from РЕШЕНО present? Source = «ответ оператора».
5. ГАРАНТИИ — does РЕШЕНО break none? If it breaks → fix the Ф-row.

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
