// MODULE_CONTRACT: clean — the guardrail over the CLEANED table of the second pass of substep 2A
// Purpose:    one decision: did the cleanup pass improve the table or damage it. The pass is a
//             MODEL pass — it merges duplicates and drops invented rows by meaning, which no script
//             can do — and therefore it must not certify itself (CLAUDE.md, constraint 1).
// io:         none
// EXTERNAL_DEPENDENCY: normalize.mjs::parseRows — the same parse both passes are judged by. A
//             second reading of the same rows would drift from the first one silently.
// Invariants: TOTAL. Anything at all goes in. Judges the PAIR of tables plus the request, never the
//             cleaned table alone: "no row was lost" is unanswerable without the table before it.
// Interface:  CLASSES, literalsOf, judgeClean
//
// WHY LITERALS AND NOT ROWS. The pass is allowed to delete a row — that is what it is for — so
// "every row of BEFORE stands in AFTER" would forbid its work. What may never disappear is a
// LITERAL OF THE REQUEST: a name, a path, a placeholder, a number the operator wrote. A hallucinated
// row carries no such literal by definition, so deleting it loses nothing this rule can see, and
// deleting a real requirement is caught the moment its value goes missing.
import { parseRows } from "./normalize.mjs"

// Rule codes. The class IS the code the role reads at the head of a blocker — one place, one name.
export const CLASSES = Object.freeze(["duplicate-row", "lost-value", "invented-value"])

// FUNCTION_CONTRACT: literalsOf — the things in a text that may not be reworded
//   Input:        text — any of: the request, a table, one row
//   Dependencies: —
//   Antecedent:   — (total)
//   Consequent:   success: Set of literals, lower-cased — backticked spans, placeholders, URIs,
//                 paths, dotted or camel-cased identifiers, numbers
//   Purity:       pure
//   Interface:    literalsOf(text) -> Set<string>
//   WHAT COUNTS IS WHAT A HUMAN WOULD COPY RATHER THAN RETELL. Ordinary words are deliberately out:
//   the pass is allowed to merge two rows and to word the merge as it likes, and a rule over prose
//   would redden on that.
export function literalsOf(text = "") {
  const s = String(text ?? "")
  const out = new Set()
  const add = (v) => { const t = String(v).trim().toLowerCase(); if (t.length > 1) out.add(t) }
  for (const m of s.matchAll(/`([^`]+)`/g)) add(m[1])
  for (const m of s.matchAll(/\{\{?[^{}]+\}?\}/g)) add(m[0])
  for (const m of s.matchAll(/\b[a-z][a-z0-9+.-]*:\/\/[^\s`,;)]+/gi)) add(m[0])
  for (const m of s.matchAll(/(?:^|[\s`(])(\/[A-Za-z0-9_*][A-Za-z0-9_*./{}-]*)/g)) add(m[1])
  for (const m of s.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+\b/g)) add(m[0])
  // Идентификатор опознаётся ВНУТРЕННЕЙ заглавной, в любом регистре первой буквы:
  // `PromptSnippetService` и `promptSnippet` — оба имя, `Glossary` и `Caffeine` — нет. Одиночное
  // слово с заглавной сюда НЕ входит намеренно: в прозе с заглавной начинается каждое предложение,
  // и правило про потерю значений краснело бы на законной перефразировке слияния. Имя, которое
  // оператор считает важным, он пишет в обратных кавычках — и оно ловится первым правилом.
  for (const m of s.matchAll(/\b[A-Za-z]+[A-Z][A-Za-z0-9]*\b/g)) add(m[0])
  for (const m of s.matchAll(/\b\d+\b/g)) add(m[0])
  return out
}

const keyOf = (row) => `${String(row.verb).trim().toLowerCase()} | ${String(row.object).trim().toLowerCase()}`

// FUNCTION_CONTRACT: judgeClean — the guardrail over the cleanup pass
//   Input:        before — the table the pass was given; after — the table it wrote; task — the
//                 operator's request, bytes as they are
//   Dependencies: parseRows, literalsOf
//   Antecedent:   — (total; SILENCE: the cleaned table carries no row at all — there is nothing to
//                 judge, and the head of the substep names an empty answer for what it is)
//   Consequent:   success: { blockers: [], judged, silent }
//                 failure: { blockers: [{ cls, text }], judged, silent: false } — EVERY finding at
//                 once, each carrying the exit
//   Purity:       pure
//   Interface:    judgeClean(before, after, task) -> { blockers, judged, silent }
export function judgeClean(before = "", after = "", task = "") {
  const rowsAfter = parseRows(after)
  if (!rowsAfter.length) return { blockers: [], judged: 0, silent: true }
  const rowsBefore = parseRows(before)
  const blockers = []

  // 1. Two rows still carrying one verb over one object — the pass did not do its work.
  const seen = new Map()
  for (const row of rowsAfter) {
    const k = keyOf(row)
    if (seen.has(k)) {
      blockers.push({ cls: "duplicate-row", text:
        `duplicate-row rows ${seen.get(k)} and ${row.n}: both say «${k}» — one requirement written twice. ` +
        `Merge them into ONE row, keeping every value of both, and delete the other.` })
      continue
    }
    seen.set(k, row.n)
  }

  // 2. A literal of the REQUEST that stood in the table before the pass and is gone after it.
  const ofTask = literalsOf(task)
  const inAfter = literalsOf(after)
  for (const lit of literalsOf(before)) {
    if (!ofTask.has(lit) || inAfter.has(lit)) continue
    blockers.push({ cls: "lost-value", text:
      `lost-value «${lit}»: the request carries it and the table carried it, the cleaned table does not. ` +
      `Merging two rows keeps the values of BOTH — copy it back into the row that took its requirement.` })
  }

  // 3. A literal that stands in neither the table given to the pass nor the request.
  const inBefore = literalsOf(before)
  for (const lit of inAfter) {
    if (inBefore.has(lit) || ofTask.has(lit)) continue
    blockers.push({ cls: "invented-value", text:
      `invented-value «${lit}»: it stands in the cleaned table and in nothing you were given. ` +
      `The pass copies, merges and deletes — it never writes a value of its own. Remove it.` })
  }

  return { blockers, judged: rowsAfter.length, silent: false }
}
