// MODULE_CONTRACT: types — формы, которыми движок и шаги говорят друг с другом
// Purpose:    одно решение: словарь типов полосы. Инструкция — то, что возвращает next
//             (глагол полосы); фазы — плоский автомат; голова шага — границы модуля.
// io:         none
// Interface:  Instruction, Phase, SoloState, StepHead

export type Phase = "plan" | "critic" | "questions" | "confirm" | "execute" | "done"

export type Instruction =
  | { do: "role"; role: string; text: string; staging: string }
  | { do: "ask"; name: string; items: string[] }
  | { do: "checkpoint"; name: string; prompt: string }
  | { do: "say"; line: string }
  | { do: "done"; state: SoloState }
  | { do: "err"; kind: string; subject: string }

export interface SoloState {
  cwd: string
  key: string
  phase: Phase
  round: number
  blockers: string
  answers: string
  question: { name: string; items: string[]; retry: number } | null
  cardShown: boolean
  solveStart: string
  loops: number
  doneCard?: string
  doneShown?: boolean
}

// Голова шага: next строит инструкцию фазы, fold кладёт ответ. Движок владеет
// переходами между фазами; голова — содержанием своей фазы.
export interface StepHead {
  next: (state: SoloState) => Instruction | Promise<Instruction>
  fold: (
    state: SoloState,
    instruction: any,
    envelope: any,
    io: { PLAN_DRAFT: string; PLAN: string; gitHead: (cwd: string) => string },
  ) => any
  applyAnswers?: (plan: string, answersMd: string) => string
}
