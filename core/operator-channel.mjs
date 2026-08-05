// MODULE_CONTRACT: operator-channel.mjs — the two-value RULE behind pipeline.json's operatorChannel
// Purpose:      one decision — which two strings are legal for the run's operator-question policy,
//               and that the field's ABSENCE is refused exactly like an unknown string, never quietly
//               defaulted. Same status as pipeline.json's `loops`/`models`: a policy of the RUN,
//               declared as data (see pipeline.json's own "//operatorChannel" comment for the full
//               argument), not a constant a script author is trusted to remember correctly.
// io:           none
// Invariants:   exactly two admissible values, "terminal" and "checkpoint"; `undefined` (field absent
//               from pipeline.json) is its own distinguishable failure, not folded into "invalid" —
//               a future diagnosis needs to tell "nobody wrote this field" from "somebody wrote it
//               wrong" (standards/protocol.md's "unknown is a rail, not a default").
// Interface:    OPERATOR_CHANNELS — frozen tuple of the two admissible literals
//               newOperatorChannel(raw) -> Result<"terminal" | "checkpoint", Error>
//
// Mirrored, not imported, in workflows/izi.js. The pi-extensible-workflows sandbox that runs a
// workflow script exposes no `import`/`require`/`process` — only agent/shell/prompt/checkpoint/
// parallel/pipeline/phase/log/args/Promise/JSON/Math reach the script (registry.ts RESERVED_GLOBALS;
// the SKILL.md line "Workflow JavaScript has no imports, filesystem, network, process, or timers").
// izi.js therefore carries the identical two-value check inline, by necessity, not by choice; this
// module exists so the RULE — which two strings are legal, that absence is not legal — is proven once
// under `node --test`, in the open, instead of living solely inside a script nothing can import.

import { ok, err } from "./result.mjs"

export const OPERATOR_CHANNELS = Object.freeze(["terminal", "checkpoint"])

// FUNCTION_CONTRACT: newOperatorChannel — validates pipeline.json's operatorChannel field
//   Input:        raw — pipeline.json's parsed `operatorChannel` value: a string when the field is
//                 present, `undefined` when the key is absent from the file (JSON has no "declared
//                 but empty" — absence and `undefined` are the same case here)
//   Dependencies: —
//   Antecedent:   any value, including undefined
//   Consequent:   success: raw itself, when raw === "terminal" or raw === "checkpoint"
//                 failure: "operator-channel-unset" — raw is undefined: the field was never declared
//                          "operator-channel-invalid" — raw is present but not in OPERATOR_CHANNELS
export function newOperatorChannel(raw) {
  if (raw === undefined) {
    return err(
      "operator-channel-unset",
      "pipeline.json: operatorChannel не объявлен — умолчания нет, канал прогона обязан быть данными",
    )
  }
  if (!OPERATOR_CHANNELS.includes(raw)) {
    return err(
      "operator-channel-invalid",
      `pipeline.json: operatorChannel=${JSON.stringify(raw)} — допустимо только ${OPERATOR_CHANNELS.join(" | ")}`,
    )
  }
  return ok(raw)
}
