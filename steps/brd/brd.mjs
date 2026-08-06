// MODULE_CONTRACT: brd — фронт-дор конвейера: единственное место, где решается, сдан ли BRD
// Purpose:    одно решение — состав правил приёмки BRD (обязательные поля R, происхождение чисел
//             критерия, измеримость fit, желание-не-требование, дизайн-течь в формулировке,
//             грепабельность subjects, закрытые open-questions) собран в одном списке проверок, а
//             не разбросан прозой по роли и наряду — самосертификация снята: «agent-ready» решает
//             скрипт, а не роль о себе.
// io:         none
// Invariants: WISH_WORDS и DESIGN_MARKS — константы модуля, зафиксированы при загрузке, не меняются
//             исполнением; SUBJECTS_MIN/SUBJECTS_MAX — снимок BRD_FORM.subjectsMin/subjectsMax на
//             момент загрузки модуля, не пересчитывается на каждый вызов; parseBrd и validateBrd —
//             чистые функции без состояния, результат зависит только от переданных text/opts, не от
//             истории или порядка предыдущих вызовов.
// Interface:  BRD_FORM — реестр формы BRD
//             SUBJECTS_MIN — нижняя граница числа якорей
//             SUBJECTS_MAX — верхняя граница числа якорей
//             numbersIn(text) -> Set<string>
//             parseBrd(text) -> { requirements, subjects, openQuestions }
//             newFit(raw, known) -> Result<Fit, "no-fit" | "fit-not-measurable" | "invented-default">
//             newRequirement(raw, known) -> Result<Requirement, "invalid-requirement">
//             newSubjects(list) -> Result<Subjects, "invalid-subjects">
//             adviceFor(r) -> Advice[]
//             languageDrifted(fit, source) -> boolean
//             newBrd(text, sources) -> Result<Brd, "invalid-brd">

// Приёмка BRD фронт-дора (B1-S). ЧИСТОЕ — без node:fs.
//
// Самосертификация снята: «agent-ready» решает скрипт, а не роль о себе. Проверяем ровно то, что
// объявлено законом роли: у каждого R есть fit и verify; вопросов не осталось; subjects[] — якоря
// грепа, а не литература; решение не спроектировано.

// Формулировки-желания. Именно они и есть то, что фронт-дор существует остановить: у них нет ни
// шкалы, ни способа проверки, а выглядят они как требование.
const WISH_WORDS = [
  "быстро", "быстрый", "валидн", "корректн", "правильн", "как обычно", "обычная ошибка", "удобн",
  "надёжн", "надежн", "оптимальн", "хорош", "адекватн",
  "fast", "quick", "valid", "correct", "proper", "the usual", "as usual", "reliable", "optimal", "nice",
]
// Следы решения в требовании: путь, аннотация, импорт, класс-с-точкой. «Что», а не «как» (Jackson).
const DESIGN_MARKS = [
  /(^|\s)[\w./-]*src\//i, /(^|\s)@[A-Z]\w+/, /\b\w+\.(java|go|ts|js|py|kt|rb|cs)\b/i,
  /\bимпорт\b|\bimport\b/i, /\bкласс\s+[A-Z]\w+|\bclass\s+[A-Z]\w+/,
]

import { ok, err } from "../../core/result.mjs"
import { severityOf } from "../../core/findings.mjs"
// Что от BRD требуется — объявлено РЕЕСТРОМ формы (B20-S1/S6). Правило «subject обязан встречаться
// в тексте R» из кода удалено (живой прогон 01.08: BRD по-русски с английскими якорями корректен, а
// правило валило его целиком), но в прозе шаблонов оно осталось — и роль исполняла несуществующее
// правило. Реестр объявляет намерение один раз: проверяемое и заказываемое — одна запись.
import { BRD_FORM, cyrillicRatio, isMeasurable, MEASURABLE_TOKENS } from "../../core/form.mjs"

export const SUBJECTS_MIN = BRD_FORM.subjectsMin
export const SUBJECTS_MAX = BRD_FORM.subjectsMax
export { BRD_FORM }

// H1. ЧИСЛО В КРИТЕРИИ ОБЯЗАНО ИМЕТЬ ИСТОЧНИК.
//
// Главный отказ фронт-дора — подставить умолчание вместо вопроса оператору. У этого отказа есть
// точный резолвер: число, которого нет ни в задаче, ни в ответах оператора, взялось из головы
// модели. Проверяем ровно это и ничего сверх: смысл критерия машина не судит, происхождение числа —
// судит.
//
// Считаем только числовые литералы `fit:`. Формулировку требования не трогаем: там числа бывают
// пересказом («не более двадцати»), а критерий обязан быть машинным.
// FUNCTION_CONTRACT: numbersIn — числовые литералы текста, нормализованные для сравнения происхождения
//   Input:        text — сырой текст (BRD, задача или ответ оператора), в котором ищутся числа
//   Dependencies: —
//   Antecedent:   ЛЮБОЕ значение — приводится к строке через String(text || ""); диапазон не сужен,
//                 функция тотальна на входе (сама природа задачи — искать числа в чём угодно, включая
//                 отсутствующий текст)
//   Consequent:   success: Set<string> — каждое числовое совпадение /\d+(?:[.,]\d+)?/ из текста, запятая
//                          заменена на точку, ведущие нули перед значащей цифрой срезаны; повтор
//                          одного и того же нормализованного числа схлопывается — Set, не массив.
//                          text пуст/undefined/null → String(text || "") = "" → пустой Set. "007" →
//                          "7" (ведущие нули срезаны), "0.5" не тронуто (ведущий ноль не перед цифрой —
//                          перед точкой), "1,5" → "1.5" (запятая — десятичный разделитель, не тысячный)
//                 failure: нет — тотальна на любом входе (String() не бросает ни на каком входе,
//                          matchAll не бросает при отсутствии совпадений)
export function numbersIn(text) {
  const out = new Set()
  for (const m of String(text || "").matchAll(/\d+(?:[.,]\d+)?/g)) {
    out.add(m[0].replace(",", ".").replace(/^0+(?=\d)/, ""))
  }
  return out
}

// FUNCTION_CONTRACT: parseBrd — разбирает сырой текст BRD в требования, subjects и open-questions
//   Input:        text — сырой текст BRD-документа
//   Dependencies: —
//   Antecedent:   ЛЮБОЕ значение — приводится к строке через String(text || "") и делится на строки;
//                 диапазон не сужен, функция тотальна. Формат, который парсер РАСПОЗНАЁТ (не требует —
//                 распознаёт): построчный, `R<n> …` открывает требование, `fit:`/`verify:` (или
//                 `проверка:`) заполняют поля ТЕКУЩЕГО требования, `subjects[]: …` и
//                 `open-questions: …` — служебные строки вне требований
//   Consequent:   success: { requirements: Array<{id, statement, fit, verify, line}>,
//                          subjects: string[] | null, openQuestions: string | null }; line — номер
//                          строки (1-based) заголовка `R<n>`.
//                          · text пуст/undefined/null → requirements=[], subjects=null,
//                            openQuestions=null — строк для разбора нет вовсе, а не ошибка.
//                          · строка `R<n>` заводит новое требование с fit=null, verify=null и делает
//                            его ТЕКУЩИМ — поля `fit:`/`verify:` заполняют именно его, до следующей
//                            `R<n>` или конца текста.
//                          · `fit:`/`verify:` (`проверка:`) без предшествующего `R<n>` (cur=null)
//                            молча игнорируются — поле, к которому некуда писать, теряется, а не
//                            бросает и не пишет мимо.
//                          · строка, не начавшая требование и не совпавшая ни с одним служебным
//                            префиксом, ДОПИСЫВАЕТСЯ к statement ТЕКУЩЕГО требования через пробел,
//                            пока его `fit` ещё не заполнен — многострочная формулировка собирается
//                            построчно до первой `fit:`. Требует существующего cur: та же строка до
//                            первой `R<n>` (cur=null), как и осиротевшие `fit:`/`verify:`, молча
//                            теряется.
//                          · `subjects[]: …` разбит по `·`/`,`/`;`, каждый элемент обрезан пробелами,
//                            пустые отфильтрованы; строка встретилась НИ РАЗУ → subjects=null
//                            (а не []) — «нет строки» и «строка с пустым списком» различимы.
//                          · `open-questions: …` не встретилась ни разу → openQuestions=null;
//                            встретилась → её обрезанное значение как есть, без проверки формы (это
//                            дело validateBrd).
//                 failure: нет — тотальна на любом входе, решение всегда объект, исключения не
//                          бросаются
export function parseBrd(text) {
  const lines = String(text || "").split("\n")
  const requirements = []
  let cur = null
  let subjects = null
  let openQuestions = null
  lines.forEach((line, i) => {
    const r = /^\s*(R\d+)\b[.:)\s]*(.*)$/.exec(line)
    if (r) { cur = { id: r[1], statement: r[2].trim(), fit: null, verify: null, line: i + 1 }; requirements.push(cur); return }
    const fit = /^\s*fit\s*:\s*(.*)$/i.exec(line)
    if (fit && cur) { cur.fit = fit[1].trim(); return }
    const ver = /^\s*(verify|проверка)\s*:\s*(.*)$/i.exec(line)
    if (ver && cur) { cur.verify = ver[2].trim(); return }
    const sub = /^\s*subjects\s*\[\s*\]\s*:\s*(.*)$/i.exec(line)
    if (sub) { subjects = sub[1].split(/[·,;]/).map((s) => s.trim()).filter(Boolean); return }
    const oq = /^\s*open-questions\s*:\s*(.*)$/i.exec(line)
    if (oq) { openQuestions = oq[1].trim(); return }
    // продолжение формулировки требования (перенос строки), пока не начались fit/verify
    if (cur && !cur.fit && line.trim() && !/^\s*(R\d+|subjects|open-questions)/i.test(line)) {
      cur.statement = (cur.statement + " " + line.trim()).trim()
    }
  })
  return { requirements, subjects, openQuestions }
}

// opts.sources — тексты, откуда числа критерия ИМЕЮТ право взяться: TASK.md и ответы
// оператора. Не передали ни одного — правило молчит: судить происхождение не по чему.
// --- BRD как доменное значение --------------------------------------------------------------------
//
// Раньше здесь был validateBrd — агрегатор на 12 кодов: он возвращал СПИСОК находок, и невалидный
// BRD существовал как значение, которое кто-то мог прочитать дальше. Теперь он не строится.
//
// ДВА ОГРАНИЧЕНИЯ, под которые спроектировано, и оба существенны.
//
// 1. ADVICE НЕ РОНЯЕТ ПРИЁМКУ. Правило без резолвера истины (похоже на желание, похоже на механизм)
//    судить формулировку естественного языка не может ни при какой регулярке — оно понижено до
//    сборщика улик (core/findings.mjs). Улики едут НА УСПЕХЕ, вместе с построенным BRD, и уходят
//    оператору. Сделать их классом отказа значило бы вернуть роли право портить корректный
//    артефакт, подгоняя его под неверное правило — ровно то, что стоило прогона 01.08.
//
// 2. БЛОКЕРЫ СОБИРАЮТСЯ ВСЕ, А НЕ ПЕРВЫЙ. Объявление шага чинит человек, и первого отказа ему
//    хватает. BRD чинит МОДЕЛЬ, и каждый ретрай — это вызов: отдать ей один блокер из пяти значит
//    заплатить пятью вызовами за то, что сообщается одним. Поэтому detail несёт весь список.
//    Значение при этом всё равно не строится — представимость невалидного BRD закрыта.

// FUNCTION_CONTRACT: newFit — измеримый критерий требования
//   Input:        raw — строка поля fit
//   Dependencies: known — множество чисел, встречающихся в источниках (задача, ответы оператора),
//                 либо null, если источники не поданы
//   Antecedent:   непустая строка, несущая хотя бы один измеримый токен (MEASURABLE_TOKENS), и —
//                 когда источники известны — ни одного числа, которого в них нет
//   Consequent:   success: критерий
//                 failure: "no-fit" — требование без измеримости не сдано
//                          "fit-not-measurable" — критерий, который нельзя измерить, не критерий
//                          "invented-default" — умолчание подставлено, а не спрошено
// invented-default — смысл существования этого шага: он ловит число, взятое моделью из головы.
// known === null значит «источники не поданы», и это НЕ «нарушений нет»: правило молчит, потому
// что сверять не с чем, а не потому, что сверка прошла.
export function newFit(raw, known) {
  if (!raw) return err("no-fit", "нет fit-критерия — требование без измеримости не сдано")
  if (!isMeasurable(raw)) {
    return err("fit-not-measurable", `fit не несёт ни одного измеримого токена (${MEASURABLE_TOKENS.map((t) => t.name).join(", ")})`)
  }
  if (known) {
    const invented = [...numbersIn(raw)].filter((n) => !known.has(n))
    if (invented.length) {
      return err("invented-default", `число ${invented.join(", ")} в fit не встречается ни в задаче, ни в ответах оператора — умолчание подставлено, а не спрошено`)
    }
  }
  return ok(raw)
}

// FUNCTION_CONTRACT: newRequirement — требование, из которого можно строить
//   Input:        raw — { id, statement, fit, verify, line } из parseBrd
//   Dependencies: known — множество чисел источников либо null
//   Antecedent:   непустая формулировка, строящийся fit (newFit) и непустой verify
//   Consequent:   success: замороженное требование
//                 failure: "invalid-requirement" — detail называет id и причину
// Требование без способа проверки — это утверждение, а не требование: его нечем закрыть.
export function newRequirement(raw, known) {
  const at = raw.id || "R?"
  if (!raw.statement) return err("invalid-requirement", `${at}: формулировка пуста`)
  const fit = newFit(raw.fit, known)
  if (!fit.ok) return err("invalid-requirement", `${at}: ${fit.error.detail}`)
  if (!raw.verify) return err("invalid-requirement", `${at}: нет способа проверки (команда или артефакт)`)
  return ok(Object.freeze({ id: raw.id, statement: raw.statement, fit: fit.value, verify: raw.verify, line: raw.line }))
}

// FUNCTION_CONTRACT: newSubjects — якоря грепа по репозиторию
//   Input:        list — массив терминов из строки subjects[]
//   Dependencies: —
//   Antecedent:   от SUBJECTS_MIN до SUBJECTS_MAX терминов, каждый — ОДНО слово (грепабельный
//                 якорь, а не фраза), повторов нет
//   Consequent:   success: замороженный список
//                 failure: "invalid-subjects" — detail называет причину
// ЖИВОЙ ПРОГОН 01.08: здесь стояло правило «subject обязан встречаться в тексте R». Оно неверно по
// существу: subjects[] — якоря грепа по РЕПОЗИТОРИЮ, а репозиторий английский, тогда как требование
// пишется на языке оператора. Правило валило корректный BRD и заставляло роль ПОРТИТЬ артефакт,
// подгоняя якоря под язык требования. Проверяется то, что действительно делает термин якорем.
export function newSubjects(list) {
  if (list.length < SUBJECTS_MIN || list.length > SUBJECTS_MAX) {
    return err("invalid-subjects", `subjects[] = ${list.length}; допустимо ${SUBJECTS_MIN}..${SUBJECTS_MAX}`)
  }
  const phrase = list.find((s) => /\s/.test(String(s).trim()))
  if (phrase) return err("invalid-subjects", `subject «${phrase}» — фраза, а не якорь: ${BRD_FORM.subjectRule}`)
  const dup = list.find((s, i) => list.indexOf(s) !== i)
  if (dup) return err("invalid-subjects", `subject «${dup}» повторяется`)
  return ok(Object.freeze([...list]))
}

// FUNCTION_CONTRACT: adviceFor — улики, которые НЕ роняют приёмку
//   Input:        r — построенное требование
//   Dependencies: —
//   Antecedent:   требование построено
//   Consequent:   success: массив находок-улик; пустой, если формулировка ни на что не похожа
//                 failure: нет — тотальна
// Улика несёт ФРАЗУ, на которой сработало правило: оператор смотрит не на код, а на текст, который
// правило сочло подозрительным. ЖИВОЙ ПРОГОН 04: правило про желание валило «limit (default 20,
// VALID range 1..100)» — слово-желание стояло рядом с точным диапазоном. Желание — это ОТСУТСТВИЕ
// критерия, а не наличие слова, поэтому улика ставится, только когда измеримого рядом НЕТ.
export function adviceFor(r) {
  const out = []
  const hay = `${r.statement} ${r.fit}`.toLowerCase()
  const measurable = /\d/.test(hay) || /\.\.|→|<=|>=|\||enum|формат|format|regex/.test(hay)
  const wish = WISH_WORDS.find((w) => hay.includes(w))
  if (wish && !measurable) {
    out.push({ code: "wish-not-requirement", message: `${r.id}: «${wish}» — похоже на желание, а не критерий: нужна шкала, значение или формат`, line: r.line, evidence: r.statement, severity: severityOf("wish-not-requirement") })
  }
  for (const re of DESIGN_MARKS) {
    if (re.test(r.statement)) {
      out.push({ code: "design-leak", message: `${r.id}: похоже на МЕХАНИЗМ в требовании (путь/аннотация/класс) — фронт-дор фиксирует что и зачем, не как`, line: r.line, evidence: r.statement, severity: severityOf("design-leak") })
      break
    }
  }
  return out
}

// Ниже порога букв текст языка не несёт вовсе: `fit: ≤ 200 мс` — это два-три знака алфавита при
// числе и знаке сравнения, и судить его язык не по чему. Порог именно об этом, и НЕ является защитой
// от формул: `format: ISO-8601 | null` даёт 13 букв и правилом судится (см. FUNCTION_CONTRACT ниже).
const MIN_LETTERS = 6

// FUNCTION_CONTRACT: languageDrifted — написан ли критерий не на языке источника
//   Input:        fit — формулировка fit одного требования; тип не ограничен
//   Dependencies: source — текст, задающий язык артефакта (задача плюс ответы оператора); пусто →
//                 правило молчит: сверять не с чем, а молчать честнее, чем обвинять наугад
//   Antecedent:   любые значения, оба приводятся к строке
//   Consequent:   success: true, когда источник решительно на одном алфавите (доля кириллицы > 0.5
//                          либо < 0.1), а fit — решительно на другом, И в fit не меньше MIN_LETTERS
//                          букв; во всех прочих случаях false — смешанный источник, короткий fit
//                          и пустой source судить не по чему
//                 failure: нет — тотальна
// F20 (run-6) и F16 (run-5): при русской задаче формулировки требований приходили русскими, а
// `fit`/`verify` — английскими, потому что роль берёт форму из примера, а содержание из входа.
// Артефакт производится наполовину из промпта; для человека, который его принимает, это документ
// на двух языках, а для приёмки — неразличимо.
//
// СУДИТСЯ ТОЛЬКО `fit`. `verify` объявлен как «команда | артефакт» (роль, наряд), и он английский по
// природе — краснеть на верно исполненной форме правило не вправе. `subjects[]` исключены реестром:
// BRD_FORM.subjectRule прямо предписывает якорям язык РЕПОЗИТОРИЯ, а не запроса.
//
// ЧЕСТНАЯ ГРАНИЦА: подсчётом букв нельзя отличить `fit` из одной формулы (`format: ISO-8601 | null`)
// от английской прозы — ложные срабатывания на таких критериях есть, и порог букв их не снимает.
// Цена принята сознательно: исполнение стоит роли одного слова (`формат: ISO-8601 | null` — значение
// и токен нетронуты), в отличие от снятого 01.08 правила про язык subjects[], где исполнение ЛОМАЛО
// артефакт (якорь обязан совпадать с идентификатором репозитория). Разные породы: там правило
// приказывало испортить, здесь — перевести прозу вокруг значения. Запас на ложный красный дан
// повтором: LOOPS = 3 (workflows/izi.js, литерал S11 — было pipeline.json.loops.brd).
export function languageDrifted(fit, source) {
  const src = String(source || "")
  if (!src.trim()) return false
  const f = String(fit || "")
  if ((f.match(/\p{L}/gu) || []).length < MIN_LETTERS) return false
  const rs = cyrillicRatio(src)
  const rf = cyrillicRatio(f)
  if (rs > 0.5) return rf < 0.1
  if (rs < 0.1) return rf > 0.5
  return false
}

// FUNCTION_CONTRACT: newBrd — сдаваемый BRD
//   Input:        text — байты .agent/brd.md
//   Dependencies: sources — тексты, из которых роль вправе брать числа (задача, ответы оператора);
//                 пустой массив значит «источники не поданы», и правило invented-default молчит
//   Antecedent:   хотя бы одно требование, каждое строится, subjects[] строятся, строка
//                 open-questions есть и равна объявленному реестром значению
//   Consequent:   success: замороженный BRD плюс улики (advice), которые приёмку НЕ роняют
//                 failure: "invalid-brd" — detail несёт ВСЕ блокеры разом, по строке на каждый
export function newBrd(text, sources = []) {
  const { requirements, subjects, openQuestions } = parseBrd(text)
  const blockers = []

  if (!requirements.length) blockers.push("в BRD нет ни одного требования R")

  const src = sources.filter(Boolean)
  const known = src.length ? new Set(src.flatMap((t) => [...numbersIn(t)])) : null

  const built = []
  for (const raw of requirements) {
    const r = newRequirement(raw, known)
    if (r.ok) built.push(r.value)
    else blockers.push(r.error.detail)
  }

  // Язык артефакта — свойство ВХОДА, а не роли: правило объявлено ролью ($START_LAW), а исполняется
  // здесь. Судится на построенных требованиях, потому что до построения `fit` ещё не отделён от
  // текста. Источник склеен: задача и ЗНАЧЕНИЯ ответов оператора — оба написаны его языком.
  const source = src.join("\n")
  for (const r of built) {
    if (languageDrifted(r.fit, source)) {
      blockers.push(`${r.id} [language-drift]: fit написан не на языке входа — «${r.fit.slice(0, 60)}»`)
    }
  }

  if (openQuestions === null) blockers.push("нет строки open-questions — сдаваемый BRD обязан её нести")
  else if (openQuestions !== BRD_FORM.openQuestions) blockers.push(`open-questions: ${openQuestions} — BRD не сдаётся с открытыми вопросами`)

  let subj = null
  if (!subjects) blockers.push("нет subjects[] — рою нечем грепать репо")
  else {
    const s = newSubjects(subjects)
    if (s.ok) subj = s.value
    else blockers.push(s.error.detail)
  }

  if (blockers.length) return err("invalid-brd", blockers.join("\n  "))
  return ok(Object.freeze({
    requirements: Object.freeze(built),
    subjects: subj,
    openQuestions,
    advice: Object.freeze(built.flatMap(adviceFor)),
  }))
}
