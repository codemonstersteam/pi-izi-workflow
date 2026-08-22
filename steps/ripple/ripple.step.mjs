// MODULE_CONTRACT: шаг 8 — что задето: объявления, API, соседи. Голова над вырожденной пятёркой.
// Purpose:    одно решение: какой подграф репозитория изменение затрагивает.
// io:         fs
// EXTERNAL_DEPENDENCY: ext/state.mjs::put, sha1of; ext/values.mjs — конструктор вердикта.
// Invariants: РОЛИ НЕТ. Отбитая рябь НЕ ОСТАВЛЯЕТ артефакта: вчерашний подграф пережил бы отказ, и
//             шаг 9 спроектировали бы по нему.
//             РЕЛЬСА `.agent/design` (needed|skip) ОТЛОЖЕНА решением оператора 21.08.2026: второго
//             выхода у шага нет, и любая правка едет через полный шаг 9. Записано здесь, чтобы
//             следующий читатель не счёл рельсу забытой и не восстановил втихую.
// Interface:  id, next, fold
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { err } from "../../core/result.mjs"
import { put, sha1of } from "../../ext/state.mjs"
import { verdict as newVerdict } from "../../ext/values.mjs"
import { inputs } from "./inputs.mjs"
import { rippleOf, knownOf } from "./cut.mjs"
import { judgeRipple } from "./judge.mjs"
import { RIPPLE } from "./paths.mjs"

export const id = "ripple"

// FUNCTION_CONTRACT: next — ЧТО делать дальше
//   Consequent:   done · err · say; НИКОГДА role
//   Purity:       io (читает; не пишет)
export function next(state) {
  const bad = inputs(state)
  if (bad) return { do: "err", code: "blocked", subject: bad }
  if (state.at && state.at.ripple) return { do: "done", state }

  const r = rippleOf(state)
  if (r.why) return { do: "err", code: "blocked", subject: r.why }
  return { do: "say", line: `ripple: семян ${r.seeds}, узлов ${r.nodes} из ${r.total} — скрипт, 0 токенов`, xml: r.xml }
}

// FUNCTION_CONTRACT: fold — куда кладётся результат
//   Consequent:   success: состояние с продвинутой рябью и её отпечатком
//   Purity:       io (fs)
export function fold(state, event = {}) {
  if (event.do !== "say") return err("fold", `шаг ${id} не знает, что делать с событием «${event.do}»`)
  const xml = (event.instruction || {}).xml || ""
  const blockers = judgeRipple({ text: xml, known: knownOf(state) }).join("\n  ")
  const v = newVerdict({ step: id, scope: "whole", round: 1, ok: !blockers, blockers, at: RIPPLE })
  if (!v.ok) return v

  const abs = join(state.cwd, RIPPLE)
  if (blockers) {
    if (existsSync(abs)) rmSync(abs)
    return put(state, { verdicts: [...state.verdicts, v.value] })
  }
  mkdirSync(dirname(abs), { recursive: true })      // пишется ПОСЛЕ решения принять
  writeFileSync(abs, `${xml}\n`)
  return put(state, {
    verdicts: [...state.verdicts, v.value],
    at: { ...state.at, ripple: { path: RIPPLE, sha1: sha1of(readFileSync(abs, "utf8")) } },
  })
}
