// MODULE_CONTRACT: judge — гардрейл шага 9C: потоки данных
// Purpose:    одно решение спрятано здесь: что судит ПОРЦИЯ, а что ЦЕЛОЕ. Порция видит один use
//             case: ей доступны покрытие ЕГО шагов, словарь границы и словарь ролей шага. Кто
//             порождает значение, доехал ли отказ до статуса и работает ли модуль дерева хоть
//             где-нибудь — свойства ЦЕЛОГО, и порция их видеть не может по построению.
// io:         none
// EXTERNAL_DEPENDENCY: steps/plan/flows/flows.mjs::checkFlows — сами правила F0, F6…F11.
// Invariants: ТОТАЛЕН. Ответ не похож на потоки — вердикт invalid, а не молчание.
// Interface:  judgePortion, judgeWhole
//
// ПОЧЕМУ ЗДЕСЬ ОБЁРТКА, А НЕ СУДЬЯ НА ФАЙЛ, как у шага 9B. Правила дерева разделяются чисто: T1
// смотрит состав, T3 — круг, T5 — поля. Правила потоков делят ОДИН разбор и ОДИН обход строк:
// F6 (покрытие), F7 (порождающий), F8 (вход порождён), F9 (судьба отказа), F10 (модуль работает),
// F11 (значение из словаря) читают одни и те же строки в одном проходе. Механическая нарезка их по
// файлам переписала бы обход трижды — то есть завела бы три места для одного правила. Юниты при
// этом всё равно ПО ПРАВИЛУ: формула считает ветви, а не файлы.

import { checkFlows } from "./flows.mjs"

// FUNCTION_CONTRACT: shaped — похоже ли то, что вернула роль, на потоки
//   Antecedent:   — (тотальна)
//   Consequent:   success: ""; failure: текст блокера invalid
//   Purity:       pure
function shaped(raw) {
  const text = String(raw || "")
  if (!/<flows\b/.test(text)) {
    return `invalid: ответ не похож на потоки — нет корня <flows>. Верни ТОЛЬКО XML: <flows task="…">…</flows>, без пояснений вокруг. Начало ответа: «${text.trim().slice(0, 120)}»`
  }
  if (!/<flow\b/.test(text)) {
    return `invalid: в ответе есть корень <flows>, но ни одного <flow> — похоже, запись оборвалась. Перепиши ответ целиком. Длина полученного: ${text.length} симв.`
  }
  return ""
}

// FUNCTION_CONTRACT: judgePortion — вердикт по одному use case
//   Input:        { text, frd, tree, values, uc }
//   Antecedent:   — (тотален)
//   Consequent:   success: []; failure: блокеры порции (F0, F6, F11)
//   Purity:       pure
export function judgePortion({ text = "", frd = {}, tree = "", values = "", uc = "" } = {}) {
  const bad = shaped(text)
  if (bad) return [bad]
  return checkFlows({ text, frd, tree, values, only: uc, portion: true })
}

// FUNCTION_CONTRACT: judgeWhole — вердикт по склеенным потокам
//   Input:        { text, frd, tree, values }
//   Antecedent:   — (тотален)
//   Consequent:   success: []; failure: блокеры целого (F7, F8, F9, F10)
//   Purity:       pure
export function judgeWhole({ text = "", frd = {}, tree = "", values = "" } = {}) {
  const bad = shaped(text)
  if (bad) return [bad]
  return checkFlows({ text, frd, tree, values, whole: true })
}
