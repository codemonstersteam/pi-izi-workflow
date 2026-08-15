// Unit for bin/install.mjs — the one rule the installer keeps beyond copying: what the RUN executes
// goes into the project, what only a human reads stays in the harness.
//
// A `-ru.md` beside a role is a Russian copy for proofreading. It must not ship, and the reason is not
// tidiness: pi registers EVERY `.md` of a role directory as a role of its own
// (pi-extensible-workflows/packages/core/src/validation.ts, scanRoleFiles), so a translation shipped
// into a form would enter that form's role registry — and one malformed frontmatter among them kills
// the whole run at metadata validation, before a single token is spent.
//
// The installer is SPAWNED, not imported: its module body is the CLI (it exits 2 without `--to=`), and
// running it the way the operator runs it is the honest test of the thing that ships.
//
// The seam: drop the `filter` from cpSync in installTo and the third assertion goes red.

import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const HARNESS = resolve(dirname(fileURLToPath(import.meta.url)), "..")

test("установка везёт исполняемое и НЕ везёт перевод для человека", () => {
  const planted = join(HARNESS, "steps", "design", "valuer-ru.md")
  const mine = !existsSync(planted)
  if (mine) writeFileSync(planted, "Перевод для вычитки — временный файл теста.\n")

  const dst = mkdtempSync(join(tmpdir(), "izi-install-"))
  writeFileSync(join(dst, "TASK.md"), "требование\n")
  writeFileSync(join(dst, ".gitignore"), ".agent/\n.izi/\n")

  try {
    execFileSync(process.execPath, [join(HARNESS, "bin", "install.mjs"), `--to=${dst}`], { stdio: "ignore" })

    assert.equal(existsSync(join(dst, "steps", "design", "valuer.md")), true, "роль едет в проект")
    assert.equal(existsSync(join(dst, "workflows", "izi.js")), true, "программа едет в проект")
    assert.equal(existsSync(join(dst, "steps", "design", "valuer-ru.md")), false, "перевод остаётся в харнесе")
  } finally {
    rmSync(dst, { recursive: true, force: true })
    if (mine) rmSync(planted, { force: true })
  }
})
