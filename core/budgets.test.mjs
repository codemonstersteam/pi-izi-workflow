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
  // S30: a rewind of the band by the critic is a THIRD kind of round — it costs role calls, not the
  // operator's time and not a redelegation of one role (docs/review.md §6).
  assert.equal(DEFAULT_BUDGETS.reviewRounds, 2)
  // S32: step 6 redelegates on its OWN budget. Run e132f0a1 came back from round 2 with a single
  // blocker — one attribute from green — and escalated on the third of three (core/budgets.mjs).
  assert.equal(DEFAULT_BUDGETS.intakeLoops, 6)
  assert.ok(DEFAULT_BUDGETS.intakeLoops > DEFAULT_BUDGETS.loops)
})

test("intakeLoops is a budget like any other — configurable, and a typo in it is still a refusal", () => {
  assert.equal(newBudgets('{"intakeLoops": 2}').value.intakeLoops, 2)
  assert.equal(newBudgets('{"intakeLoops": 2}').value.loops, DEFAULT_BUDGETS.loops) // the other four loops are untouched
  assert.match(newBudgets('{"intakeLoop": 2}').error.detail, /неизвестный ключ/)
})

test("a broken config is a refusal, never a silent default", () => {
  assert.equal(newBudgets("{questions: 10}").error.cls, "invalid-budgets")     // not JSON
  assert.match(newBudgets('{"question": 10}').error.detail, /неизвестный ключ/) // a typo in the key name
  assert.match(newBudgets('{"questions": 0}').error.detail, /целое ≥ 1/)        // not a budget
})
