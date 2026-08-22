// MODULE_CONTRACT: шаг 9B — дерево модулей работы. Голова над своей пятёркой.
// Purpose:    одно решение спрятано здесь: ЧТО делать дальше и КУДА положить ответ. Своих правил у
//             головы нет — их держат inputs, cut, order, judge и route.
// io:         fs (через пятёрку)
// EXTERNAL_DEPENDENCY: ext/state.mjs::put — состояние строится ТОЛЬКО конструктором;
//             ext/values.mjs — конструктор вердикта; core/result.mjs — форма Result.
// Invariants: next решает и готовит доставку; fold принимает ответ и судит. Артефакт пишет РОЛЬ.
//             Круг считается У ПОРЦИИ. Обрыв связи круга НЕ ТРАТИТ.
// Interface:  id, next, fold
//
// ФОРМА ШАГА — standards/workflow-design.md, и нарушать её нельзя. Этот файл — образец, с которого
// пишутся остальные девять.

import { existsSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { ok, err } from "../../../core/result.mjs"
import { put } from "../../../ext/state.mjs"
import { verdict as newVerdict } from "../../../ext/values.mjs"
import { inputs } from "./inputs.mjs"
import { cut, mineOf, familyOf, knownOf, frdOf, readAt } from "./cut.mjs"
import { orderText } from "./order.mjs"
import { judgePortion, judgeWhole } from "./judge.mjs"
import { join as joinPortions, addressees, promote } from "./route.mjs"

export const id = "plan/tree"

const ROLE = "tree-designer"

// FUNCTION_CONTRACT: next — ЧТО делать дальше
//   Input:        state — состояние конвейера
//   Dependencies: inputs, cut, orderText
//   Antecedent:   — (тотальна: любое состояние либо ведёт к инструкции, либо к отказу с именем)
//   Consequent:   success: ОДНА инструкция полосе — err | ask | say | role | done
//                 failure: не бывает — отказ это тоже инструкция
//   Purity:       io — ЧИТАЕТ вход и ПИШЕТ ровно подготовку доставки (чистит staging-путь порции).
//                 Не зовёт модель, не судит, не продвигает: это сторожит шов 2.
//   BUG_FIX_CONTEXT: чистка staging перед вызовом куплена прогоном da99bbae: `write` роли оборвался,
//                 файл прошлого круга остался на месте, гардрейл осудил ВЧЕРАШНИЙ ответ как
//                 сегодняшний и принял его — круг потрачен, шаг закрыт непочиненным.
export function next(state) {
  const bad = inputs(state)                                   // ПЕРВЫЙ ХОД — суд ВХОДА, не выхода
  if (bad) return { do: "err", code: "blocked", subject: bad }

  // ГОТОВНОСТЬ ШАГА — ЭТО ПРОДВИНУТЫЙ АРТЕФАКТ, а не пустой состав работы.
  // BUG_FIX_CONTEXT: первая версия считала шаг законченным, когда список порций пуст, и опустошала
  // его в конце. Следующий ход видел пустой список, снова резал состав и снова звал роль — вечный
  // круг, в котором дерево пересобиралось бесконечно. Поймано первым же компонентным тестом.
  if (state.at && state.at.tree) return { do: "done", state }

  if (state.question) {
    return { do: "ask", name: state.question.name, prompt: state.question.items.join("\n"), items: state.question.items }
  }

  if (!state.portions.length) {
    const c = cut(state)
    if (c.why) return { do: "err", code: "blocked", subject: c.why }
    // Состав едет В ИНСТРУКЦИИ: считает его скрипт здесь, а КЛАДЁТ в состояние fold — писать в
    // состояние из next нельзя, а посчитать дважды значит дать двум ходам разойтись.
    return { do: "say", line: c.line, portions: c.portions }
  }

  const dead = state.portions.find((p) => p.round > state.budgets.loops)
  if (dead) {
    return { do: "err", code: "escalate", subject: `порция ${dead.id} не чинится за ${state.budgets.loops} круга`, evidence: dead.blockers }
  }

  const todo = state.portions.find((p) => p.status === "todo")
  if (!todo) return { do: "done", state }

  const o = orderText(state, todo.id, { previous: readAt(state.cwd, todo.staging), feedback: todo.blockers, fix: todo.round > 1 })
  if (o.why) return { do: "err", code: "blocked", subject: o.why }

  // Подготовка доставки: путь очищается ДО вызова, чтобы ответ этого круга нельзя было спутать с
  // ответом прошлого.
  const abs = join(state.cwd, o.staging)
  if (existsSync(abs)) rmSync(abs)
  return { do: "role", role: ROLE, text: o.text, staging: o.staging }
}

// FUNCTION_CONTRACT: fold — куда кладётся ответ
//   Input:        state; event — { do, result } от полосы
//   Dependencies: judgePortion, judgeWhole, joinPortions, addressees, promote, put, newVerdict
//   Antecedent:   event несёт слово хода — иначе непонятно, на что отвечаем
//   Consequent:   success: Result.ok(НОВОЕ состояние); failure: Result.err — и привод обязан это
//                 проверить, а не деструктурировать состояние из отказа
//   Purity:       io (fs)
//   BUG_FIX_CONTEXT: АРТЕФАКТ ПИШЕТ РОЛЬ. Конверт несёт ПУТЬ (ENVELOPE.artifact — строка), и запись
//                 этого пути в файл затёрла бы ответ модели строкой в тридцать байт. fold сверяет,
//                 что роль записала ТУДА, куда её послали, — это и есть «проверь staging-путь прежде,
//                 чем продвигать».
export function fold(state, event = {}) {
  const word = event.do || ""
  const it = event.instruction || {}
  // `say` объявляет состав работы: скрипт посчитал порции, и здесь они ложатся в состояние.
  if (word === "say") return it.portions ? put(state, { portions: it.portions }) : ok(state)
  if (word === "ask") return answered(state, event.result)
  if (word !== "role") return err("fold", `шаг ${id} не знает, что делать с событием «${word}»`)

  const env = event.result || {}
  // Порция берётся ИЗ ИНСТРУКЦИИ, а не ищется заново: между ходами состав мог поменяться, и
  // «первая открытая» — это догадка, а не факт.
  const todo = state.portions.find((p) => p.staging === it.staging) || state.portions.find((p) => p.status === "todo")
  if (!todo) return err("fold", `шаг ${id} получил ответ роли, когда открытых порций нет`)

  // ОБРЫВ СВЯЗИ — НЕ ОШИБКА РОЛИ: staging не трогаем, круг НЕ тратим, вопрос уводим на свою рельсу.
  if (env.track === "err") return refused(state, todo, env)

  const staged = readAt(state.cwd, todo.staging)
  const blockers = env.artifact !== todo.staging
    ? `роль записала «${env.artifact || "ничего"}», а послана была в ${todo.staging} — артефакт это ФАЙЛ по ЭТОМУ пути; запиши его инструментом write и только после этого верни track:"ok"`
    : !staged.trim()
      ? `${todo.staging} пуст — роль вернула track:"ok", ничего не записав`
      : judgePortion({ text: staged, mine: mineOf(state, todo.id), kin: familyOf(state), known: knownOf(state) }).join("\n  ")

  const v = newVerdict({ step: id, scope: "portion", id: todo.id, round: todo.round, ok: !blockers, blockers, at: todo.staging })
  if (!v.ok) return v

  if (blockers) {
    return put(state, {
      verdicts: [...state.verdicts, v.value],
      portions: state.portions.map((p) => (p.id === todo.id ? { ...p, round: p.round + 1, blockers } : p)),
    })
  }

  // КРУГ НЕ СБРАСЫВАЕТСЯ, когда порция зеленеет.
  // BUG_FIX_CONTEXT: первая версия ставила round: 1 на зелёной ветви. Красное ЦЕЛОЕ возвращало
  // порцию в работу с round+1 — то есть снова 2, — и шаг чинил одно и то же вечно: бюджет починки
  // обнулялся каждым зелёным кругом. Круг принадлежит ПОРЦИИ на весь шаг, а не одному её заходу.
  const green = state.portions.map((p) => (p.id === todo.id ? { ...p, status: "green", blockers: "" } : p))
  const rest = green.find((p) => p.status === "todo")
  const withVerdict = put(state, { verdicts: [...state.verdicts, v.value], portions: green })
  if (!withVerdict.ok || rest) return withVerdict                 // ещё есть порции — целое не судим

  return whole(withVerdict.value)
}

// FUNCTION_CONTRACT: whole — склейка, суд ЦЕЛОГО и продвижение
//   Antecedent:   все порции зелены
//   Consequent:   success: состояние с продвинутым деревом либо с новыми задачами адресатам
//   Purity:       io (fs)
function whole(state) {
  const j = joinPortions(state, state.portions)
  if (j.why) return err("fold", j.why)

  const blockers = judgeWhole({ text: readAt(state.cwd, j.at), frd: frdOf(state) }).join("\n  ")
  const round = Math.max(...state.portions.map((p) => p.round))
  const v = newVerdict({ step: id, scope: "whole", id: "", round, ok: !blockers, blockers, at: j.at })
  if (!v.ok) return v

  if (blockers) {
    // Красное ЦЕЛОЕ адресуется по ПУТЯМ в блокере. Зелёная порция не переписывается, КРОМЕ случая,
    // когда она адресат: чинит тот, кто это написал.
    const who = new Set(addressees(state, blockers, state.portions))
    return put(state, {
      verdicts: [...state.verdicts, v.value],
      portions: state.portions.map((p) => (who.has(p.id) ? { ...p, status: "todo", round: p.round + 1, blockers } : p)),
    })
  }

  const moved = promote(state)
  if (moved.why) return err("fold", moved.why)
  // Порции остаются зелёными в состоянии: по ним видно, чем шаг закончился. Обнуляет их close,
  // когда шаг закрывается и состояние передаётся следующему.
  return put(state, {
    verdicts: [...state.verdicts, v.value],
    at: { ...state.at, tree: { path: moved.at, sha1: sha1(readFileSync(join(state.cwd, moved.at), "utf8")) } },
  })
}

// FUNCTION_CONTRACT: refused — роль не ответила: обрыв, вопрос человеку или вопрос диску
//   Antecedent:   env.track === "err"
//   Consequent:   success: состояние, где staging не тронут и круг НЕ потрачен; вопрос уехал в
//                 state.question
//   Purity:       pure (через put)
//   BUG_FIX_CONTEXT: без этой ветви обрыв связи судится как плохой ответ: круг съеден, прошлый
//                 черновик испорчен, и три обрыва подряд дают escalate там, где роль не ошиблась ни
//                 разу. Сценарий 3 компонентного теста существует ровно ради неё.
function refused(state, todo, env) {
  if (env.kind === "question") {
    const items = env.items && env.items.length ? env.items : [env.subject || "роль задала вопрос без текста"]
    return put(state, { question: { of: todo.id, name: `${id.replace("/", "-")}-q${state.asked + 1}`, items, retry: 1 }, asked: state.asked + 1 })
  }
  return put(state, {})                                  // обрыв: состояние не портим и круг не тратим
}

// FUNCTION_CONTRACT: answered — оператор нажал Approve; ответ ищется на ДИСКЕ по номеру
//   Antecedent:   `approved` это барьер над ФАКТОМ, а не сам факт
//   Consequent:   success: вопрос погашен, если ответ найден; иначе переспрос, пока есть бюджет
//   Purity:       io (fs)
function answered(state, result) {
  const q = state.question
  if (!q) return ok(state)
  if (result !== "approved") {
    return put(state, { question: null, portions: state.portions.map((p) => ({ ...p, status: "todo" })) })
  }
  const text = readAt(state.cwd, ".agent/answers.md")
  const answered = q.items.every((_, i) => new RegExp(`^\\s*${i + 1}[).]`, "m").test(text))
  if (answered) return put(state, { question: null })
  if (q.retry >= state.budgets.checkpointRetries) {
    return err("fold", `на вопросы шага ${id} нет ответов после ${q.retry} переспросов — .agent/answers.md их не содержит`)
  }
  return put(state, { question: { ...q, name: `${q.name}-retry${q.retry + 1}`, retry: q.retry + 1 } })
}

import { createHash } from "node:crypto"
const sha1 = (t) => createHash("sha1").update(String(t)).digest("hex")
