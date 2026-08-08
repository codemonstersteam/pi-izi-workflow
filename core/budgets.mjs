// MODULE_CONTRACT: budgets — бюджеты прогона: сколько раз роль пере-делегируется и сколько раз
//               спрашивает оператора
// Purpose:    одно решение — ОТКУДА берётся число бюджета. До S16 три литерала жили в
//             `workflows/izi.js`, и поднять их можно было только правкой кода в каждом установленном
//             проекте. Решением оператора бюджеты вынесены в файл проекта `izi.config.json`; здесь —
//             ЧИСТОЕ правило его чтения, а значения по умолчанию объявлены ровно один раз
//             (DEFAULT_BUDGETS), и «файла нет» отличается от «файл сломан».
// io:         none
// Invariants: DEFAULT_BUDGETS заморожены при загрузке; newBudgets чиста — результат зависит только
//             от переданного текста; частичный конфиг разрешён (недостающий ключ берёт умолчание),
//             НЕИЗВЕСТНЫЙ ключ — отказ: опечатка в имени бюджета иначе тихо оставила бы старое
//             число, и оператор считал бы, что поднял его
// Interface:  DEFAULT_BUDGETS — умолчания, единственный экземпляр этих чисел
//             BUDGETS_PATH — имя файла конфигурации в корне прогона
//             newBudgets(raw) -> Result<Budgets, "invalid-budgets">

import { ok, err } from "./result.mjs"

// loops — пере-делегации роли по КРАСНОМУ чеку гардрейла; questions — обмены с оператором за
// прогон; checkpointRetries — переспросы на ОДНОМ вопросе, когда ответ не появился в answers.md.
// Три разных счётчика, и путать их нельзя: вопрос не тратит loops (workflows/izi.js::brd).
//
// maxParallel — размер БАТЧА веера (шаг 4 `scope`), а не потолок числа клеток. Он существует
// потому, что у песочницы воркфлоу ограничителя нет вовсе: `parallel` — это `Promise.all`
// (pi-extensible-workflows/packages/core/src/execution.ts:245-266), и сотня клеток ушла бы в модель
// разом. Умолчание 8 — потолок параллелизма pi.
export const DEFAULT_BUDGETS = Object.freeze({ loops: 3, questions: 3, checkpointRetries: 2, maxParallel: 8 })
export const BUDGETS_PATH = "izi.config.json"

const KEYS = Object.keys(DEFAULT_BUDGETS)

// FUNCTION_CONTRACT: newBudgets — бюджеты прогона из текста izi.config.json
//   Input:        raw — содержимое файла; пусто/пробелы значит «файла нет»
//   Dependencies: —
//   Antecedent:   пустой текст ЛИБО JSON-объект, все ключи которого из DEFAULT_BUDGETS, а значения —
//                 целые ≥ 1
//   Consequent:   success: замороженные бюджеты; недостающий ключ взят из DEFAULT_BUDGETS, пустой
//                          текст даёт DEFAULT_BUDGETS целиком
//                 failure: "invalid-budgets" — не JSON, не объект, неизвестный ключ или значение,
//                          которое не является целым ≥ 1
//   Purity:       pure
//   Interface:    newBudgets(raw: string) -> Result<Budgets, "invalid-budgets">
export function newBudgets(raw) {
  const text = String(raw || "").trim()
  if (!text) return ok(DEFAULT_BUDGETS)

  let cfg
  try {
    cfg = JSON.parse(text)
  } catch (e) {
    return err("invalid-budgets", `${BUDGETS_PATH} не разбирается как JSON — ${e.message}`)
  }
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) {
    return err("invalid-budgets", `${BUDGETS_PATH} обязан быть объектом вида {"${KEYS.join('": 3, "')}": 2}`)
  }

  const unknown = Object.keys(cfg).filter((k) => !KEYS.includes(k))
  if (unknown.length) {
    return err("invalid-budgets", `${BUDGETS_PATH}: неизвестный ключ ${unknown.join(", ")} — бюджеты это ${KEYS.join(", ")}`)
  }

  const bad = KEYS.filter((k) => k in cfg && !(Number.isInteger(cfg[k]) && cfg[k] >= 1))
  if (bad.length) {
    return err("invalid-budgets", `${BUDGETS_PATH}: ${bad.map((k) => `${k} = ${JSON.stringify(cfg[k])}`).join(", ")} — бюджет это целое ≥ 1`)
  }

  return ok(Object.freeze({ ...DEFAULT_BUDGETS, ...cfg }))
}
