// MODULE_CONTRACT: order — ГОЛОВА-СБОРЩИК наряда intake над шестью слайсами пластов
// Purpose:    одно решение: КАК пласт становится текстом наряда. Голова подставляет ОБЩИЕ слоты
//             ({STAGING} {PREVIOUS} {FEEDBACK} {CLOSED} {ANSWERED} {ANSWERS} {CHECK}), зовёт
//             слайс своего пласта (<pass>/order.mjs::orderSlice) по карте pass→модуль ниже,
//             проверяет ТОТАЛЬНОСТЬ подстановки (дыра слота — отказ) и дописывает справку
//             lookup (T69) отдельным документом в конце. Содержание пластов голове НЕ
//             принадлежит — каждый слот пласта кладёт свой слайс; шов S4 (ext/design.test.mjs)
//             читает слоты именно из слайсов, поэтому слайс обязан носить basename order.mjs.
// io:         fs (чтение шаблона — module-relative; дисковую работу пластов делают слайсы)
// EXTERNAL_DEPENDENCY: cut.mjs — ответы оператора; шесть <pass>/order.mjs — слоты пластов по
//             карте SLICES; шаблон <pass>/order-<pass>.tpl — папка своего пласта. Нет шаблона
//             (пласт вне карты) — ENOENT чтения, наряд не собирается.
// Invariants: ТОТАЛЕН; непоставленный слот — отказ, а не текст с дырой.
// Interface: orderText
import { readFileSync } from "node:fs"
import { answersText } from "./cut.mjs"
import { orderSlice as scenariosSlice } from "./scenarios/order.mjs"
import { orderSlice as ownersSlice } from "./owners/order.mjs"
import { orderSlice as contractsSlice } from "./contracts/order.mjs"
import { orderSlice as datafailuresSlice } from "./data-failures/order.mjs"
import { orderSlice as coverageSlice } from "./coverage/order.mjs"
import { orderSlice as criticSlice } from "./critic/order.mjs"

// Карта пласт→слайс: единственное место, где голова знает о существовании пластов (но не об
// их содержании). Имена — PASSES из frd.mjs; слой слайса лежит в папке своего пласта.
const SLICES = new Map([
  ["scenarios", scenariosSlice],
  ["owners", ownersSlice],
  ["contracts", contractsSlice],
  ["data-failures", datafailuresSlice],
  ["coverage", coverageSlice],
  ["critic", criticSlice],
])

const tpl = (pass) => readFileSync(new URL(`./${pass}/order-${pass.toLowerCase()}.tpl`, import.meta.url), "utf8")

// FUNCTION_CONTRACT: orderText — наряд по пласту
//   Input:        state; pass — имя пласта (PASSES из frd.mjs); { previous, feedback, closed,
//                 lookup } — прошлый ответ (staging предыдущего СВОЕГО пласта по режиму T44),
//                 блокеры прошлого круга, список закрытых пластов, справка lookup (T69)
//   Dependencies: cut.mjs::answersText; SLICES — слайс пласта; tpl — шаблон папки пласта
//   Consequent:   success: { text, staging }; failure: { why } — дыра слота или ENOENT шаблона
//   Purity:       io (fs)
export function orderText(state, pass, { previous = "", feedback = "", closed = "", lookup = "" } = {}) {
  const staging = `.agent/staging/frd~${pass}.xml`
  const answers = answersText(state)
  const slots = {
    "{STAGING}": staging,
    "{PREVIOUS}": previous,
    "{FEEDBACK}": feedback,
    "{CLOSED}": closed,
    // T61 — ОТВЕТЫ ОПЕРАТОРА НА КАЖДОМ ПЛАСТЕ. Прежде сюда ложились БУКВЫ закрытых пластов, а
    // ответы уезжали в {ANSWERS} — слот, которого в order-b/c/d.tpl нет: пласт B работал вслепую
    // (замер 25.08: ответ «привязка в самой модели AgentConfiguration» не доехал — дельты ушли в
    // AgentStore/RestAgentStore). Дубль в наряде дешевле молчания; буквы остаются в {CLOSED}.
    "{ANSWERED}": answers || "(the operator has answered nothing yet)",
    "{ANSWERS}": answers,
    "{CHECK}": `the script judges the file you write at ${staging} by the FRD guardrail for pass ${pass}`,
  }
  const slice = SLICES.get(pass)
  if (slice) Object.assign(slots, slice(state, previous))
  let text = tpl(pass)
  for (const [k, v] of Object.entries(slots)) text = text.split(k).join(v)
  const hole = text.match(/\{([A-Z_]+)\}/)
  if (hole) return { why: `слот {${hole[1]}} не подставлен — наряд уходит роли с дырой` }
  // T69 — ОТВЕТ РЕЛЬСЕ LOOKUP отдельным документом в КОНЦЕ, не слотом: шаблоны тотальны,
  // и машинный блок не должен дырявить четыре .tpl. Роль просила пути — наряд их несёт;
  // «нет в карте» — тоже ответ: искать больше нечего, путь один — в question.
  if (lookup.trim()) {
    text += `\n\n$START_DOCUMENT\npath: .agent/map-lookup (machine-answered — your last lookup, resolved by the script)\nThe paths and kinds you asked for. Use them; do not ask again.\n$END_DOCUMENT\n$START_CONTENT\n${lookup.trim()}\n$END_CONTENT`
  }
  return { text, staging }
}