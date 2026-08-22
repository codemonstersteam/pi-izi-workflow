// MODULE_CONTRACT: шаг 2 — сырое требование → измеримые R1..RN. Голова над своей пятёркой.
// Purpose:    одно решение спрятано здесь: годится ли требование как ВХОД всего конвейера.
// io:         fs (через пятёрку) + model (через инструкцию `role`)
// EXTERNAL_DEPENDENCY: ext/state.mjs::put, sha1of; ext/values.mjs — конструктор вердикта.
// Invariants: ОДНА ПОРЦИЯ — BRD не режется. Обрыв связи круга НЕ тратит. Наряд ПОЧИНКИ отличается
//             от наряда первого захода: он несёт конкретную задачу и ничего лишнего.
// Interface:  id, next, fold
import { existsSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { ok, err } from "../../core/result.mjs"
import { put, sha1of } from "../../ext/state.mjs"
import { verdict as newVerdict } from "../../ext/values.mjs"
import { inputs } from "./inputs.mjs"
import { sourcesOf, readAt } from "./cut.mjs"
import { orderText } from "./order.mjs"
import { judgeBrd } from "./judge.mjs"
import { promote } from "./route.mjs"
import { OUT, STAGED } from "./paths.mjs"

export const id = "brd"
const ROLE = "gilb"

// FUNCTION_CONTRACT: next — ЧТО делать дальше
//   Consequent:   err · ask · role · done
//   Purity:       io (читает вход и собирает наряд; чистит путь доставки — подготовка, не запись)
export function next(state) {
  const bad = inputs(state)
  if (bad) return { do: "err", code: "blocked", cls: bad.cls, subject: bad.why }
  if (state.at && state.at.brd) return { do: "done", state }

  if (state.question) {
    return { do: "ask", name: state.question.name, prompt: state.question.items.join("\n"), items: state.question.items }
  }

  const p = state.portions[0]
  if (!p) {
    // Состав шага — одна порция; его объявляет `say`, и кладёт в состояние fold.
    return { do: "say", line: `brd: одна порция, источников ${sourcesOf(state).length} — задача и значения ответов оператора`,
             portions: [{ id: "1", staging: STAGED, status: "todo", round: 1, blockers: "" }] }
  }
  if (p.round > state.budgets.loops) {
    return { do: "err", code: "escalate", subject: `требование не чинится за ${state.budgets.loops} круга`, evidence: p.blockers }
  }
  if (p.status !== "todo") return { do: "done", state }

  const o = orderText(state, { previous: readAt(state.cwd, STAGED), feedback: p.blockers, classes: p.classes || [] })
  if (o.why) return { do: "err", code: "blocked", cls: "invalid-brd", subject: o.why }

  const abs = join(state.cwd, o.staging)
  if (existsSync(abs) && !p.blockers) rmSync(abs)   // первый заход не судит вчерашний черновик
  return { do: "role", role: ROLE, text: o.text, staging: o.staging }
}

// FUNCTION_CONTRACT: fold — куда кладётся ответ
//   Consequent:   success: Result.ok(состояние); failure: Result.err
//   Purity:       io (fs)
export function fold(state, event = {}) {
  const it = event.instruction || {}
  if (event.do === "say") return it.portions ? put(state, { portions: it.portions }) : ok(state)
  if (event.do === "ask") return answered(state)
  if (event.do !== "role") return err("fold", `шаг ${id} не знает, что делать с событием «${event.do}»`)

  const env = event.result || {}
  const p = state.portions[0]
  if (!p) return err("fold", `шаг ${id} получил ответ роли, когда состав работы не посчитан`)

  // ОБРЫВ И ВОПРОС РОЛИ — не ошибка ответа: staging не трогаем, круг НЕ тратим.
  if (env.track === "err") {
    if (env.kind === "question") {
      const items = env.items && env.items.length ? env.items : [env.subject || "роль задала вопрос без текста"]
      return put(state, { asked: state.asked + 1, question: { of: p.id, name: `${id}-q${state.asked + 1}`, items, retry: 1 } })
    }
    return put(state, {})
  }

  const staged = readAt(state.cwd, p.staging)
  const found = env.artifact !== p.staging
    ? [{ cls: "invalid", text: `роль записала «${env.artifact || "ничего"}», а послана была в ${p.staging} — артефакт это ФАЙЛ по ЭТОМУ пути` }]
    : !staged.trim()
      ? [{ cls: "invalid", text: `${p.staging} пуст — роль вернула track:"ok", ничего не записав` }]
      : judgeBrd({ text: staged, sources: sourcesOf(state) })

  const blockers = found.map((f) => f.text).join("\n  ")
  const v = newVerdict({ step: id, scope: "whole", id: p.id, round: p.round, ok: !blockers, blockers, at: p.staging })
  if (!v.ok) return v

  if (blockers) {
    // КЛАССЫ находок едут в состояние: по ним наряд починки решает, какие источники присылать.
    return put(state, {
      verdicts: [...state.verdicts, v.value],
      portions: [{ ...p, round: p.round + 1, blockers, classes: [...new Set(found.map((f) => f.cls))] }],
    })
  }
  const moved = promote(state)
  if (moved.why) return err("fold", moved.why)
  return put(state, {
    verdicts: [...state.verdicts, v.value],
    portions: [{ ...p, status: "green", blockers: "", classes: [] }],
    at: { ...state.at, brd: { path: moved.at, sha1: sha1of(readFileSync(join(state.cwd, moved.at), "utf8")) } },
  })
}

// FUNCTION_CONTRACT: answered — оператор нажал Approve; ответ ищется на ДИСКЕ
//   Antecedent:   `approved` это барьер над фактом, а не сам факт
//   Purity:       io (fs)
function answered(state) {
  const q = state.question
  if (!q) return ok(state)
  const before = state.question.seen || 0
  const now = sourcesOf(state).length
  if (now > before) return put(state, { question: null })
  if (q.retry >= state.budgets.checkpointRetries) {
    return err("fold", `на вопросы шага ${id} нет ответов после ${q.retry} переспросов — .agent/answers.md их не содержит`)
  }
  const asked = state.asked + 1
  return put(state, { asked, question: { ...q, name: `${id}-q${asked}-retry${q.retry + 1}`, retry: q.retry + 1, seen: now } })
}
