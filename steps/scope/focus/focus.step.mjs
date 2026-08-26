// MODULE_CONTRACT: подшаг 3Б — решено, ЧТО обследует рой. Голова над вырожденной пятёркой.
// Purpose:    одно решение: годится ли фокус как состав работ роя. Роли нет — срезы-конусы и
//             квота считаются скриптом, 0 токенов; выбор происходит ДО роя, и это весь смысл
//             подшага (docs/big-projects-problems.md §2: «карта не влезает» узнали на 306 вызовах).
// io:         fs
// EXTERNAL_DEPENDENCY: ext/state.mjs::put; ext/values.mjs — вердикт; пятёрка inputs → cut → judge → route.
// Invariants: СКРИПТОВЫЙ ПРОХОД НЕ КРУЖИТ — красный суд есть дефект кода, named-отказ наружу.
// Interface: id, next, fold
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { ok, err } from "../../../core/result.mjs"
import { put } from "../../../ext/state.mjs"
import { verdict as newVerdict } from "../../../ext/values.mjs"
import { inputs } from "./inputs.mjs"
import { focusOf } from "./cut.mjs"
import { judgeFocus } from "./judge.mjs"
import { promote } from "./route.mjs"
import { parseBrd } from "../../brd/brd.mjs"
import { BRD, FOCUS } from "../paths.mjs"

export const id = "scope/focus"

// FUNCTION_CONTRACT: next — ЧТО делать дальше
//   Consequent:   done · err · say; НИКОГДА role
//   Purity:       io (читает; пишет только route)
export function next(state) {
  const bad = inputs(state)
  if (bad) return { do: "err", code: "blocked", cls: bad.cls, subject: bad.why }
  if (state.at && state.at.focus) return { do: "done", state }

  const cut = focusOf(state)
  if (!cut.ok) return { do: "err", code: "blocked", subject: cut.error.detail }
  const f = cut.value.focus
  return {
    do: "say",
    line: `scope/focus: ${f.why} — взято ${f.cells.length} клеток из ${(f.cells.length + (f.dropped && f.dropped.cells) || 0)}, ` +
          `покрыто ${f.covered.length} · названо непрочитанным ${f.uncovered.length} — 0 токенов`,
    focus: f,
    focusJson: cut.value.focusJson,
  }
}

// FUNCTION_CONTRACT: fold — суд и продвижение собранного фокуса
//   Consequent:   success: состояние со штампом at.focus; failure: Result.err
//   Purity:       io (fs — через route)
export function fold(state, event = {}) {
  const it = event.instruction || {}
  if (event.do !== "say") return err("fold", `подшаг ${id} не знает, что делать с событием «${event.do}»`)

  const subjects = parseBrd(readFileSync(join(state.cwd, BRD), "utf8")).subjects || []
  const blockers = judgeFocus({ focus: it.focus, anchors: subjects }).join("\n  ")
  const v = newVerdict({ step: id, scope: "whole", round: 1, ok: !blockers, blockers, at: FOCUS })
  if (!v.ok) return v
  if (blockers) return err("invalid", `фокус не прошёл свой суд:\n  ${blockers}`)

  const moved = promote(state, it.focusJson)
  if (moved.why) return err("fold", moved.why)
  return put(state, {
    verdicts: [...state.verdicts, v.value],
    at: { ...state.at, focus: moved },
  })
}
