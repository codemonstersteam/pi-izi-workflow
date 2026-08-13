// MODULE_CONTRACT: focus — which cells the swarm surveys, decided BEFORE the swarm runs
// Purpose:    one decision — the focus of the run: every cell of the plan while the plan fits the
//             reader's window, and the cones the BRD's anchors NAME once it does not. The decision
//             costs zero tokens and happens before step 4, which is the whole point: today the
//             pipeline learns "the map does not fit" at step 6, having already paid 306 scout calls
//             and ≈10M input tokens for the answer (docs/big-projects-problems.md §2).
// io:         none
// Invariants: total — any input, including undefined, yields a Result; a chosen focus never names a
//             cell the plan does not carry; the spine cell is in every focus; the estimate is
//             the map's own arithmetic over nodes AND edges, and cells are taken WHOLE; what did not fit is COUNTED
//             and returned, never silently absent.
// Interface:  names(anchor, path) -> boolean   — the anchor→file rule of THIS step
//             newFocus({ slices, anchors, cells, edges, cap }) -> Result<Focus, …>

import { ok, err } from "../../core/result.mjs"
import { MAP_CAP_BYTES, MAP_NODE_BYTES, MAP_EDGE_BYTES, MAP_EST_SLACK } from "../intake/map.mjs"

// names — the anchor rule of step 3b, and it is NOT the anchor rule of step 3.
//
// Step 3 MARKS a file when the anchor's text occurs anywhere in it (ext/index.mjs::hitsFor, a
// substring of the whole file). That is right for marking: a mention is a mention. It is wrong for
// CHOOSING, and a live run proved it rather than an argument — run e90d9ce1 on eddi, where the BRD's
// anchors were `glossary · GlossaryConfiguration · eddi://ai.labs.glossary · export · import`:
//   · `import` is a java KEYWORD. Every java file opens with a block of them, so the anchor marked
//     essentially the whole repository and named 83 of the 84 entries — the choice degenerated into
//     "everything", which is the state step 3b exists to end;
//   · the three anchors that mean the actual work (`glossary`, …) matched nothing at all, because the
//     type does not exist yet. Correct, and orthogonal.
// So the anchor must NAME the file — and the name of a file is its PATH. The comparison is
// case-insensitive because an anchor is a word from a REQUIREMENT (`export`) while a path is code
// (`IRestExportService.java`): one word, two conventions.
//
// Matching the api and decl NAMES a file declares as well was written and then removed: on the only
// evidence there is — the anchors of run e90d9ce1 over the whole eddi tree — it selected the same
// two cones as the path alone. Code with no measurement behind it is not a safeguard, it is surface
// area. The trigger to bring it back is a run where an anchor names an endpoint (`GET /fruits`) that
// no path carries.
//
// An empty anchor is refused rather than allowed to match: `"".includes("")` is true, so an empty
// string would name the entire repository — the very failure this rule exists to end.
//
// This is the split docs/survey-plan.md §1 asked for out loud: an anchor MARKS a file (step 3, by
// its text) and NAMES a slice (step 3b, by its path). Two roles of one value, now two rules.
export function names(anchor, path) {
  const a = String(anchor == null ? "" : anchor).trim().toLowerCase()
  if (!a) return false
  return String(path == null ? "" : path).toLowerCase().includes(a)
}

const kb = (n) => `${Math.round(n / 1024)} КБ`

// FUNCTION_CONTRACT: newFocus — the run's focus, chosen and declared
//   Input:        slices  — [{ id, entry, kind, nodes }] as newSlices returns them
//                 orphans — [string], the nodes no cone reached
//                 anchors — [string], the BRD's anchors (plan.subjects) — NAMES, not paths
//                 analogue — the existing mechanism this work is modelled on (BRD `analogue:`), or
//                           "" / "none …" when the BRD declared there is none
//                 cells   — the plan's cells: [{ id, kind, files: [{ path }] }]
//                 edges   — [{ from, to }] of graph-computed.xml: the estimate prices them, because
//                           on a monolith they are the larger half of the map
//                 cap     — the reading ceiling; MAP_CAP_BYTES when absent
//   Dependencies: ok, err (core/result.mjs), names, kb
//   Antecedent:   any values; missing ones read as empty. `cells` empty is the "no plan" case, not
//                 an empty focus
//   Consequent:   success: { why, chosen, cells, files, estBytes, dropped, slices, entries } where
//                          `why` is "whole-plan" | "anchors", `chosen` the slice ids taken and
//                          `dropped` — { slices, cells } — what the ceiling left out
//                 failure: "no-plan"   — step 3 left no cells
//                          "no-entry"  — the plan does not fit and not one entry exists
//                          "no-anchor" — entries exist, and not one of them is NAMED by an anchor:
//                                        there is nothing to narrow BY, and the repair is the BRD's
//                                        anchors, not a choice among 84 candidates
//                          "over-cap"  — even the cheapest named cone does not fit beside the spine
//   Purity:       pure
//   Interface:    newFocus({ slices, anchors, analogue, cells, edges, cap }) -> Result
//
// WHY NO QUESTION TO THE OPERATOR, and the two reasons are not the same reason.
//
// The first shape of this module asked one: over the ceiling it returned err("ask") with a list of
// candidate slices, and the operator answered by number. Run e90d9ce1 showed that shape was BROKEN —
// every one of the twelve candidates it offered was priced at 685-689 KB, because the estimate of
// any choice also carried every anchor-marked orphan, and the orphans were the whole cost. No answer
// could change the total: the question was unanswerable by construction.
//
// That defect alone did NOT force the rail's removal — it was downstream of the anchor rule above,
// and with `names` in place those same anchors select two cones and 43 KB, which a question could
// have offered. The rail is gone because the operator decided the step must choose without asking.
// Recorded as two facts rather than one story, because a defect and a decision age differently.
//
// What keeps a choice from being a default (standards/code.md §3) is that its ORDER is stated —
// cheapest named cone first, so the map covers as many named entries as the ceiling allows — and
// that everything which did not fit is COUNTED in `dropped`, carried into `<focus>` by step 5 and
// printed in the run's log. An anchor whose files ended outside comes back as `found="outside"` in
// the map, so step 6's role meets an honest Unknown instead of a guess.
export function newFocus({ slices = [], anchors = [], analogue = "", cells = [], edges = [], cap = MAP_CAP_BYTES } = {}) {
  // The budget is the ceiling MINUS the measured error of the estimate below (steps/intake/map.mjs::
  // MAP_EST_SLACK). Comparing to the ceiling itself is what killed run fa8def32: the estimate was
  // 10% low, the map missed by 3%, and the swarm had already been paid for.
  const budget = Math.floor(cap / MAP_EST_SLACK)
  const plan = (cells || []).filter((c) => c && c.id)
  if (!plan.length) return err("no-plan", ".agent/survey-plan.json не несёт ни одной клетки — шаг 3 не отработал")

  const filesOf = (cs) => cs.reduce((n, c) => n + (c.files || []).length, 0)

  // The estimate, and it is the map's own arithmetic rather than a rule of thumb: every node costs
  // its overhead plus its PATH, every edge costs its overhead plus the two paths it names. Both
  // constants are measured on a live artifact (steps/intake/map.mjs). The path is not averaged away
  // because a monolith's paths are twice a form's, and an edge names two of them — averaging is what
  // made the previous estimate under-count eddi by 2.3×.
  const bytesOf = (cs) => {
    const inMap = new Set(cs.flatMap((c) => (c.files || []).map((f) => f.path)))
    let n = 0
    for (const p of inMap) n += MAP_NODE_BYTES + p.length
    for (const e of edges || []) {
      if (inMap.has(e.from) && inMap.has(e.to)) n += MAP_EDGE_BYTES + e.from.length + e.to.length
    }
    return n
  }

  const allFiles = filesOf(plan)
  if (bytesOf(plan) <= budget) {
    return ok(Object.freeze({
      why: "whole-plan",
      chosen: slices.map((s) => s.id),
      cells: plan.map((c) => c.id),
      files: allFiles,
      estBytes: bytesOf(plan),
      dropped: Object.freeze({ slices: 0, cells: 0 }),
      slices,
      entries: slices.length,
    }))
  }

  if (!slices.length) {
    return err("no-entry", `план не влезает в карту (${allFiles} файлов ≈ ${kb(bytesOf(plan))} при потолке ${kb(cap)}), а сузить нечем: ни одного входа — ни маршрута, ни головы графа`)
  }

  // Which cell holds which path — built once. A cell is taken WHOLE: its composition is the key of
  // the .izi/parts cache, and filtering files inside it would void the cache and break step 3's
  // coverage invariant (docs/big-projects-solution.md §5).
  const cellOf = new Map()
  for (const c of plan) for (const f of c.files || []) cellOf.set(f.path, c)
  const isNamed = (path) => (anchors || []).some((a) => names(a, path))

  const namedFiles = plan.flatMap((c) => (c.files || []).map((f) => f.path)).filter(isNamed)
  const anchored = slices.filter((s) => isNamed(s.entry))
  if (!namedFiles.length) {
    return err("no-anchor", `ни один якорь BRD не называет ни одного файла (файлов ${allFiles}, якорей ${(anchors || []).length}: ${(anchors || []).join(" · ")}). Сузить не по чему — правится формулировка требований, а не выбор среза`)
  }

  const taken = new Set(plan.filter((c) => c.kind === "spine"))   // the spine is not a candidate
  const cost = () => bytesOf([...taken])
  const add = (paths) => {
    const before = new Set(taken)
    for (const p of paths) { const c = cellOf.get(p); if (c) taken.add(c) }
    if (cost() > budget) { taken.clear(); for (const c of before) taken.add(c); return false }
    return true
  }

  // TWO PHASES, and the order between them is measured, not argued.
  //
  // Then the CELL of every file an anchor NAMES — the cheapest and most precise thing an anchor
  // buys: the file itself, without opening anything. Last, the CONES of the named entries —
  // structure, bought after the facts.
  //
  // Measured on eddi over three real anchor sets (two written by the role in live runs, one with the
  // broadest word removed), scored against the oracle of tasks/bench-glossary-eddi.md §3, worst set
  // first — because the anchors are written by a role and cannot be relied on:
  //   named cells → cones   6 / 6 / 7 of 10   ← this
  //   cones first             2 / 6 / 4
  //   by cost, mixed          1 / 6 / 2
  //   by anchor rarity        2 / 6 / 2
  //   orphan-cells first      0 / 6 / 2
  // The gap is not a tie: opening a cone costs an order of magnitude more than naming a file, and on
  // a monolith the budget it eats is budget the named files do not get. This also removes `orphans`
  // as a case of its own — an orphan an anchor names is simply a named file no cone reaches.
  // PHASE ONE — whoever USES the model this work follows. It runs FIRST, and the order is measured.
  //
  // The change's own name does not exist in the repository yet, so no anchor can find the files it
  // lands in. The BRD names what it is modelled on (`analogue`), that thing DOES exist, and the work
  // is to plug the new one into every socket the old one sits in. So: the files the analogue names,
  // then one step BACKWARDS along the edges — who calls them.
  //
  // Measured on eddi (runs 9a98f081 / 256e1830, same TASK.md): all 10 existing files of the
  // benchmark's oracle are among the 50 callers of the snippet code, and not one of them is an entry
  // or a node of any cone — a forward walk cannot reach them at all. With this phase the worst
  // anchor set goes from 2 of 10 to 9 of 10, inside the same budget.
  //
  // One step, not a closure: the callers' own cones are what the last phase is for, and pulling them
  // here cost 233 KB against a 115 KB ceiling when it was measured.
  //
  // WHY FIRST. Run second — after the cells the anchors name — it bought nothing on the worst anchor
  // set: broad words (`resource`, `store`) had already spent the budget, and the run stayed at 2 of
  // 10. Moved ahead of them, the three real anchor sets of the three live runs give the SAME answer:
  // 9 of 10, 14 cells, 104 KB, all three. That is the point of the phase — the focus stops depending
  // on which words a role happened to write, and starts depending on what the work is modelled on.
  const an = /^none\b/i.test(String(analogue).trim()) ? "" : String(analogue).trim()
  const analogueFiles = new Set(an ? [...cellOf.keys()].filter((p) => names(an, p)) : [])
  const callers = analogueFiles.size
    ? [...new Set((edges || []).filter((e) => analogueFiles.has(e.to)).map((e) => e.from))]
    : []
  const callerCells = [...new Set(callers.map((p) => cellOf.get(p)).filter(Boolean))]
    .sort((a, b) => (a.files || []).length - (b.files || []).length || a.id.localeCompare(b.id))
  let droppedCallers = 0
  for (const c of callerCells) {
    if (taken.has(c)) continue
    if (!add((c.files || []).map((f) => f.path))) droppedCallers++
  }

  const cellsByCost = [...new Set(namedFiles.map((p) => cellOf.get(p)).filter(Boolean))]
    .sort((a, b) => (a.files || []).length - (b.files || []).length || a.id.localeCompare(b.id))
  let droppedCells = 0
  for (const c of cellsByCost) {
    if (taken.has(c)) continue
    if (!add((c.files || []).map((f) => f.path))) droppedCells++
  }

  const ordered = anchored
    .map((s) => ({ s, bytes: bytesOf([...new Set(s.nodes.map((n) => cellOf.get(n)).filter(Boolean))]) }))
    .sort((a, b) => a.bytes - b.bytes || a.s.entry.localeCompare(b.s.entry))
  const chosen = []
  let droppedSlices = 0
  for (const { s } of ordered) {
    if (add(s.nodes)) chosen.push(s)
    else droppedSlices++
  }

  const cs = [...taken]
  if (cs.every((c) => c.kind === "spine")) {
    return err("over-cap", `ни одна названная клетка не влезает под потолок ${kb(cap)}: самая дешёвая — ${kb(bytesOf([cellsByCost[0]]))}. Клетка берётся целиком, и разрезать её здесь нельзя — это ключ кэша .izi/parts`)
  }

  const files = filesOf(cs)
  return ok(Object.freeze({
    why: "anchors",
    chosen: chosen.map((s) => s.id),
    cells: cs.map((c) => c.id),
    files,
    estBytes: bytesOf(cs),
    dropped: Object.freeze({ slices: droppedSlices, cells: droppedCells + droppedCallers }),
    slices,
    entries: slices.length,
  }))
}
