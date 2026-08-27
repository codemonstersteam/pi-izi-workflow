// MODULE_CONTRACT: instruction — что движок говорит сандбоксу
// io:         none
// Interface:  Instruction
export type Instruction =
  | { do: "role"; role: string; text: string }
  | { do: "ask"; items: string[] }
  | { do: "say"; line: string }
  | { do: "done" }
  | { do: "err"; kind: string; subject: string }
