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
//             carriedBlockers({ blockers, seen }) -> { text, seen } — a repair loop's feedback,
//             carrying what was already red in this run
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

// THE MEMORY OF A REPAIR LOOP IS THE RUN, NOT THE ROUND.
//
// A redelegation hands the role the LAST check's blockers and nothing else. That is the whole truth
// about the artifact as it stands — every guardrail here is total, so the list is the entire distance
// left to green — and it is still not enough to repair by, because the role does not PATCH the file:
// it writes it again from the order. Everything the last check did not name is re-derived, and a
// requirement satisfied on round N is at the mercy of the same reasoning that got it wrong on N-1.
//
// Live run e132f0a1 spent its budget exactly there. Round 1: `F4 uc="UC1,UC4"` plus `F5` on two
// invented numbers. Round 2: one line left, `F4` alone — the artifact was one attribute from done.
// Round 3 repaired that attribute and brought both `F5` numbers back, in the same field, word for
// word. The escalation was not a role that could not converge; it was a role with a memory one round
// long.
//
// TEXTS, NOT RULE NUMBERS. The regressed element came back identical (`<field name="id">`, the number
// 24), so round 1's line stayed applicable verbatim, and it carried two facts a bare `F5` does not:
// WHICH number and WHERE. A rule code tells a model which law it broke; only the line tells it what to
// leave alone.

// THE CEILING OF ROUNDS IS A REFUSAL, NOT A DEATH.
//
// Until S33 the trip that exceeded `questionRounds` killed the run: live run e4a583a7 escalated with
// twelve answered questions, a built map, a whole surveyed swarm — and no artifact at all. Nothing
// about that is truer than the alternative: the role is told the trips are over and writes the FRD it
// can write, with every unresolved gap standing in it as a `<question>`. The grammar has carried that
// element from the start (steps/intake/frd.mjs::parseFrd → questions[]) and the workflow already
// reports how many an accepted artifact holds — an open question is an OUTPUT, which is exactly what
// the role's source says it is (requirements-intake/SKILL.md: "a first-class output, not a blocker to
// hide"). The refusal costs one redelegation, so the loop stays bounded.
export const OUT_OF_ROUNDS =
  "guardrail: кругов уточнения к оператору больше нет. Всё, что осталось невыясненным, — <question subject=\"…\" why=\"…\"/> в артефакте: отданный обратно пробел это результат, а пауза, которой не будет, — нет."

// FUNCTION_CONTRACT: carriedBlockers — the feedback of a redelegation: what is red NOW, plus what was
//                    red EARLIER in this run and must not come back
//   Input:        { blockers — the current red check's text; seen — lines already red in this run, in
//                  first-seen order; outOfRounds — the trips to the operator ran out, and the refusal
//                  leads the feedback because it changes what the role must DO, not just fix }
//   Dependencies: —
//   Antecedent:   any values; `blockers` may be empty (nothing red now) and `seen` may be absent
//   Consequent:   success: { text — the FEEDBACK to hand the role, `seen` — the accumulated lines,
//                            first-seen order, deduplicated, current lines appended }
//                          The carried block is omitted entirely when nothing was red before or when
//                          the earlier lines are all repeated in the current check: a role must never
//                          be shown a demand it is already being asked to fix, as two copies of one
//                          blocker read as two defects.
//                 failure: none — total
//   Purity:       pure
//   Interface:    carriedBlockers({ blockers, seen, outOfRounds }) -> { text: string, seen: string[] }
export function carriedBlockers({ blockers, seen = [], outOfRounds = false }) {
  const linesOf = (t) => String(t || "").split("\n").map((l) => l.trim()).filter(Boolean)
  const now = linesOf(outOfRounds ? `${OUT_OF_ROUNDS}\n${String(blockers || "")}` : blockers)
  const before = (Array.isArray(seen) ? seen : []).map((l) => String(l).trim()).filter(Boolean)

  const carried = before.filter((l) => !now.includes(l))
  const head = now.join("\n")
  const text = carried.length
    ? `${head}\n\nAlready red earlier in this run — repairing the above must not bring them back:\n${carried.map((l) => `  ${l}`).join("\n")}`
    : head

  const next = []
  for (const l of [...before, ...now]) if (!next.includes(l)) next.push(l)
  return { text, seen: next }
}

// blockersOf and adviceOf were removed: phase 8 made them dead. Evidence now travels on the BUILT BRD
// (steps/brd/brd.mjs::newBrd returns it in the `advice` field) and the factory collects the blockers
// itself — there is nobody left to filter a common findings list, and no reason to. A dead export is
// worse than a missing one: it promises a mechanism the pipeline no longer has.
