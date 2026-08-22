// MODULE_CONTRACT: paths — где у шага 5 что лежит. io: none.
// Invariants: пути относительные — разрешаются от cwd ПРОГОНА.
// Interface: PLAN, FOCUS, PARTS, COMPUTED, GRAPH, partAt
export const PLAN = ".agent/survey-plan.json"
export const FOCUS = ".agent/focus.json"
export const PARTS = ".agent/graph-parts"
export const COMPUTED = ".agent/graph-computed.xml"
export const GRAPH = ".agent/appgraph.xml"
export const partAt = (cell) => `${PARTS}/${cell}.xml`
