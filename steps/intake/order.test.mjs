// Units of the layer order builder. By the formula of standards/code.md:
//     N = 1 happy path + Σ antecedent branches with a DISTINGUISHABLE consequent + 1 silence
//
// T61 — the наряд promised the repository map and delivered bare paths; the types slot read a
// field parseMap never had; the operator's answers went into a slot the B-template did not
// carry (замер 25.08: GlossarySubstitutionService при живой роли MemoryItemConverter).
// T62 — пласт B разложен: B1 выбирает владельцев по КАНДИДАТНОЙ ТАБЛИЦЕ СКРИПТА (b0.mjs), B2
// ставит формы на подтверждённых узлах. Наряд каждого решения несёт свой срез фактов.
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { orderText } from "./order.mjs"

const FRD_A = `<frd grammar="1" goal="g">
  <usecase id="UC7" actor="operator" goal="substitute"><post>done</post>
    <step n="1">substitute glossary terms during prompt rendering</step></usecase>
</frd>`

const arrange = () => {
  const cwd = mkdtempSync(join(tmpdir(), "izi-order-"))
  mkdirSync(join(cwd, ".agent/staging"), { recursive: true })
  writeFileSync(join(cwd, ".agent/appgraph.xml"), `<appgraph grammar="4">
  <module path="src/engine/Converter.java" pkg="p"><role>transform conversation memory into a flat Map — snippets, vars</role>
    <api name="convert(memory)" kind="lib" scope="internal"/></module>
  <module path="src/llm/SnippetService.java" pkg="p"><role>cache prompt snippets and substitute them into rendered prompts</role></module>
  <module path="src/agents/AgentConfiguration.java" pkg="p"><role>agent configuration model with workflows list</role></module>
</appgraph>`)
  writeFileSync(join(cwd, ".agent/graph-computed.xml"), `<computed>
  <edge from="src/engine/Converter.java" to="src/llm/SnippetService.java"/>
  <decl at="src/agents/AgentConfiguration.java" kind="class" name="AgentConfiguration" sig="public class AgentConfiguration"/>
</computed>`)
  writeFileSync(join(cwd, ".agent/anchors.json"), JSON.stringify({
    analogue: { word: "Snippet", files: ["src/llm/SnippetService.java", "src/engine/Converter.java"] },
  }))
  writeFileSync(join(cwd, ".agent/answers.md"), "1. Binding — a list of URI glossaries in the agent configuration model itself.\n")
  writeFileSync(join(cwd, ".agent/staging/frd~scenarios.xml"), FRD_A)
  writeFileSync(join(cwd, ".agent/staging/frd~owners.xml"), FRD_A + `
  <owner step="UC7/1" node="src/engine/Converter.java"/>
`)
  return cwd
}

test("T62: наряд B1 несёт КАНДИДАТЫ скрипта, АНАЛОГ с ролями и ОТВЕТЫ; b0 кладётся на диск", () => {
  const cwd = arrange()
  try {
    const r = orderText({ cwd }, "owners", { previous: FRD_A, closed: "A" })
    assert.equal(r.why, undefined, r.why)
    const t = r.text
    assert.match(t, /UC7\/1/, "шаг не назван")
    assert.match(t, /src\/engine\/Converter\.java · \d+ · via edge of src\/llm\/SnippetService\.java/,
      "кандидат по ребру не назван с источником — связь снова проза")
    assert.match(t, /cache prompt snippets and substitute/,
      "роль кандидата не доехала — модель не видит, ЧТО файл делает")
    assert.match(t, /THE ANALOGUE/, "блока аналога нет")
    assert.match(t, /Binding — a list of URI glossaries/, "ответ оператора не в наряде B1")
    assert.match(t, /Layers already closed: A/, "буквы закрытых пластов потерялись")
    assert.ok(existsSync(join(cwd, ".agent/intake-b0.json")), "b0 не положен на диск — судья F17 будет судить не по тому, что видела модель")
    assert.doesNotMatch(t, /\{(CANDIDATES|ANALOGUE|ANSWERED|PREVIOUS|CLOSED)\}/, "слот не подставлен")
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test("T62: наряд B2 несёт ВЛАДЕЛЬЦЕВ машиной и СРЕЗ карты с ролями выбранных узлов", () => {
  const cwd = arrange()
  try {
    const prev = readFileSync(join(cwd, ".agent/staging/frd~owners.xml"), "utf8")
    const r = orderText({ cwd }, "contracts", { previous: prev, closed: "A,B1" })
    assert.equal(r.why, undefined, r.why)
    const t = r.text
    assert.match(t, /UC7\/1 → src\/engine\/Converter\.java/, "таблица владельцев не машиной")
    assert.match(t, /src\/engine\/Converter\.java — transform conversation memory/,
      "срез карты не несёт роль выбранного узла")
    assert.match(t, /Binding — a list of URI glossaries/, "ответ оператора не в наряде B2")
    assert.match(t, /Added/, "определения форм не в наряде")
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test("T62: пустой стенд — именованные пустоты, не выдумка; без наряда B1 наряд B2 говорит об этом", () => {
  const cwd = mkdtempSync(join(tmpdir(), "izi-order-"))
  try {
    mkdirSync(join(cwd, ".agent/staging"), { recursive: true })
    const b1 = orderText({ cwd }, "owners", {})
    assert.equal(b1.why, undefined, b1.why)
    assert.match(b1.text, /\(скрипт кандидатов не нашёл/)
    const b2 = orderText({ cwd }, "contracts", { previous: "<frd/>" })
    assert.equal(b2.why, undefined, b2.why)
    assert.match(b2.text, /B1 не оставил владельцев/)
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})
