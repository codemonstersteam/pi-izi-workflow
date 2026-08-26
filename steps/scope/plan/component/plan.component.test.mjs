// COMPONENT TEST подшага 3A — план клеток на мини-репозитории, привод next/fold как у полосы.
// Формула (standards/workflow-design.md): шаг С РОЛЬЮ — 3, БЕЗ РОЛИ — 2: успех · нарушение.
// Заглушки ПОДШАГА нет — модели у него нет; «нарушение» здесь — мусор в событии say: суд обязан
// отказаться С ИМЕНЕМ, и ни один артефакт не ложится (CLAUDE.md, ограничение 2).
import test from "node:test"
import assert from "node:assert/strict"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { tmpdir } from "node:os"
import { start, put, sha1of } from "../../../../ext/state.mjs"
import { next, fold } from "../plan.step.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const FIX = join(HERE, "../../fixture")

// подготовка формы прогона: копия мини-репозитория + входы .agent + штамп шага 2
function form() {
  const cwd = mkdtempSync(join(tmpdir(), "scope-plan-"))
  cpSync(join(FIX, "mini"), cwd, { recursive: true })
  mkdirSync(join(cwd, ".agent"), { recursive: true })
  cpSync(join(FIX, "agent"), join(cwd, ".agent"), { recursive: true })
  const s = start({ cwd, run: "component-plan", key: "FIX-1", budgets: {} })
  assert.ok(s.ok, s.error?.detail)
  const brd = readFileSync(join(cwd, ".agent/brd.md"), "utf8")
  const st = put(s.value, { at: { brd: { path: ".agent/brd.md", sha1: sha1of(brd) } } })
  assert.ok(st.ok, st.error?.detail)
  return st.value
}

test("успех: дерево → survey-plan.json + graph-computed.xml, штампы легли, второй next — done", () => {
  const state = form()
  const it = next(state)
  assert.equal(it.do, "say", `первым ходом подшаг объявляет состав: ${JSON.stringify(it).slice(0, 120)}`)
  assert.match(it.line, /клеток/)

  const folded = fold(state, { do: "say", instruction: it, result: null })
  assert.ok(folded.ok, folded.error?.detail)

  const plan = JSON.parse(readFileSync(join(state.cwd, ".agent/survey-plan.json"), "utf8"))
  const ids = plan.cells.map((c) => c.id)
  assert.ok(ids.includes("spine"), "клетка-хребет на месте: pom.xml и README попадают в неё")
  const paths = plan.cells.flatMap((c) => c.files.map((f) => f.path)).sort()
  assert.deepEqual(paths, ["README.md", "pom.xml", "src/main/java/demo/Fruit.java",
    "src/main/java/demo/FruitResource.java", "src/test/java/demo/FruitResourceTest.java"],
    "клетки покрывают все пять файлов без потерь")
  assert.ok(existsSync(join(state.cwd, ".agent/graph-computed.xml")), "computed-факт скрипта на диске")

  assert.equal(folded.value.at.plan.path, ".agent/survey-plan.json")
  assert.equal(folded.value.at.plan.sha1, sha1of(readFileSync(join(state.cwd, ".agent/survey-plan.json"), "utf8")),
    "штамп — отпечаток ТОГО, что легло на диск")
  assert.equal(next(folded.value).do, "done", "закрытый подшаг на втором ходе говорит done")
})

test("нарушение: мусор в событии — named-отказ PL1, ни один артефакт не лёг", () => {
  const state = form()
  const it = next(state)
  const broken = fold(state, { do: "say", instruction: { ...it, plan: { cells: [], subjects: [], gaps: [] } }, result: null })
  assert.ok(!broken.ok, "пустой план — это дефект резки, а не успех")
  assert.match(broken.error.detail, /PL1/, "отказ называет правило по имени")
  assert.ok(!existsSync(join(state.cwd, ".agent/survey-plan.json")), "отбитый план не лёг на диск")
  assert.ok(!existsSync(join(state.cwd, ".agent/graph-computed.xml")), "и computed-факт за ним тоже")
})
