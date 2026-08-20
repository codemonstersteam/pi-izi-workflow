// MODULE_CONTRACT: gate — что оператор видит на гейте 1 и как читается его ответ
// Purpose:    одно решение — как СВЁРНУТЬ принятый план в то, что человек прочтёт целиком, и как
//             разобрать его ответ. Сам план собирается не здесь.
// io:         none
// Interface:  gateView, readGate
//
// ОТКУДА ЭТОТ ФАЙЛ. Выделен из steps/design/plandoc.mjs 21.08.2026 при переделке шага 9
// (docs/plan.md). Сборка PLAN.md из карточек (coverageOf, orderOf, cycleRefusal, planDoc) удалена:
// она строила очередь работ из объявленных ВЫЗОВОВ, а очередь строится из отношения «без чего меня
// не написать». Гейт к тому решению отношения не имеет и переживает переделку.

import { raisesBlock } from "../plan/raises.mjs"

// FUNCTION_CONTRACT: gateView — the plan as the operator reads it at the gate
//   Input:        { frd, modules, parts, sections, order, key, base }
//   Dependencies: —
//   Antecedent:   any values
//   Consequent:   success: the text shown at the gate — every line a CUT or a COUNT
//                 failure: none — total
//   Purity:       pure
//   Interface:    gateView({ frd, modules, parts, sections, order, key, base }) -> string
//
// NOT ONE NEW WORD, and that is the whole design of this function. The goal is `<frd goal>` verbatim,
// the branches are the partitions with their own use case ids, «новых» counts `modules.new`, «первым»
// is the head of the order of phase ⑦, the commands are the `verify` lines, the branch is the task
// key and the trunk. A role writing prose here was built and reverted: the gate is the one place
// where an unverifiable sentence does the most damage — a human who reads a confident introduction
// stops reading the sections, and everything else on this step is checked against the FRD, the map
// and the sample.
export function gateView({ frd = {}, modules = new Map(), parts = [], sections = [], order = [], key = "", base = "" } = {}) {
  const ucs = ((frd && frd.usecases) || []).map((u) => String((u && u.id) || "").trim()).filter(Boolean)
  const created = [...modules.values()].filter((m) => m.new).length

  // Use case ids compacted into runs: UC1 UC2 UC3 UC5 → «UC1-UC3 · UC5». The gate reads eight ids as
  // noise and a range as a fact.
  const runs = (ids) => {
    const n = ids.map((x) => ({ id: x, k: Number(String(x).replace(/\D+/g, "")) })).sort((a, b) => a.k - b.k)
    const out = []
    for (const x of n) {
      const last = out[out.length - 1]
      if (last && x.k === last.to + 1) { last.to = x.k; last.end = x.id; continue }
      out.push({ from: x.k, to: x.k, start: x.id, end: x.id })
    }
    return out.map((r) => (r.from === r.to ? r.start : `${r.start}-${r.end}`)).join(" · ")
  }

  const wide = Math.max(0, ...parts.map((p) => runs([...p.ucs]).length))
  const rows = parts.map((p, k) => {
    const mine = [...p.modules]
    const isNew = mine.filter((m) => (modules.get(m) || {}).new).length
    const tail = k === parts.length - 1 ? "└─" : k === 0 ? "┬─" : "├─"
    // Склонение — не украшение: гейт читает человек, и «3 модулей» спотыкает на первой же строке.
    const tail1 = mine.length % 10, tail2 = mine.length % 100
    const count = `${mine.length} ${tail1 === 1 && tail2 !== 11 ? "модуль" : tail1 >= 2 && tail1 <= 4 && (tail2 < 12 || tail2 > 14) ? "модуля" : "модулей"}`
    const born = isNew === 0 ? "все правятся" : isNew === mine.length ? "все новые" : `${isNew} новых`
    return `  ${k === 0 ? `${ucs.length} use case ─` : " ".repeat(String(ucs.length).length + 11)}${tail} ${runs([...p.ucs]).padEnd(wide)} ──► ${p.slug} · ${count} (${born})`
  })

  // The check commands, counted by the command itself: «13 команд — mvn test ×11, native IT ×2» is a
  // fact about the work, and it is the operator's first question about cost.
  const cmds = new Map()
  for (const s of sections) {
    const m = String(s.body || "").match(/^\s*verify:\s*([^\n·]+)/m)
    if (!m) continue
    const cmd = m[1].trim().replace(/\s+-D\S+/g, "").trim()
    cmds.set(cmd, (cmds.get(cmd) || 0) + 1)
  }
  const byCmd = [...cmds].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ×${n}`).join(", ")

  const head = order[0] || ""
  const callers = head ? sections.filter((s) => (s.calls || []).includes(head)).length : 0

  return [
    `ГЕЙТ 1${key ? ` · ${key}` : ""}${key ? ` · план: task/${key}/PLAN.md` : ""}`,
    "",
    `Цель: ${(frd && frd.goal) || "—"}`,
    "",
    ...rows,
    "",
    `  Работ: ${modules.size} модулей, ${created} новых${head ? ` · первым ${head.split("/").pop()}, его зовут ${callers} из ${modules.size}` : ""}`,
    `  Проверка: ${sections.length} команд — ${byCmd || "не названы"}`,
    `  Ветка: feature/${key || "<КЛЮЧ>"} от ${base || "<транк>"}`,
    "",
    "Ответ: approve · rework: <что не так в плане> · requirements: <какое требование упущено> · stop",
  ].join("\n")
}

// FUNCTION_CONTRACT: readGate — what the operator answered, as one of FOUR decisions
//
// ЧЕТВЁРТОЕ РЕШЕНИЕ — ЕДИНСТВЕННАЯ ЗАКОННАЯ ОТМОТКА КОНВЕЙЕРА. `rework` — «план собран не так»:
// его чинят критик и фиксер на месте, не трогая шагов выше. `requirements` — «мы упустили
// требование»: тут правкой плана не обойтись, потому что источника у этой работы нет вовсе, и
// полоса возвращается в начало — к доработке требований и интейку. Решает это ЧЕЛОВЕК, а не роль:
// отличить «план не отражает требование» от «требования не было» может только тот, чья это работа.
//   Input:        answer — the operator's text
//   Dependencies: —
//   Antecedent:   any value
//   Consequent:   success: { kind: "approve" | "rework" | "stop" | "", comment }
//                 failure: none — total; an unrecognised answer is kind "" and the caller asks again
//   Purity:       pure
//   Interface:    readGate(answer?) -> { kind, comment }
//
// THREE WORDS, NOT PROSE. The gate's decision is what the band branches on, and a decision parsed out
// of a sentence is a decision the next run cannot reproduce. `rework` carries the operator's own
// words — they are the input of step 6, not a comment on the plan.
export function readGate(answer = "") {
  const src = String(answer || "").trim()
  if (/^approve\b/i.test(src)) return Object.freeze({ kind: "approve", comment: "" })
  if (/^stop\b/i.test(src)) return Object.freeze({ kind: "stop", comment: "" })
  for (const kind of ["requirements", "rework"]) {
    const m = src.match(new RegExp(`^${kind}\\s*:?\\s*([\\s\\S]*)$`, "i"))
    if (!m) continue
    const comment = m[1].trim()
    return Object.freeze({ kind: comment ? kind : "", comment })
  }
  return Object.freeze({ kind: "", comment: "" })
}
