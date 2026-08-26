// Units пометки образцов (T26). Юниты склейки живут в judge/, здесь — ОДНО решение: узел,
// чей файл лежит в anchors.json::analogue.files, несёт sample="analogue"; чужой узел — нет.
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { tmpdir } from "node:os"
import { mergeOf } from "./cut.mjs"
import { PLAN, FOCUS, PARTS } from "./paths.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))

const PART = (id, path) => `<part cell="${id}" kind="survey"><module path="${path}" io="none" api="none" tests="none"><role>r</role></module></part>`
const SPINE = `<part cell="spine" kind="spine">
  <artifact name="demo" root="."/>
  <suite id="unit" kind="unit" cmd="mvn test" path="src/test" match="*Test.java"/>
  <build cmd="mvn package"/>
  <toggles found="no"/>
  <branching found="no"/>
  <contract found="no"/>
  <integrations found="no"/>
</part>`

function form() {
  const cwd = mkdtempSync(join(tmpdir(), "graph-sample-"))
  mkdirSync(join(cwd, ".agent/graph-parts"), { recursive: true })
  const cells = [
    { id: "spine", kind: "spine", files: [{ path: "pom.xml" }] },
    { id: "a", kind: "survey", files: [{ path: "src/Snippet.java" }, { path: "src/Other.java" }] },
  ]
  writeFileSync(join(cwd, PLAN), JSON.stringify({ cells }))
  writeFileSync(join(cwd, FOCUS), JSON.stringify({ cells: ["spine", "a"] }))
  writeFileSync(join(cwd, ".agent/graph-parts/spine.xml"), SPINE)
  writeFileSync(join(cwd, ".agent/graph-parts/a.xml"), PART("a", "src/Snippet.java") + "\n" + PART("a", "src/Other.java"))
  writeFileSync(join(cwd, ".agent/graph-computed.xml"), "<computed/>")
  return { cwd, cells }
}

test("T26: узел-аналог помечен sample=\"analogue\", чужой узел — нет", () => {
  const { cwd } = form()
  writeFileSync(join(cwd, ".agent/anchors.json"), JSON.stringify({
    files: 2, marked: [], anchors: [],
    analogue: { word: "PromptSnippet", files: ["src/Snippet.java"], packages: {} },
  }))
  const m = mergeOf({ cwd })
  assert.ok(!m.why, m.why)
  assert.match(m.xml, /<module path="src\/Snippet\.java"[^>]*sample="analogue"/, "файл аналога не помечен")
  assert.ok(!/src\/Other\.java"[^>]*sample=/.test(m.xml), "чужой файл помечен образцом")
})

test("T26: нет anchors.json — молчание пометки, карта законна", () => {
  const { cwd } = form()
  const m = mergeOf({ cwd })
  assert.ok(!m.why, m.why)
  assert.ok(!m.xml.includes("sample="), "пометка появилась без артефакта аналога")
})
