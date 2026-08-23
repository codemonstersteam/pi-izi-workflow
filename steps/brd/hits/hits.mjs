// MODULE_CONTRACT: hits — СКОЛЬКО РАЗ СЛОВО ЗАДАЧИ ВСТРЕЧАЕТСЯ В ЭТОМ РЕПОЗИТОРИИ
// Purpose:    одно решение спрятано здесь: чем шаг 2 отвечает на «а это вообще про этот проект».
//             Ответ добывается ГРЕПОМ, а не мнением роли: якорь, не попавший ни в один файл, —
//             факт, который называет обе стороны.
// io:         fs
// EXTERNAL_DEPENDENCY: steps/survey-plan/skip.mjs — граница обхода объявлена ОДИН раз и там;
//             второй список пропусков означал бы, что шаги 2 и 3 ходят по разным деревьям.
// Invariants: ТОТАЛЕН. Греп — это НЕ разведка: разведка это рой ролей на шагах 3-4, который читает
//             код и строит карту. Здесь только подстрочный поиск, секунда на 37 МБ и 0 токенов.
// Interface:  MAX_BYTES, MAX_CANDIDATES, BACKGROUND, candidatesOf, hitsOf, tableOf, vocabularyOf
//
// КОНВЕЙЕР ИЗ ЧЕТЫРЁХ СТУПЕНЕЙ (тикет T02, brd-backlog.md):
//   .agent/normalized.md --candidatesOf--> слова --hitsOf--> {файлов, idf} --tableOf--> слот {HITS}
// Вход первой ступени — НОРМАЛИЗОВАННАЯ ТАБЛИЦА, а не сырой TASK.md, и это измеренная разница, а не
// вкус: по русскому заказу слово `export` не попадает в кандидаты ВОВСЕ, по таблице — попадает и
// даёт 92 файла (`steps/brd/normalize-concept-research.md`, глава 4).
//
// BUG_FIX_CONTEXT: функция жила в ext/index.mjs как `hitsFor` и ушла при схлопывании границы
// (тикет T20). Роль `gilb` продолжала на неё ссылаться — «слово, которого нет в коде, возвращает
// found="no"», — то есть обещала модели контроль, которого больше не существовало. Вернулась сюда,
// к тому шагу, которому и нужна.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { skipDir, skipFile } from "../../survey-plan/skip.mjs"

export const MAX_BYTES = 512 * 1024      // файл крупнее не читается: это не исходник, а данные

// FUNCTION_CONTRACT: walk — файлы репозитория, по границе шага 3
//   Antecedent:   root существует
//   Consequent:   success: [{ path, bytes }]; failure: none — тотальна
//   Purity:       io (fs)
function walk(root, rel = "", out = []) {
  let entries
  try { entries = readdirSync(join(root, rel), { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const path = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) { if (!skipDir(e.name)) walk(root, path, out); continue }
    if (!e.isFile() || skipFile(path)) continue
    let bytes = 0
    try { bytes = statSync(join(root, path)).size } catch { continue }
    if (bytes <= MAX_BYTES) out.push({ path, bytes })
  }
  return out
}

// FUNCTION_CONTRACT: hitsOf — сколько файлов упоминают каждое слово и насколько слово редкое
//   Input:        cwd — корень прогона; words — кандидаты в якоря
//   Dependencies: walk
//   Antecedent:   — (тотальна: пустой список слов даёт пустой ответ, а не отказ)
//   Consequent:   success: { hits: { слово: сколько файлов }, idf: { слово: вес редкости },
//                            files: сколько просмотрено, dead: [слова с нулём], background: [фон] }
//   Purity:       io (fs)
//   Interface:    hitsOf(cwd: string, words?: string[]) -> { hits, idf, files, dead, background }
//   BUG_FIX_CONTEXT: совпадение ПОДСТРОЧНОЕ и по пути ТОЖЕ. Совпадение по границе слова пробовали и
//                 опровергли фактом: оно теряет `fruits` для якоря `fruit` и `FruitResourceIT`
//                 целиком. Регистр не значим по той же причине.
// ФОН РЕПОЗИТОРИЯ. Слово, стоящее почти в каждом файле, — имя проекта или служебное («eddi» в 97%
// файлов, «labs» в 91%, «import» в 85%). Якорем оно быть не может: пометив всё, оно не помечает
// ничего. Порог не в проценте вообще, а в том, чтобы не срезать законные широкие якоря: у эталона
// `agent` стоит в 48% файлов и якорем является.
export const BACKGROUND = 0.7

// ВЕС РЕДКОСТИ. `log(N/df)`: счёт файлов не сравним между словами, вес сравним. `glossary` 7.53
// против `config` 0.51 — разница, по которой роль видит, что редко, ничего не зная о репозитории.
// Обоснование не эвристическое: Robertson, «Understanding IDF», J. Doc. 60(5) 2004
// (`steps/brd/normalize-concept-research.md`, глава 2).
// Порог BACKGROUND вес НЕ ЗАМЕНЯЕТ и не заменяется им: порог снимает ключевые слова языка
// (`import` в 85% файлов), вес упорядочивает оставшееся.
// СЛЕПОТА ВЕСА, замерено на eddi 23.08.2026 — вес знает ТОЛЬКО редкость, а не «про работу ли это»:
// `agent` 895 файлов (48%) весит 0.73, `version` 668 (36%) весит 1.02, то есть владелец работы
// стоит НИЖЕ служебного слова. Редкая опечатка по той же причине получит максимальный вес. Поэтому
// вес — это ВХОД ДЛЯ РОЛИ, а не автоматический отбор: разделить `agent` и `version` числом нечем.
// Ноль файлов — не деление на ноль и не дефект: это СОЗДАВАЕМАЯ сущность, и она получает
// максимальный вес репозитория, `log(N)`, наравне с самым редким существующим словом.
const idfOf = (n, df) => (n > 0 ? Math.log(n / Math.max(df, 1)) : 0)

export function hitsOf(cwd, words = []) {
  const list = [...new Set(words.map((w) => String(w).trim()).filter(Boolean))]
  if (!list.length || !existsSync(cwd)) return { hits: {}, idf: {}, files: 0, dead: list, background: [] }
  const hits = Object.fromEntries(list.map((w) => [w, 0]))
  const files = walk(cwd)
  // ОДИН ПРОХОД НА ИГЛУ, А НЕ НА СЛОВО. Регистр не значим, поэтому `Glossary` и `glossary` — это
  // один и тот же греп: кандидаты дают обе формы намеренно (роль читает то имя, которым вещь зовётся
  // в коде), а платить за одно и то же дважды нечем. На eddi это 101 слово против 75 игл, и бюджет
  // ступени — одна секунда на 1854 файлах.
  const needles = new Map()
  for (const w of list) {
    const k = w.toLowerCase()
    if (needles.has(k)) needles.get(k).push(w); else needles.set(k, [w])
  }
  for (const f of files) {
    let text = ""
    try { text = readFileSync(join(cwd, f.path), "utf8") } catch { continue }
    const hay = `${f.path}\n${text}`.toLowerCase()
    for (const [needle, forms] of needles) if (hay.includes(needle)) for (const w of forms) hits[w] += 1
  }
  const n = files.length
  const background = list.filter((w) => hits[w] / n > BACKGROUND)
  for (const w of background) delete hits[w]
  const idf = Object.fromEntries(Object.keys(hits).map((w) => [w, idfOf(n, hits[w])]))
  return { hits, idf, files: n, dead: Object.keys(hits).filter((w) => hits[w] === 0), background }
}

// FUNCTION_CONTRACT: tableOf — таблица попаданий строками, готовая в слот {HITS} наряда ворот
//   Input:        result — ответ hitsOf; top — сколько строк оставить (0 = все)
//   Dependencies: —
//   Antecedent:   — (тотальна; МОЛЧАНИЕ: нет операнда — пустая строка, а не выдуманная таблица)
//   Consequent:   success: строки `слово · files N · weight W`, по убыванию веса
//                 failure: none
//   Purity:       pure
//   Interface:    tableOf(result?: object, top?: number) -> string
//   Ноль файлов НЕ СКРЫВАЕТСЯ и стоит первым: слово, которого в репозитории нет, — это созданная
//   сущность, и роль обязана её видеть, чтобы назвать якорем (`steps/brd/order.gate.tpl`: «Zero on
//   the NEW entity is EXPECTED»). Скрыв ноль, мы прячем от роли ровно ту строку, ради которой шаг
//   и работает.
export function tableOf(result = {}, top = 0) {
  const hits = result && result.hits
  if (!hits || typeof hits !== "object") return ""
  const n = Number(result.files) || 0
  const idf = result.idf || {}
  const rows = Object.keys(hits).map((word) => ({
    word,
    files: Number(hits[word]) || 0,
    weight: typeof idf[word] === "number" ? idf[word] : idfOf(n, Number(hits[word]) || 0),
  }))
  rows.sort((a, b) => b.weight - a.weight || a.files - b.files || a.word.localeCompare(b.word))
  const shown = top > 0 ? rows.slice(0, top) : rows
  return shown.map((r) => `${r.word} · files ${r.files} · weight ${r.weight.toFixed(2)}`).join("\n")
}

// FUNCTION_CONTRACT: candidatesOf — слова, которые СТОИТ проверить грепом
//   Input:        text — НОРМАЛИЗОВАННАЯ ТАБЛИЦА `.agent/normalized.md`: строки
//                 `verb | object | instrument | values`. Тотальна к любому тексту, но кандидатов
//                 ищет по таблице: она уже переведена на язык кода, ради этого шаг 2 её и строит.
//   Dependencies: STOP, MAX_CANDIDATES
//   Antecedent:   — (тотальна; МОЛЧАНИЕ: пустой текст даёт пустой список, а не отказ)
//   Consequent:   success: кандидаты в якоря — слова всех четырёх колонок, префиксы составных имён
//                 и слова внутри имён, путей и URI
//   Purity:       pure
//   Interface:    candidatesOf(text?: string) -> string[]
//   Почему кандидатов ищет СКРИПТ, а не роль: роль выбирает якоря ИЗ ФАКТОВ, а не наоборот. Пока
//   попаданий нет перед глазами, «rotation» и «compatibility» выглядят для неё такими же якорями,
//   как `Glossary` — и она вписывает свою оценку вместо существительного заказа.
// ПЕРЕИЗВЛЕЧЕНИЕ ДЕШЕВЛЕ НЕДОБОРА, и это асимметрия, а не вкус: лишний кандидат стоит одну строку
// таблицы и отсеется весом, а потерянный кандидат не отсеивается ничем и доходит до плана молча
// (`steps/brd/normalize-concept-research.md`, глава 4).
// Служебные слова языка: они попадают в каждый второй файл и якорем быть не могут.
const STOP = new Set(("the and that with this from your into only must does have been will they" +
  " each such when where which while your must not are was were for its his her but all any one two" +
  " already again also same than then them there these those" +
  " task decisions operator ask own new").split(/\s+/))

// Потолок таблицы. Не экономия строк, а цена грепа: каждое слово — это проход по тексту всех 1854
// файлов, и бюджет ступени 2 — одна секунда.
export const MAX_CANDIDATES = 120

// СЕГМЕНТЫ СОСТАВНОГО ИМЕНИ. `PromptSnippetService` → Prompt · Snippet · Service;
// `HTTPServer` → HTTP · Server (аббревиатура не рассыпается на буквы); `CRUD` → CRUD одним куском.
const SEGMENTS = /[A-Z]+(?![a-z])|[A-Z][a-z0-9]*|[a-z0-9]+/g

export function candidatesOf(text = "") {
  const src = String(text)
  const out = new Map()
  const add = (w, weight) => { const k = String(w).trim(); if (k.length >= 3) out.set(k, (out.get(k) || 0) + weight) }
  for (const m of src.matchAll(/`([A-Za-z][\w.{}<>/-]{2,40})`/g)) add(m[1], 10)   // в кавычках — имя
  for (const m of src.matchAll(/\b([A-Z][a-z]+[A-Z][A-Za-z]+)\b/g)) add(m[1], 8)  // CamelCase
  // СОСТАВНОЕ ИМЯ, НАПИСАННОЕ В ДВА СЛОВА. Заказ пишет «по образцу Prompt Snippet», а в коде это
  // `PromptSnippet`. Первая версия извлекателя давала `Prompt` и `Snippet` по отдельности, самого
  // `PromptSnippet` в таблице не было — и роль назвала образцом `Snippet`, потому что выбрала лучшее
  // из предложенного. Замерено curl'ом 22.08.2026: она выбирает ИЗ ТАБЛИЦЫ, значит таблица обязана
  // содержать то имя, которым вещь зовётся в коде.
  for (const m of src.matchAll(/\b([A-Z][a-z]{2,})\s+([A-Z][a-z]{2,})\b/g)) add(m[1] + m[2], 9)
  for (const m of src.matchAll(/\b([A-Z][a-zA-Z]{3,20})\b/g)) add(m[1], 3)        // с заглавной
  // ЧАСТОТА НЕ РЕШАЕТ — РЕШАЕТ ГРЕП.
  // BUG_FIX_CONTEXT: порог «слово встречается трижды» терял `export` и `descriptor` — в заказе они
  // стоят по одному разу, а в репозитории это целые слои. Роль не могла их выбрать: их не было в
  // таблице. Кандидатом становится КАЖДОЕ латинское слово заказа, а отсеивает пустые греп — он
  // стоит доли секунды и знает правду, в отличие от порога.
  for (const m of src.matchAll(/\b([a-zA-Z][a-zA-Z-]{2,24})\b/g)) add(m[1].toLowerCase(), 1)
  // СЛОВА ВНУТРИ ИМЁН, ПУТЕЙ И URI + ПРЕФИКСЫ СОСТАВНЫХ ИМЁН. Разбор `\b` выше рвёт текст по
  // границам слова и потому НЕ ВИДИТ: `{id}.descriptor.json` отдаёт `descriptor` только если резать
  // по точкам; `prompt_snippet` не отдаёт ничего вовсе (подчёркивание — символ слова, границы в нём
  // нет); `PromptSnippetService` отдаёт себя целиком, а ценный якорь — `PromptSnippet` (62 файла
  // против 29, глава 4 исследования). Здесь текст режется по ВСЕМУ, что не буква и не цифра, а
  // каждый кусок разбирается на сегменты и НАРАСТАЮЩИЕ ПРЕФИКСЫ — операция, обратная склейке двух
  // слов выше.
  for (const raw of src.split(/[^A-Za-z0-9]+/)) {
    if (!raw || /^\d+$/.test(raw)) continue
    add(raw.toLowerCase(), 2)                                     // /glossarystore/ → glossarystore
    const seg = raw.match(SEGMENTS) || []
    if (seg.length < 2) continue
    let prefix = ""
    for (const s of seg) {
      prefix += s
      if (prefix !== raw) add(prefix, 7)                          // PromptSnippetService → Prompt…
      add(s.toLowerCase(), 2)                                     // …и сами сегменты по отдельности
    }
  }
  // ОДНО СЛОВО — ОДНА СТРОКА ТАБЛИЦЫ. Греп регистр не различает, поэтому `Glossary` и `glossary`
  // дают ОДИН И ТОТ ЖЕ счёт и вес, а роль получает две строки и выбор, которого не существует.
  // Замерено на eddi 23.08.2026: десять таких пар из 102 кандидатов.
  // ПОБЕЖДАЕТ ФОРМА С ЗАГЛАВНЫМИ — та, которой вещь зовётся ИМЕНЕМ: `Glossary`, `CRUD`,
  // `PromptSnippetService`. Слово, стоящее в заказе только строчным (`export`, `descriptor`),
  // остаётся строчным: заглавных у него нет, и выбирать не из чего. Веса вариантов складываются —
  // это одно слово, и его место в списке считается по всем вхождениям сразу.
  const merged = new Map()
  for (const [w, weight] of out) {
    const k = w.toLowerCase()
    const ups = (w.match(/[A-Z]/g) || []).length
    const cur = merged.get(k)
    if (!cur) { merged.set(k, { word: w, ups, weight }); continue }
    cur.weight += weight
    if (ups > cur.ups) { cur.word = w; cur.ups = ups }
  }
  return [...merged.values()].map(({ word, weight }) => [word, weight])
    .filter(([w]) => !STOP.has(w.toLowerCase()) && /[A-Za-z]/.test(w))
    .sort((x, y) => y[1] - x[1]).slice(0, MAX_CANDIDATES).map(([w]) => w)
}

// FUNCTION_CONTRACT: vocabularyOf — СЛОВАРЬ САМОГО РЕПОЗИТОРИЯ: чем он называет свои части
//   Input:        cwd; top — сколько слов вернуть
//   Antecedent:   — (тотальна)
//   Consequent:   success: [{ word, files }] — токены ПУТЕЙ по числу файлов, самые частые первыми
//   Purity:       io (fs)
//   BUG_FIX_CONTEXT: замерено curl'ом 22.08.2026. Задача написана по-русски, репозиторий — по-
//                 английски. Кандидаты извлекаются из ЗАДАЧИ, поэтому «агентом» и «экспорте» в
//                 таблицу попаданий не попадают: в коде таких слов нет. А эталонные якоря — `agent`,
//                 `export`, `descriptor`, `configuration` — роль выбрать физически не могла, их не
//                 было ни в одном предложенном ей списке. Перевод русского существительного в
//                 английское имя из кода — работа РОЛИ, но выбирать ей надо из чего: этот словарь и
//                 есть то, чем репозиторий зовёт свои части.
export function vocabularyOf(cwd, top = 25) {
  if (!existsSync(cwd)) return []
  const count = new Map()
  for (const f of walk(cwd)) {
    // Токены ПУТИ, а не текста: каталог и имя файла — это то, как проект сам себя разложил.
    const parts = f.path.replace(/\.[a-z0-9]+$/i, "").split(/[\/._-]+/)
    for (const raw of parts) {
      for (const w of String(raw).split(/(?=[A-Z][a-z])/)) {
        const k = w.toLowerCase()
        if (k.length < 4 || /^\d+$/.test(k)) continue
        count.set(k, (count.get(k) || 0) + 1)
      }
    }
  }
  const STOP = new Set(["java","test","tests","main","src","impl","index","utils","util","common","core","file","json","html"])
  return [...count.entries()].filter(([w]) => !STOP.has(w)).sort((a, b) => b[1] - a[1]).slice(0, top)
    .map(([word, files]) => ({ word, files }))
}
