// MODULE_CONTRACT: route — куда что ложится: собранный черновик → продвижение → КАРТА ОБХОДА
// Purpose:    три действия одного хода, и все три только после зелёного вердикта: артефакт,
//             СОБРАННЫЙ СКРИПТОМ, ложится в staging, оттуда продвигается, и тут же по его якорям
//             считается, ГДЕ в дереве лежит названная ими работа.
// io:         fs
// EXTERNAL_DEPENDENCY: steps/brd/spread/spread.mjs::spreadOf — греп по тексту, 0 токенов;
//             steps/brd/brd.mjs::parseBrd, analogueTerm — как читается артефакт.
// Invariants: ТОТАЛЕН — ни одна функция не бросает, диск отвечает `{ why }`. Продвижение НЕ
//             нормализует и НЕ дополняет: что собрал `assemble.mjs`, то и ложится.
// Interface:  stage, promote, spread
//
// ЧЕРНОВИК ПИШЕТ СКРИПТ, А НЕ РОЛЬ, и потому у подшага появилась `stage`. До 23.08.2026 путь
// `.agent/staging/brd.md` заполняла модель инструментом `write`, и подшагу оставалось его продвинуть.
// Теперь модель пишет ОДНУ строку в `.agent/staging/analogue.txt`, а `.agent/staging/brd.md`
// собирается из трёх частей (`assemble.mjs`) — значит кто-то обязан его положить, и это route: место
// артефакта на диске знает он один.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { analogueTerm, parseBrd } from "../brd.mjs"
import { spreadOf } from "../spread/spread.mjs"
import { ANCHORS, OUT, STAGED } from "../paths.mjs"

// FUNCTION_CONTRACT: stage — положить СОБРАННЫЙ артефакт на путь доставки
//   Input:        state — состояние прогона (нужен cwd); text — байты, собранные assemble.brdText
//   Dependencies: —
//   Antecedent:   текст непуст (его собрал `brdText`, а тот пустого не возвращает)
//   Consequent:   success: { at } — путь черновика; failure: { why } — диск не дал записать
//   Purity:       io (fs)
//   ЧЕРНОВИК, А НЕ ВЫХОД: staging проверяется гардрейлом ДО продвижения (CLAUDE.md, ограничение 2),
//   и порядок «собрал → положил в staging → продвинул» держит это правило даже там, где артефакт
//   собрала не модель.
export function stage(state, text) {
  const abs = join(state.cwd, STAGED)
  try {
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, text)
  } catch (e) {
    return { why: `${STAGED} не записан: ${e.message}` }
  }
  return { at: STAGED }
}

// FUNCTION_CONTRACT: promote — продвинуть артефакт
//   Input:        state — состояние прогона (нужен cwd)
//   Antecedent:   вердикт зелен; staging на месте
//   Consequent:   success: { at }; failure: { why }
//   Purity:       io (fs)
export function promote(state) {
  const from = join(state.cwd, STAGED)
  if (!existsSync(from)) return { why: `${STAGED} не существует — продвигать нечего` }
  writeFileSync(join(state.cwd, OUT), readFileSync(from, "utf8"))
  rmSync(from, { force: true })     // под staging остаётся ровно то, что гардрейл ОТБИЛ
  return { at: OUT }
}

// FUNCTION_CONTRACT: spread — карта обхода по якорям продвинутого артефакта
//   Input:        state; text — байты продвинутого `.agent/brd.md`
//   Dependencies: parseBrd, analogueTerm, spreadOf
//   Antecedent:   артефакт продвинут (spread идёт СРАЗУ ЗА promote и по его результату)
//   Consequent:   success: { at, marked, files } — `.agent/anchors.json` записан;
//                 failure: { why } — диск не дал записать
//   Purity:       io (fs)
//   ЯКОРЯ БЕРУТСЯ ИЗ ПРОДВИНУТОГО ДОКУМЕНТА, а не из черновика и не из конверта роли: карта обязана
//   описывать ТО, что легло, иначе шаг 3 пойдёт по местам, которых в артефакте нет.
export function spread(state, text) {
  const doc = parseBrd(text)
  // ГРЕПАЕТСЯ ГОЛОВА СТРОКИ, А НЕ ВСЯ СТРОКА. `analogue:` несёт слово И объяснение через тире
  // («PromptSnippet — files 62; the existing type the Glossary is modeled after»); отдав грепу
  // строку целиком, карта нашла бы 0 файлов аналога и молча обнулила главный улов шага. Голову
  // режет `analogueTerm` — та же функция, по которой судит правило T4.
  const map = spreadOf({ cwd: state.cwd, anchors: doc.subjects || [], analogue: analogueTerm(doc.analogue) })
  try {
    writeFileSync(join(state.cwd, ANCHORS), `${JSON.stringify(map, null, 2)}\n`)
  } catch (e) {
    return { why: `${ANCHORS} не записан: ${e.message}` }
  }
  return { at: ANCHORS, marked: map.marked.length, files: map.files }
}
