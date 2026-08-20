// Slice `focus`: the decision "what do we survey" — a PURE core.
//
// The graph is the same 12-node extract of the live eddi tree that slices.test.mjs uses, and the
// plan is built from it by this repository's own newPlan — so the cells are real cells, with real
// ids and a real spine. `cap` is passed explicitly in most cases: the true ceiling (115 KB) is
// twenty times this fixture, and a branch that only a monolith can reach would otherwise be a branch
// no test can turn red. The ceiling itself is NOT redefined here — it arrives from
// steps/intake/map.mjs, and the first case below proves that it does.

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { newSlices } from "./slices.mjs"
import { newFocus, names, coverageOf, checkFocus } from "./focus.mjs"
import { newPlan } from "../survey-plan/plan.mjs"
import { MAP_PRICE, MAP_EST_SLACK } from "../intake/map.mjs"

const FX = JSON.parse(readFileSync(new URL("./fixture-eddi.json", import.meta.url), "utf8"))
const ENTRY = FX.entry                       // …/configs/agents/IRestCapabilityRegistry.java — cone of 5
const OTHER = FX.otherEntry                  // …/configs/dictionary/IRestAction.java — cone of 2
const ORPHAN = FX.nodes.find((p) => p.endsWith(".descriptor.json"))

const { slices, orphans } = newSlices(FX)
const idOf = (entry) => slices.find((s) => s.entry === entry).id   // ids run by cone SIZE: never hard-code them

// `cellFiles: 2` cuts the extract into nine cells instead of one. It is not a knob the pipeline
// turns — the real width is CELL_FILES = 20 — but a twelve-file tree lands in a SINGLE cell at that
// width, and a focus that can only ever choose "everything" cannot show that it chooses.
const plan = newPlan({
  files: FX.nodes.map((path) => ({ path, bytes: 1000 })),
  spine: [{ path: "README.md", bytes: 1000 }],
  subjects: [],
  cellFiles: 2,
}).value
const CELLS = plan.cells
const SPINE = CELLS.find((c) => c.kind === "spine").id

const EDGES = FX.edges
const focusIn = (over) => newFocus({ slices, cells: CELLS, edges: EDGES, ...over })
const TIGHT = 8 * (MAP_PRICE.node + MAP_PRICE.preamble + MAP_PRICE.role)         // the whole plan estimates at 13613 B: it cannot meet this
const focus = (over) => newFocus({ slices, orphans, cells: CELLS, ...over })

test("names: the anchor NAMES the file — by its PATH, case-insensitively", () => {
  assert.equal(names("export", "src/main/java/ai/labs/eddi/backup/IRestExportService.java"), true)
  assert.equal(names("Glossary", "…/configs/glossary/IGlossaryStore.java"), true)
  assert.equal(names("snippet", "…/PromptSnippetService.java"), true)

  // BUG_FIX_CONTEXT run e90d9ce1: the BRD's anchors were `… · export · import`, and `import` is a
  // java keyword. Under step 3's rule — the anchor's text anywhere in the file — it marked the whole
  // repository and named 83 of 84 entries. A path is not a text: this is the whole repair.
  assert.equal(names("import", "src/main/java/ai/labs/eddi/configs/agents/IRestAgentStore.java"), false)
  assert.equal(names("import", "src/main/java/ai/labs/eddi/backup/IRestImportService.java"), true, "…but a file that IS about import is still named")

  // an empty anchor would name EVERY file — `"".includes("")` is true — which is the failure this
  // rule exists to end, so it is refused rather than allowed through
  assert.equal(names("", "…/anything.java"), false)
  assert.equal(names("   ", "…/anything.java"), false)
  assert.equal(names(undefined, undefined), false)
})

test("the budget is the ceiling MINUS the estimate's own measured error", () => {
  // BUG_FIX_CONTEXT run fa8def32 (eddi): the focus estimated 110 099 B against a 117 760 B ceiling
  // and the map came out 121 384 — 3% over, and the swarm was already paid for. The estimate models
  // a file a scout has not written yet, so it cannot be exact; the ceiling is therefore divided by
  // the measured worst error (steps/intake/map.mjs::MAP_EST_SLACK).
  const est = newFocus({ slices, cells: CELLS, edges: EDGES }).value.estBytes

  // a ceiling exactly equal to the estimate is NOT enough any more — that is the whole fix
  const exact = newFocus({ slices, cells: CELLS, edges: EDGES, cap: est, anchors: ["capabilityregistry"] })
  assert.notEqual(exact.ok && exact.value.why, "whole-plan", "the ceiling alone no longer admits the whole plan")

  // …with the slack accounted for, it is
  assert.equal(newFocus({ slices, cells: CELLS, edges: EDGES, cap: Math.ceil(est * MAP_EST_SLACK) }).value.why, "whole-plan")
})

test("the whole plan fits — the focus IS the plan, and nothing is dropped", () => {
  const r = focus({})                        // no cap given: the real 115 KB arrives from map.mjs
  assert.equal(r.value.why, "whole-plan")
  assert.deepEqual(r.value.cells, CELLS.map((c) => c.id))
  assert.deepEqual(r.value.dropped, { slices: 0, cells: 0 })

  // This is the branch that keeps every form the pipeline is green on today green: t1-t3 are ~19
  // files, so the focus equals the plan and step 4 sees exactly what it saw yesterday.
})

test("above the ceiling the anchor picks the cone that NAMES it, and the cell comes whole", () => {
  const r = focus({ cap: TIGHT, anchors: ["capabilityregistry"] })
  assert.equal(r.value.why, "anchors")
  assert.deepEqual(r.value.chosen, [idOf(ENTRY)])
  assert.ok(r.value.cells.length < CELLS.length, "the focus is narrower than the plan")
  assert.ok(r.value.cells.includes(SPINE), "the spine is in every focus: its six questions are not about a slice")
  assert.ok(r.value.estBytes <= TIGHT)

  // an anchor that names NOTHING is not a narrowing rule, it is a broken requirement: the repair is
  // the BRD, not a choice among 84 candidates the operator cannot rank
  const nothing = focus({ cap: TIGHT, anchors: ["import", "glossary"] })
  assert.equal(nothing.error.cls, "no-anchor")
  assert.match(nothing.error.detail, /правится формулировка требований/)
})

test("an anchor on an orphan brings its cell — else a config could never be surveyed at all", () => {
  const r = focus({ cap: TIGHT, anchors: ["descriptor"] })
  assert.deepEqual(r.value.chosen, [], "no cone was named…")
  const cellOfOrphan = CELLS.find((c) => c.files.some((f) => f.path === ORPHAN)).id
  assert.ok(r.value.cells.includes(cellOfOrphan), "…and yet the named orphan's cell is in the focus")
})

test("two phases: the CELL of a named file first, the CONE after — and the rest is COUNTED", () => {
  // Measured order, not an argued one (see focus.mjs): naming a file is the cheapest, most precise
  // thing an anchor buys; a cone is structure and costs an order of magnitude more.
  const tight = newFocus({ slices, cells: CELLS, edges: EDGES, anchors: ["capabilityregistry", "irestaction"], cap: 6 * (MAP_PRICE.node + MAP_PRICE.preamble + MAP_PRICE.role) })
  assert.equal(tight.value.why, "anchors")
  assert.deepEqual(tight.value.chosen, [], "no cone fits under this ceiling…")
  assert.ok(tight.value.cells.length > 1, "…but the cells of the named files are in")
  assert.equal(tight.value.dropped.slices, 2, "and the cones that did not fit are counted")
  assert.ok(tight.value.estBytes <= 6 * (MAP_PRICE.node + MAP_PRICE.preamble + MAP_PRICE.role), "the ceiling is never exceeded to fit one more")

  // give it room and the cones follow the cells, cheapest cone first
  const roomy = newFocus({ slices, cells: CELLS, edges: EDGES, anchors: ["capabilityregistry", "irestaction"], cap: 14 * (MAP_PRICE.node + MAP_PRICE.preamble + MAP_PRICE.role) })
  assert.deepEqual(roomy.value.chosen, [idOf(OTHER), idOf(ENTRY)], "IRestAction's cone is the cheaper one")
  assert.deepEqual(roomy.value.dropped, { slices: 0, cells: 0 })

  // The count is what makes this a decision rather than a default (standards/code.md §3): step 5
  // carries it into <focus>, and the anchors whose files stayed out come back as found="outside".
})

test("no plan, no entry, no cone that fits — three different refusals, and all total", () => {
  assert.equal(newFocus().error.cls, "no-plan")
  assert.equal(newFocus({ cells: [] }).error.cls, "no-plan")

  const noEntry = newFocus({ slices: [], cells: CELLS, edges: EDGES, cap: TIGHT })
  assert.equal(noEntry.error.cls, "no-entry")
  assert.match(noEntry.error.detail, /сузить нечем/)

  // …but a SMALL repository of such a language never meets that refusal: it leaves by the whole-plan
  // branch above, because its plan fits. The order of the two checks is the rule.
  assert.equal(newFocus({ slices: [], cells: CELLS, edges: EDGES }).value.why, "whole-plan")

  // a ceiling under the cheapest cone: nothing can be surveyed, and saying so costs zero tokens
  const over = newFocus({ slices, cells: CELLS, edges: EDGES, cap: 2 * (MAP_PRICE.node + MAP_PRICE.preamble + MAP_PRICE.role), anchors: ["capabilityregistry"] })
  assert.equal(over.error.cls, "over-cap")
  assert.match(over.error.detail, /ключ кэша/)
})

// ПОКРЫТИЕ ПРЕДМЕТОВ: взятое и отброшенное называются вместе (наряд J18).
//
// Живой прогон eddi 19.08.2026: `chosen:["s242"]`, `dropped:{slices:30, cells:66}` — и ни слова о
// том, что среди выброшенного лежал предмет `agent`, названный BRD и требованием R3. Проигрыш по тем
// же артефактам после правки: `agent: взято 2 клетки, ОТБРОШЕНО 50`. Молчание стоило трёх остановок
// внизу полосы.
const cellsFor = (map) => Object.entries(map).map(([id, files]) => ({ id, kind: "code", files: files.map((p) => ({ path: p, bytes: 100 })) }))

test("coverageOf: предмет назван ровно один раз, со взятым И отброшенным", () => {
  const plan = cellsFor({
    a1: ["src/agents/model/AgentConfiguration.java"],
    a2: ["src/agents/rest/RestAgent.java"],
    t1: ["src/templating/Engine.java"],
  })
  const cellOf = new Map()
  for (const c of plan) for (const f of c.files) cellOf.set(f.path, c)
  const taken = new Set([plan[1], plan[2]])          // взята вторая клетка agent и клетка template

  const { covered, uncovered } = coverageOf({ anchors: ["agent", "template", "glossary"], cellOf, slices: [], taken, chosen: [] })
  const agent = covered.find((c) => c.subject === "agent")
  assert.ok(agent, "предмет с взятой клеткой обязан быть покрытым")
  assert.equal(agent.cells, 1)
  assert.equal(agent.droppedCells, 1, "отброшенное обязано быть названо: без него «покрыт» врёт")

  // Предмет, которого нет в репозитории вовсе — это НЕ дефект: тип, который создаёт это изменение.
  const glossary = uncovered.find((c) => c.subject === "glossary")
  assert.equal(glossary.why, "none")

  // Каждый предмет ровно в одном списке.
  const said = [...covered, ...uncovered].map((x) => x.subject)
  assert.deepEqual(said.sort(), ["agent", "glossary", "template"])
  assert.deepEqual(checkFocus({ focus: { covered, uncovered }, anchors: ["agent", "template", "glossary"] }), [])
})

test("coverageOf: предмет, чьи клетки есть, но ни одна не взята — непокрыт по потолку", () => {
  const plan = cellsFor({ a1: ["src/agents/model/AgentConfiguration.java"] })
  const cellOf = new Map([["src/agents/model/AgentConfiguration.java", plan[0]]])
  const { covered, uncovered } = coverageOf({ anchors: ["agent"], cellOf, slices: [], taken: new Set(), chosen: [] })
  assert.deepEqual(covered, [])
  assert.deepEqual(uncovered.map((u) => [u.subject, u.why, u.cells]), [["agent", "cap", 1]])
})

test("checkFocus краснеет на предмете, потерянном скриптом, и на предмете в двух списках", () => {
  const lost = checkFocus({ focus: { covered: [], uncovered: [] }, anchors: ["agent"] })
  assert.equal(lost.length, 1)
  assert.match(lost[0], /^FC1 предмет «agent» не попал ни в покрытые, ни в непокрытые/)
  assert.match(lost[0], /coverageOf обязан назвать КАЖДЫЙ предмет ровно один раз/)

  const both = checkFocus({ focus: { covered: [{ subject: "agent" }], uncovered: [{ subject: "agent" }] }, anchors: ["agent"] })
  assert.match(both.join("\n"), /назван и покрытым, и непокрытым/)

  // Пустые якоря — нечего судить, и правило молчит (дисциплина F5 без источников).
  assert.deepEqual(checkFocus({ focus: {}, anchors: [] }), [])
  assert.deepEqual(checkFocus(), [])
})

// M2 — БЮДЖЕТ ДЕЛИТСЯ ПО ЯКОРЯМ. Прежний порядок «все названные клетки по возрастанию размера» не
// знает, какому якорю служит клетка: один якорь съедает бюджет, другой получает ноль. На живом
// прогоне eddi так потерялся весь `configs/agents` — носитель требования R6.
test("M2: якорь с одной ДОРОГОЙ клеткой не остаётся с нулём из-за чужих дешёвых", () => {
  const cell = (id, n, pre) => ({ id, kind: "code", files: Array.from({ length: n }, (_, i) => ({ path: `${pre}/F${i}.java` })) })
  const cells = [
    { id: "spine", kind: "spine", files: [{ path: "pom.xml" }] },
    cell("s1", 1, "src/snippet/a"), cell("s2", 1, "src/snippet/b"), cell("s3", 1, "src/snippet/c"),
    cell("a1", 3, "src/agent/model"),
  ]
  const decls = Object.fromEntries(cells.flatMap((c) => c.files.map((f) => [f.path, 8])))
  // вход нужен, иначе сужать не по чему и шаг отказывает `no-entry` — он берётся из среза
  const slices = [{ id: "sn", entry: "src/snippet/a/F0.java", kind: "route", nodes: ["src/snippet/a/F0.java"] }]
  // Потолок вмещает три дешёвые клетки `snippet` ЛИБО одну дорогую `agent` и одну-две дешёвые.
  // Прежний порядок (все названные по возрастанию размера) выбирал s1, s2, s3 и оставлял `agent`
  // с нулём — ровно то, что случилось на eddi с `configs/agents`.
  const r = newFocus({ slices, anchors: ["snippet", "agent"], cells, decls, apis: {}, cap: 9000 })
  assert.equal(r.ok, true, r.ok ? "" : r.error.detail)
  const taken = new Set(r.value.cells)
  assert.equal(taken.has("a1"), true, "дорогая клетка отстающего якоря не взята — квота не работает")
  assert.ok([...taken].some((id) => id.startsWith("s")), "и дешёвый якорь не остался ни с чем")
  assert.equal((r.value.uncovered || []).some((u) => u.subject === "agent"), false, "предмет числится непокрытым")
})

test("M2: клетка, названная двумя якорями, засчитывается ОДНОМУ — тому, кто отстаёт", () => {
  // `store` называет обе клетки, `agent` — только вторую. Если общая клетка засчитается `store`,
  // отстающим окажется `agent` и вторую он возьмёт себе; счёт по обоим якорям обязан быть 1 и 1.
  const cells = [
    { id: "spine", kind: "spine", files: [{ path: "pom.xml" }] },
    { id: "c1", kind: "code", files: [{ path: "src/store/Plain.java" }] },
    { id: "c2", kind: "code", files: [{ path: "src/store/AgentStore.java" }] },
  ]
  const decls = { "src/store/Plain.java": 8, "src/store/AgentStore.java": 8, "pom.xml": 1 }
  const r = newFocus({ slices: [], anchors: ["store", "agent"], cells, decls, apis: {}, cap: 100000 })
  assert.equal(r.ok, true)
  assert.deepEqual([...r.value.cells].sort(), ["c1", "c2", "spine"])
  assert.deepEqual(r.value.uncovered, [])
})

// M2 — ДОМ ПРЕДМЕТА. Три решения, каждое найдено проигрышем по живым входам eddi, и каждое можно
// вернуть одной строкой — поэтому у каждого свой случай.
test("M2: дом — каталог, НАЗВАННЫЙ предметом, а не содержащий это слово", () => {
  const cells = [
    { id: "spine", kind: "spine", files: [{ path: "pom.xml" }] },
    // Ловушка живого прогона: каталог СОДЕРЖИТ слово. Файлов под ним больше, чем в настоящем доме, —
    // значит нестрогое правило выберет его и по плотности тоже, и разделить их может только строгость.
    { id: "docs", kind: "code", files: [
      { path: "docs/your-first-agent/intro.md" },
      { path: "docs/your-first-agent/setup.md" },
      { path: "docs/your-first-agent/faq.md" },
    ] },
    { id: "home", kind: "code", files: [{ path: "src/configs/agents/AgentConfiguration.java" }, { path: "src/configs/agents/AgentStore.java" }] },
  ]
  const decls = Object.fromEntries([["pom.xml", 1],
    ["docs/your-first-agent/intro.md", 8], ["docs/your-first-agent/setup.md", 8], ["docs/your-first-agent/faq.md", 8],
    ["src/configs/agents/AgentConfiguration.java", 8], ["src/configs/agents/AgentStore.java", 8]])
  const slices = [{ id: "s", entry: "src/configs/agents/AgentStore.java", kind: "route", nodes: ["src/configs/agents/AgentStore.java"] }]
  // потолок вмещает хребет и ОДНУ клетку
  const r = newFocus({ slices, anchors: ["agent"], cells, decls, apis: {}, cap: 6000 })
  assert.equal(r.ok, true, r.ok ? "" : r.error.detail)
  assert.equal(r.value.cells.includes("home"), true, "домом оказалась документация, а не пакет предмета")
  assert.equal(r.value.cells.includes("docs"), false, "потолок вместил обе клетки — проверка ничего не различает")
})

test("M2: из нескольких домов берётся ПЛОТНЕЙШИЙ, а не самый дешёвый", () => {
  const cells = [
    { id: "spine", kind: "spine", files: [{ path: "pom.xml" }] },
    // сосед ДЕШЕВЛЕ дома: три файла, под каталогом предмета — один
    { id: "neighbour", kind: "code", files: [
      { path: "src/engine/client/agent/Hook.java" },
      ...Array.from({ length: 2 }, (_, i) => ({ path: `src/engine/client/C${i}.java` })),
    ] },
    // дом дороже: шесть файлов, и все под каталогом предмета
    { id: "home", kind: "code", files: Array.from({ length: 6 }, (_, i) => ({ path: `src/configs/agents/A${i}.java` })) },
  ]
  const decls = Object.fromEntries(cells.flatMap((c) => c.files.map((f) => [f.path, 8])))
  const slices = [{ id: "s", entry: "src/configs/agents/A0.java", kind: "route", nodes: ["src/configs/agents/A0.java"] }]
  // потолок вмещает хребет и ОДНУ из двух клеток — выбор между ними и есть предмет проверки
  const r = newFocus({ slices, anchors: ["agent"], cells, decls, apis: {}, cap: 10000 })
  assert.equal(r.ok, true, r.ok ? "" : r.error.detail)
  assert.equal(r.value.cells.includes("home"), true, "дешевизна победила плотность — взят сосед")
  assert.equal(r.value.cells.includes("neighbour"), false, "потолок вместил обе клетки — проверка ничего не различает")
})

test("M2: тест стоит СТРОКУ, и оценка это знает — иначе освободившееся место не доедет до якорей", () => {
  const many = (n, pre) => Array.from({ length: n }, (_, i) => ({ path: `${pre}/F${i}.java` }))
  const cells = [
    { id: "spine", kind: "spine", files: [{ path: "pom.xml" }] },
    { id: "t", kind: "code", files: many(8, "src/test/java/app/agent") },
  ]
  const decls = Object.fromEntries(cells.flatMap((c) => c.files.map((f) => [f.path, 12])))
  const slices = [{ id: "s", entry: "src/test/java/app/agent/F0.java", kind: "route", nodes: ["src/test/java/app/agent/F0.java"] }]
  // потолок мал: восемь ПОЛНЫХ узлов в него не влезут, восемь строк — влезут
  const r = newFocus({ slices, anchors: ["agent"], cells, decls, apis: {}, cap: 3400 })
  assert.equal(r.ok, true, r.ok ? "" : r.error.detail)
  assert.equal(r.value.cells.includes("t"), true, "тестовая клетка оценена как узлы с объявлениями")
})

test("M2: ход дома идёт ДО фазы аналога — иначе звонящие аналогу выбирают бюджет", () => {
  const cells = [
    { id: "spine", kind: "spine", files: [{ path: "pom.xml" }] },
    { id: "analog", kind: "code", files: [{ path: "src/snippets/PromptSnippet.java" }] },
    { id: "caller", kind: "code", files: Array.from({ length: 4 }, (_, i) => ({ path: `src/llm/C${i}.java` })) },
    { id: "home", kind: "code", files: [{ path: "src/configs/agents/AgentConfiguration.java" }] },
  ]
  const decls = Object.fromEntries(cells.flatMap((c) => c.files.map((f) => [f.path, 8])))
  const edges = cells[2].files.map((f) => ({ from: f.path, to: "src/snippets/PromptSnippet.java" }))
  const slices = [{ id: "s", entry: "src/snippets/PromptSnippet.java", kind: "route", nodes: ["src/snippets/PromptSnippet.java"] }]
  // места хватает на хребет и ДВЕ клетки: дом обязан быть одной из них
  const r = newFocus({ slices, anchors: ["agent"], analogue: "PromptSnippet", cells, edges, decls, apis: {}, cap: 4600 })
  assert.equal(r.ok, true, r.ok ? "" : r.error.detail)
  assert.equal(r.value.cells.includes("home"), true, "фаза аналога забрала бюджет раньше дома предмета")
})
