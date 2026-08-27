// MODULE_CONTRACT: solve-judge — судьи разработки: (a) покрытие Ф↔коммиты,
// (b) существующие тесты только расширены, (c) аддитивность по гарантиям §5.
// Purpose:    одно решение: что о РЕЗУЛЬТАТЕ разработки вычислимо скриптом. Смысловую
//             приёмку делает оператор по итоговой карточке; здесь — механика git.
// io:         proc (git log/diff через execSync)
// Invariants: ТОТАЛЕН; пусто = зелёный; каждый блокер называет строку Ф или файл.
// Interface:  judgeSolve({ cwd, plan, since }) -> string[]
import { execSync } from "node:child_process"

const git = (cwd, args) => {
  try { return execSync(`git ${args}`, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }) } catch { return "" }
}

// строки Ф из раздела 2 плана: «| Ф1 | путь | …» — первая колонка вида Ф\d+
const rowsOf = (plan) => {
  const m = plan.match(/^#+\s*(\d+\.\s*)?ИЗМЕНЕНИЯ\s*$/mi)
  if (!m) return []
  const after = plan.slice(m.index + m[0].length)
  const next = after.match(/^#+\s/m)
  const sec = next ? after.slice(0, next.index) : after
  return sec.split("\n")
    .filter((l) => l.trim().startsWith("|"))
    .filter((l) => !/^\s*\|[\s\-:|]+\|\s*$/.test(l))
    .slice(1)
    .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()))
    .filter((c) => /^Ф\d+/.test(c[0] || ""))
}


// «удалённая строка» — та, чьё содержимое ИСЧЕЗЛО из новой версии файла: однострочный
// файл при добавлении меняет строку целиком, и наивный счёт «-строк» звал бы ложное
// срабатывание на чистое расширение (живой урок теста на мини-репо).
const lostLines = (diff, cwd, file) => {
  const removed = diff.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---")).map((l) => l.slice(1).trim()).filter(Boolean)
  if (!removed.length) return 0
  let now = ""
  try { now = execSync(`git show HEAD:${JSON.stringify(file)}`, { cwd, encoding: "utf8" }) } catch { return removed.length }
  // токен-проверка: строка «потеряна», если хоть один её токен исчез из файла ЦЕЛИКОМ —
  // вставка внутрь однострочного файла не теряет ни токена, удаление метода теряет его имя
  return removed.filter((l) => l.split(/\s+/).some((tok) => tok && !now.includes(tok))).length
}

export function judgeSolve({ cwd = "", plan = "", since = "" } = {}) {
  const B = []
  const range = since ? `${since}..HEAD` : ""
  const log = range ? git(cwd, `log --format=%s ${range}`) : git(cwd, "log --format=%s -50")
  const commits = log.split("\n").filter(Boolean)
  if (range && !commits.length) B.push("(a) от отметки старта разработки нет НИ ОДНОГО коммита — работа не начата")

  // (a) каждая строка Ф ↔ коммит, упоминающий её номер
  const rows = rowsOf(plan)
  if (!rows.length) B.push("(a) в плане не найдено строк Ф — судить покрытие не по чему")
  for (const c of rows) {
    const id = (c[0] || "").split(/\s+/)[0]
    if (!commits.some((s) => s.includes(id))) B.push(`(a) строка ${id} («${(c[1] || "").slice(0, 50)}») не покрыта коммитом — итерация = строка Ф = коммит`)
  }

  // (b) существующие тест-файлы: в диффе от since только добавления строк
  const testFiles = range
    ? git(cwd, `diff --name-only ${range}`).split("\n").filter((f) => /(^|\/)(test|it)\b|Test\.java$|_test\.|\.test\./i.test(f))
    : []
  for (const f of testFiles) {
    const existed = since ? git(cwd, `cat-file -e ${since}:${f} 2>/dev/null && echo yes`).includes("yes") : false
    if (!existed) continue // новый тест-файл — можно целиком
    const removed = lostLines(git(cwd, `diff ${range} -- ${JSON.stringify(f)}`), cwd, f)
    if (removed > 0) B.push(`(b) существующий тест-файл ${f}: ${removed} строк исчезло из новой версии — легальная правка теста обязана быть строкой Ф плана; добавляй, не переписывай`)
  }

  // (c) аддитивность по списку гарантируемого §5: файлы, названные в гарантиях,
  // в диффе только расширяются (никаких удалённых строк)
  const gm = plan.match(/^#+\s*(\d+\.\s*)?ГАРАНТИИ\s*$/mi)
  if (gm) {
    const after = plan.slice(gm.index + gm[0].length)
    const next = after.match(/^#+\s/m)
    const sec = next ? after.slice(0, next.index) : after
    const paths = [...sec.matchAll(/`([^`\s]+\.[a-z]{1,4})`/gi)].map((m) => m[1]).filter((p) => !/\s/.test(p))
    for (const p of new Set(paths)) {
      const removed = range ? lostLines(git(cwd, `diff ${range} -- ${JSON.stringify(p)}`), cwd, p) : 0
      if (removed > 0) B.push(`(c) гарантия §5 называет «${p}», а ${removed} строк исчезло — гарантия нарушена`)
    }
  }

  return B
}
