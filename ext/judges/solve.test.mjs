// Units of the solve judge: a/b/c on a REAL throwaway git repo — the judge reads git.
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { execSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { judgeSolve } from "./solve.mjs"

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
  const cwd = mkdtempSync(join(tmpdir(), "solo-solve-"))
  const g = (cmd) => execSync(cmd, { cwd, encoding: "utf8" })
  g("git init -q")
  mkdirSync(join(cwd, "src/extra"), { recursive: true })
  writeFileSync(join(cwd, "src/App.java"), "class App {}\n")
  writeFileSync(join(cwd, "src/Legacy.java"), "class Legacy {}\n")
  writeFileSync(join(cwd, "src/AppTest.java"), "class AppTest { void t1() {} void t2() {} }\n")
  g("git add -A && git commit -q -m base")
  return { cwd, head: g("git rev-parse HEAD").trim() }
}

test("(a) обе Ф покрыты коммитами, (b)(c) чисто — зелёный", () => {
  const { cwd, head } = stand()
  try {
    const c = (cmd) => execSync(cmd, { cwd, encoding: "utf8" })
    writeFileSync(join(cwd, "src/App.java"), "class App { void search() {} }\n")
    c("git add -A && git commit -q -m 'Ф1 (§2.1): search в App'")
    writeFileSync(join(cwd, "src/extra/Util.java"), "class Util {}\n")
    c("git add -A && git commit -q -m 'Ф2 (§2.2): Util по образцу App'")
    writeFileSync(join(cwd, "src/AppTest.java"), "class AppTest { void t1() {} void t2() {} void t3() {} }\n") // только добавление
    c("git add -A && git commit -q -m 'тесты Ф1'")
    const got = judgeSolve({ cwd, plan: PLAN, since: head }); if (got.length) console.log("GOT:", got); assert.deepEqual(got, [])
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test("(a) Ф2 без коммита — красный с номером строки", () => {
  const { cwd, head } = stand()
  try {
    writeFileSync(join(cwd, "src/App.java"), "class App { void search() {} }\n")
    execSync("git add -A && git commit -q -m 'Ф1: only'", { cwd, encoding: "utf8" })
    const b = judgeSolve({ cwd, plan: PLAN, since: head })
    if (!b.some((x) => x.includes("Ф2") && x.startsWith("(a)"))) console.log("GOT2:", b); assert.ok(b.some((x) => x.includes("Ф2") && x.startsWith("(a)")), "непокрытая Ф2 не поймана")
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test("(b) существующий тест переписан (удалена строка) — красный", () => {
  const { cwd, head } = stand()
  try {
    writeFileSync(join(cwd, "src/AppTest.java"), "class AppTest { void t1() {} }\n") // t2 удалён
    writeFileSync(join(cwd, "src/App.java"), "class App { void search() {} }\n")
    execSync("git add -A && git commit -q -m 'Ф1 + переписал тест'", { cwd, encoding: "utf8" })
    const b = judgeSolve({ cwd, plan: PLAN, since: head })
    assert.ok(b.some((x) => x.startsWith("(b)") && x.includes("AppTest")), "переписанный тест не пойман")
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test("(c) гарантированный файл с удалёнными строками — красный", () => {
  const { cwd, head } = stand()
  try {
    writeFileSync(join(cwd, "src/Legacy.java"), "class Legacy {}\n".replace("class Legacy {}", ""))
    writeFileSync(join(cwd, "src/App.java"), "class App { void search() {} }\n")
    writeFileSync(join(cwd, "src/extra/Util.java"), "class Util {}\n")
    execSync("git add -A && git commit -q -m 'Ф1 Ф2 + тронул Legacy'", { cwd, encoding: "utf8" })
    const b = judgeSolve({ cwd, plan: PLAN, since: head })
    assert.ok(b.some((x) => x.startsWith("(c)") && x.includes("Legacy")), "нарушение гарантии не поймано")
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})
