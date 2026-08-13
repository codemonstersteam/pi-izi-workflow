// Slice `focus`: cones of the entries — a PURE core.
//
// The fixture is NOT invented. `fixture-eddi.json` is a 12-node extract of the live eddi tree
// (`sandbox/eddi`), produced by the §10 script of docs/big-projects-solution.md with this
// repository's own functions: skip → readSource → newComputed → newSlices. A synthetic monolith
// graph proves nothing about a monolith — the price of that was already paid at step 9
// (docs/design.md, header). What the extract carries, and why each piece is in it:
//   · a real route entry (IRestCapabilityRegistry) with a 4-node cone below it;
//   · a second route entry (IRestAction) whose cone SHARES a node with the first;
//   · the entry's own test (ConfigStoreRoleGateTest → entry) — an edge test → entry;
//   · four tests of a NEIGHBOUR of the entry (…→ AgentConfiguration) — the §2в seam;
//   · two orphans (`docs/agent-configs/*.json`) — no edge at all, reachable by no cone.
//
// Whole-tree numbers of the same run, for the reader who wants the scale (post-B1 eddi, 1850 files):
// 84 entries, cone p50 11 / p90 39 / max 69 nodes, focus estimate p50 20 / p90 60 / max 108 KB
// against the 115 KB cap — 0 of 84 above it, while the whole plan estimates at 753 KB.

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { newSlices } from "./slices.mjs"

const FX = JSON.parse(readFileSync(new URL("./fixture-eddi.json", import.meta.url), "utf8"))
const ENTRY = FX.entry
const OTHER = FX.otherEntry
const OWN_TEST = "src/test/java/ai/labs/eddi/configs/ConfigStoreRoleGateTest.java"
const NEIGHBOUR_TEST = "src/test/java/ai/labs/eddi/backup/impl/RemoteApiResourceSourceTest.java"
const NEIGHBOUR = "src/main/java/ai/labs/eddi/configs/agents/model/AgentConfiguration.java"

test("happy: every entry gets its cone, ids run by SIZE, and what no cone reached is orphaned", () => {
  const { slices, orphans } = newSlices(FX)

  assert.deepEqual(slices.map((s) => s.entry), [ENTRY, OTHER])
  assert.deepEqual(slices.map((s) => s.id), ["s1", "s2"])
  assert.deepEqual(slices.map((s) => s.kind), ["route", "route"])
  assert.equal(slices[0].nodes.length, FX.entryNodes)          // 5: the entry, three below it, its test
  assert.ok(slices[0].nodes.length > slices[1].nodes.length)   // s1 is the bigger cone, not the first path

  // the cone descends: a node two edges below the entry is in it
  assert.ok(slices[0].nodes.includes("src/main/java/ai/labs/eddi/configs/hitl/HitlTimeoutPolicy.java"))

  // Orphans are everything no cone reached, and they come in two kinds — both of them expected:
  // the configs no edge touches (the only way an anchor on a `.json` can ever be surveyed —
  // docs/big-projects-solution.md §7), and the tests of NEIGHBOURS, which are entries of nothing and
  // the target of nothing. On the whole tree this is the larger half: 1406 orphans of 1850 files,
  // mostly tests and languages with no edge rules.
  assert.deepEqual(orphans, [...FX.nodes.filter((p) => p.endsWith(".json")), ...FX.nodes.filter((p) => p.includes("/backup/impl/"))])

  // the partition holds: every node is in some cone or in orphans, never in neither
  const reached = new Set(slices.flatMap((s) => s.nodes))
  for (const p of FX.nodes) assert.equal(reached.has(p) || orphans.includes(p), true, p)
})

test("a test joins the cone only when it is the test OF THE ENTRY", () => {
  const { slices } = newSlices(FX)
  const cone = slices[0].nodes

  assert.ok(cone.includes(OWN_TEST), "edge test → entry pulls the entry's own test in")
  assert.ok(cone.includes(NEIGHBOUR), "the neighbour itself is in the cone")
  assert.equal(cone.includes(NEIGHBOUR_TEST), false, "…but its test is not")

  // the price of the other rule, in one number: tests of the WHOLE cone put 48 of 99 entries above
  // the reading cap (p50 108 KB), tests of the entry alone put none (+1 KB to the median)
  assert.equal(cone.filter((p) => p.includes("/test/")).length, 1)
})

test("a test path is never an entry, and an isolated node is not a head", () => {
  const { slices, orphans } = newSlices(FX)
  for (const s of slices) assert.equal(s.entry.includes("/test/"), false, s.entry)

  // REINTRODUCTION SEAM: drop TEST_PATHS from the entry rule and the four neighbour tests become
  // heads — fanin 0 with an edge each. On the whole tree that is where the 220-node, 203 KB cone of
  // JsonResponseFormatThreadingTest comes from (docs/big-projects-solution.md §2).
  const heads = FX.nodes.filter((p) => !FX.edges.some((e) => e.to === p) && FX.edges.some((e) => e.from === p))
  assert.equal(heads.every((p) => p.includes("/test/")), true, "the fixture's only heads ARE tests")
  assert.equal(slices.some((s) => heads.includes(s.entry)), false, "…and not one of them is an entry")

  // an isolated node has fanin 0 too, and declares nothing: it is an orphan, never a head
  for (const p of orphans.filter((p) => p.endsWith(".json"))) {
    assert.equal(FX.edges.some((e) => e.from === p || e.to === p), false, p)
  }
})

test("total: no input, unknown ends and a node in two cones", () => {
  assert.deepEqual(newSlices(), { slices: [], orphans: [] })
  assert.deepEqual(newSlices({ nodes: ["a.java"] }), { slices: [], orphans: ["a.java"] })

  // an edge whose end is not a known node is ignored — a cone never names a path the plan does not
  // carry, so `orphans` stays a partition of `nodes` and nothing else
  const { slices, orphans } = newSlices({ nodes: ["a.java", "b.java"], edges: [{ from: "a.java", to: "gone.java" }], routes: ["a.java"] })
  assert.deepEqual(slices[0].nodes, ["a.java"])
  assert.deepEqual(orphans, ["b.java"])

  // the shared node: the entry's test is reached by BOTH cones of the fixture, and neither loses it
  const both = newSlices(FX).slices.filter((s) => s.nodes.includes(OWN_TEST))
  assert.equal(both.length, 2)
})
