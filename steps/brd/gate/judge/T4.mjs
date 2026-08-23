// MODULE_CONTRACT: T4 — ОБРАЗЕЦ СУЩЕСТВУЕТ В ЭТОМ РЕПОЗИТОРИИ
// Purpose:    одно решение: назван ли образцом тот, кого можно грепнуть. Шаг 3б ищет файлы аналога
//             ПО ТЕКСТУ и через них находит вызывающих — на eddi это 10 эталонных файлов из 10 за
//             полсекунды. Аналог с нулевым счётом даёт ноль файлов и молча обнуляет весь этот улов.
// io:         none
// EXTERNAL_DEPENDENCY: steps/brd/brd.mjs::analogueTerm — грепаемая голова строки: имя до тире,
//             остальное объяснение. Отсутствие функции читается как `analogueTerm is not a function`.
// Invariants: ТОТАЛЕН. Таблицы попаданий нет — правило МОЛЧИТ: счёт брать неоткуда.
// Interface:  T4
import { analogueTerm } from "../../brd.mjs"

// ОТСУТСТВИЕ ОБРАЗЦА — ЗАКОННЫЙ ВХОД, И ОН ОБЪЯВЛЯЕТСЯ. `none` это вывод роли о репозитории, а не
// пропуск строки, поэтому пишется словом — тот же приём, что `<failures found="no">`.
const DECLARED_ABSENT = /^none\b/i

const low = (s) => String(s || "").toLowerCase()

// FUNCTION_CONTRACT: T4 — счёт образца в таблице попаданий
//   Input:        { analogue — значение строки `analogue:` или null, если строки нет;
//                   hits — { слово: сколько файлов } из hitsOf }
//   Dependencies: analogueTerm, DECLARED_ABSENT
//   Antecedent:   таблица попаданий непуста. Нет таблицы — МОЛЧАНИЕ
//   Consequent:   success: []; failure: один блокер — строки нет · слово с нулём · слова нет в
//                 таблице; каждый называет оба выхода: слово со счётом либо объявленное отсутствие
//   Purity:       pure
//   Interface:    T4({ analogue, hits }) -> string[]
export function T4({ analogue = null, hits = null } = {}) {
  if (!hits || typeof hits !== "object") return []
  const words = Object.keys(hits)
  if (!words.length) return []

  const alive = words.filter((w) => Number(hits[w]) > 0).sort((a, b) => hits[b] - hits[a]).slice(0, 3)
  const exit = `Назови слово с НЕНУЛЕВЫМ счётом из таблицы попаданий${alive.length ? ` (например: ${alive.join(" · ")})` : ""} — «analogue: <слово> — чем он образец», — либо объяви отсутствие: «analogue: none — <почему ничего похожего нет>»`

  if (analogue === null) return [`T4 analogue: строки нет — по образцу чего делается работа, шаг 3б спрашивает у неё. ${exit}`]

  const raw = String(analogue).trim()
  if (!raw) return [`T4 analogue: строка пуста. ${exit}`]
  if (DECLARED_ABSENT.test(raw)) return []

  const term = analogueTerm(raw)
  const key = words.find((w) => low(w) === low(term))
  if (!key) return [`T4 analogue: «${term}» — этого слова в таблице попаданий нет, значит его счёт по репозиторию никто не считал. ${exit}`]
  if (Number(hits[key]) === 0) return [`T4 analogue: «${term}» — в таблице попаданий у него 0 файлов: в этом репозитории такой вещи нет, и образцом она быть не может. ${exit}`]
  return []
}
