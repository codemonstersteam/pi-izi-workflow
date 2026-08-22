// MODULE_CONTRACT: route — склейка потоков, адресат починки и продвижение
// Purpose:    одно решение: что делать с вердиктом порции и целого. io: fs. Тотален.
// EXTERNAL_DEPENDENCY: paths.mjs. Артефакт продвигается ТОЛЬКО после зелёного вердикта ЦЕЛОГО.
// Interface:  join, addressees, promote
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join as pjoin } from "node:path"
import { readAt } from "./cut.mjs"
import { OUT, STAGED } from "./paths.mjs"

// FUNCTION_CONTRACT: join — склейка порций в один документ потоков
//   Antecedent:   каждая порция написана; пропущенная — ОТКАЗ С ЕЁ USE CASE
//   Consequent:   success: { at, flows }; failure: { why }
//   Purity:       io (fs)
export function join(state, portions) {
  const blocks = []
  for (const p of portions) {
    const text = readAt(state.cwd, p.staging)
    if (!text.trim()) return { why: `поток use case ${p.id} не написан: ${p.staging} пуст — склеивать нечего` }
    blocks.push(...[...text.matchAll(/ {2}<flow[\s\S]*?<\/flow>/g)].map((m) => m[0]))
  }
  mkdirSync(pjoin(state.cwd, ".agent", "staging"), { recursive: true })
  writeFileSync(pjoin(state.cwd, STAGED), `<flows task="">\n${blocks.join("\n")}\n</flows>\n`)
  return { at: STAGED, flows: blocks.length }
}

// FUNCTION_CONTRACT: addressees — КОМУ уходит наряд починки при красном ЦЕЛОМ
//   Consequent:   success: use case, чьи потоки блокер называет; блокер их не называет — ВСЕ
//   Purity:       pure
//   BUG_FIX_CONTEXT: незнакомая находка едет дороже — это цена, а не дефект. Наряд, ушедший НИКОМУ,
//                 крутит шаг до исчерпания бюджета, ничего не починив.
export function addressees(blockers, portions) {
  const said = String(blockers || "")
  const hit = portions.filter((p) => new RegExp(`\\b${p.id}\\b`).test(said)).map((p) => p.id)
  return hit.length ? hit : portions.map((p) => p.id)
}

// FUNCTION_CONTRACT: promote — staging → выход, и только теперь
//   Purity:       io (fs)
export function promote(state) {
  const from = pjoin(state.cwd, STAGED)
  if (!existsSync(from)) return { why: `${STAGED} не существует — продвигать нечего` }
  const text = readFileSync(from, "utf8")
  writeFileSync(pjoin(state.cwd, OUT), text.endsWith("\n") ? text : `${text}\n`)
  return { at: OUT }
}
