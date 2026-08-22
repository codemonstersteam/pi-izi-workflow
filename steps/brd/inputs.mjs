// MODULE_CONTRACT: inputs — СУД ВХОДА шага 2
// Purpose:    одно решение: есть ли из чего делать требование и то ли это, что принял шаг 1.
// io:         fs
// EXTERNAL_DEPENDENCY: ext/state.mjs::sha1of — тот же отпечаток, который считает close.
// Invariants: ТОТАЛЕН. Отказ несёт КЛАСС и текст.
// Interface:  CLASSES, inputs
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { sha1of } from "../../ext/state.mjs"
import { TASK } from "./paths.mjs"

export const CLASSES = Object.freeze(["no-task", "task-changed", "no-key"])

// FUNCTION_CONTRACT: inputs — годен ли вход шага 2
//   Consequent:   success: null; failure: { cls, why }
//   Purity:       io (fs)
//   BUG_FIX_CONTEXT: «шаг 1 закрыт» само по себе не доказывает НИЧЕГО о содержимом TASK.md: между
//                 прогонами его правят руками, и требование строилось бы по документу, которого
//                 больше нет. Поэтому здесь сверяется отпечаток, а не отметка о закрытии.
export function inputs(state) {
  const abs = join(state.cwd, TASK)
  if (!existsSync(abs)) return { cls: "no-task", why: `${TASK} не существует — вход конвейера кладёт оператор` }
  if (!state.key) return { cls: "no-key", why: "ключа задачи нет в состоянии — шаг task не закрыт, а им зовутся ветка, тикет и каталог плана" }
  const known = state.at && state.at.task
  if (known && known.sha1 !== sha1of(readFileSync(abs, "utf8"))) {
    return { cls: "task-changed", why: `${TASK} изменился после того, как его принял шаг task — требование нельзя строить по документу, которого больше нет: переиграй task` }
  }
  return null
}
