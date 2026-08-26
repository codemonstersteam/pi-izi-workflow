// MODULE_CONTRACT: route — куда что ложится: план и факт скрипта → артефакты подшага
// Purpose:    ЕДИНСТВЕННОЕ место подшага, пишущее артефакты, и только после зелёного вердикта
//             (CLAUDE.md, ограничение 2; шов 5). Скрипт собрал — скрипт и положил: роли у подшага нет.
// io:         fs
// Invariants: ТОТАЛЕН — диск отвечает { why }, а не исключением.
// Interface: promote
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { sha1of } from "../../../ext/state.mjs"
import { PLAN, COMPUTED } from "../paths.mjs"

// FUNCTION_CONTRACT: promote — положить план и computed-факт
//   Input:        state (cwd); planJson, xml — что собрал cut и суд принял ЗЕЛЁНЫМ
//   Consequent:   success: { plan: { path, sha1 }, computed: { path, sha1 } }
//                 failure: { why } — диск не дал записать
//   Purity:       io (fs)
export function promote(state, planJson, xml) {
  try {
    const at = (rel, text) => {
      const abs = join(state.cwd, rel)
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, text)
      return { path: rel, sha1: sha1of(text) }
    }
    return { plan: at(PLAN, planJson), computed: at(COMPUTED, xml) }
  } catch (e) {
    return { why: `артефакты подшага не записаны: ${e.message}` }
  }
}
