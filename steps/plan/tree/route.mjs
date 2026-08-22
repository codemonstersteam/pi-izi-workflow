// MODULE_CONTRACT: route — КУДА ШАГ ИДЁТ ДАЛЬШЕ: следующая порция, круг починки, склейка, продвижение
// Purpose:    одно решение спрятано здесь: что делать с вердиктом. Кто переписывается, кто нет, и
//             когда шаг вправе положить артефакт.
// io:         fs
// EXTERNAL_DEPENDENCY: judge.mjs — гардрейл целого; cut.mjs — состав; paths.mjs — куда класть.
// Invariants: ТОТАЛЕН. Артефакт продвигается ТОЛЬКО после зелёного вердикта ЦЕЛОГО.
// Interface:  join, addressees, promote
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join as pjoin } from "node:path"
import { parseTree } from "./tree.mjs"
import { readAt } from "./cut.mjs"
import { WORK, OUT, STAGED, portionAt } from "./paths.mjs"
import { orderOf } from "../order.mjs"

// FUNCTION_CONTRACT: join — склейка порций в одно дерево
//   Input:        state; portions — список порций состояния
//   Antecedent:   каждая порция написана; пропущенная — ОТКАЗ С ЕЁ НОМЕРОМ, а не тихая потеря модулей
//   Consequent:   success: { at, modules }; failure: { why }
//   Purity:       io (fs)
export function join(state, portions) {
  const blocks = []
  for (const p of portions) {
    const text = readAt(state.cwd, p.staging)
    if (!text.trim()) return { why: `порция ${p.id} не написана: ${p.staging} пуст — склеивать нечего` }
    blocks.push(...[...text.matchAll(/ {2}<module[\s\S]*?<\/module>/g)].map((m) => m[0]))
  }
  const head = readAt(state.cwd, `${WORK}/tree-skeleton.xml`).split("\n")[0] || '<tree task="">'
  mkdirSync(pjoin(state.cwd, ".agent", "staging"), { recursive: true })
  writeFileSync(pjoin(state.cwd, STAGED), `${head}\n${blocks.join("\n")}\n</tree>\n`)
  return { at: STAGED, modules: blocks.length }
}

// FUNCTION_CONTRACT: addressees — КОМУ уходит наряд починки, когда красное ЦЕЛОЕ
//   Input:        blockers — текст вердикта целого; portions — список порций
//   Dependencies: readAt, parseTree
//   Antecedent:   —
//   Consequent:   success: идентификаторы порций-адресатов. Блокер называет ПУТИ — адресаты те
//                 порции, которые эти пути решали. Блокер путей не называет — адресатом становятся
//                 ВСЕ: незнакомая находка едет дороже, но не теряется.
//   Purity:       io (fs)
//   BUG_FIX_CONTEXT: правило куплено прогоном 5b52f76d — пятью пустыми кругами, в которых наряд
//                 починки уходил порциям, не имевшим отношения к находке.
export function addressees(state, blockers, portions) {
  const paths = [...String(blockers || "").matchAll(/\b[\w./-]+\/[\w.-]+\.[A-Za-z0-9]+\b/g)].map((m) => m[0])
  if (!paths.length) return portions.map((p) => p.id)
  const hit = portions.filter((p) => {
    const said = parseTree(readAt(state.cwd, p.staging)).modules.map((m) => m.path)
    return said.some((q) => paths.includes(q))
  }).map((p) => p.id)
  return hit.length ? hit : portions.map((p) => p.id)
}

// FUNCTION_CONTRACT: promote — staging → выход, и только теперь
//   Antecedent:   вердикт ЦЕЛОГО зелен; склейка лежит по STAGED
//   Consequent:   success: { at: OUT }; failure: { why }
//   Purity:       io (fs)
//   BUG_FIX_CONTEXT: артефакт, написанный на рельсе ошибки, не закрывает шаг (CLAUDE.md, огр. 2).
//                 Поэтому продвижение живёт ЗДЕСЬ, в одной функции, и её зовёт только зелёная ветвь.
export function promote(state) {
  const from = pjoin(state.cwd, STAGED)
  if (!existsSync(from)) return { why: `${STAGED} не существует — продвигать нечего` }
  const text = readFileSync(from, "utf8")
  writeFileSync(pjoin(state.cwd, OUT), text.endsWith("\n") ? text : `${text}\n`)
  return { at: OUT, modules: parseTree(text).modules.length }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// ОЧЕРЕДЬ РАБОТ ПО `needs` — переехала сюда из steps/plan/book/book.mjs при чистке (тикет T20).
// Живёт у ДЕРЕВА, а не у плана: волны это свойство отношения `needs`, которое дерево и объявляет.
// План их только печатает, и когда план ушёл за границу первой поставки (ship=0), волны не должны
// были уйти вместе с ним — на них стоит приёмка шага 9B: «первой волной идёт модель данных».
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
