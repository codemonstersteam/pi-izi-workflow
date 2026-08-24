// MODULE_CONTRACT: bridge — адаптер границы процессов: песочница ↔ модули шагов
// Purpose:    одно решение спрятано здесь: КАК имя шага становится кодом. Таблица ниже —
//             единственное такое место во всей программе.
// io:         fs (через модули шагов и службы)
// EXTERNAL_DEPENDENCY: ext/state.mjs — конструктор состояния и словарь имён шагов; ext/runlog.mjs —
//             трейс; ext/values.mjs — конструктор инструкции. Модули шагов грузятся ДИНАМИЧЕСКИ по
//             таблице: отсутствующий модуль — штатный отказ с именем, а не падение импорта.
// Invariants: наружу едет ровно один JSON-объект и обратно ровно один — колбэк границу не переезжает
//             (execution.ts:234-236). Состояние, пришедшее из песочницы, ВСЕГДА прогоняется через
//             конструктор: это единственная дверь внутрь, а JSON по дороге теряет undefined, Map и
//             Set и превращает NaN в null.
// Interface:  MODULES, stepStart, stepNext, stepFold

import { ok, err } from "../core/result.mjs"
import { STEPS, start, put, finish, resume } from "./state.mjs"
import { instruction } from "./values.mjs"
import * as trace from "./runlog.mjs"

// ТАБЛИЦА ШАГОВ. Полная с самого начала, включая ещё не написанные: иначе каждый тикет волны 9
// правил бы этот файл, и восемь параллельных тикетов делили бы один файл.
export const MODULES = Object.freeze(Object.fromEntries(
  STEPS.map((id) => [id, `../steps/${id}/${id.split("/").pop()}.step.mjs`]),
))

// FUNCTION_CONTRACT: load — модуль шага по имени
//   Antecedent:   id есть в таблице; файл модуля существует и импортируется
//   Consequent:   success: модуль; failure: err("bridge", …) С ИМЕНЕМ — «шаг X не написан» читается
//                 за секунду, «Cannot find module ../steps/…» — нет
//   Purity:       io
async function load(id) {
  const at = MODULES[id]
  if (!at) return err("bridge", `шага «${id}» нет в таблице: ${STEPS.join(" · ")}`)
  try {
    const mod = await import(at)
    if (typeof mod.next !== "function" || typeof mod.fold !== "function")
      return err("bridge", `модуль шага «${id}» не выставляет next/fold — форма шага нарушена`)
    return ok(mod)
  } catch (e) {
    return err("bridge", `модуль шага «${id}» не загрузился: ${e.message}`)
  }
}

// FUNCTION_CONTRACT: intake — состояние из песочницы внутрь
//   Antecedent:   raw проходит конструктор состояния
//   Consequent:   success: State; failure: err с ИМЕНЕМ поля, и модуль шага НЕ вызывается
//   Purity:       io (через конструктор)
const gate = (raw) => put(raw, {})

// FUNCTION_CONTRACT: stepStart — первый акт прогона
//   Input:        { cwd, run, key, budgets } — время и идентификатор приходят снаружи: в песочнице
//                 Date недоступен (execution.ts:299)
//   Consequent:   success: { track:"ok", state } — состояние прогона, чистого или продолженного
//                 failure: { track:"err", … }
//   Purity:       io (fs)
export async function stepStart(input = {}) {
  const { cwd, run, key = "", budgets = {} } = input
  const records = trace.read(cwd, run)
  const cont = records.ok ? resume(cwd, records.value) : { ok: false }
  if (cont.ok) return { track: "ok", state: cont.value.state, from: cont.value.from, continued: true }
  const fresh = start({ cwd, run, key, budgets })
  if (!fresh.ok) return { track: "err", kind: "crashed", subject: fresh.error.detail }
  return { track: "ok", state: fresh.value, from: STEPS[0], continued: false }
}

// FUNCTION_CONTRACT: stepNext — что шаг просит сделать дальше
//   Antecedent:   id в таблице; state проходит конструктор
//   Consequent:   success: инструкция, ПОСТРОЕННАЯ конструктором — привод не делает `it.do` на том,
//                          что приехало
//                 failure: { do:"err", code:"crashed", subject } с именем шага или поля
//   Purity:       io
export async function stepNext({ id, state } = {}) {
  const s = gate(state)
  if (!s.ok) return { do: "err", code: "crashed", subject: `шаг ${id}: ${s.error.detail}` }
  const mod = await load(id)
  if (!mod.ok) return { do: "err", code: "crashed", subject: mod.error.detail }

  let raw
  try { raw = mod.value.next(s.value) } catch (e) {
    return { do: "err", code: "crashed", subject: `шаг ${id} бросил из next: ${e.message} — пятёрка обязана быть тотальной` }
  }
  const built = instruction(raw)
  if (!built.ok) return { do: "err", code: "crashed", subject: `шаг ${id}: ${built.error.detail}` }
  trace.begin(s.value.cwd, s.value.run, id)
  // ПОДШАГ СКАЗАЛ `done` — ЕГО СОСТАВ РАБОТЫ УМИРАЕТ ЗДЕСЬ. Полоса на `done` отдаёт `it.state`
  // следующему шагу (workflows/izi.js::run), и порции с вопросом уехали бы к чужому подшагу как
  // свои. Мост — единственное место, где это видно для ЛЮБОГО шага: он один знает, ЧЕЙ это ход.
  // Правило живёт в `ext/state.mjs::finish`, там же записано, чем оно оплачено.
  if (built.value.do !== "done") return built.value
  const over = finish(built.value.state)
  if (!over.ok) return { do: "err", code: "crashed", subject: `шаг ${id}: ${over.error.detail}` }
  return { ...built.value, state: over.value }
}

// FUNCTION_CONTRACT: stepFold — куда кладётся ответ
//   Antecedent:   id в таблице; state проходит конструктор; event несёт слово хода
//   Consequent:   success: { track:"ok", value: State }
//                 failure: { track:"err", … } — привод обязан это проверить и НЕ деструктурировать
//                          состояние из отказа
//   Purity:       io
export async function stepFold({ id, state, event } = {}) {
  const s = gate(state)
  if (!s.ok) return { track: "err", kind: "crashed", subject: `шаг ${id}: ${s.error.detail}` }
  const mod = await load(id)
  if (!mod.ok) return { track: "err", kind: "crashed", subject: mod.error.detail }

  let folded
  try { folded = mod.value.fold(s.value, event || {}) } catch (e) {
    return { track: "err", kind: "crashed", subject: `шаг ${id} бросил из fold: ${e.message} — пятёрка обязана быть тотальной` }
  }
  if (!folded || !folded.ok) return { track: "err", kind: "crashed", subject: `шаг ${id}: ${(folded && folded.error && folded.error.detail) || "fold не вернул Result"}` }
  return { track: "ok", value: folded.value }
}
