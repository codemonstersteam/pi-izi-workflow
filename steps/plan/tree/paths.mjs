// MODULE_CONTRACT: paths — где у шага 9B что лежит
// Purpose:    одно решение: имена файлов шага объявлены В ОДНОМ месте. Разъехавшийся между `cut` и
//             `route` путь staging — это тихая потеря ответа роли, а не ошибка компиляции.
// io:         none
// Invariants: все пути ОТНОСИТЕЛЬНЫЕ — они разрешаются от cwd ПРОГОНА, никогда от этого репозитория
//             (CLAUDE.md, ограничение 6: установленный проект три переделегации читал TASK.md харнеса).
// Interface:  FRD, RIPPLE, GRAPH, WORK, OUT, STAGED, skeletonAt, portionAt, CAP
export const FRD = ".agent/frd.xml"
export const RIPPLE = ".agent/ripple.xml"
export const GRAPH = ".agent/appgraph.xml"
export const WORK = ".agent/step9"
export const OUT = ".agent/tree.xml"
export const STAGED = ".agent/staging/tree.xml"
export const skeletonAt = () => `${WORK}/tree-skeleton.xml`
export const portionAt = (id) => `.agent/staging/tree~${id}.xml`
// Четыре модуля на порцию. Наряд на все 12 — 63 735 символов и 5-9 минут с обрывами; четыре держатся.
export const CAP = 4
