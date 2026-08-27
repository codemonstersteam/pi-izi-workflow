// MODULE_CONTRACT: b0 — КАНДИДАТЫ ВЛАДЕЛЬЦЕВ, СЧИТАемые СКРИПТОМ ДЛЯ ПОДЛАСТА B1 (T62)
// Purpose:    одно решение: КАКОЙ набор фактов модель видит на шаге «выбор владельцев». До T62
//             наряд B давал карту целиком, и связь «функция требования ↔ модуль-владелец» была
//             прозой — модель выдумывала сервисы для функций, которые карта описывала рядом
//             (замер 25.08: GlossarySubstitutionService при живой роли MemoryItemConverter).
//             Здесь эта связь — МЕХАНИКА: шаг UC × текст модуля (роль+api+имя файла), ранжировано.
// io:         none (ядро чистое; диск — cut.mjs::b0Of)
// EXTERNAL_DEPENDENCY: steps/intake/frd.mjs::parseFrd — шаги UC; map.mjs::parseMap — roles/apis.
// Invariants: НИ ОДНОГО РУЧНОГО СПИСКА СЛОВ. Общие слова («system», «repository») умирают сами —
//             фильтром по частоте: слово, живущее в трети текстов модулей, не различает модули.
//             Спорность — факт для суда (F17c): ≥2 равноправных кандидата = решение оператора.
// Interface:  candidatesOf({ frd, map, analogueFiles, edges }) -> { steps, analogueFunctions }

// FUNCTION_CONTRACT: wordsOf — слова текста, длинные, нижний регистр
//   Purity: pure
const wordsOf = (s) => [...new Set(String(s || "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4))]

// FUNCTION_CONTRACT: candidatesOf — таблица «шаг → кандидаты» + функции аналога
//   Input:        { frd — parseFrd прошлогo слоя A; map — parseMap (roles, apis, nodes);
//                   analogueFiles — пути файлов аналога (anchors.json); edges — рёбра computed
//                   графа [{from, to}] (кто кого импортирует/зовёт) }
//   Antecedent:   любые значения — пустые дают пустую таблицу, не бросок
//   Consequent:   success: { steps: [{ id, text, candidates: [{path, score, role, via}], top, disputed }],
//                 analogueFunctions: [{ path, role, steps: [id] }] }
//                 · кандидат по СЛОВАМ: модуль, чьи слова (роль+api+имя файла) пересекаются со
//                   словами шага в обе стороны подстрокой; score — число пересечений;
//                 · кандидат по РЕБРУ: сосед по computed-графу модуля, уже набравшего скор.
//                   Замер 25.08: связь «substitute during prompt rendering» держится не словами
//                   роли конвертера (их там нет), а цепочкой роль-аналога + ребро: сервис
//                   подстановки сниппетов ← конвертер, который его вызывает. Без соседа
//                   владелец-конвертер недостижим и для модели, и для суда.
//                 · фильтр частоты: слово, встречающееся в ≥ трети модулей, отбрасывается;
//                 · disputed: ≥2 кандидата с равным топ-скором ≥2 — выбор оператора, не модели;
//                 · analogueFunctions: файл аналога, чья роль пересекается с шагами — судья
//                   F17d сверяет: функция аналога унаследована дельтой или объяснена вопросом.
//   Purity:       pure
export function candidatesOf({ frd = {}, map = {}, analogueFiles = [], edges = [] } = {}) {
  const modules = [...((map && map.nodes) || [])].map((path) => {
    const text = [
      (map.roles && map.roles.get(path)) || "",
      ((map.apis && map.apis.get(path)) || []).join(" "),
      String(path).split("/").pop().replace(/\.[^.]+$/, ""),
    ].join(" ").toLowerCase()
    return { path, words: wordsOf(text), role: (map.roles && map.roles.get(path)) || "" }
  })

  // ФИЛЬТР ЧАСТОТЫ: document frequency слова по модулям; порог 1/3 — слово, которое живёт
  // всюду, не выбирает никого. Порог не вкус: на eddi «system» и «agent» держат 40+ ролей.
  const df = new Map()
  for (const m of modules) for (const w of m.words) df.set(w, (df.get(w) || 0) + 1)
  const rare = (w) => (df.get(w) || 0) <= Math.max(1, Math.ceil(modules.length / 3))
  const hit = (a, b) => a.includes(b) || b.includes(a)

  // РЁБРА В ОБОИХ НАПРАВЛЕНИЯХ: «кто нужен этому модулю» и «кому нужен этот модуль» — обе
  // стороны могут оказаться владельцем функции (замер 25.08: конвертер зовёт сервис подстановки).
  const near = new Map()
  for (const e of (edges || [])) {
    if (!e || !e.from || !e.to || e.from === e.to) continue
    if (!near.has(e.from)) near.set(e.from, new Set())
    if (!near.has(e.to)) near.set(e.to, new Set())
    near.get(e.from).add(e.to)
    near.get(e.to).add(e.from)
  }
  const byModule = new Map(modules.map((m) => [m.path, m]))

  const usecases = (frd && frd.usecases) || []
  const steps = []
  for (const uc of usecases) {
    (uc.steps || []).forEach((text, i) => {
      const sw = wordsOf(text).filter(rare)
      const score = new Map()
      for (const m of modules) {
        let s = 0
        for (const w of sw) if (m.words.some((mw) => hit(mw, w))) s++
        if (s > 0) score.set(m.path, s)
      }
      // СОСЕДИ НАБРАВШИХ: скор не наследуется (сосед — не доказательство), но кандидатство
      // даётся — выбор и доказательство остаются за моделью и вопросом оператору.
      const via = new Map()
      for (const [p] of score) for (const n of near.get(p) || []) {
        if (!score.has(n) && byModule.has(n)) { via.set(n, p); score.set(n, 1) }
      }
      const scored = [...score].map(([path, s]) => ({ path, score: s, role: byModule.get(path).role, via: via.get(path) || "" }))
        .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
      const top = scored.length ? scored[0].score : 0
      const candidates = scored.slice(0, 8)
      steps.push({
        id: `${uc.id}/${i + 1}`, text,
        candidates,
        top,
        // T63-2 — СПОРНОСТЬ (замер на живом круге 25.08): ничья на топе ИЛИ зазор 1, когда второй
        // пришёл ПО РЕБРУ — ребро это структурный сигнал точки интеграции, не словесный шум.
        // Отвергнуто замером: спорность при top=1 с соседями — 22 шага, включая все CRUD, чей
        // ответ new="yes" очевиден, — взрыв вопросов; слабое окружение лечит чертёж аналога
        // (T63-0) и слова наряда, а не принуждение вопроса.
        disputed: top >= 2 && (
          candidates.filter((c) => c.score === top).length >= 2
          || candidates.some((c) => c.score === top - 1 && c.via)
        ),
      })
    })
  }

  const af = [...new Set(Array.isArray(analogueFiles) ? analogueFiles.map(String)
    : ((analogueFiles && analogueFiles.files) || []).map(String))]
  // ФУНКЦИЯ АНАЛОГА = ТОП-1 КАНДИДАТ ХОТЬ ОДНОГО ШАГА, и только. Полный список кандидатов давал
  // дюжину «обязанных» файлов на шаг — F17d становился незакрываемым (приёмка 25.08); «по роли»
  // без фильтра частоты склеивало файл со всеми шагами разом (StructuralMatcher → 28 шагов).
  // Топ-1 — сильнейшая связь шага с картой: её наследование и требует суд.
  const analogueFunctions = af
    .map((path) => {
      const owned = steps.filter((s) => s.candidates.length && s.candidates[0].path === path)
      return owned.length ? { path, role: (byModule.get(path) || {}).role || "", steps: owned.map((s) => s.id) } : null
    })
    .filter(Boolean)
  return { steps: Object.freeze(steps), analogueFunctions: Object.freeze(analogueFunctions) }
}
