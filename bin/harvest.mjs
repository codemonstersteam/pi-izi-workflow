#!/usr/bin/env node
// MODULE_CONTRACT: harvest — ЦЕПОЧКА ШАГА 2, РАЗЛОЖЕННАЯ ПО ПОДШАГАМ, из настоящего прогона
// Purpose:    одно решение спрятано здесь: что считается свидетельством работы подшага. Не пересказ
//             и не сборка стендом, а то, что ПРОГОН написал на диск: наряд, ушедший в модель,
//             системный промпт, настройка роли, конверт ответа и артефакт.
// io:         fs
// EXTERNAL_DEPENDENCY: `<run>/state.json` — `agents[].prompt` (наряд) и `agents[].systemPrompt`;
//             `<run>/journal.json` — `completed[agents[].resultPath].value` (конверт ответа);
//             `<cwd>/.agent/` — артефакты. Транскрипты pi не читаются: всё нужное есть здесь.
// Invariants: НИЧЕГО НЕ ВЫДУМЫВАЕТ. Роль, которой нет в таблице подшагов, — отказ С ИМЕНЕМ, а не
//             молчаливый пропуск. Отсутствующий артефакт печатается как отсутствующий.
// Interface:  CLI: node bin/harvest.mjs --cwd=<каталог прогона> [--run=<runId>]
//
// ПОЧЕМУ `request.json` НАЗВАН РЕКОНСТРУКЦИЕЙ. Хост собирает сообщения внутри себя и на провод их не
// пишет; на диске лежат ОБЕ половины — `systemPrompt` и `prompt`, — но не сам HTTP-запрос. Файл
// собирается из них и несёт поле `note`, которое это говорит. Написать «вот что ушло на провод»
// значило бы соврать о происхождении байтов.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, "../component-tests/steps/brd")

// ТАБЛИЦА ПОДШАГОВ — ОДНО МЕСТО. Порядок = порядок цепочки; `role: null` — подшаг-скрипт, ролей у
// него нет и быть не может. `reads`/`writes` — артефакты в `.agent/` каталога прогона.
export const STAGES = Object.freeze([
  { dir: "1-normalize", role: "normalizer", says: "проза заказа → таблица требований",
    reads: ["TASK.md"], writes: [] },
  { dir: "2-clean", role: "cleaner", says: "таблица → таблица без дублей и выдуманного",
    reads: [], writes: [".agent/normalized.md"] },
  { dir: "3-hits", role: null, says: "слова таблицы → счёт файлов и IDF",
    reads: [".agent/normalized.md"], writes: [".agent/hits.txt"] },
  { dir: "4-anchors", role: "analogue", says: "таблица + попадания → артефакт шага",
    reads: [".agent/normalized.md", ".agent/hits.txt"], writes: [".agent/brd.md"] },
  { dir: "5-spread", role: null, says: "якоря и аналог → карта обхода",
    reads: [".agent/brd.md"], writes: [".agent/anchors.json"] },
])

const die = (why) => { console.error(`harvest: ${why}`); process.exit(1) }
const put = (rel, text) => { const abs = join(OUT, rel); mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, text) }
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null)

// FUNCTION_CONTRACT: lastRun — каталог последнего прогона этого cwd
//   Antecedent:   под ~/.pi/workflows/projects есть прогоны
//   Consequent:   success: путь; failure: null
//   Purity:       io (fs)
export function lastRun(home, cwd) {
  const root = join(home, ".pi", "workflows", "projects")
  if (!existsSync(root)) return null
  const runs = []
  for (const p of readdirSync(root)) {
    const sess = join(root, p, "sessions")
    if (!existsSync(sess)) continue
    for (const s of readdirSync(sess)) {
      const rd = join(sess, s, "runs")
      if (!existsSync(rd)) continue
      for (const r of readdirSync(rd)) {
        const dir = join(rd, r)
        const st = read(join(dir, "state.json"))
        if (!st) continue
        try { if (JSON.parse(st).cwd !== cwd) continue } catch { continue }
        runs.push({ dir, at: statSync(join(dir, "state.json")).mtimeMs })
      }
    }
  }
  runs.sort((a, b) => b.at - a.at)
  return runs.length ? runs[0].dir : null
}

// FUNCTION_CONTRACT: tableOfOrder — таблица, поданная проходу чистки
//   Antecedent:   наряд чистки несёт блок $START_TABLE … $END_TABLE
//   Consequent:   success: текст таблицы; failure: null
//   Purity:       pure
//   Таблица ПЕРВОГО прохода на диске не остаётся: `promote` кладёт очищенную и убирает оба черновика.
//   Единственное её место — наряд чистки, и это ТЕ ЖЕ байты, которые чистка получила.
export function tableOfOrder(order = "") {
  const m = String(order).match(/\$START_TABLE\n([\s\S]*?)\n\$END_TABLE/)
  return m ? `${m[1].trim()}\n` : null
}

const num = (v) => (typeof v === "number" ? v : null)

function main() {
  const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || "").split("=").slice(1).join("=")
  const cwd = arg("cwd")
  if (!cwd) die("нужен --cwd=<каталог прогона>")
  const home = process.env.HOME || ""
  const runDir = arg("run") ? arg("run") : lastRun(home, cwd)
  if (!runDir || !existsSync(runDir)) die(`прогона для ${cwd} не нашлось`)

  const runId = runDir.split("/").slice(-1)[0]
  const state = JSON.parse(read(join(runDir, "state.json")) || "{}")
  const journal = JSON.parse(read(join(runDir, "journal.json")) || "{}")
  const agents = state.agents || []

  // РОЛЬ, КОТОРОЙ НЕТ В ТАБЛИЦЕ, — ОТКАЗ. Иначе новая роль тихо не попадёт в раскладку, и оператор
  // будет разбирать цепочку, в которой звена нет.
  const known = new Set(STAGES.map((s) => s.role).filter(Boolean))
  for (const a of agents) if (!known.has(a.role)) die(`прогон звал роль «${a.role}», а в таблице подшагов её нет`)

  const report = []
  for (const st of STAGES) {
    // РАСКЛАДЧИК ВЛАДЕЕТ `in/` И `out/` ЦЕЛИКОМ. Иначе рядом с живым `order.md` остаётся стендовый
    // `order.normalize.md` от прошлого способа сборки, и каталог перестаёт отвечать на вопрос
    // «что пришло на вход» — он отвечает «что тут когда-либо лежало». Файлы в КОРНЕ подшага
    // (`build.mjs`, стендовые `answer.*`/`raw.*`) не трогаются: их читают юниты.
    for (const sub of ["in", "out"]) rmSync(join(OUT, st.dir, sub), { recursive: true, force: true })

    // ВХОД: артефакты, названные подшагом, копируются из каталога ПРОГОНА как есть.
    for (const rel of st.reads) {
      const text = read(join(cwd, rel))
      put(`${st.dir}/in/${rel.split("/").pop()}`, text === null ? `<< ${rel} на диске нет >>\n` : text)
    }
    for (const rel of st.writes) {
      const text = read(join(cwd, rel))
      put(`${st.dir}/out/${rel.split("/").pop()}`, text === null ? `<< ${rel} на диске нет >>\n` : text)
    }

    const mine = agents.filter((a) => a.role === st.role)
    // ПУСТОТА ЧИТАЕТСЯ КАК ЗАМЫСЕЛ, А НЕ КАК ПРОПУСК: подшаг без роли говорит об этом сам.
    const meta = st.role
      ? { подшаг: st.dir, делает: st.says, роль: st.role, вызовов: mine.length, прогон: runId }
      : { подшаг: st.dir, делает: st.says, роль: "роли нет — скрипт, 0 токенов", прогон: runId }

    mine.forEach((a, i) => {
      const suffix = mine.length > 1 ? `.${i + 1}` : ""
      put(`${st.dir}/in/order${suffix}.md`, a.prompt || "")
      put(`${st.dir}/in/system${suffix}.md`, a.systemPrompt || "")
      put(`${st.dir}/in/request${suffix}.json`, `${JSON.stringify({
        note: "РЕКОНСТРУКЦИЯ, а не перехват: хост собирает сообщения внутри себя. system и user — байты из state.json прогона, model и tools — оттуда же.",
        model: a.model, requestedModel: a.requestedModel, tools: a.tools,
        messages: [{ role: "system", content: a.systemPrompt || "" }, { role: "user", content: a.prompt || "" }],
      }, null, 1)}\n`)
      const env = (journal.completed || {})[a.resultPath]
      if (env) put(`${st.dir}/out/envelope${suffix}.json`, `${JSON.stringify(env.value, null, 1)}\n`)
      meta[`вызов${suffix || ".1"}`] = {
        состояние: a.state, кругов: a.attempts, секунд: a.durationMs ? +(a.durationMs / 1000).toFixed(1) : null,
        токенов_выхода: num(a.accounting?.output), токенов_входа: num(a.accounting?.input),
        модель: a.model, алиас: a.requestedModel, инструменты: a.tools,
        system_симв: (a.systemPrompt || "").length, наряд_симв: (a.prompt || "").length,
        конверт: env ? env.value : null,
      }
    })

    // Таблица ДО чистки: единственное её место — наряд чистки.
    if (st.dir === "2-clean" && mine[0]) {
      const before = tableOfOrder(mine[0].prompt || "")
      if (before) put("1-normalize/out/normalized.md", before)
      if (before) put("2-clean/in/normalized.md", before)
    }
    put(`${st.dir}/meta.json`, `${JSON.stringify(meta, null, 1)}\n`)
    report.push(meta)
  }

  console.log(`прогон: ${runDir.split("/").slice(-1)[0]} · состояние ${state.state} · ролей ${agents.length} · токенов ${state.usage?.tokens ?? 0}`)
  for (const m of report) {
    // Ключ `вызовов` — счётчик, а не вызов: фильтр по точке, иначе счёт попадает в список замеров.
    const calls = Object.keys(m).filter((k) => /^вызов\./.test(k)).map((k) => m[k])
    const cost = calls.map((c) => `${c.секунд}с/${c.токенов_выхода}т${c.кругов > 1 ? `/кругов ${c.кругов}` : ""}`).join(" + ") || "0 токенов, скрипт"
    console.log(`  ${m.подшаг.padEnd(12)} ${String(m.роль || "—").padEnd(11)} ${cost}`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main()
