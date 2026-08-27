// MODULE_CONTRACT: engine — станционный цикл solo: next/fold над фазами
// Purpose:    одно решение: КАКАЯ фаза говорит сейчас и куда кладётся ответ. Фазы — плоский
//             автомат: plan (план пишет planner, судья шести разделов) → critic (смысл судит
//             критик) → questions (открытые вопросы плана — оператору В ЧАТ, ответы
//             вписываются в план) → confirm (карточка-синтез + checkpoint Approve) →
//             execute (dev по строкам Ф, судьи a/b/c) → done (итоговая карточка).
// io:         fs (через шаги: наряды/суды читают и пишут .agent/)
// EXTERNAL_DEPENDENCY: головы шагов steps/<id>/<id>.step.ts (MODULES) — движок не знает
//             содержания фаз, только глаголы и переходы.
// Invariants: круг тратится только на красный вердикт СВОЕЙ фазы; обрыв круг не тратит;
//             пустой ответ на вопрос — ПЕРЕСПРОС (не отвержение), после questionRounds —
//             escalate; done говорит только next.
// Interface:  soloStart, soloNext, soloFold, SoloState
import { readFileSync, existsSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { execSync } from "node:child_process"
import type { StepHead, SoloState, Instruction, Phase } from "./types.ts"
import { MODULES, type StepId } from "./registry.ts"

const PLAN_DRAFT = ".agent/staging/PLAN~draft.md"
const PLAN = ".agent/PLAN.md"
const DEFAULT_LOOPS = 3
const QUESTION_ROUNDS = 2

const readAt = (cwd: string, rel: string): string =>
  existsSync(join(cwd, rel)) ? readFileSync(join(cwd, rel), "utf8") : ""

// ── resume (образец step9-rework recon; урок T71: существование ≠ принято) ───
// Маркер пишется на КАЖДОМ переходе фазы; soloStart верит маркеру, а не фактам
// «файл лежит»: PLAN.md без маркера «план принят» — ещё черновик круга починки.
const PROGRESS = ".agent/progress.json"
function mark(cwd: string, patch: Record<string, unknown>) {
  let p: any = {}
  try { p = JSON.parse(readAt(cwd, PROGRESS) || "{}") } catch {}
  mkdirSync(join(cwd, ".agent"), { recursive: true })
  writeFileSync(join(cwd, PROGRESS), JSON.stringify({ ...p, ...patch, reachedAt: new Date().toISOString() }, null, 1))
}
function readMark(cwd: string): any {
  try { return JSON.parse(readAt(cwd, PROGRESS) || "{}") } catch { return {} }
}

const heads: Partial<Record<StepId, StepHead>> = {}
async function head(id: StepId): Promise<StepHead> {
  if (!heads[id]) heads[id] = (await import(MODULES[id])).step as StepHead
  return heads[id]
}

// ── start ────────────────────────────────────────────────────────────────────
export function soloStart({ key = "" }: { key?: string } = {}, ctx: { run?: { cwd?: string } } = {}) {
  const cwd = ctx?.run?.cwd || process.cwd()
  if (!existsSync(cwd)) return { track: "err" as const, kind: "state", subject: `каталог прогона «${cwd}» не существует` }
  if (!readAt(cwd, "TASK.md").trim())
    return { track: "err" as const, kind: "no-task", subject: "TASK.md в корне проекта пуст или отсутствует — solo не с чего начать" }
  const m = readMark(cwd)
  const resumed = existsSync(join(cwd, ".agent")) && m.phase
  const state: SoloState = {
    cwd, key: String(key || "").trim(),
    phase: resumed ? m.phase : "plan",
    round: resumed ? (m.round || 1) : 1,
    blockers: resumed ? (m.blockers || "") : "",
    answers: resumed ? (m.answers || "") : "",
    question: null, cardShown: false,
    solveStart: resumed ? (m.solveStart || "") : "",
    loops: DEFAULT_LOOPS,
  }
  return { track: "ok" as const, state, from: resumed ? "resumed" : "fresh" }
}

// ── next ─────────────────────────────────────────────────────────────────────
export async function soloNext({ state }: { state: SoloState }): Promise<Instruction> {
  if (!state || !state.cwd) return { do: "err", kind: "state", subject: "soloNext получил состояние без cwd" }
  if (state.phase !== "done" && state.round > state.loops)
    return { do: "err", kind: "escalate", subject: `фаза ${state.phase} не чинится за ${state.loops} круга` }
  // RESUME-СВЕРКА: фаза questions/confirm по маркеру, но вопросы ещё открыты
  // (pending жив) или ответы не вписаны — восстановить состояние паузы из диска.
  if (state.phase === "questions" && !state.question) {
    const pending = readAt(state.cwd, ".agent/pending.json").trim()
    const plan = readAt(state.cwd, PLAN)
    const applied = (plan.match(/→ РЕШЕНО/g) || []).length
    if (applied === 0) {
      // ответы могли прийти до остановки — применяем и идём в confirm
      const answers = readAt(state.cwd, ".agent/answers.md").trim()
      if (answers) {
        const hc = await head("plan-check")
        const updated = hc.applyAnswers?.(plan, answers) ?? plan
        writeFileSync(join(state.cwd, PLAN), updated)
        // ПЕРЕХОД, не только сообщение: say не меняет состояние — без перехода
        // ветка крутилась бы один и тот же ход вечно (живой цикл 27.08)
        state = { ...state, phase: "confirm", cardShown: false }
        return { do: "say", line: `resume: ответы оператора вписаны в план (${(updated.match(/→ РЕШЕНО/g) || []).length}); фаза confirm` }
      }
      if (pending) {
        try {
          const items = JSON.parse(pending).items.map((x: any) => x.text)
          state = { ...state, question: { name: "solo-questions-resume", items, retry: 0 } }
        } catch { /* битый pending — зададим заново извлечением из плана */ }
      }
    }
    if (!state.question) return { do: "say", line: "resume: ответы уже в плане; переход в confirm" }
  }
  if (state.phase === "confirm" && !state.cardShown) {
    // карточку покажет ветка ниже (head plan-check) — просто идём дальше
  }
  if (state.question)
    return { do: "ask", name: state.question.name, items: state.question.items }
  if (state.doneCard && !state.doneShown) return { do: "say", line: state.doneCard }
  if (state.phase === "done") return { do: "done", state }

  const h = await head(state.phase === "plan" ? "plan" : state.phase === "execute" ? "execute" : "plan-check")
  return h.next(state)
}

// ── fold ─────────────────────────────────────────────────────────────────────
export async function soloFold({ state, event }: { state: SoloState; event: any }): Promise<any> {
  const it = event.instruction || {}
  const put = (patch: Partial<SoloState>) => {
    const next = { ...state, ...patch }
    if (patch.phase && patch.phase !== state.phase) mark(state.cwd, { phase: next.phase, round: next.round, blockers: next.blockers, solveStart: next.solveStart, answers: next.answers })
    else if (patch.round) mark(state.cwd, { round: next.round, blockers: next.blockers })
    return { track: "ok" as const, value: next }
  }

  if (event.do === "say") {
    if (state.phase === "done") return put({ doneShown: true })
    return put({ cardShown: true })
  }

  if (event.do === "ask") {
    const answers = readAt(state.cwd, ".agent/answers.md").trim()
    const said: string[] = Array.isArray(event.result) ? event.result : [event.result]
    const got = said.some((a: string) => a && String(a).trim())
    // ПУСТОЙ ОТВЕТ — ПЕРЕСПРОС, НЕ ОТВЕРЖЕНИЕ (дырка proof-прогона 27.08: таймаут уводил в reject)
    if (!got) {
      const retry = (state.question?.retry || 0) + 1
      if (retry > QUESTION_ROUNDS)
        return { track: "err" as const, kind: "escalate", subject: `вопросы «${state.question?.name}» не отвечены за ${QUESTION_ROUNDS} паузы` }
      return put({ question: { ...state.question!, name: `${state.question!.name}-retry${retry}`, retry } })
    }
    if (state.phase === "confirm") {
      // подтверждение словами: «да» → execute; иначе причина → круг plan
      const words = (Array.isArray(event.result) ? event.result : [event.result]).join(" ").trim().toLowerCase()
      if (/^(да|yes|ok|согласен|апрув|approve|подтверждаю)/.test(words)) {
        const solveStart = gitHead(state.cwd)
        return put({ phase: "execute", round: 1, blockers: "", solveStart, question: null })
      }
      return put({ phase: "plan", round: 1, blockers: `оператор не подтвердил план: ${words || "без причины"}`, question: null })
    }
    if (state.phase === "questions") {
      // ответы оператора вписываются В ПЛАН, затем — карточка и подтверждение
      const hc = await head("plan-check")
      const plan = hc.applyAnswers?.(readAt(state.cwd, PLAN), answers) ?? readAt(state.cwd, PLAN)
      mkdirSync(join(state.cwd, ".agent"), { recursive: true })
      writeFileSync(join(state.cwd, PLAN), plan)
      const applied = (plan.match(/→ РЕШЕНО/g) || []).length
      return put({ phase: "confirm", question: null, answers, cardShown: false,
        doneCardNote: `ответы вписаны (${applied})` } as any)
    }
    // причина отклонения с подтверждения → круг плана
    return put({ phase: "plan", round: 1, blockers: `оператор отклонил: ${(event.result || []).join(" ")}`, question: null })
  }

  if (event.do === "checkpoint") {
    if (String(event.result) === "approved") {
      const solveStart = gitHead(state.cwd)
      return put({ phase: "execute", round: 1, blockers: "", solveStart })
    }
    return put({ question: { name: `solo-reject-q${state.round}`, items: ["План отклонён на подтверждении — что изменить? Назови причину, она уйдёт планировщику."], retry: 0 } })
  }

  if (event.do !== "role") return { track: "err" as const, kind: "fold", subject: `solo не знает событие «${event.do}»` }
  const env = event.result || {}
  if (env.track === "err") {
    if (env.kind === "blocked")
      return put({ question: { name: `solo-${state.phase}-q${state.round}`, items: [String(env.subject || "")], retry: 0 } })
    return put({}) // обрыв связи: круг НЕ тратится
  }

  const h = await head(state.phase === "plan" ? "plan" : state.phase === "execute" ? "execute" : "plan-check")
  const res = await h.fold(state, it, env, { PLAN_DRAFT, PLAN, gitHead })
  if (res && res.track === "ok" && res.value && res.value.phase !== state.phase) {
    mark(state.cwd, { phase: res.value.phase, round: res.value.round, blockers: res.value.blockers, solveStart: res.value.solveStart, answers: res.value.answers })
  }
  return res
}

function gitHead(cwd: string): string {
  try { return execSync("git rev-parse HEAD", { cwd, encoding: "utf8" }).trim() } catch { return "" }
}
