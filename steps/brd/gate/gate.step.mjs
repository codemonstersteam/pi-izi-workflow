// MODULE_CONTRACT: подшаг 2C — ворота: решаема ли задача здесь, что из неё следует, чем её искать.
// Purpose:    одно решение спрятано здесь: годится ли ответ ворот как ВХОД всего остального
//             конвейера. Роль решает ровно два вопроса — аналог и вердикт; всё остальное в этом
//             подшаге считает скрипт.
// io:         fs (через пятёрку) + model (через инструкцию `role`)
// EXTERNAL_DEPENDENCY: ext/state.mjs::put, sha1of; ext/values.mjs — конструктор вердикта.
// Invariants: ОДНА ПОРЦИЯ — BRD не режется. Круги починки СВОИ: провал ворот не переигрывает
//             нормализацию — таблица уже лежит на диске и судьёй признана годной. Обрыв связи и
//             вопрос роли круга НЕ тратят. Карта обхода пишется СРАЗУ ЗА продвижением и только за ним.
// Interface:  id, next, fold
//
// СУДЬБА СТАРОЙ ГОЛОВЫ `steps/brd/brd.step.mjs` (тикет T05): она УДАЛЕНА. Шаг 2 разложен на два
// подшага, а его обёртка — функция `brd(state)` в `workflows/izi.js`, ровно как `plan(state)` для
// шага 9. Подробнее о выборе — в контракте `steps/brd/normalize/normalize.step.mjs`.
import { existsSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { ok, err } from "../../../core/result.mjs"
import { put, sha1of } from "../../../ext/state.mjs"
import { verdict as newVerdict } from "../../../ext/values.mjs"
import { inputs } from "./inputs.mjs"
import { readAt, sourcesOf, rowsOf, hitsFor } from "./cut.mjs"
import { orderText } from "./order.mjs"
import { judgeBrd } from "./judge.mjs"
import { promote, spread } from "./route.mjs"
import { STAGED } from "../paths.mjs"

export const id = "brd/gate"
// Имя роли — это ИМЯ ФАЙЛА, который резолвит хост (`steps/brd/gate/gate.md`, standards/role.md).
// Шов на эту строку — ext/vocabulary.test.mjs.
const ROLE = "gate"
// ИМЯ ПАУЗЫ БЕЗ КОСОЙ ЧЕРТЫ: хост ключует паузу по имени, и `brd/gate-q1` уехал бы в ключ с
// разделителем пути. Имя строится ОДИН раз здесь — два хода с одним именем это одна пауза, и
// второго вопроса оператор не увидит.
const QNAME = "brd-gate"

// FUNCTION_CONTRACT: next — ЧТО делать дальше
//   Input:        state
//   Dependencies: inputs, orderText, readAt, rowsOf
//   Antecedent:   — (тотальна)
//   Consequent:   err · ask · say (состав) · role · done
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
    // Состав подшага — одна порция; его объявляет `say`, и кладёт в состояние fold.
    const rows = rowsOf(state).split("\n").filter((l) => l.includes("|")).length
    return { do: "say", line: `brd/gate: одна порция, строк таблицы действий ${rows}, источников ${sourcesOf(state).length} — задача и значения ответов оператора`,
             portions: [{ id: "1", staging: STAGED, status: "todo", round: 1, blockers: "" }] }
  }
  if (p.round > state.budgets.loops) {
    return { do: "err", code: "escalate", subject: `требование не чинится за ${state.budgets.loops} круга`, evidence: p.blockers }
  }
  if (p.status !== "todo") return { do: "done", state }

  const o = orderText(state, { previous: readAt(state.cwd, STAGED), feedback: p.blockers, classes: p.classes || [] })
  if (o.why) return { do: "err", code: "blocked", cls: "invalid-order", subject: o.why }

  const abs = join(state.cwd, o.staging)
  if (existsSync(abs) && !p.blockers) rmSync(abs)   // первый заход не судит вчерашний черновик
  return { do: "role", role: ROLE, text: o.text, staging: o.staging }
}

// FUNCTION_CONTRACT: fold — куда кладётся ответ
//   Input:        state; event — { do, instruction, result }
//   Dependencies: judgeBrd, hitsFor, promote, spread, newVerdict, put
//   Antecedent:   — (тотальна: незнакомое слово хода это отказ с именем, а не исключение)
//   Consequent:   success: Result.ok(состояние); failure: Result.err
//   Purity:       io (fs)
export function fold(state, event = {}) {
  const it = event.instruction || {}
  if (event.do === "say") return it.portions ? put(state, { portions: it.portions }) : ok(state)
  if (event.do === "ask") return answered(state)
  if (event.do !== "role") return err("fold", `подшаг ${id} не знает, что делать с событием «${event.do}»`)

  const env = event.result || {}
  const p = state.portions[0]
  if (!p) return err("fold", `подшаг ${id} получил ответ роли, когда состав работы не посчитан`)

  // ОБРЫВ И ВОПРОС РОЛИ — не ошибка ответа: staging не трогаем, круг НЕ тратим.
  if (env.track === "err") {
    if (env.kind === "question") {
      const items = env.items && env.items.length ? env.items : [env.subject || "роль задала вопрос без текста"]
      return put(state, { asked: state.asked + 1, question: { of: p.id, name: `${QNAME}-q${state.asked + 1}`, items, retry: 1 } })
    }
    return put(state, {})
  }

  const staged = readAt(state.cwd, p.staging)
  const rows = rowsOf(state)
  const hit = hitsFor(state, rows)
  const found = env.artifact !== p.staging
    ? [{ cls: "invalid", text: `роль записала «${env.artifact || "ничего"}», а послана была в ${p.staging} — артефакт это ФАЙЛ по ЭТОМУ пути` }]
    : !staged.trim()
      ? [{ cls: "invalid", text: `${p.staging} пуст — роль вернула track:"ok", ничего не записав` }]
      : judgeBrd({ text: staged, sources: sourcesOf(state), rows, hits: hit.hits, files: hit.files })

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
  const laid = readFileSync(join(state.cwd, moved.at), "utf8")
  // КАРТА ОБХОДА — ПРОДОЛЖЕНИЕ ТОГО ЖЕ ХОДА, а не отдельный шаг: якоря названы, дерево на месте,
  // и полсекунды грепа здесь избавляют шаг 3 от поиска мест по путям, который на eddi находил
  // 0 файлов аналога из 10 (steps/brd/spread/spread.mjs).
  const map = spread(state, laid)
  if (map.why) return err("fold", map.why)
  return put(state, {
    verdicts: [...state.verdicts, v.value],
    portions: [{ ...p, status: "green", blockers: "", classes: [] }],
    at: {
      ...state.at,
      brd: { path: moved.at, sha1: sha1of(laid) },
      anchors: { path: map.at, sha1: sha1of(readFileSync(join(state.cwd, map.at), "utf8")) },
    },
  })
}

// FUNCTION_CONTRACT: answered — оператор нажал Approve; ответ ищется на ДИСКЕ
//   Input:        state
//   Dependencies: sourcesOf, put
//   Antecedent:   `approved` это барьер над фактом, а не сам факт
//   Consequent:   success: Result.ok(состояние без вопроса либо с переспросом)
//                 failure: Result.err — ответов нет после всех переспросов
//   Purity:       io (fs)
function answered(state) {
  const q = state.question
  if (!q) return ok(state)
  const before = state.question.seen || 0
  const now = sourcesOf(state).length
  if (now > before) return put(state, { question: null })
  if (q.retry >= state.budgets.checkpointRetries) {
    return err("fold", `на вопросы подшага ${id} нет ответов после ${q.retry} переспросов — .agent/answers.md их не содержит`)
  }
  const asked = state.asked + 1
  return put(state, { asked, question: { ...q, name: `${QNAME}-q${asked}-retry${q.retry + 1}`, retry: q.retry + 1, seen: now } })
}
