// MODULE_CONTRACT: route — продвижение BRD и КАРТА ОБХОДА за ним: staging → выход → якоря в местах
// Purpose:    два действия, и оба только после зелёного вердикта: артефакт ворот ложится как есть,
//             и тут же по его якорям считается, ГДЕ в дереве лежит названная ими работа.
// io:         fs
// EXTERNAL_DEPENDENCY: steps/brd/spread/spread.mjs::spreadOf — греп по тексту, 0 токенов;
//             steps/brd/brd.mjs::parseBrd — как читается артефакт ворот.
// Invariants: ТОТАЛЕН. Артефакт НЕ нормализуется и НЕ дополняется — он копируется. Что записала
//             роль, то и ложится: подшаг не имеет права «поправить» документ, который принял
//             гардрейл.
// Interface:  promote, spread
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { analogueTerm, parseBrd } from "../brd.mjs"
import { spreadOf } from "../spread/spread.mjs"
import { ANCHORS, OUT, STAGED } from "../paths.mjs"

// FUNCTION_CONTRACT: promote — продвинуть требование
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
  // («PromptSnippet — the existing type the Glossary is modeled after»); отдав грепу строку целиком,
  // карта нашла бы 0 файлов аналога и молча обнулила главный улов шага. Голову режет `analogueTerm`
  // — та же функция, по которой судит правило T4.
  const map = spreadOf({ cwd: state.cwd, anchors: doc.subjects || [], analogue: analogueTerm(doc.analogue) })
  try {
    writeFileSync(join(state.cwd, ANCHORS), `${JSON.stringify(map, null, 2)}\n`)
  } catch (e) {
    return { why: `${ANCHORS} не записан: ${e.message}` }
  }
  return { at: ANCHORS, marked: map.marked.length, files: map.files }
}
