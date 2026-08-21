
$START_TASK
Fill the four modules of the tree.

In the skeleton below, each module has six empty places: `io`, `<hides>`, `<owns>`, `<twin path>`, `<needs>`, `<contract>`. Fill them. Copy everything else character-for-character. Write the complete file to the staging path.

PRIMARY RULE OF THIS ORDER: `<needs>` means “WITHOUT WHICH I CANNOT BE WRITTEN”, not “whom I call”.
An implementation needs its interface. An interface does NOT need its own implementation.
A module that accepts a type needs the file where that type is declared.

SECOND RULE: every string is copied CHARACTER-FOR-CHARACTER, including `&lt;` `&gt;` `&amp;`.
correct:   <sig>IResourceStore&lt;Glossary&gt;</sig>
incorrect: <sig>IResourceStore<Glossary></sig>
$END_TASK

$START_DATA

$START_DOCUMENT
path: {STAGING} (skeleton — fill this file)
Modules of this batch: {MINE}
Composition was calculated by a script. `path`, `delta`, `candidates` and the `<facts>` block are already correct:
`<facts>` contains declarations and addresses extracted from the repository; do not verify or rewrite them.
$END_DOCUMENT
$START_CONTENT
{SKELETON}
$END_CONTENT

$START_DOCUMENT
path: SAMPLE from the repository
This is how a file that solves the same problem is already written in this project. Take base class, annotations and declaration shape from here — do not invent them.
Line numbers appear on the left of every line. If something is missing, read PRECISELY and only by the rules:
    read(path: <path from the first line of the excerpt>, offset: <line number minus 2>, limit: 12)
At most EIGHT such reads per batch — one per shown SAMPLE. `read` without offset and limit is forbidden; no other files exist. Eight short reads at known addresses cost less than loading a whole file.
$END_DOCUMENT
$START_CONTENT
{TWIN}
$END_CONTENT

$START_DOCUMENT
path: neighbouring batches (already decided modules of the same work)
Their types and declarations are what your modules may reference in `<needs>`.
Empty means your batch is the first.
$END_DOCUMENT
$START_CONTENT
{NEIGHBOURS}
$END_CONTENT

$START_DOCUMENT
path: .agent/frd.xml
Full requirement: use cases, their steps, branches, fields and failure codes.
Write `<post>` against it: every guarantee names a requirement step of the form UC2/3.
$END_DOCUMENT
$START_CONTENT
{FRD}
$END_CONTENT

$START_DOCUMENT
path: {STAGING} (your file from the previous attempt; empty = first attempt)
Repair it according to FEEDBACK; do not rewrite from scratch.
$END_DOCUMENT
$START_CONTENT
{PREVIOUS}
$END_CONTENT

$END_DATA

$START_CONSTRAINTS
- The file contains exactly the same modules, in the same number, as the skeleton.
- `path`, `delta`, `candidates` and `<facts>` are copied character-for-character.
- `<twin path="…">` is exactly ONE path taken from the `candidates` of the same line.
- `<needs>` contains only FILE PATHS; every `<need>` has a `why`.
- `io` is one of: none · http · db · file · queue · llm.
- `<sig>` and `<owns>` are written in English; `<hides>`, `<pre>`, `<post>`, `<fail>`, `why` are written in Russian.
$END_CONSTRAINTS

$START_SELFCHECK
Before writing, answer yourself for every module in one line:
    <module path> — without which it cannot be written: <list> — and why these are DECLARATIONS, not calls
“It calls X” is not an answer: the caller depends on the callee, never the other way round.
If any answer names a module that calls YOU, remove it from `<needs>`.
$END_SELFCHECK

$START_FEEDBACK
Blockers from the last validation of the staging file (empty = first attempt).
Each blocker names a module by its path. Fix exactly those; change nothing else.
$START_CONTENT
{FEEDBACK}
$END_CONTENT
$END_FEEDBACK

$START_OUTPUT
path: {STAGING}
schema:
  <tree task="…" goal="…">
    <module path="…" delta="Added" io="db">
      <hides>one design decision the module conceals</hides>
      <owns type="Loan"/>
      <twin kind="twin" path="…" candidates="…"></twin>
      <needs><need path="src/loans/ILoanStore.java" why="реализует интерфейс"/></needs>
      <contract><sig>…</sig><pre>…</pre><post>… (UC1/3)</post><fail>… or «нет»</fail></contract>
    </module>
  </tree>
check: {CHECK}
BEFORE SUBMITTING: walk every `<need>` and strike out any that point to a module that calls you.
`needs` means “without which I cannot be written”; cycles are forbidden.
return: call workflow_result according to the OUTPUT_FORMAT of your ROLE
$END_OUTPUT