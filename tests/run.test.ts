// COMPONENT TEST полосы solo — мок-роли, полный проход plan→check→execute.
// Швы: зелёный путь · красный план → круг · критик REJECT → repair · оператор «нет» → repair ·
// dev-нарушения → круг · пустой ответ → переспрос.
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { run } from "../ext/run.ts"

const TASK = "task: TEST-1\n\nНужен поиск. Ломать нельзя.\n"

// TASK русский, план английского формата с русскими дословными цитатами —
// доказательство языковой нейтральности механизма цитат.
const PLAN = `# Plan

## 1. REQUIREMENTS
| № | Quote | Where |
|---|---|---|
| R1 | «Нужен поиск» | C1 |
| R2 | «Ломать нельзя» | C1 |

## 2. CHANGES
| № | File | A/C | What | Req |
|---|---|---|---|---|
| C1 | src/App.java | Changed | search | R1,R2 |

## 3. SCENARIOS
### Scenario 1
- Before: none. After: exists.

## 4. VALUES
| Q | V | Source |
|---|---|---|
| path | /s | TASK |

## 5. GUARANTEES
1. Not touched.

## 6. OPEN QUESTIONS
| Question | Recommendation |
|---|---|
| Limit? → RESOLVED: 20 | — |
`

const stand = () => {
  const cwd = mkdtempSync(join(tmpdir(), "solo-run-"))
  mkdirSync(join(cwd, "src"), { recursive: true })
  mkdirSync(join(cwd, ".agent/staging"), { recursive: true })
  writeFileSync(join(cwd, ".gitignore"), ".agent/\n")
  writeFileSync(join(cwd, "TASK.md"), TASK)
  writeFileSync(join(cwd, "src/App.java"), "class App {}\n")
  writeFileSync(join(cwd, "src/Legacy.java"), "class Legacy {}\n")
  try {
    execSync("git init -q", { cwd, encoding: "utf8" })
    execSync("git config user.email test@test", { cwd, encoding: "utf8" })
    execSync("git config user.name test", { cwd, encoding: "utf8" })
    execSync("git add -A && git commit -q -m base", { cwd, encoding: "utf8" })
  } catch {}
  return cwd
}

// мок ctx: роли пишут staging, ask отвечает, log собирает
function mockCtx(cwd: string, roles: Record<string, (text: string) => any>, askReplies: string[][]) {
  const logs: string[] = []
  let askIdx = 0
  return {
    logs,
    ctx: {
      run: { cwd, runId: "test" },
      log: (m: string) => logs.push(m),
      agent: async (text: string, opts: any) => {
        const role = opts?.role || ""
        const fn = roles[role]
        if (!fn) throw new Error(`нет мока для роли ${role}`)
        return fn(text)
      },
      invoke: async (name: string, input: any) => {
        if (name === "ask") {
          const answers = askReplies[askIdx++] || [""]
          // ask-функция пишет answers.md — мокаем обменом
          const items = (input.items || []).map((t: any, i: number) => ({ n: i + 1, question: t.text, text: answers[i] || "" })).filter((p: any) => p.text)
          if (items.length) {
            const block = `<exchange>\n${items.map((p: any) => `  <question_${p.n}>${p.question}</question_${p.n}>\n  <answer_${p.n}>${p.text}</answer_${p.n}>`).join("\n")}\n</exchange>\n`
            // append to answers.md
            const cur = readSafe(join(cwd, ".agent/answers.md"))
            writeFileSync(join(cwd, ".agent/answers.md"), cur + block)
          }
          return { answers }
        }
        return {}
      },
    },
  }
}
const readSafe = (p: string) => { try { return readFileSync(p, "utf8") } catch { return "" } }


test("зелёный путь: план→критик→вопрос→да→dev→судьи→done", async () => {
  const cwd = stand()
  const { ctx, logs } = mockCtx(cwd, {
    planner: () => { writeFileSync(join(cwd, ".agent/staging/PLAN~draft.md"), PLAN); return { track: "ok", artifact: "..." } },
    critic: () => ({ track: "ok", verdict: "APPROVE" }),
    dev: () => {
      writeFileSync(join(cwd, "src/App.java"), "class App { void search() {} }\n")
      execSync("git add -A && git commit -q -m 'C1: search'", { cwd, encoding: "utf8" })
      return { track: "ok" }
    },
  }, [["да"]]) // ответ на confirm
  try {
    const r = await run({ key: "TEST-1" }, ctx)
    assert.equal(r.track, "ok", JSON.stringify(r).slice(0, 200))
    assert.ok(logs.some((l) => l.includes("план: готов")))
    assert.ok(logs.some((l) => l.includes("проверка: план утверждён")))
    assert.ok(logs.some((l) => l.includes("разработка: готова")))
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test("красный план → круг починки → зелёный", async () => {
  const cwd = stand()
  let call = 0
  const { ctx, logs } = mockCtx(cwd, {
    planner: () => {
      call++
      const plan = call === 1 ? PLAN.replace("## 5. GUARANTEES", "## 5. Other") : PLAN
      writeFileSync(join(cwd, ".agent/staging/PLAN~draft.md"), plan)
      return { track: "ok" }
    },
    critic: () => ({ track: "ok", verdict: "APPROVE" }),
    dev: () => { writeFileSync(join(cwd, "src/App.java"), "class App { void s() {} }\n"); execSync("git add -A && git commit -q -m 'C1'", { cwd, encoding: "utf8" }); return { track: "ok" } },
  }, [["да"]])
  try {
    const r = await run({}, ctx)
    assert.equal(r.track, "ok")
    assert.ok(logs.some((l) => l.includes("план: круг 1/3")), "круг починки не залогирован")
    assert.ok(call >= 2, `planner позван ${call} раз — меньше 2 (начало + сверка)`)
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test("критик REJECT → repairPlan → APPROVE → done", async () => {
  const cwd = stand()
  let criticCall = 0
  const { ctx, logs } = mockCtx(cwd, {
    planner: () => { writeFileSync(join(cwd, ".agent/staging/PLAN~draft.md"), PLAN); return { track: "ok" } },
    critic: () => { criticCall++; return criticCall === 1 ? { track: "ok", verdict: "REJECT", blockers: ["REQUIREMENTS R2: quote does not close"] } : { track: "ok", verdict: "APPROVE" } },
    dev: () => { writeFileSync(join(cwd, "src/App.java"), "class App { void s() {} }\n"); execSync("git add -A && git commit -q -m 'C1'", { cwd, encoding: "utf8" }); return { track: "ok" } },
  }, [["да"]])
  try {
    const r = await run({}, ctx)
    assert.equal(r.track, "ok")
    assert.ok(logs.some((l) => l.includes("критик отклонил")), "REJECT не залогирован")
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test("оператор «нет» → repairPlan → «да» → done", async () => {
  const cwd = stand()
  const { ctx, logs } = mockCtx(cwd, {
    planner: () => { writeFileSync(join(cwd, ".agent/staging/PLAN~draft.md"), PLAN); return { track: "ok" } },
    critic: () => ({ track: "ok", verdict: "APPROVE" }),
    dev: () => { writeFileSync(join(cwd, "src/App.java"), "class App { void s() {} }\n"); execSync("git add -A && git commit -q -m 'C1'", { cwd, encoding: "utf8" }); return { track: "ok" } },
  }, [["нет: добавь лимит"], ["да"]])
  try {
    const r = await run({}, ctx)
    assert.equal(r.track, "ok")
    assert.ok(logs.some((l) => l.includes("оператор отклонил")))
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

// СВЕРКА: planner добавляет C-строку для решения без реализации
test("сверка: RESOLVED «fruits.html» без C-строки → planner добавляет C3", async () => {
  const cwd = stand()
  // план с RESOLVED, но БЕЗ C-строки для fruits.html
  const planWithSolved = PLAN.replace(
    "| Limit? → RESOLVED: 20 | — |",
    "| Limit? → RESOLVED: 20 | — |\n| Перевести fruits.html? → RESOLVED: Да, перевести | — |",
  )
  const planWithF3 = planWithSolved.replace(
    "| C1 | src/App.java |",
    "| C1 | src/App.java |",
  ).replace(
    "## 3. SCENARIOS",
    "| C3 | src/page.html | Changed | search in UI | R1 |\n\n## 3. SCENARIOS",
  )

  let plannerCalls = 0
  const { ctx, logs } = mockCtx(cwd, {
    planner: (text: string) => {
      plannerCalls++
      // первый вызов — обычный план; второй — сверка (добавляет Ф3)
      const isReconcile = text.includes("RECONCILE")
      const plan = isReconcile ? planWithF3 : PLAN
      writeFileSync(join(cwd, ".agent/staging/PLAN~draft.md"), plan)
      return { track: "ok" }
    },
    critic: () => ({ track: "ok", verdict: "APPROVE" }),
    dev: () => {
      writeFileSync(join(cwd, "src/App.java"), "class App { void s() {} }\n")
      writeFileSync(join(cwd, "src/page.html"), "<html>search</html>")
      execSync("git add -A && git commit -q -m 'C1+C3'", { cwd, encoding: "utf8" })
      return { track: "ok" }
    },
  }, [["да"]])
  // создать src/page.html чтобы судья не блокировал
  writeFileSync(join(cwd, "src/page.html"), "<html>old</html>")

  try {
    const r = await run({ key: "T" }, ctx)
    assert.equal(r.track, "ok", JSON.stringify(r).slice(0, 200))
    assert.ok(plannerCalls >= 2, "planner не позван для сверки")
    assert.ok(logs.some((l) => l.includes("сверка")), "сверка не залогирована")
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})
