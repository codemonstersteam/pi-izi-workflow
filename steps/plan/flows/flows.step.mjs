// MODULE_CONTRACT: шаг 9C — потоки данных по use case. Голова над своей пятёркой.
// Purpose:    одно решение спрятано здесь: кто порождает каждое значение, кто его проносит, кто
//             отвергает, и какой шаг требования этим закрыт.
// io:         fs
// EXTERNAL_DEPENDENCY: ext/state.mjs::put, sha1of; ext/values.mjs — конструктор вердикта.
// Invariants: ПОРЦИИ НЕЗАВИСИМЫ — отсюда ОДНА инструкция `roles` на пачку, а не череда `role`.
//             Семь потоков подряд это час, семь разом — 4-9 минут; экономия здесь в минутах, а
//             минуты токенами не купить. Пачка не шире бюджета: лимитера параллельности в песочнице
//             нет, parallel это Promise.all.
// Interface:  id, next, fold
import { existsSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { ok, err } from "../../../core/result.mjs"
import { put, sha1of } from "../../../ext/state.mjs"
import { verdict as newVerdict } from "../../../ext/values.mjs"
import { inputs } from "./inputs.mjs"
import { cut, frdOf, readAt } from "./cut.mjs"
import { orderText } from "./order.mjs"
import { judgePortion, judgeWhole } from "./judge.mjs"
import { join as joinPortions, addressees, promote } from "./route.mjs"
import { TREE, VALUES, OUT } from "./paths.mjs"

export const id = "plan/flows"
const ROLE = "flow-designer"

// FUNCTION_CONTRACT: next — ЧТО делать дальше
//   Consequent:   err · say · roles · done
//   Purity:       io (читает вход, собирает наряды, чистит пути доставки — подготовка, не запись состояния)
export function next(state) {
  const bad = inputs(state)
  if (bad) return { do: "err", code: "blocked", subject: bad }
  if (state.at && state.at.flows) return { do: "done", state }

  if (!state.portions.length) {
    const c = cut(state)
    if (c.why) return { do: "err", code: "blocked", subject: c.why }
    return { do: "say", line: c.line, portions: c.portions }
  }

  const dead = state.portions.find((p) => p.round > state.budgets.loops)
  if (dead) return { do: "err", code: "escalate", subject: `поток ${dead.id} не чинится за ${state.budgets.loops} круга`, evidence: dead.blockers }

  const todo = state.portions.filter((p) => p.status === "todo")
  if (!todo.length) return { do: "done", state }

  // ПАЧКА, А НЕ ВСЁ РАЗОМ. Ширина роя в полосе — литерал; бюджет умеет её только понизить, и порций
  // может быть больше, чем мест. Остаток уедет следующей инструкцией.
  const batch = todo.slice(0, state.budgets.maxParallel)
  const calls = []
  for (const p of batch) {
    const o = orderText(state, p.id, { previous: readAt(state.cwd, p.staging), feedback: p.blockers, fix: p.round > 1 })
    if (o.why) return { do: "err", code: "blocked", subject: o.why }
    const abs = join(state.cwd, o.staging)
    if (existsSync(abs)) rmSync(abs)          // подготовка доставки: черновик прошлого круга не судится как ответ этого
    calls.push({ id: p.id, role: ROLE, text: o.text, staging: o.staging })
  }
  return { do: "roles", calls, at: `flows-${batch.map((p) => p.id).join("-")}` }
}

// FUNCTION_CONTRACT: fold — куда кладутся ответы РОЯ
//   Input:        state; event — { do:"roles", instruction, result: { s0: конверт, … } }
//   Consequent:   success: Result.ok(состояние с вердиктом НА КАЖДУЮ порцию пачки)
//                 failure: Result.err
//   Purity:       io (fs)
//   BUG_FIX_CONTEXT: parallel возвращает ЗАПИСЬ { имя слота: значение }, а не список. Порция
//                 сопоставляется слоту ПО ПОРЯДКУ вызовов инструкции — искать её «первой открытой»
//                 значит гадать, а при семи ответах разом гадание промахивается семь раз.
export function fold(state, event = {}) {
  const it = event.instruction || {}
  if (event.do === "say") return it.portions ? put(state, { portions: it.portions }) : ok(state)
  if (event.do !== "roles") return err("fold", `шаг ${id} не знает, что делать с событием «${event.do}»`)

  const calls = it.calls || []
  const record = event.result || {}
  const envelopes = Object.keys(record).sort().map((k) => record[k])   // s0, s1, … в порядке слотов

  let portions = state.portions
  const verdicts = [...state.verdicts]
  const frd = frdOf(state)
  const tree = readAt(state.cwd, TREE)
  const values = readAt(state.cwd, VALUES)

  for (let i = 0; i < calls.length; i++) {
    const call = calls[i]
    const env = envelopes[i]
    const p = portions.find((x) => x.id === call.id)
    if (!p) continue

    // ОБРЫВ ОДНОЙ ПОРЦИИ НЕ ТРОГАЕТ СОСЕДЕЙ: ни их вердиктов, ни их кругов. Пустой слот роя (null)
    // читается так же — это место, на которое вызова не пришлось.
    if (!env || env.track === "err") continue

    const staged = readAt(state.cwd, call.staging)
    const blockers = env.artifact !== call.staging
      ? `роль записала «${env.artifact || "ничего"}», а послана была в ${call.staging} — артефакт это ФАЙЛ по ЭТОМУ пути`
      : !staged.trim()
        ? `${call.staging} пуст — роль вернула track:"ok", ничего не записав`
        : judgePortion({ text: staged, frd, tree, values, uc: call.id }).join("\n  ")

    const v = newVerdict({ step: id, scope: "portion", id: p.id, round: p.round, ok: !blockers, blockers, at: call.staging })
    if (!v.ok) return v
    verdicts.push(v.value)
    portions = portions.map((x) => (x.id === p.id
      ? (blockers ? { ...x, round: x.round + 1, blockers } : { ...x, status: "green", blockers: "" })
      : x))
  }

  const rest = portions.find((p) => p.status === "todo")
  const withVerdicts = put(state, { verdicts, portions })
  if (!withVerdicts.ok || rest) return withVerdicts

  return whole(withVerdicts.value)
}

// FUNCTION_CONTRACT: whole — склейка, суд ЦЕЛОГО и продвижение
//   Antecedent:   все порции зелены
//   Purity:       io (fs)
function whole(state) {
  const j = joinPortions(state, state.portions)
  if (j.why) return err("fold", j.why)

  const blockers = judgeWhole({
    text: readAt(state.cwd, j.at), frd: frdOf(state),
    tree: readAt(state.cwd, TREE), values: readAt(state.cwd, VALUES),
  }).join("\n  ")
  const round = Math.max(...state.portions.map((p) => p.round))
  const v = newVerdict({ step: id, scope: "whole", id: "", round, ok: !blockers, blockers, at: j.at })
  if (!v.ok) return v

  if (blockers) {
    const who = new Set(addressees(blockers, state.portions))
    return put(state, {
      verdicts: [...state.verdicts, v.value],
      portions: state.portions.map((p) => (who.has(p.id) ? { ...p, status: "todo", round: p.round + 1, blockers } : p)),
    })
  }

  const moved = promote(state)
  if (moved.why) return err("fold", moved.why)
  return put(state, {
    verdicts: [...state.verdicts, v.value],
    at: { ...state.at, flows: { path: moved.at, sha1: sha1of(readFileSync(join(state.cwd, moved.at), "utf8")) } },
  })
}
