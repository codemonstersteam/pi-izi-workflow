// MODULE_CONTRACT: plan — фаза «план пишет роль с глазами на код»
// Purpose:    одно решение: что видит planner и чем судится её ответ. Наряд = артефакт-спека
//             (PROMPT.md проекта или дефолтная из пакета) + TASK + свой черновик как
//             PREVIOUS на починке. СУДЬЯ — judge.ts (вычислимое о шести разделах).
// io:         fs (чтение TASK/PROMPT/чертей, чтение дефолтной спеки пакета)
// EXTERNAL_DEPENDENCY: judge.ts — тот же судья у юнитов; спека — ../../ext/spec/.
// Invariants: спека едет ДОСЛОВНО — разделы и колонки суть контракт; FEEDBACK/ANSWERED
//             приходят всегда (пусть пустыми).
// Interface:  step { next, fold }
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { SoloState, Instruction, StepHead } from "../../ext/types.ts"
import { judgeDraft } from "./judge.ts"

const readAt = (cwd: string, rel: string): string =>
  existsSync(join(cwd, rel)) ? readFileSync(join(cwd, rel), "utf8") : ""

const specOf = (cwd: string): string => {
  const own = readAt(cwd, "PROMPT.md")
  return own.trim() ? own : readFileSync(new URL("../../ext/spec/PROMPT.default.md", import.meta.url).pathname, "utf8")
}

export const step: StepHead = {
  next(state: SoloState): Instruction {
    const staging = ".agent/staging/PLAN~draft.md"
    const previous = readAt(state.cwd, staging)
    const parts = [
      `$START_TASK\nТы планировщик. ${specOf(state.cwd).trim()}\n$END_TASK`,
      `$START_DATA\n$START_DOCUMENT\npath: TASK.md\nЗаказ оператора, байты как есть. Единственный источник требований.\n$END_DOCUMENT\n$START_CONTENT\n${readAt(state.cwd, "TASK.md")}$END_CONTENT\n$END_DATA`,
    ]
    if (previous.trim())
      parts.push(`$START_PREVIOUS\npath: ${staging}\nТВОЙ ЧЕРНОВИК как он лежит на диске. FEEDBACK называет что чинить — правь названное, остальное не трогай.\n$START_CONTENT\n${previous}$END_CONTENT\n$END_PREVIOUS`)
    if (state.blockers.trim()) parts.push(`$START_FEEDBACK\n${state.blockers.trim()}\n$END_FEEDBACK`)
    if (state.answers.trim()) parts.push(`$START_ANSWERED\nОтветы оператора на вопросы плана — каждое решение обязано быть отражено:\n${state.answers.trim()}\n$END_ANSWERED`)
    parts.push(`$START_OUTPUT\npath: ${staging}\nПиши файл инструментом write по этому пути, затем один раз workflow_result:\n{ "track": "ok", "artifact": "${staging}" } — или { "track": "err", "kind": "blocked", "subject": "…" }.\n$END_OUTPUT`)
    return { do: "role", role: "planner", text: parts.join("\n\n"), staging }
  },

  fold(state: SoloState, it: any, env: any, io: any) {
    const staging = ".agent/staging/PLAN~draft.md"
    if (env.artifact !== it.staging)
      return { track: "ok", value: { ...state, blockers: `invalid: роль записала «${env.artifact || "ничего"}», а послана была в ${it.staging}` } }
    const blockers = judgeDraft({
      plan: readAt(state.cwd, staging),
      task: readAt(state.cwd, "TASK.md"),
      cwd: state.cwd,
    })
    if (blockers.length) return { track: "ok", value: { ...state, round: state.round + 1, blockers: blockers.join("\n") } }
    return { track: "ok", value: { ...state, phase: "critic", round: 1, blockers: "" } }
  },
}
