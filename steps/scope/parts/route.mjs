// MODULE_CONTRACT: route — куда что ложится: часть → graph-parts, кэш → .izi/parts
// Purpose:    ЕДИНСТВЕННОЕ место подшага, пишущее части, кэш и штамп каталога — и только после
//             зелёного вердикта (шов 5). Кэш помнит ЧТО было принято и ПО КАКОЙ ГРАММАТИКЕ
//             (steps/scope/cache.mjs): повторный прогон не перечитывает не менявшиеся клетки.
// io:         fs
// EXTERNAL_DEPENDENCY: steps/scope/part.mjs::GRAMMAR_VERSION; steps/scope/cache.mjs::entryFor;
//             ext/state.mjs::sha1of.
// Invariants: ТОТАЛЕН — диск отвечает { why }; продвижение НЕ нормализует и НЕ дополняет.
// Interface: promotePart, cachedPart, promoteCached, partsStamp
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { sha1of } from "../../../ext/state.mjs"
import { entryFor } from "../cache.mjs"
import { GRAMMAR_VERSION } from "../part.mjs"
import { CACHE, PARTS, cacheAt, entryAt, partAt } from "../paths.mjs"

const put = (abs, text) => { mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, text) }

// FUNCTION_CONTRACT: promotePart — принять ответ скаута: часть в graph-parts, запись в кэш
//   Antecedent:   вердикт ЗЕЛЁНЫЙ (judgePart вернул пусто)
//   Consequent:   success: { at }; failure: { why }
//   Purity:       io (fs)
export function promotePart(state, cell, xml) {
  try {
    put(join(state.cwd, partAt(cell.id)), xml)
    put(join(state.cwd, cacheAt(cell.id)), xml)
    put(join(state.cwd, entryAt(cell.id)), `${JSON.stringify(entryFor(cell, GRAMMAR_VERSION), null, 2)}\n`)
    return { at: partAt(cell.id) }
  } catch (e) { return { why: `часть «${cell.id}» не записана: ${e.message}` } }
}

// FUNCTION_CONTRACT: cachedPart — что помнит кэш о клетке
//   Consequent:   success: { entry, xml } | null — нет записи или нет текста части
//   Purity:       io (fs)
export function cachedPart(state, cell) {
  const entryAbs = join(state.cwd, entryAt(cell.id))
  const xmlAbs = join(state.cwd, cacheAt(cell.id))
  if (!existsSync(entryAbs) || !existsSync(xmlAbs)) return null
  try { return { entry: JSON.parse(readFileSync(entryAbs, "utf8")), xml: readFileSync(xmlAbs, "utf8") } }
  catch { return null }
}

// FUNCTION_CONTRACT: promoteCached — продвинуть часть из кэша (пересуженную СЕЙЧАС)
//   Antecedent:   decide() сказал reuse И judgePart по текущей грамматике зелёный
//   Consequent:   success: { at }; failure: { why }
//   Purity:       io (fs)
export function promoteCached(state, cell, xml) {
  try {
    put(join(state.cwd, partAt(cell.id)), xml)
    return { at: partAt(cell.id) }
  } catch (e) { return { why: `часть «${cell.id}» из кэша не записана: ${e.message}` } }
}

// FUNCTION_CONTRACT: partsStamp — отпечаток каталога частей: sha1 от конкатенации sha1 частей
//   Consequent:   success: { path, sha1 }; failure: { why } — каталог пуст или не читается
//   Purity:       io (fs)
export function partsStamp(state) {
  try {
    const dir = join(state.cwd, PARTS)
    if (!existsSync(dir)) return { why: `${PARTS} не существует — рой не оставил ни одной части` }
    const names = readdirSync(dir).filter((n) => n.endsWith(".xml")).sort()
    if (!names.length) return { why: `${PARTS} пуст — рой не оставил ни одной части` }
    const sha = names.map((n) => `${n}:${sha1of(readFileSync(join(dir, n), "utf8"))}`).join("\n")
    return { path: PARTS, sha1: sha1of(sha) }
  } catch (e) { return { why: `${PARTS} не читается: ${e.message}` } }
}
