#!/usr/bin/env node
// MODULE_CONTRACT: install — ставит харнес в каталог проекта копированием, ничего не удаляя
// Purpose:    одно решение спрятано здесь: ЧТО составляет харнес на стороне проекта — четыре
//             каталога (workflows, steps, core, bin) и запись в .gitignore. Расширение и шаблон
//             /izi ставятся один раз на машину через `pi install ./ext` и сюда не входят.
// io:         fs
// Invariants: установка НИЧЕГО не удаляет — ни целевого каталога, ни файлов проекта вне списка
//             PARTS; существующий файл харнеса перезаписывается, чужой файл не трогается никогда.
//             Целевой каталог обязан существовать: создавать проект — не работа установщика.
// Interface:  PARTS — каталоги харнеса; installTo(root) -> {copied, gitignore, task}
//
//   node bin/install.mjs --to=/путь/к/проекту
//
// Перед первой установкой на машине: cd ext && npm install && pi install ./
// (расширение несёт функции хоста, роль gilb и шаблон /izi — они глобальные, не проектные).

import { cpSync, existsSync, mkdirSync, readFileSync, appendFileSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// Каталоги, которые прогон читает по путям относительно cwd: воркфлоу, срезы, общие ядра и канал
// ответа оператора. Список объявлен ЗДЕСЬ и только здесь — второй экземпляр в README разошёлся бы.
export const PARTS = ["workflows", "steps", "core", "bin"]

const HARNESS = resolve(dirname(fileURLToPath(import.meta.url)), "..")

// FUNCTION_CONTRACT: installTo — разложить харнес по каталогу проекта
//   Antecedent:   root существует и является каталогом; не совпадает с каталогом самого харнеса
//   Consequent:   success: каждый каталог из PARTS скопирован в root, .agent/ объявлен в .gitignore
//                 failure: бросает Error с диагнозом — нет каталога, либо установка в саму себя
//   Purity:       io (fs)
//   Interface:    installTo(root: string) -> { copied: string[], gitignore: "added"|"present", task: boolean }
export function installTo(root) {
  const dst = resolve(root)
  if (!existsSync(dst) || !statSync(dst).isDirectory()) throw new Error(`${dst} не существует — каталог проекта создаёт оператор, не установщик`)
  if (dst === HARNESS) throw new Error("установка харнеса в самого себя")

  const copied = []
  for (const part of PARTS) {
    cpSync(join(HARNESS, part), join(dst, part), { recursive: true })   // перезапись своих, чужое рядом не трогается
    copied.push(part)
  }

  const ignore = join(dst, ".gitignore")
  const has = existsSync(ignore) && /^\.agent\/?\s*$/m.test(readFileSync(ignore, "utf8"))
  if (!has) appendFileSync(ignore, "\n# izi harness — состояние прогона\n.agent/\n")

  return { copied, gitignore: has ? "present" : "added", task: existsSync(join(dst, "TASK.md")) }
}

const arg = process.argv.slice(2).find((a) => a.startsWith("--to=")) || process.argv[2]
if (arg) {
  const root = arg.startsWith("--to=") ? arg.slice(5) : arg
  try {
    const r = installTo(root)
    console.log(`✓ харнес установлен в ${resolve(root)}`)
    console.log(`  каталоги: ${r.copied.join(", ")}`)
    console.log(`  .gitignore: .agent/ ${r.gitignore === "added" ? "добавлен" : "уже был"}`)
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
