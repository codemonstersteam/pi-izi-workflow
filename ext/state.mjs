// MODULE_CONTRACT: state — владелец формы состояния конвейера и его истории
// Purpose:    одно решение спрятано здесь: КАКОЕ состояние имеет право существовать и с чего прогон
//             продолжается. Ни песочница, ни шаг состояние не придумывают.
// io:         fs
// EXTERNAL_DEPENDENCY: ext/values.mjs — конструкторы вердиктов и порций; core/result.mjs — форма
//             Result. Трейс прогона НЕ импортируется: его писатель и его записи приезжают
//             параметром — иначе служба и её журнал ссылались бы друг на друга.
// Invariants: невалидное состояние НЕ СОЗДАЁТСЯ — возвращается отказ; put не мутирует вход;
//             `at` держит путь И ОТПЕЧАТОК, потому что «шаг закрыт» ничего не говорит о содержимом.
// Interface:  STEPS, DEFAULT_BUDGETS, start, put, finish, close, resume, verdicts, sha1of
//
// СЛОВАРЬ ИМЁН ШАГОВ ЖИВЁТ ЗДЕСЬ, и мост берёт его отсюда. Два владельца словаря означали бы, что
// `closed` пишется одним написанием, а зовётся другим, и шаг никогда не считается закрытым — при
// этом ни один шов не краснеет, потому что строка есть строка.

import { existsSync, statSync, readFileSync, writeFileSync, mkdirSync, renameSync, rmSync, readdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { createHash } from "node:crypto"
import { ok, err } from "../core/result.mjs"
import { verdict as newVerdict, portion as newPortion } from "./values.mjs"

export const STEPS = [
  "task", "brd", "scope", "graph", "intake", "weight", "ripple",
  "brd/normalize", "brd/anchors",
  "plan/values", "plan/tree", "plan/flows",
]

// Бюджеты целиком, а не три поля. intakeLoops куплен прогоном e132f0a1; checkpointRetries держит
// переспрос оператору; maxParallel ПОНИЖАЕТ литеральную ширину роя, поднять её он не может.
export const DEFAULT_BUDGETS = Object.freeze({
  loops: 3, intakeLoops: 6, questionRounds: 5, checkpointRetries: 2,
  maxParallel: 8, reviewRounds: 2, orderCap: 800000,
})

const STATE_PATH = ".agent/state.json"
const STAGING = ".agent/staging"
const PREV = ".agent/prev"

export const sha1of = (text) => createHash("sha1").update(String(text)).digest("hex")

const isStr = (v) => typeof v === "string" && v.trim() !== ""
const clone = (v) => JSON.parse(JSON.stringify(v))

// FUNCTION_CONTRACT: shape — единственная проверка формы; и start, и put, и resume идут через неё
//   Antecedent:   cwd — существующий каталог; key непуст; budgets — полный словарь;
//                 closed ⊆ STEPS; каждый элемент `at` несёт path и sha1; порции строятся своим
//                 конструктором; круг каждой порции ≤ loops + 1
//   Consequent:   success: Result.ok(State); failure: Result.err("state", …) с ИМЕНЕМ поля
//   Purity:       io (проверяет существование cwd)
//   BUG_FIX_CONTEXT: границы-часовые. Антецедент `round ≤ loops` делает НЕДОСТИЖИМЫМИ обе
//                 терминальные ветви next: состояние «круги исчерпаны» (escalate) просто не
//                 создаётся, и шаг либо крутится вечно, либо умирает на успешном ходе. Поэтому
//                 предел здесь `loops + 1`: часовой обязан существовать.
function shape(raw) {
  if (!raw || typeof raw !== "object") return err("state", "состояние не объект")
  if (!isStr(raw.cwd) || !existsSync(raw.cwd) || !statSync(raw.cwd).isDirectory())
    return err("state", `cwd «${raw.cwd}» не существует — состояние прогона без каталога прогона`)
  if (!isStr(raw.run)) return err("state", "состояние без идентификатора прогона — трейс некуда писать")

  const b = { ...DEFAULT_BUDGETS, ...(raw.budgets || {}) }
  for (const k of Object.keys(DEFAULT_BUDGETS))
    if (!Number.isInteger(b[k]) || b[k] < 1) return err("state", `budgets.${k} = «${b[k]}» — целое от 1`)

  const closed = Array.isArray(raw.closed) ? raw.closed : []
  for (const s of closed) if (!STEPS.includes(s)) return err("state", `в closed шаг «${s}», которого нет в словаре: ${STEPS.join(" · ")}`)

  const at = {}
  for (const [name, v] of Object.entries(raw.at || {})) {
    if (!v || !isStr(v.path)) return err("state", `at.${name} без пути`)
    if (!isStr(v.sha1)) return err("state", `at.${name} без отпечатка — «шаг закрыт» ничего не говорит о содержимом файла`)
    at[name] = { path: v.path, sha1: v.sha1 }
  }

  const portions = []
  for (const p of raw.portions || []) {
    const r = newPortion(p)
    if (!r.ok) return err("state", r.error.detail)
    if (r.value.round > b.loops + 1) return err("state", `порция ${r.value.id}: круг ${r.value.round} за пределом бюджета ${b.loops}`)
    portions.push(r.value)
  }

  const verdicts = []
  for (const v of raw.verdicts || []) {
    const r = newVerdict(v)
    if (!r.ok) return err("state", r.error.detail)
    verdicts.push(r.value)
  }

  let question = null
  if (raw.question) {
    const q = raw.question
    if (!isStr(q.name)) return err("state", "вопрос без имени паузы — хост ключует паузу по имени, и второй вопрос до оператора не доедет")
    if (!Array.isArray(q.items) || !q.items.length) return err("state", "вопрос без items — отвечать будет не по чему")
    question = { of: q.of || "", name: q.name, items: [...q.items], retry: Number.isInteger(q.retry) ? q.retry : 1 }
  }

  const asked = Number.isInteger(raw.asked) ? raw.asked : 0
  if (asked < 0) return err("state", `asked = ${asked}`)

  return ok({ cwd: raw.cwd, key: raw.key || "", run: raw.run, budgets: b, closed: [...closed], at, portions, asked, question, verdicts })
}

// FUNCTION_CONTRACT: start — первый акт прогона
//   Input:        { cwd, run, key, budgets } — run задаётся снаружи: Date в песочнице недоступен
//   Dependencies: shape
//   Antecedent:   cwd существует; run непуст
//   Consequent:   success: чистое состояние; прошлое унесено в .agent/prev/, .agent/staging/ ПУСТ
//                 failure: Result.err("state", …)
//   Purity:       io (fs)
//   BUG_FIX_CONTEXT: незаконченный черновик, оставшийся на пути доставки, судится как ответ ЭТОГО
//                 круга — круг потрачен, шаг закрыт непочиненным. Поэтому staging чистится ЗДЕСЬ,
//                 один раз и до всего, а не «когда-нибудь в шаге».
export function start({ cwd, run, key = "", budgets = {} } = {}) {
  const built = shape({ cwd, run, key, budgets, closed: [], at: {}, portions: [], asked: 0, verdicts: [] })
  if (!built.ok) return built
  const carried = []
  const prev = join(cwd, PREV)
  mkdirSync(prev, { recursive: true })
  for (const rel of [".agent/answers.md", ".agent/pending.json", ".agent/ask.xml", STATE_PATH]) {
    const src = join(cwd, rel)
    if (!existsSync(src)) continue
    renameSync(src, join(prev, rel.split("/").pop()))
    carried.push(rel)
  }
  const stg = join(cwd, STAGING)
  if (existsSync(stg)) { for (const f of readdirSync(stg)) rmSync(join(stg, f), { recursive: true, force: true }) }
  mkdirSync(stg, { recursive: true })
  return ok({ ...built.value, carried })
}

// FUNCTION_CONTRACT: put — новое состояние из патча
//   Antecedent:   патч оставляет состояние валидным по shape
//   Consequent:   success: НОВЫЙ объект; вход не тронут
//                 failure: Result.err("state", …) — и прежнее состояние остаётся в силе
//   Purity:       io (через shape: проверка cwd)
//   BUG_FIX_CONTEXT: `{...state, round: state.round + 1}` в fold означает, что конструктор-гардрейл
//                 срабатывает ОДИН раз за прогон, а следующие N состояний создаются в обход него.
//                 Поэтому шаг обязан возвращать put(...), и это сторожит шов правила 4.
export function put(state, patch = {}) {
  const built = shape({ ...clone(state), ...clone(patch) })
  if (!built.ok) return built
  return ok(built.value)
}

// FUNCTION_CONTRACT: close — шаг закрыт, артефакт продвинут
//   Input:        state; step — имя из STEPS; artifacts — { имя: путь } продвинутых файлов
//   Dependencies: sha1of, put
//   Antecedent:   step в STEPS; каждый названный файл СУЩЕСТВУЕТ и читается
//   Consequent:   success: closed пополнен, at несёт путь и sha1 каждого артефакта, порции и
//                          вопрос сброшены — следующий шаг начинает с чистого состава
//                 failure: Result.err("state", …) с именем файла
//   Purity:       io (fs)
// FUNCTION_CONTRACT: finish — подшаг кончился: его состав работы умирает вместе с ним
//   Input:        state — состояние прогона
//   Dependencies: put
//   Antecedent:   — (тотальна; на состоянии без порций возвращает его же)
//   Consequent:   success: состояние без порций и без вопроса; failure: Result.err, как у put
//   Purity:       io (через put: проверка cwd)
//   Interface:    finish(state) -> Result<State>
//
//   ПОРЦИЯ ПРИНАДЛЕЖИТ ОДНОМУ ПОДШАГУ, а `state.portions` — общий список, и имени владельца порция
//   не несёт (ext/values.mjs::portion). Прогон 24.08.2026 на eddi показал цену: подшаг 2A кончил,
//   оставив две свои порции со статусом `green`; `brd/anchors` прочитал `portions[0]`, увидел не
//   `todo` и вернул `done`, НЕ СДЕЛАВ НИЧЕГО (steps/brd/anchors/anchors.step.mjs:71,81). Три звена
//   из пяти промолчали без единого блокера, `.agent/brd.md` не собрался. Та же ветка стоит в
//   `steps/plan/values/values.step.mjs:46`.
//
//   ВОПРОС ГАСИТСЯ ВМЕСТЕ С ПОРЦИЯМИ и по той же причине: `anchors.step.mjs:67` проверяет
//   `state.question` ДО порций, и чужой неотвеченный вопрос увёл бы следующий подшаг на рельс паузы.
//   Правило написано ЗДЕСЬ один раз; исполняют его двое — `close` (шаг закрыт с артефактом) и
//   `ext/bridge.mjs::stepNext` (шаг сказал `done`).
export function finish(state) {
  return put(state, { portions: [], question: null })
}

export function close(state, step, artifacts = {}) {
  if (!STEPS.includes(step)) return err("state", `шаг «${step}» вне словаря: ${STEPS.join(" · ")}`)
  const at = { ...state.at }
  for (const [name, rel] of Object.entries(artifacts)) {
    const abs = join(state.cwd, rel)
    if (!existsSync(abs)) return err("state", `${rel} не существует — шаг ${step} объявил артефакт, которого нет`)
    at[name] = { path: rel, sha1: sha1of(readFileSync(abs, "utf8")) }
  }
  const cleared = finish(state)
  if (!cleared.ok) return cleared
  const next = put(cleared.value, { closed: [...new Set([...state.closed, step])], at })
  if (!next.ok) return next
  writeFileSync(join(state.cwd, STATE_PATH), `${JSON.stringify(next.value, null, 2)}\n`)
  return next
}

// FUNCTION_CONTRACT: resume — с чего продолжать
//   Input:        cwd; trace — записи трейса ({ step, status }[]), ИСТОЧНИК ИСТИНЫ
//   Dependencies: shape
//   Antecedent:   снимок читается и разбирается; его cwd совпадает с текущим; его closed НЕ
//                 расходится с трейсом; sha1 каждого артефакта совпадает с диском
//   Consequent:   success: { state, from } — from это шаг, с которого продолжать
//                 failure: Result.err("state", …) с именем шага или файла
//   Purity:       io (fs)
//   BUG_FIX_CONTEXT: «с чего продолжать» сегодня решают три механизма — это и есть болезнь. Здесь
//                 источник ОДИН: трейс. Снимок — кэш, и расхождение с трейсом это отказ, а не
//                 повод выбрать что-нибудь. Отпечаток же ловит правку руками между прогонами:
//                 closed продолжал бы утверждать, что шаг зелен, по документу, которого больше нет.
export function resume(cwd, trace = []) {
  const snap = join(cwd, STATE_PATH)
  if (!existsSync(snap)) return err("state", "снимка нет — прогон с нуля")
  let raw
  try { raw = JSON.parse(readFileSync(snap, "utf8")) } catch (e) { return err("state", `снимок не разбирается: ${e.message}`) }
  if (raw.cwd !== cwd) return err("state", `снимок от чужого каталога: ${raw.cwd}`)

  const built = shape({ ...raw, cwd })
  if (!built.ok) return built
  const state = built.value

  const traced = trace.filter((t) => t.status === "done").map((t) => t.step)
  for (const s of state.closed)
    if (traced.length && !traced.includes(s)) return err("state", `снимок считает шаг «${s}» закрытым, а трейс его не знает`)

  for (const s of state.closed) {
    for (const [name, v] of Object.entries(state.at)) {
      const abs = join(cwd, v.path)
      if (!existsSync(abs)) return err("state", `${v.path} исчез — шаг, который его дал, переигрывается`)
      if (sha1of(readFileSync(abs, "utf8")) !== v.sha1)
        return err("state", `${v.path} изменился после того, как его продвинули — «${name}» больше не тот документ, шаг переигрывается`)
    }
    void s
  }

  const from = STEPS.find((s) => !state.closed.includes(s)) || null
  return ok({ state, from })
}

// FUNCTION_CONTRACT: verdicts — вердикты шага
//   Antecedent:   —
//   Consequent:   success: вердикты, отфильтрованные по шагу (или все, если шаг не назван)
//   Purity:       pure
export const verdicts = (state, step) => (step ? state.verdicts.filter((v) => v.step === step) : state.verdicts)
