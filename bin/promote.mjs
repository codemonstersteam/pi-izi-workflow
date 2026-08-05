#!/usr/bin/env node
// MODULE_CONTRACT: promote.mjs — staging→out, and only then the receipt
// Purpose:      one decision — the order staging→out→receipt never reverses
//               (standards/protocol.md, «Квитанция закрывает шаг»: writing the receipt first and
//               having the copy fail would leave "receipt exists, artifact doesn't" — a confidently
//               wrong fact about the run that nothing downstream can tell apart from a real close).
//               A step with no staging file is a refusal, not a silent success: the check that
//               gated this promote ran against staging, and a missing file means it never ran.
// io:           fs
// Invariants:   promoteStep never calls writeReceipt unless the staging file was copied to `out`
//               first, in the same call; the staging path and out path for a step come from the
//               MANIFEST (bin/steps.mjs, reading steps/<id>/step.json) — no literal path lives in
//               this file. The manifest is read from THIS REPOSITORY's own root (this file's own
//               parent directory), independently of `root` — `root` names the RUN's state
//               (.agent/staging, .agent/receipts, out), the repository's step declarations are a
//               separate, fixed concern (bin/install.mjs draws the same distinction between
//               repoRoot and the installed agent dir)
// Interface:    promoteStep({ root, step }) -> Result<{ path: string }, Error>
//
//   node bin/promote.mjs --step=<id> [--root=<путь>]
//
// Отсутствие staging-файла — отказ (exit 1) с диагнозом, а не тихий успех.

import { copyFileSync, existsSync, mkdirSync } from "node:fs"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { readManifest } from "./steps.mjs"
import { writeReceipt } from "./receipt.mjs"
import { isMain } from "./cli-entry.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

// FUNCTION_CONTRACT: promoteStep — copies staging→out, then writes the receipt, in that order
//   Input:        raw — { root: absolute run root, step: non-empty step id string }
//   Dependencies: fs (existsSync/copyFileSync/mkdirSync), readManifest (bin/steps.mjs), writeReceipt
//   Antecedent:   step names an entry in the manifest carrying a `staging` field; the staging file
//                 exists on disk under root at the moment of the call — the check that gates this
//                 promote already ran against it
//   Consequent:   success: `{ ok: true, value: { path } }` — out written, receipt closed
//                 failure: `{ ok: false, error }` —
//                          "manifest-invalid": the manifest itself failed to build (pipeline.json /
//                                        steps/*/step.json broken — bin/steps.mjs's own lint)
//                          "unknown-step": step is not declared in the manifest
//                          "no-staging": the step is declared but carries no `staging` (task: the
//                                        operator places `out` directly, there is nothing to promote)
//                          "staging-missing": `staging` is declared but the file is absent on disk —
//                                        the check this promote depends on never ran against it
export function promoteStep({ root, step }) {
  const manifest = readManifest({ root: REPO_ROOT })
  if (!manifest.ok) return { ok: false, error: { cls: "manifest-invalid", detail: manifest.error.detail } }
  const decl = manifest.value[step]
  if (!decl) return { ok: false, error: { cls: "unknown-step", detail: `шаг «${step}» не объявлен в манифесте` } }
  if (!decl.staging) return { ok: false, error: { cls: "no-staging", detail: `шаг «${step}» не несёт staging — промоутить нечего` } }
  const stagingPath = join(root, decl.staging)
  const outPath = join(root, Object.values(decl.out)[0])
  if (!existsSync(stagingPath)) {
    return { ok: false, error: { cls: "staging-missing", detail: `${stagingPath} не существует — чек, который должен был пройти по этому пути, не исполнялся` } }
  }
  mkdirSync(dirname(outPath), { recursive: true })
  copyFileSync(stagingPath, outPath)
  writeReceipt({ root, step })
  return { ok: true, value: { path: outPath } }
}

function main() {
  const args = process.argv.slice(2)
  const opt = (n) => { const h = args.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : "" }
  const root = opt("root") || process.cwd()
  const step = opt("step")
  if (!step) { console.error("usage: promote.mjs --step=<id> [--root=<путь>]"); process.exit(2) }
  const r = promoteStep({ root, step })
  if (!r.ok) { console.error(`✗ [${r.error.cls}] ${r.error.detail}`); process.exit(1) }
  console.log(`✓ ${r.value.path}: промоут, квитанция «${step}» записана`)
}

if (isMain(import.meta.url)) main()
