// MODULE_CONTRACT: roles — РЕЕСТР РОЛЕЙ: какие каталоги расширение отдаёт хосту и что в них лежит
// Purpose:    одно решение спрятано здесь: что считается ролью. Хост берёт из отданного каталога
//             КАЖДЫЙ `.md` и делает из него роль по имени файла
//             (pi-extensible-workflows validation.ts::scanRoleFiles), а совпадение имён между
//             каталогами расширения — жёсткий отказ загрузки. Значит список каталогов — это и есть
//             список ролей, и он обязан быть ОБЪЯВЛЕН, а не угадан.
// io:         none (пути считаются, диск не читается)
// EXTERNAL_DEPENDENCY: контракт хоста — `roleDirectories` принимает КАТАЛОГИ, не файлы
//             (registry.ts::normalizeRoleDirectory), и имя файла есть имя роли (standards/role.md).
// Invariants: ключ — id шага, он же путь `steps/<id>/`; значение — имена ролей, они же имена файлов
//             `<name>.md`. Третьего места, где это написано, нет.
// Interface:  ROLES, roleDirsOf
//
// ДВА ДЕФЕКТА, ОПЛАТИВШИЕ ЭТОТ ФАЙЛ, и они тянут в разные стороны — поэтому реестр законен только
// вместе со швом в ОБЕ стороны (ext/vocabulary.test.mjs).
//
//   1. СКАНИРОВАНИЕ БРАЛО ЛИШНЕЕ. Прежний `ext/index.mjs::roleDirs` объявлял ролевым любой каталог
//      под `steps/`, где лежал хоть один `.md`. Ролями стали проектные записки: три файла
//      `data-flow.md` (steps/, steps/brd/, steps/plan/) дали три роли «data-flow» и хост отказался
//      грузить расширение целиком — 24.08.2026 ни один прогон не стартовал:
//      `The workflow metadata is invalid: Duplicate extension role "data-flow"`.
//
//   2. РУКОПИСНЫЙ СПИСОК ГНИЁТ. До сканирования каталоги перечислялись руками — список пережил
//      чистку и стал указывать на снесённый каталог, из-за чего сканирование и завели. Поэтому
//      здесь объявление, а рядом шов: объявленное обязано лежать на диске, и на диске не смеет
//      лежать необъявленное.
import { join } from "node:path"

// РЕЕСТР. Ключ — id шага (`steps/<id>/`), значение — имена ролей (`<name>.md` в этом каталоге).
export const ROLES = Object.freeze({
  "brd/normalize": Object.freeze(["normalizer", "cleaner"]),
  "brd/anchors":   Object.freeze(["analogue"]),
  "scope":         Object.freeze(["scout"]),
  "intake":        Object.freeze(["intake"]),
  "plan/tree":     Object.freeze(["tree-designer"]),
  "plan/values":   Object.freeze(["valuer"]),
  "plan/flows":    Object.freeze(["flow-designer"]),
})

// FUNCTION_CONTRACT: roleDirsOf — каталоги ролей для хоста
//   Input:        stepsRoot — абсолютный путь каталога `steps/`
//   Dependencies: ROLES
//   Antecedent:   — (тотальна; диск не читается, существование каталога сторожит шов)
//   Consequent:   success: [URL] — по одному file://-URL на id реестра, в порядке объявления
//   Purity:       pure
//   Interface:    roleDirsOf(stepsRoot: string) -> URL[]
//   URL, А НЕ СТРОКА: хост принимает и то и другое (registry.ts::normalizeRoleDirectory), но строка
//   обязана быть АБСОЛЮТНОЙ, и относительный путь он отбивает уже на загрузке расширения.
export function roleDirsOf(stepsRoot) {
  return Object.keys(ROLES).map((id) => new URL(`file://${join(stepsRoot, id)}/`))
}
