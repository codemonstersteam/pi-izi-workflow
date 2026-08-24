// MODULE_CONTRACT: подшаг 2A — проза заказа становится таблицей действий. Голова над своей пятёркой.
// Purpose:    одно решение спрятано здесь: годится ли таблица действий как ВХОД остального шага 2.
//             Ворота судят таблицу, а не сырой заказ; кандидаты в якоря берутся из её колонок.
// io:         fs (через пятёрку) + model (через инструкцию `role`)
// EXTERNAL_DEPENDENCY: ext/state.mjs::put, sha1of; ext/values.mjs — конструктор вердикта.
// Invariants: ДВА ПРОХОДА, ОДНА ТАБЛИЦА. Проход 1 пишет таблицу по прозе заказа, проход 2 её ЧИСТИТ:
//             сливает строки, говорящие одно требование дважды, и убирает выдуманное. Круги починки
//             у проходов СВОИ — провал чистки не заставляет переписывать нормализацию. Обрыв связи
//             круга НЕ тратит. Продвигается ТОЛЬКО таблица второго прохода.
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
import { orderText, orderClean } from "./order.mjs"
import { FORM, parseRows, judgeRows } from "./normalize.mjs"
import { judgeClean } from "./clean.mjs"
import { promote } from "./route.mjs"
import { NORMALIZED, STAGED_NORMALIZED, STAGED_CLEAN } from "../paths.mjs"

export const id = "brd/normalize"
// ПОЧЕМУ ЧИСТКА — ВТОРОЙ ПРОХОД, А НЕ ПРАВИЛО В ПЕРВОМ НАРЯДЕ. Замер 23-24.08.2026, семь живых
// прогонов одного заказа eddi при temperature 0: счёт строк 5 · 9 · 17 · 18 · 18 · 19 · 20, дублей
// от 0 до 3, потерянных значений заказа от 0 до 4 — и это ВНУТРИ одной конфигурации наряда. Ни
// снятие роли, ни переписывание наряда разброс не убрали. Проход чистки получил ГОТОВУЮ таблицу и
// одно правило: изменил ровно одну строку — ту, где один глагол над одним объектом стоял дважды, —
// и скопировал остальные шестнадцать байт в байт (81 с, 6430 токенов). Слабая модель исполняет
// «скопируй, кроме названного»; «напиши таблицу по прозе» она исполняет как повезёт.
const PASS_ONE = "1"
const PASS_CLEAN = "2"
// Имя роли — это ИМЯ ФАЙЛА, который резолвит хост (`steps/brd/normalize/normalizer.md`,
// standards/role.md). Шов на эту строку — ext/vocabulary.test.mjs.
const ROLE = "normalizer"
// У ПРОХОДА ЧИСТКИ СВОЯ РОЛЬ, и она ПУСТА (`steps/brd/normalize/cleaner.md`,
// `overrideSystemPrompt: true` — `system` не уходит вовсе). Две причины, обе измерены: роль
// `normalizer` в `$START_FORBIDDEN` запрещает сливать строки — ровно то, ради чего проход
// существует; и замер 24.08.2026 снят БЕЗ системного сообщения, а хост иначе приписывает 1757 байт
// своего промпта. Шов на эту строку — ext/vocabulary.test.mjs.
const ROLE_CLEAN = "cleaner"

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

  if (!state.portions.length) {
    // Состав подшага — ДВА ПРОХОДА над одной таблицей; его объявляет `say`, и кладёт в состояние fold.
    const lines = readAt(state.cwd, "TASK.md").split("\n").filter((l) => l.trim()).length
    return { do: "say", line: `brd/normalize: два прохода над одной таблицей, заказ ${lines} непустых строк — ` +
               `проход 1 пишет её ролью, форма «${FORM}», проход 2 чистит дубли и выдуманное`,
             portions: [{ id: PASS_ONE, staging: STAGED_NORMALIZED, status: "todo", round: 1, blockers: "" },
                        { id: PASS_CLEAN, staging: STAGED_CLEAN, status: "todo", round: 1, blockers: "" }] }
  }
  // ПРОХОД ВЫБИРАЕТСЯ ПОРЯДКОМ, А НЕ ФЛАГОМ: порции лежат в порядке проходов, работает первая
  // незакрытая. Чистке нечего чистить, пока проход 1 не зелен, и порядок это и означает.
  const p = state.portions.find((x) => x.status === "todo")
  if (!p) return { do: "done", state }
  if (p.round > state.budgets.loops) {
    return { do: "err", code: "escalate",
             subject: `${p.id === PASS_CLEAN ? "чистка таблицы" : "таблица действий"} не чинится за ${state.budgets.loops} круга`,
             evidence: p.blockers }
  }

  const o = p.id === PASS_CLEAN
    ? orderClean(state, { rows: readAt(state.cwd, STAGED_NORMALIZED), previous: readAt(state.cwd, STAGED_CLEAN), feedback: p.blockers })
    : orderText(state, { previous: readAt(state.cwd, STAGED_NORMALIZED), feedback: p.blockers })
  if (o.why) return { do: "err", code: "blocked", cls: "invalid-order", subject: o.why }

  const abs = join(state.cwd, o.staging)
  if (existsSync(abs) && !p.blockers) rmSync(abs)   // первый заход не судит вчерашний черновик
  return { do: "role", role: p.id === PASS_CLEAN ? ROLE_CLEAN : ROLE, text: o.text, staging: o.staging }
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
  // ОТВЕТ ОПОЗНАЁТСЯ ПО STAGING-ПУТИ НАРЯДА, а не по номеру хода: у проходов пути разные, и это
  // единственное, что связывает пришедший ответ с порцией, которая его заказывала.
  const p = state.portions.find((x) => x.staging === it.staging) || state.portions.find((x) => x.status === "todo")
  if (!p) return err("fold", `подшаг ${id} получил ответ роли, когда состав работы не посчитан`)

  // ОБРЫВ СВЯЗИ — НЕ ОШИБКА РОЛИ: staging не трогаем, круг НЕ тратим. Вопросов оператору у этого
  // подшага нет: нормализация переписывает заказ, а не решает о нём, и спрашивать ей не о чем.
  if (env.track === "err") return put(state, {})

  const staged = readAt(state.cwd, p.staging)
  const blockers = env.artifact !== p.staging
    ? `invalid: роль записала «${env.artifact || "ничего"}», а послана была в ${p.staging} — артефакт это ФАЙЛ по ЭТОМУ пути`
    : !staged.trim()
      ? `invalid: ${p.staging} пуст — роль вернула track:"ok", ничего не записав`
      : p.id === PASS_CLEAN
        ? foundClean(readAt(state.cwd, STAGED_NORMALIZED), staged, readAt(state.cwd, "TASK.md"))
        : found(staged)

  const v = newVerdict({ step: id, scope: "whole", id: p.id, round: p.round, ok: !blockers, blockers, at: p.staging })
  if (!v.ok) return v

  const swap = (patch) => state.portions.map((x) => (x.staging === p.staging ? { ...p, ...patch } : x))

  if (blockers) {
    return put(state, { verdicts: [...state.verdicts, v.value], portions: swap({ round: p.round + 1, blockers }) })
  }
  // ЗЕЛЁНЫЙ ПЕРВЫЙ ПРОХОД НЕ ПРОДВИГАЕТ НИЧЕГО: таблица принята как ВХОД чистки, а не как артефакт
  // подшага. Продвигает только проход, после которого чистить больше нечем.
  if (p.id !== PASS_CLEAN) {
    return put(state, { verdicts: [...state.verdicts, v.value], portions: swap({ status: "green", blockers: "" }) })
  }
  const moved = promote(state)
  if (moved.why) return err("fold", moved.why)
  return put(state, {
    verdicts: [...state.verdicts, v.value],
    portions: swap({ status: "green", blockers: "" }),
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

// FUNCTION_CONTRACT: foundClean — блокеры по ответу ПРОХОДА ЧИСТКИ, одной строкой на находку
//   Input:        before — таблица прохода 1; after — что чистка записала; task — заказ
//   Dependencies: judgeClean, parseRows
//   Antecedent:   after непуст
//   Consequent:   success: "" — чистая таблица годна; failure: текст блокеров через перевод строки
//   Purity:       pure
//   МОЛЧАНИЕ СУДЬИ — НЕ ЗЕЛЁНЫЙ ВЕРДИКТ, тот же довод, что у `found`: `judgeClean` молчит, когда
//   строк нет вовсе. «Чистка вернула прозу» — находка, и называет её тот, кто знает, что просил.
function foundClean(before, after, task) {
  const r = judgeClean(before, after, task)
  if (r.silent) {
    return `invalid: ответ чистки не похож на таблицу действий — ни в одной строке нет «|». Верни ТУ ЖЕ таблицу, ` +
           `слив строки с одним глаголом и объектом и убрав выдуманное, форма «${FORM}». ` +
           `Начало ответа: «${String(after).trim().slice(0, 120)}»`
  }
  // Форма строки судится и здесь: чистка правит документ, и сломать колонку она может так же, как
  // первый проход. Правило написано ОДИН раз, в `found`, и подставляется отсюда.
  const shape = found(after)
  return [shape, ...r.blockers.map((b) => b.text)].filter(Boolean).join("\n  ")
}
