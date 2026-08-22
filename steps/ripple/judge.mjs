// MODULE_CONTRACT: judge — гардрейл шага 8: КАЖДЫЙ задетый путь есть в карте
// Purpose:    одно решение: описывает ли рябь тот же репозиторий, что и карта. Узел, которого карта
//             не знает, означает, что два шага полосы по-разному отвечают на вопрос «что такое узел».
// io:         none
// Invariants: ТОТАЛЕН. Карты нет — правило МОЛЧИТ: сверять не с чем.
// Interface:  judgeRipple
import { attrs } from "../../core/xml.mjs"

// FUNCTION_CONTRACT: judgeRipple — вердикт по ряби
//   Input:        { text — ripple.xml; known — пути, которые карта объявляет }
//   Antecedent:   — (тотален)
//   Consequent:   success: []; failure: блокеры, называющие ПУТИ поимённо
//   Purity:       pure
//   BUG_FIX_CONTEXT: живой прогон eddi 19.08.2026 — шаг 6 закрылся зелёным с дельтой на файл,
//                 который есть в репозитории, а шаг 8 отказал «узла нет в карте». Полоса встала
//                 между двумя своими же шагами. Поэтому здесь правило судит по карте И молчит,
//                 когда карты нет, а не отбивает всё подряд.
export function judgeRipple({ text = "", known = [] } = {}) {
  const raw = String(text || "")
  const nodes = [...raw.matchAll(/<node\b[^>]*\bpath="([^"]+)"/g)].map((m) => m[1])
  if (!raw.trim() || !/<ripple\b/.test(raw)) {
    return [`invalid: рябь не похожа на артефакт шага 8 — нет корня <ripple>. Длина полученного: ${raw.length} симв.`]
  }
  if (!known.length) return []                      // молчание: карты нет, сверять не с чем
  const alien = [...new Set(nodes)].filter((p) => !known.includes(p))
  return alien.length
    ? [`рябь называет узлы, которых нет в карте: ${alien.join(", ")} — либо карта неполна, либо путь другой; оба шага обязаны одинаково отвечать на вопрос «что такое узел»`]
    : []
}
export { attrs }
