// The run's budgets — a PURE rule for reading izi.config.json. Formula: 1 happy + Σ antecedent
// branches with a DISTINGUISHABLE consequent = 3 units ("no file" is its own consequent, not a refusal).

import test from "node:test"
import assert from "node:assert/strict"
import { newBudgets, DEFAULT_BUDGETS } from "./budgets.mjs"

test("the config sets the budgets; a missing key takes its default", () => {
  const r = newBudgets('{"questions": 10}')
  assert.equal(r.ok, true)
  assert.equal(r.value.questions, 10)
  assert.equal(r.value.loops, DEFAULT_BUDGETS.loops)
})

test("no file at all — the defaults entire, never a refusal", () => {
  assert.deepEqual(newBudgets("").value, DEFAULT_BUDGETS)
  assert.equal(DEFAULT_BUDGETS.maxParallel, 8) // step 4's batch size lives here, not in izi.js
  // S21: questions counts QUESTIONS, rounds counts TRIPS to the operator. One number cannot mean
  // both — 60 exchanges is the cost the batch exists to remove (see the module's header).
  assert.equal(DEFAULT_BUDGETS.questions, 60)
  assert.equal(DEFAULT_BUDGETS.questionRounds, 3)
})

test("a broken config is a refusal, never a silent default", () => {
  assert.equal(newBudgets("{questions: 10}").error.cls, "invalid-budgets")     // not JSON
  assert.match(newBudgets('{"question": 10}').error.detail, /неизвестный ключ/) // a typo in the key name
  assert.match(newBudgets('{"questions": 0}').error.detail, /целое ≥ 1/)        // not a budget
})
