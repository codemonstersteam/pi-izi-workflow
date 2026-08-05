#!/usr/bin/env node
// MODULE_CONTRACT: steps.mjs — the pipeline manifest: steps/*/step.json merged, filtered by
//               pipeline.json's order, and linted for integrity
// Purpose:      one decision — the workflow script (workflows/izi.js) knows NOTHING about step
//               names or their staging/out/check paths; that knowledge lives in each step's own
//               steps/<id>/step.json (docs/workflow.md §1, правка 2), and this file is the ONE
//               place that collects it into a single object. A step absent from pipeline.json's
//               `order` does not exist for the pipeline — this is a LINT, not a convention: it is
//               simply never read from disk at all, so it cannot leak into the manifest by accident.
// io:           fs
// Invariants:   readManifest never returns a manifest containing an id outside `order`; every id
//               IN `order` either appears in the returned manifest or the whole call fails —
//               a partial manifest (some ids present, others silently missing) is not a
//               representable outcome
// Interface:    lintManifest({ order, entries }) -> Result<Object<id, step.json>, Error>
//               readManifest({ root }) -> Result<Object<id, step.json>, Error>
//
//   node bin/steps.mjs [--json] [--root=<путь>]
//
// Упраздняет bin/steps-map.mjs: staging/out там жили ОДНОЙ картой на все шаги, литералом в этом
// файле — теперь это поле каждого шага в его собственном step.json, а не второй экземпляр той же
// информации, который однажды разойдётся с первым (standards/code.md, «одно требование — одно
// место»).

import { readFileSync, existsSync } from "node:fs"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { ok, err } from "../core/result.mjs"
import { isMain } from "./cli-entry.mjs"

// FUNCTION_CONTRACT: lintManifest — integrity of the merged manifest, order-filtered
//   Input:        raw — { order: string[], entries: Object<id, { hasDir: boolean, stepJson: object|null }> }
//   Dependencies: —
//   Antecedent:   order is an array of non-empty strings; entries carries exactly one key per id
//                 in order (a probe result, not data the caller invents)
//   Consequent:   success: manifest — Object<id, step.json content>, exactly the ids in order, each
//                          entry passing every integrity rule below
//                 failure: "manifest-invalid" — EVERY violation found, joined by "; " — never just
//                          the first, so a run fixing one defect at a time does not pay a second
//                          lint round to discover the next (same reasoning as steps/brd/brd.mjs's
//                          newBrd: «все блокеры отдаются разом»). Rules: a step in `order` without a
//                          directory; a directory without a parseable step.json; a role step
//                          (kind==="role") without `role` or without `staging`; any step without
//                          `receipt`
export function lintManifest({ order, entries }) {
  const problems = []
  const manifest = {}
  for (const id of order) {
    const entry = entries[id]
    if (!entry || !entry.hasDir) {
      problems.push(`«${id}»: steps/${id}/ не существует — шаг объявлен в pipeline.order, каталога нет`)
      continue
    }
    if (!entry.stepJson) {
      problems.push(`«${id}»: steps/${id}/step.json отсутствует или не парсится как JSON`)
      continue
    }
    const s = entry.stepJson
    if (!s.receipt) {
      problems.push(`«${id}»: step.json не несёт receipt — шаг не закроется квитанцией никогда`)
    }
    if (s.kind === "role") {
      if (!s.role) problems.push(`«${id}»: kind=role без поля role — некого установить и некем делегировать`)
      if (!s.staging) problems.push(`«${id}»: kind=role без staging — роли писать некуда, кроме своего out`)
    }
    manifest[id] = s
  }
  if (problems.length) return err("manifest-invalid", problems.join("; "))
  return ok(manifest)
}

// FUNCTION_CONTRACT: readManifest — lintManifest, fed from THIS repository's own disk
//   Input:        raw — { root: absolute path to a repository carrying pipeline.json and steps/ }
//   Dependencies: fs (existsSync/readFileSync)
//   Antecedent:   root is a non-empty string
//   Consequent:   success: see lintManifest
//                 failure: "no-pipeline" — <root>/pipeline.json absent; "bad-pipeline" — present but
//                          not parseable JSON; else see lintManifest
export function readManifest({ root }) {
  const pipelinePath = join(root, "pipeline.json")
  if (!existsSync(pipelinePath)) return err("no-pipeline", `${pipelinePath} не существует`)
  let pipeline
  try { pipeline = JSON.parse(readFileSync(pipelinePath, "utf8")) }
  catch (e) { return err("bad-pipeline", `${pipelinePath} не парсится как JSON: ${e.message}`) }

  const order = Array.isArray(pipeline.order) ? pipeline.order : []
  const entries = {}
  for (const id of order) {
    const dir = join(root, "steps", id)
    const hasDir = existsSync(dir)
    let stepJson = null
    if (hasDir) {
      const sjPath = join(dir, "step.json")
      if (existsSync(sjPath)) {
        try { stepJson = JSON.parse(readFileSync(sjPath, "utf8")) }
        catch { stepJson = null }
      }
    }
    entries[id] = { hasDir, stepJson }
  }
  return lintManifest({ order, entries })
}

function main() {
  const args = process.argv.slice(2)
  const opt = (n) => { const h = args.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : "" }
  const root = opt("root") || resolve(dirname(fileURLToPath(import.meta.url)), "..")
  const r = readManifest({ root })
  if (!r.ok) { console.error(`✗ [${r.error.cls}] ${r.error.detail}`); process.exit(1) }
  console.log(JSON.stringify(r.value))
}

if (isMain(import.meta.url)) main()
