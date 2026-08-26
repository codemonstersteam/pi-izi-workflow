// MODULE_CONTRACT: cut — СКОЛЬКО ПОРЦИЙ и что в каждой, скриптом и за 0 токенов
// Purpose:    одно решение спрятано здесь: как работа шага 9B режется на вызовы роли. Состав
//             считается из ТРЕБОВАНИЯ, а не назначается человеком.
// io:         fs
// EXTERNAL_DEPENDENCY: steps/plan/tree/tree.mjs — treeSkeleton, modulesOfChange; steps/intake/frd.mjs
//             — parseFrd. Скелет кладётся на диск: наряд порции берёт из него СВОИ блоки.
// Invariants: ТОТАЛЕН. Порции ПОСЛЕДОВАТЕЛЬНЫ: каждая читает, что решили соседи, поэтому роем не
//             отправляются никогда (в отличие от 9C, где порции независимы).
// Interface:  cut
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parseFrd } from "../../intake/frd.mjs"
import { treeSkeleton, modulesOfChange } from "./tree.mjs"
import { FRD, RIPPLE, GRAPH, WORK, CAP, skeletonAt, portionAt } from "./paths.mjs"

const readAt = (cwd, rel) => (existsSync(join(cwd, rel)) ? readFileSync(join(cwd, rel), "utf8") : "")

// FUNCTION_CONTRACT: cut — состав работы шага
//   Input:        state — состояние конвейера (нужен только cwd)
//   Dependencies: parseFrd, treeSkeleton, modulesOfChange
//   Antecedent:   вход уже осуждён `inputs` — здесь он предполагается годным
//   Consequent:   success: { modules, portions: [{id, staging, status, round}], line }
//                          и скелет каждой порции лежит на диске
//                 failure: { why } — вердикт, не бросок
//   Purity:       io (fs)
//   BUG_FIX_CONTEXT: наряд на все 12 модулей — 63 735 символов и 5-9 минут с обрывами; четыре
//                 модуля на порцию держатся устойчиво. Число живёт в paths.mjs::CAP, а не здесь.
export function cut(state) {
  const frd = parseFrd(readAt(state.cwd, FRD))
  const all = [...modulesOfChange({ frd }).keys()]
  if (!all.length) return { why: `${FRD} не называет ни одного модуля изменения — резать нечего` }

  const sk = treeSkeleton({ frd, ripple: readAt(state.cwd, RIPPLE), map: readAt(state.cwd, GRAPH) })
  mkdirSync(join(state.cwd, WORK), { recursive: true })
  mkdirSync(join(state.cwd, ".agent", "staging"), { recursive: true })
  writeFileSync(join(state.cwd, skeletonAt()), sk.xml)

  const head = sk.xml.slice(0, sk.xml.indexOf(">") + 1)
  const blocks = [...sk.xml.matchAll(/ {2}<module[\s\S]*?<\/module>/g)].map((m) => m[0])
  const count = Math.max(1, Math.ceil(all.length / CAP))
  const portions = []
  for (let n = 1; n <= count; n++) {
    const mine = all.slice((n - 1) * CAP, n * CAP)
    const part = blocks.filter((b) => mine.some((q) => b.includes(`path="${q}"`)))
    writeFileSync(join(state.cwd, `${WORK}/tree~${n}.xml`), `${head}\n${part.join("\n")}\n</tree>\n`)
    portions.push({ id: String(n), staging: portionAt(n), status: "todo", round: 1, blockers: "" })
  }
  return { modules: sk.modules, portions, line: `tree: модулей ${sk.modules}, порций ${count} — скелет посчитан скриптом, 0 токенов` }
}

// FUNCTION_CONTRACT: mineOf — какие модули решает эта порция
//   Antecedent:   id — идентификатор порции («1», «2», …)
//   Consequent:   success: пути модулей порции; неизвестная порция — []
//   Purity:       io (fs)
//   Interface:    mineOf(state, id) -> string[]
export function mineOf(state, id) {
  const frd = parseFrd(readAt(state.cwd, FRD))
  const all = [...modulesOfChange({ frd }).keys()]
  const n = Number(id)
  return Number.isInteger(n) && n > 0 ? all.slice((n - 1) * CAP, n * CAP) : []
}

// FUNCTION_CONTRACT: familyOf — все модули работы; kinOf — пути, известные репозиторию
//   Purity:       io (fs)
export function familyOf(state) {
  const frd = parseFrd(readAt(state.cwd, FRD))
  return [...modulesOfChange({ frd }).keys()]
}
export const knownOf = (state) =>
  [...String(readAt(state.cwd, GRAPH)).matchAll(/<module\b[^>]*\bpath="([^"]+)"/g)].map((m) => m[1])
export const frdOf = (state) => parseFrd(readAt(state.cwd, FRD))
// FUNCTION_CONTRACT: seedsOf — множество seed-модулей из ripple.xml (существующие файлы изменения)
//   Antecedent:   ripple.xml может отсутствовать или быть пустым — тогда множество пусто и T6 молчит
//   Consequent:   success: Set<путь> — теги <module path="…" seed="yes"> в любом порядке атрибутов
//   Purity:       io (fs)
export const seedsOf = (state) =>
  new Set([...String(readAt(state.cwd, RIPPLE)).matchAll(/<module\b([^>]*)>/g)]
    .filter((m) => /\bseed="yes"/.test(m[1]))
    .map((m) => (m[1].match(/\bpath="([^"]+)"/) || [])[1]).filter(Boolean))
export { readAt }
