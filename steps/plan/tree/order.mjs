// MODULE_CONTRACT: order — слоты наряда шага 9B, собранные ОДИН раз на всех читателей
// Purpose:    одно решение — что именно уезжает роли в наряде порции и в наряде починки. Полоса
//             исполняется в песочнице хоста и никем не импортируется; компонентный тест шага —
//             импортируется. Если бы слоты собирались в полосе, тест собирал бы их КОПИЕЙ, и наряд,
//             проверенный тестом, отличался бы от наряда живого прогона ровно на эту копию.
// io:         none — чтение диска делают функции расширения, сюда приезжают уже готовые куски
// Invariants: имена слотов совпадают с плейсхолдерами шаблонов (шов core/orders.test.mjs);
//             наряд починки НЕ несёт скелета: роль правит свой прошлый ответ.
// Interface:  treeSlots, treeFixSlots

// FUNCTION_CONTRACT: treeSlots — наряд первого захода по одной порции дерева
//   Input:        { skeleton, twin, neighbours, frd, previous, feedback, mine, staging, check }
//   Dependencies: —
//   Antecedent:   любые значения; пустой сосед и пустой прошлый ответ — законное состояние первой порции
//   Consequent:   success: объект слотов для steps/plan/tree/order-tree.tpl
//   Purity:       pure
export function treeSlots({ skeleton = "", twin = "", neighbours = "", frd = "", previous = "", feedback = "", mine = [], staging = "", check = "" } = {}) {
  return {
    SKELETON: skeleton,
    TWIN: twin,
    NEIGHBOURS: neighbours || "(твоя порция первая)",
    FRD: frd,
    PREVIOUS: previous,
    FEEDBACK: feedback,
    MINE: (mine || []).join(" · "),
    STAGING: staging,
    CHECK: check,
  }
}

// FUNCTION_CONTRACT: treeFixSlots — наряд ПОЧИНКИ по той же порции
//   Input:        { tasklist, count, previous, twin, neighbours, frd, mine, staging, check }
//   Dependencies: —
//   Antecedent:   `previous` непуст — чинить нечего, если роль ещё ничего не написала
//   Consequent:   success: объект слотов для steps/plan/tree/order-tree.fix.tpl; скелета среди них
//                          НЕТ: на починке он мёртвый груз
//   Purity:       pure
export function treeFixSlots({ tasklist = "", count = 0, previous = "", twin = "", neighbours = "", frd = "", mine = [], staging = "", check = "" } = {}) {
  return {
    TASKLIST: tasklist,
    COUNT: String(count),
    PREVIOUS: previous,
    TWIN: twin,
    NEIGHBOURS: neighbours || "(твоя порция первая)",
    FRD: frd,
    MINE: (mine || []).join(" · "),
    STAGING: staging,
    CHECK: check,
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// ПОДМОДУЛЬ `order` ПЯТЁРКИ ШАГА (тикет T08). Выше — чистая сборка слотов; ниже — то, чем эти слоты
// наполняются: выжимка образцов, блок соседей и текст наряда целиком. Переехало из ext/index.mjs
// (twin.run, neighbours.run, treeOrder.run) без изменения логики: обёртки хоста теперь зовут ЭТИ
// функции, а не держат вторую копию. Направление зависимости с этого момента одно — ext над steps.

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { parseTree, digestOf, sampleOf, rankedCandidates, frdFor } from "./tree.mjs"
import { repairTask } from "../repair.mjs"
import { mineOf, familyOf, readAt } from "./cut.mjs"
import { FRD, GRAPH, WORK, CAP, portionAt } from "./paths.mjs"

// FUNCTION_CONTRACT: digestFile — один образец как выжимка, а не как тело
//   Input:        cwd; p — путь файла-образца
//   Dependencies: digestOf
//   Antecedent:   — (тотальна: файла нет — так и сказано словами)
//   Consequent:   success: { at, lines, text } — объявление типа, аннотации, поля и сигнатуры,
//                          КАЖДАЯ со своим номером строки
//   Purity:       io (fs)
//   BUG_FIX_CONTEXT: тело образца — 35 КБ из 55 КБ наряда (первый живой прогон нового шага 9,
//                 21.08.2026). Оно вытесняет задачу в середину, которую слабая модель читает по
//                 диагонали, и платит за то, что роль могла бы и не открывать. Номера строк — то,
//                 что делает выжимку достаточной: чего не показала сигнатура, роль дочитывает ТОЧЕЧНО.
export function digestFile(cwd, p) {
  if (!p || !existsSync(join(cwd, p))) return { at: "", lines: 0, text: p ? `${p} — файла нет в репозитории` : "образца не нашлось" }
  const body = readFileSync(join(cwd, p), "utf8")
  const d = digestOf(body)
  return {
    at: p, lines: d.lines.length,
    text: [
      `path: ${p}  (всего строк ${body.split("\n").length})`,
      `собрано: объявление типа, аннотаций ${d.took.annotations}, полей ${d.took.fields}, сигнатур ${d.took.methods}; отброшено ${d.took.dropped} строк — импорты, комментарии, ТЕЛА методов, вложенные типы`,
      ...d.lines,
    ].join("\n"),
  }
}

// FUNCTION_CONTRACT: twinBlock — слот TWIN: по ДВЕ выжимки на каждый модуль порции
//   Antecedent:   состав порции известен
//   Consequent:   success: текст блока; failure: none — тотальна
//   Purity:       io (fs)
//   BUG_FIX_CONTEXT: один образец на четыре модуля учит неверной форме троих: порция держит сразу
//                 модель данных, интерфейс хранилища, REST и реализацию Mongo. Два кандидата, а не
//                 один, потому что формула выбора близнеца для НОВОЙ сущности не сходится — доказано
//                 трижды (docs/plan-design.md §3), и выбирает роль, а не скрипт.
export function twinBlock(state, id) {
  const map = readAt(state.cwd, GRAPH)
  const mine = mineOf(state, id)
  const parts = mine.map((m) => {
    const own = sampleOf(m, map)
    if (own.kind === "self") return [`--- ${m}: модуль уже существует, образец — он сам`, digestFile(state.cwd, m).text].join("\n")
    const two = rankedCandidates(m, map).slice(0, 2)
    if (!two.length) return `--- ${m}: образца в репозитории не нашлось — пиши по требованию`
    return [`--- кандидаты в образцы для ${m} (выбери ОДИН и впиши его в <twin path>)`, ...two.map((q) => digestFile(state.cwd, q).text)].join("\n")
  })
  return [
    ...parts, "",
    "Слева от строки — её номер в ЕЁ файле. Нужно тело метода или аргументы конструктора —",
    "read(path: <путь этого образца>, offset: <номер минус 2>, limit: 12). До восьми чтений на порцию.",
  ].join("\n")
}

// FUNCTION_CONTRACT: neighboursBlock — слот NEIGHBOURS: что уже решили соседние порции
//   Antecedent:   —
//   Consequent:   success: текст блока (пустой, если соседи ещё не написаны)
//   Purity:       io (fs)
//   BUG_FIX_CONTEXT: роль видит только свою порцию, и узнать имена и сигнатуры соседей ей больше
//                 неоткуда. Пока блока не было, гардрейл считал соседа по `needs` призраком — живой
//                 дефект 20.08.2026. Блок ВЫЧИСЛЯЕТСЯ из уже зелёных порций, а не пишется автором.
export function neighboursBlock(state, id) {
  const all = familyOf(state)
  const mine = new Set(mineOf(state, id))
  const done = []
  for (let n = 1; n <= Math.ceil(all.length / CAP); n++) done.push(readAt(state.cwd, portionAt(n)))
  const written = parseTree(done.join("\n")).modules.filter((m) => !mine.has(m.path) && (m.owns || m.contract.sig))
  return written.map((m) => [
    `${m.path}`,
    m.owns ? `  владеет типом: ${m.owns}` : "",
    m.contract.sig ? `  объявление: ${m.contract.sig}` : "",
    m.contract.post ? `  отдаёт: ${m.contract.post}` : "",
  ].filter(Boolean).join("\n")).join("\n")
}

// FUNCTION_CONTRACT: slotsFor — слоты наряда порции: первый заход или починка
//   Input:        state; id — порция; { previous, feedback, fix }
//   Dependencies: twinBlock, neighboursBlock, frdFor, repairTask, treeSlots, treeFixSlots
//   Antecedent:   —
//   Consequent:   success: { fix, slots } — на починке СКЕЛЕТА НЕТ: роль правит свой ответ, а не
//                          пишет заново, и скелет там мёртвый груз
//   Purity:       io (fs)
//   Interface:    slotsFor(state, id, opts) -> { fix, slots }
export function slotsFor(state, id, { previous = "", feedback = "", fix = false } = {}) {
  const mine = mineOf(state, id)
  const common = {
    twin: twinBlock(state, id), neighbours: neighboursBlock(state, id),
    frd: frdFor({ xml: readAt(state.cwd, FRD), modules: mine }), mine,
    staging: portionAt(id),
    check: "tree({path, slice}) — раздел на каждый модуль порции, у каждого секрет, io, образец, контракт; needs это ПУТЬ",
  }
  if (fix) {
    const t = repairTask(feedback)
    return { fix: true, slots: treeFixSlots({ ...common, tasklist: t.lines.join("\n"), count: t.count, previous }) }
  }
  return { fix: false, slots: treeSlots({ ...common, skeleton: readAt(state.cwd, `${WORK}/tree~${id}.xml`), previous, feedback }) }
}

// FUNCTION_CONTRACT: orderText — наряд целиком: шаблон плюс слоты
//   Antecedent:   шаблон лежит РЯДОМ С МОДУЛЕМ и читается module-relative — он часть модуля, а не
//                 данные проекта (артефакты по-прежнему берутся от cwd прогона)
//   Consequent:   success: { text, fix, staging }; НЕЗАПОЛНЕННЫЙ СЛОТ — ОТКАЗ, а не пустота
//   Purity:       io (fs)
//   Interface:    orderText(state, id, opts) -> { text, fix, staging, why }
export function orderText(state, id, opts = {}) {
  const { fix, slots } = slotsFor(state, id, opts)
  const tpl = readFileSync(new URL(fix ? "./order-tree.fix.tpl" : "./order-tree.tpl", import.meta.url), "utf8")
  let text = tpl
  for (const [k, v] of Object.entries(slots)) text = text.split(`{${k}}`).join(v)
  const left = [...text.matchAll(/\{([A-Z_]+)\}/g)].map((m) => m[1])
  if (left.length) return { why: `в наряде порции ${id} остались незаполненные слоты: ${[...new Set(left)].join(", ")} — данные не доехали, и роль будет выдумывать` }
  return { text, fix, staging: portionAt(id) }
}
