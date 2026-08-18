// The run's budgets — a PURE rule for reading izi.config.json. Formula: 1 happy + Σ antecedent
// branches with a DISTINGUISHABLE consequent = 3 units ("no file" is its own consequent, not a refusal).

import test from "node:test"
import assert from "node:assert/strict"
import { newBudgets, DEFAULT_BUDGETS } from "./budgets.mjs"

test("the config sets the budgets; a missing key takes its default", () => {
  const r = newBudgets('{"questionRounds": 10}')
  assert.equal(r.ok, true)
  assert.equal(r.value.questionRounds, 10)
  assert.equal(r.value.loops, DEFAULT_BUDGETS.loops)
})

test("no file at all — the defaults entire, never a refusal", () => {
  assert.deepEqual(newBudgets("").value, DEFAULT_BUDGETS)
  assert.equal(DEFAULT_BUDGETS.maxParallel, 8) // step 4's batch size lives here, not in izi.js
  // S33: there is no budget of QUESTIONS at all — the round is what costs context, and a count shown
  // to a role reads as an allowance (see the module's header, and runs e132f0a1 / e4a583a7).
  assert.equal("questions" in DEFAULT_BUDGETS, false)
  assert.match(newBudgets('{"questions": 60}').error.detail, /неизвестный ключ/)
  assert.equal(DEFAULT_BUDGETS.questionRounds, 5)
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
  assert.equal(newBudgets("{loops: 10}").error.cls, "invalid-budgets")           // not JSON
  assert.match(newBudgets('{"questionRound": 10}').error.detail, /неизвестный ключ/) // a typo in the key name
  assert.match(newBudgets('{"questionRounds": 0}').error.detail, /целое ≥ 1/)    // not a budget
})

// `baseline` — первый ключ конфига, который не число. Форма расширена, и обе её половины судятся
// по-разному: бюджет остаётся целым ≥ 1, флаг обязан быть булевым. Сотри различение — и
// `"baseline": 0` проедет как «выключено», хотя это ноль прогонов, а не false.
test("baseline — флаг конфига: true по умолчанию, булев в файле, не число", () => {
  assert.equal(DEFAULT_BUDGETS.baseline, true, "по умолчанию якорь есть: красный сьют шага 16 обязан быть уликой")
  assert.equal(newBudgets('{"baseline": false}').value.baseline, false)
  assert.equal(newBudgets('{"baseline": true}').value.baseline, true)

  // Число флагом не считается — и наоборот, флаг не считается бюджетом.
  assert.match(newBudgets('{"baseline": 0}').error.detail, /это флаг, true либо false/)
  assert.match(newBudgets('{"loops": true}').error.detail, /бюджет это целое ≥ 1/)

  // Остальные ключи от расширения не пострадали: числовой конфиг читается как раньше.
  assert.equal(newBudgets('{"loops": 5}').value.baseline, true)
})
