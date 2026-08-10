// MODULE_CONTRACT: xml — the tag scanner the pipeline's own XML grammars are read with
// Purpose:    one decision — how a tag and its attributes are lifted out of text, kept in ONE place
//             so the two slices that speak this grammar (steps/scope: graph parts, steps/design:
//             design graph and routes) cannot drift apart in what they consider a valid tag. The
//             grammars themselves live in their slices; this module knows nothing about `<module>`,
//             `<route>` or `<suite>`, only about "a tag with attributes".
// io:         none
// EXTERNAL_DEPENDENCY: none — plain ECMAScript regular expressions. This is deliberate: an XML
//             library would be a pipeline dependency (CLAUDE.md $START_FORBIDDEN), and everything
//             wider than these narrow grammars is of no use to a guardrail — an unknown tag is
//             simply not read.
// Invariants: every export is total — any input, including undefined, null and garbage, yields an
//             empty scan and never throws. A guardrail that crashes on a malformed artifact would
//             turn "the role wrote nonsense" (data, a red check, a redelegation) into "the run
//             crashed" (code 2, no diagnosis).
// Interface:  ATTRS — the attribute-body sub-pattern, for callers building their own regexes
//             attrs(tagText) -> Record<string, string>
//             tag(name, tail?) -> RegExp — global, one match per occurrence

// ATTRS — the body of a tag: quote-aware, and bounded by the tag it belongs to.
//
// BUG_FIX_CONTEXT 1: steps/design/design.mjs, caught by design.test.mjs before any live run.
//   Previous: the body was matched with a naive `[^>]*`.
//   Problem:  it stopped at the first `>` INSIDE an attribute value, so `steps="a -> b"` (every
//             route) truncated the match. Routes then parsed as nothing at all, and EVERY node came
//             back red under design rule 2 — a guardrail failure that reads like a role failure.
//   Fix:      a quoted run is consumed whole, so `>` inside a value no longer terminates the tag.
//
// BUG_FIX_CONTEXT 2: steps/scope/part.mjs, caught by part.test.mjs the day the scanner was shared.
//   Previous: the quoted run was `"[^"]*"` — a value could contain anything, including `<`.
//   Problem:  the alternation could then swallow the `>` that ENDS one tag, run through the element
//             text, and satisfy `/>` on a LATER tag. Scanning a part for self-closing `<module/>`
//             produced a phantom module whose path came from a `<test path=…/>` two lines below,
//             and the guardrail reported S2/S3/S4 blockers about a module the role never wrote.
//             Greedy matching makes it worse than it looks: `*` consumes as far as it can and then
//             backtracks to the LAST position that still closes the tag, not the nearest one.
//   Fix:      `"[^"<]*"` plus `[^<>]` — a value may contain `>` but not `<`, exactly as XML itself
//             requires (`<` must be written `&lt;` inside an attribute value). Every alternative is
//             now `<`-free, so no tag match can cross into the tag that follows it.
export const ATTRS = '((?:"[^"<]*"|[^<>])*)'

// FUNCTION_CONTRACT: attrs — attribute map of one tag body
//   Input:        tagText — the captured body of a tag, e.g. ` path="a.js" delta="add"`
//   Dependencies: —
//   Antecedent:   any value; undefined/null/garbage read as no attributes
//   Consequent:   success: { name: value } for every `name="value"` pair, in order of appearance;
//                          a repeated name keeps the LAST occurrence (plain object assignment)
//                 failure: none — total
//   Purity:       pure
//   Interface:    attrs(tagText: unknown) -> Record<string, string>
//
// Entities are DECODED here, in the one place attribute values are produced. `<` must be written
// `&lt;` inside a value (ATTRS above depends on it), so a caller that did not decode would compare a
// role's `branches="feature/&lt;slug&gt;"` against the string a human typed and never match. The five
// XML predefined entities are the whole set; `&amp;` is decoded LAST so `&amp;lt;` yields `&lt;`.
const unescape = (v) => v
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&amp;/g, "&")

export const attrs = (tagText) =>
  Object.fromEntries([...String(tagText == null ? "" : tagText).matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], unescape(m[2])]))

// FUNCTION_CONTRACT: tag — a global matcher for one tag name
//   Input:        name — the tag name, used verbatim in the pattern (`\b`-bounded)
//                 tail — what closes the tag: "/>" for a self-closing tag (the default), or a
//                        capture like ">([\\s\\S]*?)</module>" to take its body as well
//   Dependencies: ATTRS
//   Antecedent:   name is a plain tag name; the caller owns the regex safety of `tail`
//   Consequent:   success: a fresh global RegExp; match[1] is the attribute body (feed it to
//                          `attrs`), match[2] is the element body when `tail` captures one
//                 failure: none — total
//   Purity:       pure (a new RegExp per call, so `lastIndex` is never shared between callers)
//   Interface:    tag(name: string, tail?: string) -> RegExp
export const tag = (name, tail = "/>") => new RegExp(`<${name}\\b${ATTRS}${tail}`, "g")
