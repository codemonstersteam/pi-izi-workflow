// MODULE_CONTRACT: cut — io-труба подшага 3Б: план + факт скрипта → ЧТО читает рой
// Purpose:    одно решение: что читается с диска. Срезы-конусы и сам выбор — pure (slices.mjs,
//             focus.core.mjs); здесь — разбор артефактов и сбор их аргументов.
// io:         fs
// EXTERNAL_DEPENDENCY: steps/scope/focus/{slices,focus.core}.mjs — pure ядра; steps/scope/computed.mjs::
//             parseComputed — чтение собственного формата; steps/brd/brd.mjs::parseBrd — предметы.
// Invariants: ТОТАЛЕН; суд входа уже зелёный (inputs.mjs) — файлы существуют и по отпечатку.
// Interface: focusOf
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { ok, err } from "../../../core/result.mjs"
import { parseComputed } from "../computed.mjs"
import { newSlices } from "./slices.mjs"
import { newFocus } from "./focus.core.mjs"
import { parseBrd } from "../../brd/brd.mjs"
import { ANCHORS, BRD, COMPUTED, PLAN } from "../paths.mjs"

// FUNCTION_CONTRACT: focusOf — фокус роя по плану, факту скрипта и якорям шага 2
//   Input:        state (cwd)
//   Antecedent:   inputs(state) === ""
//   Consequent:   success: { focus, focusJson } — объект newFocus и его сериализация
//                 failure: err с именем (no-plan · no-entry · no-anchor — решения focus.core)
//   Purity:       io (fs)
export function focusOf(state) {
  const plan = JSON.parse(readFileSync(join(state.cwd, PLAN), "utf8"))
  const computed = parseComputed(readFileSync(join(state.cwd, COMPUTED), "utf8"))
  const subjects = parseBrd(readFileSync(join(state.cwd, BRD), "utf8")).subjects || []
  const spread = JSON.parse(readFileSync(join(state.cwd, ANCHORS), "utf8"))

  const nodes = plan.cells.flatMap((c) => (c.files || []).map((f) => f.path))
  const slices = newSlices({ nodes, edges: computed.edges, routes: computed.api.map((a) => a.at) })

  const decls = {}
  for (const d of computed.decls) decls[d.at] = (decls[d.at] || 0) + 1
  const apis = {}
  for (const a of computed.api) apis[a.at] = (apis[a.at] || 0) + 1

  const focus = newFocus({
    slices: slices.slices, anchors: subjects, spread, cells: plan.cells,
    edges: computed.edges, decls, apis,
    normalized: existsSync(join(state.cwd, ".agent/normalized.md")) ? readFileSync(join(state.cwd, ".agent/normalized.md"), "utf8") : "",
    edges: computed.edges, decls, apis,
  })
  if (!focus.ok) return err(focus.error.kind || "no-focus", focus.error.detail)
  return ok({ focus: focus.value, focusJson: `${JSON.stringify(focus.value, null, 2)}\n`, slices: slices.slices.length })
}
