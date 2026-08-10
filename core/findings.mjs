// MODULE_CONTRACT: findings — classifies a validator's finding code: does it fail acceptance, or does
//               it travel to the operator as evidence
// Purpose:    one decision — which finding codes HAVE A RESOLVER OF TRUTH outside the text (they can
//             judge on their own: blocker) and which encode a judgement about the MEANING of a
//             natural-language phrase (they cannot judge: advice). The decision hides behind one set,
//             ADVICE_CODES, and one function that consults it — the rest of the repository asks for a
//             verdict here instead of keeping a list of codes of its own.
// io:         none
// Invariants: severityOf is a total function: for ANY code (including a new or unknown one, including
//             a falsy one) the result is defined and equals "blocker" unless the code is listed
//             explicitly in ADVICE_CODES (a deny-safe default: a new code cannot quietly become
//             advice without being added). blockersOf and adviceOf over one findings array were a
//             lossless partition — every element reached exactly one of the two outputs, because both
//             filtered the same array with the same severityOf predicate.
// Interface:  ADVICE_CODES — Set<string>, the registry of codes with no resolver of truth (a
//             constant, not a function)
//             severityOf(code) -> "blocker" | "advice"
//             adviceLines(text) -> string[] — the evidence a guardrail printed, out of its output
//
// The pipeline maps "a red check" onto "redelegate the artifact's owner". So the price of a WRONG
// rule is higher than a red lamp: it ORDERS the role to spoil a correct artifact in order to fit the
// rule. A live run on 01.08 showed exactly that (F1): the role went off to rewrite a correct BRD.
//
// Hence the split. A rule with a RESOLVER OF TRUTH outside the text — the file exists, the number
// equals the number, the id is in the set — judges on its own: a false positive has nowhere to come
// from. A rule that encodes a JUDGEMENT ABOUT THE MEANING of a phrase cannot judge under any regex: a
// finite list of words over natural language will either over-catch the domain or miss an unusual
// wording. That is a limit of expressiveness, not an unfinished job.
//
// Such rules are demoted from judge to COLLECTOR OF EVIDENCE: the finding carries its phrase but
// neither fails acceptance nor triggers a delegation — it travels to the operator in the GATE #1
// brief. A human makes it blocking, not a grep.
export const ADVICE_CODES = new Set([
  // "a wish, not a criterion": a list of wish-words against natural language. F19 — "valid range
  // 1..100" was counted a wish with an exact range sitting right beside it.
  "wish-not-requirement",
  // "the requirement names a mechanism": a regex over path/class/import catches business vocabulary —
  // "service class", "importing data from legacy".
  "design-leak",
  // "a DoD item names no artifact": the corpus of real orders (run 03) gives 7 hits on impeccable
  // items of the form "Limit defaults to 20 when ?limit is absent" — a checkable statement about
  // behaviour is not obliged to carry a path or a command.
  "dod-without-artifact",
])

// FUNCTION_CONTRACT: severityOf — judges one finding code: fail acceptance, or travel as evidence
//   Input:        code — the finding's kebab-case literal (a slice's factories declare the codes)
//   Dependencies: —
//   Antecedent:   any value — need not be a string and need not be in ADVICE_CODES; falsy/undefined
//                 are allowed (Set.has throws for no type)
//   Consequent:   success: "advice" when code ∈ ADVICE_CODES — only the rules with no resolver of
//                          truth over natural language (see the header): such a finding neither fails
//                          the check nor triggers a redelegation; otherwise "blocker", including for
//                          falsy/undefined and any code ADVICE_CODES does not know — a deny-safe
//                          default: a new code cannot silently start letting acceptance through
//                 failure: none — total for any code
export const severityOf = (code) => (ADVICE_CODES.has(code) ? "advice" : "blocker")

// FUNCTION_CONTRACT: adviceLines — the evidence a guardrail printed, out of its output
//   Input:        text — the stdout+stderr of an executed check; type unconstrained
//   Dependencies: —
//   Antecedent:   any value; the check may have printed nothing
//   Consequent:   success: lines shaped `⚠ [code] …`, trimmed, in output order; no such lines → []
//                 failure: none — total
// OUTPUT CONVENTION: a guardrail prints evidence as `⚠ [<code>] <message>`. The bracket in the filter
// is not decoration — `bin/run-script.mjs` and the graph validator print `⚠ <text>` with no code (the
// graph's gaps), and without the bracket a survey gap would travel into the receipt as evidence it is
// not.
//
// Why this exists at all: a validator prints evidence on a GREEN check, and bin/accept.mjs captured
// that output into checkOut and used it only on the failure branch — on success the evidence died
// inside acceptance. A rule whose addressee never receives the finding is a wish: step `gate1`, where
// the evidence is addressed, does not exist in this line yet, so today's addressee is the operator
// (stderr) and the receipt (disk).
export function adviceLines(text) {
  return String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^⚠\s*\[/.test(l))
}

// blockersOf and adviceOf were removed: phase 8 made them dead. Evidence now travels on the BUILT BRD
// (steps/brd/brd.mjs::newBrd returns it in the `advice` field) and the factory collects the blockers
// itself — there is nobody left to filter a common findings list, and no reason to. A dead export is
// worse than a missing one: it promises a mechanism the pipeline no longer has.
