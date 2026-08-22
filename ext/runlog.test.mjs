// ЮНИТЫ ТРЕЙСА. Тикет T05. Главный из них — round-trip: формат, который мы и пишем, и читаем,
// обязан пережить свой самый трудный законный текст (standards/code.md, $START_TESTS).
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, writeFileSync, chmodSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { begin, inbox, llm, out, verdict, end, read, pathOf, CUT_AT } from "./runlog.mjs"

const root = () => mkdtempSync(join(tmpdir(), "izi-runlog-"))
const why = (r) => (r.ok ? "" : r.error.detail)

test("round-trip: записали ход → прочитали → ответ модели вернулся ДОСЛОВНО", () => {
  const d = root()
  // Самое трудное законное значение для XML: угловые скобки, амперсанд, кавычки, кириллица, пустая строка.
  const ANSWER = '<module path="src/Loan.java" why="параметр типа IResourceStore&Co">\n\n  «текст» & <hides/>\n</module>'
  begin(d, "r1", "plan/tree")
  llm(d, "r1", "plan/tree", { role: "tree-designer", order: "наряд", answer: ANSWER, tokens: { in: 6120, out: 7835, reasoning: 6462 } })
  out(d, "r1", "plan/tree", ".agent/tree.xml")
  verdict(d, "r1", "plan/tree", { ok: true, id: "1" })
  end(d, "r1", "plan/tree", "done")

  const r = read(d, "r1")
  assert.equal(r.ok, true, why(r))
  assert.equal(r.value.length, 1)
  assert.equal(r.value[0].step, "plan/tree")
  assert.equal(r.value[0].status, "done")
  assert.equal(r.value[0].answers[0].role, "tree-designer")
  assert.equal(r.value[0].answers[0].answer, ANSWER, "ответ не пережил трейс — заглушку теста брать неоткуда")
  assert.deepEqual(r.value[0].out, [".agent/tree.xml"])
  assert.equal(r.value[0].verdicts[0].ok, true)
})

test("XML валиден ПОСЛЕ КАЖДОЙ записи — корень закрыт на каждом ходе", () => {
  const d = root()
  begin(d, "r1", "brd")
  const mid = readFileSync(pathOf(d, "r1"), "utf8")
  assert.match(mid, /<\/run>\s*$/, "после первой же записи корень не закрыт — файл, оборванный здесь, не читается")
  inbox(d, "r1", "brd", { task: "TASK.md" })
  assert.match(readFileSync(pathOf(d, "r1"), "utf8"), /<\/run>\s*$/)
})

test("запись без имени шага — отказ: трейс станет нечитаемым", () => {
  const r = begin(root(), "r1", "")
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /шага/)
})

test("запись llm без имени роли — отказ: заглушку теста потом не найти", () => {
  const r = llm(root(), "r1", "brd", { answer: "x" })
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /роли/)
})

test("длинный текст режется С ОТМЕТКОЙ, а не молча", () => {
  const d = root()
  const long = "я".repeat(CUT_AT + 500)
  llm(d, "r1", "brd", { role: "gilb", answer: long })
  const rec = read(d, "r1").value[0].answers[0]
  assert.equal(rec.cut, 500, "рез не отмечен — урезанный молча трейс лжёт")
  assert.equal(rec.answer.length, CUT_AT)
})

test("отказ записи помечается в трейсе: следующая удавшаяся несёт <gap lost>", () => {
  const d = root()
  begin(d, "r1", "brd")
  chmodSync(pathOf(d, "r1"), 0o444)                      // диск отказал ровно на одной записи
  const bad = llm(d, "r1", "brd", { role: "gilb", answer: "этот ответ потерян" })
  assert.equal(bad.ok, false, "запись в файл только для чтения прошла — значит отказ проглочен")
  assert.match(bad.error.detail, /не удалась/)

  chmodSync(pathOf(d, "r1"), 0o644)                      // диск снова пишет
  const good = out(d, "r1", "brd", ".agent/brd.md")
  assert.equal(good.ok, true, why(good))
  assert.match(readFileSync(pathOf(d, "r1"), "utf8"), /<gap lost="1"\/>/,
    "потеря не отмечена — пропущенная запись неотличима от «вердикта не было», и проверка по трейсу перестаёт доказывать")
})

test("read: трейса нет — отказ, а не пустой список", () => {
  const r = read(root(), "r1")
  assert.equal(r.ok, false)
})

test("read: файл оборван на середине шага — читается всё, что успело лечь", () => {
  const d = root()
  begin(d, "r1", "brd")
  llm(d, "r1", "brd", { role: "gilb", answer: "черновик" })
  const text = readFileSync(pathOf(d, "r1"), "utf8").replace(/<\/run>\s*$/, "")
  writeFileSync(pathOf(d, "r1"), text)          // прогон умер до закрытия корня
  const r = read(d, "r1")
  assert.equal(r.ok, true, why(r))
  assert.equal(r.value[0].status, "open", "оборванный шаг выдал себя за закрытый")
  assert.equal(r.value[0].answers[0].answer, "черновик")
})
