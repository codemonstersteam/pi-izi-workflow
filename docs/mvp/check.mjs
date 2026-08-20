// Проверка консистентности пакета плана DOS-535: frd.xml × module-tree.xml × data-flow.xml × PLAN.md.
//
// Скрипт НИЧЕГО НЕ ВЫВОДИТ и ничего не решает — он сверяет то, что объявила модель, и называет обе
// стороны расхождения. Каждая проверка опровержима: у неё есть вход, и её ответ либо «сошлось», либо
// «X объявлен здесь, а Y его не знает».
//
// Запуск: node .agent/mvp/check.mjs   (из корня прогона)
import { readFileSync } from "node:fs"

const read = (p) => readFileSync(p, "utf8")
const attrs = (s) => Object.fromEntries([...s.matchAll(/([a-z]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]))
const B = []
const ok = []

const frd = read(".agent/frd.xml")
const tree = read(".agent/mvp/module-tree.xml")
const flow = read(".agent/mvp/data-flow.xml")
const plan = read(".agent/mvp/PLAN.md")

// --- разбор ------------------------------------------------------------------------------------
const modules = [...tree.matchAll(/<module ([^>]*)>([\s\S]*?)<\/module>/g)].map((m) => ({
  ...attrs(m[1]),
  needs: [...m[2].matchAll(/<need path="([^"]+)"/g)].map((n) => n[1]),
  body: m[2],
}))
const steps = [...flow.matchAll(/<step ([^>]*)\/>/g)].map((m) => attrs(m[1]))
const deltas = [...frd.matchAll(/<delta ([^>]*)\/>/g)].map((m) => attrs(m[1]))
const failures = [...frd.matchAll(/<failure ([^>]*)\/>/g)].map((m) => attrs(m[1]))
const ucs = [...frd.matchAll(/<usecase id="([^"]+)"[^>]*>([\s\S]*?)<\/usecase>/g)].map((m) => ({
  id: m[1],
  steps: [...m[2].matchAll(/<step n="(\d+)">/g)].map((s) => s[1]),
  exts: [...m[2].matchAll(/<ext id="([^"]+)"/g)].map((e) => e[1]),
}))

// --- 1. каждый модуль требования есть в дереве и наоборот ---------------------------------------
const inTree = new Set(modules.map((m) => m.path))
const inFrd = new Set(deltas.map((d) => d.node))
const missing = [...inFrd].filter((p) => !inTree.has(p))
const extra = [...inTree].filter((p) => !inFrd.has(p))
if (missing.length) B.push(`в дереве нет модулей требования: ${missing.join(", ")}`)
if (extra.length) B.push(`в дереве есть модули, которых нет в дельтах требования: ${extra.join(", ")}`)
if (!missing.length && !extra.length) ok.push(`модули: ${inTree.size} — состав дерева совпадает с дельтами требования`)

// --- 2. отношение needs разрешается и ациклично --------------------------------------------------
for (const m of modules) for (const n of m.needs) if (!inTree.has(n)) B.push(`${m.path} требует ${n}, а такого модуля в дереве нет`)
const deps = new Map(modules.map((m) => [m.path, new Set(m.needs)]))
const done = new Set()
let moved = true
while (moved) {
  moved = false
  for (const m of modules) if (!done.has(m.path) && [...deps.get(m.path)].every((d) => done.has(d))) { done.add(m.path); moved = true }
}
const cyc = modules.filter((m) => !done.has(m.path)).map((m) => m.path)
if (cyc.length) B.push(`отношение needs замкнуто в круг: ${cyc.join(" · ")}`)
else ok.push("needs: кругов нет — очередь работ строится")

// --- 3. волна модуля не меньше волны того, без чего его не написать ------------------------------
for (const m of modules) for (const n of m.needs) {
  const dep = modules.find((x) => x.path === n)
  if (dep && Number(dep.wave) >= Number(m.wave)) B.push(`${m.path} (волна ${m.wave}) требует ${n}, который стоит в волне ${dep.wave} — не раньше`)
}
if (!B.some((b) => b.includes("не раньше"))) ok.push("волны: каждый нужный модуль стоит раньше того, кому он нужен")

// --- 4. у каждого значения потока ровно один порождающий модуль ----------------------------------
const producers = new Map()
for (const s of steps) if (s.role !== "проношу") {
  producers.set(s.out, new Set([...(producers.get(s.out) || []), s.module]))
}
for (const [v, who] of producers) if (who.size > 1) B.push(`значение «${v}» порождают ${who.size} модуля: ${[...who].map((p) => p.split("/").pop()).join(", ")}`)
if (![...producers.values()].some((w) => w.size > 1)) ok.push(`значения: ${producers.size} порождаемых, у каждого ровно один порождающий модуль`)

// --- 5. каждое потребляемое значение кем-то порождено либо приходит извне ------------------------
const external = new Set(steps.filter((s) => s.n === "1").map((s) => s.in))
for (const s of steps) if (!producers.has(s.in) && !external.has(s.in)) B.push(`${s.module.split("/").pop()} потребляет «${s.in}», которое никто не порождает и которое не входит в систему извне`)
if (!B.some((b) => b.includes("никто не порождает"))) ok.push(`потоки: ${steps.length} шагов, каждый вход либо порождён, либо внешний`)

// --- 6. каждый шаг и каждое ветвление требования закрыты шагом потока ----------------------------
const closed = new Set(steps.map((s) => s.closes))
for (const u of ucs) {
  for (const n of u.steps) if (!closed.has(`${u.id}/${n}`)) B.push(`шаг ${u.id}/${n} требования не закрыт ни одним шагом потока`)
  for (const e of u.exts) if (!closed.has(`${u.id}/${e}`)) B.push(`ветвление ${u.id}/${e} требования не закрыто ни одним шагом потока`)
}
if (!B.some((b) => b.includes("не закрыт"))) ok.push(`покрытие: все шаги и ветвления ${ucs.length} use case закрыты`)

// --- 7. каждый модуль потока есть в дереве, и наоборот -------------------------------------------
const inFlow = new Set(steps.map((s) => s.module))
for (const p of inFlow) if (!inTree.has(p)) B.push(`поток называет модуль ${p}, которого нет в дереве`)
// ОБЪЯВЛЕНИЕ В ПОТОКЕ НЕ УЧАСТВУЕТ, И ЭТО НЕ ДЕФЕКТ. Модель данных, интерфейс, запись — у них нет
// поведения в рантайме: за них работает реализация. Их доказывает ДРУГОЕ отношение: до них обязан
// дотягиваться needs от модуля, который в потоке есть. Первый прогон этой проверки честно отбил
// Glossary, IGlossaryStore и IResourceSource — и был неправ именно этим: спрашивал с объявления
// поведение. Ровно та же ошибка три дня гоняла роль по кругу «модуль не связан → дай связь → круг».
const reachable = new Set(inFlow)
let grew = true
while (grew) {
  grew = false
  for (const m of modules) if (reachable.has(m.path)) for (const n of m.needs) if (!reachable.has(n)) { reachable.add(n); grew = true }
}
const mute = [...inTree].filter((p) => !reachable.has(p))
if (mute.length) B.push(`модули дерева не участвуют ни в одном потоке и до них не дотягивается needs ни от одного участника потока: ${mute.join(", ")} — их работу нечем проверить`)
if (!mute.length && [...inFlow].every((p) => inTree.has(p))) {
  const decl = [...inTree].filter((p) => !inFlow.has(p))
  ok.push(`дерево и потоки сходятся: ${inFlow.size} модулей работают в потоках, ${decl.length} — объявления, доказанные через needs (${decl.map((p) => p.split("/").pop()).join(", ")})`)
}

// --- 8. каждый код отказа порождается в потоке ---------------------------------------------------
for (const f of failures) {
  const born = steps.find((s) => s.out === f.code && s.role === "отвергаю")
  if (!born) B.push(`код отказа ${f.code} объявлен требованием, но ни один шаг потока его не порождает`)
  const shown = steps.find((s) => s.out.startsWith(`${f.status} ${f.code}`))
  if (!shown) B.push(`отказ ${f.code} нигде не превращается в статус ${f.status}`)
}
if (!B.some((b) => b.includes("код отказа") || b.includes("не превращается"))) ok.push(`отказы: ${failures.length} кода — каждый порождён и каждый доехал до статуса`)

// --- 9. каждый модуль дерева назван в плане ------------------------------------------------------
for (const m of modules) {
  const short = m.path.replace("src/main/java/ai/labs/eddi/", "")
  if (!plan.includes(short)) B.push(`модуль ${short} есть в дереве, но в PLAN.md о нём ни строки`)
}
if (!B.some((b) => b.includes("ни строки"))) ok.push("план: каждый модуль дерева имеет раздел в PLAN.md")

// --- 10. NFR доехал до плана ---------------------------------------------------------------------
for (const n of [...frd.matchAll(/<nfr ([^>]*)\/>/g)].map((m) => attrs(m[1]))) {
  if (!plan.includes(n.fit)) B.push(`величина ${n.subject} = «${n.fit}» объявлена требованием, но в плане её нет`)
  else ok.push(`величина ${n.subject} = «${n.fit}» доехала до плана`)
}

// --- вывод ---------------------------------------------------------------------------------------
console.log("СОШЛОСЬ:")
for (const o of ok) console.log("  ✓", o)
console.log(B.length ? `\nНЕ СОШЛОСЬ (${B.length}):` : "\nНЕ СОШЛОСЬ: ничего")
for (const b of B) console.log("  ✗", b)
process.exit(B.length ? 1 : 0)
