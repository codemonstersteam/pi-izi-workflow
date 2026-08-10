// Slice `scope`: the facts a SCRIPT contributes to the graph, and the order block built from them —
// two PURE cores tested together because they share one fixture. Formula: 1 happy + the branches
// whose consequent must be DISTINGUISHABLE — a method WITHOUT a route annotation (never a route), a
// language whose routes are not computable (must say so), and a truncated digest (must say how much).

import test from "node:test"
import assert from "node:assert/strict"
import { readSource } from "./source.mjs"
import { newComputed, computedXml, parseComputed } from "./computed.mjs"
import { newDigest } from "./digest.mjs"
import { HTTP_API_NAME } from "./part.mjs"

const RESOURCE = `
package org.acme.rest.json;
import jakarta.ws.rs.GET;
import jakarta.persistence.EntityManager;
import org.acme.rest.json.Fruit;

@Path("/fruits")
public class FruitResource {
  @GET
  public Set<Fruit> list() { return null; }

  @POST
  @Path("/{id}/reserve")
  public Response reserve(String id) { return null; }

  public String helper(String s) { return s; }
}`

const FILES = [
  ["src/main/java/org/acme/rest/json/FruitResource.java", RESOURCE],
  ["src/main/java/org/acme/rest/json/Fruit.java", "package org.acme.rest.json;\npublic class Fruit { }"],
  ["src/main/resources/import.sql", "INSERT INTO fruit VALUES (1);"],
]
const sources = FILES.map(([path, text]) => readSource({ path, text }))
const computed = newComputed({ sources, paths: FILES.map(([p]) => p) })

test("a route is read ONLY from an annotation, and its name is canonical by the guardrail's own rule", () => {
  assert.deepEqual(computed.api.map((a) => a.name), ["GET /fruits", "POST /fruits/{id}/reserve"])
  for (const a of computed.api) assert.ok(HTTP_API_NAME.test(a.name), a.name)
  assert.equal(computed.api[0].at, "src/main/java/org/acme/rest/json/FruitResource.java")
  assert.match(computed.api[0].via, /^@GET/)                 // a computed fact carries evidence too

  // `helper()` is public and returns a String — but it carries no route annotation, so it is no route.
  assert.equal(computed.api.some((a) => a.name.includes("helper")), false)
  assert.deepEqual(computed.drivers.map((d) => d.kind), ["db"])
  assert.deepEqual(computed.edges.map((e) => e.to), ["src/main/java/org/acme/rest/json/Fruit.java"])
})

test("<use>: a route consumer is found by literal, and only by an exact match", () => {
  const files = [
    ...FILES,
    ["src/main/resources/META-INF/resources/fruits.html", `
      <script>
        $http.get('/fruits').then(r => r.data);
        $http.post('/fruits', f);
        var help = '/fruitsalad';
        var doc  = '/usr/share/doc';
      </script>`],
  ]
  const c = newComputed({ sources: files.map(([path, text]) => readSource({ path, text })), paths: files.map(([p]) => p) })

  // One fact per (file, path) pair: three calls to `/fruits` from one page are one relation.
  assert.deepEqual(c.use.map((u) => `${u.at} → ${u.path}`),
    ["src/main/resources/META-INF/resources/fruits.html → /fruits"])
  assert.match(c.use[0].via, /\$http\.get\('\/fruits'\)/)

  // `/fruitsalad` is not a route of this repository and `/usr/share/doc` is not a route at all — no
  // facts. A provider does not consume itself: FruitResource's own `@Path("/fruits")` is not a `use`.
  assert.equal(c.use.some((u) => u.path === "/fruitsalad" || u.path.startsWith("/usr")), false)
  assert.equal(c.use.some((u) => u.at.endsWith("FruitResource.java")), false)
  assert.match(computedXml(c), /<use at="[^"]*fruits\.html" path="\/fruits" via="/)
})

test("the artifact declares the BORDERS of the computable: which language has edges and routes", () => {
  const xml = computedXml(computed)
  assert.match(xml, /<lang id="java" files="2" edges="yes" routes="yes"\/>/)
  assert.match(xml, /<lang id="\(unknown\)" files="1" edges="no-rules" routes="no-rules"\/>/)
  assert.match(xml, /<edge from="[^"]*FruitResource\.java" to="[^"]*Fruit\.java" via="import org\.acme\.rest\.json\.Fruit;"\/>/)
  assert.match(xml, /<driver at="[^"]*FruitResource\.java" kind="db"/)

  // Go: edges are computable from go.mod, routes are not (routing by calls in the body). DIFFERENT answers.
  const go = newComputed({
    sources: [readSource({ path: "cmd/api/main.go", text: 'package main\nimport "m/internal/store"' }),
              readSource({ path: "internal/store/s.go", text: "package store" })],
    paths: ["cmd/api/main.go", "internal/store/s.go"],
    goModule: "m",
  })
  assert.match(computedXml(go), /<lang id="go" files="2" edges="yes" routes="no-rules"\/>/)

  // The artifact is read by the same scanner as the parts: step 4 takes its own cell's facts, step 5
  // takes all. The compute → write → read circle must close, or the computed facts never reach the graph.
  const back = parseComputed(xml)
  assert.deepEqual(back.edges, computed.edges)
  assert.deepEqual(back.api, computed.api)
  assert.deepEqual(back.use, computed.use)
  assert.deepEqual(back.drivers, computed.drivers.map((d) => ({ at: d.at, kind: d.kind, via: d.via })))
  assert.deepEqual(back.langs, computed.langs.map((l) => ({ lang: l.lang, files: l.files, rules: l.rules })))
  assert.deepEqual(parseComputed(undefined).edges, [])
})

test("digest: every fact behind its own prefix, and nothing dropped in silence", () => {
  const files = FILES.map(([path, text]) => ({ path, bytes: text.length, source: readSource({ path, text }) }))
  const block = newDigest({ files, computed })

  assert.match(block, /^- src\/main\/java\/org\/acme\/rest\/json\/FruitResource\.java \(\d+ b · java\)$/m)
  assert.match(block, /^ {4}package org\.acme\.rest\.json$/m)
  assert.match(block, /^ {4}imports \(computed\): src\/main\/java\/org\/acme\/rest\/json\/Fruit\.java$/m)
  assert.match(block, /^ {4}route \(computed\): GET \/fruits {3}← @GET/m)
  assert.match(block, /^ {4}driver \(computed\): db/m)
  assert.match(block, /^ {4}\+ @Path\("\/fruits"\) public class FruitResource/m)
  assert.match(block, /^ {4}imports \(computed\): none inside this repository$/m)   // Fruit.java: an answer, not silence
  assert.match(block, /^ {4}no digest: this extension has no reader/m)              // import.sql: an answer too

  const long = { path: "a.go", bytes: 10, source: readSource({ path: "a.go", text: Array.from({ length: 5 }, (_, i) => `func F${i}() {}`).join("\n") }) }
  assert.match(newDigest({ files: [long], computed: {}, maxDecls: 2 }), /… 3 more declarations — read the file for them/)
})
