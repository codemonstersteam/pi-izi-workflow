// MODULE_CONTRACT: steps-map — the one place that names each step's staging and out path
// Purpose:      izi-pi-v2 carries no per-step `step.json` (unlike the donor, PLAN.md §3): the
//               promote/receipt trubs still need staging→out pairs, so the pairs are declared here
//               ONCE and imported, instead of living as literals in bin/promote.mjs and
//               bin/receipt.mjs separately, where they would drift (standards/code.md, "одно
//               требование — одно место").
// io:           none
// Invariants:   STEP_PATHS is a frozen object; a step missing here has no declared paths — callers
//               treat that as "step not promotable", not as an empty string
// Interface:    STEP_PATHS — Object<string, { staging?: string, out: string }>
//
// `task` has no `staging`: the human step's `out` (TASK.md) is placed by the operator directly
// (arch/slices/task.md — the step declares no staging path at all, and workflows/izi.js closes it
// with bin/receipt.mjs alone, never bin/promote.mjs). Only steps of kind `role` promote.
export const STEP_PATHS = Object.freeze({
  brd: Object.freeze({ staging: ".agent/staging/brd.md", out: ".agent/brd.md" }),
  task: Object.freeze({ out: "TASK.md" }),
})
