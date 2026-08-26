#!/usr/bin/env node
// MODULE_CONTRACT: tickets — НАРЕЗКА ПЛАНА НА ТИКЕТЫ ДЛЯ ИСПОЛНИТЕЛЯ (qwen)
// Purpose:    одно решение спрятано здесь: что считается тикетом. Один модуль дерева — один тикет:
//             путь, дельта, близнец, контракт, потоки и порядок работ волнами по `needs`. Всё
//             содержимое ВЫЧИТАНО из артефактов прогона; своих решений скрипт не принимает.
// io:         fs (только тонкая CLI-обёртка; ядро чистое)
// EXTERNAL_DEPENDENCY: steps/plan/tree/tree.mjs::parseTree — разбор дерева (одно место на всю
//             полосу); steps/plan/flows/flows.mjs::parseFlows — разбор потоков.
// Invariants: НИЧЕГО НЕ ВЫДУМЫВАЕТ. Нет twin — раздел говорит «нет», а не подставляет образец; нет
//             потоков через модуль — раздела нет; цикл в `needs` — модуль едет последней волной с
//             пометкой, а не отказ и не молчание. Дельта диктует глагол тикета: Added — файл
//             создаётся, Changed — существующий файл ПРАВЯТСЯ (урок T52: seed с Added — блокер).
// Interface:  CLI: node bin/tickets.mjs <каталог прогона>   (ждёт <dir>/.agent/tree.xml;
//             flows.xml необязателен — тикеты выйдут без раздела потоков)
//             cutTickets({ treeXml, flowsXml }) -> { files, waves, cycleNote } — чистое ядро
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { join, basename, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { parseTree } from "../steps/plan/tree/tree.mjs"
import { parseFlows } from "../steps/plan/flows/flows.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))

// FUNCTION_CONTRACT: cutTickets — чистое ядро нарезки
//   Input:        { treeXml — текст .agent/tree.xml; flowsXml — текст .agent/flows.xml или "" }
//   Antecedent:   treeXml несёт хотя бы один <module> (иначе вызывающий отказывает сам)
//   Consequent:   success: { files: [{ name, text }], waves: string[][], cycleNote } — name относительно
//                 каталога тикетов; волны — индексы модулей в порядке разбора; cycleNote пуст, если
//                 цикла нет
//   Purity:       pure
export function cutTickets({ treeXml = "", flowsXml = "" } = {}) {
  const tree = parseTree(treeXml)
  const flows = parseFlows(flowsXml).flows

  // ВОЛНЫ ПО `needs` — КАНА В УСЛОВИЯХ РЕПОЗИТОРИЯ. Ребро учитывается только внутри дерева: `need` на
  // существующий файл репозитория — контекст, а не работа, и заказывать его раньше некого. Цикл не
  // отказ: остаток едет последней волной с пометкой в README — тикеты должны выйти всегда.
  const inTree = new Map(tree.modules.map((m, i) => [m.path, i]))
  const deps = tree.modules.map((m) => [...new Set(m.needs.map((n) => n.path).filter((p) => inTree.has(p) && p !== m.path))])
  const waves = []
  const placed = new Set()
  let cycleNote = ""
  while (placed.size < tree.modules.length) {
    const wave = tree.modules.map((_, i) => i)
      .filter((i) => !placed.has(i) && deps[i].every((d) => placed.has(inTree.get(d))))
    if (!wave.length) {
      cycleNote = `обнаружен цикл в needs: ${tree.modules.map((m, i) => i).filter((i) => !placed.has(i)).map((i) => basename(tree.modules[i].path)).join(" ← ")} — едут одной волной`
      waves.push(tree.modules.map((_, i) => i).filter((i) => !placed.has(i)))
      break
    }
    waves.push(wave)
    for (const i of wave) placed.add(i)
  }

  // ПОТОКИ ПО МОДУЛЯМ — из flows.xml
  const stepsOf = new Map()
  for (const f of flows) {
    for (const s of f.steps) {
      if (!s.module) continue
      if (!stepsOf.has(s.module)) stepsOf.set(s.module, [])
      stepsOf.get(s.module).push({ flow: f, step: s })
    }
  }

  // Нумерация сквозная по волнам, внутри волны — по имени файла: два прогона одного плана дают
  // одинаковые номера, на которые можно ссылаться из чужих тикетов
  const numOf = new Map()
  const byName = (a, b) => basename(tree.modules[a].path).localeCompare(basename(tree.modules[b].path))
  let n = 0
  for (const wave of waves) for (const i of [...wave].sort(byName)) numOf.set(tree.modules[i].path, String(++n).padStart(2, "0"))

  const ucLines = (m) => (stepsOf.get(m.path) || []).map(({ flow, step }) =>
    `- ${step.closes || flow.id}${flow.branch ? ` (ветка ${flow.branch})` : ""} ${flow.goal ? `«${flow.goal}»` : ""}: ${step.in || "—"} → ${step.out || "—"}, роль: ${step.role || "—"}`)

  const files = []
  for (const wave of waves) {
    for (const i of [...wave].sort(byName)) {
      const m = tree.modules[i]
      const num = numOf.get(m.path)
      const name = basename(m.path)
      const lines = []
      lines.push(`# Тикет ${num} — ${name} (${m.delta || "Changed"}, волна ${waves.findIndex((w) => w.some((j) => tree.modules[j].path === m.path)) + 1})`, "")
      lines.push(`**Путь:** \`${m.path}\``)
      lines.push(m.delta === "Added"
        ? `**Дельта:** Added — файла НЕТ, создаётся этим тикетом.`
        : `**Дельта:** ${m.delta || "Changed"} — файл СУЩЕСТВУЕТ: правь его, НЕ создавай новый (seed в ripple.xml, судья T6).`)
      if (m.io) lines.push(`**Канал:** ${m.io}`)
      if (m.twin) lines.push(`**Образец (twin):** \`${m.twin}\`${m.candidates.length && m.candidates[0] !== m.twin ? ` (кандидаты: ${m.candidates.map((c) => "`" + c + "`").join(", ")})` : ""}`)
      else lines.push(`**Образец (twin):** нет — пиши по контракту ниже`)
      if (m.owns) lines.push(`**Владелец типа:** ${m.owns}`)
      if (m.hides) lines.push(`**Скрывает:** ${m.hides}`)
      lines.push("", "## Контракт", `- Сигнатура: \`${m.contract.sig || "—"}\``)
      if (m.contract.pre) lines.push(`- Pre: ${m.contract.pre}`)
      if (m.contract.post) lines.push(`- Post: ${m.contract.post}`)
      if (m.contract.fail) lines.push(`- Fail: ${m.contract.fail}`)
      const mine = m.needs.filter((x) => inTree.has(x.path) && x.path !== m.path)
      if (mine.length) {
        lines.push("", "## Сделать раньше")
        for (const d of mine) lines.push(`- Тикет ${numOf.get(d.path)} — ${basename(d.path)}${d.why ? `: ${d.why}` : ""}`)
      }
      const ucs = ucLines(m)
      if (ucs.length) lines.push("", "## Потоки (что закрывает)", ...ucs)
      lines.push("", "## Проверка", `- Post контракта выполняется после каждого вызова; Fail даёт названные коды отказов.`)
      if (ucs.length) {
        const ucIds = [...new Set(ucs.map((l) => l.replace(/^- (\S+).*$/, "$1")))].join(", ")
        lines.push(`- Каждый шаг потоков выше (${ucIds}) проходит через этот модуль.`)
      }
      lines.push("")
      files.push({ name: `${num}-${name.replace(/\.[^.]+$/, "")}.md`, text: lines.join("\n") })
    }
  }

  const readme = [
    `# Тикеты — ${tree.modules.length} модулей, ${waves.length} волн`,
    "",
    cycleNote ? `⚠ ${cycleNote}` : null,
    "",
    ...waves.flatMap((w, i) => [
      `## Волна ${i + 1}`,
      ...[...w].sort(byName).map((j) => `- Тикет ${numOf.get(tree.modules[j].path)} — ${basename(tree.modules[j].path)} (${tree.modules[j].delta || "Changed"})`),
      "",
    ]),
    `Волна заканчивается, когда все её тикеты зелёные. Внутри волны порядок свободный.`,
    "",
  ].filter((x) => x !== null).join("\n")
  files.push({ name: "README.md", text: readme })

  return { files, waves: waves.map((w) => [...w].sort(byName).map((i) => tree.modules[i].path)), cycleNote }
}

// --- CLI: тонкая обёртка — прочитать, нарезать, положить -----------------------------------------
const runDir = process.argv[2]
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!runDir || !existsSync(join(runDir, ".agent/tree.xml"))) {
    console.error("usage: node bin/tickets.mjs <каталог прогона с .agent/tree.xml>")
    process.exit(1)
  }
  const treeXml = readFileSync(join(runDir, ".agent/tree.xml"), "utf8")
  if (!parseTree(treeXml).modules.length) {
    console.error(".agent/tree.xml не несёт ни одного <module> — резать нечего")
    process.exit(1)
  }
  const flowsPath = join(runDir, ".agent/flows.xml")
  const cut = cutTickets({ treeXml, flowsXml: existsSync(flowsPath) ? readFileSync(flowsPath, "utf8") : "" })
  mkdirSync(join(runDir, "tickets"), { recursive: true })
  for (const f of cut.files) writeFileSync(join(runDir, "tickets", f.name), f.text)
  console.log(`tickets: ${cut.files.length - 1} тикетов, ${cut.waves.length} волн — ${join(runDir, "tickets")}${cut.cycleNote ? " (с циклом в needs — см. README)" : ""}`)
}
