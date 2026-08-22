// MODULE_CONTRACT: flows — шаг 9C: что происходит с данными, когда система работает
// Purpose:    одно решение — ПОКРЫТИЕ: каждый шаг требования и каждое его ветвление закрыты чьим-то
//             шагом потока, у каждого значения ровно один порождающий модуль, каждый код отказа
//             где-то рождается и куда-то доезжает. Порядок РАБОТ отсюда не выводится и выводиться не
//             может: поток цикличен по природе — запрос идёт вниз, ответ вверх (docs/plan.md §0).
// io:         none
// EXTERNAL_DEPENDENCY: steps/plan/tree/tree.mjs — parseTree: модули потока обязаны быть модулями
//             дерева, и список у них ОДИН. Второй разбор дерева здесь означал бы, что поток говорит
//             о модулях, которых в работе нет.
// EXTERNAL_DEPENDENCY: core/xml.mjs — attrs/elem.
// Invariants: `role` — из словаря; значение порождает ровно один модуль; объявление (модель, интерфейс)
//             в потоке не участвует и участвовать не обязано — его доказывает `needs` дерева.
// Interface:  ROLES, flowsSkeleton, treeFor, parseFlows, checkFlows

import { attrs, elem } from "../../../core/xml.mjs"
import { parseTree } from "../tree/tree.mjs"

// Словарь ролей шага. Три слова, и они отвечают на разные вопросы: «здесь значение появилось»,
// «здесь оно прошло насквозь», «здесь поток оборвался кодом отказа».
export const ROLES = Object.freeze(["порождаю", "проношу", "отвергаю"])

// ИМЕНА ИЗ ПРИМЕРА РОЛИ. Роль показывает форму ответа на ЧУЖОЙ задаче — про займы, — и слабая модель
// переписывает эти имена в свой ответ как есть.
// BUG_FIX_CONTEXT: снято curl'ом 21.08.2026. В задаче про глоссарии роль выдала поток со значениями
// «Займ (черновик продления)» и «Займ (продлён, version+1)» — дословно из своего же примера. Запрет
// словами («имена из этого файла не переписывай») модель проигнорировала на следующем же круге:
// пример в форме готового ответа копируется охотнее, чем читается. Просьба не работает — работает
// правило. Список держится ЗДЕСЬ и сверяется с текстом роли швом (steps/plan/flows/role.test.mjs):
// иначе он разъедется с примером, который сторожит.
export const EXAMPLE_NAMES = Object.freeze([
  "Займ (черновик продления)", "Займ (продлён, version+1)", "LOAN_OVERDUE", "409 LOAN_OVERDUE",
  "200 (dueOn)", "POST /loans/{id}/renew (loanId)",
])

const stepsOf = (uc) => (uc.steps || []).map((_, k) => `${uc.id}/${k + 1}`)
const extsOf = (uc) => (uc.exts || []).map((e) => `${uc.id}/${e.id}`)

// FUNCTION_CONTRACT: flowsSkeleton — состав потоков, посчитанный СКРИПТОМ
//   Input:        { frd } — разобранное требование
//   Dependencies: —
//   Antecedent:   любые значения
//   Consequent:   success: { xml, flows, steps } — поток на каждый use case и на каждое его
//                          ветвление; в каждом по строке на шаг требования, и `closes` в них УЖЕ
//                          проставлен. Роль заполняет `module`, `in`, `out`, `role` и вправе
//                          добавить строки с тем же `closes`, если шаг требования проходит через
//                          несколько модулей
//                 failure: none — тотальна
//   Purity:       pure
//
// ПОЧЕМУ `closes` СТАВИТ СКРИПТ. Номер шага — это дословная цитата требования, и роль, набирающая её
// руками, попадает в него не всегда: живой прогон дал `2а` кириллицей там, где FRD писал `2a`
// латиницей, и покрытие стало ложью. Скрипт не ошибается в цифре, роль не тратит на неё внимание.
export function flowsSkeleton({ frd = {} } = {}) {
  const out = []
  let steps = 0
  for (const uc of frd.usecases || []) {
    const rows = stepsOf(uc).map((c, k) => `    <step n="${k + 1}" module="" in="" out="" role="" closes="${c}"/>`)
    steps += rows.length
    out.push(`  <flow id="${uc.id}" uc="${uc.id}" goal="${String(uc.goal || "").replace(/"/g, "&quot;")}">\n${rows.join("\n")}\n  </flow>`)
    for (const e of uc.exts || []) {
      const row = `    <step n="1" module="" in="" out="" role="отвергаю" closes="${uc.id}/${e.id}"/>`
      steps += 1
      out.push(`  <flow id="${uc.id}${e.id}" uc="${uc.id}" branch="${e.id}" goal="${String(e.error || e.outcome || "").replace(/"/g, "&quot;")}">\n${row}\n  </flow>`)
    }
  }
  return Object.freeze({ xml: `<flows task="">\n${out.join("\n")}\n</flows>\n`, flows: out.length, steps })
}

// FUNCTION_CONTRACT: parseFlows — единственный разбор потоков на всю полосу
//   Input:        xml — текст потоков
//   Dependencies: core/xml.mjs
//   Antecedent:   любое значение
//   Consequent:   success: { flows: [{ id, uc, branch, goal, steps: [{ n, module, in, out, role, closes }] }] }
//                 failure: none — тотальна
//   Purity:       pure
export function parseFlows(xml) {
  const flows = []
  for (const f of String(xml || "").matchAll(/<flow\b([^>]*)>([\s\S]*?)<\/flow>/g)) {
    const a = attrs(f[1])
    flows.push(Object.freeze({
      id: a.id || "", uc: a.uc || "", branch: a.branch || "", goal: a.goal || "",
      steps: Object.freeze([...f[2].matchAll(elem("step"))].map((s) => {
        const sa = attrs(s[1])
        return Object.freeze({ n: sa.n || "", module: sa.module || "", in: sa.in || "", out: sa.out || "", role: sa.role || "", closes: sa.closes || "" })
      })),
    }))
  }
  return Object.freeze({ flows: Object.freeze(flows) })
}

// FUNCTION_CONTRACT: treeFor — дерево, суженное до модулей ОДНОГО use case
//   Input:        { tree, frd, uc } — текст дерева; требование; id use case
//   Dependencies: parseTree
//   Antecedent:   любые значения; сценариев у use case нет — возвращается дерево целиком
//   Consequent:   success: текст дерева, где оставлены модули, через которые проходит ЭТОТ use case,
//                          и те, без которых их не написать (их `needs`) — иначе роль не увидит
//                          типов, которые сама же назовёт
//                 failure: none — тотальна
//   Purity:       pure
//
// ДЕРЕВО ЦЕЛИКОМ В КАЖДОМ НАРЯДЕ 9C — 112 441 СИМВОЛ ИЗ 234 647. Измерено на eddi 21.08.2026: семь
// потоков получали все двенадцать модулей, хотя UC1 касается четырёх. Порция видит своё и то, на что
// своё опирается, — остальное для неё шум ровно того рода, который слабая модель читает по диагонали.
export function treeFor({ tree = "", frd = {}, uc = "" } = {}) {
  const src = String(tree || "")
  const blocks = [...src.matchAll(/ {2}<module[\s\S]*?<\/module>/g)].map((m) => m[0])
  if (!blocks.length || !uc) return src

  const own = new Set()
  for (const sc of frd.scenarios || []) {
    if (sc.uc !== uc) continue
    for (const n of String(sc.nodes || "").split(/\s+/).filter(Boolean)) own.add(n)
  }
  if (!own.size) return src

  // ДВА КРУГА ВИДИМОСТИ, А НЕ ОДИН. Модули самого use case едут ЦЕЛИКОМ: по ним роль пишет строки
  // потока. Те, без которых их не написать (`needs`), едут ОДНОЙ СТРОКОЙ — роль про них ничего не
  // пишет, ей нужно только знать, что такой модуль есть и чем он владеет. Полное замыкание съедало
  // выигрыш нарезки: 16 063 → 13 094 симв, то есть почти ничего.
  const { modules } = parseTree(src)
  const near = new Set()
  for (let grew = true; grew;) {
    grew = false
    for (const m of modules) {
      if (!own.has(m.path) && !near.has(m.path)) continue
      for (const n of m.needs) if (!own.has(n.path) && !near.has(n.path)) { near.add(n.path); grew = true }
    }
  }
  const head = src.slice(0, src.indexOf(">") + 1)
  // РОЛИ ПОТОКА НУЖНЫ ТРИ ВЕЩИ: путь, что модуль прячет и что он гарантирует. По ним она называет
  // значения. Образец, сигнатура и `needs` — материал шага 9B; здесь они шум того же рода, что тело
  // файла в наряде дерева, и стоят 6 КБ из 11 на каждый наряд.
  const short = (b) => b
    .replace(/\n\s*<twin[\s\S]*?<\/twin>/g, "")
    .replace(/\n\s*<needs[\s\S]*?<\/needs>|\n\s*<needs\/>/g, "")
    .replace(/\n\s*<sig>[\s\S]*?<\/sig>/g, "")
    .replace(/\n\s*<pre>[\s\S]*?<\/pre>/g, "")
    .replace(/\n\s*<facts>[\s\S]*?<\/facts>/g, "")
    .replace(/<contract>\s*/g, "<contract>")
  const full = blocks.filter((b) => [...own].some((p) => b.includes(`path="${p}"`))).map(short)
  const brief = modules.filter((m) => near.has(m.path)).map((m) =>
    `  <module path="${m.path}" io="${m.io}"${m.owns ? ` owns="${m.owns}"` : ""} brief="через этот use case не проходит; здесь он только для ссылки"/>`)
  return `${head}\n${[...full, ...brief].join("\n")}\n</tree>\n`
}

// FUNCTION_CONTRACT: checkFlows — закрывает ли поток требование, и сходятся ли значения
//   Input:        { text, frd, tree, only, portion, whole } — что роль записала; требование;
//                 ТЕКСТ дерева модулей; `only` — id use case, если судится порция; и два флага
//   Dependencies: parseFlows, parseTree
//   Antecedent:   любые значения; без дерева правило про модули МОЛЧИТ — судить не по чему
//   Consequent:   success: string[] — по блокеру на дефект
//   Purity:       pure
//   Interface:    checkFlows({ text, frd, tree, only, portion, whole }) -> string[]
//
// ПОРЦИЯ — ОДИН USE CASE. Она может ответить за свои шаги и за свои ветвления, и больше ни за что:
// «у значения один порождающий» — свойство ВСЕХ потоков сразу, и порция его не видит.
export function checkFlows({ text = "", frd = {}, tree = "", values = "", only = "", portion = false, whole = false } = {}) {
  const B = []
  const { flows } = parseFlows(text)
  const steps = flows.flatMap((f) => f.steps)
  const known = new Set(parseTree(tree).modules.map((m) => m.path))

  // СЛОВАРЬ ГРАНИЦЫ СУДИТ ГРАНИЦУ, И ТОЛЬКО ЕЁ. Шаг 9A пишет `values.xml` — адреса, статусы, коды
  // отказов, сущности требования, — и до этой правки его не читал НИКТО: подшаг был мёртвым грузом,
  // а роль потока называла те же значения своей рукой, совпадая со словарём только по удаче.
  // Внутренние данные («Glossary (черновик обновления)») в словаре не живут и не судятся им: их
  // судит правило «один порождающий».
  const dict = [...String(values || "").matchAll(/<value\b[^>]*\btext="([^"]*)"/g)].map((m) => m[1]).filter(Boolean)

  if (portion) {
    const uc = (frd.usecases || []).find((x) => x.id === only)
    if (!uc) return [`F0 use case «${only}» требование не знает — судить нечего`]
    const closed = new Set(steps.map((s) => s.closes))
    for (const c of [...stepsOf(uc), ...extsOf(uc)]) {
      if (!closed.has(c)) B.push(`F6 шаг ${c.replace("/", " шаг ")} требования не закрыт ни одной строкой потока — добавь <step closes="${c}" …/> и скажи, какой модуль и что с данными делает`)
    }
    const alien = [...closed].filter((c) => c && !c.startsWith(`${uc.id}/`))
    if (alien.length) B.push(`F6 в этой порции закрыты чужие шаги: ${alien.join(", ")} — порция отвечает за ${uc.id} и только за него`)
  }

  // ГРАНИЦА — ЭТО АДРЕС ИЛИ СТАТУС, А ГОЛЫЙ КОД ОТКАЗА — ВНУТРЕННЕЕ ЗНАЧЕНИЕ. Первая версия правила
  // считала границей и его: `TERM_KEY_INVALID` рождается в хранилище и едет к REST-слою, наружу
  // выходит уже `400 TERM_KEY_INVALID`, и словарь держит только вторую форму. Правило требовало
  // взять из словаря то, чего там нет по построению, — то есть противоречило требованию, из которого
  // сам словарь и собран (поймано сухим прогоном 21.08.2026, до вызова роли).
  const boundary = (v) => /^(GET|POST|PUT|DELETE|PATCH)\s|^\d{3}\b/.test(String(v || "").trim())
  const near = (v) => dict.find((d) => d.toLowerCase().replace(/\s+/g, "") === String(v).toLowerCase().replace(/\s+/g, ""))
  if (dict.length) {
    // Одно значение — один блокер, даже если оно стоит и на входе, и на выходе нескольких строк:
    // роль чинит ЗНАЧЕНИЕ, а не каждое его вхождение, и повтор блокера читается как две находки.
    const said = new Set()
    for (const s of steps) {
      for (const v of [s.in, s.out]) {
        if (!v || !boundary(v) || dict.includes(v) || said.has(v)) continue
        said.add(v)
        const same = near(v)
        B.push(same
          ? `F11 строка ${s.closes}: «${v}» — словарь границы пишет это же значение как «${same}»; перепиши слово в слово`
          : `F11 строка ${s.closes}: «${v}» смотрит наружу, но такого значения нет в словаре границы (.agent/values.xml). Возьми готовое из словаря либо, если это ВНУТРЕННЕЕ значение, назови его так, чтобы оно не выглядело адресом или статусом`)
      }
    }
  }

  // F12 — СТАТУС НЕ ТЕЧЁТ ВНУТРЬ. Запрос идёт ВНИЗ по слоям, ответ поднимается ВВЕРХ, и граничный
  // статус («200 (glossaries)», «400 TERM_KEY_INVALID») — ПОСЛЕДНЕЕ, что происходит: взять его себе
  // на вход не может никто. Внутренний код отказа на входе законен и им остаётся — на нём держится
  // ветка отказа: хранилище рождает `TERM_KEY_INVALID`, REST принимает его и выдаёт наружу «400 …».
  //
  // BUG_FIX_CONTEXT: снято curl'ом с роли 21.08.2026, UC1. Роль написала поток задом наперёд —
  // REST-слой ПЕРВЫМ шагом выдал «200 (glossaries)», а mongo-хранилище взяло этот статус на вход.
  // Все правила были зелены: F8 спрашивает лишь «породил ли это значение кто-то выше», а направление
  // не проверял никто. Развёрнутый поток — это неверный план работ, выданный за верный.
  // F13 — имя из примера роли в ответе. Правило, а не просьба: см. EXAMPLE_NAMES выше.
  {
    const said = new Set()
    for (const s of steps) {
      for (const v of [s.in, s.out]) {
        const hit = EXAMPLE_NAMES.find((e) => String(v || "").trim() === e)
        if (!hit || said.has(hit)) continue
        said.add(hit)
        B.push(`F13 строка ${s.closes}: «${hit}» — это имя из ПРИМЕРА в тексте роли, из чужой задачи про займы. Назови значение сущностью СВОЕЙ задачи: возьми её из дерева модулей или из требования, которые тебе дали, и добавь уточнение в скобках — «<сущность> (черновик создания)»`)
      }
    }
  }

  const status = (v) => /^\d{3}\b/.test(String(v || "").trim())
  for (const s of steps) {
    if (status(s.in)) {
      // БЛОКЕР — ЭТО НАРЯД НА ПРАВКУ, и у него обязан быть ОБРАЗЕЦ строки (standards/guardrail.md).
      // Первая версия писала «либо внутреннее значение, либо строки переставлены» и не показывала
      // ни одной строки: роль трижды подряд получила одну и ту же жалобу и трижды её не поняла —
      // на третий раз она «починила» дефект, добавив ПРОНОС того же статуса. Та же жалоба дважды —
      // дефект ТЕКСТА блокера, а не роли (steps/plan/data-flow.md).
      B.push(`F12 строка ${s.closes}: «${s.in}» стоит на ВХОДЕ, но это граничный статус — ответ наружу, ПОСЛЕДНЕЕ, что происходит; внутрь он не течёт. Статус рождается ОДИН раз, последней строкой, у модуля, который отвечает наружу, и НИКОГДА не проносится. Напиши так: <step module="…/rest/RestX.java" in="<внутреннее значение, которое пришло снизу>" out="${s.in}" role="порождаю" closes="${s.closes}"/> — а строку, которая раньше рождала «${s.in}» раньше времени, отдай тому, кто делает работу, и поставь ей внутреннее значение в out`)
    }
  }

  for (const s of steps) {
    const at = `${s.closes || "?"}`
    if (!s.module) B.push(`F6 строка ${at}: пуст module — назови ПУТЬ модуля, который делает этот шаг`)
    else if (known.size && !known.has(s.module)) B.push(`F6 строка ${at} называет модуль ${s.module}, которого нет в дереве — либо путь другой, либо модуля не хватает дереву`)
    if (!ROLES.includes(s.role)) B.push(`F6 строка ${at}: role="${s.role}" вне словаря — поставь одно из: ${ROLES.join(" · ")}`)
    if (!s.in) B.push(`F6 строка ${at}: пуст in — назови значение, которое приходит: «POST /store (терминыterms)» либо «Glossary (черновик создания)»`)
    if (!s.out) B.push(`F6 строка ${at}: пуст out — назови значение, которое уходит; ничего не поменялось — повтори значение входа и поставь role="проношу"`)
  }

  // У ЗНАЧЕНИЯ ОДИН ПОРОЖДАЮЩИЙ МОДУЛЬ — он может порождать его в нескольких потоках, это то же
  // место в коде. Двое порождающих значат, что одним именем названы разные данные: «Glossary
  // (черновик создания)» и «Glossary (импортированный)» — не одно значение.
  //
  // СУДИТСЯ И НА ПОРЦИИ, И НА ЦЕЛОМ, и это не дублирование.
  // BUG_FIX_CONTEXT: снято curl'ом 21.08.2026, UC2. Роль поставила «порождаю» три раза подряд на
  // одном «Glossary model» — все три модуля внутри ОДНОЙ порции. Правило жило только на целом,
  // поэтому порция была зелена, а находка приехала кругом позже и наряду ЦЕЛОГО: роль чинила своё
  // же нарушение чужим нарядом. Внутри порции оно видно локально — значит и судить его надо там.
  const producers = new Map()
  for (const s of steps) if (s.role !== "проношу" && s.out) producers.set(s.out, new Set([...(producers.get(s.out) || []), s.module]))
  for (const [v, who] of producers) {
    if (who.size > 1) B.push(`F7 значение «${v}» порождают ${who.size} модуля: ${[...who].join(", ")} — либо это РАЗНЫЕ данные и им нужны разные имена, либо один из них его только проносит (role="проношу")`)
  }

  if (!whole) return B

  const external = new Set(flows.flatMap((f) => (f.steps[0] ? [f.steps[0].in] : [])))
  for (const s of steps) {
    if (s.in && !producers.has(s.in) && !external.has(s.in)) B.push(`F8 строка ${s.closes}: «${s.in}» никто не порождает и оно не входит извне — назови шаг, который его делает, либо начни им поток`)
  }

  for (const f of frd.failures || []) {
    const born = steps.find((s) => s.out === f.code && s.role === "отвергаю")
    if (!born) B.push(`F9 код отказа ${f.code} объявлен требованием, но ни одна строка его не порождает — поставь <step out="${f.code}" role="отвергаю" closes="${(f.from || "").split(" ")[0] || "UC?/?a"}"/>`)
    const shown = steps.find((s) => String(s.out || "").startsWith(`${f.status} ${f.code}`))
    if (!shown) B.push(`F9 отказ ${f.code} нигде не превращается в статус ${f.status} — добавь строку out="${f.status} ${f.code}" тому модулю, который отвечает наружу`)
  }

  // ОБЪЯВЛЕНИЕ В ПОТОКЕ НЕ УЧАСТВУЕТ, И ЭТО НЕ ДЕФЕКТ. У модели данных и у интерфейса нет поведения
  // в рантайме — за них работает реализация. Их доказывает ДРУГОЕ отношение: до них дотягивается
  // `needs` от того, кто в потоке есть. Первая версия этой проверки спрашивала с объявления
  // поведение и была неправа ровно тем же, чем старое правило связности (docs/plan.md Ш8).
  const { modules } = parseTree(tree)
  if (modules.length) {
    const inFlow = new Set(steps.map((s) => s.module))
    const reach = new Set(inFlow)
    for (let grew = true; grew;) {
      grew = false
      for (const m of modules) if (reach.has(m.path)) for (const n of m.needs) if (!reach.has(n.path)) { reach.add(n.path); grew = true }
    }
    const mute = modules.map((m) => m.path).filter((p) => !reach.has(p))
    if (mute.length) B.push(`F10 модули ${mute.join(", ")} не работают ни в одном потоке, и до них не дотягивается needs ни от одного участника потока — их работу нечем проверить: либо впиши их в поток, либо покажи, кто их требует`)
  }
  return B
}
