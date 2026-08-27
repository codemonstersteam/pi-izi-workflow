// MODULE_CONTRACT: frd — step 6's pure core: the requirement fried against the repository's map
// Purpose:    one decision — whether what the role wrote can be BUILT UPON by steps 7-9: the weight
//             is derived from the FORMS of the deltas, the ripple from `touched`, and step 9 already
//             declares `{ scenarios, touched }` as its input (steps/design/design.mjs::checkDesign).
//             So this module judges composition and provenance, never the beauty of a wording.
//             PURE: knows nothing of disk, io lives in ext/index.mjs. The grammar and the rules with
//             their numbers are declared ONCE, in docs/intake.md §4-§5, and are not restated here.
// io:         none
// Invariants: parseFrd is total — any input, including undefined, yields an empty parse and never
//             throws (a guardrail that crashes on a malformed artifact turns "the role wrote
//             nonsense" — data, a red check, a redelegation — into "the run crashed", code 2, no
//             diagnosis); checkFrd is total and returns EVERY blocker, not the first one (a model
//             fixes this artifact, and one blocker per call means paying a call per blocker —
//             steps/brd/brd.mjs, constraint 2); FRD_FORM is fixed at module load.
// Interface:  FRD_FORM — the artifact's form as data (grammar, deltaForms, sources)
//             unreadable(xml) -> string[]  — F0: места, где элемент пропадает из разбора
//             spentAnswers({ xml, said }) -> string[]  — F13: ответ оператора потрачен
//             parseFrd(xml) -> Frd
//             endsOf(frd) -> [{ token, uc, side, text }]  — the ends of every use case
//             checkFrd({ frd, nodes, tests, entries, edges, known, pass }) -> string[]  — blockers, empty = green
//             newFrd({ xml, nodes, tests, entries, edges, sources, pass }) -> Result<Frd, "invalid-frd">
//             RULE_PASS / PASSES — какому пласту принадлежит правило (steps/intake/docs/passes-data-flow.md)
//             passOfBlocker(blocker) -> "A"|"B"|"C"|"D"|"*"
//             forPass(blockers, pass) -> string[]  — что этот проход имеет право показать роли
//             entryPass(blockers) -> "A"|"B"|"C"|"D"  — откуда переигрывать после красного полного суда

import { ok, err } from "../../core/result.mjs"
// EXTERNAL_DEPENDENCY: core/xml.mjs — the tag scanner shared with steps/scope and steps/design. One
// grammar family, one piece of code reading it; the BUG_FIX_CONTEXT for ATTRS' quote-resilience lives
// there and is inherited here for free.
import { attrs, ATTRS, tag, tokens } from "../../core/xml.mjs"
// EXTERNAL_DEPENDENCY: steps/brd/brd.mjs::numbersIn — provenance of a number is ONE rule in this
// pipeline, and it already has a home: the same function that judges `fit` at step 2, together with
// its defence against designations (ISO-8601, RFC 3339, HTTP/2). A second copy here would drift.
import { numbersIn } from "../brd/brd.mjs"
// EXTERNAL_DEPENDENCY: steps/review/review.mjs::frdIds — "what is an id of this FRD" is answered ONCE:
// step 11's R4 resolves a blocker's evidence against it, and F9 below (the guard against 508d74fa's
// class of defect — a rewind's subject erased instead of repaired) resolves the SAME evidence against
// the SAME set, on the FRD the role just rewrote. Not a cycle: review.mjs takes frd/plan as data and
// never imports this module.
import { frdIds } from "../review/review.mjs"
// EXTERNAL_DEPENDENCY: core/node.mjs — «что такое узел изменения» отвечено ОДИН раз на всю полосу
// (core/node.md). Три остановки прогона 19.08.2026 куплены тем, что этот вопрос задавался здесь, в
// шаге 8 и в шаге 14 по-разному.
import { nodeKind, KINDS } from "../../core/node.mjs"
// EXTERNAL_DEPENDENCY: core/answers.mjs::hardTokens — «чем ответ оператора УЗНАЁТСЯ в артефакте»
// отвечено один раз, там же, где живёт разбор самих ответов. Второй набор регулярок здесь разошёлся
// бы с первым на первом же новом виде знака.
import { hardTokens } from "../../core/answers.mjs"

// THE FORM AS DATA, so the order can SUBSTITUTE it instead of restating it (ext/index.mjs::frdForm,
// the same device as brdForm — see its BUG_FIX_CONTEXT G9e).
export const FRD_FORM = Object.freeze({
  grammar: 1,
  // The forms of a delta. They are defined by the EFFECT ON AN EXISTING CALL, not by the grammar of a
  // sentence — the definitions live once, in the role's STRATEGY §8 (steps/intake/intake.md), and the
  // mapping form → weight lives once, in steps/weight/weight.mjs. Neither is restated here.
  //
  // `Unknown` is not decoration: it is the ONLY way "could not classify" reaches the operator, and
  // step 7 refuses to write `.agent/mode` while one is present (docs/concept.md, "Прожарка и оценка
  // change").
  //
  // BUG_FIX_CONTEXT: live run S21 (sandbox/runbox/quarkus-rest-json-app-v2-t1-3) — a backward
  //   compatible addition to an existing operation (an optional query param) was declared `Changed`,
  //   which weighs `major` and orders step 9's designer for a one-node change. Two fixes, both here:
  //   the forms got their definitions (the role file), and `Fixed` was added — without it a
  //   contract-stable bug fix falls under `Changed` too, so `patch` would be unreachable for the whole
  //   pipeline while step 8 keeps a branch for it (docs/weight.md §2-§3).
  deltaForms: Object.freeze(["Added", "Changed", "Removed", "Fixed", "Unknown"]),
  // A closed vocabulary of provenance. `appgraph.xml` is here because step 6 is the first one holding
  // BOTH operands: a number read off the map (a status from an annotation, a limit from a signature)
  // is a fact of the repository, not an invented default.
  //
  // `normalized.md` — the order's own table, one row per requirement, column `values` carrying the
  // measurement the operator already decided (steps/brd/normalize/normalize.mjs::parseRows). Without
  // this file in the vocabulary every value of the request has nothing to be quoted from — and F5
  // turns the operator's own decision into a question he already answered. On the eddi order that is
  // the whole «Решения, уже принятые оператором» block: fourteen values.
  //
  // SINCE TICKET A02 THE TWO FILES SAY THE SAME THING, and the win belongs to this step: `brd.md` is
  // assembled by a script that copies the table row for row, so `R<n>` IS `verb | object | instrument
  // | values` and its number IS the row's number. A value therefore travels WITH the requirement that
  // carries it — no longer to be matched up in a neighbouring file by meaning. `normalized.md` stays
  // in the vocabulary because a promoted BRD may predate that rework, and because the columns are
  // named there; F11 below is untouched by any of it — it is the difference of two lists of NUMBERS,
  // and the numbers are now the same numbers on both sides.
  sources: Object.freeze(["TASK.md", "answers.md", "brd.md", "normalized.md", "appgraph.xml"]),
})

// OP_STUB — the fillers a role writes into `op` when it has nothing to put there. A dash is not an
// answer, it is the ABSENCE of one written down so the attribute is not empty, and a rule that tests
// only for emptiness cannot tell the two apart.
//
// EXPORTED because step 9's rule 14 asks the same attribute the same question — «did the requirement
// say what this node brings into the world» — and two spellings of one stub would drift the day a role
// types «—» instead of «-» (standards/code.md §1: one rule, one place).
//
// BUG_FIX_CONTEXT: live run 088fb3ee (sandbox/runbox/eddi). Five of the six created modules carried
//   `<delta new="yes" op="-" …/>` — a dash where the external point belongs. F3n below tested only
//   `!d.op`, a dash is not empty, and step 6 closed GREEN: five new nodes travelled to step 9 with no
//   operand at all. There pass B owes every node with a delta a non-empty `out` (rule 14,
//   steps/design/nodes.mjs) and had nothing to take one from — two redelegations, and a third that
//   produced three thinking blocks of ~110 000 characters and not one tool call: `crashed`.
export const OP_STUB = /^(?:[-–—_.·*?]+|n\/?a|tbd|todo|нет|none)$/i

// The text of a child element, e.g. <post>…</post>. A fresh non-global RegExp per call: `tag()` is
// global and would carry lastIndex between callers.
const childText = (body, name) => {
  const m = String(body || "").match(new RegExp(`<${name}\\b${ATTRS}>([\\s\\S]*?)</${name}>`))
  return m ? m[2].trim() : ""
}

// FUNCTION_CONTRACT: spentAnswers — F13: ответ оператора обязан быть ПОТРАЧЕН
//   Input:        { xml — текст артефакта; said — [{ n, question, text }] как их отдаёт
//                 core/answers.mjs::newAnswers }
//   Dependencies: hardTokens
//   Antecedent:   любые значения; пусто читается как «обменов не было» и правило молчит
//   Consequent:   success: string[] блокеров F13 — по одному на ответ, чьи твёрдые знаки НЕ встречены
//                          в артефакте. Ответ без твёрдых знаков пропускается молча: судить его
//                          нечем, и притворяться, что есть чем, — хуже, чем промолчать
//                 failure: none — тотальна
//   Purity:       pure
//
// ЗАЧЕМ ПРАВИЛО. Пауза оператора — самое дорогое, что есть у полосы: человек читает вопрос, думает и
// отвечает. Ответ, не доехавший до артефакта, тратит это дважды — впустую сейчас и повторным
// вопросом потом. Ни одно другое правило этого не видит: F1 судит состав use case, F6c — концы,
// F11 — покрытие требований; «куда делся ответ» не спрашивает никто.
//
// Это F5 наоборот: там у числа обязан быть источник, здесь у источника обязано быть значение.
//
// BUG_FIX_CONTEXT: живой прогон eddi 19.08.2026, шаг 6, пласт A. Роль спросила три вопроса, получила
//   три ответа и закрылась ЗЕЛЁНОЙ, потеряв два: «нужен GET /glossarystore/glossaries/{id}» —
//   одиночного чтения в семи use case нет вовсе; «замена набора терминов целиком» — уровень слияния
//   не назван. Правило ловит первый (у него есть путь) и молчит о втором (твёрдых знаков нет) —
//   потолок назван в core/answers.mjs::hardTokens и в docs/ask.md §6.
export function spentAnswers({ xml = "", said = [] } = {}) {
  // КОММЕНТАРИЙ — НЕ АРТЕФАКТ. Ни шаг 7, ни шаг 9, ни нарезка не читают `<!-- … -->`: до исполнителя
  // из него не доезжает ничего. Знак ответа, найденный в комментарии, — это правило, обманутое
  // отговоркой, а не потраченный ответ.
  //
  // BUG_FIX_CONTEXT: проигрыш 20.08.2026. Фиксер, получив блокер F13 про «нужен GET
  //   /glossarystore/glossaries/{id}», дописал в конец файла
  //   `<!-- PENDING: GET /glossarystore/glossaries/{id} requested but out of scope -->` — и полный
  //   суд позеленел. Ответ оператора при этом потерян ровно так же, как был.
  const text = String(xml == null ? "" : xml).replace(/<!--[\s\S]*?-->/g, " ")
  const out = []
  for (const a of Array.isArray(said) ? said : []) {
    if (!a || !a.text) continue
    const tok = hardTokens(a.text)
    if (!tok.length) continue
    if (tok.some((t) => text.includes(t))) continue
    out.push(`F13 ответ оператора не потрачен: на вопрос «${String(a.question || "").slice(0, 90)}» отвечено «${String(a.text).slice(0, 90)}», а в артефакте нет ни одного знака этого ответа: ${tok.join(", ")}. Впиши то, что оператор назвал — путь в <step>, код в <ext error> и <failure code>, поле в <field>; ответ устарел и больше не про эту работу — вернись к оператору вопросом, но молча его не теряй`)
  }
  return out
}

// FUNCTION_CONTRACT: unreadable — места, где артефакт перестаёт читаться, ДО всякого суждения о нём
//   Input:        xml — текст `.agent/staging/frd.xml`; тип не ограничен
//   Dependencies: —
//   Antecedent:   любое значение; не-строка читается как пустой текст
//   Consequent:   success: string[] блокеров F0 — по одному на строку с сырым `<` внутри значения
//                          атрибута. Пусто = файл читается целиком
//                 failure: none — тотальна
//   Purity:       pure
//
// ЗАЧЕМ ОТДЕЛЬНОЕ ПРАВИЛО, А НЕ ОТКАЗ. Сырой `<` в значении атрибута — не «плохой XML вообще», а
// ТИХАЯ ПОТЕРЯ: сканер (core/xml.mjs) заканчивает элемент на первом `<`, и элемент исчезает из
// разбора целиком. Дальше правила судят артефакт, в котором этого элемента НЕТ, и обвиняют роль в
// том, чего она не писала, — ровно то, что запрещает standards/guardrail.md. Отказ здесь не годится:
// он убивает прогон, а дефект чинится одной правкой строки.
//
// Правило вне пластов: испорченная строка одинаково слепит любой проход, и молчать о ней нельзя ни в
// одном.
//
// BUG_FIX_CONTEXT: живой прогон eddi 19.08.2026, третий запуск, пласт B. Роль написала
//   `before="no glossary term substitution; <code>{{glossary.<term>}}</code> expressions …"` —
//   сценарий S6 для UC6. Разбор его не увидел, и гардрейл вернул ДВА блокера: «у UC6 нет сценария»
//   (ложь — он написан) и «дельта GlossaryService без сценария» (следствие: узел назван именно в S6).
//   Тем же почерком в пласте A пропал `<question>`: открытый вопрос исчез из артефакта молча.
//   Экранированных `&lt;` в файле было НОЛЬ — роль не знала, что так нельзя.
export function unreadable(xml) {
  const out = []
  const lines = String(xml == null ? "" : xml).split("\n")
  lines.forEach((line, i) => {
    // значение атрибута — между кавычками; `<` внутри него в XML невозможен ни в каком виде
    for (const m of line.matchAll(/(\w+)="([^"]*<[^"]*)"/g)) {
      out.push(`F0 строка ${i + 1}, атрибут ${m[1]}: внутри значения стоит «<» — по XML там обязано быть &lt;, и наш разбор обрывает элемент на этом знаке, то есть элемент ПРОПАДАЕТ целиком и правила судят артефакт без него. Убери разметку из значения: пиши {{glossary.&lt;term&gt;}} или вовсе без тегов — «{{glossary.<term>}}» лучше записать словами`)
    }
  })
  return out
}

// FUNCTION_CONTRACT: parseFrd — the FRD's elements out of its text
//   Input:        xml — text of `.agent/staging/frd.xml`; type unconstrained
//   Dependencies: childText, core/xml.mjs
//   Antecedent:   any value — undefined/null/garbage are read as an empty FRD
//   Consequent:   success: a frozen { goal, grammar, actors[], usecases[], fields[], failures[],
//                          deltas[], scenarios[], touched[], nfrs[], questions[] } in appearance
//                          order; a self-closing element is its attribute map as written, an absent
//                          attribute is simply absent (the rules below judge that, the parser does
//                          not invent defaults for it)
//                 failure: none — total
//   Purity:       pure
export function parseFrd(xml) {
  const s = String(xml || "")
  const head = attrs((s.match(new RegExp(`<frd\\b${ATTRS}>`)) || ["", ""])[1])

  const usecases = [...s.matchAll(tag("usecase", ">([\\s\\S]*?)</usecase>"))].map((m) => {
    const a = attrs(m[1])
    const body = m[2]
    return Object.freeze({
      id: a.id || "",
      actor: a.actor || "",
      goal: a.goal || "",
      // via — КАНАЛ ЭТОГО use case, перекрывающий актёрский. Живой прогон eddi: у актёра
      // `api-client` один `via="HTTP /glossarystore/glossaries"`, и его получили ВСЕ восемь use
      // case — включая экспорт, импорт и синхронизацию, которые входят через `/backup/export/...`
      // и `/backup/import/sync`. Граничные наряды 05-07 велели проверять экспорт агента через CRUD
      // словарей — тест, который написать нельзя. Пусто — канал берётся у актёра, как раньше.
      via: a.via || "",
      pre: childText(body, "pre"),
      post: childText(body, "post"),
      steps: Object.freeze([...body.matchAll(tag("step", ">([\\s\\S]*?)</step>"))].map((x) => x[2].trim())),
      exts: Object.freeze([...body.matchAll(tag("ext"))].map((x) => Object.freeze(attrs(x[1])))),
    })
  })

  const list = (name) => Object.freeze([...s.matchAll(tag(name))].map((m) => Object.freeze(attrs(m[1]))))
  // `<failures>` (plural) is the ANSWER "this change has no failure modes", not a container: the same
  // device the map uses for `<toggles found="no">`. It is read separately from `<failure>` (singular)
  // rows, and F6 below demands one of the two.
  const none = attrs((s.match(new RegExp(`<failures\\b${ATTRS}/?>`)) || ["", ""])[1])
  return Object.freeze({
    goal: head.goal || "",
    grammar: head.grammar || "",
    failuresFound: none.found || "",
    failuresWhy: (none.why || "").trim(),
    actors: list("actor"),
    usecases: Object.freeze(usecases),
    fields: list("field"),
    failures: list("failure"),
    deltas: list("delta"),
    scenarios: list("scenario"),
    // `touched` stays a list of PATHS and nothing else: step 8 counts the width of the change by it
    // (steps/ripple/ripple.mjs), step 9 checks routes against it (steps/design/design.mjs::checkDesign)
    // and the host reports its length — widening its shape would be a change to every one of those
    // consumers (CLAUDE.md, constraint 5). The elements themselves ride alongside as `touchedRows`,
    // for the one rule that needs an attribute of theirs.
    touched: Object.freeze(list("touched").map((t) => t.path || "")),
    touchedRows: list("touched"),
    nfrs: list("nfr"),
    questions: list("question"),
    owners: list("owner"),
    // carried — САМОПРОВЕРКА РОЛИ, СТАВШАЯ УЛИКОЙ. По строке на каждое требование BRD: чем оно
    // унесено в это требование (`by="UC1/2"`, `by="S3"`, `by="src/rest/Store.java"`). Роль проходит
    // требования по одному и называет носителя; судит строку скрипт (F11), поэтому
    // самосертификации здесь нет — есть предъявленная улика.
    carried: list("carried"),
  })
}

// FUNCTION_CONTRACT: endsOf — the ENDS of every use case, as tokens
//   Input:        frd — parseFrd's object
//   Dependencies: —
//   Antecedent:   any value; a missing/garbage input is an empty list
//   Consequent:   success: [{ token, uc, side, text }] in the FRD's order — per use case its entry
//                          (`UCx/in`, side `in`, the text of the first `<step>`), its exit
//                          (`UCx/post`, side `out`) and one per `<ext>` (`UCx/<ext id>`, side `out`,
//                          the `outcome`). A use case or an `<ext>` without an id is skipped: a token
//                          built on an empty id addresses nothing
//                 failure: none — total
//   Purity:       pure
//   Interface:    endsOf(frd?: Frd) -> [{ token, uc, side, text }]
//
// WHY IT LIVES HERE. "How many ends does this change have, and what are they called" is a fact of the
// REQUIREMENT'S grammar — it reads `<usecase>`, `<post>`, `<ext outcome>` and nothing else. Two
// consumers ask it: F6c below (the text of an output end is unique per use case) and step 9's pass A,
// whose skeleton IS this list — one row per end, its `closes` token already filled in. The set must be
// the same set, or step 6 closes green on an artifact step 9 then refuses; and one set means one piece
// of code (standards/code.md §1) — the day an `<ext>` id gains a dot, both move together.
//
// It used to live in steps/design/values.mjs and be imported here — step 6 depending on step 9, an
// edge running backwards along the band. Deleting the design slice was then impossible without
// stopping steps 6, 7, 10 and 11, so the function came home to the grammar it reads and step 9 now
// imports it from here.
export function endsOf(frd = {}) {
  const ends = []
  for (const u of frd.usecases || []) {
    const id = String((u && u.id) || "").trim()
    if (!id) continue
    ends.push({ token: `${id}/in`, uc: id, side: "in", text: (u.steps || [])[0] || "" })
    ends.push({ token: `${id}/post`, uc: id, side: "out", text: u.post || "" })
    for (const e of u.exts || []) {
      const eid = String((e && e.id) || "").trim()
      if (!eid) continue
      ends.push({ token: `${id}/${eid}`, uc: id, side: "out", text: e.outcome || "" })
    }
  }
  return ends
}

// FUNCTION_CONTRACT: provenance — F5 for one value that carries a requirement's quantity
//   Input:        at — where the finding happened, for the blocker's text; value — `domain` or `fit`
//   Dependencies: known — the set of the sources' numbers, or null when no sources were supplied
//                 (then the rule stays silent: there is nothing to judge provenance against)
//   Antecedent:   any values
//   Consequent:   success: string[] of blockers, empty when the source is declared and every number
//                          in the value occurs among the sources
//                 failure: none — total
//   Purity:       pure
// ONLY `domain` and `fit` are counted. The artifact is full of numbers that are not the requirement's
// quantities — status="400", step n="1", grammar="1", lengths quoted off the map — and counting the
// whole element would turn an honest artifact red: the same breed of defect as the "fit must carry a
// measurable token" rule the operator removed after live run ed1d4094 (core/form.mjs).
function provenance(at, value, source, known) {
  const out = []
  // THE RULE JUDGES THE FILE, NOT THE WORD ORDER. A role that writes `brd.md R4` or `R4 в brd.md` has
  // named the requirement the quantity came from — better provenance than the bare file, and no
  // consumer of this attribute exists to break on it. Live run d4ed43a0 burned three intake rounds
  // refusing exactly that, and the blocker said only which files were legal, so the role had nothing
  // to repair towards.
  //
  // A LEGAL FILE MUST BE A WHOLE WORD, not a substring: containment would pass «взял из головы, похоже
  // на brd.md» — the prose this rule exists to refuse. Run e132f0a1 shows the field being gamed under
  // pressure, when the role kept an invented number and moved `source` to the analogue it had read.
  if (!String(source || "").split(/[\s,;]+/).some((w) => FRD_FORM.sources.includes(w))) {
    out.push(`F5 ${at}: source="${source || ""}" — допустимо ${FRD_FORM.sources.join(" | ")}; имя файла назови отдельным словом, уточнение внутри файла можно дописать рядом`)
  }
  if (known) {
    const invented = [...numbersIn(value)].filter((n) => !known.has(n))
    if (invented.length) {
      // THE BLOCKER NAMES ITS EXITS. A refusal that states only the law leaves the role to invent a
      // repair, and live run e132f0a1 shows what it invents: told the number 24 had no source, the
      // role kept the number and changed `source` to the name of the analogue it had read it from —
      // a second violation of the same rule. Naming the three legal exits is not politeness; a rule
      // and the way out of it are one decision, and it belongs in one place, this one.
      out.push(`F5 ${at} [invented-default]: число ${invented.join(", ")} не встречается ни в задаче, ни в ответах оператора, ни в BRD, ни в таблице значений normalized.md, ни в карте — назови формат вместо его меры, или сними число, или оставь <question>: источником может быть только файл из списка, но не память`)
    }
  }
  return out
}

// ПЛАСТ ПРАВИЛА. Шаг 6 идёт четырьмя проходами (steps/intake/docs/passes-data-flow.md): A требование ·
// B изменение · C величины и отказы · D покрытие. Правило судит ТОТ пласт, элементы которого читает,
// и в проходе, где этих элементов ещё нет, обязано молчать.
//
// Пласт объявлен ОДИН раз и здесь — не у места вызова `B.push`: код блокера уже стоит первым словом
// строки, а значит адрес правила уже существует, и второй его экземпляр у каждого из тридцати с
// лишним `push` разошёлся бы с этим на первой же правке (standards/code.md §1).
//
// Правило-мост, читающее два пласта, живёт в ПОЗДНЕМ из них — иначе оно судит по половине картины:
//   F4b (use case без сценария) и F10 (канал и узлы) читают A и B → B;
//   F8 (поле и модуль, который его напишет) читает B и C → D, вместе с F11.
// `*` — правило вне пластов: F9 сторожит перемотку и обязано стоять в любом проходе.
//
// BUG_FIX_CONTEXT: живой прогон 19.08.2026, шаг 6 одним вызовом. Первый вердикт — 15 блокеров, из
//   них шесть про сценарии, которых роль ещё не начинала писать, и одна `F6 карта отказов пуста` на
//   артефакте, где ещё не было ни одной дельты. Модель чинила несуществующее и переписывала уже
//   зелёное; три круга ушли на бухгалтерию.
//
// T62 — ПЛАСТ B РАЗЛОЖЕН НА ТРИ РЕШЕНИЯ (приёмка 25.08: один вызов выбирал владельцев, формы и
//   сценарии разом — ошибки выбора, самые дорогие, были невидимы в большом артефакте; замер:
//   подстановка уехала в выдуманный сервис при живой роли конвертера, синк-четвёрка молча
//   пропущена). B1 — выбор владельцев (таблица owner+question, судят F17a-d), B2 — формы дельт
//   по готовым узлам (F3-семейство + F17e), B3 — сценарии и touched (F2/F4/F10/F14). Порядок
//   «решение → суд» один: каждый следующий наряд несёт ПОДТВЕРЖДЁННОЕ предыдущим, машина подаёт.
export const PASSES = Object.freeze(["scenarios", "owners", "contracts", "data-failures", "coverage", "critic"])
export const RULE_PASS = Object.freeze({
  F1: "scenarios",   // цель, актёр, гарантия, шаги
  F6c: "scenarios",  // два конца с одним текстом — концы объявляет пласт A
  F17a: "owners", // разность «шаги − владельцы/вопросы» пуста
  F17b: "owners", // узел владельца существует или объявлен new
  F17c: "owners", // спорный шаг без вопроса — двусмысленность решает оператор
  F17d: "owners", // функция аналога не унаследована и не объяснена
  F2: "contracts",  // touched резолвится в узел
  F2b: "contracts", // touched чем-то объяснён
  F2c: "contracts", // touched без why
  F3: "contracts",  // форма, узел, новизна дельты
  F3b: "contracts", // движение from/to
  F3c: "contracts", // дельта без сценария
  F4: "contracts",  // сценарии и их узлы
  F4b: "contracts", // use case без сценария
  F7: "contracts",  // ни одной дельты
  F10: "contracts", // канал use case принадлежит его узлам
  F14: "contracts", // предмет со своим пакетом без модуля изменения
  F17e: "contracts", // дельта на узле, которого B1 не выбрал
  F19: "contracts", // каждый владелец RTM обязан иметь дельту — contracts не сжимает work surface
  F5: "data-failures",   // источник числа
  F6: "data-failures",   // карта отказов и её объявление
  F6d: "data-failures",  // отказ ссылается на существующую ветку
  F15: "data-failures",  // статус «0» — заглушка, а не код отказа
  F16: "data-failures",  // поле вне замкнутого перечня требования
  F8: "coverage",   // поле в чужой сущности, которую никто не пишет
  F11: "coverage",  // требование BRD не унесено
  F9: "*",   // предмет перемотки не удалён
  F0: "*",   // элемент пропадает из разбора — слепит любой проход
  F13: "*",  // ответ оператора теряется одинаково в любом проходе
})

// КТО ЧИНИТ — НЕ ВСЕГДА ТОТ, КТО ВИДИТ. Правило-мост становится видимым в ПОЗДНЕМ пласте (раньше его
// операндов нет), а чинится в РАННЕМ — там, где живёт элемент, который надо дописать. Совпадение
// подразумевается: запись здесь нужна только там, где пласты расходятся.
//
// F8 — единственный такой случай сегодня. Он загорается в D (нужны и поля пласта C, и дельты пласта
// B), а закрывается ДЕЛЬТОЙ, которую пишет только B. Отправить его починку в D значило бы выдать роли
// блокер, закрыть который её наряд ей запрещает, — тупик, который `standards/guardrail.md` называет
// прямо: «блокер, который нечем закрыть».
export const RULE_FIX = Object.freeze({ F8: "contracts" })

// FUNCTION_CONTRACT: passOfBlocker — чей это пласт
//   Dependencies: RULE_PASS, RULE_FIX
//   Antecedent:   любое значение
//   Input:        blocker — строка блокера; fix — спрашивать ли о том, КТО ЧИНИТ (по умолчанию нет:
//                 вопрос «чей пласт» задают оба раза, но правило-мост чинится раньше, чем видится)
//   Consequent:   success: "A" | "B" | "C" | "D" | "*"; код без записи в RULE_PASS даёт `*` —
//                          НЕИЗВЕСТНОЕ ПРАВИЛО ЗВУЧИТ ВСЕГДА. Промолчать было бы тише и хуже: новое
//                          правило, забытое в таблице, исчезло бы из всех четырёх проходов разом, и
//                          его отсутствие никто бы не заметил (шов — frd.test.mjs, «у каждого кода
//                          есть пласт»)
//                 failure: none — тотальна
//   Purity:       pure
export function passOfBlocker(blocker, fix = false) {
  const code = String(blocker == null ? "" : blocker).trim().split(/\s/)[0]
  return (fix && RULE_FIX[code]) || RULE_PASS[code] || "*"
}

// FUNCTION_CONTRACT: entryPass — с какого прохода полоса переигрывает шаг после КРАСНОГО полного суда
//   Input:        blockers — строки блокеров (или один текст в несколько строк)
//   Dependencies: passOfBlocker, PASSES
//   Antecedent:   любые значения; пусто читается как «блокеров нет»
//   Consequent:   success: РАННИЙ пласт среди тех, кто ЧИНИТ (не тех, кто видит): правка нижнего
//                          пласта снимает находки верхних, обратное неверно. Ничего не узнав — "A":
//                          самый ранний вход дешевле неверного
//                 failure: none — тотальна
//   Purity:       pure
export function entryPass(blockers) {
  const lines = (Array.isArray(blockers) ? blockers : String(blockers == null ? "" : blockers).split("\n"))
    .map((x) => String(x).trim()).filter(Boolean)
  const fixers = new Set(lines.map((b) => passOfBlocker(b, true)))
  return PASSES.filter((x) => fixers.has(x))[0] || PASSES[0]
}

// FUNCTION_CONTRACT: forPass — блокеры, которые этот проход имеет право показать роли
//   Input:        blockers — string[]; pass — "A"|"B"|"C"|"D" либо пусто (полный суд)
//   Dependencies: passOfBlocker, PASSES
//   Antecedent:   любые значения; неизвестное имя прохода читается как полный суд — судить всем
//                 строже, чем судить ничем
//   Consequent:   success: блокеры своего пласта И ВСЕХ ПРЕДЫДУЩИХ, плюс `*`. Предыдущие оставлены
//                          намеренно: пласт, закрытый зелёным, роль следующего прохода всё равно
//                          держит в руках и на живом прогоне переписывала его (12:51, 19.08.2026);
//                          порча закрытого пласта должна всплыть в том же круге, а не после D
//                 failure: none — тотальна
//   Purity:       pure
export function forPass(blockers, pass) {
  const list = Array.isArray(blockers) ? blockers : []
  const upto = PASSES.indexOf(String(pass || ""))
  if (upto < 0) return list
  return list.filter((b) => {
    const p = passOfBlocker(b)
    return p === "*" || PASSES.indexOf(p) <= upto
  })
}

// FUNCTION_CONTRACT: checkFrd — the seven rules of docs/intake.md §4, plus F9 (guard against a
//                     rewind erasing what it was sent to repair)
//   Input:        { frd, nodes, known, rewind }
//                 nodes — Set<path> of the map's node keys (steps/intake/map.mjs::parseMap)
//                 rewind — [{ code, node, evidence }], the PREVIOUS review's blockers when it Rejected
//                          (ext/index.mjs::checkFrd reads .agent/review.xml); [] when this is not a
//                          rewind — F9 is then silent, exactly as F5 is silent with no sources
//   Dependencies: provenance, FRD_FORM, steps/review/review.mjs::frdIds
//   Antecedent:   frd — parseFrd's parse; nodes — a Set (empty means the map gave nothing, and then
//                 F2/F3 will name every touched, which is the honest answer for an empty map)
//   Consequent:   success: string[] of blockers, empty = green. Numbers F1..F7 and F9 match
//                          docs/intake.md §4 and are NOT restated in prose here
//                 failure: none — total; "the FRD is bad" is DATA, not a function failure
//   Purity:       pure
// types/members — ВТОРАЯ карта, вычисленный граф шага 3 (steps/scope/computed.mjs::parseComputed):
// `types` отвечает «в каком файле объявлена сущность E», `members` — «какие объявления несёт этот
// файл». Карта роя (`nodes`) на них не годится: рой читает только клетки фокуса, и на живом прогоне
// eddi `AgentConfiguration` не встречается в appgraph.xml НИ РАЗУ, при том что вычисленный граф
// резолвит его в путь. Обе таблицы НЕОБЯЗАТЕЛЬНЫ и по умолчанию пусты: правило, которому нечем
// судить, молчит — та же дисциплина, что у F5 без `sources` и F9 без `rewind`.
// links — рёбра ВЫЧИСЛЕННОГО графа шага 3 ({from, to}): чем один файл держится за другой. Карта роя
// знает рёбра только внутри фокуса, и связки «реализация → интерфейс» в ней обычно нет: эндпоинт
// объявлен интерфейсом, а класс подключается контейнером. Пусто — правила, стоящие на них, молчат.
export function checkFrd({ frd, nodes = new Set(), tests = new Set(), entries = new Set(), edges = [], known = null, rewind = [], types = new Map(), members = new Map(), routes = [], requirements = [], links = [], pass = "", subjects = [], analogue = "", dirs = new Set(), closed = [], b0 = null, answers = "", rtm = null }) {
  // Узлом изменения считается путь РЕПОЗИТОРИЯ, а не только клетка фокуса. Слова и их порядок —
  // core/node.mjs: `swarm` (рой читал) · `repo` (файл есть, не читан) · `new` · `none`.
  const kindOf = nodeKind({ nodes, paths: new Set(members instanceof Map ? members.keys() : []) })
  const inRepo = (p) => kindOf(p) !== KINDS.NONE
  // ВТОРАЯ КАРТА ДЛЯ ВОПРОСА «ЕСТЬ ЛИ У УЗЛА ВХОД». Два разных факта, и оба нужны:
  //   `calledInRepo` — кого ЗОВУТ (ребро указывает НА узел);
  //   `entryThroughLink` — чья внешняя точка объявлена СОСЕДОМ, на которого узел показывает: эндпоинт
  //     пишут на интерфейсе, а работу делает реализация, и ребро «реализация → интерфейс» это и есть.
  // Пусто — правила остаются при карте роя, как было.
  const repoLinks = Array.isArray(links) ? links.filter(Boolean) : []
  const calledInRepo = new Set(repoLinks.map((e) => e.to).filter(Boolean))
  const routeAt = new Set((Array.isArray(routes) ? routes : []).map((r) => r && r.at).filter(Boolean))
  const entryThroughLink = new Set(repoLinks.filter((e) => entries.has(e.to) || routeAt.has(e.to)).map((e) => e.from))

  const B = []
  // Who has an existing caller: a node someone else points an edge AT. `entries` answers the same
  // question for the world outside the repository. Both come from the map (steps/intake/map.mjs) —
  // this module never parses appgraph.xml itself.
  const called = new Set((Array.isArray(edges) ? edges : []).map((e) => e && e.to).filter(Boolean))
  // A map that declares NEITHER an entry NOR an edge says nothing about who calls whom, and the rule
  // below would then redden every `Changed` in the artifact on no evidence at all. It stays silent
  // instead — the same discipline F5 keeps when no sources were supplied: a rule with nothing to judge
  // against is not a rule that judges everything.
  const knowsCallers = entries.size > 0 || called.size > 0

  // F1 — the frying itself: a goal and use cases with an actor, a guarantee and steps.
  if (!frd.goal) B.push("F1 <frd goal> пуст — цель одной фразой обязательна")
  if (!frd.usecases.length) B.push("F1 ни одного <usecase> — требование не прожарено, а переписано")
  for (const u of frd.usecases) {
    const at = u.id || "UC?"
    if (!u.actor) B.push(`F1 ${at}: нет actor — у внешнего входа обязан быть тот, кто его подаёт. Напиши <usecase id="${(u && u.id) || "UC1"}" actor="кто входит" goal="…">, а самого актёра объяви строкой <actor name="…" kind="human|system" via="как он входит"/>`)
    if (!u.post) B.push(`F1 ${at}: нет <post> — гарантия успеха не названа. Напиши <post>что верно ПОСЛЕ успешного прохода</post>: это то, что потом проверит граничный тест`)
    if (!u.steps.length) B.push(`F1 ${at}: нет ни одного <step> — основной сценарий пуст. Напиши шаги по одному действию: <step n="1">кто и что делает</step>, начиная со входа актёра`)
  }

  // F2 — a touched is a NODE of the map, never a name out of the role's head, and never a TEST.
  //
  // BUG_FIX_CONTEXT: live run 1d804798 — the artifact carried a second delta on
  //   FruitResourceTest.java beside the one on FruitResource.java, and passed: the path does resolve
  //   to a node. Step 10 assigns a plan node per delta, so two deltas would have become two tickets
  //   and the test would have been written by a different executor than the code it checks — against
  //   "TDD in one ticket" (docs/concept.md, step 15). The map already binds a module to its test
  //   (`<test path suite>`), which is where step 10 takes both the file and the check command from.
  const touched = new Set(frd.touched)
  // A DELTA'S NODE IS NOT REQUIRED IN `<touched>`, and the rule that required it is gone.
  //
  // BUG_FIX_CONTEXT: live run a3597dd3 (eddi, 1850 files). Two of the three rounds that killed the
  //   step were nothing but this bookkeeping: `checkFrd/1` — five F2 on `<touched>` paths spelled
  //   `eddi/glossary/…` while the deltas said `eddi/configs/glossary/…`; `checkFrd/3` — six F3n on
  //   the same six created modules, "не объявлен <touched>". Eleven blockers of nineteen, and the
  //   role was being asked to keep six INVENTED paths byte-identical in two places at once —
  //   exactly what CLAUDE.md constraint 4 forbids: a key is COPIED BY THE MACHINE.
  //   The blocker also argued its case with something false: «шаг 8 не досчитает рябь».
  //   steps/ripple/ripple.mjs::changeWidth is `deltaNodes ∪ touched` — step 8 counts a delta's node
  //   whether or not it was declared touched, and the seam for that is ripple.test.mjs's own
  //   `touched: []` case.
  // `<touched>` keeps the job it was actually bought for (run 9a8821a7): a node that CHANGES but
  // carries no delta — a page, a template, a build script, anything with no contract to move. There
  // the `why` is the only statement of the work, and F2b/F2c below still demand it.
  // The nodes this change CREATES. Declared once, on the delta — `<touched>` and `<scenario nodes>`
  // derive it from here rather than repeating the attribute, because two places for one fact disagree
  // on the first artifact where the role marks only one of them (CLAUDE.md, constraint 5).
  //
  // Why an ATTRIBUTE and not "an Added delta whose path is not in the map": today a path outside the
  // map is the blocker below, «либо это Unknown, либо путь выдуман». Inferring newness from the form
  // would delete that blocker for every `Added` delta — a typo in a path (`FruitResourse.java`) would
  // silently become a legal new module, step 9 would design it and step 10 would cut a ticket to
  // create a duplicate file. A declaration is the same device `<failures found="no" why>`,
  // `Unknown why` and `cut="N"` use: standards/code.md, constraint 3 — a default is
  // indistinguishable from a fact.
  //
  // BUG_FIX_CONTEXT: live run b857d4a0 (quarkus-rest-json-app-v2-t2). The operator answered the
  //   role's question with «создать новый файл fruit.html», and the FRD had no way to say it: F2/F3
  //   demand a map node, and a file that does not exist yet has none. The role wrote the only legal
  //   thing left — `form="Unknown"` — step 7 refused terminally on it (steps/weight/weight.mjs), and
  //   the band stopped after intake×5 and 281 188 tokens on a change the operator had explicitly
  //   ordered. Step 9 was ready for it all along (checkDesign rule 6 allows a delta node outside the
  //   ripple subgraph — «новый модуль это суждение дизайнера»); nothing could carry the fact there.
  const newNodes = new Set(frd.deltas.filter((d) => d.new === "yes" && d.node).map((d) => d.node))
  // The routes of the FRD, as one set of paths. Declared ONCE here and read by both rules that ask
  // «does a scenario run through this node» — F2b just below and F3c after it. Two spellings of one
  // expression would drift the day `nodes` gains a separator (standards/code.md §1) — and the
  // separator itself is declared once for the whole class, in core/xml.mjs::tokens.
  const scenarioNodes = new Set(frd.scenarios.flatMap((s) => tokens(s.nodes)))
  // F2b — a touched must be EXPLAINED: it carries a delta of its own, or a scenario runs through it.
  // Since step 8 measures the WIDTH of the change by `touched` (docs/ripple.md §3), a node declared
  // touched on nothing but the role's say-so orders the `designer` role for free — and step 10 would
  // owe it a ticket nobody can write, because nothing in the artifact says what changes there.
  const explained = new Set([
    ...frd.deltas.map((d) => d.node).filter(Boolean),
    ...scenarioNodes,
  ])
  for (const t of frd.touched) {
    if (newNodes.has(t)) continue   // a node this change creates: F3 below judges it, the map cannot
    if (!inRepo(t)) B.push(`F2 touched «${t}» не резолвится ни в узел карты роя (appgraph.xml), ни в файл репозитория (graph-computed.xml) — такого пути нет. Скопируй path из карты или из таблицы типов наряда; не помнишь, где лежит тип, — спроси справку (track:"err", kind:"lookup", items:["ИмяТипа"]); файл создаётся этим изменением — объяви его дельтой с new="yes", а не touched`)
    else if (tests.has(t)) B.push(`F2 touched «${t}» — тест: тест это <dod> изменения, а не изменение; он едет в тикет вместе со своим модулем (<test> карты, шаг 10). Сними эту строку и назови вместо неё МОДУЛЬ, который тест проверяет`)
    else if (!explained.has(t)) B.push(`F2b touched «${t}» ничем не объяснён: у него нет своей <delta>, и ни один <scenario nodes> через него не идёт. «Посмотрел, но не менял» — не тронутость: она считается шириной изменения на шаге 8 Одно из двух: заведи ей свою <delta op="…" form="…" node="${t}"/>, либо впиши ${t} в nodes сценария, который через неё проходит.`)
  }
  // F2c — every touched says WHAT changes in it, in its own words.
  //
  // BUG_FIX_CONTEXT: live run 9a8821a7 (quarkus-rest-json-app-v2-t2). `<touched path=".../Fruit.java"/>`
  //   passed F2b because scenario S1's route ran through that node — and the implementation written
  //   afterwards never touched the file at all. "A scenario passes through it" is not "it changes":
  //   the first is a fact about the route, the second about the work. The machine cannot tell them
  //   apart from the outside, so the role is made to SAY it — the same device `<failures found="no"
  //   why=…>` and `Unknown why` use. Presence is machine-checked; the truth of the sentence is judged
  //   by the human who reads the artifact, exactly as it is for those two.
  // A node the change CREATES owes the same sentence — and owes it more, not less: `why` is the only
  // place the artifact says what the new file is for. Gating this on `nodes.has(path)` alone would let
  // every new node through silently the moment F2 above stopped blocking it.
  for (const t of frd.touchedRows || []) {
    const judged = t.path && (newNodes.has(t.path) || (inRepo(t.path) && !tests.has(t.path)))
    if (judged && !String(t.why || "").trim()) {
      B.push(`F2c touched «${t.path}» без why — назови, ЧТО в этом узле меняется. Маршрут сценария через узел не значит, что узел меняется, а ширина изменения (шаг 8) считается по этому списку`)
    }
  }

  // F3c — F2b READ THE OTHER WAY: a delta whose node no scenario runs through. F2b asks a `<touched>`
  // for its explanation; this asks a DELTA for the use case that answers for it. Everything after step
  // 6 is addressed BY THE SCENARIO — step 9's routes are written one per `<scenario>` (docs/data-flow.md
  // §6, rule 5), and its rule 2 then owes a route to every node carrying a delta. A node with a delta
  // and no scenario is work nobody can be told to do: the `designer` may not invent a use case, that is
  // step 6's artifact.
  //
  // `Unknown` and a delta with no `node` are not judged: `Unknown` is already terminal at step 7
  // (FRD_FORM.deltaForms above), and «no node» is F3's own blocker — one defect, one blocker.
  //
  // BUG_FIX_CONTEXT: live runs 300c545b and 9ae1c092 (sandbox/runbox/eddi) — THE SAME deficit paid for
  //   TWICE by the swarm: 863 666 tokens, $1.42, two identical terminal `escalate`s (code 10) on two
  //   lines of step 9's rule 2 — «узел с delta="Added" не встречен ни в одном маршруте» for
  //   `IRestGlossaryStore.java` and `RemoteApiResourceSource.java`. Both nodes carried a delta and stood
  //   in no `<scenario nodes>`, so no part of the swarm answered for them and none could. The blame had
  //   no addressee (steps/design/parts.mjs, `byNode` empty) and the band stopped. Step 8 could not
  //   report the gap either: it seeds the ripple from the UNION `deltaNodes ∪ touched ∪ routeNodes`
  //   (steps/ripple/ripple.mjs), and a union cannot notice a disagreement between its operands.
  //   Judged here, the same defect costs one redelegation of this role and zero tokens of the swarm.
  for (const d of frd.deltas) {
    if (!d.node || d.form === "Unknown" || scenarioNodes.has(d.node)) continue
    // THE BLOCKER NAMES ITS EXITS — all three, one command each. Without the third the role invents a
    // use case for a service module rather than admit the node moves only behind its neighbour: the
    // precedent is `.agent.bak-20260815`, where `TemplateEngineModule` simply vanished from the FRD.
    // БЛОКЕР НАЗЫВАЕТ КАНДИДАТОВ, А НЕ ЗАСТАВЛЯЕТ ВСПОМИНАТЬ. Живой прогон eddi 19.08.2026: F3c
    // держался на шести дельтах три круга подряд, причём КАЖДЫЙ круг на разных — роль переписывала
    // дельты заново вместо того, чтобы дописать узел в сценарий, потому что «сценарий, который через
    // него работает» ей нужно было ВСПОМНИТЬ. Слабая модель выбирает из списка и не выводит из
    // описания (CLAUDE.md, constraint 4: ключ КОПИРУЕТСЯ машиной).
    const known = frd.scenarios.map((x) => `${x.id}${x.uc ? ` (${x.uc})` : ""}`).filter(Boolean)
    B.push(`F3c дельта на «${d.node}» без сценария — ни один <scenario nodes> не называет этот узел. Впиши ${d.node} в nodes ОДНОГО из этих сценариев: ${known.join(" · ") || "их нет вовсе"}; ни один из них через узел не идёт — напиши новый <scenario id="…" uc="…" before="…" after="…" nodes="${d.node}"/>; узел меняется лишь вслед за соседней дельтой — сними эту дельту`)
  }

  // F7 — an FRD without a delta says nothing about the change.
  if (!frd.deltas.length) B.push("F7 ни одной <delta> — изменение контракта не названо")

  // F17 — ПОДПЛАСТ B1: ВЫБОР ВЛАДЕЛЬЦЕВ СУДИТСЯ РАЗНОСТЬЮ СПИСКОВ И ФАКТАМИ B0.
  //
  // T62: до разложения выбор точки изменения был прозой внутри большого артефакта, и самые
  // дорогие ошибки композиции (выдуманный сервис вместо живого владельца; молчаливо пропущенная
  // функция аналога) не ловил никто — F7 требовал «хоть одну дельту», F14 «хоть один модуль из
  // пакета». Здесь каждая функция требования получает владельца ИЛИ вопрос, спорность решает
  // оператор, функция аналога наследуется или объясняется. b0 — кандидатная таблица скрипта
  // (steps/intake/owners/b0.mjs), ОДНА И ТА ЖЕ в наряде и в суде: модель видит то, по чему её судят.
  // Ворот b0 — не только экономия: без кандидатной таблицы разность «шаги − владельцы» не имеет
  // источника правды о шагах, и суд молчит, а не фантазирует.
  if (b0 && Array.isArray(b0.steps)) {
    const stepIds = frd.usecases.flatMap((u) => (u.steps || []).map((_, i) => `${u.id}/${i + 1}`))
    const ownedSteps = new Set(frd.owners.map((o) => String(o.step || "")).filter(Boolean))
    // ВОПРОС МОЖЕТ КРЫТЬ ГРУППУ ШАГОВ ОДНОГО СПОРА: step="UC5/1 UC5/2 UC5/3" — модель пишет один
    // вопрос на связный спор, и это экономит паузы оператора (живой круг 25.08: судья ждал
    // ровно один id и краснел на каждую строку группы). Id режутся пробелами.
    const askedSteps = new Set(frd.questions.flatMap((q) => String(q.step || "").split(/\s+/)).filter(Boolean))

    // F17a — разность «шаги − владельцы/вопросы» пуста (паттерн F11, уровень глубже)
    for (const id of stepIds) {
      if (ownedSteps.has(id) || askedSteps.has(id)) continue
      B.push(`F17a шаг ${id} без владельца и без вопроса: назначь <owner step="${id}" node="…"/> из кандидатов наряда, или узел создаётся — <owner step="${id}" node="…" new="yes"/>, или выбор неясен — <question step="${id}" subject="…" why="…"/>`)
    }

    // F17b — узел владельца существует или честно объявлен новым
    for (const o of frd.owners) {
      if (!o.node) { B.push(`F17b <owner step="${o.step || "?"}"> без node — владелец обязан быть путём`); continue }
      if (o.new === "yes") continue
      if (!inRepo(o.node)) B.push(`F17b владелец «${o.node}» нет ни в карте, ни в репозитории — скопируй путь из кандидатов; файл создаётся — добавь new="yes"`)
      else if (tests.has(o.node)) B.push(`F17b владелец «${o.node}» — тест: тест не носитель изменения, назови модуль`)
    }

    if (Array.isArray(b0.steps)) {
      // F17c — спорный шаг без вопроса: равноправных кандидатов ≥2, и это решение оператора.
      // ВЫХОД ЧЕРЕЗ ОТВЕТ: владелец, назначенный по ответу оператора, спор закрывает — ответ
      // оператора называет модуль поимённо (T64: свежий круг пишет владельцев напрямую из
      // {ANSWERED}). Суд сверяет basename владельца с текстом ответов — оба артефакта машинные,
      // это не придирка к форме вопроса. Живой круг 25.08: 10 F17c на шагах, давно закрытых
      // ответами, — петля починки на ровном месте.
      const ownerOf = new Map()
      for (const o of frd.owners) for (const sid of String(o.step || "").split(/\s+/).filter(Boolean)) ownerOf.set(sid, String(o.node || ""))
      const answersText = String(answers || "").toLowerCase()
      const answeredOwner = (id) => {
        const node = ownerOf.get(id)
        return Boolean(node) && answersText.includes(String(node).split("/").pop().replace(/\.[^.]+$/, "").toLowerCase())
      }
      const disputed = new Set(b0.steps.filter((s) => s.disputed).map((s) => s.id))
      for (const id of disputed) {
        if (askedSteps.has(id)) continue
        if (answeredOwner(id)) continue
        B.push(`F17c шаг ${id} спорный (в наряде ≥2 равноправных кандидата), а вопроса нет — двусмысленность решает оператор: <question step="${id}" subject="какой из кандидатов" why="…"/>`)
      }
      // F17d — функция аналога: унаследована владельцем или объяснена вопросом.
      // ПОКРЫТИЕ ШАГОМ: топ-1 кандидат покрыт, когда КАЖДЫЙ его шаг закрыт владельцем (любым —
      // выбор сделан явно) или вопросом (решение ушло оператору). Искать имя файла в тексте
      // вопроса — придирка к форме: приёмка 25.08 дала ложный F17d на шагах, где вопрос УЖЕ
      // стоял, но называл шаг, а не кандидата.
      const ownedNodes = new Set(frd.owners.map((o) => String(o.node || "")))
      for (const f of b0.analogueFunctions || []) {
        if (ownedNodes.has(f.path)) continue
        if ((f.steps || []).every((id) => askedSteps.has(id) || ownedSteps.has(id))) continue
        B.push(`F17d функция аналога «${String(f.path).split("/").pop()}» нужна шагам (${(f.steps || []).join(", ") || "по роли"}), но ни один владелец её не наследует и вопроса нет — либо <owner … node="${f.path}"/>, либо объясни вопросом, почему функция переезжает в новое место`)
      }
    }
  }

  // F17e — ПОДПЛАСТ B2: форма судится ТОЛЬКО на узлах, выбранных в B1. Владелец — подтверждённый
  // факт предыдущего пласта; дельта мимо него — новая точка, проведённая в обход суда о выборе.
  if (frd.owners.length && frd.deltas.length) {
    const ownedNodes = new Set(frd.owners.map((o) => String(o.node || "")).filter(Boolean))
    for (const d of frd.deltas) {
      if (d.node && !ownedNodes.has(d.node)) {
        B.push(`F17e дельта на «${d.node}», которого B1 не выбрал владельцем — выбор точки съехал назад в прозу: верни узел в таблицу B1 (или спроси оператора), потом ставь форму`)
      }
    }
  }

  // F19 — ПОДПЛАСТ contracts: КАЖДЫЙ владелец RTM обязан иметь дельту или touched.
  //
  // T67: живой круг 26.08 — contracts МОЛЧА УДАЛИЛ 7 из 14 owner-строк, сохранив только
  // узлы с дельтами. F17e однонаправленный (дельта мимо владельца — блокер; владелец
  // без дельты — молчит), F17a зелёный (шаги сохранили других владельцев), F14 зелёный
  // (в пакете есть хоть один модуль). Результат: RTM заявил 14 узлов, план получил 7.
  // Правило: если rtm.md доступен (собран owners-скриптом), каждый НЕ-новый узел RTM
  // обязан иметь <delta node> или <touched path> в ЭТОМ артефакте.
  if (rtm && Array.isArray(rtm.rows) && rtm.rows.length && frd.deltas.length) {
    const withForm = new Set([
      ...frd.deltas.map((d) => String(d.node || "")),
      ...frd.touched.map((t) => String(t.path || t || "")),
    ].filter(Boolean))
    const seen = new Set()
    for (const row of rtm.rows) {
      for (const tok of row.dims.owners || []) {
        if (!tok.path || seen.has(tok.path)) continue
        seen.add(tok.path)
        if (tok.flags.has("new")) continue    // new-узел будет в дельтах как Added(new)
        if (!withForm.has(tok.path)) {
          B.push(`F19 владелец «${String(tok.path).split("/").pop()}» (${tok.path}) заявлен в rtm.md, но без дельты и без touched — contracts сжал work surface; верни владельца и дай ему форму (или <touched why=…>, или объясни вопросом)`)
        }
      }
    }
  }

  // F3 — the delta's form, and its node when the form claims to know one.
  for (const d of frd.deltas) {
    const at = d.op || "(delta без op)"
    // The blocker's TEXT is the whole repair instruction the role gets — it rides in the FEEDBACK of
    // the redelegation and nothing else does. A generic sentence is affordable only when the role can
    // work out the answer on its own.
    //
    // BUG_FIX_CONTEXT: live run 6889fc3f (quarkus-rest-json-app-v2-t3), the first task where a new
    //   file was unavoidable. The role wrote `<delta form="Added" node=".../fruit-card.html"
    //   new="yes"/>` with no `op` — because its own rule says `op` is «the entry AS THE MAP SPELLS
    //   IT», and a file that does not exist yet is in no map. This blocker then said only «операция
    //   не названа», which the role could not act on: it spent one loop leaving `op` out, one loop
    //   moving the delta onto the list page (blocked as `Changed` with no caller), one more leaving
    //   it out again — three redelegations, 392 378 tokens, `escalate`. S26 introduced `new="yes"`
    //   and never said what `op` means for a module that does not exist yet; the answer lives in the
    //   requirement, not in the map, and now the message says so.
    //
    // A STUB IS NOT AN ANSWER (OP_STUB above, run 088fb3ee): `op="-"` is judged exactly as `op=""`,
    // and the blocker quotes what was written so the role sees which of its own lines is meant.
    const op = String(d.op || "").trim()
    if (!op || OP_STUB.test(op)) {
      const wrote = op ? `с op="${op}"` : "без op"
      B.push(d.new === "yes"
        ? `F3 <delta new="yes"> на «${d.node || "(без node)"}» ${wrote} — у создаваемого модуля op это ВНЕШНЯЯ ТОЧКА, которую он заведёт: адрес страницы, команда, топик, имя функции — словами требования, а не именем поведения и не прочерком`
        : `F3 <delta> на «${d.node || "(без node)"}» ${wrote} — операция не названа`)
    }
    if (!FRD_FORM.deltaForms.includes(d.form)) {
      B.push(`F3 ${at}: form="${d.form || ""}" — допустимо ${FRD_FORM.deltaForms.join(" | ")}`)
      continue
    }
    if (d.form === "Unknown") {
      if (!d.why) B.push(`F3 ${at}: Unknown без why — оператору нечего показать на шаге 7. Напиши <delta op="…" form="Unknown" why="почему не удалось классифицировать: два кандидата в карте / контракт не виден"/>`)
      continue
    }
    if (!d.node) { B.push(`F3 ${at}: ${d.form} без node — дельта обязана опираться на узел карты. Допиши node="path из карты"; узла нет вовсе — тогда это form="Unknown" с why`); continue }
    // F3n — the module this change CREATES. Everything the rules below ask of a delta is asked of it
    // too, except the one thing that cannot be true of a file that does not exist yet: being in the
    // map. The two claims are checked in the opposite direction, and the form is pinned: a module
    // that is not there yet cannot have its contract Changed, Removed or Fixed — nothing to move.
    if (d.new === "yes") {
      if (inRepo(d.node)) B.push(`F3 ${at}: new="yes", но файл «${d.node}» в репозитории ЕСТЬ — это не новый модуль, сними признак`)
      if (d.form !== "Added") B.push(`F3 ${at}: new="yes" с формой ${d.form} — у модуля, которого ещё нет, контракт двигаться не может. Поставь form="Added" и сними from/to, либо сними new="yes", если модуль в репозитории есть`)
      continue
    }
    if (!inRepo(d.node)) B.push(`F3 ${at}: файла «${d.node}» нет ни в карте роя, ни в репозитории — либо это Unknown, либо путь выдуман, либо модуль создаётся этим изменением и тогда дельта несёт new="yes"`)
    else if (tests.has(d.node)) B.push(`F3 ${at}: узел «${d.node}» — тест: тест это <dod> изменения, а не изменение; назови модуль, который меняется, тест приедет с ним в один тикет (<test> карты, шаг 10)`)

    // `Changed`/`Removed` are defined BY THEIR EFFECT ON AN EXISTING CALL (steps/intake/intake.md,
    // STRATEGY §8), so they are only sayable about a node that HAS one: an `<api>` of its own, or an
    // incoming edge from another module. About a node with neither, "the existing call breaks" is a
    // statement about nothing — and it weighs `major` (steps/weight/weight.mjs), ordering step 9 for
    // free.
    //
    // BUG_FIX_CONTEXT: live run e2905b82 (sandbox/runbox/quarkus-rest-json-app-v2-t2). The FRD carried
    //   `<delta op="fruit-card-rendering" form="Changed" node=".../fruits.html">` — an AngularJS page
    //   that gained a card. In the map that node has no `<api>` and `fanin="0"`: nothing calls it, it
    //   calls the resource. The weight came out `major` and step 8 ordered a design on what is a purely
    //   additive change. The same breed as discrepancy A of S22 (docs/weight.md §2), one layer down:
    //   there the definitions were missing, here they had nothing to bite on.
    // ...И ТОЛЬКО ПО УЗЛУ, КОТОРЫЙ РОЙ ЧИТАЛ. `entries` и `called` собраны из карты РОЯ: про файл вне
    // фокуса она не говорит «его никто не зовёт», она не говорит о нём ничего. Живой прогон
    // 19.08.2026: `AgentConfiguration.java` вне фокуса, а зовущие у него в репозитории есть
    // (`CapabilityRegistryService.register(String, AgentConfiguration)` — вычисленный граф). Судить
    // такой узел этим правилом значит выдавать незнание за факт — та же дисциплина, что у
    // `knowsCallers` выше: правилу, которому нечем судить, судить нечего.
    // ...и вызов ищется в ОБЕИХ картах: рой видит рёбра только внутри фокуса, а класс, чей эндпоинт
    // объявлен интерфейсом, подключается контейнером и входящего ребра в ней не имеет (живой прогон
    // 19.08.2026, `RestExportService` — ложный блокер дважды подряд).
    else if (knowsCallers && nodes.has(d.node) && (d.form === "Changed" || d.form === "Removed") && !entries.has(d.node) && !called.has(d.node) && !calledInRepo.has(d.node) && !entryThroughLink.has(d.node)) {
      B.push(`F3 ${at}: «${d.node}» — ${d.form}, но у узла нет ни своей внешней точки (<api>), ни входящего вызова: ломаться нечему. Поведение, которого не было, это Added; поведение wrong→right — Fixed`)
    }

    // F3b — a delta is a MOVEMENT. `Changed` and `Fixed` claim one explicitly, so they owe both ends
    // of it and the ends must differ; for any form, two equal ends describe nothing that moved.
    //
    // BUG_FIX_CONTEXT: live run 9a8821a7 (quarkus-rest-json-app-v2-t2). Beside the one real delta the
    //   artifact carried three more — `GET /fruits`, `POST /fruits`, `DELETE /fruits`, each
    //   `form="Fixed" from="unchanged" to="unchanged"` — the role listing the operations that do NOT
    //   change. Nothing judged `from`/`to`, so it passed. Step 10 makes a plan node per delta, so that
    //   is three tickets for work nobody has to do; and `Fixed` weighs `patch`, so an artifact without
    //   the real `Added` beside them would have been weighed on "nothing changed". The same rule F4
    //   already applies to scenarios ("before и after совпадают — сценарий зелен и до изменения").
    const from = String(d.from || "").trim()
    const to = String(d.to || "").trim()
    if (d.form === "Changed" || d.form === "Fixed") {
      if (!from || !to) B.push(`F3b ${at}: ${d.form} без from/to — движение не названо, а форма его утверждает. Допиши оба конца: from="как контракт выглядит сейчас" to="как станет"; концы совпадают — это не дельта, сними её`)
      else if (from === to) B.push(`F3b ${at}: from и to совпадают («${from}») — ничего не двинулось. Операция, которая не меняется, дельтой не бывает: сними эту строку целиком, а если движение всё же есть — напиши в from нынешний контракт, в to требуемый`)
    } else if (from && to && from === to) {
      B.push(`F3b ${at}: from и to совпадают («${from}») — ничего не двинулось. Операция, которая не меняется, дельтой не бывает: сними эту строку целиком, а если движение всё же есть — напиши в from нынешний контракт, в to требуемый`)
    }
  }

  // F4 — a scenario that is green before the change is a finding of acceptance, not a test.
  //
  // `nodes` is the scenario's ROUTE, and it is judged here because here is the only rail that can fix
  // it: a red check redelegates to this role. Step 8 seeds the ripple subgraph from these paths
  // (docs/ripple.md §4) and step 9's `checkDesign` rule 1 then demands a contract for every node of
  // the route — which the role copies OUT of that subgraph and has no other source for. A node named
  // here but absent from the map would therefore reach step 9 as a node with no contract, and step 8
  // has no redelegation to fix it with — only a terminal `blocked`.
  if (!frd.scenarios.length) B.push("F4 ни одного <scenario> — различать изменение нечем")
  const ucs = new Set(frd.usecases.map((u) => u.id))
  for (const sc of frd.scenarios) {
    const at = sc.id || "(scenario без id)"
    if (!sc.uc || !ucs.has(sc.uc)) B.push(`F4 ${at}: uc="${sc.uc || ""}" — такого <usecase> нет. Скопируй id из шапки use case (<usecase id="UC1" …>); сценарий описывает работу, которой нет ни в одном use case, — напиши сам use case`)
    if (!sc.before || !sc.after) B.push(`F4 ${at}: before/after пусты — сценарий не различающий. Напиши before="что происходит СЕЙЧАС" after="что станет ПОСЛЕ": разница между ними и есть работа`)
    else if (sc.before.trim() === sc.after.trim()) B.push(`F4 ${at}: before и after совпадают — сценарий зелен и до изменения. Напиши в before нынешний отказ (404, пустой список, ошибка), в after — требуемый исход`)
    const route = tokens(sc.nodes)
    if (!route.length) B.push(`F4 ${at}: nodes пуст — через какие узлы карты идёт сценарий, не названо. Перечисли пути через пробел: nodes="src/rest/X.java src/model/Y.java" — от входа до места, где рождается результат`)
    // A scenario may run through a node this change creates — that is the whole point of adding one.
    for (const p of route) if (!inRepo(p) && !newNodes.has(p)) B.push(`F4 ${at}: узла «${p}» нет ни в репозитории, ни среди создаваемых этим изменением (<delta new="yes">) — маршрут сценария опирается на выдуманный путь. Скопируй path из карты или из таблицы типов наряда; не знаешь, где лежит тип, — спроси справку (track:"err", kind:"lookup"); узел создаётся этим изменением — объяви его <delta new="yes">`)
  }

  // F4b — the same binding, read the other way. F4 above refuses a scenario whose `uc` resolves to
  // nothing; this refuses a use case no scenario distinguishes. The link is TOTAL in both directions
  // because everything downstream is addressed BY THE SCENARIO: step 9's rule 5 demands a route per
  // scenario of the FRD, its rule 13 takes the candidate nodes out of `<scenario nodes>`, and step 11
  // owes a checklist line per scenario. A use case with none reaches the plan with no countable
  // address at all — declared in the artifact, invisible to every judge after it.
  //
  // BUG_FIX_CONTEXT: live run 7588bf0e-5f69-4fb0-9ba1-bdacee628817
  //   (quarkus-rest-json-app-v2-t2). The FRD declared two use cases and one scenario — `UC2`, the
  //   inline card on the list page, had none — and step 6 closed GREEN: `deltas=1 unknown=0
  //   scenarios=1 touched=1`. F4 was satisfied (one scenario exists, its `uc` resolves), F2b was
  //   satisfied (the page was explained by a neighbour's delta), and the requirement travelled to the
  //   plan as words. The judge is this rule, not the operator: the repair rail already exists — the
  //   `intake` role writes the missing scenario out of the requirement it has already fried.
  const covered = new Set(frd.scenarios.map((sc) => sc.uc).filter(Boolean))
  for (const u of frd.usecases) {
    if (!u.id || covered.has(u.id)) continue
    B.push(`F4b ${u.id} «${u.goal}» — нет <scenario uc="${u.id}">. ` +
           `Напиши: <scenario id="…" uc="${u.id}" before="как сейчас" after="как станет" nodes="путь путь"/>`)
  }

  // F5 — every quantity of the requirement has a named, declared source.
  for (const f of frd.fields) B.push(...provenance(`поле ${f.name || "(без name)"}`, f.domain, f.source, known))
  for (const n of frd.nfrs) B.push(...provenance(`нфт ${n.subject || "(без subject)"}`, n.fit, n.source, known))

  // F6 — the failure-mode map is DERIVED from the extensions, not composed beside them; and its
  // ABSENCE is an answer, not silence.
  //
  // BUG_FIX_CONTEXT: live run e82192db — the artifact carried no <failure> and no `error` on any
  //   <ext>, and this rule compared two EMPTY sets and passed. "The service has no failure modes"
  //   and "the role skipped the section" were indistinguishable to the machine. The service was then
  //   read by hand and the role turned out to be RIGHT (FruitResource returns a collection from all
  //   three methods: no Response.status, no throw, no validation, no ExceptionMapper anywhere), which
  //   is exactly why the fix is NOT "every <ext> must carry a code" — that would order the role to
  //   invent a 400 this repository has no idiom for. It is: say it out loud, as the map says
  //   `found="no"` about toggles and the spec.
  if (!frd.failures.length && frd.failuresFound !== "no") {
    B.push('F6 карта отказов пуста и не объявлена — либо <failure code=… status=… client=… operator=… from=…/>, либо <failures found="no" why="почему их нет"/>')
  }
  if (frd.failuresFound === "no" && !frd.failuresWhy) {
    B.push('F6 <failures found="no"> без why — «распознаваемых отказов нет» это вывод из репозитория, а не пропуск раздела')
  }
  // NO_CODE — the branch that fails without a code of its own, said OUT LOUD.
  //
  // BUG_FIX_CONTEXT: live run a3597dd3 (eddi). The operator had decided that a missing glossary term
  //   resolves to an empty string — lenient, no error at all — and the role wrote
  //   `<ext id="4a" error="none" outcome="term не найден …"/>`. This rule read "none" as a CODE, the
  //   failure map had no such row, and the artifact was refused. The legal move existed — leave
  //   `error` off — but nothing said so: the order's example carries `error="CODE"` on every `<ext>`.
  //   So the role did what this repository does everywhere else and DECLARED the absence, the way
  //   `<failures found="no">`, `<toggles found="no">`, `<subject found="no">` and `Unknown why` do.
  //   The form was missing a word, not the role a rule: replaying this guardrail over that same
  //   artifact leaves zero blockers once "none" means what the role meant by it.
  // An omitted `error` keeps meaning the same thing — F6 has always judged only the codes that exist.
  const NO_CODE = "none"
  const errs = new Set(frd.usecases.flatMap((u) => u.exts.map((e) => e.error).filter((e) => e && e !== NO_CODE)))
  const codes = new Set(frd.failures.map((f) => f.code).filter(Boolean))
  for (const e of errs) if (!codes.has(e)) B.push(`F6 код «${e}» из <ext> не описан в карте отказов. Напиши строку: <failure code="${e}" status="HTTP-код" client="что видит клиент" operator="что видит оператор" from="UC1/1a"/>`)
  for (const c of codes) if (!errs.has(c)) B.push(`F6 код «${c}» карты отказов не встречен ни одним <ext>. Либо назови ветку, которая его поднимает — <ext id="2a" error="${c}" outcome="что наблюдает актёр"/>, либо сними строку отказа: код, который никто не поднимает, реализовать нечем`)

  // F15 — СТАТУС «0» — ЭТО ЗАГЛУШКА, А НЕ КОД ОТКАЗА.
  //
  // BUG_FIX_CONTEXT: live run 25.08 (eddi, DOS-535). Три отказа несли status="0" и
  //   operator="no operator action": что происходит с неразрешённым плейсхолдером
  //   {{glossary.<term>}} и кто решил «конфликт версий при импорте пропускается» — решения
  //   оператора, которых в TASK.md нет. Модель молча ВЫДУМАЛА политику вместо вопроса,
  //   зелёный F6 её принял, и план понёс поведение, которого никто не заказывал. «0» —
  //   признание роли, что кода у отказа нет: запрос решения, спрятанный в атрибут.
  for (const f of frd.failures) {
    if (String(f.status || "").trim() !== "0") continue
    B.push(`F15 отказ ${f.code || "(без code)"} объявлен со status="0" — у отказа нет кода, а его поведение никто не решал. Это решение оператора: спроси — <question subject="статус и поведение отказа ${f.code || ""}" why="какой код несёт отказ и что видят клиент и оператор"/>; код известен из требования или репозитория — впиши его; отказа с таким поведением никто не заказывал — сними строку`)
  }

  // F16 — ПОЛЕ ПРОТИВ ЗАМКНУТОГО ПЕРЕЧИСЛЕНИЯ ТРЕБОВАНИЯ.
  //
  // BUG_FIX_CONTEXT: live run 25.08 (eddi, DOS-535). R13 закрыла перечень полей словами «only
  //   id + version + terms», FRD молча дописал resourceType: F5 судил источник числа, F8 — чужую
  //   сущность, и никто не спросил, кто разрешил поле вне перечня. Перечень замкнуло требование —
  //   слово «only» пришло из TASK.md, не из вкуса суда, и суд читает его дословно. Матч мягкий
  //   НАМЕРЕННО: перечислённое в «no description, no category» не входит в names по построению
  //   (регулярка берёт только список после «only»), а поле сущности, чей перечень требование не
  //   закрывало, не судится вовсе — молчание здесь честнее шума.
  const words = (s) => new Set(String(s || "").toLowerCase().split(/[^\w]+/).filter(Boolean))
  for (const f of frd.fields) {
    const mine = words(f.in)
    const name = String(f.name || "").trim().toLowerCase()
    if (!mine.size || !name) continue
    for (const c of closed) {
      if (![...words(c.entity)].some((w) => mine.has(w))) continue
      if (c.names.has(name)) continue
      B.push(`F16 поле ${f.name} в «${f.in}» вне замкнутого перечня требования ${c.req}: только ${[...c.names].join(" + ")}. Перечень закрыт словом «only» — поле нужно, но требование его не называет: спроси оператора <question subject="поле ${f.name} в ${f.in}" why="требование ${c.req} перечисляет не всё"/>; поля нет — сними строку`)
    }
  }

  // F6c — one cause of failure, a different OBSERVATION on every layer. The ends are taken from
  // `endsOf` (above, this module), side `out`: `UCx/post` and every `<ext outcome>` — exactly the
  // set step 9's dictionary collapses onto, so the rule judges the cause of the dead end and not its
  // symptom. Two ends of DIFFERENT use cases may not carry one text; two ends of ONE use case may (two
  // branches of one layer with one observation is a legal shape, and step 9's dictionary rule judges
  // it there).
  //
  // One blocker per COLLIDING END — each later end is paired with the first end carrying that text —
  // so three use cases on one text cost two blockers, not nine: a role repairing an artifact pays a
  // redelegation per round, not per line, and n² lines of one defect drown the other rules.
  //
  // BUG_FIX_CONTEXT: live run 9b019d80-d28e-4d40-bc94-15bb9b14fff6 (quarkus-rest-json-app-v2-t2). The
  //   FRD declared UC1 (`actor="api-client"`) and UC2 (`actor="list-page-user"`), both with
  //   `<ext error="FRUIT_NOT_FOUND" outcome="фрукт не найден, вернуто HTTP 404"/>` — VERBATIM the same
  //   text. F6 compares only the presence of a code, so the artifact closed green and incomplete:
  //   `{"ok":true,"deltas":1,"scenarios":2,"touched":1}`. The page had no end of its own for the
  //   failure branch, and step 9's pass C span the fork «не доставить 404» (rule 10) against «ответить
  //   карточкой» (rule 11) until it escalated — 212 107 tokens, $0.41. The missing thing was a
  //   sentence in the FRD, not a rule of step 9.
  const seen = new Map()
  for (const e of endsOf(frd)) {
    if (e.side !== "out") continue
    const text = String(e.text || "").trim()
    const first = seen.get(text)
    if (!first) { seen.set(text, e); continue }
    if (first.uc === e.uc) continue
    B.push(`F6c ${first.token} и ${e.token} несут один текст конца «${text}» — это разные use case, а отказ и успех наблюдаются на каждом слое ПО-СВОЕМУ. outcome ветки — отрицание <post> СВОЕГО use case, словами своего актёра`)
  }

  // F6d — `from` names ALL the branches of its code. One `<failure>` row per code stays; its `from` is
  // a LIST (`from="UC1/1a UC2/2a"`, separators — whitespace or comma), and coverage is checked both
  // ways: every branch carrying the code is named by the row, every token of `from` resolves to an
  // existing branch. Two of the three live forms already write the list (`t3`, `eddi`); the order's
  // schema showed one token and said nothing about a list — which is where 9b019d80's gap came from.
  //
  // ONE DEFECT, ONE BLOCKER: only the codes F6 is silent about are judged here. A code missing from the
  // failure map entirely — or a row whose code no `<ext>` raises — is already F6's blocker, and a
  // second line about the same defect buys the role nothing but a longer FEEDBACK.
  const judged = new Set([...codes].filter((c) => errs.has(c)))
  // The token of a branch is built by the SAME expression as steps/review/review.mjs::frdIds — two
  // spellings of one token drift the day an id changes shape.
  const branchTokens = new Set()
  const branches = []
  for (const u of frd.usecases) {
    for (const x of u.exts) {
      if (!u.id || !x.id) continue
      const token = `${u.id}/${x.id}`
      branchTokens.add(token)
      if (x.error && x.error !== NO_CODE) branches.push({ token, code: x.error })
    }
  }
  const named = new Map()
  for (const f of frd.failures) {
    if (!judged.has(f.code)) continue
    const branchesOfCode = tokens(f.from)
    if (!named.has(f.code)) named.set(f.code, new Set())
    for (const t of branchesOfCode) {
      named.get(f.code).add(t)
      if (!branchTokens.has(t)) {
        B.push(`F6d <failure code="${f.code}"> ссылается на «${t}», а такой ветки нет: токен ветки это id use case и id её <ext> через косую черту (UC1/1a)`)
      }
    }
  }
  for (const b of branches) {
    if (!judged.has(b.code)) continue
    if (named.get(b.code) && named.get(b.code).has(b.token)) continue
    B.push(`F6d ветка ${b.token} поднимает «${b.code}», но не названа в from его строки — <failure code="${b.code}" … from="…"/> перечисляет ВСЕ ветки этого кода: from="UC1/1a UC2/2a"`)
  }

  // F11 — КАЖДОЕ ТРЕБОВАНИЕ BRD ПРОЙДЕНО, И РОЛЬ СКАЗАЛА, ЧЕМ ОНО УНЕСЕНО.
  //
  // BUG_FIX_CONTEXT: форма t2, два прогона подряд. Требование нерегрессии «существующий вызов
  //   остаётся без изменений» не доехало до FRD НИЧЕМ — ни use case, ни сценарием, ни nfr, ни
  //   дельтой, — и не поймано никем: `checkFrd` требований BRD физически не получал (BRD входил
  //   только словарём чисел для F5), а критик строил чек-лист ИЗ FRD, где требования уже не было.
  //   Пропажу нечем было обнаружить, потому что её НЕТ: молчание артефакта неотличимо от согласия.
  //
  // ПРАВИЛО — РАЗНОСТЬ ДВУХ СПИСКОВ НОМЕРОВ, и ничего кроме. Номера требований приходят из brd.md
  // тем же парсером, каким судит шаг 2; из артефакта берутся строки `<carried req>`; блокер — это
  // требование, номера которого среди них нет. Атрибут `by` здесь НЕ ЧИТАЕТСЯ.
  //
  // BUG_FIX_CONTEXT: живой прогон 4c8f26eb (eddi, 19.08.2026) — правило судило ещё и АДРЕС в `by`,
  //   резолвя его против собственного набора элементов. Набор оказался уже языка требования (в нём
  //   не было полей, а у `<nfr>` читалось несуществующее свойство `id`), и роль шесть кругов писала
  //   ВЕРНЫХ носителей — `field:id field:version field:terms` для требования «поля ресурса только
  //   id + version + terms» — получая «такого элемента нет». Прогон умер на шаге 6: 572К токенов, до
  //   критика не дошло ничего.
  //
  // Почему адрес больше не блокер: кривой `by` не создаёт МОЛЧАЛИВОЙ пропажи, а создаёт видимое
  // противоречие, и его ловят двое ниже по полосе — обратный список критика (элемент, на который не
  // показала ни одна строка, всплывает как «этого никто не просил») и сам критик, судящий, исполняет
  // ли названный элемент требование. Отсутствующая строка не самозалечивается ничем — потому
  // блокером осталась только она.
  // F14 — ПРЕДМЕТ ТРЕБОВАНИЯ СО СВОИМ ПАКЕТОМ ОБЯЗАН ИМЕТЬ МОДУЛЬ В ИЗМЕНЕНИИ.
  //
  // Ни одного списка слов: правило стоит на трёх фактах, добытых полосой. `subjects` — якоря, которые
  // шаг 2 выписал из требования; `dirs` — каталоги, которые знает вычисленный граф шага 3; модули
  // изменения — дельты и `touched` этого артефакта. Предмет, у которого в репозитории ЕСТЬ свой пакет,
  // а в изменении НЕТ ни одного модуля из него, — либо забытая работа, либо предмет не о работе, и
  // сказать это может только роль.
  //
  // Предмет БЕЗ пакета молчит: его создаёт это изменение, трогать нечего. Аналог (`analogue:` из BRD)
  // не судится вовсе: его копируют, а не меняют.
  //
  // ЦЕНА НАЗВАНА: на артефакте прогона 19.08.2026 шесть предметов дали три блокера — `agent` (дефект),
  // `descriptor` (похоже, дефект) и `configuration` (шум: каталог совпал именем случайно). Один лишний
  // круг против потерянного требования и забракованного плана.
  //
  // BUG_FIX_CONTEXT: тот же прогон. `subjects[]` несёт `agent`, репозиторий несёт `configs/agents`
  //   (13 файлов, среди них `AgentConfiguration.java`), изменение не трогает ни одного модуля оттуда.
  //   Требование R11 («глоссарий подключён к агенту ссылкой в agent config») закрылось строкой
  //   `<carried req="R11" by="UC5/1"/>`, где шаг ЧИТАЕТ ссылку, а не создаёт её; F11 принял строку
  //   (элемент резолвится), критик написал `Pass`, и гейт 1 забраковал план целиком.
  const stem = (w) => String(w || "").trim().toLowerCase().replace(/(ies|es|s)$/, "")
  if (subjects.length && dirs.size) {
    const mine = [...new Set([...frd.deltas.map((d) => d.node), ...frd.touched])].filter(Boolean).map((x) => String(x).toLowerCase())
    const an = stem(analogue)
    for (const raw of subjects) {
      const a = stem(raw)
      if (!a || (an && (a.includes(an) || an.includes(a)))) continue
      const home = [...dirs].some((d) => String(d).split("/").some((seg) => stem(seg) === a))
      if (!home) continue
      if (mine.some((p) => p.split("/").some((seg) => stem(seg) === a || stem(seg.replace(/\.[a-z]+$/, "")).includes(a)))) continue
      B.push(`F14 предмет требования «${raw}» есть в репозитории своим пакетом, но изменение не трогает ни одного модуля оттуда — требование о нём никто не выполнит. Объяви <delta node="путь из этого пакета" …/>, если работа там есть; узел меняется без сдвига контракта — <touched path="…" why="…"/>; предмет к этой работе не относится — напиши <question subject="${raw}" why="почему его трогать не надо"/>`)
    }
  }

  if (Array.isArray(requirements) && requirements.length) {
    const said = new Set(frd.carried.map((c) => String((c && c.req) || "").trim()).filter(Boolean))
    for (const req of requirements) {
      const id = String(req || "").trim()
      if (!id || said.has(id)) continue
      B.push(`F11 требование ${id} не пройдено: строки <carried req="${id}" by="…"/> в артефакте нет. Пройди требования brd.md ПО ОДНОМУ и на каждое назови носителя — use case, его шаг, сценарий, поле, дельту или nfr`)
    }
  }

  // F10 — КАНАЛ USE CASE ПРИНАДЛЕЖИТ ЕГО СОБСТВЕННЫМ УЗЛАМ.
  //
  // BUG_FIX_CONTEXT: живой прогон eddi/DOS-535. У актёра `api-client` один
  //   `via="HTTP /glossarystore/glossaries"`, и его получили ВСЕ восемь use case этого актёра —
  //   включая UC6 (экспорт агента), UC7 (импорт) и UC8 (синхронизация с удалённым узлом), которые
  //   входят через backup-эндпоинты (`GET /backup/export/{agentFilename}`, `POST /backup/import/sync`
  //   — обе строки лежат в вычисленном графе репозитория). Граничные наряды 05-07 велели исполнителю
  //   проверять экспорт агента через CRUD словарей: такой тест написать нельзя.
  //
  // Судится ПРИНАДЛЕЖНОСТЬ, а не текст: у пути из канала есть владелец — узел, который его объявляет
  // (`<api>` карты) или создаёт (дельта, чей `op` этот путь называет). Если владелец известен и НИ
  // ОДИН из владельцев не входит в узлы сценария этого use case, канал чужой. Владельца нет вовсе —
  // правило молчит: путь не привязан ни к чему, и утверждать нечего.
  {
    const routeOwners = (path) => new Set([
      ...frd.deltas.filter((d) => d.node && String(d.op || "").includes(path)).map((d) => d.node),
      ...(Array.isArray(routes) ? routes : []).filter((r) => r && String(r.name || "").includes(path)).map((r) => r.at),
    ].filter(Boolean))
    for (const u of frd.usecases) {
      const channel = u.via || (frd.actors.find((a) => a.name === u.actor) || {}).via || ""
      // Канал может называть НЕСКОЛЬКО путей («GET /fruit-card.html, GET /fruits/{id}» формы t3):
      // use case входит через любой из них, и хватает одного, чей владелец — узел этого сценария.
      const paths = [...new Set(String(channel).match(/\/[\w{}\-\/.]+/g) || [])]
      if (!paths.length) continue
      const owners = new Set(paths.flatMap((one) => [...routeOwners(one)]))
      if (!owners.size) continue
      const mine = new Set(frd.scenarios.filter((x) => x.uc === u.id).flatMap((x) => String(x.nodes || "").split(/\s+/)).filter(Boolean))
      if (!mine.size) continue
      // ВЛАДЕЛЕЦ ДОСТИЖИМ И ЧЕРЕЗ РЕБРО. Эндпоинт объявляет ИНТЕРФЕЙС, а в узлах сценария стоит
      // реализация — на живом прогоне 19.08.2026 это дало ложный блокер дважды подряд
      // (`POST /backup/import/initialAgents` принадлежит `IRestImportService`, а сценарий идёт через
      // `RestImportService`). Ребро «реализация → интерфейс» лежит в вычисленном графе.
      const reach = new Set(mine)
      for (const e of Array.isArray(links) ? links : []) if (e && mine.has(e.from) && e.to) reach.add(e.to)
      if ([...owners].some((o) => reach.has(o))) continue
      B.push(`F10 ${u.id} объявлен входящим через «${channel}», но эти пути принадлежат ${[...owners].join(", ")} — узлам, которых нет в сценарии ${u.id}. Назови канал самого use case: <usecase id="${u.id}" … via="…"/>; пути репозитория перечислены строками <api> карты`)
    }
  }

  // F8 — ПОЛЕ, ОБЪЯВЛЕННОЕ В ЧУЖОЙ СУЩНОСТИ, КОТОРОЕ НИКТО НЕ НАПИШЕТ.
  //
  // BUG_FIX_CONTEXT: живой прогон eddi/DOS-535. FRD объявил `<field name="glossaries"
  //   in="AgentConfiguration" …/>`, и от него зависели ТРИ шага требования (UC5/1, UC6/2, UC7/4).
  //   Дельты на `configs/agents/model/AgentConfiguration.java` не было ни одной — значит не было
  //   раздела плана, значит не было наряда, значит поля никто не напишет: UC5 не закрывается вовсе,
  //   UC6 и UC7 закрываются наполовину. Полоса прошла зелёной до самых нарядов.
  //
  // Правило судит ТРИ условия, и каждое куплено проигрышем по четырём сохранённым формам:
  //   1) сущность резолвится в существующий путь — иначе она СОЗДАЁТСЯ этим изменением, и требовать
  //      от неё дельту не по чему (так молчат Glossary и Term живого FRD);
  //   2) поля у этого пути ещё НЕТ — поле, которое у сущности уже есть, изменение читает, а не
  //      пишет; без этого условия правило краснело на `Fruit.name`/`Fruit.description` формы t2;
  //   3) путь не заявлен ни дельтой, ни touched — оба способа назвать модуль работой считаются.
  // Таблицы приходят из вычисленного графа (ext/index.mjs::checkFrd); нет таблиц — правило молчит.
  if (types.size) {
    const deltaNodes = new Set(frd.deltas.map((d) => d.node).filter(Boolean))
    const claimed = new Set([...deltaNodes, ...frd.touched])
    const createdHere = new Set([...deltaNodes].map((p) => String(p).split("/").pop().replace(/\.[^.]+$/, "")))
    for (const f of frd.fields) {
      const E = f.in || ""
      if (!E || createdHere.has(E)) continue
      const path = types.get(E)
      if (!path || claimed.has(path)) continue
      if ((members.get(path) || new Set()).has(f.name)) continue
      B.push(`F8 поле «${f.name}» объявлено в «${E}» (${path}), но этот модуль не заявлен изменением: ни <delta node="${path}">, ни <touched path="${path}">, и поля у него сегодня нет — объявленное поле, которое никто не напишет. Впиши <delta op="поле ${f.name}" form="Changed" node="${path}" from="поля нет" to="поле есть"/>; поле принадлежит другой сущности — поправь in="…"; поле не нужно требованию — сними строку <field name="${f.name}">`)
    }
  }

  // F9 — a rewind's SUBJECT survives the repair. `rewind` carries the previous review's blockers only
  // when it Rejected (ext/index.mjs::checkFrd reads .agent/review.xml); [] otherwise, and then this
  // rule is as silent as F5 is with no sources.
  //
  // Only `goal-not-delivered` is judged: its carrier is always expressible in FRD grammar (a touched,
  // a delta, a scenario, a use case's own `<post>`) so "the element is gone" is unambiguously a defect
  // of the REPAIR, not of the finding. `unverifiable-node` gets no row here — after CODE_OWNER moved it
  // to `operator` (steps/review/review.mjs) that code never reaches this rewind at all, and a rule for
  // a rewind that cannot occur is a promise about a mechanism this artifact does not have.
  //
  // BUG_FIX_CONTEXT: live run 508d74fa (sandbox/runbox/quarkus-rest-json-app-v2-t2, before this fix
  //   existed). A `goal-not-delivered` blocker named UC2 as its evidence; the role facing it deleted
  //   UC2's carrier — `<touched>` emptied, `fruits.html` cut from `S2@nodes` — instead of adding one.
  //   The blocker vanished because its subject no longer existed to point at, the plan collapsed from
  //   3 nodes to 1, and BRD requirement R2 stopped being delivered by anyone, silently.
  const ids = rewind.some((r) => r && r.code === "goal-not-delivered") ? frdIds(frd) : null
  for (const r of rewind) {
    if (!r || r.code !== "goal-not-delivered") continue
    const evidence = String((r && r.evidence) || "").trim()
    if (evidence && !ids.has(evidence)) {
      B.push(`F9 предмет перемотки «${evidence}» удалён из FRD — требование не гасят удалением; верни элемент; если требование действительно снято оператором, оно снимается из TASK.md/BRD отдельной работой, не полосой`)
    }
  }

  return forPass(B, pass)
}

// FUNCTION_CONTRACT: newFrd — step 6's artifact, fit to be handed to steps 7-9
//   Input:        { xml, nodes, tests, sources, rewind } — xml as the role wrote it in staging
//   Dependencies: parseFrd, checkFrd, numbersIn
//   Antecedent:   xml — any value; nodes — Set<path> from the map; tests — its subset marked
//                 `kind="test"` (steps/intake/map.mjs::parseMap); sources — the texts a number may
//                 come from (TASK.md, the VALUES of operator answers, the BRD, the normalized table
//                 of the order, the map itself); an ABSENT text is simply not in the array — an old
//                 run with no `normalized.md` supplies the other four and the rule judges by them,
//                 neither reddening nor letting rubbish through; an
//                 empty array means "no sources supplied" and F5's number rule stays silent; rewind —
//                 forwarded to checkFrd's F9 unchanged, [] when this is not a rewind
//   Consequent:   success: the frozen FRD plus `unknown` — how many deltas the role could not
//                          classify; step 7 refuses to write a weight while that number is non-zero
//                 failure: "invalid-frd" — the detail carries EVERY blocker, one per line, and rides
//                          in the FEEDBACK of the redelegation exactly as newBrd's does
//   Purity:       pure
export function newFrd({ xml, nodes = new Set(), tests = new Set(), entries = new Set(), edges = [], sources = [], rewind = [], types = new Map(), members = new Map(), routes = [], requirements = [], links = [], pass = "", said = [], subjects = [], analogue = "", dirs = new Set() }) {
  const frd = parseFrd(xml)
  // Пласт A пишет use case и НИ ОДНОЙ дельты — «в артефакте нет ни того, ни другого» остаётся отказом,
  // но требовать дельту в проходе A значит требовать пласт, который этот проход не пишет.
  if (!frd.usecases.length && !frd.deltas.length) {
    return err("invalid-frd", "в артефакте нет ни <usecase>, ни <delta> — грамматика не распознана: staging пуст или это не frd.xml")
  }

  const src = sources.filter(Boolean)
  const known = src.length ? new Set(src.flatMap((t) => [...numbersIn(t)])) : null

  // ЧИТАЕМОСТЬ РАНЬШЕ СУЖДЕНИЯ. Блокеры F0 не проходят через `forPass`: пласта у них нет, испорченная
  // строка слепит любой проход одинаково.
  // ВСЕ ВХОДЫ СУДА ЕДУТ В СУД. Правило, чьи входы не доехали, МОЛЧИТ — и молчит неотличимо от
  // правила, которому нечего сказать.
  //
  // BUG_FIX_CONTEXT: разбор 20.08.2026. F14 («предмет требования имеет свой пакет, но изменение не
  //   трогает оттуда ни одного модуля») написан, испытан и объявлен ценой прогона 19.08.2026 — а в
  //   продакшене не срабатывал НИ РАЗУ: хост считал `subjects`, `analogue` и `dirs`, передавал их
  //   сюда, и эта строка их роняла. На артефакте того самого прогона правило даёт блокер про
  //   `agent` — ту самую дыру R11, из-за которой оператор забраковал план.
  const blockers = [...unreadable(xml), ...spentAnswers({ xml, said }), ...checkFrd({ frd, nodes, tests, entries, edges, known, rewind, types, members, routes, requirements, links, pass, subjects, analogue, dirs })]
  if (blockers.length) return err("invalid-frd", blockers.join("\n  "))

  return ok(Object.freeze({ ...frd, unknown: frd.deltas.filter((d) => d.form === "Unknown").length }))
}
