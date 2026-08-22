// MODULE_CONTRACT: judge — гардрейл шага 9B: голова над пятью судьями
// Purpose:    одно решение спрятано здесь: КАКОЙ судья судит порцию, а какой — целое. Своих правил
//             у головы нет: она разбирает текст один раз и складывает блокеры.
// io:         none
// EXTERNAL_DEPENDENCY: judge/T1..T5 — по судье на правило; tree.mjs::parseTree — разбор дерева.
// Invariants: ТОТАЛЕН. Битый XML — это ВЕРДИКТ «invalid», а не исключение: исключение уходит через
//             границу процессов мимо всей ROP-цепочки и уносит прогон целиком из-за одного тега.
// Interface:  judgePortion, judgeWhole
//
// ПОРЦИЯ И ЦЕЛОЕ СУДЯТСЯ РАЗНЫМ. Порция видит только свои четыре модуля, поэтому ей доступны T5
// (полнота решения) и T2 (адреса). Состав, владелец типа и ацикличность — свойства ЦЕЛОГО, и порция
// их видеть не может по построению, а не по недосмотру.

import { parseTree } from "./tree.mjs"
import { T1 } from "./judge/T1.mjs"
import { T2 } from "./judge/T2.mjs"
import { T3 } from "./judge/T3.mjs"
import { T4 } from "./judge/T4.mjs"
import { T5 } from "./judge/T5.mjs"

// FUNCTION_CONTRACT: read — разбор текста ответа, тотальный
//   Input:        text — то, что написала роль; может быть чем угодно
//   Antecedent:   — (тотален по построению)
//   Consequent:   success: { modules, said }
//                 failure: { blockers } — ВЕРДИКТ «invalid», не бросок
//   Purity:       pure
//   BUG_FIX_CONTEXT: разбор дерева идёт регулярками и НЕ БРОСАЕТ никогда — поэтому try/catch здесь
//                 был бы мёртвым кодом, то есть комментарием в форме кода. Настоящая граница
//                 другая: роль вернула не дерево. Извинение, проза, оборванный на середине файл,
//                 пустой ответ — всё это разбирается в ноль модулей и молча выглядело бы как
//                 «дерево без модулей». Молчать тут нельзя: молчание здесь означает, что мусор
//                 проехал суд.
function read(text) {
  const raw = String(text || "")
  const { modules } = parseTree(raw)
  // НОЛЬ МОДУЛЕЙ — ВСЕГДА ОТКАЗ, есть корень или нет.
  // BUG_FIX_CONTEXT: первая версия отбивала только текст БЕЗ корня <tree>. Ответ, оборванный на
  // середине первого же модуля («<tree task="X"><module path=»), корень имел, разбирался в ноль
  // модулей — и суд ЦЕЛОГО молчал: правила состава, владельца и круга на пустом множестве все
  // тривиально зелены. Обрыв записи проезжал как принятое дерево. Поймано швом 9 (T09).
  if (!modules.length) {
    const root = /<tree\b/.test(raw)
    return { blockers: [root
      ? `invalid: в ответе есть корень <tree>, но ни одного <module> — похоже, запись оборвалась. Перепиши ответ целиком: <tree task="…"> с разделом на каждый модуль порции. Длина полученного: ${raw.length} симв.`
      : `invalid: ответ не похож на дерево — в тексте нет ни одного <module> и нет корня <tree>. Верни ТОЛЬКО XML: <tree task="…">…</tree>, без пояснений вокруг. Начало ответа: «${raw.trim().slice(0, 120)}»`] }
  }
  return { modules, said: modules.map((m) => m.path) }
}

// FUNCTION_CONTRACT: judgePortion — вердикт по одной порции
//   Input:        { text — ответ роли; mine — пути модулей порции; kin — пути всех модулей работы;
//                   known — пути репозитория }
//   Dependencies: T5, T2
//   Antecedent:   —  (тотален: любой текст судится)
//   Consequent:   success: [] — порция принята; failure: блокеры
//   Purity:       pure
//   Interface:    judgePortion({ text, mine, kin, known }) -> string[]
export function judgePortion({ text = "", mine = [], kin = [], known = [] } = {}) {
  const r = read(text)
  if (r.blockers) return r.blockers
  return [...T5({ modules: r.modules, said: r.said, mine }), ...T2({ modules: r.modules, kin: kin.length ? kin : mine, known })]
}

// FUNCTION_CONTRACT: judgeWhole — вердикт по склеенному дереву
//   Input:        { text — склейка; frd — разобранное требование }
//   Dependencies: T1, T4, T3
//   Antecedent:   —  (тотален)
//   Consequent:   success: []; failure: блокеры
//   Purity:       pure
//   Interface:    judgeWhole({ text, frd }) -> string[]
export function judgeWhole({ text = "", frd = {} } = {}) {
  const r = read(text)
  if (r.blockers) return r.blockers
  return [...T1({ said: r.said, frd }), ...T4({ modules: r.modules, said: r.said }), ...T3({ modules: r.modules, said: r.said })]
}
