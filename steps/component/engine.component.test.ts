// COMPONENT TEST движка solo — мок-роли (события напрямую в fold), tmp-cwd + tmp-git.
// Швы: зелёный путь plan→critic→questions→confirm→execute→done (ответы ВОПИСАНЫ в план) ·
// красный план → круг · пустой ответ на вопросы → ПЕРЕСПРОС · checkpoint reject → причина в план ·
// escalate по бюджету.
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { soloStart, soloNext, soloFold } from "../../ext/engine.ts"

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
### Сценарий 1
- До: нет поиска.
- После: поиск есть.

## 4. ВЕЛИЧИНЫ
| Величина | Значение | Источник |
|---|---|---|
| путь | /search | TASK: «поиск» |

## 5. ГАРАНТИИ
1. Не трогаем \`src/Legacy.java\`.

## 6. ОТКРЫТЫЕ ВОПРОСЫ
| Вопрос | Рекомендация |
|---|---|
| Лимит по умолчанию? | 20 |
`

const stand = () => {
  const cwd = mkdtempSync(join(tmpdir(), "solo-engine-"))
  mkdirSync(join(cwd, "src"), { recursive: true })
  mkdirSync(join(cwd, ".agent/staging"), { recursive: true })
  writeFileSync(join(cwd, "TASK.md"), TASK)
  writeFileSync(join(cwd, "src/App.java"), "class App {}\n")
  writeFileSync(join(cwd, "src/Legacy.java"), "class Legacy {}\n")
  try { execSync("git init -q", { cwd, encoding: "utf8" }) } catch {}
  return cwd
}

const step = async (state: any, result: any) => {
  const it = await soloNext({ state })
  if (it.do === "err" || it.do === "done") return { it, state }
  const folded = await soloFold({ state, event: { do: it.do, instruction: it, result } })
  return { it, state: folded.track === "err" ? null : folded.value, folded }
}

test("зелёный путь: план→критик→ВОПРОСЫ ВПИСАНЫ→checkpoint Approve→execute→done", async () => {
  const cwd = stand()
  try {
    const start: any = soloStart({}, { run: { cwd } })
    assert.ok(start.track === "ok")

    // plan: роль написала план
    writeFileSync(join(cwd, ".agent/staging/PLAN~draft.md"), PLAN)
    let r = await step(start.state, { track: "ok", artifact: ".agent/staging/PLAN~draft.md" })
    assert.equal(r.state.phase, "critic", "судья не пропустил план в критика")

    // critic: APPROVE → план продвинут, открыт вопрос → фаза questions + ask
    r = await step(r.state, { track: "ok", verdict: "APPROVE" })
    assert.equal(r.state.phase, "questions")
    assert.ok(existsSync(join(cwd, ".agent/PLAN.md")), "PLAN.md не продвинут после APPROVE")
    assert.ok(r.state.question?.items[0].includes("Лимит по умолчанию"))

    // ask: оператор ответил (answers.md уже записан ask-функцией)
    writeFileSync(join(cwd, ".agent/answers.md"),
      "<exchange>\n  <question_1>Лимит по умолчанию?</question_1>\n  <answer_1>30</answer_1>\n</exchange>\n")
    r = await step(r.state, ["30"])
    assert.equal(r.state.phase, "confirm")
    assert.match(readFileSync(join(cwd, ".agent/PLAN.md"), "utf8"), /Лимит по умолчанию\? → РЕШЕНО: 30/, "ответ не вписан в план")

    // confirm: карточка (say) → checkpoint Approve → execute
    const card = await soloNext({ state: r.state })
    assert.equal(card.do, "say")
    assert.match(card.line, /ПЛАН ГОТОВ/)
    const afterCard: any = await soloFold({ state: r.state, event: { do: "say", instruction: card, result: null } })
    r = await step(afterCard.value, "approved")
    assert.equal(r.state.phase, "execute")
    assert.ok(r.state.solveStart !== undefined)

    // execute: dev сделал (коммит Ф1) → судьи зелёные → done-карточка → done
    writeFileSync(join(cwd, "src/App.java"), "class App { void search() {} }\n")
    try { execSync("git add -A && git commit -q -m 'Ф1: search'", { cwd, encoding: "utf8" }) } catch {}
    r = await step(r.state, { track: "ok", artifact: ".agent/PLAN.md" })
    assert.equal(r.state.phase, "done")
    const doneSay = await soloNext({ state: r.state })
    assert.equal(doneSay.do, "say")
    assert.match(doneSay.line, /РАЗРАБОТКА ЗАВЕРШЕНА/)
    const afterDone: any = await soloFold({ state: r.state, event: { do: "say", instruction: doneSay, result: null } })
    const fin = await soloNext({ state: afterDone.value })
    assert.equal(fin.do, "done")
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test("красный план → круг починки; пустой ответ → ПЕРЕСПРОС (не отвержение); reject → причина в план", async () => {
  const cwd = stand()
  try {
    const start: any = soloStart({}, { run: { cwd } })
    writeFileSync(join(cwd, ".agent/staging/PLAN~draft.md"), PLAN.replace("## 5. ГАРАНТИИ", "## 5. Прочее"))
    let r = await step(start.state, { track: "ok", artifact: ".agent/staging/PLAN~draft.md" })
    assert.equal(r.state.phase, "plan")
    assert.equal(r.state.round, 2)
    assert.match(r.state.blockers, /ГАРАНТИИ/)

    // до вопросов: пустой ответ → retry, не отвержение
    writeFileSync(join(cwd, ".agent/staging/PLAN~draft.md"), PLAN)
    r = await step(r.state, { track: "ok", artifact: ".agent/staging/PLAN~draft.md" })
    r = await step(r.state, { track: "ok", verdict: "APPROVE" })
    assert.equal(r.state.phase, "questions")
    const empty = await step(r.state, [""])
    assert.equal(empty.state.question.name.includes("-retry1"), true, "пустой ответ не переспросил")
    assert.equal(empty.state.phase, "questions", "пустой ответ отверг план")

    // reject словами: причина сразу уезжает в круг plan (без отдельного вопроса-причины)
    writeFileSync(join(cwd, ".agent/answers.md"), "<exchange>\n  <question_1>Лимит по умолчанию?</question_1>\n  <answer_1>30</answer_1>\n</exchange>\n")
    let q = await step(empty.state, ["30"])
    assert.equal(q.state.phase, "confirm")
    const card = await soloNext({ state: q.state })
    const afterCard: any = await soloFold({ state: q.state, event: { do: "say", instruction: card, result: null } })
    q = await step(afterCard.value, ["нет: добавь лимит потолка"])
    assert.equal(q.state.phase, "plan", "отклонение словами не вернуло в plan")
    assert.match(q.state.blockers, /лимит потолка/, "причина отклонения не дошла до планировщика")
    const back = q

    // бюджет: round > loops → escalate
    const esc: any = await soloNext({ state: { ...back.state, round: 99 } })
    assert.equal(esc.do, "err")
    assert.equal(esc.kind, "escalate")
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

// T81 — ПОДТВЕРЖДЕНИЕ СЛОВАМИ и RESUME. Швы: «да»/«да, …» подтверждают, «нет: …» уводит
// в круг plan; перезапуск после остановки продолжает с маркера (ответы применяются).
test("confirm словами: «да, ведём» → execute; «нет: причина» → круг plan", async () => {
  const cwd = stand()
  try {
    const start: any = soloStart({}, { run: { cwd } })
    writeFileSync(join(cwd, ".agent/staging/PLAN~draft.md"), PLAN)
    let r = await step(start.state, { track: "ok", artifact: ".agent/staging/PLAN~draft.md" })
    r = await step(r.state, { track: "ok", verdict: "APPROVE" })
    writeFileSync(join(cwd, ".agent/answers.md"), "<exchange>\n  <question_1>Лимит по умолчанию?</question_1>\n  <answer_1>30</answer_1>\n</exchange>\n")
    r = await step(r.state, ["30"])
    assert.equal(r.state.phase, "confirm")
    const card = await soloNext({ state: r.state })
    const afterCard: any = await soloFold({ state: r.state, event: { do: "say", instruction: card, result: null } })
    const ask = await soloNext({ state: afterCard.value })
    assert.equal(ask.do, "ask", "подтверждение не стало ask-вопросом")
    const yes: any = await soloFold({ state: afterCard.value, event: { do: "ask", instruction: ask, result: ["да, ведём"] } })
    assert.equal(yes.value.phase, "execute", "«да, ведём» не подтвердило")
    const no: any = await soloFold({ state: afterCard.value, event: { do: "ask", instruction: ask, result: ["нет: нет лимита"] } })
    assert.equal(no.value.phase, "plan")
    assert.match(no.value.blockers, /нет лимита/)
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test("resume: маркер фазы — новый soloStart продолжает, ответы применяются к плану", async () => {
  const cwd = stand()
  try {
    const start: any = soloStart({}, { run: { cwd } })
    writeFileSync(join(cwd, ".agent/staging/PLAN~draft.md"), PLAN)
    let r = await step(start.state, { track: "ok", artifact: ".agent/staging/PLAN~draft.md" })
    r = await step(r.state, { track: "ok", verdict: "APPROVE" })
    writeFileSync(join(cwd, ".agent/answers.md"), "<exchange>\n  <question_1>Лимит по умолчанию?</question_1>\n  <answer_1>30</answer_1>\n</exchange>\n")
    // «прогон умер» здесь; маркер на диске говорит questions; ответы пришли
    const again: any = soloStart({}, { run: { cwd } })
    assert.equal(again.from, "resumed", "прогон начался заново вместо продолжения")
    assert.equal(again.state.phase, "questions")
    const it = await soloNext({ state: again.state })
    assert.equal(it.do, "say", "resume не применил ответы")
    assert.match(readFileSync(join(cwd, ".agent/PLAN.md"), "utf8"), /→ РЕШЕНО: 30/, "ответ не вписан при resume")
    const afterSay: any = await soloFold({ state: again.state, event: { do: "say", instruction: it, result: null } })
    const card = await soloNext({ state: { ...afterSay.value, phase: "confirm", cardShown: false } })
    assert.match(card.line ?? "", /ПЛАН ГОТОВ|confirm/)
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})
