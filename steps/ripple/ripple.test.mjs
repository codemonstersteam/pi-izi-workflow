// Units of the subgraph builder. By the formula of standards/code.md:
//     N = 1 happy path + Σ antecedent branches with a DISTINGUISHABLE consequent + 1 silence
//
// T55 — the seam bought by the live run 25.08 (eddi, DOS-535): the BRD named the analogue
// `PromptSnippet`, the new modules were declared «modeled after» it, but the analogue's service and
// store lay OUTSIDE radius-1 of the export/import seeds — the tree never saw their contracts and
// lost the twins for the new modules. The fix is mechanical: map nodes whose FILE NAME carries the
// analogue word ride into the subgraph as CONTEXT, never as seeds (an analogue is copied, not
// changed — T6 of step 9B demands delta="Changed" of a seed).
import test from "node:test"
import assert from "node:assert/strict"
import { newRipple } from "./ripple.mjs"
import { parseFrd } from "../intake/frd.mjs"
import { parseMap } from "../intake/map.mjs"

const MAP_XML = `<appgraph grammar="4">
  <module path="src/backup/RestExportService.java" pkg="p"/>
  <module path="src/snippets/PromptSnippetService.java" pkg="p"/>
  <module path="src/snippets/RestPromptSnippetStore.java" pkg="p"/>
  <module path="src/other/Unrelated.java" pkg="p"/>
</appgraph>`

const FRD_XML = `<frd grammar="1" goal="экспорт глоссариев">
  <usecase id="UC1" actor="api" goal="выгрузить"><post>готово</post><step n="1">клиент шлёт GET</step></usecase>
  <delta op="export" form="Changed" node="src/backup/RestExportService.java" from="без глоссария" to="с глоссарием"/>
  <scenario id="S1" uc="UC1" before="нет" after="есть" nodes="src/backup/RestExportService.java"/>
</frd>`

const rip = (analogue) => newRipple({ xml: MAP_XML, frd: parseFrd(FRD_XML), mode: "minor", map: parseMap(MAP_XML), analogue })

test("T55: слово аналога приводит в подграф его узлы контекстом, не семенем", () => {
  // дефект 25.08 без слова аналога: сервис и стор вне радиуса-1 от семени экспорта
  const defect = rip("")
  assert.equal(defect.ok, true)
  assert.equal(defect.value.xml.includes("PromptSnippetService"), false, "аналог доехал и без слова — контроль не различает")

  const r = rip("PromptSnippet")
  assert.equal(r.ok, true, r.ok ? "" : r.error.detail)
  assert.match(r.value.xml, /src\/snippets\/PromptSnippetService\.java/)
  assert.match(r.value.xml, /src\/snippets\/RestPromptSnippetStore\.java/)
  // контекст, не работа: seed="yes" остаётся только у узла дельты
  assert.equal([...r.value.xml.matchAll(/seed="yes"/g)].length, 1)
  assert.equal(r.value.seeds.length, 1, "аналог стал семенем — T6 шага 9B тогда потребует от него Changed")
  // чужое имя в подграф не покупается
  assert.equal(r.value.xml.includes("Unrelated"), false)
})

test("T55: слово аналога не из карты молчит — рябь не расширяется выдумкой", () => {
  const r = rip("NoSuchThingAnywhere")
  assert.equal(r.ok, true)
  assert.equal(r.value.nodes.length, 1, "подграф вырос от слова, которого в карте нет")
})
