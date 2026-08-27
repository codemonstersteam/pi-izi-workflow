// MODULE_CONTRACT: small — порог укороченного трека: маленькая ли задача (0 токенов)
// Purpose:    одно решение: проходит ли задача ОДНИМ вызовом intake. Считается СКРИПТОМ по двум
//             фактам, уже лежащим на диске, — узлы карты и R-строки brd — ДО любого наряда;
//             пороги откалиброваны двумя эталонами (quarkus: 9 файлов, 3 строки → true;
//             eddi: 1854 файла, 16 строк → false) и конфигом НЕ являются: число, которое можно
//             подкрутить без нового эталона, — это число без источника.
// io:         fs (через cut.mjs — mapOf/brdText читают .agent/appgraph.xml и .agent/brd.md)
// EXTERNAL_DEPENDENCY: steps/intake/cut.mjs — mapOf (карта как данные), brdText (артефакт шага 2);
//             пути читаются против state.cwd ПРОГОНА (не этого репо) — нет файлов, значит пусто.
// Invariants: пустая карта или пустой brd → false: «нет данных решать» — это полный путь, а не
//             маленькая задача (standards/code.md §2: отсутствие — случай, а не пустое значение).
// Interface:  isSmall
import { mapOf, brdText } from "../cut.mjs"

// ПОРОГИ — константы здесь и нигде больше (бэклог backlog-small-task.md, тикет 01). Оба куплены
// ЖИВЫМИ ЗАМЕРАМИ КАРТ, а не вкусом: quarkus-rest-json-app-v2-t1-3 (карта 24 узла — 12 файлов
// в двух префиксных вариантах, 3 строки заказа; полный путь стоил 15 вызовов и ~203k токенов)
// и eddi DOS-535 (карта 71 узел обследованного фокуса, 16 строк). Порог 32 даёт обеим сторонам
// запас ×1,3-2,2. Первый прогон 27.08 взял 12 «по числу java-файлов» — и полоса ушла в полный
// путь: калибровать надо по ТОМУ, что читает порог, — по узлам карты, а не по дереву репо.
// R-строка считается той же формой, что и в слайсах owners/coverage: /^R\d+ /gm.
export const MAX_NODES = 32
export const MAX_REQUIREMENTS = 5

// FUNCTION_CONTRACT: isSmall — идти ли укороченным треком (порция one вместо шести пластов)
//   Input:        state — состояние прогона (cwd)
//   Dependencies: cut.mjs::mapOf (узлы карты), cut.mjs::brdText (R-строки brd.md)
//   Antecedent:   .agent/appgraph.xml и .agent/brd.md могут отсутствовать — тогда false
//   Consequent:   success: boolean — карта ≤ MAX_NODES узлов И brd ≤ MAX_REQUIREMENTS R-строк;
//                 пустая карта или пустой brd — false (полным путём)
//   Purity:       io (fs через cut.mjs)
//   Interface:    isSmall(state) -> boolean
export function isSmall(state) {
  const nodes = mapOf(state).nodes.size
  const brd = brdText(state)
  if (!nodes || !brd) return false
  return nodes <= MAX_NODES && [...brd.matchAll(/^R\d+ /gm)].length <= MAX_REQUIREMENTS
}
