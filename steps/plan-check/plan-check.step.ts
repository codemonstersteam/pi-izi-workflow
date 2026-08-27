// MODULE_CONTRACT: plan-check — фазы critic → questions → confirm
// Purpose:    одно решение: как план проверяется и утверждается. Критик (роль) судит смысл;
//             открытые вопросы раздела 6 уходят оператору В ЧАТ (ask-рельса), ответы
//             вписываются в план (questions.ts); карточка (card.ts) + checkpoint Approve —
//             финальное подтверждение перед execute.
// io:         fs (чтение staging/PLAN, запись .agent/PLAN.md при promote)
// EXTERNAL_DEPENDENCY: questions.ts, card.ts — чистые; engine владеет переходами фаз.
// Invariants: план продвигается в .agent/PLAN.md ТОЛЬКО после APPROVE критика; вопросы
//             задаются по черновику/плану дословно.
// Interface:  step { next, fold, applyAnswers }
import { existsSync, readFileSync, mkdirSync, copyFileSync } from "node:fs"
import { join } from "node:path"
import type { SoloState, Instruction, StepHead } from "../../ext/types.ts"
import { extractQuestions, applyAnswers } from "./questions.ts"
import { buildCard } from "./card.ts"

const readAt = (cwd: string, rel: string): string =>
  existsSync(join(cwd, rel)) ? readFileSync(join(cwd, rel), "utf8") : ""

export const step: StepHead = {
  next(state: SoloState): Instruction {
    if (state.phase === "critic") {
      const draft = ".agent/staging/PLAN~draft.md"
      const text = [
        `$START_TASK\nТы критик плана. Прочитай план ниже и проверь его по чек-листу — выборочно сверяй утверждения с реальным кодом (читай файлы репозитория инструментом read):\n1. ТРЕБОВАНИЯ: каждая строка раздела 1 — цитата из TASK.md, и названное место закрытия реально закрывает её.\n2. ИЗМЕНЕНИЯ: каждый путь существует (или честно «новый» с образцом); контракт в строке соответствует коду образца.\n3. СЦЕНАРИИ: до и после различны; «до» описывает текущий код, а не мечту.\n4. ВЕЛИЧИНЫ: у каждой есть источник; числа без источника — к вопросам.\n5. ГАРАНТИИ: поимённы и правдоподобны относительно кода.\n6. ОТКРЫТЫЕ ВОПРОСЫ: то, что решать оператору, а не молчаливые допущения.\nВердикт: APPROVE — план исполняем; или REJECT с НЕ БОЛЕЕ ТРЁХ блокеров, каждый с адресом (раздел + строка) и чем он станет ошибкой разработки.\n$END_TASK`,
        `$START_DATA\n$START_DOCUMENT\npath: ${draft}\nПлан, который судишь.\n$END_DOCUMENT\n$START_CONTENT\n${readAt(state.cwd, draft)}$END_CONTENT\n\n$START_DOCUMENT\npath: TASK.md\nЗаказ — высшая инстанция.\n$END_DOCUMENT\n$START_CONTENT\n${readAt(state.cwd, "TASK.md")}$END_CONTENT\n$END_DATA`,
        `$START_OUTPUT\nОдин вызов workflow_result: { "track": "ok", "verdict": "APPROVE" } или { "track": "ok", "verdict": "REJECT", "blockers": ["…"], "questions": ["что решить оператору", …] }.\n$END_OUTPUT`,
      ].join("\n\n")
      return { do: "role", role: "critic", text, staging: draft }
    }

    if (state.phase === "questions") {
      // движок обслуживает эту фазу ask-рельсой (state.question); сюда попадаем,
      // только если вопросов нет — тогда сразу confirm
      const plan = readAt(state.cwd, ".agent/PLAN.md")
      if (!state.cardShown) return { do: "say", line: buildCard(plan, state.cwd) }
      return { do: "ask", name: "solo-confirm", items: ["План прочитан, вопросы решены. Запускаем разработку (execute)? Ответь: да / нет: причина"] }
    }

    if (state.phase === "confirm") {
      const plan = readAt(state.cwd, ".agent/PLAN.md")
      if (!state.cardShown) return { do: "say", line: buildCard(plan, state.cwd) }
      // ПОДТВЕРЖДЕНИЕ СЛОВАМИ через ask-канал: «да» — execute, «нет: причина» — круг plan.
      // Модалки checkpoint несовместимы с background (чат-реле); слова читаем из ответа.
      return { do: "ask", name: "solo-confirm", items: ["План прочитан, вопросы решены. Запускаем разработку (execute)? Ответь: да / нет: причина"] }
    }

    return { do: "err", kind: "state", subject: `plan-check получил фазу «${state.phase}»` }
  },

  fold(state: SoloState, it: any, env: any, io: any) {
    if (state.phase === "critic") {
      if (env.verdict === "APPROVE") {
        // план продвигается ДО вопросов: оператор уточняет уже цельный план
        mkdirSync(join(state.cwd, ".agent"), { recursive: true })
        copyFileSync(join(state.cwd, io.PLAN_DRAFT), join(state.cwd, io.PLAN))
        const questions = extractQuestions(readAt(state.cwd, io.PLAN))
        if (!questions.length) return { track: "ok", value: { ...state, phase: "confirm", round: 1, cardShown: false } }
        const items = questions.map((q) => `${q.text}${q.recommendation ? ` — рекомендация: ${q.recommendation}` : ""}`)
        return {
          track: "ok",
          value: { ...state, phase: "questions", round: 1, cardShown: false, question: { name: "solo-questions", items, retry: 0 } },
        }
      }
      const qs = (env.questions || []).filter(Boolean)
      if (qs.length) return { track: "ok", value: { ...state, question: { name: `solo-critic-q${state.round}`, items: qs, retry: 0 } } }
      return { track: "ok", value: { ...state, phase: "plan", round: 1, blockers: (env.blockers || ["критик отверг без блокеров"]).join("\n") } }
    }
    return { track: "ok", value: state }
  },

  applyAnswers,
}
