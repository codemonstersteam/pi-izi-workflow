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
//             checkFrd({ frd, nodes, tests, entries, edges, known }) -> string[]  — blockers, empty = green
//             newFrd({ xml, nodes, tests, entries, edges, sources }) -> Result<Frd, "invalid-frd">

import { ok, err } from "../../core/result.mjs"
// EXTERNAL_DEPENDENCY: core/xml.mjs — the tag scanner shared with steps/scope and steps/design. One
// grammar family, one piece of code reading it; the BUG_FIX_CONTEXT for ATTRS' quote-resilience lives
// there and is inherited here for free.
import { attrs, ATTRS, tag } from "../../core/xml.mjs"
// EXTERNAL_DEPENDENCY: steps/brd/brd.mjs::numbersIn — provenance of a number is ONE rule in this
// pipeline, and it already has a home: the same function that judges `fit` at step 2, together with
// its defence against designations (ISO-8601, RFC 3339, HTTP/2). A second copy here would drift.
import { numbersIn } from "../brd/brd.mjs"
// EXTERNAL_DEPENDENCY: steps/review/review.mjs::frdIds — "what is an id of this FRD" is answered ONCE:
// step 11's R4 resolves a blocker's evidence against it, and F9 below (the guard against 508d74fa's
// class of defect — a rewind's subject erased instead of repaired) resolves the SAME evidence against
// the SAME set, on the FRD the role just rewrote. Not a cycle: review.mjs takes frd/plan as data and
// never imports this module.
import { frdIds } from "../review/review.mjs"

// THE FORM AS DATA, so the order can SUBSTITUTE it instead of restating it (ext/index.mjs::frdForm,
// the same device as brdForm — see its BUG_FIX_CONTEXT G9e).
export const FRD_FORM = Object.freeze({
  grammar: 1,
  // The forms of a delta. They are defined by the EFFECT ON AN EXISTING CALL, not by the grammar of a
  // sentence — the definitions live once, in the role's STRATEGY §8 (steps/intake/intake.md), and the
  // mapping form → weight lives once, in steps/weight/weight.mjs. Neither is restated here.
  //
  // `Unknown` is not decoration: it is the ONLY way "could not classify" reaches the operator, and
  // step 7 refuses to write `.agent/mode` while one is present (docs/concept.md, "Прожарка и оценка
  // change").
  //
  // BUG_FIX_CONTEXT: live run S21 (sandbox/runbox/quarkus-rest-json-app-v2-t1-3) — a backward
  //   compatible addition to an existing operation (an optional query param) was declared `Changed`,
  //   which weighs `major` and orders step 9's designer for a one-node change. Two fixes, both here:
  //   the forms got their definitions (the role file), and `Fixed` was added — without it a
  //   contract-stable bug fix falls under `Changed` too, so `patch` would be unreachable for the whole
  //   pipeline while step 8 keeps a branch for it (docs/weight.md §2-§3).
  deltaForms: Object.freeze(["Added", "Changed", "Removed", "Fixed", "Unknown"]),
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
    // `touched` stays a list of PATHS and nothing else: step 8 counts the width of the change by it
    // (steps/ripple/ripple.mjs), step 9 checks routes against it (steps/design/design.mjs::checkDesign)
    // and the host reports its length — widening its shape would be a change to every one of those
    // consumers (CLAUDE.md, constraint 5). The elements themselves ride alongside as `touchedRows`,
    // for the one rule that needs an attribute of theirs.
    touched: Object.freeze(list("touched").map((t) => t.path || "")),
    touchedRows: list("touched"),
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
      // THE BLOCKER NAMES ITS EXITS. A refusal that states only the law leaves the role to invent a
      // repair, and live run e132f0a1 shows what it invents: told the number 24 had no source, the
      // role kept the number and changed `source` to the name of the analogue it had read it from —
      // a second violation of the same rule. Naming the three legal exits is not politeness; a rule
      // and the way out of it are one decision, and it belongs in one place, this one.
      out.push(`F5 ${at} [invented-default]: число ${invented.join(", ")} не встречается ни в задаче, ни в ответах оператора, ни в BRD, ни в карте — назови формат вместо его меры, или сними число, или оставь <question>: источником может быть только файл из списка, но не память`)
    }
  }
  return out
}

// FUNCTION_CONTRACT: checkFrd — the seven rules of docs/intake.md §4, plus F9 (guard against a
//                     rewind erasing what it was sent to repair)
//   Input:        { frd, nodes, known, rewind }
//                 nodes — Set<path> of the map's node keys (steps/intake/map.mjs::parseMap)
//                 rewind — [{ code, node, evidence }], the PREVIOUS review's blockers when it Rejected
//                          (ext/index.mjs::checkFrd reads .agent/review.xml); [] when this is not a
//                          rewind — F9 is then silent, exactly as F5 is silent with no sources
//   Dependencies: provenance, FRD_FORM, steps/review/review.mjs::frdIds
//   Antecedent:   frd — parseFrd's parse; nodes — a Set (empty means the map gave nothing, and then
//                 F2/F3 will name every touched, which is the honest answer for an empty map)
//   Consequent:   success: string[] of blockers, empty = green. Numbers F1..F7 and F9 match
//                          docs/intake.md §4 and are NOT restated in prose here
//                 failure: none — total; "the FRD is bad" is DATA, not a function failure
//   Purity:       pure
export function checkFrd({ frd, nodes = new Set(), tests = new Set(), entries = new Set(), edges = [], known = null, rewind = [] }) {
  const B = []
  // Who has an existing caller: a node someone else points an edge AT. `entries` answers the same
  // question for the world outside the repository. Both come from the map (steps/intake/map.mjs) —
  // this module never parses appgraph.xml itself.
  const called = new Set((Array.isArray(edges) ? edges : []).map((e) => e && e.to).filter(Boolean))
  // A map that declares NEITHER an entry NOR an edge says nothing about who calls whom, and the rule
  // below would then redden every `Changed` in the artifact on no evidence at all. It stays silent
  // instead — the same discipline F5 keeps when no sources were supplied: a rule with nothing to judge
  // against is not a rule that judges everything.
  const knowsCallers = entries.size > 0 || called.size > 0

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
  // A DELTA'S NODE IS NOT REQUIRED IN `<touched>`, and the rule that required it is gone.
  //
  // BUG_FIX_CONTEXT: live run a3597dd3 (eddi, 1850 files). Two of the three rounds that killed the
  //   step were nothing but this bookkeeping: `checkFrd/1` — five F2 on `<touched>` paths spelled
  //   `eddi/glossary/…` while the deltas said `eddi/configs/glossary/…`; `checkFrd/3` — six F3n on
  //   the same six created modules, "не объявлен <touched>". Eleven blockers of nineteen, and the
  //   role was being asked to keep six INVENTED paths byte-identical in two places at once —
  //   exactly what CLAUDE.md constraint 4 forbids: a key is COPIED BY THE MACHINE.
  //   The blocker also argued its case with something false: «шаг 8 не досчитает рябь».
  //   steps/ripple/ripple.mjs::changeWidth is `deltaNodes ∪ touched` — step 8 counts a delta's node
  //   whether or not it was declared touched, and the seam for that is ripple.test.mjs's own
  //   `touched: []` case.
  // `<touched>` keeps the job it was actually bought for (run 9a8821a7): a node that CHANGES but
  // carries no delta — a page, a template, a build script, anything with no contract to move. There
  // the `why` is the only statement of the work, and F2b/F2c below still demand it.
  // The nodes this change CREATES. Declared once, on the delta — `<touched>` and `<scenario nodes>`
  // derive it from here rather than repeating the attribute, because two places for one fact disagree
  // on the first artifact where the role marks only one of them (CLAUDE.md, constraint 5).
  //
  // Why an ATTRIBUTE and not "an Added delta whose path is not in the map": today a path outside the
  // map is the blocker below, «либо это Unknown, либо путь выдуман». Inferring newness from the form
  // would delete that blocker for every `Added` delta — a typo in a path (`FruitResourse.java`) would
  // silently become a legal new module, step 9 would design it and step 10 would cut a ticket to
  // create a duplicate file. A declaration is the same device `<failures found="no" why>`,
  // `Unknown why` and `cut="N"` use: standards/code.md, constraint 3 — a default is
  // indistinguishable from a fact.
  //
  // BUG_FIX_CONTEXT: live run b857d4a0 (quarkus-rest-json-app-v2-t2). The operator answered the
  //   role's question with «создать новый файл fruit.html», and the FRD had no way to say it: F2/F3
  //   demand a map node, and a file that does not exist yet has none. The role wrote the only legal
  //   thing left — `form="Unknown"` — step 7 refused terminally on it (steps/weight/weight.mjs), and
  //   the band stopped after intake×5 and 281 188 tokens on a change the operator had explicitly
  //   ordered. Step 9 was ready for it all along (checkDesign rule 6 allows a delta node outside the
  //   ripple subgraph — «новый модуль это суждение дизайнера»); nothing could carry the fact there.
  const newNodes = new Set(frd.deltas.filter((d) => d.new === "yes" && d.node).map((d) => d.node))
  // F2b — a touched must be EXPLAINED: it carries a delta of its own, or a scenario runs through it.
  // Since step 8 measures the WIDTH of the change by `touched` (docs/ripple.md §3), a node declared
  // touched on nothing but the role's say-so orders the `designer` role for free — and step 10 would
  // owe it a ticket nobody can write, because nothing in the artifact says what changes there.
  const explained = new Set([
    ...frd.deltas.map((d) => d.node).filter(Boolean),
    ...frd.scenarios.flatMap((s) => String(s.nodes || "").split(/\s+/).filter(Boolean)),
  ])
  for (const t of frd.touched) {
    if (newNodes.has(t)) continue   // a node this change creates: F3 below judges it, the map cannot
    if (!nodes.has(t)) B.push(`F2 touched «${t}» не резолвится в узел карты — такого path в appgraph.xml нет`)
    else if (tests.has(t)) B.push(`F2 touched «${t}» — тест: тест это <dod> изменения, а не изменение; он едет в тикет вместе со своим модулем (<test> карты, шаг 10)`)
    else if (!explained.has(t)) B.push(`F2b touched «${t}» ничем не объяснён: у него нет своей <delta>, и ни один <scenario nodes> через него не идёт. «Посмотрел, но не менял» — не тронутость: она считается шириной изменения на шаге 8`)
  }
  // F2c — every touched says WHAT changes in it, in its own words.
  //
  // BUG_FIX_CONTEXT: live run 9a8821a7 (quarkus-rest-json-app-v2-t2). `<touched path=".../Fruit.java"/>`
  //   passed F2b because scenario S1's route ran through that node — and the implementation written
  //   afterwards never touched the file at all. "A scenario passes through it" is not "it changes":
  //   the first is a fact about the route, the second about the work. The machine cannot tell them
  //   apart from the outside, so the role is made to SAY it — the same device `<failures found="no"
  //   why=…>` and `Unknown why` use. Presence is machine-checked; the truth of the sentence is judged
  //   by the human who reads the artifact, exactly as it is for those two.
  // A node the change CREATES owes the same sentence — and owes it more, not less: `why` is the only
  // place the artifact says what the new file is for. Gating this on `nodes.has(path)` alone would let
  // every new node through silently the moment F2 above stopped blocking it.
  for (const t of frd.touchedRows || []) {
    const judged = t.path && (newNodes.has(t.path) || (nodes.has(t.path) && !tests.has(t.path)))
    if (judged && !String(t.why || "").trim()) {
      B.push(`F2c touched «${t.path}» без why — назови, ЧТО в этом узле меняется. Маршрут сценария через узел не значит, что узел меняется, а ширина изменения (шаг 8) считается по этому списку`)
    }
  }

  // F7 — an FRD without a delta says nothing about the change.
  if (!frd.deltas.length) B.push("F7 ни одной <delta> — изменение контракта не названо")

  // F3 — the delta's form, and its node when the form claims to know one.
  for (const d of frd.deltas) {
    const at = d.op || "(delta без op)"
    // The blocker's TEXT is the whole repair instruction the role gets — it rides in the FEEDBACK of
    // the redelegation and nothing else does. A generic sentence is affordable only when the role can
    // work out the answer on its own.
    //
    // BUG_FIX_CONTEXT: live run 6889fc3f (quarkus-rest-json-app-v2-t3), the first task where a new
    //   file was unavoidable. The role wrote `<delta form="Added" node=".../fruit-card.html"
    //   new="yes"/>` with no `op` — because its own rule says `op` is «the entry AS THE MAP SPELLS
    //   IT», and a file that does not exist yet is in no map. This blocker then said only «операция
    //   не названа», which the role could not act on: it spent one loop leaving `op` out, one loop
    //   moving the delta onto the list page (blocked as `Changed` with no caller), one more leaving
    //   it out again — three redelegations, 392 378 tokens, `escalate`. S26 introduced `new="yes"`
    //   and never said what `op` means for a module that does not exist yet; the answer lives in the
    //   requirement, not in the map, and now the message says so.
    if (!d.op) {
      B.push(d.new === "yes"
        ? `F3 <delta new="yes"> на «${d.node || "(без node)"}» без op — у создаваемого модуля op это ВНЕШНЯЯ ТОЧКА, которую он заведёт: адрес страницы, команда, топик, имя функции — словами требования, а не именем поведения`
        : "F3 <delta> без op — операция не названа")
    }
    if (!FRD_FORM.deltaForms.includes(d.form)) {
      B.push(`F3 ${at}: form="${d.form || ""}" — допустимо ${FRD_FORM.deltaForms.join(" | ")}`)
      continue
    }
    if (d.form === "Unknown") {
      if (!d.why) B.push(`F3 ${at}: Unknown без why — оператору нечего показать на шаге 7`)
      continue
    }
    if (!d.node) { B.push(`F3 ${at}: ${d.form} без node — дельта обязана опираться на узел карты`); continue }
    // F3n — the module this change CREATES. Everything the rules below ask of a delta is asked of it
    // too, except the one thing that cannot be true of a file that does not exist yet: being in the
    // map. The two claims are checked in the opposite direction, and the form is pinned: a module
    // that is not there yet cannot have its contract Changed, Removed or Fixed — nothing to move.
    if (d.new === "yes") {
      if (nodes.has(d.node)) B.push(`F3 ${at}: new="yes", но узел «${d.node}» ЕСТЬ в карте — это не новый модуль, сними признак`)
      if (d.form !== "Added") B.push(`F3 ${at}: new="yes" с формой ${d.form} — у модуля, которого ещё нет, контракт двигаться не может: новый модуль это Added`)
      continue
    }
    if (!nodes.has(d.node)) B.push(`F3 ${at}: узла «${d.node}» нет в карте — либо это Unknown, либо путь выдуман, либо модуль создаётся этим изменением и тогда дельта несёт new="yes"`)
    else if (tests.has(d.node)) B.push(`F3 ${at}: узел «${d.node}» — тест: тест это <dod> изменения, а не изменение; назови модуль, который меняется, тест приедет с ним в один тикет (<test> карты, шаг 10)`)

    // `Changed`/`Removed` are defined BY THEIR EFFECT ON AN EXISTING CALL (steps/intake/intake.md,
    // STRATEGY §8), so they are only sayable about a node that HAS one: an `<api>` of its own, or an
    // incoming edge from another module. About a node with neither, "the existing call breaks" is a
    // statement about nothing — and it weighs `major` (steps/weight/weight.mjs), ordering step 9 for
    // free.
    //
    // BUG_FIX_CONTEXT: live run e2905b82 (sandbox/runbox/quarkus-rest-json-app-v2-t2). The FRD carried
    //   `<delta op="fruit-card-rendering" form="Changed" node=".../fruits.html">` — an AngularJS page
    //   that gained a card. In the map that node has no `<api>` and `fanin="0"`: nothing calls it, it
    //   calls the resource. The weight came out `major` and step 8 ordered a design on what is a purely
    //   additive change. The same breed as discrepancy A of S22 (docs/weight.md §2), one layer down:
    //   there the definitions were missing, here they had nothing to bite on.
    else if (knowsCallers && (d.form === "Changed" || d.form === "Removed") && !entries.has(d.node) && !called.has(d.node)) {
      B.push(`F3 ${at}: «${d.node}» — ${d.form}, но у узла нет ни своей внешней точки (<api>), ни входящего вызова: ломаться нечему. Поведение, которого не было, это Added; поведение wrong→right — Fixed`)
    }

    // F3b — a delta is a MOVEMENT. `Changed` and `Fixed` claim one explicitly, so they owe both ends
    // of it and the ends must differ; for any form, two equal ends describe nothing that moved.
    //
    // BUG_FIX_CONTEXT: live run 9a8821a7 (quarkus-rest-json-app-v2-t2). Beside the one real delta the
    //   artifact carried three more — `GET /fruits`, `POST /fruits`, `DELETE /fruits`, each
    //   `form="Fixed" from="unchanged" to="unchanged"` — the role listing the operations that do NOT
    //   change. Nothing judged `from`/`to`, so it passed. Step 10 makes a plan node per delta, so that
    //   is three tickets for work nobody has to do; and `Fixed` weighs `patch`, so an artifact without
    //   the real `Added` beside them would have been weighed on "nothing changed". The same rule F4
    //   already applies to scenarios ("before и after совпадают — сценарий зелен и до изменения").
    const from = String(d.from || "").trim()
    const to = String(d.to || "").trim()
    if (d.form === "Changed" || d.form === "Fixed") {
      if (!from || !to) B.push(`F3b ${at}: ${d.form} без from/to — движение не названо, а форма его утверждает`)
      else if (from === to) B.push(`F3b ${at}: from и to совпадают («${from}») — ничего не двинулось. Операция, которая не меняется, дельтой не бывает: в списке дельт ей не место`)
    } else if (from && to && from === to) {
      B.push(`F3b ${at}: from и to совпадают («${from}») — ничего не двинулось. Операция, которая не меняется, дельтой не бывает: в списке дельт ей не место`)
    }
  }

  // F4 — a scenario that is green before the change is a finding of acceptance, not a test.
  //
  // `nodes` is the scenario's ROUTE, and it is judged here because here is the only rail that can fix
  // it: a red check redelegates to this role. Step 8 seeds the ripple subgraph from these paths
  // (docs/ripple.md §4) and step 9's `checkDesign` rule 1 then demands a contract for every node of
  // the route — which the role copies OUT of that subgraph and has no other source for. A node named
  // here but absent from the map would therefore reach step 9 as a node with no contract, and step 8
  // has no redelegation to fix it with — only a terminal `blocked`.
  if (!frd.scenarios.length) B.push("F4 ни одного <scenario> — различать изменение нечем")
  const ucs = new Set(frd.usecases.map((u) => u.id))
  for (const sc of frd.scenarios) {
    const at = sc.id || "(scenario без id)"
    if (!sc.uc || !ucs.has(sc.uc)) B.push(`F4 ${at}: uc="${sc.uc || ""}" — такого <usecase> нет`)
    if (!sc.before || !sc.after) B.push(`F4 ${at}: before/after пусты — сценарий не различающий`)
    else if (sc.before.trim() === sc.after.trim()) B.push(`F4 ${at}: before и after совпадают — сценарий зелен и до изменения`)
    const route = String(sc.nodes || "").split(/\s+/).filter(Boolean)
    if (!route.length) B.push(`F4 ${at}: nodes пуст — через какие узлы карты идёт сценарий, не названо`)
    // A scenario may run through a node this change creates — that is the whole point of adding one.
    for (const p of route) if (!nodes.has(p) && !newNodes.has(p)) B.push(`F4 ${at}: узла «${p}» нет ни в карте, ни среди создаваемых этим изменением (<delta new="yes">) — маршрут сценария опирается на выдуманный путь`)
  }

  // F4b — the same binding, read the other way. F4 above refuses a scenario whose `uc` resolves to
  // nothing; this refuses a use case no scenario distinguishes. The link is TOTAL in both directions
  // because everything downstream is addressed BY THE SCENARIO: step 9's rule 5 demands a route per
  // scenario of the FRD, its rule 13 takes the candidate nodes out of `<scenario nodes>`, and step 11
  // owes a checklist line per scenario. A use case with none reaches the plan with no countable
  // address at all — declared in the artifact, invisible to every judge after it.
  //
  // BUG_FIX_CONTEXT: live run 7588bf0e-5f69-4fb0-9ba1-bdacee628817
  //   (quarkus-rest-json-app-v2-t2). The FRD declared two use cases and one scenario — `UC2`, the
  //   inline card on the list page, had none — and step 6 closed GREEN: `deltas=1 unknown=0
  //   scenarios=1 touched=1`. F4 was satisfied (one scenario exists, its `uc` resolves), F2b was
  //   satisfied (the page was explained by a neighbour's delta), and the requirement travelled to the
  //   plan as words. The judge is this rule, not the operator: the repair rail already exists — the
  //   `intake` role writes the missing scenario out of the requirement it has already fried.
  const covered = new Set(frd.scenarios.map((sc) => sc.uc).filter(Boolean))
  for (const u of frd.usecases) {
    if (!u.id || covered.has(u.id)) continue
    B.push(`F4b ${u.id} «${u.goal}» — нет <scenario uc="${u.id}">. ` +
           `Напиши: <scenario id="…" uc="${u.id}" before="как сейчас" after="как станет" nodes="путь путь"/>`)
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
  // NO_CODE — the branch that fails without a code of its own, said OUT LOUD.
  //
  // BUG_FIX_CONTEXT: live run a3597dd3 (eddi). The operator had decided that a missing glossary term
  //   resolves to an empty string — lenient, no error at all — and the role wrote
  //   `<ext id="4a" error="none" outcome="term не найден …"/>`. This rule read "none" as a CODE, the
  //   failure map had no such row, and the artifact was refused. The legal move existed — leave
  //   `error` off — but nothing said so: the order's example carries `error="CODE"` on every `<ext>`.
  //   So the role did what this repository does everywhere else and DECLARED the absence, the way
  //   `<failures found="no">`, `<toggles found="no">`, `<subject found="no">` and `Unknown why` do.
  //   The form was missing a word, not the role a rule: replaying this guardrail over that same
  //   artifact leaves zero blockers once "none" means what the role meant by it.
  // An omitted `error` keeps meaning the same thing — F6 has always judged only the codes that exist.
  const NO_CODE = "none"
  const errs = new Set(frd.usecases.flatMap((u) => u.exts.map((e) => e.error).filter((e) => e && e !== NO_CODE)))
  const codes = new Set(frd.failures.map((f) => f.code).filter(Boolean))
  for (const e of errs) if (!codes.has(e)) B.push(`F6 код «${e}» из <ext> не описан в карте отказов`)
  for (const c of codes) if (!errs.has(c)) B.push(`F6 код «${c}» карты отказов не встречен ни одним <ext>`)

  // F9 — a rewind's SUBJECT survives the repair. `rewind` carries the previous review's blockers only
  // when it Rejected (ext/index.mjs::checkFrd reads .agent/review.xml); [] otherwise, and then this
  // rule is as silent as F5 is with no sources.
  //
  // Only `goal-not-delivered` is judged: its carrier is always expressible in FRD grammar (a touched,
  // a delta, a scenario, a use case's own `<post>`) so "the element is gone" is unambiguously a defect
  // of the REPAIR, not of the finding. `unverifiable-node` gets no row here — after CODE_OWNER moved it
  // to `operator` (steps/review/review.mjs) that code never reaches this rewind at all, and a rule for
  // a rewind that cannot occur is a promise about a mechanism this artifact does not have.
  //
  // BUG_FIX_CONTEXT: live run 508d74fa (sandbox/runbox/quarkus-rest-json-app-v2-t2, before this fix
  //   existed). A `goal-not-delivered` blocker named UC2 as its evidence; the role facing it deleted
  //   UC2's carrier — `<touched>` emptied, `fruits.html` cut from `S2@nodes` — instead of adding one.
  //   The blocker vanished because its subject no longer existed to point at, the plan collapsed from
  //   3 nodes to 1, and BRD requirement R2 stopped being delivered by anyone, silently.
  const ids = rewind.some((r) => r && r.code === "goal-not-delivered") ? frdIds(frd) : null
  for (const r of rewind) {
    if (!r || r.code !== "goal-not-delivered") continue
    const evidence = String((r && r.evidence) || "").trim()
    if (evidence && !ids.has(evidence)) {
      B.push(`F9 предмет перемотки «${evidence}» удалён из FRD — требование не гасят удалением; верни элемент; если требование действительно снято оператором, оно снимается из TASK.md/BRD отдельной работой, не полосой`)
    }
  }

  return B
}

// FUNCTION_CONTRACT: newFrd — step 6's artifact, fit to be handed to steps 7-9
//   Input:        { xml, nodes, tests, sources, rewind } — xml as the role wrote it in staging
//   Dependencies: parseFrd, checkFrd, numbersIn
//   Antecedent:   xml — any value; nodes — Set<path> from the map; tests — its subset marked
//                 `kind="test"` (steps/intake/map.mjs::parseMap); sources — the texts a number may
//                 come from (TASK.md, the VALUES of operator answers, the BRD, the map itself); an
//                 empty array means "no sources supplied" and F5's number rule stays silent; rewind —
//                 forwarded to checkFrd's F9 unchanged, [] when this is not a rewind
//   Consequent:   success: the frozen FRD plus `unknown` — how many deltas the role could not
//                          classify; step 7 refuses to write a weight while that number is non-zero
//                 failure: "invalid-frd" — the detail carries EVERY blocker, one per line, and rides
//                          in the FEEDBACK of the redelegation exactly as newBrd's does
//   Purity:       pure
export function newFrd({ xml, nodes = new Set(), tests = new Set(), entries = new Set(), edges = [], sources = [], rewind = [] }) {
  const frd = parseFrd(xml)
  if (!frd.usecases.length && !frd.deltas.length) {
    return err("invalid-frd", "в артефакте нет ни <usecase>, ни <delta> — грамматика не распознана: staging пуст или это не frd.xml")
  }

  const src = sources.filter(Boolean)
  const known = src.length ? new Set(src.flatMap((t) => [...numbersIn(t)])) : null

  const blockers = checkFrd({ frd, nodes, tests, entries, edges, known, rewind })
  if (blockers.length) return err("invalid-frd", blockers.join("\n  "))

  return ok(Object.freeze({ ...frd, unknown: frd.deltas.filter((d) => d.form === "Unknown").length }))
}
