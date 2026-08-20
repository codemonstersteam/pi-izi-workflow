// MODULE_CONTRACT: ask — разговор роли с оператором как АРТЕФАКТ шага
// Purpose:    одно решение — какой след оставляет закрытый обмен. Вопрос живёт в
//             `.agent/pending.json` ровно до ответа и стирается: после прогона узнать, о чём роль
//             спрашивала на шаге 6, неоткуда, а разбор начинается именно с этого. Здесь обмен
//             превращается в строку артефакта — шаг, проход, размер черновика на момент вопроса,
//             вопросы и ответы дословно.
//             PURE: диск живёт в ext/index.mjs. Замысел — docs/ask.md §3а.
// io:         none
// Invariants: askEntry тотальна — любой вход даёт валидный XML-кусок и никогда не бросает; текст
//             вопроса и ответа ЭКРАНИРУЕТСЯ (в них живут `<`, `&` и кавычки: на живом прогоне ответ
//             нёс `{{glossary.<term>}}`, и сырой знак сделал бы артефакт нечитаемым — та же беда,
//             от которой стоит F0 в steps/intake/frd.mjs)
// Interface:  askEntry({ step, pass, draftBytes, said }) -> string
import { esc } from "./xml.mjs"

// FUNCTION_CONTRACT: askEntry — одна запись разговора
//   Input:        { step — имя шага ("intake"); pass — проход ("A"), пусто у шагов без проходов;
//                 draftBytes — сколько символов было в черновике роли, когда она спросила;
//                 said — [{ n, question, text }] как их отдаёт core/answers.mjs::newAnswers —
//                 ТОЛЬКО обмен, который закрылся, не вся история }
//   Dependencies: core/xml.mjs::esc
//   Antecedent:   любые значения; пустой `said` даёт пустую строку — записывать нечего
//   Consequent:   success: `<ask step pass draft>` с парами `<q n>`/`<a n>` внутри, готовый к
//                          дописыванию в конец `.agent/ask.xml`
//                 failure: none — тотальна
//   Purity:       pure
//
// ПОЧЕМУ РАЗМЕР ЧЕРНОВИКА, А НЕ ЕГО ТЕЛО. Тело лежит в staging и промоутится дальше; копия артефакта
// внутри артефакта — два места для одного факта (CLAUDE.md). А вот НОЛЬ против ПЯТИ ТЫСЯЧ отвечает на
// вопрос, который иначе не спросишь: роль спросила ДО того, как что-то написала, или после — и от
// этого зависит, было ли ей что исправлять.
export function askEntry({ step = "", pass = "", draftBytes = 0, said = [] } = {}) {
  const rows = (Array.isArray(said) ? said : []).filter((x) => x && x.question)
  if (!rows.length) return ""
  const head = `<ask step="${esc(step)}"${pass ? ` pass="${esc(pass)}"` : ""} draft="${Number(draftBytes) || 0}">`
  const body = rows.map((r) => `  <q n="${Number(r.n) || 0}">${esc(r.question)}</q>\n  <a n="${Number(r.n) || 0}">${esc(r.text || "")}</a>`).join("\n")
  return `${head}\n${body}\n</ask>\n`
}
