// MODULE_CONTRACT: hits — СКОЛЬКО РАЗ СЛОВО ЗАДАЧИ ВСТРЕЧАЕТСЯ В ЭТОМ РЕПОЗИТОРИИ
// Purpose:    одно решение спрятано здесь: чем шаг 2 отвечает на «а это вообще про этот проект».
//             Ответ добывается ГРЕПОМ, а не мнением роли: якорь, не попавший ни в один файл, —
//             факт, который называет обе стороны.
// io:         fs
// EXTERNAL_DEPENDENCY: steps/survey-plan/skip.mjs — граница обхода объявлена ОДИН раз и там;
//             второй список пропусков означал бы, что шаги 2 и 3 ходят по разным деревьям.
// Invariants: ТОТАЛЕН. Греп — это НЕ разведка: разведка это рой ролей на шагах 3-4, который читает
//             код и строит карту. Здесь только подстрочный поиск, секунда на 37 МБ и 0 токенов.
// Interface:  MAX_BYTES, hitsOf
//
// BUG_FIX_CONTEXT: функция жила в ext/index.mjs как `hitsFor` и ушла при схлопывании границы
// (тикет T20). Роль `gilb` продолжала на неё ссылаться — «слово, которого нет в коде, возвращает
// found="no"», — то есть обещала модели контроль, которого больше не существовало. Вернулась сюда,
// к тому шагу, которому и нужна.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { skipDir, skipFile } from "../survey-plan/skip.mjs"

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

// FUNCTION_CONTRACT: hitsOf — сколько файлов упоминают каждое слово
//   Input:        cwd — корень прогона; words — кандидаты в якоря
//   Dependencies: walk
//   Antecedent:   — (тотальна: пустой список слов даёт пустой ответ, а не отказ)
//   Consequent:   success: { hits: { слово: сколько файлов }, files: сколько просмотрено,
//                            dead: [слова с нулём] }
//   Purity:       io (fs)
//   BUG_FIX_CONTEXT: совпадение ПОДСТРОЧНОЕ и по пути ТОЖЕ. Совпадение по границе слова пробовали и
//                 опровергли фактом: оно теряет `fruits` для якоря `fruit` и `FruitResourceIT`
//                 целиком. Регистр не значим по той же причине.
// ФОН РЕПОЗИТОРИЯ. Слово, стоящее почти в каждом файле, — имя проекта или служебное («eddi» в 97%
// файлов, «labs» в 91%, «import» в 85%). Якорем оно быть не может: пометив всё, оно не помечает
// ничего. Порог не в проценте вообще, а в том, чтобы не срезать законные широкие якоря: у эталона
// `agent` стоит в 48% файлов и якорем является.
export const BACKGROUND = 0.7

export function hitsOf(cwd, words = []) {
  const list = [...new Set(words.map((w) => String(w).trim()).filter(Boolean))]
  if (!list.length || !existsSync(cwd)) return { hits: {}, files: 0, dead: list }
  const hits = Object.fromEntries(list.map((w) => [w, 0]))
  const files = walk(cwd)
  for (const f of files) {
    let text = ""
    try { text = readFileSync(join(cwd, f.path), "utf8") } catch { continue }
    const hay = `${f.path}\n${text}`.toLowerCase()
    for (const w of list) if (hay.includes(w.toLowerCase())) hits[w] += 1
  }
  const n = files.length
  const background = list.filter((w) => hits[w] / n > BACKGROUND)
  for (const w of background) delete hits[w]
  return { hits, files: n, dead: list.filter((w) => hits[w] === 0), background }
}

// FUNCTION_CONTRACT: candidatesOf — слова задачи, которые СТОИТ проверить грепом
//   Input:        task — текст TASK.md
//   Antecedent:   — (тотальна)
//   Consequent:   success: кандидаты в якоря — то, что в тексте выглядит именем, а не рассуждением:
//                 обратные кавычки, CamelCase, повторяющиеся существительные
//   Purity:       pure
//   Почему кандидатов ищет СКРИПТ, а не роль: роль выбирает якоря ИЗ ФАКТОВ, а не наоборот. Пока
//   попаданий нет перед глазами, «rotation» и «compatibility» выглядят для неё такими же якорями,
//   как `Glossary` — и она вписывает свою оценку вместо существительного заказа.
// Служебные слова языка: они попадают в каждый второй файл и якорем быть не могут.
const STOP = new Set(("the and that with this from your into only must does have been will they" +
  " each such when where which while your must not are was were for its his her but all any one two" +
  " already again also same than then them there these those" +
  " task decisions operator ask own new").split(/\s+/))

export function candidatesOf(task = "") {
  const text = String(task)
  const out = new Map()
  const add = (w, weight) => { const k = w.trim(); if (k.length >= 3) out.set(k, (out.get(k) || 0) + weight) }
  for (const m of text.matchAll(/`([A-Za-z][\w.{}<>/-]{2,40})`/g)) add(m[1], 10)   // в кавычках — имя
  for (const m of text.matchAll(/\b([A-Z][a-z]+[A-Z][A-Za-z]+)\b/g)) add(m[1], 8)  // CamelCase
  // СОСТАВНОЕ ИМЯ, НАПИСАННОЕ В ДВА СЛОВА. Заказ пишет «по образцу Prompt Snippet», а в коде это
  // `PromptSnippet`. Первая версия извлекателя давала `Prompt` и `Snippet` по отдельности, самого
  // `PromptSnippet` в таблице не было — и роль назвала образцом `Snippet`, потому что выбрала лучшее
  // из предложенного. Замерено curl'ом 22.08.2026: она выбирает ИЗ ТАБЛИЦЫ, значит таблица обязана
  // содержать то имя, которым вещь зовётся в коде.
  for (const m of text.matchAll(/\b([A-Z][a-z]{2,})\s+([A-Z][a-z]{2,})\b/g)) add(m[1] + m[2], 9)
  for (const m of text.matchAll(/\b([A-Z][a-zA-Z]{3,20})\b/g)) add(m[1], 3)        // с заглавной
  // ЧАСТОТА НЕ РЕШАЕТ — РЕШАЕТ ГРЕП.
  // BUG_FIX_CONTEXT: порог «слово встречается трижды» терял `export` и `descriptor` — в заказе они
  // стоят по одному разу, а в репозитории это целые слои. Роль не могла их выбрать: их не было в
  // таблице. Кандидатом становится КАЖДОЕ латинское слово заказа, а отсеивает пустые греп — он
  // стоит доли секунды и знает правду, в отличие от порога.
  for (const m of text.matchAll(/\b([a-zA-Z][a-zA-Z-]{3,24})\b/g)) add(m[1].toLowerCase(), 1)
  return [...out.entries()].filter(([w]) => !STOP.has(w.toLowerCase()))
    .sort((a, b) => b[1] - a[1]).slice(0, 80).map(([w]) => w)
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
