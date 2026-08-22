// MODULE_CONTRACT: шаг 7 — вес изменения. Голова над пятёркой, вырожденной до inputs+cut+judge.
// Purpose:    одно решение: каким словом назван размер этого изменения.
// io:         fs
// EXTERNAL_DEPENDENCY: ext/state.mjs::put, sha1of; ext/values.mjs — конструктор вердикта.
// Invariants: РОЛИ НЕТ. Отбитый вес НЕ ОСТАВЛЯЕТ артефакта: вчерашнее слово пережило бы сегодняшний
//             отказ, и следующий шаг поехал бы по нему.
// Interface:  id, next, fold
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { err } from "../../core/result.mjs"
import { put, sha1of } from "../../ext/state.mjs"
import { verdict as newVerdict } from "../../ext/values.mjs"
import { inputs } from "./inputs.mjs"
import { weighOf, readAt } from "./cut.mjs"
import { judgeMode } from "./judge.mjs"
import { MODE } from "./paths.mjs"

export const id = "weight"

// FUNCTION_CONTRACT: next — ЧТО делать дальше
//   Consequent:   done · err · say; НИКОГДА role
//   Purity:       io (читает; не пишет)
export function next(state) {
  const bad = inputs(state)
  if (bad) return { do: "err", code: "blocked", subject: bad }
  if (state.at && state.at.mode) return { do: "done", state }

  const w = weighOf(state)
  if (w.why) return { do: "err", code: "blocked", subject: w.why }
  const blockers = judgeMode({ mode: w.mode }).join("\n  ")
  if (blockers) return { do: "err", code: "invalid", subject: blockers }
  return { do: "say", line: `weight: вес ${w.mode} по ${w.deltas} дельтам (${w.earned}) — скрипт, 0 токенов`, mode: w.mode }
}

// FUNCTION_CONTRACT: fold — куда кладётся результат
//   Consequent:   success: состояние с продвинутым `.agent/mode` и его отпечатком
//   Purity:       io (fs)
//   BUG_FIX_CONTEXT: отказ СНОСИТ артефакт. Состояние прогона уносится в .agent/prev, а артефакты
//                 остаются — и вчерашний `mode` пережил бы сегодняшний отказ, после чего шаг 9
//                 заказали бы или пропустили по слову, которого сегодня никто не считал.
export function fold(state, event = {}) {
  if (event.do !== "say") return err("fold", `шаг ${id} не знает, что делать с событием «${event.do}»`)
  const mode = (event.instruction || {}).mode || ""
  const blockers = judgeMode({ mode }).join("\n  ")
  const v = newVerdict({ step: id, scope: "whole", round: 1, ok: !blockers, blockers, at: MODE })
  if (!v.ok) return v

  const abs = join(state.cwd, MODE)
  if (blockers) {
    if (existsSync(abs)) rmSync(abs)
    return put(state, { verdicts: [...state.verdicts, v.value] })
  }
  mkdirSync(dirname(abs), { recursive: true })     // пишется ПОСЛЕ решения принять
  writeFileSync(abs, mode)                          // одно слово, без перевода строки
  return put(state, {
    verdicts: [...state.verdicts, v.value],
    at: { ...state.at, mode: { path: MODE, sha1: sha1of(readFileSync(abs, "utf8")) } },
  })
}
