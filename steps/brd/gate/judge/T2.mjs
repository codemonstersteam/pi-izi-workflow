// MODULE_CONTRACT: T2 — R-СТРОКА ЭТО СЛЕДСТВИЕ, А НЕ ПЕРЕСКАЗ ПРЕДЛОЖЕНИЯ ЗАКАЗА
// Purpose:    одно решение: несёт ли требование работу шагу 6. Предложение заказа, переписанное
//             буква в букву, не несёт ничего: заказ у шага 6 и так есть, а следствие — «что
//             ИЗМЕНИТСЯ в репозитории» — есть только здесь.
// io:         none
// Invariants: ТОТАЛЕН. Заказа нет — правило МОЛЧИТ: сверять пересказ не с чем, и обвинять роль в
//             пересказе того, чего судья не видел, — обвинение без операнда.
// Interface:  SAME_WORDS, T2
//
// МЕРА — ДОСЛОВНОСТЬ, А НЕ ПОХОЖЕСТЬ. Пересечение слов ловило бы законную R-строку: заказ «A new
// endpoint is needed that returns ONE fruit by its name» и следствие «A new endpoint returns one
// fruit by its name» делят почти весь словарь, но второе — уже утверждение о репозитории. Красным
// становится только то, что стоит в заказе СПЛОШНЫМ КУСКОМ: равно предложению целиком либо входит
// в него подряд, слово в слово.

// Столько слов подряд, совпавших с предложением заказа, считаются пересказом. Короче — это общая
// формулировка предметной области («глоссарий экспортируется вместе с агентом»), и запрещать её
// значило бы требовать синонимов там, где заказ уже назвал вещь своим словом (роль gate, LAW 3).
export const SAME_WORDS = 6

const norm = (s) => String(s || "").toLowerCase().replace(/[`'"«»(){}\[\]<>*_#]/g, " ")
  .replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim()

// FUNCTION_CONTRACT: sentencesOf — заказ, разложенный на предложения
//   Input:        text — сырой текст заказа
//   Antecedent:   — (тотальна)
//   Consequent:   success: нормализованные предложения без пустых
//   Purity:       pure
const sentencesOf = (text) => String(text || "").split(/[.!?;\n]+/).map(norm).filter(Boolean)

// FUNCTION_CONTRACT: T2 — R-строки против предложений заказа
//   Input:        { requirements — [{ id, statement }] из parseBrd; request — текст заказа
//                   (TASK.md и/или нормализованная таблица) }
//   Dependencies: sentencesOf, norm, SAME_WORDS
//   Antecedent:   заказ непуст. Заказа нет — МОЛЧАНИЕ
//   Consequent:   success: []; failure: по блокеру на пересказанную R-строку, каждый цитирует
//                 предложение заказа и говорит, ЧТО написать вместо
//   Purity:       pure
//   Interface:    T2({ requirements, request }) -> string[]
export function T2({ requirements = [], request = "" } = {}) {
  const sentences = sentencesOf(request)
  if (!sentences.length || !requirements.length) return []
  const out = []
  for (const r of requirements) {
    const said = norm(r.statement)
    const words = said ? said.split(" ") : []
    if (words.length < SAME_WORDS) continue
    const hit = sentences.find((s) => s === said || s.includes(said))
    if (hit) {
      out.push(`T2 ${r.id}: «${r.statement}» — это предложение заказа слово в слово («${hit.slice(0, 80)}»), а не следствие. Напиши, ЧТО ИЗМЕНИТСЯ в репозитории, если заказ выполнить: «${r.id} <существующая вещь> получает <что нового>»`)
    }
  }
  return out
}
