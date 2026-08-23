// MODULE_CONTRACT: route — продвижение таблицы действий: staging → выход, и только после зелёного
// Purpose:    одно решение: когда таблица вправе лечь. io: fs. Тотален.
// Invariants: артефакт НЕ нормализуется и НЕ дополняется — он копируется. Что записала роль, то и
//             ложится: подшаг не имеет права «поправить» документ, который принял гардрейл.
// Interface:  promote
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { NORMALIZED, STAGED_NORMALIZED } from "../paths.mjs"

// FUNCTION_CONTRACT: promote — продвинуть таблицу действий
//   Input:        state — состояние прогона (нужен cwd)
//   Dependencies: —
//   Antecedent:   вердикт зелен; staging на месте
//   Consequent:   success: { at }; failure: { why }
//   Purity:       io (fs)
export function promote(state) {
  const from = join(state.cwd, STAGED_NORMALIZED)
  if (!existsSync(from)) return { why: `${STAGED_NORMALIZED} не существует — продвигать нечего` }
  writeFileSync(join(state.cwd, NORMALIZED), readFileSync(from, "utf8"))
  rmSync(from, { force: true })     // под staging остаётся ровно то, что гардрейл ОТБИЛ
  return { at: NORMALIZED }
}
