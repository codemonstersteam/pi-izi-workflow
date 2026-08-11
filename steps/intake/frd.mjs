// MODULE_CONTRACT: frd — step 6's pure core: the requirement fried against the repository's map
// Purpose:    one decision — whether what the role wrote can be BUILT UPON by steps 7-9: the weight
//             is derived from the FORMS of the deltas, the ripple from `touched`, and step 9 already
//             declares `{ scenarios, touched }` as its input (steps/design/design.mjs::checkDesign).
//             So this module judges composition and provenance, never the beauty of a wording.
//             PURE: knows nothing of disk, io lives in ext/index.mjs. The grammar and the rules with
//             their numbers are declared ONCE, in docs/intake.md §4-§5, and are not restated here.
// io:         none
// Invariants: parseFrd is total — any input, including undefined, yields an empty parse and never
//             throws (a guardrail that crashes on a malformed artifact turns "the role wrote
//             nonsense" — data, a red check, a redelegation — into "the run crashed", code 2, no
//             diagnosis); checkFrd is total and returns EVERY blocker, not the first one (a model
//             fixes this artifact, and one blocker per call means paying a call per blocker —
//             steps/brd/brd.mjs, constraint 2); FRD_FORM is fixed at module load.
// Interface:  FRD_FORM — the artifact's form as data (grammar, deltaForms, sources)
//             parseFrd(xml) -> Frd
//             checkFrd({ frd, nodes, known }) -> string[]  — blockers, empty = green
//             newFrd({ xml, nodes, sources }) -> Result<Frd, "invalid-frd">

import { ok, err } from "../../core/result.mjs"
// EXTERNAL_DEPENDENCY: core/xml.mjs — the tag scanner shared with steps/scope and steps/design. One
// grammar family, one piece of code reading it; the BUG_FIX_CONTEXT for ATTRS' quote-resilience lives
// there and is inherited here for free.
import { attrs, ATTRS, tag } from "../../core/xml.mjs"
// EXTERNAL_DEPENDENCY: steps/brd/brd.mjs::numbersIn — provenance of a number is ONE rule in this
// pipeline, and it already has a home: the same function that judges `fit` at step 2, together with
// its defence against designations (ISO-8601, RFC 3339, HTTP/2). A second copy here would drift.
import { numbersIn } from "../brd/brd.mjs"

// THE FORM AS DATA, so the order can SUBSTITUTE it instead of restating it (ext/index.mjs::frdForm,
// the same device as brdForm — see its BUG_FIX_CONTEXT G9e).
export const FRD_FORM = Object.freeze({
  grammar: 1,
  // The four forms of a delta. `Unknown` is not decoration: it is the ONLY way "could not classify"
  // reaches the operator, and step 7 refuses to write `.agent/mode` while one is present
  // (docs/concept.md, "Прожарка и оценка change").
  deltaForms: Object.freeze(["Added", "Changed", "Removed", "Unknown"]),
  // A closed vocabulary of provenance. `appgraph.xml` is here because step 6 is the first one holding
  // BOTH operands: a number read off the map (a status from an annotation, a limit from a signature)
  // is a fact of the repository, not an invented default.
  sources: Object.freeze(["TASK.md", "answers.md", "brd.md", "appgraph.xml"]),
})

// The text of a child element, e.g. <post>…</post>. A fresh non-global RegExp per call: `tag()` is
// global and would carry lastIndex between callers.
const childText = (body, name) => {
  const m = String(body || "").match(new RegExp(`<${name}\\b${ATTRS}>([\\s\\S]*?)</${name}>`))
  return m ? m[2].trim() : ""
}

// FUNCTION_CONTRACT: parseFrd — the FRD's elements out of its text
//   Input:        xml — text of `.agent/staging/frd.xml`; type unconstrained
//   Dependencies: childText, core/xml.mjs
//   Antecedent:   any value — undefined/null/garbage are read as an empty FRD
//   Consequent:   success: a frozen { goal, grammar, actors[], usecases[], fields[], failures[],
//                          deltas[], scenarios[], touched[], nfrs[], questions[] } in appearance
//                          order; a self-closing element is its attribute map as written, an absent
//                          attribute is simply absent (the rules below judge that, the parser does
//                          not invent defaults for it)
//                 failure: none — total
//   Purity:       pure
export function parseFrd(xml) {
  const s = String(xml || "")
  const head = attrs((s.match(new RegExp(`<frd\\b${ATTRS}>`)) || ["", ""])[1])

  const usecases = [...s.matchAll(tag("usecase", ">([\\s\\S]*?)</usecase>"))].map((m) => {
    const a = attrs(m[1])
    const body = m[2]
    return Object.freeze({
      id: a.id || "",
      actor: a.actor || "",
      goal: a.goal || "",
      pre: childText(body, "pre"),
      post: childText(body, "post"),
      steps: Object.freeze([...body.matchAll(tag("step", ">([\\s\\S]*?)</step>"))].map((x) => x[2].trim())),
      exts: Object.freeze([...body.matchAll(tag("ext"))].map((x) => Object.freeze(attrs(x[1])))),
    })
  })

  const list = (name) => Object.freeze([...s.matchAll(tag(name))].map((m) => Object.freeze(attrs(m[1]))))
  // `<failures>` (plural) is the ANSWER "this change has no failure modes", not a container: the same
  // device the map uses for `<toggles found="no">`. It is read separately from `<failure>` (singular)
  // rows, and F6 below demands one of the two.
  const none = attrs((s.match(new RegExp(`<failures\\b${ATTRS}/?>`)) || ["", ""])[1])
  return Object.freeze({
    goal: head.goal || "",
    grammar: head.grammar || "",
    failuresFound: none.found || "",
    failuresWhy: (none.why || "").trim(),
    actors: list("actor"),
    usecases: Object.freeze(usecases),
    fields: list("field"),
    failures: list("failure"),
    deltas: list("delta"),
    scenarios: list("scenario"),
    touched: Object.freeze(list("touched").map((t) => t.path || "")),
    nfrs: list("nfr"),
    questions: list("question"),
  })
}

// FUNCTION_CONTRACT: provenance — F5 for one value that carries a requirement's quantity
//   Input:        at — where the finding happened, for the blocker's text; value — `domain` or `fit`
//   Dependencies: known — the set of the sources' numbers, or null when no sources were supplied
//                 (then the rule stays silent: there is nothing to judge provenance against)
//   Antecedent:   any values
//   Consequent:   success: string[] of blockers, empty when the source is declared and every number
//                          in the value occurs among the sources
//                 failure: none — total
//   Purity:       pure
// ONLY `domain` and `fit` are counted. The artifact is full of numbers that are not the requirement's
// quantities — status="400", step n="1", grammar="1", lengths quoted off the map — and counting the
// whole element would turn an honest artifact red: the same breed of defect as the "fit must carry a
// measurable token" rule the operator removed after live run ed1d4094 (core/form.mjs).
function provenance(at, value, source, known) {
  const out = []
  if (!FRD_FORM.sources.includes(source)) {
    out.push(`F5 ${at}: source="${source || ""}" — допустимо ${FRD_FORM.sources.join(" | ")}`)
  }
  if (known) {
    const invented = [...numbersIn(value)].filter((n) => !known.has(n))
    if (invented.length) {
      out.push(`F5 ${at} [invented-default]: число ${invented.join(", ")} не встречается ни в задаче, ни в ответах оператора, ни в BRD, ни в карте`)
    }
  }
  return out
}

// FUNCTION_CONTRACT: checkFrd — the seven rules of docs/intake.md §5
//   Input:        { frd, nodes, known }
//                 nodes — Set<path> of the map's node keys (steps/intake/map.mjs::parseMap)
//   Dependencies: provenance, FRD_FORM
//   Antecedent:   frd — parseFrd's parse; nodes — a Set (empty means the map gave nothing, and then
//                 F2/F3 will name every touched, which is the honest answer for an empty map)
//   Consequent:   success: string[] of blockers, empty = green. Numbers F1..F7 match docs/intake.md
//                          §5 and are NOT restated in prose here
//                 failure: none — total; "the FRD is bad" is DATA, not a function failure
//   Purity:       pure
export function checkFrd({ frd, nodes = new Set(), tests = new Set(), known = null }) {
  const B = []

  // F1 — the frying itself: a goal and use cases with an actor, a guarantee and steps.
  if (!frd.goal) B.push("F1 <frd goal> пуст — цель одной фразой обязательна")
  if (!frd.usecases.length) B.push("F1 ни одного <usecase> — требование не прожарено, а переписано")
  for (const u of frd.usecases) {
    const at = u.id || "UC?"
    if (!u.actor) B.push(`F1 ${at}: нет actor — у внешнего входа обязан быть тот, кто его подаёт`)
    if (!u.post) B.push(`F1 ${at}: нет <post> — гарантия успеха не названа`)
    if (!u.steps.length) B.push(`F1 ${at}: нет ни одного <step> — основной сценарий пуст`)
  }

  // F2 — a touched is a NODE of the map, never a name out of the role's head, and never a TEST.
  //
  // BUG_FIX_CONTEXT: live run 1d804798 — the artifact carried a second delta on
  //   FruitResourceTest.java beside the one on FruitResource.java, and passed: the path does resolve
  //   to a node. Step 10 assigns a plan node per delta, so two deltas would have become two tickets
  //   and the test would have been written by a different executor than the code it checks — against
  //   "TDD in one ticket" (docs/concept.md, step 15). The map already binds a module to its test
  //   (`<test path suite>`), which is where step 10 takes both the file and the check command from.
  const touched = new Set(frd.touched)
  for (const t of frd.touched) {
    if (!nodes.has(t)) B.push(`F2 touched «${t}» не резолвится в узел карты — такого path в appgraph.xml нет`)
    else if (tests.has(t)) B.push(`F2 touched «${t}» — тест: тест это <dod> изменения, а не изменение; он едет в тикет вместе со своим модулем (<test> карты, шаг 10)`)
  }

  // F7 — an FRD without a delta says nothing about the change.
  if (!frd.deltas.length) B.push("F7 ни одной <delta> — изменение контракта не названо")

  // F3 — the delta's form, and its node when the form claims to know one.
  for (const d of frd.deltas) {
    const at = d.op || "(delta без op)"
    if (!d.op) B.push("F3 <delta> без op — операция не названа")
    if (!FRD_FORM.deltaForms.includes(d.form)) {
      B.push(`F3 ${at}: form="${d.form || ""}" — допустимо ${FRD_FORM.deltaForms.join(" | ")}`)
      continue
    }
    if (d.form === "Unknown") {
      if (!d.why) B.push(`F3 ${at}: Unknown без why — оператору нечего показать на шаге 7`)
      continue
    }
    if (!d.node) { B.push(`F3 ${at}: ${d.form} без node — дельта обязана опираться на узел карты`); continue }
    if (!nodes.has(d.node)) B.push(`F3 ${at}: узла «${d.node}» нет в карте — либо это Unknown, либо путь выдуман`)
    else if (tests.has(d.node)) B.push(`F3 ${at}: узел «${d.node}» — тест: тест это <dod> изменения, а не изменение; назови модуль, который меняется, тест приедет с ним в один тикет (<test> карты, шаг 10)`)
    else if (!touched.has(d.node)) B.push(`F3 ${at}: узел «${d.node}» не объявлен <touched> — шаг 8 не досчитает рябь`)
  }

  // F4 — a scenario that is green before the change is a finding of acceptance, not a test.
  if (!frd.scenarios.length) B.push("F4 ни одного <scenario> — различать изменение нечем")
  const ucs = new Set(frd.usecases.map((u) => u.id))
  for (const sc of frd.scenarios) {
    const at = sc.id || "(scenario без id)"
    if (!sc.uc || !ucs.has(sc.uc)) B.push(`F4 ${at}: uc="${sc.uc || ""}" — такого <usecase> нет`)
    if (!sc.before || !sc.after) B.push(`F4 ${at}: before/after пусты — сценарий не различающий`)
    else if (sc.before.trim() === sc.after.trim()) B.push(`F4 ${at}: before и after совпадают — сценарий зелен и до изменения`)
  }

  // F5 — every quantity of the requirement has a named, declared source.
  for (const f of frd.fields) B.push(...provenance(`поле ${f.name || "(без name)"}`, f.domain, f.source, known))
  for (const n of frd.nfrs) B.push(...provenance(`нфт ${n.subject || "(без subject)"}`, n.fit, n.source, known))

  // F6 — the failure-mode map is DERIVED from the extensions, not composed beside them; and its
  // ABSENCE is an answer, not silence.
  //
  // BUG_FIX_CONTEXT: live run e82192db — the artifact carried no <failure> and no `error` on any
  //   <ext>, and this rule compared two EMPTY sets and passed. "The service has no failure modes"
  //   and "the role skipped the section" were indistinguishable to the machine. The service was then
  //   read by hand and the role turned out to be RIGHT (FruitResource returns a collection from all
  //   three methods: no Response.status, no throw, no validation, no ExceptionMapper anywhere), which
  //   is exactly why the fix is NOT "every <ext> must carry a code" — that would order the role to
  //   invent a 400 this repository has no idiom for. It is: say it out loud, as the map says
  //   `found="no"` about toggles and the spec.
  if (!frd.failures.length && frd.failuresFound !== "no") {
    B.push('F6 карта отказов пуста и не объявлена — либо <failure code=… status=… client=… operator=… from=…/>, либо <failures found="no" why="почему их нет"/>')
  }
  if (frd.failuresFound === "no" && !frd.failuresWhy) {
    B.push('F6 <failures found="no"> без why — «распознаваемых отказов нет» это вывод из репозитория, а не пропуск раздела')
  }
  const errs = new Set(frd.usecases.flatMap((u) => u.exts.map((e) => e.error).filter(Boolean)))
  const codes = new Set(frd.failures.map((f) => f.code).filter(Boolean))
  for (const e of errs) if (!codes.has(e)) B.push(`F6 код «${e}» из <ext> не описан в карте отказов`)
  for (const c of codes) if (!errs.has(c)) B.push(`F6 код «${c}» карты отказов не встречен ни одним <ext>`)

  return B
}

// FUNCTION_CONTRACT: newFrd — step 6's artifact, fit to be handed to steps 7-9
//   Input:        { xml, nodes, tests, sources } — xml as the role wrote it in staging
//   Dependencies: parseFrd, checkFrd, numbersIn
//   Antecedent:   xml — any value; nodes — Set<path> from the map; tests — its subset marked
//                 `kind="test"` (steps/intake/map.mjs::parseMap); sources — the texts a number may
//                 come from (TASK.md, the VALUES of operator answers, the BRD, the map itself); an
//                 empty array means "no sources supplied" and F5's number rule stays silent
//   Consequent:   success: the frozen FRD plus `unknown` — how many deltas the role could not
//                          classify; step 7 refuses to write a weight while that number is non-zero
//                 failure: "invalid-frd" — the detail carries EVERY blocker, one per line, and rides
//                          in the FEEDBACK of the redelegation exactly as newBrd's does
//   Purity:       pure
export function newFrd({ xml, nodes = new Set(), tests = new Set(), sources = [] }) {
  const frd = parseFrd(xml)
  if (!frd.usecases.length && !frd.deltas.length) {
    return err("invalid-frd", "в артефакте нет ни <usecase>, ни <delta> — грамматика не распознана: staging пуст или это не frd.xml")
  }

  const src = sources.filter(Boolean)
  const known = src.length ? new Set(src.flatMap((t) => [...numbersIn(t)])) : null

  const blockers = checkFrd({ frd, nodes, tests, known })
  if (blockers.length) return err("invalid-frd", blockers.join("\n  "))

  return ok(Object.freeze({ ...frd, unknown: frd.deltas.filter((d) => d.form === "Unknown").length }))
}
