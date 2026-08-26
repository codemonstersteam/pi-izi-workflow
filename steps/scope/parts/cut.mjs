// MODULE_CONTRACT: cut — io-труба подшага 3В: клетка плана → digest-строки наряда
// Purpose:    одно решение: что читается с диска ради наряда скаута. Digest — pure
//             (steps/scope/digest.mjs); здесь — чтение файлов клетки и передача computed-факта.
// io:         fs
// EXTERNAL_DEPENDENCY: steps/scope/{source,digest,computed}.mjs; steps/scope/paths.mjs.
// Invariants: ТОТАЛЕН — диск отвечает { why }; порядок файлов — как в плане, наряд обязан
//             перечислять клетку ЦЕЛИКОМ (part.mjs, правила S1/S2 судят по этому списку).
// Interface: cellsOf, digestOf, subjectsLines
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { readSource } from "../source.mjs"
import { newDigest } from "../digest.mjs"
import { parseComputed } from "../computed.mjs"
import { COMPUTED, PLAN } from "../paths.mjs"

// FUNCTION_CONTRACT: cellsOf — клетки плана по идентификаторам фокуса
//   Consequent:   success: [{ id, kind, files }] — в порядке фокуса; failure: { why }
//   Purity:       io (fs)
export function cellsOf(state, ids) {
  const plan = JSON.parse(readFileSync(join(state.cwd, PLAN), "utf8"))
  const byId = new Map((plan.cells || []).map((c) => [c.id, c]))
  return ids.map((id) => byId.get(id) || { id, kind: "survey", files: [] })
}

// FUNCTION_CONTRACT: digestOf — digest-строки наряда для ОДНОЙ клетки
//   Consequent:   success: string — digest целиком, строка на файл, как требует order.*.tpl
//   Purity:       io (fs)
export function digestOf(state, cell) {
  const computed = parseComputed(readFileSync(join(state.cwd, COMPUTED), "utf8"))
  const files = []
  for (const f of cell.files || []) {
    let text = ""
    try { text = readFileSync(join(state.cwd, f.path), "utf8") } catch { text = "" }
    files.push({ path: f.path, bytes: f.bytes, source: readSource({ path: f.path, text }) })
  }
  return newDigest({ files, computed })
}

// FUNCTION_CONTRACT: subjectsLines — якоря, задевшие клетку, строками для блока {SUBJECTS}
//   Consequent:   success: string[] — строка на помеченный файл; пусто → строка «ни один якорь…»
//   Purity:       pure
export function subjectsLines(cell) {
  const hit = (cell.files || []).filter((f) => (f.subjects || []).length)
  if (!hit.length) return ["no BRD anchor hit any file of this cell — the survey still maps every file"]
  return hit.map((f) => `- ${f.path} — ${f.subjects.join(", ")}`)
}
