// MODULE_CONTRACT: T3 — `needs` АЦИКЛИЧНО
// Purpose:    одно решение: есть ли круг в «без чего меня не написать». Круг означает, что одно из
//             рёбер — не зависимость объявления, а ВЫЗОВ: интерфейс объявил свою реализацию.
// io:         none
// EXTERNAL_DEPENDENCY: steps/plan/order.mjs::orderOf — порядок работ и поиск круга.
// Invariants: свойство ЦЕЛОГО и только целого: порция круга видеть не может.
// Interface:  T3
import { orderOf } from "../../order.mjs"

// FUNCTION_CONTRACT: T3 — круг в needs
//   Input:        { modules — все модули дерева; said — их пути }
//   Dependencies: orderOf
//   Antecedent:   дерево разобрано. Модулей нет — молчание.
//   Consequent:   success: []; failure: один блокер, называющий КОЛЬЦО целиком и говорящий, что с
//                 ребром не так — иначе роль снимет не то ребро
//   Purity:       pure
//   Interface:    T3({ modules, said }) -> string[]
export function T3({ modules = [], said = [] } = {}) {
  if (!modules.length) return []
  const sections = modules.map((m) => ({ path: m.path, calls: m.needs.map((n) => n.path).filter((p) => said.includes(p)) }))
  const { cycle } = orderOf({ sections, modules: new Map(said.map((p) => [p, {}])), edges: [] })
  return cycle.length
    ? [`T3 отношение needs замкнуто в круг: ${cycle.join(" → ")} — «без чего меня не написать» кругов не имеет: один из них зависит не от объявления, а от вызова; сними это <need> и опиши связь словами в <hides>`]
    : []
}
