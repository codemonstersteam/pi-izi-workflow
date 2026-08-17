#!/usr/bin/env node
// MODULE_CONTRACT: install — installs the harness into a project directory by copying, deleting nothing
// Purpose:    one decision is hidden here: WHAT makes up the harness on the project side — four
//             directories (workflows, steps, core, bin) and two .gitignore entries. The extension and
//             the /izi template are installed once per machine via `pi install ./ext` and are not part
//             of this.
// io:         fs
// Invariants: the install deletes NOTHING — neither the target directory nor project files outside
//             the PARTS list; an existing harness file is overwritten, a foreign file is never touched.
//             The target directory must already exist: creating the project is not the installer's job.
// Interface:  PARTS — harness directories; installTo(root) -> {copied, gitignore, task}
//
//   node bin/install.mjs --to=/путь/к/проекту
//
// Before the first install on a machine: cd ext && npm install && pi install ./
// (the extension carries the host functions, the gilb role and the /izi template — they are global,
// not per-project).

import { cpSync, existsSync, mkdirSync, readFileSync, appendFileSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// Directories the run reads by paths relative to cwd: workflows, slices, shared cores and the
// operator's answer channel. The list is declared HERE and only here — a second copy in README
// would drift.
export const PARTS = ["workflows", "steps", "core", "bin"]

const HARNESS = resolve(dirname(fileURLToPath(import.meta.url)), "..")

// FUNCTION_CONTRACT: installTo — lay the harness out into a project directory
//   Antecedent:   root exists and is a directory; does not coincide with the harness's own directory
//   Consequent:   success: every directory from PARTS is copied into root, .agent/ and .izi/ are
//                          declared in .gitignore (run state and part cache — nothing to commit)
//                 failure: throws Error with a diagnosis — no directory, or installing into itself
//   Purity:       io (fs)
//   Interface:    installTo(root: string) -> { copied: string[], gitignore: "added"|"present", task: boolean }
export function installTo(root) {
  const dst = resolve(root)
  if (!existsSync(dst) || !statSync(dst).isDirectory()) throw new Error(`${dst} не существует — каталог проекта создаёт оператор, не установщик`)
  if (dst === HARNESS) throw new Error("установка харнеса в самого себя")

  const copied = []
  for (const part of PARTS) {
    // `-ru.md` NEVER ships. A Russian copy of a role or an order exists for a human to proofread the
    // wording; the pipeline reads the original, and pi would register every stray `.md` of a role
    // directory as a role of its own (pi-extensible-workflows validation.ts, scanRoleFiles). What the
    // run executes goes into the project; what only a reader needs stays in the harness.
    cpSync(join(HARNESS, part), join(dst, part), { recursive: true, filter: (src) => !/-ru\.md$/.test(src) })   // overwrite our own, leave neighboring foreign files alone
    copied.push(part)
  }

  // Two directories, and they differ in nature. `.agent/` is the state of ONE run. `.izi/` is the
  // cache of graph parts that outlives runs (steps/scope/cache.mjs): it speeds up a repeat, but it
  // must not be committed — a part that arrived from someone else's commit answers a question about
  // SOMEONE ELSE'S tree. The guardrail catches this (`reuse` re-checks a part before promoting it),
  // but there is no reason to pay for someone else's garbage in git history.
  const ignore = join(dst, ".gitignore")
  const text = existsSync(ignore) ? readFileSync(ignore, "utf8") : ""
  const missing = [".agent/", ".izi/"].filter((d) => !new RegExp(`^${d.replace(".", "\\.").replace("/", "\\/?")}\\s*$`, "m").test(text))
  if (missing.length) appendFileSync(ignore, `\n# izi harness — состояние прогона и кэш частей\n${missing.join("\n")}\n`)

  return { copied, gitignore: missing.length ? "added" : "present", task: existsSync(join(dst, "TASK.md")) }
}

const arg = process.argv.slice(2).find((a) => a.startsWith("--to=")) || process.argv[2]
if (arg) {
  const root = arg.startsWith("--to=") ? arg.slice(5) : arg
  try {
    const r = installTo(root)
    console.log(`✓ харнес установлен в ${resolve(root)}`)
    console.log(`  каталоги: ${r.copied.join(", ")}`)
    console.log(`  .gitignore: .agent/ и .izi/ ${r.gitignore === "added" ? "дописаны" : "уже были"}`)
    console.log(r.task ? "  TASK.md: на месте" : "  TASK.md: НЕТ — положите требование, это вход конвейера")
    console.log(`\n  запуск:  cd ${resolve(root)} && pi --model anthropic/claude-haiku-4-5   → /izi`)
    if (!existsSync(join(HARNESS, "ext", "node_modules"))) {
      console.log("\n  ВНИМАНИЕ: расширение не установлено на машине — сделайте один раз:")
      console.log(`    cd ${join(HARNESS, "ext")} && npm install && pi install ./`)
    }
  } catch (e) {
    console.error(`✗ ${e.message}`)
    process.exit(1)
  }
} else {
  console.error("usage: node bin/install.mjs --to=<каталог проекта>")
  process.exit(2)
}
