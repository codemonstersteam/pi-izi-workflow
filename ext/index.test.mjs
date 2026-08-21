// S14 unit seam: every host function (ext/index.mjs) must anchor to context.run.cwd — the
// WORKFLOW RUN's own directory — never to this repository's own location. The live defect (run
// 2e71776f-342c-42e3-b623-d338b2b9c45c) had readText/answers/checkTask/checkBrd/promote/
// setPending/clearPending silently reading and writing THIS repo checkout instead of the
// installed project that launched the run — checkBrd never found staging, three redelegations,
// escalate. Each test below plants content in a temp root that DIFFERS from what actually lives
// in this repo's own TASK.md/.agent/ (this repo's TASK.md is a meeting-room booking spec; every
// temp root here carries something else, e.g. fruit), so a function that falls back to reading
// the repo instead of context.run.cwd fails LOUDLY on wrong content, not by lucky coincidence.
//
// Manually verified as the seam it claims to be (standards/code.md: a test with no seam is a comment):
// reverting `at`/`readIfExists` in ext/index.mjs to the old REPO_ROOT-anchored form turns every
// test below red; restoring the context.run.cwd anchor turns them green again.

import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, readdirSync, existsSync, rmSync, renameSync, utimesSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Compile } from "typebox/compile"
import { readText, answers, checkTask, checkBrd, checkFrd, carried, budgets, orderLine, setPending, clearPending, promote, newRun, focus, cells, buildGraph, graphMap, weight, ripple, plan, review, reviewForm, iziAnswer, gate1, branch, tickets, runlogRead, runlogMark, runlogTicket, runlogPending, planReview, planFix, planRoute, planFeedback, nodeFacts, clearStaged, frdAdopt } from "./index.mjs"
import { KEY_QUESTION } from "../steps/plan/plan.mjs"
// D23: the gate of step 6 — its question is a constant of the ripple slice, and the answer travels in
// the format core/answers.mjs owns.
import { BLIND_STEM, BLIND_TAIL } from "../steps/ripple/ripple.mjs"
import { newExchange } from "../core/answers.mjs"
// D23-11: наряд и правило шага 11 читают ОДНО выражение — тест держит их за одно и то же.
import { parseFrd } from "../steps/intake/frd.mjs"
import { owedItems, unbackedItems, frdIds } from "../steps/review/review.mjs"
import { DEFAULT_BUDGETS, ORDER_CAP_CHARS } from "../core/budgets.mjs"

const tempRoot = () => mkdtempSync(join(tmpdir(), "izi-s14-"))
const ctx = (cwd) => ({ run: { cwd } })

// --- readText -----------------------------------------------------------------------------

test("readText reads TASK.md from context.run.cwd, not this repo's own TASK.md", () => {
  const root = tempRoot()
  writeFileSync(join(root, "TASK.md"), "Короткое требование про фрукты.\n")
  assert.equal(readText.run({ path: "TASK.md" }, ctx(root)), "Короткое требование про фрукты.\n")
})

test("readText: missing file at run root reads as '' — no repo fallback", () => {
  const root = tempRoot()
  assert.equal(readText.run({ path: "nope.md" }, ctx(root)), "")
})

// --- answers --------------------------------------------------------------------------------

test("answers reads .agent/answers.md from context.run.cwd", () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, ".agent", "answers.md"), "<exchange>\n  <question_1>лимит?</question_1>\n  <answer_1>4</answer_1>\n</exchange>\n")
  assert.deepEqual(answers.run({}, ctx(root)), [{ n: 1, question: "лимит?", text: "4" }])
})

test("answers: absent .agent/answers.md at run root is [], even though this repo HAS one", () => {
  const root = tempRoot()
  assert.deepEqual(answers.run({}, ctx(root)), [])
})

// --- checkTask ------------------------------------------------------------------------------

test("checkTask judges the run root's TASK.md, not this repo's", () => {
  const root = tempRoot()
  writeFileSync(join(root, "TASK.md"), "Короткое требование про фрукты.\n")
  assert.equal(checkTask.run({}, ctx(root)).ok, true)
})

test("checkTask: TASK.md missing at run root fails, even though this repo has one", () => {
  const root = tempRoot()
  const r = checkTask.run({}, ctx(root))
  assert.equal(r.ok, false)
})

// --- checkBrd -------------------------------------------------------------------------------

test("checkBrd reads staging AND TASK.md from context.run.cwd", () => {
  const root = tempRoot()
  writeFileSync(join(root, "TASK.md"), "Лимит бронирования не более 20 штук.\n")
  mkdirSync(join(root, ".agent", "staging"), { recursive: true })
  writeFileSync(
    join(root, ".agent", "staging", "brd.md"),
    [
      "R1 Лимит бронирования",
      "   fit: не более 20",
      "   verify: unit test",
      "subjects[]: лимит · бронь · штук",
      "analogue: PromptSnippet\nopen-questions: 0",
      "",
    ].join("\n"),
  )
  const r = checkBrd.run({ path: ".agent/staging/brd.md" }, ctx(root))
  assert.equal(r.ok, true)
  assert.equal(r.requirements, 1)
})

test("checkBrd: staging missing at run root is a blocker, not a silent pass", () => {
  const root = tempRoot()
  const r = checkBrd.run({ path: ".agent/staging/brd.md" }, ctx(root))
  assert.equal(r.ok, false)
  assert.match(r.blockers, /не существует/)
})

// --- setPending / clearPending ----------------------------------------------------------------

test("setPending writes and clearPending removes .agent/pending.json under context.run.cwd", () => {
  const root = tempRoot()
  setPending.run({ subject: "лимит?", evidence: "" }, ctx(root))
  const p = join(root, ".agent", "pending.json")
  assert.equal(existsSync(p), true)
  assert.equal(JSON.parse(readFileSync(p, "utf8")).subject, "лимит?")
  clearPending.run({}, ctx(root))
  assert.equal(existsSync(p), false)
})

// --- promote ----------------------------------------------------------------------------------

test("promote MOVES staging→out under context.run.cwd: accepted content leaves staging behind empty", () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent", "staging"), { recursive: true })
  writeFileSync(join(root, ".agent", "staging", "brd.md"), "R1 ...\n")
  promote.run({ from: ".agent/staging/brd.md", to: ".agent/brd.md" }, ctx(root))
  assert.equal(readFileSync(join(root, ".agent", "brd.md"), "utf8"), "R1 ...\n")
  assert.equal(existsSync(join(root, ".agent", "staging", "brd.md")), false)  // staging holds only what was REJECTED
})

test("promote: missing staging at run root throws, never a silent no-op", () => {
  const root = tempRoot()
  assert.throws(() => promote.run({ from: ".agent/staging/brd.md", to: ".agent/brd.md" }, ctx(root)))
})

// --- newRun -----------------------------------------------------------------------------------
//
// The seam of "an answer belongs to the run whose question it answers". Reintroducing the defect —
// dropping the newRun() call from workflows/izi.js, or making it skip answers.md — turns the
// invented-default test below red: a number nobody uttered in THIS run passes the guardrail.

const EXCHANGE = (q, a) => `<exchange>\n  <question_1>${q}</question_1>\n  <answer_1>${a}</answer_1>\n</exchange>\n`

// A root that looks exactly like the directory an interrupted run leaves behind.
function deadRun(root, { answer = "50", staged = true } = {}) {
  mkdirSync(join(root, ".agent", "staging", "graph-parts"), { recursive: true })
  writeFileSync(join(root, ".agent", "answers.md"), EXCHANGE("предел ответа — 50 (альтернативы 20, 100)?", answer))
  writeFileSync(join(root, ".agent", "pending.json"), JSON.stringify({ subject: "предел?", items: [{ n: 1, text: "предел?" }] }))
  if (staged) writeFileSync(join(root, ".agent", "staging", "graph-parts", "root.xml"), "<part/>\n")
  writeFileSync(join(root, ".agent", "brd.md"), "R1 старый артефакт\n")
  mkdirSync(join(root, ".izi", "parts"), { recursive: true })
  writeFileSync(join(root, ".izi", "parts", "root.json"), "{}\n")
}

test("newRun carries the dead run's answers, question and staging into .agent/prev — and deletes nothing", () => {
  const root = tempRoot()
  deadRun(root)
  const r = newRun.run({}, ctx(root))

  assert.deepEqual(r, { answers: 1, pending: true, staged: 1, dirty: -1, kept: false })   // a temp dir is no git repo: -1, never 0
  assert.deepEqual(answers.run({}, ctx(root)), [])                                   // the new run starts with no answers
  assert.equal(existsSync(join(root, ".agent", "pending.json")), false)
  assert.equal(existsSync(join(root, ".agent", "staging", "graph-parts", "root.xml")), false)

  assert.match(readFileSync(join(root, ".agent", "prev", "answers.md"), "utf8"), /50/)  // evidence, not garbage
  assert.equal(JSON.parse(readFileSync(join(root, ".agent", "prev", "pending.json"), "utf8")).subject, "предел?")
  assert.equal(readFileSync(join(root, ".agent", "prev", "staging", "graph-parts", "root.xml"), "utf8"), "<part/>\n")
})

test("newRun does not touch artifacts or the .izi/parts cache — that cache outlives runs BY DESIGN", () => {
  const root = tempRoot()
  deadRun(root)
  newRun.run({}, ctx(root))
  assert.equal(readFileSync(join(root, ".agent", "brd.md"), "utf8"), "R1 старый артефакт\n")
  assert.equal(existsSync(join(root, ".izi", "parts", "root.json")), true)
})

test("newRun on a clean root: nothing to carry, nothing created", () => {
  const root = tempRoot()
  assert.deepEqual(newRun.run({}, ctx(root)), { answers: 0, pending: false, staged: 0, dirty: -1, kept: false })
  assert.equal(existsSync(join(root, ".agent", "prev")), false)
})

test("newRun twice: .agent/prev holds the PREVIOUS run, not a growing pile", () => {
  const root = tempRoot()
  deadRun(root, { answer: "50" })
  newRun.run({}, ctx(root))
  writeFileSync(join(root, ".agent", "answers.md"), EXCHANGE("предел?", "10"))       // the run that just ended
  const r = newRun.run({}, ctx(root))
  assert.deepEqual(r, { answers: 1, pending: false, staged: 0, dirty: -1, kept: false })
  const prev = readFileSync(join(root, ".agent", "prev", "answers.md"), "utf8")
  assert.match(prev, /10/)
  assert.doesNotMatch(prev, /50/)                                                     // overwritten, not appended
})

test("the defect this closes: a number answered in a DEAD run no longer passes invented-default", () => {
  const root = tempRoot()
  writeFileSync(join(root, "TASK.md"), "Поиск по части имени, существующие вызовы не ломать.\n")   // no numbers at all
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, ".agent", "answers.md"), EXCHANGE("предел ответа?", "50"))
  const brd = [
    "R1 Ответ ограничен по размеру",
    "   fit: не более 50 записей",
    "   verify: GET /fruits?q=a → записей ≤ 50",
    "subjects[]: поиск · имя · предел",
    "analogue: PromptSnippet\nopen-questions: 0",
    "",
  ].join("\n")
  mkdirSync(join(root, ".agent", "staging"), { recursive: true })
  writeFileSync(join(root, ".agent", "staging", "brd.md"), brd)

  // Before: the dead run's answer is on disk and 50 is a legal source.
  assert.equal(checkBrd.run({ path: ".agent/staging/brd.md" }, ctx(root)).ok, true)

  // After a run boundary: the same 50 lives in .agent/prev/answers.md and answers nobody's question.
  newRun.run({}, ctx(root))
  mkdirSync(join(root, ".agent", "staging"), { recursive: true })
  writeFileSync(join(root, ".agent", "staging", "brd.md"), brd)
  const r = checkBrd.run({ path: ".agent/staging/brd.md" }, ctx(root))
  assert.equal(r.ok, false)
  assert.match(r.blockers, /50/)
})

test("a number that stands in a requirement's verify is sourced — the BRD slice is fit AND verify", () => {
  const root = tempRoot()
  writeFileSync(join(root, "TASK.md"), "Отдавать глоссарий агента по HTTP.\n")   // no numbers at all
  mkdirSync(join(root, ".agent", "staging"), { recursive: true })
  writeFileSync(join(root, ".agent", "appgraph.xml"),
    '<appgraph><module path="src/GlossaryResource.java" kind="rest"><api name="GET /glossary"/></module></appgraph>')
  writeFileSync(join(root, ".agent", "brd.md"), [
    "R1 Эндпоинт глоссария отвечает успешно",
    "   fit: эндпоинт отвечает успешным статусом",   // the NUMBER is deliberately NOT here
    "   verify: GET /glossary возвращает 200",
    "subjects[]: глоссарий · агент",
    "analogue: PromptSnippet\nopen-questions: 0",
  ].join("\n"))
  const frd = (status) => `<frd grammar="1" goal="отдавать глоссарий агента">
  <actor name="admin-ui" kind="human" via="HTTP GET /glossary"/>
  <usecase id="UC1" actor="admin-ui" goal="получить глоссарий">
    <pre>агент существует</pre><post>вернулся глоссарий</post>
    <step n="1">клиент шлёт GET /glossary</step>
    <ext id="1a" error="none" outcome="глоссария нет — пустой список"/>
  </usecase>
  <field name="status" in="GET /glossary" type="int" domain="${status}" required="yes" error="none" source="brd.md"/>
  <failures found="no" why="изменение не вводит кодов отказа"/>
  <delta op="GET /glossary" form="Changed" node="src/GlossaryResource.java" from="404" to="глоссарий"/>
  <scenario id="S1" uc="UC1" before="GET /glossary не отвечает" after="отдаёт глоссарий" nodes="src/GlossaryResource.java"/>
  <touched path="src/GlossaryResource.java" why="появляется чтение глоссария"/>
  <carried req="R1" by="UC1/1"/>
</frd>`

  // Live run e132f0a1 died on exactly this: the number stood in `verify`, F5 said "nowhere in the
  // BRD", and the role deleted a correct number to obey a blocker that was wrong.
  writeFileSync(join(root, ".agent", "staging", "frd.xml"), frd("200"))
  assert.deepEqual(checkFrd.run({ path: ".agent/staging/frd.xml" }, ctx(root)).ok, true)

  // The rule still bites: a number in neither fit nor verify is still invented, and the refusal now
  // names the ways out instead of leaving the role to invent one.
  writeFileSync(join(root, ".agent", "staging", "frd.xml"), frd("418"))
  const r = checkFrd.run({ path: ".agent/staging/frd.xml" }, ctx(root))
  assert.equal(r.ok, false)
  assert.match(r.blockers, /418/)
  assert.match(r.blockers, /<question>/)
})

// ЧЬИ ОТВЕТЫ СЧИТАЮТСЯ ИСТОЧНИКОМ, ЗАВИСИТ ОТ ТОГО, ЧТО СУДЯТ. Артефакт на staging роль пишет СЕЙЧАС —
// там ответ мёртвого прогона легализовал бы умолчание, ради чего newRun и существует (шов выше).
// Промоученный .agent/frd.xml — обратный случай: резюме перепроверяет то, что написано РАНЬШЕ, и
// уликами ему служат ровно те ответы, которые newRun только что унёс в .agent/prev/.
//
// Живой прогон c87db886: FRD зелен, план утверждён оператором, шаг 13 отказал по другому дефекту — а
// следующий прогон не смог закрыть шаг 6, потому что девять ответов за его числами уехали в prev.
// Полоса переиграла всё с шестого шага и задала те же вопросы заново.
test("возобновление судит строение промоученного артефакта, а не происхождение его чисел", () => {
  const root = tempRoot()
  writeFileSync(join(root, "TASK.md"), "Кэшировать глоссарий агента.\n")
  mkdirSync(join(root, ".agent", "staging"), { recursive: true })
  mkdirSync(join(root, ".agent", "prev"), { recursive: true })
  writeFileSync(join(root, ".agent", "appgraph.xml"),
    '<appgraph><module path="src/GlossaryResource.java" kind="rest"><api name="GET /glossary"/></module></appgraph>')
  writeFileSync(join(root, ".agent", "brd.md"), [
    "R1 Глоссарий кэшируется",
    "   fit: кэш живёт ограниченное время",
    "   verify: повторный GET /glossary не идёт в хранилище",
    "subjects[]: глоссарий · кэш",
    "analogue: PromptSnippet\nopen-questions: 0",
  ].join("\n"))
  const frd = `<frd grammar="1" goal="кэшировать глоссарий агента">
  <actor name="admin-ui" kind="human" via="HTTP GET /glossary"/>
  <usecase id="UC1" actor="admin-ui" goal="получить глоссарий">
    <pre>агент существует</pre><post>вернулся глоссарий</post>
    <step n="1">клиент шлёт GET /glossary</step>
    <ext id="1a" error="none" outcome="глоссария нет — пустой список"/>
  </usecase>
  <failures found="no" why="изменение не вводит кодов отказа"/>
  <delta op="GET /glossary" form="Changed" node="src/GlossaryResource.java" from="без кэша" to="из кэша"/>
  <scenario id="S1" uc="UC1" before="каждый вызов идёт в хранилище" after="повторный вызов берётся из кэша" nodes="src/GlossaryResource.java"/>
  <touched path="src/GlossaryResource.java" why="появляется чтение из кэша"/>
  <nfr subject="glossary-cache" fit="кэш живёт 300000 мс" source="answers.md"/>
  <carried req="R1" by="UC1/1"/>
</frd>`
  writeFileSync(join(root, ".agent", "staging", "frd.xml"), frd)
  writeFileSync(join(root, ".agent", "frd.xml"), frd)                    // тот же артефакт, промоученный

  // Ответ ещё на месте — зелено; ровно так закрылся шаг 6 в самом прогоне.
  writeFileSync(join(root, ".agent", "answers.md"),
    newExchange([{ n: 1, question: "TTL кэша глоссария?", text: "как у сниппетов, 300000 мс" }]).value)
  assert.equal(checkFrd.run({ path: ".agent/staging/frd.xml" }, ctx(root)).ok, true)

  // Ответ ушёл — и уже НЕ в prev: prev держит ровно один прогон и через шаг перезаписывается.
  rmSync(join(root, ".agent", "answers.md"))

  // РЕЗЮМЕ судит промоученный артефакт и остаётся зелёным: происхождение чисел проверено тогда,
  // когда артефакт писали, и переустанавливать его по сегодняшним файлам — судить историю.
  assert.equal(checkFrd.run({ path: ".agent/frd.xml" }, ctx(root)).ok, true,
    "возобновление требует улик, которых прогон-автор уже не оставил")

  // А НА STAGING — красный: там роль пишет СЕЙЧАС, и число без источника остаётся умолчанием.
  const r = checkFrd.run({ path: ".agent/staging/frd.xml" }, ctx(root))
  assert.equal(r.ok, false, "умолчание прошло в артефакте, который пишут сейчас")
  assert.match(r.blockers, /300000/)

  // Строение промоученного судится по-прежнему: узел вне карты — красный и на резюме.
  writeFileSync(join(root, ".agent", "frd.xml"), frd.replace('node="src/GlossaryResource.java"', 'node="src/Nowhere.java"'))
  assert.equal(checkFrd.run({ path: ".agent/frd.xml" }, ctx(root)).ok, false,
    "резюме перестало судить строение — это уже не проверка, а печать")
})


// --- runlog: память полосы -------------------------------------------------------------------------
//
// Шов на то, ради чего механизм заведён: полоса перестаёт ВЫВОДИТЬ «что сделано», перепроверяя
// артефакты, и начинает ЧИТАТЬ отметки. Живой прогон c87db886 — счёт по старой схеме: зелёный FRD,
// утверждённый план и два переигранных шага 6 подряд с двумя десятками повторных вопросов.

const RUNLOG = ".agent/run.yaml"

test("runlogMark пишет отметку в cwd ПРОГОНА и запечатывает отпечаток артефакта", () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, ".agent", "brd.md"), "R1 требование\n")

  const r = runlogMark.run({ step: 2, name: "brd", status: "done", note: "требований 18", artifacts: [".agent/brd.md"] }, ctx(root))
  assert.match(r.at, /^\d{4}-\d{2}-\d{2}T/)
  assert.equal(r.sealed, 1)

  const text = readFileSync(join(root, RUNLOG), "utf8")
  assert.match(text, /steps:\n {2}- step: 2\n {4}name: brd\n {4}status: done\n/)
  assert.match(text, /artifact: \.agent\/brd\.md/)
  // Отпечаток берётся ЗДЕСЬ и сейчас — именно с ним сравнит следующий запуск.
  assert.match(text, /sha256: [0-9a-f]{64}/)
  // И ничего не написано в этот репозиторий: путь всегда от context.run.cwd.
  assert.equal(existsSync(join(process.cwd(), RUNLOG)), false)
})

test("runlogRead: закрытые шаги позади, вход — в первый незакрытый, с причиной", () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, ".agent", "brd.md"), "R1\n")
  assert.equal(runlogRead.run({}, ctx(root)).from, 1, "журнала нет — с начала")

  for (const step of [1, 2]) runlogMark.run({ step, name: `s${step}`, status: "done", artifacts: step === 2 ? [".agent/brd.md"] : [] }, ctx(root))
  const ok_ = runlogRead.run({}, ctx(root))
  assert.equal(ok_.from, 3)
  assert.deepEqual(ok_.closed, [1, 2])

  // Артефакт правили руками после отметки — шаг переигрывается, и отказ называет файл.
  writeFileSync(join(root, ".agent", "brd.md"), "R1 другое\n")
  const edited = runlogRead.run({}, ctx(root))
  assert.equal(edited.from, 2)
  assert.match(edited.why, /изменён после отметки: \.agent\/brd\.md/)

  // Артефакт исчез — то же самое, но причина другая.
  rmSync(join(root, ".agent", "brd.md"))
  assert.match(runlogRead.run({}, ctx(root)).why, /исчез/)
})

// ЖУРНАЛ ПЕРЕЖИВАЕТ ГРАНИЦУ ПРОГОНА. Ровно в этом списке ротации однажды потерялись улики артефакта
// (ответы оператора), и полоса дважды переиграла шаг 6. Журнал в него не входит — и это шов, а не
// надежда: добавь его в newRun, и тест покраснеет.
test("newRun не уносит журнал в prev — иначе память живёт один прогон", () => {
  const root = tempRoot()
  deadRun(root, { answer: "50" })
  for (const step of [1, 2, 3, 4, 5, 6]) runlogMark.run({ step, name: `s${step}`, status: "done" }, ctx(root))

  newRun.run({}, ctx(root))
  assert.equal(existsSync(join(root, RUNLOG)), true, "journal был унесён вместе с состоянием прогона")
  assert.equal(existsSync(join(root, ".agent", "prev", "run.yaml")), false)
  assert.equal(runlogRead.run({}, ctx(root)).from, 7, "после ротации полоса забыла, что шаг 6 закрыт")
})

test("единицы шага: переснимаются только несделанные, порядок вызывающего сохранён", () => {
  const root = tempRoot()
  runlogMark.run({ step: 4, name: "scope", unit: "spine", status: "done" }, ctx(root))
  const r = runlogPending.run({ step: 4, of: ["spine", "backup", "llm"] }, ctx(root))
  assert.deepEqual(r.units, ["backup", "llm"])
  assert.equal(r.done, 1)
  // Шага в журнале нет вовсе — делать надо всё, и это не отказ.
  assert.deepEqual(runlogPending.run({ step: 9, of: ["labs-eddi"] }, ctx(root)).units, ["labs-eddi"])
})

test("строка тикета заменяется по id — повтор не растит файл", () => {
  const root = tempRoot()
  runlogTicket.run({ id: "02", wave: 0, status: "running" }, ctx(root))
  runlogTicket.run({ id: "02", wave: 0, status: "green" }, ctx(root))
  runlogTicket.run({ id: "21", wave: 0, status: "failed", note: "verify красный" }, ctx(root))

  const text = readFileSync(join(root, RUNLOG), "utf8")
  assert.equal((text.match(/- id: "02"/g) || []).length, 1)
  assert.match(text, /- id: "02"\n {4}wave: 0\n {4}status: green/)
  assert.equal(runlogRead.run({}, ctx(root)).tickets, 2)
})

test("испорченный журнал — это «не знаем», а не «ничего не сделано молча»", () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, RUNLOG), "steps:\n  - step: 2\n    stauts: done\n")
  const r = runlogRead.run({}, ctx(root))
  assert.equal(r.from, 1)
  assert.equal(r.broken, true)
  assert.match(r.why, /испорчен/)
})


// ГЕЙТ ПРИЗНАЁТ СВОЙ ТОКЕН. Живой прогон 08675093: план утверждён, .agent/gate1.json на диске, и
// перезапуск всё равно спросил оператора — ответ гейт искал только в .agent/answers.md, унесённом
// newRun в prev до первого шага. Один из повторов вернулся не словом `approve`, а описанием проекта,
// и шаг умер терминально.
test("гейт: валидный токен не спрашивает заново, разошедшийся план — спрашивает", () => {
  const root = tempRoot()
  mkdirSync(join(root, "task", "DOS-1"), { recursive: true })
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, "TASK.md"), "task: DOS-1\nСделать карточку.\n")
  const plan = "# План\n## src/CardResource.java\n"
  writeFileSync(join(root, "task", "DOS-1", "PLAN.md"), plan)

  const hash = createHash("sha256").update(plan).digest("hex")
  writeFileSync(join(root, ".agent", "gate1.json"), JSON.stringify({ key: "DOS-1", plan: hash, answer: "approve" }))

  const kept = gate1.run({}, ctx(root))
  assert.equal(kept.ok, true, "гейт не признал собственный токен")
  assert.equal(kept.kept, true)
  assert.equal(kept.at, ".agent/gate1.json")

  // План переписали после акцепта — токен перестаёт годиться. Дальше гейт идёт своей обычной дорогой
  // и упирается в отсутствующую карту, а не молча пропускает НЕутверждённую работу.
  writeFileSync(join(root, "task", "DOS-1", "PLAN.md"), `${plan}## src/Other.java\n`)
  const again = gate1.run({}, ctx(root))
  assert.equal(again.ok, false, "токен признан для плана, которого оператор не читал")

  // Чужой ключ — тоже не рецепт.
  writeFileSync(join(root, "task", "DOS-1", "PLAN.md"), plan)
  writeFileSync(join(root, ".agent", "gate1.json"), JSON.stringify({ key: "DOS-999", plan: hash, answer: "approve" }))
  assert.equal(gate1.run({}, ctx(root)).ok, false)
})


// Молчаливая потеря — то, ради чего механизм и заведён. Отметка поверх нечитаемого журнала стёрла бы
// память прогона; она обязана упасть, а чтение — по-прежнему честно сказать «не знаю».
test("отметка не пишется поверх испорченного журнала", () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, RUNLOG), "steps:\n  - step: 6\n    stauts: done\n")
  assert.throws(() => runlogMark.run({ step: 7, name: "weight", status: "done" }, ctx(root)), /не разбирается/)
  assert.match(readFileSync(join(root, RUNLOG), "utf8"), /stauts: done/, "журнал всё-таки перезаписан")
  assert.equal(runlogRead.run({}, ctx(root)).broken, true)
})


// ХОСТ ВАЛИДИРУЕТ ВЫХОД, И ЭТО НЕ ФОРМАЛЬНОСТЬ: `null` в поле, объявленном строкой, роняет прогон на
// «Invalid output from branch» — ровно так умер живой прогон, где шаг 13 впервые признал свою ветку.
// Тот же класс дважды стоил прогона на budgets, поэтому проверяется РЕАЛЬНЫЙ ответ против РЕАЛЬНОЙ
// схемы, а не форма объекта на глаз.
test("шаг 13: признанная ветка — валидный выход, а не падение хоста", () => {
  const root = tempRoot()
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: ["ignore", "pipe", "ignore"] })
  git("init", "-q", "-b", "main")
  git("config", "user.email", "t@t"); git("config", "user.name", "t")
  mkdirSync(join(root, ".agent"), { recursive: true })
  mkdirSync(join(root, "task", "DOS-1"), { recursive: true })
  writeFileSync(join(root, "TASK.md"), "task: DOS-1\nСделать карточку.\n")
  writeFileSync(join(root, ".gitignore"), ".agent/\n")   // как в любой форме: состояние прогона вне git
  writeFileSync(join(root, ".agent", "appgraph.xml"), "<appgraph/>")
  writeFileSync(join(root, ".agent", "mode"), "minor")
  git("add", "-A"); git("commit", "-qm", "init")

  const plan = "# План\n## src/A.java\n"
  writeFileSync(join(root, "task", "DOS-1", "PLAN.md"), plan)
  writeFileSync(join(root, ".agent", "gate1.json"), JSON.stringify({
    key: "DOS-1", plan: createHash("sha256").update(plan).digest("hex"), answer: "approve",
  }))

  const schema = Compile(branch.output)
  const first = branch.run({ baseline: false }, ctx(root))
  assert.equal(schema.Check(first), true, JSON.stringify(first))
  assert.equal(first.ok, true, first.why)
  assert.equal(first.name, "feature/DOS-1")

  // Второй заход по тому же рецепту: ветка на месте, HEAD на ней — это НЕ занятое имя.
  const again = branch.run({ baseline: false }, ctx(root))
  assert.equal(schema.Check(again), true, `выход не проходит схему хоста: ${JSON.stringify(again)}`)
  assert.equal(again.ok, true, again.why)
  assert.equal(again.kept, true)

  // А без рецепта то же самое имя — по-прежнему терминальный отказ.
  rmSync(join(root, ".agent", "branch.json"))
  const clash = branch.run({ baseline: false }, ctx(root))
  assert.equal(schema.Check(clash), true, JSON.stringify(clash))
  assert.equal(clash.kind, "branch-exists")
})

// --- budgets: the host validates OUTPUT, so a budget missing from the schema crashes the run ----
//
// This defect has now happened twice on the same line — maxParallel (run 657fcd98) and intakeLoops
// (run c8bd1294) — because the fix each time was a comment. `additionalProperties: false` turns a key
// declared in core/budgets.mjs but not here into "Invalid output from budgets": a crash at `izi: start`
// naming no key. The assertion below is over the KEY SET, so it fails for a budget that does not exist
// yet, which is the only version of this seam worth having.

test("every budget of core/budgets.mjs is declared in the host's output schema", () => {
  const declared = Object.keys(budgets.output.properties)
  for (const k of Object.keys(DEFAULT_BUDGETS)) assert.ok(declared.includes(k), `бюджет ${k} не объявлен в схеме budgets`)

  const root = tempRoot()
  const out = budgets.run({}, ctx(root))
  const validate = Compile(budgets.output)   // the host's own check, run here instead of at launch
  assert.equal(validate.Check(out), true, JSON.stringify(out))
  assert.equal(out.intakeLoops, DEFAULT_BUDGETS.intakeLoops)

  // D29b: потолок наряда едет тем же каналом и НЕ является бюджетом izi.config.json — проект не
  // выбирает окно модели. Убери его из ответа — воркфлоу встаёт `blocked` на первом же шаге, потому
  // что `симв > undefined` это `false`: проверка размера выключилась бы молча во всех пяти местах.
  assert.equal(out.orderCap, ORDER_CAP_CHARS)
  assert.equal(Object.keys(DEFAULT_BUDGETS).includes("orderCap"), false)
})

// --- the judges a resumed run leans on must be NON-DESTRUCTIVE --------------------------------
//
// S34: a run now starts at the first step whose artifact is not GREEN NOW (workflows/izi.js::
// bandStart), and it asks that question by running the step's own guardrail over the PROMOTED
// artifact. That only works while the guardrail merely judges: `design({path})` promotes and erases
// (ext/index.mjs — copyFileSync then rmSync), so asking it "is this green" would consume the answer.
// This test holds checkBrd and checkFrd to the other contract.

test("checkBrd and checkFrd judge a promoted artifact without consuming it", () => {
  const root = tempRoot()
  writeFileSync(join(root, "TASK.md"), "Лимит бронирования не более 20 штук.\n")
  mkdirSync(join(root, ".agent"), { recursive: true })
  const brd = ["R1 Лимит бронирования", "   fit: не более 20", "   verify: unit test",
    "subjects[]: лимит · бронь · штук", "analogue: PromptSnippet\nopen-questions: 0", ""].join("\n")
  writeFileSync(join(root, ".agent", "brd.md"), brd)

  assert.equal(checkBrd.run({ path: ".agent/brd.md" }, ctx(root)).ok, true)
  assert.equal(readFileSync(join(root, ".agent", "brd.md"), "utf8"), brd)  // still there, byte for byte
  assert.equal(checkBrd.run({ path: ".agent/brd.md" }, ctx(root)).ok, true) // and the SAME answer twice

  // A missing artifact is a refusal, never a throw: that is what makes "not green now" a legal answer
  // for a step that simply has not run yet.
  assert.equal(checkFrd.run({ path: ".agent/frd.xml" }, ctx(root)).ok, false)
})

// --- checkFrd io: F9's `rewind` comes from .agent/review.xml, only on a Reject --------------------
// Live run 508d74fa's class of defect: step 6, cornered by a blocker it cannot honestly repair,
// deletes the SUBJECT of the blocker instead. F9 (steps/intake/frd.mjs) catches that on the FRD side;
// this is the io half — the workflow never hands `rewind` in by hand (workflows/izi.js::intake is
// unchanged), checkFrd builds it itself from whatever verdict is on disk.
test("checkFrd io: rewind is read from .agent/review.xml, and only a Reject supplies it", () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent", "staging"), { recursive: true })
  writeFileSync(join(root, ".agent", "appgraph.xml"),
    '<appgraph><module path="src/CardResource.java" kind="rest"><api name="GET /card"/></module></appgraph>')

  const frdXml = (withUC2) => `<frd grammar="1" goal="карточка по имени">
  <usecase id="UC1" actor="user" goal="увидеть карточку">
    <post>карточка отображена</post>
    <step n="1">пользователь открывает карточку</step>
  </usecase>
  ${withUC2 ? `<usecase id="UC2" actor="user" goal="получить данные карточки">
    <post>данные карточки получены</post>
    <step n="1">клиент шлёт GET /card</step>
  </usecase>` : ""}
  <failures found="no" why="изменение не вводит кодов отказа"/>
  <delta op="GET /card" form="Added" node="src/CardResource.java"/>
  <scenario id="S1" uc="UC1" before="карточки нет" after="карточка есть" nodes="src/CardResource.java"/>
  ${withUC2 ? '<scenario id="S2" uc="UC2" before="данных нет" after="данные есть" nodes="src/CardResource.java"/>' : ""}
  <touched path="src/CardResource.java" why="карточка добавляется"/>
</frd>`
  const reject = '<review verdict="Reject" grammar="2"><blocker code="goal-not-delivered" node="src/CardResource.java" evidence="UC2/post">карточка данных не реализована</blocker></review>'

  // No .agent/review.xml at all: not a rewind, F9 stays silent even though UC2 is absent.
  writeFileSync(join(root, ".agent", "staging", "frd.xml"), frdXml(false))
  assert.equal(checkFrd.run({ path: ".agent/staging/frd.xml" }, ctx(root)).ok, true)

  // A promoted Pass carries no rewind either.
  writeFileSync(join(root, ".agent", "review.xml"), '<review verdict="Pass" grammar="2"/>')
  assert.equal(checkFrd.run({ path: ".agent/staging/frd.xml" }, ctx(root)).ok, true)

  // A Reject naming UC2/post, with UC2 still gone from the repair: F9 refuses.
  writeFileSync(join(root, ".agent", "review.xml"), reject)
  const cut = checkFrd.run({ path: ".agent/staging/frd.xml" }, ctx(root))
  assert.equal(cut.ok, false)
  assert.match(cut.blockers, /F9 предмет перемотки «UC2\/post» удалён из FRD/)

  // …and the honest repair — UC2 restored — passes the very Reject that named it.
  writeFileSync(join(root, ".agent", "staging", "frd.xml"), frdXml(true))
  const fixed = checkFrd.run({ path: ".agent/staging/frd.xml" }, ctx(root))
  assert.equal(fixed.ok, true, fixed.ok ? "" : fixed.blockers)
})

// --- carried: the memory of a repair loop reaches the sandbox --------------------------------

test("carried hands the workflow the lines already red in this run, not just the last check", () => {
  const first = carried.run({ blockers: "F4 S1: uc пуст\nF5 поле id: 24" })
  const second = carried.run({ blockers: "F4 S1: uc пуст", seen: first.seen })
  assert.match(second.text, /F5 поле id: 24/)
  assert.equal(second.text.match(/F4 S1: uc пуст/g).length, 1)
})

// --- focus (step 3b): the artifact is written from the RUN's plan, and a refusal erases it -------
//
// Same rule as `.agent/mode` below and for the same reason: newRun leaves artifacts alone, so
// yesterday's focus would outlive today's refusal and step 4 would survey it. Seam: drop the
// `drop()` calls in ext/index.mjs::focus and the third test here goes red.
//
// The anchor rule is the OTHER thing under test. `focus` never reads .agent/brd.md — it takes the
// anchors from the plan's own files[].subjects — so a run whose plan marks nothing must ask, even
// when this repository's own .agent/brd.md is full of anchors.
const planAt = (root, files, marked = []) => {
  mkdirSync(join(root, ".agent"), { recursive: true })
  const cell = (id, kind, paths) => ({ id, kind, subjects: [], bytes: paths.length * 1000, files: paths.map((path) => ({ path, bytes: 1000, sha1: "", subjects: marked.includes(path) ? ["якорь"] : [] })) })
  writeFileSync(join(root, ".agent", "survey-plan.json"), JSON.stringify({
    files: files.length, bytes: files.length * 1000, subjects: ["якорь"], gaps: [],
    cells: [cell("spine", "spine", ["README.md"]), ...files.map((p, i) => cell(`c${i + 1}`, "survey", [p]))],
  }))
  // one route on the first file and one edge from it to the second: the smallest graph that yields
  // an entry with a cone, so the branches below differ by the ANCHORS and not by the shape
  writeFileSync(join(root, ".agent", "graph-computed.xml"), `<computed grammar="1">\n<edge from="${files[0]}" to="${files[1]}"/>\n<api at="${files[0]}" name="GET /x" kind="http" scope="public" via="jaxrs"/>\n</computed>\n`)
  return root
}

test("focus writes .agent/focus.json under context.run.cwd — the whole plan while it fits", () => {
  const root = planAt(tempRoot(), ["src/A.java", "src/B.java"])
  const r = focus.run({}, ctx(root))
  assert.equal(r.ok, true)
  assert.equal(r.why, "whole-plan")
  const f = JSON.parse(readFileSync(join(root, ".agent", "focus.json"), "utf8"))
  assert.equal(f.cells.length, 3)                       // spine + both cells: nothing is narrowed
  assert.deepEqual(f.slices.map((s) => s.entry), ["src/A.java"])   // …and the cone is computed anyway
  assert.equal(f.slices[0].nodes, 2)                    // a COUNT: the node list has no reader
})

test("no .agent/survey-plan.json at the run root: refusal naming step 3, and no focus left behind", () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, ".agent", "focus.json"), '{"cells":["c1"]}')       // yesterday's focus
  const r = focus.run({}, ctx(root))
  assert.equal(r.ok, false)
  assert.match(r.why, /шаг 3 survey-plan не отработал/)
  assert.equal(existsSync(join(root, ".agent", "focus.json")), false)
})

test("the anchor is matched against the SURFACE, not the file's text", () => {
  // BUG_FIX_CONTEXT run e90d9ce1 (eddi): the surface is built HERE, out of graph-computed.xml, and
  // that is the whole repair — under step 3's marking rule the anchor `import` named 83 of 84
  // entries, because every java file opens with a block of imports.
  const root = planAt(tempRoot(), Array.from({ length: 400 }, (_, i) => `src/n${i}.java`))
  writeFileSync(join(root, ".agent", "focus.json"), '{"cells":["c1"]}')       // yesterday's focus

  const r = focus.run({}, ctx(root))
  assert.equal(r.ok, false)
  assert.match(r.why, /no-anchor/)                       // the plan's anchor names no entry here
  assert.equal(existsSync(join(root, ".agent", "focus.json")), false, "a refusal erases the artifact")

  // …and when an anchor DOES name an entry, the focus is written and narrower than the plan
  const named = planAt(tempRoot(), ["src/GlossaryStore.java", "src/Other.java", ...Array.from({ length: 398 }, (_, i) => `src/n${i}.java`)])
  writeFileSync(join(named, ".agent", "survey-plan.json"), readFileSync(join(named, ".agent", "survey-plan.json"), "utf8").replace('"subjects":["якорь"],"gaps"', '"subjects":["Glossary"],"gaps"'))
  const ok2 = focus.run({}, ctx(named))
  assert.equal(ok2.ok, true, ok2.why)
  assert.equal(ok2.why, "anchors")
  assert.ok(ok2.cells < 401, "narrower than the plan")
  assert.equal(typeof ok2.droppedSlices, "number")
})

// --- steps 4 and 5 read the FOCUS, and they do it in one change --------------------------------
//
// Parts are read by the plan in ONE place — buildGraph — and the cells the swarm surveys come from
// another (`cells`). Narrowing only the first would leave the second demanding a part for every cell
// of the plan and refusing "поддерево потеряно" on each one the focus dropped: the pipeline would be
// red BETWEEN the two commits. That is why this is one naryad, and these two tests are its seam.
const SPINE_PART = `<part cell="spine" kind="spine">
  <artifact name="acme" root="."/>
  <suite id="unit" kind="unit" cmd="mvn test" one="-Dtest={class}" path="src/test/java" match="*Test.java"/>
  <build cmd="mvn package"/>
  <toggles found="no"/><branching found="no"/><contract found="no"/><integrations found="no"/>
</part>`

const focusAt = (root, cells) => {
  writeFileSync(join(root, ".agent", "focus.json"), JSON.stringify({ why: "anchors", chosen: ["s1"], cells, files: 1, repoFiles: 2, estBytes: 417, slices: [] }))
  return root
}

test("cells: no .agent/focus.json is a REFUSAL, never a quiet fallback to the whole plan", () => {
  const root = planAt(tempRoot(), ["src/A.java", "src/B.java"])
  const missing = cells.run({ path: "" }, ctx(root))
  assert.equal(missing.ok, false)
  assert.match(missing.why, /шаг 3b focus не отработал/)

  // …and with a focus the swarm sees only what the focus named
  focusAt(root, ["spine", "c1"])
  const r = cells.run({ path: "" }, ctx(root))
  assert.deepEqual(r.cells.map((c) => c.id), ["spine", "c1"])
})

test("buildGraph demands a part for every cell OF THE FOCUS, and for no other", () => {
  const root = planAt(tempRoot(), ["src/A.java", "src/B.java"])
  mkdirSync(join(root, ".agent", "graph-parts"), { recursive: true })
  writeFileSync(join(root, ".agent", "graph-parts", "spine.xml"), SPINE_PART)

  // c1 is IN the focus and has no part: the subtree is lost and the step refuses, naming the cell
  focusAt(root, ["spine", "c1"])
  const lost = buildGraph.run({ path: ".agent/appgraph.xml" }, ctx(root))
  assert.equal(lost.ok, false)
  assert.match(lost.why, /клетка c1 ФОКУСА не закрыта частью/)

  // the same tree, the same missing parts — but now the focus does not name them, and their absence
  // is a decision rather than a loss. Before this change c1 and c2 were demanded here too.
  focusAt(root, ["spine"])
  const narrowed = buildGraph.run({ path: ".agent/appgraph.xml" }, ctx(root))
  assert.equal(narrowed.ok, true, narrowed.why)
  const xml = readFileSync(join(root, ".agent", "appgraph.xml"), "utf8")
  assert.match(xml, /<focus slices="s1" cells="1" of="3"/)         // the boundary is declared, not implied
})

// --- weight: "no weight" must mean "no file" ---------------------------------------------------
//
// S22. newRun carries the run's STATE into .agent/prev and leaves the ARTIFACTS alone by design (the
// test above), so `.agent/mode` from a previous run outlives today's refusal unless this function
// removes it. Step 8 reads that file and has no way to tell yesterday's weight from today's — the
// seam is proven by reintroducing the defect: drop the `drop()` calls in ext/index.mjs::weight and
// the second test below goes red while everything else stays green (docs/weight.md §4).
const FRD = (form) => `<frd grammar="1" goal="искать посылку">\n  <delta op="GET /parcels" form="${form}" node="src/ParcelResource.java" from="list()" to="list(track)"/>\n</frd>\n`
const frdAt = (root, form) => {
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, ".agent", "frd.xml"), FRD(form))
  return root
}

test("weight writes .agent/mode under context.run.cwd — one word, from the RUN's frd.xml", () => {
  const root = frdAt(tempRoot(), "Added")
  const r = weight.run({}, ctx(root))
  assert.deepEqual(r, { ok: true, mode: "minor", earned: "GET /parcels (Added)", deltas: 1 })
  assert.equal(readFileSync(join(root, ".agent", "mode"), "utf8"), "minor")   // no newline, no JSON
})

test("an Unknown delta: ok:false AND the previous run's .agent/mode is ERASED", () => {
  const root = frdAt(tempRoot(), "Unknown")
  writeFileSync(join(root, ".agent", "mode"), "major")                        // yesterday's weight
  const r = weight.run({}, ctx(root))
  assert.equal(r.ok, false)
  assert.match(r.why, /unknown-delta/)
  assert.equal(existsSync(join(root, ".agent", "mode")), false)
})

test("no .agent/frd.xml at the run root: refusal naming step 6, and no mode left behind", () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, ".agent", "mode"), "patch")
  const r = weight.run({}, ctx(root))
  assert.equal(r.ok, false)
  assert.match(r.why, /шаг 6 intake не отработал/)
  assert.equal(existsSync(join(root, ".agent", "mode")), false)
})

// --- ripple: the same rule, now for TWO files ---------------------------------------------------
//
// Step 8 writes a verdict AND the subgraph it was computed from, so "no ripple" must mean "neither
// file". The seam is the same one weight bought: drop the `drop()` in ext/index.mjs::ripple and the
// second test below goes red — step 9 would then be ordered (or skipped) on yesterday's verdict over
// a subgraph nobody computed today (docs/ripple.md §5).
const MAP = `<appgraph grammar="3" modules="2">
  <module path="src/ParcelResource.java" level="3" fanin="1" fanout="1">
    <role>REST-ресурс посылок</role>
  </module>
  <module path="src/ParcelRepo.java" level="4" fanin="1" fanout="0"/>
  <edge from="src/ParcelResource.java" to="src/ParcelRepo.java" via="private ParcelRepo repo"/>
</appgraph>`
const FRD_R = `<frd grammar="1" goal="искать посылку">
  <delta op="GET /parcels" form="Added" node="src/ParcelResource.java" from="list()" to="list(track)"/>
  <scenario id="S1" uc="UC1" before="весь реестр" after="только совпавшие" nodes="src/ParcelResource.java"/>
  <touched path="src/ParcelResource.java"/>
</frd>
`
const rippleRoot = (mode = "minor", frd = FRD_R) => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, ".agent", "appgraph.xml"), MAP)
  writeFileSync(join(root, ".agent", "frd.xml"), frd)
  if (mode) writeFileSync(join(root, ".agent", "mode"), mode)
  return root
}

test("ripple writes .agent/design and .agent/ripple.xml under context.run.cwd", () => {
  const root = rippleRoot()
  const r = ripple.run({}, ctx(root))
  assert.deepEqual(r, { ok: true, design: "needed", mode: "minor", seeds: 1, nodes: 2, total: 2 })
  assert.equal(readFileSync(join(root, ".agent", "design"), "utf8"), "needed")  // one word, no newline
  assert.match(readFileSync(join(root, ".agent", "ripple.xml"), "utf8"), /^<ripple grammar="1" mode="minor"/)
})

test("a refusal ERASES both of the previous run's artifacts, not just the verdict", () => {
  const root = rippleRoot("minor", `<frd grammar="1" goal="искать посылку"/>`)   // no delta at all
  writeFileSync(join(root, ".agent", "design"), "needed")                       // yesterday's verdict
  writeFileSync(join(root, ".agent", "ripple.xml"), "<ripple/>")                // yesterday's subgraph
  const r = ripple.run({}, ctx(root))
  assert.equal(r.ok, false)
  assert.match(r.why, /no-delta/)
  assert.equal(existsSync(join(root, ".agent", "design")), false)
  assert.equal(existsSync(join(root, ".agent", "ripple.xml")), false)
})

test("no .agent/mode at the run root: refusal naming step 7, and nothing left behind", () => {
  const root = rippleRoot(null)
  writeFileSync(join(root, ".agent", "design"), "needed")
  const r = ripple.run({}, ctx(root))
  assert.equal(r.ok, false)
  assert.match(r.why, /шаг 7 weight не отработал/)
  assert.equal(existsSync(join(root, ".agent", "design")), false)
})

// --- design: the gate erases, the SCRIPT composes, the check promotes ----------------------------
//
// Step 9's own version of the erasure rule, one layer on: the GATE (design({}) with no argument) must
// take with it everything of the step that is not green NOW — including the artifacts of the two
// passes that were DELETED while the step is rewritten. Remove the `drop` of that pair in
// ext/index.mjs::design and the first test below goes red: step 10 would then plan on a design graph
// left by a run of an older version of this pipeline.
//
// The other half is what replaced the pass: the composition of the dictionary is a SCRIPT
// (steps/plan/values/values.mjs::valuesSkeleton), and the role only names what the script left blank.
const DESIGN_RIPPLE = `<ripple grammar="1" mode="minor" seeds="1" nodes="2">
  <module path="src/ParcelResource.java" seed="yes" level="3">
    <role>REST-ресурс посылок</role>
    <api name="GET /parcels" kind="http" scope="public" via="@GET public Set&lt;Parcel&gt; list()"/>
    <dep path="src/ParcelRepo.java"/>
  </module>
  <module path="src/ParcelRepo.java" level="4">
    <role>хранилище посылок</role>
    <decl kind="method" name="all()" sig="public Set&lt;Parcel&gt; all()"/>
  </module>
</ripple>`
const FRD_D = `<frd grammar="1" goal="искать посылку">
  <usecase id="UC1" actor="http-client" goal="найти посылку по трек-номеру">
    <post>вернён список совпавших посылок</post>
    <step n="1">клиент отправляет GET /parcels?track=…</step>
  </usecase>
  <delta op="GET /parcels" form="Added" node="src/ParcelResource.java" from="list()" to="list(track)"/>
  <scenario id="S1" uc="UC1" before="весь реестр" after="только совпавшие" nodes="src/ParcelResource.java"/>
  <touched path="src/ParcelResource.java"/>
</frd>
`
const designRoot = (flag = "needed") => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent", "staging"), { recursive: true })
  writeFileSync(join(root, ".agent", "frd.xml"), FRD_D)
  writeFileSync(join(root, ".agent", "ripple.xml"), DESIGN_RIPPLE)
  writeFileSync(join(root, ".agent", "mode"), "minor")
  if (flag) writeFileSync(join(root, ".agent", "design"), flag)
  return root
}

const stage = (root, name, text) => {
  const p = join(".agent", "staging", name)
  writeFileSync(join(root, p), text)
  return p
}

// The dictionary as the role hands it back: the skeleton with its two blanks named. Written as a
// FUNCTION of the skeleton on purpose — a fixture typed by hand would stop being the skeleton the
// moment the composition moved, and then this file would prove nothing about the run.
const named = (root) => {
  design.run({ skeleton: ".agent/staging/values-skeleton.xml" }, ctx(root))
  return readFileSync(join(root, ".agent", "staging", "values-skeleton.xml"), "utf8")
    .replace('closes="UC1/in" side="in" text=""', 'closes="UC1/in" side="in" text="GET /parcels?track=T"')
    .replace('closes="UC1/post" side="out" text=""', 'closes="UC1/post" side="out" text="Parcels(совпавшие)"')
}

// Живой прогон 17 авг: воркфлоу звал core({group: undefined}) и получал «группы «» нет в разбиении».
// Причина — производный id, оставшийся внутри модуля: схема хоста его не выпускала. Имя артефакта
// партии обязано выходить наружу, иначе позвать её нельзя.
// Проход B, io-шов: скелет цепочек считается из СЛОВАРЯ и FRD, а зелёная проверка СОБИРАЕТ поставку
// в том же вызове — рабочий файл цепочек не промоутится никогда, потому что промоут это и есть пара.
test("izi_answer drops the number the operator addressed each answer with, on disk and in the table", async () => {
  const root = tempRoot()
  setPending.run({
    subject: "три вопроса",
    items: ["точка входа для поиска?", "лимит только к поиску?", "пустой результат?"],
  }, ctx(root))

  const r = await iziAnswer.execute("id", {
    exchange: [
      "<exchange>",
      "<question_1>точка входа для поиска?</question_1><answer_1>1 GET /fruits с параметром name</answer_1>",
      "<question_2>лимит только к поиску?</question_2><answer_2>2 только к ответам с активным поиском</answer_2>",
      "<question_3>пустой результат?</question_3><answer_3>3 пустой массив с HTTP 200</answer_3>",
      "</exchange>",
    ].join(""),
  }, null, null, { cwd: root })

  const values = answers.run({}, ctx(root)).map((a) => a.text)
  assert.deepEqual(values, ["GET /fruits с параметром name", "только к ответам с активным поиском", "пустой массив с HTTP 200"])
  assert.doesNotMatch(r.content[0].text, /→ [123] /)   // the operator sees what was actually written
})

// --- fallback: the one caller with no WorkflowRunContext at all (izi_answer) reasons the same
// way about process.cwd() as every sandbox function reasons about context.run.cwd — proven here
// on a sandbox function directly, since no context.run is the shape an absent WorkflowRunContext
// takes too.

test("no context.run.cwd falls back to process.cwd(), never to this repo's own location", () => {
  const root = tempRoot()
  writeFileSync(join(root, "TASK.md"), "cwd-fallback probe\n")
  const prevCwd = process.cwd()
  process.chdir(root)
  try {
    assert.equal(readText.run({ path: "TASK.md" }, {}), "cwd-fallback probe\n")
  } finally {
    process.chdir(prevCwd)
  }
})

// --- ENVELOPE: an err with no rail name must be rejected by the SCHEMA, not by workflow logic -----
//
// S28. Live run fcc4c120: `intake` returned {"track":"err","code":10,"subject":"Вопросы…"} with no
// `kind`. The question rail switches on env.kind === "question" (workflows/izi.js:287/:581/:709), so
// that envelope fell past every question branch and left the operator no way to answer — 193 316
// tokens and 5 role runs spent. The fix lives in workflows/izi.js's ENVELOPE literal: an `allOf`/
// `if`/`then` clause that makes track:"err" REQUIRE kind AND subject.
//
// This test lives in ext/, not workflows/, because typebox resolves from ext/node_modules — the
// pipeline itself (workflows/izi.js) runs in a host vm sandbox with no import and no node_modules of
// its own (standards/code.md, MODULE_CONTRACT at the top of izi.js).
//
// It READS the ENVELOPE literal out of workflows/izi.js instead of copying the schema, because a
// second copy of the same rule is exactly the defect standards/code.md forbids ("one rule, one
// place"): a copy can drift from what the host actually compiles. The literal is cut out by matching
// balanced braces after `const ENVELOPE = ` (skipping braces inside strings/comments) and turned into
// an object with `new Function("return " + src)()` — comments inside the literal are just source text
// to a JS parser, so they survive.
//
// It compiles that object with `Compile` from "typebox/compile" — the exact function
// pi-extensible-workflows/packages/core/src/agent-execution.ts:816 uses on outputSchema — so a pass
// here means the host's own validator would also pass, and a fail here means the host would reject
// the envelope in the role's own turn (agent-execution.ts:816-828), before the workflow logic ever
// runs.
//
// The seam: delete the `allOf` clause from ENVELOPE (or narrow `then.required` back to just `kind`)
// and the second and third branches below turn red — an err envelope missing kind, or missing
// subject, would again validate as legal.

function readEnvelopeSchema() {
  const src = readFileSync(new URL("../workflows/izi.js", import.meta.url), "utf8")
  const marker = "const ENVELOPE = "
  const markerAt = src.indexOf(marker)
  if (markerAt === -1) throw new Error("workflows/izi.js: `const ENVELOPE = ` not found")
  let i = markerAt + marker.length
  while (src[i] !== "{") i++
  const literalStart = i
  let depth = 0
  let inString = null   // one of: ' " ` while inside a string literal
  let inLineComment = false
  let inBlockComment = false
  for (; i < src.length; i++) {
    const c = src[i]
    const next = src[i + 1]
    if (inLineComment) { if (c === "\n") inLineComment = false; continue }
    if (inBlockComment) { if (c === "*" && next === "/") { inBlockComment = false; i++ } continue }
    if (inString) { if (c === "\\") { i++; continue }; if (c === inString) inString = null; continue }
    if (c === "/" && next === "/") { inLineComment = true; i++; continue }
    if (c === "/" && next === "*") { inBlockComment = true; i++; continue }
    if (c === '"' || c === "'" || c === "`") { inString = c; continue }
    if (c === "{") depth++
    else if (c === "}") { depth--; if (depth === 0) { i++; break } }
  }
  const literal = src.slice(literalStart, i)
  return new Function("return " + literal)()
}

test("ENVELOPE: track:ok with an artifact validates", () => {
  const schema = Compile(readEnvelopeSchema())
  assert.equal(schema.Check({ track: "ok", artifact: ".agent/brd.md" }), true)
})

test("ENVELOPE: track:err with subject but no kind — the fcc4c120 shape — is REJECTED", () => {
  const schema = Compile(readEnvelopeSchema())
  assert.equal(schema.Check({ track: "err", subject: "Вопросы по архитектуре:\n1. …" }), false)
})

test("ENVELOPE: track:err with kind but no subject is REJECTED", () => {
  const schema = Compile(readEnvelopeSchema())
  assert.equal(schema.Check({ track: "err", kind: "question" }), false)
})

test("ENVELOPE: track:err with both kind and subject validates", () => {
  const schema = Compile(readEnvelopeSchema())
  assert.equal(schema.Check({ track: "err", kind: "question", subject: "Вопросы по архитектуре:\n1. …" }), true)
})

// --- plan: the question is a rail, and a refusal erases -------------------------------------------
//
// Step 10 is the first SCRIPT step with an operator, so it has two io halves nothing else has: an
// `ask` that is not a refusal (the question travels verbatim, and the caller re-asks it), and the
// same erasure rule as the weight and the ripple. Remove the `drop()` in ext/index.mjs::plan and the
// second test below goes red — the gate at step 12 would then approve a plan computed for a change
// that no longer exists.
//
// The GREEN path is not unit-tested here: it needs a real git repository for the trunk, and this is
// an io module — a live run proves it (standards/code.md, the four kinds of module).
const planRoot = (mode = "minor") => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, ".agent", "appgraph.xml"), MAP)
  writeFileSync(join(root, ".agent", "frd.xml"), FRD_R)
  if (mode) writeFileSync(join(root, ".agent", "mode"), mode)
  return root
}

// R-shippable, io-половина. Зелёный путь `plan` юнитом не берётся — ему нужен настоящий git-репозиторий
// для транка (см. соседний блок), поэтому шов здесь на ИСТОЧНИК, тем же приёмом, что ENVELOPE и
// $START_BLAME: хост обязан ПОСЧИТАТЬ юниты из design-graph и передать их в ядро. Верни `new Map()` —
// и тикет снова приедет без определения готовности, ровно как в прогоне d8ef8c60, где команда узла
// была зелена до начала работы.
test("plan: хост считает dod из design-graph и передаёт его в ядро", () => {
  const src = readFileSync(new URL("./index.mjs", import.meta.url), "utf8")
  assert.match(src, /units: designXml \? unitsByPath\(parseDesign\(designXml\), parseRoutes\(designXml\)\) : new Map\(\)/)
  assert.match(src, /import \{[^}]*unitsByPath[^}]*\} from "\.\.\/steps\/design\/design\.mjs"/)
})

test("plan asks for the task key VERBATIM, and asking is not a refusal of the step", () => {
  const root = planRoot()
  const r = plan.run({}, ctx(root))
  assert.equal(r.ok, false)
  assert.equal(r.ask, true, "the question rail, not a blocked run")
  assert.equal(r.subject, KEY_QUESTION, "byte-stable: the answer written against it is recognised next call")
})

test("a refusal erases yesterday's plan-index.json", () => {
  const root = planRoot(null)                                        // no weight — step 7 never ran
  writeFileSync(join(root, ".agent", "plan-index.json"), '{"grammar":1}')   // yesterday's plan
  const r = plan.run({}, ctx(root))
  assert.equal(r.ok, false)
  assert.match(r.why, /шаг 7 weight не отработал/)
  assert.equal(existsSync(join(root, ".agent", "plan-index.json")), false)
})

// --- review (step 11) ------------------------------------------------------------------------
// The io seam of the slice: the verdict is DATA, so a green FORM promotes the file in BOTH branches
// — a Reject's blockers are what the band repairs from — while a MALFORMED verdict promotes nothing
// and leaves no stale artifact behind. Remove the rmSync at the top of review.run and the third test
// goes red: yesterday's Pass would sit on disk while today's plan was never judged.
const reviewRoot = (verdict) => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent", "staging"), { recursive: true })
  // Критик судит ТРЕБОВАНИЕ: FRD со staging против brd.md. Плана здесь нет — шаг 11 переехал выше него.
  writeFileSync(join(root, ".agent", "brd.md"), [
    "R1 Посылку можно найти по номеру",
    "   fit: список сужается до совпавших",
    "subjects[]: посылка", "analogue: —", "open-questions: 0",
  ].join("\n"))
  writeFileSync(join(root, ".agent", "staging", "frd.xml"), `<frd grammar="1" goal="искать посылку">
  <usecase id="UC1" actor="api" goal="найти посылку"><post>вернулись совпавшие</post><step n="1">клиент шлёт GET /parcels?track=…</step></usecase>
  <delta op="GET /parcels" form="Changed" node="src/ParcelResource.java" from="list()" to="list(track)"/>
  <scenario id="S1" uc="UC1" before="весь реестр" after="только совпавшие" nodes="src/ParcelResource.java"/>
  <carried req="R1" by="UC1/1"/>
</frd>`)
  writeFileSync(join(root, ".agent", "staging", "review.xml"), verdict)
  return root
}

test("review promotes a Pass and returns the verdict", () => {
  // grammar 2 (D21): Pass обязан ЗАКРЫТЬ чек-лист — здесь одна строка долга, R1.
  const root = reviewRoot('<review verdict="Pass" grammar="2"><covers item="R1" node="UC1/1"/></review>')
  const r = review.run({ path: ".agent/staging/review.xml" }, ctx(root))
  assert.equal(r.ok, true, r.ok ? "" : r.blockers)
  assert.equal(r.verdict, "Pass")
  assert.equal(existsSync(join(root, ".agent", "review.xml")), true)
  assert.equal(existsSync(join(root, ".agent", "staging", "review.xml")), false, "promoted, not copied")
})

test("review promotes a Reject too, and hands back the owner of each blocker", () => {
  const root = reviewRoot('<review verdict="Reject" grammar="2"><covers item="R1" node="UC1/1"/><blocker code="goal-not-delivered" node="UC1" evidence="S1">post не достижим из собственных шагов</blocker></review>')
  const r = review.run({ path: ".agent/staging/review.xml" }, ctx(root))
  assert.equal(r.ok, true, r.ok ? "" : r.blockers)
  assert.equal(r.verdict, "Reject")
  assert.deepEqual(r.findings.map((f) => [f.code, f.culprit, f.owner]), [["goal-not-delivered", "frd.xml", 6]])
  assert.equal(existsSync(join(root, ".agent", "review.xml")), true, "the operator and the repair rail both read the blockers")
})

// The findings schema carries `note` (П2) — a function of the code, "" for every owner but `operator`
// (goal-not-delivered has none). The host's OWN validator is the judge here, the same device the
// budgets schema test above uses: a key present in the runtime shape but missing from `required`/
// `properties` is how a live run silently drops a field the caller (band()) depends on.
test("review output schema: findings carry `note`, and the host's own validator accepts the shape", () => {
  const root = reviewRoot('<review verdict="Reject" grammar="2"><covers item="R1" node="UC1/1"/><blocker code="goal-not-delivered" node="UC1" evidence="S1">post не достижим из собственных шагов</blocker></review>')
  const r = review.run({ path: ".agent/staging/review.xml" }, ctx(root))
  assert.equal(r.ok, true, r.ok ? "" : r.blockers)
  assert.equal(r.findings[0].note, "", "goal-not-delivered carries no OPERATOR_NOTE — band() never reads this row's note")
  const validate = Compile(review.output)
  assert.equal(validate.Check(r), true, JSON.stringify(r))
})

// autoFindings (open-question) is a SEPARATE mapping from newReview's blockers (ext/index.mjs::review,
// "const auto = …") — a `note` added to one and not the other still validates as long as no test
// exercises the missing side. This is that side.
test("review output schema: an autoFindings open-question finding also carries `note`", () => {
  const root = reviewRoot('<review verdict="Pass" grammar="2"><covers item="R1" node="UC1/1"/></review>')
  // Открытый вопрос дописан в тот же артефакт: он машинная находка, роль о нём не спрашивают.
  const frdPath = join(root, ".agent", "staging", "frd.xml")
  writeFileSync(frdPath, readFileSync(frdPath, "utf8").replace("</frd>",
    '  <question subject="track-format" why="формат трек-номера не определён"/>\n</frd>'))

  const r = review.run({ path: ".agent/staging/review.xml" }, ctx(root))
  assert.equal(r.ok, true, r.ok ? "" : r.blockers)
  assert.equal(r.verdict, "Reject", "неотвеченный <question> делает РЕЗУЛЬТАТ отказом, что бы ни написала роль")
  const q = r.findings.find((f) => f.code === "open-question")
  assert.ok(q, JSON.stringify(r.findings))
  assert.equal(q.note, "", "владелец open-question — шаг 6, не оператор: строки в OPERATOR_NOTE у него нет")
  const validate = Compile(review.output)
  assert.equal(validate.Check(r), true, JSON.stringify(r))
})

test("a malformed verdict promotes nothing and erases yesterday's review", () => {
  const root = reviewRoot('<review verdict="Reject" grammar="2"><blocker code="made-up" node="src/ParcelResource.java" evidence="S1">x</blocker></review>')
  writeFileSync(join(root, ".agent", "review.xml"), '<review verdict="Pass" grammar="1"/>')   // yesterday's
  const r = review.run({ path: ".agent/staging/review.xml" }, ctx(root))
  assert.equal(r.ok, false)
  assert.match(r.blockers, /R2 /)
  assert.equal(existsSync(join(root, ".agent", "review.xml")), false, "a stale Pass must not survive today's run")
})

test("review names the step that did not run instead of reading an absent artifact", () => {
  const root = reviewRoot('<review verdict="Pass" grammar="1"/>')
  rmSync(join(root, ".agent", "staging", "frd.xml"))
  assert.match(review.run({ path: ".agent/staging/review.xml" }, ctx(root)).blockers, /шаг 6 intake не отработал/)
})

// --- D10: the phase of step 9 is ONE pass while the step is rewritten ----------------------------
//
// `workflows/` is covered by no test of its own — it runs in a host vm sandbox with no imports — so
// the only seam available for its structure is the one the ENVELOPE test above already uses: read the
// source and hold it to what the pass requires.
const IZI = readFileSync(new URL("../workflows/izi.js", import.meta.url), "utf8")
const EXT = readFileSync(new URL("./index.mjs", import.meta.url), "utf8")






// J14 — НАРЯД ШАГА 6 НЕСЁТ ВТОРУЮ КАРТУ, И РОЛЬ БОЛЬШЕ НЕ ИЩЕТ ТОГО, ЧТО ПОДСТАВЛЕНО.
//
// BUG_FIX_CONTEXT: живой прогон 19.08.2026, форма eddi (DOS-535). Роль спросила оператора
//   «AgentConfiguration model class path (not in appgraph.xml — needed for R3 `glossaries` field
//   delta…)», хотя `.agent/graph-computed.xml` нёс
//   `<decl at="src/main/java/ai/labs/eddi/configs/agents/model/AgentConfiguration.java" kind="class"/>`
//   среди 6890 объявлений по 1856 файлам. Карта роя покрывает 86 клеток фокуса, и имени в ней нет
//   ни разу. Оператор потратил ход на факт, который лежал на диске.
const TYPES_MAP = `<appgraph grammar="4" modules="1">
  <module path="src/main/java/app/snippets/mongo/SnippetStore.java" pkg="app.snippets.mongo">
    <decl kind="class" name="SnippetStore" sig="public class SnippetStore"/>
  </module>
</appgraph>`
const TYPES_COMPUTED = `<computed by="script">
  <decl at="src/main/java/app/agents/model/AgentConfiguration.java" kind="class" name="AgentConfiguration" sig="public class AgentConfiguration"/>
  <decl at="src/main/java/app/agents/model/AgentConfiguration.java" kind="method" name="getSnippets()" sig="public List&lt;URI&gt; getSnippets()"/>
</computed>`
const typesRoot = () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, ".agent", "appgraph.xml"), TYPES_MAP)
  writeFileSync(join(root, ".agent", "graph-computed.xml"), TYPES_COMPUTED)
  writeFileSync(join(root, "TASK.md"), "Glossary is bound to the agent, versioned like SnippetStore.\n")
  writeFileSync(join(root, ".agent", "brd.md"), "R3 reference in agent config, as snippets\n")
  writeFileSync(join(root, ".agent", "answers.md"), EXCHANGE("field name in AgentConfiguration?", "glossaries"))
  return root
}

test("наряд шага 6 несёт таблицу типов, собранную СКРИПТОМ по вычисленному графу", () => {
  const root = typesRoot()
  const r = graphMap.run({}, ctx(root))

  assert.equal(r.ok, true)
  // Имя, которого карта роя не знает НИ РАЗУ, приезжает с путём, видом и тем, что объявляет.
  assert.equal(r.types.includes("AgentConfiguration · src/main/java/app/agents/model/AgentConfiguration.java · class · declares public List<URI> getSnippets()"), true, r.types)
  // Карта роя остаётся первым источником — одно имя, один резолвер, две карты.
  assert.match(r.types, /^SnippetStore · src\/main\/java\/app\/snippets\/mongo\/SnippetStore\.java · class$/m)
  assert.equal(r.typeRows, 2)
  // ИМЯ, КОТОРОГО В ГРАФЕ НЕТ, В ТАБЛИЦУ НЕ ПОПАДАЕТ: `Glossary` этим изменением создаётся, и
  // спросить о нём оператора по-прежнему законно.
  assert.equal(r.types.includes("Glossary"), false)

  // Второй карты нет — таблица пуста, и вопрос про путь снова законен. Это ровно то состояние, из
  // которого прогон 19.08.2026 и задал свой вопрос.
  rmSync(join(root, ".agent", "graph-computed.xml"))
  const blind = graphMap.run({}, ctx(root))
  assert.equal(blind.types.includes("AgentConfiguration"), false)
  assert.equal(blind.typeRows, 1, "карта роя отвечает и одна — но только про клетки фокуса")
})

// Тот же двусторонний шов, что у нарядов шага 9: `prompt()` требует точного совпадения ключей, и
// плейсхолдер `{TYPES}` без ключа в полосе (или ключ без плейсхолдера) роняет шаг 6 НА ЗАПУСКЕ —
// после карты, после ответов и за миллисекунду до роли.
test("плейсхолдеры нарядов шага 6 и ключи, которые им передают, — одно множество на каждый пласт", () => {
  for (const pass of ["A", "B", "C", "D"]) {
    const at_ = IZI.indexOf(`order = await sized("intake/${pass}", tpl${pass}, {`)
    assert.ok(at_ > 0, `в полосе нет сборки наряда прохода ${pass}`)
    const call = IZI.slice(at_, IZI.indexOf("});", at_) + 3)
    const inCall = [...new Set([...call.matchAll(/[{,]\s*([A-Z][A-Z_]*)\s*(?=[,:}])/g)].map((m) => m[1]))].sort()
    const tpl = readFileSync(new URL(`../steps/intake/order-${pass.toLowerCase()}.tpl`, import.meta.url), "utf8")
    const inTpl = [...new Set([...tpl.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1]))].sort()
    assert.deepEqual(inTpl, inCall, `steps/intake/order-${pass.toLowerCase()}.tpl`)
  }
  // КАРТА ЕДЕТ РОВНО В ОДИН НАРЯД. Пласты A и C о репозитории не рассуждают, а в D о нём судит скрипт
  // (F8 читает вычисленный граф сам) — 107 811 Б карты в их нарядах были бы чистой тратой окна.
  const withMap = ["A", "B", "C", "D"].filter((p) =>
    /\{MAP\}/.test(readFileSync(new URL(`../steps/intake/order-${p.toLowerCase()}.tpl`, import.meta.url), "utf8")))
  assert.deepEqual(withMap, ["B"], "карта роя обязана ехать только в наряд пласта B")
})

test("the valuer returns a count, so the envelope carries it — additionalProperties is false", () => {
  assert.match(IZI, /values: \{ type: "number" \}/)
})

// и она ответила `<witness cmd="mvn verify -Pnative"/>` для HTML-страницы — команда машинную сверку
// проходит (она у закрывающего сценария) и страницу не открывает. Убери `dod` из строки — красный.
test("reviewForm: два чек-листа — долг перед требованиями и то, чего никто не просил", () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent", "staging"), { recursive: true })
  writeFileSync(join(root, ".agent", "brd.md"), [
    "R1 Посылку можно найти по номеру",
    "   fit: GET /parcels/{id} возвращает посылку",
    "R2 Список посылок фильтруется по статусу",
    "   fit: GET /parcels?status=… возвращает только этот статус",
    "subjects[]: посылка", "analogue: —", "open-questions: 0",
  ].join("\n"))
  writeFileSync(join(root, ".agent", "staging", "frd.xml"), `<frd grammar="1" goal="поиск посылки">
  <usecase id="UC1" actor="api" goal="найти посылку"><post>посылка вернулась</post><step n="1">клиент шлёт GET /parcels/{id}</step></usecase>
  <usecase id="UC9" actor="api" goal="выгрузить архив посылок в S3"><post>архив в S3</post><step n="1">админ просит выгрузку</step></usecase>
  <delta op="GET /parcels/{id}" form="Added" node="src/ParcelResource.java" new="yes"/>
  <scenario id="S1" uc="UC1" before="404" after="200" nodes="src/ParcelResource.java"/>
  <carried req="R1" by="UC1/1"/>
</frd>`)

  const f = reviewForm.run({}, ctx(root))
  // Долг — строка на требование, id машинный: роль его КОПИРУЕТ.
  assert.match(f.owed, /^R1 — Посылку можно найти по номеру · fit: GET \/parcels\/\{id\}/m)
  assert.match(f.owed, /^R2 — Список посылок фильтруется по статусу/m)
  // Обратный ход: UC9 не назван ни одной строкой carried — ровно та находка, ради которой список
  // и заведён (живой прогон eddi: UC8, четыре наряда работы, которой никто не просил).
  assert.match(f.unbacked, /UC9 — use case «выгрузить архив посылок в S3»/)
  assert.equal(/UC1 —/.test(f.unbacked), false, "названный через carried use case подозреваемым не бывает")
  // Словарь кодов приезжает оттуда же, откуда судит правило.
  assert.equal(f.codes, "requirement-not-carried | invented-value | goal-not-delivered | open-question")
})

// --- D23: гейт шага 6 — узел изменения, которого не исполняет ни один сьют ------------------------
//
// io трёх рельс. Вопрос ОПЕРАТОРУ (роли здесь нет: артефакт зелёный, сьюта нет у РЕПОЗИТОРИЯ),
// остановка на `suite`/`drop` и проход на `accept`. Жёсткое условие проверяется отдельно: на КРАСНОМ
// checkFrd гейт молчит — иначе оператора спрашивают про артефакт, который роль ещё перепишет.
const GATE_MAP = `<appgraph grammar="4" modules="4">
  <suite id="unit" kind="unit" cmd="mvn test" one="-Dtest={class}" path="src/test" match="*Test.java"/>
  <module path="src/CardResource.java" kind="rest">
    <api name="GET /card"/>
    <test path="src/test/CardResourceTest.java" suite="unit"/>
  </module>
  <module path="src/card.html"/>
  <module path="src/test/CardResourceTest.java" kind="test" suite="unit"/>
  <edge from="src/test/CardResourceTest.java" to="src/CardResource.java" via=".when().get(&quot;/card&quot;)" by="use"/>
  <edge from="src/card.html" to="src/CardResource.java" via="url: '/card'" by="use"/>
</appgraph>`
const GATE_FRD = (goal = "карточка по имени") => `<frd grammar="1" goal="${goal}">
  <usecase id="UC1" actor="user" goal="увидеть карточку">
    <post>карточка отображена</post>
    <step n="1">пользователь открывает карточку</step>
  </usecase>
  <failures found="no" why="изменение не вводит кодов отказа"/>
  <delta op="GET /card" form="Added" node="src/CardResource.java"/>
  <scenario id="S1" uc="UC1" before="карточки нет" after="карточка есть" nodes="src/card.html src/CardResource.java"/>
  <touched path="src/card.html" why="страница показывает карточку"/>
</frd>`
const gateRoot = (frd = GATE_FRD()) => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent", "staging"), { recursive: true })
  writeFileSync(join(root, ".agent", "appgraph.xml"), GATE_MAP)
  writeFileSync(join(root, ".agent", "staging", "frd.xml"), frd)
  return root
}
// Ответ пишется тем же путём, каким его пишет izi_answer — через формат core/answers.mjs.
const answerOnDisk = (root, question, text) =>
  writeFileSync(join(root, ".agent", "answers.md"), newExchange([{ n: 1, question, text }]).value)

test("шов 8: гейт шага 6 — ask без ответа, стоп на suite/drop, проход на accept", () => {
  const root = gateRoot()
  const asked = `${BLIND_STEM("src/card.html")}${BLIND_TAIL}`
  // Хост валидирует ВЫХОД: поле, которого нет в схеме, роняет прогон на «Invalid output from
  // checkFrd» — тот же класс, что дважды стоил прогона на `budgets`. Проверяется каждая рельса.
  const schema = Compile(checkFrd.output)
  const valid = (out) => { assert.equal(schema.Check(out), true, JSON.stringify(out)); return out }

  // 1. Ответа нет: рельса ОПЕРАТОРА. FRD не промотирован — промоушен делает workflow после гейта.
  const ask = valid(checkFrd.run({ path: ".agent/staging/frd.xml" }, ctx(root)))
  assert.equal(ask.ok, false)
  assert.equal(ask.ask, true)
  assert.deepEqual(ask.items, [asked])
  assert.equal(ask.subject, asked)
  assert.match(ask.why, /src\/card\.html/)
  assert.equal(ask.blockers, undefined, "это не блокер формы: роль на этом не пере-делегируют")
  assert.equal(existsSync(join(root, ".agent", "frd.xml")), false)

  // 2. `suite` — полоса встаёт, и это НЕ вопрос и НЕ блокер роли: чинит человек.
  answerOnDisk(root, asked, "suite")
  const stop = valid(checkFrd.run({ path: ".agent/staging/frd.xml" }, ctx(root)))
  assert.equal(stop.ok, false)
  assert.equal(stop.stop, true)
  assert.equal(stop.ask, undefined)
  assert.match(stop.why, /заведи сьют, исполняющий src\/card\.html/)

  // 3. `drop` — та же остановка, другой честный выход: правится TASK.md/BRD, не FRD.
  answerOnDisk(root, asked, "drop")
  const drop = valid(checkFrd.run({ path: ".agent/staging/frd.xml" }, ctx(root)))
  assert.equal(drop.stop, true)
  assert.match(drop.why, /TASK\.md\/BRD \(НЕ FRD\)/)

  // 4. `accept` — полоса идёт дальше, и число принятых узлов названо.
  answerOnDisk(root, asked, "accept")
  const green = valid(checkFrd.run({ path: ".agent/staging/frd.xml" }, ctx(root)))
  assert.equal(green.ok, true, green.ok ? "" : green.blockers || green.why)
  assert.equal(green.waived, 1)
  assert.equal(green.ask, undefined)

  // 5. Ответ вне словаря — пере-спрос с ПРИЧИНОЙ: текст новый, значит пауза придёт.
  answerOnDisk(root, asked, "ну ладно")
  const again = valid(checkFrd.run({ path: ".agent/staging/frd.xml" }, ctx(root)))
  assert.equal(again.ask, true)
  assert.notEqual(again.items[0], asked)
  assert.match(again.items[0], /ну ладно/)
})

test("гейт срабатывает ТОЛЬКО после зелёного checkFrd: на красной проверке вопроса нет", () => {
  // Тот же слепой узел, но артефакт красный по F-правилу: узла `src/invented.java` карта не знает.
  const broken = GATE_FRD().replace('nodes="src/card.html src/CardResource.java"', 'nodes="src/card.html src/invented.java"')
  const root = gateRoot(broken)
  const r = checkFrd.run({ path: ".agent/staging/frd.xml" }, ctx(root))
  assert.equal(r.ok, false)
  assert.ok(r.blockers, "красная проверка возвращает блокеры роли")
  assert.equal(r.ask, undefined, "оператора не спрашивают про артефакт, который роль ещё перепишет")
  assert.equal(r.stop, undefined)

  // Ровно та же красная проверка при ответе `accept` на диске остаётся рельсой РОЛИ.
  answerOnDisk(root, `${BLIND_STEM("src/card.html")}${BLIND_TAIL}`, "accept")
  const still = checkFrd.run({ path: ".agent/staging/frd.xml" }, ctx(root))
  assert.equal(still.ok, false)
  assert.ok(still.blockers)
  assert.equal(still.waived, undefined)
})

// --- D23-11: НАРЯД И ПРАВИЛО СПРАШИВАЮТ ОДНО МНОЖЕСТВО (главный io-шов шага 11) ------------------
//
// Роль здесь не зовётся: её ответ СОБИРАЕТСЯ из выхода reviewForm — `<covers>` на каждую строку
// обоих чек-листов, то есть ровно то, о чём наряд спросил, и ничего сверх. Такой ответ обязан
// пройти review({path}) целиком. Разведи наряд и правило — роль, ответившая дословно, получит R5 на
// строку, о которой её не спрашивали, и это будет видно ЗДЕСЬ, а не на живом прогоне.
const orderIds = (block, mark) => String(block).split("\n")
  .filter((l) => l.includes(mark))
  .map((l) => l.split(" — ")[0].trim())
const answerTheOrder = (form, frd) => {
  const ids = [...frdIds(frd)]
  const uc = (frd.usecases || [])[0]
  const nodeFor = () => (uc && (uc.steps || []).length ? `${uc.id}/1` : ids[0])
  const covers = [...orderIds(form.owed, " — "), ...orderIds(form.unbacked, " — ")]
    .map((id) => `<covers item="${id}" node="${nodeFor()}"/>`)
  return `<review verdict="Pass" grammar="2">\n  ${covers.join("\n  ")}\n</review>`
}

test("шов 9: наряд критика спрашивает ТЕМ ЖЕ выражением, каким считает правило", () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent", "staging"), { recursive: true })
  writeFileSync(join(root, ".agent", "brd.md"), [
    "R1 Посылку можно найти по номеру", "   fit: список сужается",
    "R2 Архив выгружается в S3", "   fit: архив лежит в бакете",
    "subjects[]: посылка", "analogue: —", "open-questions: 0",
  ].join("\n"))
  const frdText = `<frd grammar="1" goal="искать посылку">
  <usecase id="UC1" actor="api" goal="найти посылку"><post>совпавшие</post><step n="1">клиент шлёт GET /parcels</step></usecase>
  <usecase id="UC9" actor="api" goal="выгрузить архив в S3"><post>архив в бакете</post><step n="1">админ просит выгрузку</step></usecase>
  <delta op="GET /parcels" form="Changed" node="src/ParcelResource.java" from="list()" to="list(track)"/>
  <scenario id="S1" uc="UC1" before="весь реестр" after="только совпавшие" nodes="src/ParcelResource.java"/>
  <carried req="R1" by="UC1/1"/>
</frd>`
  writeFileSync(join(root, ".agent", "staging", "frd.xml"), frdText)

  const form = reviewForm.run({}, ctx(root))
  const frd = parseFrd(frdText)
  const brd = [{ id: "R1", statement: "Посылку можно найти по номеру", fit: "список сужается" },
               { id: "R2", statement: "Архив выгружается в S3", fit: "архив лежит в бакете" }]
  assert.deepEqual(orderIds(form.owed, " — "), owedItems({ requirements: brd }).map((r) => r.id))
  assert.deepEqual(orderIds(form.unbacked, " — "), unbackedItems({ frd }).map((r) => r.id))
  // Обратный список на этой фикстуре не пуст: UC9 не просило ни одно требование — та самая находка,
  // ради которой он и заведён (живой прогон eddi: UC8, четыре наряда никем не заказанной работы).
  assert.deepEqual(unbackedItems({ frd }).map((r) => r.id), ["UC9"])
})

test("шов 11: роль, ответившая наряду ДОСЛОВНО, проходит шаг 11", () => {
  const root = reviewRoot('<review verdict="Pass" grammar="2"/>')
  const form = reviewForm.run({}, ctx(root))
  const frd = parseFrd(readFileSync(join(root, ".agent", "staging", "frd.xml"), "utf8"))
  writeFileSync(join(root, ".agent", "staging", "review.xml"), answerTheOrder(form, frd))
  const r = review.run({ path: ".agent/staging/review.xml" }, ctx(root))
  assert.equal(r.ok, true, r.ok ? "" : r.blockers)
  assert.equal(r.verdict, "Pass")
})

// --- D15: the hats, and the one that must stay unique --------------------------------------------
//
// A role's first line is the strongest instruction in the file: it decides which of the model's
// professions answers the order. The seven hats are chosen so that they do not overlap, and the
// overlap that matters is `software architect` — the only profession in this pipeline that is
// entitled to invent modules. Give it to the interface analyst and pass A starts drawing a graph it
// is forbidden to draw; give it to the systems analyst and pass C starts repairing the frozen one.
// So it is asserted to occur EXACTLY ONCE in all of steps/, and the test lives here because
// ext/index.mjs is what declares roleDirectories — the only place all of them are named at once.
//
// The domain check is one rule in one place, over EVERY role rather than three: standards/role.md
// constraint 3 is a property of role files as such, and it has already cost a live run (a role
// returned its prepared example instead of reading the order). The words banned are the ones of the
// forms this pipeline is actually run against — a role carrying them cannot be told apart from an
// order.
const ROLE_FILES = [
  ["brd/gilb.md", /business analyst/],
  ["scope/scout.md", /REVERSE ENGINEER/],
  ["intake/intake.md", /requirements analyst/],
  // `plan/values/valuer.md` припаркована вместе со словарём значений (шаг 9 переписывается, docs/plan.md),
  // `design/router.md` и `design/core-designer.md` удалены вместе с цепочками и карточкой партии.
  ["plan/values/valuer.md", /INTERFACE ANALYST/],
  ["review/critic.md", /DESIGN REVIEWER/],
]
const roleText = (f) => readFileSync(new URL(`../steps/${f}`, import.meta.url), "utf8")

// МОДЕЛЬ РОЛИ — АЛИАС, А НЕ ИДЕНТИФИКАТОР ПРОВАЙДЕРА. Решение оператора 21.08.2026
// (standards/role.md): под `execution` и `judgment` сегодня лежит один и тот же qwen, но модель
// кругов починки 4-5 поднимается тиром выше одной строкой машинных настроек, а не правкой семи
// файлов. Ловушка, ради которой шов и заведён: с идентификатором во frontmatter правка
// `modelAliases` не делает НИЧЕГО и не говорит об этом — два прогона 13.08.2026 ушли на это.
test("роль называет модель алиасом: идентификатор провайдера не возвращается молча", () => {
  const ALIASES = new Set(["routing", "execution", "judgment"])
  const files = readdirSync(new URL("../steps", import.meta.url).pathname, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => readdirSync(new URL(`../steps/${d.name}`, import.meta.url).pathname)
      .filter((f) => f.endsWith(".md"))
      .map((f) => `${d.name}/${f}`))
  const withModel = files.filter((f) => /^model:/m.test(roleText(f)))
  assert.ok(withModel.length >= 5, "роли с объявленной моделью исчезли — шов смотрит не туда")
  for (const f of withModel) {
    const model = (roleText(f).match(/^model:\s*(\S+)/m) || ["", ""])[1]
    assert.ok(ALIASES.has(model),
      `${f}: model: ${model} — это идентификатор провайдера, а не алиас. Правка modelAliases его не увидит`)
  }
})

test("no role carries a word of a form this pipeline is run against — the example is the only concrete place", () => {
  // The regression form (fruits) and the hard input (eddi, its glossary): live-domain vocabulary in a
  // LAW or a STRATEGY is a prepared answer, and a weak tier returns it instead of reading the order.
  const live = /\bfruits?\b|фрукт|\bglossar|глоссари|\beddi\b/i
  for (const [file] of ROLE_FILES) {
    const hits = roleText(file).split("\n").filter((l) => live.test(l))
    assert.deepEqual(hits, [], `${file} несёт слова живого домена`)
  }
})


// $START_ORDER — то же устройство, что $START_SWARM, $START_BLAME и $START_REENTRY: блок ВЫРЕЗАН из
// workflows/izi.js и исполнен здесь, потому что импортировать этот файл нельзя. `prompt`, `log`,
// `orderLine` и потолок передаются параметрами — внутри песочницы это глобали хоста.
//
// D29b. До этого блока ни один шаг не знал, насколько разросся его наряд: рябь выросла с 2 311
// символов (форма `t2`) до 30 281 (`eddi`), и не заметила этого ни одна строка лога. Прогон 162e8b02
// ушёл за окно на 112 токенов — HTTP 400, роль не запускалась вовсе, и из чата это неотличимо от
// роли, которая ответила плохо.
//
// J12. ЧТО из этой меры едет в чат — решает core/orderline.mjs, и здесь оно исполняется НАСТОЯЩЕЕ:
// хост-функция `orderLine` подставлена САМОЙ СОБОЙ — той, что расширение отдаёт в песочницу. Полосе
// остаются мера и КРУГ — сколько нарядов этого рода прогон уже собрал.
const ORDER = (cap) => new Function("prompt", "log", "orderLine", "ORDER_CAP", `${IZI.slice(IZI.indexOf("// $START_ORDER"), IZI.indexOf("// $END_ORDER"))}
  return { sized }`)(
  (tpl, keys) => `${tpl}::${Object.values(keys).join("")}`,
  (line) => LOGGED.push(line),
  async (x) => orderLine.run(x),
  cap,
)
let LOGGED = []

test("J12: разбор наряда печатается ОДИН раз на род наряда — дальше едет только итог", async () => {
  LOGGED = []
  const band = ORDER(1000)
  const keys = { MAP: "m".repeat(300), BRD: "b".repeat(40), FEEDBACK: "" }
  const first = await band.sized("intake", "tpl", keys)
  const second = await band.sized("intake", "tpl", keys)

  assert.equal(first.chars, first.text.length)
  assert.equal(first.over, false)
  assert.equal(LOGGED.length, 2)
  // Первый круг: слагаемые по убыванию размера — первым стоит тот документ, который и разнесло.
  assert.equal(LOGGED[0], "intake: наряд 345 симв из 1000, круг 1 — шаблон 3 · MAP 300 · BRD 40 · FEEDBACK 0")
  // Второй: внутренности сборки не меняются, а каждая строка лога — запись сессии, которая едет в
  // контекст всех следующих ходов чат-модели (замер 01a017dc).
  assert.equal(LOGGED[1], "intake: наряд 345 симв из 1000, круг 2")
  // Отказ несёт разбор на любом круге — он и есть ответ на «почему не влезло».
  assert.match(second.why, /шаблон 3 · MAP 300 · BRD 40 · FEEDBACK 0$/)
})

test("J12: род наряда, а не имя шага, считает круги — рой и партии собирают ОДИН наряд", async () => {
  LOGGED = []
  const band = ORDER(1000)
  await band.sized("scope/c1", "tpl", { A: "a" }, "scope")
  await band.sized("scope/c2", "tpl", { A: "a" }, "scope")
  await band.sized("design/values", "tpl", { A: "a" })

  assert.match(LOGGED[0], /^scope\/c1: наряд 6 симв из 1000, круг 1 — шаблон 3 · A 1$/)
  assert.equal(LOGGED[1], "scope/c2: наряд 6 симв из 1000, круг 2")
  // Другой род — свой счёт: наряд, которого не видели, показывает состав.
  assert.equal(LOGGED[2], "design/values: наряд 6 симв из 1000, круг 1 — шаблон 3 · A 1")
})

test("D29b: наряд выше потолка — отказ, и он НАЗЫВАЕТ слагаемые", async () => {
  LOGGED = []
  const band = ORDER(100)
  await band.sized("design/values", "tpl", { FRD: "f", RIPPLE: "r" })          // круг 1 этого рода
  const o = await band.sized("design/values", "tpl", { FRD: "f".repeat(60), RIPPLE: "r".repeat(60) })

  assert.equal(o.over, true)
  assert.match(o.why, /^наряд design\/values — 125 симв при потолке 100:/)
  assert.match(o.why, /FRD 60/)
  assert.match(o.why, /RIPPLE 60/)
  // Второй круг молчал бы — но наряд не влез, и разбор печатается: искать виноватый документ
  // оператору больше негде, роль не запускалась вовсе.
  assert.equal(LOGGED.length, 2)
  assert.equal(LOGGED[1], "design/values: наряд 125 симв из 100, круг 2 — шаблон 3 · FRD 60 · RIPPLE 60")
})

test("D29b: прямые сборки наряда идут через sized, и каждая отказывает по-своему", () => {
  // ЧЕТЫРНАДЦАТЬ мест — шаги 2, 4, 11, ЧЕТЫРЕ на шаге 6 (у каждого пласта свой наряд,
  // steps/intake/passes-data-flow.md), ДВА на шаге 10в (критик плана и его фиксер) и ПЯТЬ на шаге 9:
  // словарь границы плюс два хода цикла порций, и в каждом ходе — наряд первого захода и наряд
  // ПОЧИНКИ, у которых разные шаблоны и разные слоты. Считаются ВСЕ вызовы, а не только присваивания:
  // наряд починки выбирается тернарным оператором, и `= await sized` его бы не увидел.
  assert.equal([...IZI.matchAll(/await sized\(/g)].length, 14, "четырнадцать прямых сборок наряда")
  assert.match(IZI, /const order = await sized\("design\/values", /, "наряд словаря собран мимо меры")
  // Наряд порции собирается в двух видах, и оба идут через меру: первый заход и ПОЧИНКА.
  assert.match(IZI, /await sized\(`design\/\$\{id\}`, tpl, await order\(/, "наряд первого захода собран мимо меры")
  assert.match(IZI, /await sized\(`design\/\$\{id\}\/fix`, fixTpl, await fix\(/, "наряд починки собран мимо меры")
  assert.match(IZI, /const order = await sized\("planreview", criticTpl, \{/)
  assert.match(IZI, /const fix = await sized\("planreview\/fix", tpl, \{/)
  assert.match(IZI, /const order = await sized\("brd", orderTpl, \{/)
  assert.match(IZI, /const order = await sized\(`scope\/\$\{cell\.id\}`, orderTpl, \{/)
  for (const pass of ["A", "B", "C", "D"]) {
    assert.match(IZI, new RegExp(`order = await sized\\("intake/${pass}", tpl${pass}, \\{`), `наряд прохода ${pass}`)
  }
  assert.match(IZI, /const order = await sized\("review", orderTpl, \{/)

  // Ни одного `prompt(` мимо sized: наряд, собранный в обход меры, — это наряд, размер которого
  // впервые узнают из HTTP 400 (прогон 162e8b02).
  const raw = [...IZI.matchAll(/prompt\(([A-Za-z.[\]"]+)/g)].map((m) => m[1])
  assert.deepEqual(raw.sort(), ["tpl"], "prompt() вызывается только внутри sized")

  // Отказ шага 4 — ЗНАЧЕНИЕ, а не exit: parallel() глотает бросок и перебрасывает свой.
  const scoutFn = IZI.slice(IZI.indexOf("async function scout("), IZI.indexOf("// FUNCTION_CONTRACT: scope"))
  assert.match(scoutFn, /if \(order\.over\) return \{ ok: false, why: order\.why \};/)
  assert.doesNotMatch(scoutFn, /exit\(/)
  // …а остальные — blocked с диагнозом гардрейла. Их семь: шаги 2, 6, 11, критик плана 10в и ТРИ на
  // шаге 9 — словарь границы и оба хода цикла порций (наряд починки отказывает той же строкой, что и
  // наряд первого захода: мера у них одна); фиксер 10в отказывает своей строкой (`fix.over`).
  assert.equal([...IZI.matchAll(/if \(o(?:rder)?\.over\) exit\(err\("blocked"/g)].length, 7)
  assert.match(IZI, /if \(fix\.over\) exit\(err\("blocked"/, "наряд фиксера без меры против окна")

  // Потолок не переписан в этом файле: он приходит из core/budgets.mjs через budgets().
  assert.match(IZI, /ORDER_CAP = b\.orderCap;/)
  assert.doesNotMatch(IZI, new RegExp(`= ${ORDER_CAP_CHARS}`))
})

// --- ключ задачи: объявление в TASK.md против вопроса оператору --------------------------------------
const keyRoot = (task) => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, "TASK.md"), task)
  return root
}

test("ключ берётся из строки «task: КЛЮЧ» — и вопроса оператору тогда нет", () => {
  const r = checkTask.run({}, ctx(keyRoot("task: DOS-535\n\nНужен новый эндпоинт по имени фрукта.\n")))
  assert.equal(r.ok, true)
  assert.equal(r.key, "DOS-535")
  // Вопрос едет наружу ДОСЛОВНО тем же текстом, каким его задаёт шаг 10: один вопрос на полосу.
  assert.equal(r.question, KEY_QUESTION)
})

// Первая версия искала ключ ЛЮБЫМ словом задачи, и это дефект: задача, упоминающая соседний тикет,
// назвала бы его именем и ветку, и каталог плана — молча. У объявления есть автор, у совпадения нет.
test("ключ, ПОМЯНУТЫЙ в тексте, ключом задачи не становится", () => {
  const r = checkTask.run({}, ctx(keyRoot("Сделать поиск по имени, как уже сделано в DOS-100.\n")))
  assert.equal(r.ok, true)
  assert.equal(r.key, "", "упоминание — не объявление, полоса спросит оператора")
})

test("ответ оператора старше задачи: он мог поправить то, что в ней написано", () => {
  const root = keyRoot("task: DOS-535\nПоиск по имени.\n")
  writeFileSync(join(root, ".agent", "answers.md"), newExchange([{ n: 1, question: KEY_QUESTION, text: "DOS-777" }]).value)
  assert.equal(checkTask.run({}, ctx(root)).key, "DOS-777")
})

test("мусор вместо ключа ключом не считается — форма та же, что проверяет шаг 10", () => {
  assert.equal(checkTask.run({}, ctx(keyRoot("task: dos-535\nПоиск.\n"))).key, "")
  assert.equal(checkTask.run({}, ctx(keyRoot("task: DOS535\nПоиск.\n"))).key, "")
})


// --- шаг 14: хост валидирует ВЫХОД, и незаявленный ключ роняет прогон ------------------------------
//
// Третий раз один класс: `maxParallel` (657fcd98), `intakeLoops` (c8bd1294), ветка шага 13 — и теперь
// живой прогон 9bbf195f, который вошёл ровно в шаг 14 и умер на «Invalid output from tickets»: ядро
// научилось отмечать наряд с воротами на ВСЁМ сьюте (`wholeSuite`), а схема хоста осталась прежней и
// `additionalProperties: false` отвергла ответ целиком. Ядро шага проверено своими юнитами; здесь
// проверяется ГРАНИЦА — РЕАЛЬНЫЙ ответ `tickets.run` против РЕАЛЬНОЙ схемы, тем же валидатором, каким
// судит хост.
//
// Шов доказан обратно: снятая строка `wholeSuite` из `tickets.output` красит этот тест.
const ticketsRoot = () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent"), { recursive: true })
  mkdirSync(join(root, "task", "DOS-1", "design"), { recursive: true })
  mkdirSync(join(root, "src", "test", "java", "app"), { recursive: true })
  writeFileSync(join(root, "TASK.md"), "task: DOS-1\nСделать стор.\n")
  writeFileSync(join(root, ".agent", "gate1.json"), JSON.stringify({ key: "DOS-1", plan: "x", answer: "approve" }))
  writeFileSync(join(root, "src", "test", "java", "app", "OldStoreIT.java"), "// образец внешнего сьюта\n")
  writeFileSync(join(root, ".agent", "frd.xml"), `<frd grammar="1" goal="a document store">
  <actor name="api" kind="system" via="HTTP /store"/>
  <field name="key" in="Term" type="string" domain="1-64 chars" required="yes" error="CONFLICT" source="brd.md"/>
  <usecase id="UC1" actor="api" goal="create a document">
    <post>the document is stored</post>
    <step n="1">the client sends POST /store with the document</step>
    <step n="2">the system writes the record</step>
    <ext id="2a" error="CONFLICT" outcome="the duplicate is rejected"/>
  </usecase>
  <usecase id="UC2" actor="api" goal="read a document">
    <post>the document is returned</post>
    <step n="1">the client sends GET /store/{id}</step>
    <step n="2">the system reads the record</step>
  </usecase>
  <failure code="CONFLICT" status="409" client="duplicate" operator="—" from="UC1/2a"/>
  <delta op="POST /store" form="Added" node="src/rest/RestStore.java" new="yes"/>
  <scenario id="S1" uc="UC1" before="absent" after="present" nodes="src/rest/RestStore.java src/mongo/Store.java src/model/Doc.java"/>
  <scenario id="S2" uc="UC2" before="absent" after="present" nodes="src/rest/RestStore.java src/mongo/Store.java src/model/Doc.java"/>
</frd>`)
  // У юнитового сьюта НЕТ шаблона одного теста — ровно тот репозиторий, на котором наряд получает
  // ворота на всём сьюте и шаг обязан сказать это вслух.
  writeFileSync(join(root, ".agent", "appgraph.xml"), `<appgraph grammar="4">
  <suite id="unit" kind="unit" cmd="./mvnw test" path="src/test/java" match="*Test.java"/>
  <suite id="it" kind="component" cmd="./mvnw verify" path="src/test/java" match="*IT.java"/>
  <build cmd="./mvnw verify" compile="./mvnw -q -DskipTests package"/>
  <lang id="java" files="500" edges="yes" decls="class,method"/>
  <module path="src/model/Old.java" pkg="model"/>
  <module path="src/mongo/OldStore.java" pkg="mongo"/>
  <module path="src/rest/OldRest.java" pkg="rest"/>
</appgraph>`)
  // ОЧЕРЕДЬ РАБОТ БЕРЁТСЯ ИЗ ДЕРЕВА. Нарезка считает волны по `needs` — тому же входу, по которому
  // их считает план, — поэтому фикстуре нужно дерево, а не только документ.
  writeFileSync(join(root, ".agent", "tree.xml"), `<tree task="DOS-1" goal="a document store">
  <module path="src/model/Doc.java" delta="Added" io="none">
    <hides>форма записи</hides><owns type="Doc"/><twin kind="twin" path="src/model/Old.java"></twin>
    <needs></needs>
    <contract><sig>public class Doc</sig><pre>нет</pre><post>поля</post><fail>нет</fail></contract>
  </module>
  <module path="src/mongo/Store.java" delta="Added" io="db">
    <hides>хранение</hides><owns type=""/><twin kind="twin" path="src/mongo/OldStore.java"></twin>
    <needs><need path="src/model/Doc.java" why="параметр типа"/></needs>
    <contract><sig>public class Store</sig><pre>монго доступна</pre><post>записан (UC1/2)</post><fail>нет</fail></contract>
  </module>
  <module path="src/rest/RestStore.java" delta="Added" io="http">
    <hides>дверь</hides><owns type=""/><twin kind="twin" path="src/rest/OldRest.java"></twin>
    <needs><need path="src/mongo/Store.java" why="делегирует"/><need path="src/model/Doc.java" why="тип тела"/></needs>
    <contract><sig>public class RestStore</sig><pre>тело разобрано</pre><post>201 (UC1/1)</post><fail>нет</fail></contract>
  </module>
</tree>
`)

  // ПЛАН — ОДИН ДОКУМЕНТ. Папка карточек партий удалена вместе со старым шагом 9 (docs/plan.md):
  // нарезка и гейт читают собранный PLAN.md, и фикстура кладёт разделы туда же, куда их положит
  // новый шаг.
  writeFileSync(join(root, "task", "DOS-1", "PLAN.md"), `# Design

## src/model/Doc.java
what: the record
signatures: getName() : String
declares: public class Doc
calls: none
sample: src/model/Old.java — same style
closes: UC1 step 2 · UC2 step 2
verify: ./mvnw test -Dtest=DocTest · DocTest

## src/mongo/Store.java
what: the mongo store
signatures: create(Doc d) : Id · read(String id) : Doc
declares: public class Store
calls: src/model/Doc.java — the record
sample: src/mongo/OldStore.java — same style
closes: UC1 step 2 · UC1 step 2a · UC2 step 2
verify: ./mvnw test -Dtest=StoreTest · StoreTest

## src/rest/RestStore.java
what: the entry point
signatures: post(Doc d) : Response · get(String id) : Response
declares: public class RestStore
calls: src/mongo/Store.java — stores · src/model/Doc.java — the model
sample: src/rest/OldRest.java — same style
closes: UC1 step 1 · UC2 step 1
verify: ./mvnw test -Dtest=RestStoreTest · RestStoreTest
`)

  return root
}

test("шаг 14: нарезанные тикеты — валидный выход, а не падение хоста", () => {
  const root = ticketsRoot()
  const out = tickets.run({}, ctx(root))
  assert.equal(out.ok, true, out.blockers || out.why)
  assert.ok(out.wholeSuite.length > 0, "у репозитория нет шаблона одного теста — ворота на всём сьюте обязаны быть названы")
  const schema = Compile(tickets.output)
  assert.equal(schema.Check(out), true, `выход не проходит схему хоста: ${JSON.stringify(out)}`)
})

// --- шаг 10б: СУХОЙ ПРОГОН НАРЕЗКИ — та же нарезка, до гейта и без диска --------------------------
//
// Нарезка это две чистые функции плюс запись файлов, и всё, что она читает, лежит на диске уже к
// шагу 10: разделы плана (шаг 9), frd.xml (6), appgraph.xml (5), ripple.xml (8). Из шагов 12-13 сюда
// приходят только РАЗРЕШЕНИЕ писать и имя ветки в заголовок. Значит вопрос «нарезается ли по этому
// плану исполнимый набор» имеет ответ ДО гейта, и отвечает на него тот же код, который потом режет.
//
// Здесь проверяется ГРАНИЦА, как и у мокрого прогона: РЕАЛЬНЫЙ ответ против РЕАЛЬНОЙ схемы тем же
// валидатором, каким судит хост (четвёртый случай «Invalid output» куплен именно этим классом).
test("шаг 10б: сухой прогон считает нарезку без гейта и не пишет ни одного файла", () => {
  const root = ticketsRoot()
  rmSync(join(root, ".agent", "gate1.json"))          // состояние ШАГА 10: план ещё не утверждён

  const dry = tickets.run({ dry: true }, ctx(root))
  assert.equal(dry.ok, true, dry.blockers || dry.why)
  assert.equal(Compile(tickets.output).Check(dry), true, `выход не проходит схему хоста: ${JSON.stringify(dry)}`)
  assert.equal(existsSync(join(root, "task", "DOS-1", "tickets")), false, "сухой прогон записал наряды на диск")
  assert.ok(dry.total > 0 && dry.modules > 0 && dry.waves.length > 0)

  // Мокрый прогон после гейта обязан выдать ТОТ ЖЕ счёт: иначе оператор утверждал одно, а исполняет
  // полоса другое.
  writeFileSync(join(root, ".agent", "gate1.json"), JSON.stringify({ key: "DOS-1", plan: "x", answer: "approve" }))
  const wet = tickets.run({}, ctx(root))
  assert.equal(wet.ok, true, wet.blockers || wet.why)
  assert.equal(wet.total, dry.total)
  assert.equal(wet.modules, dry.modules)
  assert.equal(wet.tests, dry.tests)
  assert.deepEqual(wet.waves, dry.waves)

  // Без гейта мокрый прогон по-прежнему отказывает: гейт это разрешение ПИСАТЬ, и сухой режим его
  // не отменяет, а обходит.
  rmSync(join(root, ".agent", "gate1.json"))
  assert.equal(tickets.run({}, ctx(root)).ok, false)
})

// --- ШАГ 11: КРИТИК ЗОВЁТСЯ РОВНО ОДИН РАЗ НА АРТЕФАКТ (наряд J6e) --------------------------------
//
// Критик не судит починку собственной критики: иначе на каждое замечание приходит новое, и полоса
// критикует себя вечно. Полоса — код в песочнице без импортов, поэтому шов здесь тот же, что у
// остальных её правил: читаем исходник и держим его к тому, что требует шаг.
// Полоса не сочиняет строку, по которой роль выбирает ремонт: она возит готовое поле. Собери её
// здесь снова — и проверить форму будет нечем, кроме регулярки по этому же файлу.
test("шаг 11: форму строки FEEDBACK задаёт срез критика, а не полоса", () => {
  assert.match(IZI, /fromCritic = verdict\.feedback;/)
  assert.equal(/fromCritic = verdict\.findings\.map/.test(IZI), false, "строка снова собирается в полосе")
  assert.equal(/`critic: \$\{/.test(IZI), false, "шаблон строки критика снова живёт в полосе")
})

test("шаг 11 стоит СРАЗУ за интейком и высказывается один раз", () => {
  // Место: между зелёным checkFrd и весом. Раньше нельзя — машина ещё не признала артефакт
  // разобранным; позже незачем — смысл в том, чтобы отказы МАШИНЫ ниже по полосе не случились.
  const at11 = IZI.indexOf("if (from <= 6 && !criticSpoke)")
  assert.ok(at11 > 0, "критик не вызывается после интейка")
  assert.ok(at11 < IZI.indexOf('phase("weight")'), "критик обязан стоять до веса")
  assert.ok(at11 > IZI.indexOf('phase("intake")'), "критик обязан стоять после интейка")

  // Один вызов: флаг ставится ДО вызова, поэтому даже отказ роли не даёт второго круга критики.
  assert.match(IZI, /criticSpoke = true;\s*\n\s*phase\("review"\)/)
  // `Reject` даёт роли шага 6 ровно один круг — и возвращается на 6, а не на себя.
  assert.match(IZI, /if \(verdict\.verdict === "Reject"\) \{\s*\n\s*from = 6;/)
  // Луп шага 10в отмоток НЕ ДЕЛАЕТ: после сборки плана конвейер выше закрыт, и критик с фиксером
  // доводят до рабочего состояния сам план. Единственная отмотка назад — решение ОПЕРАТОРА на гейте.
  assert.equal(/planLoop[\s\S]{0,400}rebuild/.test(IZI), false, "луп снова умеет отматывать полосу")
  // Наряд критика больше не несёт плана: предмет — требование.
  assert.equal(/PLAN, FRD, PREVIOUS, CODES/.test(IZI), false, "в наряд шага 11 всё ещё едет план")
  assert.match(IZI, /TASK, BRD, FRD, PREVIOUS, CODES: FORM\.codes, OWED: FORM\.owed, UNBACKED: FORM\.unbacked/)
})

// РЕЛЬСА lookup (наряд J15): роль просит ФАКТ, отвечает скрипт, оператор не будится.
// Живой прогон 19.08.2026: роль разбудила человека ради пути AgentConfiguration, лежавшего в
// graph-computed.xml. Здесь проверяется io этой рельсы: имена входят, строки таблицы выходят, карта
// при этом НЕ возвращается — возить 107 КБ ради одного пути незачем.
test("graphMap({resolve}): имена резолвятся без карты, ненайденное строк не даёт", () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, ".agent", "appgraph.xml"), '<appgraph grammar="4"><module path="src/rest/Store.java" pkg="rest"/></appgraph>')
  writeFileSync(join(root, ".agent", "graph-computed.xml"), `<computed>
  <decl at="src/main/java/app/configs/AgentConfiguration.java" kind="class" name="AgentConfiguration" sig="public class AgentConfiguration"/>
  <decl at="src/main/java/app/configs/AgentConfiguration.java" kind="method" name="getId()" sig="public String getId()"/>
</computed>`)

  const found = graphMap.run({ resolve: ["AgentConfiguration"] }, ctx(root))
  assert.equal(found.ok, true)
  assert.equal(found.typeRows, 1)
  assert.match(found.types, /AgentConfiguration/)
  assert.match(found.types, /src\/main\/java\/app\/configs\/AgentConfiguration\.java/)
  // Готовый ответ рельсы несёт путь, а не число: подмена поля в полосе краснит этот тест и юнит
  // steps/intake/lookup.test.mjs одновременно.
  assert.match(found.answer, /src\/main\/java\/app\/configs\/AgentConfiguration\.java/)
  assert.equal(found.text, undefined, "в режиме resolve карта не возвращается")

  // Имя, которого нет нигде: строк нет — и это законный повод спросить оператора, а не выдумать путь.
  const nothing = graphMap.run({ resolve: ["Nowhere"] }, ctx(root))
  assert.equal(nothing.typeRows, 0)
  assert.equal(Compile(graphMap.output).Check(found), true, JSON.stringify(found))
  assert.equal(Compile(graphMap.output).Check(nothing), true, JSON.stringify(nothing))
})

// Полоса: рельса есть в конверте роли и разведена с вопросом человеку.
test("шаг 6: lookup отвечает скриптом и тратит круг починки, а не круг оператора", () => {
  assert.match(IZI, /enum: \["blocked", "invalid", "question", "lookup", "escalate", "crashed"\]/)
  assert.match(IZI, /env\.kind === "lookup"/)
  assert.match(IZI, /await graphMap\(\{ resolve: want, spent: \+\+lookups, cap: LOOKUP_ROUNDS, pending: feedback \}\)/)
  // Ответ уезжает роли ФИДБЕКОМ и тратит попытку — иначе роль, спрашивающая по имени за раз,
  // крутила бы полосу вечно.
  // Полоса берёт ГОТОВЫЙ текст одним полем: составлять его здесь — это то, на чём прогон 64cebdda
  // уехал со счётчиком вместо таблицы. Сам текст судит steps/intake/lookup.test.mjs.
  // Полоса возит ОДНО поле и не принимает решений: и текст ответа, и склейку с уже стоявшими
  // замечаниями собирает срез (steps/intake/lookup.mjs — lookupAnswer + mergeFeedback, у обеих юниты).
  // Так закрыты оба дефекта 19.08.2026: счётчик вместо таблицы и присваивание вместо склейки.
  assert.match(IZI, /pending: feedback \}\)/)
  assert.match(IZI, /feedback = String\(found\.answer \|\| ""\)/)
  assert.equal(/feedback = pending \?/.test(IZI), false, "склейка снова живёт в полосе")
  assert.equal(/feedback = `lookup:/.test(IZI), false, "текст ответа снова собирается в полосе")
  // Ненайденное имя отправляет роль к оператору — но текст этого отказа живёт в
  // steps/intake/lookup.mjs и судится его юнитом; полоса лишь возит поле.
  assert.match(IZI, /LOOKUP_ROUNDS/)
  // Фраза «справок больше нет» — часть ОТВЕТА и живёт в steps/intake/lookup.mjs; полоса её не
  // сочиняет, а только передаёт счётчик. Копия фразы здесь означала бы два места одного правила.
  assert.equal(/Больше справок нет/.test(IZI), false, "текст исчерпания снова дублирован в полосе")
})

// ШАГ 3б ГОВОРИТ ВСЛУХ, ЧЕГО НЕ ПРОЧИТАЛ (наряд J18).
//
// Живой прогон eddi 19.08.2026: `focus.json` напечатал `dropped: 30 срезов, 66 клеток`, и ни одна
// строка не сказала, что среди них лежит предмет `agent` — названный `subjects[]` BRD и требованием
// R3. Роль потом спрашивала у оператора путь `AgentConfiguration.java`, правила краснели на
// существующем файле, шаг 8 встал `unknown-node`. Три остановки от одного молчания.
test("шаг 3б: непрочитанный и недочитанный предмет доезжают до лога и до наряда шага 6", () => {
  // Полоса печатает оба факта РАЗДЕЛЬНО: не прочитан вовсе и прочитан частично — это разные вещи.
  assert.match(IZI, /предметы требования НЕ прочитаны/)
  assert.match(IZI, /предметы прочитаны ЧАСТИЧНО/)
  // И передаёт первое роли шага 6 слотом наряда; пусто говорится СЛОВАМИ.
  assert.match(IZI, /UNCOVERED: NO_GAP/)
  assert.match(IZI, /нет: все предметы требования прочитаны/)
  // Факт читается из артефакта шага 3б, а не пересчитывается в полосе: одно правило — одно место.
  assert.match(IZI, /readText\(\{ path: "\.agent\/focus\.json" \}\)/)

  // Наряд роли объявляет слот и прямо запрещает додумывать то, чего рой не читал.
  // Наряд ПЛАСТА B — единственный, кто рассуждает о репозитории, и он же объявляет слот.
  const tpl = readFileSync(new URL("../steps/intake/order-b.tpl", import.meta.url), "utf8")
  assert.match(tpl, /\{UNCOVERED\}/)
  assert.match(tpl, /do not invent an operation and do not invent its contract/)
})

// --- ШАГ 6 ПРОХОДАМИ: полоса исполняется, а не сверяется регуляркой -----------------------------
//
// P3. Порядок пластов — РЕШЕНИЕ, и решение проверяется вызовом. До этого среза единственным способом
// узнать, пускает ли красный проход B в проход C, был живой прогон: пять часов и 572 000 токенов за
// ответ, который здесь стоит миллисекунду.
//
// Срез берётся из ИСХОДНИКА полосы (`$START_INTAKE`), а не переписывается сюда: копия разошлась бы с
// оригиналом на первой правке — та же дисциплина, что у среза `$START_ORDER` выше.
const INTAKE = (stubs) => {
  const src = IZI.slice(IZI.indexOf("// $START_INTAKE"), IZI.indexOf("// $END_INTAKE"))
  const names = Object.keys(stubs)
  return new Function(...names, `${src}\n  return intake`)(...names.map((n) => stubs[n]))
}

// Стенд: роль всегда отвечает «написал», гардрейл отвечает по СПИСКУ вердиктов, который задаёт тест.
const stand = ({ verdicts = {}, full = [{ ok: true }], envelopes = {} } = {}) => {
  const seen = { orders: [], keys: [], checks: [], promoted: 0, asked: [], logs: [] }
  const queue = { ...verdicts }
  const fullQ = [...full]
  return {
    seen,
    stubs: {
      readText: async () => "",
      graphMap: async () => ({ ok: true, text: "MAP", types: "TYPES", nodes: 1, bytes: 1, cap: 2, typeRows: 1, answer: "lookup: ok" }),
      answers: async () => [],
      frdForm: async () => ({ deltaForms: "Added", sources: "brd.md" }),
      reviewForm: async () => ({ owed: "R1 — …" }),
      answersBlock: () => "",
      // блок последнего обмена: стенд возвращает его дословно, чтобы шов ниже видел, ЧТО уехало роли
      answeredBlock: (_seen, asked) => ((asked || []).length ? `ОТВЕТЫ НА: ${asked.join(" | ")}` : ""),
      sized: async (step, _tpl, keys) => { seen.orders.push(step); seen.keys.push(keys); return { text: step, over: false } },
      agent: async (text) => envelopes[text] || { track: "ok" },
      checkFrd: async ({ pass }) => {
        if (!pass) return fullQ.length > 1 ? fullQ.shift() : fullQ[0]
        seen.checks.push(pass)
        const list = queue[pass]
        const v = Array.isArray(list) ? (list.length > 1 ? list.shift() : list[0]) : { ok: true }
        return v
      },
      carried: async ({ blockers }) => ({ text: String(blockers || ""), seen: [] }),
      promote: async () => { seen.promoted++ },
      askOperator: async (env, n, name) => { seen.asked.push(name) },
      charge: () => ({ n: 1, spent: false }),
      noRoundsLeft: (x) => x,
      log: (line) => seen.logs.push(line),
      exit: (e) => { throw new Error(`EXIT ${JSON.stringify(e)}`) },
      err: (kind, d) => ({ kind, ...d }),
      ENVELOPE: {},
      INTAKE_LOOPS: 3,
      LOOKUP_ROUNDS: 3,
      QUESTION_ROUNDS: 3,
      ASKED_N: 0,
    },
  }
}

test("шаг 6: четыре прохода идут по порядку, и промоут ровно один — после ПОЛНОГО суда", async () => {
  const { stubs, seen } = stand()
  await INTAKE(stubs)("", "")
  assert.deepEqual(seen.orders, ["intake/A", "intake/B", "intake/C", "intake/D"])
  assert.deepEqual(seen.checks, ["A", "B", "C", "D"])
  assert.equal(seen.promoted, 1)
})

test("шаг 6: красный проход не пускает в следующий, а зелёный не переигрывается", async () => {
  const { stubs, seen } = stand({
    verdicts: { B: [{ ok: false, blockers: "F3 узел" }, { ok: false, blockers: "F3 узел" }, { ok: true }] },
  })
  await INTAKE(stubs)("", "")
  // B чинился трижды, и всё это время C и D не начинались
  assert.deepEqual(seen.checks, ["A", "B", "B", "B", "C", "D"])
  // A написан ОДИН раз: закрытый пласт не переписывается из-за красного соседа
  assert.equal(seen.orders.filter((x) => x === "intake/A").length, 1)
  assert.equal(seen.orders.filter((x) => x === "intake/B").length, 3)
})

test("шаг 6: круги проходу отпущены свои — исчерпал B, полоса встаёт на B и не идёт в C", async () => {
  const { stubs, seen } = stand({ verdicts: { B: [{ ok: false, blockers: "F3 узел" }] } })
  await assert.rejects(() => INTAKE(stubs)("", ""), /проход B шага 6: цикл исчерпан/)
  assert.equal(seen.checks.includes("C"), false, "после исчерпанного B полоса вошла в C")
  assert.equal(seen.promoted, 0)
})

test("шаг 6: вопрос задаёт ЛЮБОЙ проход, и пауза названа его именем", async () => {
  const { stubs, seen } = stand()
  // Роль прохода C спрашивает ОДИН раз и после ответа пишет файл. Важно двоякое: вопрос вообще
  // возможен не только в A, и имя паузы несёт пласт — иначе вопрос прохода C и вопрос прохода B
  // схлопнутся в одну паузу, а хост ключует паузу по имени (CLAUDE.md, ограничение 4).
  let askedOnce = false
  stubs.agent = async (text) => {
    if (text === "intake/C" && !askedOnce) { askedOnce = true; return { track: "err", kind: "question", items: ["какой HTTP-код?"] } }
    return { track: "ok" }
  }
  await INTAKE(stubs)("", "")
  assert.deepEqual(seen.asked, ["intake-C"])
  // и вопрос НЕ съел круг починки: пласт C собрал два наряда, но потратил ноль попыток
  assert.equal(seen.orders.filter((x) => x === "intake/C").length, 2)
})

test("шаг 6: возврат от критика входит в НАЗВАННЫЙ проход и идёт от него вперёд", async () => {
  const { stubs, seen } = stand()
  await INTAKE(stubs)("critic: invented-value · S1", "B")
  assert.deepEqual(seen.orders, ["intake/B", "intake/C", "intake/D"])
  assert.equal(seen.orders.includes("intake/A"), false, "пласт A переигран без нужды")
})

test("шаг 6: красный ПОЛНЫЙ суд возвращает полосу в ранний пласт, а не поднимает эскалацию", async () => {
  const { stubs, seen } = stand({
    full: [{ ok: false, blockers: "F3c дельта без сценария", pass: "B" }, { ok: true }],
  })
  await INTAKE(stubs)("", "")
  // первый заход A→D, полный суд красен и назвал B; второй заход с B и до конца
  assert.deepEqual(seen.orders, ["intake/A", "intake/B", "intake/C", "intake/D", "intake/B", "intake/C", "intake/D"])
  assert.equal(seen.promoted, 1)
})

test("шаг 6: гейт сьютов и промоут стоят на ПОЛНОМ суде, а не в проходе", async () => {
  const { stubs, seen } = stand({
    full: [{ ok: false, ask: true, subject: "узел без сьюта", items: ["a"], why: "нет сьюта" }, { ok: true }],
  })
  await INTAKE(stubs)("", "")
  assert.deepEqual(seen.asked, ["intake"])
  assert.equal(seen.promoted, 1)
})

// ЧЕК-ЛИСТ ДОЛГА СЧИТАЕТСЯ ИЗ BRD, И FRD ЕМУ НЕ НУЖЕН. Полоса зовёт `reviewForm` в проходе D шага 6,
// когда артефакта ещё нет ни в staging, ни промоутнутого: общий ранний возврат обнулял ОБА поля, и
// роль получала «(нет FRD: чек-лист пуст)» — 24 символа вместо двух килобайт списка.
test("reviewForm: долг перед требованиями есть и БЕЗ артефакта — пуст только обратный ход", () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, ".agent", "brd.md"), [
    "R1 Посылку можно найти по номеру",
    "   fit: GET /parcels/{id} возвращает посылку",
    "R2 Список фильтруется по статусу",
    "   fit: GET /parcels?status=… возвращает только этот статус",
    "subjects[]: посылка", "analogue: —", "open-questions: 0",
  ].join("\n"))

  const out = reviewForm.run({}, ctx(root))
  assert.match(out.owed, /^R1 — /m, "долг обнулён отсутствием FRD")
  assert.match(out.owed, /^R2 — /m)
  assert.doesNotMatch(out.owed, /чек-лист пуст/)
  assert.match(out.unbacked, /артефакта ещё нет/, "обратный ход обязан САМ сказать, почему он пуст")
})

test("шаг 6: возврат от критика кладёт промоутнутый артефакт ОБРАТНО на стол, а не начинает с нуля", async () => {
  // promote ПЕРЕМЕЩАЕТ: после зелёного шага по staging-пути пусто, и роль прохода A читает наряд
  // буквально — «пусто значит ты ещё ничего не писал». Живой прогон 19.08.2026: 8 use case, 15 дельт,
  // 9 полей и 17 строк <carried> исчезли за один перезаход.
  const { stubs, seen } = stand()
  const moved = []
  stubs.readText = async ({ path }) => (path === ".agent/frd.xml" ? "<frd>…четыре пласта…</frd>" : "")
  stubs.promote = async ({ from, to }) => { moved.push(`${from} → ${to}`); seen.promoted++ }
  await INTAKE(stubs)("critic: requirement-not-carried · R1", "A")
  assert.equal(moved[0], ".agent/frd.xml → .agent/staging/frd.xml", "артефакт не вернули на правку")

  // а на ПЕРВОМ проходе шага (не возврат) ничего никуда не возвращается
  const first = stand()
  first.stubs.readText = async ({ path }) => (path === ".agent/frd.xml" ? "<frd>…</frd>" : "")
  const movedFirst = []
  first.stubs.promote = async ({ from, to }) => { movedFirst.push(from) }
  await INTAKE(first.stubs)("", "")
  assert.deepEqual(movedFirst, [".agent/staging/frd.xml"], "на первом проходе двигается только промоут")
})

// Q1: РАЗГОВОР ОСТАЁТСЯ АРТЕФАКТОМ. `pending.json` стирается в тот же миг, и без записи узнать после
// прогона, о чём роль спрашивала на шаге, неоткуда — а разбор начинается именно с этого.
test("clearPending: закрытый обмен ложится в .agent/ask.xml и только потом стирает pending", () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent", "staging"), { recursive: true })
  writeFileSync(join(root, ".agent", "staging", "frd.xml"), "<frd>черновик на 31 символ</frd>")
  writeFileSync(join(root, ".agent", "pending.json"), JSON.stringify({
    subject: "s", evidence: "e",
    items: [{ n: 1, text: "нужен GET по id?" }, { n: 2, text: "код отказа?" }],
  }))
  writeFileSync(join(root, ".agent", "answers.md"), [
    "<exchange>",
    "  <question_1>нужен GET по id?</question_1>",
    "  <answer_1>да, нужен GET /parcels/{id}</answer_1>",
    "  <question_2>код отказа?</question_2>",
    "  <answer_2>422</answer_2>",
    "</exchange>",
  ].join("\n"))

  const out = clearPending.run({ step: "intake", pass: "A", draft: ".agent/staging/frd.xml" }, ctx(root))
  assert.equal(out.asked, 2)
  const ask = readFileSync(join(root, ".agent", "ask.xml"), "utf8")
  assert.match(ask, /<ask step="intake" pass="A" draft="32">/, "не записан размер черновика на момент вопроса")
  assert.match(ask, /<a n="1">да, нужен GET \/parcels\/\{id\}<\/a>/)
  assert.equal(existsSync(join(root, ".agent", "pending.json")), false, "pending стёрт — это и есть закрытие обмена")

  // второй обмен ДОПИСЫВАЕТСЯ, а не затирает первый
  writeFileSync(join(root, ".agent", "pending.json"), JSON.stringify({ subject: "s2", items: [{ n: 1, text: "второй вопрос?" }] }))
  writeFileSync(join(root, ".agent", "answers.md"), readFileSync(join(root, ".agent", "answers.md"), "utf8") +
    "\n<exchange>\n  <question_1>второй вопрос?</question_1>\n  <answer_1>второй ответ</answer_1>\n</exchange>")
  clearPending.run({ step: "intake", pass: "C" }, ctx(root))
  const both = readFileSync(join(root, ".agent", "ask.xml"), "utf8")
  assert.equal((both.match(/<ask /g) || []).length, 2, "второй обмен затёр первый")
  assert.match(both, /<ask step="intake" pass="C" draft="0">/, "проход C спросил ДО того, как написал — draft=0")
  // и в записи прохода C нет вопросов прохода A: обмен — это ответы на СВОИ вопросы
  assert.equal(both.split("<ask ")[2].includes("нужен GET по id"), false)
})

test("newRun уносит разговор прошлого прогона вместе с ответами", () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, ".agent", "answers.md"), "<exchange></exchange>")
  writeFileSync(join(root, ".agent", "ask.xml"), '<ask step="intake" pass="A" draft="0">\n</ask>\n')
  newRun.run({}, ctx(root))
  assert.equal(existsSync(join(root, ".agent", "ask.xml")), false, "разговор остался рядом с новыми ответами")
  assert.match(readFileSync(join(root, ".agent", "prev", "ask.xml"), "utf8"), /<ask step="intake"/)
})


// Q2: ОТВЕТ ОПЕРАТОРА ЕДЕТ ОТДЕЛЬНЫМ БЛОКОМ. Накопленная история {ANSWERS} к пятому обмену весит
// полторы тысячи символов, и новые ответы в ней ничем не выделены: живой прогон 19.08.2026 — роль
// применила один ответ из трёх и закрылась зелёной.
test("шаг 6: после ответа роль получает ИМЕННО свой обмен, а не только общую историю", async () => {
  const { stubs, seen } = stand()
  let askedOnce = false
  stubs.agent = async (text) => {
    if (text === "intake/B" && !askedOnce) { askedOnce = true; return { track: "err", kind: "question", items: ["в каком модуле поле?", "как назвать поле?"] } }
    return { track: "ok" }
  }
  await INTAKE(stubs)("", "")

  const bOrders = seen.keys.filter((_, i) => seen.orders[i] === "intake/B")
  assert.equal(bOrders.length, 2, "проход B собрал не два наряда")
  assert.equal(bOrders[0].ANSWERED, "(вопросов ты ещё не задавал)", "до вопроса блок обязан говорить это СЛОВАМИ")
  assert.match(bOrders[1].ANSWERED, /ОТВЕТЫ НА: в каком модуле поле\? \| как назвать поле\?/, "обмен не доехал до роли")

  // и он есть в наряде КАЖДОГО прохода: спросил один пласт, перечитывать может следующий
  for (const p of ["A", "B", "C", "D"]) {
    const k = seen.keys[seen.orders.indexOf(`intake/${p}`)]
    assert.ok("ANSWERED" in k, `наряд ${p} без слота ANSWERED`)
  }
})

// L0: ПРОДОЛЖЕНИЕ НЕ ТЕРЯЕТ ОТВЕТОВ. Каждый ответ — пауза человека, и унести их у прогона, который
// продолжает ту же работу, значит спросить всё заново. Прогон 19.08.2026 дошёл до гейта 1 с пятью
// обменами; реворк после него перезапускается — и без этого правила терял бы их все.
test("newRun: прогон с нуля уносит состояние, продолжение — оставляет", () => {
  const make = (withLog) => {
    const root = tempRoot()
    mkdirSync(join(root, ".agent", "staging"), { recursive: true })
    writeFileSync(join(root, ".agent", "answers.md"), "<exchange>\n  <question_1>q</question_1>\n  <answer_1>a</answer_1>\n</exchange>")
    writeFileSync(join(root, ".agent", "ask.xml"), '<ask step="intake" draft="0">\n</ask>\n')
    writeFileSync(join(root, ".agent", "staging", "frd.xml"), "<frd/>")
    if (withLog) {
      // журнал, в котором шаг 1 закрыт и его артефакт цел → лестница войдёт ВЫШЕ первого шага
      writeFileSync(join(root, "TASK.md"), "task: DOS-1\n")
      runlogMark.run({ step: 1, name: "task", status: "done", artifacts: ["TASK.md"] }, ctx(root))
    }
    return root
  }

  const scratch = make(false)
  const a = newRun.run({}, ctx(scratch))
  assert.equal(a.kept, false)
  assert.equal(a.answers, 1, "прогон с нуля обязан унести ответы")
  assert.equal(existsSync(join(scratch, ".agent", "answers.md")), false)
  assert.equal(existsSync(join(scratch, ".agent", "prev", "ask.xml")), true)

  const cont = make(true)
  const b = newRun.run({}, ctx(cont))
  assert.equal(b.kept, true, "журнал говорит, что шаг 1 закрыт — это продолжение")
  assert.equal(b.answers, 0, "у продолжения не унесено ничего, и лог обязан это сказать")
  assert.equal(existsSync(join(cont, ".agent", "answers.md")), true, "ответы унесены у продолжения")
  assert.equal(existsSync(join(cont, ".agent", "ask.xml")), true, "разговор унесён у продолжения")
  // staging чистится в ОБОИХ случаях: недописанный черновик прошлой попытки не наследуется
  assert.equal(existsSync(join(cont, ".agent", "prev", "staging", "frd.xml")), true)
})

// L3: ПРАВКА ПО ЯКОРЮ ПРИМЕНЯЕТСЯ МАШИНОЙ. Роль называет строку дословно; не нашли — отказ, а не
// вставка наугад. Иначе фиксер, промахнувшийся якорем, тихо пишет не туда.
test("planFix: правка по якорю применяется, промах якорем — отказ без записи", () => {
  const root = tempRoot()
  mkdirSync(join(root, "task", "DOS-1"), { recursive: true })
  const before = "## 7. GlossaryService.java\nfields: glossaryCache: Map<String, Glossary> — cache\n"
  writeFileSync(join(root, "task", "DOS-1", "PLAN.md"), before)

  const good = planFix.run({ target: "task/DOS-1/PLAN.md",
    patch: "REPLACE: fields: glossaryCache: Map<String, Glossary> — cache\nfields: glossaryCache: Caffeine Cache — TTL 5 minutes" }, ctx(root))
  assert.equal(good.ok, true)
  assert.match(readFileSync(join(root, "task", "DOS-1", "PLAN.md"), "utf8"), /Caffeine Cache — TTL 5 minutes/)

  const now = readFileSync(join(root, "task", "DOS-1", "PLAN.md"), "utf8")
  const bad = planFix.run({ target: "task/DOS-1/PLAN.md", patch: "REPLACE: строки, которой нет\nчто-то" }, ctx(root))
  assert.equal(bad.ok, false)
  assert.match(bad.why, /no such line in the file/)
  assert.equal(readFileSync(join(root, "task", "DOS-1", "PLAN.md"), "utf8"), now, "файл тронут при отказе")
})

// L2 на диске: маршрут смотрит в НАСТОЯЩИЙ план, а не в слова находки.
test("planRoute: правка раздела — в круге, потерянный модуль — через требование", () => {
  const root = tempRoot()
  mkdirSync(join(root, "task", "DOS-1"), { recursive: true })
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, "TASK.md"), "task: DOS-1\n")
  writeFileSync(join(root, "task", "DOS-1", "PLAN.md"), "## 7. src/app/GlossaryService.java\nfields: cache\n")
  writeFileSync(join(root, ".agent", "frd.xml"), `<frd><scenario nodes="src/app/Weigher.java"/></frd>`)

  const out = planRoute.run({ verdict: [
    "R17 | PLAN LOST | src/app/GlossaryService.java | заменить Map на Caffeine",
    "R11 | PLAN LOST | (отсутствует модуль) | добавить ссылку в src/app/Weigher.java",
    "R12 | PLAN LOST | (отсутствует модуль) | добавить ссылку в src/app/Unknown.java",
  ].join("\n") }, ctx(root))
  assert.equal(out.found, 3)
  assert.deepEqual(out.plan.length, 1, "правка существующего раздела чинится в круге")
  assert.deepEqual(out.design.length, 1, "модуль знает требование, а плана нет — переигрывание")
  assert.deepEqual(out.frd.length, 1, "модуля не знает и требование — сперва оно")
  assert.match(out.plan[0], /R17/)
  assert.match(out.design[0], /R11/)
  assert.match(out.frd[0], /R12/)
  // Пути, названные находками, — вход nodeFacts: их называет разборщик, а не роль по прозе.
  assert.ok(out.paths.includes("src/app/Weigher.java"))
})

// L4: ЛУП НАД ПЛАНОМ ВКЛЮЧАЕТСЯ ДВАЖДЫ и разводит находки по цене починки.
test("шаг 10в: луп стоит до гейта, слова оператора уходят в него, маршруты разведены", () => {
  // до гейта — сам по себе, и только потом презентация человеку
  assert.ok(IZI.indexOf('phase("planreview")') < IZI.indexOf('phase("gate1")'), "критик плана после гейта")

  // слова оператора с гейта не откатывают полосу, а входят в тот же луп
  assert.match(IZI, /fromGate = back\.note;/)
  // ЧЕТВЁРТОЕ РЕШЕНИЕ ГЕЙТА — единственная законная отмотка, и объявляет её человек: требования нет
  // в источнике, правкой плана его не создать. Полоса идёт к доработке требований и интейку.
  assert.match(IZI, /back\.requirements[\s\S]{0,300}from = 2;/, "гейт не умеет вернуть полосу к требованиям")
  assert.match(readFileSync(new URL("../steps/plan/gate.mjs", import.meta.url), "utf8"),
    /requirements: <какое требование упущено>/, "оператору не сказали, что такое решение есть")
  assert.match(IZI, /слова уходят критику плана/)
  assert.equal(/const back = await gating\(\);[\s\S]{0,200}from = 6;/.test(IZI), false,
    "гейт снова откатывает на шаг 6 в обход критика плана")

  // ПОСЛЕ СБОРКИ ПЛАНА КОНВЕЙЕР ВЫШЕ ЗАКРЫТ. Остаются трое: критик находит, фиксер правит, гардрейлы
  // не дают сломать. Отмоток у лупа нет — ни на 6, ни на 9: артефакты шагов 6-9 к этому моменту
  // материал, из которого план собран.
  //
  // BUG_FIX_CONTEXT: прогон c972e5c2 (20.08.2026). Пять настоящих находок; полоса починила
  // требование и ушла на пересборку, ОТБРОСИВ четыре находки плана — их предстояло найти заново
  // новым кругом критика после двух вызовов ролей. Повторная работа не бесплатна.
  const loop = IZI.slice(IZI.indexOf("async function planLoop("))
  const body = loop.slice(0, loop.indexOf("\nasync function ", 1))
  assert.equal(/from = 6|from = 9/.test(body), false, "луп сам двигает полосу вместо того, чтобы вернуть решение")
  // Правится ИСТОЧНИК — карточка партии: `PLAN.md` собирает planbook из карточек, и правка в
  // документе живёт лишь до первой пересборки.
  assert.match(body, /for \(const \[target, lines\] of byCard\)[\s\S]{0,300}judge: "card"/,
    "фиксер правит документ вместо карточки — правки пропадут при пересборке")
  assert.match(EXT, /judge === "card"[\s\S]{0,700}writeFileSync\(at\(root, target\), before\)/,
    "правка карточки, после которой план не режется, остаётся на диске")
  // Потерянный модуль патчем не дописывается: модули берутся из `nodes` сценариев требования
  // (card.mjs::partsOf), и раздел, вписанный в документ, сотрёт первый же вход в шаг 9.
  // Требование правит СКРИПТ: путь назвал разборщик, use case — строка `<carried>`, сценарий один.
  // Роль здесь не нужна, а значит и не ошибётся — две её правки требования 20.08.2026 были мимо.
  assert.match(body, /await frdAdopt\(\{ path: node, req/, "потерянный модуль не усыновляется скриптом")
  assert.equal(/fixOne\(\{ target: FRD_PATH_LOOP/.test(body), false, "требование всё ещё правит роль")
  assert.match(body, /return \{ replay:/, "план не переигрывается после починки требования")

  // ГАРДРЕЙЛ ВМЕСТО ОТМОТКИ: нарезка судит правку ДО записи, и красная откатывается.
  assert.match(EXT, /judge === "cut"[\s\S]{0,600}writeFileSync\(at\(root, target\), before\)/,
    "правка, после которой план не режется, остаётся на диске")

  // Промах якорем и отказ нарезки — один класс: замечание о собственном ответе роли, СВОИМ блоком.
  assert.match(body, /broke = put\.blockers \|\| put\.why/, "отказ гардрейла не едет фиксеру")
  assert.match(body, /rejected: missed/, "замечание прошлого круга не доезжает до фиксера")

  // Наряд фиксера говорит СЛОВАРЁМ ХАРНЕСА: PREVIOUS — твой артефакт, FEEDBACK — почему он вернулся,
  // строки помечены источником. Своих имён блоков наряд не изобретает: роль обучена этим словам
  // всеми остальными нарядами конвейера, а у нового имени прошлого опыта нет.
  const fixTplText = readFileSync(new URL("../steps/planreview/order.fix.tpl", import.meta.url), "utf8")
  assert.match(fixTplText, /\$START_PREVIOUS/, "артефакт фиксера едет не блоком PREVIOUS")
  assert.match(fixTplText, /\$START_FEEDBACK/, "замечания едут не блоком FEEDBACK")
  assert.doesNotMatch(fixTplText, /\$START_REJECTED/, "наряд снова изобрёл свой блок")
  assert.match(fixTplText, /`critic:`/, "не сказано, что делать со строкой критика")
  assert.match(fixTplText, /`guardrail:` — YOUR LAST ANSWER WAS REFUSED/, "промах не отделён от находок")
  // форму строки задаёт СРЕЗ, а не полоса (тот же договор, что у шага 11)
  assert.match(IZI, /await planFeedback\(\{ findings, rejected/)
})

// N2: ВЕЛИЧИНА, КОТОРОЙ ПЛАН НЕ НЕСЁТ, СТАНОВИТСЯ РАБОТОЙ. У `<nfr>` нет адреса — его ищет модель по
// цепочкам; полоса лишь считает, чего не хватает, и той же функцией, что судит потраченный ответ
// оператора (F13): твёрдый знак либо есть в плане, либо нет.
test("planFeedback: величина без своего знака в плане едет строкой nfr:, с знаком — молчит", () => {
  const root = tempRoot()
  mkdirSync(join(root, "task", "DOS-1"), { recursive: true })
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, "TASK.md"), "task: DOS-1\n")
  writeFileSync(join(root, ".agent", "frd.xml"), `<frd goal="g">
    <usecase id="UC1" actor="api" goal="g"><post>p</post><step n="1">s</step></usecase>
    <nfr subject="cache-ttl" fit="5 minutes" source="brd.md R17"/>
    <nfr subject="style" fit="по образцу соседнего модуля" source="brd.md R2"/>
  </frd>`)
  writeFileSync(join(root, "task", "DOS-1", "PLAN.md"), "## 1. src/app/Store.java\nfields: cache: Map\n")

  const out = planFeedback.run({ findings: "", rejected: "", nfrs: true }, ctx(root))
  assert.equal(out.count, 1, "величина без твёрдых знаков взята в работу либо потерянная пропущена")
  assert.match(out.text, /^nfr: cache-ttl = 5 minutes \(источник brd\.md R17\)$/m)
  assert.equal(out.text.includes("style"), false, "«по образцу» проверке не поддаётся — правило молчит")

  // величина доехала — работы нет
  writeFileSync(join(root, "task", "DOS-1", "PLAN.md"), "## 1. src/app/Store.java\nfields: cache: Caffeine TTL 5 minutes\n")
  assert.equal(planFeedback.run({ nfrs: true }, ctx(root)).count, 0)
})

// КАЖДАЯ РОЛЬ, КОТОРУЮ ЗОВЁТ ПОЛОСА, ОБЯЗАНА БЫТЬ ОБЪЯВЛЕНА РАСШИРЕНИЮ. Роли резолвятся ТОЛЬКО из
// `roleDirectories`: файл роли, лежащий в срезе, но не названный здесь, для хоста не существует.
//
// BUG_FIX_CONTEXT: живой прогон 20.08.2026, первая же секунда. Полоса позвала `plan-fixer`, хост
// ответил `Unknown agent type: plan-fixer`, прогон умер до шага 9. Срез `steps/planreview/` был
// написан, испытан и даже проигран по артефактам — и не объявлен. Ни один шов этого не видел:
// тесты зовут роли не через хост.
test("роль, которую зовёт полоса, объявлена в roleDirectories", () => {
  const izi = readFileSync(new URL("../workflows/izi.js", import.meta.url), "utf8")
  const called = new Set([...izi.matchAll(/\brole:\s*"([^"]+)"/g)].map((m) => m[1]))
  const INDEX = readFileSync(new URL("./index.mjs", import.meta.url), "utf8")
  // Каталоги ролей берутся из САМОГО расширения: список в тесте разошёлся бы с реестром молча.
  // Шаг 9 стал модулем с подшагами (steps/plan/tree/, flows/, values/), поэтому сегмент может быть
  // составным — регулярка это допускает.
  const dirs = [...INDEX.matchAll(/steps\/([a-z/-]+)\/", import\.meta\.url\)/g)].map((m) => m[1])
  const declared = new Set()
  for (const d of dirs) {
    for (const f of readdirSync(new URL(`../steps/${d}/`, import.meta.url)).filter((x) => x.endsWith(".md"))) {
      if (!/^description:/m.test(readFileSync(new URL(`../steps/${d}/${f}`, import.meta.url), "utf8").split("---")[1] || "")) continue
      declared.add(f.replace(/\.md$/, ""))
    }
  }
  // Имя роли в наряде — имя ФАЙЛА роли, БУКВА В БУКВУ: так их резолвит хост.
  for (const r of called) {
    assert.ok(declared.has(r),
      `полоса зовёт роль «${r}», а файла steps/*/${r}.md нет в roleDirectories — прогон умрёт на «Unknown agent type»`)
  }
  // ...и имя обязано быть уникальным на все каталоги: хост склеивает роли в один словарь и отвергает
  // МЕТАДАННЫЕ целиком при совпадении имён — прогон не стартует вовсе.
  const seen = new Map()
  for (const d of dirs) {
    for (const f of readdirSync(new URL(`../steps/${d}/`, import.meta.url)).filter((x) => x.endsWith(".md"))) {
      if (!/^description:/m.test(readFileSync(new URL(`../steps/${d}/${f}`, import.meta.url), "utf8").split("---")[1] || "")) continue
      const name = f.replace(/\.md$/, "")
      assert.ok(!seen.has(name), `роль «${name}» объявлена дважды: steps/${seen.get(name)}/ и steps/${d}/ — хост отвергнет метаданные`)
      seen.set(name, d)
    }
  }
})

// АДРЕСНАЯ КНИГА ЕДЕТ ФИКСЕРУ. Узел называет роль, а знает его КАРТА: без списка путей роль пишет
// его по памяти, и живой прогон 20.08.2026 это купил — `…/agent/AgentConfig.java` вместо
// `…/configs/agents/model/AgentConfiguration.java`. Гардрейл поймал (F3 «файла нет ни в карте, ни в
// репозитории»), но круг лупа был потрачен на опечатку, которую нечем было не сделать.
test("шаг 10в: фиксер получает список путей карты, а не вспоминает их", () => {
  const root = tempRoot()
  mkdirSync(join(root, "task", "DOS-1"), { recursive: true })
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, "TASK.md"), "task: DOS-1\n")
  writeFileSync(join(root, "task", "DOS-1", "PLAN.md"), "## 1. src/app/A.java\n")
  writeFileSync(join(root, ".agent", "appgraph.xml"),
    `<map><module path="src/app/A.java"/><module path="src/app/very/deep/AgentConfiguration.java"/></map>`)

  const r = planReview.run({}, ctx(root))
  assert.deepEqual(r.known.split("\n"), ["src/app/A.java", "src/app/very/deep/AgentConfiguration.java"],
    "хост не отдаёт адресную книгу — фиксеру нечего копировать")

  const tpl = readFileSync(new URL("../steps/planreview/order.fix.tpl", import.meta.url), "utf8")
  assert.match(tpl, /\{KNOWN\}/, "наряд фиксера не несёт книгу")
  assert.match(tpl, /ADDRESS BOOK/, "наряд не говорит, что путь КОПИРУЕТСЯ, а не вспоминается")
  assert.match(IZI, /KNOWN: known \|\| ""/, "полоса не подставляет книгу в наряд")
  // ПОЛЯ ПО ИМЕНАМ, А НЕ ПО ПОРЯДКУ: прогон c972e5c2 умер на `Invalid input for planFeedback`,
  // потому что дописанная шестым аргументом книга села в слот `nfrs`. Шов проверяет ИМЯ, а не факт
  // присутствия строки в скобках.
  for (const m of IZI.matchAll(/fixOne\((.*?)\);/g)) {
    assert.match(m[1], /^\{ target[,:]/, `вызов fixOne позиционными аргументами: ${m[1].slice(0, 70)}`)
    assert.match(m[1], /known: src\.known/, `вызов fixOne без адресной книги: ${m[1].slice(0, 70)}`)
  }
})

// ПРАВКА ТРЕБОВАНИЯ — ТРАНЗАКЦИЯ. Поставку держит отметка журнала (sha256): записать в неё то, что
// не прошло суд, — значит порвать отметку, и следующий запуск войдёт не в луп, а в переписывание
// требования с нуля. Прогон 20.08.2026 заплатил за этот порядок полным шагом 6.
test("planFix judge=frd: красная правка НЕ доезжает до диска", () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, "TASK.md"), "task: DOS-1\n")
  writeFileSync(join(root, ".agent", "appgraph.xml"), `<map><module path="src/app/A.java"/></map>`)
  writeFileSync(join(root, ".agent", "brd.md"), "R1 требование\n   fit: любое\n")
  const frd = `<frd>\n  <deltas>\n    <delta op="a" form="Changed" node="src/app/A.java" from="x" to="y"/>\n  </deltas>\n</frd>\n`
  writeFileSync(join(root, ".agent", "frd.xml"), frd)
  const before = readFileSync(join(root, ".agent", "frd.xml"), "utf8")

  const bad = planFix.run({ target: ".agent/frd.xml", judge: "frd", patch:
    `INSERT AFTER:     <delta op="a" form="Changed" node="src/app/A.java" from="x" to="y"/>\n    <delta op="b" form="Changed" node="src/app/NOPE.java" from="x" to="y"/>` }, ctx(root))
  assert.equal(bad.ok, false, "правка с выдуманным узлом принята")
  assert.match(bad.blockers || "", /NOPE\.java/, "блокеры не вернулись автору правки")
  assert.equal(readFileSync(join(root, ".agent", "frd.xml"), "utf8"), before, "красная правка попала на диск")
  assert.equal(existsSync(join(root, ".agent", "frd.xml.candidate")), false, "кандидат остался лежать в run state")
})

// ПРАВКЕ ВМЕНЯЕТСЯ ТОЛЬКО ЕЁ СОБСТВЕННЫЙ УЩЕРБ. Артефакт приезжает в луп с долгом, которого он не
// делал: правило F13 завели ПОСЛЕ прогона 19.08.2026, и требование того прогона красно им сегодня.
// Требовать от точечной правки закрыть этот долг — тупик: роль не может (ответа оператора у неё
// нет), круги кончатся, и полоса уйдёт на шаг 6 в обход всей дешёвой ветки.
test("planFix judge=frd: старый долг артефакта не вменяется новой правке", () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, "TASK.md"), "task: DOS-1\n")
  const many = ["A", "B", "C", "D", "E"].map((x) => `src/app/${x}.java`)
  writeFileSync(join(root, ".agent", "appgraph.xml"), `<map>${many.map((p) => `<module path="${p}"/>`).join("")}</map>`)
  writeFileSync(join(root, ".agent", "brd.md"), "R1 требование\n   fit: любое\n")
  // Артефакт УЖЕ красен: дельта на узел, которого нет в карте.
  const frd = [
    `<frd>`,
    `  <scenario id="S1" uc="UC1" before="a" after="b" nodes="src/app/A.java"/>`,
    `  <deltas>`,
    `    <delta op="a" form="Changed" node="src/app/GHOST.java" from="x" to="y"/>`,
    `  </deltas>`,
    `</frd>`,
  ].join("\n") + "\n"
  writeFileSync(join(root, ".agent", "frd.xml"), frd)
  assert.equal(checkFrd.run({ path: ".agent/frd.xml" }, ctx(root)).ok, false, "фикстура должна быть красной")

  // Правка ПОЛНАЯ: узел получает и дельту, и место в сценарии — своего долга она не создаёт.
  const good = planFix.run({ target: ".agent/frd.xml", judge: "frd", patch:
    `REPLACE:   <scenario id="S1" uc="UC1" before="a" after="b" nodes="src/app/A.java"/>\n  <scenario id="S1" uc="UC1" before="a" after="b" nodes="src/app/A.java src/app/B.java"/>\n\n` +
    `INSERT AFTER:     <delta op="a" form="Changed" node="src/app/GHOST.java" from="x" to="y"/>\n    <delta op="b" form="Changed" node="src/app/B.java" from="p" to="q"/>` }, ctx(root))
  assert.equal(good.ok, true, `правка отвергнута чужим долгом: ${good.blockers || good.why}`)
  assert.match(readFileSync(join(root, ".agent", "frd.xml"), "utf8"), /src\/app\/B\.java/, "правка не записана")
})


// ДВА ДЕФЕКТА ОДНОГО ПРОГОНА e1f7b5c8 (20.08.2026), и оба про то, что круг лупа обязан быть честным.
//
// ① Путь доставки роли ПУСТ до вызова. Круг 2: фиксер не записал ничего, `planfix.txt` нёс правку
//    круга 1, полоса применила её повторно. Спас якорь — план не тронут, но круг потрачен.
// ② Находка, чья правка НЕ ЛЕГЛА, переживает круг. Круг 3: критик назвал ноль находок, и полоса
//    объявила план чистым — с открытой R11, той самой дырой, из-за которой оператор забраковал план.
test("шаг 10в: staging чистится перед ролью, а незакрытая находка переживает пустой вердикт", () => {
  const loop = IZI.slice(IZI.indexOf("async function planLoop("))
  const body = loop.slice(0, loop.indexOf("\nasync function ", 1))
  const fix = IZI.slice(IZI.indexOf("async function fixOne("))
  const fixBody = fix.slice(0, fix.indexOf("\nasync function ", 1))

  assert.match(fixBody, /clearStaged\(\{ path: STAGED_FIX \}\)[\s\S]{0,400}agent\(fix\.text/,
    "фиксера зовут, не очистив путь доставки — ответ прошлого круга сойдёт за этот")
  assert.match(body, /clearStaged\(\{ path: STAGED_VERDICT \}\)[\s\S]{0,900}agent\(order\.text/,
    "критика зовут, не очистив путь доставки")
  assert.match(fixBody, /роль ничего не записала/, "молчание роли неотличимо от промаха якорем")
  // ОБРЫВ ЗАПИСИ ПОВТОРЯЕТСЯ НА МЕСТЕ, а не кругом лупа: круг стоит вызова КРИТИКА сверху.
  // Прогон da99bbae: `write` вернул «Operation aborted», роль отчиталась об успехе, файл пуст.
  assert.match(fixBody, /take <= WRITE_TAKES && !patch/, "оборванная запись роли не повторяется")
  assert.match(fixBody, /запись роли не доехала, заход/, "повтор молчит — из лога не видно, что было")

  assert.match(body, /const open = \[\.\.\.new Set\(\[\.\.\.owed/, "долг прошлых кругов не подмешивается к находкам")
  assert.match(body, /if \(!open\.length && !routed\.frd\.length && !routed\.design\.length\)/,
    "выход из лупа судит только вердикт круга, забыв долг и потерянные модули")
  assert.match(body, /owed = open;/, "не легла правка — долг не записан")
  assert.match(body, /owed = \[\];/, "легла правка — долг не снят")
  assert.match(body, /НЕ ЗАКРЫТО \$\{left\.length\}/, "план уходит к гейту молча, с открытыми находками")
  // Находка, которую скрипт не смог усыновить, НЕ едет фиксеру плана: он закрыл бы её разделом без
  // партии, уровня и зависимостей — то есть работой, которую никто не нарежет.
  assert.match(body, /stuck = \[\.\.\.new Set\(\[\.\.\.stuck, line\]\)\]/, "неусыновлённое подмешивается к долгу плана")
  assert.equal(/owed = \[\.\.\.new Set\(\[\.\.\.owed, line\]\)\]/.test(body), false, "неусыновлённое всё ещё уедет фиксеру плана")
  // Правка кладётся в карточку ТОГО модуля, о котором находка: якорь чужой карточки не найдётся.
  // ПРАВКА АДРЕСОВАНА ТОМУ ЖЕ АРТЕФАКТУ, КОТОРЫЙ СУДИЛ КРИТИК. Раньше находки разводились по
  // карточкам партий, чтобы пережить пересборку PLAN.md из них; карточек нет с 21.08.2026, и
  // единственный законный адрес правки — план, который критик и читал (`src.at`).
  assert.match(body, /const byCard = new Map\(\[\[src\.at, \[\.\.\.open\]\]\]\)/,
    "правка адресована не тому артефакту, который судил критик")
  // Выбор карточки по модулю находки удалён вместе с карточками: адрес правки теперь один.
})

// СИГНАТУРЫ И ВЫЗОВЫ БЕРУТСЯ С ДИСКА. Раздел про СУЩЕСТВУЮЩИЙ файл роль писать не может: в наряде у
// неё были только ПУТИ, а объявлений — ни одного. Сигнатура, придуманная по имени класса, читается
// исполнителем как факт и уводит писать не тот код.
//
// BUG_FIX_CONTEXT: прогон e1f7b5c8 (20.08.2026). Фиксеру велели дописать раздел про
// `AgentConfiguration.java`; вычисленный граф несёт по нему 151 объявление и ребро на
// `HitlTimeoutPolicy.java`, и ничего из этого в наряд не ехало.
test("шаг 10в: фиксер получает объявления и вызовы названных файлов", () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, "TASK.md"), "task: DOS-1\n")
  writeFileSync(join(root, ".agent", "graph-computed.xml"),
    `<computed><decl at="src/app/A.java" kind="class" name="A"/><decl at="src/app/A.java" kind="method" name="run()"/>` +
    `<edge from="src/app/A.java" to="src/app/B.java"/></computed>`)
  writeFileSync(join(root, ".agent", "appgraph.xml"), `<map><module path="src/app/A.java"/></map>`)

  const r = nodeFacts.run({ paths: ["src/app/A.java", "src/app/NOPE.java"] }, ctx(root))
  assert.equal(r.nodes, 1, "молчащий файл не должен занимать место в наряде")
  assert.match(r.text, /class A/)
  assert.match(r.text, /method run\(\)/)
  assert.match(r.text, /calls: src\/app\/B\.java/, "рёбра файла не доехали — `calls:` будет из головы")

  // Пути роль не выковыривает из прозы: их называет разборщик вердикта.
  const routed = planRoute.run({ verdict: "R1 | PLAN LOST | src/app/A.java | добавить поле" }, ctx(root))
  assert.deepEqual(routed.paths, ["src/app/A.java"])

  const tpl = readFileSync(new URL("../steps/planreview/order.fix.tpl", import.meta.url), "utf8")
  assert.match(tpl, /\{FACTS\}/, "наряд не несёт фактов")
  assert.match(IZI, /nodeFacts\(\{ paths: routed\.paths/, "полоса не запрашивает факты")
  assert.match(IZI, /FACTS: facts/, "факты не подставлены в наряд")
  // Очередь работ роль не пишет: её считает нарезка по `calls:` и карте.
  assert.match(tpl, /You do not number the work and you do not order it/, "роли не сказали, что волну считает машина")
})

// УСЫНОВЛЕНИЕ УЗЛА — СКРИПТ. Модуль входит в план ТОЛЬКО через `nodes` сценария требования
// (steps/design/card.mjs::partsOf), и всё, что для этого нужно, вычислимо: путь назвал разборщик
// вердикта, use case — строка `<carried req>`, сценарий у него один, текст дельты — сама находка.
//
// BUG_FIX_CONTEXT: 20.08.2026, две правки требования от роли подряд — якорь из чужого артефакта,
// затем выдуманный путь. Обе поймал гардрейл, обе стоили круга лупа.
test("frdAdopt: узел вписан в сценарий и дельту, а спорное — отказ, а не догадка", () => {
  const root = tempRoot()
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, "TASK.md"), "task: DOS-1\n")
  writeFileSync(join(root, ".agent", "appgraph.xml"),
    `<map><module path="src/app/A.java"/><module path="src/app/Cfg.java"/></map>`)
  writeFileSync(join(root, ".agent", "brd.md"), "R1 требование\n   fit: любое\n")
  writeFileSync(join(root, ".agent", "frd.xml"), [
    `<frd>`,
    `  <carried req="R7" by="UC1/2"/>`,
    `  <scenario id="S1" uc="UC1" before="a" after="b" nodes="src/app/A.java"/>`,
    `  <deltas>`,
    `    <delta op="a" form="Changed" node="src/app/A.java" from="x" to="y"/>`,
    `  </deltas>`,
    `</frd>`,
  ].join("\n") + "\n")

  const ok = frdAdopt.run({ path: "src/app/Cfg.java", req: "R7", what: "хранить ссылки на словари" }, ctx(root))
  assert.equal(ok.ok, true, `скрипт не смог вписать узел: ${ok.blockers || ok.why}`)
  const now = readFileSync(join(root, ".agent", "frd.xml"), "utf8")
  assert.match(now, /nodes="src\/app\/A\.java src\/app\/Cfg\.java"/, "узел не дописан в сценарий — в план он не войдёт")
  assert.match(now, /<delta op="r7"[^>]*node="src\/app\/Cfg\.java"[^>]*to="хранить ссылки на словари"/, "дельта не написана")

  // Второй раз — уже на месте: скрипт отказывает, а не плодит дубли.
  assert.match(frdAdopt.run({ path: "src/app/Cfg.java", req: "R7" }, ctx(root)).why || "", /уже назван сценарием/)
  // Требования без <carried> скрипт не трогает: выбирать сценарий было бы догадкой.
  assert.match(frdAdopt.run({ path: "src/app/Other.java", req: "R99" }, ctx(root)).why || "", /нет строки <carried/)
})

// ПРАВКА ЖИВЁТ В ИСТОЧНИКЕ. `PLAN.md` — производный документ: `planbook` копирует его разделы из
// карточек партий. Правка, положенная в документ, исчезает при первой же пересборке — а пересборка
// случается всякий раз, когда требование получает новый модуль.
//
// BUG_FIX_CONTEXT: 20.08.2026. Луп внёс в PLAN.md четыре правки (константа resource URI, ключ
// шаблона `glossary`, Caffeine вместо Map, исключение под 422) и величину `5 minutes`; карточка
// осталась прежней, и переигрывание плана вернуло бы документ к её тексту.
// РАЗДЕЛ С ОТСТУПОМ — ТИХАЯ ПОТЕРЯ РАБОТЫ. Правка, порождающая такой заголовок, отвергается: раздел
// не увидит ни покрытие, ни нарезка, а следующий круг критика увидит его СЛОВА и промолчит.
//
// BUG_FIX_CONTEXT: прогон 7d8e36b5 (20.08.2026). `INSERT AFTER` унёс отступ якоря, раздел про
// `AgentConfiguration.java` стал текстом внутри соседа: разделов 11, нарядов 16, наряда на модуль
// нет — и план ушёл на гейт «чистым».
test("planFix: правка, прячущая раздел отступом, не доезжает до диска", () => {
  const root = tempRoot()
  const dir = join(root, "task", "DOS-1")
  mkdirSync(join(dir, "design"), { recursive: true })
  mkdirSync(join(root, ".agent"), { recursive: true })
  writeFileSync(join(root, "TASK.md"), "task: DOS-1\n")
  const card = "task/DOS-1/design/src-app.md"
  writeFileSync(join(root, card), "## src/app/A.java\nwhat: работа\nverify: ATest#works — closes: UC1 step 1\n")
  const before = readFileSync(join(root, card), "utf8")

  const bad = planFix.run({ target: card, judge: "card",
    patch: "INSERT AFTER: verify: ATest#works — closes: UC1 step 1\n  ## src/app/B.java\n  what: невидимая работа" }, ctx(root))
  assert.equal(bad.ok, false, "раздел с отступом принят — работа исчезнет молча")
  assert.match(bad.blockers || "", /не на нулевой колонке/)
  assert.match(bad.blockers || "", /ПОСЛЕДНЮЮ строку файла/, "роли не сказано, как починить")
  assert.equal(readFileSync(join(root, card), "utf8"), before, "карточка тронута")

})

// ПЕРЕИГРЫВАНИЕ ПЛАНА — ТОЖЕ БЮДЖЕТ. Счётчик кругов лупа обнуляется при каждом заходе в шаг 10в,
// а лента крутится в `for (;;)`: без предела «критик нашёл модуль → усыновили → пересобрали →
// критик нашёл ещё один» повторяется, пока не кончится терпение человека. Каждый заход стоит двух
// вызовов ролей и около восьми минут.
test("лента: переигрываний плана не больше PLAN_REPLAYS за прогон", () => {
  assert.match(IZI, /const PLAN_REPLAYS = \d/, "предела переигрываниям нет")
  assert.match(IZI, /verdict\.replay && replays >= PLAN_REPLAYS/, "бюджет не проверяется перед отмоткой")
  assert.match(IZI, /replays\+\+/, "счётчик переигрываний не растёт")
  assert.match(IZI, /переигрывания исчерпаны[\s\S]{0,120}НЕ ЗАКРЫТО/,
    "бюджет исчерпан молча — оператор не узнает, что осталось незакрытым")
})



// УДАЛЕНО 21.08.2026: 11 теста проводки старого шага 9 (design · parts · part · partJoin ·
// chainsJoin · planbook · planCard). Сами функции удалены вместе с шагом — docs/plan.md.

// УДАЛЕНО 21.08.2026: 8 швов проводки старого шага 9 (проходы A/B, порции карточки,
// расстановка величин по карточкам). Код, который они сторожили, удалён; правила, которые
// переживают переделку, получат свои швы вместе с новым шагом — docs/plan.md §3.
