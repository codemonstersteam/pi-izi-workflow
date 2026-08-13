// MODULE_CONTRACT: review — step 11's pure core: the critic's verdict, judged by FORM and by whether
//             every finding RESOLVES against the two artifacts it was made about
// Purpose:    one decision — what makes a blocker usable. The critic's judgement itself is not
//             checkable here (it is prose against prose, which is why a model makes it); what IS
//             checkable is that the finding carries an address the band can act on: a node of the
//             plan and an evidence of the kind its code takes. That is the whole difference between
//             a blocker the pipeline REPAIRS (docs/review.md §6) and an impression it can only print.
//             PURE: knows no disk; the io — erasing, reading three files, promoting one — is in
//             ext/index.mjs.
// io:         none
// EXTERNAL_DEPENDENCY: steps/intake/frd.mjs — parseFrd, done by the CALLER and handed in. The FRD's
//             grammar is the intake slice's, and a second reader of it here would be a second
//             grammar to keep in step.
// EXTERNAL_DEPENDENCY: steps/review/critic.md — the role states the same two codes in its LAW, and
//             review.test.mjs fails when the role and CODES disagree: the role is what the model
//             reads, CODES is what runs.
// Invariants: newReview is TOTAL — any input, including undefined, yields a Result and never throws
//             (an artifact outlives the run that wrote it); `culprit` and `owner` are NEVER read out
//             of the role's file, they are derived from the code, so the model cannot address its own
//             finding at a step that did not produce the artifact.
// Interface:  GRAMMAR_VERSION — stamped on the artifact
//             CODES — the closed vocabulary of blocker codes, the ONE copy
//             CODE_CULPRIT · CODE_OWNER · CODE_EVIDENCE — the three functions of a code
//             parseReview(xml) -> { verdict, blockers[] }
//             newReview({ xml, plan, frd }) -> Result<{ verdict, blockers[] }, cls>

import { ok, err } from "../../core/result.mjs"
import { attrs, elem, tag } from "../../core/xml.mjs"

export const GRAMMAR_VERSION = 1

// The two judgements of step 11, as the machine knows them. Everything the band could already
// compute was left out of this list on purpose (docs/review.md §3): a code here costs a role call
// per run, so it exists only for a finding no script can make.
export const CODES = Object.freeze(["unreachable-antecedent", "goal-not-delivered"])

// Three functions OF the code, not three questions to the role. Asking a model for a value a table
// derives, and then spending a guardrail rule on checking that value, is paying twice for no
// decision at all (docs/review.md §4) — so the role writes none of these.
export const CODE_CULPRIT = Object.freeze({
  "unreachable-antecedent": "plan-index.json",
  "goal-not-delivered": "frd.xml",
})

// The step that OWNS the culprit artifact — the address the band routes the repair to
// (docs/review.md §6): 10 is a script, so its fix is a substitution; 6 has a role, so its fix is a
// re-delegation with the blocker in FEEDBACK.
export const CODE_OWNER = Object.freeze({
  "unreachable-antecedent": 10,
  "goal-not-delivered": 6,
})

// The KIND of evidence a code takes, and it is not a matter of taste: `unreachable-antecedent` says
// "this node needs that node", and the pair IS the missing edge that steps/plan/plan.mjs applies. An
// FRD id in that slot names no edge, so the finding would be true and unusable — and a blocker the
// band cannot act on is what this whole module exists to reject.
export const CODE_EVIDENCE = Object.freeze({
  "unreachable-antecedent": "plan",
  "goal-not-delivered": "frd",
})

const VERDICTS = Object.freeze(["Pass", "Reject"])

// FUNCTION_CONTRACT: parseReview — the verdict's elements out of its text
//   Input:        xml — text of `.agent/staging/review.xml`; type unconstrained
//   Dependencies: core/xml.mjs
//   Antecedent:   any value — undefined/null/garbage read as no verdict and no blockers
//   Consequent:   success: { verdict, blockers[{ code, node, evidence, text }] } in appearance
//                          order; an absent attribute is "", never a default that could pass a rule
//                 failure: none — total
//   Purity:       pure
export function parseReview(xml) {
  const s = String(xml == null ? "" : xml)
  // matchAll, not match: tag() is global, and String.match with a global regexp returns the full
  // matches WITHOUT capture groups — the attribute body would silently come back as the second
  // occurrence of the tag. One shape covers both `<review …>` and `<review …/>`: the `/` of a
  // self-closing tag falls inside the attribute body and `attrs` ignores it.
  const [head] = [...s.matchAll(tag("review", ">"))]
  const verdict = head ? (attrs(head[1]).verdict || "").trim() : ""
  const blockers = []
  for (const m of s.matchAll(elem("blocker"))) {
    const a = attrs(m[1])
    blockers.push({
      code: (a.code || "").trim(),
      node: (a.node || "").trim(),
      evidence: (a.evidence || "").trim(),
      text: String(m[2] == null ? "" : m[2]).replace(/\s+/g, " ").trim(),
    })
  }
  return { verdict, blockers, found: Boolean(head) }
}

// frdIds — every identifier the FRD offers as an address, in ONE expression.
// A use case, a scenario, a failure's code and a delta's operation: the four things a `<post>` or an
// `after` can be traced back to. Nothing else is an id — a phrase out of the goal is prose.
const frdIds = (frd) => new Set([
  ...((frd && frd.usecases) || []).map((u) => (u && u.id) || ""),
  ...((frd && frd.scenarios) || []).map((s) => (s && s.id) || ""),
  ...((frd && frd.failures) || []).map((f) => (f && f.code) || ""),
  ...((frd && frd.deltas) || []).map((d) => (d && d.op) || ""),
].filter(Boolean).map((x) => String(x).trim()))

// FUNCTION_CONTRACT: newReview — the critic's file judged as a verdict the band can act on
//   Input:        { xml, plan, frd }
//                 xml  — the staged review as the role wrote it
//                 plan — the parsed `.agent/plan-index.json` object (io reads the JSON)
//                 frd  — parseFrd's parse of `.agent/frd.xml`
//   Dependencies: parseReview, frdIds, CODES, CODE_CULPRIT, CODE_OWNER, CODE_EVIDENCE
//   Antecedent:   any values — every absence below is a named refusal, never a default
//   Consequent:   success: { verdict, blockers[{ code, node, evidence, culprit, owner, text }] } —
//                          `culprit` and `owner` derived here, never read from the role's file
//                 failure: "empty"          — no <review> element at all: the role wrote nothing
//                          "no-plan"        — the plan carries no node, so no finding can resolve
//                          "invalid-review" — R1..R4; the detail is the blockers, joined the way
//                                             newBrd/newDesign join theirs, and it rides in FEEDBACK
//   Purity:       pure
export function newReview({ xml, plan, frd } = {}) {
  const parsed = parseReview(xml)
  if (!parsed.found) return err("empty", "в staging нет элемента <review> — роль не написала артефакт")

  const nodeIds = new Set((((plan && plan.nodes) || []).map((n) => (n && n.id) || "")).filter(Boolean))
  if (!nodeIds.size) return err("no-plan", "в .agent/plan-index.json нет ни одного узла — судить нечего")
  const ids = frdIds(frd)

  const B = []
  // R1. The verdict and its body must say the same thing. Both directions: a Pass carrying a blocker
  // hides a finding the band would never route, and a Reject with none stops the band on nothing.
  if (!VERDICTS.includes(parsed.verdict)) {
    B.push(`R1 verdict="${parsed.verdict}" — допустимо ${VERDICTS.join(" | ")}`)
  } else if (parsed.verdict === "Reject" && !parsed.blockers.length) {
    B.push("R1 verdict=Reject, но ни одного <blocker> — отказ без находки полосу не останавливает")
  } else if (parsed.verdict === "Pass" && parsed.blockers.length) {
    B.push(`R1 verdict=Pass при ${parsed.blockers.length} <blocker> — вердикт противоречит собственному телу`)
  }

  for (const [i, b] of parsed.blockers.entries()) {
    const where = `блокер ${i + 1}`
    // R2 first and alone: the code decides what the other rules mean, so an unknown code
    // short-circuits its blocker — three blockers for one defect cost the role three repairs.
    if (!CODES.includes(b.code)) {
      B.push(`R2 ${where}: code="${b.code}" вне словаря — допустимо ${CODES.join(" | ")}`)
      continue
    }
    if (!nodeIds.has(b.node)) {
      B.push(`R3 ${where} (${b.code}): node="${b.node}" не узел плана — адрес обязан быть id из .agent/plan-index.json`)
    }
    const kind = CODE_EVIDENCE[b.code]
    if (kind === "plan" && !nodeIds.has(b.evidence)) {
      B.push(`R4 ${where} (${b.code}): evidence="${b.evidence}" не узел плана — для этого кода улика есть НЕДОСТАЮЩЕЕ РЕБРО, то есть id узла, которого не хватает`)
    }
    if (kind === "frd" && !ids.has(b.evidence)) {
      B.push(`R4 ${where} (${b.code}): evidence="${b.evidence}" не id FRD — назови use case, сценарий, код отказа или op дельты, которую план не выполняет`)
    }
    if (!b.text) B.push(`R4 ${where} (${b.code}): текст блокера пуст — оператору и роли починки читать нечего`)
  }

  if (B.length) return err("invalid-review", B.join("\n  "))

  const blockers = parsed.blockers.map((b) => Object.freeze({
    ...b,
    culprit: CODE_CULPRIT[b.code],
    owner: CODE_OWNER[b.code],
  }))
  return ok(Object.freeze({ verdict: parsed.verdict, blockers: Object.freeze(blockers) }))
}
