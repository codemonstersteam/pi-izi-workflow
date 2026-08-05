// MODULE_CONTRACT: result.mjs — the one shape a factory returns
// Purpose:      one decision — how a construction reports success or failure, so that
//               `consequent(A) ⊆ antecedent(B)` can be checked by reading two contracts instead of
//               guessing what a bare `null` meant at that call site
// io:           none
// Invariants:   a Result is either `{ ok: true, value }` or `{ ok: false, error: { cls, detail } }`,
//               never both and never neither; `cls` is the error CLASS the contract names, `detail`
//               is human diagnosis and carries no decision
// Interface:    ok(value) -> Result
//               err(cls, detail) -> Result
//
// Why a class and a detail, not just a message. The class is what the caller branches on and what a
// contract's `Consequent: failure:` line names; the detail is what a human reads. Collapsing them
// into one string makes the caller parse prose, and prose is the thing this harness refuses to
// interpret anywhere else.

// FUNCTION_CONTRACT: ok — a successful construction
//   Input:        value — the constructed domain value
//   Dependencies: —
//   Antecedent:   value is already valid; this function validates nothing
//   Consequent:   success: `{ ok: true, value }`
//                 failure: none — total
export const ok = (value) => ({ ok: true, value })

// FUNCTION_CONTRACT: err — a refused construction
//   Input:        cls — the error class named by the caller's contract
//   Dependencies: detail — human diagnosis, free text
//   Antecedent:   cls is a non-empty kebab-case string
//   Consequent:   success: `{ ok: false, error: { cls, detail } }`
//                 failure: none — total
export const err = (cls, detail) => ({ ok: false, error: { cls, detail } })
