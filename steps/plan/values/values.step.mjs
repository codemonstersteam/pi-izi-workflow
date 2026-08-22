// MODULE_CONTRACT: шаг 9A — словарь значений границы. Голова над своей пятёркой.
// Purpose:    одно решение: какие значения ходят через край системы и как они называются.
// io:         fs
// EXTERNAL_DEPENDENCY: ext/state.mjs::put, sha1of; ext/values.mjs — конструктор вердикта.
// Invariants: ПЕРЕИСПОЛЬЗОВАНИЕ ПРИ ТРЁХ УСЛОВИЯХ РАЗОМ: словарь на месте, входы те же по отпечатку,
//             и он проходит гардрейл СЕЙЧАС. Иначе роль зовётся заново — это не расточительство, а
//             единственный способ не выдать шагу 9C блокер, который роль закрыть не может.
// Interface:  id, next, fold
import { existsSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { ok, err } from "../../../core/result.mjs"
import { put, sha1of } from "../../../ext/state.mjs"
import { verdict as newVerdict } from "../../../ext/values.mjs"
import { inputs } from "./inputs.mjs"
import { greenNow, skeletonOf, frdOf, rippleOf, readAt } from "./cut.mjs"
import { orderText } from "./order.mjs"
import { judgeValues } from "./judge.mjs"
import { promote } from "./route.mjs"
import { OUT, STAGED } from "./paths.mjs"

export const id = "plan/values"
const ROLE = "valuer"

// FUNCTION_CONTRACT: next — ЧТО делать дальше
//   Consequent:   err · say (переиспользование) · role · done
//   Purity:       io (читает вход; чистит путь доставки — подготовка, а не запись состояния)
export function next(state) {
  const bad = inputs(state)
  if (bad) return { do: "err", code: "blocked", subject: bad }
  if (state.at && state.at.values) return { do: "done", state }

  // 0 ТОКЕНОВ, КОГДА МОЖНО. Решение наблюдаемо: инструкция `say` несёт слово «переиспользован», и
  // тест смотрит именно на него, а не на отсутствие вызова роли.
  if (greenNow(state)) {
    return { do: "say", line: `values: словарь прошлого прогона зелен по СЕГОДНЯШНИМ входам — переиспользован, роль не звалась, 0 токенов`, reuse: true }
  }

  if (!state.portions.length) {
    const sk = skeletonOf(state)
    if (sk.why) return { do: "err", code: "blocked", subject: sk.why }
    return { do: "say", line: `values: строк ${sk.rows}, из них пустых ${sk.blank} — скелет посчитан скриптом`, portions: [{ id: "1", staging: STAGED, status: "todo", round: 1, blockers: "" }] }
  }

  const p = state.portions[0]
  if (p.round > state.budgets.loops) return { do: "err", code: "escalate", subject: `словарь не чинится за ${state.budgets.loops} круга`, evidence: p.blockers }
  if (p.status !== "todo") return { do: "done", state }

  const o = orderText(state, { previous: readAt(state.cwd, STAGED), feedback: p.blockers })
  if (o.why) return { do: "err", code: "blocked", subject: o.why }
  return { do: "role", role: ROLE, text: o.text, staging: o.staging }
}

// FUNCTION_CONTRACT: fold — куда кладётся ответ
//   Consequent:   success: Result.ok(состояние); failure: Result.err
//   Purity:       io (fs)
export function fold(state, event = {}) {
  const it = event.instruction || {}
  if (event.do === "say") {
    if (it.reuse) {
      // Переиспользование — тоже РЕЗУЛЬТАТ шага, и вердикт по нему обязан лечь в состояние: иначе
      // «словарь на месте» и «гардрейл его принял» становятся неразличимы.
      const v = newVerdict({ step: id, scope: "whole", round: 1, ok: true, blockers: "", at: OUT })
      if (!v.ok) return v
      return put(state, {
        verdicts: [...state.verdicts, v.value],
        at: { ...state.at, values: { path: OUT, sha1: sha1of(readAt(state.cwd, OUT)) } },
      })
    }
    return it.portions ? put(state, { portions: it.portions }) : ok(state)
  }
  if (event.do !== "role") return err("fold", `шаг ${id} не знает, что делать с событием «${event.do}»`)

  const env = event.result || {}
  const p = state.portions[0]
  if (!p) return err("fold", `шаг ${id} получил ответ роли, когда состав работы не посчитан`)
  if (env.track === "err") return put(state, {})          // обрыв: круг не тратим, staging не трогаем

  const staged = readAt(state.cwd, p.staging)
  const blockers = env.artifact !== p.staging
    ? `роль записала «${env.artifact || "ничего"}», а послана была в ${p.staging} — артефакт это ФАЙЛ по ЭТОМУ пути`
    : !staged.trim()
      ? `${p.staging} пуст — роль вернула track:"ok", ничего не записав`
      : judgeValues({ text: staged, frd: frdOf(state), ripple: rippleOf(state) }).join("\n  ")

  const v = newVerdict({ step: id, scope: "whole", id: p.id, round: p.round, ok: !blockers, blockers, at: p.staging })
  if (!v.ok) return v

  if (blockers) {
    return put(state, {
      verdicts: [...state.verdicts, v.value],
      portions: [{ ...p, round: p.round + 1, blockers }],
    })
  }
  const moved = promote(state)
  if (moved.why) return err("fold", moved.why)
  return put(state, {
    verdicts: [...state.verdicts, v.value],
    portions: [{ ...p, status: "green", blockers: "" }],
    at: { ...state.at, values: { path: moved.at, sha1: sha1of(readFileSync(join(state.cwd, moved.at), "utf8")) } },
  })
}
