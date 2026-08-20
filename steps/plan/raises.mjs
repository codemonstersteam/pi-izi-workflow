// MODULE_CONTRACT: raises — какой модуль ПОДНИМАЕТ отказ, по развёрнутым цепочкам шага 9
// Purpose:    одно решение — где в плане обязан стоять код отказа. Цепочка (.agent/data-flow.md)
//             называет модуль и переход `вход -> выход` на каждом шаге; код, впервые появившийся
//             СПРАВА, поднят этим модулем, дальше он лишь проносится. Никакой прозы и никаких
//             эвристик: адрес вычисляется из строки.
//             PURE: диск живёт в ext/index.mjs.
// io:         none
// Invariants: raisesOf тотальна — любой текст, включая пустой и битый, даёт пустую карту, а не
//             бросок; порядок кодов внутри модуля — порядок их появления в потоке
// Interface:  raisesOf(flow, codes) -> Map<path, [{ code, chain, step }]>
//             raisesBlock(rows) -> string  — производный блок раздела плана
//             measuresOf(fit) -> string[]  — чем величина узнаётся в тексте плана
//
// BUG_FIX_CONTEXT: прогон eddi 19.08.2026. В цепочках стояли `400 TERM_KEY_INVALID`,
//   `404 GLOSSARY_NOT_FOUND` и `422 GLOSSARY_DELETED`; в `PLAN.md` — НИ ОДНОГО из трёх. Шаг 14 режет
//   тикеты из разделов плана, значит исполнитель получил бы наряд без единого отказа, написал happy
//   path, и `verify` тикета сошёлся бы: требования R3, R16 и R18 остались бы невыполненными молча.
//   Ни один судья этого не увидел — наш критик написал `Pass`, второй судья нашёл только 422 и
//   только во втором круге.

// КОДЫ БЕРУТСЯ ИЗ КАРТЫ ОТКАЗОВ FRD, А НЕ УГАДЫВАЮТСЯ ПО ВИДУ. Первая редакция считала кодом всякое
// слово в верхнем регистре — и объявила отказами `REST`, `CRUD`, `JSON`: словарь домена, которым
// цепочка описывает обычные переходы. Что такое код, объявлено в артефакте: `<failure code=…>`.
const codesIn = (side, codes) => codes.filter((c) => String(side || "").includes(c))

// FUNCTION_CONTRACT: raisesOf — кто поднял отказ
//   Input:        flow — текст `.agent/data-flow.md`; codes — коды карты отказов FRD
//                 (`frd.failures.map(f => f.code)`): что СЧИТАЕТСЯ кодом, объявлено в артефакте
//   Dependencies: codesIn
//   Antecedent:   любые значения; без кодов карта пуста — судить нечем, и правило молчит
//   Consequent:   success: Map<путь модуля, [{ code, chain, step }]> — только ПОДНЯВШИЕ: код стоит
//                          справа и не стоит слева. Модуль, который код лишь пронёс, в карту не
//                          попадает: чинить нечего, он его передаёт
//                 failure: none — тотальна
//   Purity:       pure
export function raisesOf(flow, codes = []) {
  const known = (Array.isArray(codes) ? codes : []).map((c) => String(c || "").trim()).filter(Boolean)
  const out = new Map()
  if (!known.length) return out
  let chain = ""
  for (const line of String(flow == null ? "" : flow).split("\n")) {
    const head = line.match(/^\$START_FLOW\s+id="([^"]+)"/)
    if (head) { chain = head[1]; continue }
    const m = line.match(/^(\d+)\.\s+(\S+)\s*:\s*([\s\S]*?)\s*->\s*([\s\S]*)$/)
    if (!m) continue
    const [, step, path, from, to] = m
    const raised = codesIn(to, known).filter((c) => !codesIn(from, known).includes(c))
    if (!raised.length) continue
    if (!out.has(path)) out.set(path, [])
    for (const code of raised) {
      if (out.get(path).some((r) => r.code === code && r.chain === chain)) continue
      out.get(path).push(Object.freeze({ code, chain, step: Number(step) }))
    }
  }
  return out
}

// FUNCTION_CONTRACT: raisesBlock — производный блок раздела плана
//   Input:        rows — [{ code, chain, step }] одного модуля
//   Dependencies: —
//   Antecedent:   любые значения; пусто даёт пустую строку — блока у модуля без отказов нет
//   Consequent:   success: строки `raises:` со ссылкой на цепочку и шаг
//                 failure: none — тотальна
//   Purity:       pure
//
// БЛОК ПОМЕЧЕН КАК ПРОИЗВОДНЫЙ. Ссылка на цепочку — не украшение: раздел пишет РОЛЬ, а эти строки
// дописывает сборщик, и читатель обязан видеть, где кончается обещание дизайнера и начинается факт
// потока. Иначе следующий шаг спросит с роли то, чего она не писала.
export function raisesBlock(rows) {
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r && r.code)
  if (!list.length) return ""
  return [
    "raises: (собрано из .agent/data-flow.md, не написано ролью)",
    ...list.map((r) => `        ${r.code} — цепочка ${r.chain}, шаг ${r.step}`),
  ].join("\n")
}


// FUNCTION_CONTRACT: measuresOf — чем ВЕЛИЧИНА узнаётся в тексте плана
//   Input:        fit — значение `<nfr fit>`; тип не ограничен
//   Dependencies: —
//   Antecedent:   любое значение
//   Consequent:   success: [строки] — число ВМЕСТЕ с единицей («5 minutes», «64 characters»), код в
//                          верхнем регистре, имя с точкой. Пусто — величина словесная («по образцу
//                          соседнего модуля»), узнать её в тексте нечем
//                 failure: none — тотальна
//   Purity:       pure
//
// ПОЧЕМУ НЕ ГОЛОЕ ЧИСЛО. `5` встречается в плане десятками способов — «R5», «S5», «5 модулей», — и
// проверка по нему сказала бы «величина на месте» о плане, где её нет. Единица делает знак
// различимым. И почему не `core/answers.mjs::hardTokens`: та функция отвечает на другой вопрос — чем
// узнаётся ОТВЕТ ОПЕРАТОРА (код, статус, путь), и трёхзначного порога ей хватает.
export function measuresOf(fit) {
  const t = String(fit == null ? "" : fit)
  const out = new Set()
  for (const m of t.matchAll(/\b(\d+(?:[.,]\d+)?)\s*([A-Za-zА-Яа-я]{2,})/g)) out.add(`${m[1]} ${m[2]}`)
  for (const m of t.matchAll(/\b[A-Z][A-Z0-9_]{3,}\b/g)) out.add(m[0])
  for (const m of t.matchAll(/\b[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){1,}\b/g)) out.add(m[0])
  return Object.freeze([...out])
}
