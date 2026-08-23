// MODULE_CONTRACT: подшаг 2A — проза заказа становится таблицей действий. Голова над своей пятёркой.
// Purpose:    одно решение спрятано здесь: годится ли таблица действий как ВХОД остального шага 2.
//             Ворота судят таблицу, а не сырой заказ; кандидаты в якоря берутся из её колонок.
// io:         fs (через пятёрку) + model (через инструкцию `role`)
// EXTERNAL_DEPENDENCY: ext/state.mjs::put, sha1of; ext/values.mjs — конструктор вердикта.
// Invariants: ОДНА ПОРЦИЯ — таблица не режется. Круги починки СВОИ: провал ворот не заставляет
//             переигрывать нормализацию, и наоборот. Обрыв связи круга НЕ тратит.
// Interface:  id, next, fold
//
// СУДЬБА СТАРОЙ ГОЛОВЫ `steps/brd/brd.step.mjs` (тикет T05, выбор записан здесь и в
// `steps/brd/gate/gate.step.mjs`): она УДАЛЕНА, а не превращена в обёртку. Обёртка шага 2 — функция
// `brd(state)` в `workflows/izi.js`, ровно как `plan(state)` для шага 9; шаг с ролью, чья `next`
// ничего не решает, а только зовёт два других шага, в этой форме невозможен — `next` возвращает
// ИНСТРУКЦИЮ полосе, а не результат другого шага. Имя `brd` осталось в `ext/state.mjs::STEPS`
// словарём (по нему `close` и `resume` знают шаг 2), но модуля за ним больше нет: мост на него
// отвечает штатным отказом с именем, и полоса его не зовёт.
import { existsSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { ok, err } from "../../../core/result.mjs"
import { put, sha1of } from "../../../ext/state.mjs"
import { verdict as newVerdict } from "../../../ext/values.mjs"
import { inputs } from "./inputs.mjs"
import { readAt } from "../cut.mjs"
import { orderText } from "./order.mjs"
import { FORM, parseRows, judgeRows } from "./normalize.mjs"
import { promote } from "./route.mjs"
import { NORMALIZED, STAGED_NORMALIZED } from "../paths.mjs"

export const id = "brd/normalize"
// Имя роли — это ИМЯ ФАЙЛА, который резолвит хост (`steps/brd/normalize/normalizer.md`,
// standards/role.md). Шов на эту строку — ext/vocabulary.test.mjs.
const ROLE = "normalizer"

// FUNCTION_CONTRACT: next — ЧТО делать дальше
//   Input:        state
//   Dependencies: inputs, orderText, readAt
//   Antecedent:   — (тотальна)
//   Consequent:   err · say (состав) · role · done
//   Purity:       io (читает вход и собирает наряд; чистит путь доставки — подготовка, не запись)
export function next(state) {
  const bad = inputs(state)
  if (bad) return { do: "err", code: "blocked", cls: bad.cls, subject: bad.why }
  if (state.at && state.at.normalized) return { do: "done", state }

  const p = state.portions[0]
  if (!p) {
    // Состав подшага — одна порция; его объявляет `say`, и кладёт в состояние fold.
    const lines = readAt(state.cwd, "TASK.md").split("\n").filter((l) => l.trim()).length
    return { do: "say", line: `brd/normalize: одна порция, заказ ${lines} непустых строк — таблицу действий пишет роль, форма «${FORM}»`,
             portions: [{ id: "1", staging: STAGED_NORMALIZED, status: "todo", round: 1, blockers: "" }] }
  }
  if (p.round > state.budgets.loops) {
    return { do: "err", code: "escalate", subject: `таблица действий не чинится за ${state.budgets.loops} круга`, evidence: p.blockers }
  }
  if (p.status !== "todo") return { do: "done", state }

  const o = orderText(state, { previous: readAt(state.cwd, STAGED_NORMALIZED), feedback: p.blockers })
  if (o.why) return { do: "err", code: "blocked", cls: "invalid-order", subject: o.why }

  const abs = join(state.cwd, o.staging)
  if (existsSync(abs) && !p.blockers) rmSync(abs)   // первый заход не судит вчерашний черновик
  return { do: "role", role: ROLE, text: o.text, staging: o.staging }
}

// FUNCTION_CONTRACT: fold — куда кладётся ответ
//   Input:        state; event — { do, instruction, result }
//   Dependencies: parseRows, judgeRows, promote, newVerdict, put
//   Antecedent:   — (тотальна: незнакомое слово хода это отказ с именем, а не исключение)
//   Consequent:   success: Result.ok(состояние); failure: Result.err
//   Purity:       io (fs)
export function fold(state, event = {}) {
  const it = event.instruction || {}
  if (event.do === "say") return it.portions ? put(state, { portions: it.portions }) : ok(state)
  if (event.do !== "role") return err("fold", `подшаг ${id} не знает, что делать с событием «${event.do}»`)

  const env = event.result || {}
  const p = state.portions[0]
  if (!p) return err("fold", `подшаг ${id} получил ответ роли, когда состав работы не посчитан`)

  // ОБРЫВ СВЯЗИ — НЕ ОШИБКА РОЛИ: staging не трогаем, круг НЕ тратим. Вопросов оператору у этого
  // подшага нет: нормализация переписывает заказ, а не решает о нём, и спрашивать ей не о чем.
  if (env.track === "err") return put(state, {})

  const staged = readAt(state.cwd, p.staging)
  const blockers = env.artifact !== p.staging
    ? `invalid: роль записала «${env.artifact || "ничего"}», а послана была в ${p.staging} — артефакт это ФАЙЛ по ЭТОМУ пути`
    : !staged.trim()
      ? `invalid: ${p.staging} пуст — роль вернула track:"ok", ничего не записав`
      : found(staged)

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
    at: { ...state.at, normalized: { path: moved.at, sha1: sha1of(readFileSync(join(state.cwd, moved.at), "utf8")) } },
  })
}

// FUNCTION_CONTRACT: found — блокеры по ответу роли, одной строкой на находку
//   Input:        text — что роль записала по staging-пути
//   Dependencies: parseRows, judgeRows
//   Antecedent:   текст непуст
//   Consequent:   success: "" — таблица годна; failure: текст блокеров через перевод строки
//   Purity:       pure
//   МОЛЧАНИЕ СУДЬИ — ЭТО НЕ ЗЕЛЁНЫЙ ВЕРДИКТ. `judgeRows` молчит, когда строк нет ВООБЩЕ, и правильно
//   делает: судить нечего (standards/guardrail.md). Но «роль написала прозу» — это находка, и
//   называет её тот, кто знает, что просил: голова подшага.
function found(text) {
  const rows = parseRows(text)
  const r = judgeRows(rows)
  if (r.silent) {
    return `invalid: ответ не похож на таблицу действий — ни в одной строке нет «|». Верни СТРОКИ и ничего кроме них, ` +
           `по строке на требование, форма «${FORM}». Начало ответа: «${String(text).trim().slice(0, 120)}»`
  }
  return r.blockers.map((b) => b.text).join("\n  ")
}
