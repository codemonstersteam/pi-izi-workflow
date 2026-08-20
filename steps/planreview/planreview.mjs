// MODULE_CONTRACT: planreview — второй судья: ПЛАН против требований
// Purpose:    одно решение — где чинить находку. Критик шага 11 судит FRD и на артефакте прогона
//             19.08.2026 написал `Pass`; план против требований не судил никто, и гейт 1 забраковал
//             работу человеком. Здесь план получает своего судью, а его находка — машинный маршрут:
//             правка плана · пересборка дизайна · правка FRD.
//             PURE: диск живёт в ext/index.mjs. Замысел и пруф — docs/plan-loop.md.
// io:         none
// Invariants: findingsOf тотальна — мусорная строка не роняет разбор и не становится находкой;
//             routeOf тотальна и при незнании выбирает САМЫЙ ДОРОГОЙ маршрут: дешёвая правка не
//             того места стоит дороже лишней пересборки (standards/code.md, правило 3)
// Interface:  KINDS — закрытый словарь родов находки, ОДНА копия
//             findingsOf(text) -> [{ req, kind, at, what }]
//             routeOf(finding, { plan }) -> "plan" | "design" | "frd"
//             feedbackFor({ findings, rejected }) -> string  — строки FEEDBACK с их источником
//             applyPatch({ text, patch }) -> Result<string, "no-anchor">

import { ok, err } from "../../core/result.mjs"

// РОД НАХОДКИ — ДВА СЛОВА, И ОНИ ОБЪЯВЛЕНЫ ЗДЕСЬ. Их пишет роль, по ним ходит маршрут, и третьего
// значения нет: либо факт есть в FRD и план его не донёс, либо факта нет нигде.
export const KINDS = Object.freeze({ LOST: "PLAN LOST", UNWRITTEN: "NOT WRITTEN" })

// FUNCTION_CONTRACT: findingsOf — вердикт критика плана из его текста
//   Input:        text — ответ роли; тип не ограничен
//   Dependencies: KINDS
//   Antecedent:   любое значение; строка не той формы просто не становится находкой — вердикт из
//                 одних пояснений даёт пустой список, и это законный «замечаний нет»
//   Consequent:   success: [{ req, kind, at, what }] в порядке появления. `at` — АДРЕС: модуль плана
//                          у рода LOST, «что добавить» у рода UNWRITTEN
//                 failure: none — тотальна
//   Purity:       pure
//
// ФОРМА СТРОКИ, А НЕ JSON: роль на `thinking: low` теряет скобки и кавычки, а четыре поля через `|`
// она держит — это проверено экспериментом 19.08.2026 (два вызова, восемь строк, ни одной битой).
export function findingsOf(text) {
  const out = []
  for (const line of String(text == null ? "" : text).split("\n")) {
    const parts = line.split("|").map((x) => x.trim())
    if (parts.length < 4) continue
    const req = (parts[0].match(/^R\d+$/) || [])[0]
    const kind = Object.values(KINDS).find((k) => parts[1].toUpperCase().startsWith(k))
    if (!req || !kind) continue
    out.push(Object.freeze({ req, kind, at: parts[2], what: parts.slice(3).join(" | ") }))
  }
  return Object.freeze(out)
}

// FUNCTION_CONTRACT: routeOf — какие артефакты правит эта находка
//   Input:        finding — одна находка findingsOf; { plan } — текст PLAN.md; { frd } — frd.xml
//   Dependencies: KINDS
//   Consequent:   success: непустой список из "plan" · "design" · "frd":
//                          "plan"   — раздел плана есть: правка по якорю, здесь и сейчас
//                          "design" — модуля в плане НЕТ, а требование его знает: не отработал шаг 9,
//                                     план переигрывается
//                          "frd"    — модуля не знает и требование: сперва оно, потом переигрывание
//                 failure: none — тотальна; незнакомая находка едет в самый дорогой маршрут
//   Purity:       pure
//
// ПОЧЕМУ НОВЫЙ МОДУЛЬ НЕЛЬЗЯ ДОПИСАТЬ В ПЛАН ПАТЧЕМ. Модули изменения берутся из `nodes` СЦЕНАРИЕВ
// требования (steps/design/card.mjs::partsOf) — оттуда и только оттуда. Раздел, вписанный в PLAN.md
// патчем, не знает ни `parts`, ни рябь: у модуля не будет ни партии, ни уровня, ни зависимостей, а
// первый же вход в шаг 9 сотрёт его вместе с работой. Поэтому «модуля нет» — это всегда работа над
// ТРЕБОВАНИЕМ (`<scenario nodes>` + `<delta>`) и переигрывание плана, а не правка документа.
//
// Правки ВНУТРИ существующих разделов от этого не страдают: они закрываются тем же кругом и не
// ждут пересборки (см. planLoop — находки плана чинятся до возврата).
export function routeOf(finding, { plan = "", frd = "" } = {}) {
  const f = finding || {}
  const at = String(f.at || "").trim()
  // «ПУТЬ ЕСТЬ В ПЛАНЕ» — ЭТО ЗАГОЛОВОК РАЗДЕЛА, А НЕ ЛЮБОЕ УПОМИНАНИЕ. Модуль живёт в плане
  // разделом; его путь встречается ещё и в `sample:` (образец стиля для соседа) и в `calls:`
  // (кого зовут). Правка по якорю в таком месте закрыла бы находку строкой внутри ЧУЖОГО раздела —
  // ровно та тихая потеря, ради которой заведён `hiddenHeads`.
  //
  // BUG_FIX_CONTEXT: прогон 4f938cfe (20.08.2026). Критик впервые назвал путь
  //   `…/configs/agents/model/AgentConfiguration.java` — и маршрут отдал находку ФИКСЕРУ ПЛАНА,
  //   потому что этот путь стоит в плане строкой `sample:` соседнего раздела. Модуля в плане нет,
  //   чинить надо было требование.
  const hasSection = (p) => p && new RegExp(`^#{2,}[ \t]+(?:\\d+\\.[ \t]+)?${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "m").test(String(plan || ""))
  if (hasSection(at)) return ["plan"]
  const nodes = [...`${at} ${f.what || ""}`.matchAll(/[\w./-]+\/[\w.-]+\.\w+/g)].map((m) => m[0])
  if (nodes.some(hasSection)) return ["plan"]
  if (!nodes.length) return f.kind === KINDS.UNWRITTEN ? ["frd"] : ["plan"]
  return nodes.some((n) => String(frd || "").includes(n)) ? ["design"] : ["frd"]
}

// FUNCTION_CONTRACT: feedbackFor — строки FEEDBACK фиксера, как их ЧИТАЕТ роль
//   Input:        { findings — строки находок критика; rejected — отказ гардрейла на прошлую правку;
//                 nfrs — [{ subject, fit, source }] величины требования, которых план не несёт }
//   Dependencies: —
//   Antecedent:   любые значения; пусто с обеих сторон даёт пустую строку
//   Consequent:   success: по строке на работу, каждая с префиксом источника — `critic:` про
//                          содержание артефакта, `guardrail:` про форму СОБСТВЕННОГО прошлого ответа
//                 failure: none — тотальна
//   Purity:       pure
//
// ФОРМА СТРОКИ ЖИВЁТ ЗДЕСЬ, А НЕ В ПОЛОСЕ. Тот же договор, что у шага 11
// (steps/review/review.mjs::feedbackLines): собери её в полосе — и проверить будет нечем, кроме
// регулярки по самой полосе, а роль различает источники именно по этому префиксу.
export function feedbackFor({ findings = "", rejected = "", nfrs = [] } = {}) {
  const lines = String(findings || "").split("\n").map((x) => x.trim()).filter(Boolean).map((l) => `critic: ${l}`)
  // Величина — не находка критика: её никто не «нашёл», она просто не доехала. Свой префикс, потому
  // что и ремонт свой: место ищется по цепочкам, а не называется в замечании.
  for (const n of Array.isArray(nfrs) ? nfrs : []) {
    if (!n || !n.subject) continue
    lines.push(`nfr: ${n.subject} = ${n.fit || "(без величины)"}${n.source ? ` (источник ${n.source})` : ""}`)
  }
  if (String(rejected || "").trim()) lines.push(`guardrail: ${String(rejected).trim()}`)
  return lines.join("\n")
}

// FUNCTION_CONTRACT: applyPatch — правка по ЯКОРЮ, применяемая машиной
//   Input:        { text — файл; patch — ответ фиксера }
//   Dependencies: ok, err
//   Antecedent:   любые значения
//   Consequent:   success: текст с применёнными правками. Форм две:
//                          `REPLACE: <строка>` + следующая строка — чем заменить
//                          `INSERT AFTER: <строка>` + следующие строки — что вставить
//                 failure: "no-anchor" — якоря нет в файле. ОТКАЗ, а не вставка наугад: фиксер,
//                          промахнувшийся якорем, иначе тихо пишет не туда
//   Purity:       pure
//
// ПОЧЕМУ НЕ ФАЙЛ ЦЕЛИКОМ. Роль, переписывающая 14 КБ артефакта ради одной строки, теряет остальное:
// на прогоне 19.08.2026 пласт A при перезаходе переписал FRD с нуля и стёр три пласта. Якорь делает
// правку точечной и проверяемой: машина либо нашла строку, либо отказала.
export function applyPatch({ text = "", patch = "" } = {}) {
  let out = String(text == null ? "" : text)
  const lines = String(patch == null ? "" : patch).split("\n")
  let applied = 0
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].match(/^\s*(REPLACE|INSERT AFTER):\s*(.+)$/)
    if (!head) continue
    const anchor = head[2].trim()
    const body = []
    for (let j = i + 1; j < lines.length && !/^\s*(REPLACE|INSERT AFTER):/.test(lines[j]); j++) {
      if (lines[j].trim()) body.push(lines[j].trim())
    }
    if (!body.length) continue
    // Якорь НЕ обрезается: роль должна увидеть его целиком, чтобы сличить со строкой файла — обрезка
    // прячет как раз то место, где он разошёлся (лишний пробел, другая кавычка, съеденный хвост).
    if (!out.includes(anchor)) return err("no-anchor", `no such line in the file:\n  ${anchor}\nNothing was applied.`)
    out = head[1] === "REPLACE"
      ? out.replace(anchor, body.join("\n"))
      : out.replace(anchor, `${anchor}\n${body.map((b) => `  ${b}`).join("\n")}`)
    applied++
  }
  if (!applied) return err("no-anchor", "the answer carries no edit: expected a line starting with REPLACE: or INSERT AFTER:")
  return ok(out)
}

// FUNCTION_CONTRACT: adoptNode — правка требования, которой роль не нужна
//   Input:        { frd — текст .agent/frd.xml; path — узел, который требование потеряло;
//                 req — номер требования из находки; what — что критик велел добавить }
//   Dependencies: —
//   Antecedent:   любые значения
//   Consequent:   success: { ok: true, patch } — две правки в форме applyPatch: узел дописан в
//                          `nodes` сценария того use case, которым закрыт `req`, и рядом с
//                          последней дельтой добавлена своя
//                          { ok: false, why } — по требованию нет `<carried>`, нет сценария или
//                          узел уже на месте: тогда чинить нечего либо не по чему
//   Purity:       pure
//
// ПОЧЕМУ ЭТО СКРИПТ, А НЕ РОЛЬ. Всё, что нужно, ВЫЧИСЛИМО: путь назвал разборщик вердикта, use case
// назван строкой `<carried req="R11" by="UC5/1"/>`, сценарий — единственный с этим `uc`, а текст
// дельты — сама находка критика. Модели здесь нечего решать, а значит нечем и ошибиться: живой
// прогон 20.08.2026 дважды подряд показал, чем кончается «пусть роль допишет требование» — сперва
// якорь из чужого артефакта, потом выдуманный путь.
export function adoptNode({ frd = "", path = "", req = "", what = "" } = {}) {
  const src = String(frd || "")
  const node = String(path || "").trim()
  const clean = (t) => String(t || "").replace(/[<>&"]/g, " ").replace(/\s+/g, " ").trim()
  if (!node) return { ok: false, why: "находка не назвала узла — усыновлять нечего" }
  if (new RegExp(`nodes="[^"]*${node.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(src)) {
    return { ok: false, why: `${node} уже назван сценарием — требование его знает` }
  }
  const carried = src.match(new RegExp(`<carried[^>]*req="${String(req).trim()}"[^>]*by="(UC\\d+)`))
  if (!carried) return { ok: false, why: `по требованию ${req} нет строки <carried … by="UC…"/> — не по чему выбрать сценарий` }
  const uc = carried[1]
  const line = src.match(new RegExp(`^.*<scenario[^>]*uc="${uc}"[^>]*/>.*$`, "m"))
  if (!line) return { ok: false, why: `у ${uc} нет <scenario> — узел некуда дописать` }
  const grown = line[0].replace(/nodes="([^"]*)"/, (_, n) => `nodes="${n.trim()} ${node}"`)
  if (grown === line[0]) return { ok: false, why: `у сценария ${uc} нет атрибута nodes` }

  const deltas = [...src.matchAll(/^.*<delta[^>]*\/>.*$/gm)]
  if (!deltas.length) return { ok: false, why: "в требовании нет ни одной <delta> — не рядом с чем ставить" }
  const last = deltas[deltas.length - 1][0]
  const indent = (last.match(/^\s*/) || [""])[0]
  const op = clean(String(req)).toLowerCase() || "adopt"
  const delta = `${indent}<delta op="${op}" form="Changed" node="${node}" from="${clean(`не описано требованием ${req}`)}" to="${clean(what).slice(0, 160)}"/>`
  return {
    ok: true,
    patch: [`REPLACE: ${line[0]}`, grown, "", `INSERT AFTER: ${last}`, delta].join("\n"),
  }
}

// FUNCTION_CONTRACT: hiddenHeads — разделы, которых не увидит ни один читатель
//   Input:        text — карточка партии или PLAN.md; тип не ограничен
//   Dependencies: —
//   Antecedent:   любое значение
//   Consequent:   success: string[] — строки-заголовки, стоящие НЕ на нулевой колонке
//                 failure: none — тотальна
//   Purity:       pure
//
// ЗАГОЛОВОК РАЗДЕЛА ЖИВЁТ НА НУЛЕВОЙ КОЛОНКЕ. Разбор разделов ловит `^##\s+<путь>` от начала строки
// (steps/design/card.mjs::sectionsOf): заголовок с отступом — это не раздел, а текст ВНУТРИ соседа.
// Ни покрытие, ни нарезка его не видят, и работа, описанная под ним, не станет нарядом.
//
// BUG_FIX_CONTEXT: прогон 7d8e36b5 (20.08.2026). Фиксер закрыл R11, дописав раздел про
//   `AgentConfiguration.java` — и `INSERT AFTER` унёс отступ якоря: `  ## src/…/AgentConfiguration.java`.
//   Разделов осталось 11, нарядов 16, наряда на модуль нет. Хуже: СЛЕДУЮЩИЙ круг критика увидел в
//   плане слова `AgentConfiguration`, `boundGlossaryIds` и `closes: R11` — и промолчал. План ушёл на
//   гейт с работой, описанной там, откуда её никто не нарежет.
export function hiddenHeads(text = "") {
  return [...String(text || "").matchAll(/^[ \t]+#{2,}[ \t]+\S+\.[A-Za-z0-9]+.*$/gm)].map((m) => m[0])
}
