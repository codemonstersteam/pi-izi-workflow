// Units of the traceability matrix core. By the formula of standards/code.md:
//     N = 1 happy path + Σ antecedent branches with a DISTINGUISHABLE consequent + 1 silence
//
// Каждый юнит — живой дефект прогона eddi 25.08, переведённый в классику: двусторонняя
// трассируемость (IEEE 29148) ловит его механикой, а не патчем.
import test from "node:test"
import assert from "node:assert/strict"
import { parseToken, parseRtm, modulesOf, rtmJudge } from "./rtm.mjs"

const REQS = ["R1", "R2", "R3", "R4"]
const BP = new Map([
  ["src/snippets/rest/RestSnippetStore.java", { package: ["src/snippets/IPromptStore.java", "src/snippets/IRestStore.java", "src/snippets/model/Snippet.java"], callers: [] }],
  ["src/llm/SnippetService.java", { package: ["src/snippets/model/Snippet.java"], callers: ["src/engine/Converter.java"] }],
  ["src/backup/RestImportService.java", { package: ["src/backup/IResourceSource.java", "src/backup/ZipSource.java", "src/backup/Matcher.java"], callers: [] }],
])

test("parse: строка требования с размерностями и токенами разбирается без потерь", () => {
  const rtm = parseRtm([
    "R1 | scenarios: UC1, UC2 | owners: src/A.java, src/B.java(new, after=src/C.java) | contracts: src/A.java:Changed",
  ].join("\n"))
  assert.equal(rtm.rows.length, 1)
  assert.deepEqual(rtm.rows[0].dims.scenarios.map((t) => t.path), ["UC1", "UC2"])
  const b = rtm.rows[0].dims.owners[1]
  assert.equal(b.path, "src/B.java")
  assert.equal(b.flags.has("new"), true)
  assert.equal(b.kv.after, "src/C.java")
  const mods = modulesOf(rtm)
  assert.equal(mods.get("src/A.java").reqs.has("R1"), true)
  assert.equal(mods.get("src/B.java").news, true)
})

test("forward: требование без владельца и без вопроса — блокер; с вопросом — зелёное", () => {
  const rtm = parseRtm("R1 | owners: src/A.java\nR2 | questions: где-хранить")
  const b = rtmJudge({ rtm, requirements: REQS })
  assert.ok(b.some((x) => x.startsWith("rtm:forward R3")), "пустая строка прошла молча")
  assert.ok(!b.some((x) => x.includes("R1")), "строка с владельцем обвинена")
  assert.ok(!b.some((x) => x.includes("R2")), "строка с вопросом обвинена")
})

test("backward-зеркало: новый модуль обязан отзеркалить каталоги пакета образца", () => {
  // живой корень: квинтета недособрана — model/интерфейсы без владельцев
  const partial = parseRtm("R1 | owners: src/glossary/rest/RestGlossary.java(new, after=src/snippets/rest/RestSnippetStore.java)")
  const b1 = rtmJudge({ rtm: partial, requirements: REQS, blueprint: BP })
  assert.ok(b1.some((x) => x.startsWith("rtm:backward-зеркало")), "незеркаленный слой прошел молча")
  const full = parseRtm([
    "R1 | owners: src/glossary/rest/RestGlossary.java(new, after=src/snippets/rest/RestSnippetStore.java), src/glossary/IPrompt.java(new), src/glossary/IRestG.java(new), src/glossary/model/Sn.java(new)",
  ].join("\n"))
  const b2 = rtmJudge({ rtm: full, requirements: REQS, blueprint: BP })
  assert.ok(!b2.some((x) => x.startsWith("rtm:backward-зеркало")), `зеркало собрано, а блокер остался: ${b2.join("; ")}`)
})

test("backward-вызов: новый сервис без звонящего образца — мёртвый код, блокер", () => {
  // живой корень: GlossaryService есть, Converter не владелец — подстановка никогда не вызовется
  const dead = parseRtm("R2 | owners: src/llm/GlossaryService.java(new, after=src/llm/SnippetService.java)")
  const b = rtmJudge({ rtm: dead, requirements: REQS, blueprint: BP })
  assert.ok(b.some((x) => x.startsWith("rtm:backward-вызов") && x.includes("Converter")), "мёртвый сервис прошел молча")
  const wired = parseRtm("R2 | owners: src/llm/GlossaryService.java(new, after=src/llm/SnippetService.java), src/engine/Converter.java")
  const b2 = rtmJudge({ rtm: wired, requirements: REQS, blueprint: BP })
  assert.ok(!b2.some((x) => x.startsWith("rtm:backward-вызов")), "звонящий назначен, а блокер остался")
})

test("backward-кластер: существующий владелец из ядра делит строку с соседями или вопросом", () => {
  // живой корень: синк-четвёрка (IResourceSource, Zip, Matcher) не доехала
  const solo = parseRtm("R4 | owners: src/backup/RestImportService.java")
  const b = rtmJudge({ rtm: solo, requirements: REQS, blueprint: BP })
  assert.ok(b.some((x) => x.startsWith("rtm:backward-кластер") && x.includes("IResourceSource")), "кластер прошел молча")
  const asked = parseRtm("R4 | owners: src/backup/RestImportService.java | questions: src/backup/RemoteApiSource.java")
  const b2 = rtmJudge({ rtm: asked, requirements: REQS, blueprint: BP })
  assert.ok(!b2.some((x) => x.includes("RemoteApiSource")), "вопрос не прикрыл соседа")
  assert.ok(b2.some((x) => x.includes("IResourceSource")), "спрошен один сосед, второй потерялся")
})

test("backward-ответ: узел, названный оператором, — владелец; аналог не считается", () => {
  // живой корень: ответ называл AgentConfiguration — модель назначила только RestAgentStore
  const answers = "Привязка: RestAgentStore, поле glossaries в AgentConfiguration."
  const nodes = ["src/agents/AgentConfiguration.java", "src/llm/SnippetService.java"]
  const analogueFiles = new Set(["src/llm/SnippetService.java"])
  const rtm = parseRtm("R5 | owners: src/agents/RestAgentStore.java")
  const b = rtmJudge({ rtm, requirements: ["R5"], answers, nodes, analogueFiles })
  assert.ok(b.some((x) => x.includes("AgentConfiguration")), "узел из ответа потерялся молча")
  assert.ok(!b.some((x) => x.includes("SnippetService")), "аналог из ответа ошибочно потребован")
})

test("SILENCE: пустая матрица на пустых входах — пустой вердикт, не бросок", () => {
  assert.deepEqual(rtmJudge(), [])
  assert.deepEqual(parseRtm(""), { rows: [] })
  assert.deepEqual(parseToken(""), { path: "", flags: new Set(), kv: {} })
})

// V2-FIX: exemption для R-свойств (define/set/name/constrain) — живой круг 26.08: R15
// «define | template data model key | glossary» зациклил coverage (модель не может назначить
// владельца имени ключа). Свойство — не функция, ни один шаг UC его «несёт».
test("forward: R-свойство (define/set/name) не требует владельца; R-функция — требует", () => {
  const stmts = [
    { id: "R15", statement: "define | template data model key | glossary | glossary, Qute syntax" },
    { id: "R1", statement: "add | configuration type | Glossary | dictionary of bot terms" },
    { id: "R7", statement: "set | value | length | unlimited" },
  ]
  const rtm = parseRtm("")   // пустая матрица: ни у кого нет владельца
  const b = rtmJudge({ rtm, requirements: ["R1", "R7", "R15"], requirementStatements: stmts })
  assert.ok(b.some((x) => x.includes("rtm:forward R1")), "R-функция без владельца прошла молча")
  assert.ok(!b.some((x) => x.includes("R15")), "R-свойство (define) зря потребован — зацикливание")
  assert.ok(!b.some((x) => x.includes("R7")), "R-свойство (set) зря потребован")
})

test("backward-кластер: дедуп по файлу соседа — один StructuralMatcher = один блокер на R, не четыре", () => {
  // живой круг 26.08: R1 имел 4 владельцев (RestExport, RestImport, Upgrade, RemoteApi),
  // каждый «видел» StructuralMatcher как соседа ядра → 4 блокера вместо 1, 45 не сходились к 0
  const BP = new Map([
    ["src/backup/RestExport.java", { package: ["src/backup/StructuralMatcher.java", "src/backup/Zip.java"] }],
    ["src/backup/RestImport.java", { package: ["src/backup/StructuralMatcher.java", "src/backup/Zip.java"] }],
    ["src/backup/Upgrade.java", { package: ["src/backup/StructuralMatcher.java"] }],
    ["src/backup/RemoteApi.java", { package: ["src/backup/StructuralMatcher.java", "src/backup/Zip.java"] }],
  ])
  const rtm = parseRtm("R1 | owners: src/backup/RestExport.java, src/backup/RestImport.java, src/backup/Upgrade.java, src/backup/RemoteApi.java")
  const b = rtmJudge({ rtm, requirements: ["R1"], blueprint: BP })
  const cluster = b.filter((x) => x.startsWith("rtm:backward-кластер"))
  assert.equal(cluster.length, 1, `кластерных блокеров ${cluster.length}, а должен быть 1 (дедуп по файлу)`)
  assert.match(cluster[0], /StructuralMatcher.*Zip/, "блокер называет обоих соседей одним списком")
})

// T68-3 — ПРОВОДНИК = звонящий из ДРУГОГО пакета. CounterweightService в том же каталоге
// (modules/llm/impl/) — сосед, не проводник. MemoryItemConverter в engine/memory/ —
// проводник. Прежнее «хоть один звонящий» удовлетворялось соседом → подстановка мёртвым кодом.
test("b2: проводник = звонящий из ДРУГОГО каталога; сосед не считается", () => {
  const BP = new Map([
    ["src/llm/SnippetService.java", { package: [], callers: ["src/engine/Converter.java", "src/llm/Counterweight.java"] }],
  ])
  // сосед без проводника — блокер
  const onlyNeighbor = parseRtm("R1 | owners: src/llm/GlossaryService.java(new, after=src/llm/SnippetService.java), src/llm/Counterweight.java")
  const b1 = rtmJudge({ rtm: onlyNeighbor, requirements: ["R1"], blueprint: BP })
  assert.ok(b1.some((x) => x.startsWith("rtm:backward-вызов") && x.includes("Converter")), `сосед закрыл проводника: ${b1.filter(x=>x.includes("вызов")).join("; ")}`)

  // проводник назначен — зелёный
  const wired = parseRtm("R1 | owners: src/llm/GlossaryService.java(new, after=src/llm/SnippetService.java), src/engine/Converter.java")
  const b2 = rtmJudge({ rtm: wired, requirements: ["R1"], blueprint: BP })
  assert.ok(!b2.some((x) => x.startsWith("rtm:backward-вызов")), `проводник назначен, а блокер остался: ${b2.filter(x=>x.includes("вызов")).join("; ")}`)

  // все звонящие в том же каталоге — правило молчит (нет проводника, не судим)
  const samePkg = new Map([
    ["src/llm/SnippetService.java", { package: [], callers: ["src/llm/Counterweight.java"] }],
  ])
  const b3 = rtmJudge({ rtm: parseRtm("R1 | owners: src/llm/GlossaryService.java(new, after=src/llm/SnippetService.java)"), requirements: ["R1"], blueprint: samePkg })
  assert.ok(!b3.some((x) => x.startsWith("rtm:backward-вызов")), "все звонящие в том же каталоге — b2 обязан молчать")
})
