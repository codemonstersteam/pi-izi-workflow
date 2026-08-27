// Units of the owners order slice. By the formula of standards/code.md:
//     N = 1 happy path + Σ antecedent branches with a DISTINGUISHABLE consequent + 1 silence
//
// The named-emptiness branches of this slice (no candidates, no blueprint, no analogue) are
// proven integration-side by order.test.mjs («пустой стенд — именованные пустоты»); here the
// unit proves the SIDE EFFECT that only this layer owns: the judge's material laid on disk —
// .agent/intake-b0.json and the .agent/rtm.md skeleton grown from brd.md R-lines.
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { orderSlice } from "./order.mjs"

const arrange = () => {
  const cwd = mkdtempSync(join(tmpdir(), "izi-owners-"))
  mkdirSync(join(cwd, ".agent/staging"), { recursive: true })
  writeFileSync(join(cwd, ".agent/brd.md"), "R1 система хранит сущности\nR2 сущности читаются по URI\n")
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
    analogue: { word: "Snippet", files: ["src/llm/SnippetService.java"] },
  }))
  writeFileSync(join(cwd, ".agent/staging/frd~scenarios.xml"), `<frd grammar="1" goal="g">
  <usecase id="UC7" actor="operator" goal="substitute"><post>done</post>
    <step n="1">substitute glossary terms during prompt rendering</step></usecase>
</frd>`)
  return cwd
}

test("слайс owners кладёт материал суда на диск: intake-b0.json и скелет rtm.md из R-строк brd", () => {
  const cwd = arrange()
  try {
    const slots = orderSlice({ cwd })
    assert.deepEqual(Object.keys(slots).sort(),
      ["{ANALOGUE}", "{BLUEPRINT}", "{CANDIDATES}", "{TYPES}"], "слоты пласта не те")
    assert.match(slots["{CANDIDATES}"], /UC7\/1/, "таблица кандидатов не назвала шаг")
    const b0 = JSON.parse(readFileSync(join(cwd, ".agent/intake-b0.json"), "utf8"))
    assert.ok(b0.steps.length, "b0 на диске пуст — судья F17 будет судить не по тому, что видела модель")
    assert.equal(readFileSync(join(cwd, ".agent/rtm.md"), "utf8"),
      "R1 | owners:\nR2 | owners:\n",
      "скелет rtm.md вырос не из R-строк brd — матрица начнётся без требований")
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test("скелет rtm.md НЕ переписывается, если матрица уже начата (починка круга не роняет её)", () => {
  const cwd = arrange()
  try {
    writeFileSync(join(cwd, ".agent/rtm.md"), "R1 | owners: src/engine/Converter.java\n")
    orderSlice({ cwd })
    assert.equal(readFileSync(join(cwd, ".agent/rtm.md"), "utf8"),
      "R1 | owners: src/engine/Converter.java\n",
      "повторный наряд затёр начатую матрицу — модель теряет работу прошлого круга")
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})
