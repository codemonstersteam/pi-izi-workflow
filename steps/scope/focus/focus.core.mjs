// MODULE_CONTRACT: focus — which cells the swarm surveys, decided BEFORE the swarm runs
// Purpose:    one decision — the focus of the run: every cell of the plan while the plan fits the
//             reader's window, and the cones the BRD's anchors NAME once it does not. The decision
//             costs zero tokens and happens before step 4, which is the whole point: today the
//             pipeline learns "the map does not fit" at step 6, having already paid 306 scout calls
//             and ≈10M input tokens for the answer (docs/big-projects-problems.md §2).
// io:         none
// Invariants: total — any input, including undefined, yields a Result; a chosen focus never names a
//             cell the plan does not carry; the spine cell is in every focus; the estimate is
//             the map's own arithmetic over nodes AND edges, and cells are taken WHOLE; what did not fit is COUNTED
//             and returned, never silently absent.
// Interface:  names(anchor, path) -> boolean   — the anchor→file rule of THIS step
//             isHomeDir(dir, subject) -> boolean — one directory IS the subject's package
//             homeOf({ subject, spread }) -> string — the subject's home PACKAGE, or ""
//             coverageOf({ anchors, cellOf, slices, taken, chosen, spread }) -> { covered, uncovered }
//             checkFocus({ focus, anchors }) -> blockers[]
//             newFocus({ slices, anchors, spread, cells, edges, cap }) -> Result<Focus, …>
//
// `spread` IS `.agent/anchors.json` PARSED — the map of the walk, written by steps/brd/spread/spread.mjs at
// step 2 with a grep over the TEXT of the tree, and read here rather than recomputed:
//   { files, marked[], anchors: [{ word, files[], packages: { dir: n }, share }],
//     analogue: { word, files[], packages } | null }
// It is an OPTIONAL operand and every use of it is silent when it is absent: no artifact at all, an
// `analogue: null` (the BRD said `analogue: none`) and an empty `anchors[]` are three legal inputs,
// and under each of them this module decides by the anchors alone exactly as it did before the
// artifact existed. Absence is a case, not a refusal (standards/code.md §2).

import { ok, err } from "../../../core/result.mjs"
import { MAP_CAP_BYTES, MAP_PRICE, MAP_EST_SLACK } from "../../intake/map.mjs"
import { DECL_CAP } from "../../graph/graph.mjs"

// names — the anchor rule of step 3b, and it is NOT the anchor rule of step 3.
//
// Step 3 MARKS a file when the anchor's text occurs anywhere in it (ext/index.mjs::hitsFor, a
// substring of the whole file). That is right for marking: a mention is a mention. It is wrong for
// CHOOSING, and a live run proved it rather than an argument — run e90d9ce1 on eddi, where the BRD's
// anchors were `glossary · GlossaryConfiguration · eddi://ai.labs.glossary · export · import`:
//   · `import` is a java KEYWORD. Every java file opens with a block of them, so the anchor marked
//     essentially the whole repository and named 83 of the 84 entries — the choice degenerated into
//     "everything", which is the state step 3b exists to end;
//   · the three anchors that mean the actual work (`glossary`, …) matched nothing at all, because the
//     type does not exist yet. Correct, and orthogonal.
// So the anchor must NAME the file — and the name of a file is its PATH. The comparison is
// case-insensitive because an anchor is a word from a REQUIREMENT (`export`) while a path is code
// (`IRestExportService.java`): one word, two conventions.
//
// Matching the api and decl NAMES a file declares as well was written and then removed: on the only
// evidence there is — the anchors of run e90d9ce1 over the whole eddi tree — it selected the same
// two cones as the path alone. Code with no measurement behind it is not a safeguard, it is surface
// area. The trigger to bring it back is a run where an anchor names an endpoint (`GET /fruits`) that
// no path carries.
//
// An empty anchor is refused rather than allowed to match: `"".includes("")` is true, so an empty
// string would name the entire repository — the very failure this rule exists to end.
//
// This is the split docs/survey-plan.md §1 asked for out loud: an anchor MARKS a file (step 3, by
// its text) and NAMES a slice (step 3b, by its path). Two roles of one value, now two rules.
export function names(anchor, path) {
  const a = String(anchor == null ? "" : anchor).trim().toLowerCase()
  if (!a) return false
  return String(path == null ? "" : path).toLowerCase().includes(a)
}

const kb = (n) => `${Math.round(n / 1024)} КБ`

// ДОМ ПРЕДМЕТА — КАТАЛОГ, НАЗВАННЫЙ ПРЕДМЕТОМ, а не содержащий это слово. Правило живёт здесь одно
// на весь модуль: по нему выбирает клетку фаза дома в `newFocus` и по нему же называет пакет
// `coverageOf`. Единственная вольность — множественное число: пакет `configs/agents/` и есть дом
// предмета `agent`.
//
// BUG_FIX_CONTEXT: первая редакция сверяла каталог тем же `names` (вхождение подстроки), и домом
//   якоря `agent` на eddi оказался `docs/your-first-agent/` — две страницы документации, дешевле
//   тринадцатифайлового `configs/agents`. Ход, купленный дому, ушёл в документацию.
const homeWord = (a) => String(a || "").trim().toLowerCase().replace(/(es|s)$/, "")
export const isHomeDir = (d, a) => homeWord(d) === homeWord(a) && Boolean(homeWord(a))

// FUNCTION_CONTRACT: homeOf — какой ПАКЕТ дерева и есть дом предмета
//   Input:        { subject — слово BRD; spread — разобранный `.agent/anchors.json` или null }
//   Dependencies: isHomeDir
//   Antecedent:   любые значения; артефакта нет, якоря нет, пакетов нет → пустая строка
//   Consequent:   success: путь пакета, чей последний сегмент НАЗВАН предметом и в котором помечено
//                          больше всего файлов; "" — такого пакета нет, и это законный ответ
//                          (`Glossary` до его создания, `PromptSnippet` в пакете `snippets`)
//                 failure: none — тотальна
//   Purity:       pure
//   Interface:    homeOf({ subject, spread }) -> string
//
// ПЛОТНОСТЬ БЕРЁТСЯ ИЗ АРТЕФАКТА, а не пересчитывается по клеткам: счёт ПОМЕЧЕННЫХ грепом по тексту
// файлов на каталог — та же величина, которой шаг 3 режет клетки. Из нескольких домов выбирается
// ПЛОТНЕЙШИЙ, а не самый дешёвый и не самый короткий путь: `configs/agents` — дом предмета `agent`,
// `engine/runtime/client/agent` — сосед, у которого случился такой подкаталог.
//
// СЧИТАЕТСЯ ПО `files`, А `packages` — ЗАПАСНОЙ ВХОД. `packages` артефакта это СВОДКА: шаг 2 режет её
// до десяти строк, чтобы она влезла в наряд целиком.
//
// BUG_FIX_CONTEXT: eddi, `component-tests/etalon-eddi/.agent/anchors.json` 23.08.2026. В десятку
//   пакетов предмета `agent` (895 файлов) вошли `docs` 55, тестовые пакеты и `planning` — а дом,
//   `configs/agents` с пятью помеченными файлами, не вошёл, и строка покрытия по дому исчезала ровно
//   там, ради чего писалась. Полный список `files` в артефакте есть всегда; сводка — производная.
export function homeOf({ subject = "", spread = null } = {}) {
  const word = String(subject || "").trim()
  if (!word) return ""
  const list = (spread && Array.isArray(spread.anchors) ? spread.anchors : []).filter(Boolean)
  const mine = list.find((a) => String(a.word || "").trim().toLowerCase() === word.toLowerCase())
  const files = mine && Array.isArray(mine.files) ? mine.files : []
  let counts = mine && mine.packages && typeof mine.packages === "object" ? mine.packages : {}
  if (files.length) {
    counts = {}
    for (const f of files) {
      const dir = String(f || "").split("/").slice(0, -1).join("/")
      if (dir) counts[dir] = (counts[dir] || 0) + 1
    }
  }
  let best = "", n = -1
  for (const [dir, count] of Object.entries(counts)) {
    if (!String(dir).split("/").some((seg) => isHomeDir(seg, word))) continue
    const c = Number(count) || 0
    if (c > n || (c === n && String(dir) < best)) { best = String(dir); n = c }
  }
  return best
}

// ФАЙЛЫ АНАЛОГА ЧИТАЮТСЯ, А НЕ ВЫЧИСЛЯЮТСЯ. Это единственная точка входа к ним в модуле.
const analogueFilesOf = (spread) => {
  const a = spread && spread.analogue
  return a && Array.isArray(a.files) ? [...new Set(a.files.map((p) => String(p || "")).filter(Boolean))] : []
}

// FUNCTION_CONTRACT: newFocus — the run's focus, chosen and declared
//   Input:        slices  — [{ id, entry, kind, nodes }] as newSlices returns them
//                 orphans — [string], the nodes no cone reached
//                 anchors — [string], the BRD's anchors (plan.subjects) — NAMES, not paths
//                 spread  — разобранный `.agent/anchors.json` (шаг 2): файлы каждого якоря, их
//                           пакеты с плотностью и ОТДЕЛЬНО файлы аналога. Операнд необязательный:
//                           нет артефакта, `analogue: null` и пустой `anchors[]` — три законных
//                           входа, под каждым фаза розеток и дом предмета МОЛЧАТ
//                 cells   — the plan's cells: [{ id, kind, files: [{ path }] }]
//                 edges   — [{ from, to }] of graph-computed.xml: the estimate prices them, because
//                           on a monolith they are the larger half of the map
//                 decls   — { path -> count } and apis — { path -> count }, from the same computed
//                           facts; the estimate prices what the map will carry, not an average
//                 cap     — the reading ceiling; MAP_CAP_BYTES when absent
//   Dependencies: ok, err (core/result.mjs), names, isHomeDir, analogueFilesOf, coverageOf, kb
//   Antecedent:   any values; missing ones read as empty. `cells` empty is the "no plan" case, not
//                 an empty focus
//   Consequent:   success: { why, chosen, cells, files, estBytes, dropped, covered, uncovered,
//                          slices, entries } where `why` is "whole-plan" | "anchors", `chosen` the
//                          slice ids taken, `dropped` — { slices, cells } — what the ceiling left
//                          out, and `covered`/`uncovered` — coverageOf's verdict per subject
//                 failure: "no-plan"   — step 3 left no cells
//                          "no-entry"  — the plan does not fit and not one entry exists
//                          "no-anchor" — entries exist, and not one of them is NAMED by an anchor:
//                                        there is nothing to narrow BY, and the repair is the BRD's
//                                        anchors, not a choice among 84 candidates
//                          "over-cap"  — even the cheapest named cone does not fit beside the spine
//   Purity:       pure
//   Interface:    newFocus({ slices, anchors, spread, cells, edges, cap }) -> Result
//
// WHY NO QUESTION TO THE OPERATOR, and the two reasons are not the same reason.
//
// The first shape of this module asked one: over the ceiling it returned err("ask") with a list of
// candidate slices, and the operator answered by number. Run e90d9ce1 showed that shape was BROKEN —
// every one of the twelve candidates it offered was priced at 685-689 KB, because the estimate of
// any choice also carried every anchor-marked orphan, and the orphans were the whole cost. No answer
// could change the total: the question was unanswerable by construction.
//
// That defect alone did NOT force the rail's removal — it was downstream of the anchor rule above,
// and with `names` in place those same anchors select two cones and 43 KB, which a question could
// have offered. The rail is gone because the operator decided the step must choose without asking.
// Recorded as two facts rather than one story, because a defect and a decision age differently.
//
// What keeps a choice from being a default (standards/code.md §3) is that its ORDER is stated —
// cheapest named cone first, so the map covers as many named entries as the ceiling allows — and
// that everything which did not fit is COUNTED in `dropped`, carried into `<focus>` by step 5 and
// printed in the run's log. An anchor whose files ended outside comes back as `found="outside"` in
// the map, so step 6's role meets an honest Unknown instead of a guess.

// FUNCTION_CONTRACT: coverageOf — какие предметы требования прочитаны, а какие нет, и почему
//   Input:        { anchors — слова BRD (`subjects[]`); cellOf — Map<путь, клетка>; slices — срезы;
//                   taken — Set взятых клеток; chosen — взятые срезы;
//                   spread — разобранный `.agent/anchors.json` или null }
//   Dependencies: names (тот же матчер, каким срез и клетка ВЫБИРАЮТСЯ — один ответ, не два), homeOf
//   Antecedent:   любые значения; пустые якоря дают два пустых списка
//   Consequent:   success: { covered, uncovered } — каждый непустой якорь ровно в ОДНОМ из списков.
//                          У предмета, чей ДОМ известен, вердикт выносится по дому: взят хотя бы один
//                          его файл — `covered`, ни одного — `uncovered` с `why:"home"`. Обе строки
//                          несут `home` (пакет), `homeFiles` (сколько его файлов в плане) и
//                          `homeTaken` (сколько из них прочитает рой) — «дом `configs/agents` 13/13».
//                          Дома нет (нет артефакта, нет пакета с таким именем) — вердикт прежний, по
//                          слову: `covered` — взята хотя бы одна клетка предмета;
//                          `uncovered` с `why:"cap"` — файлы предмета в репозитории ЕСТЬ, но ни одна
//                          их клетка не влезла; с `why:"none"` — предмет не называет ничего, и это
//                          нормально для типа, которого ещё нет (`glossary` до его создания)
//                 failure: none — тотальна
//   Purity:       pure
//
// ПОКРЫТИЕ НАЗЫВАЕТСЯ ПО ДОМУ ПРЕДМЕТА, А НЕ ПО СЛОВУ.
//
// BUG_FIX_CONTEXT: тот же проигрыш eddi 19.08.2026, прочитанный до конца. Строка «взято 2, отброшено
//   21» честна и всё равно не отвечает на единственный вопрос, который внизу полосы задают: ТОТ ли
//   модуль прочитан. `agent` числился покрытым двумя случайными клетками (`engine/rest/RestAgentSetup`
//   и readiness-тест), а `configs/agents` — пакет, где живёт носитель требования R6
//   `AgentConfiguration.java`, — лежал среди отброшенных, и назвать его было нечем: счёт по слову не
//   знает, какой из 52 каталогов дом. Плотность из `.agent/anchors.json` знает, и «дом
//   `configs/agents` 0/13» краснеет глазами оператора там, где «взято 2» выглядело работой.
//
// BUG_FIX_CONTEXT: живой прогон eddi 19.08.2026. `focus.json`: `chosen:["s242"]`,
//   `dropped:{slices:30, cells:66}` — и НИ СЛОВА о том, что среди выброшенного лежал предмет `agent`,
//   названный `subjects[]` и требованием R3 («Glossary — reference в agent config»). 22 среза несли
//   `agent` в пути. Молчание стоило трёх остановок внизу полосы: роль спрашивала у оператора путь
//   AgentConfiguration.java, F2/F3/F8 краснели на существующем файле, шаг 8 встал `unknown-node`.
//   Потолок чтения при этом прав — брать всё нельзя; неправо было МОЛЧАНИЕ.
export function coverageOf({ anchors = [], cellOf = new Map(), slices = [], taken = new Set(), chosen = [], spread = null } = {}) {
  const covered = [], uncovered = []
  const takenCells = taken instanceof Set ? taken : new Set()
  const chosenIds = new Set((chosen || []).map((s) => (s && s.id) || s).filter(Boolean))
  const paths = [...(cellOf instanceof Map ? cellOf.keys() : [])]
  for (const raw of anchors || []) {
    const a = String(raw || "").trim()
    if (!a) continue
    // Дом считается по ПЛАНУ, а не по помеченным файлам: рой читает клетки, и «13/13» — это файлы
    // пакета, которые в фокус попали, из тех, что в плане вообще есть.
    const dir = homeOf({ subject: a, spread })
    const homeFiles = dir ? paths.filter((p) => String(p).startsWith(`${dir}/`)) : []
    const homeTaken = homeFiles.filter((p) => takenCells.has(cellOf.get(p))).length
    const files = paths.filter((p) => names(a, p))
    const cells = new Set(files.map((p) => cellOf.get(p)).filter(Boolean))
    const named = (slices || []).filter((x) => x && names(a, x.entry))
    const mine = [...cells].filter((c) => takenCells.has(c))
    const cones = named.filter((x) => chosenIds.has(x.id))
    // ВЗЯТОЕ И ОТБРОШЕННОЕ НАЗЫВАЮТСЯ ВМЕСТЕ, и это не украшение отчёта.
    //
    // BUG_FIX_CONTEXT: проигрыш живого прогона eddi 19.08.2026 опроверг первую редакцию этого
    //   правила. `agent` числился ПОКРЫТЫМ — две клетки взяты, — а модуль, о котором написано
    //   требование R3 (`configs/agents/model/AgentConfiguration.java`), лежал среди отброшенных.
    //   Покрытие «по слову» ничего не говорит о том, ТОТ ли модуль прочитан: предмет из десятков
    //   файлов покрывается одним и выглядит закрытым. Поэтому строка несёт обе величины, и «взято 2,
    //   отброшено 21» читается как «предмет затронут, но прочитан НЕ ВЕСЬ».
    const lost = [...cells].filter((c) => !takenCells.has(c)).length
    const lostCones = named.filter((x) => !chosenIds.has(x.id)).length
    const line = { subject: a, cells: mine.length, slices: cones.length, droppedCells: lost, droppedSlices: lostCones }
    if (homeFiles.length) {
      const home = { home: dir, homeFiles: homeFiles.length, homeTaken }
      if (homeTaken) covered.push(Object.freeze({ ...line, ...home }))
      else uncovered.push(Object.freeze({ ...line, ...home, cells: cells.size, slices: named.length, why: "home" }))
    }
    else if (mine.length || cones.length) covered.push(Object.freeze(line))
    else if (cells.size || named.length) uncovered.push(Object.freeze({ subject: a, cells: cells.size, slices: named.length, why: "cap" }))
    else uncovered.push(Object.freeze({ subject: a, cells: 0, slices: 0, why: "none" }))
  }
  return { covered: Object.freeze(covered), uncovered: Object.freeze(uncovered) }
}

// FUNCTION_CONTRACT: checkFocus — гардрейл НАД СКРИПТОМ фокуса, а не над ролью
//   Input:        { focus — возврат newFocus; anchors — те же слова BRD }
//   Dependencies: —
//   Antecedent:   любые значения
//   Consequent:   success: blockers[] — пусто значит каждый непустой предмет назван ровно один раз
//                 failure: none — тотальна
//   Purity:       pure
//
// Роли на шаге 3б нет, чинить блокер некому — поэтому он адресован КОДУ: красный здесь означает, что
// `coverageOf` разошёлся со своим контрактом, и прогон обязан встать, а не идти дальше с молчаливо
// потерянным предметом.
export function checkFocus({ focus = {}, anchors = [] } = {}) {
  const B = []
  const said = new Set([...(focus.covered || []), ...(focus.uncovered || [])].map((x) => x && x.subject).filter(Boolean))
  for (const raw of anchors || []) {
    const a = String(raw || "").trim()
    if (!a || said.has(a)) continue
    B.push(`FC1 предмет «${a}» не попал ни в покрытые, ни в непокрытые — это дефект СКРИПТА фокуса, а не артефакта: steps/focus/focus.mjs::coverageOf обязан назвать КАЖДЫЙ предмет ровно один раз`)
  }
  const twice = [...(focus.covered || [])].filter((c) => (focus.uncovered || []).some((u) => u && c && u.subject === c.subject))
  for (const c of twice) B.push(`FC1 предмет «${c.subject}» назван и покрытым, и непокрытым — списки обязаны не пересекаться`)
  return B
}

export function newFocus({ slices = [], anchors = [], spread = null, cells = [], edges = [], decls = {}, apis = {}, cap = MAP_CAP_BYTES } = {}) {
  // The budget is the ceiling MINUS the measured error of the estimate below (steps/intake/map.mjs::
  // MAP_EST_SLACK). Comparing to the ceiling itself is what killed run fa8def32: the estimate was
  // 10% low, the map missed by 3%, and the swarm had already been paid for.
  const budget = Math.floor(cap / MAP_EST_SLACK)
  const plan = (cells || []).filter((c) => c && c.id)
  if (!plan.length) return err("no-plan", ".agent/survey-plan.json не несёт ни одной клетки — шаг 3 не отработал")

  const filesOf = (cs) => cs.reduce((n, c) => n + (c.files || []).length, 0)

  // The estimate prices the map ELEMENT BY ELEMENT (steps/intake/map.mjs::MAP_PRICE), because every
  // term except one is known before the swarm runs: the paths from the plan, the edges, the
  // declarations and the api rows from graph-computed.xml. The one term nobody can predict — the
  // sentence a scout writes — is bounded instead (steps/graph/graph.mjs::MAP_ROLE_CAP).
  //
  // BUG_FIX_CONTEXT: runs fa8def32 and fb57f506 died with the map 2-3% over the ceiling while a flat
  //   468 B/node estimate sat 10-12% under it. `<decl>` alone was 21% of eddi's map and was priced
  //   at zero.
  // Что такое тестовый файл ДО роя: карты ещё нет, `kind="test"` неоткуда взять, и единственный
  // доступный факт — путь. Тот же признак, которым шаг 5 метит тест по `<suite path>` — здесь он
  // сведён к каталогу и имени, потому что сьюты приезжают позже.
  const isTestPath = (p) => /(^|\/)(src\/)?test(s)?\//i.test(p) || /(Test|IT|Spec)\.[a-z]+$/.test(p)

  const bytesOf = (cs) => {
    const inMap = new Set(cs.flatMap((c) => (c.files || []).map((f) => f.path)))
    let n = 0
    for (const p of inMap) {
      // Тест в карте — строка (M1), и оценка обязана знать её цену: иначе бюджет фокуса тратится на
      // объявления, которых в файле не будет.
      if (isTestPath(p)) { n += MAP_PRICE.test + p.length; continue }
      n += MAP_PRICE.node + p.length + MAP_PRICE.preamble + MAP_PRICE.role
      n += MAP_PRICE.decl * Math.min(decls[p] || 0, DECL_CAP)
      n += MAP_PRICE.api * (apis[p] || 0)
    }
    for (const e of edges || []) {
      if (inMap.has(e.from) && inMap.has(e.to)) n += MAP_PRICE.edge + e.from.length + e.to.length
    }
    return n
  }

  const allFiles = filesOf(plan)
  if (bytesOf(plan) <= budget) {
    const wholeCellOf = new Map()
    for (const c of plan) for (const f of c.files || []) wholeCellOf.set(f.path, c)
    const whole = coverageOf({ anchors, cellOf: wholeCellOf, slices, taken: new Set(plan), chosen: slices, spread })
    return ok(Object.freeze({
      why: "whole-plan",
      chosen: slices.map((s) => s.id),
      cells: plan.map((c) => c.id),
      files: allFiles,
      estBytes: bytesOf(plan),
      dropped: Object.freeze({ slices: 0, cells: 0 }),
      covered: whole.covered,
      uncovered: whole.uncovered,
      slices,
      entries: slices.length,
    }))
  }

  if (!slices.length) {
    return err("no-entry", `план не влезает в карту (${allFiles} файлов ≈ ${kb(bytesOf(plan))} при потолке ${kb(cap)}), а сузить нечем: ни одного входа — ни маршрута, ни головы графа`)
  }

  // Which cell holds which path — built once. A cell is taken WHOLE: its composition is the key of
  // the .izi/parts cache, and filtering files inside it would void the cache and break step 3's
  // coverage invariant (docs/big-projects-solution.md §5).
  const cellOf = new Map()
  for (const c of plan) for (const f of c.files || []) cellOf.set(f.path, c)

  // Тестовая клетка стоит в карте строкой (M1) и потому дёшева — но требованию она не носитель.
  // Без этого порядка подешевевшие тесты вытесняют код: замер прогона после M1 — 70 файлов
  // из 130 в фокусе стали тестами, а `configs/agents` так и не вошёл.
  const isTestCell = (c) => (c.files || []).every((f) => isTestPath(f.path))
  const cheapFirst = (a, b) => (a.files || []).length - (b.files || []).length || a.id.localeCompare(b.id)

  const taken = new Set(plan.filter((c) => c.kind === "spine"))   // the spine is not a candidate
  const cost = () => bytesOf([...taken])
  const add = (paths) => {
    const before = new Set(taken)
    for (const p of paths) { const c = cellOf.get(p); if (c) taken.add(c) }
    if (cost() > budget) { taken.clear(); for (const c of before) taken.add(c); return false }
    return true
  }

  // РОЗЕТКИ ПРИХОДЯТ ГОТОВЫМИ, ЗДЕСЬ ИХ НЕ ИЩУТ. Файлы аналога считает шаг 2 грепом по ТЕКСТУ дерева
  // и кладёт в `.agent/anchors.json`; фокус их ЧИТАЕТ. Матч по пути снят (замер 22.08: precision 0%).
  const socket = new Set(analogueFilesOf(spread))
  let droppedSockets = 0, droppedCells = 0, droppedHomes = 0, droppedSlices = 0
  let chosen = []

  // T22 — ПРИ ЖИВОМ АНАЛОГЕ ПОКУПАЕТ ТОЛЬКО КОНУС: розетки и их звонящие. Слова-якоря — контекст
  // в нарядах, ни одной клетки: прогон 3c6542e7 купил 45 клеток по четырём словам, из них ~30
  // лишних (доки, тесты, розетки широких слов), при том что замер фазы розеток уже давал 9–10
  // файлов эталона из 10. Аналог — то, по ЧЕМУ делается работа; слова — то, как о ней сказали.
  // Звонящие — один шаг НАЗАД по рёбрам: кто вызывает ядро аналога молча, через интерфейс.
  // Рёбер может не быть (graph-computed пуст) — фаза молчит, остаются розетки.
  if (socket.size) {
    const socketCells = [...new Set([...socket].map((p) => cellOf.get(p)).filter(Boolean))]
      .sort((a, b) => (isTestCell(a) ? 1 : 0) - (isTestCell(b) ? 1 : 0) || cheapFirst(a, b))
    const callers = [...new Set((edges || []).filter((e) => socket.has(e.to)).map((e) => e.from))]
    const callerCells = [...new Set(callers.map((p) => cellOf.get(p)).filter(Boolean))].sort(cheapFirst)
    for (const c of [...socketCells, ...callerCells]) {
      if (taken.has(c)) continue
      if (!add((c.files || []).map((f) => f.path))) droppedSockets++
    }
    // Конусом считаются срезы, ЦЕЛИКОМ лежащие во взятых клетках: они и есть «chosen» фокуса.
    chosen = slices.filter((s) => (s.nodes || []).every((n) => { const c = cellOf.get(n); return c && taken.has(c) })).map((s) => s.id)
  } else {
  // ЗАПАСНОЙ ПУТЬ БЕЗ АНАЛОГА — прежние фазы, слово остаётся покупателем: BRD может сказать
  // `analogue: none`, и сузить нечем, кроме слов. Этот путь тот же, что был до T22, и его
  // замеры (M2, дома, круговой обход) продолжают его сторожить.
  const isNamed = (path) => (anchors || []).some((a) => names(a, path))
  const namedFiles = plan.flatMap((c) => (c.files || []).map((f) => f.path)).filter(isNamed)
  if (!namedFiles.length) {
    return err("no-anchor", `ни один якорь BRD не называет ни одного файла (файлов ${allFiles}, якорей ${(anchors || []).length}: ${(anchors || []).join(" · ")}). Сузить не по чему — правится формулировка требований, а не выбор среза`)
  }
  const anchored = slices.filter((s) => isNamed(s.entry))

  const mine = new Map()   // сколько клеток уже взято ЗА СЧЁТ каждого якоря — по этому числу идёт квота

  // ДОМ ПРЕДМЕТА РАНЬШЕ УПОМИНАНИЯ (замеры и BUG_FIX_CONTEXT — в прежнем виде, путь не менялся).
  const atHome = (c, a) => (c.files || []).some((f) => (String(f.path).split("/").slice(0, -1)).some((d) => isHomeDir(d, a)))
  const rankFor = (a) => (x, y) =>
    (atHome(y, a) ? 1 : 0) - (atHome(x, a) ? 1 : 0) ||
    (isTestCell(x) ? 1 : 0) - (isTestCell(y) ? 1 : 0) ||
    (x.files || []).length - (y.files || []).length || x.id.localeCompare(y.id)
  const cheapestNamed = [...new Set(namedFiles.map((x) => cellOf.get(x)).filter(Boolean))].sort(cheapFirst)[0]
  const density = (c, a) => (c.files || []).filter((f) => String(f.path).split("/").slice(0, -1).some((d) => isHomeDir(d, a))).length
  for (const a of anchors || []) {
    const home = plan
      .filter((c) => !taken.has(c) && atHome(c, a))
      .sort((x, y) => density(y, a) - density(x, a) || (isTestCell(x) ? 1 : 0) - (isTestCell(y) ? 1 : 0) || (x.files || []).length - (y.files || []).length || x.id.localeCompare(y.id))[0]
    if (!home) continue
    if (!add((home.files || []).map((f) => f.path))) droppedHomes++
  }

  // РОЗЕТКИ И ЗДЕСЬ ИДУТ СРАЗУ ЗА ДОМАМИ: без аналога их не было — теперь артефакт есть и в этом
  // пути (замер фазы тот же: 9–10 из 10). Список розеток построен выше, до развилки.
  const socketCells = [...new Set([...socket].map((p) => cellOf.get(p)).filter(Boolean))]
    .sort((a, b) => (isTestCell(a) ? 1 : 0) - (isTestCell(b) ? 1 : 0) || cheapFirst(a, b))
  const callers = socket.size
    ? [...new Set((edges || []).filter((e) => socket.has(e.to)).map((e) => e.from))]
    : []
  const callerCells = [...new Set(callers.map((p) => cellOf.get(p)).filter(Boolean))].sort(cheapFirst)
  for (const c of [...socketCells, ...callerCells]) {
    if (taken.has(c)) continue
    if (!add((c.files || []).map((f) => f.path))) droppedSockets++
  }

  // БЮДЖЕТ ДЕЛИТСЯ ПО ЯКОРЯМ, А НЕ ПО ДЕШЕВИЗНЕ (замеры M2 — в прежнем виде).
  const queue = new Map()
  for (const a of anchors || []) {
    const named = plan.filter((c) => (c.files || []).some((f) => names(a, f.path)))
    if (named.length) queue.set(a, named.sort(rankFor(a)))
  }
  const seen = new Set()
  for (let round = 0; queue.size; round++) {
    // порядок якорей в круге — от самого бедного: у кого меньше взято, тот выбирает раньше
    const order = [...queue.keys()].sort((x, y) => (mine.get(x) || 0) - (mine.get(y) || 0) || x.localeCompare(y))
    let progress = false
    for (const a of order) {
      const list = queue.get(a)
      let c = list.shift()
      while (c && (taken.has(c) || seen.has(c.id))) c = list.shift()
      if (!list.length) queue.delete(a)
      if (!c) continue
      seen.add(c.id)
      progress = true
      if (add((c.files || []).map((f) => f.path))) mine.set(a, (mine.get(a) || 0) + 1)
      else droppedCells++
    }
    if (!progress) break
  }

  const ordered = anchored
    .map((s) => ({ s, bytes: bytesOf([...new Set(s.nodes.map((n) => cellOf.get(n)).filter(Boolean))]) }))
    .sort((a, b) => a.bytes - b.bytes || a.s.entry.localeCompare(b.s.entry))
  for (const { s } of ordered) {
    if (add(s.nodes)) chosen.push(s.id)
    else droppedSlices++
  }
  } // запасной путь без аналога

  const cs = [...taken]
  if (cs.every((c) => c.kind === "spine")) {
    return err("over-cap", `ни одна названная клетка не влезает под потолок ${kb(cap)} — клетка берется целиком, и разрезать её здесь нельзя: это ключ кэша .izi/parts`)
  }

  const files = filesOf(cs)
  const cover = coverageOf({ anchors, cellOf, slices, taken, chosen, spread })
  return ok(Object.freeze({
    why: "anchors",
    covered: cover.covered,
    uncovered: cover.uncovered,
    chosen: chosen.map((s) => s.id),
    cells: cs.map((c) => c.id),
    files,
    estBytes: bytesOf(cs),
    dropped: Object.freeze({ slices: droppedSlices, cells: droppedCells + droppedSockets }),
    slices,
    entries: slices.length,
  }))
}
