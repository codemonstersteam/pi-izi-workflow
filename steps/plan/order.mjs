// MODULE_CONTRACT: order — очередь работ: кого писать раньше
// Purpose:    одно решение — топологическая сортировка модулей изменения. САМА СОРТИРОВКА НЕ БЫЛА
//             ДЕФЕКТОМ: три дня кругов дали ей рёбра «кто кого зовёт», а вызовы в слоёной системе
//             образуют круг по природе (запрос вниз, ответ вверх) — измерено 21.08.2026, docs/plan.md §0.
//             Отношение, которое сюда подаётся, теперь одно: «без чего этот файл не написать».
// io:         none
// Invariants: вызываемый раньше вызывающего; ничьи разрешаются порядком FRD; круг возвращается
//             путём, а не пустым списком.
// Interface:  orderOf
//
// ОТКУДА ЭТОТ ФАЙЛ. Выделен из steps/design/plandoc.mjs 21.08.2026 при переделке шага 9. Вместе с
// ним удалены coverageOf, planDoc и cycleRefusal — они собирали PLAN.md из карточек и объясняли
// круг, которого в новом отношении быть не может.

// FUNCTION_CONTRACT: orderOf — the queue of work, out of what the plans DECLARE
//   Input:        { sections, modules, edges } — the sections, the change's modules and the MAP's
//                 directed edges (`from` uses `to`)
//   Dependencies: —
//   Antecedent:   any values
//   Consequent:   success: { order, cycle } — `order` the modules, callee before caller, ties broken
//                          by the FRD's order; `cycle` the path that closed a circle, or []
//                 failure: none — total
//   Purity:       pure
//   Interface:    orderOf({ sections, modules, edges }) -> { order, cycle }
//
// THE ORDER IS DECLARED, NOT DERIVED (D42). A chain of the flow says a value moved from A to B; this
// asks what must be WRITTEN first, and on a data class the two are opposite. So the operand is the
// `calls:` line, written by whoever decided the module — measured: making that line MANDATORY took
// `eddi` from 2 declared edges over 8 sections to 20 over 13.
//
// The map's edges join in for modules that already exist: what the repository statically calls is a
// fact, not an opinion. A circle is a REFUSAL and not a silent reordering — its two ends were both
// written by a role, so there is something to repair.
export function orderOf({ sections = [], modules = new Map(), edges = [] } = {}) {
  const nodes = [...modules.keys()]
  const has = new Set(nodes)
  const deps = new Map(nodes.map((p) => [p, new Set()]))

  for (const s of sections) {
    if (!deps.has(s.path)) continue
    for (const c of s.calls || []) if (has.has(c) && c !== s.path) deps.get(s.path).add(c)
  }
  for (const e of edges || []) {
    if (!e || !has.has(e.from) || !has.has(e.to) || e.from === e.to) continue
    if ((modules.get(e.from) || {}).new || (modules.get(e.to) || {}).new) continue   // карта знает только существующее
    deps.get(e.from).add(e.to)
  }

  const order = []
  const left = new Map([...deps].map(([p, d]) => [p, new Set(d)]))
  while (left.size) {
    const ready = [...left].filter(([, d]) => ![...d].some((x) => left.has(x))).map(([p]) => p)
    if (!ready.length) {
      // The first circle, as the path that closes it: a blocker has to name WHICH modules, because
      // that is what the role rewrites.
      const stuck = [...left.keys()]
      const seen = new Map(), stack = []
      let cycle = []
      const walk = (n) => {
        if (cycle.length) return
        if (seen.get(n) === 1) { cycle = [...stack.slice(stack.indexOf(n)), n]; return }
        if (seen.get(n) === 2) return
        seen.set(n, 1); stack.push(n)
        for (const m of left.get(n) || []) if (left.has(m)) walk(m)
        seen.set(n, 2); stack.pop()
      }
      for (const n of stuck) if (!cycle.length) walk(n)
      return Object.freeze({ order: Object.freeze(order), cycle: Object.freeze(cycle.length ? cycle : stuck) })
    }
    for (const p of ready) { order.push(p); left.delete(p) }
  }
  return Object.freeze({ order: Object.freeze(order), cycle: Object.freeze([]) })
}
