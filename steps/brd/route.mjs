// MODULE_CONTRACT: route — продвижение BRD: staging → выход, и только после зелёного вердикта
// Purpose:    одно решение: когда требование вправе лечь. io: fs. Тотален.
// Invariants: артефакт НЕ нормализуется и НЕ дополняется — он копируется. Что записала роль, то и
//             ложится: шаг не имеет права «поправить» документ, который принял гардрейл.
// Interface:  promote
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { OUT, STAGED } from "./paths.mjs"

// FUNCTION_CONTRACT: promote — продвинуть требование
//   Antecedent:   вердикт зелен; staging на месте и непуст
//   Consequent:   success: { at }; failure: { why }
//   Purity:       io (fs)
export function promote(state) {
  const from = join(state.cwd, STAGED)
  if (!existsSync(from)) return { why: `${STAGED} не существует — продвигать нечего` }
  writeFileSync(join(state.cwd, OUT), readFileSync(from, "utf8"))
  rmSync(from, { force: true })     // под staging остаётся ровно то, что гардрейл ОТБИЛ
  return { at: OUT }
}
