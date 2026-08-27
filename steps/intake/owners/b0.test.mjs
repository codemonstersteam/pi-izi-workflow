// Units of the candidate engine. By the formula of standards/code.md:
//     N = 1 happy path + Σ antecedent branches with a DISTINGUISHABLE consequent + 1 silence
//
// T62 — the engine exists because the наряд gave the model a whole map and the model could not
// bind «requirement function ↔ owning module» (замер 25.08: substitution sat in an invented
// service while MemoryItemConverter's role named it; the sync four stayed unnamed). The seams
// below prove the binding is now MECHANICS: the right module is a candidate, noise is not.
import test from "node:test"
import assert from "node:assert/strict"
import { candidatesOf } from "./b0.mjs"

const MAP = {
  nodes: new Set([
    "src/engine/MemoryItemConverter.java",
    "src/llm/PromptSnippetService.java",
    "src/backup/UpgradeExecutor.java",
    "src/backup/RestImportService.java",
    "src/snippets/model/PromptSnippet.java",
    "src/ops/HealthResource.java",
    "src/ops/MetricsResource.java",
    "src/ops/StatusResource.java",
    "src/ops/InfoResource.java",
  ]),
  roles: new Map([
    ["src/engine/MemoryItemConverter.java", "transform conversation memory into a flat map of template data — snippets, vars, context"],
    ["src/llm/PromptSnippetService.java", "cache prompt snippets and substitute them into rendered prompts"],
    ["src/backup/UpgradeExecutor.java", "upgrade resources on agent sync: process snippet diffs, update existing"],
    ["src/backup/RestImportService.java", "import agent ZIP: read archive, create resources, merge by URI"],
    ["src/snippets/model/PromptSnippet.java", "prompt snippet configuration entity"],
    ["src/ops/HealthResource.java", "health endpoint"],
    ["src/ops/MetricsResource.java", "metrics endpoint"],
    ["src/ops/StatusResource.java", "status endpoint"],
    ["src/ops/InfoResource.java", "info endpoint"],
  ]),
  apis: new Map([["src/backup/RestImportService.java", ["POST /backup/import"]]]),
}

// конвертер зовёт сервис подстановки — ребро computed-графа; слов «prompt/rendering» в роли
// конвертера НЕТ (как и в живой карте eddi) — кандидатство даёт цепочка роль+ребро
const EDGES = [{ from: "src/engine/MemoryItemConverter.java", to: "src/llm/PromptSnippetService.java" }]

const FRD = {
  usecases: [
    { id: "UC7", steps: ["substitute glossary terms during prompt rendering", "load glossaries for the agent"] },
    { id: "UC10", steps: ["upgrade existing glossary from imported agent zip"] },
    { id: "UC1", steps: ["operator creates a glossary"] },
  ],
}

test("T62: функция требования находит модуль-владелец механически — словами или ребром", () => {
  const r = candidatesOf({ frd: FRD, map: MAP, edges: EDGES })
  const subst = r.steps.find((s) => s.id === "UC7/1")
  // сервис подстановки — кандидат по роли; конвертер — по ребру от него
  assert.ok(subst.candidates.some((c) => c.path === "src/llm/PromptSnippetService.java"),
    "сервис подстановки не в кандидатах — роль не сработала")
  const conv = subst.candidates.find((c) => c.path === "src/engine/MemoryItemConverter.java")
  assert.ok(conv, "конвертер не в кандидатах — связь держится ребром от сервиса подстановки, а её нет")
  assert.equal(conv.via, "src/llm/PromptSnippetService.java", "кандидат по ребру не называет источник")
  const upgrade = r.steps.find((s) => s.id === "UC10/1")
  assert.ok(upgrade.candidates.some((c) => c.path === "src/backup/UpgradeExecutor.java"),
    "апгрейд не нашёл исполнитель")
})

test("T62/T63-2: спорный шаг — ничья на топе ИЛИ зазор 1 при втором по ребру", () => {
  const r = candidatesOf({ frd: FRD, map: MAP, edges: EDGES })
  for (const s of r.steps) {
    const top = s.candidates.length ? s.candidates[0].score : 0
    const want = top >= 2 && (
      s.candidates.filter((c) => c.score === top).length >= 2
      || s.candidates.some((c) => c.score === top - 1 && c.via)
    )
    assert.equal(s.disputed, want, `флаг спорности не согласован со скорами на ${s.id}`)
  }
  // ОТВЕРГНУТО ЗАМЕРОМ: top=1 с соседями — не спорно (22 шага на живом круге, включая все CRUD
  // с очевидным new="yes"). Слабое окружение лечит чертёж аналога и слова наряда.
  const weak = candidatesOf({ frd: { usecases: [{ id: "U", steps: ["create a brand new thing entirely"] }] },
    map: MAP, edges: EDGES }).steps[0]
  assert.equal(weak.disputed, false, "слабый топ со соседями ошибочно признан спором")
})

test("T63-2: зазор 1 при втором по ребру — СПОР (точка интеграции — решение оператора)", () => {
  // живой кейс: сервис подстановки скорит словами (2), конвертер — ЧЕРЕЗ РЕБРО (1): структурный
  // сигнал точки интеграции. Молчаливый выбор между ними стоил выдуманного GlossarySubstitution.
  // Минимальная карта: богатая роль общего MAP даёт зазор 3 — спор строится на целевой паре.
  const r = candidatesOf({
    frd: { usecases: [{ id: "UC7", steps: ["substitute prompts"] }] },
    map: {
      nodes: new Set(["src/llm/SubstService.java", "src/engine/Converter.java"]),
      roles: new Map([
        ["src/llm/SubstService.java", "substitute rendered prompts"],
        ["src/engine/Converter.java", "transform conversation memory into a flat map"],
      ]),
      apis: new Map(),
    },
    edges: [{ from: "src/engine/Converter.java", to: "src/llm/SubstService.java" }],
  })
  const s = r.steps[0]
  assert.equal(s.candidates[0].path, "src/llm/SubstService.java")
  assert.equal(s.candidates[0].score, 2)
  const runner = s.candidates.find((c) => c.score === 1 && c.via)
  assert.ok(runner, "фикстура не строит зазор-1-via — проверка ничего не различает")
  assert.equal(s.disputed, true, "зазор 1 при via-втором не признан спором")
})

test("T62: частые слова умирают сами — фильтр по карте, не ручной список", () => {
  // «endpoint» живёт во всех четырёх ops-модулях — редким не бывает и никого не выбирает
  const r = candidatesOf({ frd: { usecases: [{ id: "U", steps: ["call the endpoint"] }] }, map: MAP, edges: EDGES })
  assert.deepEqual(r.steps[0].candidates.map((c) => c.path).filter((p) => p.startsWith("src/ops")), [],
    "общее слово выбрало шумовых кандидатов — фильтр частоты не работает")
})

test("T62: функция аналога — ТОП-1 кандидат шага; шум отсечён", () => {
  const r = candidatesOf({ frd: FRD, map: MAP, edges: EDGES, analogueFiles: [...MAP.nodes] })
  const paths = r.analogueFunctions.map((f) => f.path)
  // сильнейшая связь шага с картой — наследуется или объясняется; конвертер (скор 1 по ребру)
  // не топ-1 — его случай держит спорность UC7/1 и вопрос оператору, а не F17d (приёмка 25.08:
  // «по роли» и полный список кандидатов делали суд незакрываемым — дюжина файлов на шаг)
  assert.ok(paths.includes("src/llm/PromptSnippetService.java"), "топ-1 кандидат подстановки потерялся")
  assert.ok(!paths.includes("src/engine/MemoryItemConverter.java"), "слабый кандидат (по ребру) в F17d — суд незакрываем")
  for (const f of r.analogueFunctions) {
    assert.ok(r.steps.some((s) => s.candidates.length && s.candidates[0].path === f.path), `${f.path} не топ-1 ни одного шага`)
  }
})

test("T62: SILENCE — пустые входы дают пустую таблицу, не бросок", () => {
  assert.deepEqual(candidatesOf(), { steps: [], analogueFunctions: [] })
  assert.deepEqual(candidatesOf({ frd: { usecases: [{ id: "U", steps: [] }] }, map: { nodes: new Set(), roles: new Map() } }).steps, [])
})
