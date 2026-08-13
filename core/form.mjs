// MODULE_CONTRACT: form — the one registry of an artifact's form and of a prompt's layers
// Purpose:    keep a requirement's wording from drifting apart between the prose of an order or role
//             and the validator's code — an order SUBSTITUTES the wording from here through a
//             placeholder instead of retelling it; the drift has already cost a whole live run (see
//             the paragraph below).
// io:         none
// Invariants: the constant dictionaries (BRD_FORM, ABSENT_DOC, PROMPT_LANG, SYSTEM_LAYERS,
//             USER_LAYERS, REQUIRED_SYSTEM, REQUIRED_USER) are fixed at module load and do not change
//             at run time; layersOf/missingLayers/extraLayers/withoutExample/cyrillicRatio are pure
//             stateless functions whose result depends on their arguments alone.
// Interface:  BRD_FORM — the mandatory fields and rules of the BRD artifact
//             ABSENT_DOC — what is substituted for an optional document that does not exist yet
//             PROMPT_LANG — the language of a subagent's prompts and the threshold it is checked by
//             SYSTEM_LAYERS — the full list of a role's system-prompt layers
//             USER_LAYERS — the full list of the user prompt's (the order's) layers
//             REQUIRED_SYSTEM — the subset of SYSTEM_LAYERS that must be present
//             REQUIRED_USER — the subset of USER_LAYERS that must be present
//             layersOf(text) — which layers a $START_<NAME> marker opens in the text
//             missingLayers(text, required) — which declared layers the text lacks
//             extraLayers(text, allowed) — which layers of the text the registry does not declare
//             withoutExample(text) — the text without its EXAMPLE layer (the instructive part)
//             cyrillicRatio(text) — the share of Cyrillic among the text's letters
//
// THE FORM REGISTRY — the one place that declares what we demand of an artifact.
//
// Why a registry rather than prose in a template. A requirement written twice — as an order's prose
// and as a validator's code — drifts apart. A whole live run on 01.08 was lost to it: the order asked
// the role for a rule ("a subject must occur in R's text") that had already been deleted from the
// code as wrong, and the role dutifully enforced a requirement that no longer existed, spoiling a
// correct artifact.
//
// Hence the rule: an order SUBSTITUTES a wording from here, it never retells it.
//
// S16, THE OPERATOR'S DECISION: the MEASURABLE_TOKENS dictionary and isMeasurable were removed from
// here together with the `fit-not-measurable` rule (steps/brd/brd.mjs::newFit). The claim "a false
// positive has nowhere to come from" was refuted by live run ed1d4094: a predicate criterion ("a
// case-insensitive substring match") is machine-checkable yet carries no dictionary token — and three
// redelegations in a row met the same red. The form registry below stayed: it declares an artifact's
// COMPOSITION, it does not judge prose.

export const BRD_FORM = {
  requirement: ["fit", "verify"],   // every R must carry both
  openQuestions: "0",               // the line must exist and must be zero
  subjectsMin: 3,
  subjectsMax: 7,
  // The wording travels INTO THE ORDER by substitution, and an order is written in the prompt
  // language (PROMPT_LANG). So the rule is written in it too: translating it "in place", in the
  // template, would bring back two texts of one requirement — what this registry exists against.
  subjectRule: "greppable: one word, not a phrase; in the language of the repository, not of the request",
  // The analogue obeys the subject rule for the same reason — step 3b greps the repository with it —
  // and adds the one thing a subject has no use for: an explanation, which travels after a dash and
  // is not searched with.
  analogueRule: "greppable: one word, not a phrase; the explanation follows after a dash",
}

// An optional document may not exist (the first exchange with the operator). Absence is DECLARED
// text, not an empty block: the role must SEE that there are no answers rather than infer it from
// emptiness. The string lives here because the role quotes it ($START_INPUT) and the composer
// substitutes it — two consumers of one requirement.
export const ABSENT_DOC = "(no operator answers yet)"

// A SUBAGENT'S PROMPT LANGUAGE is English, and that is a property of the participant, not a taste.
// The pipeline's model (S11: a literal in workflows/izi.js, the role gilb.md) is 27B: for it, mixing
// languages in one context eats the very structural density the $START_<LAYER> markup exists for.
//
// The threshold is PER LINE, and that is not an implementation detail. A per-file share does not hold
// the rule: a Russian paragraph pasted into an English role gives 0.017 over the file — under any
// sane ceiling — and the lint stays silent. Verified by reintroducing the defect, not by reasoning. A
// LINE, by contrast, is either written in Russian or it is not.
//
// The scope is every PROMPT this repository writes for a model: a step's role.md, its order.tpl and
// the router prompts/izi.md. The router was the one exception while its text quoted the acceptance
// script's Russian output verbatim; it no longer does — it delegates a pause's wording to
// workflows/izi.js::askOperator — so the exception is gone with its reason. What stays Russian is
// what the OPERATOR reads: a question's subject, a `blocked` diagnosis, log() and docs/*.md.
//
// $START_EXAMPLE is excluded from the check on purpose: an example shows an input and an artifact,
// and their language is set by the order, not by the role (F16, standards/role.md). An English
// example with a Russian fixture inside it is legal; an English role with a Russian strategy is not.
export const PROMPT_LANG = Object.freeze({
  code: "en",
  maxCyrillicPerLine: 0.5,
  scope: "every prompt this repo writes: steps/<id>/role.md, its order.tpl and prompts/izi.md",
})

// --- Prompt layers --------------------------------------------------------------------------------
//
// A role and an order are DIFFERENT texts with different lifetimes. A role answers "what am I allowed
// to do at all" and lives in the system prompt (loaded once per session). An order is "what exactly
// today", and it is substituted on EVERY call. An item repeated in both is paid for by call count.

// THE SET OF LAYERS IS CLOSED, and it is closed HERE. The registry used to know only six system
// names while one role opened a seventh layer ($START_LAW) and two others an eighth ($START_LINKS),
// and nothing turned red: missingLayers judges what is lacking, and nobody saw the excess. A layer
// living in one role out of three stops being a typing of context and becomes decoration — the set of
// slots must be ONE for every role, or the markup gives the model nothing it was introduced for.
//
// LAW is neither decoration nor half of ROLE: ROLE answers "who you are", LAW answers "what stays
// true however the turn unfolds". Invariants scattered across ROLE/FORBIDDEN/STRATEGY read as local
// caveats, and a role negotiates with them at the first inconvenient input.
//
// TOOLS is declared but NOT required: the layer exists for runners that cannot express a path map as
// a permission and print the border in words instead of as a right. In izi-pi-v2 today (S11) there is
// no such runner — `gilb`'s rights come from the role's own `tools:` frontmatter, TOOLS is empty in
// the role's source and must stay so: it is not written by hand.
export const SYSTEM_LAYERS = ["ROLE", "LAW", "INPUT", "TOOLS", "STRATEGY", "FORBIDDEN", "OUTPUT_FORMAT", "EXAMPLE", "LINKS"]

// DOCUMENT and CONTENT are layers INSIDE DATA: an order declares each document separately (its path
// and what it is), and the bytes travel in their own block. Their absence from the registry was the
// hole: the lint on foreign layers would have turned red on a legitimate order.
export const USER_LAYERS = ["TASK", "DATA", "DOCUMENT", "CONTENT", "CONSTRAINTS", "OUTPUT"]

// Every system layer is required except TOOLS (the installer writes that one, see above). INPUT and
// EXAMPLE are not decoration:
// INPUT   — without it a role guesses what arrived and goes searching the repository;
// EXAMPLE — one end-to-end pass "input → steps → return" is cheaper than any explanation.
export const REQUIRED_SYSTEM = SYSTEM_LAYERS.filter((l) => l !== "TOOLS")
export const REQUIRED_USER = ["TASK", "DATA", "OUTPUT"]

// FUNCTION_CONTRACT: layersOf — which prompt layers a $START_<NAME> marker opens in the text
//   Input:        text — a role's or an order's text; type unconstrained
//   Dependencies: —
//   Antecedent:   any value — undefined/null are valid input, coerced with String(text || "")
//   Consequent:   success: string[] — layer names in the order their $START_<NAME> marker appears;
//                          text absent/empty → String(text || "") = "" → [] is returned;
//                          a marker occurring N times yields its NAME N times — duplicates are not
//                          collapsed, matchAll returns every match separately; the paired
//                          $END_<NAME> is not checked — a layer opened without being closed still
//                          reaches the list, and pairing is missingLayers' concern, not this
//                          function's
//                 failure: none — total for any input
export function layersOf(text) {
  const found = []
  for (const m of String(text || "").matchAll(/\$START_([A-Z_]+)/g)) found.push(m[1])
  return found
}

// FUNCTION_CONTRACT: missingLayers — which declared layers the text lacks
//   Input:        text — a role's or an order's text; coerced to a string, type unconstrained
//   Dependencies: required — the registry of mandatory layers (REQUIRED_SYSTEM or REQUIRED_USER)
//   Antecedent:   required is an array of layer names; text is any value
//   Consequent:   success: the subset of `required` the text does not hold. A layer counts as ABSENT
//                          when at least one holds: there is no $START_<NAME> marker, or no closing
//                          $END_<NAME> — an opened but unclosed layer is indistinguishable from an
//                          absent one to anyone reading the text top to bottom
//                 failure: none — total over the array
// The registry arrives as a DEPENDENCY, not as a selector. The old signature was (text, kind), where
// kind changed the consequent — a second data argument dressed as a parameter: the function did two
// different things, choosing between them by a string. Now it does one, and which set is required is
// decided by the caller, who is the one holding that fact.
export function missingLayers(text, required) {
  const have = new Set(layersOf(text))
  return required.filter((l) => !have.has(l) || !String(text).includes(`$END_${l}`))
}

// FUNCTION_CONTRACT: extraLayers — which layers of the text the registry does not declare
//   Input:        text — a role's or an order's text; coerced to a string, type unconstrained
//   Dependencies: allowed — the registry of permitted layers (SYSTEM_LAYERS or USER_LAYERS)
//   Antecedent:   allowed is an array of layer names; text is any value
//   Consequent:   success: the names of layers opened in the text that are not in `allowed`, WITHOUT
//                          repetition, in order of first appearance; no text or empty → []
//                 failure: none — total
// A mirror of missingLayers, and it exists because a lack and an excess are DIFFERENT defects: the
// first makes a role unassemblable, the second quietly widens the prompt's grammar, and the set of
// slots stops being common to every role.
export function extraLayers(text, allowed) {
  const known = new Set(allowed)
  return [...new Set(layersOf(text))].filter((l) => !known.has(l))
}

// FUNCTION_CONTRACT: withoutExample — the instructive part of a prompt, without its EXAMPLE layer
//   Input:        text — a role's text; coerced to a string, type unconstrained
//   Dependencies: —
//   Antecedent:   any value; the markers need not be paired
//   Consequent:   success: the text with every $START_EXAMPLE..$END_EXAMPLE block cut out; no block,
//                          or an unclosed one → the text is returned as it is
//                 failure: none — total
// Needed where a role's WORDING is judged rather than its example: an order sets an example's language.
export function withoutExample(text) {
  return String(text || "").replace(/\$START_EXAMPLE[\s\S]*?\$END_EXAMPLE/g, "")
}

// FUNCTION_CONTRACT: cyrillicRatio — the share of Cyrillic among a text's letters
//   Input:        text — any text; coerced to a string, type unconstrained
//   Dependencies: —
//   Antecedent:   any value
//   Consequent:   success: a number 0..1 — Cyrillic letters divided by all letters; no letters in the
//                          text (empty, digits, markup) → 0, never a division by zero
//                 failure: none — total
// The SHARE is judged, not the presence: a single term, a file name or a quotation from somebody
// else's artifact are legal in an English prompt; a paragraph of prose is not. The threshold is
// declared in PROMPT_LANG, not here.
export function cyrillicRatio(text) {
  const s = String(text || "")
  const letters = s.match(/\p{L}/gu)
  if (!letters) return 0
  return letters.filter((c) => /[Ѐ-ӿ]/.test(c)).length / letters.length
}
