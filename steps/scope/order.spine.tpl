$START_TASK
Answer six questions about this repository from the spine files of cell {CELL}: how it is TESTED,
how it is BUILT, how features are SWITCHED OFF, how branches and commits are NAMED, how its
external contract is DESCRIBED and validated, and which EXTERNAL SYSTEMS its configuration declares.
Each answer is what you read — or `found="no"`.
$END_TASK

$START_DATA
$START_DOCUMENT
files of cell {CELL} — build manifests, CI, configuration, README/CONTRIBUTING. Read these paths,
and only these
$END_DOCUMENT
$START_CONTENT
{FILES}
$END_CONTENT
$START_DOCUMENT
BRD anchors that matched something in this cell — context, not a selector
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
- ALL six answers are present: `<suite>` elements (or `<suites found="no"/>`), `<build>`,
  `<toggles>`, `<branching>`, `<contract>`, `<integration>` elements (or `<integrations found="no"/>`)
- an `<integration kind="http|db|queue|cache|blob|mail|rpc" system="…" config="…" value="…"/>` is one
  EXTERNAL system the configuration declares: a datasource URL, a broker address, another service's
  base URL. `config` is the configuration KEY and it is required — step 5 stitches a module's `<io>`
  to this declaration by that key. `value` is what the file actually holds; if that is a placeholder
  or an environment variable, write the placeholder — a secret never travels into the graph. One
  system, one `<integration>`
- list EVERY test suite you find, not the first one: unit tests next to the code, component and
  contract suites in their own folders — each with its own `cmd`, its own folder and its own
  one-file form
- `kind` of a suite is one of `unit` · `component` · `contract` · `e2e`, and its `id` STARTS with
  that kind: `unit`, `component`, `component-native`, `contract-pact`. Do not name a suite after the
  profile or the tool — the id is what step 10 stitches a node's test to, so a name invented afresh
  binds to nothing
- `path` of a suite is the folder its tests live in — step 5 binds every `<test>` of the graph to a
  suite by that path, so an approximate folder silently unbinds the tests it should have caught
- `one` is the form that runs ONE file (`-Dtest={{class}}` in maven, `--tests` in gradle, a path in
  jest/pytest, `-run` in go). No such form → leave `one=""`; that is a valid answer
- an answer you did not read is `found="no"` — never a plausible command. Absent tests do not stop
  you here; the pipeline decides what that means one step later
- a raw `<` inside an attribute value is written `&lt;`
$END_CONSTRAINTS

$START_FEEDBACK
Evidence from the last red check, if this is a redelegation. Empty means the first attempt. Each
blocker carries its rule number — repair exactly what it names, first.
$START_CONTENT
{FEEDBACK}
$END_CONTENT
$END_FEEDBACK

$START_OUTPUT
path: {STAGING}
schema:
  <part cell="{CELL}" kind="spine">
    <suite id="…" kind="unit|component|contract|e2e" cmd="…" one="… or empty" path="…"/>
    <build cmd="…"/>
    <toggles mechanism="…"/>
    <branching branches="…" commits="…"/>
    <contract spec="…" validator="…"/>
    <integration kind="db" system="…" config="…" value="…"/>
  </part>
  any of the six may instead be <… found="no"/> — for the two list answers that is
  <suites found="no"/> and <integrations found="no"/>
check: {CHECK}
return: call workflow_result — the shape and the choice of rail are declared by your ROLE's
OUTPUT_FORMAT
$END_OUTPUT
