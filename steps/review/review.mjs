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
//             CODE_CULPRIT · CODE_OWNER · CODE_EVIDENCE · OPERATOR_NOTE — the four functions of a code
//             frdIds(frd) -> Set<string> — every id the FRD offers as an address; also the input
//               steps/intake/frd.mjs::checkFrd's F9 resolves a rewind's evidence against
//             parseReview(xml) -> { verdict, blockers[] }
//             newReview({ xml, plan, frd }) -> Result<{ verdict, blockers[] }, cls>

import { ok, err } from "../../core/result.mjs"
import { attrs, elem, tag } from "../../core/xml.mjs"

// 2 — D21: `<covers item node/>`, the checklist the role fills instead of judging "as a whole", and
//     the three codes it makes expressible. Additive: a grammar-1 file is a grammar-2 file with no
//     `<covers>`, which R5 now refuses — and refusing it is the point.
export const GRAMMAR_VERSION = 2

// The judgements of step 11, as the machine knows them. Everything the band could already compute was
// left out of this list on purpose (docs/review.md §3): a code here costs a role call per run, so it
// exists only for a finding no script can make — with ONE exception, `open-question`, which costs no
// role call at all (autoFindings) and is listed here only so the vocabulary has one place.
//
// BUG_FIX_CONTEXT: live run c64dbd32 (sandbox/runbox/quarkus-rest-json-app-v2-t2). Step 11 returned
//   `Pass` with no findings on a plan carrying three defects, and TWO of them were inexpressible:
//   - a node the requirement never asked for (`toggle`, synthesised by steps/plan/plan.mjs:190 out of
//     a spine answer, not out of the FRD). The role was FORBIDDEN to look — steps/review/critic.md
//     said "the plan's nodes come from the FRD's own touched paths and deltas, so a node nothing asks
//     for cannot occur", and that premise is false for every node plan.mjs synthesises itself;
//   - an FRD `<ext>` branch nobody delivers, and an open `<question>` that reached the plan
//     unanswered: `frdIds` below knew neither, so R4 would have REJECTED the honest finding as
//     evidence that resolves to nothing.
//   The third — a node whose only check command cannot witness it — had no code at all.
export const CODES = Object.freeze([
  "unreachable-antecedent",
  "goal-not-delivered",
  "open-question",
  "node-not-required",
  "unverifiable-node",
])

// Three functions OF the code, not three questions to the role. Asking a model for a value a table
// derives, and then spending a guardrail rule on checking that value, is paying twice for no
// decision at all (docs/review.md §4) — so the role writes none of these.
export const CODE_CULPRIT = Object.freeze({
  "unreachable-antecedent": "plan-index.json",
  "goal-not-delivered": "frd.xml",
  "open-question": "frd.xml",
  "node-not-required": "appgraph.xml",
  // Not frd.xml: verifiability is a property of the REPOSITORY (which suites exist), and the map is
  // what says so. Naming frd.xml as the culprit pointed step 6 at a document it cannot fix this with
  // — no rewording of a requirement creates a suite (live run 508d74fa; CODE_OWNER, below).
  "unverifiable-node": "appgraph.xml",
})

// The step that OWNS the culprit artifact — the address the band routes the repair to
// (docs/review.md §6): 10 is a script, so its fix is a substitution; 6 has a role, so its fix is a
// re-delegation with the blocker in FEEDBACK.
// `operator` is the third kind of address, and it exists because the band has no machine repair for
// it: a node the plan built out of a SPINE answer (steps/plan/plan.mjs:190) is wrong because the map
// is wrong, and rewinding to step 6 cannot touch the map. The run stops and says so, with the finding
// in hand — which is the honest end, not a silent Pass (workflows/izi.js::band).
// BUG_FIX_CONTEXT: live run 508d74fa (sandbox/runbox/quarkus-rest-json-app-v2-t2). `unverifiable-node`
//   owned step 6, so the band rewound to intake with the honest finding in FEEDBACK. Step 6 has no
//   repair for "no suite exercises this node" — F2 forbids a touched/delta on a test (frd.mjs:238),
//   and no rewording of the requirement creates one — so the role did the only thing that silences the
//   blocker: it deleted the page from the requirement (`<touched>` emptied, `S2@nodes` cut). The plan
//   collapsed from 3 nodes to 1 and R2 of the BRD stopped being delivered by anyone, unremarked. The
//   run then deadlocked a different way when the role tried the honest repair instead (§ review.mjs
//   frdIds, below) — but the deadlock is a SEPARATE defect from the ownership one this fixes.
export const CODE_OWNER = Object.freeze({
  "unreachable-antecedent": 10,
  "goal-not-delivered": 6,
  "open-question": 6,
  "node-not-required": "operator",
  // No step owns this repair: unlike `goal-not-delivered`, whose carrier is always expressible in FRD
  // grammar (a touched, a delta, a scenario), verifiability never is — it is a fact of what suites
  // exist, and step 6 is forbidden from touching that fact. `operator` is honest here for the same
  // reason it is honest for `node-not-required`: the band stops and shows the finding instead of
  // deleting the requirement to reach a green.
  "unverifiable-node": "operator",
})

// The KIND of evidence a code takes, and it is not a matter of taste: `unreachable-antecedent` says
// "this node needs that node", and the pair IS the missing edge that steps/plan/plan.mjs applies. An
// FRD id in that slot names no edge, so the finding would be true and unusable — and a blocker the
// band cannot act on is what this whole module exists to reject.
export const CODE_EVIDENCE = Object.freeze({
  "unreachable-antecedent": "plan",
  "goal-not-delivered": "frd",
  "open-question": "frd",
  // The address IS the evidence: the finding is "this node answers to nothing in the FRD", and the
  // node's own id is the whole of it. Demanding an FRD id here would be demanding the very thing the
  // finding says does not exist.
  "node-not-required": "self",
  "unverifiable-node": "frd",
})

// The words the OPERATOR reads for a code whose owner is `operator` (CODE_OWNER, above) — the one
// address the band has no machine repair for. A role never writes this: it is a function OF THE CODE,
// the same device CODE_CULPRIT and CODE_OWNER are, so the escalation's `evidence` is derived here once
// instead of being composed in prose at the call site (workflows/izi.js::band used to hardcode the
// `node-not-required` sentence at the one call site that existed; a second `operator` code with a
// different honest end would have had nowhere to put its own words without this table).
export const OPERATOR_NOTE = Object.freeze({
  "node-not-required": "чинится оператором: узел плана выведен из ответа карты, а не из требования — перемотка полосы над картой не властна",
  // The three honest ends of an unverifiable node (docs/review.md §6; live run 508d74fa's diagnosis)
  // — none of them a machine repair, which is the whole reason this code's owner is `operator` and not
  // step 6.
  "unverifiable-node": "чинится оператором: ни одна команда сценария не наблюдает узел, а требование не гасят удалением его из FRD — три честных выхода: 1) завести сьют, исполняющий узел, и перезапустить полосу; 2) снять требование правкой TASK.md/BRD (не FRD) и перезапустить; 3) принять неверифицируемость сознательно — механизма waiver этот наряд не заводит, повторный прогон упрётся в ту же остановку",
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
  // `<covers item node/>` — the checklist row the role closed by naming the plan node that answers it.
  // Self-closing, so `tag`, not `elem`: it carries no text, and a row that needed prose would be a
  // blocker instead.
  const covers = [...s.matchAll(tag("covers"))].map((m) => {
    const a = attrs(m[1])
    return { item: (a.item || "").trim(), node: (a.node || "").trim() }
  })
  // `<witness node cmd/>` — R6's answer: WHICH command executes a node that has none of its own. The
  // command is copied from the order's list, and the machine checks it against the plan: naming a
  // node is easy, naming a command is a decision.
  const witness = [...s.matchAll(tag("witness"))].map((m) => {
    const a = attrs(m[1])
    return { node: (a.node || "").trim(), cmd: (a.cmd || "").trim() }
  })
  return { verdict, blockers, covers, witness, found: Boolean(head) }
}

// frdIds — every identifier the FRD offers as an address, in ONE expression.
// A use case, a scenario, a failure's code and a delta's operation — plus, since D21, the addresses
// the role could previously SEE a defect at and not name: an extension of a use case (`UC1/2a`), an
// NFR by its subject, an open question by its subject, and — since the fix for live run 508d74fa — a
// use case's OWN `<post>` (`UC1/post`), mirroring owedItems below. Nothing else is an id — a phrase
// out of the goal is prose.
//
// This set is what R4 resolves evidence against, so an id missing from here is not a cosmetic gap: it
// turns an honest finding into a red FORM and the role, re-delegated, learns to stop making it. Live
// run c64dbd32 lost the `<ext>` branch «фрукт не найден» exactly that way; live run 508d74fa lost
// `UC*/post` the same way, and there it was worse: R5 already OWES a `<covers>` or a blocker for
// every `<post>` (owedItems, below), so a `goal-not-delivered` blocker naming that same row's id as
// its evidence was refused by R4 for not being an FRD id — a deadlock between two rules the role could
// not honestly escape (steps/review/review.test.mjs, "R4: goal-not-delivered резолвит UC2/post").
//
// EXPORTED: steps/intake/frd.mjs::checkFrd (F9) resolves a rewind's evidence against this same set —
// one expression of "what is an FRD id", not two that could drift.
export const frdIds = (frd) => new Set([
  ...((frd && frd.usecases) || []).map((u) => (u && u.id) || ""),
  ...((frd && frd.usecases) || []).filter((u) => u && u.id && u.post).map((u) => `${u.id}/post`),
  ...((frd && frd.usecases) || []).flatMap((u) => ((u && u.exts) || []).map((x) => `${(u && u.id) || ""}/${(x && x.id) || ""}`)),
  ...((frd && frd.scenarios) || []).map((s) => (s && s.id) || ""),
  ...((frd && frd.failures) || []).map((f) => (f && f.code) || ""),
  ...((frd && frd.deltas) || []).map((d) => (d && d.op) || ""),
  ...((frd && frd.nfrs) || []).map((n) => (n && n.subject ? `nfr:${n.subject}` : "")),
  ...((frd && frd.questions) || []).map((q) => (q && q.subject) || ""),
].filter(Boolean).map((x) => String(x).trim()).filter((x) => !x.endsWith("/")))

// FUNCTION_CONTRACT: owedItems — the checklist: what this plan OWES the FRD, item by item
//   Input:        frd — parseFrd's parse; plan — the parsed plan-index
//   Dependencies: —
//   Antecedent:   any values; absences read as empty
//   Consequent:   success: [{ id, what }] — one row per thing the plan must answer for, with a
//                          MACHINE-GENERATED id the role copies rather than composes (CLAUDE.md
//                          constraint 4). Rows: `<post>` of every use case, `after` of every scenario,
//                          every `<ext>` of every use case, every `<nfr>` by subject — and one row per
//                          plan node the FRD does not name anywhere, which is the half that catches a
//                          node nobody asked for
//                 failure: none — total
//   Purity:       pure
//
// WHY A LIST AND NOT A LAW. Until D21 the role was asked to judge "does the plan deliver the goal",
// and answered as a whole — which is how three defects passed unremarked. A list cannot be answered
// as a whole: every row is closed by a `<covers>` or by a blocker, and R5 counts. The role stops
// having to REMEMBER what the FRD contained; it is in front of it.
export function owedItems(frd, plan) {
  const rows = []
  for (const u of (frd && frd.usecases) || []) {
    const id = (u && u.id) || ""
    if (!id) continue
    if (u.post) rows.push({ id: `${id}/post`, what: u.post })
    for (const x of (u.exts) || []) {
      if (x && x.id) rows.push({ id: `${id}/${x.id}`, what: `ветвление: ${x.outcome || x.error || "(без описания)"}` })
    }
  }
  for (const s of (frd && frd.scenarios) || []) {
    if (s && s.id) rows.push({ id: s.id, what: `сценарий: ${s.after || "(без after)"}` })
  }
  for (const n of (frd && frd.nfrs) || []) {
    if (n && n.subject) rows.push({ id: `nfr:${n.subject}`, what: `ограничение: ${n.fit || "(без fit)"}` })
  }
  // The other half. A node the FRD names nowhere was put into the plan by the SCRIPT — out of a
  // spine answer or as a scenario carrier (steps/plan/plan.mjs) — and the requirement never asked
  // for it. The role must decide about each such node explicitly; `named` is the whole vocabulary of
  // paths the FRD offers.
  const named = new Set([
    ...((frd && frd.touched) || []),
    ...((frd && frd.deltas) || []).map((d) => (d && d.node) || ""),
    ...((frd && frd.scenarios) || []).flatMap((s) => String((s && s.nodes) || "").split(/\s+/)),
  ].filter(Boolean))
  for (const n of (plan && plan.nodes) || []) {
    const id = (n && n.id) || ""
    if (!id || named.has(id) || id.startsWith("scenario:")) continue
    rows.push({ id, what: `узел плана, которого FRD не называет${n.mechanism ? ` — механизм «${n.mechanism}»` : ""}` })
  }

  return rows
}

// FUNCTION_CONTRACT: autoFindings — the findings that cost no role call at all
//   Input:        { frd } — parseFrd's parse
//   Dependencies: —
//   Antecedent:   any value
//   Consequent:   success: blockers[{ code, node, evidence, text }] — one per open `<question>` of
//                          the FRD. `node` is synthetic (`question:<subject>`) because the finding is
//                          about the requirement, not about a node, and R3 is not applied to it
//                 failure: none — total
//   Purity:       pure
//
// An open question is a LEGAL output of step 6 (core/findings.mjs::OUT_OF_ROUNDS) — and until D21 it
// had no reader at all: steps/intake/frd.mjs parsed `questions`, and nothing in the band consumed
// them. Live run c64dbd32 shipped `<question subject="fruit-not-found"/>` straight past steps 9, 10
// and 11 into a green plan whose implementation would have guessed the answer. Computing this needs
// no judgement, so it costs no tokens (docs/concept.md, rule 3).
export function autoFindings({ frd } = {}) {
  return ((frd && frd.questions) || []).map((q) => Object.freeze({
    code: "open-question",
    node: `question:${(q && q.subject) || ""}`,
    evidence: (q && q.subject) || "",
    text: `требование не выяснено: ${(q && q.why) || (q && q.subject) || ""} — план построен без ответа, реализация угадает его сама`,
  })).filter((b) => b.evidence)
}

// FUNCTION_CONTRACT: reachedBy — what a suite's tests can observe, walked over the map's edges
//   Input:        map — parseMap's parse; suite — a suite id
//   Dependencies: —
//   Antecedent:   map may be null and the suite unknown — both answer an empty set
//   Consequent:   success: Set<path> — the tests of that suite and everything their execution
//                          travels to along `<edge from to>`. The direction is the one the map
//                          records: `from` uses `to`, so a test reaches what it calls, and a page
//                          calling an endpoint does NOT make the endpoint's test reach the page
//                 failure: none — total
//   Purity:       pure
export function reachedBy(map, suite) {
  const seen = new Set()
  if (!map || !suite) return seen
  const out = new Map()
  for (const e of map.edges || []) {
    if (!out.has(e.from)) out.set(e.from, [])
    out.get(e.from).push(e.to)
  }
  const queue = []
  for (const rows of (map.nodeTests || new Map()).values()) {
    for (const t of rows || []) if (t.suite === suite && t.path) queue.push(t.path)
  }
  while (queue.length) {
    const at = queue.shift()
    if (seen.has(at)) continue
    seen.add(at)
    for (const next of out.get(at) || []) queue.push(next)
  }
  return seen
}

// FUNCTION_CONTRACT: newReview — the critic's file judged as a verdict the band can act on
//   Input:        { xml, plan, frd, map }
//                 xml  — the staged review as the role wrote it
//                 plan — the parsed `.agent/plan-index.json` object (io reads the JSON)
//                 frd  — parseFrd's parse of `.agent/frd.xml`
//                 map  — steps/intake/map.mjs::parseMap of `.agent/appgraph.xml`, or null. R6's
//                        reachability operand: `nodeTests` says which tests a module has, `edges`
//                        say where a test's execution can travel. With no map the half stays silent
//                        (no sources, no judgement — the device `known: null` uses in steps/design)
//   Dependencies: parseReview, frdIds, CODES, CODE_CULPRIT, CODE_OWNER, CODE_EVIDENCE
//   Antecedent:   any values — every absence below is a named refusal, never a default
//   Consequent:   success: { verdict, blockers[{ code, node, evidence, culprit, owner, text }] } —
//                          `culprit` and `owner` derived here, never read from the role's file
//                 failure: "empty"          — no <review> element at all: the role wrote nothing
//                          "no-plan"        — the plan carries no node, so no finding can resolve
//                          "invalid-review" — R1..R4; the detail is the blockers, joined the way
//                                             newBrd/newDesign join theirs, and it rides in FEEDBACK
//   Purity:       pure
export function newReview({ xml, plan, frd, map = null } = {}) {
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
    // `open-question` is about the REQUIREMENT, not about a node: its address is synthetic and there
    // is no plan node to point at — that is precisely what the finding says.
    if (b.code !== "open-question" && !nodeIds.has(b.node)) {
      B.push(`R3 ${where} (${b.code}): node="${b.node}" не узел плана — адрес обязан быть id из .agent/plan-index.json`)
    }
    const kind = CODE_EVIDENCE[b.code]
    if (kind === "plan" && !nodeIds.has(b.evidence)) {
      B.push(`R4 ${where} (${b.code}): evidence="${b.evidence}" не узел плана — для этого кода улика есть НЕДОСТАЮЩЕЕ РЕБРО, то есть id узла, которого не хватает`)
    }
    if (kind === "self" && b.evidence !== b.node) {
      B.push(`R4 ${where} (${b.code}): evidence="${b.evidence}" — для этого кода улика ЕСТЬ сам адрес: повтори id узла, которого требование не просило`)
    }
    if (kind === "frd" && !ids.has(b.evidence)) {
      B.push(`R4 ${where} (${b.code}): evidence="${b.evidence}" не id FRD — назови use case, сценарий, код отказа или op дельты, которую план не выполняет`)
    }
    if (!b.text) B.push(`R4 ${where} (${b.code}): текст блокера пуст — оператору и роли починки читать нечего`)
  }

  // R5 — COMPLETENESS. Every row the plan owes is closed exactly once: by a `<covers>` naming a plan
  // node, or by a blocker whose evidence IS that row. "As a whole, yes" stops being expressible — a
  // Pass with an unfilled table is a red FORM, re-delegated, not a verdict.
  const owed = owedItems(frd, plan)
  const claimed = new Map()
  for (const c of parsed.covers) claimed.set(c.item, (claimed.get(c.item) || 0) + 1)
  const byEvidence = new Set(parsed.blockers.map((b) => b.evidence))
  const byNode = new Set(parsed.blockers.map((b) => b.node))
  for (const row of owed) {
    const covered = claimed.get(row.id) || 0
    const blamed = byEvidence.has(row.id) || byNode.has(row.id)
    if (!covered && !blamed) {
      B.push(`R5 пункт "${row.id}" (${row.what}) не закрыт: ни <covers item="${row.id}" node="…"/>, ни блокера с этим id — «в целом да» не ответ`)
    } else if (covered > 1) {
      B.push(`R5 пункт "${row.id}" закрыт ${covered} раз — один пункт, одна строка`)
    }
  }
  // R7 — a row is closed by a node that can plausibly ANSWER it. R5 counts that every row is closed
  // once and that the node exists; until D21+R2 nothing checked the two had anything to do with each
  // other, and run 79650c98 shipped `<covers item="S1" node="scenario:S2"/>` — a scenario that lives
  // on another node entirely — inside a green Pass. The operands are already in parseFrd.
  const scenarioNodes = (id) => {
    const sc = ((frd && frd.scenarios) || []).find((x) => x && String(x.id).trim() === id)
    return sc ? [`scenario:${id}`, ...String(sc.nodes || "").split(/\s+/).filter(Boolean)] : null
  }
  const ucNodes = (uc) => {
    const own = ((frd && frd.scenarios) || []).filter((x) => x && String(x.uc || "").trim() === uc)
    return own.length ? own.flatMap((x) => [`scenario:${String(x.id).trim()}`, ...String(x.nodes || "").split(/\s+/).filter(Boolean)]) : null
  }
  const allowedFor = (item) => {
    if (item.startsWith("nfr:")) return null                       // an NFR has no node of its own in the FRD
    if (item.includes("/")) return ucNodes(item.split("/")[0])     // UC1/post, UC1/2a
    return scenarioNodes(item)                                     // S1, S2 — and a plan node id falls through
  }

  const owedIds = new Set(owed.map((r) => r.id))
  for (const c of parsed.covers) {
    if (!owedIds.has(c.item)) B.push(`R5 <covers item="${c.item}"/> — такого пункта в списке нет; пункты выдаёт машина, их не сочиняют`)
    else if (!nodeIds.has(c.node)) B.push(`R5 <covers item="${c.item}" node="${c.node}"/> — node не узел плана`)
    else {
      const allowed = allowedFor(c.item)
      if (allowed && !allowed.includes(c.node)) {
        B.push(`R7 <covers item="${c.item}" node="${c.node}"/> — этот узел к пункту отношения не имеет; пункт живёт на ${allowed.join(" · ")}`)
      }
    }
  }

  // R6 — THE SECOND TABLE GETS ITS OWN RULE. A code node with no check command of its own is closed by
  // somebody else's command, and that command may execute nothing the node does. Until R2 the order
  // handed the role that list (`{UNCHECKED}`) and no rule demanded an answer — so on run 79650c98 the
  // role passed over `fruits.html`, closed by java suites that never open a page, and the verdict was
  // Pass. A table with no counting rule is a suggestion.
  //
  // The answer is the COMMAND, not the node: naming the node is free, naming which of its scenarios'
  // commands executes it is a decision. The command is copied from the order's list and checked here
  // against the plan. Whether that command would actually turn red stays step 16's fact — this rule
  // is about reachability, and the residual risk of a false witness is named, not hidden.
  const nodeById = new Map(((plan && plan.nodes) || []).map((n) => [(n && n.id) || "", n]))
  for (const n of ((plan && plan.nodes) || [])) {
    if (!n || n.kind !== "code" || ((n.check || []).length)) continue
    const mine = parsed.witness.filter((w) => w.node === n.id)
    const blamed = parsed.blockers.some((b) => b.node === n.id)
    if (!mine.length && !blamed) {
      B.push(`R6 узел ${n.id} без своей команды: нет ни <witness node cmd/>, ни блокера — назови команду, которая его ИСПОЛНЯЕТ, либо скажи блокером, что такой нет`)
      continue
    }
    if (mine.length > 1) { B.push(`R6 узел ${n.id}: ${mine.length} <witness> — одна команда, одна строка`); continue }
    if (!mine.length) continue
    const checks = (n.coveredBy || []).flatMap((sc) => ((nodeById.get(sc) || {}).check) || [])
    const cmds = checks.map((c) => c.cmd)
    if (!cmds.includes(mine[0].cmd)) {
      B.push(`R6 <witness node="${n.id}" cmd="${mine[0].cmd}"/> — такой команды нет среди команд его сценариев (${cmds.join(" · ") || "их нет вовсе"}): команда КОПИРУЕТСЯ из списка, не сочиняется`)
      continue
    }

    // R6, the half the map decides. A copied command is not yet a witness: it has to be able to
    // OBSERVE the node. The map answers that without a word from the role — a suite's tests are
    // `<test suite=…>` rows, and where their execution can travel is `<edge from to>`. A node no
    // test of that suite reaches is not witnessed by it, and the only honest answer left is the
    // blocker `unverifiable-node`, which the machine writes itself rather than asking again.
    //
    // BUG_FIX_CONTEXT: live runs 79650c98 and 0aa13bff, both on quarkus-rest-json-app-v2-t2. The
    //   critic closed `…/fruits.html` — a static AngularJS page — with `mvn verify -Pnative`, a java
    //   suite that never opens a page, and both verdicts were Pass. The page's `fanin="0"` was in the
    //   map all along: no test leads to it, and nothing but a role's word said otherwise.
    if (map) {
      const suites = new Set(checks.filter((c) => c.cmd === mine[0].cmd).map((c) => c.suite).filter(Boolean))
      const reachable = suites.size && [...suites].some((id) => reachedBy(map, id).has(n.id))
      if (!reachable) {
        B.push(`R6 <witness node="${n.id}" cmd="${mine[0].cmd}"/> — эту команду не исполняет ни один тест, доходящий до узла: в карте нет пути от тестов сьюта до ${n.id}. Узел непроверяем — блокер unverifiable-node, а не свидетель`)
      }
    }
  }

  if (B.length) return err("invalid-review", B.join("\n  "))

  const blockers = parsed.blockers.map((b) => Object.freeze({
    ...b,
    culprit: CODE_CULPRIT[b.code],
    owner: CODE_OWNER[b.code],
    // "" for every owner but `operator` — OPERATOR_NOTE has no other rows, and the band never reads
    // this field for a repair it routes to a step or a script (workflows/izi.js::band).
    note: OPERATOR_NOTE[b.code] || "",
  }))
  return ok(Object.freeze({ verdict: parsed.verdict, blockers: Object.freeze(blockers) }))
}
