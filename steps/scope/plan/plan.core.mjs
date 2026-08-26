// MODULE_CONTRACT: plan — the survey layout: a repository tree into swarm cells
// Purpose:    one decision — where a cell ends, so that the scout of step 4 gets a file list it can
//             physically read, AND so that this list SURVIVES an edit in a neighbouring directory.
//             PURE: knows no disk; the io lives in ext/index.mjs.
// io:         none
// EXTERNAL_DEPENDENCY (conceptual): a cell's `id` is the file name of its part
//             (`.agent/graph-parts/<id>.xml`, `.izi/parts/<id>.xml`), so it never holds a `/`. The
//             path→id mapping is declared here and only here (`cellId`), and steps/scope/cache.mjs
//             stores parts under that name.
// EXTERNAL_DEPENDENCY: `marked` — the paths of `.agent/anchors.json::marked`, written by step 2D.
//             The io reads that artifact and passes the array in; the file is ABSENT on every run
//             older than it, and its absence reads here as `marked: []` — the cut of the day before,
//             cell for cell. Silence, not a refusal: an old run is a legal run.
// Invariants: CELL_FILES/CELL_BYTES are fixed at load; the cells cover every file outside the spine
//             with no overlap and no loss — held by the shape of the tree walk and by splitting a
//             sparse cell into a micro-cell PLUS its remainder, not by a check afterwards; a spine
//             file never enters a survey cell; newPlan is pure — the result depends on the arguments
//             alone; cell ids are unique (`take` below) and derived from the PATH, never from the
//             order of iteration.
// Interface:  CELL_FILES — the ceiling of files in a cell
//             CELL_BYTES — the ceiling of bytes in a cell
//             HOME_DENSITY — the share of marked files above which a cell goes to the swarm WHOLE
//             SPINE_CELL — the id of the spine cell
//             cellId(dirPath) -> string
//             newPlan(input) -> Result<Plan, "no-files">

import { ok, err } from "../../../core/result.mjs"

export const CELL_FILES = 20
export const CELL_BYTES = 200 * 1024

// HOME_DENSITY — the border between the two SORTS of a marked cell (ticket T06).
//
// Above it the cell is the SUBJECT'S HOME: most of what is inside is about the work, and the
// neighbours a scout reads for free are context, not ballast — it goes to the swarm whole. At or
// below it the cell is a passer-by, and each marked file inside is cut out into its own MICRO-CELL,
// with the unmarked remainder left behind as a cell of its own. Nothing is dropped: this step cuts,
// step 3b (focus) decides what is read.
//
// MEASURED, eddi 23.08.2026 — steps/brd/normalize-concept-research.md ch. 4, reproduced by running
// this module over the tree (1854 files, the 512 KB read boundary of steps/brd/hits/hits.mjs): 62 files
// marked by the analogue `PromptSnippet` sit in 24 cells; whole, those cells are 256 files and
// 3.19 MB against 1.46 MB of the marked files themselves — dilution ×2.18, and THIRTEEN of the 24
// cells are bought for a single file. With the split: 8 home cells + 27 micro-cells, 71 files and
// 1.53 MB — dilution ×1.05, not one marked file lost and not one unmarked file dropped (the plan
// still covers all 1854; what the swarm skips is the focus's decision, step 3b).
//
// THE RULE IS ONLY AS SELECTIVE AS THE MARKS IT IS GIVEN. `.agent/anchors.json::marked` is today the
// UNION of every anchor's files — on eddi 1154 of 1854, because `agent` alone marks 48% — and on that
// input the same rule reads ×1.18 → ×1.06 while the plan grows from 283 cells to 458: a file whose
// only mark is a background word is cut away from the neighbours that explain it. What keeps this
// honest is the selectivity corridor of step 2 (steps/brd, ticket T03), not a second threshold here.
export const HOME_DENSITY = 0.5

// SPINE_CELL — the id of the spine cell: a readable name instead of a position.
//
// BUG_FIX_CONTEXT: the spine cell used to be `c0` — an ordinal in a list that itself kept shifting.
//   `spine` numbers nothing: it names the cell's KIND, the same word its `kind` field carries, and it
//   survives any rearrangement of the tree. Renaming it drags part.test.mjs's fixtures and the
//   examples in docs/scope.md — nothing else holds the literal (the orders substitute `{CELL}`).
export const SPINE_CELL = "spine"

// SEP — the separator between path segments inside an id. `~` because it is vanishingly rare in a
// path, while `/` is impossible in a file name.
// DUP — the suffix that separates two claimants to one id. A doubled `~` is UNREACHABLE from the path
// mapping: it would require an empty segment (`a//b`), which the walk never produces. That gives us,
// by construction, a property we would otherwise have to check: the suffix cannot collide with a
// directory that really exists.
const SEP = "~"
const DUP = "~~"
const ROOT_ID = "root"

// FUNCTION_CONTRACT: cellId — a cell's id from its directory's path
//   Input:        dirPath — a directory path from the run's root, "/"-separated; "" is the root
//   Dependencies: SEP, ROOT_ID
//   Antecedent:   any value; undefined/null read as ""
//   Consequent:   success: a name usable as a file name: segments joined by `~`, the root as "root"
//                 failure: none — total
//   Purity:       pure
//   Interface:    cellId(dirPath: unknown) -> string
export function cellId(dirPath) {
  const p = String(dirPath == null ? "" : dirPath)
  return p ? p.split("/").join(SEP) : ROOT_ID
}

// tree — a tree out of a flat list of paths. A node is { path, dirs: Map, own: [], files: number,
// bytes: number }, where `own` are the directory's OWN files and files/bytes are subtree totals.
function tree(files) {
  const root = { path: "", dirs: new Map(), own: [], files: 0, bytes: 0 }
  for (const f of files) {
    const parts = f.path.split("/")
    let node = root
    node.files += 1
    node.bytes += f.bytes
    for (let i = 0; i < parts.length - 1; i++) {
      const name = parts[i]
      if (!node.dirs.has(name)) {
        node.dirs.set(name, { path: node.path ? `${node.path}/${name}` : name, dirs: new Map(), own: [], files: 0, bytes: 0 })
      }
      node = node.dirs.get(name)
      node.files += 1
      node.bytes += f.bytes
    }
    node.own.push(f)
  }
  return root
}

// flatten — every file of a subtree, in path order. The order is not decoration: it also fixes the
// composition of the chunks a directory is cut into when it does not fit whole.
function flatten(node, out = []) {
  for (const f of node.own) out.push(f)
  for (const name of [...node.dirs.keys()].sort()) flatten(node.dirs.get(name), out)
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

// FUNCTION_CONTRACT: newPlan — the swarm's cells from a repository tree
//   Input:        { files, spine, subjects, marked, cellFiles, cellBytes }
//                 files — [{ path, bytes, subjects?, sha1? }], EVERY scanned file; `subjects` marks
//                         the anchors that hit, it is NOT a condition of inclusion; `sha1` is the key
//                         of step 4's cache (steps/scope/cache.mjs), which the plan only carries
//                 spine — [{ path, bytes }], build manifests and configuration; empty → no spine cell
//                 marked — paths of `.agent/anchors.json::marked`; absent or empty → no cell is split
//   Dependencies: tree, flatten, cellId, HOME_DENSITY
//   Antecedent:   files is non-empty OR spine is — otherwise there is nothing to map. The number of
//                 cells is unbounded: pi's concurrency limit is step 4's BATCH size, not a cell cap
//   Consequent:   success: { files, bytes, subjects, gaps, cells } — cells[0] has kind "spine" and id
//                          SPINE_CELL when spine is non-empty; then cells of kind "survey" covering
//                          EVERY other file with no overlap and no loss. A cell is a SUBTREE when the
//                          subtree fits both ceilings; otherwise the directory unfolds: its
//                          subdirectories first (each by the same rule), then its own files, cut by
//                          cellFiles OR cellBytes. An id is derived from the PATH, not from the
//                          order, so an added file changes exactly the cells whose subtree it landed
//                          in; `gaps` are the anchors that matched no file at all. A cell whose
//                          marked share is at or below HOME_DENSITY is SPLIT: one micro-cell per
//                          marked file, id `cellId(<the file's own path>)`, plus the unmarked
//                          remainder under the cell's own id
//                 failure: "no-files" — zero files: an empty repository has nothing to map
//   Purity:       pure
//   Interface:    newPlan({ files, spine, subjects, marked, cellFiles, cellBytes })
//                     -> Result<Plan, "no-files">
//
// BUG_FIX_CONTEXT: backlog W2 — a cell used to be a slice of the FLAT sorted list, and its id an
//   ordinal. One added file shifted the composition of every later cell, so there was nothing to
//   cache: editing one line recomputed the whole graph. Measured on eddi: the flat cut gives 100
//   cells of 184 KB with unstable ids, the subtree cut 291 cells with a median of 32 KB. The seam is
//   "add a file to one subtree, the other cells' ids do not move" (plan.test.mjs).
export function newPlan({ files = [], spine = [], subjects = [], marked = [], cellFiles = CELL_FILES, cellBytes = CELL_BYTES }) {
  const inSpine = new Set(spine.map((f) => f.path))
  const rest = files.filter((f) => !inSpine.has(f.path)).sort((a, b) => a.path.localeCompare(b.path))
  if (!rest.length && !spine.length) {
    return err("no-files", "ни одного файла вне списка пропуска — картировать нечего")
  }

  // take — an id is claimed once. The only possible collisions are a directory named `spine` against
  // the spine cell itself, or a directory named `root` against the root: the `~~n` suffix is
  // unreachable from the path mapping, so separating them cannot breed a new collision.
  const used = new Set(spine.length ? [SPINE_CELL] : [])
  const take = (id) => {
    if (!used.has(id)) { used.add(id); return id }
    for (let n = 2; ; n++) {
      const alt = `${id}${DUP}${n}`
      if (!used.has(alt)) { used.add(alt); return alt }
    }
  }

  const chunks = []                                     // [{ id, files }] in walk order
  const cut = (base, list) => {
    const parts = []
    let cur = []
    let bytes = 0
    for (const f of list) {
      if (cur.length && (cur.length >= cellFiles || bytes + f.bytes > cellBytes)) { parts.push(cur); cur = []; bytes = 0 }
      cur.push(f)
      bytes += f.bytes
    }
    if (cur.length) parts.push(cur)
    // A single chunk carries the directory's own name: the subtree did not fit but the directory's
    // own files did — and the directory's id is free, because no subtree cell was created for it.
    parts.forEach((part, i) => chunks.push({ id: take(parts.length === 1 ? base : `${base}${DUP}${i + 1}`), files: part }))
  }

  const pack = (node) => {
    if (node.files <= cellFiles && node.bytes <= cellBytes) {
      if (node.files) chunks.push({ id: take(cellId(node.path)), files: flatten(node) })
      return
    }
    for (const name of [...node.dirs.keys()].sort()) pack(node.dirs.get(name))
    if (node.own.length) cut(cellId(node.path), [...node.own].sort((a, b) => a.path.localeCompare(b.path)))
  }
  pack(tree(rest))

  // THE TWO SORTS OF A MARKED CELL. Ids are already claimed by the walk above, so this pass changes
  // the COMPOSITION of a cell, never the id of one that stays: the remainder keeps the cell's own id
  // and a micro-cell takes the id of its FILE — path-derived like every other, so `.izi/parts`
  // survives an edit next door exactly as before.
  //   > HOME_DENSITY  — the subject's home, whole (and a one-file marked cell lands here: 1/1)
  //   ≤ HOME_DENSITY  — a passer-by: every marked file becomes its own cell, the rest stays behind
  //   no marks at all  — untouched, including the case of no `marked` list at all
  // The comparison is `hits > files × HOME_DENSITY` and not a division: at exactly one half a cell is
  // NOT a home — half the reading would be ballast — and integer arithmetic says so without a float.
  const marks = new Set(Array.isArray(marked) ? marked : [])
  const hit = (f) => marks.has(f.path)
  const sorted = []
  for (const c of chunks) {
    const hits = c.files.filter(hit)
    if (!hits.length || hits.length > c.files.length * HOME_DENSITY) { sorted.push(c); continue }
    for (const f of hits) sorted.push({ id: take(cellId(f.path)), files: [f] })
    const left = c.files.filter((f) => !hit(f))
    if (left.length) sorted.push({ id: c.id, files: left })     // empty is unreachable: it would be 100% marked
  }

  const file = (f) => Object.freeze({
    path: f.path,
    bytes: f.bytes,
    sha1: f.sha1 || "",
    subjects: Object.freeze([...(f.subjects || [])]),
  })
  const cell = (id, kind, part) => Object.freeze({
    id,
    kind,
    subjects: Object.freeze([...new Set(part.flatMap((f) => f.subjects || []))]),
    bytes: part.reduce((n, f) => n + f.bytes, 0),
    files: Object.freeze(part.map(file)),
  })

  const covered = new Set(files.flatMap((f) => f.subjects || []))
  return ok(Object.freeze({
    files: rest.length + spine.length,
    bytes: [...rest, ...spine].reduce((n, f) => n + f.bytes, 0),
    subjects: Object.freeze([...subjects]),
    gaps: Object.freeze(subjects.filter((s) => !covered.has(s))),
    cells: Object.freeze([
      ...(spine.length ? [cell(SPINE_CELL, "spine", spine)] : []),
      ...sorted.map((c) => cell(c.id, "survey", c.files)),
    ]),
  }))
}
