// MODULE_CONTRACT: cut — io-труба шага 6: что читается с диска ради наряда пласта
// Purpose:    одно решение: ЧТО попадает в наряд каждого пласта. Карта — parseMap (чистое),
//             значения — из normalized.md, ответы оператора — из answers.md. Чистые ядра — frd.mjs.
// io:         fs
// EXTERNAL_DEPENDENCY: steps/intake/map.mjs::parseMap — карта как ДАННЫЕ; frd.mjs::FRD_FORM —
//             формы дельт и источников как данные; steps/brd/brd.mjs::parseBrd — subjects/analogue.
// Invariants: ТОТАЛЕН.
// Interface: mapOf, answersText, typesOf, b0Of, blueprintOf, resolveItems
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { parseMap } from "./map.mjs"
import { parseComputed } from "../scope/computed.mjs"
import { FRD_FORM, parseFrd } from "./frd.mjs"
import { candidatesOf } from "./owners/b0.mjs"
import { newAnswers } from "../../core/answers.mjs"

const readAt = (cwd, rel) => (existsSync(join(cwd, rel)) ? readFileSync(join(cwd, rel), "utf8") : "")

// FUNCTION_CONTRACT: mapOf — карта как ДАННЫЕ из appgraph.xml
//   Consequent:   success: { nodes, tests, entries, edges, types, members, routes, … }
//   Purity:       io (fs)
export function mapOf(state) {
  return parseMap(readAt(state.cwd, ".agent/appgraph.xml"))
}

// FUNCTION_CONTRACT: answersText — ответы оператора (пустая строка если файла нет)
//   Consequent:   success: string — по строке «N. ответ» на ОТПРАВЛЕННЫЙ вопрос; файл в
//                 <exchange>-грамматике (T75) рендерится из обменов, неразобранное — как есть
//   Purity:       io (fs)
export function answersText(state) {
  const raw = readAt(state.cwd, ".agent/answers.md").trim()
  // T75 — answers.md пишется обменами; наряду и судьям (F17c ищет имена в тексте ответа)
  // нужны СТРОКИ-ОТВЕТЫ, не разметка файла
  const said = newAnswers(raw)
  return said.ok && said.value.length ? said.value.map((a) => `${a.n}. ${a.text}`).join("\n") : raw
}

// FUNCTION_CONTRACT: typesOf — таблица типов `name · path · kind` из graph-computed
//   Antecedent:   файла может не быть — тогда пусто (наряд напишет «репозиторий типов не объявляет»)
//   Consequent:   success: string[] — по строке на объявление; ИМЯ может встречаться в нескольких
//                 файлах, строки не дедуплицируются: адрес — часть факта
//   Purity:       io (fs)
// T61: слот {TYPES} наряда B обещал «name · path · kind, resolved by SCRIPT» (order-b.tpl), а
// наполнялся ключами map.types — которых у parseMap НЕТ: слот всегда стоял «(no types in the
// map)». Источник таблицы — вычисленный граф шага 3, его parseComputed и несёт `decls`.
export function typesOf(state) {
  return parseComputed(readAt(state.cwd, ".agent/graph-computed.xml"))
    .decls.filter((d) => d.name && d.at)
    .map((d) => `${d.name} · ${d.at} · ${d.kind}`)
}

// FUNCTION_CONTRACT: b0Of — кандидатная таблица подпласта B1: шаги × карта + аналог + рёбра
//   Antecedent:   слоя A ещё нет — пустая таблица (B1 раньше A не случается, но тотальность дороже)
//   Consequent:   success: { steps, analogueFunctions } — форма steps/intake/owners/b0.mjs::candidatesOf;
//                 кладётся в .agent/intake-b0.json НАРЯДОМ (order.mjs, пласт B1), а судья читает
//                 его ЖЕ — модель видит то, по чему её судят
//   Purity:       io (fs)
// T62: связь «функция требования ↔ владелец» была прозой — теперь её считает скрипт, и одна
// таблица служит и наряду, и судьям F17c/d.
export function b0Of(state) {
  const spreadRaw = readAt(state.cwd, ".agent/anchors.json")
  let analogueFiles = []
  try { analogueFiles = JSON.parse(spreadRaw).analogue || [] } catch { /* нет аналога — пусто */ }
  const computed = parseComputed(readAt(state.cwd, ".agent/graph-computed.xml"))
  return candidatesOf({
    frd: parseFrd(readAt(state.cwd, ".agent/staging/frd~scenarios.xml")),
    map: mapOf(state),
    analogueFiles,
    edges: computed.edges,
  })
}

// FUNCTION_CONTRACT: blueprintOf — СВЯЗНОЕ ЯДРО АНАЛОГА как чертёж для новых модулей
//   Antecedent:   аналога или карты нет — пустая строка (наряд напишет именованную пустоту)
//   Consequent:   success: string[] — по строке на файл ядра «путь — роль → кого зовёт», плюс
//                 список рёбер ЯДРА; ядро = файлы аналога, у которых есть ребро на ДРУГОЙ файл
//                 аналога (архитектура живёт в связях, одиночный файл чертежа не несёт);
//                 потолок 40 строк — чертёж читается, а не пролистывается
//   Purity:       io (fs)
// T63-0: наряд B1 подавал аналог как ФУНКЦИИ, и новые слои заводились выдуманной структурой
// (замер 25.08: GlossaryResource/GlossaryLoader вместо квинтета модель-интерфейс-REST-mongo-rest).
// Чертёж — данные, которые УЖЕ на диске (anchors + appgraph-роли + computed-рёбра), 0 токенов.
export function blueprintOf(state) {
  const spreadRaw = readAt(state.cwd, ".agent/anchors.json")
  let af = []
  try { af = (JSON.parse(spreadRaw).analogue || []).files || [] } catch { /* пусто */ }
  const map = mapOf(state)
  const edges = parseComputed(readAt(state.cwd, ".agent/graph-computed.xml")).edges
  const inAnalogue = new Set(af.map(String))
  const coreEdges = edges.filter((e) => inAnalogue.has(e.from) && inAnalogue.has(e.to))
  const core = new Set(coreEdges.flatMap((e) => [e.from, e.to]))
  const lines = []
  for (const p of core) {
    const role = (map.roles?.get(p) || "").slice(0, 160)
    const calls = coreEdges.filter((e) => e.from === p).map((e) => String(e.to).split("/").pop())
    lines.push(`${p}${role ? ` — ${role}` : ""}${calls.length ? ` → зовёт: ${calls.join(", ")}` : ""}`)
    if (lines.length >= 34) break
  }
  if (lines.length && coreEdges.length) lines.push(`рёбра ядра: ${coreEdges.slice(0, 6).map((e) => `${String(e.from).split("/").pop()} → ${String(e.to).split("/").pop()}`).join("; ")}`)
  return lines
}

// FUNCTION_CONTRACT: brdText — артефакт шага 2
//   Purity:       io (fs)
export function brdText(state) {
  return readAt(state.cwd, ".agent/brd.md").trim()
}

// FUNCTION_CONTRACT: resolveItems — ответ рельсе lookup: имя → путь и kind из карты
//   Antecedent:   graph-computed может отсутствовать — тогда каждый пункт «нет в карте»
//   Consequent:   success: string[] — по строке на пункт: «Имя → путь · kind» либо
//                 «Имя → нет в карте». Совпадение по ИМЕНИ файла (basename без расширения)
//                 и по имени объявления; несколько адресов — все, адрес часть факта
//   Purity:       io (fs)
// T69: живой круг 26.08 — роль 14 раз возвращала kind:lookup с items:[LlmModule, …],
// наряд не нёс путей, страж кругов не двигался. Путь по имени вычислим — считает скрипт.
// «нет в карте» — тоже ответ: модель перестаёт искать и идёт в question, если нужно.
export function resolveItems(state, names = []) {
  const decls = parseComputed(readAt(state.cwd, ".agent/graph-computed.xml"))
    .decls.filter((d) => d.name && d.at)
  return names.map((raw) => {
    const name = String(raw || "").trim().replace(/\.\w+$/, "")
    if (!name) return `${raw} → нет в карте`
    const hits = decls.filter((d) =>
      d.name === name || String(d.at || "").split("/").pop().replace(/\.\w+$/, "") === name)
    if (!hits.length) return `${name} → нет в карте`
    return `${name} → ${[...new Set(hits.map((d) => `${d.at} · ${d.kind}`))].join(" | ")}`
  })
}

// FUNCTION_CONTRACT: normalizedText — таблица шага 2
//   Purity:       io (fs)
export function normalizedText(state) {
  return readAt(state.cwd, ".agent/normalized.md").trim()
}

export { FRD_FORM }
