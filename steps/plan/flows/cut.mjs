// MODULE_CONTRACT: cut — состав работы шага 9C: ПОРЦИЯ = ОДИН USE CASE
// Purpose:    одно решение: как работа режется на вызовы роли. Единица здесь СМЫСЛОВАЯ, а не
//             счётная: резать use case пополам значит рвать сценарий посередине.
// io:         fs
// EXTERNAL_DEPENDENCY: steps/intake/frd.mjs::parseFrd — тот же читатель требования, что у всех.
// Invariants: ТОТАЛЕН. Порции НЕЗАВИСИМЫ — отсюда рой, а не череда вызовов.
// Interface:  cut, ucsOf, frdOf, readAt
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parseFrd } from "../../intake/frd.mjs"
import { flowsSkeleton } from "./flows.mjs"
import { FRD, WORK, skeletonAt, seedAt, portionAt } from "./paths.mjs"

export const readAt = (cwd, rel) => (existsSync(join(cwd, rel)) ? readFileSync(join(cwd, rel), "utf8") : "")
export const frdOf = (state) => parseFrd(readAt(state.cwd, FRD))
export const ucsOf = (state) => (frdOf(state).usecases || []).map((u) => u.id)

// FUNCTION_CONTRACT: cut — состав работы шага
//   Consequent:   success: { flows, steps, portions, line } и скелет каждого use case на диске
//                 failure: { why } — вердикт, не бросок
//   Purity:       io (fs)
export function cut(state) {
  const frd = frdOf(state)
  const ucs = (frd.usecases || []).map((u) => u.id)
  if (!ucs.length) return { why: `${FRD} не называет ни одного use case — потоки рисовать не для чего` }

  const sk = flowsSkeleton({ frd })
  mkdirSync(join(state.cwd, WORK), { recursive: true })
  mkdirSync(join(state.cwd, ".agent", "staging"), { recursive: true })
  writeFileSync(join(state.cwd, skeletonAt()), sk.xml)

  const portions = []
  for (const id of ucs) {
    const own = [...sk.xml.matchAll(/ {2}<flow[\s\S]*?<\/flow>/g)].map((m) => m[0]).filter((b) => b.includes(`uc="${id}"`))
    writeFileSync(join(state.cwd, seedAt(id)), `<flows task="">\n${own.join("\n")}\n</flows>\n`)
    portions.push({ id, staging: portionAt(id), status: "todo", round: 1, blockers: "" })
  }
  return { flows: sk.flows, steps: sk.steps, portions, line: `flows: потоков ${sk.flows}, шагов ${sk.steps}, порций ${ucs.length} — скелет посчитан скриптом, 0 токенов` }
}
