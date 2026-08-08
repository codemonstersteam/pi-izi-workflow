$START_TASK
Map cell {CELL} of this repository: one `<module>` per file you read, one `<gap>` per file you could
not, and the edges between them.
$END_TASK

$START_DATA
$START_DOCUMENT
files of cell {CELL} — the whole world of this run: read these paths, and only these
$END_DOCUMENT
$START_CONTENT
{FILES}
$END_CONTENT
$START_DOCUMENT
BRD anchors that matched something in this cell — a hint about what the change will care about.
They mark files, they do not select them: every file above is mapped regardless
$END_DOCUMENT
$START_CONTENT
{SUBJECTS}
$END_CONTENT
$START_DOCUMENT
path: .agent/brd.md
the measurable requirement this survey serves — read it for context, never as a list of files
$END_DOCUMENT
$START_CONTENT
{BRD}
$END_CONTENT
$END_DATA

$START_CONSTRAINTS
- every file above is closed by a `<module path>` or a `<gap path why>` — no file is left silent
- `path` is copied from the list verbatim; a path outside this cell does not belong in this part
- every `<module>` carries `<role>` and its dependency answer: `<dep path>` for each edge, or
  `deps="none"`
- a `<dep>` may point outside this cell — the graph is global, the cell is local. Point, do not open
- a raw `<` inside an attribute value is written `&lt;`
$END_CONSTRAINTS

$START_FEEDBACK
Evidence from the last red check, if this is a redelegation. Empty means the first attempt. Each
blocker carries its rule number and the path it is about — repair exactly what it names, first.
$START_CONTENT
{FEEDBACK}
$END_CONTENT
$END_FEEDBACK

$START_OUTPUT
path: {STAGING}
schema:
  <part cell="{CELL}" kind="survey">
    <module path="…">
      <role>…</role>
      <api name="…"/>
      <dep path="…"/>
      <test path="…" suite="…"/>
    </module>
    <module path="…" deps="none"><role>…</role></module>
    <gap path="…" why="…"/>
  </part>
check: {CHECK}
return: call workflow_result — the shape and the choice of rail are declared by your ROLE's
OUTPUT_FORMAT
$END_OUTPUT
