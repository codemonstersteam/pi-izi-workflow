// MODULE_CONTRACT: judge — обёртка-тотал над checkFrd для пласта
// Purpose:    одно решение: какие блокеры принадлежат ЭТОМУ пласту. checkFrd возвращает все —
//             судья фильтрует by forPass: красный чужого пласта не должен тратить круг этого.
// io:         none
// Invariants: ТОТАЛЕН — мусор разбирается в блокеры.
// Interface: judgePass
import { checkFrd, forPass, newFrd } from "./frd.mjs"

// FUNCTION_CONTRACT: judgePass — блокеры пласта; пусто значит зелёный
//   Input:        { xml, pass, … } — staged FRD и буква пласта; остальное — аргументы checkFrd
//   Consequent:   success: string[] — блокеры с номерами правил, отсортированные по пластам
//   Purity:       pure
export function judgePass({ xml = "", pass = "", ...args } = {}) {
  const built = newFrd({ xml, pass, ...args })
  if (!built.ok) return built.error.detail.split("\n")
  return forPass(checkFrd({ frd: built.value, pass, ...args }), pass)
}
