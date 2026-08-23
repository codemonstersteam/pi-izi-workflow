// MODULE_CONTRACT: judge — ГОЛОВА ГАРДРЕЙЛА ВОРОТ: пять правил, один разбор, все блокеры сразу
// Purpose:    одно решение спрятано здесь: годится ли ответ ворот как ВХОД всего остального
//             конвейера. Сами правила лежат по модулю на правило (`judge/T1..T4.mjs`) — судья на
//             полсотни ветвей это не модуль, а свалка (`standards/code.md`); здесь только разбор
//             текста ОДИН раз, порядок правил и класс находки.
// io:         none
// EXTERNAL_DEPENDENCY: steps/brd/brd.mjs::parseBrd — как читается артефакт; judge/T1..T4.mjs — сами
//             правила. Отсутствие любого из них читается как `X is not a function` на первом ответе
//             роли, а не как молчаливо зелёный вердикт.
// Invariants: ТОТАЛЕН. Ответ не похож на артефакт ворот — вердикт `invalid`, а не молчание.
//             ОПЕРАНД ОТСУТСТВУЕТ — ПРАВИЛО МОЛЧИТ: без таблицы попаданий T3 и T4 не судят
//             ничего, и зелёный вердикт от этого не становится доказательством.
// Interface:  CLASSES, RULES, judgeBrd
import { parseBrd } from "../brd.mjs"
import { T1 } from "./judge/T1.mjs"
import { T2 } from "./judge/T2.mjs"
import { T3 } from "./judge/T3.mjs"
import { T4 } from "./judge/T4.mjs"

// КЛАСС НАХОДКИ — ЭТО АДРЕС ИСТОЧНИКА, а не украшение. По нему наряд починки решает, какие блоки
// данных прислать роли (`steps/brd/order.mjs::SOURCE_FOR`): находке про пересказ нужна таблица
// действий, находке про якорь — таблица попаданий, находке про вердикт — ничего.
export const CLASSES = Object.freeze([
  "invalid", "invalid-verdict", "restated-request", "missing-anchor", "invalid-analogue",
])

// ПОРЯДОК ПРАВИЛ = ПОРЯДОК ЧТЕНИЯ НАРЯДА ПОЧИНКИ: сначала вердикт (без него артефакта нет вовсе),
// потом требования, потом якоря. Все правила прогоняются ВСЕГДА: роль правит по пачке за один круг,
// а не по одному блокеру за вызов.
export const RULES = Object.freeze([
  { cls: "invalid-verdict", run: (d, c) => T1({ verdict: d.verdict, said: c.said }) },
  { cls: "restated-request", run: (d, c) => T2({ requirements: d.requirements, request: c.request }) },
  { cls: "missing-anchor", run: (d, c) => T3({ requirements: d.requirements, subjects: d.subjects, hits: c.hits }) },
  { cls: "invalid-analogue", run: (d, c) => T4({ analogue: d.analogue, hits: c.hits }) },
])

// FUNCTION_CONTRACT: judgeBrd — вердикт по ответу ворот
//   Input:        { text — что записала роль; sources — [задача, …значения ответов оператора];
//                   rows — нормализованная таблица подшага 2A; hits — { слово: сколько файлов } и
//                   files — сколько файлов просмотрено, оба из steps/brd/hits/hits.mjs::hitsOf }
//   Dependencies: parseBrd, RULES (T1..T4)
//   Antecedent:   — (тотален). Таблицы попаданий нет — правила про якоря МОЛЧАТ
//   Consequent:   success: [] ; failure: [{ cls, text }] — ВСЕ находки сразу, по правилам сверху вниз
//   Purity:       pure
export function judgeBrd({ text = "", sources = [], rows = "", hits = null, files = 0 } = {}) {
  const raw = String(text || "")
  // Ответ похож на артефакт ворот, если в нём есть хоть одно требование ИЛИ строка вердикта. Проза,
  // извинение и пересказ наряда не проходят это сито, и дальше их разбирать нечем.
  if (!/^\s*R\d+\b/m.test(raw) && !/^\s*verdict\s*:/im.test(raw)) {
    return [{ cls: "invalid", text: `invalid: ответ не похож на BRD — в тексте нет ни строки «verdict: …», ни строки вида «R1 …». Верни артефакт по схеме своего наряда, без пояснений вокруг. Начало ответа: «${raw.trim().slice(0, 120)}»` }]
  }
  const doc = parseBrd(raw)
  const ctx = {
    said: Boolean(raw.trim()),
    request: [rows, ...(sources || []).slice(0, 1)].filter(Boolean).join("\n"),
    hits, files,
  }
  return RULES.flatMap(({ cls, run }) => run(doc, ctx).map((text) => ({ cls, text })))
}
