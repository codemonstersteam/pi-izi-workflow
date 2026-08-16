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
//             elem(name) -> RegExp — global, matches BOTH shapes of one tag
//             esc(value) -> string — an attribute value, entity-encoded
//             tokens(value) -> readonly string[] — a LIST of tokens out of one attribute
//             alts(value) -> readonly string[] — the ALTERNATIVES of one attribute

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

// FUNCTION_CONTRACT: esc — a value, safe inside an attribute
//   Input:        v — any value; null/undefined read as ""
//   Dependencies: —
//   Antecedent:   any value
//   Consequent:   success: the five XML predefined entities encoded, `&` FIRST so an already-encoded
//                          `&lt;` does not become `&amp;lt;` on a round trip
//                 failure: none — total
//   Purity:       pure
//   Interface:    esc(v: unknown) -> string
//
// It lives beside `attrs`, which DECODES, because the two are one rule read in two directions: every
// writer of this grammar (steps/scope/computed.mjs, steps/graph/graph.mjs) must encode exactly what
// `attrs` decodes, or a value survives one round trip and not the next.
export const esc = (v) => String(v == null ? "" : v)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

// THE CLASS BOUNDARY, and it is a boundary, not an exception. One attribute value carries either a
// LIST OF TOKENS or a set of ALTERNATIVES OF TEXT, and the two classes are told apart by what a
// member of the value is allowed to contain — never by which slice is reading:
//
//   tokens — a member is a TOKEN: a path (`src/LoanResource.java`), a value id (`v14`), an end of a
//            use case (`UC1/2a`), a use case id. No token of any grammar of this pipeline contains a
//            space, a comma or a bar, so admitting all three as separators cannot merge two members
//            or split one. `nodes`, `closes`, `from`, `uc`, `seeds`.
//   alts   — a member is TEXT, and the text carries spaces, commas, braces and parentheses of its
//            own (`out="201 {bookingId} | 409 {conflict}"`, `verdict="Pass | Reject"`). There the
//            separator is `|` and nothing else, because a space and a comma are CONTENT. `in`, `out`.
//
// Substituting one for the other is not a style choice: `tokens` on an `out` shreds every text into
// words, `alts` on a `closes` returns whichever separator the author happened to type.
//
// BUG_FIX_CONTEXT: live run 27b37fdb (sandbox/runbox/eddi), pass A of step 9 — four red rounds in a
//   row, 3 launches of `valuer`, 318 605 tokens, $0.754, 37 minutes, zero artifacts.
//   Previous: every reader of a token list wrote its own `split(/\s+/)` inline — eleven copies of one
//             decision — while the schemas of the same pipeline used ` | ` for "list them all"
//             (`in="v1 | v14"`, `order-values.tpl`'s own `closes=`). One symbol, two meanings.
//   Problem:  the role read its order's `closes="UC1/in | UC1/post | …"` as a list — semantically
//             RIGHT — and the reader cut it on spaces, so `|` arrived as a token that resolves to no
//             end of any FRD. Rule 12 then reported a token, not a separator, so four rounds repaired
//             the wrong thing; the only way to obey the blocker was to split one failure across six
//             rows, which the role's own LAW 3 forbids. The loop was unwinnable by construction, and
//             the artifact it rejected was LEGAL: with this parse the same file yields 0 blockers
//             instead of 8.
//   Fix:      one declaration per CLASS, here, so the separator is a property of the class and not of
//             whoever typed the schema. Widening the token class costs nothing — no token can carry a
//             separator — and the text class is left with its single legal separator untouched.

// FUNCTION_CONTRACT: tokens — the members of a LIST-OF-TOKENS attribute
//   Input:        v — an attribute value; type unconstrained
//   Dependencies: —
//   Antecedent:   every member is a token with no space, comma or bar inside it (see the class
//                 boundary above) — a value carrying TEXT belongs to `alts`, not here
//   Consequent:   success: frozen string[] in order of appearance, empty for undefined/null/""
//                 failure: none — total
//   Purity:       pure
//   Interface:    tokens(v: unknown) -> readonly string[]
export const tokens = (v) => Object.freeze(String(v ?? "").split(/[\s,|]+/).map((t) => t.trim()).filter(Boolean))

// FUNCTION_CONTRACT: alts — the alternatives of a TEXT-BEARING attribute
//   Input:        v — an attribute value; type unconstrained
//   Dependencies: —
//   Antecedent:   a member is text that may contain spaces and commas; `|` is the one separator
//   Consequent:   success: frozen string[] in order of appearance, each trimmed at the edges, empty
//                          for undefined/null/""
//                 failure: none — total
//   Purity:       pure
//   Interface:    alts(v: unknown) -> readonly string[]
export const alts = (v) => Object.freeze(String(v ?? "").split("|").map((x) => x.trim()).filter(Boolean))

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

// FUNCTION_CONTRACT: elem — a global matcher for one tag name in BOTH of its shapes
//   Input:        name — the tag name, used verbatim in the pattern (`\b`-bounded)
//   Dependencies: —
//   Antecedent:   name is a plain tag name
//   Consequent:   success: a fresh global RegExp; match[1] is the attribute body (feed it to
//                          `attrs`), match[2] is the element body — undefined when the element was
//                          written self-closing
//                 failure: none — total
//   Purity:       pure
//   Interface:    elem(name: string) -> RegExp
//
// It exists because `tag()` covers one shape per call, and step 5 writes BOTH: a `<module>` with a
// body when the node has declarations, self-closing when it does not. A reader that needs the body
// AND must not lose the bodiless nodes cannot use `tag()` twice without merging two passes by hand.
//
// BUG_FIX_CONTEXT: steps/intake/map.mjs, caught by map.test.mjs before any live run.
//   Previous: this pattern was written inline as `<module\b${ATTRS}(?:/>|>([\s\S]*?)</module>)`.
//   Problem:  ATTRS is greedy and `[^<>]` admits `/`, so on `<module path="a"/>` it swallowed the
//             closing `/` as an attribute character, failed `/>`, matched the bare `>` instead and
//             then ran its lazy body up to the NEXT `</module>`. One self-closing node therefore ate
//             the node that followed it: the map came back with fewer keys and the eaten node's
//             `kind="test"` was lost — F2/F3 would have passed a delta ON A TEST.
//   Fix:      inside the attribute body a `/` is admitted only when it is NOT followed by `>`
//             (`/(?!>)`), so greedy matching can no longer cross the tag's own terminator. Quoted
//             runs are untouched, which is what keeps `via="a -> b"` and every path intact.
const ATTRS_ELEM = '((?:"[^"<]*"|/(?!>)|[^<>/])*)'
export const elem = (name) => new RegExp(`<${name}\\b${ATTRS_ELEM}(?:/>|>([\\s\\S]*?)</${name}>)`, "g")
