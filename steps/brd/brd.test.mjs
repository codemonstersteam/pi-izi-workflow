// The `brd` slice: BRD as a domain value. One test per factory — 1 happy path + the number of
// DISTINGUISHABLE outcomes (standards/code.md §5). The input range is checked by the factory that
// owns the field; newBrd is responsible only for what it adds itself: collect all blockers at once
// and carry advice forward on success.

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { newFit, newRequirement, newSubjects, adviceFor, newBrd, numbersIn, languageDrifted, BRD_FORM, parseBrd, analogueTerm } from "./brd.mjs"

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
  assert.doesNotMatch(role, /retention/i)              // the label; the task text says «записи» → `record`
  assert.match(role, /subjects\[\]: audit · record · rotation/)
  // …and the prohibition names the machine check that catches it, as every prohibition here must.
  assert.match(role, /hitsFor/)
})

// The order is a file the host reads, not code, and two of its properties degrade silently — each at
// the cost of a live run. 1: prompt() demands an EXACT bidirectional match between placeholders and
// the values workflows/izi.js passes (execution.ts throws "Missing prompt value"/"Unused prompt
// value" at LAUNCH). 2: G9e — a rule copied into the template instead of substituted is a second
// text of one requirement, and the guardrail refuses in the words of the REGISTRY, not of the copy.
const ORDER_KEYS = ["TASK", "ANSWERS", "FEEDBACK", "STAGING", "CHECK", "SUBJECTS_MIN", "SUBJECTS_MAX", "SUBJECT_RULE"]

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

// --- languageDrifted: 1 happy + 4 distinguishable outcomes ------------------------------------------------
//
// F20 (run-6) and F16 (run-5): on a Russian task, requirement statements came out Russian while
// criteria came out English. The artifact is half-produced from the prompt, and to the human who
// accepts it, it's a document in two languages; acceptance could not tell the difference.

const RU = "нужен поиск по части имени с ограничением размера ответа"
const EN = "search users by partial name with a response size limit"

test("Russian input, English criterion — drift", () => {
  assert.equal(languageDrifted("match = substring at any position, case folded", RU), true)
})

test("the rule works both ways — English input, Russian criterion", () => {
  assert.equal(languageDrifted("подстрока в любой позиции имени", EN), true)
})

// Below the letter threshold text carries no language: there is nothing to judge `≤ 200 ms` by.
test("a criterion without letters has no language", () => {
  assert.equal(languageDrifted("≤ 200", RU), false)
})

// No source — nothing to check against, and silence is more honest than a random accusation (the
// invented-default rule stays silent on the same grounds).
test("no source given — the rule stays silent", () => {
  assert.equal(languageDrifted("response time ≤ 200 ms", ""), false)
})

test("a mixed source decides nothing — the rule stays silent", () => {
  assert.equal(languageDrifted("response time ≤ 200 ms", "search по name, limit 20, response не больше 200 ms"), false)
})

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
