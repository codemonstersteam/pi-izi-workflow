// MODULE_CONTRACT: draft-judge — судья плана: вычислимое о шести разделах
// Purpose:    одно решение: что о форме плана может сказать СКРИПТ. Смысл судит критик-роль;
//             здесь — грамматика: разделы на месте, таблицы парсятся, цитаты — подстроки
//             заказа, пути существуют или «новые» с образцом, у величин источник.
// io:         fs (test -e путей — через existsSync; пути берутся из колонок таблицы)
// Invariants: ТОТАЛЕН; каждый блокер называет раздел и строку; пустой план = блокер формы.
// Interface:  judgeDraft({ plan, task, cwd }) -> string[] (пусто = зелёный)
import { existsSync } from "node:fs"
import { join } from "node:path"

const SECTIONS = ["ТРЕБОВАНИЯ", "ИЗМЕНЕНИЯ", "СЦЕНАРИИ", "ВЕЛИЧИНЫ", "ГАРАНТИИ", "ОТКРЫТЫЕ ВОПРОСЫ"]

// строки таблицы раздела: строки, начинающиеся с |, кроме шапки/разделителя
const tableRows = (sectionText) => sectionText
  .split("\n").filter((l) => l.trim().startsWith("|"))
  .filter((l) => !/^\s*\|[\s\-:|]+\|\s*$/.test(l))
  .slice(1) // шапка

const cells = (row) => row.split("|").slice(1, -1).map((c) => c.trim())

export function judgeDraft({ plan = "", task = "", cwd = "" } = {}) {
  const B = []
  if (!plan.trim()) return ["формы нет: план пуст"]

  // 1. шесть разделов заголовками
  const heads = SECTIONS.filter((h) => !new RegExp(`^#+\\s*(\\d+\\.\\s*)?${h}`, "mi").test(plan))
  if (heads.length) B.push(`раздел(ы) отсутствуют: ${heads.join(", ")} — спека требует все шесть заголовками`)

  const sectionOf = (name) => {
    const m = plan.match(new RegExp(`^#+\\s*(\\d+\\.\\s*)?${name}\\s*$`, "mi"))
    if (!m) return ""
    const after = plan.slice(m.index + m[0].length)
    const next = after.match(/^#+\s/m)
    return next ? after.slice(0, next.index) : after
  }

  // 2. таблицы разделов 1 и 2 парсятся
  const req = sectionOf("ТРЕБОВАНИЯ")
  const chg = sectionOf("ИЗМЕНЕНИЯ")
  const reqRows = tableRows(req)
  const chgRows = tableRows(chg)
  if (!reqRows.length) B.push("раздел ТРЕБОВАНИЯ: таблица не парится — нужны строки «| № | Цитата | Где закрыто |»")
  if (!chgRows.length) B.push("раздел ИЗМЕНЕНИЯ: таблица не парится — нужны строки «| № | Файл | A/C | Контракт | Требование |»")

  // 3. цитаты раздела 1 — подстроки TASK (нормализуем пробелы)
  const norm = (t) => t.replace(/[«»"']/g, "").replace(/\s+/g, " ").trim().toLowerCase()
  const taskNorm = norm(task)
  for (const row of reqRows) {
    const c = cells(row)
    const quote = norm(c[1] || "")
    if (!quote) { B.push(`ТРЕБОВАНИЯ, строка «${(c[0] || "?").slice(0, 12)}»: колонка цитаты пуста`); continue }
    if (taskNorm && !taskNorm.includes(quote.slice(0, Math.min(60, quote.length)))) {
      B.push(`ТРЕБОВАНИЯ «${quote.slice(0, 50)}…» — не подстрока TASK.md: цитируй заказ дословно, не пересказом`)
    }
  }

  // 4. пути раздела 2: существование — вычислимая истина. Слово «новый» не сигнал
  // («новый метод» в существующем файле — легально): несуществующий путь обязан
  // нести ОБРАЗЕЦ («по образцу какого файла создаётся»), иначе блокер.
  for (const row of chgRows) {
    const c = cells(row)
    const path = (c[1] || "").replace(/`/g, "").trim()
    const what = `${c[3] || ""} ${c[2] || ""} ${c[4] || ""}`
    if (!path) { B.push(`ИЗМЕНЕНИЯ, строка «${(c[0] || "?").slice(0, 12)}»: колонка файла пуста`); continue }
    if (cwd && !existsSync(join(cwd, path)) && !/образ/i.test(what)) {
      B.push(`ИЗМЕНЕНИЯ «${path}»: файла нет в репозитории и образец не назван — либо путь существует (проверь), либо честно пометь «новый» и назови, по образцу какого файла создаётся`)
    }
  }

  // 5. у величин источник непуст
  const val = sectionOf("ВЕЛИЧИНЫ")
  for (const row of tableRows(val)) {
    const c = cells(row)
    if (c.length >= 3 && !c[2]) B.push(`ВЕЛИЧИНЫ «${(c[1] || c[0] || "?").slice(0, 30)}»: колонка источника пуста — источник обязателен (цитата TASK или файл кода)`)
  }

  return B
}
