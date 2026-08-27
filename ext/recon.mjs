// MODULE_CONTRACT: recon — скан диска: в каком состоянии конвейер и на каком шаге он остановился
// Purpose:    одно решение спрятано здесь: ЧТО СЧИТАТЬ ЗАВЕРШЁННЫМ при перезапуске. Артефакт на
//             диске = шаг закрыт; staging-файл = пласт внутри шага закрыт. Диск — истина, второго
//             состояния нет и не нужно (не рассинхронизируется никогда).
// io:         fs
// EXTERNAL_DEPENDENCY: ext/state.mjs::sha1of — отпечаток для downstream-проверек.
// Invariants: ТОТАЛЕН — любого входа хватает; файл правили после закрытия → sha1 не совпадёт →
//             downstream-шаг сам откажет (task-changed, brd-changed...), recon не решает за него.
// Interface:  recon
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { sha1of } from "./state.mjs"
import { PASSES as INTAKE_PASSES, PASSES_ONE } from "../steps/intake/frd.mjs"

const read = (cwd, rel) => (existsSync(join(cwd, rel)) ? readFileSync(join(cwd, rel), "utf8") : "")
const stamp = (cwd, rel) => {
  const text = read(cwd, rel)
  return text.trim() ? { path: rel, sha1: sha1of(text) } : null
}

// FUNCTION_CONTRACT: recon — состояние конвейера по диску
//   Input:        cwd — каталог прогона
//   Consequent:   success: { at, key, portions } — штампы завершённых шагов, ключ задачи
//                 и порции ТЕКУЩЕГО шага (если staging-файлы говорят, что часть пластов закрыта)
//   Purity:       io (fs)
export function recon(cwd) {
  const at = {}
  let key = ""

  // ШАГ 1: task — ключ из TASK.md
  const task = read(cwd, "TASK.md")
  if (task.trim()) {
    const m = task.match(/^task:\s*(\S+)/m)
    if (m) key = m[1]
    const s = stamp(cwd, "TASK.md")
    if (s) at.task = s
  }

  // ШАГ 2: brd — normalized + brd.md + anchors.json (три артефакта одного шага)
  const normalized = stamp(cwd, ".agent/normalized.md")
  if (normalized) at.normalized = normalized
  const brd = stamp(cwd, ".agent/brd.md")
  if (brd && existsSync(join(cwd, ".agent/anchors.json"))) at.brd = brd

  // ШАГ 3A: scope/plan
  const plan = stamp(cwd, ".agent/survey-plan.json")
  if (plan) at.plan = plan
  const computed = stamp(cwd, ".agent/graph-computed.xml")
  if (computed) at.computed = computed

  // ШАГ 3Б: scope/focus
  const focus = stamp(cwd, ".agent/focus.json")
  if (focus) at.focus = focus

  // ШАГ 3В: scope/parts — каталог непуст
  const partsDir = join(cwd, ".agent/graph-parts")
  if (existsSync(partsDir)) {
    const xmls = readdirSync(partsDir).filter((n) => n.endsWith(".xml"))
    if (xmls.length) {
      const sha = xmls.sort().map((n) => `${n}:${sha1of(read(join(partsDir, n), "utf8"))}`).join("\n")
      at.parts = { path: ".agent/graph-parts", sha1: sha1of(sha) }
    }
  }

  // ШАГ 4: graph
  const appgraph = stamp(cwd, ".agent/appgraph.xml")
  if (appgraph) at.appgraph = appgraph

  // ШАГ 5: intake — frd.xml (все пласты) ИЛИ staging по пластам. T62: пласт B разложен на
  // B1/B2/B3 — список пластов живёт ОДНО место (frd.mjs::PASSES), резюм читает его же.
  // T76: укороченный трек — frd~one.xml без frd.xml значит, что полоса шла ОДНИМ вызовом и
  // умерла ДО продвижения (сбой, пауза, красный без круга). Resume продолжает ТОТ ЖЕ трек:
  // порция one todo, черновик — артефакт круга починки (next понесёт его роли как {PREVIOUS});
  // без этой ветки resume молча начал бы полный путь с scenarios и черновик стал бы мусором.
  const frd = stamp(cwd, ".agent/frd.xml")
  if (frd) {
    at.frd = frd
  } else {
    const one = stamp(cwd, ".agent/staging/frd~one.xml")
    if (one) {
      return {
        at, key,
        portions: PASSES_ONE.map((p) => ({
          id: p,
          staging: `.agent/staging/frd~${p}.xml`,
          status: "todo",
          round: 1,
          blockers: "",
        })),
      }
    }
    const portions = []
    for (const pass of INTAKE_PASSES) {
      const staging = stamp(cwd, `.agent/staging/frd~${pass}.xml`)
      portions.push({
        id: pass,
        staging: `.agent/staging/frd~${pass}.xml`,
        status: staging ? "green" : "todo",
        round: 1,
        blockers: "",
      })
    }
    if (portions.some((p) => p.status === "green")) {
      return { at, key, portions }
    }
  }

  // ШАГ 6: weight
  const mode = stamp(cwd, ".agent/mode")
  if (mode) at.mode = mode

  // ШАГ 7: ripple
  const ripple = stamp(cwd, ".agent/ripple.xml")
  if (ripple) at.ripple = ripple

  // ШАГ 8: plan/values, plan/tree, plan/flows
  const values = stamp(cwd, ".agent/values.xml")
  if (values) at.values = values
  const tree = stamp(cwd, ".agent/tree.xml")
  if (tree) at.tree = tree
  const flows = stamp(cwd, ".agent/flows.xml")
  if (flows) at.flows = flows

  return { at, key, portions: [] }
}
