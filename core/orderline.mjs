// MODULE_CONTRACT: orderline — what the run's log says about ONE assembled order
// Purpose:    one decision — HOW MUCH of an order's assembly is spoken out loud. The size of an
//             order is a fact the operator watches on every round; the BREAKDOWN by addend is a
//             diagnosis, and a diagnosis is only worth its place when something is wrong with it or
//             when it is seen for the first time.
// io:         none — the caller measures, this module decides and formats
// Invariants: TOTAL — any input, including undefined, null and garbage, yields two strings and never
//             throws;
//             `why` (the refusal) ALWAYS carries every addend: a refusal that names only a total
//             tells the operator nothing about which document grew, and it is the ONLY thing they
//             get when the role never ran;
//             the addends are ordered by size, biggest first, with the template ahead of them —
//             the document that blew the order up is read without counting.
// Interface:  newOrderLine({ step, chars, cap, round, over, tplChars, addends }) -> { line, why }

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const str = (v) => (v === undefined || v === null ? "" : String(v))

// FUNCTION_CONTRACT: newOrderLine — one assembled order, as the chat sees it and as the refusal says it
//   Input:        step — the step's name, as it stands in the log; chars — the assembled order's
//                 length; cap — the ceiling ONE order may carry (core/budgets.mjs::ORDER_CAP_CHARS);
//                 round — how many orders of this KIND the run has assembled so far, this one
//                 included; over — does the order exceed the cap; tplChars — the template's own
//                 length; addends — [{ name, chars }], one per substituted value, in any order
//   Dependencies: num, str — local totalisers
//   Antecedent:   any values; a `round` that is absent or unreadable counts as the first one, so an
//                 unknown round says MORE rather than less
//   Consequent:   success: { line, why } — `line` is what log() prints: the total alone from the
//                          second round of a kind onward, the total PLUS every addend on the first
//                          round and whenever the order is over the cap; `why` is the refusal, and
//                          it carries the addends unconditionally
//                 failure: none — total
//   Purity:       pure
//   BUG_FIX_CONTEXT: session 01a017dc — 22 turns of the chat model at 22-31 thousand input tokens
//                 each, `cached` 0 on all but one. In that band the chat model is a COURIER: every
//                 log line the run prints becomes a session entry (pi.appendEntry(WORKFLOW_LOG_ENTRY)
//                 — pi-extensible-workflows/src/host.ts:216) and rides into the next turn's context.
//                 The breakdown line was printed on EVERY round of every step and carried the
//                 internals of the assembly — `intake: наряд 141879 симв из 800000 — шаблон 6876 ·
//                 MAP 107811 · PREVIOUS 19794 · …` — while the only number that moves between rounds
//                 is the total. The breakdown itself is not deleted: it is what the refusal says, and
//                 it is what the first round of a kind shows, because a composition nobody ever saw
//                 is a composition nobody can question.
export function newOrderLine({ step, chars, cap, round, over, tplChars, addends } = {}) {
  const name = str(step)
  const size = num(chars)
  const nth = num(round)
  const parts = [
    `шаблон ${num(tplChars)}`,
    ...(Array.isArray(addends) ? addends : [])
      .map((a) => ({ name: str(a && a.name), chars: num(a && a.chars) }))
      .sort((a, b) => b.chars - a.chars)
      .map((a) => `${a.name} ${a.chars}`),
  ].join(" · ")
  const total = `${name}: наряд ${size} симв из ${num(cap)}, круг ${nth || 1}`
  return {
    line: over || nth <= 1 ? `${total} — ${parts}` : total,
    why: `наряд ${name} — ${size} симв при потолке ${num(cap)}: ${parts}`,
  }
}
