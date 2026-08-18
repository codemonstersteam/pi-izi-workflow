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
//             ORDER_CAP_CHARS — the ceiling on ONE assembled order, in characters
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
export const DEFAULT_BUDGETS = Object.freeze({ loops: 3, intakeLoops: 6, questionRounds: 5, checkpointRetries: 2, maxParallel: 8, reviewRounds: 2, baseline: true })

// baseline — ЕДИНСТВЕННЫЙ ключ этого файла, который не число, и он здесь не по прихоти. Шаг 13
// после среза ветки гоняет все сьюты репозитория: ветка равна свежему транку, поэтому зелёный
// прогон доказывает релизопригодность транка, а красный называет дефект ЧУЖИМ. Без этого якоря
// красный сьют на шаге 16 не улика — его с равным правом можно списать на наследство.
//
// Выключается там, где якорь не нужен и дорог: песочница гоняет полосу по десять раз в день, и
// полный `mvn verify` на каждом срезе стоит больше, чем доказывает.
const FLAGS = Object.freeze(["baseline"])
export const BUDGETS_PATH = "izi.config.json"

// ORDER_CAP_CHARS — how big ONE assembled order may be, in CHARACTERS, and it is NOT a budget of the
// izi.config.json kind: nothing an operator prefers moves it. It is the window of the model the roles
// run on, minus what the request claims beside the order, and it is declared here because the workflow
// sandbox has no place to derive it in (it receives it through budgets(), it does not carry a copy).
//
// WHY IT EXISTS: the arithmetic is the one steps/intake/map.mjs writes out over MAP_CAP_BYTES, and its
// closing sentence names this gap — "nobody measures the ASSEMBLED order against the window before the
// role is launched, and the map cap cannot stand in for it: it sees one of five terms". Live run
// 162e8b02 (form eddi) died of exactly that: the request was 112 tokens over the window, HTTP 400, and
// the role never ran at all — an outcome indistinguishable, from the operator's chair, from a role that
// answered badly.
//
// THE DERIVATION, every term measured on that run and on the model catalogue, none of them invented:
//   262 144   the window of the roles' model (steps/intake/map.mjs, the comment over MAP_CAP_BYTES)
//  − 32 768   claimed for the OUTPUT — pi's maxTokens for these roles, and the ceiling three crashed
//             runs hit exactly (d5f1d0b4, 35972d1c, 5bbe5de4 — 98 304 = 3 × 32 768)
//  −  8 192   the request beside the order: pi's own boilerplate ≈ 4 930 tokens + tool schemas ≈ 1 780
//             + the role file itself (the project's AGENTS.md, 16 010 tokens on that run, no longer
//             travels — every role declares `contextFiles: []`)
//  = 221 184  tokens left for the order
//  × 3.82     characters per token, MEASURED on that request's own order and map — not the 4.0 the
//             provider's estimator assumes, because the estimator undershot by 4 208 tokens there and
//             a cap built on it would refuse to notice the very request that died
//  ≈ 844 923  characters, rounded DOWN to the number below
//
// WHAT IT IS NOT: it is not a cure for a role that reasons itself into the output ceiling. That failure
// was measured and the size hypothesis did NOT explain it — what separates the orders that write a file
// from the ones that do not is the number of independent obligations in them (145 for pass A on eddi
// against 1-4 for a swarm part), and the cure is a projection or a swarm, never a resizer. This number
// answers a different and narrower question: will the request the workflow is about to send exist at
// all. Today's largest order is 49 884 characters, 6 % of it — a cap that fires is a cap that has just
// prevented an HTTP 400.
export const ORDER_CAP_CHARS = 800000

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

  const bad = KEYS.filter((k) => k in cfg && !FLAGS.includes(k) && !(Number.isInteger(cfg[k]) && cfg[k] >= 1))
  if (bad.length) {
    return err("invalid-budgets", `${BUDGETS_PATH}: ${bad.map((k) => `${k} = ${JSON.stringify(cfg[k])}`).join(", ")} — бюджет это целое ≥ 1`)
  }
  const notFlag = FLAGS.filter((k) => k in cfg && typeof cfg[k] !== "boolean")
  if (notFlag.length) {
    return err("invalid-budgets", `${BUDGETS_PATH}: ${notFlag.map((k) => `${k} = ${JSON.stringify(cfg[k])}`).join(", ")} — это флаг, true либо false`)
  }

  return ok(Object.freeze({ ...DEFAULT_BUDGETS, ...cfg }))
}
