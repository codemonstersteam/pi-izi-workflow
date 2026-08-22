// MODULE_CONTRACT: tree — шаг 9B: какие модули трогает изменение и БЕЗ ЧЕГО каждый из них не написать
// Purpose:    одно решение — состав работы и отношение `needs`. `needs` это не «кто кого зовёт», а
//             «что обязано существовать, чтобы этот файл скомпилировался»: типы, интерфейсы,
//             объявления. Только по нему строится очередь работ, и только он ацикличен по
//             построению — вызовы в слоёной системе образуют круг по природе (docs/plan.md §0).
// io:         none
// EXTERNAL_DEPENDENCY: steps/plan/order.mjs — orderOf, ЕДИНСТВЕННАЯ топологическая сортировка полосы.
//             Её вход здесь — `needs`, а не вызовы; второй сортировщик означал бы, что план и тикеты
//             могут разойтись в порядке работ.
// EXTERNAL_DEPENDENCY: core/xml.mjs — attrs/elem/tokens, один разбор атрибутов на всю полосу.
// Invariants: модуль изменения — это дельта требования ИЛИ узел сценария, третьего пути нет;
//             у каждого типа ровно один владелец; `needs` указывает ПУТЬ, а не имя класса.
// Interface:  modulesOfChange, sampleOf, shapeOf, rankedCandidates, digestOf, frdFor, treeSkeleton, parseTree, checkTree, IO_KINDS

import { attrs, elem, tokens } from "../../../core/xml.mjs"
import { orderOf } from "../order.mjs"

// Словарь `io`. Роль выбирает из него, а не изобретает: слово вне словаря — это отказ, потому что по
// нему шаг 14 подбирает подсказки исполнителю.
export const IO_KINDS = Object.freeze(["none", "http", "db", "file", "queue", "llm"])

const kindOf = (path) => {
  const file = String(path || "").split("/").pop() || ""
  const words = file.replace(/\.[^.]+$/, "").match(/[A-Z][a-z0-9]*/g) || []
  return words.length ? words[words.length - 1] : file.replace(/\.[^.]+$/, "")
}
const dirOf = (path) => String(path || "").split("/").slice(0, -1).join("/")
const tailOf = (path) => String(path || "").split("/").slice(-2, -1)[0] || ""
export const baseOf = (path) => (String(path || "").split("/").pop() || "").replace(/\.[^.]+$/, "")

// ФОРМА ИМЕНИ — ИМЯ БЕЗ СУЩНОСТИ. `IRestGlossaryStore` в каталоге `configs/glossaries` — это
// `IRest*Store`, и его близнец `IRestAgentStore` в `configs/agents` — тоже. А `IAgentStore` это
// `I*Store`, другая форма: интерфейс хранилища, а не внешний адрес. Без этого сравнения eddi выдал
// REST-интерфейсу образцом обычное хранилище — форма важнее рода, потому что род у обоих «Store».
// Сущность узнаётся по КАТАЛОГУ: слово имени, чей корень совпадает с именем каталога, и есть она.
export const shapeOf = (path) => {
  const base = baseOf(path)
  const dirs = String(path || "").split("/").slice(0, -1).map((d) => d.toLowerCase())
  const words = base.match(/[A-Z][a-z0-9]*|[A-Z]+(?![a-z])/g) || [base]
  return words.filter((w) => {
    const stem = w.toLowerCase().replace(/(ies|es|s)$/, "")
    return !dirs.some((d) => d.startsWith(stem) || stem.startsWith(d.replace(/(ies|es|s)$/, "")))
  }).join("*") || base
}
export const isPath = (x) => String(x || "").includes("/") && /\.[A-Za-z0-9]+$/.test(String(x || ""))
const text = (body, tag) => {
  const m = String(body || "").match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`))
  return m ? m[1].trim() : ""
}

// FUNCTION_CONTRACT: modulesOfChange — какие модули трогает изменение
//   Input:        { frd } — разобранное требование
//   Dependencies: core/xml.mjs::tokens
//   Antecedent:   любые значения
//   Consequent:   success: Map path → { node, delta } в порядке появления; дельта известна не у всех —
//                          узел сценария попадает в работу без собственной дельты
//                 failure: none — тотальна
//   Purity:       pure
//
// ДВЕ ДОРОГИ, И ВТОРУЮ ЛЕГКО ЗАБЫТЬ. Модуль входит в работу своей дельтой («меняется вот это») или
// участием в сценарии («через него проходит изменение»). Забыть вторую — значит собрать план, в
// котором про модуль написано, а тикета на него нет; живой шов шага 14 держит ровно этот случай.
export function modulesOfChange({ frd = {} } = {}) {
  const out = new Map()
  for (const d of frd.deltas || []) if (d && d.node) out.set(d.node, { node: d.node, delta: d.form || "", op: d.op || "", to: d.to || "" })
  for (const sc of frd.scenarios || []) for (const n of tokens(sc.nodes)) if (n && !out.has(n)) out.set(n, { node: n, delta: "", op: "", to: "" })
  return out
}

// FUNCTION_CONTRACT: sampleOf — как файл такого рода УЖЕ написан в этом репозитории
//   Input:        path — модуль изменения; map — ТЕКСТ `.agent/appgraph.xml`
//   Dependencies: core/xml.mjs
//   Antecedent:   любые значения
//   Consequent:   success: { kind, path } — `self` (модуль существует) · `twin` (тот же путь для
//                          другой сущности) · `neighbour` (файл того же рода в том же каталоге) ·
//                          `none` (не нашлось, и наряд говорит это вслух)
//                 failure: none — тотальна
//   Purity:       pure
//
// ЗАЧЕМ ОБРАЗЕЦ И ПОЧЕМУ ПУТЁМ, А НЕ ТЕЛОМ. Замерено живым прогоном: дизайнер, получивший ПУТЬ
// близнеца, сам открыл три файла и назвал шесть классов репозитория; без образца та же модель
// написала «CRUD Glossary» и класс без полей. Тело вместо пути — это плата за то, что роль может и
// не открыть.
//
// БЛИЗНЕЦ ИЩЕТСЯ ПО ФОРМЕ ПУТИ. Имя сущности сидит и в каталоге, и в имени класса сразу —
// `glossary/mongo/GlossaryStore` против `snippets/mongo/PromptSnippetStore` различаются дважды, — и
// строгое правило «одно различие» находит на eddi НОЛЬ близнецов. Правило: столько же сегментов,
// ровно один различающийся КАТАЛОГ, и дальше либо тот же род (`Store`), либо тот же последний каталог.
// Кандидаты в близнецы: столько же сегментов, ровно один различающийся каталог, и дальше либо тот же
// род, либо тот же последний каталог. Один разрез на двоих — `sampleOf` выбирает из этого списка,
// `treeSkeleton` по нему же считает семью.
export function rankedCandidates(path, map) {
  const shape = shapeOf(path)
  const kind = kindOf(path)
  // Порядок: та же ФОРМА имени · тот же род · остальные. Форма важнее рода — `IRest*Store` и
  // `I*Store` оба кончаются на «Store», но учат разному.
  return [...candidatesOf(path, map)].sort((a, b) =>
    (shapeOf(b) === shape) - (shapeOf(a) === shape) || (kindOf(b) === kind) - (kindOf(a) === kind))
}

function candidatesOf(path, map) {
  const p = String(path || "")
  const seg = p.split("/")
  const kind = kindOf(p)
  return [...String(map || "").matchAll(elem("module"))].map((m) => attrs(m[1]).path).filter(Boolean).filter((q) => {
    const s = q.split("/")
    if (s.length !== seg.length || q === p) return false
    let diff = 0
    for (let i = 0; i < seg.length - 1; i++) if (s[i] !== seg[i]) diff++
    return diff === 1 && (kindOf(q) === kind || tailOf(q) === tailOf(p))
  })
}

export function sampleOf(path, map, prefer = "") {
  const p = String(path || "")
  const paths = [...String(map || "").matchAll(elem("module"))].map((m) => attrs(m[1]).path).filter(Boolean)
  if (!p) return Object.freeze({ kind: "none", path: "" })
  if (paths.includes(p)) return Object.freeze({ kind: "self", path: p })

  const kind = kindOf(p)
  const twins = candidatesOf(p, map)
  const near = paths.filter((q) => dirOf(q) === dirOf(p) && q !== p)

  // РОД ПЕРЕВЕШИВАЕТ ЗЕРКАЛО, и этот порядок измерен. Близнец того же рода учит больше всего:
  // `PromptSnippetStore` показывает `GlossaryStore` его базовый класс, коллекцию и аннотации. С
  // зеркалом впереди eddi выдал `GlossaryService` резолвер из чужого пакета — образцы разъехались.
  // СЕМЬЯ БЛИЗНЕЦОВ ВЫБИРАЕТСЯ ОДНА НА ВСЁ ИЗМЕНЕНИЕ. У новой сущности рода нет: `Glossary` не
  // совпадает по роду ни с `PromptSnippet`, ни с `AgentConfiguration`, и «первый попавшийся» отдал
  // eddi модель агента вместо модели сниппета — образцы разъехались бы по разным пакетам. `prefer` —
  // каталог, который набрал большинство по всем модулям работы (treeSkeleton), и он перевешивает.
  if (prefer) {
    const mine = twins.filter((q) => q.split("/").includes(prefer))
    if (mine.length) return Object.freeze({ kind: "twin", path: mine.find((q) => shapeOf(q) === shapeOf(p)) || mine.find((q) => kindOf(q) === kind) || mine[0] })
    const nearPrefer = near.filter((q) => q.split("/").includes(prefer))
    if (nearPrefer.length) return Object.freeze({ kind: "neighbour", path: nearPrefer[0] })
  }
  // ФОРМА ПЕРЕВЕШИВАЕТ РОД: `IRest*Store` и `I*Store` кончаются одинаково, но учат разному.
  const shape = shapeOf(p)
  const twinShape = twins.find((q) => shapeOf(q) === shape)
  if (twinShape) return Object.freeze({ kind: "twin", path: twinShape })
  const nearShape = near.find((q) => shapeOf(q) === shape)
  if (nearShape) return Object.freeze({ kind: "neighbour", path: nearShape })
  const twinSame = twins.find((q) => kindOf(q) === kind)
  if (twinSame) return Object.freeze({ kind: "twin", path: twinSame })
  const nearSame = near.find((q) => kindOf(q) === kind)
  if (nearSame) return Object.freeze({ kind: "neighbour", path: nearSame })
  if (twins.length) return Object.freeze({ kind: "twin", path: twins[0] })
  if (near.length) return Object.freeze({ kind: "neighbour", path: near[0] })
  return Object.freeze({ kind: "none", path: "" })
}

// FUNCTION_CONTRACT: frdFor — требование, суженное до того, что нужно ЭТОЙ порции
//   Input:        { xml, modules, uc } — текст frd.xml; модули порции (для 9B) ЛИБО id use case (9C)
//   Dependencies: —
//   Antecedent:   любые значения; ни одного совпадения — возвращается заголовок и общие блоки
//   Consequent:   success: текст FRD, где оставлены цель, поля, отказы, величины и ТОЛЬКО те use case
//                          и дельты, которых порция касается
//                 failure: none — тотальна
//   Purity:       pure
//
// ТРЕБОВАНИЕ ЦЕЛИКОМ В КАЖДОМ НАРЯДЕ — ЭТО 77% ВХОДА ШАГА. Измерено на eddi 21.08.2026: десять
// нарядов шага 9 несут 327 812 символов, из них 253 591 — один и тот же FRD и одно и то же дерево,
// разосланные по кругу. Порции 9B нужны её дельты и те use case, через которые её модули проходят;
// порции 9C — ровно её use case. Общие блоки (поля, отказы, величины) остаются везде: они и есть
// «общие ограничения», без них роль выдумает своё число.
export function frdFor({ xml = "", modules = [], uc = "" } = {}) {
  const src = String(xml || "")
  if (!src.trim()) return ""
  const head = (src.match(/<frd\b[^>]*>/) || ["<frd>"])[0]
  const mine = new Set(modules)

  const scen = [...src.matchAll(/<scenario\b[^>]*\/>/g)].map((m) => m[0])
  const wanted = new Set(uc ? [uc] : [])
  if (!uc) {
    for (const sc of scen) {
      const nodes = (sc.match(/nodes="([^"]*)"/) || ["", ""])[1].split(/\s+/).filter(Boolean)
      if (nodes.some((n) => mine.has(n))) wanted.add((sc.match(/uc="([^"]*)"/) || ["", ""])[1])
    }
  }

  const keep = []
  for (const u of src.matchAll(/<usecase\b[^>]*>[\s\S]*?<\/usecase>/g)) {
    const id = (u[0].match(/id="([^"]*)"/) || ["", ""])[1]
    if (wanted.has(id)) keep.push(u[0])
  }
  // ДЕЛЬТЫ — ТОЛЬКО СВОИ. Порция 9B отбирает их по своим модулям; порция 9C — по узлам сценариев
  // СВОЕГО use case. Первая версия нарезки оставляла все двенадцать: UC3 видел `LlmTask` и
  // `ZipResourceSource`, которых в его сценарии нет, — 2,5 КБ шума на каждый из семи нарядов.
  const nodesOfUc = new Set()
  if (uc) {
    for (const sc of scen) {
      if ((sc.match(/uc="([^"]*)"/) || ["", ""])[1] !== uc) continue
      for (const n of (sc.match(/nodes="([^"]*)"/) || ["", ""])[1].split(/\s+/)) if (n) nodesOfUc.add(n)
    }
  }
  for (const d of src.matchAll(/<delta\b[^>]*\/>/g)) {
    const node = (d[0].match(/node="([^"]*)"/) || ["", ""])[1]
    const want = uc ? (!nodesOfUc.size || nodesOfUc.has(node)) : (!modules.length || mine.has(node))
    if (want) keep.push(d[0])
  }
  for (const sc of scen) {
    const id = (sc.match(/uc="([^"]*)"/) || ["", ""])[1]
    if (wanted.has(id)) keep.push(sc)
  }
  // Общие ограничения едут ВСЕГДА: поля с доменами, коды отказов со статусами, величины.
  for (const re of [/<field\b[^>]*\/>/g, /<failure\b[^>]*\/>/g, /<nfr\b[^>]*\/>/g, /<actor\b[^>]*\/>/g]) {
    for (const m of src.matchAll(re)) keep.push(m[0])
  }
  return `${head}\n${keep.join("\n")}\n</frd>\n`
}

// FUNCTION_CONTRACT: digestOf — полезная нагрузка файла-образца, без его тела
//   Input:        text — исходник образца; { max } — сколько сигнатур брать (по умолчанию 24)
//   Dependencies: —
//   Antecedent:   любое значение; пустой текст даёт пустую выжимку, а не отказ
//   Consequent:   success: { lines, took } — `lines` это ОБЪЯВЛЕНИЯ: аннотации типа, строка самого
//                          типа с extends/implements, поля и сигнатуры методов без тел; `took` —
//                          счёт того, что взято и что отброшено, чтобы наряд сказал это вслух
//                 failure: none — тотальна
//   Purity:       pure
//
// ЧИТАТЬ ВЕСЬ ФАЙЛ ДОРОГО, А НЕ ЧИТАТЬ — ГАДАТЬ. Тело близнеца это 35 КБ из 55 КБ наряда (первый
// живой прогон нового шага, 21.08.2026): оно вытесняет задачу в середину, которую слабая модель
// читает по диагонали. Выжимка из КАРТЫ тоже не годится — там `sig` усечён разведкой до
// «public class X», без `extends` и аннотаций, то есть без единственного, ради чего образец и нужен.
// Поэтому файл читает СКРИПТ и оставляет ровно то, из чего пишется `<sig>`, `<needs>` и `io`:
// объявление типа целиком, его аннотации, поля и сигнатуры методов. Тела, импорты, комментарии и
// вложенные классы отбрасываются, и их число называется — чтобы «выжимка» не притворялась файлом.
export function digestOf(text = "", { max = 24 } = {}) {
  // СИГНАТУРА БЫВАЕТ РАЗОРВАНА НА СТРОКИ, и это не редкость, а норма Java: `throws` уезжает на
  // следующую. Первая версия выжимки искала `)` и `{` в ОДНОЙ строке и потеряла у близнеца ровно
  // `update` и `delete` — те два метода, что несут `@ConfigurationUpdate` на изменяющих операциях,
  // то есть главное соглашение, ради которого образец и берут (сверено с файлом 21.08.2026).
  const raw = String(text || "").split("\n")
  const src = []
  const at = []
  for (let i = 0; i < raw.length; i++) {
    let line = raw[i]
    const from = i + 1
    const open = (t) => (t.match(/\(/g) || []).length - (t.match(/\)/g) || []).length
    while (i + 1 < raw.length && (open(line) > 0 || /\)\s*$/.test(line.trim()) && /^\s*throws\b/.test(raw[i + 1]))) {
      line = `${line.replace(/\s+$/, "")} ${raw[++i].trim()}`
    }
    src.push(line)
    at.push(from)
  }
  const took = { annotations: 0, fields: 0, methods: 0, dropped: 0 }
  const out = []
  let pending = []
  let depth = 0

  // НОМЕР СТРОКИ ЕДЕТ С КАЖДЫМ ОБЪЯВЛЕНИЕМ. Выжимка отвечает на «как здесь пишут такие файлы», но
  // не на всё: имя коллекции стоит в теле конструктора, а правило проверки — в теле метода. С
  // номером роль дочитывает ТОЧЕЧНО (`read` с диапазоном), без него — открывает файл целиком, и мы
  // возвращаемся к 35 КБ в наряде, ради экономии которых выжимка и заведена.
  for (const [k, rawLine] of src.entries()) {
    const raw = rawLine
    const no = at[k]
    const line = raw.trim()
    const opens = (raw.match(/\{/g) || []).length
    const closes = (raw.match(/\}/g) || []).length

    if (!line || line.startsWith("//") || line.startsWith("*") || line.startsWith("/*") || line.startsWith("import ")) {
      depth += opens - closes
      continue
    }
    // Аннотация копится и уезжает вместе с тем, что она украшает: `@ApplicationScoped` без своего
    // класса не говорит ничего.
    if (line.startsWith("@")) { pending.push(`${String(no).padStart(4)}: ${line}`); depth += opens - closes; continue }

    const isType = /\b(class|interface|record|enum)\s+\w/.test(line)
    // ВЛОЖЕННЫЙ ТИП ОТБРАСЫВАЕТСЯ. `AgentConfiguration` держит двенадцать `public static class` —
    // они заняли всю выжимку и не сказали ни слова о том, как этот файл написан.
    if (isType && depth > 0) { took.dropped++; pending = []; depth += opens - closes; continue }
    const isMethod = depth <= 1 && /\)\s*(\{|;|throws)/.test(line) && !line.startsWith("return") && !/^(if|for|while|switch|catch)\b/.test(line)
      && !(depth === 1 && /=/.test(line) && line.indexOf("=") < line.indexOf("("))
    // Поле с инициализатором — всё ещё поле: `Pattern.compile(...)` не делает строку методом.
    const isField = depth === 1 && /;\s*$/.test(line) && /\b(private|protected|public|final|static)\b/.test(line)
      && (!line.includes("(") || line.indexOf("=") > 0 && line.indexOf("=") < line.indexOf("("))

    if (isType || isMethod || isField) {
      if (out.length < max) {
        out.push(...pending, `${String(no).padStart(4)}: ${line.replace(/\s*\{\s*$/, "")}`)
        took.annotations += pending.length
        if (isMethod) took.methods++
        else if (isField) took.fields++
      } else took.dropped++
    } else if (line !== "}" && depth > 0) took.dropped++
    pending = []
    depth += opens - closes
  }
  return Object.freeze({ lines: Object.freeze(out), took: Object.freeze(took) })
}

// FUNCTION_CONTRACT: treeSkeleton — состав дерева, посчитанный СКРИПТОМ до всякой роли
//   Input:        { frd, ripple, map } — требование, рябь (объявления задетых модулей), карта
//   Dependencies: modulesOfChange, sampleOf, core/xml.mjs
//   Antecedent:   любые значения; пустое требование даёт пустой скелет, а не отказ
//   Consequent:   success: { xml, modules } — по `<module>` на модуль изменения; заполнены `path`,
//                          `delta`, близнец и блок `<facts>` с объявлениями из ряби. Роль дописывает
//                          `hides`, `io`, `owns`, `needs`, `contract` — и только их
//                 failure: none — тотальна
//   Purity:       pure
//
// СКЕЛЕТ ПИШЕТ СКРИПТ, РОЛЬ ДОПИСЫВАЕТ В РАЗМЕЧЕННОЕ. Слабая модель, переписывающая файл целиком
// ради одной строки, теряет остальное — живой прогон 7f3a8431 стёр 15 дельт. Всё, что можно
// посчитать, посчитано здесь, и роли остаётся ровно её работа.
export function treeSkeleton({ frd = {}, ripple = "", map = "" } = {}) {
  const mods = [...modulesOfChange({ frd }).values()]
  const facts = new Map()
  for (const m of String(ripple || "").matchAll(/<module\b([^>]*)>([\s\S]*?)<\/module>/g)) {
    const a = attrs(m[1])
    if (a.path) facts.set(a.path, m[2])
  }
  // СЕМЬЮ БЛИЗНЕЦОВ НАЗЫВАЕТ ТРЕБОВАНИЕ, А ЕСЛИ МОЛЧИТ — ПОКРЫТИЕ. Голосование по уже сделанному
  // выбору бесполезно: оно голосует за произвольного первого. Поэтому считаются ВСЕ кандидаты
  // каждого модуля, и семья, которую требование называет своими словами («по образцу snippets»),
  // перевешивает: это ответ автора требования, а не догадка формы пути.
  const said = [String(frd.goal || ""), ...(frd.deltas || []).map((d) => `${d.op} ${d.to}`), ...(frd.usecases || []).map((u) => u.goal)].join(" ").toLowerCase()
  const score = new Map()
  for (const m of mods) {
    const seg = m.node.split("/")
    for (const q of candidatesOf(m.node, map)) {
      const s2 = q.split("/")
      for (let i = 0; i < s2.length - 1; i++) if (s2[i] !== seg[i]) score.set(s2[i], (score.get(s2[i]) || 0) + 1)
    }
  }
  for (const [seg, n] of score) if (said.includes(seg.replace(/s$/, ""))) score.set(seg, n + 100)
  const top = [...score].sort((a, b) => b[1] - a[1])[0]
  const family = top && top[1] > 1 ? top[0] : ""

  const body = mods.map((m) => {
    const twin = sampleOf(m.node, map)
    // ОБРАЗЕЦ ВЫБИРАЕТ РОЛЬ, А СКРИПТ ПРЕДЛАГАЕТ. У новой сущности рода нет: `Glossary` не совпадает
    // ни с `PromptSnippet`, ни с `AgentConfiguration`. Три формулы выбора — «первый попавшийся»,
    // «большинство по кандидатам» и «слово из требования» — дали на eddi ТРИ РАЗНЫХ ответа
    // (agents, descriptors, snippets), причём третья поймала слово «descriptor», стоявшее в
    // требовании по другому поводу. Это суждение, а не вычисление: кандидатов кладёт скрипт,
    // одного из них называет роль, и гардрейл требует, чтобы имя было названо.
    const offer = [...new Set([twin.path, ...candidatesOf(m.node, map)])].filter(Boolean).slice(0, 5)
    const own = facts.get(m.node) || ""
    const decls = [...own.matchAll(elem("decl"))].map((d) => d[0]).slice(0, 12)
    const apis = [...own.matchAll(elem("api"))].map((d) => d[0]).slice(0, 8)
    return [
      `  <module path="${m.node}" delta="${m.delta || "Changed"}" io="">`,
      `    <hides></hides>`,
      `    <owns type=""/>`,
      `    <twin kind="${twin.kind}" path="${twin.kind === "self" ? twin.path : ""}" candidates="${offer.join(" ")}"></twin>`,
      `    <needs></needs>`,
      `    <contract><sig></sig><pre></pre><post></post><fail></fail></contract>`,
      ...(decls.length || apis.length ? [`    <facts>`, ...[...decls, ...apis].map((x) => `      ${x}`), `    </facts>`] : []),
      `  </module>`,
    ].join("\n")
  })
  const xml = `<tree task="" goal="${String(frd.goal || "").replace(/"/g, "&quot;")}">\n${body.join("\n")}\n</tree>\n`
  return Object.freeze({ xml, modules: mods.length })
}

// FUNCTION_CONTRACT: parseTree — единственный разбор дерева на всю полосу
//   Input:        xml — текст дерева
//   Dependencies: core/xml.mjs
//   Antecedent:   любое значение; не-XML даёт пустой список, а не бросок
//   Consequent:   success: { modules: [{ path, delta, io, hides, owns, twin, needs, contract }] }
//                          `needs` — [{ path, why }]; `contract` — { sig, pre, post, fail }
//                 failure: none — тотальна
//   Purity:       pure
export function parseTree(xml) {
  const modules = []
  for (const m of String(xml || "").matchAll(/<module\b([^>]*)>([\s\S]*?)<\/module>/g)) {
    const a = attrs(m[1])
    const body = m[2]
    const contract = (body.match(/<contract>([\s\S]*?)<\/contract>/) || ["", ""])[1]
    modules.push(Object.freeze({
      path: a.path || "",
      delta: a.delta || "",
      io: a.io || "",
      hides: text(body, "hides"),
      owns: (body.match(/<owns\b[^>]*\btype="([^"]*)"/) || ["", ""])[1],
      twin: (body.match(/<twin\b[^>]*\bpath="([^"]*)"/) || ["", ""])[1],
      candidates: Object.freeze(((body.match(/<twin\b[^>]*\bcandidates="([^"]*)"/) || ["", ""])[1] || "").split(/\s+/).filter(Boolean)),
      needs: Object.freeze([...body.matchAll(/<need\b([^>]*)\/>/g)].map((n) => {
        const na = attrs(n[1])
        return Object.freeze({ path: na.path || "", why: na.why || "" })
      })),
      contract: Object.freeze({
        sig: text(contract, "sig"), pre: text(contract, "pre"),
        post: text(contract, "post"), fail: text(contract, "fail"),
      }),
    }))
  }
  return Object.freeze({ modules: Object.freeze(modules) })
}

// FUNCTION_CONTRACT: checkTree — написала ли роль ЭТО дерево, всё и ничего лишнего
//   Input:        { text, mine, family, known, frd, portion, whole } — что роль записала; модули ЕЁ
//                 порции; модули всей работы (сосед по `needs` живёт в другой порции и в
//                 репозитории его нет — он новый); пути, которые репозиторий уже знает; требование
//                 для суда состава; и два флага, разделяющие правила порции и правила целого
//   Dependencies: parseTree, modulesOfChange, orderOf
//   Antecedent:   любые значения
//   Consequent:   success: string[] — по блокеру на дефект, пустой массив значит зелено
//   Purity:       pure
//   Interface:    checkTree({ text, mine, family, known, frd, portion, whole }) -> string[]
//
// ПОРЦИЯ И ЦЕЛОЕ СУДЯТСЯ РАЗНЫМИ ПРАВИЛАМИ, И КАЖДОЕ РОВНО ОДИН РАЗ.
//   порция: раздел на каждый её модуль · чужих нет · у каждого секрет, `io`, контракт · `needs` это
//           ПУТЬ. Всё это роль решает в момент написания и в этот же момент должна услышать.
//   целое:  состав против требования · `needs` ацикличен · один владелец типа. Порция этого знать не
//           может: сосед по `needs` лежит в другой порции, а состав — свойство всей работы.
export function checkTree({ text = "", mine = [], family = [], known = [], frd = {}, portion = false, whole = false } = {}) {
  const B = []
  const { modules } = parseTree(text)
  const said = modules.map((m) => m.path)
  const kin = family.length ? family : mine

  if (whole) {
    const want = [...modulesOfChange({ frd }).keys()]
    const lost = want.filter((p) => !said.includes(p))
    const extra = said.filter((p) => !want.includes(p))
    if (lost.length) B.push(`T1 состав: требование трогает модули, которых в дереве нет: ${lost.join(", ")} — на каждую дельту и каждый узел сценария нужен свой <module path="…">`)
    if (extra.length) B.push(`T1 состав: в дереве есть модули, которых требование не трогает: ${extra.join(", ")} — убери их либо впиши узел в <scenario nodes> требования`)

    const owners = new Map()
    for (const m of modules) if (m.owns) owners.set(m.owns, [...(owners.get(m.owns) || []), m.path])
    for (const [type, who] of owners) {
      if (who.length > 1) B.push(`T4 тип «${type}» объявлен собственностью ${who.length} модулей: ${who.join(", ")} — владелец один; у остальных сними <owns type=""/> и впиши владельца в <needs>`)
    }
    for (const m of modules) {
      // ВЛАДЕЛЕЦ НАЗЫВАЕТ СВОЙ ТИП — НО ТОЛЬКО ЕСЛИ ФАЙЛ НОВЫЙ. У изменяемого модуля объявление уже
      // лежит в репозитории, а `<sig>` показывает ДЕЛЬТУ: «+ private List&lt;URI&gt; glossaries».
      // Требовать там имени класса значит требовать переписать существующий файл целиком — сухой
      // прогон 21.08.2026 поймал это на эталонном пакете, и неправо было правило.
      if (m.owns && m.delta === "Added" && !m.contract.sig.includes(m.owns)) B.push(`T4 модуль ${m.path} владеет типом «${m.owns}», но его сигнатура этого типа не называет — либо впиши тип в <sig>, либо владелец не он`)
    }
    // ИМЯ ТИПА ПИШЕТСЯ ВЕЗДЕ ОДИНАКОВО. Сверяются только имена, которые уже есть в дереве: если
    // сигнатура называет `Glossarystore`, а модуль зовётся `GlossaryStore.java`, разъехалось имя, а
    // не проект. Сравнение точное, регистр значим — иначе правило судит язык, а не текст.
    const bases = new Map(said.map((p) => [baseOf(p).toLowerCase(), baseOf(p)]))
    for (const m of modules) {
      for (const w of new Set(m.contract.sig.match(/\b[A-Z][A-Za-z0-9]{2,}\b/g) || [])) {
        const right = bases.get(w.toLowerCase())
        if (right && right !== w) B.push(`T4 сигнатура ${m.path} называет «${w}», а модуль дерева зовётся «${right}» — одно имя, одно написание`)
      }
    }

    const sections = modules.map((m) => ({ path: m.path, calls: m.needs.map((n) => n.path).filter((p) => said.includes(p)) }))
    const { cycle } = orderOf({ sections, modules: new Map(said.map((p) => [p, {}])), edges: [] })
    if (cycle.length) B.push(`T3 отношение needs замкнуто в круг: ${cycle.join(" → ")} — «без чего меня не написать» кругов не имеет: один из них зависит не от объявления, а от вызова; сними это <need> и опиши связь словами в <hides>`)
    return B
  }

  const lost = mine.filter((p) => !said.includes(p))
  if (lost.length) B.push(`T5 нет решения по модулям: ${lost.join(", ")} — у каждого модуля порции свой <module path="…">`)
  const alien = said.filter((p) => !mine.includes(p))
  if (alien.length) B.push(`T5 решены модули не из этой порции: ${alien.join(", ")} — их решает свой вызов; соседа читают в блоке NEIGHBOURS, но <module> по нему не пишут`)

  for (const m of modules) {
    if (!m.hides) B.push(`T5 у модуля ${m.path} пуст <hides> — назови ОДНО решение, которое он прячет: «как глоссарий хранится: коллекция, версионирование, где проверяется ключ»`)
    if (!IO_KINDS.includes(m.io)) B.push(`T5 у модуля ${m.path} io="${m.io}" — слово вне словаря; поставь одно из: ${IO_KINDS.join(" · ")}`)
    if (!m.twin) B.push(`T5 у модуля ${m.path} не назван образец — выбери ОДИН путь из candidates и впиши его в <twin path="…">: по нему исполнитель узнаёт базовый класс, аннотации и стиль`)
    if (!m.contract.sig) B.push(`T5 у модуля ${m.path} пуста <sig> — выпиши объявление так, как его напишет исполнитель: «public interface IGlossaryStore extends IResourceStore&lt;Glossary&gt;»`)
    if (!m.contract.pre) B.push(`T5 у модуля ${m.path} пуст <pre> — что обязано быть верным на входе; предусловия нет — так и напиши: «нет — это объявление»`)
    if (!m.contract.post) B.push(`T5 у модуля ${m.path} пуст <post> — что он гарантирует, со ссылкой на шаг требования: «create → id и version 1 (UC2/3)»`)
    for (const n of m.needs) {
      if (!isPath(n.path)) B.push(`T2 в <needs> модуля ${m.path} стоит «${n.path}» — это не путь; напиши ПУТЬ файла: <need path="src/main/java/…/Glossary.java" why="параметр типа"/>`)
      else if (!kin.includes(n.path) && !known.includes(n.path)) B.push(`T2 модуль ${m.path} требует ${n.path} — такого файла нет ни среди модулей работы, ни в репозитории`)
      if (isPath(n.path) && !n.why) B.push(`T2 <need path="${n.path}"> модуля ${m.path} без why — скажи одной строкой, ЧТО оттуда нужно: why="параметр типа IResourceStore&lt;Glossary&gt;"`)
    }
  }
  return B
}
