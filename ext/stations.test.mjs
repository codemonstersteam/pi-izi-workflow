// COMPONENT TEST движка станций solo — мок-роли (события напрямую в fold), tmp-cwd.
// Швы: зелёный путь до done · красный draft (нет раздела) → круг починки ·
// blocked-конверт → вопрос · reject оператора → круг draft.
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { soloStart, soloNext, soloFold } from "./stations.mjs"

const TASK = "task: SOLO-1\n\nНужен поиск по части имени. Существующие вызовы ломать нельзя.\n"

const PLAN = `# План

## 1. ТРЕБОВАНИЯ
| № | Цитата | Где закрыто |
|---|---|---|
| Т1 | «Нужен поиск по части имени» | Ф1 |
| Т2 | «Существующие вызовы ломать нельзя» | Ф1 |

## 2. ИЗМЕНЕНИЯ
| № | Файл | A/C | Контракт | Требование |
|---|---|---|---|---|
| Ф1 | src/App.java | Changed | новый метод search | Т1, Т2 |

## 3. СЦЕНАРИИ
### С1
- До: нет поиска.
- После: поиск есть.

## 4. ВЕЛИЧИНЫ
| Величина | Значение | Источник |
|---|---|---|
| путь | /search | TASK: «поиск» |

## 5. ГАРАНТИИ
1. Не трогаем \`src/Legacy.java\`.

## 6. ОТКРЫТЫЕ ВОПРОСЫ
1. Лимит? Предлагаю 20.
`

const stand = () => {
  const cwd = mkdtempSync(join(tmpdir(), "solo-stations-"))
  mkdirSync(join(cwd, "src"), { recursive: true })
  mkdirSync(join(cwd, ".agent/staging"), { recursive: true })
  writeFileSync(join(cwd, "TASK.md"), TASK)
  writeFileSync(join(cwd, "src/App.java"), "class App {}\n")
  writeFileSync(join(cwd, "src/Legacy.java"), "class Legacy {}\n")
  const g = (c) => execSync(c, { cwd, encoding: "utf8" })
  try { g("git init -q") } catch { /* судьи solve переживут пустой git */ }
  return cwd
}

const run = (state, steps) => {
  // steps: [{do, result}] — прогон next/fold по кругу; возвращает состояние после всех
  let s = state
  for (const st of steps) {
    const it = soloNext({ state: s })
    if (it.do === "err" || it.do === "done") return { it, s }
    const folded = soloFold({ state: s, event: { do: st.do ?? it.do, instruction: it, result: st.result } })
    if (folded.track === "err") return { it: { do: "err", ...folded }, s }
    s = folded.value
  }
  return { it: soloNext({ state: s }), s }
}

test("зелёный путь: draft→critic→approve(да)→solve→done; PLAN.md продвинут", () => {
  const cwd = stand()
  try {
    const start = soloStart({}, { run: { cwd } })
    assert.ok(start.track === "ok", start.subject)
    // draft: роль «написала» план
    writeFileSync(join(cwd, ".agent/staging/PLAN~draft.md"), PLAN)
    let r = run(start.state, [{ do: "role", result: { track: "ok", artifact: ".agent/staging/PLAN~draft.md" } }])
    assert.equal(r.s.station, "critic", "draft зелёный не вёл в критика")
    // critic: APPROVE
    r = run(r.s, [{ do: "role", result: { track: "ok", verdict: "APPROVE" } }])
    assert.equal(r.s.station, "approve")
    // approve: СНАЧАЛА карточка презентации (say), потом ask
    const card = soloNext({ state: r.s })
    assert.equal(card.do, "say", "карточка презентации не напечатана")
    assert.match(card.line, /ПЛАН ГОТОВ/)
    assert.match(card.line, /Синтез: \d+ требований/)
    assert.match(card.line, /\.agent\/PLAN\.md/)
    const afterCard = soloFold({ state: r.s, event: { do: "say", instruction: card, result: null } })
    assert.ok(afterCard.track === "ok")
    // approve: ask да → promote + solve
    const approveOrder = soloNext({ state: afterCard.value })
    assert.equal(approveOrder.do, "ask")
    writeFileSync(join(cwd, ".agent/answers.md"), "<exchange>\n  <question_1>Согласен?</question_1>\n  <answer_1>да, ведём</answer_1>\n</exchange>\n")
    const f = soloFold({ state: afterCard.value, event: { do: "ask", instruction: approveOrder, result: ["да, ведём"] } })
    assert.ok(f.track === "ok" && f.value.station === "solve", "approve не перевёл в solve")
    assert.ok(existsSync(join(cwd, ".agent/PLAN.md")), "PLAN.md не продвинут")
    // solve: dev «сделал» — коммит с Ф1
    writeFileSync(join(cwd, "src/App.java"), "class App { void search() {} }\n")
    execSync("git add -A && git commit -q -m 'Ф1: search'", { cwd, encoding: "utf8" })
    const done = run(f.value, [{ do: "role", result: { track: "ok", artifact: ".agent/PLAN.md" } }])
    assert.equal(done.it.do, "done", `solve не завершился: ${JSON.stringify(done.it).slice(0, 120)}`)
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test("красный draft (нет ГАРАНТИЙ) → круг починки с блокером в FEEDBACK", () => {
  const cwd = stand()
  try {
    const start = soloStart({}, { run: { cwd } })
    writeFileSync(join(cwd, ".agent/staging/PLAN~draft.md"), PLAN.replace("## 5. ГАРАНТИИ", "## 5. Прочее"))
    const r = run(start.state, [{ do: "role", result: { track: "ok", artifact: ".agent/staging/PLAN~draft.md" } }])
    assert.equal(r.s.station, "draft", "красный план ушёл дальше станции draft")
    assert.equal(r.s.round, 2, "круг починки не выдан")
    assert.match(r.s.blockers, /ГАРАНТИИ/)
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test("blocked-конверт роли → вопрос оператору; обрыв круг НЕ тратит", () => {
  const cwd = stand()
  try {
    const start = soloStart({}, { run: { cwd } })
    let r = run(start.state, [{ do: "role", result: { track: "err", kind: "crashed", subject: "связь" } }])
    assert.equal(r.s.round, 1, "обрыв потратил круг")
    r = run(start.state, [{ do: "role", result: { track: "err", kind: "blocked", subject: "какой лимит?" } }])
    const it = soloNext({ state: r.s })
    assert.equal(it.do, "ask", "blocked не стал вопросом")
    assert.match(it.items[0], /лимит/)
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test("reject оператора → круг draft с причиной; escalate по бюджету", () => {
  const cwd = stand()
  try {
    const start = soloStart({}, { run: { cwd } })
    writeFileSync(join(cwd, ".agent/staging/PLAN~draft.md"), PLAN)
    let r = run(start.state, [{ do: "role", result: { track: "ok", artifact: ".agent/staging/PLAN~draft.md" } }])
    r = run(r.s, [{ do: "role", result: { track: "ok", verdict: "APPROVE" } }])
    const order = soloNext({ state: r.s })
    const f = soloFold({ state: r.s, event: { do: "ask", instruction: order, result: ["нет: нет лимита"] } })
    assert.ok(f.track === "ok" && f.value.station === "draft", "reject не вернул в draft")
    assert.match(f.value.blockers, /нет лимита/)
    // бюджет: station round > loops → escalate
    const esc = soloNext({ state: { ...f.value, round: 99 } })
    assert.equal(esc.do, "err")
    assert.equal(esc.kind, "escalate")
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})
