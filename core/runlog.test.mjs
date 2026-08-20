// Ядро журнала — чистое: ни диска, ни времени, отпечатки приезжают снимком. Формула «1 happy + Σ
// ветвей с различимым следствием»: круговой разбор, отказ писателя, замена отметки, единицы шага и
// пять исходов лестницы — нет отметки · оборвало · артефакт исчез · артефакт изменён · всё закрыто.
import test from "node:test"
import assert from "node:assert/strict"
import { newLog, render, begin, mark, ticket, resumeAt, done, pending, LAST_STEP } from "./runlog.mjs"

const A = (path, sha256) => ({ path, sha256 })
const step = (log, n, over = {}) => mark(log, { step: n, name: `s${n}`, status: "done", at: "2026-08-18T00:00:00Z", ...over })

// Полоса, пройденная до шага 6 включительно: у каждого шага отметка и артефакт.
const upTo = (n, arts = {}) => {
  let l = begin(null, { key: "DOS-535", at: "2026-08-18T00:00:00Z" })
  for (let i = 1; i <= n; i++) l = step(l, i, { artifacts: arts[i] || [] })
  return l
}
const fingerprints = (log) => Object.fromEntries(log.steps.flatMap((s) => s.artifacts.map((a) => [a.path, a.sha256])))

test("happy: журнал переживает круг «собрали → разобрали» без потерь", () => {
  const l = ticket(
    step(begin(null, { key: "DOS-535", at: "2026-08-18T00:41:12Z" }), 6, {
      name: "intake", note: "дельт 15", artifacts: [A(".agent/frd.xml", "81be07")],
    }),
    { id: "02", wave: 0, status: "green", at: "2026-08-18T02:10:44Z" },
  )
  const text = render(l)
  assert.equal(text.ok, true, text.ok ? "" : text.error.detail)
  // Человек и `yq` читают то же самое, что и мы: два уровня, список отображений, скаляры без кавычек.
  assert.match(text.value, /^key: DOS-535\nstarted: 2026-08-18T00:41:12Z\nsteps:\n {2}- step: 6\n/)
  assert.match(text.value, /\n {4}artifact: \.agent\/frd\.xml\n {4}sha256: 81be07\n/)

  const back = newLog(text.value)
  assert.equal(back.ok, true, back.ok ? "" : back.error.detail)
  assert.deepEqual(back.value, l)
})

test("несколько артефактов у одного шага — списком, и он тоже возвращается целым", () => {
  const l = step(begin(null, { key: "K", at: "T" }), 9, {
    name: "design/chains", artifacts: [A(".agent/design-graph.xml", "90ac"), A(".agent/data-flow.md", "3ff1")],
  })
  const text = render(l)
  assert.match(text.value, /\n {4}artifacts:\n {6}- path: \.agent\/design-graph\.xml\n {8}sha256: 90ac\n/)
  assert.deepEqual(newLog(text.value).value, l)
})

// ГРАНИЦА ФОРМАТА ОБЪЯВЛЕНА, А НЕ ЗАКОДИРОВАНА (приём core/answers.mjs): писатель ОТКАЗЫВАЕТ, вместо
// того чтобы записать строку, которая разберётся обратно как что-то другое.
//
// Судится СТРУКТУРНОЕ поле и лог, собранный руками: `note` фабрика сворачивает сама (тест ниже), и
// проверять на нём границу писателя значит проверять фабрику, а не писателя.
test("писатель отказывает значению, которого формат не выдержит", () => {
  const nl = render(step(begin(null, {}), 2, { name: "design\nsteps:\n  - step: 99" }))
  assert.equal(nl.ok, false)
  assert.equal(nl.error.cls, "unwritable")
  assert.match(nl.error.detail, /name/)

  // Писатель судит ТО, ЧТО ЕМУ ДАЛИ: лог мимо фабрики с сырым переносом в заметке — отказ.
  const raw = render({ key: "K", started: "T", steps: [{ step: 2, name: "s2", status: "done", at: "T", note: "a\nb" }] })
  assert.equal(raw.ok, false)
  assert.match(raw.error.detail, /note/)

  const dash = render(step(begin(null, {}), 2, { name: "- это открыло бы новый элемент списка" }))
  assert.equal(dash.ok, false)
})

// ЗАМЕТКА ОДНОСТРОЧНА ПО ПОСТРОЕНИЮ, И ЭТО РЕШАЕТ ФАБРИКА.
//
// BUG_FIX_CONTEXT: прогон 5b52f76d (20.08.2026). Сухая нарезка отказала двумя строками, полоса
// отметила шаг 9 на переигрывание с `note: why.slice(0, 80)` — срез режет ДЛИНУ, а не перенос, —
// писатель отказал, ext бросил исключение, и прогон умер как `crashed` через секунды после того, как
// PLAN.md был собран. Заметку кормят блокеры гардрейлов и проза оператора: сворачивать её обязан код.
test("заметка многострочна на входе и однострочна на диске — и возвращается целой", () => {
  const many = "iglossarystore (волна 2) ждёт то, что лежит не раньше: glossarystore волна 3\n  irestglossarystore (волна 2) ждёт restglossarystore волна 3"
  const text = render(step(begin(null, { key: "K", at: "T" }), 9, { note: many }))
  assert.equal(text.ok, true, "многострочная заметка обязана записаться, а не убить прогон")
  const back = newLog(text.value)
  assert.equal(back.ok, true)
  assert.equal(back.value.steps[0].note, "iglossarystore (волна 2) ждёт то, что лежит не раньше: glossarystore волна 3 · irestglossarystore (волна 2) ждёт restglossarystore волна 3")

  // Ведущий дефис открыл бы новый элемент списка — фабрика снимает и его.
  assert.equal(render(step(begin(null, {}), 2, { note: "- заметка с дефиса" })).ok, true)
})

test("читатель отказывает неизвестному ключу — опечатка не становится тихой потерей", () => {
  assert.equal(newLog("key: K\nsteps:\n  - step: 6\n    stauts: done\n").error.cls, "malformed")
  assert.equal(newLog("key: K\nwiegth: patch\n").error.cls, "malformed")
  assert.equal(newLog("key: K\n    name: сирота\n").error.cls, "malformed")
})

test("тотальность: ни один вход не роняет и не выдумывает", () => {
  assert.deepEqual(newLog("").value.steps, [])
  assert.deepEqual(newLog(undefined).value.steps, [])
  assert.equal(render(null).ok, true)
  assert.equal(render(undefined).value, "\n")
  assert.deepEqual(mark(null).steps.length, 1)
  assert.deepEqual(ticket(undefined, { id: "01" }).tickets.length, 1)
  assert.deepEqual(pending(null, {}), [])
  assert.equal(done(undefined, {}), false)
  assert.equal(resumeAt(null).from, 1)
})

// Отметка ЗАМЕНЯЕТСЯ, а не копится: повторный шаг не растит файл, и «сделан» всегда один.
test("повторная отметка шага заменяет прежнюю, единицы живут отдельно", () => {
  let l = step(begin(null, {}), 4, { status: "running" })
  l = mark(l, { step: 4, unit: "spine", status: "done" })
  l = mark(l, { step: 4, unit: "backup", status: "done" })
  l = step(l, 4, { status: "done" })

  assert.equal(l.steps.filter((s) => s.step === 4 && !s.unit).length, 1, "шагов-отметок больше одной")
  assert.equal(l.steps.find((s) => s.step === 4 && !s.unit).status, "done")
  assert.equal(done(l, { step: 4 }), true)
  assert.equal(done(l, { step: 4, unit: "spine" }), true)
  assert.equal(done(l, { step: 4, unit: "docs" }), false)
})

// Ради чего зерно мельче шага: разведка и партии шага 9 входят В СЕРЕДИНУ стадии.
test("pending отдаёт только несделанные единицы, в порядке вызывающего", () => {
  let l = mark(begin(null, {}), { step: 4, unit: "spine", status: "done" })
  l = mark(l, { step: 4, unit: "backup", status: "running" })
  assert.deepEqual(pending(l, { step: 4, of: ["spine", "backup", "llm"] }), ["backup", "llm"])
  assert.deepEqual(pending(l, { step: 9, of: ["spine"] }), ["spine"], "чужой шаг ничего не закрывает")
})

test("лестница: первый незакрытый шаг, и она называет причину", () => {
  const arts = { 2: [A(".agent/brd.md", "4f2a")], 6: [A(".agent/frd.xml", "81be")] }

  // ① журнала нет
  assert.equal(resumeAt(newLog("").value, { seen: {} }).from, 1)
  assert.match(resumeAt(newLog("").value, { seen: {} }).why, /журнала нет/)

  // ② дошли до 6 — входим с 7, и позади ровно шесть закрытых
  const six = upTo(6, arts)
  const r = resumeAt(six, { seen: fingerprints(six) })
  assert.equal(r.from, 7)
  assert.deepEqual(r.closed, [1, 2, 3, 4, 5, 6])

  // ③ оборвало на шаге: статус остался running — входим в него, а не мимо
  const cut = step(upTo(5, arts), 6, { status: "running" })
  assert.equal(resumeAt(cut, { seen: fingerprints(cut) }).from, 6)
  assert.match(resumeAt(cut, { seen: fingerprints(cut) }).why, /оборвало/)

  // ④ артефакт исчез — отметка одна не считается
  const gone = { ...fingerprints(six), ".agent/frd.xml": null }
  assert.equal(resumeAt(six, { seen: gone }).from, 6)
  assert.match(resumeAt(six, { seen: gone }).why, /исчез: \.agent\/frd\.xml/)

  // ⑤ артефакт правили руками после отметки — переигрываем шаг
  const edited = { ...fingerprints(six), ".agent/frd.xml": "ffff" }
  assert.equal(resumeAt(six, { seen: edited }).from, 6)
  assert.match(resumeAt(six, { seen: edited }).why, /изменён после отметки/)

  // ⑥ полоса пройдена целиком — band(LAST_STEP + 1) не делает ничего
  const all = upTo(LAST_STEP, arts)
  assert.equal(resumeAt(all, { seen: fingerprints(all) }).from, LAST_STEP + 1)
})

// Единица закрыта, а шаг — нет: ничто здесь не знает, сколько единиц шаг был должен, поэтому закрыть
// шаг может только его собственная отметка.
test("единицы не закрывают шаг сами по себе", () => {
  let l = upTo(3, {})
  l = mark(l, { step: 4, unit: "spine", status: "done" })
  assert.equal(resumeAt(l, { seen: {} }).from, 4)
})

// Дефект, купленный заменой на живых артефактах eddi: запись со СПИСКОМ артефактов, а следом другая
// запись. Разбор оставался в режиме списка и читал `- step:` как артефакт — журнал из двенадцати
// закрытых шагов объявлялся испорченным, и полоса шла с начала.
test("запись со списком артефактов не съедает следующую", () => {
  let l = step(begin(null, { key: "K", at: "T" }), 9, {
    name: "design", artifacts: [A(".agent/design-graph.xml", "90ac"), A(".agent/data-flow.md", "3ff1")],
  })
  l = step(l, 12, { name: "gate1", artifacts: [A(".agent/gate1.json", "c31d")] })
  l = step(l, 13, { name: "branch", artifacts: [A(".agent/branch.json", "aa01")] })

  const back = newLog(render(l).value)
  assert.equal(back.ok, true, back.ok ? "" : back.error.detail)
  assert.deepEqual(back.value.steps.map((s) => s.step), [9, 12, 13])
  assert.deepEqual(back.value, l)
})

// Шаг, отложенный до своего наряда, обязан быть ЗАПИСАН пропущенным. Иначе лестница встаёт на нём
// навсегда и переигрывает всё, что стоит за ним, — а за шагами 10 и 11 стоят гейт, ветка и тикеты.
test("пропущенный шаг закрывает ступень наравне со сделанным", () => {
  let l = upTo(9, {})
  for (const n of [10, 11]) l = mark(l, { step: n, name: "отложен", status: "skipped" })
  l = step(l, 12, { name: "gate1" })
  assert.equal(resumeAt(l, { seen: {} }).from, 13)
  assert.equal(done(l, { step: 10 }), true)

  // А «оборвало» пропуском не считается: running — это вход в шаг, а не проход мимо него.
  const cut = mark(upTo(9, {}), { step: 10, status: "running" })
  assert.equal(resumeAt(cut, { seen: {} }).from, 10)
})

// Второй дефект той же границы, купленный живым прогоном: `note` пишется ПОСЛЕ списка артефактов.
// Разбор спотыкался на нём, io молча отдавал пустой журнал, и отметка начинала его с чистого листа —
// двенадцать закрытых шагов исчезали без единого сообщения.
test("поле записи после списка артефактов читается как поле, а не как артефакт", () => {
  const l = step(begin(null, { key: "K", at: "T" }), 9, {
    name: "design", note: "признан старой лестницей",
    artifacts: [A(".agent/design-graph.xml", "90ac"), A(".agent/data-flow.md", "3ff1")],
  })
  const back = newLog(render(l).value)
  assert.equal(back.ok, true, back.ok ? "" : back.error.detail)
  assert.equal(back.value.steps[0].note, "признан старой лестницей")
  assert.deepEqual(back.value, l)
})
