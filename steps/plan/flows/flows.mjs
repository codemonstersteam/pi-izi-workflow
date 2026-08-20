// MODULE_CONTRACT: flows — шаг 9C: что происходит с данными, когда система работает
// Purpose:    одно решение — ПОКРЫТИЕ: каждый шаг требования и каждое его ветвление закрыты чьим-то
//             шагом потока, у каждого значения ровно один порождающий модуль, каждый код отказа
//             где-то рождается и куда-то доезжает. Порядок РАБОТ отсюда не выводится и выводиться не
//             может: поток цикличен по природе — запрос идёт вниз, ответ вверх (docs/plan.md §0).
// io:         none
// EXTERNAL_DEPENDENCY: steps/plan/tree/tree.mjs — parseTree: модули потока обязаны быть модулями
//             дерева, и список у них ОДИН. Второй разбор дерева здесь означал бы, что поток говорит
//             о модулях, которых в работе нет.
// EXTERNAL_DEPENDENCY: core/xml.mjs — attrs/elem.
// Invariants: `role` — из словаря; значение порождает ровно один модуль; объявление (модель, интерфейс)
//             в потоке не участвует и участвовать не обязано — его доказывает `needs` дерева.
// Interface:  ROLES, flowsSkeleton, parseFlows, checkFlows

import { attrs, elem } from "../../../core/xml.mjs"
import { parseTree } from "../tree/tree.mjs"

// Словарь ролей шага. Три слова, и они отвечают на разные вопросы: «здесь значение появилось»,
// «здесь оно прошло насквозь», «здесь поток оборвался кодом отказа».
export const ROLES = Object.freeze(["порождаю", "проношу", "отвергаю"])

const stepsOf = (uc) => (uc.steps || []).map((_, k) => `${uc.id}/${k + 1}`)
const extsOf = (uc) => (uc.exts || []).map((e) => `${uc.id}/${e.id}`)

// FUNCTION_CONTRACT: flowsSkeleton — состав потоков, посчитанный СКРИПТОМ
//   Input:        { frd } — разобранное требование
//   Dependencies: —
//   Antecedent:   любые значения
//   Consequent:   success: { xml, flows, steps } — поток на каждый use case и на каждое его
//                          ветвление; в каждом по строке на шаг требования, и `closes` в них УЖЕ
//                          проставлен. Роль заполняет `module`, `in`, `out`, `role` и вправе
//                          добавить строки с тем же `closes`, если шаг требования проходит через
//                          несколько модулей
//                 failure: none — тотальна
//   Purity:       pure
//
// ПОЧЕМУ `closes` СТАВИТ СКРИПТ. Номер шага — это дословная цитата требования, и роль, набирающая её
// руками, попадает в него не всегда: живой прогон дал `2а` кириллицей там, где FRD писал `2a`
// латиницей, и покрытие стало ложью. Скрипт не ошибается в цифре, роль не тратит на неё внимание.
export function flowsSkeleton({ frd = {} } = {}) {
  const out = []
  let steps = 0
  for (const uc of frd.usecases || []) {
    const rows = stepsOf(uc).map((c, k) => `    <step n="${k + 1}" module="" in="" out="" role="" closes="${c}"/>`)
    steps += rows.length
    out.push(`  <flow id="${uc.id}" uc="${uc.id}" goal="${String(uc.goal || "").replace(/"/g, "&quot;")}">\n${rows.join("\n")}\n  </flow>`)
    for (const e of uc.exts || []) {
      const row = `    <step n="1" module="" in="" out="" role="отвергаю" closes="${uc.id}/${e.id}"/>`
      steps += 1
      out.push(`  <flow id="${uc.id}${e.id}" uc="${uc.id}" branch="${e.id}" goal="${String(e.error || e.outcome || "").replace(/"/g, "&quot;")}">\n${row}\n  </flow>`)
    }
  }
  return Object.freeze({ xml: `<flows task="">\n${out.join("\n")}\n</flows>\n`, flows: out.length, steps })
}

// FUNCTION_CONTRACT: parseFlows — единственный разбор потоков на всю полосу
//   Input:        xml — текст потоков
//   Dependencies: core/xml.mjs
//   Antecedent:   любое значение
//   Consequent:   success: { flows: [{ id, uc, branch, goal, steps: [{ n, module, in, out, role, closes }] }] }
//                 failure: none — тотальна
//   Purity:       pure
export function parseFlows(xml) {
  const flows = []
  for (const f of String(xml || "").matchAll(/<flow\b([^>]*)>([\s\S]*?)<\/flow>/g)) {
    const a = attrs(f[1])
    flows.push(Object.freeze({
      id: a.id || "", uc: a.uc || "", branch: a.branch || "", goal: a.goal || "",
      steps: Object.freeze([...f[2].matchAll(elem("step"))].map((s) => {
        const sa = attrs(s[1])
        return Object.freeze({ n: sa.n || "", module: sa.module || "", in: sa.in || "", out: sa.out || "", role: sa.role || "", closes: sa.closes || "" })
      })),
    }))
  }
  return Object.freeze({ flows: Object.freeze(flows) })
}

// FUNCTION_CONTRACT: checkFlows — закрывает ли поток требование, и сходятся ли значения
//   Input:        { text, frd, tree, only, portion, whole } — что роль записала; требование;
//                 ТЕКСТ дерева модулей; `only` — id use case, если судится порция; и два флага
//   Dependencies: parseFlows, parseTree
//   Antecedent:   любые значения; без дерева правило про модули МОЛЧИТ — судить не по чему
//   Consequent:   success: string[] — по блокеру на дефект
//   Purity:       pure
//   Interface:    checkFlows({ text, frd, tree, only, portion, whole }) -> string[]
//
// ПОРЦИЯ — ОДИН USE CASE. Она может ответить за свои шаги и за свои ветвления, и больше ни за что:
// «у значения один порождающий» — свойство ВСЕХ потоков сразу, и порция его не видит.
export function checkFlows({ text = "", frd = {}, tree = "", only = "", portion = false, whole = false } = {}) {
  const B = []
  const { flows } = parseFlows(text)
  const steps = flows.flatMap((f) => f.steps)
  const known = new Set(parseTree(tree).modules.map((m) => m.path))

  if (portion) {
    const uc = (frd.usecases || []).find((x) => x.id === only)
    if (!uc) return [`F0 use case «${only}» требование не знает — судить нечего`]
    const closed = new Set(steps.map((s) => s.closes))
    for (const c of [...stepsOf(uc), ...extsOf(uc)]) {
      if (!closed.has(c)) B.push(`F6 шаг ${c.replace("/", " шаг ")} требования не закрыт ни одной строкой потока — добавь <step closes="${c}" …/> и скажи, какой модуль и что с данными делает`)
    }
    const alien = [...closed].filter((c) => c && !c.startsWith(`${uc.id}/`))
    if (alien.length) B.push(`F6 в этой порции закрыты чужие шаги: ${alien.join(", ")} — порция отвечает за ${uc.id} и только за него`)
  }

  for (const s of steps) {
    const at = `${s.closes || "?"}`
    if (!s.module) B.push(`F6 строка ${at}: пуст module — назови ПУТЬ модуля, который делает этот шаг`)
    else if (known.size && !known.has(s.module)) B.push(`F6 строка ${at} называет модуль ${s.module}, которого нет в дереве — либо путь другой, либо модуля не хватает дереву`)
    if (!ROLES.includes(s.role)) B.push(`F6 строка ${at}: role="${s.role}" вне словаря — поставь одно из: ${ROLES.join(" · ")}`)
    if (!s.in) B.push(`F6 строка ${at}: пуст in — назови значение, которое приходит: «POST /store (терминыterms)» либо «Glossary (черновик создания)»`)
    if (!s.out) B.push(`F6 строка ${at}: пуст out — назови значение, которое уходит; ничего не поменялось — повтори значение входа и поставь role="проношу"`)
  }

  if (!whole) return B

  // ЦЕЛОЕ. У значения один порождающий МОДУЛЬ — он может порождать его в нескольких потоках, это то
  // же место в коде. Двое порождающих значат, что одним именем названы разные данные: «Glossary
  // (черновик создания)» и «Glossary (импортированный)» — не одно значение.
  const producers = new Map()
  for (const s of steps) if (s.role !== "проношу" && s.out) producers.set(s.out, new Set([...(producers.get(s.out) || []), s.module]))
  for (const [v, who] of producers) {
    if (who.size > 1) B.push(`F7 значение «${v}» порождают ${who.size} модуля: ${[...who].join(", ")} — либо это РАЗНЫЕ данные и им нужны разные имена, либо один из них его только проносит (role="проношу")`)
  }

  const external = new Set(flows.flatMap((f) => (f.steps[0] ? [f.steps[0].in] : [])))
  for (const s of steps) {
    if (s.in && !producers.has(s.in) && !external.has(s.in)) B.push(`F8 строка ${s.closes}: «${s.in}» никто не порождает и оно не входит извне — назови шаг, который его делает, либо начни им поток`)
  }

  for (const f of frd.failures || []) {
    const born = steps.find((s) => s.out === f.code && s.role === "отвергаю")
    if (!born) B.push(`F9 код отказа ${f.code} объявлен требованием, но ни одна строка его не порождает — поставь <step out="${f.code}" role="отвергаю" closes="${(f.from || "").split(" ")[0] || "UC?/?a"}"/>`)
    const shown = steps.find((s) => String(s.out || "").startsWith(`${f.status} ${f.code}`))
    if (!shown) B.push(`F9 отказ ${f.code} нигде не превращается в статус ${f.status} — добавь строку out="${f.status} ${f.code}" тому модулю, который отвечает наружу`)
  }

  // ОБЪЯВЛЕНИЕ В ПОТОКЕ НЕ УЧАСТВУЕТ, И ЭТО НЕ ДЕФЕКТ. У модели данных и у интерфейса нет поведения
  // в рантайме — за них работает реализация. Их доказывает ДРУГОЕ отношение: до них дотягивается
  // `needs` от того, кто в потоке есть. Первая версия этой проверки спрашивала с объявления
  // поведение и была неправа ровно тем же, чем старое правило связности (docs/plan.md Ш8).
  const { modules } = parseTree(tree)
  if (modules.length) {
    const inFlow = new Set(steps.map((s) => s.module))
    const reach = new Set(inFlow)
    for (let grew = true; grew;) {
      grew = false
      for (const m of modules) if (reach.has(m.path)) for (const n of m.needs) if (!reach.has(n.path)) { reach.add(n.path); grew = true }
    }
    const mute = modules.map((m) => m.path).filter((p) => !reach.has(p))
    if (mute.length) B.push(`F10 модули ${mute.join(", ")} не работают ни в одном потоке, и до них не дотягивается needs ни от одного участника потока — их работу нечем проверить: либо впиши их в поток, либо покажи, кто их требует`)
  }
  return B
}
