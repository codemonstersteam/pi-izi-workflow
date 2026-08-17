// MODULE_CONTRACT: card — step 9's split: which files are COMMON to several use cases, and which are not
// Purpose:    one decision, and everything after it depends on the answer: can a use case be designed
//             ALONE. A file touched by one use case can — its designer sees the whole truth about it.
//             A file touched by several cannot: N designers would write N different versions of it,
//             and the seam between their tickets would be a coin toss. So the common files are named
//             here, grouped, and designed ONCE, before the swarm — dubbing is prevented rather than
//             reconciled afterwards.
//             PURE: knows nothing of disk, io lives in ext/index.mjs. The flow — docs/design.md §1.
// io:         none
// EXTERNAL_DEPENDENCY: core/xml.mjs::tokens — `<scenario nodes>` is a list of TOKENS, and its
//             separator is declared once for the whole class there. Step 6, step 9 and step 10 read
//             this same attribute, and three copies of that split are how one artifact means three
//             different route sets (live run 27b37fdb).
// Invariants: splitOf is TOTAL — any input, including undefined, yields an empty split and never
//             throws; the split is a FUNCTION of the FRD alone, so two runs over one requirement
//             agree byte for byte; the order of everything it returns is the FRD's own.
// Interface:  splitOf({ frd }) -> { ucOf, shared, own, groups }
//
// THE MEASUREMENT THAT MAKES THIS STEP NECESSARY. On form `eddi`: 13 nodes of the change, and **8 of
// them are touched by two or more use cases** — `RestGlossaryStore`, `IGlossaryStore` and
// `GlossaryStore` by EIGHT each. A swarm cut by use case would hand those eight files to two-to-eight
// independent designers. It is not an edge case, it is the majority of the change. On `t2` the same
// count is zero, and this whole phase costs nothing there.
//
// The collision is not hypothetical either: in a live run the designer of UC2 wrote `terms` as a
// nested class while UC6-UC8 create a separate `model/Term.java` — two designs of one file, from two
// designers who could not see each other.

import { tokens } from "../../core/xml.mjs"

// The longest directory both paths share, as the group's readable name. A group's id is never
// invented (`g1`, `g2`): it is read by a human on the gate and printed in the order's header, and a
// name that says `configs/glossary` explains the grouping by itself.
const commonDir = (paths) => {
  if (!paths.length) return ""
  const parts = paths.map((p) => p.split("/").slice(0, -1))
  const head = parts[0]
  let k = 0
  while (k < head.length && parts.every((p) => p[k] === head[k])) k++
  return head.slice(0, k).join("/")
}

// FUNCTION_CONTRACT: splitOf — the change cut into what one use case owns and what several share
//   Input:        { frd } — parseFrd's object
//   Dependencies: core/xml.mjs::tokens
//   Antecedent:   any value; a missing/garbage FRD yields an empty split
//   Consequent:   success: { ucOf, shared, own, groups }
//                          ucOf   — Map<path, readonly uc[]>: every path any `<scenario nodes>` names,
//                                   with the use cases that reach it, both in the FRD's order
//                          shared — paths named by TWO or more use cases, in the FRD's order
//                          own    — paths named by exactly one, in the FRD's order
//                          groups — [{ id, paths, ucs }]: the connected components of `shared` over
//                                   the relation "these two files are touched by a common use case",
//                                   `id` being the directory the group's paths share
//                 failure: none — total
//   Purity:       pure
//   Interface:    splitOf({ frd }) -> { ucOf, shared, own, groups }
//
// WHY THE COMPONENT IS OVER USE CASES AND NOT OVER PACKAGES OR EDGES.
//
// A package name is a naming convention, and this pipeline runs on repositories that keep theirs
// badly or not at all. The map's edges are worse still for this question: 7 of eddi's 13 nodes are
// CREATED by the change, so the map — built before those files existed — carries no edge for them at
// all, and the whole glossary quintet would fall apart into five groups of one.
//
// "Touched by a common use case" needs neither. It is also the exact statement of the obligation: if
// one use case runs through two files, their contracts must agree, so they must be decided together.
// Measured: `eddi` 8 shared files → 2 groups (the glossary five, the backup three), `t3` 1 → 1,
// `t2` 0 → 0.
export function splitOf({ frd = {} } = {}) {
  const ucOf = new Map()
  for (const s of (frd && frd.scenarios) || []) {
    const uc = String((s && s.uc) || "").trim()
    if (!uc) continue
    for (const p of tokens(s && s.nodes)) {
      if (!ucOf.has(p)) ucOf.set(p, [])
      if (!ucOf.get(p).includes(uc)) ucOf.get(p).push(uc)
    }
  }

  const shared = [...ucOf].filter(([, u]) => u.length > 1).map(([p]) => p)
  const own = [...ucOf].filter(([, u]) => u.length === 1).map(([p]) => p)

  // Union-find over `shared`: two files are in one group when SOME use case reaches both. The
  // relation is transitive by construction — `Glossary` meets the trio through UC1-UC5 and `Term`
  // meets it through UC6-UC8, so all five decide together even though `Glossary` and `Term` share no
  // use case of their own.
  const parent = new Map(shared.map((p) => [p, p]))
  const find = (x) => { while (parent.get(x) !== x) x = parent.get(x); return x }
  for (const a of shared) {
    for (const b of shared) {
      if (a >= b) continue
      if (!ucOf.get(a).some((u) => ucOf.get(b).includes(u))) continue
      const ra = find(a), rb = find(b)
      if (ra !== rb) parent.set(ra, rb)
    }
  }

  const byRoot = new Map()
  for (const p of shared) {
    const r = find(p)
    if (!byRoot.has(r)) byRoot.set(r, [])
    byRoot.get(r).push(p)
  }
  const groups = [...byRoot.values()].map((paths) => Object.freeze({
    id: commonDir(paths) || paths[0],
    paths: Object.freeze(paths),
    // The use cases of a group, in the FRD's order: this is what the common designer is handed, and
    // it must be every use case that can be broken by the group's contract.
    ucs: Object.freeze([...new Set(paths.flatMap((p) => ucOf.get(p)))]),
  }))

  return Object.freeze({
    ucOf,
    shared: Object.freeze(shared),
    own: Object.freeze(own),
    groups: Object.freeze(groups),
  })
}
