// The `brd` slice: BRD as a domain value. One test per factory — 1 happy path + the number of
// DISTINGUISHABLE outcomes (standards/code.md §5). The input range is checked by the factory that
// owns the field; newBrd is responsible only for what it adds itself: collect all blockers at once
// and carry advice forward on success.

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { newFit, newRequirement, newSubjects, adviceFor, newBrd, numbersIn, BRD_FORM, parseBrd, analogueTerm } from "./brd.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const BRD = (fit) => `R1 Размер ответа ограничен\n   fit:    ${fit}\n   verify: GET /x\n\nsubjects[]: a · b · c\nanalogue: PromptSnippet\nopen-questions: 0\n`
const R = (over) => ({ id: "R1", statement: "Размер ответа ограничен", fit: "20 записей", verify: "GET /x", line: 1, ...over })

// --- newFit: 1 happy + 2 distinguishable outcomes ---------------------------------------------------------
// invented-default — the reason this step exists: it catches a number the model made up.
// S16: the rule "fit must carry a measurable token" was dropped by operator decision — a predicate
// criterion ("case-insensitive substring match") is machine-checkable yet carries no token, and live
// run ed1d4094 burned all three redelegations on exactly this.

test("criterion builds", () => {
  assert.equal(newFit("20 записей", null).ok, true)
})

test("predicate criterion without a number builds — the guardrail has no prose to judge", () => {
  assert.equal(newFit("регистронезависимое вхождение подстроки", null).ok, true)
})

test("no fit — there is no requirement without an acceptance criterion", () => {
  assert.equal(newFit("", null).error.cls, "no-fit")
})

test("a number absent from the sources — a default was substituted, not asked", () => {
  const known = new Set([...numbersIn("Нужно ограничение на размер")])
  assert.equal(newFit("20 записей", known).error.cls, "invented-default")
})

test("a number from the operator's answer is legal", () => {
  const known = new Set([...numbersIn("- вопрос: предел?\n  ответ: 20")])
  assert.equal(newFit("20 записей", known).ok, true)
})

// Asked about the default but invented the maximum itself — caught: EVERY number is checked.
test("partially confirmed numbers don't save the invented one", () => {
  const known = new Set([...numbersIn("ответ: 20")])
  assert.match(newFit("20 по умолчанию, 100 максимум", known).error.detail, /100/)
})

// "No sources" is NOT "no violations": the rule stays silent because there is nothing to check against.
test("no sources — the rule stays silent, not accuses at random", () => {
  assert.equal(newFit("20 записей", null).ok, true)
})

// Normalization: leading zeros are stripped, comma is converted to a dot. The assertion is taken
// verbatim from the previous test — it was correct, and my first version ("20.0 → 20") mistook a wish for a fact.
test("decimals and leading zeros are normalized", () => {
  assert.deepEqual([...numbersIn("0.5 · 007 · 1,5")].sort(), ["0.5", "1.5", "7"])
})

// --- numbersIn: format designation vs number-magnitude (README "Debts", closed by this change) --------
//
// FOUND BY LIVE RUN S11 (booking task): `fit: … (ISO-8601)` read `8601` as a number-magnitude,
// demanded a source that exists neither in the task nor in the answers, and the role got
// `invented-default` for a format it never invented. The table below is both edges of the rule at
// once: designations don't yield numbers, magnitudes do, and a designation NEARBY does not hide a
// real magnitude.

test("format designations are not number-magnitudes", () => {
  for (const s of ["ISO-8601", "UTF-8", "SHA-256", "RFC 3339", "base64", "p95"]) {
    assert.deepEqual([...numbersIn(s)], [], `${s} не должен дать число`)
  }
})

test("number-magnitudes remain numbers next to any words", () => {
  assert.deepEqual([...numbersIn("20")], ["20"])
  assert.deepEqual([...numbersIn("90 дней")], ["90"])
  assert.deepEqual([...numbersIn("1..100")].sort(), ["1", "100"])
  assert.deepEqual([...numbersIn("не более 20")], ["20"])
  assert.deepEqual([...numbersIn("300ms")], ["300"]) // a unit suffix AFTER the number is not adjacency
})

// Seam: a designation next to a real magnitude does not mute invented-default on that magnitude —
// the rule distinguishes both numbers on one line, not just numbers in isolation.
test("a format designation in fit does not mute invented-default on a neighboring magnitude", () => {
  const known = new Set([...numbersIn("ответ: 20")])
  const r = newFit("формат ISO-8601, лимит 100 записей", known)
  assert.equal(r.error.cls, "invented-default")
  assert.match(r.error.detail, /100/)
})

// The reverse defect: an invented number must NOT stop failing just because a format designation
// stands next to it — verified by reintroducing the defect (comment out "if (isDesignationDigit...) continue"
// in numbersIn to see the first test of this block go red; comment out the numbersIn magnitude filter
// call itself to see this test go red on a missing invented-default).
test("100, confirmed by nothing, fails even in the presence of ISO-8601", () => {
  const known = new Set([...numbersIn("TASK.md: тайм-аут ISO-8601, дней: 20")])
  assert.equal(newFit("100", known).error.cls, "invented-default")
})

// --- newRequirement: 1 happy + 2 of its own outcomes ------------------------------------------------
// newFit's rejection is propagated — this checks that it isn't lost, not the whole set again.

test("requirement builds", () => {
  assert.equal(newRequirement(R(), null).ok, true)
})

test("empty statement — there is no requirement", () => {
  assert.match(newRequirement(R({ statement: "" }), null).error.detail, /формулировка пуста/)
})

test("a requirement without a way to verify — a statement, not a requirement", () => {
  assert.match(newRequirement(R({ verify: "" }), null).error.detail, /нет способа проверки/)
})

test("the criterion's rejection is propagated with the requirement's name", () => {
  assert.match(newRequirement(R({ fit: "" }), null).error.detail, /R1: нет fit-критерия/)
})

// --- newSubjects: 1 happy + 3 outcomes ---------------------------------------------------------------

test("anchors build", () => {
  assert.equal(newSubjects(["a", "b", "c"]).ok, true)
})

test("fewer anchors than the minimum", () => {
  assert.match(newSubjects(["a"]).error.detail, /допустимо/)
})

// LIVE RUN 01.08: an anchor is ONE word. The rule "subject must occur in the text of R" was
// wrong and forced the role to corrupt a correct artifact by fitting anchors to the requirement's language.
test("a phrase with a space is not an anchor", () => {
  assert.match(newSubjects(["поиск фруктов", "b", "c"]).error.detail, /фраза, а не якорь/)
})

test("duplicate anchor", () => {
  assert.match(newSubjects(["a", "b", "a"]).error.detail, /повторяется/)
})

// --- adviceFor: advice that does NOT fail acceptance ---------------------------------------------------

test("a wish without anything measurable nearby — advice", () => {
  const a = adviceFor(R({ statement: "Ответ должен быть быстрым", fit: "быстро" }))
  assert.equal(a[0].code, "wish-not-requirement")
})

// LIVE RUN 04: the rule failed "limit (default 20, VALID range 1..100)" — a wish-word stood next
// to a precise range. A wish is the ABSENCE of a criterion, not the presence of a word.
test("a wish next to something measurable is not advice", () => {
  assert.deepEqual(adviceFor(R({ statement: "valid range", fit: "1..100" })), [])
})

test("a path in the statement — advice about mechanism", () => {
  const a = adviceFor(R({ statement: "Реализация в src/handlers/limit.go" }))
  assert.equal(a[0].code, "design-leak")
})

// --- newBrd: 1 happy + its own outcomes -----------------------------------------------------------------

test("BRD builds and carries requirements and anchors", () => {
  assert.equal(newBrd(BRD("20 записей")).value.requirements.length, 1)
})

test("with not a single R it does not pass", () => {
  assert.match(newBrd("subjects[]: a · b · c\nanalogue: PromptSnippet\nopen-questions: 0\n").error.detail, /нет ни одного требования/)
})

test("an open question does not pass", () => {
  const t = BRD("20 записей").replace("open-questions: 0", "open-questions: 1")
  assert.match(newBrd(t).error.detail, /не сдаётся с открытыми вопросами/)
})

test("the open-questions line is missing entirely", () => {
  const t = BRD("20 записей").replace("\nanalogue: PromptSnippet\nopen-questions: 0\n", "\n")
  assert.match(newBrd(t).error.detail, /обязан её нести/)
})

test("the subjects line is missing entirely", () => {
  const t = BRD("20 записей").replace(/subjects\[\].*\n/, "")
  assert.match(newBrd(t).error.detail, /нечем грепать/)
})

// This is why blockers are collected instead of handed out one at a time: a MODEL fixes the BRD,
// and every retry is a call. Handing it one blocker out of three means paying three calls for one message.
test("all blockers are handed out at once, not just the first", () => {
  const t = "R1 Пусто\n   fit:\n   verify:\n\nopen-questions: 1\n"
  assert.ok(newBrd(t).error.detail.split("\n").length >= 2)
})

// Advice rides on SUCCESS: a judgment rule has no authority to fail acceptance and command a
// redelegation to the artifact's owner.
test("advice does not fail acceptance, it rides along with the built BRD", () => {
  const t = "R1 Реализация в src/x.go\n   fit:    20 записей\n   verify: GET /x\n\nsubjects[]: a · b · c\nanalogue: PromptSnippet\nopen-questions: 0\n"
  const b = newBrd(t)
  assert.equal(b.ok && b.value.advice[0].code, "design-leak")
})

// Corpus test, S16: the ed1d4094 live-run artifact, verbatim. It got the same red three times in a
// row (`R1 fit carries no measurable token`) and burned the whole redelegation budget, even though the
// criterion is predicative and its verify is machine-executable. Now it must be green — this is the
// seam of the dropped rule.
test("the predicate fit from live run ed1d4094 no longer fails", () => {
  const t = "R1 Поиск фруктов по части имени (регистронезависимо)\n"
    + "   fit:    регистронезависимое вхождение подстроки\n"
    + '   verify: GET /fruits?name=an возвращает фрукты, содержащие "an" в имени (вкл. "An", "AN")\n\n'
    + "R2 Ответ ограничен по размеру\n"
    + "   fit:    не более 10 записей\n"
    + "   verify: GET /fruits?name=a → count ≤ 10\n\n"
    + "subjects[]: fruit · search · limit\nanalogue: PromptSnippet\nopen-questions: 0\n"
  const r = newBrd(t, ["UI тянет весь список фруктов", "- вопрос: предел?\n  ответ: 10"])
  assert.equal(r.ok, true)
  assert.equal(r.value.requirements.length, 2)
})

// --- the registry and the role have not drifted apart --------------------------------------------------------------------

// izi-pi-v2 (S9): the role lives next to the slice's core, as in donor izi-flow-v2 — steps/brd/, not
// a separate roles/ directory (docs/workflow.md §1). S11: the role file is named after the ROLE,
// steps/brd/gilb.md, not steps/brd/role.md — the extension declares steps/brd/ as roleDirectories
// (ext/index.mjs), and pi-extensible-workflows resolves the role by the file name (<role>.md), not by
// the step directory; role.md would install as the role "role", not "gilb".
const ROLE_PATH = join(HERE, "gilb.md")
test("the role knows about invented-default", () => {
  assert.match(readFileSync(ROLE_PATH, "utf8"), /invented-default/)
})

// G9 — the seam the live runs demanded, and it is instant. Two runs on ONE TASK.md produced
// `fruit · search · filter · limit · backward · compatibility` and
// `fruit · search · partial-match · limit · backward-compatibility`: half the anchors matched no file
// at all. The cause is not the model — it is THIS FILE. The example's task text says «старые записи»,
// while its answer said `subjects[]: audit · retention · rotation`: `retention` is a category LABEL
// its author invented, so the example taught labelling instead of translating (standards/role.md
// warns the example is recognised and completed from). The guardrail cannot catch it — `newSubjects`
// judges composition (3..7, no space, no duplicates), and judging MEANING would cost what run
// ed1d4094 cost: three redelegations on a correct artifact. So the example carries the burden, and
// this test is what keeps it carrying it.
test("G9: the example teaches TRANSLATION, not labelling — no invented category word in it", () => {
  const role = readFileSync(ROLE_PATH, "utf8")
  // The grep is scoped to the layer it is about. It used to read the WHOLE role, which was the same
  // thing while `retention` occurred nowhere else — until LAW 4 needed a rejected criterion from a
  // foreign domain (`retention window 90 days` → the artifact must say `90 дней`). A word shown as
  // REJECTED in a LAW does not teach labelling; a word standing in the example's `subjects[]` does,
  // and that is still what turns this red.
  const example = role.slice(role.indexOf("$START_EXAMPLE"))
  assert.doesNotMatch(example, /retention/i)           // the label; the task text says «записи» → `record`
  assert.match(role, /subjects\[\]: audit · record · rotation/)
  // …and the prohibition names the machine check that catches it, as every prohibition here must.
  assert.match(role, /hitsFor/)
})

// Grep seam of the ROLE CLEANUP, and it is the corrective half of this rule. `case-insensitive
// substring match` and `unchanged | changed` were not invented by any model: they stood in the role's
// own LAW 1 and in its EXAMPLE, and for a 27B model an example outweighs a law. A guardrail laid on
// top of a role that demonstrates the violation is paid for in redelegation loops at LOOPS = 3.
test("the role no longer demonstrates what the guardrail forbids", () => {
  const role = readFileSync(ROLE_PATH, "utf8")
  assert.doesNotMatch(role, /substring match|case-insensitive substring/i, "LAW 1 carries no English predicate")
  assert.doesNotMatch(role, /unchanged/i, "the example's fit does not model an untranslated form word")
  // The prohibition is ONE line, and it names its check (standards/role.md §2). Two lines meant two
  // thresholds, and a small model cannot obey both.
  const forbidden = role.slice(role.indexOf("$START_FORBIDDEN"), role.indexOf("$END_FORBIDDEN"))
  const drift = forbidden.split("\n").filter((l) => l.includes("language-drift"))
  assert.equal(drift.length, 1, `[language-drift] is stated on ${drift.length} lines of FORBIDDEN`)
  // …and the sentence that explained the role's own language away is gone: every role has been
  // Russian since 36663ef, so it described a state of affairs that no longer exists.
  assert.doesNotMatch(role, /при английской роли/)
  // A field name is not Latin-by-shape: unlike a path or a code it does not stand in the request, and
  // at step 2 the role has no repository to read it from. LAW 4 licensing it taught the guess.
  assert.doesNotMatch(role, /Латиницей пишется только:[^\n]*имя поля/)
  assert.match(role, /только если оно стоит в запросе/)
})

// The order is a file the host reads, not code, and two of its properties degrade silently — each at
// the cost of a live run. 1: prompt() demands an EXACT bidirectional match between placeholders and
// the values workflows/izi.js passes (execution.ts throws "Missing prompt value"/"Unused prompt
// value" at LAUNCH). 2: G9e — a rule copied into the template instead of substituted is a second
// text of one requirement, and the guardrail refuses in the words of the REGISTRY, not of the copy.
const ORDER_KEYS = ["TASK", "ANSWERS", "FEEDBACK", "STAGING", "CHECK", "SUBJECTS_MIN", "SUBJECTS_MAX", "SUBJECT_RULE", "ANALOGUE_RULE"]

test("order.tpl: exactly the keys the workflow passes, and the anchor rule is SUBSTITUTED not copied", () => {
  const tpl = readFileSync(join(HERE, "order.tpl"), "utf8")
  const placeholders = [...tpl.matchAll(/{{|}}|{([A-Za-z_$][\w$]*)}/g)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]))
  assert.deepEqual([...new Set(placeholders)].sort(), [...ORDER_KEYS].sort())
  assert.ok(!tpl.includes(BRD_FORM.subjectRule), "the rule must arrive by substitution, not as a copy")
})

// F17 (run-5) as a corpus test: a number FROM the operator's ANSWER stays legal, a number from the
// list of alternatives in the same question does not. Both sides are needed: a rule that fails on
// everything forces the role to corrupt a correct artifact.
test("a number from the operator's answer is legal, a number from the question's alternatives is not", () => {
  const known = new Set([...numbersIn("20")])
  assert.equal(newFit("20 records by default", known).ok, true)
  assert.equal(newFit("20 records by default, 100 maximum", known).error.cls, "invented-default")
})

// --- the language of a `fit:` -----------------------------------------------------------------------
//
// The measure itself lives in core/lang.mjs with its own units; what is checked HERE is the wiring:
// which requirement is named, under which code, and that a correct artifact is left alone.

const RU = "нужен поиск по части имени с ограничением размера ответа"

// Corpus test: the run-6 artifact, verbatim. It passed acceptance green, and it's exactly the
// bilingual document this rule was introduced for — now it must fail, and the diagnosis must name
// the requirement and the code.
test("the run-6 artifact fails on language drift instead of passing green", () => {
  const t = "R1 Пользователи ищутся по подстроке в имени/фамилии, без учёта регистра\n"
    + "   fit:    match = substring at any position in name/surname, case folded; result true | false\n"
    + "   verify: search query with partial name returns matching users\n\n"
    + "subjects[]: users · search · errors\nanalogue: PromptSnippet\nopen-questions: 0\n"
  const r = newBrd(t, [RU])
  assert.match(r.error.detail, /R1 \[language-drift\]/)
})

// `verify` is declared by the role and the order as "command | artifact" and is English by nature:
// a rule that fails a correctly executed form sends the role to corrupt a correct artifact.
test("verify is not judged by language — it is a command, not prose", () => {
  const t = "R1 Пользователи ищутся по подстроке в имени\n"
    + "   fit:    подстрока в любой позиции, без учёта регистра; результат — да | нет\n"
    + "   verify: GET /users?q=part returns matching users\n\n"
    + "subjects[]: users · search · errors\nanalogue: PromptSnippet\nopen-questions: 0\n"
  assert.equal(newBrd(t, [RU]).ok, true)
})

// Corpus test, live run 9b019d80-d28e-4d40-bc94-15bb9b14fff6 (form quarkus-rest-json-app-v2-t2): the
// staged brd.md and the run's own inputs, both verbatim. checkBrd/2 answered
// {"ok":true,"requirements":6,"advice":[]} — no blocker, no advice — and the untranslated term then
// travelled into frd.xml's goal, a use case step, a scenario's `after` and an `<nfr fit>`. Three
// requirements out of six must now be named, and the three built from the request's own words must
// not be touched: a rule that fails everything sends the role to corrupt a correct artifact.
const T2_SOURCES = [
  "Нужен новый эндпоинт, отдающий ОДИН фрукт по его имени, а не весь список.\n"
  + "Страница со списком фруктов должна уметь показать карточку выбранного фрукта,\n"
  + "запрашивая её этим эндпоинтом. Существующие вызовы ломать нельзя.\n",
  "GET", "/fruits/{name}", "404", "без учёта регистра", "все поля объекта",
]
const T2_BRD = "R1 Новый эндпоинт отдаёт один фрукт по имени\n"
  + "   fit:    GET /fruits/{name} → HTTP 200, тело — JSON-объект одного фрукта\n"
  + "   verify: curl GET /fruits/{name} → 200 с объектом фрукта\n\n"
  + "R2 Поиск фрукта по имени выполняется без учёта регистра\n"
  + "   fit:    сравнение имени — case-insensitive substring match\n"
  + "   verify: GET /fruits/{name} с разным регистром → тот же результат\n\n"
  + "R3 При отсутствии фрукта возвращается HTTP 404\n"
  + "   fit:    GET /fruits/{name} для несуществующего фрукта → HTTP 404\n"
  + "   verify: curl GET /fruits/{nonexistent} → 404\n\n"
  + "R4 Ответ эндпоинта содержит все поля объекта фрукта\n"
  + "   fit:    JSON-объект ответа включает все поля фрукта\n"
  + "   verify: ответ GET /fruits/{name} содержит все атрибуты объекта\n\n"
  + "R5 Страница со списком фруктов показывает карточку выбранного фрукта, запрашивая её через новый эндпоинт\n"
  + "   fit:    fruit list page выполняет GET /fruits/{name} для отображения карточки\n"
  + "   verify: UI-тест — клик на фрукте в списке вызывает запрос к GET /fruits/{name} и отображает карточку\n\n"
  + "R6 Существующие вызовы не ломаются\n"
  + "   fit:    формат и поведение существующих API endpoints — unchanged\n"
  + "   verify: существующие контрактные тесты остаются зелёными\n\n"
  + "analogue: fruit — существующий эндпоинт и страница списка фруктов\n"
  + "subjects[]: fruit · endpoint · card · list · page\nopen-questions: 0\n"

test("the 9b019d80 artifact is red where it was green, and silent on the criteria that are clean", () => {
  const detail = newBrd(T2_BRD, T2_SOURCES).error.detail
  assert.match(detail, /R2 \[language-drift\].*case-insensitive/)
  assert.match(detail, /R5 \[language-drift\]/)     // `list`, `page` — in neither the task nor an answer
  assert.match(detail, /R6 \[language-drift\].*unchanged/)
  for (const clean of ["R1", "R3", "R4"]) {
    assert.doesNotMatch(detail, new RegExp(`${clean} \\[language-drift\\]`), `${clean} is written in the request's own words`)
  }
})

// The seam of the THRESHOLD itself, and it is the one the first edition of this rule failed. A single
// free word is a blocker: under FEEDBACK a role deletes one word of a pair — cheaper than translating
// — and a two-in-a-row measure goes green with the term still standing.
test("one free word is a blocker — the counterexample the pair measure let through", () => {
  const t = T2_BRD.replace("case-insensitive substring match", "case-insensitive")
  assert.match(newBrd(t, T2_SOURCES).error.detail, /R2 \[language-drift\].*case-insensitive/)
})

// Corpus test, form eddi: what the rule must NOT take away. `{create, read, update, delete}` is an
// enumeration, `{id}.glossary.json` and `eddi://ai.labs.glossary` are identifiers, `ZIP` is an
// operation, `Glossary` and `glossary` stand in the request itself. `skip (unchanged)` is a blocker,
// and a LEGAL one: it is the same defect class as R6 above — an English word the request never used.
test("eddi: enumerations, identifiers and the request's own words are left alone — `unchanged` is not", () => {
  const task = "В E.D.D.I появляется новый тип конфигурации — глоссарий (`Glossary`): словарь терминов бота,\n"
    + "CRUD с версионированием, по образцу Prompt Snippet, с типом ресурса `eddi://ai.labs.glossary`.\n"
    + "Термины должны подставляться в промпты как `{{glossary.<term>}}` наравне со сниппетами, и глоссарий\n"
    + "должен уезжать вместе с агентом при экспорте и приезжать при импорте — включая сравнение с уже\n"
    + "существующим и апгрейд.\n"
  const t = "R1 Вводится новый тип ресурса — глоссарий (Glossary)\n"
    + "   fit:    тип ресурса eddi://ai.labs.glossary\n"
    + "   verify: REST GET возвращает ресурс с URI-префиксом eddi://ai.labs.glossary\n\n"
    + "R2 Глоссарий поддерживает полный CRUD с версионированием\n"
    + "   fit:    операции {create, read, update, delete} | ?version=N\n"
    + "   verify: REST POST/GET/PUT/DELETE /glossary/{id} | ?version=N\n\n"
    + "R3 Термины глоссария подставляются в промпты по шаблону {{glossary.<term>}}\n"
    + "   fit:    синтаксис подстановки {{glossary.<term>}} — результат resolved | unresolved\n"
    + "   verify: resolved prompt содержит значение термина вместо {{glossary.<term>}}\n\n"
    + "R4 Глоссарий включается в экспорт и импорт агента со сравнением с существующим и апгрейдом\n"
    + "   fit:    ZIP содержит {id}.glossary.json | импорт: create | update | skip (unchanged)\n"
    + "   verify: ZIP-архив содержит файл с расширением .glossary.json\n\n"
    + "analogue: PromptSnippet — CRUD, версионирование, REST\n"
    + "subjects[]: Glossary · term · export · import · prompt · resource · template\nopen-questions: 0\n"
  const detail = newBrd(t, [task]).error.detail
  for (const clean of ["R1", "R2", "R3"]) {
    assert.doesNotMatch(detail, new RegExp(`${clean} \\[language-drift\\]`), `${clean} carries no free word`)
  }
  assert.match(detail, /R4 \[language-drift\].*unchanged/)
})

// A FIELD NAME IS A FACT WHEN SOMEBODY NAMED IT, AND A GUESS WHEN NOBODY DID — one unit, two sides,
// because that IS the rule. LAW 4 used to license «имя поля» as Latin-by-shape, alongside a path and
// an HTTP code. A path and a code stand in the request; a field name does not — and at step 2 the role
// has no facts about the code at all (`gilb.md` «Репозиторий не читаешь», $START_INPUT «Досье на этом
// шаге нет», Bash/grep unavailable). So a field name the input never named is not written, it is
// GUESSED, and by provenance a guess is indistinguishable from `unchanged`.
//
// The corpus is what settles it. `description` IS a real field
// (`quarkus-rest-json-app-v2-t3/src/main/java/org/acme/rest/json/Fruit.java:5`) — the role guessed
// right, and being right is not a source. Its neighbour `name` is legal for a reason that has nothing
// to do with luck: `<answer_1>` says «name как идентификатор». In form `eddi`/`b11-first-attempt` the
// role ASKED for both names («имя + строковое значение (name + value)») and both are legal there.
// Both disputed firings copy the shape of LAW 4's own example (`поле status`) — the same
// "example outweighs the law" defect D21 cured for LAW 1 and the EXAMPLE.
const T3_SOURCES = [
  "Список фруктов на странице есть, а посмотреть один фрукт целиком негде.\n"
  + "Нужна ОТДЕЛЬНАЯ страница карточки: открывается своим адресом, показывает\n"
  + "имя и описание одного фрукта. Существующую страницу списка не переделывать —\n"
  + "только добавить с неё переход на карточку. Существующие вызовы ломать нельзя.",
  "name как идентификатор, поле id не добавлять",
  "404 Not Found",
  "отдельный HTML файл fruit-card.html в META-INF/resources",
  "/fruit-card.html",
  "ссылка <a> — кликабельное имя фрукта",
  "IZI-3",
]
// R2 verbatim from `sandbox/runbox/quarkus-rest-json-app-v2-t3/.agent/brd.md`; the `analogue:` line is
// the test's own — that artifact predates the field, and the fit is what is load-bearing here.
const T3_R2 = "R2 На странице карточки отображаются имя и описание фрукта\n"
  + "   fit:    ответ содержит поля name и description одного фрукта\n"
  + "   verify: GET /fruits/{id} → JSON включает name и description\n\n"
  + "analogue: fruit — существующая страница списка фруктов\n"
  + "subjects[]: fruit · card · page · list · link\nopen-questions: 0\n"

// R3 verbatim from `sandbox/runbox/b11-first-attempt/brd.md`, with the `analogue:` line taken from the
// answer's own words («по образцу PromptSnippet») for the same reason.
const B11_SOURCES = [
  "В E.D.D.I появляется новый тип конфигурации — глоссарий (`Glossary`): словарь терминов бота,\n"
  + "CRUD с версионированием, по образцу Prompt Snippet, с типом ресурса `eddi://ai.labs.glossary`.\n"
  + "Термины должны подставляться в промпты как `{{glossary.<term>}}` наравне со сниппетами, и глоссарий\n"
  + "должен уезжать вместе с агентом при экспорте и приезжать при импорте — включая сравнение с уже\n"
  + "существующим и апгрейд.\n",
  "имя + строковое значение (name + value), без описания и синонимов — по образцу PromptSnippet",
]
const B11_R3 = "R3 Структура записи глоссария — имя + строковое значение\n"
  + "   fit:    поля `name` (строка) и `value` (строка), без описания и синонимов\n"
  + "   verify: JSON-схема GlossaryConfiguration содержит ровно два поля name и value\n\n"
  + "analogue: PromptSnippet — по образцу него CRUD и версионирование\n"
  + "subjects[]: glossary · GlossaryConfiguration · export · import\nopen-questions: 0\n"

test("a field name is a fact when it was named, a guess when it was not", () => {
  // t3: `name` came from an answer and is left alone; `description` came from the model's head and is
  // named — even though it happens to be the real field.
  const detail = newBrd(T3_R2, T3_SOURCES).error.detail
  assert.match(detail, /R2 \[language-drift\]: «description»/)
  assert.doesNotMatch(detail, /«name»/, "`name` stands in <answer_1> — a source, not a guess")

  // b11: the role ASKED for the record's structure, the operator answered with both names, and the
  // same shape of fit is then legal in full.
  assert.equal(newBrd(B11_R3, B11_SOURCES).ok, true)
})

// BUG_FIX_CONTEXT eddi, runs 9a98f081 / 256e1830: the same TASK.md says «по образцу Prompt Snippet».
// One role turned that into an anchor and step 3b reached 8 of the 10 files the change needs; the
// other did not and reached 2. The thing a change is modelled on is the only handle a repository
// offers when the change's own name does not exist in it yet.
test("analogue: the model this work follows is a FIELD, and its absence is declared", () => {
  const withField = BRD("20 записей")
  assert.equal(newBrd(withField, ["20 записей"]).ok, true)

  const without = withField.replace("analogue: PromptSnippet\n", "")
  assert.match(newBrd(without, ["20 записей"]).error.detail, /нет строки analogue/)

  const bare = withField.replace("analogue: PromptSnippet", "analogue: none")
  assert.match(newBrd(bare, ["20 записей"]).error.detail, /none без причины/)

  const declared = withField.replace("analogue: PromptSnippet", "analogue: none — в репозитории нет ничего похожего")
  assert.equal(newBrd(declared, ["20 записей"]).ok, true)

  assert.equal(parseBrd(withField).analogue, "PromptSnippet")

  // BUG_FIX_CONTEXT eddi, the first live run with this field: the role wrote a SENTENCE —
  // `Prompt Snippet (PromptSnippetService, …) — по образцу него …` — and step 3b grepped the tree
  // for that whole string. Nothing matched, the phase did nothing, and the focus fell to 1 of 10.
  const prose = withField.replace("analogue: PromptSnippet", "analogue: Prompt Snippet (PromptSnippetService) — по образцу него CRUD")
  assert.match(newBrd(prose, ["20 записей"]).error.detail, /analogue «Prompt Snippet»/)

  const withWhy = withField.replace("analogue: PromptSnippet", "analogue: PromptSnippet — по образцу него CRUD, хранилище и экспорт")
  assert.equal(newBrd(withWhy, ["20 записей"]).ok, true)
  assert.equal(analogueTerm(withWhy.match(/analogue: (.*)/)[1]), "PromptSnippet")
  assert.equal(analogueTerm("none — ничего похожего"), "")
})
