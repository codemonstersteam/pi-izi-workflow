// MODULE_CONTRACT: result — единственная форма возврата конструктора
// Purpose:    одно решение: как конструкция сообщает успех и отказ. Result — либо
//             { ok: true, value }, либо { ok: false, error: { cls, detail } }: класс — то, по
//             чему ветвится вызывающий, деталь — то, что читает человек.
// io:         none
// Invariants: никогда оба и никогда ни одного.
// Interface:  ok, err
export type Result<T> = { ok: true; value: T } | { ok: false; error: { cls: string; detail: string } }

export const ok = <T>(value: T): Result<T> => ({ ok: true, value })
export const err = <T = never>(cls: string, detail: string): Result<T> => ({ ok: false, error: { cls, detail } })
