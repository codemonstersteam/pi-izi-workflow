$START_TASK
Answer seven questions about this repository from the spine files of cell spine: WHAT it builds,
how it is TESTED, how it is BUILT, how a RUNNING instance switches behaviour on and off, how
branches and commits are NAMED, how its external contract is DESCRIBED and validated, and which
EXTERNAL SYSTEMS its configuration declares. Each answer is what you read — or `found="no"`.
$END_TASK

$START_DATA
$START_DOCUMENT
files of cell spine — build manifests, CI, configuration, README/CONTRIBUTING. These paths, and
only these.

They arrive as a digest line each: path, size and — for a language the script can read — its
declarations. A build manifest is not such a language, so most of these lines say `no digest`: that
is expected here, and reading the files themselves with `read(path)` is the work of this cell.

Paths are relative to the run's root, and you are already in it. Copy them verbatim from the list;
never prefix them with a directory of your own — run `dc415b95` spent two calls on
`.private/tmp/<project>/README.md` before reading `README.md`.
$END_DOCUMENT
$START_CONTENT
- .env.example (2804 b · ?)
    no digest: this extension has no reader — open the file yourself if it holds a module
- CONTRIBUTING.md (7931 b · ?)
    no digest: this extension has no reader — open the file yourself if it holds a module
- README.md (41451 b · ?)
    no digest: this extension has no reader — open the file yourself if it holds a module
- pom.xml (40312 b · ?)
    no digest: this extension has no reader — open the file yourself if it holds a module
- src/main/resources/application.properties (28616 b · ?)
    no digest: this extension has no reader — open the file yourself if it holds a module
- src/test/resources/application.properties (2353 b · ?)
    no digest: this extension has no reader — open the file yourself if it holds a module
$END_CONTENT
$START_DOCUMENT
BRD anchors that matched something in this cell — context, not a selector
$END_DOCUMENT
$START_CONTENT
no BRD anchor hit any file of this cell — the survey still maps every file
$END_CONTENT
$START_DOCUMENT
path: .agent/brd.md
the measurable requirement this survey serves — read it for context, never as a list of files
$END_DOCUMENT
$START_CONTENT
R1 create | Glossary | new configuration type | dictionary of bot terms, CRUD with versioning, based on Prompt Snippet, resource type `eddi://ai.labs.glossary`
R2 enable | substitution | prompts | as {{glossary.<term>}} alongside snippets
R3 add | export | Glossary | travels with agent during export
R4 add | import | Glossary | travels with agent during import, including comparison with existing and upgrade
R5 define | versioning | Glossary | repeats Prompt Snippet mechanism, no own description
R6 define | import merge | Glossary | merge by resource URI, new version wins (upgrade existing)
R7 define | Term | Glossary | only key + value, no description, no category
R8 constrain | Term key | Glossary | up to 64 chars, lowercase, alphanumeric and underscore
R9 add | reference | agent config | Glossary as reference, like snippets
R10 define | REST path | Glossary | /glossarystore/glossaries, *store/* pattern
R11 constrain | substitution scope | Glossary | only for glossaries bound to agent, no global
R12 define | key collision | Glossary | last load wins: order in configuration set is priority
R13 define | Glossary fields | Glossary resource | only id + version + terms
R14 define | value length | Glossary | not limited
R15 define | template data model key | Glossary | glossary, Qute standard syntax: {glossary.<term>}
R16 define | caching | Glossary | Caffeine, TTL same as PromptSnippetService
R17 define | remote glossary error | Glossary | error on prompt rendering when bound glossary is removed
R18 define | export file name | agent ZIP archive | as {id}.glossary.json plus {id}.descriptor.json
analogue: PromptSnippet — files 62; the existing configuration type that Glossary is based on, repeating its CRUD, versioning mechanism, caching with Caffeine, and template substitution patterns
subjects[]: Glossary · substitution · versioning · collision · PromptSnippet
$END_CONTENT
$END_DATA

$START_CONSTRAINTS
- ALL seven answers are present: `<artifact>`, `<suite>` elements (or `<suites found="no"/>`),
  `<build>`, `<toggles>`, `<branching>`, `<contract>`, `<integration>` elements (or
  `<integrations found="no"/>`)
- `<artifact name="…" root="…"/>` is the DEPLOYABLE unit this repository builds, named where the
  build manifest names it: `artifactId` in a pom, `module` in go.mod, `name` in package.json,
  `[package] name` in Cargo.toml. `root` is the directory that manifest sits in — `.` for a single
  artifact. A monorepo declares one `<artifact>` per manifest you actually read
- an `<integration kind="http|db|queue|cache|blob|mail|rpc" system="…" config="…" value="…"/>` is one
  EXTERNAL system the configuration declares: a datasource URL, a broker address, another service's
  base URL. `config` is the configuration KEY and it is required — step 5 stitches a module's `<io>`
  to this declaration by that key. `value` is what the file actually holds; if that is a placeholder
  or an environment variable, write the placeholder — a secret never travels into the graph. One
  system, one `<integration>`
- `<toggles mechanism="…" config="…"/>` is how a RUNNING instance switches behaviour WITHOUT being
  rebuilt or redeployed: a configuration property read at run time, a flag in a table, a feature-flag
  library. `config` is that KEY — the property, flag or record the running application reads — and it
  is required, exactly as it is for an `<integration>`
- a build profile (`-P…`), a compiler or packaging flag, a variable that selects the deployment
  environment and a branch are NOT toggles: none of them changes anything without a rebuild, and
  none of them has a key the running application reads. Found no such key — `<toggles found="no"/>`,
  and that is a complete answer, not a failure
- list EVERY test suite you find, not the first one: unit tests next to the code, component and
  contract suites in their own folders — each with its own `cmd`, its own folder and its own
  one-file form
- `kind` of a suite is one of `unit` · `component` · `contract` · `e2e`, and its `id` STARTS with
  that kind: `unit`, `component`, `component-native`, `contract-pact`. Do not name a suite after the
  profile or the tool — the id is what step 10 stitches a node's test to, so a name invented afresh
  binds to nothing
- `path` of a suite is the folder its tests live in — step 5 binds every `<test>` of the graph to a
  suite by that path, so an approximate folder silently unbinds the tests it should have caught
- when TWO suites live in the SAME folder, each must carry `match="…"` — the file-name pattern its
  own runner picks up, read from the build manifest: maven surefire takes `*Test.java`, failsafe
  takes `*IT.java`; gradle and jest declare theirs in the build file. Without it step 5 has two
  candidates per test file and binds the integration test to the unit command, which then runs
  nothing and reports green. One suite over a folder needs no `match`
- `match` is checked against the files of the REPOSITORY under `path` — not only this cell's files:
  surefire's `*Test.java` under `src/test/java` matches `src/test/java/demo/FooResourceTest.java`.
  The file EXTENSION is part of the name a runner matches — leave it off and the pattern catches
  nothing
- `cmd` runs the runner THIS repository ships. `mvnw` or `gradlew` in the root is that runner:
  write `./mvnw …`, `./gradlew …`. A bare `mvn`/`gradle` beside a wrapper is rejected — it is a
  different runner and may not be installed at all
- `one` is what has to be ADDED to THIS suite's own `cmd` to run ONE test file instead of the whole
  suite. Read it where this suite's runner is configured — the build manifest, the task or profile
  that defines the suite, that runner's own flag. Write `{{class}}` where the file or class name
  goes. Each suite is answered on its own, even when one tool runs them all. `one=""` only when that
  runner has no such way at all — without `one`, closing a single node costs a run of the whole suite
- an answer you did not read is `found="no"` — never a plausible command. Absent tests do not stop
  you here; the pipeline decides what that means one step later
- a raw `<` inside an attribute value is written `&lt;`
$END_CONSTRAINTS

$START_PREVIOUS
$START_DOCUMENT
path: .agent/staging/part~spine.xml
ТВОЙ ПРОШЛЫЙ ОТВЕТ — тот самый файл, который забраковала проверка (пусто = первая попытка).
Это ПОЧИНКА, а не новый ответ: правь названные ниже места ЭТОГО текста, остальное оставь как есть.
Написанное заново ломает то, что проверку уже прошло.
$END_DOCUMENT
$START_CONTENT

$END_CONTENT
$END_PREVIOUS

$START_FEEDBACK
Evidence from the last red check, if this is a redelegation. Empty means the first attempt. Each
blocker carries its rule number — repair exactly what it names, first.
$START_CONTENT

$END_CONTENT
$END_FEEDBACK

$START_OUTPUT
path: .agent/staging/part~spine.xml
schema:
  <part cell="spine" kind="spine">
    <artifact name="…" root="…"/>
    <suite id="…" kind="unit|component|contract|e2e" cmd="…" one="… or empty" path="…" match="… when two suites share a folder"/>
    <build cmd="…"/>
    <toggles mechanism="…" config="…"/>
    <branching branches="…" commits="…"/>
    <contract spec="…" validator="…"/>
    <integration kind="db" system="…" config="…" value="…"/>
  </part>
  any of the seven may instead be <… found="no"/> — for the two list answers that is
  <suites found="no"/> and <integrations found="no"/>
check: the script judges the file you write at .agent/staging/part~spine.xml by the part guardrail (grammar 4); a red verdict returns as FEEDBACK with rule numbers and paths
return: call workflow_result — the shape and the choice of rail are declared by your ROLE's
OUTPUT_FORMAT
$END_OUTPUT
