$start_system
You are software developer. Software craftsman and progmatic programmer.  
Develop rationally and precisely according to the task. Avoid labor-intensive, all-purpose solutions.
$end_system

$start_task
Develop step 4 'scope' of workflow in pi-extensible-workflows paradigm
$end_task

$start_context

Folow on the best practices at https://github.com/vekexasia/pi-extensible-workflows/tree/main
and experience gained from the current project,
you need to:
develop the 4 step 'scope' of the workflow (described in `docs/workflow.md`);
the workflow execution order is outlined in `docs/workflow.md`,
and the concept is described in `docs/concept.md`.

$end_context

Write clear, minimalist code;
do not aim for a universal solution;
write code specifically for the third step's requirements,
adhering to the development standards
described in the `standards` documentation.

$start-strategy-step-by-step

1 First, analyze the data.
2 Then, draft the concept for the third step "scope" and show the code to the operator
(it is important to show the workflow JS code and how it integrates into `workflows/izi.js`)
3 Once approved, 
  3.1 create docs/scope.md concept consice overview
  3.2 create a step-by-step backlog in `backlog.md`.
4 Every development step must be tested.
5 Work in small iterations with rapid feedback.

Work iteration:
1 Pick a task from the backlog.
2 Solve the task and write a test for it.
3 If the task is completed, mark it as done in `backlog.md`.
7 Pick the next task from the backlog.
Repeat the iteration.

$end-strategy-step-by-step

$start_comment_the_code

Wokflow functions and code must contain comments.

Imagine a scenario: an agent downloads a single file and reads it. There is no longer any chat history, no previous files. The file should be self-explanatory.
This is Zero-Context Survival.
The file should contain:
1. 2. 3. 4. MODULE_CONTRACT at the beginning. What does this module do?
FUNCTION_CONTRACT for each function. What's included, what's out?
BUG_FIX_CONTEXT where needed. Why didn't the old solution work?
EXTERNAL_DEPENDENCY comments. If a function depends on something external (config, environment variable), it must be explicitly stated.

Example:
```
# MODULE_CONTRACT: Payment Processing
# Dependencies: SQLite (DB), stripe.com API, email service
# Critical invariants: Double-charge protection via idempotency_key
import stripe
from database import connection
# EXTERNAL_DEPENDENCY: STRIPE_API_KEY from environment
# EXTERNAL_DEPENDENCY: SMTP config from config.yaml
def process_payment(user_id: int, amount: float, idempotency_key: str) ->
PaymentResult:
"""
Process a payment transaction.
FUNCTION_CONTRACT:
Input:
- user_id: positive integer, user must exist in DB
- amount: positive float, must be > 0
- idempotency_key: unique string, prevents double charges
Output: PaymentResult with status (success/failed) and transaction_id
Guarantees:
- If called twice with same idempotency_key, returns same result (idempotent)
- If fails, no money is deducted
- User receives email confirmation
Raises:
- UserNotFound if user_id doesn't exist
- InvalidAmount if amount <= 0
"""
# BUG_FIX_CONTEXT: Issue #156
# Previous: Payment processed before checking idempotency
# Problem: Race condition could cause double-charge
# Fix: Check idempotency_key BEFORE any DB mutation
# Check for duplicate (idempotency)
existing = connection.execute(
"SELECT transaction_id FROM payments WHERE idempotency_key = ?",
(idempotency_key,)
).fetchone()
if existing:
log.info(f"[PAYMENT][IMP:9] Idempotent retry: returning existing transaction
{existing[0]}")
return PaymentResult(status="success", transaction_id=existing[0])
# Validate user exists
user = connection.execute(
"SELECT id FROM users WHERE id = ?",
(user_id,)
).fetchone()
if not user:
log.error(f"[PAYMENT][IMP:9] User {user_id} not found")
raise UserNotFound(f"User {user_id} does not exist")
# Validate amount
if amount <= 0:
log.error(f"[PAYMENT][IMP:9] Invalid amount: {amount}")
raise InvalidAmount(f"Amount must be positive, got {amount}")
# Process with Stripe
try:
charge = stripe.Charge.create(
amount=int(amount * 100),
currency="usd",
customer=f"stripe_user_{user_id}",
idempotency_key=idempotency_key
)
# Store transaction in our DB
connection.execute(
"INSERT INTO payments (user_id, amount, transaction_id, idempotency_key,
status) "
"VALUES (?, ?, ?, ?, ?)",
(user_id, amount, charge.id, idempotency_key, "success")
)
connection.commit()
log.info(f"[PAYMENT][IMP:9] Payment processed: {charge.id} for user
{user_id}")
# Send email
send_email(user_id, f"Payment of ${amount} received")
return PaymentResult(status="success", transaction_id=charge.id)
except stripe.error.CardError as e:
log.warning(f"[PAYMENT][IMP:8] Card error: {e.message}")
return PaymentResult(status="failed", reason=e.message)
except Exception as e:
log.error(f"[PAYMENT][IMP:10] Unexpected error: {type(e).__name__}: {str(e)}")
raise
```

This file can be read by an agent who has never seen the rest
of the codebase. They can understand:
• What the module does
• What each function does
• Why specific protections were added (BUG_FIX_CONTEXT)
• What external dependencies are needed
This is Zero-Context Survival.

$end_comment_the_code
