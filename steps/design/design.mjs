// MODULE_CONTRACT: design — две проекции изменения: дизайн-граф и поток данных, выровненные скриптом
// Purpose:    одно решение — где структурная проекция (узлы с контрактами) расходится с временно́й
//             (сценарий, проигранный по шагам). Роль пишет граф и МАРШРУТ (путь узла плюс номер
//             альтернативы его `out`); значения в поток подставляет expand, поэтому расхождение
//             ВНУТРИ потока невыразимо, а единственным швом остаётся стык контрактов соседей.
//             ЧИСТОЕ: диска не знает, io держит ext/index.mjs. Разбор — docs/data-flow.md §3–§6.
// io:         none
// Invariants: parseDesign/parseRoutes тотальны — любой вход, включая undefined, даёт пустой разбор,
//             а не исключение; expand вызывается ТОЛЬКО после зелёного checkDesign (его антецедент —
//             маршрут, у которого каждый шаг разрешается в узел и в существующую альтернативу),
//             поэтому newDesign выстраивает их именно в этом порядке; правило живёт ровно в одном
//             месте — RULES ниже, номера совпадают с docs/data-flow.md §6
// Interface:  parseDesign(xml) -> Map<path, Node>
//             parseRoutes(xml) -> Route[]
//             expand(nodes, routes) -> string
//             checkDesign({ nodes, routes, frd, known }) -> string[]  — блокеры, пусто = зелёный
//             newDesign({ xml, frd, known }) -> Result<Design, "invalid-design">

import { ok, err } from "../../core/result.mjs"
// EXTERNAL_DEPENDENCY: core/xml.mjs — сканер тегов (attrs · ATTRS · tag) общий с steps/scope: одна
// грамматика на два среза читается одним кодом, иначе разбор частей и разбор дизайна разойдутся.
// Там же живёт BUG_FIX_CONTEXT про кавычко-устойчивость ATTRS.
import { attrs, ATTRS, tag } from "../../core/xml.mjs"

const alts = (s) => String(s || "").split("|").map((x) => x.trim()).filter(Boolean)

// FUNCTION_CONTRACT: parseDesign — узлы дизайн-графа из его текста
//   Input:        xml — текст `.agent/design-graph.xml`; тип не ограничен
//   Dependencies: —
//   Antecedent:   любое значение — undefined/null/мусор читаются как пустой граф
//   Consequent:   success: Map<path, { path, delta, in[], out[], deps[] }> в порядке появления;
//                          `in`/`out` — альтернативы контракта, разрезанные по `|` и обрезанные по
//                          краям; `<contract>` нет → обе пусты; повтор одного path — побеждает
//                          последний (ключ узла один, как в appgraph.xml)
//                 failure: нет — тотальна
//   Purity:       pure
export function parseDesign(xml) {
  const nodes = new Map()
  for (const m of String(xml || "").matchAll(tag("module", ">([\\s\\S]*?)</module>"))) {
    const a = attrs(m[1])
    const body = m[2]
    const c = attrs((body.match(new RegExp(`<contract\\b${ATTRS}/?>`)) || [""])[0])
    nodes.set(a.path, Object.freeze({
      path: a.path,
      delta: a.delta || "",
      in: Object.freeze(alts(c.in)),
      out: Object.freeze(alts(c.out)),
      deps: Object.freeze([...body.matchAll(tag("dep"))].map((d) => attrs(d[1]).path)),
    }))
  }
  return nodes
}

// FUNCTION_CONTRACT: parseRoutes — маршруты сценариев из того же текста
//   Input:        xml — текст `.agent/design-graph.xml`; тип не ограничен
//   Dependencies: —
//   Antecedent:   любое значение
//   Consequent:   success: [{ scenario, steps: [{ path, alt }] }] в порядке появления; `alt` —
//                          число из `<path>#<n>`, отсутствующий или нечисловой `#n` даёт NaN и
//                          ловится правилом 1, а не молча становится первой альтернативой
//                 failure: нет — тотальна
//   Purity:       pure
// Маршруты лежат В ТОМ ЖЕ файле, что и граф: роль отдаёт один артефакт, а не два — второй файл от
// той же роли пришлось бы сверять на согласованность ещё до пяти правил.
export function parseRoutes(xml) {
  return [...String(xml || "").matchAll(tag("route"))].map((m) => {
    const a = attrs(m[1])
    return Object.freeze({
      scenario: a.scenario || "",
      steps: Object.freeze(String(a.steps || "").split("->").map((s) => s.trim()).filter(Boolean).map((s) => {
        const [path, alt] = s.split("#")
        return Object.freeze({ path, alt: Number(alt) })
      })),
    })
  })
}

// FUNCTION_CONTRACT: expand — маршрут + контракты → текст потока данных
//   Input:        nodes — разбор parseDesign; routes — разбор parseRoutes
//   Dependencies: —
//   Antecedent:   ЗЕЛЁНЫЙ checkDesign: каждый шаг разрешается в узел, у которого есть альтернатива
//                 `alt`. Вызов на непроверенном маршруте — дефект вызывающего, а не этой функции
//   Consequent:   success: текст `.agent/data-flow.md`: на сценарий по блоку
//                          `$START_FLOW id="<сценарий>"` … `$END_FLOW`, внутри строки
//                          `<n>. <path> : <in> -> <out>`; `in` первого шага — первая альтернатива
//                          `in` его узла, `in` шага k+1 — ВЫБРАННЫЙ `out` шага k, скопированный
//                          дословно
//                 failure: нет при соблюдённом антецеденте
//   Purity:       pure
// Значения подставляет машина, а не роль: копия — то единственное, чего слабый тир не переживает
// (перефразирует), и то единственное, что скрипт делает даром.
export function expand(nodes, routes) {
  const out = []
  for (const r of routes) {
    out.push(`$START_FLOW id="${r.scenario}"`)
    r.steps.forEach((s, k) => {
      const n = nodes.get(s.path)
      const prev = k === 0 ? null : nodes.get(r.steps[k - 1].path)
      const inTok = k === 0 ? n.in[0] : prev.out[r.steps[k - 1].alt - 1]
      out.push(`${k + 1}. ${s.path} : ${inTok} -> ${n.out[s.alt - 1]}`)
    })
    out.push("$END_FLOW")
  }
  return out.join("\n")
}

// FUNCTION_CONTRACT: checkDesign — выравнивание двух проекций
//   Input:        { nodes, routes, frd }
//                 frd — { scenarios: string[], touched: string[] } из шага 6; разбор `.agent/frd.md`
//                       принадлежит срезу intake, здесь он ЗАВИСИМОСТЬ, а не забота
//   Dependencies: —
//   Antecedent:   nodes — Map разбора; routes — массив разбора; frd — объект с двумя массивами
//                 (отсутствующие поля читаются как пустые)
//   Consequent:   success: string[] блокеров, пусто = зелёный. Правила и их номера — те же, что в
//                          docs/data-flow.md §6, здесь они НЕ пересказываются прозой
//                 failure: нет — тотальна, «дизайн плох» есть ДАННЫЕ, а не отказ функции
//   Purity:       pure
// Узел маршрута обязан быть В ДИЗАЙН-ГРАФЕ, даже если не меняется: транзитный узел роль копирует
// из подграфа ряби с его контрактом и БЕЗ `delta`. Иначе expand нечем разворачивать шаг, а правило
// 4 нечем стыковать — контракт живёт на узле, и другого его источника у скрипта нет.
export function checkDesign({ nodes, routes = [], frd = {} }) {
  const B = []
  const used = new Set()

  for (const r of routes) {
    for (const [k, s] of r.steps.entries()) {
      const n = nodes.get(s.path)
      // Правило 1. Неизвестный узел закорачивает остальные проверки этой пары: три блокера об одном
      // дефекте роль чинит втрое дольше, чем один.
      if (!n) { B.push(`1 ${r.scenario}#${k + 1}: узла нет в дизайн-графе — ${s.path}`); continue }
      if (!n.out[s.alt - 1]) { B.push(`1 ${r.scenario}#${k + 1}: у ${s.path} нет альтернативы #${s.alt} в out`); continue }
      used.add(s.path)

      const next = r.steps[k + 1]
      if (!next) continue
      const m = nodes.get(next.path)
      if (!m) continue
      // Правило 3. Ребро ненаправленное: возврат разматывается по тому же <dep> назад.
      if (!n.deps.includes(m.path) && !m.deps.includes(n.path)) {
        B.push(`3 ${r.scenario}#${k + 1}: нет ребра <dep> между ${s.path} и ${m.path}`)
      }
      // Правило 4 — ЕДИНСТВЕННОЕ место, где остался ручной ввод роли: контракты соседей написаны
      // независимо друг от друга. Всё прочее держится подстановкой expand.
      if (!m.in.includes(n.out[s.alt - 1])) {
        B.push(`4 ${r.scenario}#${k + 1}: out «${n.out[s.alt - 1]}» не среди in узла ${m.path}`)
      }
    }
  }

  // Правило 2. Узел с дельтой, которого не проходит ни один маршрут, — структура без времени: его
  // никто не вызывает, и тикет на него будет написан вслепую.
  for (const n of nodes.values()) if (n.delta && !used.has(n.path)) B.push(`2 узел с delta="${n.delta}" не встречен ни в одном маршруте — ${n.path}`)

  // Правило 5. Дельта, о которой забыли: сценарий FRD без маршрута и тронутый узел вне маршрутов.
  const covered = new Set(routes.map((r) => r.scenario))
  for (const s of frd.scenarios || []) if (!covered.has(s)) B.push(`5 у сценария FRD ${s} нет маршрута`)
  for (const t of frd.touched || []) if (!used.has(t)) B.push(`5 touched FRD не встречен ни в одном маршруте — ${t}`)

  return B
}

// FUNCTION_CONTRACT: newDesign — артефакты шага 9 из текста роли
//   Input:        { xml, frd } — xml как его написала роль в staging
//   Dependencies: parseDesign, parseRoutes, checkDesign, expand
//   Antecedent:   xml — любое значение (пустой текст даёт пустой граф и отказ «ни одного узла»);
//                 frd — как у checkDesign
//   Consequent:   success: { nodes, routes, flow } — flow есть текст `.agent/data-flow.md`,
//                          развёрнутый ИЗ контрактов, а не из того, что набрала роль
//                 failure: "invalid-design" — блокеры одной строкой через `\n  `, тем же способом,
//                          что у newBrd: этот текст едет в FEEDBACK наряда пере-делегации
//   Purity:       pure
export function newDesign({ xml, frd = {} }) {
  const nodes = parseDesign(xml)
  const routes = parseRoutes(xml)
  if (!nodes.size) return err("invalid-design", "в дизайн-графе нет ни одного <module> — картировать изменение нечем")

  const blockers = checkDesign({ nodes, routes, frd })
  if (blockers.length) return err("invalid-design", blockers.join("\n  "))

  return ok(Object.freeze({ nodes, routes: Object.freeze(routes), flow: expand(nodes, routes) }))
}
