// MODULE_CONTRACT: order — слоты наряда шага 9B, собранные ОДИН раз на всех читателей
// Purpose:    одно решение — что именно уезжает роли в наряде порции и в наряде починки. Полоса
//             исполняется в песочнице хоста и никем не импортируется; компонентный тест шага —
//             импортируется. Если бы слоты собирались в полосе, тест собирал бы их КОПИЕЙ, и наряд,
//             проверенный тестом, отличался бы от наряда живого прогона ровно на эту копию.
// io:         none — чтение диска делают функции расширения, сюда приезжают уже готовые куски
// Invariants: имена слотов совпадают с плейсхолдерами шаблонов (шов core/orders.test.mjs);
//             наряд починки НЕ несёт скелета: роль правит свой прошлый ответ.
// Interface:  treeSlots, treeFixSlots

// FUNCTION_CONTRACT: treeSlots — наряд первого захода по одной порции дерева
//   Input:        { skeleton, twin, neighbours, frd, previous, feedback, mine, staging, check }
//   Dependencies: —
//   Antecedent:   любые значения; пустой сосед и пустой прошлый ответ — законное состояние первой порции
//   Consequent:   success: объект слотов для steps/plan/tree/order-tree.tpl
//   Purity:       pure
export function treeSlots({ skeleton = "", twin = "", neighbours = "", frd = "", previous = "", feedback = "", mine = [], staging = "", check = "" } = {}) {
  return {
    SKELETON: skeleton,
    TWIN: twin,
    NEIGHBOURS: neighbours || "(твоя порция первая)",
    FRD: frd,
    PREVIOUS: previous,
    FEEDBACK: feedback,
    MINE: (mine || []).join(" · "),
    STAGING: staging,
    CHECK: check,
  }
}

// FUNCTION_CONTRACT: treeFixSlots — наряд ПОЧИНКИ по той же порции
//   Input:        { tasklist, count, previous, twin, neighbours, frd, mine, staging, check }
//   Dependencies: —
//   Antecedent:   `previous` непуст — чинить нечего, если роль ещё ничего не написала
//   Consequent:   success: объект слотов для steps/plan/tree/order-tree.fix.tpl; скелета среди них
//                          НЕТ: на починке он мёртвый груз
//   Purity:       pure
export function treeFixSlots({ tasklist = "", count = 0, previous = "", twin = "", neighbours = "", frd = "", mine = [], staging = "", check = "" } = {}) {
  return {
    TASKLIST: tasklist,
    COUNT: String(count),
    PREVIOUS: previous,
    TWIN: twin,
    NEIGHBOURS: neighbours || "(твоя порция первая)",
    FRD: frd,
    MINE: (mine || []).join(" · "),
    STAGING: staging,
    CHECK: check,
  }
}
