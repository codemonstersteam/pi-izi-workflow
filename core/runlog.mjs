// MODULE_CONTRACT: runlog — the run's memory: which steps have already been done, and with what
// Purpose:    one decision — HOW the band knows where to enter. Until this module the answer was
//             re-derived every launch by re-judging artefacts with their guardrails, and that answer
//             is not stable: a guardrail judges an artefact against the evidence available NOW, while
//             the evidence of a run is carried into .agent/prev/ by the next one. Live run c87db886
//             is the receipt — a green FRD, an approved plan, and two full replays of step 6 with
//             twenty questions asked again. A mark is written once, by the step that earned it, and
//             read by every later launch.
// io:         none — the caller brings the text and the artefacts' fingerprints, this module decides
// Invariants: every export is total: any input, including undefined, null and garbage, yields an
//             empty log or an empty answer and never throws;
//             a mark is keyed by `step`+`unit` — writing it twice REPLACES, so a repeated step does
//             not grow the file;
//             the writer REFUSES a value the format cannot carry instead of writing a line that
//             would parse back as something else (the discipline of core/answers.mjs);
//             a STEP is closed only by its own step-level mark (no `unit`) — a unit mark is progress
//             inside a step, and nothing here can know how many units a step was supposed to have.
// Interface:  newLog(text) -> Result<Log, "malformed">
//             render(log) -> Result<string, "unwritable">
//             begin(log, { key, at }) -> Log
//             mark(log, { step, name, unit, status, at, artifacts, note }) -> Log
//             ticket(log, { id, wave, status, at, note }) -> Log
//             resumeAt(log, { seen }) -> { from, why, closed }
//             done(log, { step, unit }) -> boolean
//             pending(log, { step, of }) -> string[]
//             LAST_STEP — the highest step number the ladder walks
//
// WHY A FORMAT OF OUR OWN. A YAML library would be a pipeline dependency, and those are forbidden
// (CLAUDE.md $START_FORBIDDEN; standards/code.md §CONTEXT). What is written here is YAML a human and
// `yq` can read, and a grammar narrow enough that thirty lines parse it: two nesting levels, a list
// of mappings, unquoted scalars. Everything wider is refused by the WRITER, so the reader never meets
// it — the same bargain core/xml.mjs makes with tags.

import { ok, err } from "./result.mjs"

// The ladder walks 1..LAST_STEP. A step that never writes a mark is never closed, and the band enters
// it again — which is the honest answer while a step is unimplemented, not a special case to code.
export const LAST_STEP = 15

const STEP_KEYS = Object.freeze(["step", "name", "unit", "status", "at", "note", "artifact", "sha256"])
const TICKET_KEYS = Object.freeze(["id", "wave", "status", "at", "note"])
const HEAD_KEYS = Object.freeze(["key", "started"])

const EMPTY = Object.freeze({ key: "", started: "", steps: Object.freeze([]), tickets: Object.freeze([]) })

const str = (v) => (v === undefined || v === null ? "" : String(v))
const unquote = (v) => (/^".*"$/.test(v) ? v.slice(1, -1) : v)
// A value the format cannot carry: a line break would become a new key, and a leading dash a new list
// item. Refusing beats escaping — an escape is a second grammar nobody reads.
const unwritable = (v) => /[\n\r]/.test(v) || /^\s*[-#]/.test(str(v).trim())

// ЗАМЕТКА — СВОБОДНЫЙ ТЕКСТ, И ОДНОСТРОЧНОЙ ЕЁ ДЕЛАЕТ КОД, А НЕ НАДЕЖДА. `note` несёт блокер
// гардрейла или слова оператора: то и другое бывает многострочным, а формат построчный. Свернуть
// перенос в « · » — не потеря: заметку читает человек, а вся правда лежит в артефакте, на который
// ссылается отметка. Остальные поля (`key`, `at`, `status`, пути) сворачивать НЕЛЬЗЯ — там перенос
// строки это дефект вызывающего, и `unwritable` обязан его отвергнуть.
//
// BUG_FIX_CONTEXT: live run 5b52f76d, 20.08.2026. The dry slicing of step 10б refused with a
// two-line blocker, the band marked step 9 for rework with `note: why.slice(0, 80)` — a slice that
// cuts the LENGTH but not the line break — `render` refused the value, `runlogPut` threw, and the
// run died as `crashed` right after PLAN.md had been assembled. Four call sites feed this field from
// a guardrail or from the operator's prose, so the fold belongs HERE, in the factory, not in any of
// them (standards/code.md, rule 1 and rule 7).
const oneLine = (v) => str(v).replace(/\s*[\r\n]+\s*/g, " · ").replace(/^\s*[-#]+\s*/, "").trim()

// FUNCTION_CONTRACT: newLog — the journal as data
//   Input:        text — the contents of .agent/run.yaml, or "" / undefined when there is none
//   Dependencies: STEP_KEYS, TICKET_KEYS, HEAD_KEYS — the vocabulary; an unknown key is a refusal
//   Antecedent:   any value
//   Consequent:   success: Result<Log> — `{ key, started, steps: Mark[], tickets: Ticket[] }`;
//                          empty text yields the EMPTY log, which is a success, not a failure
//                 failure: "malformed" — an unknown key, or a field before the entry it belongs to
//   Purity:       pure
export function newLog(text) {
  const lines = str(text).split("\n")
  const log = { key: "", started: "", steps: [], tickets: [] }
  let section = ""       // "steps" | "tickets"
  let entry = null
  let arts = false       // inside an `artifacts:` list
  let art = null

  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue
    const indent = raw.length - raw.trimStart().length
    const body = raw.trim()
    const item = body.startsWith("- ")
    const pair = (item ? body.slice(2) : body).match(/^([A-Za-z_][\w]*):\s*(.*)$/)
    if (!pair) return err("malformed", `строка не разбирается: «${body.slice(0, 60)}»`)
    const [, k, rawV] = pair
    const v = unquote(rawV.trim())

    if (indent === 0) {
      if (k === "steps" || k === "tickets") { section = k; entry = null; arts = false; continue }
      if (!HEAD_KEYS.includes(k)) return err("malformed", `неизвестный ключ шапки: ${k}`)
      log[k] = v
      continue
    }
    if (!section) return err("malformed", `поле «${k}» до раздела steps/tickets`)

    // ОТСТУП ЗАКРЫВАЕТ СПИСОК АРТЕФАКТОВ. Артефакты живут глубже (отступ 6), поэтому ЛЮБАЯ строка на
    // четвёртом уровне — снова поле записи или её начало, а не продолжение списка.
    //
    // BUG_FIX_CONTEXT: два живых дефекта одной границы. Первый нашла замена на артефактах eddi:
    // `- step:` после списка читался как артефакт («неизвестный ключ артефакта: step»). Второй —
    // живой прогон: `note` пишется ПОСЛЕ артефактов, разбор спотыкался на нём, `runlogOf` молча
    // отдавал null, и отметка начинала журнал с чистого листа — двенадцать закрытых шагов исчезли.
    if (indent <= 4) arts = false
    if (item && indent <= 4) {
      entry = section === "steps" ? { artifacts: [] } : {}
      log[section].push(entry)
      arts = false
    } else if (!entry) {
      return err("malformed", `поле «${k}» до первой записи раздела ${section}`)
    }

    if (section === "steps" && k === "artifacts") { arts = true; art = null; continue }
    if (arts) {
      if (item) { art = {}; entry.artifacts.push(art) }
      if (!art) return err("malformed", "поле артефакта до его строки списка")
      if (k !== "path" && k !== "sha256") return err("malformed", `неизвестный ключ артефакта: ${k}`)
      art[k] = v
      continue
    }

    const vocab = section === "steps" ? STEP_KEYS : TICKET_KEYS
    if (!vocab.includes(k)) return err("malformed", `неизвестный ключ записи ${section}: ${k}`)
    // The compact one-artefact form: `artifact:`+`sha256:` beside the entry's own fields.
    if (k === "artifact") { entry.artifacts.push({ path: v, sha256: "" }); continue }
    if (k === "sha256") {
      const last = entry.artifacts[entry.artifacts.length - 1]
      if (!last) return err("malformed", "sha256 без artifact")
      last.sha256 = v
      continue
    }
    entry[k] = k === "step" || k === "wave" ? Number(v) : v
  }
  return ok(freeze(log))
}

// ОДНА ФОРМА ЗАПИСИ, ОТКУДА БЫ ОНА НИ ПРИШЛА. Писатель опускает пустые поля — файл читает человек, и
// `note: ` без значения ему ничего не говорит. Значит разбор обязан вернуть недостающие поля пустыми,
// иначе «собрали → разобрали» отдаёт не то, что клали, и сравнить два журнала становится нечем.
const freeze = (log) => Object.freeze({
  key: str(log.key),
  started: str(log.started),
  steps: Object.freeze((log.steps || []).map((s) => Object.freeze({
    step: Number(s.step) || 0,
    name: str(s.name),
    unit: str(s.unit),
    status: str(s.status),
    at: str(s.at),
    note: str(s.note),
    artifacts: Object.freeze((s.artifacts || []).map((a) => Object.freeze({ path: str(a.path), sha256: str(a.sha256) }))),
  }))),
  tickets: Object.freeze((log.tickets || []).map((t) => Object.freeze({
    id: str(t.id),
    wave: t.wave === undefined || t.wave === null || t.wave === "" ? "" : Number(t.wave) || 0,
    status: str(t.status),
    at: str(t.at),
    note: str(t.note),
  }))),
})

// FUNCTION_CONTRACT: render — the journal as text
//   Input:        log — a Log, or anything at all
//   Dependencies: unwritable — the border of the format
//   Antecedent:   any value
//   Consequent:   success: Result<string> ending in a newline; one artefact is written in the compact
//                          `artifact:`/`sha256:` form, several as an `artifacts:` list
//                 failure: "unwritable" — a value carrying a line break or opening a list item
//   Purity:       pure
export function render(log) {
  const l = log && typeof log === "object" ? log : EMPTY
  const out = []
  const put = (pad, k, v) => {
    const s = str(v)
    if (!s) return true
    if (unwritable(s)) { out.bad = `${k}: «${s.slice(0, 40)}»`; return false }
    out.push(`${pad}${k}: ${s}`)
    return true
  }
  if (!put("", "key", l.key) || !put("", "started", l.started)) return err("unwritable", `значение не переносится форматом — ${out.bad}`)

  if ((l.steps || []).length) {
    out.push("steps:")
    for (const s of l.steps) {
      out.push(`  - step: ${Number(s.step) || 0}`)
      for (const k of ["name", "unit", "status", "at"]) if (!put("    ", k, s[k])) return err("unwritable", `значение не переносится форматом — ${out.bad}`)
      const arts = (s.artifacts || []).filter((a) => a && a.path)
      if (arts.length === 1) {
        if (!put("    ", "artifact", arts[0].path) || !put("    ", "sha256", arts[0].sha256)) return err("unwritable", `значение не переносится форматом — ${out.bad}`)
      } else if (arts.length > 1) {
        out.push("    artifacts:")
        for (const a of arts) {
          if (!put("      - ", "path", a.path)) return err("unwritable", `значение не переносится форматом — ${out.bad}`)
          if (!put("        ", "sha256", a.sha256)) return err("unwritable", `значение не переносится форматом — ${out.bad}`)
        }
      }
      if (!put("    ", "note", s.note)) return err("unwritable", `значение не переносится форматом — ${out.bad}`)
    }
  }
  if ((l.tickets || []).length) {
    out.push("tickets:")
    for (const t of l.tickets) {
      out.push(`  - id: "${str(t.id)}"`)
      if (t.wave !== undefined && t.wave !== null && t.wave !== "") out.push(`    wave: ${Number(t.wave) || 0}`)
      for (const k of ["status", "at", "note"]) if (!put("    ", k, t[k])) return err("unwritable", `значение не переносится форматом — ${out.bad}`)
    }
  }
  return ok(`${out.join("\n")}\n`)
}

// FUNCTION_CONTRACT: begin — the journal's header
//   Input:        log — the journal so far; { key, at } — the task key and the ISO time of the launch
//   Dependencies: —
//   Antecedent:   any values
//   Consequent:   success: a new Log with the header set; the marks are kept, because a new LAUNCH is
//                          not a new run — the whole point is that its predecessor's work stands
//                 failure: none — total
//   Purity:       pure
export const begin = (log, { key = "", at = "" } = {}) => freeze({
  ...(log && typeof log === "object" ? log : EMPTY),
  key: str(key) || str((log || {}).key),
  started: str((log || {}).started) || str(at),
})

// FUNCTION_CONTRACT: mark — one step's receipt
//   Input:        { step, name, unit, status, at, artifacts, note }
//                 artifacts — [{ path, sha256 }], the files this step is answerable for
//   Dependencies: oneLine — `note` is free text and is folded to one line here
//   Antecedent:   any values; `step` that is not a number makes the mark unreachable by the ladder,
//                 which is why the caller's contract names it
//   Consequent:   success: a new Log where the mark for this `step`+`unit` REPLACES the previous one,
//                          its `note` folded to a single line the format can carry
//                 failure: none — total
//   Purity:       pure
export function mark(log, { step, name = "", unit = "", status = "", at = "", artifacts = [], note = "" } = {}) {
  const l = log && typeof log === "object" ? log : EMPTY
  const one = {
    step: Number(step) || 0,
    unit: str(unit),
    name, status, at, note: oneLine(note),
    artifacts: (Array.isArray(artifacts) ? artifacts : []).filter((a) => a && a.path),
  }
  const same = (m) => Number(m.step) === one.step && str(m.unit) === one.unit
  const kept = (l.steps || []).filter((m) => !same(m))
  return freeze({ ...l, steps: [...kept, one] })
}

// FUNCTION_CONTRACT: ticket — one implementer ticket's receipt (step 15)
//   Input:        { id, wave, status, at, note }
//   Dependencies: oneLine — `note` is free text and is folded to one line here
//   Antecedent:   any values
//   Consequent:   success: a new Log where the row for this `id` REPLACES the previous one, its
//                          `note` folded to a single line the format can carry
//                 failure: none — total
//   Purity:       pure
export function ticket(log, { id, wave = "", status = "", at = "", note = "" } = {}) {
  const l = log && typeof log === "object" ? log : EMPTY
  const one = { id: str(id), wave: wave === "" ? "" : Number(wave) || 0, status: str(status), at: str(at), note: oneLine(note) }
  const kept = (l.tickets || []).filter((t) => str(t.id) !== one.id)
  return freeze({ ...l, tickets: [...kept, one] })
}

// FUNCTION_CONTRACT: done — is this unit closed
//   Input:        { step, unit } — unit "" asks about the STEP-level mark
//   Dependencies: —
//   Antecedent:   any values
//   Consequent:   success: true when a mark with this step and unit carries status "done" or "skipped"
//                 failure: none — total
//   Purity:       pure
export const done = (log, { step, unit = "" } = {}) =>
  ((log || {}).steps || []).some((m) => Number(m.step) === Number(step) && str(m.unit) === str(unit) && (m.status === "done" || m.status === "skipped"))

// FUNCTION_CONTRACT: pending — the units of a step that are not closed yet
//   Input:        { step, of } — `of` is every unit the step was going to do, in the caller's order
//   Dependencies: done
//   Antecedent:   any values
//   Consequent:   success: the members of `of` with no `done` mark, order preserved
//                 failure: none — total
//   Purity:       pure
export const pending = (log, { step, of = [] } = {}) =>
  (Array.isArray(of) ? of : []).map(str).filter((u) => !done(log, { step, unit: u }))

// FUNCTION_CONTRACT: resumeAt — where the band enters
//   Input:        { seen } — path → sha256 for every artefact the journal names, null when the file
//                 is gone; the CALLER reads the disk, this module only compares
//   Dependencies: LAST_STEP, done
//   Antecedent:   any values
//   Consequent:   success: { from, why, closed } — `from` is the first step of 1..LAST_STEP that is
//                          not closed, `why` names the reason IN THE OPERATOR'S WORDS, `closed` lists
//                          the steps behind it
//                 failure: none — total
//   Purity:       pure
//
// A STEP IS CLOSED BY ITS RECEIPT PLUS ITS ARTEFACT'S FINGERPRINT. The receipt alone would trust a
// file edited by hand since; the artefact alone is what the old ladder did, and it re-judged history
// against evidence that had moved. Both together answer the only question asked here: did THIS step,
// as recorded, actually leave what it said it left.
export function resumeAt(log, { seen = {} } = {}) {
  const l = log && typeof log === "object" ? log : EMPTY
  const fp = seen && typeof seen === "object" ? seen : {}
  const closed = []
  for (let step = 1; step <= LAST_STEP; step++) {
    const m = (l.steps || []).find((x) => Number(x.step) === step && !str(x.unit))
    if (!m) return { from: step, why: closed.length ? `в журнале нет отметки о шаге ${step}` : "журнала нет — прогон с нуля", closed }
    // `skipped` закрывает шаг наравне с `done`: это ЗАЯВЛЕНИЕ полосы «я его не делаю» — так помечены
    // шаги, отложенные до своего наряда. Без него лестница встаёт на первом же отложенном шаге и
    // вечно переигрывает всё, что стоит ЗА ним.
    if (m.status !== "done" && m.status !== "skipped") return { from: step, why: `шаг ${step} остался в состоянии «${m.status || "без статуса"}» — прогон оборвало на нём`, closed }
    for (const a of m.artifacts || []) {
      const now = fp[a.path]
      if (now === null || now === undefined) return { from: step, why: `артефакт шага ${step} исчез: ${a.path}`, closed }
      if (a.sha256 && now !== a.sha256) return { from: step, why: `артефакт шага ${step} изменён после отметки: ${a.path}`, closed }
    }
    closed.push(step)
  }
  return { from: LAST_STEP + 1, why: "полоса пройдена целиком", closed }
}
