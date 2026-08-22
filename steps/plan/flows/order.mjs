// MODULE_CONTRACT: order — НАРЯД шага 9C: слоты и текст, первый заход и починка
// Purpose:    одно решение: что порция видит и чего не видит. Требование и дерево едут СУЖЕННЫМИ до
//             этого use case — целиком они давали 98 805 и 112 441 символ на семь нарядов.
// io:         fs (шаблоны читаются module-relative — они часть модуля)
// EXTERNAL_DEPENDENCY: order-flow.tpl и order-flow.fix.tpl рядом с этим файлом;
//             steps/plan/repair.mjs::repairTask — наряд починки из вердикта.
// Invariants: ТОТАЛЕН. Слот без данных — ОТКАЗ, а не пустота.
// Interface:  SLOTS, FIX_SLOTS, orderText
import { readFileSync } from "node:fs"
import { treeFor } from "./flows.mjs"
import { frdFor } from "../tree/tree.mjs"
import { repairTask } from "../repair.mjs"
import { readAt, frdOf } from "./cut.mjs"
import { FRD, TREE, VALUES, seedAt, portionAt } from "./paths.mjs"

export const SLOTS = Object.freeze(["SKELETON", "UC", "TREE", "FRD", "VALUES", "PREVIOUS", "FEEDBACK", "STAGING", "CHECK"])
export const FIX_SLOTS = Object.freeze(["TASKLIST", "COUNT", "UC", "TREE", "FRD", "VALUES", "PREVIOUS", "STAGING", "CHECK"])

// FUNCTION_CONTRACT: orderText — наряд одной порции
//   Input:        state; uc; { previous, feedback, fix }
//   Consequent:   success: { text, staging, fix }; failure: { why } при незаполненном слоте
//   Purity:       io (fs)
export function orderText(state, uc, { previous = "", feedback = "", fix = false } = {}) {
  const frd = frdOf(state)
  const common = {
    UC: uc,
    TREE: treeFor({ tree: readAt(state.cwd, TREE), frd, uc }),
    FRD: frdFor({ xml: readAt(state.cwd, FRD), uc }),
    VALUES: readAt(state.cwd, VALUES),
    PREVIOUS: previous || "(первый заход)",
    STAGING: portionAt(uc),
    CHECK: `flows({path, uc:"${uc}"}) — все шаги и ветвления ЭТОГО use case закрыты, модуль назван деревом, роль шага из словаря`,
  }
  const slots = fix
    ? (() => { const t = repairTask(feedback); return { ...common, TASKLIST: t.lines.join("\n"), COUNT: String(t.count) } })()
    : { ...common, SKELETON: readAt(state.cwd, seedAt(uc)), FEEDBACK: feedback || "(замечаний нет)" }

  const tpl = readFileSync(new URL(fix ? "./order-flow.fix.tpl" : "./order-flow.tpl", import.meta.url), "utf8")
  let text = tpl
  for (const [k, v] of Object.entries(slots)) text = text.split(`{${k}}`).join(v)
  const left = [...text.matchAll(/\{([A-Z_]+)\}/g)].map((m) => m[1])
  if (left.length) return { why: `в наряде потока ${uc} остались незаполненные слоты: ${[...new Set(left)].join(", ")} — данные не доехали, и роль будет выдумывать` }
  return { text, staging: portionAt(uc), fix }
}
