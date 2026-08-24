// MODULE_CONTRACT: подшаг 2C — якоря: чем эта работа похожа на уже существующую и где та лежит.
// Purpose:    одно решение спрятано здесь: годится ли СТРОКА, написанную роль, как вход сборщика
//             артефакта. Роль решает ровно один вопрос — какая существующая вещь служит образцом
//             новой; `.agent/brd.md` собирает СКРИПТ, и потому форма артефакта не может быть
//             сломана в принципе.
// io:         fs (через пятёрку) + model (через инструкцию `role`)
// EXTERNAL_DEPENDENCY: ext/state.mjs::put, sha1of; ext/values.mjs — конструктор вердикта.
// Invariants: ОДНА ПОРЦИЯ — артефакт не режется. Круги починки СВОИ: провал якорей не переигрывает
//             нормализацию — таблица уже лежит на диске и судьёй признана годной. Обрыв связи и
//             вопрос роли круга НЕ тратят. Карта обхода пишется СРАЗУ ЗА продвижением и только за ним.
// Interface:  id, next, fold
//
// ЧТО УШЛО ИЗ ГОЛОВЫ ВМЕСТЕ С ТЕМ, ЧТО МОДЕЛЬ ПЕРЕСТАЛА ПИСАТЬ АРТЕФАКТ (тикет A05,
// backlog-anchors.md). Прежняя голова `steps/brd/gate/gate.step.mjs` обороняла ФОРМУ файла: класс
// находки `invalid`, ветвь «роль записала не туда» и ветвь «роль вернула ok, ничего не записав». Все
// три отвечали на вопрос «похоже ли записанное на артефакт», а такого вопроса больше нет: артефакт
// собирает `assemble.mjs` из строк таблицы, строки роли и посчитанных якорей. Роль пишет ОДНУ
// строку, и «строки нет» — это ровно одна находка одного правила (`judge/T4.mjs`, класс
// `invalid-analogue`), которую судья и называет, с готовым выходом. Развести её на три класса значит
// написать роли три разных наряда на одну и ту же правку.
//
// СУДЬБА СТАРОЙ ГОЛОВЫ `steps/brd/brd.step.mjs` (тикет T05): она УДАЛЕНА. Шаг 2 разложен на подшаги,
// а его обёртка — функция `brd(state)` в `workflows/izi.js`, ровно как `plan(state)` для шага 9.
// Подробнее о выборе — в контракте `steps/brd/normalize/normalize.step.mjs`.
import { existsSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { ok, err } from "../../../core/result.mjs"
import { put, sha1of } from "../../../ext/state.mjs"
import { verdict as newVerdict } from "../../../ext/values.mjs"
import { analogueTerm, parseBrd } from "../brd.mjs"
import { inputs } from "./inputs.mjs"
import { readAt, sourcesOf, rowsOf, hitsFor } from "./cut.mjs"
import { orderText } from "./order.mjs"
import { ANALOGUE_LINE, judgeAnalogue } from "./judge.mjs"
import { numbered, subjectsOf, brdText } from "./assemble.mjs"
import { promote, spread, stage } from "./route.mjs"
import { STAGED_ANALOGUE } from "../paths.mjs"

export const id = "brd/anchors"
// Имя роли — это ИМЯ ФАЙЛА, который резолвит хост (`steps/brd/anchors/analogue.md`,
// standards/role.md). Шов на эту строку — ext/vocabulary.test.mjs.
const ROLE = "analogue"
// ИМЯ ПАУЗЫ БЕЗ КОСОЙ ЧЕРТЫ: хост ключует паузу по имени, и `brd/anchors-q1` уехал бы в ключ с
// разделителем пути. Имя строится ОДИН раз здесь — два хода с одним именем это одна пауза, и
// второго вопроса оператор не увидит.
const QNAME = "brd-anchors"

// ОТКАЗЫ СБОРЩИКА, КОТОРЫЕ ЗАКРЫВАЕТ РОЛЬ, и все остальные. Разделены потому, что блокер — это
// НАРЯД НА ПРАВКУ (standards/guardrail.md): находку, которой роль не может закрыть ни одной строкой,
// нельзя посылать роли — она уйдёт на три круга и вернётся с тем же. `analogue-absent` роль
// закрывает, назвав слово вместо `none`; `hits-absent`, `subjects-thin` и `no-rows` — это состояние
// ПРОГОНА (нет таблицы попаданий, все слова колонки `object` шире порога), и отвечать на них надо
// оператору, а не модели.
const ROLE_FAULT = Object.freeze(["analogue-absent", "multiline-value"])

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
    return { do: "say", line: `brd/anchors: одна порция, строк таблицы действий ${rows} — роль решает ОДНО: какая существующая вещь служит образцом новой`,
             portions: [{ id: "1", staging: STAGED_ANALOGUE, status: "todo", round: 1, blockers: "" }] }
  }
  if (p.round > state.budgets.loops) {
    return { do: "err", code: "escalate", subject: `аналог не выбирается за ${state.budgets.loops} круга`, evidence: p.blockers }
  }
  if (p.status !== "todo") return { do: "done", state }

  const o = orderText(state, { previous: readAt(state.cwd, STAGED_ANALOGUE), feedback: p.blockers })
  if (o.why) return { do: "err", code: "blocked", cls: "invalid-order", subject: o.why }

  const abs = join(state.cwd, o.staging)
  if (existsSync(abs) && !p.blockers) rmSync(abs)   // первый заход не судит вчерашний черновик
  return { do: "role", role: ROLE, text: o.text, staging: o.staging }
}

// FUNCTION_CONTRACT: fold — куда кладётся ответ
//   Input:        state; event — { do, instruction, result }
//   Dependencies: judgeAnalogue, hitsFor, rowsOf, built, stage, promote, spread, newVerdict, put
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

  // ОТВЕТ РОЛИ ЧИТАЕТСЯ С ДИСКА, А НЕ ИЗ КОНВЕРТА: документ по RPC не едет. Роль, записавшая не по
  // тому пути, оставит здесь пустоту — и судья назовёт её той же находкой, что и молчание: строки
  // «analogue: …» в ответе нет.
  const staged = readAt(state.cwd, p.staging)
  const rows = rowsOf(state)
  const hits = hitsFor(state, rows).hits
  const found = judgeAnalogue({ text: staged, hits })

  // СБОРКА ИДЁТ ДО ВЕРДИКТА, потому что она тоже судит: `subjectsOf` и `brdText` возвращают отказ
  // там, где артефакта не выйдет, и часть этих отказов роль закрывает своей же строкой.
  const made = found.length ? null : built(rows, hits, staged)
  const blockers = [...found.map((f) => f.text), ...(made && made.blocker ? [made.blocker] : [])].join("\n  ")
  if (made && made.why) return err("fold", made.why)

  const v = newVerdict({ step: id, scope: "whole", id: p.id, round: p.round, ok: !blockers, blockers, at: p.staging })
  if (!v.ok) return v

  if (blockers) {
    return put(state, {
      verdicts: [...state.verdicts, v.value],
      portions: [{ ...p, round: p.round + 1, blockers }],
    })
  }
  const laid = stage(state, made.text)
  if (laid.why) return err("fold", laid.why)
  const moved = promote(state)
  if (moved.why) return err("fold", moved.why)
  const text = readFileSync(join(state.cwd, moved.at), "utf8")
  // КАРТА ОБХОДА — ПРОДОЛЖЕНИЕ ТОГО ЖЕ ХОДА, а не отдельный шаг: якоря названы, дерево на месте,
  // и полсекунды грепа здесь избавляют шаг 3 от поиска мест по путям, который на eddi находил
  // 0 файлов аналога из 10 (steps/brd/spread/spread.mjs).
  const map = spread(state, text)
  if (map.why) return err("fold", map.why)
  return put(state, {
    verdicts: [...state.verdicts, v.value],
    portions: [{ ...p, status: "green", blockers: "" }],
    at: {
      ...state.at,
      brd: { path: moved.at, sha1: sha1of(text) },
      anchors: { path: map.at, sha1: sha1of(readFileSync(join(state.cwd, map.at), "utf8")) },
    },
  })
}

// FUNCTION_CONTRACT: built — три части в байты артефакта, и разбор того, кто виноват в отказе
//   Input:        rows — таблица действий подшага 2A; hits — { слово: сколько файлов };
//                 staged — весь ответ роли: одна строка `analogue: …`
//   Dependencies: numbered, subjectsOf, brdText, ANALOGUE_LINE, parseBrd, analogueTerm, ROLE_FAULT
//   Antecedent:   судья по строке аналога промолчал (иначе собирать нечего и незачем)
//   Consequent:   success: { text } — байты `.agent/brd.md`;
//                 failure: { blocker } — отказ, который роль закрывает своей же строкой, с выходом;
//                          { why } — отказ ПРОГОНА: нет таблицы попаданий, все кандидаты шире порога
//   Purity:       pure
//   Interface:    built(rows, hits, staged) -> { text } | { blocker } | { why }
//
//   `none` — ЗАКОННЫЙ ОТВЕТ ПРАВИЛА T4 И НЕЗАКОННЫЙ ВХОД СБОРЩИКА, и расхождение разрешается здесь,
//   в пользу выхода для роли: `subjectsOf` без аналога не строит `subjects[]` вовсе (карта обхода 2D
//   меряется покрытием файлов аналога), поэтому объявленное отсутствие возвращается роли блокером с
//   готовой строкой правки, а не рушит прогон.
function built(rows, hits, staged) {
  const lines = numbered(rows)
  if (!lines.ok) return { why: `${lines.error.cls}: ${lines.error.detail}` }
  const match = String(staged).match(ANALOGUE_LINE)
  const line = match ? match[0].trim() : ""
  const subjects = subjectsOf(rows, hits, analogueTerm(parseBrd(staged).analogue))
  if (!subjects.ok) return fault(subjects.error)
  const text = brdText(lines.value, line, subjects.value)
  if (!text.ok) return fault(text.error)
  return { text: text.value }
}

// FUNCTION_CONTRACT: fault — отказ сборщика как блокер роли либо как отказ прогона
//   Input:        e — { cls, detail } отказа assemble.mjs
//   Dependencies: ROLE_FAULT
//   Antecedent:   — (тотальна)
//   Consequent:   success: { blocker } с ВЫХОДОМ, если класс в ROLE_FAULT; иначе { why }
//   Purity:       pure
function fault(e) {
  if (!ROLE_FAULT.includes(e.cls)) return { why: `${e.cls}: ${e.detail}` }
  return { blocker: `T4 analogue: ${e.detail}. Назови ОДНО слово с ненулевым счётом из таблицы попаданий — «analogue: <слово> — files <N>; <чем он образец>»: без образца не собрать ни якорей, ни карты обхода` }
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
