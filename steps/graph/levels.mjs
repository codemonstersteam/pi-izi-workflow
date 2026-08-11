// MODULE_CONTRACT: levels — the ARCHITECTURE of the graph, computed from its edges
// Purpose:    one decision — what "hierarchy" means in `appgraph.xml`. Not nesting (a package inside
//             an artifact: that is an ADDRESS), but SUBORDINATION: the upper level decides, the lower
//             one details it, and control never travels sideways or up. That is the classical notion
//             of modularity, and it is the only one that answers the questions later steps ask —
//             where does a requirement land (step 6), how far does a change ripple (step 8), in what
//             order are nodes done (step 10). Every fact here is derived from edges the script
//             already computed at step 3, so the role is asked NOTHING new. PURE: knows no disk.
// io:         none
// EXTERNAL_DEPENDENCY: none. The `nodes`/`edges` shapes come from steps/graph/graph.mjs, which reads
//             them out of the parts and `.agent/graph-computed.xml`; this module never parses XML.
// Invariants: newLevels is total — any input, including undefined, yields empty tables rather than a
//             throw; an edge whose endpoint is not among `nodes` is IGNORED (the caller owns declaring
//             it — a guardrail that crashed on a dangling edge would turn data into a crash); the
//             result depends on the arguments alone, so two runs over one repository agree; component
//             ids are assigned by SIZE then by first path, never by iteration order.
// Interface:  newLevels({ nodes, edges }) -> { components, isolated, component, level, fanin, fanout,
//             cycle }

// FUNCTION_CONTRACT: newLevels — components, levels and coupling of one graph
//   Input:        nodes — [string], every node path of the graph (isolated ones included: a module
//                         nobody calls and that calls nobody is a FACT, not an omission)
//                 edges — [{ from, to }], directed; duplicates and self-loops are tolerated
//   Dependencies: —
//   Antecedent:   any values; missing ones read as empty lists
//   Consequent:   success: {
//                   components — [{ id, modules, heads }] sorted by size desc then by first path;
//                                `id` is "c1".."cn", `heads` are the component's entry points (no
//                                incoming edge). A connected component is the repository's own
//                                VERTICAL SLICE — declared by nobody, computed from what calls what.
//                                Only groups of TWO or more: a group of one is an isolated module,
//                                not a slice, and it is reported as such
//                   isolated   — [string], the modules with no edge at all, in either direction
//                   component  — { path -> component id, "" for an isolated module }
//                   level      — { path -> 1..n }, Kahn layering: level(v) = 1 + max(level of its
//                                predecessors), 1 = nothing calls it. 0 means "on or behind a cycle",
//                                where a level is not defined at all
//                   fanin/fanout — { path -> number }, coupling as a NUMBER rather than an opinion
//                   cycle      — [string], the nodes the layering could not place. Kahn gives this
//                                for free: what the layers did not peel is exactly what a cycle holds
//                 }
//                 failure: none — total. A cycle is DATA here, never a refusal: circular
//                          dependencies are legal in java and common, and stopping the pipeline on a
//                          healthy repository would be a defect of this step, not a finding about it.
//                          It is still worth declaring — step 10 sorts topologically and cannot
//                          (docs/graph.md §2)
//   Purity:       pure
//   Interface:    newLevels({ nodes, edges }) -> Levels
export function newLevels({ nodes = [], edges = [] } = {}) {
  const known = new Set(nodes)
  const out = new Map()                                   // from -> Set(to), deduped
  const inn = new Map()
  const fanin = {}
  const fanout = {}
  for (const p of known) { out.set(p, new Set()); inn.set(p, new Set()); fanin[p] = 0; fanout[p] = 0 }

  for (const e of edges) {
    const from = e && e.from
    const to = e && e.to
    // A dangling endpoint is not this module's business, and neither is a self-loop: a module that
    // references itself subordinates nothing, so counting it would only break the layering.
    if (!known.has(from) || !known.has(to) || from === to) continue
    if (out.get(from).has(to)) continue
    out.get(from).add(to)
    inn.get(to).add(from)
    fanout[from] += 1
    fanin[to] += 1
  }

  // Levels by Kahn. The queue holds nodes whose every predecessor is already placed, so a node is
  // levelled exactly once and its level is the LONGEST path to it — the depth of subordination, not
  // the shortest route.
  const level = {}
  const left = new Map([...known].map((p) => [p, inn.get(p).size]))
  let queue = [...known].filter((p) => left.get(p) === 0).sort()
  for (const p of queue) level[p] = 1
  for (let i = 0; i < queue.length; i++) {
    const u = queue[i]
    for (const v of [...out.get(u)].sort()) {
      level[v] = Math.max(level[v] || 0, level[u] + 1)
      left.set(v, left.get(v) - 1)
      if (left.get(v) === 0) queue.push(v)
    }
  }
  // What the layers could not peel is on or behind a cycle. No second traversal: this IS the detection.
  const cycle = [...known].filter((p) => left.get(p) > 0).sort()
  for (const p of cycle) level[p] = 0

  // Components: connectivity IGNORING direction — a caller and its callee belong to one slice however
  // the arrow points. Iterative flood fill: the graph can be as deep as the repository, and a
  // recursive walk would blow the stack on a real one long before it produced a wrong answer.
  const seen = new Set()
  const groups = []
  for (const start of [...known].sort()) {
    if (seen.has(start)) continue
    const members = []
    const stack = [start]
    seen.add(start)
    while (stack.length) {
      const p = stack.pop()
      members.push(p)
      for (const n of [...out.get(p), ...inn.get(p)]) {
        if (seen.has(n)) continue
        seen.add(n)
        stack.push(n)
      }
    }
    groups.push(members.sort())
  }

  // A group of ONE is not a slice — it is an isolated module, and that is a different fact with a
  // different reader. Saying it the other way costs the artifact one line per orphan (hundreds on a
  // real repository) and tells step 6 to navigate four hundred "slices" of one file each.
  //
  // The equivalence is exact, not a threshold picked by taste: a group has one member if and only if
  // the module has no edge at all, in either direction.
  const isolated = []
  const component = {}
  const components = []
  for (const members of [...groups].sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]))) {
    if (members.length < 2) { isolated.push(members[0]); continue }
    // Ids by SIZE, then by first path: the biggest slice is c1 in every run over the same repository,
    // whatever order the cells were merged in. An id derived from iteration order would move under
    // the reader's feet between two runs that found exactly the same thing.
    const id = `c${components.length + 1}`
    for (const p of members) component[p] = id
    components.push(Object.freeze({
      id,
      modules: members.length,
      heads: Object.freeze(members.filter((p) => fanin[p] === 0)),
    }))
  }
  for (const p of isolated) component[p] = ""

  return Object.freeze({
    components: Object.freeze(components),
    isolated: Object.freeze(isolated.sort()),
    component,
    level,
    fanin,
    fanout,
    cycle: Object.freeze(cycle),
  })
}
