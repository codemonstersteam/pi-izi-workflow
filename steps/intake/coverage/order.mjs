// MODULE_CONTRACT: coverage — слайс пласта coverage наряда intake (списание требований, C)
// Purpose:    одно решение: ЧТО видит модель на пласте «каждое требование списано» — список
//             R-id из brd.md МАШИНОЙ: модель копирует КАЖДЫЙ id в <carried req="…">, и суд
//             F11 (разность двух списков НОМЕРОВ) судит по тем же номерам. rtm-суд
//             (rtm.mjs, корень шага) сюда НЕ входит — им пользуются и судьи других пластов.
// io:         fs (через cut.mjs — чтение .agent/brd.md)
// EXTERNAL_DEPENDENCY: steps/intake/cut.mjs — brdText; путь против state.cwd ПРОГОНА.
// Invariants: слот приходит ВСЕГДА; пустота — ИМЕНОВАННАЯ («нет требований — проверь формат»);
//             тотальность наряда проверяет голова (order.mjs).
// Interface:  orderSlice
import { brdText } from "../cut.mjs"

// FUNCTION_CONTRACT: orderSlice — слоты пласта coverage
//   Input:        state — состояние прогона (cwd); prev — staging прошлого слоя, здесь не нужен
//   Dependencies: cut.mjs::brdText
//   Antecedent:   brd.md может не нести R-строк — именованная пустота, не выдумка
//   Consequent:   success: { "{OWED}": R-id по строке } — список требований к списанию
//   Purity:       io (fs через cut.mjs)
export function orderSlice(state, _prev) {
  // T50 — СПИСОК ДОЛЖНЫХ ТРЕБОВАНИЙ из brd.md: модель видит КАЖДЫЙ id и копирует его
  // в <carried req="…">. Без списка модель не знает, что закрыть (замер 25.08: D круг 1 —
  // F11 на ВСЕ требования, потому что {OWED} был пуст).
  const brd = brdText(state)
  const ids = [...brd.matchAll(/^R\d+ /gm)].map((m) => m[0].trim())
  return {
    "{OWED}": ids.length ? ids.join("\n") : "(нет требований в brd.md — проверь формат)",
  }
}
