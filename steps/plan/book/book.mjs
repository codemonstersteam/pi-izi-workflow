// MODULE_CONTRACT: book — шаг 9D: план как ИНДЕКС работы, собранный скриптом
// Purpose:    одно решение — как из дерева и потоков получается документ, который человек читает на
//             гейте, а исполнитель режет на тикеты. План не содержит решений, которых нет в дереве и
//             потоках: он их СОБИРАЕТ. Поэтому он не стоит ни одного токена и его нельзя «переписать
//             целиком, потеряв работу» — терять здесь нечего.
// io:         none
// EXTERNAL_DEPENDENCY: steps/plan/order.mjs — orderOf, единственная топологическая сортировка полосы.
//             Её вход — `needs` дерева, и волны плана обязаны совпасть с волнами тикетов.
// EXTERNAL_DEPENDENCY: steps/plan/tree/tree.mjs и steps/plan/flows/flows.mjs — parseTree, parseFlows.
// Invariants: волна модуля строго больше волны всего, без чего его не написать; величина требования
//             стоит в документе дословно; заглушке в плане места нет.
// Interface:  BANNED, wavesOf, planDoc, checkBook

import { orderOf } from "../order.mjs"
import { parseTree } from "../tree/tree.mjs"
import { parseFlows } from "../flows/flows.mjs"
import { parseDecisions } from "../decisions/decisions.mjs"

// ЗАГЛУШКА В ПЛАНЕ — ЭТО НЕ СТИЛЬ, А НЕДОДЕЛАННАЯ РАБОТА. Список взят у superpowers (skills/
// writing-plans, раздел «No Placeholders»), где он живёт прозой; здесь он краснит сборку, потому что
// проза не краснеет. Каждая строка — фраза, за которой у них стоял разбор живого провала.
export const BANNED = Object.freeze([
  /\bTBD\b/i, /\bTODO\b/i, /\bFIXME\b/i,
  /add appropriate error handling/i, /handle edge cases/i, /as needed/i,
  /similar to (task|module) /i, /см\. выше/i, /по аналогии с/i, /и так далее/i,
])

// FUNCTION_CONTRACT: wavesOf — очередь работ по отношению `needs`
//   Input:        { tree } — ТЕКСТ дерева модулей
//   Dependencies: parseTree, orderOf
//   Antecedent:   любое значение; пустое дерево даёт пустые волны, а не отказ
//   Consequent:   success: { waves: string[][], cycle: string[] } — волна это множество модулей,
//                          которые можно писать одновременно: всё, без чего они написаны быть не
//                          могут, лежит в волнах строго раньше
//                 failure: none — тотальна; круг возвращается путём и волны при этом пусты
//   Purity:       pure
export function wavesOf({ tree = "" } = {}) {
  const { modules } = parseTree(tree)
  const paths = modules.map((m) => m.path)
  const need = new Map(modules.map((m) => [m.path, m.needs.map((n) => n.path).filter((p) => paths.includes(p))]))
  const { cycle } = orderOf({
    sections: modules.map((m) => ({ path: m.path, calls: need.get(m.path) })),
    modules: new Map(paths.map((p) => [p, {}])), edges: [],
  })
  if (cycle.length) return Object.freeze({ waves: Object.freeze([]), cycle: Object.freeze([...cycle]) })

  const level = new Map()
  for (let grew = true; grew;) {
    grew = false
    for (const p of paths) {
      if (level.has(p)) continue
      const deps = need.get(p)
      if (!deps.every((d) => level.has(d))) continue
      level.set(p, 1 + Math.max(0, ...deps.map((d) => level.get(d))))
      grew = true
    }
  }
  const waves = []
  for (const [p, l] of level) (waves[l - 1] ||= []).push(p)
  return Object.freeze({ waves: Object.freeze(waves.map((w) => Object.freeze(w))), cycle: Object.freeze([]) })
}

const short = (p) => String(p || "").split("/").slice(-3).join("/")

// FUNCTION_CONTRACT: planDoc — документ, который читает человек и режет шаг 14
//   Input:        { frd, tree, flows, decisions, key } — требование, дерево, потоки, журнал решений
//                 и ключ задачи
//   Dependencies: wavesOf, parseTree, parseFlows, parseDecisions
//   Antecedent:   дерево и потоки уже зелены — сборка не судит, она собирает
//   Consequent:   success: string — TL;DR · общие ограничения ДОСЛОВНО · волны · раздел на модуль ·
//                          карта отказов · журнал решений
//                 failure: none — тотальна; круг в `needs` даёт документ с одной строкой отказа,
//                          и вызывающий обязан его не писать
//   Purity:       pure
//
// ОБЩИЕ ОГРАНИЧЕНИЯ СТОЯТ ОДНИМ БЛОКОМ И ДОСЛОВНО (приём superpowers). Величина `fit`, коды отказов
// и шаблоны полей неявно входят в КАЖДЫЙ раздел; пока они жили по разделам, величина `5 minutes`
// терялась трижды за три дня.
export function planDoc({ frd = {}, tree = "", flows = "", decisions = "", key = "" } = {}) {
  const { modules } = parseTree(tree)
  const { flows: fl } = parseFlows(flows)
  const { waves, cycle } = wavesOf({ tree })
  if (cycle.length) return `# План не собран\n\nОчередь работ замкнута: ${cycle.join(" → ")}\n`

  const byPath = new Map(modules.map((m) => [m.path, m]))
  const steps = fl.flatMap((f) => f.steps)
  const closesOf = (path) => [...new Set(steps.filter((s) => s.module === path).map((s) => s.closes))]
  const failsOf = (path) => (frd.failures || []).filter((f) => steps.some((s) => s.module === path && s.out === f.code && s.role === "отвергаю"))

  const out = []
  out.push(`# План работ ${key} — ${frd.goal || ""}`.trim())
  out.push("")
  out.push("## Коротко для человека")
  out.push("")
  out.push(`Что получится: ${frd.goal || "—"}.`)
  out.push(`Объём: модулей ${modules.length}, волн ${waves.length}, use case ${(frd.usecases || []).length}, кодов отказа ${(frd.failures || []).length}.`)
  out.push(`Порядок работ взят из отношения «без чего меня не написать», а не из потока данных: поток цикличен по природе.`)
  out.push(`Чего этот план НЕ делает: ничего, кроме перечисленного ниже — каждый раздел закрывает названные шаги требования и ничего сверх них.`)
  out.push("")
  out.push("## Общие ограничения")
  out.push("")
  out.push("Дословная выписка из требования. Входит в каждый раздел плана, повторять не нужно.")
  out.push("")
  for (const n of frd.nfrs || []) out.push(`- величина \`${n.subject}\` = \`${n.fit}\`${n.source ? ` (${n.source})` : ""}`)
  for (const f of frd.failures || []) out.push(`- отказ \`${f.code}\` → статус \`${f.status}\`${f.from ? ` (из ${f.from})` : ""}`)
  for (const f of frd.fields || []) if (f.domain) out.push(`- поле \`${f.name}\` в \`${f.in}\`: ${f.domain}${f.error && f.error !== "none" ? ` иначе \`${f.error}\`` : ""}`)
  out.push("")

  waves.forEach((wave, k) => {
    out.push(`## Волна ${k + 1}`)
    out.push("")
    for (const path of wave) {
      const m = byPath.get(path)
      const closes = closesOf(path)
      out.push(`### ${short(path)}`)
      out.push("")
      out.push(`- путь: \`${path}\``)
      out.push(`- прячет: ${m.hides}`)
      out.push(`- io: \`${m.io}\``)
      if (m.owns) out.push(`- владеет типом: \`${m.owns}\``)
      if (m.twin) out.push(`- образец: \`${m.twin}\``)
      out.push(`- объявление: \`${m.contract.sig}\``)
      out.push(`- предусловие: ${m.contract.pre}`)
      out.push(`- гарантия: ${m.contract.post}`)
      if (m.contract.fail) out.push(`- отказ: ${m.contract.fail}`)
      out.push(m.needs.length
        ? `- без чего не написать: ${m.needs.map((n) => `\`${short(n.path)}\` (${n.why})`).join(" · ")}`
        : `- без чего не написать: ни от чего не зависит, пишется первым`)
      out.push(closes.length ? `- закрывает шаги: ${closes.join(" · ")}` : `- закрывает шаги: —`)
      const fails = failsOf(path)
      if (fails.length) out.push(`- порождает отказы: ${fails.map((f) => `\`${f.code}\` → ${f.status}`).join(" · ")}`)
      out.push("")
    }
  })

  out.push("## Карта отказов")
  out.push("")
  out.push("| код | статус | где порождается | из каких шагов |")
  out.push("|---|---|---|---|")
  for (const f of frd.failures || []) {
    const born = steps.find((s) => s.out === f.code && s.role === "отвергаю")
    out.push(`| \`${f.code}\` | ${f.status} | ${born ? short(born.module) : "—"} | ${f.from || "—"} |`)
  }
  out.push("")

  const dec = parseDecisions(decisions)
  out.push("## Решения там, где требование молчит")
  out.push("")
  out.push(dec.length ? "| вопрос | ответ | опора | маршрут |" : "Ни одного: требование ответило на всё само.")
  if (dec.length) {
    out.push("|---|---|---|---|")
    for (const d of dec) out.push(`| ${d.question} | ${d.answer} | \`${d.source}\` | ${d.route} |`)
  }
  out.push("")
  return out.join("\n")
}

// FUNCTION_CONTRACT: checkBook — сошёлся ли собранный план с тем, из чего он собран
//   Input:        { plan, frd, tree } — текст плана, требование, дерево
//   Dependencies: parseTree
//   Antecedent:   любые значения
//   Consequent:   success: string[] — по блокеру на дефект
//   Purity:       pure
//
// СБОРЩИК ДЕТЕРМИНИРОВАН, И ЭТИ ПРОВЕРКИ СТОРОЖАТ НЕ ЕГО, А ВХОД: план, собранный из дерева, где
// модуль потерялся, — это гейт, утверждающий работу, которой нет.
export function checkBook({ plan = "", frd = {}, tree = "" } = {}) {
  const B = []
  const text = String(plan || "")
  for (const m of parseTree(tree).modules) {
    if (!text.includes(m.path)) B.push(`B11 модуль ${m.path} есть в дереве, но в плане о нём ни строки`)
  }
  for (const n of frd.nfrs || []) {
    if (n.fit && !text.includes(n.fit)) B.push(`B11 величина ${n.subject} = «${n.fit}» объявлена требованием, но в плане её нет — исполнитель поставит своё число`)
  }
  for (const f of frd.failures || []) {
    if (!text.includes(f.code)) B.push(`B11 код отказа ${f.code} объявлен требованием, но в плане не назван`)
  }
  for (const re of BANNED) {
    const hit = text.match(re)
    if (hit) B.push(`B12 в плане стоит заглушка «${hit[0]}» — исполнитель прочтёт её как разрешение решить самому; напиши, ЧТО именно делается`)
  }
  return B
}
