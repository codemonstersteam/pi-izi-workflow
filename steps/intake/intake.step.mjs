// MODULE_CONTRACT: шаг 6 — требование, ОБЖАРЕННОЕ о карту. Голова над пятёркой с ЧЕТЫРЬМЯ пластами.
// Purpose:    одно решение: годится ли FRD как ВХОД веса и ряби. Пласты A→B→C→D ПОСЛЕДОВАТЕЛЬНО:
//             каждый видит прошлый. Вопросная рельса ЖИВЁТ ЗДЕСЬ: молчание требования — вопрос
//             оператору, а не выдуманный дефолт.
// io:         fs + model (через инструкцию role)
// EXTERNAL_DEPENDENCY: ext/state.mjs::put; ext/values.mjs — вердикты; пятёрка: inputs → cut →
//             order → judge → route; рельса вопроса: ask + .agent/pending.json + izi_answer.
// Invariants: ОБРЫВ НЕ ТРАТИТ КРУГ; отбитый пласт не теряет принятые; `approved` — барьер над
//             фактом: fold перечитывает .agent/answers.md и сверяет по номеру.
// Interface: id, next, fold
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { ok, err } from "../../core/result.mjs"
import { put, sha1of } from "../../ext/state.mjs"
import { verdict as newVerdict } from "../../ext/values.mjs"
import { inputs } from "./inputs.mjs"
import { orderText } from "./order.mjs"
import { judgePass } from "./judge.mjs"
import { mapOf, answersText, blueprintOf, resolveItems } from "./cut.mjs"
import { parseComputed } from "../scope/computed.mjs"
import { parseRtm, rtmJudge } from "./rtm.mjs"
import { writeRtmFromArtifact } from "./rtm-build.mjs"
import { promote } from "./route.mjs"
import { lookupAnswer } from "./lookup.mjs"
import { PASSES, parseFrd } from "./frd.mjs"
import { parseBrd, closedSets } from "../brd/brd.mjs"
import { newAnswers } from "../../core/answers.mjs"

export const id = "intake"

const ROLE = "intake"
const readAt = (cwd, rel) => (existsSync(join(cwd, rel)) ? readFileSync(join(cwd, rel), "utf8") : "")

// FUNCTION_CONTRACT: next — ЧТО делать дальше
//   Consequent:   done · err · say (состав) · ask (вопрос открыт) · role (пласт)
//   Purity:       io (читает; пишет только route)
export function next(state) {
  const bad = inputs(state)
  if (bad) return { do: "err", code: "blocked", cls: bad.cls, subject: bad.why }
  if (state.at && state.at.frd) return { do: "done", state }

  // ВОПРОСНАЯ РЕЛЬСА: вопрос открыт — спрашиваем, ДО любого пласта.
  // pending.json уже написан fold'ом (в момент, когда вопрос лёг в состояние) —
  // izi_answer читает оттуда вопросы и их НОМЕРА.
  if (state.question && state.question.items && state.question.items.length) {
    const q = state.question
    const prompt = q.items.map((text, i) => `${i + 1}. ${text}`).join("\n").slice(0, 900)
    return { do: "ask", name: q.name, prompt, items: q.items }
  }

  if (!state.portions.length) {
    return {
      do: "say",
      line: `intake: ${PASSES.join(" → ")} — каждый подшаг закрывает своё решение, судится своей механикой; роль ${ROLE}`,
      portions: PASSES.map((p) => ({ id: p, staging: `.agent/staging/frd~${p}.xml`, status: "todo", round: 1, blockers: "" })),
    }
  }

  const todo = state.portions.filter((x) => x.status === "todo")
  if (!todo.length) return { do: "done", state }
  const p = todo[0]
  if (p.round > state.budgets.intakeLoops) {
    return { do: "err", code: "escalate", subject: `пласт ${p.id} не чинится за ${state.budgets.intakeLoops} круга`, evidence: p.blockers }
  }

  // PREVIOUS — два режима (T44):
  //   ПЕРВЫЙ ЗАХОД (blockers пуст): staging ПРЕДЫДУЩЕГО пласта — B видит A, C видит B, D видит C.
  //     На пласте A previous пуст (первый слой).
  //   ПОЧИНКА (blockers непусты): staging СВОЕГО пласта — frd~B.xml содержит принятый слой A
  //     плюс свой отклонённый слой B. Модель видит ОБА: принятый A не трогает, свой B
  //     редактирует по FEEDBACK. Аудит 25.08: без этого модель пишет B с нуля каждый круг
  //     (3 вызова вместо 1–2), теряя всю работу прошлого круга.
  const prevPass = PASSES[PASSES.indexOf(p.id) - 1]
  const prevStaging = p.blockers
    ? p.staging                                                            // ПОЧИНКА: свой ответ
    : prevPass ? `.agent/staging/frd~${prevPass}.xml` : p.staging       // ПЕРВЫЙ: прошлый слой
  const o = orderText(state, p.id, {
    previous: readAt(state.cwd, prevStaging),
    feedback: p.blockers,
    closed: PASSES.slice(0, PASSES.indexOf(p.id)).join(", ") || "none",
    lookup: p.lookup || "",
  })
  if (o.why) return { do: "err", code: "blocked", subject: o.why }
  return { do: "role", role: ROLE, text: o.text, staging: o.staging }
}

// FUNCTION_CONTRACT: fold — куда кладётся ответ
//   Consequent:   success: состояние с вердиктом на пласт; failure: Result.err
//   Purity:       io (fs)
export function fold(state, event = {}) {
  const it = event.instruction || {}
  if (event.do === "say") {
    return it.portions ? put(state, { portions: it.portions }) : ok(state)
  }

  // T35 — СОБЫТИЕ ask: checkpoint вернулся. «approved» — БАРЬЕР НАД ФАКТОМ, НЕ ФАКТ:
  // перечитываем answers.md; ответы ЕСТЬ → вопрос снят, круг НЕ потрачен, роль получит
  // наряд с ответами ({ANSWERS}) и предыдущим staging ({PREVIOUS}); ответов НЕТ → re-ask
  // под НОВЫМ именем (checkpoint/<name> — один путь, два вызова = одна пауза).
  if (event.do === "ask") {
    const q = state.question
    if (!q) return err("fold", `шаг ${id} получил ask без открытого вопроса`)
    const answers = readAt(state.cwd, ".agent/answers.md")
    // T75 — СВЕРКА ПО ТЕКСТУ ВОПРОСА, НЕ ПО НОМЕРУ СТРОКИ: answers.md пишется обменами
    // <exchange><question_n>…</question_n><answer_n> (core/answers.mjs), и «строка N»
    // в этом файле больше не существует. Живой прогон quarkus 26.08: сырой «N. ответ»
    // не читался НИ ОДНИМ потребителем — вопросный круг до смерти бюджета.
    const said = newAnswers(answers)
    const answered = (said.ok ? said.value : []).length > 0
      && q.items.every((item) => (said.ok ? said.value : []).some(
        (a) => a.question === String(item || "").trim() && a.text))
    // pending.json УДАЛЯЕТСЯ ТОЛЬКО КОГДА ВОПРОС ЗАКРЫТ: при re-ask файл нужен izi_answer
    // для следующей паузы (дефект izi-live 24.08: модель звала izi_answer после re-ask —
    // файл был уже удалён, тул упал «pending.json отсутствует»).
    if (event.result === "approved" && answered) {
      rmSync(join(state.cwd, ".agent/pending.json"), { force: true })
      return put(state, { question: null })
    }
    const retry = (q.retry || 1) + 1
    if (retry > state.budgets.checkpointRetries) {
      rmSync(join(state.cwd, ".agent/pending.json"), { force: true })
      return err("escalate", `вопрос «${q.name}» не отвечен за ${state.budgets.checkpointRetries} паузы`)
    }
    return put(state, { question: { ...q, name: `${q.name}-retry${retry}`, retry } })
  }

  if (event.do !== "role") return err("fold", `шаг ${id} не знает, что делать с событием «${event.do}»`)

  const env = event.result || {}
  const p = state.portions.find((x) => x.staging === it.staging)
  if (!p) return err("fold", `шаг ${id} получил ответ, когда состав работы не посчитан`)

  // T69 — LOOKUP-ОТВЕТ УЖЕ ДОСТАВЛЕН: он ехал в наряде, породившем этот конверт, —
  // дальше носить его бессмысленно (следующий lookup начнёт с чистого списка).
  if (p.lookup) state = put(state, { portions: state.portions.map((x) => (x.staging === p.staging ? { ...x, lookup: "" } : x)) }).value

  // ОБРЫВ СВЯЗИ И ВОПРОС РОЛИ — НЕ КРУГ ЭТОГО ПЛАСТА: staging не трогаем, круг НЕ тратим.
  // ИНТЕРАКТИВНЫЙ pi: вопрос → state.question → next() эмитит ask → checkpoint пауза.
  // HEADLESS (bin/run.mjs): checkpoint НЕ поддержан — вопрос становится БЛОКЕРОМ починки
  // с контекстом; роль получает круг и ищет ответ в данных наряда (TASK.md decisions).
  // Определение режима: если state.question УЖЕ есть — интерактивная ветка отработала;
  // если checkpoint умрёт, полоса поймает «X is not defined» и вернёт crashed.
  if (env.track === "err") {
    if (env.kind === "question") {
      // ВОПРОС РОЛИ: pending.json ЛОЖИТСЯ СЮДА — ДО паузы, ДО next(), ДО checkpoint.
      // izi_answer читает оттуда вопросы и их НОМЕРА и по номерам же сверяет ответы.
      const items = env.items || [env.subject || ""]
      const name = `intake-${p.id}-q${p.round}`
      try {
        writeFileSync(join(state.cwd, ".agent/pending.json"),
          JSON.stringify({ items: items.map((text, i) => ({ n: i + 1, text: String(text || "").trim() })), subject: env.subject || "" }, null, 1))
      } catch { /* диск не дал — izi_answer не сможет, прогон умрёт на паузе; это видно сразу */ }
      return put(state, { question: { of: p.id, name, items, subject: env.subject || "" } })
    }
    // T69 — LOOKUP ОБСЛУЖИВАЕТ СКРИПТ. Живой круг 26.08: 14 запусков, 488k токенов —
    // наряд нёс ИМЕНА без ПУТЕЙ, страж кругов не двигался (круг «не тратится»).
    // Теперь: пути считает resolveItems (0 токенов), текст ответа — lookupAnswer
    // (lookup.mjs — модуль писался под рельсу ещё в v1 и не был подключён; его юниты
    // уже проверяют «путь, а не число»), следующий наряд несёт ответ отдельным
    // документом. Бюджет lookupLoops — именованный конец вместо вечного цикла.
    if (env.kind === "lookup") {
      const items = (env.items || []).map((x) => String(x || "").trim()).filter(Boolean)
      const cap = state.budgets.lookupLoops
      const lookups = (p.lookups || 0) + 1
      if (lookups > cap) {
        return err("escalate", `lookup по [${items.join(", ")}] не разрешается за ${cap} кругов — картой не отвечается`)
      }
      const resolved = resolveItems(state, items.length ? items : [env.subject || ""])
      // найденное и «нет в карте» едут ВМЕСТЕ: найденное — ответ, отказ — тоже ответ
      // (искать больше нечего). Все не найдены — rows пуст, и lookupAnswer говорит
      // единственный законный выход: спросить оператора.
      const rows = resolved.some((r) => !r.includes("нет в карте")) ? resolved.join("\n") : ""
      const answer = lookupAnswer({ names: items, rows, spent: lookups, cap })
      return put(state, {
        portions: state.portions.map((x) => (x.staging === p.staging ? { ...x, lookup: answer, lookups } : x)),
      })
    }
    return put(state, {})
  }

  const staged = readAt(state.cwd, p.staging)
  // V2 — RTM СОБИРАЕТ СКРИПТ, НЕ МОДЕЛЬ. Живой круг 25.08: наряд просил REWRITE rtm.md руками,
  // модель写ила owner-строки в артефакт и не тронула матрицу — backward-суд молчал на пустоте.
  // Форма вывода роли — ОДИН файл; второй для неё невидим. Сборка здесь: owner-строки артефакта
  // конвертируются в строки матрицы (UC→R через сценарии артефакта), файл перезаписывается,
  // судится coverage-машиной. Модель делает работу; машина ведёт бухгалтерию.
  if (p.id === "owners" && staged.trim()) {
    try { writeRtmFromArtifact(state.cwd, staged) } catch { /* битый артефакт — суд ниже скажет именем */ }
  }
  // T67 — RTM ПЕРЕСОБИРАЕТСЯ И НА contracts: артефакт после contracts может усохнуть
  // (модель удалила 7 из 14 owner-строк, rtm.md замёрз на owners-виде). Пересборка здесь
  // держит матрицу синхронной с финальным артефактом, и F19 судит по свежим данным.
  if (p.id === "contracts" && staged.trim()) {
    try { writeRtmFromArtifact(state.cwd, staged) } catch { /* F19 скажет именем */ }
  }
  // V2 — ПОДШАГ coverage СУДИТСЯ И МАТРИЦЕЙ: двусторонний суд rtm.md (forward «требование без
  // носителя», backward «зеркало/точка вызова/кластер/ответ назвал») — классика IEEE 29148,
  // которой не хватало: пустая строка матрицы = упущено, колонка без обоснования = выдумано.
  const rtmBlockers = p.id === "coverage" ? rtmJudge(rtmArgs(state)) : []
  const blockers = env.artifact !== p.staging
    ? `invalid: роль записала «${env.artifact || "ничего"}», а послана была в ${p.staging}`
    : !staged.trim()
      ? `invalid: ${p.staging} пуст`
      : [...judgePass({ xml: staged, pass: p.id, ...judgeArgs(state) }), ...rtmBlockers].join("\n  ")

  const v = newVerdict({ step: id, scope: "portion", id: p.id, round: p.round, ok: !blockers, blockers, at: p.staging })
  if (!v.ok) return v

  const swap = (patch) => state.portions.map((x) => (x.staging === p.staging ? { ...x, ...patch } : x))
  if (blockers) {
    // V2 — RTM-БЛОКЕРЫ ЧИНИТ OWNERS, НЕ COVERAGE. Обратный суд матрицы (rtm:backward-*) находит
    // пробелы ВЛАДЕНИЯ: точку вызова, кластер, ответ назвал. Модель на coverage пишет carried-
    // строки — она не может закрыть «назначь владельца»; это owners-работа. Живой круг 26.08:
    // без маршрутизации coverage-модель получила бы 27 rtm-блокеров и не знала бы, что с ними
    // делать. Правка: rtm-блокеры уезжают на owners (todo + feedback), coverage остаётся todo
    // БЕЗ них — его суд повторится, когда owners позакрывается и волна дойдёт снова.
    if (p.id === "coverage") {
      const rtmLines = blockers.split("\n").filter((b) => b.trim().startsWith("rtm:"))
      const otherLines = blockers.split("\n").filter((b) => !b.trim().startsWith("rtm:"))
      if (rtmLines.length) {
        const portions = state.portions.map((x) => {
          if (x.id === "owners") return { ...x, status: "todo", blockers: rtmLines.join("\n  ") }
          if (x.id === p.id) return { ...x, round: x.round, blockers: otherLines.join("\n  ") || "" }
          return x
        })
        return put(state, { verdicts: [...state.verdicts, v.value], portions })
      }
    }
    // T70 — F19-БЛОКЕР РАБОТА ПЛАСТА contracts: «владелец RTM без дельты» закрывается
    // дельтой или touched, критик их не пишет. Живой круг 26.08: owners-починка кластера
    // ДОБАВИЛА со-владельца (AbstractBackupService, R3) ПОСЛЕ закрытия contracts — F19
    // упал на критик, гонял один блокер 5 кругов до «круг 5 за пределом бюджета 3».
    // Маршрут зеркален rtm:→owners: F19-строки уезжают на contracts, круг текущего
    // пласта не тратится. Contracts в СВОЁМ круге с F19 чинится как обычный repair.
    if (p.id !== "contracts") {
      const f19 = blockers.split("\n").filter((b) => b.trim().startsWith("F19"))
      if (f19.length) {
        const otherLines = blockers.split("\n").filter((b) => !b.trim().startsWith("F19"))
        const portions = state.portions.map((x) => {
          if (x.id === "contracts") return { ...x, status: "todo", blockers: f19.join("\n  ") }
          if (x.id === p.id) return { ...x, round: x.round, blockers: otherLines.join("\n  ") || "" }
          return x
        })
        return put(state, { verdicts: [...state.verdicts, v.value], portions })
      }
    }
    return put(state, { verdicts: [...state.verdicts, v.value], portions: swap({ round: p.round + 1, blockers }) })
  }
  // ЗЕЛЁНЫЙ ПЛАСТ D — ПРОДВИГАЕМ ВСЁ; зелёный A/B1/B2/B3/C — просто закрываем пласт.
  // T64 — ВОПРОС В АРТЕФАКТЕ = ПАУЗА ОПЕРАТОРА. Шаг с открытым <question> не закрывается:
  // F17a зелёный «потому что вопрос есть», но владелец не назначен — на следующем пласте у шага
  // не будет дельты, и модуль молча потеряется вниз по течению. Вопросы артефакта становятся
  // рельсой ask (той же, что у вопроса роли): оператор отвечает в answers.md, круг НЕ тратится,
  // наряд следующего круга несёт ответы ({ANSWERED}) — модель заменяет вопросы владельцами.
  // Guard: вопрос на шаге, уже покрытом владельцем, — пояснение, не пробел, паузы нет.
  // D exempt: его вопросы (выход F14 «почему предмет не трогать») — терминальные объяснения.
  // Живой круг 25.08: пять вопросов-групп лежали в закрытом артефакте мёртвым грузом.
  if (p.id !== "coverage" && p.id !== "critic") {
    const askedNow = (parseFrd(staged).questions || []).filter((q) => {
      const ids = String(q.step || "").split(/\s+/).filter(Boolean)
      return ids.length && !ids.every((sid) => staged.includes(`<owner step="${sid}`))
    })
    if (askedNow.length) {
      const items = askedNow.map((q) => `${q.step}: ${q.subject || ""} — ${q.why || ""}`.trim())
      const name = `intake-${p.id}-q${p.round}`
      try {
        writeFileSync(join(state.cwd, ".agent/pending.json"),
          JSON.stringify({ items: items.map((text, i) => ({ n: i + 1, text })), subject: `артефактные вопросы пласта ${p.id}` }, null, 1))
      } catch { /* диск не дал — пауза умрёт видимо, не молча */ }
      return put(state, { question: { of: p.id, name, items, subject: "artifact questions" } })
    }
    return put(state, { verdicts: [...state.verdicts, v.value], portions: swap({ status: "green", blockers: "" }) })
  }
  // ПОСЛЕДНИЙ ПОДШАГ — критика: её зелёный продвигает весь FRD (V2: promote после critic)
  const moved = promote(state, staged)
  if (moved.why) return err("fold", moved.why)
  return put(state, {
    verdicts: [...state.verdicts, v.value],
    portions: swap({ status: "green", blockers: "" }),
    at: { ...state.at, frd: moved },
  })
}

// Аргументы судьи: карта как данные + значения из brd
function rtmArgs(state) {
  const map = mapOf(state)
  const doc = parseBrd(readAt(state.cwd, ".agent/brd.md"))
  let analogueFiles = []
  try { analogueFiles = (JSON.parse(readAt(state.cwd, ".agent/anchors.json")).analogue || {}).files || [] } catch { /* пусто */ }
  // T68-1 ЧЕРТЁЖ НЕСЁТ СЛОЙ, НЕ КАТАЛОГ. Прежнее `dirOf(path)` давало только соседей по
  // каталогу (`snippets/rest/*`), а зеркальное правило b1 судит по подкаталогам КОРНЯ СЛОЯ
  // (`snippets/` → model/, mongo/, rest/). Без слоя в чертеже b1 не видит квинтету —
  // GlossaryConfiguration и интерфейсы не назначаются (живой круг 26.08: 5/7 функций).
  const layerRoot = (p) => dirOf(dirOf(p))
  // T68-2 ЗВОНЯЩИЕ ИЗ ВЫЧИСЛЕННОГО ГРАФА. Карта роя может не нести ребро
  // MemoryItemConverter→PromptSnippetService (рой не зафиксировал зависимость), а
  // computed graph строит рёбра из импортов по ВСЕМУ репозиторию — проводник гарантированно
  // есть. b2 без проводника молчал → подстановка мёртвым кодом.
  const computed = parseComputed(readAt(state.cwd, ".agent/graph-computed.xml"))
  const bpLines = blueprintOf(state)
  const bp = new Map()
  for (const line of bpLines) {
    const path = (line.match(/^(\S+)/) || [])[1]
    if (!path) continue
    const pkg = [...map.nodes].filter((n) => {
      const root = layerRoot(n)
      return root && root === layerRoot(path)
    })
    const callers = [...new Set(computed.edges.filter((e) => e.to === path).map((e) => e.from))]
    bp.set(path, { package: pkg, callers })
  }
  return {
    rtm: parseRtm(readAt(state.cwd, ".agent/rtm.md")),
    requirements: (doc.requirements || []).map((r) => r && r.id).filter(Boolean),
    requirementStatements: doc.requirements || [],
    analogueFiles: new Set(analogueFiles),
    blueprint: bp,
    answers: readAt(state.cwd, ".agent/answers.md"),
    nodes: [...map.nodes],
  }
}
const dirOf = (p) => String(p).split("/").slice(0, -1).join("/")

function judgeArgs(state) {
  const map = mapOf(state)
  const doc = parseBrd(readAt(state.cwd, ".agent/brd.md"))
  // T62 — КАНДИДАТНАЯ ТАБЛИЦА B0 судьям F17c/d: наряд B1 кладёт её на диск (.agent/intake-b0.json),
  // суд читает ЕЁ ЖЕ — модель видит то, по чему её судят. Нет файла (пласт не B1/B2) — суд F17 молчит.
  let b0 = null
  try {
    const raw = readAt(state.cwd, ".agent/intake-b0.json")
    if (raw) b0 = JSON.parse(raw)
  } catch { /* битый b0 — суд молчит, а не фантазирует */ }
  return {
    nodes: map.nodes || new Set(),
    tests: map.tests || new Set(),
    entries: map.entries || new Set(),
    edges: map.edges || [],
    types: map.types || new Map(),
    members: map.members || new Map(),
    routes: map.routes || [],
    // T50 — ТРЕБОВАНИЯ КАК СТРОКИ-ИД: parseBrd возвращает [{id, statement, line}], а F11-судья
    // ждет строки ("R1", "R2"). Без .map(r => r.id) судья форматировал объект строкой →
    // «требование [object Object] не пройдено» (замер 25.08: D круг 1, все требования падали).
    requirements: (doc.requirements || []).map((r) => r && r.id).filter(Boolean),
    // T54 — ЗАМКНУТЫЕ ПЕРЕЧИСЛЕНИЯ: строки «only … + …» из brd.md целиком, для F16
    closed: closedSets(readAt(state.cwd, ".agent/brd.md")),
    subjects: doc.subjects || [],
    analogue: doc.analogue || "",
    b0,
    // T64 — ответы оператора суду F17c: спор закрыт владельцем, названным в ответе
    answers: answersText(state),
    // T67 — RTM суду F19: каждый владелец матрицы обязан иметь дельту в артефакте
    rtm: (() => { try { return parseRtm(readAt(state.cwd, ".agent/rtm.md")) } catch { return null } })(),
  }
}
