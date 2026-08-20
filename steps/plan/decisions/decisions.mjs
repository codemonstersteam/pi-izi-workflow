// MODULE_CONTRACT: decisions — журнал решений, принятых там, где требование молчит
// Purpose:    одно решение — ЧТО считается ответом и как он переживает пересборку плана. Ответ,
//             найденный у соседа в репозитории, сегодня живёт только в тексте плана и умирает при
//             первой же пересборке: так за три дня терялась одна и та же работа. Здесь он получает
//             своё место, свою ссылку и свой маршрут.
// io:         none — чтение и запись файла живут в ext/index.mjs
// Invariants: решение без ССЫЛКИ `файл:строка` не записывается: «так принято в репозитории» без
//             адреса это догадка, а не ответ; маршрут — из словаря; круглый рейс сохраняет всё.
// Interface:  ROUTES, newDecision, renderDecisions, parseDecisions

// Маршруты — это ответ на вопрос «кто решил», и он важнее самого решения. `repo` можно проверить
// открыв файл, `frd` означает, что требование дописано, `operator` — что решал человек.
export const ROUTES = Object.freeze(["repo", "frd", "operator"])

const one = (v) => String(v ?? "").replace(/\s*[\r\n]+\s*/g, " · ").trim()

// FUNCTION_CONTRACT: newDecision — одно записанное решение
//   Input:        { question, answer, source, route, why } — вопрос; ответ; ссылка `файл:строка`
//                 либо `frd.xml` / имя оператора; маршрут из ROUTES; одна строка «чем подтверждён»
//   Dependencies: —
//   Antecedent:   проверяется КОДОМ: вопрос и ответ непусты; маршрут из словаря; у маршрута `repo`
//                 ссылка обязана выглядеть как `путь:строка`
//   Consequent:   success: Object — замороженное решение
//                 failure: { error } — с названной причиной; запись «на веру» не делается
//   Purity:       pure
export function newDecision({ question = "", answer = "", source = "", route = "", why = "" } = {}) {
  const d = { question: one(question), answer: one(answer), source: one(source), route: one(route), why: one(why) }
  if (!d.question) return Object.freeze({ error: "решение без вопроса — непонятно, что решено" })
  if (!d.answer) return Object.freeze({ error: `решение «${d.question}» без ответа` })
  if (!ROUTES.includes(d.route)) return Object.freeze({ error: `маршрут «${d.route}» вне словаря: ${ROUTES.join(" · ")}` })
  if (d.route === "repo" && !/[^\s:]+:\d+/.test(d.source)) {
    return Object.freeze({ error: `решение «${d.question}» взято из репозитория без ссылки «файл:строка» — без адреса это догадка, а не ответ` })
  }
  if (!d.source) return Object.freeze({ error: `решение «${d.question}» без источника` })
  return Object.freeze(d)
}

// FUNCTION_CONTRACT: renderDecisions — журнал как текст
//   Input:        list — решения
//   Dependencies: —
//   Antecedent:   любые значения; элемент с `error` пропускается — его не записывали
//   Consequent:   success: string — по блоку на решение, поля построчно
//   Purity:       pure
export function renderDecisions(list = []) {
  const rows = (Array.isArray(list) ? list : []).filter((d) => d && d.question && !d.error)
  return `# Решения\n\n${rows.map((d) => [
    `## ${d.question}`,
    `ответ: ${d.answer}`,
    `опора: ${d.source}`,
    `маршрут: ${d.route}`,
    ...(d.why ? [`чем: ${d.why}`] : []),
  ].join("\n")).join("\n\n")}${rows.length ? "\n" : ""}`
}

// FUNCTION_CONTRACT: parseDecisions — журнал обратно в данные
//   Input:        text — содержимое `.agent/decisions.md`
//   Dependencies: —
//   Antecedent:   любое значение; пустой файл — пустой список, а не отказ
//   Consequent:   success: решения в порядке записи; `parse(render(x))` возвращает `x`
//   Purity:       pure
export function parseDecisions(text = "") {
  const out = []
  const blocks = String(text || "").split(/^## /m).slice(1)
  for (const b of blocks) {
    const lines = b.split("\n")
    const get = (k) => (lines.find((l) => l.startsWith(`${k}: `)) || "").slice(k.length + 2).trim()
    out.push(Object.freeze({
      question: lines[0].trim(),
      answer: get("ответ"), source: get("опора"), route: get("маршрут"), why: get("чем"),
    }))
  }
  return Object.freeze(out)
}
