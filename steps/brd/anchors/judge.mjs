// MODULE_CONTRACT: judge — ГОЛОВА ГАРДРЕЙЛА ЯКОРЕЙ: одно правило, один разбор, один класс находки
// Purpose:    одно решение спрятано здесь: годится ли ОДНА СТРОКА, которую написала роль, как вход
//             сборщика артефакта. Само правило лежит отдельным модулем (`judge/T4.mjs`); здесь
//             только поиск строки в ответе, тотальность и класс находки.
// io:         none
// EXTERNAL_DEPENDENCY: judge/T4.mjs — само правило. Его отсутствие читается как `T4 is not a
//             function` на первом ответе роли, а не как молчаливо зелёный вердикт.
// Invariants: ТОТАЛЕН. Ответ не похож на строку аналога — вердикт, а не молчание.
//             ОПЕРАНД ОТСУТСТВУЕТ — ПРАВИЛО МОЛЧИТ: без таблицы попаданий счёт брать неоткуда, и
//             зелёное от этого не становится доказательством.
// Interface:  CLASSES, RULES, ANALOGUE_LINE, judgeAnalogue
//
// ПОЧЕМУ ПРАВИЛО ОДНО (замеры 23.08.2026, `steps/brd/data-flow.md`, раздел 2C). Артефакт подшага
// собирает СКРИПТ: R-строки — копия строк таблицы, `subjects[]` — колонка `object` под счётом
// (`steps/brd/anchors/assemble.mjs`). Непохожего артефакта поэтому не существует, а `verdict` снят
// совсем — грепом по `steps/`, `ext/`, `core/`, `workflows/` доказано, что его значение не читает
// ни один шаг полосы. Модель принимает ровно одно решение — аналог, — и правило у него одно.
import { T4 } from "./judge/T4.mjs"

// КЛАСС НАХОДКИ — ЭТО АДРЕС ИСТОЧНИКА, а не украшение: по нему наряд починки решает, какие блоки
// данных прислать роли. Род находки здесь ровно один — строка аналога негодна, — и источник у него
// один: таблица попаданий. Мёртвые классы прежних ворот (`invalid-verdict`, `restated-request`,
// `missing-anchor`) не переносятся: класс без ветви — это наряд починки, который никогда не
// привезёт свой источник.
export const CLASSES = Object.freeze(["invalid-analogue"])

// Строка аналога в ответе роли. Роль зовут ради неё одной, но модель охотно кладёт вокруг рамку из
// прозы или тройных кавычек — строка ищется в тексте, а не берётся текстом целиком.
export const ANALOGUE_LINE = /^\s*analogue\s*:.*$/im

export const RULES = Object.freeze([
  { cls: "invalid-analogue", run: (line, ctx) => T4({ line, hits: ctx.hits }) },
])

// FUNCTION_CONTRACT: judgeAnalogue — вердикт по ответу роли `analogue`
//   Input:        { text — что записала роль в staging целиком;
//                   hits — { слово: сколько файлов }, `steps/brd/hits/hits.mjs::parseTable` над
//                   `.agent/hits.txt` }
//   Dependencies: ANALOGUE_LINE, RULES (T4)
//   Antecedent:   — (тотальна). Таблицы попаданий нет — правило МОЛЧИТ, но ТОТАЛЬНОСТЬ остаётся:
//                 форма ответа судится без всякого счёта
//   Consequent:   success: [] ; failure: [{ cls, text }] — все находки сразу
//   Purity:       pure
//   Interface:    judgeAnalogue({ text, hits }) -> [{ cls, text }]
export function judgeAnalogue({ text = "", hits = null } = {}) {
  const raw = String(text || "")
  const found = raw.match(ANALOGUE_LINE)
  // ПЕРВАЯ строка, а не последняя: роль отвечает одной, и если их вдруг две, судится та, которую
  // прочтёт сборщик артефакта.
  const line = found ? found[0].trim() : null
  if (line === null) {
    return [{
      cls: "invalid-analogue",
      text: `invalid-analogue: в ответе нет строки «analogue: …» — судить нечего. Верни ОДНУ строку: «analogue: <слово из таблицы попаданий> — files <N>; <чем он образец>», либо «analogue: none — <почему ничего похожего нет>», без пояснений вокруг. Начало ответа: «${raw.trim().slice(0, 120)}»`,
    }]
  }
  return RULES.flatMap(({ cls, run }) => run(line, { hits }).map((text) => ({ cls, text })))
}
