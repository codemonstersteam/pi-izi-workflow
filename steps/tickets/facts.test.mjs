// Units for steps/tickets/facts.mjs — the repository's own answers, ready for a ticket body.
//
// The formula (standards/code.md §TESTS): one happy path plus every antecedent branch with a
// DISTINGUISHABLE consequent. The map is read through parseMap here rather than hand-built, because
// the contract of factsOf is "the object parseMap returns" — a hand-built literal would let the two
// drift apart and the test would still be green.

import test from "node:test"
import assert from "node:assert/strict"
import { parseMap } from "../intake/map.mjs"
import { parseComputed } from "../scope/computed.mjs"
import { factsOf, namedTypes, typesBlock, MEMBERS_PER_TYPE, TYPES_CAP_BYTES } from "./facts.mjs"

// A map in the grammar step 5 writes, cut to what step 14 reads: two suites, a build, a toggle
// mechanism, two languages of very different weight, and four modules — one of them a test, one with
// declarations, one touching an external system.
const MAP = `<appgraph grammar="4" modules="4">
  <paths prefix="src/main/java/app/"/>
  <suite id="unit" kind="unit" cmd="./mvnw test" one="-Dtest={class}" path="src/test/java" match="*Test.java"/>
  <suite id="component" kind="component" cmd="./mvnw verify" one="-Dit.test={class}" path="src/test/java" match="*IT.java"/>
  <build cmd="./mvnw verify" compile="./mvnw package -DskipTests"/>
  <toggles mechanism="Quarkus MicroProfile Config" config="app.feature.enabled"/>
  <lang id="(unknown)" files="90" edges="no-rules"/>
  <lang id="java" files="800" edges="yes" decls="class,interface,method"/>
  <lang id="ts" files="3" edges="yes" decls="class"/>
  <module path="~snippets/mongo/SnippetStore.java" pkg="app.snippets.mongo">
    <decl kind="class" name="SnippetStore" sig="public class SnippetStore extends ResourceStore&lt;Snippet&gt;"/>
    <decl kind="method" name="create(Snippet s)" sig="public IResourceId create(Snippet s)"/>
    <io kind="db" dir="out" system="mongodb" target="snippet documents"/>
  </module>
  <module path="~snippets/ISnippetStore.java" pkg="app.snippets">
    <decl kind="interface" name="ISnippetStore" sig="public interface ISnippetStore"/>
  </module>
  <module path="src/test/java/app/snippets/mongo/SnippetStoreTest.java" pkg="app.snippets.mongo" kind="test"/>
  <module path="build.gradle"/>
</appgraph>`

test("the map answers all four questions a ticket asks — stack, package, declaration, systems", () => {
  const f = factsOf(parseMap(MAP))

  // PRIMING: one language (the biggest), the framework the repository toggles with, how it is built
  // and how each suite names and runs its files. Every token cut from the map, none composed.
  assert.equal(f.stack,
    "java · Quarkus MicroProfile Config · build: ./mvnw package -DskipTests · "
    + "unit tests: *Test.java run by ./mvnw test · component tests: *IT.java run by ./mvnw verify")
  // The language is the FIRST field, and only one is named — asserted on that field, not on the whole
  // line: `ts` is a substring of `tests:`, and a search over the line would pass on the wrong ground.
  assert.equal(f.stack.split(" · ")[0], "java", "3 files against 800 is not this repository's language")
  assert.ok(!f.stack.includes("unknown"), "a bucket is not a language")

  // The roots are DERIVED from the packages, and the package of a file that DOES NOT EXIST follows.
  assert.deepEqual(f.roots, ["src/main/java", "src/test/java"])
  assert.equal(f.pkgOf("src/main/java/app/glossaries/mongo/GlossaryStore.java"), "app.glossaries.mongo",
    "the new module's package — the whole reason the roots are computed")
  assert.equal(f.pkgOf("src/test/java/app/glossaries/mongo/GlossaryStoreTest.java"), "app.glossaries.mongo",
    "the longest root that prefixes the path wins, so the test lands in the same package")

  assert.deepEqual(f.declOf("SnippetStore"), {
    path: "src/main/java/app/snippets/mongo/SnippetStore.java",
    kind: "class",
    sig: "public class SnippetStore extends ResourceStore<Snippet>",
    members: ["public IResourceId create(Snippet s)"],
  }, "a type that exists here comes back with its own signature and everything callable on it")

  assert.deepEqual(f.systemsOf("src/main/java/app/snippets/mongo/SnippetStore.java"), ["mongodb"])
})

test("what the map does not know, the facts do not invent", () => {
  const f = factsOf(parseMap(MAP))
  assert.equal(f.declOf("IResourceStorageFactory"), null, "a type outside the map has no signature to give")
  assert.equal(f.declOf("create(Snippet s)"), null, "methods are not types: only a type is looked up by name")
  assert.equal(f.pkgOf("build.gradle"), "", "a file under no source root declares no package")
  assert.deepEqual(f.systemsOf("src/main/java/app/snippets/ISnippetStore.java"), [])
})

// A LAYOUT THAT DOES NOT MIRROR ITS NAMESPACE YIELDS NO ROOT — and therefore no package line in the
// ticket, which is honest. The alternative is a package invented for a repository whose language has
// none, and that is the `invented-default` defect wearing another name.
test("a package that does not stand at the tail of its directory gives no root", () => {
  const flat = MAP.replace('pkg="app.snippets.mongo"', 'pkg="com.other.namespace"')
    .replace('pkg="app.snippets"', 'pkg="com.other"')
    .replace('<module path="src/test/java/app/snippets/mongo/SnippetStoreTest.java" pkg="app.snippets.mongo" kind="test"/>',
      '<module path="src/test/java/app/snippets/mongo/SnippetStoreTest.java" kind="test"/>')
  const f = factsOf(parseMap(flat))
  assert.deepEqual(f.roots, [], "no directory proves where its package starts")
  assert.equal(f.pkgOf("src/main/java/app/glossaries/mongo/GlossaryStore.java"), "")
})

test("no map at all — every answer is empty and nothing throws", () => {
  for (const x of [undefined, null, {}, parseMap(""), parseMap("<appgraph/>")]) {
    const f = factsOf(x)
    assert.equal(f.stack, "", "a map that declares no language gets no made-up stack")
    assert.deepEqual(f.roots, [])
    assert.equal(f.pkgOf("a/b/C.java"), "")
    assert.equal(f.declOf("C"), null)
    assert.deepEqual(f.systemsOf("a/b/C.java"), [])
  }
})

// ВТОРОЙ ИСТОЧНИК ТИПОВ. Живой прогон eddi: рой прочитал только клетки фокуса (230 объявлений в
// карте), а скрипт шага 3 — все 1576 файлов (6070 объявлений в graph-computed.xml). Типы из
// конструкторов нарядов — IDocumentDescriptorStore, MeterRegistry, IResourceStorageFactory — были
// известны скрипту и неизвестны рою, и «чем пользуешься» молчало. Факт существовал; он не доехал.
test("declOf falls back to the computed graph, and the swarm map stays the richer source", () => {
  const COMPUTED = `<computed by="script">
  <decl at="src/main/java/app/descriptors/IDocumentDescriptorStore.java" kind="interface" name="IDocumentDescriptorStore" sig="public interface IDocumentDescriptorStore"/>
  <decl at="src/main/java/app/descriptors/IDocumentDescriptorStore.java" kind="method" name="read(String id)" sig="public DocumentDescriptor read(String id)"/>
  <decl at="src/main/java/app/snippets/mongo/SnippetStore.java" kind="class" name="SnippetStore" sig="public class SnippetStore STALE"/>
</computed>`
  const f = factsOf(parseMap(MAP), parseComputed(COMPUTED))

  // The type the swarm never surveyed resolves from the computed graph, with its neighbours as members.
  assert.deepEqual(f.declOf("IDocumentDescriptorStore"), {
    path: "src/main/java/app/descriptors/IDocumentDescriptorStore.java",
    kind: "interface",
    sig: "public interface IDocumentDescriptorStore",
    members: ["public DocumentDescriptor read(String id)"],
  })
  // The swarm map WINS where it knows the type: its record carries members, the computed one is stale.
  assert.match(f.declOf("SnippetStore").sig, /extends ResourceStore/)
  // A type nobody knows stays silent — no invention.
  assert.equal(f.declOf("MeterRegistry"), null)
  // One argument reads exactly as before.
  assert.equal(factsOf(parseMap(MAP)).declOf("IDocumentDescriptorStore"), null)
})

// ТА ЖЕ ПАРА КАРТ, ВТОРОЙ ПОТРЕБИТЕЛЬ — наряд шага 6. Живой прогон 19.08.2026 (форма eddi, DOS-535):
// роль потратила ход оператора на «AgentConfiguration model class path (not in appgraph.xml)», хотя
// путь лежал в `.agent/graph-computed.xml`. Здесь ровно эта расстановка: имя названо текстом, роя оно
// не знает, вычисленный граф знает.
const TASK_TEXT = `R3 the agent config keeps a reference to a Glossary, exactly as it keeps SnippetStore.
CRUD over REST, versioned like the analogue; AgentConfiguration holds the ordered list.`

const COMPUTED_TYPES = `<computed by="script">
  <decl at="src/main/java/app/agents/model/AgentConfiguration.java" kind="class" name="AgentConfiguration" sig="public class AgentConfiguration"/>
  <decl at="src/main/java/app/agents/model/AgentConfiguration.java" kind="method" name="getSnippets()" sig="public List&lt;URI&gt; getSnippets()"/>
</computed>`

test("the names a TEXT calls are resolved to what the repository declares — and a name it does not carry gets no row", () => {
  const rows = namedTypes(TASK_TEXT, factsOf(parseMap(MAP), parseComputed(COMPUTED_TYPES)))

  // The type the swarm map never surveyed arrives with its path, its kind and what it declares.
  assert.deepEqual(rows.find((r) => r.name === "AgentConfiguration"), {
    name: "AgentConfiguration",
    path: "src/main/java/app/agents/model/AgentConfiguration.java",
    kind: "class",
    members: ["public List<URI> getSnippets()"],
  })
  // The swarm map answers too — one resolver, two maps, no second index.
  assert.equal(rows.find((r) => r.name === "SnippetStore").path, "src/main/java/app/snippets/mongo/SnippetStore.java")

  // A NAME NEITHER MAP CARRIES HAS NO ROW. `Glossary` is what this change CREATES and `CRUD`/`REST`
  // are prose — none of the three may be answered, and each stays a legal reason to ask the operator.
  const named = rows.map((r) => r.name)
  for (const absent of ["Glossary", "CRUD", "REST"]) assert.equal(named.includes(absent), false, absent)
  assert.deepEqual(named, ["SnippetStore", "AgentConfiguration"], "each name once, in the order the text names them")

  // Total: no facts to resolve against is an empty table, never a throw.
  for (const x of [undefined, null, {}, factsOf()]) assert.deepEqual([...namedTypes(TASK_TEXT, x)], [])
})

// РАЗМЕР — не примечание, а правило. Живой `AgentConfiguration` несёт 150 объявлений (7 262 Б одной
// строкой), а ответ, за которым роль пришла, — ПУТЬ. Оба потолка живут в модуле, и наряд считает
// таблицу своим слагаемым (workflows/izi.js::sized).
test("the table is bounded twice — members per type, and bytes of the whole block", () => {
  const many = Object.freeze({ name: "Big", path: "src/Big.java", kind: "class", members: Array.from({ length: MEMBERS_PER_TYPE + 7 }, (_, k) => `m${k}()`) })
  const line = typesBlock([many])
  assert.equal(line.includes(`m${MEMBERS_PER_TYPE - 1}()`), true, "the first MEMBERS_PER_TYPE declarations are shown")
  assert.equal(line.includes(`m${MEMBERS_PER_TYPE}()`), false, "and the rest are not")
  assert.match(line, /…\+7$/, "the tail is a COUNT — a list silently cut is a repository the role misreads")

  // The whole block stops at the ceiling and SAYS how many rows it dropped.
  const wide = Array.from({ length: 40 }, (_, k) => ({ name: `T${k}`, path: `src/${"d".repeat(300)}/T${k}.java`, kind: "class", members: [] }))
  const block = typesBlock(wide)
  assert.equal(Buffer.byteLength(block.split("\n").filter((l) => !l.startsWith("… ")).join("\n"), "utf8") <= TYPES_CAP_BYTES, true)
  assert.match(block, new RegExp(`… \\d+ more names resolve in this repository, dropped at the ${TYPES_CAP_BYTES} B ceiling`))

  // No rows — no wording invented here: "there is no table" is the caller's sentence.
  assert.equal(typesBlock([]), "")
  assert.equal(typesBlock(undefined), "")
})
