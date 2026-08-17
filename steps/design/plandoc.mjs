// MODULE_CONTRACT: plandoc — step 9's phases ⑥⑦⑧: is the requirement covered, in what order is the
//                            work done, and what does the human read at the gate
// Purpose:    three decisions, and all three are the machine's — the role has already answered the
//             only question that needed a model (how does each module change). Here the plans of the
//             partitions are checked for holes, ordered by what they DECLARE, and glued into one
//             document from which tickets are cut without a single further decision.
//             PURE: knows nothing of disk, io lives in ext/index.mjs. The flow — steps/design-data-flow.md.
// io:         none
// EXTERNAL_DEPENDENCY: steps/design/card.mjs::sectionsOf — the ONE parse of a partition's plan. This
//             module never re-reads the markdown: a second cut of the same text is how a plan judged
//             green could carry an order nobody builds.
// Invariants: every function here is TOTAL — any input, including undefined, yields an empty result
//             and never throws; the order is a FUNCTION of the sections and the map, so two runs over
//             one pair agree byte for byte, and ties are broken by the FRD's own order of modules.
// Interface:  coverageOf({ frd, modules, sections }) -> string[]   — фаза ⑥, blockers, empty = green
//             orderOf({ sections, modules, edges }) -> { order, cycle }        — фаза ⑦
//             planDoc({ frd, sections, order, modules }) -> string          — фаза ⑧

// THE NUMBERING IS ALREADY UNIFORM WHEN THE TEXT GETS HERE. A step number written in another
// alphabet (`2а` for the FRD's `2a`) is refused by the guardrail of phase ⑤ — where the line was
// written and where a role can repair it. Normalising here instead would make the defect invisible:
// covered on paper, mistyped on disk, and the ticket cut against a step nobody can find.

// FUNCTION_CONTRACT: coverageOf — did the plans cover the requirement, all of it
//   Input:        { frd, modules, sections } — parseFrd's object, the modules of the change
//                 (partsOf's Map) and every section of every partition's plan
//   Dependencies: —
//   Antecedent:   any values
//   Consequent:   success: string[] — one blocker per hole, empty means green
//   Purity:       pure
//   Interface:    coverageOf({ frd, modules, sections }) -> string[]
//
// THREE HOLES, AND EACH OF THEM IS A REQUIREMENT SILENTLY LOST. A module with no section is work
// nobody planned; a use case named nowhere is a requirement nobody closed; a step covered by no
// section is the half of a use case that quietly did not ship. Nothing here judges MEANING — both
// sides are numbered by machines, and this is a comparison of two sets of numbers.
export function coverageOf({ frd = {}, modules = new Map(), sections = [] } = {}) {
  const B = []
  const decided = new Set(sections.map((s) => s.path))
  const lost = [...modules.keys()].filter((p) => !decided.has(p))
  if (lost.length) B.push(`модули изменения без раздела: ${lost.join(", ")} — их никто не планировал`)

  const closes = new Set(sections.flatMap((s) => s.closes))
  const named = new Set([...closes].map((c) => c.split("/")[0]))

  for (const u of (frd && frd.usecases) || []) {
    const id = String((u && u.id) || "").trim()
    if (!id) continue
    if (!named.has(id)) { B.push(`use case ${id} не назван ни в одном «закрывает» — требование не закрыто ничем`); continue }
    const want = [
      ...((u.steps || []).map((_, k) => String(k + 1))),
      ...((u.exts || []).map((e) => String((e && e.id) || "")).filter(Boolean)),
    ]
    const miss = want.filter((n) => !closes.has(`${id}/${n}`))
    if (miss.length) B.push(`у ${id} не закрыты шаги: ${miss.join(", ")} — назови их в «закрывает» того раздела, который их делает`)
  }
  return B
}

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
// `зовёт:` line, written by whoever decided the module — measured: making that line MANDATORY took
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

// FUNCTION_CONTRACT: planDoc — the one document a human reads at the gate
//   Input:        { frd, sections, order, modules }
//   Dependencies: —
//   Antecedent:   any values
//   Consequent:   success: the text of PLAN.md — a header of counts, then every section VERBATIM in
//                          the order of work
//                 failure: none — total
//   Purity:       pure
//   Interface:    planDoc({ frd, sections, order, modules }) -> string
//
// THE SECTIONS ARE COPIED, NOT REWRITTEN. What the role wrote is what the gate reads and what step 14
// cuts a ticket from — `outputs` is the heading, `blocked_by` is «зовёт», the DoD is «проверка». A
// document that paraphrased them would be a second source of truth about the same work.
export function planDoc({ frd = {}, sections = [], order = [], modules = new Map() } = {}) {
  const byPath = new Map(sections.map((s) => [s.path, s]))
  const ucs = ((frd && frd.usecases) || []).map((u) => String((u && u.id) || "").trim()).filter(Boolean)
  const out = [
    `# План доработки — ${modules.size} модулей, ${ucs.length} use case`,
    "",
    `Цель изменения: ${(frd && frd.goal) || "—"}`,
    "",
    // ПОЧЕМУ ТАКОЙ ПОРЯДОК — одной строкой и из тех же рёбер, что дали сам порядок. Проза здесь была
    // и снята: она единственная на шаге не проверялась по существу, а человек, прочитавший уверенное
    // введение, перестаёт читать разделы. Число зовущих — факт, и его можно перепроверить глазами.
    ...(order.length ? [`Первым идёт \`${order[0]}\`: его зовут ${
      sections.filter((s) => (s.calls || []).includes(order[0])).length} из ${order.length} модулей.`, ""] : []),
    "Порядок работ ниже — топологический: модуль стоит после всех, кого он зовёт. Один раздел = один",
    "тикет: путь заголовка — что правим, «зовёт» — чего ждём, «проверка» — чем закрываем.",
    "",
    "| # | модуль | новый | закрывает |",
    "|---|---|---|---|",
    ...order.map((p, k) => {
      const s = byPath.get(p)
      const m = modules.get(p) || {}
      return `| ${k + 1} | \`${p}\` | ${m.new ? "да" : "—"} | ${((s && s.closes) || []).join(" · ") || "—"} |`
    }),
    "",
    "---",
    "",
  ]
  for (const [k, p] of order.entries()) {
    const s = byPath.get(p)
    if (!s) continue
    out.push(`## ${k + 1}. ${p}`, String(s.body || "").trim(), "")
  }
  return out.join("\n")
}
