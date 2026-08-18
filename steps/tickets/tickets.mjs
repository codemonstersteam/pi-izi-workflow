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
// ВХОД — ПУТЬ, А НЕ ВСЁ, ГДЕ ЕСТЬ СЛЭШ. `по образцу` — проза, и в ней встречается URI ресурса, пакет,
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

// Имя теста, как его назвала роль: второе поле строки «проверка» либо флаг команды. Роль пишет и
// `<команда> · XTest`, и `<команда> -Dtest=XTest` — оба разбираются здесь, один раз.
const namedTest = (check) => {
  const parts = String(check || "").split("·").map((x) => x.trim()).filter(Boolean)
  const tail = parts.length > 1 ? parts[parts.length - 1] : ""
  if (tail && !tail.startsWith("-")) return tail
  const flag = String(check || "").match(/-D(?:it\.)?test=(\S+)/)
  return flag ? flag[1] : ""
}

// FUNCTION_CONTRACT: ticketsOf — наряды исполнителям: сперва тесты, потом модули
//   Input:        { sections, order, frd, key, branch, match, testDir }
//                 match   — шаблон имени теста из `<suite match>` карты
//                 testDir — каталог тестов из `<suite path>` карты
//   Dependencies: ownerOf, stepText, testFile, namedTest
//   Antecedent:   любые значения
//   Consequent:   success: Ticket[] в порядке исполнения — тест раньше своего модуля
//                 failure: нет — тотальна
//   Purity:       pure
//   Interface:    ticketsOf({ sections, order, frd, key, branch, match, testDir }) -> Ticket[]
//
// ЕДИНИЦА ТЕСТОВОГО ТИКЕТА — ПАРА «МОДУЛЬ × USE CASE», а не модуль. Модуль, закрывающий два десятка
// шагов восьми use case, дал бы один неподъёмный наряд; разрезанный по use case — восемь нарядов по
// две-четыре проверки, и каждый читается слабой моделью целиком.
//
// ТЕСТ ВСЕГДА РАНЬШЕ МОДУЛЯ, и это не пожелание: модульный тикет ЖДЁТ свои тесты через `blocked_by`,
// а тестовый файл не входит в его `outputs`. Привести модуль к тесту исполнитель может, привести тест
// к модулю — нет.
export function ticketsOf({ sections = [], order = [], frd = {}, key = "", branch = "", match = "*", testDir = "", known = new Set() } = {}) {
  const byPath = new Map(sections.map((s) => [s.path, s]))
  const owner = ownerOf({ sections, order })

  const mine = new Map()
  for (const [step, path] of owner) {
    const uc = step.split("/")[0]
    if (!mine.has(path)) mine.set(path, new Map())
    mine.get(path).set(uc, [...(mine.get(path).get(uc) || []), step])
  }

  const list = []
  // КТО НАБЛЮДАЕТ МОДУЛЬ — обратный граф «зовёт», из тех же разделов, что и прямой.
  const watch = new Map()
  for (const s of sections) {
    for (const c of s.calls || []) if (byPath.has(c) && c !== s.path) watch.set(c, [...(watch.get(c) || []), s.path])
  }

  // Тест-классы и имена тикетов КАЖДОГО модуля считаются ДО главного цикла: наблюдатель стоит в
  // очереди работ позже наблюдаемого, и к моменту обработки зовомого тикетов зовущего ещё нет.
  const byTests = new Map()
  for (const path of order) {
    const s = byPath.get(path)
    if (!s) continue
    const named = namedTest(line(s.body, "проверка"))
    const ucs = [...(mine.get(path) || new Map()).keys()]
    byTests.set(path, {
      classes: ucs.map((uc) => testFile(named, uc, match).replace(/\.[^.]+$/, "")).filter(Boolean),
      names: ucs.map((uc) => `test-${slug(path)}-${uc.toLowerCase()}`),
    })
  }

  // Ближайшие наблюдатели, у которых тесты ЕСТЬ: вверх по обратному графу, пока не найдутся. Не нашлось
  // никого — остаётся голый сьют, и это честный последний случай: «собирается и не ломает существующее».
  const climb = (path, pick, seen = new Set()) => {
    const out = []
    for (const w of watch.get(path) || []) {
      if (seen.has(w)) continue
      seen.add(w)
      const got = pick(byTests.get(w) || { classes: [], names: [] })
      out.push(...(got.length ? got : climb(w, pick, seen)))
    }
    return [...new Set(out)]
  }
  const watchers = (path) => climb(path, (t) => t.classes)
  const watcherTests = (path) => climb(path, (t) => t.names)

  for (const path of order) {
    const s = byPath.get(path)
    if (!s) continue
    const check = line(s.body, "проверка")
    const cmd = check.split("·")[0].trim()
    const named = namedTest(check)
    // Вход обязан быть путём, который КТО-ТО знает: узлом карты или модулем, который пишет сам план.
    // Всё прочее в строке «по образцу» — проза.
    const sample = paths(block(s.body, "по образцу")).filter((p) => known.has(p) || byPath.has(p))
    const deps = (s.calls || []).filter((c) => byPath.has(c) && c !== path)

    // ③ тесты — по одному на use case, которым владеет модуль
    const tests = []
    for (const [uc, steps] of (mine.get(path) || new Map())) {
      const file = testFile(named, uc, match)
      const cls = file.replace(/\.[^.]+$/, "")
      tests.push({
        kind: "test",
        module: path,
        uc,
        name: `test-${slug(path)}-${uc.toLowerCase()}`,
        steps: steps.map((x) => ({ step: x, text: stepText(frd, uc, x.split("/")[1]) })),
        signatures: block(s.body, "сигнатуры"),
        // Тест ложится туда, где их держит репозиторий (`<suite path>` карты): раскладку решает
        // проект, а не этот код.
        outputs: file ? [testPath(path, file, testDir)] : [],
        inputs: [...new Set([...sample, ...deps])],
        // Команда закрывает ИМЕННО этот тест: подстановка идёт в тот же флаг, который назвала роль.
        verify: cmd.replace(/-D(it\.)?test=\S+/, (m) => m.replace(/=.*/, `=${cls}`)),
        testClass: cls,
        blocked_by: [],
      })
    }
    list.push(...tests)

    // ④ модуль — ждёт свои тесты и зовомые модули.
    //
    // ЗАКРЫВАЕТСЯ ОН СВОИМИ ТЕСТАМИ, а не тем именем, которое роль написала в «проверке»: тесты
    // разрезаны по use case, и класса с исходным именем никто не создаёт. Подстановка идёт в тот же
    // флаг, которым команду параметризовала разведка; модуль без собственных тестов закрывается
    // сьютом целиком — «собирается и не ломает существующее».
    const own = tests.map((t) => t.testClass).filter(Boolean)
    // МОДУЛЬ БЕЗ СВОИХ ШАГОВ ЗАКРЫВАЕТСЯ ТЕСТАМИ ТОГО, КТО ЕГО ЗОВЁТ. Шагов за ним не осталось ровно
    // потому, что он наблюдаем ЧЕРЕЗ зовущего (ownerOf, правило отсева) — значит и проверка его та же.
    // Целый сьют репозитория проверкой не является: на eddi это 722 теста, ни один из которых не про
    // этот модуль, и «сделано» становится недоказуемым. Правило графовое: ни слова о виде модуля.
    const seen_ = own.length ? own : watchers(path)
    const moduleVerify = seen_.length
      ? cmd.replace(/-D(it\.)?test=\S+/, (m) => m.replace(/=.*/, `=${seen_.join(",")}`))
      : cmd.replace(/\s*-D(it\.)?test=\S+/, "")

    list.push({
      kind: "module",
      module: path,
      name: slug(path),
      body: s.body,
      steps: (s.closes || []).map((x) => ({ step: x, text: stepText(frd, x.split("/")[0], x.split("/")[1]) })),
      outputs: [path],
      inputs: [...new Set([...sample, ...deps, ...tests.flatMap((t) => t.outputs)])],
      verify: moduleVerify,
      testClass: seen_.join(", "),
      waitsFor: [...deps],
      // Ждёт СВОИ тесты, а если их нет — тесты наблюдателя: RED-first держится и здесь, тест зовущего
      // идёт волной раньше зовомого.
      waitsForTests: own.length ? tests.map((t) => t.name) : watcherTests(path),
    })
  }

  const id = new Map(list.map((t, k) => [t.name, String(k + 1).padStart(2, "0")]))
  const byModule = new Map(list.filter((t) => t.kind === "module").map((t) => [t.module, t.name]))

  const withDeps = list.map((t) => ({
    ...t,
    id: id.get(t.name),
    key,
    branch,
    blocked_by: (t.kind === "test"
      ? []                                          // тест не ждёт ничего: он пишется по контракту
      : [...t.waitsForTests, ...t.waitsFor.map((d) => byModule.get(d)).filter(Boolean)]
    ).map((n) => id.get(n)).filter(Boolean).sort(),
  }))

  // ⑤ волны — по blocked_by, а не по позиции: тикеты одной волны не связаны ничем
  const byId = new Map(withDeps.map((t) => [t.id, t]))
  const wave = new Map()
  const waveOf = (t, seen = new Set()) => {
    if (wave.has(t.id)) return wave.get(t.id)
    if (seen.has(t.id)) return 0
    seen.add(t.id)
    const w = Math.max(0, ...t.blocked_by.map((d) => (byId.has(d) ? waveOf(byId.get(d), seen) + 1 : 0)))
    wave.set(t.id, w)
    return w
  }
  return Object.freeze(withDeps.map((t) => Object.freeze({ ...t, wave: waveOf(t) })))
}

// FUNCTION_CONTRACT: checkTickets — раскладка судится, смысл не судится
//   Input:        { tickets, sections, frd }
//   Dependencies: —
//   Antecedent:   любые значения
//   Consequent:   success: string[] — по блокеру на дефект, пусто = зелено
//   Purity:       pure
//   Interface:    checkTickets({ tickets, sections, frd }) -> string[]
//
// ШЕСТЬ ПРАВИЛ, И КАЖДОЕ ЛОВИТ ПОТЕРЮ, А НЕ ВКУС. Правильно ли решён модуль — прочитал человек на
// гейте 1; здесь проверяется, что ни одна работа не осталась без исполнителя, ни одно требование не
// проверено дважды или ни разу, и что тест нельзя подогнать под реализацию.
export function checkTickets({ tickets = [], sections = [], frd = {}, known = new Set() } = {}) {
  const B = []
  const mods = tickets.filter((t) => t.kind === "module")
  const tests = tickets.filter((t) => t.kind === "test")

  // 1 — модульный тикет на каждый раздел плана, и ни одного лишнего
  const planned = sections.map((s) => s.path)
  const cut = mods.map((t) => t.module)
  const lost = planned.filter((p) => !cut.includes(p))
  const extra = cut.filter((p) => !planned.includes(p))
  if (lost.length) B.push(`модули плана без тикета: ${lost.join(", ")} — их работу никто не исполнит`)
  if (extra.length) B.push(`тикеты на модули вне плана: ${extra.join(", ")}`)

  // 2 — каждый шаг требования принадлежит РОВНО одному тестовому тикету
  const owned = new Map()
  for (const t of tests) for (const s of t.steps || []) owned.set(s.step, [...(owned.get(s.step) || []), t.id])
  const twice = [...owned].filter(([, who]) => who.length > 1)
  if (twice.length) B.push(`шаги, проверяемые дважды: ${twice.map(([s, who]) => `${s} (${who.join(", ")})`).join("; ")} — у шага один владелец`)

  const want = []
  for (const u of (frd && frd.usecases) || []) {
    const uid = String((u && u.id) || "").trim()
    if (!uid) continue
    for (const [k] of (u.steps || []).entries()) want.push(`${uid}/${k + 1}`)
    for (const e of u.exts || []) if (e && e.id) want.push(`${uid}/${e.id}`)
  }
  const unchecked = want.filter((w) => !owned.has(w))
  if (unchecked.length) B.push(`шаги требования без единой проверки: ${unchecked.join(", ")}`)

  // 3 — outputs непуст, и ни один путь не назван дважды
  const seen = new Map()
  for (const t of tickets) {
    if (!(t.outputs || []).length) B.push(`тикет ${t.id} (${t.name}) ничего не производит — outputs пуст`)
    for (const o of t.outputs || []) seen.set(o, [...(seen.get(o) || []), t.id])
  }
  const shared = [...seen].filter(([, who]) => who.length > 1)
  if (shared.length) B.push(`один путь в двух тикетах: ${shared.map(([o, who]) => `${o} (${who.join(", ")})`).join("; ")} — двух исполнителей на файле не бывает`)

  // 4 — verify непуст
  const dumb = tickets.filter((t) => !String(t.verify || "").trim()).map((t) => t.id)
  if (dumb.length) B.push(`тикеты без команды проверки: ${dumb.join(", ")} — закрыть их нечем`)

  // 5 — модуль ждёт свои тесты, и тестовый файл не в его outputs
  for (const m of mods) {
    const its = tests.filter((t) => t.module === m.module)
    const missed = its.map((t) => t.id).filter((x) => !(m.blocked_by || []).includes(x))
    if (missed.length) B.push(`тикет ${m.id} не ждёт свои тесты ${missed.join(", ")} — реализация опередит проверку`)
    const touch = (m.outputs || []).filter((o) => its.flatMap((t) => t.outputs || []).includes(o))
    if (touch.length) B.push(`тикет ${m.id} пишет в тестовый файл ${touch.join(", ")} — подгонка теста под реализацию`)
  }

  // 6 — blocked_by резолвится
  const ids = new Set(tickets.map((t) => t.id))
  for (const t of tickets) {
    const ghost = (t.blocked_by || []).filter((d) => !ids.has(d))
    if (ghost.length) B.push(`тикет ${t.id} ждёт несуществующие ${ghost.join(", ")}`)
  }

  // 7. КАЖДЫЙ ВХОД — ПУТЬ, КОТОРЫЙ КТО-ТО ЗНАЕТ. Исполнителю нельзя велеть прочитать то, чего нет:
  // ни карта, ни план такого файла не называют, значит в наряде проза, а не вход. Тесты, которые
  // тикет сам же и порождает, знает план по построению.
  //
  // Без карты правило МОЛЧИТ — той же дисциплиной, что F5 без источников: судить не по чему, и
  // выдумывать нечего (steps/intake/frd.mjs::provenance).
  const ours = new Set(planned)
  const stray = known.size ? [...new Set(tickets.flatMap((t) => (t.inputs || [])
    .filter((p) => !known.has(p) && !ours.has(p) && !tickets.some((x) => (x.outputs || []).includes(p)))))] : []
  if (stray.length) B.push(`во входах пути, которых не знает ни карта, ни план: ${stray.join(", ")} — исполнителю нечего по ним открыть`)

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
// ВСЁ В ТИКЕТЕ — ВЫРЕЗКА. Тело модуля копируется из раздела плана, шаги — из FRD, команда — из строки
// «проверка». Пересказ здесь означал бы второй источник правды об одной работе.
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

  const steps = (t.steps || []).map((s) => `${String(s.step).replace("/", " шаг ")}${s.text ? `: ${s.text}` : ""}`)

  if (t.kind === "test") {
    return [head, "",
      `## Что проверяем — ${t.uc}, проверок ${steps.length}`, "",
      steps.join("\n"), "",
      "## Что зовём — сигнатуры модуля, они же контракт", "",
      t.module, String(t.signatures || "(сигнатуры не названы)"), "",
      "## Правило", "",
      "Тест пишется ДО модуля и обязан УПАСТЬ: модуля ещё нет. Зелёный тест на этом месте значит, что",
      "он ничего не проверяет. Одна проверка на шаг: happy-путь по тексту шага, отказ по его коду.",
      "Зови модуль ровно теми сигнатурами, что названы выше, — их же реализует другой наряд.", "",
      "## Как запустить", "", String(t.verify || ""),
    ].join("\n")
  }

  return [head, "",
    "## Что делаем", "",
    String(t.body || "").trim().split("\n").filter((l) => !/^\s*(закрывает|проверка):/.test(l)).join("\n").trim(), "",
    "## Зачем — шаги, которые это закрывает", "",
    steps.join("\n"), "",
    "## Как проверить", "",
    // Имя класса дописывается, только если команда его не назвала: у модуля с девятью наблюдателями
    // это был бы тот же список второй раз, а тикет читает слабая модель.
    `${t.verify || ""}${t.testClass && !String(t.verify || "").includes(t.testClass) ? ` · ${t.testClass}` : ""}`, "",
    "Тесты уже написаны и лежат по путям из inputs. Правь МОДУЛЬ, пока они не станут зелёными;",
    "тестовые файлы не трогай — они не в твоих outputs.",
  ].join("\n")
}
