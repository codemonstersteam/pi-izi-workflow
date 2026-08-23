// MODULE_CONTRACT: spread — WHERE IN THE TREE THE WORK NAMED BY THE ANCHORS ACTUALLY LIES
// Purpose:    one decision is hidden here: step 2 has words (anchors and the analogue), steps 3 and
//             3B need PLACES. The words are turned into files, the files into packages, the packages
//             into a share of the tree — by grep, not by an opinion of a role.
// io:         fs
// EXTERNAL_DEPENDENCY: steps/survey-plan/skip.mjs — the walk boundary is declared ONCE and there;
//             a second skip list would mean steps 2 and 3 walk different trees.
// EXTERNAL_DEPENDENCY: steps/brd/hits.mjs — MAX_BYTES (a file bigger than that is data, not source).
//             Its BACKGROUND threshold is NOT re-applied here: judging an anchor is the gate's job
//             this module only MEASURES. `share` is the number a reader judges by, and
//             it is stated once — there, not here.
// Invariants: TOTAL. No word, no repository, no analogue — an empty measurement, never a refusal.
//             The tree is read ONCE per call regardless of how many words are asked about.
// Interface:  MAX_PACKAGES, filesOf, packagesOf, spreadOf
//
// THE ANALOGUE IS GREPPED BY TEXT, and that is the whole catch of this ticket. Measured on
// sandbox/runbox/eddi, 1854 files, against the 10 files where the work of DOS-535 really lies
// (`steps/brd/normalize-concept-research.md`, chapter 4):
//   path match, as in focus.mjs:45      263 files selected — 1 of 10 found — precision 0.4%
//   analogue files by path, focus.mjs:350 10 files          — 0 of 10 — precision 0%
//   grep `PromptSnippet` over TEXT       62 files           — 10 of 10 — precision 16%
// Cost: 0.43 s and zero tokens. `focus.mjs` today rebuilds those files FROM PATHS and misses all
// ten; this module takes the measurement while the anchors are still fresh and writes it down.
//
// WHY THE ANALOGUE IS A SECOND QUERY and not a line in the artifact: in the industry the trick is
// SimiScore (BugLocator) and candidate selection in Facebook Aroma — an already-solved similar case
// gives a query on a par with the request text, because it has ALREADY passed the selection we are
// trying to guess (research, chapter 5). Here the role names the analogue; the grep finds its files.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { skipDir, skipFile } from "../../survey-plan/skip.mjs"
import { MAX_BYTES } from "../hits/hits.mjs"

// THE PACKAGE SUMMARY IS WHAT STEP 3 ACTUALLY READS, and an order has room for lines, not for a list
// of 62 paths. Measured on eddi: the analogue's 62 files fall into 20 directories, and the top ten
// hold 52 of them — the tail is directories with a single hit each, which say nothing about where the
// work lives. Ten is the ceiling of the summary, not of the measurement: `files` keeps every path.
export const MAX_PACKAGES = 10

// FUNCTION_CONTRACT: walk — the repository's files, on step 3's boundary
//   Input:        root — the run's cwd; rel/out — recursion state
//   Dependencies: skipDir, skipFile, MAX_BYTES
//   Antecedent:   — (total: an unreadable directory yields what was collected so far)
//   Consequent:   success: [path] relative to root, "/"-separated
//   Purity:       io (fs)
function walk(root, rel = "", out = []) {
  let entries
  try { entries = readdirSync(join(root, rel), { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const path = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) { if (!skipDir(e.name)) walk(root, path, out); continue }
    if (!e.isFile() || skipFile(path)) continue
    let bytes = 0
    try { bytes = statSync(join(root, path)).size } catch { continue }
    if (bytes <= MAX_BYTES) out.push(path)
  }
  return out
}

const byPath = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

// FUNCTION_CONTRACT: scan — one walk, many words: which files carry which word
//   Input:        cwd — the run's root; words — the words to look for
//   Dependencies: walk
//   Antecedent:   — (total)
//   Consequent:   success: { files: how many were read, byWord: Map<word, [path]> }
//   Purity:       io (fs)
//   ONE PASS PER FILE, NOT PER WORD. Reading 1854 files once costs 0.43 s; doing it again for every
//   anchor would cost seven times that and answer exactly the same question. The needles are folded
//   by lower case for the same reason `hitsOf` folds them: `Glossary` and `glossary` are one grep.
function scan(cwd, words) {
  const list = [...new Set(words.map((w) => String(w == null ? "" : w).trim()).filter(Boolean))]
  const byWord = new Map(list.map((w) => [w, []]))
  if (!list.length || !existsSync(cwd)) return { files: 0, byWord }
  const needles = new Map()
  for (const w of list) {
    const k = w.toLowerCase()
    if (needles.has(k)) needles.get(k).push(w); else needles.set(k, [w])
  }
  const files = walk(cwd)
  for (const path of files) {
    let text = ""
    try { text = readFileSync(join(cwd, path), "utf8") } catch { continue }
    const hay = `${path}\n${text}`.toLowerCase()
    for (const [needle, forms] of needles) if (hay.includes(needle)) for (const w of forms) byWord.get(w).push(path)
  }
  for (const paths of byWord.values()) paths.sort(byPath)
  return { files: files.length, byWord }
}

// FUNCTION_CONTRACT: filesOf — the files that carry one word
//   Input:        cwd — the run's root; word — an anchor or the analogue
//   Dependencies: scan
//   Antecedent:   — (total; SILENCE: no repository, no word — an empty list, not a refusal)
//   Consequent:   success: [path] sorted, relative to cwd
//   Purity:       io (fs)
//   Interface:    filesOf(cwd: string, word: string) -> string[]
//   THE MATCH IS A SUBSTRING, CASE-INSENSITIVE, over the file TEXT and over its PATH — the same rule
//   `hitsOf` counts by, because these two must not disagree about what a hit is: the count shown to
//   the gate role and the paths handed to step 3 are the same measurement. Word-boundary matching
//   was tried and refuted there: it loses `fruits` for the anchor `fruit`.
export function filesOf(cwd, word) {
  const key = String(word == null ? "" : word).trim()
  return scan(cwd, [key]).byWord.get(key) || []
}

// FUNCTION_CONTRACT: packagesOf — the same files, folded into directories with a count
//   Input:        paths — file paths, "/"-separated, as filesOf returns them
//                 top — how many lines to keep (0 = all); MAX_PACKAGES by default
//   Dependencies: MAX_PACKAGES
//   Antecedent:   — (total; SILENCE: nothing measured — an empty object, not a fabricated summary)
//   Consequent:   success: { directory: how many marked files }, by descending count, then by name
//   Purity:       pure
//   Interface:    packagesOf(paths?: string[], top?: number) -> Record<string, number>
//   A file at the root of the repository is folded into "." — it has a package like any other, and
//   dropping it would make the counts disagree with `files`.
export function packagesOf(paths = [], top = MAX_PACKAGES) {
  const count = new Map()
  for (const raw of Array.isArray(paths) ? paths : []) {
    const p = String(raw == null ? "" : raw)
    if (!p) continue
    const slash = p.lastIndexOf("/")
    const dir = slash > 0 ? p.slice(0, slash) : "."
    count.set(dir, (count.get(dir) || 0) + 1)
  }
  const rows = [...count.entries()].sort((a, b) => b[1] - a[1] || byPath(a[0], b[0]))
  return Object.fromEntries(top > 0 ? rows.slice(0, top) : rows)
}

// SHARE — the fraction of the tree an anchor marks, rounded to four places so that the artifact of
// a big repository stays diffable: 1/1854 reads as 0.0005, 895/1854 as 0.4828. This is the
// SELECTIVITY number the gate's rule T5 judges by; the corridor itself lives there, not here.
const shareOf = (marked, total) => (total > 0 ? Number((marked / total).toFixed(4)) : 0)

// `analogue: none` IS A LEGAL ANSWER, not a failure: the role is allowed to say that this repository
// holds nothing of the sort. It becomes `null` — absence is a case, not an empty value
// (standards/code.md, constraint 2): `{ word: "", files: [] }` would read to step 3B as "the analogue
// exists and has no files", which is the one thing that IS a defect.
const NONE = new Set(["", "none", "no", "-", "нет", "null"])
const analogueWord = (v) => {
  const w = String(v == null ? "" : v).trim()
  return NONE.has(w.toLowerCase()) ? "" : w
}

// FUNCTION_CONTRACT: spreadOf — the walk map: anchors and the analogue turned into places
//   Input:        { cwd — the run's root
//                   anchors — the words the gate role wrote into `subjects[]`, in its own order
//                   analogue — the word the gate role wrote into `analogue:`, or "none" }
//   Dependencies: scan, packagesOf, shareOf, analogueWord
//   Antecedent:   — (total; SILENCE: no anchors and no analogue — nothing was measured, so `files`
//                 is 0 and the tree is not even walked, rather than a map of a question nobody asked)
//   Consequent:   success: { files, marked, anchors: [{ word, files, packages, share }],
//                            analogue: { word, files, packages } | null }
//                 failure: none — a missing cwd is an empty measurement, not a throw
//   Purity:       io (fs)
//   Interface:    spreadOf({ cwd, anchors?, analogue? }) -> object
//   `marked` IS THE UNION OF THE ANCHORS' FILES and the reason this artifact exists in one piece:
//   step 3 reads it to compute the DENSITY of a cell — how much of a directory the work touches —
//   and a union rebuilt per anchor by the caller would be a second implementation of this rule.
//   The analogue is deliberately NOT in the union: it is a second query about a DIFFERENT thing —
//   where a solved case like this one already lives — and mixing it in would inflate the density of
//   packages the task does not touch.
export function spreadOf({ cwd, anchors = [], analogue = null } = {}) {
  const words = (Array.isArray(anchors) ? anchors : []).map((w) => String(w == null ? "" : w).trim()).filter(Boolean)
  const word = analogueWord(analogue)
  const { files, byWord } = scan(cwd, word ? [...words, word] : words)
  const seen = new Set()
  const list = []
  for (const w of words) {
    if (seen.has(w)) continue
    seen.add(w)
    const paths = byWord.get(w) || []
    list.push({ word: w, files: paths, packages: packagesOf(paths), share: shareOf(paths.length, files) })
  }
  const marked = [...new Set(list.flatMap((a) => a.files))].sort(byPath)
  const twin = word ? byWord.get(word) || [] : []
  return {
    files,
    marked,
    anchors: list,
    analogue: word ? { word, files: twin, packages: packagesOf(twin) } : null,
  }
}
