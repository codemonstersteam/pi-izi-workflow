// СБОРЩИК КАТАЛОГА РУЧНОЙ ПРИЁМКИ подшагов шага 3 на мини-репозитории.
// Готовит временную форму из fixture/mini, прогоняет НАСТОЯЩИЕ головы scope/plan и scope/focus
// (нуль токенов), собирает наряды скаутов настоящим order.mjs и кладёт их в in/.
// Если ответов модели нет — печатает команду bin/ask.mjs; каталог приёмки собирается КОДОМ
// подшага, а не руками (инвариант 1-normalize/build.mjs).
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { tmpdir } from "node:os"
import { start, put, sha1of } from "../../../../ext/state.mjs"
import { next as planNext, fold as planFold } from "../../plan/plan.step.mjs"
import { next as focusNext, fold as focusFold } from "../../focus/focus.step.mjs"
import { orderText } from "../order.mjs"
import { cellsOf } from "../cut.mjs"
import { FOCUS } from "../../paths.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))

// форма прогона: копия мини-репозитория + входы .agent из fixture/agent
const cwd = mkdtempSync(join(tmpdir(), "scope-parts-"))
cpSync(join(HERE, "../../fixture/mini"), cwd, { recursive: true })
mkdirSync(join(cwd, ".agent"), { recursive: true })
cpSync(join(HERE, "../../fixture/agent"), join(cwd, ".agent"), { recursive: true })

// состояние: старт + штамп шага 2 (brd.md по отпечатку — как его оставил бы настоящий шаг)
const s0 = start({ cwd, run: "component-build", key: "FIX-1", budgets: {} })
if (!s0.ok) { console.error(s0.error.detail); process.exit(1) }
const brdText = readFileSync(join(cwd, ".agent/brd.md"), "utf8")
const st = await put(s0.value, { at: { brd: { path: ".agent/brd.md", sha1: sha1of(brdText) } } })
if (!st.ok) { console.error(st.error.detail); process.exit(1) }

// прогон настоящих голов 3A и 3Б — они же проверяются компонентными своими, здесь дают вход 3В
const drive = async (mod, state) => {
  const it = mod.next(state)
  if (it.do === "err") { console.error(it.subject); process.exit(1) }
  const folded = mod.fold(state, { do: it.do, instruction: it, result: null })
  if (!folded.ok) { console.error(folded.error.detail); process.exit(1) }
  return folded.value
}
let state = await drive({ next: planNext, fold: planFold }, st.value)
state = await drive({ next: focusNext, fold: focusFold }, state)

const focus = JSON.parse(readFileSync(join(cwd, FOCUS), "utf8"))
const cells = cellsOf({ cwd }, focus.cells)
mkdirSync(join(HERE, "in"), { recursive: true })
for (const cell of cells) {
  const o = orderText({ cwd }, cell, {})
  if (o.why) { console.error(o.why); process.exit(1) }
  writeFileSync(join(HERE, "in", `order.${cell.id === "spine" ? "spine" : cell.id}.md`), o.text)
}
const missing = cells.filter((c) => !existsSync(join(HERE, `answer-${c.id}.txt`)))
console.log(`клетки: ${cells.map((c) => c.id + "(" + c.kind + ", " + (c.files || []).length + " файлов)").join(" · ")}`)
console.log(`наряды → in/order.*.md (${cells.length} шт)`)
if (missing.length) {
  console.log(`ответов модели нет — сними их, как у brd:`)
  for (const c of missing) {
    const label = c.id === "spine" ? "spine" : c.id
    console.log(`  node bin/ask.mjs steps/scope/parts/scout.md steps/scope/parts/component/in/order.${label}.md steps/scope/parts/component/answer-${c.id}.txt ${label} --case=steps/scope/parts/component --root=steps/scope/fixture/mini`)
  }
  process.exit(2)
}
console.log("ответы на месте — запускай компонентный тест: node --test steps/scope/parts/")
