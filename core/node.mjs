// MODULE_CONTRACT: core/node.mjs — ЧТО ТАКОЕ УЗЕЛ ИЗМЕНЕНИЯ, отвечено один раз на всю полосу
// Purpose:    one decision — у полосы ДВЕ карты, и они отвечают на разные вопросы. Карта роя
//             (`.agent/appgraph.xml`) знает СМЫСЛ: назначение узла, его io, контракты, сьюты — но
//             только там, куда доплатили токенами. Вычисленный граф (`.agent/graph-computed.xml`)
//             знает СУЩЕСТВОВАНИЕ: все файлы, все объявления, все рёбра, и стоит ноль. Пока каждый
//             шаг спрашивал их сам, ответы расходились.
// io:         none
// Invariants: nodeKind TOTAL — любой вход, включая undefined, даёт слово из четырёх и не бросает.
// Interface:  nodeKind({ nodes, paths, created })(path) -> "swarm" | "repo" | "new" | "none"
//             KINDS — те же четыре слова как данные, чтобы сообщения не переписывали их прозой
//
// BUG_FIX_CONTEXT: живой прогон eddi 19.08.2026, три остановки подряд с одним корнем.
//   · `F2` шага 6: «touched не резолвится в узел карты» — на файле, который существует;
//   · `F3` шага 6: «Changed, но ломаться нечему» — входящее ребро есть только в вычисленном графе;
//   · `unknown-node` шага 8: полоса встала МЕЖДУ ДВУМЯ СВОИМИ ЖЕ шагами — шаг 6 узел принял, шаг 8
//     отверг тот же путь.
//   Каждое чинилось отдельно и по-своему: сперва `repoPaths` в steps/intake/frd.mjs, потом `links`
//   там же, потом `repo` в steps/ripple/ripple.mjs. Вопрос один, ответов было четыре.
//
// ПОЧЕМУ ЧЕТЫРЕ СОСТОЯНИЯ, А НЕ ДВА. «Есть в карте / нет в карте» — ложная развилка: она сваливает в
// одну кучу файл, который никто не читал, и путь, которого нет вовсе. Первый — законный узел работы,
// про который известен только путь; второй — выдумка роли. Разные факты требуют разных слов и разных
// последствий: `repo` пропускается правилами существования и МОЛЧИТСЯ правилами смысла (рой не знает,
// кто его зовёт), `none` отвергается всеми.

export const KINDS = Object.freeze({ SWARM: "swarm", REPO: "repo", NEW: "new", NONE: "none" })

// FUNCTION_CONTRACT: nodeKind — чем является путь для ЭТОГО прогона
//   Input:        { nodes — ключи узлов карты роя (steps/intake/map.mjs::parseMap);
//                   paths — пути, известные вычисленному графу (steps/scope/computed.mjs, `decls[].at`);
//                   created — пути, которые СОЗДАЁТ это изменение (`<delta new="yes">`) }
//   Dependencies: —
//   Antecedent:   любые значения; отсутствие каждой карты читается как пусто, а не как «всё»
//   Consequent:   success: функция пути → одно из четырёх слов:
//                          `swarm` — рой читал: известны контракты, io, назначение;
//                          `repo`  — файл существует, рой не читал: известен ПУТЬ и объявления;
//                          `new`   — файла нет, его создаёт это изменение;
//                          `none`  — нет нигде: выдумка
//                 failure: none — тотальна
//   Purity:       pure
//   Interface:    nodeKind({ nodes?, paths?, created? }) -> (path: unknown) => string
//
// ПОРЯДОК ПРОВЕРОК ЗНАЧИМ. `created` идёт ПЕРВЫМ: файла, который изменение создаёт, в репозитории
// быть не должно, и совпадение с существующим путём — это дефект артефакта (его ловит F3 своим
// `new="yes", но файл ЕСТЬ`), а не повод назвать узел существующим. Карта роя идёт раньше
// вычисленного графа: её ответ БОГАЧЕ, и знать, что узел прочитан, важнее, чем что он существует.
export function nodeKind({ nodes = new Set(), paths = new Set(), created = new Set() } = {}) {
  const has = (set, p) => Boolean(set && typeof set.has === "function" && set.has(p))
  return (path) => {
    const p = String(path == null ? "" : path)
    if (!p) return KINDS.NONE
    if (has(created, p)) return KINDS.NEW
    if (has(nodes, p)) return KINDS.SWARM
    if (has(paths, p)) return KINDS.REPO
    return KINDS.NONE
  }
}

// FUNCTION_CONTRACT: pathsOf — пути вычисленного графа как множество
//   Input:        computed — разбор steps/scope/computed.mjs::parseComputed, или что угодно
//   Dependencies: —
//   Antecedent:   любое значение
//   Consequent:   success: Set путей, у которых есть хоть одно объявление; мусор даёт пустое Set
//                 failure: none — тотальна
//   Purity:       pure
//   Interface:    pathsOf(computed: unknown) -> Set<string>
//
// Живёт здесь, а не у каждого вызывающего: три шага собирали это множество тремя разными выражениями
// (`members.keys()`, `decls.map(d => d.at)`, `new Set(...)` в ext) — и расходились на пустом входе.
export function pathsOf(computed) {
  const decls = computed && Array.isArray(computed.decls) ? computed.decls : []
  return new Set(decls.map((d) => d && d.at).filter(Boolean).map(String))
}
