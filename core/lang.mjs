// MODULE_CONTRACT: lang — the one place that decides where a WORD in an artifact's field came from
// Purpose:    one decision — a Latin word standing in a Russian criterion either has a SOURCE (the
//             task, an operator's answer, the artifact's own form, or the shape it stands in: a path,
//             an operation, a code, an enumeration, a number's decoding) or it has none, and a word
//             with no source is the same defect class as a number with no source
//             (steps/brd/brd.mjs::newFit, `invented-default`). PROVENANCE is judged here, never
//             connectedness and never taste.
// io:         none
// Invariants: EDGE_PUNCT, INSIDE_MARKS, MIN_LETTERS, FREE_WORDS_BLOCK and CYRILLIC_CAP are module
//             constants fixed at load; cyrillicRatio, sourceGate, vocabOf, freeWords,
//             languageDrifted and cyrillicWords are pure stateless functions whose result depends on
//             their arguments alone.
// Interface:  cyrillicRatio(text) -> number
//             sourceGate(source) -> "free-words" | "reverse" | "silent"
//             vocabOf(sources) -> Set<string>
//             freeWords(text, vocab) -> string[]
//             FREE_WORDS_BLOCK — how many free words make a blocker
//             languageDrifted(fit, source) -> boolean
//             cyrillicWords(text, cap) -> string[]
//             CYRILLIC_CAP — how many offenders a blocker names
//
// TWO DIRECTIONS, TWO MEASURES, AND THE DIFFERENCE IS THE READER. Everything above the plan is read by
// a HUMAN in the language of the order, and there the unit is provenance: a Latin word must say where
// it came from. From the FRD down the reader is a SMALL MODEL writing code in an English repository,
// and there the unit is presence: one Cyrillic word is an order it cannot act on (cyrillicWords).
//
// WHY THE MEASURE IS PROVENANCE AND NOT A LETTER SHARE.
//
// BUG_FIX_CONTEXT: live run 9b019d80-d28e-4d40-bc94-15bb9b14fff6 (form quarkus-rest-json-app-v2-t2).
//   Previous: languageDrifted alone — the Cyrillic share of the WHOLE fit, red only at rs > 0.5 &&
//             rf < 0.1.
//   Problem:  `fit: сравнение имени — case-insensitive substring match` scores 0.33 and
//             `fit: … существующих API endpoints — unchanged` scores 0.57: an ordinary Russian line
//             carrying one English word can never reach the threshold, so the rule was silent BY
//             CONSTRUCTION (`checkBrd/2 → {"ok":true,"requirements":6,"advice":[]}`). The term then
//             travelled into frd.xml — goal, a use case step, a scenario's `after`, an `<nfr fit>`.
//   Fix:      the unit judged is the WORD, not the line, and the question asked of it is the one the
//             number rule already asks: where did you come from. The threshold is ONE such word.
//
// WHY NOT "TWO FREE WORDS IN A ROW". That measure judged a SYMPTOM. A role under FEEDBACK deletes one
// word — cheaper than translating — and the pair is gone with the defect intact; on the live corpus
// it also produced four false blockers, and "in a row" is a SPACE between two Latin tokens, not a
// language: `… endpoints — unchanged` is green and `… endpoints unchanged` red, the difference being
// a dash.

import { BRD_FORM } from "./form.mjs"

// The edges of a chunk are stripped BEFORE any judgement: without this `(case-insensitive)` is not
// caught at all — the parentheses make it a token no ground below recognises. The BACKTICK is here
// for the opposite reason: `b11-first-attempt/brd.md` writes field names as `` `name` ``, and a word
// left wearing its quotes never matches the dictionary it does stand in — a false blocker on a
// correct artifact.
const EDGE_PUNCT = "«»\"'`,.;:!?—()"

// A mark INSIDE a chunk says the chunk is not prose: it is a path, an operation, a code, an id, a
// template placeholder. `steps/brd/brd.mjs::isDesignationDigit` makes the same distinction for
// numbers, and for the same reason — a machine token is not a word somebody chose.
const INSIDE_MARKS = /[\/\\.{}<>="'?&#@_:]|\d/

// Below this many letters a fit carries no language at all: `fit: ≤ 200 мс` is two or three alphabet
// characters beside a number and a comparison sign, and there is nothing to judge. Used by the
// REVERSE direction only — freeWords judges one word at a time and needs no line-level floor.
const MIN_LETTERS = 6

// ONE free word is a blocker. Two-in-a-row existed only to let `unchanged` through; the form's closed
// list (BRD_FORM.formWords) solves that honestly, and one word is what catches `case-insensitive`
// standing alone.
export const FREE_WORDS_BLOCK = 1

const FORM_WORDS = new Set(BRD_FORM.formWords.map((w) => w.toLowerCase()))

// FUNCTION_CONTRACT: cyrillicRatio — the share of Cyrillic among a text's letters
//   Input:        text — any text; coerced to a string, type unconstrained
//   Dependencies: —
//   Antecedent:   any value
//   Consequent:   success: a number 0..1 — Cyrillic letters divided by all letters; no letters in the
//                          text (empty, digits, markup) → 0, never a division by zero
//                 failure: none — total
//   Purity:       pure
//   Interface:    cyrillicRatio(text: unknown) -> number
// The SHARE is judged, not the presence: a single term, a file name or a quotation from somebody
// else's artifact do not make a text foreign; a paragraph of prose does.
export function cyrillicRatio(text) {
  const s = String(text || "")
  const letters = s.match(/\p{L}/gu)
  if (!letters) return 0
  return letters.filter((c) => /[Ѐ-ӿ]/.test(c)).length / letters.length
}

// FUNCTION_CONTRACT: sourceGate — which measure the INPUT's own language allows
//   Input:        source — the text that sets the artifact's language (the task plus the operator's
//                 answers), joined
//   Dependencies: cyrillicRatio
//   Antecedent:   any value, coerced to a string
//   Consequent:   success: "free-words" — the source is decidedly Russian (rs > 0.5): an English word
//                                         in a fit has to prove where it came from
//                          "reverse"    — the source is decidedly English (rs < 0.1): the old
//                                         direction, a Russian criterion under an English request
//                          "silent"     — a blank source, or one mixed enough to decide nothing.
//                                         Silence is more honest than accusing at random, the same
//                                         ground the invented-default rule stays silent on
//                 failure: none — total
//   Purity:       pure
//   Interface:    sourceGate(source: unknown) -> "free-words" | "reverse" | "silent"
export function sourceGate(source) {
  const src = String(source || "")
  if (!src.trim()) return "silent"
  const rs = cyrillicRatio(src)
  if (rs > 0.5) return "free-words"
  if (rs < 0.1) return "reverse"
  return "silent"
}

// FUNCTION_CONTRACT: vocabOf — the Latin words the RUN'S INPUTS actually contain
//   Input:        sources — the texts a role may take words from: TASK.md and the VALUES of the
//                 operator's answers (never a question's own wording — the alternatives in it have
//                 the status of numbers in the role's head, core/answers.mjs)
//   Dependencies: —
//   Antecedent:   an array of any values; a non-array reads as no sources at all
//   Consequent:   success: a Set of lower-cased Latin words, each stored twice — as it stands and
//                          without a trailing "s", so `endpoints` and `endpoint` are one entry.
//                          Words are cut on non-Latin characters, so `/fruits/{name}` contributes
//                          `fruits`, `fruit` and `name`
//                 failure: none — total
//   Purity:       pure
//   Interface:    vocabOf(sources: unknown[]) -> Set<string>
//
// NOTHING FROM THE FILE UNDER JUDGEMENT. `subjects[]` and `analogue` are read from the ARTIFACT, and
// a role under FEEDBACK silences the blocker by writing the offending words into its own anchors —
// verified: the blocker goes away. That is the very breed of rule dropped on 01.08, the one that
// ordered the role to SPOIL its anchors. The dictionary is built from the inputs or not at all.
export function vocabOf(sources) {
  const out = new Set()
  for (const t of Array.isArray(sources) ? sources : []) {
    for (const m of String(t || "").matchAll(/[A-Za-z]+/g)) {
      const w = m[0].toLowerCase()
      out.add(w)
      out.add(w.replace(/s$/, ""))
    }
  }
  return out
}

// nextMark / prevMark — the character standing next to a span, whitespace skipped. An enumeration is
// recognised by the separator that touches the WORD, so `unchanged | changed` (a standalone bar),
// `{create, read, update, delete}` (a comma glued to the word) and `create / read / update / delete`
// (a slash, the third separator the corpus writes) are one shape, while
// `частичное совпадение (substring), регистронезависимо` is not: what touches `substring` there is a
// parenthesis, and the comma belongs to the sentence, not to a list.
//
// The SLASH is a separator only when it stands apart. Glued — `create/read` — ground 1 has already
// removed the chunk as a path, and `GET /fruits/{name}` is a path for the same reason: there the
// slash touches the word from the left but the word itself carries marks inside.
function prevMark(s, at) {
  let i = at - 1
  while (i >= 0 && /\s/.test(s[i])) i--
  if (i < 0) return false
  if (s[i] === "|" || s[i] === ",") return true
  return s[i] === "/" && (i === 0 || /\s/.test(s[i - 1]))
}
function nextMark(s, at) {
  let i = at
  while (i < s.length && /\s/.test(s[i])) i++
  if (i >= s.length) return false
  if (s[i] === "|" || s[i] === ",") return true
  return s[i] === "/" && (i + 1 >= s.length || /\s/.test(s[i + 1]))
}

// FUNCTION_CONTRACT: freeWords — the Latin words of a text that no source accounts for
//   Input:        text — one field's wording (a BRD `fit:`); type unconstrained
//   Dependencies: vocab — vocabOf(the run's inputs); FORM_WORDS (BRD_FORM.formWords); EDGE_PUNCT;
//                 INSIDE_MARKS; prevMark/nextMark
//   Antecedent:   any values; a missing vocab reads as an empty one (every Latin word is then free)
//   Consequent:   success: the surviving words in the order they stand, each as it reads after its
//                          edge punctuation is stripped. A chunk is REMOVED when it
//                          1. carries inside it one of / \ . { } < > = " ' ? & # @ _ : or a digit —
//                             a path, an operation, a code, an id;
//                          2. is entirely upper case and at least 2 characters long — GET, HTTP;
//                          3. holds less than half Latin among its letters — `JSON-объект`, and with
//                             it every purely Cyrillic and letterless chunk;
//                          4. stands in the run's input vocabulary, as itself or without a
//                             trailing "s";
//                          5. stands in the form's closed word list (BRD_FORM.formWords);
//                          6. stands in an enumeration — the mark touching it left or right is | or ,
//                             or a slash standing apart (`create / read / update`); a slash glued to
//                             what follows is a path, and the word before it stays judged;
//                          7. decodes the number before it — a capitalised Latin word following a
//                             number chunk, or following such a word: `404 Not Found`, `200 OK`.
//                          Nothing survives an empty text → []
//                 failure: none — total
//   Purity:       pure
//   Interface:    freeWords(text: unknown, vocab: Set<string>) -> string[]
export function freeWords(text, vocab) {
  const s = String(text || "")
  const known = vocab instanceof Set ? vocab : new Set()
  const out = []
  let decoding = false          // the previous chunk was a number, or a word decoding one
  for (const m of s.matchAll(/\S+/g)) {
    const raw = m[0]
    let a = 0
    let b = raw.length
    while (a < b && EDGE_PUNCT.includes(raw[a])) a++
    while (b > a && EDGE_PUNCT.includes(raw[b - 1])) b--
    const word = raw.slice(a, b)
    const start = m.index + a
    const wasDecoding = decoding
    decoding = /^\d+(?:[.,]\d+)?$/.test(word)
    if (!word) continue

    const letters = word.match(/\p{L}/gu)
    if (!letters) continue
    const latin = letters.filter((c) => /[A-Za-z]/.test(c)).length
    if (latin / letters.length < 0.5) continue                                   // 3
    if (INSIDE_MARKS.test(word)) continue                                        // 1
    if (word.length >= 2 && word === word.toUpperCase()) continue                // 2
    const key = word.toLowerCase()
    if (known.has(key) || known.has(key.replace(/s$/, ""))) continue             // 4
    if (FORM_WORDS.has(key)) continue                                            // 5
    if (prevMark(s, start) || nextMark(s, start + word.length)) continue          // 6
    if (wasDecoding && /^[A-Z]/.test(word)) { decoding = true; continue }        // 7

    out.push(word)
  }
  return out
}

// FUNCTION_CONTRACT: languageDrifted — is the criterion written in a language other than the source's
//   Input:        fit — one requirement's fit wording; type unconstrained
//   Dependencies: source — the text that sets the artifact's language (the task plus the operator's
//                 answers); empty → the rule stays silent: there is nothing to compare against, and
//                 silence is more honest than accusing at random
//   Antecedent:   any values, both coerced to strings
//   Consequent:   success: true when the source is decidedly in one alphabet (a Cyrillic share > 0.5
//                          or < 0.1) and the fit decidedly in the other, AND the fit holds at least
//                          MIN_LETTERS letters; false in every other case — a mixed source, a short
//                          fit and an empty source are not judgeable
//                 failure: none — total
//   Purity:       pure
//   Interface:    languageDrifted(fit: unknown, source: unknown) -> boolean
// F20 (run-6) and F16 (run-5): with a Russian task, the requirements' wordings came back in Russian
// while `fit`/`verify` came back in English, because a role takes its FORM from the example and its
// CONTENT from the input. The artifact is produced half out of the prompt; to the human accepting it
// that is a document in two languages, and to acceptance it was indistinguishable.
//
// ITS SURVIVING DIRECTION IS `rs < 0.1`. Under a RUSSIAN source freeWords is the measure — a share of
// letters cannot see one inserted word (see the module's BUG_FIX_CONTEXT). Under an ENGLISH source
// this is still the only measure there is, and it stays untouched: the consumer picks by sourceGate.
//
// ONLY `fit` IS JUDGED, by either measure. `verify` is declared as "a command | an artifact" (the
// role, the order), and it is English by nature — a rule has no right to turn red on a correctly
// executed form. `subjects[]` are excluded by the registry: BRD_FORM.subjectRule explicitly
// prescribes the REPOSITORY's language for anchors, not the request's.
export function languageDrifted(fit, source) {
  const src = String(source || "")
  if (!src.trim()) return false
  const f = String(fit || "")
  if ((f.match(/\p{L}/gu) || []).length < MIN_LETTERS) return false
  const rs = cyrillicRatio(src)
  const rf = cyrillicRatio(f)
  if (rs > 0.5) return rf < 0.1
  if (rs < 0.1) return rf > 0.5
  return false
}

// FUNCTION_CONTRACT: cyrillicWords — which words of an ENGLISH artifact are not English
//   Input:        text — the artifact's text; coerced to a string, type unconstrained
//                 cap  — how many offenders to name (default CYRILLIC_CAP)
//   Dependencies: —
//   Antecedent:   any value
//   Consequent:   success: string[] — the distinct words carrying a Cyrillic letter, in the order
//                          they appear, at most `cap` of them; empty means the text is clean
//                 failure: none — total
//   Purity:       pure
//   Interface:    cyrillicWords(text: unknown, cap?: number) -> string[]
//
// THE MEASURE HERE IS PRESENCE, NOT A SHARE — and that is the OPPOSITE of cyrillicRatio above, on
// purpose. That one judges a human's artifact, where one foreign term among a paragraph decides
// nothing. This one judges an artifact whose reader is a SMALL MODEL writing code: it takes the
// requirement in one language and the repository in another, and a single Cyrillic word in its order
// is a word it cannot act on. There is no share below which that is acceptable, so the threshold is
// one word — the same discipline as the number with no source.
//
// THE BLOCKER NAMES THE WORDS, never just the fact: a role told «there is Cyrillic in it» rewrites
// the file; a role told «глоссарий, шаг» fixes two lines.
export const CYRILLIC_CAP = 6

export function cyrillicWords(text, cap = CYRILLIC_CAP) {
  const out = []
  for (const w of String(text || "").split(/\s+/)) {
    if (!/[Ѐ-ӿ]/.test(w)) continue
    // The edges are stripped for the same reason they are stripped for freeWords: `«шаг»,` and `шаг`
    // are one offender, and naming both twice makes the blocker longer without making it truer.
    const bare = w.replace(/^[^\p{L}\p{N}]+/u, "").replace(/[^\p{L}\p{N}]+$/u, "")
    if (bare && !out.includes(bare)) out.push(bare)
    if (out.length >= cap) break
  }
  return out
}
