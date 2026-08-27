// MODULE_CONTRACT: stations — станционный движок solo: next/fold над четырьмя станциями
// Purpose:    одно решение: КАКАЯ станция говорит сейчас и куда кладётся ответ. Станции:
//             draft (план пишет planner по спеке) → critic (смысл судит критик) →
//             approve (ask оператору) → solve (dev по строкам Ф, судьи a/b/c) → done.
// io:         fs (чтение TASK/PROMPT/чертей круга, запись PLAN.md; git — судьи solve)
// EXTERNAL_DEPENDENCY: judges/draft.mjs, judges/solve.mjs — чистые судьи; answers.mjs —
//             ответы оператора как значения.
// Invariants: круг тратится только на красный ВЕРДИКТ своей станции; обрыв (err-конверт) круг
//             не тратит; вопросы — ask-рельсой, круг не тратят; budgets.loops на станцию.
// Interface:  soloStart, soloNext, soloFold
import { execSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { judgeDraft } from "./judges/draft.mjs"
import { judgeSolve } from "./judges/solve.mjs"

const ok = (fields) => ({ track: "ok", ...fields })
const err = (kind, subject) => ({ track: "err", kind, subject })
const readAt = (cwd, rel) => (existsSync(join(cwd, rel)) ? readFileSync(join(cwd, rel), "utf8") : "")
const here = (p) => new URL(p, import.meta.url).pathname


// summarizePlan — верхнеуровневый синтез для карточки approve: оператор видит,
// ЧТО он утверждает, не открывая файл. Считает строки таблиц и зовёт первые вопросы.
const rowsIn = (plan, name) => {
  const m = plan.match(new RegExp(`^#+\\s*(\\d+\\.\\s*)?${name}\\s*$`, "mi"))
  if (!m) return []
  const after = plan.slice(m.index + m[0].length)
  const next = after.match(/^#+\\s/m)
  const sec = next ? after.slice(0, next.index) : after
  return sec.split("\n").filter((l) => l.trim().startsWith("|")).filter((l) => !/^\s*\|[\s\-:|]+\|\s*$/.test(l)).slice(1)
}
const summarizePlan = (plan) => {
  const req = rowsIn(plan, "ТРЕБОВАНИЯ"), chg = rowsIn(plan, "ИЗМЕНЕНИЯ"), val = rowsIn(plan, "ВЕЛИЧИНЫ")
  const scen = (plan.match(/^#{2,4}\s*(Сценарий|Сценарии|###?\s*С\d)/gmi) || []).length
  const guar = (plan.slice((plan.match(/^#+\s*(\d+\.)?\s*ГАРАНТИИ/mi) || { index: 0 }).index).match(/^\s*\d+\./gm) || []).length
  const files = chg.map((l) => (l.split("|")[2] || "").replace(/`/g, "").trim()).filter(Boolean)
  const newFiles = files.filter((f) => !existsSync(join(CWD_NOW, f))).length
  const qs = rowsIn(plan, "ОТКРЫТЫЕ ВОПРОСЫ").slice(0, 3).map((l) => "  · " + (l.split("|").slice(1).map((c) => c.trim()).join(" — ") || l.replace(/^\\s*\\|/, "")).slice(0, 110))
  return [
    `Синтез: ${req.length} требований (цитаты TASK) · ${chg.length} строк изменений (${newFiles} новых файлов, ${files.length - newFiles} существующих) · ${scen} сценариев · ${val.length} величин с источниками · ${guar} гарантий · вопросов оператору: ${rowsIn(plan, "ОТКРЫТЫЕ ВОПРОСЫ").length}`,
    files.length ? `Файлы: ${[...new Set(files)].slice(0, 6).join("; ")}` : "",
    qs.length ? `Открытые вопросы (первые):\n${qs.join("\n")}` : "",
  ].filter(Boolean).join("\n")
}
let CWD_NOW = ""

const STATIONS = ["draft", "critic", "approve", "solve"]
const DRAFT_STAGING = ".agent/staging/PLAN~draft.md"
const PLAN = ".agent/PLAN.md"
const DEFAULT_LOOPS = 3

// soloStart — первый ход: собрать состояние прогона (или отказ с именем).
export function soloStart({ key = "" } = {}, ctx = {}) {
  const cwd = ctx?.run?.cwd || process.cwd()
  if (!existsSync(cwd)) return err("state", `каталог прогона «${cwd}» не существует`)
  const task = readAt(cwd, "TASK.md")
  if (!task.trim()) return err("no-task", "TASK.md в корне проекта пуст или отсутствует — solo не с чего начать")
  return ok({
    state: {
      cwd, key: String(key || "").trim(),
      station: "draft", round: 1, blockers: "", question: null, cardShown: false,
      loops: DEFAULT_LOOPS, solveStart: null, answers: "",
    },
    from: "fresh",
  })
}

// specOf — артефакт-спека: PROMPT.md проекта перекрывает дефолтную из пакета.
const specOf = (cwd) => {
  const own = readAt(cwd, "PROMPT.md")
  return own.trim() ? own : readFileSync(here("./spec/PROMPT.default.md"), "utf8")
}

const feedbackBlock = (blockers, answers) => {
  const parts = []
  if (blockers && blockers.trim()) parts.push(`$START_FEEDBACK\n${blockers.trim()}\n$END_FEEDBACK`)
  if (answers && answers.trim()) parts.push(`$START_ANSWERED\n${answers.trim()}\n$END_ANSWERED`)
  return parts.join("\n\n")
}

// soloNext — ЧТО делать: role | ask | done | err.
export function soloNext({ state } = {}) {
  if (!state || !state.cwd) return { do: "err", ...err("state", "soloNext получил состояние без cwd") }
  const s = state
  if (s.round > (s.loops || DEFAULT_LOOPS)) {
    return { do: "err", ...err("escalate", `станция ${s.station} не чинится за ${s.loops} круга`) }
  }
  if (s.station === "done") return { do: "done", state: s }
  if (s.question) {
    return { do: "ask", name: s.question.name, prompt: s.question.items[0], items: s.question.items }
  }
  const fb = feedbackBlock(s.blockers, s.answers)

  if (s.station === "draft") {
    const previous = readAt(s.cwd, DRAFT_STAGING)
    const text = `$START_TASK
Ты планировщик. ${specOf(s.cwd)}$END_TASK

$START_DATA
$START_DOCUMENT
path: TASK.md
Заказ оператора, байты как есть. Единственный источник требований.
$END_DOCUMENT
$START_CONTENT
${readAt(s.cwd, "TASK.md")}$END_CONTENT
$END_DATA
${previous.trim() ? `\n$START_PREVIOUS\npath: ${DRAFT_STAGING}\nТВОЙ ЧЕРНОВИК как он лежит на диске. FEEDBACK называет что чинить — правь названное, остальное не трогай.\n$START_CONTENT\n${previous}$END_CONTENT\n$END_PREVIOUS\n` : ""}
${fb}
$START_OUTPUT
path: ${DRAFT_STAGING}
Пиши файл инструментом write по этому пути, затем один раз workflow_result:
{ "track": "ok", "artifact": "${DRAFT_STAGING}" } — или { "track": "err", "kind": "blocked", "subject": "…" }.
$END_OUTPUT`
    return { do: "role", role: "planner", text, staging: DRAFT_STAGING }
  }

  if (s.station === "critic") {
    const plan = readAt(s.cwd, DRAFT_STAGING)
    const text = `$START_TASK
Ты критик плана. Прочитай план ниже и ПРОВЕРЬ его по чек-листу — выборочно сверяй утверждения
с реальным кодом (читай файлы репозитория инструментом read):
1. ТРЕБОВАНИЯ: каждая строка раздела 1 — цитата из TASK.md, и названное место закрытия реально закрывает её.
2. ИЗМЕНЕНИЯ: каждый путь существует (или честно «новый» с образцом); контракт в строке соответствует коду образца.
3. СЦЕНАРИИ: до и после различны; «до» описывает текущий код, а не мечту.
4. ВЕЛИЧИНЫ: у каждой есть источник; числа без источника — к вопросам.
5. ГАРАНТИИ: поимённы и правдоподобны относительно кода.
6. ОТКРЫТЫЕ ВОПРОСЫ: то, что решать оператору, а не молчаливые допущения.
Вердикт: APPROVE — план исполняем; или REJECT с НЕ БОЛЕЕ ТРЁХ блокеров, каждый с адресом
(раздел + строка) и чем он станет ошибкой разработки.
$END_TASK

$START_DATA
$START_DOCUMENT
path: ${DRAFT_STAGING}
План, который судишь.
$END_DOCUMENT
$START_CONTENT
${plan}$END_CONTENT

$START_DOCUMENT
path: TASK.md
Заказ — высшая инстанция.
$END_DOCUMENT
$START_CONTENT
${readAt(s.cwd, "TASK.md")}$END_CONTENT
$END_DATA
$START_OUTPUT
Один вызов workflow_result: { "track": "ok", "verdict": "APPROVE" } или
{ "track": "ok", "verdict": "REJECT", "blockers": ["…", "…"], "questions": ["что решить оператору", …] }.
$END_OUTPUT`
    return { do: "role", role: "critic", text, staging: DRAFT_STAGING }
  }

  if (s.station === "approve") {
    // КАРТОЧКА ПРЕЗЕНТАЦИИ: план готов · что делать · путь · синтез. Скажена ОДИН раз —
    // до вопроса; оператор утверждает осознанно, а не вслепую по однострочному вопросу.
    if (!s.cardShown) {
      CWD_NOW = s.cwd
      const plan = readAt(s.cwd, DRAFT_STAGING)
      const card = [
        "═══ ПЛАН ГОТОВ — ждём решения оператора ═══",
        `Что делать: прочитай план по пути ${PLAN} (или .agent/staging/PLAN~draft.md),`,
        "затем ответь на следующий вопрос: да (approve) / нет + причина.",
        `Критик: ${s.criticVerdict || "APPROVE"}.`,
        summarizePlan(plan),
      ].join("\n")
      return { do: "say", line: card }
    }
    return { do: "ask", name: "solo-approve", prompt: "План лежит в .agent/PLAN.md — прочитай. Согласен?", items: ["План лежит в .agent/PLAN.md — прочитай его. Согласен вести разработку по нему? Ответь: да (approve) / нет (reject + причина)"] }
  }

  if (s.station === "solve") {
    const plan = readAt(s.cwd, PLAN)
    const text = `$START_TASK
Разработай по плану ниже. Правила:
1. работай маленькими итерациями с тестами; итерация = строка Ф = коммит
   (сообщение коммита — со ссылками на §плана и принятыми решениями)
2. величины — только из раздела 4; гарантии раздела 5 нерушимы
3. существующие тесты не переписывать
Баг плана нашёл по мелочи (пример/опечатка) — правь PLAN.md с обоснованием в коммите.
Нужно изменить поведение/требование/гарантию — верни err-конверт kind="blocked" с вопросом.
$END_TASK

$START_DATA
$START_DOCUMENT
path: ${PLAN}
Утверждённый оператором план — единственная инструкция.
$END_DOCUMENT
$START_CONTENT
${plan}$END_CONTENT
$END_DATA
${fb}
$START_OUTPUT
Работай в репозитории инструментами (read/bash/edit/write), коммить сам (git add -A && git commit).
Закончив ВСЕ строки Ф — один вызов workflow_result: { "track": "ok", "artifact": "${PLAN}" }.
Не можешь продолжать — { "track": "err", "kind": "blocked", "subject": "…" }.
$END_OUTPUT`
    return { do: "role", role: "dev", text, staging: PLAN }
  }

  return { do: "err", ...err("state", `неизвестная станция «${s.station}»`) }
}

const put = (state, patch) => ok({ value: { ...state, ...patch } })

// soloFold — куда ложится результат события.
export function soloFold({ state, event = {} } = {}) {
  const it = event.instruction || {}
  const s = state
  if (!s || !s.cwd) return err("state", "soloFold получил состояние без cwd")

  // карточка презентации напечатана — следующим ходом вопрос
  if (event.do === "say") return put(s, { cardShown: true })

  // ask вернулся: снимаем вопрос, ответы уже в answers.md (их записала ask-функция)
  if (event.do === "ask") {
    const answers = readAt(s.cwd, ".agent/answers.md").trim()
    if (s.station === "approve") {
      const yes = String((event.result || []).join(" ")).toLowerCase()
      if (/(да|yes|approve|согласен|ok)/i.test(yes)) { // без \b: JS-границы не знают кириллицы (повтор урока draft-judge)
        mkdirSync(dirname(join(s.cwd, PLAN)), { recursive: true })
        copyFileSync(join(s.cwd, DRAFT_STAGING), join(s.cwd, PLAN))
        return put(s, {
          station: "solve", round: 1, blockers: "", question: null,
          solveStart: gitHead(s.cwd),
        })
      }
      return put(s, { station: "draft", round: 1, blockers: `оператор отклонил план: ${(event.result || []).join(" ") || "без причины"}`, question: null })
    }
    // вопрос критика/плана: ответы уехали в answers.md — круг draft с ANSWERED
    return put(s, { station: "draft", round: 1, blockers: "", question: null, cardShown: false, answers })
  }

  if (event.do !== "role") return err("fold", `solo не знает, что делать с событием «${event.do}»`)
  const env = event.result || {}

  // обрыв связи/отказ роли: круг НЕ тратим
  if (env.track === "err") {
    if (env.kind === "blocked") return put(s, { question: { name: `solo-${s.station}-q${s.round}`, items: [String(env.subject || "")] } })
    return put(s, {})
  }

  if (s.station === "draft") {
    if (env.artifact !== it.staging) return put(s, { blockers: `invalid: роль записала «${env.artifact || "ничего"}», а посана была в ${it.staging}` })
    const blockers = judgeDraft({ plan: readAt(s.cwd, DRAFT_STAGING), task: readAt(s.cwd, "TASK.md"), cwd: s.cwd })
    if (blockers.length) return put(s, { round: s.round + 1, blockers: blockers.join("\n") })
    return put(s, { station: "critic", round: 1, blockers: "" })
  }

  if (s.station === "critic") {
    if (env.verdict === "APPROVE") return put(s, { station: "approve", round: 1, blockers: "", criticVerdict: `APPROVE${(env.questions || []).length ? ` (+${(env.questions || []).length} вопросов оператору — в разделе 6 плана)` : ""}` })
    const qs = (env.questions || []).filter(Boolean)
    if (qs.length) return put(s, { question: { name: `solo-critic-q${s.round}`, items: qs } })
    return put(s, { station: "draft", round: s.roundDraft || 1, blockers: (env.blockers || ["критик отверг без блокеров"]).join("\n") })
  }

  if (s.station === "solve") {
    const findings = judgeSolve({ cwd: s.cwd, plan: readAt(s.cwd, PLAN), since: s.solveStart })
    if (findings.length) return put(s, { round: s.round + 1, blockers: findings.join("\n") })
    return put(s, { station: "done", blockers: "" })
  }

  return err("state", `fold на неизвестной станции «${s.station}»`)
}

function gitHead(cwd) {
  try { return execSync("git rev-parse HEAD", { cwd, encoding: "utf8" }).trim() } catch { return "" }
}
