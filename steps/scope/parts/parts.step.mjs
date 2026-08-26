// MODULE_CONTRACT: подшаг 3В — клетки фокуса становятся частями карты. Голова над пятёркой с РОЕМ.
// Purpose:    одно решение: годится ли часть как ВХОД склейки (шаг 5). Порции = клетки фокоса,
//             НЕЗАВИСИМЫ → инструкция `roles` пачками не шире литеральной ширины полосы; суд —
//             по ИД клетки, состав читает гардрейл из плана; кэш пересуживается перед
//             использованием (решение задачи — где читает рой — принято подшагом 3Б, не здесь).
// io:         fs + model (через инструкцию `roles`)
// EXTERNAL_DEPENDENCY: ext/state.mjs::put; ext/values.mjs — вердикты; пятёрка: inputs → cut →
//             order → judge → route; кэш — steps/scope/cache.mjs (decide) и route (io).
// Invariants: ОБРЫВ ОДНОЙ ПОРЦИИ НЕ ТРОГАЕТ СОСЕДЕЙ — ни вердиктов, ни кругов; пустой слот роя
//             читается так же (это место, на которое вызова не пришлось). Круги починки у клеток
//             свои; провал частей не пересчитывает план и фокус — круги подшагов разделены обёрткой.
// Interface: id, next, fold
import { existsSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { ok, err } from "../../../core/result.mjs"
import { put } from "../../../ext/state.mjs"
import { verdict as newVerdict } from "../../../ext/values.mjs"
import { decide } from "../cache.mjs"
import { WRAPPERS } from "../../../core/suites.mjs"
import { GRAMMAR_VERSION } from "../part.mjs"
import { inputs } from "./inputs.mjs"
import { cellsOf } from "./cut.mjs"
import { orderText } from "./order.mjs"
import { judgePart } from "./judge.mjs"
import { cachedPart, partsStamp, promoteCached, promotePart } from "./route.mjs"
import { FOCUS, PLAN, STAGED_PART, partAt } from "../paths.mjs"

export const id = "scope/parts"

// Имя роли — ИМЯ ФАЙЛА (steps/scope/parts/scout.md, standards/role.md); шов — ext/vocabulary.test.mjs.
const ROLE = "scout"
// Ширина пачки равна литеральной ширине роя полосы (workflows/izi.js::SWARM): порций больше
// ширины — шаг эмитит их пачками, лимитера параллельности в песочнице нет (parallel = Promise.all).
const WIDTH = 8

const readAt = (cwd, rel) => (existsSync(join(cwd, rel)) ? readFileSync(join(cwd, rel), "utf8") : "")

// FUNCTION_CONTRACT: treeInventory — файлы ДЕРЕВА плана + обёртки сборки из корня
//   Инвентарь правил P8/P9 — факты РЕПОЗИТОРИЯ, а не одной клетки: сьюта обещает команду по папке
//   с тестами, которых в хребте (pom, README) не бывает — прогон 3c6542e7 трижды бил правильный
//   ответ об инвентарь хребтовой клетки (T25). Обёртки (mvnw…) прогул пропускает как vendored —
//   их добавляем из КОРНЯ диска: P9 судит команду обёрткой, которую дерево не несёт.
//   Purity: io (fs)
function treeInventory(state) {
  const inv = []
  try {
    const plan = JSON.parse(readAt(state.cwd, PLAN))
    inv.push(...(plan.cells || []).flatMap((c) => (c.files || []).map((f) => f.path)))
  } catch { /* план судится входом подшага; пустой инвентарь — правила P8/P9 молчат */ }
  for (const w of WRAPPERS) if (existsSync(join(state.cwd, w.file))) inv.push(w.file)
  return inv
}

// FUNCTION_CONTRACT: next — ЧТО делать дальше
//   Consequent:   done · err · say (состав) · roles (пачка ≤ WIDTH)
//   Purity:       io (читает; чистит путь доставки — подготовка, не запись артефакта)
export function next(state) {
  const bad = inputs(state)
  if (bad) return { do: "err", code: "blocked", cls: bad.cls, subject: bad.why }
  if (state.at && state.at.parts) return { do: "done", state }

  if (!state.portions.length) {
    const focus = JSON.parse(readAt(state.cwd, FOCUS))
    const cells = (focus.cells || []).map((c) => String(c || "")).filter(Boolean)
    if (!cells.length) return { do: "err", code: "blocked", subject: `${FOCUS} не несёт ни одной клетки — рою нечего читать` }
    return {
      do: "say",
      line: `scope/parts: ${cells.length} клеток фокуса, пачки по ${WIDTH} — рой ролей ${ROLE}`,
      portions: cells.map((id) => ({ id, staging: STAGED_PART.replace("{CELL}", id), status: "todo", round: 1, blockers: "" })),
    }
  }

  const todo = state.portions.filter((x) => x.status === "todo")
  if (!todo.length) return { do: "done", state }
  const over = todo.find((p) => p.round > state.budgets.loops)
  if (over) {
    return { do: "err", code: "escalate", subject: `часть «${over.id}» не чинится за ${state.budgets.loops} круга`, evidence: over.blockers }
  }

  const batch = todo.slice(0, WIDTH)
  const cells = cellsOf(state, batch.map((p) => p.id))
  const calls = []
  for (let i = 0; i < batch.length; i++) {
    const p = batch[i]
    const abs = join(state.cwd, p.staging)
    if (existsSync(abs) && !p.blockers) rmSync(abs)   // первый заход не судит вчерашний черновик
    const o = orderText(state, cells[i], { previous: p.blockers ? readAt(state.cwd, p.staging) : "", feedback: p.blockers })
    if (o.why) return { do: "err", code: "blocked", subject: o.why }
    calls.push({ id: p.id, role: ROLE, text: o.text, staging: o.staging })
  }
  return { do: "roles", calls, at: `parts-${batch.map((p) => p.id).join("-")}` }
}

// FUNCTION_CONTRACT: fold — куда кладётся ответ роя
//   Input:        say — состав (и кэш-проход: не менявшиеся клетки продвигаются без роли);
//                 roles — ЗАПИСЬ конвертов { s0: конверт, … }, порция сопоставляется слоту
//                 ПО ПОРЯДКУ ВЫЗОВОВ (паттерн plan/flows: искать «первой открытой» — гадание)
//   Consequent:   success: состояние с вердиктом на каждую порцию пачки; failure: Result.err
//   Purity:       io (fs — суд читает staging с диска, пишет только route)
export function fold(state, event = {}) {
  const it = event.instruction || {}

  if (event.do === "say") {
    const cells = cellsOf(state, it.portions.map((p) => p.id))
    const inventory = treeInventory(state)
    let portions = it.portions
    const verdicts = [...state.verdicts]
    for (let i = 0; i < portions.length; i++) {
      const cell = cells[i]
      const cached = cachedPart(state, cell)
      if (!cached) continue
      const d = decide({ cell, stored: cached.entry, grammar: GRAMMAR_VERSION })
      if (!d.reuse) continue
      // КЭШ ПЕРЕСУЖИВАЕТСЯ ПЕРЕД ИСПОЛЬЗОВАНИЕМ: запись могла пережить смену правила молча
      if (judgePart({ xml: cached.xml, cell, inventory }).length) continue
      const moved = promoteCached(state, cell, cached.xml)
      if (moved.why) return err("fold", moved.why)
      const v = newVerdict({ step: id, scope: "portion", id: cell.id, round: 1, ok: true, blockers: "", at: moved.at })
      if (!v.ok) return v
      portions = portions.map((x, j) => (j === i ? { ...x, status: "green" } : x))
      verdicts.push(v.value)
    }
    return put(state, { portions, verdicts })
  }

  if (event.do !== "roles") return err("fold", `подшаг ${id} не знает, что делать с событием «${event.do}»`)

  const calls = it.calls || []
  const record = event.result || {}
  const envelopes = Object.keys(record).sort().map((k) => record[k])   // s0, s1, … в порядке слотов
  const cells = cellsOf(state, calls.map((c) => c.id))
  const inventory = treeInventory(state)

  let portions = state.portions
  let verdicts = [...state.verdicts]
  for (let i = 0; i < calls.length; i++) {
    const call = calls[i]
    const env = envelopes[i]
    const cell = cells[i]
    const p = portions.find((x) => x.id === call.id)
    if (!p) continue

    // ОБРЫВ СВЯЗИ — НЕ ОШИБКА РОЛИ: staging не трогаем, круг НЕ тратим, соседей не задаём
    if (!env || env.track === "err") continue

    const staged = readAt(state.cwd, p.staging)
    const blockers = env.artifact !== p.staging
      ? `invalid: скаут записал «${env.artifact || "ничего"}», а послан был в ${p.staging} — артефакт это ФАЙЛ по ЭТОМУ пути`
      : !staged.trim()
        ? `invalid: ${p.staging} пуст — скаут вернул track:"ok", ничего не записав`
        : judgePart({ xml: staged, cell, inventory }).join("\n  ")

    const v = newVerdict({ step: id, scope: "portion", id: p.id, round: p.round, ok: !blockers, blockers, at: partAt(p.id) })
    if (!v.ok) return v
    verdicts = [...verdicts, v.value]

    if (blockers) {
      portions = portions.map((x) => (x.id === p.id ? { ...x, round: p.round + 1, blockers } : x))
      continue
    }
    const moved = promotePart(state, cell, staged)
    if (moved.why) return err("fold", moved.why)
    portions = portions.map((x) => (x.id === p.id ? { ...x, status: "green", blockers: "" } : x))
  }

  if (!portions.some((x) => x.status === "todo")) {
    const stamp = partsStamp(state)
    if (stamp.why) return err("fold", stamp.why)
    return put(state, { portions, verdicts, at: { ...state.at, parts: stamp } })
  }
  return put(state, { portions, verdicts })
}
