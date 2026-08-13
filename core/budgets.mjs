// MODULE_CONTRACT: budgets — the run's budgets: how many times a role is redelegated, and how many
//               times it may ask the operator
// Purpose:    one decision — WHERE a budget number comes from. Until S16 three literals lived in
//             `workflows/izi.js`, and raising one meant editing code in every installed project. By
//             the operator's decision the budgets moved into the project file `izi.config.json`; here
//             is the PURE rule for reading it, the defaults are declared exactly once
//             (DEFAULT_BUDGETS), and "there is no file" differs from "the file is broken".
// io:         none
// Invariants: DEFAULT_BUDGETS is frozen at load; newBudgets is pure — the result depends on the given
//             text alone; a partial config is allowed (a missing key takes its default), an UNKNOWN
//             key is a refusal: a typo in a budget's name would otherwise silently keep the old
//             number while the operator believed it had been raised
// Interface:  DEFAULT_BUDGETS — the defaults, the only copy of these numbers
//             BUDGETS_PATH — the name of the configuration file in the run's root
//             newBudgets(raw) -> Result<Budgets, "invalid-budgets">

import { ok, err } from "./result.mjs"

// loops — redelegations of a role after a RED guardrail check; questionRounds — how many times a role
// may come out to the operator at all; checkpointRetries — re-asks of one pause when no answer showed
// up in answers.md. Distinct counters, never to be confused: a question does not spend loops
// (workflows/izi.js::brd).
//
// WHY THERE IS NO BUDGET OF QUESTIONS, only of rounds (S33). S21 introduced both, on this reasoning:
// asking ONE PER EXCHANGE makes the role re-read the BRD and the whole map every time — "the round,
// not the question, is what costs context". That reasoning names the cheap axis itself, and we capped
// it anyway; the expensive one, the round, is the only real limit.
//
// The cap did not merely fail to help. S21's own commit body described a real grilling as "25-30
// questions per round", and that DESCRIPTIVE figure travelled into the role's strategy as the
// PRESCRIPTION "thirty is normal". Two live runs then landed on it exactly — e132f0a1 asked 25 in one
// batch, e4a583a7 asked 12 and wanted 18 more — and a third of the last batch was step 9's business
// (a resolver's CDI scope, a cache's key) or answered itself by the analogue. A number shown to a
// role as "left in this run" is read as an allowance, not as a ceiling. So the number is gone, and
// what bounds elicitation now is the completeness the guardrail judges anyway: a question is a gap
// F1..F7 would name.
//
// reviewRounds — how many times the band may be REWOUND by step 11's critic (docs/review.md §6). It
// is not `loops` and not `questionRounds`: a rewind re-runs steps 6-11 on the artifact whose owner
// the blocker named, so one round costs a re-delegation of `intake` and `designer` plus the scripts
// between them. The default 2 is deliberately small — a third round has never been observed, and the
// invariant that stops the loop is not this counter but the repeat of a `(code, node)` pair, which
// means the repair did not take and a human is needed.
//
// maxParallel — the BATCH size of the swarm (step 4 `scope`), not a cap on the number of cells. It
// exists because the workflow sandbox has no limiter at all: `parallel` is `Promise.all`
// (pi-extensible-workflows/packages/core/src/execution.ts:245-266), so a hundred cells would go to
// the model at once. The default 8 is pi's own concurrency ceiling.
// intakeLoops — `loops` for step 6 ALONE, and the one budget that is not shared. Live run e132f0a1
// measured the difference: `checkFrd` is total, so a round's blocker list is the WHOLE remaining
// distance to green, and round 2 came back with exactly one line — the artifact was one attribute
// from done. Round 3 repaired that line and lost a rule from round 1, and the run escalated on the
// third of three. Step 6 is the only place where one file answers to seven rules at once; the other
// four loops (brd, scope, design, review) judge a narrower artifact and keep the shared `loops`.
export const DEFAULT_BUDGETS = Object.freeze({ loops: 3, intakeLoops: 6, questionRounds: 5, checkpointRetries: 2, maxParallel: 8, reviewRounds: 2 })
export const BUDGETS_PATH = "izi.config.json"

const KEYS = Object.keys(DEFAULT_BUDGETS)

// FUNCTION_CONTRACT: newBudgets — the run's budgets out of izi.config.json's text
//   Input:        raw — the file's contents; empty/whitespace means "there is no file"
//   Dependencies: —
//   Antecedent:   empty text OR a JSON object whose every key is in DEFAULT_BUDGETS and whose values
//                 are integers ≥ 1
//   Consequent:   success: frozen budgets; a missing key is taken from DEFAULT_BUDGETS, empty text
//                          yields DEFAULT_BUDGETS entire
//                 failure: "invalid-budgets" — not JSON, not an object, an unknown key, or a value
//                          that is not an integer ≥ 1
//   Purity:       pure
//   Interface:    newBudgets(raw: string) -> Result<Budgets, "invalid-budgets">
export function newBudgets(raw) {
  const text = String(raw || "").trim()
  if (!text) return ok(DEFAULT_BUDGETS)

  let cfg
  try {
    cfg = JSON.parse(text)
  } catch (e) {
    return err("invalid-budgets", `${BUDGETS_PATH} не разбирается как JSON — ${e.message}`)
  }
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) {
    return err("invalid-budgets", `${BUDGETS_PATH} обязан быть объектом вида {"${KEYS.join('": 3, "')}": 2}`)
  }

  const unknown = Object.keys(cfg).filter((k) => !KEYS.includes(k))
  if (unknown.length) {
    return err("invalid-budgets", `${BUDGETS_PATH}: неизвестный ключ ${unknown.join(", ")} — бюджеты это ${KEYS.join(", ")}`)
  }

  const bad = KEYS.filter((k) => k in cfg && !(Number.isInteger(cfg[k]) && cfg[k] >= 1))
  if (bad.length) {
    return err("invalid-budgets", `${BUDGETS_PATH}: ${bad.map((k) => `${k} = ${JSON.stringify(cfg[k])}`).join(", ")} — бюджет это целое ≥ 1`)
  }

  return ok(Object.freeze({ ...DEFAULT_BUDGETS, ...cfg }))
}
