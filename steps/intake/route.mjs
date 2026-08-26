// MODULE_CONTRACT: route — куда что ложится: FRD → артефакт шага
// Purpose:    ЕДИНСТВЕННОЕ место шага, пишущее артефакт, и только после зелёного вердикта всех
//             четырёх пластов (шов 5). Пласты ДОПИСЫВАЮТСЯ в один документ: staging каждого
//             пласта — предыдущий staging + новый слой; артефакт — после D.
// io:         fs
// Invariants: ТОТАЛЕН — диск отвечает { why }.
// Interface: promote
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { sha1of } from "../../ext/state.mjs"

const FRD = ".agent/frd.xml"

// FUNCTION_CONTRACT: promote — положить FRD после зелёного D
//   Consequent:   success: { path, sha1 }; failure: { why }
//   Purity:       io (fs)
export function promote(state, xml) {
  try {
    const abs = join(state.cwd, FRD)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, xml)
    return { path: FRD, sha1: sha1of(xml) }
  } catch (e) {
    return { why: `${FRD} не записан: ${e.message}` }
  }
}
