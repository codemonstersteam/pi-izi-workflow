// MODULE_CONTRACT: judge — судья плана: вычислимое о шести разделах
// Purpose:    одно решение: что о ФОРМЕ плана говорит скрипт. Смысл судит критик; здесь —
//             грамматика: разделы на месте, таблицы парсятся, цитаты — подстроки заказа,
//             пути существуют или «новые» с образцом, у величин источник.
// io:         fs (проверка существования путей раздела 2)
// Invariants: ТОТАЛЕН; каждый блокер называет раздел и строку; пустой план = блокер формы.
// Interface:  judgeDraft
import { existsSync } from "node:fs"
import { join } from "node:path"

const SECTIONS = ["ТРЕБОВАНИЯ", "ИЗМЕНЕНИЯ", "СЦЕНАРИИ", "ВЕЛИЧИНЫ", "ГАРАНТИИ", "ОТКРЫТЫЕ ВОПРОСЫ"]

export function tableRows(sectionText: string): string[][] {
  return sectionText
    .split("\n").filter((l) => l.trim().startsWith("|"))
    .filter((l) => !/^\s*\|[\s\-:|]+\|\s*$/.test(l))
    .slice(1) // шапка
    .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()))
}

export function sectionOf(plan: string, name: string): string {
  const m = plan.match(new RegExp(`^#+\\s*(\\d+\\.\\s*)?${name}\\s*$`, "mi"))
  if (!m) return ""
  const after = plan.slice(m.index! + m[0].length)
  const next = after.match(/^#+\s/m)
  return next ? after.slice(0, next.index) : after
}

// нормализация цитат: без кавычек ЛЮБОГО рода (обратные тоже — дырка proof-прогона:
// цитата `task: solo-1` не совпала с TASK только из-за бэктиков), пробелы сжаты, нижний регистр
const norm = (t: string): string =>
  t.replace(/[«»"'`]/g, "").replace(/\s+/g, " ").trim().toLowerCase()

export function judgeDraft({ plan, task, cwd }: { plan: string; task: string; cwd: string }): string[] {
  const B: string[] = []
  if (!plan.trim()) return ["формы нет: план пуст"]

  const heads = SECTIONS.filter((h) => !new RegExp(`^#+\\s*(\\d+\\.\\s*)?${h}`, "mi").test(plan))
  if (heads.length) B.push(`раздел(ы) отсутствуют: ${heads.join(", ")} — спека требует все шесть заголовками`)

  const reqRows = tableRows(sectionOf(plan, "ТРЕБОВАНИЯ"))
  const chgRows = tableRows(sectionOf(plan, "ИЗМЕНЕНИЯ"))
  if (!reqRows.length) B.push("раздел ТРЕБОВАНИЯ: таблица не парится — нужны строки «| № | Цитата | Где закрыто |»")
  if (!chgRows.length) B.push("раздел ИЗМЕНЕНИЯ: таблица не парится — нужны строки «| № | Файл | A/C | Контракт | Требование |»")

  const taskNorm = norm(task)
  for (const c of reqRows) {
    const quote = norm(c[1] || "")
    if (!quote) { B.push(`ТРЕБОВАНИЯ, строка «${(c[0] || "?").slice(0, 12)}»: колонка цитаты пуста`); continue }
    if (taskNorm && !taskNorm.includes(quote.slice(0, Math.min(60, quote.length))))
      B.push(`ТРЕБОВАНИЯ «${quote.slice(0, 50)}…» — не подстрока TASK.md: цитируй заказ дословно, не пересказом`)
  }

  for (const c of chgRows) {
    const path = (c[1] || "").replace(/`/g, "").trim()
    const what = `${c[3] || ""} ${c[2] || ""} ${c[4] || ""}`
    if (!path) { B.push(`ИЗМЕНЕНИЯ, строка «${(c[0] || "?").slice(0, 12)}»: колонка файла пуста`); continue }
    if (cwd && !existsSync(join(cwd, path)) && !/образ/i.test(what))
      B.push(`ИЗМЕНЕНИЯ «${path}»: файла нет в репозитории и образец не назван — либо путь существует (проверь), либо честно пометь «новый» и назови, по образцу какого файла создаётся`)
  }

  for (const c of tableRows(sectionOf(plan, "ВЕЛИЧИНЫ"))) {
    if (c.length >= 3 && !c[2])
      B.push(`ВЕЛИЧИНЫ «${(c[1] || c[0] || "?").slice(0, 30)}»: колонка источника пуста — источник обязателен (цитата TASK или файл кода)`)
  }

  return B
}
