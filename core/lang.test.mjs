// Units for core/lang.mjs — where a word in a criterion came from.
//
// The formula (standards/code.md §TESTS) counts one happy path plus the antecedent branches with a
// DISTINGUISHABLE consequent. freeWords has seven removal grounds and they all end in the same
// consequent (the word is not free), so they travel as ONE table unit instead of seven copies — the
// same shape numbersIn's designation table already uses in steps/brd/brd.test.mjs.

import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { cyrillicRatio, sourceGate, vocabOf, freeWords, languageDrifted, cyrillicWords, CYRILLIC_CAP } from "./lang.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, "..")

// The inputs of live run 9b019d80-d28e-4d40-bc94-15bb9b14fff6 (form quarkus-rest-json-app-v2-t2),
// verbatim: TASK.md, then the VALUES of the five operator answers. Nothing from the artifact.
const T2_TASK = "Нужен новый эндпоинт, отдающий ОДИН фрукт по его имени, а не весь список.\n"
  + "Страница со списком фруктов должна уметь показать карточку выбранного фрукта,\n"
  + "запрашивая её этим эндпоинтом. Существующие вызовы ломать нельзя.\n"
const T2_ANSWERS = ["GET", "/fruits/{name}", "404", "без учёта регистра", "все поля объекта"]
const T2_VOCAB = vocabOf([T2_TASK, ...T2_ANSWERS])

// --- freeWords: the word with no source -------------------------------------------------------------
//
// SEAM. The run's R2 is the whole reason this module exists: `fit: сравнение имени —
// case-insensitive substring match` scores a Cyrillic share of 0.33, which no line-level threshold
// can reach, and checkBrd/2 answered {"ok":true,"requirements":6,"advice":[]}.
//
// The one-word form is the seam the FIRST edition of this rule missed: it demanded two free words in
// a row, so a role under FEEDBACK deleted one word and kept the term. One word is a blocker.

test("a Latin word absent from the run's inputs is free — one word is enough", () => {
  assert.deepEqual(freeWords("сравнение имени — case-insensitive substring match", T2_VOCAB),
    ["case-insensitive", "substring", "match"])
  // The counterexample the two-in-a-row measure let through, verbatim.
  assert.deepEqual(freeWords("сравнение имени — case-insensitive", T2_VOCAB), ["case-insensitive"])
  // R6 of the same run: `endpoints` and `unchanged` are both free — the run's inputs never say either,
  // and `unchanged` is deliberately not a word of the form (core/form.mjs::BRD_FORM.formWords).
  assert.deepEqual(freeWords("формат и поведение существующих API endpoints — unchanged", T2_VOCAB),
    ["endpoints", "unchanged"])
  // Translated, the same criterion is silent — the rule must leave a correct artifact alone.
  assert.deepEqual(freeWords("сравнение имени — подстрока без учёта регистра", T2_VOCAB), [])
})

test("the seven grounds a Latin chunk is removed on", () => {
  const vocab = vocabOf(["мы держим GET /fruits/{name} и его endpoint", "лимит 10"])
  const table = [
    ["1 · a mark inside — a path, an operation, a code, an id", "тело — {id}.glossary.json и <term>"],
    ["2 · all upper case, two characters or more", "ответ — HTTP 200, тело JSON"],
    ["3 · less than half Latin among its letters", "ответ — JSON-объект одного фрукта"],
    ["4 · the run's input vocabulary, with or without a trailing s", "запрос идёт в endpoints нового fruit"],
    ["5 · the form's own closed word list", "поле fit и поле verify заполнены"],
    ["6 · an enumeration — a bar or a comma touches it", "операции {create, read, update, delete} | none"],
    ["6 · a slash standing apart is the third separator the corpus writes", "операции create / read / update / delete"],
    ["7 · the decoding of the number before it", "при отсутствии — 404 Not Found, иначе 200 OK"],
  ]
  for (const [why, fit] of table) assert.deepEqual(freeWords(fit, vocab), [], why)
  // …and the edge punctuation is stripped BEFORE any of them: in parentheses the word is still judged.
  assert.deepEqual(freeWords("сравнение имени (case-insensitive)", vocab), ["case-insensitive"])
  // A backtick is edge punctuation too: `b11-first-attempt/brd.md` quotes field names that way, and a
  // word wearing its quotes never matches the dictionary it does stand in.
  assert.deepEqual(freeWords("поля `name` и `endpoint` не переименованы", vocab), [])
  // The slash separates only when it stands APART. Glued to what follows it is a path, and the word
  // in front of it keeps being judged — otherwise every criterion ending in a URL goes silent.
  assert.deepEqual(freeWords("поведение unchanged /fruits/{name}", vocab), ["unchanged"])
})

// --- vocabOf: the dictionary is the INPUT, never the artifact ------------------------------------------
//
// The rule dropped on 01.08 was dropped because it made the role SPOIL its own anchors to satisfy it.
// A dictionary read from `subjects[]` or `analogue` repeats that: the role silences the blocker by
// writing `substring` and `match` into the anchors — verified, the blocker goes away — and the anchors
// stop being grep handles over the repository.

test("the dictionary is built from the inputs, and a plural is the same word", () => {
  const v = vocabOf(["мы держим /fruits/{name}", "endpoints не трогать"])
  assert.equal(v.has("fruit"), true, "a word inside a path counts, singular as well as plural")
  assert.equal(v.has("endpoint"), true)
  assert.equal(v.has("substring"), false)
  assert.equal(vocabOf(undefined).size, 0, "no sources — an empty dictionary, not a crash")
})

// --- sourceGate: the input decides WHICH measure may speak --------------------------------------------

test("the source picks the measure, and an undecidable source picks none", () => {
  assert.equal(sourceGate("нужен поиск по части имени с ограничением размера"), "free-words")
  assert.equal(sourceGate("search users by partial name with a response size limit"), "reverse")
  assert.equal(sourceGate("search по name, limit 20, response не больше 200 ms"), "silent")
  assert.equal(sourceGate(""), "silent")
  assert.equal(cyrillicRatio("200 ms"), 0, "no letters — no language, and no division by zero")
})

// --- languageDrifted: the reverse direction, moved here from steps/brd/brd.mjs -------------------------
//
// F20 (run-6) and F16 (run-5): on a Russian task, requirement statements came out Russian while
// criteria came out English. The artifact is half-produced from the prompt, and to the human who
// accepts it, it's a document in two languages; acceptance could not tell the difference.
//
// Under a RUSSIAN source freeWords is now the measure (see the module's BUG_FIX_CONTEXT). This
// function keeps the direction a word-level measure cannot serve — an ENGLISH request answered with a
// Russian criterion — and the units below are the ones it carried in steps/brd/brd.test.mjs.

const RU = "нужен поиск по части имени с ограничением размера ответа"
const EN = "search users by partial name with a response size limit"

test("the rule works both ways — English input, Russian criterion, and back", () => {
  assert.equal(languageDrifted("подстрока в любой позиции имени", EN), true)
  assert.equal(languageDrifted("match = substring at any position, case folded", RU), true)
})

test("nothing decidable — the rule stays silent instead of accusing at random", () => {
  // Below the letter threshold a text carries no language: there is nothing to judge `≤ 200 ms` by.
  assert.equal(languageDrifted("≤ 200", RU), false)
  // No source — nothing to check against, the same ground invented-default stays silent on.
  assert.equal(languageDrifted("response time ≤ 200 ms", ""), false)
  // A mixed source decides nothing.
  assert.equal(languageDrifted("response time ≤ 200 ms", "search по name, limit 20, response не больше 200 ms"), false)
})

// --- the trap that was removed with this rule ----------------------------------------------------------
//
// PROMPT_LANG declared `maxCyrillicPerLine` with no consumer at all, and it could never get one: every
// role in this repository is Russian since commit 36663ef, so the lint it described would turn red on
// each of them. A constant nothing enforces is read as a rule that holds — this asserts it is gone
// from the code and from the standard that described it, backlog and docs excepted (they RECORD it).
test("PROMPT_LANG is gone from the code and from standards/code.md", () => {
  // `git grep` exits 1 when it finds nothing — that IS the passing case, so the absence is read from
  // the exit code, not from a thrown error. A tool failure is not data (standards/code.md §4): any
  // other status is re-thrown rather than swallowed into a green.
  let found = ""
  try {
    // `:!core/lang.test.mjs` — THIS file names the constant twice (the comment above and the needle
    // itself), so without the exclusion the seam matches itself. It stayed green only while the file
    // was untracked: `git grep` reads the index, and the first commit that added it turned the seam
    // red on nothing.
    found = execFileSync("git", ["grep", "-l", "PROMPT_LANG", "--", "core", "steps", "ext/index.mjs", "bin", "workflows", "prompts", "standards", ":!core/lang.test.mjs"],
      { cwd: REPO, encoding: "utf8" }).trim()
  } catch (e) {
    if (e.status !== 1) throw e
  }
  assert.equal(found, "", `PROMPT_LANG still lives in: ${found}`)
})

// --- cyrillicWords: the OTHER direction — an artifact whose reader is a small model ------------------
//
// The formula: one happy path (a clean English ticket says nothing), plus every antecedent branch with
// a distinguishable consequent — a word carrying Cyrillic, the edges it wears, the repetition of one
// offender, and the cap. Presence, not a share: that is the whole difference from cyrillicRatio, and
// it is the branch asserted first.

test("a clean English artifact yields no offenders — and a single Cyrillic word yields one", () => {
  assert.deepEqual(cyrillicWords("## Stack\nJava · Quarkus CDI · MongoDB · JUnit 5"), [],
    "an English ticket is clean, and nothing but letters was judged")

  // ONE word in a whole paragraph — exactly what cyrillicRatio cannot see: its share here is 0.06.
  const one = "UC1 step 2: the system validates every ключ of the term against the pattern"
  assert.ok(cyrillicRatio(one) < 0.1, "the share is far below every threshold cyrillicRatio uses")
  assert.deepEqual(cyrillicWords(one), ["ключ"], "presence is the measure, so the one word is named")
})

test("edges are stripped, an offender is named once, and the cap holds", () => {
  assert.deepEqual(cyrillicWords("write «глоссарий», then the глоссарий again"), ["глоссарий"],
    "the quotes and the comma are not part of the word, and one offender is one entry")

  const many = Array.from({ length: CYRILLIC_CAP + 4 }, (_, k) => `слово${k}`).join(" ")
  assert.equal(cyrillicWords(many).length, CYRILLIC_CAP, "the blocker names at most CYRILLIC_CAP words")
  assert.equal(cyrillicWords(many, 2).length, 2, "and the caller may ask for fewer")
})

test("nothing to judge — no text, no letters, no argument at all", () => {
  for (const x of ["", "   ", "200 ms · ./mvnw test -Dtest=GlossaryStoreTest", null, undefined, 42]) {
    assert.deepEqual(cyrillicWords(x), [], `nothing is an offender in ${JSON.stringify(x)}`)
  }
})
