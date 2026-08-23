// MODULE_CONTRACT: normalize — the request's prose turned into a table of actions
// Purpose:    one decision: is the role's table READABLE BY THE REST OF THE PIPELINE. Two things
//             make it readable and nothing else does — four columns in a row, and values copied
//             whole. Everything the table says is then consumed as data: step 2B greps the words,
//             step 6 quotes column `values` into `fit:`.
// io:         none
// EXTERNAL_DEPENDENCY: steps/brd/normalize.md — the ORDER that shows the same FORM to the role.
//             The two are read together: a form widened here and left alone there judges a shape
//             nobody asked the role to write, and the role has no way to learn about it.
// Invariants: TOTAL. Anything at all goes in — `parseRows` returns a parse, never throws, and never
//             invents a row. `judgeRows` returns ALL findings at once: a table is fixed in one
//             round or the round is wasted.
// Interface:  FORM, COLUMNS, SEPARATOR, CLASSES, parseRows, judgeRows
//
// COMPLETENESS IS NOT JUDGED HERE, and no rule of this module may grow into it. "As many rows as
// the request has sentences" is unwritable: a request carries a preamble, explanations and context
// out of which no action follows. Whether a requirement was lost is read by the operator, row by
// row, against the request — a defect of the ORDER when one is missing, never a reason to soften
// the table.

export const COLUMNS = 4
export const SEPARATOR = "|"
export const FORM = "<verb> | <object> | <instrument> | <values>"

// Rule codes. The class IS the code the role reads at the head of a blocker — one place, one name.
export const CLASSES = Object.freeze(["columns", "clipped-value"])

// One worked row, quoted into every blocker as the sample of what to write. From the eddi run of
// 22.08.2026 — a row the pipeline actually consumed, not an invented one.
const SAMPLE = "export | Glossary | agent ZIP archive | as {id}.glossary.json plus {id}.descriptor.json"

// FUNCTION_CONTRACT: parseRows — the role's answer as rows
//   Input:        text — what the role wrote, bytes as they are
//   Dependencies: none
//   Antecedent:   — (total: `undefined`, a number or an object give an empty parse, not a throw)
//   Consequent:   success: [{ n, line, cells, verb, object, instrument, values }] — `n` is the line
//                 number in the answer, so a blocker names something findable by search; `cells` is
//                 what the row REALLY carries, however many that is — the count is judged, not fixed
//   Purity:       pure
//   Interface:    parseRows(text) -> row[]
//
//   A LINE WITHOUT A SEPARATOR IS NOT A ROW. The role is ordered to answer with rows only, but a
//   small model prefixes a title, a fence or a closing sentence; counting those as broken rows would
//   fill the repair order with findings the role cannot act on. What carries at least one `|` claims
//   to be a row and is judged as one.
export function parseRows(text) {
  const rows = []
  const lines = String(text ?? "").split("\n")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line.includes(SEPARATOR)) continue          // preamble, blank line, fence — not a row
    if (/^[|\s:-]+$/.test(line)) continue            // a markdown ruler carries no cell at all
    const cells = line.split(SEPARATOR).map((c) => c.trim())
    rows.push({
      n: i + 1, line, cells,
      verb: cells[0] ?? "", object: cells[1] ?? "", instrument: cells[2] ?? "", values: cells[3] ?? "",
    })
  }
  return rows
}

// FUNCTION_CONTRACT: judgeRows — the guardrail over the normalized table
//   Input:        rows — the output of parseRows
//   Dependencies: clipOf
//   Antecedent:   — (total: a non-array is judged as no rows)
//   Consequent:   success: { blockers: [], judged, silent } — silent when there are NO rows: with
//                 nothing to judge the rule says so instead of reddening at random
//                 (standards/guardrail.md);
//                 failure: { blockers: [{ cls, text }], judged, silent: false } — EVERY finding, one
//                 per broken row and rule, each carrying its exit
//   Purity:       pure
//   Interface:    judgeRows(rows) -> { blockers, judged, silent }
//
//   ONE ROW IS JUDGED BY ONE RULE AT A TIME. A row whose column count is wrong has no `values`
//   column to speak of — cell 4 of a six-cell row is somebody else's text — so the second rule stays
//   off it. Two blockers over the same defect send the role fixing what it never wrote.
export function judgeRows(rows = []) {
  const list = Array.isArray(rows) ? rows : []
  if (!list.length) {
    return { blockers: [], judged: 0, silent: true }
  }
  const blockers = []
  for (const row of list) {
    const filled = row.cells.filter(Boolean).length
    if (row.cells.length !== COLUMNS || filled !== COLUMNS) {
      blockers.push({ cls: "columns", text:
        `columns row ${row.n}: ${row.cells.length} columns, ${filled} of them carrying text, the form has ` +
        `${COLUMNS} — «${row.line}». Write the row as «${FORM}» with exactly ${COLUMNS - 1} «${SEPARATOR}»: ` +
        `«${SAMPLE}». A column you have nothing to say in still gets written — put the thing itself there; ` +
        `a value that reads as two columns is one column, and a «${SEPARATOR}» inside it is dropped.` })
      continue
    }
    const clip = clipOf(row.values)
    if (clip) {
      blockers.push({ cls: "clipped-value", text:
        `clipped-value row ${row.n}: the values column breaks off — ${clip} — «${row.values}». Copy the name, ` +
        `path or placeholder from the request WHOLE, as it stands there: «${SAMPLE}», never ` +
        `«as {id}.glossary…». A shortened name matches nothing further down: the word is greped ` +
        `against the repository and quoted into the requirement.` })
    }
  }
  return { blockers, judged: list.length, silent: false }
}

// FUNCTION_CONTRACT: clipOf — does this values cell break off mid-name
//   Input:        values — the fourth column of one row
//   Antecedent:   — (total)
//   Consequent:   success: null — the cell carries whole names; failure: the reason, in the words
//                 the blocker prints
//   Purity:       pure
//
//   WHAT COUNTS AS CLIPPED IS WHAT THE CELL ITSELF BETRAYS, never a guess against the request. An
//   ellipsis, an unclosed quote, half a placeholder — each is decidable inside the cell. `<` is read
//   as a placeholder only when a letter follows it, so a plain «less than 64» is not accused of
//   anything: a guardrail that blames the role for what it did not write is forbidden
//   (standards/guardrail.md).
function clipOf(values) {
  const v = String(values ?? "")
  if (/…|\.\.\./.test(v)) return "an ellipsis stands where the rest of the value was"
  if ((v.match(/`/g) || []).length % 2) return "a backtick is opened and never closed"
  const open = (v.match(/{/g) || []).length
  const close = (v.match(/}/g) || []).length
  if (open !== close) return `${open} «{» against ${close} «}» — a placeholder is left half-written`
  if (/<[A-Za-z][\w.-]*(?![^>]*>)/.test(v)) return "a placeholder opened with «<» is never closed"
  if (/\betc\b/i.test(v)) return "«etc» stands where the rest of the enumeration was"
  return null
}
