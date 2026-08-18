// MODULE_CONTRACT: tickets — step 14's pure core: план → наряды исполнителям
// Purpose:    три решения, и все три машинные. КТО отвечает за шаг требования (владелец), ЧТО
//             проверяет тест (шаги владельца, разрезанные по use case) и КОГДА тикет можно брать
//             (волна). Роли на шаге нет: что менять, как менять и в каком порядке решено раньше.
//             PURE: не знает ни диска, ни git; io живёт в ext/index.mjs.
// io:         none
// EXTERNAL_DEPENDENCY: steps/design/card.mjs::sectionsOf — ОДИН разбор плана на всех читателей.
//             Второй разбор того же текста — это тикет, нарезанный не из того плана, который
//             утвердил оператор.
// Invariants: каждая функция ТОТАЛЬНА — любой вход, включая undefined, даёт пустой результат и
//             никогда не бросает; раскладка есть ФУНКЦИЯ входов, поэтому две нарезки одного плана
//             совпадают байт в байт, а порядок берётся из очереди работ, а не из обхода.
// Interface:  ownerOf({ sections, order }) -> Map<шаг, путь>                    — фаза ②
//             ticketsOf({ sections, order, frd, key, branch, match, testDir }) -> Ticket[]  — ③④⑤
//             checkTickets({ tickets, sections, frd }) -> string[]              — фаза ⑥
//             ticketText(ticket) -> string                                      — тело наряда

// НИ ОДНОГО СЛОВА О ВИДАХ МОДУЛЕЙ И О ЯЗЫКЕ. Где-то инженеры пишут интерфейсы, где-то нет;
// распознавание вида по имени файла или по прозе раздела — подгонка под один проект. Всё, чем
// пользуется этот модуль, — рёбра «зовёт», объявленные ролью, очередь работ, посчитанная из них же,
// и шаблон имени тестов, найденный разведкой в самом репозитории.

// reaches — зовёт ли `from` модуль `to`, прямо или через цепочку. Круга здесь быть не может: его
// отверг гардрейл фазы ⑦ шага 9, но `seen` стоит всё равно — тотальность важнее веры в соседа.
import { SECTION_KEYS } from "../design/card.mjs"
import { cyrillicWords } from "../../core/lang.mjs"

const reaches = (from, to, calls, seen = new Set()) => {
  for (const c of calls.get(from) || []) {
    if (c === to) return true
    if (!seen.has(c)) { seen.add(c); if (reaches(c, to, calls, seen)) return true }
  }
  return false
}

// FUNCTION_CONTRACT: ownerOf — кто отвечает за каждый шаг требования
//   Input:        { sections, order } — разделы плана и очередь работ фазы ⑦
//   Dependencies: reaches
//   Antecedent:   любые значения
//   Consequent:   success: Map<«UC/шаг», путь модуля> — ровно один владелец на шаг
//                 failure: нет — тотальна
//   Purity:       pure
//   Interface:    ownerOf({ sections, order }) -> Map<string, string>
//
// ОДИН ШАГ ТРЕБОВАНИЯ ПРОХОДИТ ЧЕРЕЗ НЕСКОЛЬКО МОДУЛЕЙ, и все они честно называют его в «закрывает»:
// точка входа приняла запрос, стор сходил в хранилище, модель данных доехала обратно. Заведи тест
// каждому — одно требование проверят трижды; не заведи никому — не проверят вовсе.
//
// Владельцем становится тот, через кого шаг НАБЛЮДАЕМ: если один закрыватель зовёт другого, поведение
// зовомого видно через зовущего, и зовомый выбывает. Из оставшихся берётся последний в очереди работ —
// он зависит от прочих, значит к моменту его теста они уже написаны.
export function ownerOf({ sections = [], order = [] } = {}) {
  const pos = new Map(order.map((p, k) => [p, k]))
  const known = new Set(sections.map((s) => s.path))
  const calls = new Map(sections.map((s) => [s.path, (s.calls || []).filter((c) => known.has(c) && c !== s.path)]))

  const closers = new Map()
  for (const s of sections) for (const c of s.closes || []) closers.set(c, [...(closers.get(c) || []), s.path])

  const out = new Map()
  for (const [step, all] of closers) {
    const kept = all.filter((p) => !all.some((q) => q !== p && reaches(q, p, calls)))
    const pick = (kept.length ? kept : all).sort((a, b) => (pos.get(b) ?? -1) - (pos.get(a) ?? -1))[0]
    if (pick) out.set(step, pick)
  }
  return out
}

// Текст шага требования — дословно из FRD. Номер приходит из строки «закрывает», а форма номера уже
// сверена гардрейлом партии: шага, которого в use case нет, до сюда не доезжает.
const stepText = (frd, uc, n) => {
  const u = ((frd && frd.usecases) || []).find((x) => String((x && x.id) || "").trim() === uc)
  if (!u) return ""
  const k = Number(n)
  if (Number.isInteger(k) && (u.steps || [])[k - 1]) return String(u.steps[k - 1]).trim()
  const ext = (u.exts || []).find((e) => String((e && e.id) || "").trim() === String(n))
  if (!ext) return ""
  const fail = ((frd && frd.failures) || []).find((f) => f.code === ext.error)
  return [ext.error, ext.outcome, fail && fail.status ? `HTTP ${fail.status}` : ""].filter(Boolean).join(" — ")
}

const line = (body, name) => (String(body || "").match(new RegExp(`^\\s*${name}:\\s*([^\\n]+)`, "m")) || ["", ""])[1].trim()

// ЗНАЧЕНИЕ КЛЮЧА — ЭТО БЛОК, А НЕ СТРОКА. Длинный перечень роль переносит: `сигнатуры:` несёт первую
// подпись, остальные идут продолжениями с отступом. Читая одну физическую строку, тикет уносил первую
// и молчал про остальные — тесту на СОЗДАНИЕ предъявляли сигнатуру ЧТЕНИЯ дескрипторов.
//
// BUG_FIX_CONTEXT: разбор тикетов живого прогона eddi. Разделов с многострочными сигнатурами — 8,
// тикетов, куда приехала одна строка, — 17.
//
// Продолжение узнаётся по СЛОВАРЮ (steps/design/card.mjs::SECTION_KEYS): строка, не начинающаяся ни
// одним ключом раздела, принадлежит предыдущему значению. Склейка через ` · ` — тем же разделителем
// роль перечисляет в одну строку, поэтому вид тикета не зависит от того, как она поставила переносы.
const starts = (l) => SECTION_KEYS.some((k) => new RegExp(`^\\s*${k}\\s*:`).test(l))
const block = (body, name) => {
  const all = String(body || "").split("\n")
  const at = all.findIndex((l) => new RegExp(`^\\s*${name}\\s*:`).test(l))
  if (at < 0) return ""
  const head = all[at].replace(new RegExp(`^\\s*${name}\\s*:\\s*`), "")
  const tail = []
  for (const l of all.slice(at + 1)) {
    if (!l.trim() || starts(l) || /^##\\s/.test(l)) break
    tail.push(l.trim())
  }
  return [head.trim(), ...tail].filter(Boolean).join(" · ")
}
// ВХОД — ПУТЬ, А НЕ ВСЁ, ГДЕ ЕСТЬ СЛЭШ. `sample` — проза, и в ней встречается URI ресурса, пакет,
// ссылка. Токен, начинающийся со слэша или несущий `//`, путём не бывает ни в одном репозитории.
// BUG_FIX_CONTEXT: живой план eddi писал `eddi://ai.labs.glossary`, и во входы тикета уезжало
// `//ai.labs.glossary` — исполнителю велели прочитать то, чего нет.
const paths = (text) => (String(text || "").match(/[\w./-]+\.[A-Za-z0-9]+/g) || [])
  .filter((x) => x.includes("/") && !x.startsWith("/") && !x.includes("//"))
const slug = (path) => String(path).split("/").pop().replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()
const rx = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, (m) => `\\${m}`)

// ИМЯ ТЕСТА НА USE CASE ВЫВОДИТСЯ ИЗ ШАБЛОНА СЬЮТА, А НЕ ПРИДУМЫВАЕТСЯ. Тесты режутся по use case,
// значит восемь тикетов одного модуля пишут в восемь РАЗНЫХ файлов — иначе восемь исполнителей сядут
// на один файл, и это ловит правило 3 гардрейла (живая нарезка, 17 августа).
//
// Шаблон `match` карты (`*Test.java`, `test_*.py`, `*_spec.rb`) говорит, где у имени фиксированная
// часть, а где переменная: id use case вставляется в переменную. Языка в коде нет — только раскладка
// звёздочки, которую разведка нашла в самом репозитории.
const testFile = (named, uc, match) => {
  const name = String(named || "").trim()
  if (!name) return ""
  const [head = "", tail = ""] = String(match || "*").split("*")
  // Роль называет ТИП, а шаблон описывает ФАЙЛ: `GlossaryStoreTest` против `*Test.java`. Поэтому
  // хвост снимается и с расширением, и без него — иначе `Test` останется в имени дважды.
  const bareTail = tail.replace(/\.[^.]+$/, "")
  const bare = name
    .replace(new RegExp(`^${rx(head)}`), "")
    .replace(new RegExp(`${rx(tail)}$`), "")
    .replace(new RegExp(`${rx(bareTail)}$`), "")
  return `${head}${bare}${uc}${tail}`
}

// Тест ложится ТУДА ЖЕ, где лежит модуль, но под корнем тестов: каталог пакета сохраняется, иначе на
// языках, где положение файла и есть его пакет, тест не соберётся. Корень тестов даёт карта
// (`<suite path>`); часть пути после его последнего сегмента — это и есть пакет модуля.
// Две ступени, первая сработавшая выигрывает — и обе выведены из путей, а не из знания языка:
//   1. корни ПЕРЕСЕКАЮТСЯ хвостом (`src/main/java` и `src/test/java` делят `java`) — пакет это всё,
//      что идёт в пути модуля после этого сегмента;
//   2. корни расходятся раньше (`src/mongo/…` и `src/test/java`) — пакет это остаток пути модуля
//      после их общего начала.
// Не нашлось ни того, ни другого — тест ложится в корень: раскладку решает проект, а угадывать
// её дальше значит подгонять код под одну сборочную систему.
const testPath = (modulePath, file, testDir) => {
  if (!file) return ""
  if (!testDir) return file
  const root = String(testDir).split("/").filter(Boolean)
  const parts = String(modulePath).split("/").filter(Boolean)
  const dir = parts.slice(0, -1)

  const at = dir.lastIndexOf(root[root.length - 1])
  if (at >= 0) return [testDir, ...dir.slice(at + 1), file].join("/")

  let k = 0
  while (k < dir.length && k < root.length && dir[k] === root[k]) k++
  return [testDir, ...dir.slice(k), file].join("/")
}

// ТЕСТ ОБРАЗЦА ИЩЕТСЯ ТЕМ ЖЕ ОТОБРАЖЕНИЕМ, КАКИМ СТРОИТСЯ СВОЙ. Наряд говорит «sample: <модуль>»,
// и исполнитель знает, ЧТО писать в своём тесте, но не знает КАК — какой фреймворк, моки или живая
// база, базовый класс, чем подменяются зависимости. Ровно эта дыра дважды дала файл на Spring Boot в
// проекте на Quarkus (эмуляция граничного наряда на слабой модели).
//
// Образец теста лежит зеркально образцу модуля, и берётся он механически: имя по шаблону `match`
// сьюта, каталог по `testPath`. Нет такого файла среди узлов карты — строки в наряде нет, и это
// честно: выдумывать проект не по чему.
const mirrorTest = (modulePath, match, testDir) => {
  const base = String(modulePath).split("/").pop().replace(/\.[^.]+$/, "")
  const file = testFile(base, "", match)
  return file ? testPath(modulePath, file, testDir) : ""
}

// Имя теста, как его назвала роль: второе поле строки «verify» либо флаг команды. Роль пишет и
// `<команда> · XTest`, и `<команда> -Dtest=XTest` — оба разбираются здесь, один раз.
const namedTest = (check) => {
  const parts = String(check || "").split("·").map((x) => x.trim()).filter(Boolean)
  const tail = parts.length > 1 ? parts[parts.length - 1] : ""
  if (tail && !tail.startsWith("-")) return tail
  const flag = String(check || "").match(/-D(?:it\.)?test=(\S+)/)
  return flag ? flag[1] : ""
}

// FUNCTION_CONTRACT: layersOf — слои изменения снизу вверх
//   Input:        { sections, order } — разделы плана и очередь работ фазы ⑦
//   Dependencies: —
//   Antecedent:   любые значения
//   Consequent:   success: string[][] — слой 0 не зовёт никого из изменения, слой k зовёт только
//                          слои ниже; внутри слоя порядок очереди работ
//                 failure: none — тотальна; круг (его отверг бы гардрейл шага 9) не зацикливает
//   Purity:       pure
//
// ОЧЕРЕДЬ ДАЁТ ЛИНИЮ, СЛОИ ДАЮТ ВОЛНЫ. Рёбра те же самые — объявленные строкой «calls». Слой и есть
// ответ на вопрос «что можно делать одновременно»: внутри него ни один модуль не зовёт другого.
export function layersOf({ sections = [], order = [] } = {}) {
  const byPath = new Map((sections || []).map((s) => [s.path, s]))
  const line = (order || []).filter((p) => byPath.has(p))
  const at = new Map()
  const level = (p, seen = new Set()) => {
    if (at.has(p)) return at.get(p)
    if (seen.has(p)) return 0
    seen.add(p)
    const deps = (byPath.get(p).calls || []).filter((c) => byPath.has(c) && c !== p)
    const v = deps.length ? 1 + Math.max(...deps.map((c) => level(c, seen))) : 0
    at.set(p, v)
    return v
  }
  const out = []
  for (const p of line) {
    const k = level(p)
    ;(out[k] = out[k] || []).push(p)
  }
  return out.filter(Boolean)
}

// via — как актёр входит в программу, словами самого FRD. Путь в нём означает ВНЕШНИЙ канал: актёр
// зовёт систему через её границу, а не через класс. Это не догадка о протоколе, а то, что роль
// написала в `<actor via>`, и единственное место, где полоса вообще узнаёт о границе.
const viaOf = (frd, name) => String((((frd || {}).actors || []).find((a) => String(a.name || "") === String(name || "")) || {}).via || "")

// Ветка отказа проверяема снаружи, когда у её кода есть статус: `<failure status>` и есть то, что
// граничный тест утверждает. Ветка без статуса живёт внутри и достаётся владельцу шага.
const coded = (frd, code) => Boolean((((frd || {}).failures || []).find((f) => f.code === code) || {}).status)

// FUNCTION_CONTRACT: ticketsOf — план и требование → наряды исполнителям
//   Input:        { sections, order, frd, key, branch, match, testDir, known, outer, build }
//                 outer — сьют НЕ-unit из карты ({ cmd, one, path, match }) или null: место, куда
//                         кладётся граничная проверка. Нет такого сьюта — нет и границы
//                 build — команда сборки БЕЗ прогона тестов (`<build compile>` карты); ею
//                         закрывается модуль, за которым не осталось шагов
//                 known — узлы карты: по ним отсеивается проза из строки «по образцу»
//   Dependencies: ownerOf, layersOf, viaOf, coded, block, line, paths, testPath, namedTest, stepText
//   Antecedent:   любые значения; пустой план даёт пустой список
//   Consequent:   success: frozen Ticket[] двух родов — `boundary` (волна 0) и `module` (волна = слой)
//                 failure: none — тотальна
//   Purity:       pure
//
// ДВА РОДА, И РАЗДЕЛЕНИЕ ЖИВЁТ НА ГРАНИЦЕ. Отдельный тестовый тикет ПЕРЕД модульным ломает
// компиляцию: тест ссылается на класс, которого ещё нет, и его «красный» — ошибка сборки, а не
// проверка. Эмуляция 35 нарядов живого прогона показала это на четырёх тикетах, чьи ворота
// недостижимы на их волне. Оба изученных конвейера (rationaldev-ai-sdlc-skills,
// oh-my-openagent) независимо пришли к одному решению: юнит-тест живёт в тикете своего модуля, а
// неподгоняемая проверка выносится НА ГРАНИЦУ программы, где она не называет ни одного нового класса
// и потому компилируется с первой минуты.
//
//   boundary  один на use case, чей актёр входит через путь · волна 0 · обязан быть КРАСНЫМ
//   module    один на раздел плана · волна = слой графа «зовёт» · ворота: сборка + ТОЛЬКО свои тесты
export function ticketsOf({ sections = [], order = [], frd = {}, key = "", branch = "", match = "*", testDir = "", known = new Set(), outer = null, build = "", samples = [], facts = null } = {}) {
  // ФАКТЫ РЕПОЗИТОРИЯ — steps/tickets/facts.mjs, 0 токенов. Нет карты — нет и фактов: наряд тогда
  // выходит без стека и без пакета, как выходил до этой правки, вместо стека, взятого из головы.
  const F = facts || { stack: "", pkgOf: () => "", declOf: () => null, systemsOf: () => [] }
  const byPath = new Map(sections.map((s) => [s.path, s]))
  const owner = ownerOf({ sections, order })
  const layers = layersOf({ sections, order })
  const level = new Map()
  layers.forEach((one, k) => one.forEach((p) => level.set(p, k)))

  // ① ГРАНИЦА. Шаг достаётся ей по правилу без догадок: внешний вход (шаг 1) и ветка, у кода которой
  // есть статус — то есть ровно то, что проверяемо снаружи. Всё прочее внутреннее и идёт владельцу.
  const outerSteps = new Set()
  const list = []
  const ucs = (frd.usecases || [])
  // ОБРАЗЕЦ — ЕДИНСТВЕННОЕ, ЧТО СООБЩАЕТ ГРАНИЦЕ, В КАКОМ ПРОЕКТЕ ОНА ЖИВЁТ. Эмуляция на слабой
  // модели: выдали граничный тикет без образца — она написала тест на Spring Boot для проекта на
  // Quarkus, и файл не собрался бы. Из одного существующего теста того же сьюта исполнитель берёт
  // разом фреймворк, базовый класс, авторизацию и уборку за собой — ничего этого полоса не знает и
  // знать не должна.
  //
  // Сьют объявлен, а файлов его нет — граница не режется вовсе: выдумывать проект не по чему, а шаги
  // внешнего входа тогда достаются владельцам, и требование без проверки не остаётся.
  const near = (want) => {
    const list = (samples || []).filter(Boolean)
    if (!list.length) return ""
    const stem = String(want || "").split("/").pop().replace(/\.[^.]+$/, "").toLowerCase()
    const score = (p) => {
      const n = p.split("/").pop().replace(/\.[^.]+$/, "").toLowerCase()
      let k = 0
      while (k < n.length && k < stem.length && n[k] === stem[k]) k++
      return k
    }
    return [...list].sort((a, b) => score(b) - score(a) || a.localeCompare(b))[0]
  }
  // Словарь величин изменения: ветка отказа даёт КОД, а поле — правило, которое она нарушает. Без
  // него исполнителю нечем вызвать отказ, и он его выдумывает.
  const fields = (frd.fields || []).filter((f) => f && f.name && f.domain)
    .map((f) => `${f.name}${f.in ? ` (${f.in})` : ""}: ${f.domain}${f.required ? ` · required: ${f.required}` : ""}`)

  if (outer && outer.cmd && (samples || []).filter(Boolean).length) {
    for (const u of ucs) {
      const via = viaOf(frd, u.actor)
      if (!via.includes("/")) continue                      // канал не путь — снаружи не позвать
      const mine = [`${u.id}/1`, ...(u.exts || []).filter((e) => coded(frd, e.error)).map((e) => `${u.id}/${e.id}`)]
        .filter((x) => stepText(frd, x.split("/")[0], x.split("/")[1]))
      if (!mine.length) continue
      for (const x of mine) outerSteps.add(x)
      const entry = owner.get(`${u.id}/1`) || ""
      // Ближайший образец: по корню имени того, с чего списан сам вход. Не совпало — любой; даже он
      // даёт правильный фреймворк и базовый класс.
      const sample = near(paths(block((byPath.get(entry) || {}).body, "sample"))[0] || entry)
      // ИМЯ ГРАНИЧНОГО КЛАССА — ИЗ КЛЮЧА ЗАДАЧИ, А НЕ ИЗ МОДУЛЯ. Имя вида RestGlossaryStoreUC1IT
      // читается слабой моделью как приглашение импортировать этот класс — а его ещё нет, и весь
      // смысл границы в том, что она о нём не знает. Ключ нейтрален и не меняется от волны к волне.
      const cls = `${String(key).replace(/[^A-Za-z0-9]/g, "") || "Boundary"}${u.id}${String(outer.match || "*IT.java").split("*").pop().replace(/\.[^.]+$/, "")}`
      list.push({
        kind: "boundary",
        uc: u.id,
        module: entry,                                      // вход программы — им же проверяется
        name: `boundary-${u.id.toLowerCase()}`,
        via,
        goal: String(u.goal || ""),
        post: String(u.post || ""),
        steps: mine.map((x) => ({ step: x, text: stepText(frd, x.split("/")[0], x.split("/")[1]) })),
        // Файл ложится ТУДА, ГДЕ ЖИВУТ такие тесты — в каталог образца. Пакет и каталог сходятся по
        // построению, а не по догадке исполнителя.
        outputs: [`${sample.split("/").slice(0, -1).join("/")}/${cls}.java`],
        inputs: [sample],
        sample,
        stack: F.stack,
        pkg: F.pkgOf(`${sample.split("/").slice(0, -1).join("/")}/${cls}.java`),
        fields,
        verify: String(outer.one || "").includes("{class}")
          ? `${outer.cmd} ${String(outer.one).replace("{class}", cls)}`
          : String(outer.cmd),
        testClass: cls,
        waitsFor: [],
      })
    }
  }

  // ② МОДУЛИ. Раздел плана → тикет: код и его тесты пишет один исполнитель, в порядке «сначала тест
  // по шагам отсюда, потом код». Тест не опережает свой класс — компиляция цела на каждой волне.
  const mine = new Map()
  for (const [step, path] of owner) {
    if (outerSteps.has(step)) continue                      // шаг уже проверяется снаружи
    mine.set(path, [...(mine.get(path) || []), step])
  }
  for (const path of order) {
    const s = byPath.get(path)
    if (!s) continue
    const check = line(s.body, "verify")
    const cmd = check.split("·")[0].trim()
    const named = namedTest(check)
    const steps = mine.get(path) || []
    const deps = (s.calls || []).filter((c) => byPath.has(c) && c !== path)
    const sample = paths(block(s.body, "sample")).filter((p) => known.has(p) || byPath.has(p))
    const file = steps.length && named ? testPath(path, `${named}.java`, testDir) : ""
    // Образец ТЕСТА — только тот, что реально лежит в репозитории; зеркало, которого нет, в наряд
    // не едет (см. mirrorTest).
    const sampleTests = [...new Set(sample.map((p) => mirrorTest(p, match, testDir)).filter((p) => p && known.has(p)))]
    const declares = block(s.body, "declares")
    // СИГНАТУРЫ ТИПОВ, КОТОРЫЕ УЖЕ ЕСТЬ ЗДЕСЬ. Роль пишет `GlossaryStore(IResourceStorageFactory f,
    // IDocumentBuilder b)` — тип назван, а взять его негде: «чем пользуемся» несёт только модули
    // ЭТОГО изменения. Слабая модель выдумывает конструктор фабрики. Кандидаты — заглавные имена из
    // собственного объявления и сигнатур; остаются те, кого ЗНАЕТ КАРТА, поэтому `String` и `List`
    // отсеиваются сами, без списка исключений.
    const mentions = [...new Set(`${declares}\n${block(s.body, "signatures")}`.match(/\b[A-Z][A-Za-z0-9_]*\b/g) || [])]
    const repoTypes = mentions.map((n) => ({ name: n, ...(F.declOf(n) || {}) }))
      .filter((x) => x.path && x.path !== path && !byPath.has(x.path))
      .filter((x, k, all) => all.findIndex((y) => y.path === x.path) === k)

    // ВОРОТА — СБОРКА И ТОЛЬКО СВОИ ТЕСТЫ. Никогда чужие: зовущий реализуется волнами позже, и
    // требовать его зелени значит требовать невозможного (дефект ① эмуляции). Модуль, за которым не
    // осталось шагов, закрывается ОДНОЙ СБОРКОЙ: его сигнатуру проверит компилятор потребителя уже
    // на следующей волне, а форму данных наружу — граничный тест в конце.
    const own = file ? cmd.replace(/-D(it\.)?test=\S+/, (m) => m.replace(/=.*/, `=${named}`)) : ""
    list.push({
      kind: "module",
      module: path,
      name: slug(path),
      body: s.body,
      steps: steps.map((x) => ({ step: x, text: stepText(frd, x.split("/")[0], x.split("/")[1]) })),
      // Сигнатуры тех, кого он ЗОВЁТ: без них тест на шаг, проверяемый через соседа, писать не по чему.
      uses: [
        ...deps.map((d) => ({ path: d, signatures: block((byPath.get(d) || {}).body, "signatures"), mine: true })).filter((x) => x.signatures),
        ...repoTypes.map((x) => ({ path: x.path, signatures: [x.sig, ...(x.members || [])].filter(Boolean).join(" · "), mine: false })).filter((x) => x.signatures),
      ],
      signatures: block(s.body, "signatures"),
      declares,
      stack: [F.stack, ...new Set(sample.flatMap((p) => F.systemsOf(p)))].filter(Boolean).join(" · "),
      pkg: F.pkgOf(path),
      samples: sample,
      sampleTests,
      outputs: [path, ...(file ? [file] : [])],
      inputs: [...new Set([...sample, ...sampleTests, ...deps])],
      // Команды сборки в карте может не быть (карта снята до того, как разведку стали о ней спрашивать).
      // Тогда модуль без шагов закрывается сьютом БЕЗ флага — «собирается и не ломает существующее».
      // Сырую строку роли брать нельзя: в ней стоит имя теста её РЕАЛИЗАЦИИ, то есть чужой класс,
      // который позеленеет волнами позже.
      verify: [build, own].filter(Boolean).join(" && ") || cmd.replace(/\s*-D(it\.)?test=\S+/, ""),
      testClass: file ? named : "",
      layer: level.get(path) ?? 0,
      waitsFor: [...deps],
    })
  }

  const id = new Map(list.map((t, k) => [t.name, String(k + 1).padStart(2, "0")]))
  const byModule = new Map(list.filter((t) => t.kind === "module").map((t) => [t.module, t.name]))

  // ЧУЖИЕ ФАЙЛЫ НАЗЫВАЮТСЯ ПОИМЁННО. Слабая модель, увидев в сигнатурах тип, которого ещё нет,
  // создаёт его сама и называет это помощью: живой прогон — три файла вне своих outputs, работа
  // нарядов 10 и 12. Запрет «не трогай чужое» такой модели ничего не говорит; список файлов говорит.
  //
  // В список идут не все чужие модули, а те, чьи имена ВСТРЕЧАЮТСЯ В ТЕЛЕ этого наряда — в
  // сигнатурах, в «calls», в «sample». Совпадение целым словом по базовым именам путей плана,
  // тем же способом, каким гардрейл шага 9 судит владельца шага.
  const named = new Map([...byModule.keys()].map((p) => [p.split("/").pop().replace(/\.[^.]+$/, ""), p]))
  const tempting = (t) => t.kind !== "module" ? [] : [...named]
    .filter(([n, p]) => p !== t.module && new RegExp(`\\b${n}\\b`).test(`${t.body || ""}`))
    .map(([, p]) => p)
  const withDeps = list.map((t) => ({
    ...t,
    id: id.get(t.name),
    forbidden: tempting(t).map((p) => ({ path: p, ticket: id.get(byModule.get(p)) })).filter((x) => x.ticket),
    key,
    branch,
    // Граница не ждёт ничего — она пишется до всякого кода. Модуль ждёт тех, кого зовёт.
    blocked_by: (t.kind === "boundary" ? [] : t.waitsFor.map((d) => byModule.get(d)))
      .map((n) => id.get(n)).filter(Boolean).sort(),
  }))

  // ③ ВОЛНЫ. Граница — нулевая, модуль — свой слой плюс один. Слой считается по рёбрам «зовёт», а не
  // по blocked_by, поэтому волна зовомого строго меньше волны зовущего по построению.
  return Object.freeze(withDeps.map((t) => Object.freeze({ ...t, wave: t.kind === "boundary" ? 0 : (t.layer || 0) + 1 })))
}

// FUNCTION_CONTRACT: checkTickets — судить РАСКЛАДКУ, а не смысл
//   Input:        { tickets, sections, frd, known, stack, match, testDir }
//   Dependencies: mirrorTest, core/lang.mjs::cyrillicWords
//   Antecedent:   любые значения
//   Consequent:   success: string[] блокеров, пусто = зелено
//                 failure: none — тотальна
//   Purity:       pure
//
// Двенадцать правил. Четвёртое и пятое куплены эмуляцией живого прогона: ворота, зависящие от чужой
// работы, и тест, который не скомпилируется до кода, — оба выглядят нормально в тексте наряда и оба
// делают его неисполнимым. Правила 9-12 куплены чтением наряда ГЛАЗАМИ ИСПОЛНИТЕЛЯ: наряд говорит,
// ЧТО сделать и ГДЕ, и молчит о том, В ЧЁМ это пишется.
export function checkTickets({ tickets = [], sections = [], frd = {}, known = new Set(), stack = "", match = "*", testDir = "" } = {}) {
  const B = []
  const mods = tickets.filter((t) => t.kind === "module")
  const bounds = tickets.filter((t) => t.kind === "boundary")
  const planned = sections.map((s) => s.path)
  const ours = new Set(planned)

  // 1 — модульный тикет на каждый раздел плана, и ни одного лишнего
  const have = new Set(mods.map((t) => t.module))
  const missing = planned.filter((p) => !have.has(p))
  if (missing.length) B.push(`модули плана без тикета: ${missing.join(", ")} — работа, которую никто не исполнит`)
  const extra = [...have].filter((p) => !ours.has(p))
  if (extra.length) B.push(`тикеты на модули вне плана: ${extra.join(", ")}`)

  // 2 — каждый шаг требования покрыт РОВНО ОДИН раз: границей ИЛИ владельцем
  const want = new Set()
  for (const u of frd.usecases || []) {
    const uid = String(u.id || "").trim()
    if (!uid) continue
    ;(u.steps || []).forEach((_, k) => want.add(`${uid}/${k + 1}`))
    for (const e of u.exts || []) want.add(`${uid}/${e.id}`)
  }
  const seen = new Map()
  for (const t of tickets) for (const s of t.steps || []) seen.set(s.step, [...(seen.get(s.step) || []), t.name])
  const twice = [...seen].filter(([, who]) => who.length > 1)
  if (twice.length) B.push(`шаги, проверяемые дважды: ${twice.map(([st, who]) => `${st} (${who.join(", ")})`).join("; ")}`)
  const unchecked = [...want].filter((x) => !seen.has(x))
  if (unchecked.length) B.push(`шаги требования без единой проверки: ${unchecked.sort().join(", ")}`)

  // 3 — outputs непуст, и ни один путь не назван в двух тикетах
  const mute = tickets.filter((t) => !(t.outputs || []).length)
  if (mute.length) B.push(`тикеты без outputs: ${mute.map((t) => t.name).join(", ")}`)
  const owners = new Map()
  for (const t of tickets) for (const o of t.outputs || []) owners.set(o, [...(owners.get(o) || []), t.name])
  const clash = [...owners].filter(([, who]) => who.length > 1)
  if (clash.length) B.push(`один путь в двух тикетах: ${clash.map(([p, who]) => `${p} (${who.join(", ")})`).join("; ")}`)

  // 4 — ворота модуля не называют ЧУЖОЙ тест-класс: он позеленеет волнами позже, и наряд станет
  // недостижимым. Дефект ① эмуляции: четыре тикета ждали зелени от модулей следующих волн.
  const classes = new Map(tickets.filter((t) => t.testClass).map((t) => [t.testClass, t.name]))
  for (const t of mods) {
    const alien = [...classes].filter(([cls, who]) => who !== t.name && new RegExp(`\\b${cls}\\b`).test(t.verify || ""))
    if (alien.length) B.push(`ворота ${t.name} держат чужой тест: ${alien.map(([c, w]) => `${c} (${w})`).join(", ")} — он позеленеет позже этой волны`)
  }

  // 5 — граничный тикет не называет ни одного пути, который эта же нарезка собирается создать: иначе
  // он не скомпилируется до кода, и «красный» будет ошибкой сборки, а не проверкой. Дефект ②.
  const made = new Set(mods.flatMap((t) => t.outputs || []))
  for (const t of bounds) {
    const leak = [...(t.inputs || []), ...(t.uses || []).map((u) => u.path)].filter((p) => made.has(p))
    if (leak.length) B.push(`граница ${t.name} ссылается на то, чего ещё нет: ${leak.join(", ")} — она не скомпилируется до кода`)
  }

  // 6 — blocked_by резолвится, и волна зовомого строго меньше волны зовущего
  const byId = new Map(tickets.map((t) => [t.id, t]))
  for (const t of tickets) {
    const ghost = (t.blocked_by || []).filter((d) => !byId.has(d))
    if (ghost.length) B.push(`${t.name} ждёт несуществующие ${ghost.join(", ")}`)
    const early = (t.blocked_by || []).map((d) => byId.get(d)).filter(Boolean).filter((d) => d.wave >= t.wave)
    if (early.length) B.push(`${t.name} (волна ${t.wave}) ждёт то, что лежит не раньше: ${early.map((d) => `${d.name} волна ${d.wave}`).join(", ")}`)
  }

  // 7 — каждый вход знает карта или план. Без карты правило молчит — той же дисциплиной, что F5 без
  // источников: судить не по чему.
  // Образец граничного тикета — настоящий файл репозитория, найденный по шаблону сьюта; карта его не
  // знает только потому, что его клетка не попала в разведку.
  const stray = known.size ? [...new Set(tickets.flatMap((t) => (t.inputs || [])
    .filter((p) => p !== t.sample && !known.has(p) && !ours.has(p) && !tickets.some((x) => (x.outputs || []).includes(p)))))] : []
  if (stray.length) B.push(`во входах пути, которых не знает ни карта, ни план: ${stray.join(", ")} — исполнителю нечего по ним открыть`)

  // 8 — модуль без шагов обязан быть СВЯЗАН с изменением: его зовут либо он зовёт. Оторванный модуль
  // без шагов не проверит НИЧТО — ни компилятор потребителя на следующей волне, ни граница в конце.
  //
  // Связь считается в ОБЕ стороны намеренно. Реализацию интерфейса никто не зовёт по имени — её
  // выбирает контейнер, а зовут интерфейс; на живом плане eddi так живут ZipResourceSource и
  // RemoteApiResourceSource. Их проверяет компилятор (реализация обязана сойтись с интерфейсом) и
  // граничный тест того use case, который через них проходит.
  const calls = new Map(sections.map((s) => [s.path, (s.calls || []).filter((c) => ours.has(c))]))
  for (const t of mods) {
    if ((t.steps || []).length) continue
    // Вход программы шагов не держит по построению — они ушли границе, которая его и проверяет.
    if (bounds.some((b) => b.module === t.module)) continue
    const used = [...calls].some(([who, cs]) => who !== t.module && cs.includes(t.module))
    const uses = (calls.get(t.module) || []).some((c) => c !== t.module)
    if (!used && !uses) B.push(`${t.name}: за модулем нет ни одного шага, и он не связан с изменением — ни его зовут, ни он зовёт; проверить его нечем`)
  }

  // 9 — PRIMING. Карта объявила язык — значит стек известен, и наряд без него отправляет исполнителя
  // выбирать фреймворк по имени класса. Живой счёт: эмуляция на слабой модели дважды выдала файл на
  // Spring Boot в проекте на Quarkus. Карта языка не объявила — правило молчит: сказать нечего.
  if (stack) {
    const dark = tickets.filter((t) => !t.stack).map((t) => t.name)
    if (dark.length) B.push(`наряды без стека: ${dark.join(", ")} — карта объявила «${stack}», и без этой строки исполнитель выбирает фреймворк сам`)
  }

  // 10 — ОБЪЯВЛЕНИЕ. Чем открывается файл — пакет, аннотации, `class X extends Y implements Z`. Без
  // него исполнитель угадывает базовый класс; строка приходит из карточки плана (`declares`), и её
  // отсутствие здесь означает, что разошлись артефакты.
  const bare = mods.filter((t) => !t.declares).map((t) => t.name)
  if (bare.length) B.push(`наряды без объявления: ${bare.join(", ")} — в разделе плана нет строки «declares:», и открыть файл исполнителю не по чему`)

  // 11 — ОБРАЗЕЦ ТЕСТА. Наряд, который пишет тест, обязан назвать существующий тест образца, если тот
  // ЛЕЖИТ в репозитории: исполнитель знает, ЧТО утверждать, и не знает КАК — фреймворк, базовый
  // класс, чем подменяются зависимости. Зеркала нет — правила нет, и это честно.
  for (const t of mods) {
    if (!t.testClass) continue
    const want = (t.samples || []).map((p) => mirrorTest(p, match, testDir)).filter((p) => p && known.has(p))
    if (want.length && !want.some((p) => (t.inputs || []).includes(p))) {
      B.push(`${t.name} пишет тест, а образца теста не назвал: ${want.join(", ")} лежит в репозитории — без него исполнитель выдумывает фреймворк`)
    }
  }

  // 12 — НАРЯД ГОВОРИТ ПО-АНГЛИЙСКИ. Судятся именно ВЫРЕЗКИ — тело раздела, тексты шагов, сигнатуры:
  // фиксированный текст шаблона английский по построению, а кириллица может приехать только из
  // артефакта выше. Тогда это утечка языка заказа к исполнителю, и чинится она там, где написана.
  for (const t of tickets) {
    const cuts = [t.body, t.declares, t.signatures, t.goal, t.post, t.via,
      ...(t.steps || []).map((x) => x.text), ...(t.uses || []).map((u) => u.signatures), ...(t.fields || [])]
    const foreign = cyrillicWords(cuts.filter(Boolean).join("\n"))
    if (foreign.length) B.push(`${t.name} несёт кириллицу из артефактов выше: ${foreign.join(", ")} — наряд исполняет слабая модель в английском репозитории, и полоса ниже FRD пишется по-английски`)
  }

  return B
}

// FUNCTION_CONTRACT: ticketText — тикет как его прочитает исполнитель
//   Input:        ticket — элемент ticketsOf
//   Dependencies: —
//   Antecedent:   любое значение
//   Consequent:   success: текст файла тикета
//   Purity:       pure
//   Interface:    ticketText(ticket) -> string
//
// ВСЁ В ТИКЕТЕ — ВЫРЕЗКА. Тело модуля копируется из раздела плана по ключам грамматики карточки,
// шаги — из FRD, команда — из строки `verify`, стек и пакет — из карты. Пересказ здесь означал бы
// второй источник правды об одной работе.
//
// ТЕКСТ АНГЛИЙСКИЙ, ПОТОМУ ЧТО ЕГО ИСПОЛНЯЕТ СЛАБАЯ МОДЕЛЬ, ПИШУЩАЯ КОД. Граница языка полосы
// проходит по FRD: выше него артефакт читает человек на языке заказа, ниже — исполнитель, для
// которого требование на одном языке и репозиторий на другом есть ровно тот контекст, в котором он
// угадывает.
//
// ПОРЯДОК БЛОКОВ — ПОРЯДОК ПРОМПТА ДЛЯ СЛАБОЙ МОДЕЛИ, а не порядок карточки:
//   PRIMING (Stack) · ЦЕЛЬ (Goal) · ФОРМА (Declaration, Signatures) · ЧЕМ РАСПОЛАГАЕШЬ (What you
//   call) · ЧТО ДОКАЗАТЬ (What you must prove) · ПОРЯДОК · КРИТЕРИЙ (Done when) · ПРИМЕР (Follow the
//   sample) · ЗАПРЕТ (Do not touch) · КОМАНДА.
// Стек стоит ПЕРВЫМ намеренно: без него модель выбирает фреймворк по имени класса, и живой счёт
// эмуляции — файл на Spring Boot в проекте на Quarkus, дважды.
export function ticketText(t = {}) {
  const head = [
    "---",
    `id: ${t.id || ""}`,
    `key: ${t.key || ""}`,
    `branch: ${t.branch || ""}`,
    `kind: ${t.kind || ""}`,
    `wave: ${t.wave ?? ""}`,
    `blocked_by: [${(t.blocked_by || []).join(", ")}]`,
    `inputs:  [${(t.inputs || []).join(", ")}]`,
    `outputs: [${(t.outputs || []).join(", ")}]`,
    `verify: ${t.verify || ""}`,
    "---",
  ].join("\n")

  const steps = (t.steps || []).map((s) => `${String(s.step).replace("/", " step ")}${s.text ? `: ${s.text}` : ""}`)
  const stack = t.stack ? ["## Stack", "", String(t.stack), ""] : []

  // ГРАНИЦА. Ни одного пути и ни одного нового класса в теле — только канал, которым актёр входит в
  // программу, и то, что он обязан увидеть в ответ. Поэтому она компилируется СЕЙЧАС и краснеет по
  // делу: канала ещё нет.
  if (t.kind === "boundary") {
    return [head, "",
      ...stack,
      `## What to check — ${t.uc} from the outside, ${steps.length} checks`, "",
      t.goal ? `goal: ${t.goal}` : "",
      t.post ? `after success: ${t.post}` : "", "",
      steps.join("\n"), "",
      "## How to call it — ONLY through the program boundary", "",
      String(t.via || ""), "",
      "Not one class and not one path of this change may appear in the text of the test: it MUST",
      "compile NOW, before a single line of the code is written.", "",
      t.sample ? "## Follow the sample — how such tests are written IN THIS REPOSITORY" : "", t.sample ? "" : "",
      t.sample || "",
      t.sample ? "" : "",
      t.sample ? "Open it and take everything that is not given here: the framework and its annotations," : "",
      t.sample ? "the base class, how protected endpoints are reached, how it cleans up after itself. Invent" : "",
      t.sample ? "none of it — this project has already decided." : "", t.sample ? "" : "",
      (t.fields || []).length ? "## Values — what makes it refuse" : "", (t.fields || []).length ? "" : "",
      (t.fields || []).join("\n"), (t.fields || []).length ? "" : "",
      "## Rule", "",
      "The test MUST be RED, and red for a business reason: the channel is not there yet, the answer is",
      "not the one required. A build error does NOT count as red — it means you referred to something",
      "that does not exist. A green test here means it checks nothing.",
      "",
      "It turns green BY ITSELF once every module is in. No other ticket may edit it.", "",
      "## How to run", "", String(t.verify || ""),
    ].filter((x) => x !== "").join("\n")
  }

  // МОДУЛЬ. Тело режется ПО КЛЮЧАМ карточки, а не сваливается целиком: `declares` и `sample` стоят
  // своими блоками, и второй раз внутри «цели» они были бы тем же текстом, прочитанным дважды.
  const cut = (key) => block(String(t.body || ""), key)
  const goal = [cut("what"), cut("fields")].filter(Boolean).join("\n")
  const own = [t.pkg ? `package ${t.pkg}` : "", t.declares || ""].filter(Boolean).join("\n")
  const uses = (t.uses || []).map((u) => `${u.path}${u.mine === false ? "   (already exists in this repository)" : ""}\n${u.signatures}`).join("\n\n")
  const sample = [cut("sample"), ...(t.sampleTests || []).map((p) => `test: ${p}`)].filter(Boolean).join("\n")

  return [head, "",
    ...stack,
    "## Goal", "", goal || String(t.body || "").trim(), "",
    own ? "## Declaration — how the file opens" : "", own ? "" : "", own, own ? "" : "",
    t.signatures ? "## Signatures — what this module exposes" : "", t.signatures ? "" : "",
    t.signatures || "", t.signatures ? "" : "",
    uses ? "## What you call — their signatures" : "", uses ? "" : "", uses, uses ? "" : "",
    steps.length ? "## What you must prove — the requirement steps this module owns" : "",
    steps.length ? "" : "", steps.join("\n"), steps.length ? "" : "",
    "## Order of work", "",
    steps.length
      ? ["Write the TEST first, against the TEXT of the steps above — not against whatever is convenient",
         "to implement. Then the module. Then run it. The test and the code are both yours, so there is",
         "nobody but you to forbid bending the test to the implementation: it must assert the step word",
         "for word.",
         "The program boundary is checked by another ticket, and you may not edit its files."].join("\n")
      : ["No requirement step is left with this module: it is checked by whoever calls it. So the gate",
         "here is the BUILD. Your signature will be checked by the compiler of the caller on the very",
         "next wave, and the shape of the data going out — by the boundary test at the end."].join("\n"), "",
    "## Done when", "",
    [`every file listed in outputs exists: ${(t.outputs || []).join(", ")}`,
     ...(steps.length ? ["every step above is asserted by a test that quotes its text"] : []),
     "the command under `How to run` is green"].map((x) => `- ${x}`).join("\n"), "",
    sample ? "## Follow the sample — how THIS repository does it" : "", sample ? "" : "",
    sample, sample ? "" : "",
    sample && (t.sampleTests || []).length
      ? "Open the sample test and take from it what is not written here: the framework, the base class,\nhow dependencies are faked, how it cleans up. Invent none of it — this project has already decided."
      : "",
    sample && (t.sampleTests || []).length ? "" : "",
    (t.forbidden || []).length ? "## Do not touch" : "", (t.forbidden || []).length ? "" : "",
    (t.forbidden || []).length
      ? ["Creating or editing files that are not in your outputs. Other tickets write them:",
         ...(t.forbidden || []).map((f) => `  ${f.path}  — ticket ${f.ticket}`),
         "Something missing in them is a defect of the ticket, not a reason to write it yourself."].join("\n")
      : "",
    (t.forbidden || []).length ? "" : "",
    // Запрет на тавтологию — только там, где тесты вообще пишутся: у модуля без шагов ворота это
    // сборка, и писать ему нечего.
    steps.length ? "A constant assertion (assertTrue(true), assert 1 == 1) is not a test: it is green always" : "",
    steps.length ? "and checks nothing. Every check MUST assert the TEXT of its own step." : "",
    steps.length ? "" : "",
    "## How to run", "", String(t.verify || ""),
  ].filter((x) => x !== "").join("\n")
}
