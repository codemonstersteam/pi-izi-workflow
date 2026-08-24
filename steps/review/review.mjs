// MODULE_CONTRACT: review — step 11's pure core: the critic's verdict, judged by FORM and by whether
//             every finding RESOLVES against the two artifacts it was made about
// Purpose:    one decision — what makes a blocker usable. The critic's judgement itself is not
//             checkable here (it is prose against prose, which is why a model makes it); what IS
//             checkable is that the finding carries an address the band can act on: a node of the
//             plan and an evidence of the kind its code takes. That is the whole difference between
//             a blocker the pipeline REPAIRS (docs/review.md §6) and an impression it can only print.
//             PURE: knows no disk; the io — erasing, reading three files, promoting one — is in
//             ext/index.mjs.
// io:         none
// EXTERNAL_DEPENDENCY: steps/intake/frd.mjs — parseFrd, done by the CALLER and handed in. The FRD's
//             grammar is the intake slice's, and a second reader of it here would be a second
//             grammar to keep in step.
// EXTERNAL_DEPENDENCY: steps/review/critic.md — the role states the same two codes in its LAW, and
//             review.test.mjs fails when the role and CODES disagree: the role is what the model
//             reads, CODES is what runs.
// Invariants: newReview is TOTAL — any input, including undefined, yields a Result and never throws
//             (an artifact outlives the run that wrote it); `culprit` and `owner` are NEVER read out
//             of the role's file, they are derived from the code, so the model cannot address its own
//             finding at a step that did not produce the artifact.
// Interface:  GRAMMAR_VERSION — stamped on the artifact
//             CODES — the closed vocabulary of blocker codes, the ONE copy
//             passOf(finding, frd) -> "A"|"B"|"C"|"D" — в какой проход шага 6 едет находка
//             CODE_CULPRIT · CODE_OWNER · CODE_EVIDENCE · OPERATOR_NOTE — the four functions of a code
//             frdIds(frd) -> Set<string> — every id the FRD offers as an address; also the input
//               steps/intake/frd.mjs::checkFrd's F9 resolves a rewind's evidence against
//             owedItems({ requirements }) -> row[] — чек-лист долга: строка на требование BRD
//             unbackedItems({ frd }) -> row[] — обратный ход: элемент FRD, которого не просило ничто
//             parseReview(xml) -> { verdict, blockers[] }
//             newReview({ xml, plan, frd, map, answers }) -> Result<{ verdict, blockers[] }, cls>

import { ok, err } from "../../core/result.mjs"
import { attrs, elem, tag, tokens } from "../../core/xml.mjs"

// 2 — D21: `<covers item node/>`, the checklist the role fills instead of judging "as a whole", and
//     the three codes it makes expressible. Additive: a grammar-1 file is a grammar-2 file with no
//     `<covers>`, which R5 now refuses — and refusing it is the point.
export const GRAMMAR_VERSION = 2

// The judgements of step 11, as the machine knows them. Everything the band could already compute was
// left out of this list on purpose (docs/review.md §3): a code here costs a role call per run, so it
// exists only for a finding no script can make — with ONE exception, `open-question`, which costs no
// role call at all (autoFindings) and is listed here only so the vocabulary has one place.
//
// BUG_FIX_CONTEXT: live run c64dbd32 (sandbox/runbox/quarkus-rest-json-app-v2-t2). Step 11 returned
//   `Pass` with no findings on a plan carrying three defects, and TWO of them were inexpressible:
//   - a node the requirement never asked for (`toggle`, synthesised by steps/plan/plan.mjs:190 out of
//     a spine answer, not out of the FRD). The role was FORBIDDEN to look — steps/review/critic.md
//     said "the plan's nodes come from the FRD's own touched paths and deltas, so a node nothing asks
//     for cannot occur", and that premise is false for every node plan.mjs synthesises itself;
//   - an FRD `<ext>` branch nobody delivers, and an open `<question>` that reached the plan
//     unanswered: `frdIds` below knew neither, so R4 would have REJECTED the honest finding as
//     evidence that resolves to nothing.
//   The third — a node whose only check command cannot witness it — had no code at all.
// Два слова вердикта, и третьего нет: «частично» полоса маршрутизировать не умеет.
const VERDICTS = ["Pass", "Reject"]

export const CODES = Object.freeze([
  "requirement-not-carried",
  "invented-value",
  "goal-not-delivered",
  "open-question",
])

// Three functions OF the code, not three questions to the role. Asking a model for a value a table
// derives, and then spending a guardrail rule on checking that value, is paying twice for no
// decision at all (docs/review.md §4) — so the role writes none of these.
// Три функции ОТ кода, а не три вопроса роли. Спрашивать модель о значении, которое выводит таблица,
// и потом тратить правило гардрейла на проверку этого значения — платить дважды за решение, которого
// нет (docs/review.md §4). Роль не пишет ни одного из них.
//
// Виновник у всех четырёх один — `frd.xml`: критик судит требование, и всякая его находка есть
// находка об этом артефакте. Владелец починки, соответственно, шаг 6: у артефакта есть роль, которая
// его пишет, и блокер едет ей в FEEDBACK.
export const CODE_CULPRIT = Object.freeze({
  "requirement-not-carried": "frd.xml",
  "invented-value": "frd.xml",
  "goal-not-delivered": "frd.xml",
  "open-question": "frd.xml",
})

export const CODE_OWNER = Object.freeze({
  "requirement-not-carried": 6,
  "invented-value": 6,
  "goal-not-delivered": 6,
  "open-question": 6,
})

// Какого РОДА улика у кода — единственное, что отличает их друг от друга при проверке формы.
//   requirement — номер требования BRD: находка о том, что его никто не несёт
//   quote       — строка источника, которая значение ЗАПРЕЩАЕТ, или её отсутствие: находка о том,
//                 что значение появилось само. Улика обязана быть непустой, но резолвить её не по
//                 чему — это ЦИТАТА, а не адрес
//   frd         — id элемента самого артефакта
export const CODE_EVIDENCE = Object.freeze({
  "requirement-not-carried": "requirement",
  "invented-value": "quote",
  "goal-not-delivered": "frd",
  "open-question": "frd",
})

// Ни у одного кода нет адреса `operator`: все четыре чинятся переписыванием артефакта ролью шага 6.
export const OPERATOR_NOTE = Object.freeze({})

export function parseReview(xml) {
  const s = String(xml == null ? "" : xml)
  // matchAll, not match: tag() is global, and String.match with a global regexp returns the full
  // matches WITHOUT capture groups — the attribute body would silently come back as the second
  // occurrence of the tag. One shape covers both `<review …>` and `<review …/>`: the `/` of a
  // self-closing tag falls inside the attribute body and `attrs` ignores it.
  const [head] = [...s.matchAll(tag("review", ">"))]
  const verdict = head ? (attrs(head[1]).verdict || "").trim() : ""
  const blockers = []
  for (const m of s.matchAll(elem("blocker"))) {
    const a = attrs(m[1])
    blockers.push({
      code: (a.code || "").trim(),
      node: (a.node || "").trim(),
      evidence: (a.evidence || "").trim(),
      text: String(m[2] == null ? "" : m[2]).replace(/\s+/g, " ").trim(),
    })
  }
  // `<covers item node/>` — the checklist row the role closed by naming the plan node that answers it.
  // Self-closing, so `tag`, not `elem`: it carries no text, and a row that needed prose would be a
  // blocker instead.
  const covers = [...s.matchAll(tag("covers"))].map((m) => {
    const a = attrs(m[1])
    return { item: (a.item || "").trim(), node: (a.node || "").trim() }
  })
  // `<witness node cmd/>` — R6's answer: WHICH command executes a node that has none of its own. The
  // command is copied from the order's list, and the machine checks it against the plan: naming a
  // node is easy, naming a command is a decision.
  const witness = [...s.matchAll(tag("witness"))].map((m) => {
    const a = attrs(m[1])
    return { node: (a.node || "").trim(), cmd: (a.cmd || "").trim() }
  })
  return { verdict, blockers, covers, witness, found: Boolean(head) }
}

// frdIds — every identifier the FRD offers as an address, in ONE expression.
// A use case, a scenario, a failure's code and a delta's operation — plus, since D21, the addresses
// the role could previously SEE a defect at and not name: an extension of a use case (`UC1/2a`), an
// NFR by its subject, an open question by its subject, and — since the fix for live run 508d74fa — a
// use case's OWN `<post>` (`UC1/post`), mirroring owedItems below. Nothing else is an id — a phrase
// out of the goal is prose.
//
// This set is what R4 resolves evidence against, so an id missing from here is not a cosmetic gap: it
// turns an honest finding into a red FORM and the role, re-delegated, learns to stop making it. Live
// run c64dbd32 lost the `<ext>` branch «фрукт не найден» exactly that way; live run 508d74fa lost
// `UC*/post` the same way, and there it was worse: R5 already OWES a `<covers>` or a blocker for
// every `<post>` (owedItems, below), so a `goal-not-delivered` blocker naming that same row's id as
// its evidence was refused by R4 for not being an FRD id — a deadlock between two rules the role could
// not honestly escape (steps/review/review.test.mjs, "R4: goal-not-delivered резолвит UC2/post").
//
// EXPORTED: steps/intake/frd.mjs::checkFrd (F9) resolves a rewind's evidence against this same set —
// one expression of "what is an FRD id", not two that could drift.
export const frdIds = (frd) => new Set([
  ...((frd && frd.usecases) || []).map((u) => (u && u.id) || ""),
  ...((frd && frd.usecases) || []).filter((u) => u && u.id && u.post).map((u) => `${u.id}/post`),
  ...((frd && frd.usecases) || []).flatMap((u) => ((u && u.exts) || []).map((x) => `${(u && u.id) || ""}/${(x && x.id) || ""}`)),
  // ШАГ — ТОЖЕ АДРЕС. Требование исполняется шагом, а не use case целиком: «R1 унесено в UC1/2» —
  // самая точная строка, какую роль может написать, и до этой правки она не резолвилась.
  ...((frd && frd.usecases) || []).flatMap((u) => ((u && u.steps) || []).map((_, k) => `${(u && u.id) || ""}/${k + 1}`)),
  ...((frd && frd.scenarios) || []).map((s) => (s && s.id) || ""),
  ...((frd && frd.failures) || []).map((f) => (f && f.code) || ""),
  ...((frd && frd.deltas) || []).map((d) => (d && d.op) || ""),
  // УЗЕЛ ДЕЛЬТЫ И ТРОНУТЫЙ ПУТЬ — тоже адреса: требование «модуль X меняется» несёт именно узел, а не
  // текст операции.
  ...((frd && frd.deltas) || []).map((d) => (d && d.node) || ""),
  ...((frd && frd.touched) || []),
  // ПОЛЕ — АДРЕС, И БЕЗ НЕГО ЯЗЫК ТРЕБОВАНИЯ ШИРЕ АДРЕСНОГО ПРОСТРАНСТВА.
  //
  // BUG_FIX_CONTEXT: живой прогон 4c8f26eb (eddi, 19.08.2026) умер на шаге 6, сжёг шесть кругов и 572К
  //   токенов. Роль семь раз писала `<carried req="R4" by="field:id field:version field:terms"/>` —
  //   и была ПРАВА: требование «поля ресурса — только id + version + terms» унесено строками
  //   `<field>`, а других носителей у него нет. Правило отвечало «такого элемента нет», роль сносила
  //   use case, чтобы погасить соседний блокер, и ломала то, что уже сходилось.
  ...((frd && frd.fields) || []).map((f) => (f && f.name ? `field:${f.name}` : "")),
  ...((frd && frd.nfrs) || []).map((n) => (n && n.subject ? `nfr:${n.subject}` : "")),
  ...((frd && frd.questions) || []).map((q) => (q && q.subject) || ""),
].filter(Boolean).map((x) => String(x).trim()).filter((x) => !x.endsWith("/")))

// FUNCTION_CONTRACT: passOf — в какой проход шага 6 едет находка критика
//   Input:        finding — { code, node } как их разобрал parseReview; frd — разбор FRD
//                 (steps/intake/frd.mjs::parseFrd) либо ничего
//   Dependencies: —
//   Antecedent:   любые значения; отсутствие FRD читается как пустой артефакт
//   Consequent:   success: "A" | "B" | "C" — проход, с которого полоса перезапускает шаг 6 и идёт
//                          ВПЕРЁД до D (steps/intake/docs/passes-data-flow.md). Элемент, которого в
//                          артефакте нет вовсе, даёт "A": раньше чинить нечего, а «не знаю» полосе не
//                          с чем делать
//                 failure: none — тотальна
//   Purity:       pure
//
// ПРОХОД ВЫВОДИТСЯ ИЗ ЭЛЕМЕНТА, А НЕ ИЗ КОДА. Критик судит требование целиком и о проходах не знает —
// он называет `node`. Один и тот же `invented-value` уезжает в три разных пласта: лишний use case
// снимает проход A, лишнее значение — C, лишняя работа — B. Таблица «код → проход» была бы враньём на
// первом же артефакте.
//
// ДВА ПЛАСТА У ОДНОГО ЭЛЕМЕНТА → РАННИЙ, и порядок проверок ниже это и есть. Узел дельты назван ещё и
// в `nodes` сценария; поле названо и в `<field>`, и в требовании. Починка нижнего пласта может снять
// находку верхнего (сняли use case — исчезли его сценарии и дельты), обратное неверно.
//
// ПОЧЕМУ D НЕ БЫВАЕТ АДРЕСОМ. `requirement-not-carried` — это «строки <carried> не хватает» ровно до
// шага 11, а до шага 11 стоит F11: он не выпускает пласт D, пока строка есть не у каждого требования
// BRD. Значит у находки критика строка ЕСТЬ и она ЛОЖНА — носителя нет, и его пишет пласт A. Пласт D
// всё равно будет переигран: полоса идёт от входа вперёд до конца.
export function passOf(finding = {}, frd = {}) {
  const node = String((finding && finding.node) || "").trim()
  const f = frd || {}
  const idsOf = (list, pick) => new Set((list || []).map((x) => (x ? String(pick(x) || "").trim() : "")).filter(Boolean))

  // `open-question` чинит не роль, а оператор; вход в A — самый ранний и самый дешёвый: этот проход
  // идёт без карты.
  if (finding && finding.code === "open-question") return "A"
  // Строка <carried> не бывает предметом находки: см. «ПОЧЕМУ D НЕ БЫВАЕТ АДРЕСОМ» выше.
  if (finding && finding.code === "requirement-not-carried") return "A"

  // A — требование: use case, его шаг (`UC1/2`), его конец (`UC1/post`), его ветка (`UC1/1a`), актёр.
  const ucs = idsOf(f.usecases, (u) => u.id)
  if (ucs.has(node) || ucs.has(node.split("/")[0])) return "A"
  if (idsOf(f.actors, (a) => a.name).has(node)) return "A"

  // B — изменение: узел дельты, её операция, тронутый путь, сценарий.
  if (idsOf(f.deltas, (d) => d.node).has(node)) return "B"
  if (idsOf(f.deltas, (d) => d.op).has(node)) return "B"
  if ((f.touched || []).some((t) => String(t || "").trim() === node)) return "B"
  if (idsOf(f.scenarios, (x) => x.id).has(node)) return "B"

  // C — величины и отказы. `field:` и `nfr:` — префиксы адресного пространства критика (frdIds выше).
  if (node.startsWith("field:") || idsOf(f.fields, (x) => x.name).has(node)) return "C"
  if (node.startsWith("nfr:") || idsOf(f.nfrs, (x) => x.subject).has(node)) return "C"
  if (idsOf(f.failures, (x) => x.code).has(node)) return "C"

  return "A"
}

// FUNCTION_CONTRACT: criticEntry — с какого прохода шага 6 полоса переигрывает требование после Reject
//   Input:        findings — находки критика [{ code, node }]; frd — разбор FRD
//   Dependencies: passOf
//   Antecedent:   любые значения; пусто читается как «находок нет»
//   Consequent:   success: РАННИЙ проход среди названных: полоса входит в него и идёт вперёд до D,
//                          и правка раннего пласта снимает находки поздних (обратное неверно). Без
//                          находок — "A"
//                 failure: none — тотальна
//   Purity:       pure
export function criticEntry(findings = [], frd = {}) {
  const routed = new Set((findings || []).filter(Boolean).map((b) => passOf(b, frd)))
  return ["A", "B", "C", "D"].filter((x) => routed.has(x))[0] || "A"
}

// FUNCTION_CONTRACT: owedItems — чек-лист: что ТРЕБОВАНИЕ обязано увидеть в этом FRD
//   Input:        { requirements } — [{ id, statement, fit }] из steps/brd/brd.mjs::parseBrd
//   Dependencies: —
//   Antecedent:   любые значения; отсутствие читается как пусто
//   Consequent:   success: [{ id, what }] — строка на требование BRD, id МАШИННЫЙ (его номер), и роль
//                          его КОПИРУЕТ, а не сочиняет (CLAUDE.md, constraint 4)
//                 failure: none — тотальна
//   Purity:       pure
//
// ПОЧЕМУ СПИСОК, А НЕ ЗАКОН. До D21 роль просили судить «доставляет ли артефакт цель», и она отвечала
// ЦЕЛИКОМ — так три дефекта прошли незамеченными (живой прогон c64dbd32). Список целиком не ответишь:
// каждая строка закрывается `<covers>` или блокером, и R5 это считает.
//
// ПОЧЕМУ ТРЕБОВАНИЯ, А НЕ ПЛАН. Критик переехал: его предмет — FRD против TASK.md и brd.md, и долг у
// FRD перед ТРЕБОВАНИЕМ, а не перед планом (`tasks/j6-critic-frd.md`). TASK.md едет в наряд
// документом: требование записи — это BRD, а соответствие BRD задаче судит шаг 2.
export function owedItems({ requirements = [] } = {}) {
  return (requirements || []).filter((r) => r && r.id).map((r) => Object.freeze({
    id: String(r.id).trim(),
    what: [String(r.statement || "").trim(), r.fit ? `fit: ${String(r.fit).trim()}` : ""].filter(Boolean).join(" · "),
  }))
}

// FUNCTION_CONTRACT: unbackedItems — ОБРАТНЫЙ ход того же вопроса: чего никто не просил
//   Input:        { frd } — parseFrd's parse
//   Dependencies: —
//   Antecedent:   любые значения
//   Consequent:   success: [{ id, what }] — элементы FRD, которых не называет НИ ОДНА строка
//                          `<carried by>`: use case, сценарий, дельта, nfr. Пустой `carried` даёт
//                          пустой список: судить не по чему, а «всё подозрительно» — не рассуждение
//                 failure: none — тотальна
//   Purity:       pure
//
// BUG_FIX_CONTEXT: ручной прогон этой роли по артефактам eddi (19.08.2026, qwen 27B, $0.04, минута).
//   Прямой ход («чем исполнено требование R…») закрыл все 18 строк долга и НЕ ЗАМЕТИЛ, что в FRD
//   живёт целый use case UC8 — синхронизация с удалённым инстансом, эндпоинт /descriptors, превью
//   StructuralMatcher, UpgradeExecutor, — которого не просит ни TASK.md (23 строки), ни одно из 18
//   требований BRD. Это четыре наряда работы (07, 14, 18, 21), которую никто не заказывал. Находка
//   сделана ОБРАТНЫМ ходом; здесь он перестаёт быть удачей и становится списком.
//
// Строки — ПОДОЗРЕВАЕМЫЕ, а не виноватые: элемент может обслуживать требование, названное через
// соседа. Поэтому строка закрывается тем же способом, что строка долга: `<covers>` или блокер.
export function unbackedItems({ frd } = {}) {
  const carried = ((frd && frd.carried) || []).flatMap((c) => String((c && c.by) || "").split(/\s+/)).filter(Boolean)
  if (!carried.length) return []
  const named = new Set(carried)
  // Принадлежность ТРАНЗИТИВНА: строка `by="UC1/2"` заявляет весь UC1, а вместе с ним — сценарии
  // этого use case и узлы, через которые они проходят. Иначе список кричал бы на каждую дельту
  // заявленного требования, и роль перестала бы его читать.
  const backs = (id) => Boolean(id) && [...named].some((n) => n === id || n.startsWith(`${id}/`))
  const backedUcs = new Set(((frd && frd.usecases) || []).map((u) => (u && u.id) || "").filter(backs))
  const backedScenarios = ((frd && frd.scenarios) || []).filter((x) => x && (named.has(x.id) || backedUcs.has(x.uc)))
  const backedNodes = new Set(backedScenarios.flatMap((x) => String(x.nodes || "").split(/\s+/)).filter(Boolean))
  const rows = []
  for (const u of (frd && frd.usecases) || []) {
    const id = (u && u.id) || ""
    // Use case назван и сам по себе, и любым своим шагом или ветвлением: `by="UC1/2"` означает, что
    // требование живёт в UC1.
    if (!id || backedUcs.has(id)) continue
    rows.push({ id, what: `use case «${u.goal || id}»` })
  }
  for (const x of (frd && frd.scenarios) || []) {
    const id = (x && x.id) || ""
    if (!id || backedScenarios.includes(x)) continue
    rows.push({ id, what: `сценарий «${x.after || id}»` })
  }
  for (const d of (frd && frd.deltas) || []) {
    const node = (d && d.node) || ""
    if (!node || named.has(node) || backedNodes.has(node)) continue
    rows.push({ id: node, what: `дельта «${d.op || node}»` })
  }
  for (const n of (frd && frd.nfrs) || []) {
    const id = n && n.subject ? `nfr:${n.subject}` : ""
    if (!id || named.has(id)) continue
    rows.push({ id, what: `ограничение «${n.fit || id}»` })
  }
  return rows.map((r) => Object.freeze(r))
}

// FUNCTION_CONTRACT: autoFindings — the findings that cost no role call at all
//   Input:        { frd } — parseFrd's parse
//   Dependencies: —
//   Antecedent:   any value
//   Consequent:   success: blockers[{ code, node, evidence, text }] — one per open `<question>` of
//                          the FRD. `node` is synthetic (`question:<subject>`) because the finding is
//                          about the requirement, not about a node, and R3 is not applied to it
//                 failure: none — total
//   Purity:       pure
//
// An open question is a LEGAL output of step 6 (core/findings.mjs::OUT_OF_ROUNDS) — and until D21 it
// had no reader at all: steps/intake/frd.mjs parsed `questions`, and nothing in the band consumed
// them. Live run c64dbd32 shipped `<question subject="fruit-not-found"/>` straight past steps 9, 10
// and 11 into a green plan whose implementation would have guessed the answer. Computing this needs
// no judgement, so it costs no tokens (docs/concept.md, rule 3).
export function autoFindings({ frd } = {}) {
  return ((frd && frd.questions) || []).map((q) => Object.freeze({
    code: "open-question",
    node: `question:${(q && q.subject) || ""}`,
    evidence: (q && q.subject) || "",
    text: `требование не выяснено: ${(q && q.why) || (q && q.subject) || ""} — план построен без ответа, реализация угадает его сама`,
  })).filter((b) => b.evidence)
}

// FUNCTION_CONTRACT: feedbackLines — вердикт критика, как его ЧИТАЕТ роль шага 6
//   Input:        findings — блокеры из newReview: { code, node, evidence, text }
//   Dependencies: —
//   Antecedent:   любые значения; пустой список даёт пустую строку
//   Consequent:   success: строки FEEDBACK, по одной на блокер, каждая с префиксом `critic:` — по
//                          нему роль отличает суждение о СОДЕРЖАНИИ от блокера гардрейла о ФОРМЕ и
//                          выбирает ремонт по коду (steps/intake/intake.md, шаг 11 STRATEGY)
//                 failure: none — тотальна
//   Purity:       pure
//
// ПОЧЕМУ ЗДЕСЬ, А НЕ В ПОЛОСЕ. Форма этой строки — КОНТРАКТ между двумя ролями: критик пишет, intake
// разбирает по префиксу и по коду. Пока она собиралась в `workflows/izi.js`, её нельзя было проверить
// ничем, кроме регулярки по исходнику полосы, — а такая проверка видит, что строка собрана, и не
// видит, из чего. Ровно так прогон 64cebdda уехал со счётчиком строк вместо самих строк в соседней
// рельсе. Здесь у формы есть юнит.
export function feedbackLines(findings = []) {
  return (Array.isArray(findings) ? findings : [])
    .filter((b) => b && b.code)
    .map((b) => `critic: ${b.code} · ${b.node || "—"} · улика ${b.evidence || "—"} — ${String(b.text || "").trim()}`)
    .join("\n  ")
}

// FUNCTION_CONTRACT: newReview — вердикт критика, судимый как вердикт, с которым полоса умеет работать
//   Input:        { xml, frd, requirements }
//                 xml          — staging-вердикт, как его написала роль
//                 frd          — parseFrd от `.agent/staging/frd.xml`: адресное пространство находок
//                 requirements — [{ id, statement, fit }] из brd.md: чек-лист долга
//   Dependencies: parseReview, frdIds, owedItems, unbackedItems, CODES, CODE_CULPRIT, CODE_OWNER,
//                 CODE_EVIDENCE
//   Antecedent:   любые значения — каждое отсутствие ниже названный отказ, а не умолчание
//   Consequent:   success: { verdict, blockers[{ code, node, evidence, culprit, owner, text }] } —
//                          `culprit` и `owner` выводятся ЗДЕСЬ, из кода, и никогда не читаются из
//                          файла роли
//                 failure: "empty"          — нет элемента <review>: роль не написала артефакт
//                          "no-frd"         — в FRD нет ни одного адреса: судить не о чем
//                          "invalid-review" — R1..R5/R7; детали едут в FEEDBACK
//   Purity:       pure
export function newReview({ xml, frd, requirements = [] } = {}) {
  const parsed = parseReview(xml)
  if (!parsed.found) return err("empty", "в staging нет элемента <review> — роль не написала артефакт")

  // АДРЕС НАХОДКИ — ЭЛЕМЕНТ FRD. Критик судит требование, и всё, на что он может показать, живёт в
  // самом артефакте: use case, его шаг и ветвление, сценарий, код отказа, op дельты, nfr, вопрос.
  const ids = frdIds(frd)
  if (!ids.size) return err("no-frd", "в FRD нет ни одного адресуемого элемента — судить не о чем")

  const reqIds = new Set((requirements || []).map((r) => String((r && r.id) || "").trim()).filter(Boolean))

  const B = []
  // R1. The verdict and its body must say the same thing. Both directions: a Pass carrying a blocker
  // hides a finding the band would never route, and a Reject with none stops the band on nothing.
  if (!VERDICTS.includes(parsed.verdict)) {
    B.push(`R1 verdict="${parsed.verdict}" — допустимо ${VERDICTS.join(" | ")}`)
  } else if (parsed.verdict === "Reject" && !parsed.blockers.length) {
    B.push("R1 verdict=Reject, но ни одного <blocker> — отказ без находки полосу не останавливает")
  } else if (parsed.verdict === "Pass" && parsed.blockers.length) {
    B.push(`R1 verdict=Pass при ${parsed.blockers.length} <blocker> — вердикт противоречит собственному телу`)
  }

  for (const [i, b] of parsed.blockers.entries()) {
    const where = `блокер ${i + 1}`
    // R2 first and alone: the code decides what the other rules mean, so an unknown code
    // short-circuits its blocker — three blockers for one defect cost the role three repairs.
    if (!CODES.includes(b.code)) {
      B.push(`R2 ${where}: code="${b.code}" вне словаря — допустимо ${CODES.join(" | ")}`)
      continue
    }
    // `open-question` is about the REQUIREMENT, not about a node: its address is synthetic and there
    // is no plan node to point at — that is precisely what the finding says.
    // `open-question` адресуется синтетически (`question:<subject>`): находка о ТРЕБОВАНИИ, и узла,
    // на который показать, у неё нет — ровно это она и говорит.
    if (b.code !== "open-question" && !ids.has(b.node)) {
      B.push(`R3 ${where} (${b.code}): node="${b.node}" не элемент FRD — адресом может быть use case, его шаг, ветвление, сценарий, код отказа, op дельты или nfr:<subject>`)
    }
    const kind = CODE_EVIDENCE[b.code]
    if (kind === "requirement" && !reqIds.has(b.evidence)) {
      B.push(`R4 ${where} (${b.code}): evidence="${b.evidence}" не номер требования BRD — улика этого кода есть требование, которое артефакт не несёт (${[...reqIds].slice(0, 4).join(", ")}…)`)
    }
    if (kind === "quote" && !b.evidence) {
      B.push(`R4 ${where} (${b.code}): улика пуста — процитируй строку TASK.md или brd.md, которая это значение ЗАПРЕЩАЕТ, либо покажи, что его не просит ни одна`)
    }
    if (kind === "frd" && !ids.has(b.evidence)) {
      B.push(`R4 ${where} (${b.code}): evidence="${b.evidence}" не id FRD — назови use case, сценарий, код отказа или op дельты`)
    }
    if (!b.text) B.push(`R4 ${where} (${b.code}): текст блокера пуст — оператору и роли починки читать нечего`)
  }

  // R5 — ПОЛНОТА. Каждая строка ОБОИХ списков закрыта ровно один раз: `<covers>` с элементом FRD,
  // который её исполняет, или блокер, чья улика/адрес — эта строка. «В целом да» перестаёт быть
  // выразимым: Pass с незаполненной таблицей — это красная ФОРМА, переделегирование, а не вердикт.
  //
  // Списков два, и они смотрят в разные стороны: долг («чем исполнено требование») и незаявленное
  // («какое требование просило этот элемент»). Второй куплен прогоном, где первый закрыл все 18
  // строк и не заметил целого use case, которого не просил никто (см. unbackedItems).
  const owed = owedItems({ requirements })
  const unbacked = unbackedItems({ frd })
  const rows = [...owed.map((r) => ({ ...r, list: "долг" })), ...unbacked.map((r) => ({ ...r, list: "не заявлено" }))]
  const claimed = new Map()
  for (const c of parsed.covers) claimed.set(c.item, (claimed.get(c.item) || 0) + 1)
  const byEvidence = new Set(parsed.blockers.map((b) => b.evidence))
  const byNode = new Set(parsed.blockers.map((b) => b.node))
  for (const row of rows) {
    const covered = claimed.get(row.id) || 0
    const blamed = byEvidence.has(row.id) || byNode.has(row.id)
    if (!covered && !blamed) {
      B.push(`R5 «${row.list}» — пункт "${row.id}" (${row.what}) не закрыт: ни <covers item="${row.id}" node="…"/>, ни блокера с этим id`)
    } else if (covered > 1) {
      B.push(`R5 пункт "${row.id}" закрыт ${covered} раз — один пункт, одна строка`)
    }
  }

  // R7 — строка закрыта тем, что способно на неё ОТВЕТИТЬ. R5 считает, что каждая закрыта однажды и
  // что названный элемент существует; до D21 ничто не проверяло, что эти двое имеют друг к другу
  // отношение, и прогон 79650c98 привёз `<covers item="S1" node="scenario:S2"/>` внутри зелёного
  // Pass. Здесь операнд другой, чем был: адресное пространство — сам FRD, и «отвечать» значит быть
  // его элементом. Строка «не заявлено» закрывается ЛЮБЫМ элементом: ответ на неё — «этот элемент
  // просило требование R…», и требование названо текстом `covers`, а не адресом.
  const rowIds = new Set(rows.map((r) => r.id))
  for (const c of parsed.covers) {
    if (!rowIds.has(c.item)) B.push(`R5 <covers item="${c.item}"/> — такого пункта в списках нет; пункты выдаёт машина, их не сочиняют`)
    else if (!ids.has(c.node)) B.push(`R7 <covers item="${c.item}" node="${c.node}"/> — node не элемент FRD: назови use case, его шаг, сценарий, код отказа, op дельты или nfr:<subject>`)
  }

  if (B.length) return err("invalid-review", B.join("\n  "))

  const blockers = parsed.blockers.map((b) => Object.freeze({
    ...b,
    culprit: CODE_CULPRIT[b.code],
    owner: CODE_OWNER[b.code],
    // "" for every owner but `operator` — OPERATOR_NOTE has no other rows, and the band never reads
    // this field for a repair it routes to a step or a script (workflows/izi.js::band).
    note: OPERATOR_NOTE[b.code] || "",
  }))
  return ok(Object.freeze({ verdict: parsed.verdict, blockers: Object.freeze(blockers) }))
}
