// MODULE_CONTRACT: assemble — the artifact of substep 2C, built by a script instead of by a model
// Purpose:    one decision: WHAT of `.agent/brd.md` is computable, and therefore never asked of a
//             model. Two thirds of it are: the `R1..Rn` block is the normalized table copied line
//             for line, and `subjects[]` is the `object` column filtered by a counted number. The
//             model is left with ONE line — `analogue:` — so the FORM of the artifact cannot be
//             broken in principle.
// io:         none — everything arrives as an argument, nothing is read from disk here
// EXTERNAL_DEPENDENCY: BRD_FORM.anchorMaxFiles (core/form.mjs) — the only underived constant of the
//             step, the default of `cap`. Absent (an older core/form.mjs) it reads as every
//             candidate passing the threshold, i.e. `subjects[]` the width of the whole table:
//             `undefined` comparisons are false, so `files <= cap` rejects everything and the
//             result is the analogue alone, refused by `subjects-thin`.
// Invariants: TOTAL — no input throws. Absence is a Result on the error rail, never an empty value:
//             no table → `no-rows`, no hit table → `hits-absent` (standards/code.md, constraint 2).
//             The R number EQUALS the row number of the table, and nothing may renumber it: step 6
//             quotes `values` of THAT row, rule F11 checks the numbers, step 11 judges the FRD
//             against the text of the requirement rather than against its retelling.
// Interface:  SUBJECT_SEP, numbered, subjectsOf, brdText
//
// WHY A SCRIPT AND NOT THE ROLE, in the numbers that bought it (measured on eddi 23.08.2026,
// 1854 files; steps/brd/data-flow.md, section 2C):
//   · R lines: the model reproduced 18 rows as 18 R lines — for 2113 output tokens, with a
//     rewriting risk on every repair round. Copying is free and exact.
//   · anchors: the model's own five words marked 1188 files of 1854 (64,1% of the tree); the four
//     the rule below picks mark 104 (5,6%), with the same coverage — 62 of 62 files of the
//     analogue. Wide words bring no needed file and 1050 unneeded ones.

import { ok, err } from "../../../core/result.mjs"
import { BRD_FORM } from "../../../core/form.mjs"
import { parseRows } from "../normalize/normalize.mjs"

// The separator of `subjects[]` in the artifact — U+00B7 with a space on each side, the form every
// document already written by this pipeline carries. `parseBrd` (steps/brd/brd.mjs) splits on it.
export const SUBJECT_SEP = " · "

// FUNCTION_CONTRACT: numbered — the normalized table as the artifact's `R1..Rn` block
//   Input:        rows — the text of `.agent/normalized.md`, or its lines as an array
//   Dependencies: parseRows (steps/brd/normalize/normalize.mjs) — WHAT COUNTS AS A ROW is decided
//                 there and nowhere else: a line without a `|` is a preamble, a fence or a closing
//                 sentence, not a broken row
//   Antecedent:   the text carries at least one row
//   Consequent:   success: [`R1 <row>`, … `Rn <row>`] — the row's line copied whole, in the table's
//                          own order, the number being the row's ORDINAL in the table
//                 failure: `no-rows` — the table carries no row at all: an empty file, a text of
//                          prose only, or a lost operand. `[]` is not returned: it is truthy in JS
//                          and "there is no table" would silently become "the table is empty"
//   Purity:       pure
//   Interface:    numbered(rows: string | string[]) -> Result<string[]>
export function numbered(rows) {
  const parsed = parseRows(textOf(rows))
  if (!parsed.length) {
    return err("no-rows", "the normalized table carries no row: nothing separated by `|` was found in it")
  }
  return ok(parsed.map((row, i) => `R${i + 1} ${row.line}`))
}

// FUNCTION_CONTRACT: subjectsOf — the anchors of the step: the narrow words of the `object` column
//   Input:        rows — the text of `.agent/normalized.md`, or its lines as an array
//                 hits — the counting table as `{ word: files }` (steps/brd/hits/hits.mjs::hitsOf)
//                 analogue — the analogue's WORD, the one thing the model decided this substep
//                 cap — the file-count threshold; defaults to the single source, BRD_FORM.anchorMaxFiles
//   Dependencies: parseRows, wordsOf, countOf, BRD_FORM.subjectsMin / .subjectsMax
//   Antecedent:   `hits` is an object; `analogue` is a non-empty word
//   Consequent:   success: 3..BRD_FORM.subjectsMax words — the words of the `object` column whose
//                          file count is `<= cap`, in order of first appearance, without repetition
//                          (case-insensitively), followed ALWAYS and LAST by the analogue's word.
//                          A candidate exactly ON the threshold is taken: the threshold is the
//                          measured gap `terms` 32 / `conflict` 86, and 32 is on the near side of it
//                 failure: `hits-absent` — there is no counting table (SILENCE on a missing operand:
//                          without counts no word can be called narrow, and calling them all narrow
//                          would anchor the whole table);
//                          `analogue-absent` — the model's one line brought no word;
//                          `subjects-thin` — fewer than BRD_FORM.subjectsMin words came out, so the
//                          map of substep 2D would be built on a single anchor
//   Purity:       pure
//   Interface:    subjectsOf(rows, hits, analogue, cap?) -> Result<string[]>
//
// A WORD THE COUNTING TABLE DOES NOT CARRY IS NOT A CANDIDATE. `hitsOf` counts every candidate of
// the table, zeros included — a word with 0 files is a CREATED entity and must be an anchor, the
// swarm has to know what it is going to create. So absence from the table never means zero: it means
// the word was never offered for counting (it is too short, it is a stop word). Reading it as zero
// would turn a tool's silence into a fact — standards/code.md, constraint 4.
export function subjectsOf(rows, hits, analogue, cap = BRD_FORM.anchorMaxFiles) {
  if (!hits || typeof hits !== "object") {
    return err("hits-absent", "no counting table: without `word · files N` no word can be called narrow")
  }
  const term = String(analogue == null ? "" : analogue).trim()
  if (!term) {
    return err("analogue-absent", "the analogue's word is empty: the one line the role writes brought nothing")
  }

  const index = new Map()
  for (const [word, files] of Object.entries(hits)) index.set(word.toLowerCase(), Number(files))

  const picked = []
  const seen = new Set([term.toLowerCase()])         // the analogue is placed by hand, and only once
  for (const row of parseRows(textOf(rows))) {
    for (const word of wordsOf(row.object)) {
      const key = word.toLowerCase()
      if (seen.has(key)) continue
      const files = countOf(index, key)
      if (files === null || files > cap) continue
      seen.add(key)
      picked.push(word)
    }
  }

  // The order of appearance is the priority: the first requirements name the thing being built. The
  // analogue holds the last place unconditionally — it is the one anchor whose coverage is measured.
  const subjects = [...picked.slice(0, BRD_FORM.subjectsMax - 1), term]
  if (subjects.length < BRD_FORM.subjectsMin) {
    return err("subjects-thin",
      `${subjects.length} anchors came out — «${subjects.join(SUBJECT_SEP)}»; the form asks for at least ` +
      `${BRD_FORM.subjectsMin}. Every word of the «object» column is counted in more than ${cap} files, ` +
      `or the counting table does not carry them`)
  }
  return ok(subjects)
}

// FUNCTION_CONTRACT: brdText — the three parts assembled into the bytes of `.agent/brd.md`
//   Input:        lines — the `R1..Rn` block, the result of numbered
//                 analogue — the analogue LINE as the role wrote it (`analogue: <word> — …`)
//                 subjects — the anchors, the result of subjectsOf
//   Dependencies: SUBJECT_SEP
//   Antecedent:   all three parts are present, and no one-line field carries a newline
//   Consequent:   success: the text — the R lines, then the analogue line, then
//                          `subjects[]: <word> · <word>`, closed by a trailing newline
//                 failure: `missing-part` — one of the three parts is empty, so the artifact would
//                          be written incomplete (standards/code.md, constraint 6: the artifact is
//                          written only after the decision to accept it);
//                          `multiline-value` — a field that the format carries on ONE line arrived
//                          with a newline inside it
//   Purity:       pure
//   Interface:    brdText(lines: string[], analogue: string, subjects: string[]) -> Result<string>
//
//   BUG_FIX_CONTEXT: run 46edab60 — `answerEntry` DECLARED "each field is one line", checked
//   nothing, a multi-line value arrived, the file parsed back into a stump and an operator who had
//   already answered was re-asked twice. A checkable antecedent is checked by code, not by a comment.
export function brdText(lines, analogue, subjects) {
  const rs = (Array.isArray(lines) ? lines : []).map((l) => String(l == null ? "" : l)).filter((l) => l.trim())
  const line = String(analogue == null ? "" : analogue).trim()
  const subs = (Array.isArray(subjects) ? subjects : [])
    .map((s) => String(s == null ? "" : s).trim()).filter(Boolean)

  if (!rs.length || !line || !subs.length) {
    return err("missing-part",
      `the artifact is not assembled from parts: R lines ${rs.length}, analogue ` +
      `${line ? "present" : "empty"}, subjects ${subs.length}`)
  }
  const multiline = [line, ...rs, ...subs].find((v) => v.includes("\n"))
  if (multiline) {
    return err("multiline-value",
      `a one-line field arrived with a newline inside it — «${multiline.split("\n")[0]}…»; the format ` +
      `carries one element per line and would parse back into a stump`)
  }
  return ok([...rs, line, `subjects[]: ${subs.join(SUBJECT_SEP)}`].join("\n") + "\n")
}

// --- pure helpers ---------------------------------------------------------------------------------

// The operand arrives as bytes or as lines; both are the same table. Total: anything else is no table.
function textOf(rows) {
  if (Array.isArray(rows)) return rows.join("\n")
  return String(rows == null ? "" : rows)
}

// WORD BY WORD, AND COMPOUND CELLS GIVE THEIR OWN WORDS: `Term key` → `Term`, `key`;
// `template data model key` → four candidates. A name written as one token stays one token —
// `PromptSnippetService` is not cut into segments here, because the counting table already carries
// both it and its segments as separate candidates (steps/brd/hits/hits.mjs::candidatesOf), and a
// segment invented here would have no count of its own.
function wordsOf(cell) {
  return String(cell == null ? "" : cell).split(/[^\p{L}\p{N}]+/u).filter(Boolean)
}

// null — the table does not carry the word, so it was never counted; a number — the file count,
// zero included. The lookup is case-insensitive: the counting table folds case variants into one
// representative, and the table of requirements need not have chosen the same spelling.
function countOf(index, key) {
  if (!index.has(key)) return null
  const files = index.get(key)
  return Number.isFinite(files) ? files : null
}
