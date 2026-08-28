// MODULE_CONTRACT: judges — судьи разработки: (a) Ф↔коммиты, (b) тесты только расширены,
// (c) гарантии §5 аддитивны.
// Purpose:    одно решение: что о РЕЗУЛЬТАТЕ разработки вычислимо скриптом. Смысловая
//             приёмка — итоговая карточка оператору; здесь — механика git.
// io:         proc (git log/diff/show через execSync)
// Invariants: ТОТАЛЕН; пусто = зелёный; каждый блокер называет строку Ф или файл.
// Interface:  judgeSolve, doneCard
import { execSync } from "node:child_process"
import { tableRows, sectionOf } from "../plan/judge.ts"

const git = (cwd: string, args: string): string => {
  try { return execSync(`git ${args}`, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }) } catch { return "" }
}

// «удалённая строка» — та, чей ТОКЕН исчез из новой версии файла целиком: вставка внутрь
// однострочного файла не теряет токена, удаление метода теряет его имя.
function lostLines(diff: string, cwd: string, file: string): number {
  const removed = diff.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---")).map((l) => l.slice(1).trim()).filter(Boolean)
  if (!removed.length) return 0
  let now = ""
  try { now = execSync(`git show HEAD:${JSON.stringify(file)}`, { cwd, encoding: "utf8" }) } catch { return removed.length }
  return removed.filter((l) => l.split(/\s+/).some((tok) => tok && !now.includes(tok))).length
}

export function judgeSolve({ cwd, plan, since }: { cwd: string; plan: string; since: string }): string[] {
  // PRECONDITION: since непуст (git HEAD получен). Пустой = git недоступен:
  // судьи (b)/(c) не могут работать → блокер, НЕ молчаливая зелёность
  if (!since) return ["git недоступен — HEAD не получен, судьи (b)/(c) не могут работать"]
  const B: string[] = []
  const range = `${since}..HEAD`
  const commits = (range ? git(cwd, `log --format=%s ${range}`) : git(cwd, "log --format=%s -50")).split("\n").filter(Boolean)
  if (range && !commits.length) B.push("(a) от отметки старта разработки нет НИ ОДНОГО коммита — работа не начата")

  const rows = tableRows(sectionOf(plan, "ИЗМЕНЕНИЯ")).filter((c) => /^Ф\d+/.test(c[0] || ""))
  if (!rows.length) B.push("(a) в плане не найдено строк Ф — судить покрытие не по чему")
  for (const c of rows) {
    const id = (c[0] || "").split(/\s+/)[0]
    if (!commits.some((s) => new RegExp(`(?<![\\p{L}\\p{N}])${id}(?![\\p{L}\\p{N}])`, "u").test(s)))
      B.push(`(a) строка ${id} («${(c[1] || "").slice(0, 50)}») не покрыта коммитом — итерация = строка Ф = коммит`)
  }

  const testRe = /(^|\/)(test|it)\b|Test\.java$|_test\.|\.test\./i
  for (const f of (range ? git(cwd, `diff --name-only ${range}`) : "").split("\n").filter((f) => f && testRe.test(f))) {
    const existed = since ? git(cwd, `cat-file -e ${since}:${f} 2>/dev/null && echo yes`).includes("yes") : false
    if (!existed) continue // новый тест-файл — можно целиком
    const removed = lostLines(git(cwd, `diff ${range} -- ${JSON.stringify(f)}`), cwd, f)
    if (removed > 0)
      B.push(`(b) существующий тест-файл ${f}: ${removed} строк исчезло — легальная правка теста обязана быть строкой Ф плана; добавляй, не переписывай`)
  }

  const sec = sectionOf(plan, "ГАРАНТИИ")
  const paths = [...sec.matchAll(/`([^`\s]+\.[a-z]{1,4})`/gi)].map((m) => m[1]).filter((p) => !/\s/.test(p))
  for (const p of new Set(paths)) {
    const removed = range ? lostLines(git(cwd, `diff ${range} -- ${JSON.stringify(p)}`), cwd, p) : 0
    if (removed > 0) B.push(`(c) гарантия §5 называет «${p}», а ${removed} строк исчезло — гарантия нарушена`)
  }

  return B
}

// doneCard — итоговая карточка: Ф↔коммиты и их сообщения
export function doneCard(cwd: string, plan: string, since: string): string {
  const range = since ? `${since}..HEAD` : ""
  const commits = (range ? git(cwd, `log --format=%s ${range}`) : "").split("\n").filter(Boolean)
  const rows = tableRows(sectionOf(plan, "ИЗМЕНЕНИЯ")).filter((c) => /^Ф\d+/.test(c[0] || ""))
  const covered = rows.filter((c) => commits.some((s) => s.includes((c[0] || "").split(/\s+/)[0])))
  return [
    "═══ РАЗРАБОТКА ЗАВЕРШЕНА ═══",
    `Строк плана: ${rows.length} · покрыто коммитами: ${covered.length} · коммитов: ${commits.length}`,
    ...commits.slice(0, 12).map((s) => `  · ${s.slice(0, 90)}`),
    "Проверь тесты проекта своими руками (стандарт приёмки).",
  ].join("\n")
}
