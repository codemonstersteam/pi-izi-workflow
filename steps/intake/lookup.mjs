// MODULE_CONTRACT: steps/intake/lookup.mjs — что роль шага 6 получает в ответ на справку о репозитории
// Purpose:    one decision — КАКОЙ ТЕКСТ увидит роль, спросившая `kind:"lookup"`. Решение живёт здесь,
//             а не в workflows/izi.js, по одной причине: полоса исполняется в vm-песочнице, её нельзя
//             импортировать, и единственный доступный ей шов — регулярка по собственному исходнику.
//             Регулярка видит, что строка есть; она не видит, ЧТО в строке.
// io:         none
// Invariants: lookupAnswer TOTAL — любой вход, включая undefined, даёт строку и никогда не бросает.
// Interface:  lookupAnswer({ names, rows, spent, cap }) -> string
//             mergeFeedback({ pending, answer }) -> string
//
// BUG_FIX_CONTEXT: живой прогон 64cebdda (19.08.2026), первый прогон рельсы lookup. В полосе стояло
//   `const rows = found.typeRows || ""` — а `typeRows` это СЧЁТ строк, сама таблица лежит в `types`.
//   Роль получила «lookup: 7» и, ничего не узнав, спросила снова: три круга подряд, в каждом заново
//   `AgentConfiguration`, который скрипт уже трижды нашёл. Шов был регуляркой по izi.js и подмену
//   поля пропустил — увидеть её он не мог в принципе. Отсюда этот модуль: текст ответа собирает
//   чистая функция, и её юнит проверяет, что в ответе стоит ПУТЬ, а не число.
const NOTHING = (names) =>
  `lookup: ${names.join(", ")} — в репозитории таких типов нет ни в карте роя, ни в graph-computed.xml. ` +
  `Не выдумывай путь: если работа их требует, спроси оператора (track:"err", kind:"question").`

const SPENT = (cap) =>
  `\n\nБольше справок нет: ${cap} кругов lookup исчерпаны. Пиши артефакт тем, что уже знаешь, ` +
  `а чего не хватает — спроси оператора (track:"err", kind:"question").`

// FUNCTION_CONTRACT: lookupAnswer — ответ репозитория на справку роли
//   Input:        { names — что спрашивали; rows — ГОТОВЫЕ строки таблицы (имя · путь · вид · что
//                  объявляет), пустая строка если не резолвится ничего; spent — сколько кругов уже
//                  потрачено; cap — сколько их всего }
//   Dependencies: —
//   Antecedent:   любые значения
//   Consequent:   success: текст для FEEDBACK. Есть строки — они и есть ответ; нет — прямой отказ с
//                          указанием единственного законного выхода (спросить человека). Круги
//                          кончились — к ответу добавляется точка: дальше роль решает сама
//                 failure: none — тотальна
//   Purity:       pure
export function lookupAnswer({ names = [], rows = "", spent = 0, cap = 0 } = {}) {
  const asked = (Array.isArray(names) ? names : [names]).map((x) => String(x || "").trim()).filter(Boolean)
  const table = String(rows || "").trim()
  const head = table ? `lookup: репозиторий отвечает —\n${table}` : NOTHING(asked.length ? asked : ["(имён не названо)"])
  return spent >= cap && cap > 0 ? `${head}${SPENT(cap)}` : head
}

// FUNCTION_CONTRACT: mergeFeedback — справка ПРИБАВЛЯЕТСЯ к замечаниям, а не замещает их
//   Input:        { pending — текст FEEDBACK, который уже стоял в наряде (замечания гардрейла или
//                             блокеры критика); answer — ответ рельсы lookup }
//   Dependencies: —
//   Antecedent:   любые значения; заглушка «первой попытки» (строка, начинающаяся со скобки)
//                 замечанием НЕ считается
//   Consequent:   success: оба текста через пустую строку; пусто с одной стороны — вторая целиком
//                 failure: none — тотальна
//   Purity:       pure
//   Interface:    mergeFeedback({ pending?: string, answer?: string }) -> string
//
// BUG_FIX_CONTEXT: живой прогон eddi 19.08.2026, круг 2. Гардрейл вернул 15 блокеров; роль, починяя,
//   спросила справку — и полоса ПРИСВОИЛА ответ рельсы в feedback, стерев список того, что чинить.
//   Следующий круг роль писала вслепую, а гардрейл вернул бы те же 15 строк. Склейка живёт здесь, а
//   не в workflows/izi.js, по той же причине, что и весь этот модуль: полоса исполняется в
//   vm-песочнице, её нельзя импортировать, и решение в ней проверяется только регуляркой по
//   исходнику — то есть не проверяется.
export function mergeFeedback({ pending = "", answer = "" } = {}) {
  const has = String(pending || "").trim()
  const real = has && !has.startsWith("(") ? has : ""
  const add = String(answer || "").trim()
  return [real, add].filter(Boolean).join("\n\n")
}
