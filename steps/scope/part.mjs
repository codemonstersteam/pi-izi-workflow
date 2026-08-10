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
// Interface:  GRAMMAR_VERSION — the version of the part grammar, the cache's third key
//             SPINE_ANSWERS — the six questions a spine part must answer, with their value keys
//             IO_KINDS — the closed vocabulary of external-system kinds
//             API_KINDS · HTTP_API_NAME — the vocabulary and canonical name of an exposed entry point
//             parsePart(xml) -> Part
//             checkPart({ part, cell }) -> string[]   — blockers; empty means green
//             newPart({ xml, cell }) -> Result<Part, "invalid-part">

import { ok, err } from "../../core/result.mjs"
import { attrs, ATTRS, tag } from "../../core/xml.mjs"

// GRAMMAR_VERSION — what a part of this shape MEANS. It is the third key of the step-4 cache
// (steps/scope/cache.mjs): a part accepted under an older grammar is not re-judged, it is
// recomputed — otherwise the cache silently hands the new guardrail an artifact the old one wrote.
// Raise it in the SAME change that adds, removes or re-numbers a rule, never afterwards.
//
// 1 — the swarm's first grammar: `<dep path via>` written by the role (rules S1..S10, P1..P5).
// 2 — edges left the role for the script (backlog W4a/W4b): `<dep>` is now a BLOCKER in a part and
//     lives in `.agent/graph-computed.xml`; cells became subtrees with path-derived ids (W2).
export const GRAMMAR_VERSION = "2"

// SPINE_ANSWERS — the six questions the graph must answer (docs/concept.md, "Survey"), as the
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
  Object.freeze({ el: "integrations", keys: [] }), // answered by <integration> elements, see checkSpine
])

// IO_KINDS — what an external system can BE, declared here and only here; both orders substitute
// this list instead of retyping it. A closed vocabulary for the same reason the suite id needs one:
// two cells naming one technology differently produce two nodes at step 5, and the merge cannot
// tell that they are the same system.
//
// BUG_FIX_CONTEXT: live runs 6e3b9455 and e51553dc, on the very same file.
//   Previous: the grammar had no place for an external point at all — only <dep path>, whose
//             attribute is called `path` and means a path inside this repository.
//   Problem:  LoggingFilter came back once with five <dep> onto the framework (jakarta.ws.rs.*,
//             io.vertx.*) and once with deps="none" — two runs, two graphs on one file, and neither
//             can be called wrong. The external system was inexpressible in both.
//   Fix:      <io> on a module (the code side) and <integration> on the spine (the config side),
//             stitched at step 5 by the configuration key. A library or framework is not described.
export const IO_KINDS = Object.freeze(["http", "db", "queue", "cache", "blob", "mail", "rpc"])
const IO_DIRS = Object.freeze(["in", "out"])

// API_KINDS / API_SCOPES / HTTP_API_NAME — the surface a module EXPOSES, with the same discipline:
// a closed vocabulary and a canonical form, declared here and substituted into the order.
//
// `scope` is the whole point of this element: `public` means the entry point is reachable from
// OUTSIDE the process (an HTTP route, a CLI command, a consumed topic), `internal` means only other
// modules of this repository call it. Step 5 collects every public one into the graph's surface, and
// step 10 needs exactly that list to know which part of the contract a delta touches
// (docs/concept.md — the spec node stands as an EDGE in front of the code nodes).
//
// BUG_FIX_CONTEXT: live run e51553dc.
//   Previous: <api> was named in no order's CONSTRAINTS and checked by no rule of the guardrail.
//   Problem:  silence was a legal answer — a module with three endpoints and no <api> was green,
//             `<api name="">` was green, and the shape of a name was undefined (the role's own
//             example writes both `GET /fruits` and `build_invoice(order_id)`). "Nothing is exposed"
//             was indistinguishable from "the scout did not look".
//   Fix:      kind/scope/a canonical name plus api="none", and rules S9/S10 judging COMPOSITION.
export const API_KINDS = Object.freeze(["http", "cli", "event", "lib"])
const API_SCOPES = Object.freeze(["public", "internal"])
export const HTTP_API_NAME = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) \/\S*$/

const SUITE_KEYS = ["id", "kind", "cmd", "path"] // `one` is deliberately absent: empty is valid

// SUITE_KINDS / suiteId — the vocabulary of test suites and the shape of their id.
//
// BUG_FIX_CONTEXT: four live runs in a row named ONE AND THE SAME suite differently —
//   `integ-native` (dee73d00), `integration` (e51553dc), `native-it` (03bc51ef),
//   `native-integration` (8f0e03fc). `kind` meanwhile travelled as `integration` (e51553dc), a word
//   the order's vocabulary does not hold: P2 checked non-emptiness but not membership.
//   Problem:  a name that is new every run can be stitched to nothing — neither to a node's
//             `<test suite="…">`, nor to step 10's plan, which builds a check command out of a suite.
//   Fix:      `kind` from a closed vocabulary, and `id` must START with its kind: `unit`,
//             `component`, `component-native`, `contract-pact`. Drift becomes impossible by shape,
//             while two suites of one kind stay expressible.
export const SUITE_KINDS = Object.freeze(["unit", "component", "contract", "e2e"])
const suiteId = (kind) => new RegExp(`^${kind}(-[a-z0-9]+)*$`)
const text = (s) => String(s == null ? "" : s).trim()
const firstAttrs = (xml, name) => {
  const m = String(xml || "").match(new RegExp(`<${name}\\b${ATTRS}/?>`))
  return m ? attrs(m[1]) : null
}

// FUNCTION_CONTRACT: parsePart — a scout's part from its text
//   Input:        xml — the staged part as the role wrote it; type unconstrained
//   Dependencies: attrs, ATTRS, tag (core/xml.mjs)
//   Antecedent:   any value — undefined/null/garbage read as an empty part
//   Consequent:   success: { cell, kind, modules[], gaps[], suites[], integrations[], answers{} }
//                          where modules = [{ path, role, api[], apiNone, deps[{path,via}], depsNone, io[],
//                          ioNone, tests[], testsNone }] in order of appearance; `api` carries the element's
//                          attributes ({ name, kind, scope, spec? }), not just its name — `scope` is
//                          the answer to "what is exposed outward" and step 5 collects it;
//                          a `<module>` written self-closing is
//                          still collected (so it fails rule S3 with a diagnosis, instead of
//                          vanishing into rule S1);
//                          answers = { <el>: attrs|null } for the six SPINE_ANSWERS elements
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
      ioNone: a.io === "none",
      apiNone: a.api === "none",
      testsNone: a.tests === "none",
      role: text((body.match(/<role>([\s\S]*?)<\/role>/) || [])[1]),
      api: Object.freeze([...body.matchAll(tag("api"))].map((x) => Object.freeze(attrs(x[1])))),
      deps: Object.freeze([...body.matchAll(tag("dep"))].map((x) => {
        const d = attrs(x[1])
        return Object.freeze({ path: d.path || "", via: text(d.via) })
      })),
      io: Object.freeze([...body.matchAll(tag("io"))].map((x) => Object.freeze(attrs(x[1])))),
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
    modules.push(Object.freeze({ path: a.path || "", depsNone: a.deps === "none", ioNone: a.io === "none", apiNone: a.api === "none", testsNone: a.tests === "none", role: "", api: Object.freeze([]), deps: Object.freeze([]), io: Object.freeze([]), tests: Object.freeze([]) }))
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
    integrations: Object.freeze([...src.matchAll(tag("integration"))].map((i) => Object.freeze(attrs(i[1])))),
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
    // S4 — edges are NOT the role's answer any more. The rule keeps its number and changes its
    // owner: a `<dep>` or a `deps="none"` in a part is now a blocker, because the edges of this
    // repository are computed by a script (steps/scope/edges.mjs) into
    // `.agent/graph-computed.xml`, and a second, hand-written source of edges is exactly how the
    // merge at step 5 gets two answers to one question with no way to tell them apart.
    //
    // BUG_FIX_CONTEXT: three live runs of one dimension, and every fix only changed WHICH answer
    //   was cheapest for the role.
    //   6e3b9455: framework imports became edges (`jakarta.*`, `io.vertx.*`).
    //   c9580ff8: a POJO with no imports at all got a `<dep>` onto its own CONSUMER — the cycle
    //             Fruit <-> FruitResource, while step 10 builds its plan by topological sort.
    //   337b957f: demanding the evidence `via` made an edge dearer than silence — all 17 modules
    //             came back with `deps="none"`, zero edges, and the run was formally green.
    //   Lesson:  every demand on a role changes its economics, and a role takes the cheapest green
    //             answer. Direction, evidence and membership of this repository are COMPUTABLE, so
    //             they are computed (backlog W4a/W4b). The role keeps what has no cheap answer.
    if (m.deps.length || m.depsNone) {
      B.push(`S4 ${cell.id}: edges are computed by the script, not written here — drop <dep> and deps="none" (${m.path})`)
    }
    // S6 — external points are DECLARED, never omitted, for the same reason as S4: a module that
    // touches nothing outside and a module whose external point was forgotten look identical, and
    // step 8 walks nodes. A library is neither an edge nor an <io> — that rule lives in the order.
    if (!m.io.length && !m.ioNone) B.push(`S6 ${cell.id}: neither <io> nor io="none" — ${m.path}`)
    // S7 — form of <io>. An external point with no address and no configuration key is a guess:
    // step 8 cannot ripple to it and step 10 cannot name it in a check command.
    for (const io of m.io) {
      const where = `${m.path} → system="${io.system || "?"}"`
      if (!IO_KINDS.includes(io.kind)) B.push(`S7 ${cell.id}: <io kind="${io.kind || ""}"> is not one of ${IO_KINDS.join(" ")} — ${where}`)
      if (!IO_DIRS.includes(io.dir)) B.push(`S7 ${cell.id}: <io dir="${io.dir || ""}"> must be in or out — ${where}`)
      if (!text(io.system)) B.push(`S7 ${cell.id}: <io> has no system — ${m.path}`)
      if (!text(io.config) && !text(io.target)) B.push(`S7 ${cell.id}: <io> has neither config nor target — ${where}`)
    }
    // S8 — the tests are DECLARED, never omitted.
    //
    // BUG_FIX_CONTEXT: live run 03bc51ef, the first after <io> and <api> were introduced.
    //   Previous: <test> lived only in the order's SCHEMA — not a line in CONSTRAINTS, not one rule.
    //   Problem:  two dimensions were added and the role silently dropped a third: part c1 came back
    //             with no <test> binding at all, where run e51553dc had four. Exactly the disease S9
    //             cured for <api>: the dimension nobody demands is the first to go under load.
    //   Fix:      a declared dimension of its own — <test> or tests="none".
    if (!m.tests.length && !m.testsNone) B.push(`S8 ${cell.id}: neither <test> nor tests="none" — ${m.path}`)
    for (const t of m.tests) {
      if (!text(t.path)) B.push(`S8 ${cell.id}: <test> with an empty path — ${m.path}`)
      // A survey cell CANNOT know a suite id: c0 and c1 go to the model in the same batch
      // (workflows/izi.js::scope), so the spine part does not exist yet while this one is written.
      // Run 8f0e03fc obeyed the order and left `suite` off — honest, and it left the graph with no
      // binding at all. The binding is therefore computed at step 5 by PATH (a test file inside a
      // suite's folder belongs to that suite), and writing `suite` here can only be a guess.
      if (text(t.suite)) B.push(`S8 ${cell.id}: <test suite="${t.suite}"> — a suite id is not knowable in a survey cell; step 5 binds by path, drop the attribute (${m.path})`)
    }
    // S9 — the exposed surface is DECLARED, never omitted. Same shape as S4 and S6, and the reason
    // is the sharpest here: a module with three routes and no <api> used to be green, so "nothing is
    // exposed" and "the scout did not look" were the same XML.
    if (!m.api.length && !m.apiNone) B.push(`S9 ${cell.id}: neither <api> nor api="none" — ${m.path}`)
    // S10 — form of <api>. `scope` is what makes "exposed outward" a fact step 5 can collect; the
    // canonical http name is what lets a consumer reference resolve to exactly one provider.
    for (const api of m.api) {
      const where = `${m.path} → name="${api.name || ""}"`
      if (!API_KINDS.includes(api.kind)) B.push(`S10 ${cell.id}: <api kind="${api.kind || ""}"> is not one of ${API_KINDS.join(" ")} — ${where}`)
      if (!API_SCOPES.includes(api.scope)) B.push(`S10 ${cell.id}: <api scope="${api.scope || ""}"> must be public or internal — ${where}`)
      if (!text(api.name)) B.push(`S10 ${cell.id}: <api> has no name — ${m.path}`)
      else if (api.kind === "http" && !HTTP_API_NAME.test(api.name)) {
        B.push(`S10 ${cell.id}: <api kind="http"> name must be "METHOD /path" — ${where}`)
      }
    }
  }

  // S5 — "not read" without a reason is indistinguishable from "did not bother".
  for (const g of part.gaps) if (!g.why) B.push(`S5 ${cell.id}: <gap> has no why — ${g.path || "(no path)"}`)

  return B
}

// checkSpine — rules P1..P3 of docs/scope.md §3, for the cell of kind "spine".
function checkSpine(part, cell) {
  const B = []

  // P1 — all six answers present, each either with a value or explicitly found="no". Two of them —
  // suites and integrations — are answered by a LIST of elements, so their "value" is the list
  // being non-empty; the rest answer with their own attributes.
  const LISTED = { suites: part.suites, integrations: part.integrations }
  for (const { el, keys } of SPINE_ANSWERS) {
    const a = part.answers[el]
    const listed = LISTED[el]
    const answered = listed
      ? listed.length > 0 || (a && a.found === "no")
      : a && (a.found === "no" || keys.some((k) => text(a[k])))
    if (!answered) {
      B.push(listed
        ? `P1 ${cell.id}: no <${el.slice(0, -1)}> and no <${el} found="no"/> — that question of the graph is unanswered`
        : `P1 ${cell.id}: <${el}> is missing or empty — answer it with ${keys.map((k) => `${k}="…"`).join(" / ")} or with found="no"`)
    }
  }

  // P2 — a suite without a command, a kind or a folder cannot become a node's check command at
  // step 10. `one` may be empty: step 15 then runs the whole suite and logs that price.
  for (const s of part.suites) {
    if (s.found === "no") continue
    const missing = SUITE_KEYS.filter((k) => !text(s[k]))
    if (missing.length) B.push(`P2 ${cell.id}: <suite id="${s.id || "?"}"> has empty ${missing.join(", ")}`)
    if (text(s.kind) && !SUITE_KINDS.includes(s.kind)) {
      B.push(`P2 ${cell.id}: <suite kind="${s.kind}"> is not one of ${SUITE_KINDS.join(" ")} — id="${s.id || "?"}"`)
    } else if (text(s.kind) && text(s.id) && !suiteId(s.kind).test(s.id)) {
      B.push(`P2 ${cell.id}: <suite id="${s.id}"> must start with its kind — "${s.kind}" or "${s.kind}-<what tells it apart>"`)
    }
  }

  // P3 — a node's <test suite="unit"/> must resolve to exactly one suite.
  const ids = part.suites.map((s) => s.id).filter(Boolean)
  for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) {
    B.push(`P3 ${cell.id}: duplicate <suite id="${id}">`)
  }

  // P4 — form of <integration>. `config` is the JOIN KEY: step 5 stitches a module's <io config="…">
  // to the system declared here, so a declaration without it is unreachable from the code side.
  // `value` is deliberately optional — a repository may hold only a placeholder, and a secret never
  // travels into the graph.
  for (const i of part.integrations) {
    const where = `<integration system="${i.system || "?"}">`
    if (!IO_KINDS.includes(i.kind)) B.push(`P4 ${cell.id}: ${where} kind="${i.kind || ""}" is not one of ${IO_KINDS.join(" ")}`)
    if (!text(i.system)) B.push(`P4 ${cell.id}: <integration> has no system`)
    if (!text(i.config)) B.push(`P4 ${cell.id}: ${where} has no config — the key is what step 5 stitches <io> to`)
  }

  // P5 — one system, one declaration: a duplicate splits the same external system into two nodes at
  // the merge, exactly as a duplicate suite id breaks <test suite="…">.
  const systems = part.integrations.map((i) => i.system).filter(Boolean)
  for (const s of new Set(systems.filter((s, i) => systems.indexOf(s) !== i))) {
    B.push(`P5 ${cell.id}: duplicate <integration system="${s}">`)
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
