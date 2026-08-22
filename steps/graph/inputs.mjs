// MODULE_CONTRACT: inputs — СУД ВХОДА шага 5, и он строже, чем у соседей
// Purpose:    одно решение: годятся ли части, из которых собирается карта. Мало, что у каждой клетки
//             ФОКУСА есть файл: часть обязана проходить гардрейл части СЕЙЧАС.
// io:         fs
// EXTERNAL_DEPENDENCY: steps/scope/part.mjs::newPart — ТОТ ЖЕ судья части, что у шага 4.
// Invariants: ТОТАЛЕН.
// Interface:  inputs, plan, focus, partsOf
//
// BUG_FIX_CONTEXT: «когда-то была зелёной» шага не закрывает. Огрызок, оставшийся от прогона, где
// клетку отбили, склеивается в карту молча: `appgraph.xml` ложится с пустым узлом, и шаг 8 честно
// докладывает, что этот узел ничего не задел. Мусор проезжает два шага и всплывает в плане.
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { newPart } from "../scope/part.mjs"
import { PLAN, FOCUS, partAt } from "./paths.mjs"

const readAt = (cwd, rel) => (existsSync(join(cwd, rel)) ? readFileSync(join(cwd, rel), "utf8") : "")

// FUNCTION_CONTRACT: plan / focus — вход как ДАННЫЕ либо отказ с диагнозом
//   Antecedent:   отсутствие файла — ОТКАЗ, а не пустой список: «плана нет» и «в плане ноль клеток»
//                 это разные факты (standards/code.md, ограничение 2)
//   Purity:       io (fs)
export function plan(state) {
  const raw = readAt(state.cwd, PLAN)
  if (!raw.trim()) return { why: `${PLAN} не существует — шаг scope не отработал` }
  let p
  try { p = JSON.parse(raw) } catch (e) { return { why: `${PLAN} не разбирается как JSON — ${e.message}` } }
  if (!p || !Array.isArray(p.cells) || !p.cells.length) return { why: `${PLAN} не несёт ни одной клетки — картировать нечего` }
  return { plan: p, cells: p.cells }
}

export function focus(state) {
  const raw = readAt(state.cwd, FOCUS)
  if (!raw.trim()) return { why: `${FOCUS} не существует — шаг scope не решил, что обследовать` }
  let f
  try { f = JSON.parse(raw) } catch (e) { return { why: `${FOCUS} не разбирается как JSON — ${e.message}` } }
  if (!f || !Array.isArray(f.cells) || !f.cells.length) return { why: `${FOCUS} не несёт ни одной клетки — разведывать нечего` }
  return { focus: f, cells: new Set(f.cells) }
}

// FUNCTION_CONTRACT: inputs — годен ли вход шага 5
//   Dependencies: plan, focus, newPart
//   Consequent:   success: ""; failure: отказ, называющий КЛЕТКУ и её файл
//   Purity:       io (fs)
export function inputs(state) {
  const p = plan(state)
  if (p.why) return p.why
  const f = focus(state)
  if (f.why) return f.why

  for (const c of p.cells.filter((c) => f.cells.has(c.id))) {
    const rel = partAt(c.id)
    if (!existsSync(join(state.cwd, rel))) return `${rel} не существует — клетка ${c.id} фокуса не закрыта частью, поддерево потеряно`
    const text = readAt(state.cwd, rel)
    const r = newPart({ xml: text, cell: c })
    if (!r.ok) return `часть клетки ${c.id} лежит на диске, но гардрейл части её СЕЙЧАС не принимает: ${r.error.detail} — «когда-то была зелёной» шага не закрывает`
  }
  return ""
}

export { readAt }
