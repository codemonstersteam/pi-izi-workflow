// MODULE_CONTRACT: focus — which cells the swarm surveys, decided BEFORE the swarm runs
// Purpose:    one decision — the focus of the run: every cell of the plan while the plan fits the
//             reader's window, and the cones the BRD's anchors NAME once it does not. The decision
//             costs zero tokens and happens before step 4, which is the whole point: today the
//             pipeline learns "the map does not fit" at step 6, having already paid 306 scout calls
//             and ≈10M input tokens for the answer (docs/big-projects-problems.md §2).
// io:         none
// Invariants: total — any input, including undefined, yields a Result; a chosen focus never names a
//             cell the plan does not carry; the spine cell is in every focus; the estimate is
//             `files × MAP_BYTES_PER_NODE`, and cells are taken WHOLE; what did not fit is COUNTED
//             and returned, never silently absent.
// Interface:  names(anchor, path) -> boolean   — the anchor→file rule of THIS step
//             newFocus({ slices, orphans, anchors, cells, cap, perNode }) -> Result<Focus, …>

import { ok, err } from "../../core/result.mjs"
import { MAP_CAP_BYTES, MAP_BYTES_PER_NODE } from "../intake/map.mjs"

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
//                 cells   — the plan's cells: [{ id, kind, files: [{ path }] }]
//                 cap     — the reading ceiling; MAP_CAP_BYTES when absent
//                 perNode — the estimated cost of one node; MAP_BYTES_PER_NODE when absent
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
//   Interface:    newFocus({ slices, orphans, anchors, cells, cap, perNode }) -> Result
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
export function newFocus({ slices = [], orphans = [], anchors = [], cells = [], cap = MAP_CAP_BYTES, perNode = MAP_BYTES_PER_NODE } = {}) {
  const plan = (cells || []).filter((c) => c && c.id)
  if (!plan.length) return err("no-plan", ".agent/survey-plan.json не несёт ни одной клетки — шаг 3 не отработал")

  const filesOf = (cs) => cs.reduce((n, c) => n + (c.files || []).length, 0)
  const allFiles = filesOf(plan)
  if (allFiles * perNode <= cap) {
    return ok(Object.freeze({
      why: "whole-plan",
      chosen: slices.map((s) => s.id),
      cells: plan.map((c) => c.id),
      files: allFiles,
      estBytes: allFiles * perNode,
      dropped: Object.freeze({ slices: 0, cells: 0 }),
      slices,
      entries: slices.length,
    }))
  }

  if (!slices.length) {
    return err("no-entry", `план не влезает в карту (${allFiles} файлов ≈ ${kb(allFiles * perNode)} при потолке ${kb(cap)}), а сузить нечем: ни одного входа — ни маршрута, ни головы графа`)
  }

  // Which cell holds which path — built once. A cell is taken WHOLE: its composition is the key of
  // the .izi/parts cache, and filtering files inside it would void the cache and break step 3's
  // coverage invariant (docs/big-projects-solution.md §5).
  const cellOf = new Map()
  for (const c of plan) for (const f of c.files || []) cellOf.set(f.path, c)
  const named = (path) => (anchors || []).some((a) => names(a, path))

  const anchored = slices.filter((s) => named(s.entry))
  const namedOrphans = (orphans || []).filter(named)
  if (!anchored.length && !namedOrphans.length) {
    return err("no-anchor", `ни один якорь BRD не называет вход среза (входов ${slices.length}, якорей ${(anchors || []).length}: ${(anchors || []).join(" · ")}). Сузить не по чему — правится формулировка требований, а не выбор среза`)
  }

  // The budget is filled in one pass, cheapest first, and what did not fit is counted. The spine is
  // not a candidate: its six questions are not about a slice, so it is in every focus by definition.
  const taken = new Set(plan.filter((c) => c.kind === "spine"))
  const cost = () => filesOf([...taken]) * perNode
  const add = (paths) => {
    const before = new Set(taken)
    for (const p of paths) { const c = cellOf.get(p); if (c) taken.add(c) }
    if (cost() > cap) { taken.clear(); for (const c of before) taken.add(c); return false }
    return true
  }

  // Orphans first: an anchor that NAMES a file it can reach no other way (a config, a template) is
  // the most direct evidence there is — no cone will ever pull it in (docs/big-projects-solution.md §7).
  let droppedOrphans = 0
  for (const p of [...namedOrphans].sort()) if (!add([p])) droppedOrphans++

  const ordered = anchored
    .map((s) => ({ s, bytes: filesOf([...new Set(s.nodes.map((n) => cellOf.get(n)).filter(Boolean))]) * perNode }))
    .sort((a, b) => a.bytes - b.bytes || a.s.entry.localeCompare(b.s.entry))

  const chosen = []
  let droppedSlices = 0
  for (const { s } of ordered) {
    if (add(s.nodes)) chosen.push(s)
    else droppedSlices++
  }

  if (!chosen.length && !namedOrphans.length) {
    return err("over-cap", `самый дешёвый названный конус не влезает: ${kb(ordered[0].bytes)} при потолке ${kb(cap)}. Клетка берётся целиком, и разрезать её здесь нельзя — это ключ кэша .izi/parts`)
  }

  const cs = [...taken]
  const files = filesOf(cs)
  return ok(Object.freeze({
    why: "anchors",
    chosen: chosen.map((s) => s.id),
    cells: cs.map((c) => c.id),
    files,
    estBytes: files * perNode,
    dropped: Object.freeze({ slices: droppedSlices, cells: droppedOrphans }),
    slices,
    entries: slices.length,
  }))
}
