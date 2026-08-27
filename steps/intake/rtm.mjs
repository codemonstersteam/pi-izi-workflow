// MODULE_CONTRACT: rtm — МАТРИЦА ТРЕССИРУЕМОСТИ intake v2: грамматика, разбор, суд в обе стороны
// Purpose:    одно решение: ЧТО считается трассой «требование ↔ модуль». Классика (IEEE 29148,
//             DO-178C): полнота = двусторонняя — каждое требование имеет носителя (ничего не
//             упущено), каждый модуль изменения имеет требование-обоснование (ничего не выдумано).
//             До v2 суд шёл только вперёд и по производным сущностям (шагам UC), и живые дефекты
//             (модель без владельца, конвертер без проводки, синк-кластер мимо) были механике
//             невидимы.
// io:         none (чистое ядро; диск — cut.mjs/order.mjs)
// Invariants: тотален; размерность, которой нет, читается пустой — слой, который её не пишет,
//             ею не судится; путь модуля — единственный ключ колонки.
// Interface:  parseToken, parseRtm, modulesOf, rtmJudge
//
// ГРАММАТИКА (одна строка = одно требование, размерности дописываются слоями):
//   R3 | scenarios: UC9 | owners: path/A.java, new/B.java(new, after=path/C.java) | contracts: …
// Размерность — «имя:» до следующей «|». Токен: путь + (флаги, k=v) в скобках.

// FUNCTION_CONTRACT: parseToken — «path(f1, k=v)» → { path, flags: Set, kv: {} }
//   Purity: pure
export function parseToken(raw) {
  const s = String(raw || "").trim()
  const m = s.match(/^(\S+?)\((.*)\)$/)
  if (!m) return { path: s, flags: new Set(), kv: {} }
  const flags = new Set()
  const kv = {}
  for (const part of m[2].split(",").map((x) => x.trim()).filter(Boolean)) {
    const eq = part.indexOf("=")
    if (eq >= 0) kv[part.slice(0, eq).trim()] = part.slice(eq + 1).trim()
    else flags.add(part)
  }
  return { path: m[1], flags, kv }
}

// FUNCTION_CONTRACT: splitTokens — режет ячейку размерности по запятым ВНЕ скобок токена
//   («path(f1, after=x), path2» — один токен с k=v и второй; запятая внутри скобок не делит)
//   Purity: pure
const splitTokens = (cell) => {
  const out = []
  let depth = 0, cur = ""
  for (const ch of String(cell || "")) {
    if (ch === "(") depth++
    if (ch === ")") depth = Math.max(0, depth - 1)
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; continue }
    cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out.map((t) => t.trim()).filter(Boolean)
}

// FUNCTION_CONTRACT: parseRtm — текст rtm.md → строки требований с размерностями
//   Consequent: success: { rows: [{ req, dims: { owners: [token], … } }] }
//   Purity: pure
export function parseRtm(text = "") {
  const rows = []
  for (const line of String(text || "").split("\n")) {
    const rm = line.match(/^\s*(R\d+)\s*\|(.*)$/)
    if (!rm) continue
    const dims = {}
    for (const cell of rm[2].split("|")) {
      const dm = cell.match(/^\s*([a-z-]+):\s*(.*)$/)
      if (!dm) continue
      dims[dm[1]] = splitTokens(dm[2]).map((t) => parseToken(t)).filter((t) => t.path)
    }
    rows.push(Object.freeze({ req: rm[1], dims: Object.freeze(dims) }))
  }
  return Object.freeze({ rows: Object.freeze(rows) })
}

// FUNCTION_CONTRACT: modulesOf — все колонки матрицы с их требованиями
//   Consequent: success: Map<path, { reqs: Set<R>, news: boolean, after: string, dims: Set }>
//   Purity: pure
export function modulesOf(rtm) {
  const by = new Map()
  for (const row of rtm.rows) {
    for (const [dim, toks] of Object.entries(row.dims)) {
      for (const t of toks) {
        if (!by.has(t.path)) by.set(t.path, { path: t.path, reqs: new Set(), news: false, after: "", dims: new Set() })
        const m = by.get(t.path)
        m.reqs.add(row.req)
        m.dims.add(dim)
        if (t.flags.has("new")) m.news = true
        if (t.kv.after) m.after = t.kv.after
      }
    }
  }
  return by
}

const stem = (p) => String(p).split("/").pop().replace(/\.[^.]+$/, "")
const dirOf = (p) => String(p).split("/").slice(0, -1).join("/")

// FUNCTION_CONTRACT: rtmJudge — двусторонний суд матрицы
//   Input:      { rtm; requirements — R-строки brd; analogueFiles — Set<путь>; blueprint —
//                Map<путь, {package: [попутчики], callers: [звонящие]}> ядра аналога;
//                answers — текст ответов; nodes — пути карты (для сверки b4) }
//   Consequent: success: string[] — блокеры; пусто = матрица полна в обе стороны.
//     FORWARD «строка без носителя»: требование без owners и без вопроса.
//     BACKWARD — четыре суда (корни живых дефектов, теперь классом):
//       b1 «зеркало»: new-модуль с after=P — каждому каталогу-суффиксу пакета P зеркальный new;
//       b2 «точка вызова»: new-сервис с after=P — хоть один звонящий P среди owners;
//       b3 «кластер»: существующий owner из ядра чертежа делит строку с соседями ядра или вопросом;
//       b4 «ответ назвал»: узел карты, названный в ответах, не-аналог и не owners.
//   Purity: pure
export function rtmJudge({ rtm = { rows: [] }, requirements = [], requirementStatements = [], analogueFiles = new Set(), blueprint = new Map(), answers = "", nodes = [], carriedBy = new Set() } = {}) {
  const B = []
  const byRow = new Map(rtm.rows.map((r) => [r.req, r]))
  const mods = modulesOf(rtm)

  // FORWARD — ничего не упущено. EXEMPTION: R-строки с глаголом define/set/name/constrain —
  // СВОЙСТВА (имя ключа, формат, предел), не функции (действие над сущностью). Ни один шаг
  // UC «несёт» свойство, и требовать владельца на него — требовать невозможного. Живой круг
  // 26.08: R15 «define | template data model key | glossary» зациклил coverage — модель не
  // может назначить владельца имени ключа в синтаксисе Qute.
  const PROPERTY_VERBS = new Set(["define", "set", "name", "constrain", "restrict", "limit"])
  const isProperty = (req) => {
    const st = requirementStatements.find((s) => s && s.id === req)
    if (!st) return false
    const verb = String(st.statement || "").split("|")[0].trim().toLowerCase()
    return PROPERTY_VERBS.has(verb)
  }
  for (const req of requirements) {
    if (isProperty(req)) continue
    const row = byRow.get(req)
    const owners = (row && row.dims.owners) || []
    const asked = (row && row.dims.questions) || []
    // T78 — CARRIED-BY-NFR — НОСИТЕЛЬ. Ограничение («не ломать существующее») не имеет
    // владельца-модуля В ПРИНЦИПЕ: это не действие. Правильная форма для него — нфр-гарантия,
    // и артефакт её уже пишет: <carried req="R3" by="nfr:backward-compatibility"/>. Живой
    // тупик 27.08 (FRUIT-1): 44 красных круга one↔coverage, 269k токенов — суд требовал
    // невозможного. Носителем считается ТОЛЬКО by="nfr:…": by="UC1/2" — не гарантия (F11 и
    // так требует carried на каждое R, иначе forward опустел бы вовсе).
    if (!owners.length && !asked.length && !carriedBy.has(req)) {
      B.push(`rtm:forward ${req} без носителя и без вопроса — требование никто не понесёт: назначь owners (кандидаты в материалах) или спроси оператора`)
    }
  }

  // BACKWARD b1 — зеркало слоя образца. Корень слоя = родитель каталога образца
  // (…/snippets/rest/X → корень …/snippets). Зеркало полно, когда под тем же корнем нового
  // слоя есть: (а) каждый ПОДКАТАЛОГ пакета образца (model/, mongo/, … — кроме каталога самого
  // образца) и (б) хоть один файл В КОРНЕ нового слоя, если у пакета образца есть файлы в корне
  // (интерфейсы квинтеты лежат в корне пакета — живой корень: недособранная квинтета).
  const layerRootOf = (p) => dirOf(dirOf(p))
  for (const m of mods.values()) {
    if (!m.after || !m.news) continue
    const root = layerRootOf(m.after)
    const buds = (blueprint.get(m.after) || {}).package || []
    const needSubdirs = new Set()
    let rootFiles = false
    for (const b of buds) {
      if (dirOf(b) === dirOf(m.after)) continue
      if (dirOf(b) === root) rootFiles = true
      else needSubdirs.add(dirOf(b).split("/").pop())
    }
    const newRoot = layerRootOf(m.path)
    const mirrors = [...mods.values()].filter((x) => x.news && x.path.startsWith(newRoot + "/"))
    const haveSubdirs = new Set(mirrors.filter((x) => dirOf(x.path) !== newRoot).map((x) => dirOf(x.path).split("/").pop()))
    const haveRootFiles = mirrors.some((x) => dirOf(x.path) === newRoot)
    const miss = [...needSubdirs].filter((d) => !haveSubdirs.has(d))
    if (miss.length || (rootFiles && !haveRootFiles)) {
      B.push(`rtm:backward-зеркало слой ${newRoot} не отзеркален —${miss.length ? ` нет new-владельцев в каталогах ${miss.join(", ")}` : ""}${rootFiles && !haveRootFiles ? `${miss.length ? " и" : ""} нет файлов в корне слоя (интерфейсы образца лежат в корне пакета)` : ""}; каждому файлу пакета образца — зеркальный владелец, или вопрос «слой не нужен»`)
    }
  }

  // BACKWARD b2 — ТОЧКА ВЫЗОВА: сервис без ПРОВОДНИКА = мёртвый код.
  //
  // T68-3 ПРОВОДНИК — ЗВОНЯЩИЙ ИЗ ДРУГОГО ПАКЕТА. Прежнее правило «хоть один звонящий среди
  // owners» удовлетворялось соседом (CounterweightService в том же каталоге), а не проводником
  // (MemoryItemConverter в другом пакете — именно он делает инъекцию). Сервису нужен тот, кто
  // его ВЫЗЫВАЕТ извне пакета образца; звонящий из того же каталога — сосед по слою, не проводник.
  // Живой круг 26.08: GlossaryService создан, MemoryItemConverter не назначен — подстановка
  // мёртвым кодом, 5/7 функций.
  for (const m of mods.values()) {
    if (!m.news || !m.after) continue
    const callers = (blueprint.get(m.after) || {}).callers || []
    if (!callers.length) continue
    const afterDir = dirOf(m.after)
    // проводники = звонящие из ДРУГОГО каталога (не сосед по пакету)
    const wires = callers.filter((p) => dirOf(p) !== afterDir)
    if (!wires.length) continue   // все звонящие в том же каталоге — проводника нет, не судим
    const wired = wires.some((p) => mods.has(p))
    if (!wired) {
      B.push(`rtm:backward-вызов ${stem(m.path)} (по образцу ${stem(m.after)}) без проводника: звонящие из ДРУГОГО пакета — ${wires.map(stem).slice(0, 3).join(", ")} — ни один не владеет; назначь проводника со-владельцем (Changed) или спроси оператора`)
    }
  }

  // BACKWARD b3 — кластер: инфраструктура соседей ядра едет вместе с владельцем.
  // ДЕДУП ПО ФАЙЛУ СОСЕДА (живой круг 26.08): StructuralMatcher блокировал R1 через 4
  // владельцев = 4 блокера вместо 1. Модель закрывала 3, один оставался — 45 блокеров не
  // уменьшались до нуля. Теперь: один сосед = один блокер на R, независимо от того, через
  // скольких владельцев он виден.
  for (const row of rtm.rows) {
    const owners = row.dims.owners || []
    const asked = new Set((row.dims.questions || []).map((q) => q.path))
    const owned = new Set(owners.map((o) => o.path))
    const missingByFile = new Map()   // сосед → первый владелец, через который виден
    for (const t of owners) {
      const buds = (blueprint.get(t.path) || {}).package || []
      if (!buds.length) continue
      for (const p of buds) {
        if (owned.has(p) || asked.has(p) || (mods.get(p) || {}).news) continue
        if (!missingByFile.has(p)) missingByFile.set(p, t.path)
      }
    }
    if (missingByFile.size) {
      const sample = [...missingByFile.keys()].slice(0, 4).map(stem).join(", ")
      B.push(`rtm:backward-кластер ${row.req}: соседи ядра без со-владельца — ${sample}${missingByFile.size > 4 ? ` (всего ${missingByFile.size})` : ""} — со-владелец или вопрос на каждого, иначе инфраструктура не доедет`)
    }
  }

  // BACKWARD b4 — ответ оператора назвал узел карты
  const ans = String(answers || "").toLowerCase()
  if (ans.trim()) {
    for (const p of nodes) {
      if (analogueFiles.has(p) || mods.has(p)) continue
      if (ans.includes(stem(p).toLowerCase())) {
        B.push(`rtm:backward-ответ узел «${stem(p)}» назван в ответе оператора, но не в owners и не аналог — назначь владельцем или объясни вопросом`)
      }
    }
  }
  return B
}
