// MODULE_CONTRACT: result — единственная форма возврата
// Purpose:    Result<T> — либо {ok:true, value}, либо {ok:false, error:{kind, detail}}.
// io:         none
// Invariants: никогда оба и никогда ни одного.
// Interface:  ok, fail, Result, DomainError
export type Result<T> = { ok: true; value: T } | { ok: false; error: DomainError }
export interface DomainError { kind: ErrorKind; detail: string }
export type ErrorKind = "state" | "no-task" | "escalate" | "blocked"

export const ok = <T>(value: T): Result<T> => ({ ok: true, value })
export const fail = <T = never>(kind: ErrorKind, detail: string): Result<T> =>
  ({ ok: false, error: { kind, detail } })
