// MODULE_CONTRACT: paths — где у шага 3 что лежит. io: none.
// ПЕРЕНОС: таблица шага 5 (steps/graph/paths.mjs) держала эти пути ДО разложения шага 3 — теперь
// каждый носит свои; ДОКУМЕНТ-ОСНОВАНИЕ одного пути живёт один раз (standards/code.md, ограничение 1).
// Invariants: пути относительные — разрешаются от cwd ПРОГОНА (CLAUDE.md, ограничение 6).
// Interface: BRD, ANCHORS, PLAN, FOCUS, COMPUTED, PARTS, CACHE, partAt, cacheAt
export const BRD = ".agent/brd.md"
export const ANCHORS = ".agent/anchors.json"
export const PLAN = ".agent/survey-plan.json"
export const FOCUS = ".agent/focus.json"
export const COMPUTED = ".agent/graph-computed.xml"
export const PARTS = ".agent/graph-parts"
export const CACHE = ".izi/parts"
export const STAGED_PART = ".agent/staging/part~{CELL}.xml"
export const partAt = (cell) => `${PARTS}/${cell}.xml`
export const cacheAt = (cell) => `${CACHE}/${cell}.xml`
export const entryAt = (cell) => `${CACHE}/${cell}.json`
