// MODULE_CONTRACT: slices — the repository cut into cones of its entry points
// Purpose:    one decision — which files hang off which ENTRY. A vertical slice is declared by an
//             entry and computed by following directed edges down from it, never by connected
//             components: a component ignores direction and on a monolith glues 79% of the
//             repository into one blob (1544 modules of eddi's 1945), while a cone descends through
//             the layers and stops at the leaves — p50 7 nodes, max 69 on the same tree
//             (docs/big-projects-solution.md §2).
// io:         none
// Invariants: total — any input, including undefined, yields { slices, orphans }; every known node
//             is in some slice or in orphans, never in neither; an edge whose end is not a known
//             node is ignored, so a slice never names a path the plan does not carry.
// Interface:  TEST_PATHS — the path shapes this step reads as "test"
//             newSlices({ nodes, edges, routes }) -> { slices, orphans }

import { newLevels } from "../graph/levels.mjs"

// TEST_PATHS — "test" as a PATH, and there can be no other definition at this step.
//
// The pipeline's real rule for "this node is a test" lives in steps/graph/graph.mjs and reads the
// spine's `<suite path>` — that is, the SWARM's result, which at step 3b does not exist yet. So this
// is an approximation, and its price is declared rather than discovered:
//   false "test"     — an entry is lost: nothing declares that cone, and its files reach the focus
//                      only through another entry, or not at all
//   false "not test" — the cone of a test is built, and a test drags its whole stand in: measured on
//                      eddi as 220 nodes → 488 files → 203 KB of map for ONE entry, with 79 of 852
//                      such entries above the reading cap (docs/big-projects-solution.md §2)
// The asymmetry is why the list stays narrow: only shapes that a language's own convention reserves.
//
// This is NOT a second copy of step 5's rule. That one answers "is this node a test in the map";
// this one answers "may this path be an ENTRY". Said out loud because the two look identical.
export const TEST_PATHS = Object.freeze([
  /(^|\/)tests?\//,                      // src/test/…, tests/… — the directory convention
  /(^|\/)__tests__\//,
  /Tests?\.java$/,                       // JsonResponseFormatThreadingTest.java
  /_test\.go$/,
  /(^|\/)test_[^/]*\.py$|_test\.py$/,
  /\.(spec|test)\.[jt]sx?$/,
])

const isTest = (p) => TEST_PATHS.some((re) => re.test(p))

// FUNCTION_CONTRACT: newSlices — every entry's cone, and what no entry reaches
//   Input:        nodes  — [string], every file of the PLAN (cells[].files[].path). Not the ends of
//                          edges: computed carries no node set, and taking nodes from there would
//                          drop the orphans — configs, templates, files of languages with no edge
//                          rules — on which the anchor rule of §7 depends
//                 edges  — [{ from, to }], directed, as parseComputed returns them
//                 routes — [string], the files with a route computed from annotations (api[].at)
//   Dependencies: newLevels (steps/graph/levels.mjs) — fanin is counted THERE, there is no second
//                 count of it here; TEST_PATHS, isTest
//   Antecedent:   any values; missing ones read as empty lists
//   Consequent:   success: {
//                   slices  — [{ id, entry, kind, nodes }] sorted by size desc then by entry path;
//                             `id` is "s1".."sn", `kind` is "route" | "head", `nodes` includes the
//                             entry itself and the tests OF THE ENTRY
//                   orphans — [string], the nodes no cone reached, sorted
//                 }
//                 failure: none — total
//   Purity:       pure
//   Interface:    newSlices({ nodes, edges, routes }) -> { slices, orphans }
//
// An entry is a file with a computed route, or a HEAD — fanin 0 with at least one edge. A test path
// is never an entry (TEST_PATHS). An isolated node — no edge at all — is not a head either: it
// declares nothing, and it reaches the focus as an orphan carrying an anchor (§7), which is the only
// way a `.properties` change can be surveyed at all.
//
// Only the tests OF THE ENTRY join the cone, never the tests of its other nodes. Measured: tests of
// the whole cone cost p50 108 KB and put 48 of 99 entries above the cap; tests of the entry cost
// +1 KB and put none (docs/big-projects-solution.md §2в). The entry is where the delta lands most
// often, and its check command is what step 10 needs by name.
export function newSlices({ nodes, edges, routes } = {}) {
  const known = new Set((nodes || []).map((n) => String(n || "")).filter(Boolean))
  const es = (edges || []).filter((e) => e && known.has(e.from) && known.has(e.to))

  const out = new Map()
  const inn = new Map()
  for (const p of known) { out.set(p, []); inn.set(p, []) }
  for (const e of es) { out.get(e.from).push(e.to); inn.get(e.to).push(e.from) }

  const { fanin } = newLevels({ nodes: [...known], edges: es })
  const routed = new Set((routes || []).map((r) => String(r || "")).filter((p) => known.has(p)))

  const entries = [...known]
    .filter((p) => !isTest(p))
    .filter((p) => routed.has(p) || (fanin[p] === 0 && (out.get(p).length || inn.get(p).length)))
    .sort()

  const cone = (entry) => {
    const seen = new Set([entry])
    const queue = [entry]
    while (queue.length) {
      for (const to of out.get(queue.shift())) if (!seen.has(to)) { seen.add(to); queue.push(to) }
    }
    for (const from of inn.get(entry)) if (isTest(from)) seen.add(from)
    return [...seen].sort()
  }

  const slices = entries
    .map((entry) => ({ entry, kind: routed.has(entry) ? "route" : "head", nodes: cone(entry) }))
    .sort((a, b) => b.nodes.length - a.nodes.length || a.entry.localeCompare(b.entry))
    .map((s, i) => Object.freeze({ id: `s${i + 1}`, entry: s.entry, kind: s.kind, nodes: Object.freeze(s.nodes) }))

  const reached = new Set(slices.flatMap((s) => s.nodes))
  return Object.freeze({
    slices: Object.freeze(slices),
    orphans: Object.freeze([...known].filter((p) => !reached.has(p)).sort()),
  })
}
