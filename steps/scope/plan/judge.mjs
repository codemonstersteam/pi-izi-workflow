// MODULE_CONTRACT: judge — суд плана, ПОСЛЕ резки и ДО продвижения
// Purpose:    одно решение: собрался ли план, по которому можно звать рой. Форма клетки держится
//             САМОЙ резкой (plan.core.mjs, инвариант «без перекрытий и без потерь»); судит здесь
//             то, что резка обязана выдать, но может выдать молча пустым: клетки, уникальность id,
//             пробелы против предметов. Красный суд СКРИПТОВОГО прохода — дефект кода, а не
//             артефакта: чинить некому, и подшаг обязан остановиться с именем (паттерн checkFocus).
// io:         none
// Invariants: ТОТАЛЕН — мусор разбирается в блокеры, а не в исключение (standards/code.md; шов 9).
// Interface: judgePlan
//
// ПРАВИЛА (номер живёт один раз — здесь, в FEEDBACK его читает разработчик, а не роль):
//   PL1 — план несёт хотя бы одну клетку;
//   PL2 — id клеток уникальны (кэш и части адресуются id);
//   PL3 — gaps ⊆ subjects: «непокрытый предмет» обязан быть предметом.
export function judgePlan({ plan = null, subjects = [] } = {}) {
  const B = []
  const cells = (plan && Array.isArray(plan.cells)) ? plan.cells : []
  const said = (plan && Array.isArray(plan.subjects)) ? plan.subjects : []
  if (!cells.length) B.push("PL1 план не несёт ни одной клетки — резка вернула пустоту")
  const ids = cells.map((c) => (c && c.id) || "")
  const dup = ids.filter((x, i) => x && ids.indexOf(x) !== i)
  if (dup.length) B.push(`PL2 id клеток дублируются: ${[...new Set(dup)].join(" · ")} — кэш и части адресуются id`)
  for (const g of (plan && Array.isArray(plan.gaps)) ? plan.gaps : []) {
    if (!said.includes(g) || !subjects.includes(g)) {
      B.push(`PL3 пробел «${g}» не является предметом требования — резка сошлась с чужим списком`)
    }
  }
  return B
}
