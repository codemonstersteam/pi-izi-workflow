// MODULE_CONTRACT: T3 — СОЗДАВАЕМАЯ СУЩНОСТЬ ОБЯЗАНА СТОЯТЬ В ЯКОРЯХ
// Purpose:    одно решение: знает ли рой, что ищет СОЗДАТЬ. Слово с нулевым счётом — это вещь,
//             которой в репозитории ещё нет; ноль здесь не дефект, а сама работа. Выпав из
//             `subjects[]`, она выпадает из карты обхода шага 3, и рой ищет только то, что и так
//             существует.
// io:         none
// Invariants: ТОТАЛЕН. Таблицы попаданий нет — правило МОЛЧИТ: без счёта нельзя отличить
//             созданную сущность от существующей, а обвинять по догадке запрещено.
// Interface:  T3
//
// НОЛЬ — НОРМА, И ЭТО ПОЛОВИНА ПРАВИЛА. Второй половиной было бы «якорь обязан иметь попадания» —
// прямо противоположное требование, и вместе они не сходятся ни на одном артефакте
// (standards/guardrail.md: два правила, требующих несовместимого). Здесь ноль ТРЕБУЕТ якоря.

const low = (s) => String(s || "").toLowerCase()

// FUNCTION_CONTRACT: T3 — созданные сущности против списка якорей
//   Input:        { requirements — [{ id, statement }]; subjects — список якорей или null, если
//                   строки нет вовсе; hits — { слово: сколько файлов } из hitsOf }
//   Dependencies: low
//   Antecedent:   таблица попаданий непуста. Нет таблицы — МОЛЧАНИЕ
//   Consequent:   success: []; failure: по блокеру на каждую созданную сущность, оставшуюся без
//                 якоря; блокер называет слово, его нулевой счёт, требование, где оно стоит, и
//                 строку, которую надо написать
//   Purity:       pure
//   Interface:    T3({ requirements, subjects, hits }) -> string[]
export function T3({ requirements = [], subjects = null, hits = null } = {}) {
  if (!hits || typeof hits !== "object") return []
  const words = Object.keys(hits)
  if (!words.length || !requirements.length) return []

  const anchors = new Set((subjects || []).map(low))
  const out = []
  for (const w of words) {
    if (Number(hits[w]) !== 0) continue                 // существующая вещь — не забота этого правила
    if (anchors.has(low(w))) continue
    const at = requirements.find((r) => low(r.statement).includes(low(w)))
    if (!at) continue                                    // слово нигде не создаётся — якорем быть не обязано
    const line = [...(subjects || []), w].join(" · ")
    out.push(`T3 subjects[]: «${w}» — создаваемая сущность (файлов 0), она стоит в ${at.id}, а в якорях её нет: рою нечем искать место, где её создавать. Напиши строку целиком: subjects[]: ${line}`)
  }
  return out
}
