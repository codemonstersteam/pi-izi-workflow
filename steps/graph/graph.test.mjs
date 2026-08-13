// Slice `graph`: the merge — a PURE core. Formula: 1 happy + Σ antecedent branches with a
// DISTINGUISHABLE consequent — the two refusal classes (no-suite, invalid-graph). The fixture is the
// LIVE form /tmp/quarkus-rest-json-app-v2-t1-3, cut down to one feature: same parts, same computed
// facts, same spine, so what this test asserts is what a real run produces.

import test from "node:test"
import assert from "node:assert/strict"
import { mergeGraph, newGraph, graphXml, suiteFor } from "./graph.mjs"
import { parseComputed } from "../scope/computed.mjs"

const M = "src/main/java/org/acme/rest/json"
const T = "src/test/java/org/acme/rest/json"
const W = "src/main/resources/META-INF/resources"

const SPINE = `
<part cell="spine" kind="spine">
  <artifact name="rest-json-quickstart" root="."/>
  <suite id="unit" kind="unit" cmd="mvn test" one="-Dtest={class}" path="src/test/java" match="*Test.java"/>
  <suite id="component-native" kind="component" cmd="mvn verify -Pnative" one="-Dit.test={class}" path="src/test/java" match="*IT.java"/>
  <build cmd="mvn package"/>
  <toggles found="no"/>
  <branching found="no"/>
  <contract found="no"/>
  <integrations found="no"/>
</part>`

const ROOT = `
<part cell="root" kind="survey">
  <module path="${M}/Fruit.java" io="none" api="none" tests="none">
    <role>Fruit domain model POJO</role>
  </module>
  <module path="${M}/FruitResource.java" io="none">
    <role>REST resource for fruit CRUD operations</role>
    <api name="GET /fruits" kind="http" scope="public"/>
    <test path="${T}/FruitResourceTest.java"/>
    <test path="${T}/FruitResourceIT.java"/>
  </module>
  <module path="${M}/LoggingFilter.java" io="none" api="none" tests="none">
    <role>JAX-RS request logging filter provider</role>
  </module>
  <module path="${W}/fruits.html" io="none" api="none" tests="none">
    <role>Static AngularJS frontend page for fruit management</role>
  </module>
  <module path="${T}/FruitResourceTest.java" io="none" api="none" tests="none">
    <role>Quarkus unit test for FruitResource endpoints</role>
  </module>
  <module path="${T}/FruitResourceIT.java" io="none" api="none" tests="none">
    <role>Quarkus integration test marker for FruitResource</role>
  </module>
  <gap path="src/main/resources/import.sql" why="480 KB of seed data, no module in it"/>
</part>`

const COMPUTED = `<computed by="script">
  <lang id="java" files="4" edges="yes" routes="yes" decls="class,interface,enum,record,method,field"/>
  <lang id="(unknown)" files="1" edges="no-rules" routes="no-rules" decls="no-rules"/>
  <pkg at="${M}/FruitResource.java" name="org.acme.rest.json"/>
  <pkg at="${M}/Fruit.java" name="org.acme.rest.json"/>
  <decl at="${M}/Fruit.java" kind="class" name="Fruit" sig="public class Fruit"/>
  <decl at="${M}/Fruit.java" kind="field" name="name" sig="public String name"/>
  <decl at="${M}/Fruit.java" kind="field" name="description" sig="public String description"/>
  <decl at="${M}/FruitResource.java" kind="method" name="list()" sig="public Set&lt;Fruit&gt; list()"/>
  <edge from="${M}/FruitResource.java" to="${M}/Fruit.java" via="private Set&lt;Fruit&gt; fruits"/>
  <edge from="${T}/FruitResourceIT.java" to="${T}/FruitResourceTest.java" via="extends FruitResourceTest"/>
  <api at="${M}/FruitResource.java" name="GET /fruits" kind="http" scope="public" via="@GET public Set&lt;Fruit&gt; list()"/>
  <use at="${W}/fruits.html" path="/fruits" via="url: '/fruits',"/>
  <use at="${T}/FruitResourceTest.java" path="/fruits" via=".when().get(&quot;/fruits&quot;)"/>
</computed>`

const PLAN = { subjects: ["fruit", "search"], gaps: ["search"] }
const PARTS = [{ id: "spine", kind: "spine", xml: SPINE }, { id: "root", kind: "survey", xml: ROOT }]

test("happy: the live form merges into a map — modules, suites bound by name, hierarchy, surface", () => {
  const r = newGraph({ parts: PARTS, computedXml: COMPUTED, plan: PLAN })
  assert.equal(r.ok, true, r.ok ? "" : r.error && r.error.detail)
  const g = r.value
  const at = (p) => g.modules.find((m) => m.path === p)

  assert.equal(g.modules.length, 6)                     // a module is a FILE, exactly as in a part
  assert.equal(g.grammar, "3")                          // stamped from the part grammar, not a second counter

  // THE binding this step exists for: two suites over one folder, told apart by `match`. Bound by
  // path alone, the IT would have taken the unit command and executed nothing, green.
  assert.equal(at(`${T}/FruitResourceIT.java`).suite, "component-native")
  assert.equal(at(`${T}/FruitResourceTest.java`).suite, "unit")
  assert.equal(at(`${T}/FruitResourceIT.java`).kind, "test")     // not a code node: no ticket at step 10
  assert.equal(at(`${M}/FruitResource.java`).kind, "")
  assert.deepEqual(at(`${M}/FruitResource.java`).tests.map((t) => t.suite), ["unit", "component-native"])

  // The address (§1) and the computed entry point with its evidence.
  assert.equal(at(`${M}/FruitResource.java`).pkg, "org.acme.rest.json")
  assert.equal(at(`${W}/fruits.html`).pkg, "")          // html declares no namespace — the directory is its address
  assert.match(at(`${M}/FruitResource.java`).api[0].via, /^@GET/)

  // The hierarchy, computed from edges — including the <use> edges only step 5 can resolve.
  assert.ok(g.edges.some((e) => e.from === `${W}/fruits.html` && e.to === `${M}/FruitResource.java` && e.by === "use"))
  assert.equal(g.components.length, 1)
  assert.equal(g.components[0].modules, 5)
  assert.deepEqual([...g.isolated], [`${M}/LoggingFilter.java`])
  assert.equal(at(`${W}/fruits.html`).level, 1)
  assert.equal(at(`${M}/FruitResource.java`).level, 3)
  assert.equal(at(`${M}/FruitResource.java`).fanin, 2)
  assert.equal(at(`${M}/Fruit.java`).level, 4)
  assert.deepEqual([...g.cycle], [])

  // The borders of the system, and the anchors carried from the PLAN (an anchor that matched nothing
  // exists nowhere else — deriving it from the parts would lose it silently).
  assert.deepEqual(g.surface, [{ name: "GET /fruits", kind: "http", at: `${M}/FruitResource.java` }])
  assert.deepEqual(g.systems, [])
  assert.deepEqual(g.subjects, [{ name: "fruit", found: "" }, { name: "search", found: "no" }])
  assert.deepEqual([...g.unanswered], ["toggles", "branching", "contract", "integrations"])

  // G8: what the node OFFERS its caller. The role said `api="none"` for Fruit.java — the cheapest
  // answer a guardrail that reads no files cannot falsify — and the script read the POJO's two public
  // fields, which ARE its contract: the JSON body is exactly `{name, description}`.
  assert.deepEqual(at(`${M}/Fruit.java`).decls.map((d) => d.name), ["Fruit", "name", "description"])
  assert.equal(at(`${M}/Fruit.java`).decls[1].sig, "public String name")
  assert.equal(at(`${M}/Fruit.java`).declsMore, 0)

  // …and therefore it is NOT a gap any more. The gap now means the entry is unreadable, not unsaid.
  assert.ok(!g.gaps.some((x) => x.path === `${M}/Fruit.java`))
  assert.ok(!g.gaps.some((x) => /bound to no suite/.test(x.why)))   // a bound test is not a gap
  assert.ok(g.gaps.some((x) => x.path === "src/main/resources/import.sql"))   // the part's own gap survives

  const xml = graphXml(g)
  assert.match(xml, /^<appgraph grammar="3" modules="6" components="1" isolated="1" levels="4">/)
  assert.match(xml, /<artifact name="rest-json-quickstart" root="\."\/>/)
  assert.match(xml, /<toggles found="no"\/>/)
  assert.match(xml, new RegExp(`<module path="${T}/FruitResourceIT\\.java" kind="test" suite="component-native"`))
  assert.match(xml, /<systems\/>/)                       // no external system IS the answer, not silence
  assert.match(xml, /<edge from="[^"]*fruits\.html"[^>]* by="use"\/>/)
  assert.ok(!xml.includes("<cycle"))
  // The scanner that reads a part reads this too: `<` inside a value stayed encoded on the way out.
  assert.match(xml, /via="private Set&lt;Fruit&gt; fruits"/)
  assert.match(xml, /<decl kind="field" name="name" sig="public String name"\/>/)
  // The border of the computable survives the merge: a language with a reader names the KINDS it can
  // see, one without says so out loud instead of looking like a file that declares nothing.
  assert.match(xml, /<lang id="java" files="4" edges="yes" routes="yes" decls="class,interface,enum,record,method,field"\/>/)
  assert.match(xml, /<lang id="\(unknown\)"[^>]* decls="no-rules"\/>/)
})

test("G8d: the gap means the entry is UNREADABLE — it comes back the moment nothing can be computed", () => {
  // The same map with the java reader gone (a binary, a language with no rules): Fruit.java is still
  // called by FruitResource, and now nobody — neither the role nor the script — can name its entry.
  const blind = COMPUTED.replace(/  <decl at="[^"]*Fruit\.java"[^>]*\/>\n/g, "")
  const g = newGraph({ parts: PARTS, computedXml: blind, plan: PLAN }).value
  const gap = g.gaps.find((x) => x.path === `${M}/Fruit.java`)
  assert.ok(gap, "a called node with no readable public declaration is a gap")
  assert.match(gap.why, /called by 1 module/)

  // And it does NOT come back merely because the role was silent: `api="none"` plus a readable
  // declaration is a fully answered node. That is the whole point of G8d — 13 modules of 15 came back
  // `api="none"` on run c4fde2f3, and the old rule turned every one of them with an inbound edge into
  // noise step 6 would have to read past.
  const seen = newGraph({ parts: PARTS, computedXml: COMPUTED, plan: PLAN }).value
  assert.equal(seen.gaps.length, g.gaps.length - 1)
})

// The map must not go green while every test in it is unrunnable. This replays run 899494cc exactly:
// the spine's `match` lost its `.java`, so no suite claimed any file. Before this rule the run
// exited `track:"ok"` with `gaps=0` — the map declared itself whole while nothing in it could be run.
test("a test no suite runs is DECLARED a gap — the green run of 899494cc must not repeat", () => {
  const blind = SPINE.replace(/match="\*Test\.java"/, 'match="*Test"').replace(/match="\*IT\.java"/, 'match="*IT"')
  const g = newGraph({ parts: [{ id: "spine", kind: "spine", xml: blind }, PARTS[1]], computedXml: COMPUTED, plan: PLAN }).value
  const unbound = g.gaps.filter((x) => /bound to no suite/.test(x.why))
  assert.deepEqual(unbound.map((x) => x.path).sort(), [`${T}/FruitResourceIT.java`, `${T}/FruitResourceTest.java`])
  assert.equal(g.modules.find((m) => m.path === `${T}/FruitResourceIT.java`).suite, "")
  assert.match(graphXml(g), /<gap path="[^"]*FruitResourceIT\.java" why="test file bound to no suite/)
})

test("G8e: the map has a ceiling — declarations past the cap are COUNTED, never silently dropped", () => {
  // A node with more public declarations than DECL_CAP. The cap exists because every <decl> raises
  // bytes per node and therefore lowers, in nodes, the repository the pipeline can still read whole.
  const many = Array.from({ length: 20 }, (_, i) =>
    `  <decl at="${M}/FruitResource.java" kind="method" name="m${i}()" sig="public void m${i}()"/>`).join("\n")
  const g = newGraph({ parts: PARTS, computedXml: COMPUTED.replace("</computed>", `${many}\n</computed>`), plan: PLAN }).value
  const m = g.modules.find((x) => x.path === `${M}/FruitResource.java`)
  assert.equal(m.decls.length, 12)                        // DECL_CAP
  assert.equal(m.declsMore, 9)                            // 21 read − 12 carried
  assert.match(graphXml(g), /<decl more="9"\/>/)
})

test("no-suite: THE refusal about the repository — a human fixes it with a separate task", () => {
  const noSuites = SPINE.replace(/  <suite [^>]*\/>\n/g, '  <suites found="no"/>\n')
  const r = newGraph({ parts: [{ id: "spine", kind: "spine", xml: noSuites }, PARTS[1]], computedXml: COMPUTED, plan: PLAN })
  assert.equal(r.ok, false)
  assert.equal(r.error.cls, "no-suite")
  assert.match(r.error.detail, /репозиторий к работе не готов/)

  // Same class when there is no spine part at all: every answer then becomes found="no", and the
  // pipeline still stops on the one question that is not the operator's to decide.
  const orphan = newGraph({ parts: [PARTS[1]], computedXml: COMPUTED, plan: PLAN })
  assert.equal(orphan.error.cls, "no-suite")
  assert.match(graphXml(mergeGraph({ parts: [PARTS[1]], plan: PLAN })), /<artifact found="no"\/>[\s\S]*<suites found="no"\/>/)
})

test("invalid-graph: a duplicated path and a lost anchor are broken INVARIANTS, not operator work", () => {
  const twice = ROOT.replace("<gap", `<module path="${M}/Fruit.java" io="none" api="none" tests="none"><role>again</role></module>\n  <gap`)
  const dup = newGraph({ parts: [PARTS[0], { id: "root", kind: "survey", xml: twice }], computedXml: COMPUTED, plan: PLAN })
  assert.equal(dup.ok, false)
  assert.equal(dup.error.cls, "invalid-graph")
  assert.match(dup.error.detail, /один путь объявлен двумя частями/)

  // The seam of G2: the anchor list is COPIED from the plan. Derived from the parts, `search` — which
  // matched no file at all — would vanish, and step 6 would never learn the requirement had a word
  // the repository does not answer.
  const graph = mergeGraph({ parts: PARTS, computed: parseComputed(COMPUTED), plan: PLAN })
  const stripped = { ...graph, subjects: graph.subjects.filter((s) => s.found !== "no") }
  const r = newGraph({ parts: PARTS, computedXml: COMPUTED, plan: PLAN })
  assert.equal(r.ok, true)
  assert.equal(stripped.subjects.length, 1)             // this is what deriving would have produced
  assert.equal(r.value.subjects.length, 2)              // this is what copying produces
})

// --- the focus: a map that covers part of the repository must SAY so ---------------------------
//
// Step 3b may narrow the survey to the cones the BRD points at (docs/big-projects-solution.md). Two
// things then stop being true by construction and have to be written down instead: the map is no
// longer the repository, and an anchor may exist in the tree while being absent from the map.
const FOCUS_PLAN = {
  subjects: ["fruit", "search", "berry"],
  gaps: ["search"],                                   // matched no file ANYWHERE — the old meaning of found="no"
  cells: [
    { id: "spine", kind: "spine", subjects: [] },
    { id: "root", kind: "survey", subjects: ["fruit"] },
    { id: "left-out", kind: "survey", subjects: ["berry"] },   // real files, and the focus dropped them
  ],
}
const FOCUS = { chosen: ["s1"], cells: ["spine", "root"], repoFiles: 40, dropped: { slices: 2, cells: 0, bytes: 90000 } }

test("a narrowed map declares its boundary, and an anchor left outside it is not 'found'", () => {
  const r = newGraph({ parts: PARTS, computedXml: COMPUTED, plan: FOCUS_PLAN, focus: FOCUS })
  assert.equal(r.ok, true, r.ok ? "" : r.error && r.error.detail)
  const g = r.value

  assert.deepEqual(g.focus, { slices: "s1", cells: 2, of: 3, nodes: g.modules.length, repo: 40, dropped: 2 })
  assert.deepEqual(g.subjects, [
    { name: "fruit", found: "" },                     // its cell is in the focus
    { name: "search", found: "no" },                  // no file in the repository at all
    { name: "berry", found: "outside" },              // files exist — the focus left them out
  ])

  const xml = graphXml(g)
  assert.match(xml, /<focus slices="s1" cells="2" of="3" nodes="\d+" repo="40" dropped="2" local="level fanin fanout component"\/>/)
  assert.match(xml, /<subject name="berry" found="outside"\/>/)

  // …and `outside` must not collapse into `no`: step 6's role answers Unknown on the first and asks
  // nothing about the second, and step 7 carries the difference to the operator (docs/weight.md §5).
  assert.equal(xml.includes('name="berry" found="no"'), false)
})

test("a focus that names EVERY cell is not a narrowing — the map says nothing new", () => {
  const whole = { ...FOCUS, cells: ["spine", "root", "left-out"] }
  const g = newGraph({ parts: PARTS, computedXml: COMPUTED, plan: FOCUS_PLAN, focus: whole }).value

  assert.equal(g.focus, null, "'the focus is everything' and 'there is no focus' are the same map")
  assert.equal(graphXml(g).includes("<focus"), false)
  assert.equal(g.subjects.find((s) => s.name === "berry").found, "", "nothing is outside when nothing was dropped")

  // the regression that matters most: with no focus at all — every form the pipeline is green on
  // today — the artifact is byte-for-byte what it was before step 3b existed
  const before = graphXml(newGraph({ parts: PARTS, computedXml: COMPUTED, plan: FOCUS_PLAN }).value)
  assert.equal(before, graphXml(g))
})

test("suiteFor: the deepest folder wins, an unbreakable tie stays UNBOUND rather than guessed", () => {
  const suites = [
    { id: "unit", path: "src/test", match: "" },
    { id: "component-it", path: "src/test/it", match: "" },
    { id: "e2e-a", path: "src/e2e", match: "" },
    { id: "e2e-b", path: "src/e2e", match: "" },
  ]
  assert.equal(suiteFor("src/test/FooTest.java", suites), "unit")
  assert.equal(suiteFor("src/test/it/FooIT.java", suites), "component-it")  // deeper folder, not the first match
  assert.equal(suiteFor("src/e2e/Foo.java", suites), "")                    // two claimants, no `match` — honest ""
  assert.equal(suiteFor("src/main/Foo.java", suites), "")
})
