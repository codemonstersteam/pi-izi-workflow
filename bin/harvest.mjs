#!/usr/bin/env node
// MODULE_CONTRACT: harvest — ЦЕПОЧКИ ШАГОВ, РАЗЛОЖЕННЫЕ ПО ПОДШАГАМ, из настоящего прогона
// Purpose:    одно решение спрятано здесь: что считается свидетельством работы подшага. Не пересказ
//             и не сборка стендом, а то, что ПРОГОН написал на диск: наряд, ушедший в модель,
//             системный промпт, настройка роли, конверт ответа и артефакт.
// io:         fs
// EXTERNAL_DEPENDENCY: `<run>/state.json` — `agents[].prompt` (наряд) и `agents[].systemPrompt`;
//             `<run>/journal.json` — `completed[agents[].resultPath].value` (конверт ответа);
//             `<cwd>/.agent/` — артефакты. Транскрипты pi не читаются: всё нужное есть здесь.
// Invariants: НИЧЕГО НЕ ВЫДУМЫВАЕТ. Роль, которой нет в таблицах подшагов, — отказ С ИМЕНЕМ, а не
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

// ТАБЛИЦА ПОДШАГОВ — ОДНО МЕСТО НА ЦЕПОЧКУ. Порядок = порядок цепочки; `role: null` — подшаг-скрипт,
// ролей у него нет и быть не может. `reads`/`writes` — артефакты в `.agent/` каталога прогона;
// `writesDir` — каталог, ложащийся в out/ ПОФАЙЛЬНО (части карты).
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

export const SCOPE_STAGES = Object.freeze([
  { dir: "1-plan", role: null, says: "дерево + якоря шага 2 → клетки и факт скрипта",
    reads: [".agent/brd.md", ".agent/anchors.json"], writes: [".agent/survey-plan.json", ".agent/graph-computed.xml"] },
  { dir: "2-focus", role: null, says: "план + факт скрипта → что читает рой",
    reads: [".agent/survey-plan.json"], writes: [".agent/focus.json"] },
  { dir: "3-parts", role: "scout", says: "клетки фокуса → части карты (рой)",
    reads: [".agent/focus.json"], writes: [], writesDir: ".agent/graph-parts" },
])

export const INTAKE_STAGES = Object.freeze([
  { dir: "1-pass-a", role: "intake", says: "требование → use cases",
    reads: [".agent/brd.md", ".agent/normalized.md"], writes: [] },
  { dir: "2-pass-b", role: "intake", says: "use cases + карта → дельты",
    reads: [".agent/appgraph.xml"], writes: [] },
  { dir: "3-pass-c", role: "intake", says: "дельты + значения → поля, отказы, NFR",
    reads: [".agent/normalized.md"], writes: [] },
  { dir: "4-pass-d", role: "intake", says: "сборка FRD",
    reads: [], writes: [".agent/frd.xml"] },
])

export const TAIL_STAGES = Object.freeze([
  { dir: "1-weight", role: null, says: "формы дельт → вес (SemVer)",
    reads: [".agent/frd.xml"], writes: [".agent/mode"] },
  { dir: "2-ripple", role: null, says: "что задето: объявления, API, соседи",
    reads: [".agent/frd.xml", ".agent/appgraph.xml"], writes: [".agent/ripple.xml"] },
])

export const PLAN_STAGES = Object.freeze([
  { dir: "1-values", role: "valuer", says: "словарь значений границы",
    reads: [".agent/frd.xml"], writes: [".agent/values.xml"] },
  { dir: "2-tree", role: "tree-designer", says: "дерево модулей",
    reads: [".agent/values.xml", ".agent/frd.xml", ".agent/ripple.xml"], writes: [".agent/tree.xml"] },
  { dir: "3-flows", role: "flow-designer", says: "потоки данных",
    reads: [".agent/tree.xml", ".agent/values.xml", ".agent/frd.xml"], writes: [".agent/flows.xml"] },
])

export const CHAINS = Object.freeze([
  { out: join(HERE, "../component-tests/steps/brd"), stages: STAGES },
  { out: join(HERE, "../component-tests/steps/scope"), stages: SCOPE_STAGES },
  { out: join(HERE, "../component-tests/steps/intake"), stages: INTAKE_STAGES },
  { out: join(HERE, "../component-tests/steps/weight"), stages: TAIL_STAGES.slice(0, 1) },
  { out: join(HERE, "../component-tests/steps/ripple"), stages: TAIL_STAGES.slice(1) },
  { out: join(HERE, "../component-tests/steps/plan"), stages: PLAN_STAGES },
])

const die = (why) => { console.error(`harvest: ${why}`); process.exit(1) }
const put = (out, rel, text) => { const abs = join(out, rel); mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, text) }
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

  // РОЛЬ, КОТОРОЙ НЕТ В ТАБЛИЦАХ, — ОТКАЗ. Иначе новая роль тихо не попадёт в раскладку, и оператор
  // будет разбирать цепочку, в которой звена нет.
  const known = new Set(CHAINS.flatMap((c) => c.stages.map((s) => s.role).filter(Boolean)))
  for (const a of agents) if (!known.has(a.role)) die(`прогон звал роль «${a.role}», а в таблицах подшагов её нет`)

  const report = []
  for (const chain of CHAINS) {
    const OUT = chain.out
    for (const st of chain.stages) {
    // РАСКЛАДЧИК ВЛАДЕЕТ `in/` И `out/` ЦЕЛИКОМ. Иначе рядом с живым `order.md` остаётся стендовый
    // `order.normalize.md` от прошлого способа сборки, и каталог перестаёт отвечать на вопрос
    // «что пришло на вход» — он отвечает «что тут когда-либо лежало». Файлы в КОРНЕ подшага
    // (`build.mjs`, стендовые `answer.*`/`raw.*`) не трогаются: их читают юниты.
    for (const sub of ["in", "out"]) rmSync(join(OUT, st.dir, sub), { recursive: true, force: true })

    // ВХОД: артефакты, названные подшагом, копируются из каталога ПРОГОНА как есть.
    for (const rel of st.reads) {
      const text = read(join(cwd, rel))
      put(OUT, `${st.dir}/in/${rel.split("/").pop()}`, text === null ? `<< ${rel} на диске нет >>\n` : text)
    }
    for (const rel of st.writes) {
      const text = read(join(cwd, rel))
      put(OUT, `${st.dir}/out/${rel.split("/").pop()}`, text === null ? `<< ${rel} на диске нет >>\n` : text)
    }
    // КАТАЛОГ-АРТЕФАКТ ложится ПОФАЙЛЬНО: часть карты — это один файл на клетку, иное копирование
    // (конкатенация, выбор «главных») было бы пересказом.
    if (st.writesDir) {
      const dir = join(cwd, st.writesDir)
      const files = existsSync(dir) ? readdirSync(dir).sort() : []
      if (files.length) for (const f of files) put(OUT, `${st.dir}/out/${st.writesDir.split("/").pop()}/${f}`, read(join(dir, f)))
      else put(OUT, `${st.dir}/out/${st.writesDir.split("/").pop()}/.пусто`, `<< ${st.writesDir} на диске нет >>\n`)
      st._files = files.length
    }

    const mine = agents.filter((a) => a.role === st.role)
    // ПУСТОТА ЧИТАЕТСЯ КАК ЗАМЫСЕЛ, А НЕ КАК ПРОПУСК: подшаг без роли говорит об этом сам.
    const meta = st.role
      ? { подшаг: st.dir, делает: st.says, роль: st.role, вызовов: mine.length, прогон: runId }
      : { подшаг: st.dir, делает: st.says, роль: "роли нет — скрипт, 0 токенов", прогон: runId }
    if (st.writesDir) meta.файлов_в_каталоге = st._files ?? 0

    mine.forEach((a, i) => {
      const suffix = mine.length > 1 ? `.${i + 1}` : ""
      put(OUT, `${st.dir}/in/order${suffix}.md`, a.prompt || "")
      put(OUT, `${st.dir}/in/system${suffix}.md`, a.systemPrompt || "")
      put(OUT, `${st.dir}/in/request${suffix}.json`, `${JSON.stringify({
        note: "РЕКОНСТРУКЦИЯ, а не перехват: хост собирает сообщения внутри себя. system и user — байты из state.json прогона, model и tools — оттуда же.",
        model: a.model, requestedModel: a.requestedModel, tools: a.tools,
        messages: [{ role: "system", content: a.systemPrompt || "" }, { role: "user", content: a.prompt || "" }],
      }, null, 1)}\n`)
      const env = (journal.completed || {})[a.resultPath]
      if (env) put(OUT, `${st.dir}/out/envelope${suffix}.json`, `${JSON.stringify(env.value, null, 1)}\n`)
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
      if (before) put(OUT, "1-normalize/out/normalized.md", before)
      if (before) put(OUT, "2-clean/in/normalized.md", before)
    }
    put(OUT, `${st.dir}/meta.json`, `${JSON.stringify(meta, null, 1)}\n`)
    report.push(meta)
    }
  }

  console.log(`прогон: ${runDir.split("/").slice(-1)[0]} · состояние ${state.state} · ролей ${agents.length} · токенов ${state.usage?.tokens ?? 0}`)
  for (const m of report) {
    // Ключ `вызовов` — счётчик, а не вызов: фильтр по точке, иначе счёт попадает в список замеров.
    const calls = Object.keys(m).filter((k) => /^вызов\./.test(k)).map((k) => m[k])
    const files = m.файлов_в_каталоге !== undefined ? ` · файлов ${m.файлов_в_каталоге}` : ""
    const cost = calls.map((c) => `${c.секунд}с/${c.токенов_выхода}т${c.кругов > 1 ? `/кругов ${c.кругов}` : ""}`).join(" + ") || "0 токенов, скрипт"
    console.log(`  ${m.подшаг.padEnd(12)} ${String(m.роль || "—").padEnd(11)} ${cost}${files}`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main()
