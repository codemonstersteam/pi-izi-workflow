// MODULE_CONTRACT: plan — step 10's pure core: the work as a DAG of nodes, each with a check command
// Purpose:    one decision — what the accepted change costs as WORK: which nodes get a ticket, in what
//             order, and by which command each of them is closed. Everything here is a projection of
//             artifacts steps 5-9 already produced; the only value that enters from outside is the
//             task key, and it enters as an answered question, never as a guess.
//             PURE: knows no disk and no git; the io — reading five artifacts, asking the operator,
//             writing AND ERASING one — lives in ext/index.mjs.
// io:         none
// EXTERNAL_DEPENDENCY: steps/ripple/ripple.mjs — changeWidth. The set of nodes the change makes work
//             on is decided at step 8 and MUST be the same set here: step 8 counts it to order a
//             design, step 10 counts it to cut tickets, and two copies of that expression would let
//             the two steps disagree about what the change even touches.
// EXTERNAL_DEPENDENCY: steps/intake/map.mjs — parseMap's parse is the ONLY reader of appgraph.xml in
//             this band; `nodeTests`, `suites`, `spine` and `cycles` were added there rather than
//             re-scanned here for that reason.
// EXTERNAL_DEPENDENCY: core/suites.mjs — hasOwnCheck, the ONE expression of "this node can be closed
//             by a command of its own". Step 6's gate (steps/ripple/ripple.mjs::blindNodes) asks the
//             same question of the same map, and a second copy is how a node this step called
//             self-closing could be the node the gate calls blind.
// EXTERNAL_DEPENDENCY: steps/design/design.mjs — parseDesign AND parseRoutes, both parsed by the
//             CALLER (ext/index.mjs) and handed in. The routes carry the change's own direction and
//             are absent whenever step 9 was skipped, which is a legal input, not a failure.
// EXTERNAL_DEPENDENCY: steps/design/routes.mjs — forwardLegs, the ONE derivation of "which directed
//             edge does a route assert". Step 9's rule 9 refuses a set of routes whose order cannot be
//             built, and it refuses it by this very function: the two steps must not be able to
//             disagree about what a route says (backlog D17, live run f7bf154a).
// EXTERNAL_DEPENDENCY: core/xml.mjs — tokens, the ONE cut of a list-of-tokens attribute. `nodes` of a
//             scenario is read here, at step 6 and at step 9, and three copies of that split are how
//             one artifact means three routes (live run 27b37fdb).
// EXTERNAL_DEPENDENCY: steps/plan/git-conventions.md — the branch convention this module encodes:
//             `<prefix>/<KEY>`, prefix from the weight, base a fact of git. TASK_KEY below is the ONE
//             copy of the key's shape, and plan.test.mjs asserts that the file and this constant
//             agree — the file is what a human and a future ticket read, this constant is what runs.
// Invariants: newPlanIndex is TOTAL — any input, including undefined, yields a Result and never throws
//             (an artifact outlives the run that wrote it); the plan is a FUNCTION of its inputs alone
//             — nodes come out in the MAP's order and the topological sort breaks ties by that same
//             order, so two runs over one input agree byte for byte; a test node is never a node of
//             the plan (changeWidth already removed them, F2/F3 of step 6).
// Interface:  GRAMMAR_VERSION — stamped on the artifact
//             TASK_KEY — the shape of the operator's answer
//             KEY_QUESTION — the question's text, verbatim and byte-stable across runs
//             newPlanIndex({ frd, map, mode, design, trunk, answers }) -> Result<Plan, ...>

import { ok, err } from "../../core/result.mjs"
import { changeWidth } from "../ripple/ripple.mjs"
import { forwardLegs } from "../design/routes.mjs"
import { hasOwnCheck } from "../../core/suites.mjs"
import { tokens } from "../../core/xml.mjs"

// 2 — the node carries what a TICKET needs to be shippable: `dod` (its units, derived once at step 9
//     by steps/design/design.mjs::unitsByPath) and `why` (the FRD's own words about why this node is
//     touched). Live run d8ef8c60 shipped a plan whose page node read `delta: []` and whose resource
//     node's check command was green before a line was written — both facts already existed on disk
//     and the plan simply did not carry them.
export const GRAMMAR_VERSION = 2

// The key's shape, in ONE place — steps/plan/git-conventions.md carries the same regexp for the human
// reader and plan.test.mjs fails when the two disagree.
export const TASK_KEY = /^[A-Z]{2,20}-[0-9]{1,6}$/

// The question, VERBATIM and never rebuilt from parts. An answer is recognised by comparing the
// question text stored on disk with this string (core/answers.mjs), so a question assembled from
// variables would stop matching its own answer the moment any variable changed — the class of defect
// that cost run 46edab60 two re-asks of a question the operator had already answered. A script can
// hold this property; a role cannot, which is why the script asks it.
export const KEY_QUESTION =
  "Ключ задачи для этой работы? Формат TASK-номер — 2-20 заглавных латинских букв, дефис, число 1..999999 (например DOS-42). Из него будет собрано имя ветки, он же приедет в каждый тикет и в сообщение коммита."

// refused — the re-ask, and why it is a DIFFERENT string rather than the same question twice.
//
// BUG_FIX_CONTEXT: live run 03b598c7 (runbox/quarkus-rest-json-app-v2-t3), the first live run of this
//   step. The operator answered `T3-1`, which the regexp above rejects (only letters before the dash).
//   Previous: a rejected answer returned err("ask", KEY_QUESTION) — the SAME text as the first ask.
//   Problem:  askOperator (workflows/izi.js) judges "answered" by the question's TEXT: an answer to
//             that exact question was already on disk, so it returned WITHOUT pausing. The phase then
//             called plan() again, got the same ask, and burned all three QUESTION_ROUNDS in seconds
//             — the journal shows plan/2, plan/3 and plan/4 each followed by setPending + answers +
//             clearPending and NO checkpoint. The operator was asked exactly once and never told why
//             their answer did not take.
//   Fix:      the re-ask carries the refused value and the reason, so it is a NEW question — which is
//             what askOperator needs in order to pause, and what the operator needs in order to fix
//             the answer. The text of the refusal IS the repair instruction, the same rule step 6's
//             blockers were given after run 6889fc3f (docs/design.md §9).
const refused = (value) => `\n\n(Предыдущий ответ «${value}» не подошёл: до дефиса — только заглавные латинские буквы, 2-20 штук, после — число. Напиши ключ ещё раз.)`

// A weight is a prefix, and nothing else decides it: `patch` means the deltas were only `Fixed`, that
// is a defect repaired; anything else is functionality (steps/weight/weight.mjs::MODE_TABLE).
const PREFIX = Object.freeze({ patch: "bugfix", minor: "feature", major: "feature" })

// A document is a node of the plan like any other (docs-as-code: there is no separate "update the
// docs" step), but nothing in a repository runs it — its check is the human at the gate.
const DOC_EXT = /\.(md|markdown|adoc|rst|txt)$/i

const base = (path) => String(path).split("/").pop().replace(/\.[^.]+$/, "")

// oneCmd — the command that runs ONE file of a suite. `one` is a template the SCOUT read out of the
// repository (`-Dtest={class}`, `--tests {class}`, a bare `{path}`), never a syntax invented here; an
// empty `one` is a legal answer and means the whole suite runs, which is a cost the plan records
// rather than hides (docs/concept.md, "Разведка").
const oneCmd = (suite, testPath) =>
  suite.one
    ? `${suite.cmd} ${suite.one.replace(/\{class\}/g, base(testPath)).replace(/\{path\}/g, testPath)}`
    : suite.cmd

// FUNCTION_CONTRACT: newPlanIndex — the change as an ordered DAG of work
//   Input:        { frd, map, mode, design, routes, trunk, answers, edges, units }
//                 frd    — parseFrd's parse (steps/intake/frd.mjs): deltas, touched, scenarios
//                 map    — parseMap's parse (steps/intake/map.mjs): nodes, tests, edges, nodeTests,
//                          suites, spine, cycles
//                 mode   — the one word of `.agent/mode`
//                 design — parseDesign's parse (steps/design/design.mjs) or null when step 9 was
//                          skipped; used for ONE thing: the deps of a module the change creates
//                 routes — parseRoutes' parse (same module) or [] when step 9 was skipped: the
//                          DIRECTED source of order, the only one that knows an edge into a created
//                          module
//                 trunk  — the trunk's name, a fact of git
//                 answers — [{ question, text }] as core/answers.mjs reads them off disk
//                 edges  — [{from, to}] asserted by step 11's critic, already resolved to plan ids
//                          by its guardrail; [] on the first pass of a run
//   Dependencies: changeWidth, PREFIX, DOC_EXT, oneCmd
//   Antecedent:   any values — every absence below is a named refusal, never a default
//   Consequent:   success: { index, nodes[], order[], gaps[], branch } — `index` is the object written
//                          to .agent/plan-index.json
//                 failure: "no-mode"        — no weight: step 7 refused or never ran
//                          "bad-mode"       — a word outside the vocabulary: another grammar version
//                          "no-width"       — the change touches no module: nothing to plan
//                          "cycle"          — a node of the plan sits inside a `<cycle>` of the map,
//                                             or the deps do not sort at all
//                          "cycle-from-review" — an edge the critic asserted closed the order: the
//                                             requirement contradicts itself, and no re-plan fixes it
//                          "no-trunk"       — neither origin/HEAD nor a local main/master
//                          "ask"            — the task key is missing or malformed; the detail IS the
//                                             question, and the caller puts it on the operator's rail
//                          "uncovered-node" — a `code` node with no check command and no scenario
//                          "no-suite"       — a scenario node whose nodes declare no suite at all
//   Purity:       pure
export function newPlanIndex({ frd, map, mode, design, routes, trunk, answers, edges, units = new Map() } = {}) {
  const weight = String(mode == null ? "" : mode).trim()
  if (!weight) return err("no-mode", ".agent/mode пуст или отсутствует — шаг 7 не отработал, вес не угадывается")
  if (!PREFIX[weight]) {
    return err("bad-mode", `вес "${weight}" вне таблицы — допустимо ${Object.keys(PREFIX).join(" | ")}`)
  }

  const m = map || {}
  const nodesOfMap = m.nodes || new Set()
  const width = changeWidth({ frd, tests: m.tests || new Set() })
  if (!width.size) return err("no-width", "ни одна дельта и ни один <touched> не назвали модуля — планировать нечего")

  const inCycle = [...width].filter((p) => (m.cycles || new Set()).has(p))
  if (inCycle.length) {
    return err("cycle", `узел плана внутри объявленного цикла карты: ${inCycle.join(", ")} — топосорта нет, разрыв цикла есть отдельная работа`)
  }

  // The one value that comes from outside. An answer is recognised by the question it was written
  // under STARTING WITH KEY_QUESTION — the re-ask appends the reason to that same stem, so both the
  // first question and every re-ask address the same value. The LAST such answer wins: an operator
  // who corrects a typo answers again, and the newer answer is the one they meant.
  const mine = (answers || []).filter((a) => a && String(a.question).trim().startsWith(KEY_QUESTION))
  const said = (mine.pop() || {}).text
  const key = String(said == null ? "" : said).trim()
  if (!TASK_KEY.test(key)) return err("ask", key ? `${KEY_QUESTION}${refused(key)}` : KEY_QUESTION)

  const base_ = String(trunk == null ? "" : trunk).trim()
  if (!base_) return err("no-trunk", "транк не найден: ни origin/HEAD, ни локальных main/master — «текущая ветка» транком не считается")

  const branch = Object.freeze({ task: key, name: `${PREFIX[weight]}/${key}`, base: base_, source: "operator-answer" })

  // ---- nodes of work -------------------------------------------------------------------------
  // In the MAP's order first, then whatever the change CREATES (absent from the map by definition,
  // F3n of step 6). Two runs over one input therefore list the nodes identically.
  const created = new Set(((frd && frd.deltas) || []).filter((d) => d && d.new === "yes" && d.node).map((d) => d.node))
  const ordered = [...[...nodesOfMap].filter((p) => width.has(p)), ...[...width].filter((p) => !nodesOfMap.has(p))]

  const deltasOf = (path) => ((frd && frd.deltas) || [])
    .filter((d) => d && d.node === path)
    .map((d) => `${d.op || "(без op)"} (${d.form || "?"})`)

  // WHY a node is in the plan when no `<delta>` names it. A node reaches the width through
  // `<touched path why>` too, and until now only the delta travelled: `fruits.html` arrived in the
  // ticket with `delta: []` and nothing at all about the work — the implementer had to guess it back
  // out of the code (live run d8ef8c60). The FRD already said it; the plan simply did not carry it.
  const whyOf = (path) => {
    const row = ((frd && frd.touchedRows) || []).find((t) => t && t.path === path)
    return String((row && row.why) || "").trim()
  }

  const nodes = ordered.map((path) => ({
    id: path,
    kind: DOC_EXT.test(path) ? "doc" : "code",
    new: created.has(path),
    delta: deltasOf(path),
    why: whyOf(path),
    // THE DEFINITION OF DONE, carried and not recomputed. Step 9 derived it
    // (steps/design/design.mjs::unitsByPath) and wrote it into `.agent/data-flow.md`; the ticket is
    // cut from the PLAN, so a plan without it hands the implementer a node whose check command is
    // green before any work and says nothing about which tests are owed. `[]` when step 9 was skipped
    // — declared, exactly as `deps: []` is for a created node, never guessed.
    dod: [...(units.get(path) || [])],
    deps: [],
    check: [],
    coveredBy: [],
  }))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const codeIds = new Set(nodes.filter((n) => n.kind === "code").map((n) => n.id))

  const gaps = []
  // The suites, indexed once: both the coverage question below (can this node close itself?) and the
  // commands further down read the SAME map, so they cannot disagree about what a suite is.
  const suiteById = new Map((m.suites || []).map((s) => [s.id, s]))

  // ---- the toggle: read off the map, never asked and never invented ----------------------------
  // An additive change ships SWITCHED OFF (docs/concept.md, "Тоггл и транк"). Whether this repository
  // can switch anything off at all is a fact the spine answered at step 5: no mechanism means no
  // toggle node and a declared gap — introducing the first toggle is a separate piece of work with
  // its own gate, exactly as introducing the first test suite is (docs/plan.md §6).
  const mech = (m.spine && m.spine.toggles && m.spine.toggles.mechanism) || ""
  let toggle = null
  if (weight === "minor") {
    if (mech) {
      toggle = { id: "toggle", kind: "toggle", mechanism: mech, source: "graph", deps: [], check: [], coveredBy: [] }
      nodes.push(toggle)
      byId.set(toggle.id, toggle)
    } else {
      gaps.push("toggle")
    }
  }

  // A delta on a node the repository EXPOSES, with no spec in the repository, is the same shape of
  // gap: the spec node needs a validator command, and a repository with no spec has none.
  if ([...width].some((p) => (m.entries || new Set()).has(p)) && !(m.spine && m.spine.contract)) gaps.push("spec")

  // ---- scenario nodes ---------------------------------------------------------------------------
  // A scenario becomes a node when nothing else can own its test: either it spans SEVERAL code nodes
  // (no single one of them owns it), or one of the nodes it distinguishes has no check command of its
  // own. Otherwise the node's own units distinguish it and a second owner would be a second author of
  // one test (docs/concept.md, "API-first — ребро, а не обещание").
  //
  // BUG_FIX_CONTEXT: live run 03b598c7 (runbox/quarkus-rest-json-app-v2-t3).
  //   Previous: the condition was `over.length < 2` alone — a one-node scenario never became a node.
  //   Problem:  the FRD of that run distinguished `fruits.html` with a scenario over that ONE node.
  //             A page carries no delta (it moves no contract, docs/ripple.md §3) and has no `<test>`
  //             in the map — it cannot have one. So the node had no command of its own, its only
  //             scenario was dropped here, and the coverage check below refused the whole plan with
  //             `uncovered-node` on work the FRD had described correctly. Two rules of this step
  //             contradicted each other exactly where they met.
  //   Fix:      the "one node needs no scenario" shortcut holds only while that node can close
  //             ITSELF. hasOwnCheck is read off the map, the same source the commands come from.
  //   Moved to core/suites.mjs (D23): step 6's gate asks the same question of the same map, and one
  //   expression is what keeps "the node closes itself" from meaning two things.
  const closesItself = (path) => hasOwnCheck(m, path)
  for (const s of (frd && frd.scenarios) || []) {
    const over = tokens(s.nodes).filter((p) => codeIds.has(p))
    if (!over.length) continue
    if (over.length < 2 && over.every(closesItself)) continue
    const node = { id: `scenario:${s.id}`, kind: "scenario", scenario: s.id, deps: [...new Set(over)], check: [], coveredBy: [] }
    nodes.push(node)
    byId.set(node.id, node)
    for (const p of node.deps) byId.get(p).coveredBy.push(node.id)
  }

  // ---- edges ------------------------------------------------------------------------------------
  // Direction comes from the MAP, whose `<edge from to>` a script computed at step 3 (`from` uses
  // `to`). It does NOT come from `<dep>`: the ripple projects every edge in BOTH directions on
  // purpose (radius 1 either way), so a design graph gives mutual deps and a topological sort over
  // them is impossible — measured on the live t3 artifacts, two two-node cycles (docs/plan.md §2, A).
  const addDep = (from, to) => {
    const n = byId.get(from)
    if (n && from !== to && byId.has(to) && !n.deps.includes(to)) n.deps.push(to)
  }
  for (const e of m.edges || []) if (byId.has(e.from) && byId.has(e.to)) addDep(e.from, e.to)

  // The SECOND source of direction: the design's ROUTES. A route is directed by construction — it is
  // the scenario played out in time — and it is the only artifact that knows an edge INTO a module
  // the change creates, because the map was built before that file existed.
  //
  // BUG_FIX_CONTEXT: the live artifacts of runbox/quarkus-rest-json-app-v2-t3 (run c6bc2e54).
  //   Previous: the map's edges were the only source.
  //   Problem:  `fruits.html` gets an anchor to `fruit-card.html` (FRD UC1 step 2), and `fruit-card`
  //             is created by this very change. No map edge can carry that — the map predates the
  //             file — so the plan ordered the page BEFORE the page it links to, and the implementer
  //             of instruction 1 would have had no contract to link against.
  //   Fix:      the forward leg of every route is an edge. Only the FORWARD leg: a route returns
  //             along the same nodes (`fruit-card#2 -> FruitResource#1 -> fruit-card#3`), and taking
  //             the return as an edge would reintroduce exactly the two-node cycle that disqualified
  //             `<dep>`. A node already seen in this route is where the return begins.
  //
  // D17: the derivation itself moved to steps/design/routes.mjs::forwardLegs and is CALLED from both
  // sides. Its other caller is rule 9 of step 9's own guardrail, which refuses a set of routes whose
  // order cannot be built — and a promise of "step 10 will sort this" made by a SECOND copy of this
  // loop would be a promise about a different graph (live run f7bf154a, backlog D17).
  for (const l of forwardLegs(routes)) addDep(l.from, l.to)          // caller waits for the callee

  // A created module has no edge in the map — it is not there yet. Its neighbours are what the
  // designer wrote, and the undirectedness of `<dep>` is harmless here: a module that does not exist
  // yet is later than every module that does.
  for (const n of nodes) {
    if (!n.new || !design) continue
    for (const d of (design.get(n.id) || {}).deps || []) if (nodesOfMap.has(d)) addDep(n.id, d)
  }

  // The capability is switched by the flag, so the flag exists first.
  if (toggle) for (const n of nodes) if (n.kind === "code" && n.delta.length) addDep(n.id, toggle.id)

  // ---- edges asserted by the critic (step 11) ---------------------------------------------------
  // A blocker `unreachable-antecedent` says "node X needs node Y", and BOTH ends were resolved to
  // plan ids by the guardrail's rules R3/R4 before it got here (docs/review.md §5) — so it is an
  // edge, and applying it is a repair the script performs for 0 tokens instead of re-delegating a
  // role. What the model may NOT decide is whether the result is still a DAG: that stays here, and a
  // review edge that closes a cycle is a contradiction in the requirement, named as its own refusal
  // rather than folded into `cycle` (which means a cycle the repository has had for years).
  const asserted = (edges || []).filter((e) => e && byId.has(e.from) && byId.has(e.to))
  for (const e of asserted) addDep(e.from, e.to)

  // ---- order: Kahn, ties broken by the listing order above --------------------------------------
  const order = []
  const left = new Map(nodes.map((n) => [n.id, new Set(n.deps)]))
  while (left.size) {
    const ready = [...left].filter(([, d]) => ![...d].some((x) => left.has(x))).map(([id]) => id)
    if (!ready.length) {
      const stuck = new Set(left.keys())
      const guilty = asserted.filter((e) => stuck.has(e.from) && stuck.has(e.to))
      if (guilty.length) {
        return err("cycle-from-review", `ребро, утверждённое критиком, замкнуло порядок: ${guilty.map((e) => `${e.from} → ${e.to}`).join(", ")} — требование противоречиво, план этого не чинит`)
      }
      return err("cycle", `неразрешимый порядок среди узлов плана: ${[...left.keys()].join(", ")}`)
    }
    for (const id of ready) { order.push(id); left.delete(id) }
  }

  // ---- check commands ---------------------------------------------------------------------------
  const suitesOf = (path) => ((m.nodeTests || new Map()).get(path) || [])
    .map((t) => suiteById.get(t.suite))
    .filter(Boolean)

  for (const n of nodes) {
    if (n.kind !== "code") continue
    for (const t of (m.nodeTests || new Map()).get(n.id) || []) {
      const s = suiteById.get(t.suite)
      if (s) n.check.push({ suite: s.id, cmd: oneCmd(s, t.path) })
    }
  }

  // A scenario's own test file does not exist yet, so there is nothing to substitute into `one`: the
  // suites of the nodes it distinguishes run WHOLE, and that cost is written down rather than hidden.
  const wholeSuites = (paths) => {
    const seen = new Map()
    for (const p of paths) for (const s of suitesOf(p)) if (!seen.has(s.id)) seen.set(s.id, { suite: s.id, cmd: s.cmd })
    return [...seen.values()]
  }
  // A scenario whose nodes declare no test at all still has a command, and it is READ, not invented:
  // every `<suite>` of the map. A scenario is an end-to-end check — it exercises the running
  // application, and which suites this repository has is a fact step 5 already established. The set is
  // coarse (step 16 runs all of them anyway) and it is written into the node, so the operator sees at
  // the gate what closing this scenario costs.
  //
  // BUG_FIX_CONTEXT: live run 03b598c7, the third face of one finding. `fruits.html` is distinguished
  //   by a one-node scenario; the page has no `<test>` in the map and cannot have one, so wholeSuites
  //   came back empty and the plan refused with `no-suite` on an FRD that had described the work
  //   correctly. The refusal stays for the case it was written for — a map carrying no suite at all,
  //   which step 5 already stops the band on, and which only an artifact older than that rule produces.
  const allSuites = (m.suites || []).map((s) => ({ suite: s.id, cmd: s.cmd }))
  for (const n of nodes) {
    if (n.kind !== "scenario") continue
    n.check = wholeSuites(n.deps)
    if (!n.check.length) n.check = allSuites
    if (!n.check.length) {
      return err("no-suite", `сценарий ${n.scenario}: в карте нет ни одного <suite> — закрывать его нечем (шаг 5 такую карту не выпускает)`)
    }
  }
  // The toggle is proven by the scenario "switched off ⇒ the previous behaviour", not by a test of
  // its own; it therefore runs what the changed nodes' suites run.
  if (toggle) toggle.check = wholeSuites(nodes.filter((n) => n.kind === "code" && n.delta.length).map((n) => n.id))

  // ---- coverage ---------------------------------------------------------------------------------
  // A `code` node with neither its own command nor a scenario cannot be closed at step 15 and cannot
  // be caught at step 16: "done" would be said by the role, which is the one thing rule 2 of the
  // concept forbids. The repair rail for it is step 6 — a scenario that distinguishes the node.
  const uncovered = nodes.filter((n) => n.kind === "code" && !n.check.length && !n.coveredBy.length)
  if (uncovered.length) {
    return err("uncovered-node", `узел без своей команды проверки и без сценария: ${uncovered.map((n) => n.id).join(", ")} — закрыть его на шаге 15 нечем (шаг 6: назови сценарий, который его различает)`)
  }

  const index = {
    grammar: GRAMMAR_VERSION,
    mode: weight,
    branch,
    gaps,
    order,
    nodes: order.map((id) => byId.get(id)),
  }
  return ok(Object.freeze({ index, nodes: index.nodes, order, gaps, branch }))
}
