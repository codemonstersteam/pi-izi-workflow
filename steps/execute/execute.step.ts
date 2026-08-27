// MODULE_CONTRACT: execute — фаза «разработка по строкам Ф»
// Purpose:    одно решение: что видит dev и чем судится её ответ. Наряд — УТВЕРЖДЁННЫЙ план
//             + три правила (доказано живым прогоном: минимального промпта достаточно);
//             судьи a/b/c — judges.ts; зелёный — итоговая карточка и done.
// io:         fs (чтение .agent/PLAN.md)
// Invariants: одна сессия без разрезания (кэш держит экономику); ФЕEDBACK на круге несёт
//             адрес строки.
// Interface:  step { next, fold }
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { SoloState, Instruction, StepHead } from "../../ext/types.ts"
import { judgeSolve, doneCard } from "./judges.ts"

const readAt = (cwd: string, rel: string): string =>
  existsSync(join(cwd, rel)) ? readFileSync(join(cwd, rel), "utf8") : ""

export const step: StepHead = {
  next(state: SoloState): Instruction {
    const plan = readAt(state.cwd, ".agent/PLAN.md")
    const text = [
      `$START_TASK\nРазработай по плану ниже. Правила:\n1. работай маленькими итерациями с тестами; итерация = строка Ф = коммит\n   (сообщение коммита — со ссылками на §плана и принятыми решениями)\n2. величины — только из раздела 4; гарантии раздела 5 нерушимы\n3. существующие тесты не переписывать\nБаг плана нашёл по мелочи (пример/опечатка) — правь PLAN.md с обоснованием в коммите.\nНужно изменить поведение/требование/гарантию — верни err-конверт kind="blocked" с вопросом.\n$END_TASK`,
      `$START_DATA\n$START_DOCUMENT\npath: .agent/PLAN.md\nУтверждённый оператором план — единственная инструкция. Вопросы оператора уже решены (строки «→ РЕШЕНО»).\n$END_DOCUMENT\n$START_CONTENT\n${plan}$END_CONTENT\n$END_DATA`,
      state.blockers.trim() ? `$START_FEEDBACK\n${state.blockers.trim()}\n$END_FEEDBACK` : "",
      `$START_OUTPUT\nРаботай в репозитории инструментами (read/bash/edit/write), коммить сам (git add -A && git commit).\nЗакончив ВСЕ строки Ф — один вызов workflow_result: { "track": "ok", "artifact": ".agent/PLAN.md" }.\nНе можешь продолжать — { "track": "err", "kind": "blocked", "subject": "…" }.\n$END_OUTPUT`,
    ].filter(Boolean).join("\n\n")
    return { do: "role", role: "dev", text, staging: ".agent/PLAN.md" }
  },

  fold(state: SoloState, it: any, env: any, io: any) {
    const findings = judgeSolve({ cwd: state.cwd, plan: readAt(state.cwd, io.PLAN), since: state.solveStart })
    if (findings.length) return { track: "ok", value: { ...state, round: state.round + 1, blockers: findings.join("\n") } }
    return {
      track: "ok",
      value: { ...state, phase: "done", blockers: "", doneCard: doneCard(state.cwd, readAt(state.cwd, io.PLAN), state.solveStart), doneShown: false },
    }
  },
}
