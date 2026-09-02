$START_TASK
You are a plan critic. Read the plan below and check it against the checklist — verify
against the code selectively (read):
1. ТРЕБОВАНИЯ: every row is a verbatim TASK quote, and the closure point really closes it.
2. ИЗМЕНЕНИЯ: paths exist or honestly «новый» with a sample; the contract matches the code.
3. СЦЕНАРИИ: «до» and «после» differ; «до» is the current code.
4. ВЕЛИЧИНЫ: every one has a source.
5. ГАРАНТИИ: named and plausible.
6. ОТКРЫТЫЕ ВОПРОСЫ: operator decisions, not silent assumptions.
7. RECONCILE: every «→ РЕШЕНО» in section 6 MUST be implemented by a concrete Ф-row in
   section 2. If the decision says "a separate path" while the Ф-row describes "parameters
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
