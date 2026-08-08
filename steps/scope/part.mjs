// MODULE_CONTRACT: part — step 4 `scope`: one scout's answer about one plan cell, judged
// Purpose:    one decision — when a graph PART is closed enough to be merged by step 5. The part is
//             a fragment of the graph grammar, not a document: step 5 merges parts with a script,
//             and free markdown does not merge. Every rule here is about COMPOSITION (is the answer
//             complete), never about wording — a guardrail that judged the meaning of a phrase
//             burned three redelegations on a correct artifact in live run `ed1d4094`
//             (docs/workflow.md §3.2, S16). PURE: knows no disk; the io lives in ext/index.mjs.
// io:         none
// EXTERNAL_DEPENDENCY: core/xml.mjs — the tag scanner shared with steps/design; core/result.mjs —
//             the ok/err shape every factory in this repository returns.
// EXTERNAL_DEPENDENCY (conceptual, not an import): the `cell` argument is a cell of
//             `.agent/survey-plan.json`, produced by step 3 (steps/survey-plan/plan.mjs). Rules S1
//             and S2 compare the part against THAT list — the file list reaches the guardrail from
//             the plan by machine, never from the part being judged and never from the model.
// Invariants: parsePart is total — any input, including undefined, yields an empty part rather than
//             a throw; the rules and their numbers are declared ONCE, in docs/scope.md §3, and are
//             not restated in prose in the role or in the orders; a blocker always carries its rule
//             number and the path it is about, because its reader is the role in FEEDBACK, not a
//             human; the two cell kinds are dispatched by the `kind` FIELD, never by parsing text.
// Interface:  SPINE_ANSWERS — the five questions a spine part must answer, with their value keys
//             parsePart(xml) -> Part
//             checkPart({ part, cell }) -> string[]   — blockers; empty means green
//             newPart({ xml, cell }) -> Result<Part, "invalid-part">

import { ok, err } from "../../core/result.mjs"
import { attrs, ATTRS, tag } from "../../core/xml.mjs"

// SPINE_ANSWERS — the five questions the graph must answer (docs/concept.md, «Разведка»), as the
// elements a spine part carries. `keys` are the attributes that count as an ANSWER: at least one of
// them non-empty. `found="no"` is an equally valid answer everywhere here — a repository may have no
// toggle mechanism and no spec, and that is the operator's decision at step 10, not the scout's
// guess. The one exception is not expressed here: "no <suite> at all" stops the pipeline at STEP 5,
// which sees all the parts; this step must only report the truth.
export const SPINE_ANSWERS = Object.freeze([
  Object.freeze({ el: "suites", keys: [] }), // answered by <suite> elements, see checkSpine
  Object.freeze({ el: "build", keys: ["cmd"] }),
  Object.freeze({ el: "toggles", keys: ["mechanism"] }),
  Object.freeze({ el: "branching", keys: ["branches", "commits"] }),
  Object.freeze({ el: "contract", keys: ["spec", "validator"] }),
])

const SUITE_KEYS = ["id", "kind", "cmd", "path"] // `one` is deliberately absent: empty is valid
const text = (s) => String(s == null ? "" : s).trim()
const firstAttrs = (xml, name) => {
  const m = String(xml || "").match(new RegExp(`<${name}\\b${ATTRS}/?>`))
  return m ? attrs(m[1]) : null
}

// FUNCTION_CONTRACT: parsePart — a scout's part from its text
//   Input:        xml — the staged part as the role wrote it; type unconstrained
//   Dependencies: attrs, ATTRS, tag (core/xml.mjs)
//   Antecedent:   any value — undefined/null/garbage read as an empty part
//   Consequent:   success: { cell, kind, modules[], gaps[], suites[], answers{} } where
//                          modules = [{ path, role, api[], deps[], depsNone, tests[] }] in order of
//                          appearance; a `<module>` written self-closing is still collected (so it
//                          fails rule S3 with a diagnosis, instead of vanishing into rule S1);
//                          answers = { <el>: attrs|null } for the five SPINE_ANSWERS elements
//                 failure: none — total
//   Purity:       pure
//   Interface:    parsePart(xml: unknown) -> Part
export function parsePart(xml) {
  const src = String(xml || "")
  const root = firstAttrs(src, "part") || {}

  const modules = []
  const seen = new Set()
  for (const m of src.matchAll(tag("module", ">([\\s\\S]*?)</module>"))) {
    const a = attrs(m[1])
    const body = m[2]
    seen.add(a.path)
    modules.push(Object.freeze({
      path: a.path || "",
      depsNone: a.deps === "none",
      role: text((body.match(/<role>([\s\S]*?)<\/role>/) || [])[1]),
      api: Object.freeze([...body.matchAll(tag("api"))].map((x) => attrs(x[1]).name || "")),
      deps: Object.freeze([...body.matchAll(tag("dep"))].map((x) => attrs(x[1]).path || "")),
      tests: Object.freeze([...body.matchAll(tag("test"))].map((x) => {
        const t = attrs(x[1])
        return Object.freeze({ path: t.path || "", suite: t.suite || "" })
      })),
    }))
  }
  // A self-closing <module/> carries no <role>, so it can never be green — but it must still be
  // COLLECTED: otherwise its file reads as "not covered" (S1) and the role is told to write a module
  // it already wrote, instead of being told the module has no role (S3).
  for (const m of src.matchAll(tag("module"))) {
    const a = attrs(m[1])
    if (seen.has(a.path)) continue
    seen.add(a.path)
    modules.push(Object.freeze({ path: a.path || "", depsNone: a.deps === "none", role: "", api: Object.freeze([]), deps: Object.freeze([]), tests: Object.freeze([]) }))
  }

  return Object.freeze({
    cell: root.cell || "",
    kind: root.kind || "",
    modules: Object.freeze(modules),
    gaps: Object.freeze([...src.matchAll(tag("gap"))].map((g) => {
      const a = attrs(g[1])
      return Object.freeze({ path: a.path || "", why: text(a.why) })
    })),
    suites: Object.freeze([...src.matchAll(tag("suite"))].map((s) => Object.freeze(attrs(s[1])))),
    answers: Object.freeze(Object.fromEntries(SPINE_ANSWERS.map(({ el }) => [el, firstAttrs(src, el)]))),
  })
}

// checkSurvey — rules S1..S5 of docs/scope.md §3, for a cell of kind "survey".
function checkSurvey(part, cell) {
  const B = []
  const files = (cell.files || []).map((f) => f.path)
  const covered = new Set([...part.modules.map((m) => m.path), ...part.gaps.map((g) => g.path)].filter(Boolean))

  // S1 — coverage. A lost file is a lost graph node, and nobody will ever miss it: the merge at
  // step 5 sees only what the parts carry.
  for (const p of files) if (!covered.has(p)) B.push(`S1 ${cell.id}: file is closed by neither <module> nor <gap> — ${p}`)

  // S2 — no strangers. The scout does not pick its own files: a file from another cell arrives
  // twice, from two scouts, and the merge cannot tell which reading is the right one.
  const own = new Set(files)
  for (const p of [...part.modules.map((m) => m.path), ...part.gaps.map((g) => g.path)]) {
    if (p && !own.has(p)) B.push(`S2 ${cell.id}: path does not belong to this cell — ${p}`)
  }

  for (const m of part.modules) {
    // S3 — a node without a role is indistinguishable from a line of `ls`.
    if (!m.role) B.push(`S3 ${cell.id}: <module> has no <role> — ${m.path || "(no path)"}`)
    // S4 — dependencies are DECLARED, never omitted: a module with no edges and a module whose
    // edges were forgotten look identical in XML, and step 8 (`ripple`) is unrunnable without edges.
    if (!m.deps.length && !m.depsNone) B.push(`S4 ${cell.id}: neither <dep> nor deps="none" — ${m.path}`)
    for (const d of m.deps) {
      if (!d) B.push(`S4 ${cell.id}: <dep> with an empty path — ${m.path}`)
      else if (d === m.path) B.push(`S4 ${cell.id}: <dep> points at its own module — ${m.path}`)
    }
  }

  // S5 — "not read" without a reason is indistinguishable from "did not bother".
  for (const g of part.gaps) if (!g.why) B.push(`S5 ${cell.id}: <gap> has no why — ${g.path || "(no path)"}`)

  return B
}

// checkSpine — rules P1..P3 of docs/scope.md §3, for the cell of kind "spine".
function checkSpine(part, cell) {
  const B = []

  // P1 — all five answers present, each either with a value or explicitly found="no".
  for (const { el, keys } of SPINE_ANSWERS) {
    const a = part.answers[el]
    const answered = el === "suites"
      ? part.suites.length > 0 || (a && a.found === "no")
      : a && (a.found === "no" || keys.some((k) => text(a[k])))
    if (!answered) {
      B.push(el === "suites"
        ? `P1 ${cell.id}: no <suite> and no <suites found="no"/> — the graph's test question is unanswered`
        : `P1 ${cell.id}: <${el}> is missing or empty — answer it with ${keys.map((k) => `${k}="…"`).join(" / ")} or with found="no"`)
    }
  }

  // P2 — a suite without a command, a kind or a folder cannot become a node's check command at
  // step 10. `one` may be empty: step 15 then runs the whole suite and logs that price.
  for (const s of part.suites) {
    if (s.found === "no") continue
    const missing = SUITE_KEYS.filter((k) => !text(s[k]))
    if (missing.length) B.push(`P2 ${cell.id}: <suite id="${s.id || "?"}"> has empty ${missing.join(", ")}`)
  }

  // P3 — a node's <test suite="unit"/> must resolve to exactly one suite.
  const ids = part.suites.map((s) => s.id).filter(Boolean)
  for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) {
    B.push(`P3 ${cell.id}: duplicate <suite id="${id}">`)
  }

  return B
}

// FUNCTION_CONTRACT: checkPart — is this part closed enough to be merged
//   Input:        { part, cell } — part from parsePart; cell as step 3 wrote it:
//                 { id, kind, files: [{ path }] }
//   Dependencies: checkSurvey, checkSpine
//   Antecedent:   part is a parse result; cell carries id, kind and files (missing files read as [])
//   Consequent:   success: string[] of blockers, empty means green. Rule numbers match
//                          docs/scope.md §3 and are NOT restated in prose anywhere else
//                 failure: none — total. "The part is bad" is DATA (a redelegation), not a failure
//                          of this function
//   Purity:       pure
//   Interface:    checkPart({ part, cell }) -> string[]
export function checkPart({ part, cell }) {
  // C1 — the part answers the cell it was ordered for. Everything else is meaningless first: a part
  // written for another cell would be judged against the wrong file list.
  if (part.cell !== cell.id || part.kind !== cell.kind) {
    return [`C1 ${cell.id}: root must be <part cell="${cell.id}" kind="${cell.kind}"> — found cell="${part.cell}" kind="${part.kind}"`]
  }
  return cell.kind === "spine" ? checkSpine(part, cell) : checkSurvey(part, cell)
}

// FUNCTION_CONTRACT: newPart — the step's artifact from the text the role staged
//   Input:        { xml, cell } — xml as the role wrote it into staging; cell from the plan
//   Dependencies: parsePart, checkPart
//   Antecedent:   xml any value; cell carries id, kind and files
//   Consequent:   success: { cell, kind, modules, gaps, suites } — the parse, accepted
//                 failure: "invalid-part" — blockers joined by "\n  ", exactly as newBrd and
//                          newDesign do: this text is what travels into the order's FEEDBACK, so it
//                          is written for the ROLE to repair, not for a human to admire
//   Purity:       pure
//   Interface:    newPart({ xml, cell }) -> Result<Part, "invalid-part">
export function newPart({ xml, cell }) {
  const part = parsePart(xml)
  const blockers = checkPart({ part, cell })
  if (blockers.length) return err("invalid-part", blockers.join("\n  "))
  return ok(part)
}
