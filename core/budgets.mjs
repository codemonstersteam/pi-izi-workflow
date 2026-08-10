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

// loops — redelegations of a role after a RED guardrail check; questions — operator exchanges per
// run; checkpointRetries — re-asks of ONE question when no answer showed up in answers.md. Three
// distinct counters, never to be confused: a question does not spend loops (workflows/izi.js::brd).
//
// maxParallel — the BATCH size of the swarm (step 4 `scope`), not a cap on the number of cells. It
// exists because the workflow sandbox has no limiter at all: `parallel` is `Promise.all`
// (pi-extensible-workflows/packages/core/src/execution.ts:245-266), so a hundred cells would go to
// the model at once. The default 8 is pi's own concurrency ceiling.
export const DEFAULT_BUDGETS = Object.freeze({ loops: 3, questions: 3, checkpointRetries: 2, maxParallel: 8 })
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
