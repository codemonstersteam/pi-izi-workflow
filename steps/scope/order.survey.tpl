$START_TASK
Map cell {CELL} of this repository: one `<module>` per file you read, one `<gap>` per file you could
not, the edges between them, what each module EXPOSES and what it reaches OUTSIDE this repository.
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
- every `<module>` answers all FOUR dimensions, with an element or with the explicit "none":
  edges — `<dep path>` … or `deps="none"`;
  external points — `<io>` … or `io="none"`;
  exposed surface — `<api>` … or `api="none"`;
  tests — `<test path>` … or `tests="none"`
- `<test path="…"/>` when a file of THIS cell tests this module, or when the module itself names its
  test. Write the PATH and nothing else: a suite id belongs to the spine cell, which is being read at
  the same moment as yours, so you cannot know it and must not guess — step 5 binds a test to its
  suite by path. A module with no test you can see carries `tests="none"`
- a `<dep>` is a path INSIDE this repository; it may point outside this cell — the graph is global,
  the cell is local. Point, do not open. A library or framework import is NOT an edge: `jakarta.*`,
  `io.vertx.*`, JUnit and their kin are not written anywhere in the part
- `<api kind="http|cli|event|lib" scope="public|internal" name="…">` — an entry point this file
  offers. `scope="public"` means it is reachable from OUTSIDE the process (an HTTP route, a CLI
  command, a consumed topic); `scope="internal"` means only other modules of this repository call it.
  For `kind="http"` the name is exactly `METHOD /path` — `GET /fruits`, uppercase method, no query
  string, no placeholders of your own
- `<io kind="http|db|queue|cache|blob|mail|rpc" dir="in|out" system="…" config="…" target="…"/>` —
  a point where this file reaches an EXTERNAL system: a database, a broker, another service. `system`
  is a short kebab-case label; `config` is the configuration key that carries the address when the
  address is not in the code; `target` is what you can see in the code (URL, topic, table). At least
  one of `config`/`target` is filled — an external point with neither is a guess. Your own inbound
  HTTP is `<api>`, not `<io>`; `dir="in"` only when the EXTERNAL system initiates (a queue consumer,
  a webhook)
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
      <api name="…" kind="http" scope="public"/>
      <dep path="…"/>
      <io kind="db" dir="out" system="…" config="…" target="…"/>
      <test path="…"/>
    </module>
    <module path="…" deps="none" io="none" api="none" tests="none"><role>…</role></module>
    <gap path="…" why="…"/>
  </part>
check: {CHECK}
return: call workflow_result — the shape and the choice of rail are declared by your ROLE's
OUTPUT_FORMAT
$END_OUTPUT
