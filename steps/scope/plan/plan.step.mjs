// MODULE_CONTRACT: подшаг 3A — дерево файлов становится планом клеток. Голова над вырожденной пятёркой.
// Purpose:    одно решение: годится ли план как ВХОД роя. Роли нет — резка, отпечатки и computed-факт
//             считаются скриптом, 0 токенов (вырожденная форма шага легальна,
//             standards/workflow-design.md: шаг без роли не имеет order и ask).
// io:         fs
// EXTERNAL_DEPENDENCY: ext/state.mjs::put — состояние; ext/values.mjs — конструктор вердикта;
//             пятёрка: inputs → cut → judge → route.
// Invariants: СКРИПТОВЫЙ ПРОХОД НЕ КРУЖИТ: красный суд — дефект кода, а не артефакта, чинить
//             некому — подшаг останавливается named-отказом, а не уходит в вечный круг.
// Interface: id, next, fold
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { ok, err } from "../../../core/result.mjs"
import { put } from "../../../ext/state.mjs"
import { verdict as newVerdict } from "../../../ext/values.mjs"
import { inputs } from "./inputs.mjs"
import { planOf } from "./cut.mjs"
import { judgePlan } from "./judge.mjs"
import { promote } from "./route.mjs"
import { parseBrd } from "../../brd/brd.mjs"
import { BRD } from "../paths.mjs"

export const id = "scope/plan"

// FUNCTION_CONTRACT: next — ЧТО делать дальше
//   Consequent:   done · err · say; НИКОГДА role — модели у подшага нет
//   Purity:       io (читает; пишет только route)
export function next(state) {
  const bad = inputs(state)
  if (bad) return { do: "err", code: "blocked", cls: bad.cls, subject: bad.why }
  if (state.at && state.at.plan) return { do: "done", state }

  const cut = planOf(state)
  if (!cut.ok) return { do: "err", code: "blocked", subject: cut.error.detail }
  return {
    do: "say",
    line: `scope/plan: ${cut.value.files} файлов → ${cut.value.cells} клеток, факт скрипта ${cut.value.xml.length} симв — 0 токенов`,
    planJson: cut.value.planJson,
    plan: cut.value.plan,
    xml: cut.value.xml,
  }
}

// FUNCTION_CONTRACT: fold — суд и продвижение СОБРАННОГО
//   Consequent:   success: состояние со штампами at.plan и at.computed; failure: Result.err
//   Purity:       io (fs — через route)
export function fold(state, event = {}) {
  const it = event.instruction || {}
  if (event.do !== "say") return err("fold", `подшаг ${id} не знает, что делать с событием «${event.do}»`)

  const subjects = parseBrd(readFileSync(join(state.cwd, BRD), "utf8")).subjects || []
  const blockers = judgePlan({ plan: it.plan, subjects }).join("\n  ")
  const v = newVerdict({ step: id, scope: "whole", round: 1, ok: !blockers, blockers, at: ".agent/survey-plan.json" })
  if (!v.ok) return v
  if (blockers) {
    // ДЕФЕКТ СКРИПТА, а не ответ роли: второго круга не существует — named-отказ наружу
    return err("invalid", `план клеток не прошёл свой суд:\n  ${blockers}`)
  }

  const moved = promote(state, it.planJson, it.xml)
  if (moved.why) return err("fold", moved.why)
  return put(state, {
    verdicts: [...state.verdicts, v.value],
    at: { ...state.at, plan: moved.plan, computed: moved.computed },
  })
}
