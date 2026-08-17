// MODULE_CONTRACT: brd — the pipeline's front door: the one place that decides whether a BRD is done
// Purpose:    one decision — the set of BRD acceptance rules (an R's mandatory fields, where a
//             criterion's numbers came from, wish-not-requirement, a design leak in the wording, the
//             greppability of subjects, closed open-questions) is gathered in one list of checks
//             instead of being scattered as prose across the role and the order — self-certification
//             is gone: "agent-ready" is decided by a script, not by the role about itself. S16: the
//             check "a fit is measurable by a token" was removed by the operator's decision — see
//             newFit below and live run ed1d4094.
// io:         none
// Invariants: WISH_WORDS and DESIGN_MARKS are module constants, fixed at load and unchanged at run
//             time; SUBJECTS_MIN/SUBJECTS_MAX are a snapshot of BRD_FORM.subjectsMin/subjectsMax
//             taken at module load, not recomputed per call; parseBrd and validateBrd are pure
//             stateless functions whose result depends on the given text/opts alone, never on history
//             or on the order of previous calls.
// Interface:  BRD_FORM — the registry of the BRD's form
//             SUBJECTS_MIN — the lower bound on the number of anchors
//             SUBJECTS_MAX — the upper bound on the number of anchors
//             numbersIn(text) -> Set<string>
//             parseBrd(text) -> { requirements, subjects, openQuestions }
//             newFit(raw, known) -> Result<Fit, "no-fit" | "invented-default">
//             newRequirement(raw, known) -> Result<Requirement, "invalid-requirement">
//             newSubjects(list) -> Result<Subjects, "invalid-subjects">
//             adviceFor(r) -> Advice[]
//             newBrd(text, sources) -> Result<Brd, "invalid-brd">
// The language of a `fit:` is judged by core/lang.mjs (sourceGate/vocabOf/freeWords/languageDrifted)
// — this module only wires it to the requirements it built and names the blocker.

// The front door's BRD acceptance (B1-S). PURE — no node:fs.
//
// Self-certification is gone: "agent-ready" is decided by a script, not by the role about itself. We
// check exactly what the role's law declares: every R has a fit and a verify; no questions are left;
// subjects[] are grep anchors rather than literature; the solution is not designed here.

// Wish-wordings. They are precisely what the front door exists to stop: they have neither a scale nor
// a way to be checked, and they look like a requirement. The words themselves stay in both languages:
// they are DOMAIN DATA matched against a BRD, which speaks the language of the operator's task.
const WISH_WORDS = [
  "быстро", "быстрый", "валидн", "корректн", "правильн", "как обычно", "обычная ошибка", "удобн",
  "надёжн", "надежн", "оптимальн", "хорош", "адекватн",
  "fast", "quick", "valid", "correct", "proper", "the usual", "as usual", "reliable", "optimal", "nice",
]
// Traces of a solution inside a requirement: a path, an annotation, an import, a dotted class name.
// "What", not "how" (Jackson).
const DESIGN_MARKS = [
  /(^|\s)[\w./-]*src\//i, /(^|\s)@[A-Z]\w+/, /\b\w+\.(java|go|ts|js|py|kt|rb|cs)\b/i,
  /\bимпорт\b|\bimport\b/i, /\bкласс\s+[A-Z]\w+|\bclass\s+[A-Z]\w+/,
]

import { ok, err } from "../../core/result.mjs"
import { severityOf } from "../../core/findings.mjs"
// What is demanded OF a BRD is declared by the FORM REGISTRY (B20-S1/S6). The rule "a subject must
// occur in R's text" was deleted from the code (live run 01.08: a Russian BRD with English anchors is
// correct, and the rule failed it entirely), but it lived on in the templates' prose — and the role
// dutifully enforced a rule that no longer existed. The registry declares the intent once: what is
// checked and what is ordered are one entry.
import { BRD_FORM } from "../../core/form.mjs"
// The artifact's language is judged where the decision lives, not here: core/lang.mjs owns both
// directions and the gate that picks between them.
import { sourceGate, vocabOf, freeWords, languageDrifted, FREE_WORDS_BLOCK } from "../../core/lang.mjs"

export const SUBJECTS_MIN = BRD_FORM.subjectsMin
export const SUBJECTS_MAX = BRD_FORM.subjectsMax
export { BRD_FORM }

// H1. A NUMBER IN A CRITERION MUST HAVE A SOURCE.
//
// The front door's main failure is substituting a default for a question to the operator. That
// failure has an exact resolver: a number that is in neither the task nor the operator's answers came
// out of the model's head. We check exactly that and nothing beyond it: a machine does not judge a
// criterion's meaning, but it does judge a number's provenance.
//
// Only the numeric literals of `fit:` are counted. The requirement's wording is left alone: there,
// numbers may be spelled out in words, while a criterion must be machine-readable.
//
// FOUND BY A LIVE RUN (README "Debts", closed by this change): `numbersIn` did not tell a number-as-
// quantity from a digit inside a FORMAT DESIGNATION — `ISO-8601` in a `fit:` read as the number 8601,
// demanded a source that exists in neither the task nor the answers, and the role was handed an
// `invented-default` for a format it never invented. The resolver: a standard's designation is not a
// substituted quantity, and `invented-default` is about the second kind.
//
// THE RULE IN ONE SENTENCE: a number counts as a quantity only when it stands as a token of its own —
// it does not abut a letter directly or through a hyphen/slash, and it does not follow a word of ALL
// CAPITALS after exactly one space (a standard's designation: `RFC 3339`, `ISO 8601`). A unit suffix
// AFTER the number (`300ms`) does not spoil it: abutment is judged on the left only.
function isLetterCh(ch) {
  return !!ch && /\p{L}/u.test(ch)
}
// isDesignationDigit — the digit that starts a numbersIn match abuts a designation on its left rather
// than standing as a token of its own. Three shapes of abutment: directly against a letter ("base64",
// "p95"); through a hyphen or slash against a letter ("ISO-8601", "UTF-8", "SHA-256", "HTTP/2"); and
// through EXACTLY one space against a word of all capitals ("RFC 3339") — several spaces
// (`fit:    90 days`) do not count as this shape: between the word and the number there must be one
// single separator, not a form field.
function isDesignationDigit(s, start) {
  const before = s[start - 1]
  if (isLetterCh(before)) return true
  if ((before === "-" || before === "/") && isLetterCh(s[start - 2])) return true
  if (before === " " && s[start - 2] && s[start - 2] !== " " && isLetterCh(s[start - 2])) {
    let i = start - 2
    while (i > 0 && isLetterCh(s[i - 1])) i--
    const word = s.slice(i, start - 1)
    if (/^[A-ZА-ЯЁ]{2,}$/.test(word)) return true
  }
  return false
}
// FUNCTION_CONTRACT: numbersIn — a text's numbers-as-quantities, normalised for comparing provenance
//   Input:        text — raw text (a BRD, the task or an operator's answer) to find numbers in
//   Dependencies: —
//   Antecedent:   ANY value — coerced with String(text || ""); the range is not narrowed, the function
//                 is total on its input (the nature of the job is to find numbers in anything at all,
//                 including absent text)
//   Consequent:   success: Set<string> — every match of /\d+(?:[.,]\d+)?/ in the text, MINUS the
//                          matches abutting a designation on the left (isDesignationDigit — a letter
//                          directly, a letter through a hyphen/slash, an ALL-CAPS word through one
//                          space); a comma is replaced by a dot and leading zeros before a significant
//                          digit are stripped; a repeat of the same normalised number collapses — a
//                          Set, not an array. text empty/undefined/null → String(text || "") = "" → an
//                          empty Set. "007" → "7" (leading zeros stripped), "0.5" untouched (the
//                          leading zero is before a dot, not a digit), "1,5" → "1.5" (a comma is a
//                          decimal separator, not a thousands one); "ISO-8601"/"UTF-8"/"SHA-256"/
//                          "HTTP/2"/"base64"/"RFC 3339" → NO number is extracted (a designation);
//                          "300ms" → "300" survives (a unit suffix after a number is not a left abutment)
//                 failure: none — total on any input (String() throws for no input, and matchAll does
//                          not throw when there are no matches)
export function numbersIn(text) {
  const s = String(text || "")
  const out = new Set()
  for (const m of s.matchAll(/\d+(?:[.,]\d+)?/g)) {
    if (isDesignationDigit(s, m.index)) continue
    out.add(m[0].replace(",", ".").replace(/^0+(?=\d)/, ""))
  }
  return out
}

// FUNCTION_CONTRACT: analogueTerm — the greppable head of the `analogue:` line
//   Input:        text — the raw value of the line, or null
//   Dependencies: —
//   Antecedent:   any value
//   Consequent:   success: the term before the first separator, trimmed; "" for a declared absence
//                          (`none …`) and for nothing at all
//                 failure: none — total
//   Purity:       pure
//   Interface:    analogueTerm(text: unknown) -> string
//
// The line carries a NAME and, after a dash, whatever the role wants to say about it. Step 3b greps
// the repository with the name, so the name must be one word — the same rule subjects[] obey, and
// for the same reason.
//
// BUG_FIX_CONTEXT: eddi, the first run with this field. The role wrote
//   `analogue: Prompt Snippet (PromptSnippetService, eddi://ai.labs.snippet) — по образцу него …`
//   and step 3b searched the repository for that WHOLE STRING: no path contains it, the phase found
//   nothing, and the focus fell to 1 of the 10 files the change needs. The field was free text and
//   the consumer wanted a token — that gap is closed here and by the blocker in newBrd.
export function analogueTerm(text) {
  const raw = String(text == null ? "" : text).trim()
  if (!raw || /^none\b/i.test(raw)) return ""
  return raw.split(/[—(,:]|\s+-\s+/)[0].trim()
}

// FUNCTION_CONTRACT: parseBrd — parses a raw BRD text into requirements, subjects and open-questions
//   Input:        text — the raw text of a BRD document
//   Dependencies: —
//   Antecedent:   ANY value — coerced with String(text || "") and split into lines; the range is not
//                 narrowed, the function is total. The format the parser RECOGNISES (it does not
//                 demand it — it recognises it): line-based, `R<n> …` opens a requirement,
//                 `fit:`/`verify:` (or `проверка:`) fill the CURRENT requirement's fields, and
//                 `subjects[]: …` and `open-questions: …` are service lines outside requirements
//   Consequent:   success: { requirements: [{ id, statement, fit, verify, line }],
//                          subjects: string[] | null, openQuestions: string | null }; `line` is the
//                          1-based line number of the `R<n>` header.
//                          · text empty/undefined/null → requirements=[], subjects=null,
//                            openQuestions=null — there are no lines to parse at all, not an error.
//                          · an `R<n>` line opens a new requirement with fit=null, verify=null and
//                            makes it CURRENT — the `fit:`/`verify:` fields fill that one, until the
//                            next `R<n>` or the end of the text.
//                          · `fit:`/`verify:` with no preceding `R<n>` (cur=null) are silently
//                            ignored — a field with nowhere to be written is lost rather than
//                            throwing or being written into the wrong place.
//                          · a line that neither opened a requirement nor matched a service prefix is
//                            APPENDED to the CURRENT requirement's statement with a space, as long as
//                            its `fit` is not filled yet — a multi-line wording is assembled line by
//                            line up to the first `fit:`. This requires an existing cur: the same line
//                            before the first `R<n>` (cur=null), like an orphaned `fit:`/`verify:`, is
//                            silently lost.
//                          · `subjects[]: …` is split on `·`/`,`/`;`, each item is trimmed and empties
//                            are filtered out; the line never occurred → subjects=null (not []) —
//                            "no line" and "a line with an empty list" stay distinguishable.
//                          · `open-questions: …` never occurred → openQuestions=null; occurred → its
//                            trimmed value as it stands, with no check of its shape (validateBrd's job).
//                 failure: none — total on any input; the result is always an object and nothing is
//                          thrown
export function parseBrd(text) {
  const lines = String(text || "").split("\n")
  const requirements = []
  let cur = null
  let subjects = null
  let openQuestions = null
  let analogue = null
  lines.forEach((line, i) => {
    const r = /^\s*(R\d+)\b[.:)\s]*(.*)$/.exec(line)
    if (r) { cur = { id: r[1], statement: r[2].trim(), fit: null, verify: null, line: i + 1 }; requirements.push(cur); return }
    const fit = /^\s*fit\s*:\s*(.*)$/i.exec(line)
    if (fit && cur) { cur.fit = fit[1].trim(); return }
    const ver = /^\s*(verify|проверка)\s*:\s*(.*)$/i.exec(line)
    if (ver && cur) { cur.verify = ver[2].trim(); return }
    const sub = /^\s*subjects\s*\[\s*\]\s*:\s*(.*)$/i.exec(line)
    if (sub) { subjects = sub[1].split(/[·,;]/).map((s) => s.trim()).filter(Boolean); return }
    const oq = /^\s*open-questions\s*:\s*(.*)$/i.exec(line)
    if (oq) { openQuestions = oq[1].trim(); return }
    const an = /^\s*analogue\s*:\s*(.*)$/i.exec(line)
    if (an) { analogue = an[1].trim(); return }
    // a continuation of the requirement's wording (a wrapped line), until fit/verify begin
    if (cur && !cur.fit && line.trim() && !/^\s*(R\d+|subjects|open-questions|analogue)/i.test(line)) {
      cur.statement = (cur.statement + " " + line.trim()).trim()
    }
  })
  return { requirements, subjects, openQuestions, analogue }
}

// opts.sources — the texts a criterion's numbers are ALLOWED to come from: TASK.md and the operator's
// answers. None given → the rule stays silent: there is nothing to judge provenance against.
// --- The BRD as a domain value --------------------------------------------------------------------
//
// This used to hold validateBrd — an aggregator over 12 codes: it returned a LIST of findings, and an
// invalid BRD existed as a value somebody downstream could read. It is no longer built.
//
// TWO CONSTRAINTS this is designed under, and both are essential.
//
// 1. ADVICE DOES NOT FAIL ACCEPTANCE. A rule with no resolver of truth (looks like a wish, looks like
//    a mechanism) cannot judge a natural-language wording under any regex — it is demoted to a
//    collector of evidence (core/findings.mjs). The evidence travels ON SUCCESS, together with the
//    built BRD, and goes to the operator. Making it a failure class would hand the role back the
//    right to spoil a correct artifact to fit a wrong rule — exactly what cost the run of 01.08.
//
// 2. EVERY BLOCKER IS COLLECTED, NOT THE FIRST. A step's declaration is fixed by a human, and the
//    first refusal is enough for them. A BRD is fixed by a MODEL, and every retry is a call: handing
//    it one blocker out of five means paying five calls for what one message could say. So `detail`
//    carries the whole list. The value is still not built — an invalid BRD stays unrepresentable.

// FUNCTION_CONTRACT: newFit — a requirement's criterion
//   Input:        raw — the text of the fit field
//   Dependencies: known — the set of numbers occurring in the sources (the task, the operator's
//                 answers), or null when no sources were supplied
//   Antecedent:   a non-empty string and — when the sources are known — not one number absent from them
//   Consequent:   success: the criterion
//                 failure: "no-fit" — there is no such thing as a requirement without a criterion
//                          "invented-default" — a default was substituted instead of asked for
export function newFit(raw, known) {
  if (!raw) return err("no-fit", "нет fit-критерия — требование без критерия приёмки не сдано")
  if (known) {
    const invented = [...numbersIn(raw)].filter((n) => !known.has(n))
    if (invented.length) {
      return err("invented-default", `число ${invented.join(", ")} в fit не встречается ни в задаче, ни в ответах оператора — умолчание подставлено, а не спрошено`)
    }
  }
  return ok(raw)
}

// FUNCTION_CONTRACT: newRequirement — a requirement one can build from
//   Input:        raw — { id, statement, fit, verify, line } from parseBrd
//   Dependencies: known — the set of the sources' numbers, or null
//   Antecedent:   a non-empty wording, a buildable fit (newFit) and a non-empty verify
//   Consequent:   success: a frozen requirement
//                 failure: "invalid-requirement" — the detail names the id and the reason
// A requirement with no way to check it is a statement, not a requirement: there is nothing to close it with.
export function newRequirement(raw, known) {
  const at = raw.id || "R?"
  if (!raw.statement) return err("invalid-requirement", `${at}: формулировка пуста`)
  const fit = newFit(raw.fit, known)
  if (!fit.ok) return err("invalid-requirement", `${at}: ${fit.error.detail}`)
  if (!raw.verify) return err("invalid-requirement", `${at}: нет способа проверки (команда или артефакт)`)
  return ok(Object.freeze({ id: raw.id, statement: raw.statement, fit: fit.value, verify: raw.verify, line: raw.line }))
}

// FUNCTION_CONTRACT: newSubjects — grep anchors over the repository
//   Input:        list — the array of terms from the subjects[] line
//   Dependencies: —
//   Antecedent:   between SUBJECTS_MIN and SUBJECTS_MAX terms, each ONE word (a greppable anchor, not
//                 a phrase), with no repeats
//   Consequent:   success: a frozen list
//                 failure: "invalid-subjects" — the detail names the reason
// LIVE RUN 01.08: this used to hold the rule "a subject must occur in R's text". It is wrong in
// substance: subjects[] are grep anchors over the REPOSITORY, and the repository is English, while a
// requirement is written in the operator's language. The rule failed a correct BRD and made the role
// SPOIL the artifact by bending its anchors to the requirement's language. What is checked now is
// what actually makes a term an anchor.
export function newSubjects(list) {
  if (list.length < SUBJECTS_MIN || list.length > SUBJECTS_MAX) {
    return err("invalid-subjects", `subjects[] = ${list.length}; допустимо ${SUBJECTS_MIN}..${SUBJECTS_MAX}`)
  }
  const phrase = list.find((s) => /\s/.test(String(s).trim()))
  if (phrase) return err("invalid-subjects", `subject «${phrase}» — фраза, а не якорь: ${BRD_FORM.subjectRule}`)
  const dup = list.find((s, i) => list.indexOf(s) !== i)
  if (dup) return err("invalid-subjects", `subject «${dup}» повторяется`)
  return ok(Object.freeze([...list]))
}

// FUNCTION_CONTRACT: adviceFor — evidence that does NOT fail acceptance
//   Input:        r — a built requirement
//   Dependencies: —
//   Antecedent:   the requirement is built
//   Consequent:   success: an array of evidence findings; empty when the wording resembles nothing
//                 failure: none — total
// A piece of evidence carries the PHRASE the rule fired on: the operator looks not at code but at the
// text the rule found suspicious. LIVE RUN 04: the wish rule failed "limit (default 20, VALID range
// 1..100)" — a wish-word stood right beside an exact range. A wish is the ABSENCE of a criterion, not
// the presence of a word, so the evidence is raised only when nothing measurable stands nearby.
export function adviceFor(r) {
  const out = []
  const hay = `${r.statement} ${r.fit}`.toLowerCase()
  const measurable = /\d/.test(hay) || /\.\.|→|<=|>=|\||enum|формат|format|regex/.test(hay)
  const wish = WISH_WORDS.find((w) => hay.includes(w))
  if (wish && !measurable) {
    out.push({ code: "wish-not-requirement", message: `${r.id}: «${wish}» — похоже на желание, а не критерий: нужна шкала, значение или формат`, line: r.line, evidence: r.statement, severity: severityOf("wish-not-requirement") })
  }
  for (const re of DESIGN_MARKS) {
    if (re.test(r.statement)) {
      out.push({ code: "design-leak", message: `${r.id}: похоже на МЕХАНИЗМ в требовании (путь/аннотация/класс) — фронт-дор фиксирует что и зачем, не как`, line: r.line, evidence: r.statement, severity: severityOf("design-leak") })
      break
    }
  }
  return out
}

// FUNCTION_CONTRACT: newBrd — a BRD fit to be handed in
//   Input:        text — the bytes of .agent/brd.md
//   Dependencies: sources — the texts a role may take numbers from (the task, the operator's
//                 answers); an empty array means "no sources supplied", and the invented-default rule
//                 stays silent
//   Antecedent:   at least one requirement, each of them buildable, buildable subjects[], and an
//                 open-questions line equal to the value the registry declares
//   Consequent:   success: a frozen BRD plus the evidence (advice) that does NOT fail acceptance
//                 failure: "invalid-brd" — the detail carries EVERY blocker at once, one per line
export function newBrd(text, sources = []) {
  const { requirements, subjects, openQuestions, analogue } = parseBrd(text)
  const blockers = []

  if (!requirements.length) blockers.push("в BRD нет ни одного требования R")

  const src = sources.filter(Boolean)
  const known = src.length ? new Set(src.flatMap((t) => [...numbersIn(t)])) : null

  const built = []
  for (const raw of requirements) {
    const r = newRequirement(raw, known)
    if (r.ok) built.push(r.value)
    else blockers.push(r.error.detail)
  }

  // The artifact's language is a property of the INPUT, not of the role: the rule is declared by the
  // role ($START_LAW) and enforced here, against the task and the operator's answers. The INPUT also
  // picks the measure (core/lang.mjs::sourceGate): a Russian request is judged word by word — a
  // letter share cannot see one English word inserted into a Russian line — and an English request by
  // the old share, which is the only measure that direction has.
  const source = src.join("\n")
  const gate = sourceGate(source)
  const vocab = gate === "free-words" ? vocabOf(src) : null
  for (const r of built) {
    if (gate === "free-words") {
      const free = freeWords(r.fit, vocab)
      if (free.length >= FREE_WORDS_BLOCK) {
        blockers.push(`${r.id} [language-drift]: ${free.map((w) => `«${w}»`).join(", ")} — английские слова, которых нет ни в задаче, ни в ответах оператора; переведи fit — «${r.fit.slice(0, 60)}»`)
      }
    } else if (gate === "reverse" && languageDrifted(r.fit, source)) {
      blockers.push(`${r.id} [language-drift]: fit написан не на языке входа — «${r.fit.slice(0, 60)}»`)
    }
  }

  if (openQuestions === null) blockers.push("нет строки open-questions — сдаваемый BRD обязан её нести")
  else if (openQuestions !== BRD_FORM.openQuestions) blockers.push(`open-questions: ${openQuestions} — BRD не сдаётся с открытыми вопросами`)

  // ANALOGUE — what this work is modelled on, and why it is a FIELD rather than a lucky anchor.
  //
  // BUG_FIX_CONTEXT: eddi, runs 9a98f081 and 256e1830 — the same TASK.md, which says «по образцу
  //   Prompt Snippet» in its own words. One run's role turned that into an anchor and step 3b hit 8
  //   of the 10 files the change actually needs; the other run's role did not, and it hit 2. The
  //   thing a change is modelled on is the only handle a repository offers for work whose own name
  //   does not exist in it yet — `glossary` matched no file at all, correctly. Leaving that handle to
  //   whether a model happens to mention it is what those two numbers cost.
  // Absence is DECLARED, never inferred: `analogue: none — <why>`, the same device as
  // `<failures found="no" why>` and `<subject found="no">`.
  const anTerm = analogueTerm(analogue)
  if (analogue === null) blockers.push('нет строки analogue — по образцу чего делается работа; если образца нет, так и напиши: analogue: none — <почему>')
  else if (!analogue) blockers.push('analogue пуст — назови существующий механизм-образец или объяви analogue: none — <почему>')
  else if (/^none\b/i.test(analogue) && !/\S/.test(analogue.replace(/^none\b/i, "").replace(/^[\s—:-]+/, ""))) {
    blockers.push('analogue: none без причины — «образца нет» это вывод из репозитория, а не пропуск строки')
  }
  else if (anTerm && /\s/.test(anTerm)) {
    blockers.push(`analogue «${anTerm}» — ${BRD_FORM.analogueRule}`)
  }

  let subj = null
  if (!subjects) blockers.push("нет subjects[] — рою нечем грепать репо")
  else {
    const s = newSubjects(subjects)
    if (s.ok) subj = s.value
    else blockers.push(s.error.detail)
  }

  if (blockers.length) return err("invalid-brd", blockers.join("\n  "))
  return ok(Object.freeze({
    requirements: Object.freeze(built),
    subjects: subj,
    openQuestions,
    analogue,
    advice: Object.freeze(built.flatMap(adviceFor)),
  }))
}
