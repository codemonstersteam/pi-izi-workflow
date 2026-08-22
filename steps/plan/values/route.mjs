// MODULE_CONTRACT: route — продвижение словаря: staging → выход, и только после зелёного вердикта
// Purpose:    одно решение: когда словарь вправе лечь. io: fs. Тотален.
// EXTERNAL_DEPENDENCY: values.mjs::normalize — единственная нормализация грамматики словаря.
// Interface:  promote
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { normalize } from "./values.mjs"
import { OUT, STAGED } from "./paths.mjs"

// FUNCTION_CONTRACT: promote — продвинуть словарь
//   Antecedent:   вердикт зелен; staging на месте
//   Consequent:   success: { at }; failure: { why }
//   Purity:       io (fs)
export function promote(state) {
  const from = join(state.cwd, STAGED)
  if (!existsSync(from)) return { why: `${STAGED} не существует — продвигать нечего` }
  writeFileSync(join(state.cwd, OUT), normalize(readFileSync(from, "utf8")))
  rmSync(from, { force: true })          // остаётся под staging ровно то, что гардрейл ОТБИЛ
  return { at: OUT }
}
