// Units of the one-track order slice. By the formula of standards/code.md:
//     N = 1 happy path + Σ antecedent branches with a DISTINGUISHABLE consequent + 1 silence
//
// The named-emptiness branches (no candidates — the one-track has no scenarios staging on the
// first attempt) are proven integration-side by order.test.mjs of the head («пустой стенд»).
// Here the units prove what only this slice owns: all eight slots non-empty on a stand, the
// judge's material laid on disk (intake-b0.json, the rtm.md skeleton), and the head's
// totality holding for the one template too.
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { orderSlice } from "./order.mjs"
import { orderText } from "../order.mjs"

const arrange = () => {
  const cwd = mkdtempSync(join(tmpdir(), "izi-one-"))
  mkdirSync(join(cwd, ".agent/staging"), { recursive: true })
  writeFileSync(join(cwd, ".agent/brd.md"), "R1 система хранит сущности\nR2 сущности читаются по URI\n")
  writeFileSync(join(cwd, ".agent/normalized.md"),
    "R1 | хранить | сущности | карта | values: список целиком\nR2 | читать | сущность | URI | values: один URI\n")
  writeFileSync(join(cwd, ".agent/appgraph.xml"), `<appgraph grammar="4">
  <module path="src/engine/Converter.java" pkg="p"><role>transform conversation memory into a flat Map — snippets, vars</role>
    <api name="convert(memory)" kind="lib" scope="internal"/></module>
  <module path="src/llm/SnippetService.java" pkg="p"><role>cache prompt snippets and substitute them into rendered prompts</role></module>
</appgraph>`)
  writeFileSync(join(cwd, ".agent/graph-computed.xml"), `<computed>
  <edge from="src/engine/Converter.java" to="src/llm/SnippetService.java"/>
  <decl at="src/engine/Converter.java" kind="class" name="Converter" sig="public class Converter"/>
</computed>`)
  writeFileSync(join(cwd, ".agent/anchors.json"), JSON.stringify({
    analogue: { word: "Snippet", files: ["src/llm/SnippetService.java", "src/engine/Converter.java"] },
  }))
  writeFileSync(join(cwd, ".agent/staging/frd~scenarios.xml"), `<frd grammar="1" goal="g">
  <usecase id="UC7" actor="operator" goal="substitute"><post>done</post>
    <step n="1">substitute glossary terms during prompt rendering</step></usecase>
</frd>`)
  return cwd
}

test("слайс one несёт все восемь слотов непустыми: материалы шести пластов одним нарядом", () => {
  const cwd = arrange()
  try {
    const slots = orderSlice({ cwd })
    assert.deepEqual(Object.keys(slots).sort(),
      ["{ANALOGUE}", "{BLUEPRINT}", "{BRD}", "{CANDIDATES}", "{NORMALIZED}", "{OWED}", "{SOURCES}", "{TYPES}"],
      "слоты укороченного трека не те")
    for (const [k, v] of Object.entries(slots)) {
      assert.ok(String(v).trim(), `слот ${k} пуст — наряд одного вызова уедет с дырой`)
    }
    assert.match(slots["{CANDIDATES}"], /UC7\/1/, "таблица кандидатов не назвала шаг")
    assert.match(slots["{OWED}"], /^R1\nR2$/, "список требований — не R-строки brd")
    assert.match(slots["{BRD}"], /R1 система/)
    assert.match(slots["{NORMALIZED}"], /normalized|значен|R1 \|/, "таблица значений не доехала")
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test("слайс one кладёт материал суда на диск: intake-b0.json и скелет rtm.md", () => {
  const cwd = arrange()
  try {
    orderSlice({ cwd })
    const b0 = JSON.parse(readFileSync(join(cwd, ".agent/intake-b0.json"), "utf8"))
    assert.ok(Array.isArray(b0.steps) && b0.steps.length, "b0 на диске пуст — судья F17 будет судить не по тому, что видела модель")
    assert.equal(readFileSync(join(cwd, ".agent/rtm.md"), "utf8"),
      "R1 | owners:\nR2 | owners:\n",
      "скелет rtm.md вырос не из R-строк brd — матрица начнётся без требований")
    // начатая матрица НЕ затирается — круг вопроса T64 не роняет работу круга 1
    writeFileSync(join(cwd, ".agent/rtm.md"), "R1 | owners: src/engine/Converter.java\n")
    orderSlice({ cwd })
    assert.equal(readFileSync(join(cwd, ".agent/rtm.md"), "utf8"),
      "R1 | owners: src/engine/Converter.java\n",
      "повторный наряд затёр начатую матрицу")
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test("тотальность: наряд one собирается из order-one.tpl, дыра слота — ОТКАЗ {why}", () => {
  const cwd = arrange()
  try {
    const r = orderText({ cwd }, "one", {})
    assert.equal(r.why, undefined, r.why)
    assert.match(r.staging, /frd~one\.xml/)
    assert.match(r.text, /One call, the whole FRD/, "наряд укороченного трека собран не из order-one.tpl")
    assert.doesNotMatch(r.text, /\{(CANDIDATES|BRD|OWED|SOURCES|BLUEPRINT|ANALOGUE|TYPES|NORMALIZED)\}/, "слот не подставлен")
    // дыра делается ЗНАЧЕНИЕМ слота: {OWED} в тексте brd.md доедет до наряда как есть
    writeFileSync(join(cwd, ".agent/brd.md"), "R1 держит величину {OWED} в самом тексте\n")
    const hole = orderText({ cwd }, "one", {})
    assert.equal(hole.text, undefined, "наряд one с дырой уехал роли текстом")
    assert.match(hole.why, /слот \{OWED\} не подставлен — наряд уходит роли с дырой/)
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})
