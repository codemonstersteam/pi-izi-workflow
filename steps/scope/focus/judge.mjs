// MODULE_CONTRACT: judge — суд фокуса: каждый предмет либо прочитан, либо назван непрочитанным
// Purpose:    обёртка-тотал над steps/scope/focus/focus.core.mjs::checkFocus (билет J18,
//             steps/scope/focus/coverage.md). Красный — дефект СКРИПТА фокуса: роли у подшага нет,
//             чинить некому, прогон обязан встать.
// io:         none
// Invariants: ТОТАЛЕН — мусор разбирается в блокеры (шов 9).
// Interface: judgeFocus
import { checkFocus } from "./focus.core.mjs"

export function judgeFocus({ focus = null, anchors = [] } = {}) {
  return checkFocus({ focus: focus || {}, anchors })
}
