// MODULE_CONTRACT: focus — which cells the swarm surveys, decided BEFORE the swarm runs
// Purpose:    one decision — the focus of the run: every cell of the plan while the plan fits the
//             reader's window, and the cones the BRD's anchors point at once it does not. The
//             decision costs zero tokens and happens before step 4, which is the whole point: today
//             the pipeline learns "the map does not fit" at step 6, having already paid 306 scout
//             calls and ≈10M input tokens for the answer (docs/big-projects-problems.md §2).
// io:         none
// EXTERNAL_DEPENDENCY: none at runtime — but `answers` arrives from .agent/answers.md through
//             ext/index.mjs::focus, and its entries are matched by the QUESTION's text. If that
//             file is missing the module simply sees no answer and asks again.
// Invariants: total — any input, including undefined, yields a Result; a chosen focus never names a
//             cell the plan does not carry; the spine cell is in every focus; the estimate is
//             `files × MAP_BYTES_PER_NODE`, and cells are taken WHOLE.
// Interface:  FOCUS_QUESTION — the question's text, verbatim and constant
//             ASK_CANDIDATES — how many candidates one question may carry
//             newFocus({ slices, orphans, marked, cells, answers, cap, perNode }) -> Result<Focus, …>

import { ok, err } from "../../core/result.mjs"
import { MAP_CAP_BYTES, MAP_BYTES_PER_NODE } from "../intake/map.mjs"

// The question, VERBATIM and never rebuilt from parts — the same rule, and the same reason, as
// steps/plan/plan.mjs::KEY_QUESTION. An answer is recognised by comparing the question stored on
// disk with this string (core/answers.mjs matches on the stem), so a question carrying the candidate
// list would stop matching its own answer the moment the list changed — the class of defect that
// cost run 46edab60 two re-asks of a question the operator had already answered.
//
// Everything variable — the candidates, the reason, the byte counts — travels in `evidence`, which
// ext/index.mjs::setPending writes into .agent/pending.json next to the question. That file is where
// the operator reads it and where izi_answer takes the numbering from; it is not part of the key.
// Second reason, independent of the first: askOperator replaces any `subject` longer than 1024 bytes
// with a generic text, so a list inside the question would not reach the operator anyway.
export const FOCUS_QUESTION =
  "Какие вертикальные срезы разведывать? Ответь номерами через запятую (например «1, 3»). Список кандидатов — вход, род и размер каждого — лежит в .agent/pending.json рядом с этим вопросом. Разведано будет ТОЛЬКО названное: то, что не попало в срезы, в карту репозитория не приедет."

// ASK_CANDIDATES — the list's ceiling, and it exists because the alternative was measured: when no
// anchor hits an entry, every entry is a candidate — 84 of them on eddi. "Answer with numbers" from
// a list of 84 is not a decision an operator can make. The hidden count is named in the evidence
// rather than silently dropped (standards/code.md §2: absence is a case, not an empty value).
export const ASK_CANDIDATES = 12

// refused — the re-ask, and why it is a DIFFERENT string rather than the same question twice.
// BUG_FIX_CONTEXT: live run 03b598c7 (steps/plan/plan.mjs::refused). askOperator judges "answered"
//   by the question's TEXT: re-asking with the identical text finds the old answer on disk and never
//   pauses, so the phase burns every QUESTION_ROUND in seconds without the operator seeing anything.
//   Here the answer is a list of numbers, which is easier to get wrong than a task key — so this
//   path is likelier, not less.
const refused = (value, why) =>
  `${FOCUS_QUESTION}\n\n(Предыдущий ответ «${value}» не подошёл: ${why}. Назови номера ещё раз.)`

const kb = (n) => `${Math.round(n / 1024)} КБ`

// FUNCTION_CONTRACT: newFocus — the run's focus, or the question that decides it
//   Input:        slices  — [{ id, entry, kind, nodes }] as newSlices returns them
//                 orphans — [string], the nodes no cone reached
//                 marked  — [string], the paths carrying a BRD anchor. PATHS, not anchor names: the
//                           plan already resolved names to files (files[].subjects), and resolving
//                           them again would be a second copy of the anchor rule plus a re-read of
//                           the whole tree in a step that promises zero io
//                 cells   — the plan's cells: [{ id, kind, files: [{ path }] }]
//                 answers — [{ question, text }] off .agent/answers.md
//                 cap     — the reading ceiling; MAP_CAP_BYTES when absent
//                 perNode — the estimated cost of one node; MAP_BYTES_PER_NODE when absent
//   Dependencies: ok, err (core/result.mjs), FOCUS_QUESTION, ASK_CANDIDATES, refused
//   Antecedent:   any values; missing ones read as empty. `cells` empty is the "no plan" case, not
//                 an empty focus
//   Consequent:   success: { why, chosen, cells, files, estBytes, slices, entries } where `why` is
//                          "whole-plan" | "anchors" | "answered", `chosen` the slice ids the focus
//                          took (every id when the whole plan fits) and `cells` the cell ids the
//                          swarm will survey
//                 failure: "no-plan"  — step 3 left no cells
//                          "no-entry" — the plan does not fit and not one entry exists: there is
//                                       nothing to narrow BY, and saying so before the swarm is
//                                       cheaper than finding out after it
//                          "ask"      — detail is { subject, evidence }: the constant question and
//                                       the variable list the operator answers from
//   Purity:       pure
//   Interface:    newFocus({ slices, orphans, marked, cells, answers, cap, perNode }) -> Result
//
// The order of the branches is itself a decision. "The whole plan fits" is checked BEFORE "there is
// no entry", so a small repository in a language with no edge rules keeps working exactly as it does
// today instead of meeting a refusal invented for monoliths (docs/big-projects-solution.md §7).
export function newFocus({ slices = [], orphans = [], marked = [], cells = [], answers = [], cap = MAP_CAP_BYTES, perNode = MAP_BYTES_PER_NODE } = {}) {
  const plan = (cells || []).filter((c) => c && c.id)
  if (!plan.length) return err("no-plan", ".agent/survey-plan.json не несёт ни одной клетки — шаг 3 не отработал")

  const filesOf = (cs) => cs.reduce((n, c) => n + (c.files || []).length, 0)
  const allFiles = filesOf(plan)
  const whole = {
    why: "whole-plan",
    chosen: slices.map((s) => s.id),
    cells: plan.map((c) => c.id),
    files: allFiles,
    estBytes: allFiles * perNode,
  }
  if (whole.estBytes <= cap) return ok(Object.freeze({ ...whole, slices, entries: slices.length }))

  if (!slices.length) {
    return err("no-entry", `план не влезает в карту (${allFiles} файлов ≈ ${kb(allFiles * perNode)} при потолке ${kb(cap)}), а сузить нечем: ни одного входа — ни маршрута, ни головы графа. Узлов ${allFiles}, из них не достигнуто ни одним входом ${orphans.length}`)
  }

  // Which cell holds which path — built once, used by every candidate below. A cell is taken WHOLE:
  // its composition is the key of the .izi/parts cache, and filtering files inside it would void the
  // cache and break step 3's coverage invariant (docs/big-projects-solution.md §5).
  const cellOf = new Map()
  for (const c of plan) for (const f of c.files || []) cellOf.set(f.path, c)
  const cellsFor = (paths) => {
    const out = new Set(plan.filter((c) => c.kind === "spine"))   // the spine answers the six questions
    for (const p of paths) { const c = cellOf.get(p); if (c) out.add(c) }
    return out
  }

  const isMarked = new Set(marked)
  // The marked orphans are counted as PATHS, never as the cells they land in: cellsFor always adds
  // the spine, so "are there any" asked of the cell set would answer yes on an empty selection and
  // the question rail would never open.
  const markedOrphans = orphans.filter((p) => isMarked.has(p))
  const anchored = slices.filter((s) => isMarked.has(s.entry))

  const take = (chosen) => {
    const cs = cellsFor([...chosen.flatMap((s) => s.nodes), ...markedOrphans])
    const files = filesOf([...cs])
    return { cs: [...cs], files, estBytes: files * perNode }
  }

  // The candidates the question offers. When an anchor did hit entries, the operator chooses among
  // THOSE; when it hit none, among every entry there is. Either way the list is cut to
  // ASK_CANDIDATES and ordered as newSlices ordered it — by cone size — so the same run re-asking
  // shows the same numbers.
  const pool = anchored.length ? anchored : slices
  const shown = pool.slice(0, ASK_CANDIDATES)
  const evidence = (why) => {
    const lines = shown.map((s, i) => {
      const t = take([s])
      return `${i + 1}. ${s.entry} · ${s.kind} · узлов ${s.nodes.length} · клеток ${t.cs.length} ≈ ${kb(t.estBytes)}`
    })
    const hidden = pool.length > shown.length ? `\n(показаны ${shown.length} самых больших из ${pool.length})` : ""
    return `${why}\nПотолок карты ${kb(cap)}. Весь план — ${allFiles} файлов ≈ ${kb(allFiles * perNode)}.\nКандидаты:\n${lines.join("\n")}${hidden}`
  }

  // An answer, if the operator has already given one. The stem is matched by PREFIX and the LAST
  // matching answer wins — a re-ask appends its reason to the same stem, and the operator who
  // corrects a typo answers again (steps/plan/plan.mjs, same rule).
  const mine = (answers || []).filter((a) => a && String(a.question).trim().startsWith(FOCUS_QUESTION))
  const said = mine.length ? String(mine[mine.length - 1].text || "").trim() : ""
  if (said) {
    const nums = [...said.matchAll(/\d+/g)].map((m) => Number(m[0]))
    if (!nums.length) return err("ask", { subject: refused(said, "номеров в ответе нет"), evidence: evidence("Ответ не разобран.") })
    const bad = nums.find((n) => n < 1 || n > shown.length)
    if (bad !== undefined) return err("ask", { subject: refused(said, `номер ${bad} вне списка 1..${shown.length}`), evidence: evidence("Номер вне списка.") })
    const chosen = [...new Set(nums)].map((n) => shown[n - 1])
    const t = take(chosen)
    if (t.estBytes > cap) {
      return err("ask", { subject: refused(said, `выбранное всё ещё выше потолка — ${kb(t.estBytes)} при ${kb(cap)}`), evidence: evidence("Выбор выше потолка.") })
    }
    return ok(Object.freeze({ why: "answered", chosen: chosen.map((s) => s.id), cells: t.cs.map((c) => c.id), files: t.files, estBytes: t.estBytes, slices, entries: slices.length }))
  }

  if (!anchored.length && !markedOrphans.length) {
    return err("ask", { subject: FOCUS_QUESTION, evidence: evidence(`Ни один якорь BRD не попал во ВХОД среза (входов ${slices.length}).`) })
  }

  const t = take(anchored)
  if (t.estBytes > cap) {
    return err("ask", { subject: FOCUS_QUESTION, evidence: evidence(`Якоря выбрали ${anchored.length} срезов — ${kb(t.estBytes)}, это выше потолка.`) })
  }
  return ok(Object.freeze({ why: "anchors", chosen: anchored.map((s) => s.id), cells: t.cs.map((c) => c.id), files: t.files, estBytes: t.estBytes, slices, entries: slices.length }))
}
