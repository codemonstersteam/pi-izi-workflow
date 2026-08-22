// MODULE_CONTRACT: runlog — трейс исполнения прогона в XML
// Purpose:    одно решение спрятано здесь: ЧТО остаётся от прогона на диске. По трейсу прогон
//             восстанавливается, дефект ищется, и — главное — берётся ЗАПИСАННЫЙ ОТВЕТ МОДЕЛИ для
//             заглушки компонентного теста, чтобы его не добывать отдельным прогоном.
// io:         fs
// EXTERNAL_DEPENDENCY: core/xml.mjs — esc: тот же кодировщик, которым пишут все грамматики этого
//             репозитория; core/result.mjs — форма Result.
// Invariants: XML ВАЛИДЕН ПОСЛЕ КАЖДОЙ ЗАПИСИ — файл дописывается уже закрытым; отказ записи не
//             валит прогон, но и не проглатывается молча.
// Interface:  CUT_AT, pathOf, begin, inbox, llm, out, verdict, end, read
//
// КАТАЛОГ НА ПРОГОН, А НЕ ФАЙЛ НА ПРОЕКТ. Один файл означал бы, что второй прогон либо приписывает
// второй корень <run> и делает XML невалидным, либо затирает трейс первого — а трейс первого
// объявлен источником заглушек для ВСЕХ компонентных тестов.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { ok, err } from "../core/result.mjs"
import { esc } from "../core/xml.mjs"

// Порог дайджеста. Наряд шага 9 — под 80 КБ, ответ роли — десятки КБ; целиком они делают трейс
// нечитаемым, а урезанные МОЛЧА — лживым. Поэтому рез отмечается в самой записи.
export const CUT_AT = 4000

export const pathOf = (cwd, run) => join(cwd, ".agent", "runs", String(run), "runlog.xml")

// Сколько записей потеряно с прошлой удавшейся. Ключ — файл: в одном процессе может идти один прогон,
// но привязка к пути делает счётчик честным и при двух.
const lost = new Map()

const body = (text) => {
  const s = String(text == null ? "" : text)
  return s.length <= CUT_AT
    ? { text: esc(s), cut: 0 }
    : { text: esc(s.slice(0, CUT_AT)), cut: s.length - CUT_AT }
}

// FUNCTION_CONTRACT: write — единственное место, где трейс касается диска
//   Antecedent:   каждая запись несёт ШАГ и вид; run непуст
//   Consequent:   success: запись дописана, корень закрыт, файл валиден
//                 failure: Result.err("runlog", …) — И ПОТЕРЯ ЗАПОМНЕНА: следующая удавшаяся запись
//                          несёт <gap lost="N"/>
//   Purity:       io (fs)
//   BUG_FIX_CONTEXT: `catch {}` здесь запрещён (standards/code.md, ограничение 4). Пропущенная
//                 молча запись НЕОТЛИЧИМА от «вердикта не было», и приёмка «ни один артефакт не лёг
//                 с красным вердиктом — проверено по трейсу» перестаёт что-либо доказывать.
function write(cwd, run, step, xml) {
  if (!step) return err("runlog", "запись без имени шага — трейс станет нечитаемым")
  const file = pathOf(cwd, run)
  try {
    mkdirSync(dirname(file), { recursive: true })
    const had = existsSync(file) ? readFileSync(file, "utf8") : ""
    const head = had ? had.replace(/<\/run>\s*$/, "") : `<?xml version="1.0" encoding="UTF-8"?>\n<run id="${esc(run)}">\n`
    const n = lost.get(file) || 0
    const gap = n ? `  <gap lost="${n}"/>\n` : ""
    // ЗАПИСЬ НЕ БЫВАЕТ СИРОТОЙ. Если шаг не открыт — открываем его сами: запись, лежащая вне
    // <step>, теряется при чтении, а теряется в первую очередь ОТВЕТ МОДЕЛИ, ради которого
    // трейс и заведён. Открывать шаг обязанностью вызывающего делать нельзя.
    const opened = !xml.startsWith("  <step ") && !/<step name="[^"]*">(?![\s\S]*<\/step>)/.test(head)
      ? `  <step name="${esc(step)}">\n` : ""
    writeFileSync(file, `${head}${gap}${opened}${xml}</run>\n`)
    lost.delete(file)
    return ok(file)
  } catch (e) {
    lost.set(file, (lost.get(file) || 0) + 1)
    return err("runlog", `запись трейса не удалась: ${e.message}`)
  }
}

// FUNCTION_CONTRACT: begin — шаг начался
//   Interface:    begin(cwd, run, step) -> Result<string>
export const begin = (cwd, run, step) => write(cwd, run, step, `  <step name="${esc(step)}">\n`)

// FUNCTION_CONTRACT: inbox — что поступило на шаг
//   Interface:    inbox(cwd, run, step, data) -> Result<string>
export function inbox(cwd, run, step, data) {
  const b = body(typeof data === "string" ? data : JSON.stringify(data))
  return write(cwd, run, step, `    <in cut="${b.cut}">${b.text}</in>\n`)
}

// FUNCTION_CONTRACT: llm — наряд ушёл, ответ пришёл
//   Input:        { role, order, answer, tokens: {in, out, reasoning} }
//   Antecedent:   роль названа — по имени роли ответ потом ищут для заглушки
//   Consequent:   success: запись, из которой ОТВЕТ ДОСТАЁТСЯ ДОСЛОВНО, если он короче CUT_AT
//   Interface:    llm(cwd, run, step, {…}) -> Result<string>
export function llm(cwd, run, step, { role = "", order = "", answer = "", tokens = {} } = {}) {
  if (!role) return err("runlog", "запись llm без имени роли — заглушку теста потом не найти")
  const o = body(order), a = body(answer)
  const t = `in="${tokens.in || 0}" out="${tokens.out || 0}" reasoning="${tokens.reasoning || 0}"`
  return write(cwd, run, step,
    `    <llm role="${esc(role)}" ${t}>\n      <order cut="${o.cut}">${o.text}</order>\n      <answer cut="${a.cut}">${a.text}</answer>\n    </llm>\n`)
}

// FUNCTION_CONTRACT: out — куда легло
//   Interface:    out(cwd, run, step, path) -> Result<string>
export const out = (cwd, run, step, path) => write(cwd, run, step, `    <out at="${esc(path)}"/>\n`)

// FUNCTION_CONTRACT: verdict — что сказал гардрейл
//   Interface:    verdict(cwd, run, step, {ok, id, blockers}) -> Result<string>
export function verdict(cwd, run, step, v = {}) {
  const b = body(v.blockers || "")
  return write(cwd, run, step,
    `    <verdict ok="${v.ok ? "true" : "false"}" id="${esc(v.id || "")}" cut="${b.cut}">${b.text}</verdict>\n`)
}

// FUNCTION_CONTRACT: end — шаг закрыт
//   Interface:    end(cwd, run, step, status) -> Result<string>
export const end = (cwd, run, step, status) => write(cwd, run, step, `    <status>${esc(status)}</status>\n  </step>\n`)

// FUNCTION_CONTRACT: read — трейс как данные
//   Input:        cwd, run
//   Antecedent:   файл может быть оборван на середине — читается всё, что успело лечь
//   Consequent:   success: [{ step, status, answers: [{role, answer, cut}], out: [], verdicts: [] }]
//                 failure: Result.err("runlog", …), если файла нет
//   Purity:       io (fs)
//   Interface:    read(cwd, run) -> Result<Record[]>
export function read(cwd, run) {
  const file = pathOf(cwd, run)
  if (!existsSync(file)) return err("runlog", `трейса ${file} нет`)
  const text = readFileSync(file, "utf8")
  const un = (s) => String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
  const records = []
  for (const m of text.matchAll(/<step name="([^"]*)">([\s\S]*?)(?:<\/step>|$)/g)) {
    const [, step, inner] = m
    const answers = [...inner.matchAll(/<llm role="([^"]*)"[^>]*>[\s\S]*?<answer cut="(\d+)">([\s\S]*?)<\/answer>/g)]
      .map(([, role, cut, a]) => ({ role, cut: Number(cut), answer: un(a) }))
    const outs = [...inner.matchAll(/<out at="([^"]*)"\/>/g)].map(([, at]) => at)
    const verdicts = [...inner.matchAll(/<verdict ok="([^"]*)" id="([^"]*)" cut="\d+">([\s\S]*?)<\/verdict>/g)]
      .map(([, o, id, bl]) => ({ ok: o === "true", id, blockers: un(bl) }))
    const st = inner.match(/<status>([^<]*)<\/status>/)
    records.push({ step, status: st ? st[1] : "open", answers, out: outs, verdicts })
  }
  return ok(records)
}
