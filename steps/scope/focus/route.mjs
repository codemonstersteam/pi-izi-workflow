// MODULE_CONTRACT: route — куда что ложится: фокус → артефакт подшага
// Purpose:    ЕДИНСТВЕННОЕ место подшага, пишущее артефакт, и только после зелёного вердикта (шов 5).
// io:         fs
// Invariants: ТОТАЛЕН — диск отвечает { why }.
// Interface: promote
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { sha1of } from "../../../ext/state.mjs"
import { FOCUS } from "../paths.mjs"

// FUNCTION_CONTRACT: promote — положить фокус
//   Consequent:   success: { path, sha1 }; failure: { why }
//   Purity:       io (fs)
export function promote(state, focusJson) {
  try {
    const abs = join(state.cwd, FOCUS)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, focusJson)
    return { path: FOCUS, sha1: sha1of(focusJson) }
  } catch (e) {
    return { why: `${FOCUS} не записан: ${e.message}` }
  }
}
