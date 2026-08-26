// MODULE_CONTRACT: judge — суд части карты: ответ скаута по ИД клетки
// Purpose:    обёртка-тотал над steps/scope/part.mjs::newPart. Состав клетки гардрейл читает из
//             ПЛАНА — ни модель, ни полоса не могут подсунуть список файлов, который устраивает
//             ответ (redesign-backlog, T13).
// io:         none
// Invariants: ТОТАЛЕН — битый XML даёт блокеры C1, а не исключение (шов 9).
// Interface: judgePart
import { parsePart, checkPart } from "../part.mjs"

// FUNCTION_CONTRACT: judgePart — блокеры части; пусто значит зелёный
//   Input:        xml — что записано по staging-пути; cell — клетка плана; inventory — пути хребта
//   Consequent:   success: string[] — блокеры с номерами правил и путями (их читает роль в FEEDBACK)
//   Purity:       pure
export function judgePart({ xml = "", cell = {}, inventory = [] } = {}) {
  return checkPart({ part: parsePart(String(xml || "")), cell: cell || {}, inventory })
}
