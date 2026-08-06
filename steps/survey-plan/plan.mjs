// MODULE_CONTRACT: plan — раскладка разведки: дерево репозитория → клетки роя
// Purpose:    одно решение — где кончается клетка, чтобы скаут шага 4 получил список файлов, который
//             он физически способен прочесть. ЧИСТОЕ: диска не знает, io держит ext/index.mjs.
// io:         none
// Invariants: CELL_FILES/CELL_BYTES фиксированы при загрузке; клетки — последовательные куски
//             отсортированного списка, поэтому «покрывают всё без пересечений» держится
//             конструкцией, а не проверкой после; файл хребта в клетки разведки не попадает;
//             newPlan чиста — результат зависит только от аргументов
// Interface:  CELL_FILES — потолок файлов в клетке
//             CELL_BYTES — потолок байтов в клетке
//             newPlan(input) -> Result<Plan, "no-files">

import { ok, err } from "../../core/result.mjs"

export const CELL_FILES = 20
export const CELL_BYTES = 200 * 1024

// FUNCTION_CONTRACT: newPlan — клетки роя из дерева репозитория
//   Input:        { files, spine, subjects, cellFiles, cellBytes }
//                 files — [{ path, bytes, subjects }], ВСЕ просканированные файлы; subjects —
//                         пометка попавших якорей, НЕ условие включения файла в план
//                 spine — [{ path, bytes }], манифест сборки и конфиги; пусто → клетки c0 нет
//   Dependencies: —
//   Antecedent:   files непуст ИЛИ spine непуст — иначе картировать нечего. Числа клеток не
//                 ограничены: потолок параллелизма pi — размер батча на шаге 4, а не потолок клеток
//   Consequent:   success: { files, bytes, subjects, gaps, cells } — cells[0] с kind "spine", если
//                          spine непуст; далее клетки kind "survey", покрывающие ВСЕ прочие файлы
//                          без пересечений и без потерь; клетка закрывается по cellFiles ИЛИ
//                          cellBytes — что раньше; gaps — якоря, не встретившиеся ни в одном файле
//                 failure: "no-files" — ноль файлов: пустой репозиторий, картировать нечего
//   Purity:       pure
//   Interface:    newPlan({ files, spine, subjects, cellFiles, cellBytes }) -> Result<Plan, "no-files">
export function newPlan({ files = [], spine = [], subjects = [], cellFiles = CELL_FILES, cellBytes = CELL_BYTES }) {
  const inSpine = new Set(spine.map((f) => f.path))
  const rest = files.filter((f) => !inSpine.has(f.path)).sort((a, b) => a.path.localeCompare(b.path))
  if (!rest.length && !spine.length) {
    return err("no-files", "ни одного файла вне списка пропуска — картировать нечего")
  }

  // Клетка закрывается по числу файлов ИЛИ по байтам: один файл больше потолка едет клеткой сам —
  // порезать его нельзя, а молча выкинуть значит потерять узел графа.
  const chunks = []
  let cur = []
  let bytes = 0
  for (const f of rest) {
    if (cur.length && (cur.length >= cellFiles || bytes + f.bytes > cellBytes)) { chunks.push(cur); cur = []; bytes = 0 }
    cur.push(f)
    bytes += f.bytes
  }
  if (cur.length) chunks.push(cur)

  const cell = (id, kind, part) => Object.freeze({
    id,
    kind,
    subjects: Object.freeze([...new Set(part.flatMap((f) => f.subjects || []))]),
    bytes: part.reduce((n, f) => n + f.bytes, 0),
    files: Object.freeze(part.map((f) => Object.freeze({ path: f.path, bytes: f.bytes, subjects: Object.freeze([...(f.subjects || [])]) }))),
  })

  const covered = new Set(files.flatMap((f) => f.subjects || []))
  return ok(Object.freeze({
    files: rest.length + spine.length,
    bytes: [...rest, ...spine].reduce((n, f) => n + f.bytes, 0),
    subjects: Object.freeze([...subjects]),
    gaps: Object.freeze(subjects.filter((s) => !covered.has(s))),
    cells: Object.freeze([
      ...(spine.length ? [cell("c0", "spine", spine)] : []),
      ...chunks.map((part, i) => cell(`c${i + 1}`, "survey", part)),
    ]),
  }))
}
