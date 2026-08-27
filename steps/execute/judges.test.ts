// Units of the solve judges: a/b/c on a REAL throwaway git repo.
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { execSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { judgeSolve, doneCard } from "./judges.ts"

const PLAN = `# П

## 2. ИЗМЕНЕНИЯ
| № | Файл | A/C | Контракт | Тр |
|---|---|---|---|---|
| Ф1 | src/App.java | Changed | новый метод | Т1 |
| Ф2 | src/extra/Util.java | Added | новый модуль. Образец: src/App.java | Т1 |

## 5. ГАРАНТИИ
1. Не трогаем \`src/Legacy.java\`.
`

const stand = () => {
  const cwd = mkdtempSync(join(tmpdir(), "solo-exec-"))
  const g = (cmd: string) => execSync(cmd, { cwd, encoding: "utf8" })
  g("git init -q")
  mkdirSync(join(cwd, "src/extra"), { recursive: true })
  writeFileSync(join(cwd, "src/App.java"), "class App {}\n")
  writeFileSync(join(cwd, "src/Legacy.java"), "class Legacy {}\n")
  writeFileSync(join(cwd, "src/AppTest.java"), "class AppTest { void t1() {} void t2() {} }\n")
  g("git add -A && git commit -q -m base")
  return { cwd, head: g("git rev-parse HEAD").trim() }
}

test("(a)(b)(c) зелёный: Ф↔коммиты, тесты расширены, гарантии целы", () => {
  const { cwd, head } = stand()
  try {
    const c = (cmd: string) => execSync(cmd, { cwd, encoding: "utf8" })
    writeFileSync(join(cwd, "src/App.java"), "class App { void search() {} }\n")
    c("git add -A && git commit -q -m 'Ф1: search в App'")
    writeFileSync(join(cwd, "src/extra/Util.java"), "class Util {}\n")
    c("git add -A && git commit -q -m 'Ф2: Util по образцу App'")
    writeFileSync(join(cwd, "src/AppTest.java"), "class AppTest { void t1() {} void t2() {} void t3() {} }\n")
    c("git add -A && git commit -q -m 'тесты Ф1'")
    assert.deepEqual(judgeSolve({ cwd, plan: PLAN, since: head }), [])
    const card = doneCard(cwd, PLAN, head)
    assert.match(card, /РАЗРАБОТКА ЗАВЕРШЕНА/)
    assert.match(card, /Строк плана: 2 · покрыто коммитами: 2 · коммитов: 3/)
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test("(a) Ф2 без коммита; (b) тест переписан; (c) гарантия нарушена — каждый пойман", () => {
  const a = stand()
  try {
    writeFileSync(join(a.cwd, "src/App.java"), "class App { void search() {} }\n")
    execSync("git add -A && git commit -q -m 'Ф1 only'", { cwd: a.cwd, encoding: "utf8" })
    assert.ok(judgeSolve({ cwd: a.cwd, plan: PLAN, since: a.head }).some((x) => x.startsWith("(a)") && x.includes("Ф2")))
  } finally { rmSync(a.cwd, { recursive: true, force: true }) }

  const b = stand()
  try {
    writeFileSync(join(b.cwd, "src/AppTest.java"), "class AppTest { void t1() {} }\n") // t2 удалён
    writeFileSync(join(b.cwd, "src/App.java"), "class App { void search() {} }\n")
    execSync("git add -A && git commit -q -m 'Ф1 + переписал тест'", { cwd: b.cwd, encoding: "utf8" })
    assert.ok(judgeSolve({ cwd: b.cwd, plan: PLAN, since: b.head }).some((x) => x.startsWith("(b)") && x.includes("AppTest")))
  } finally { rmSync(b.cwd, { recursive: true, force: true }) }

  const cse = stand()
  try {
    writeFileSync(join(cse.cwd, "src/Legacy.java"), "\n")
    writeFileSync(join(cse.cwd, "src/App.java"), "class App { void search() {} }\n")
    writeFileSync(join(cse.cwd, "src/extra/Util.java"), "class Util {}\n")
    execSync("git add -A && git commit -q -m 'тронул Legacy'", { cwd: cse.cwd, encoding: "utf8" })
    assert.ok(judgeSolve({ cwd: cse.cwd, plan: PLAN, since: cse.head }).some((x) => x.startsWith("(c)") && x.includes("Legacy")))
  } finally { rmSync(cse.cwd, { recursive: true, force: true }) }
})
