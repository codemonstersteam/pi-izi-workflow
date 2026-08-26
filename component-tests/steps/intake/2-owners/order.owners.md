$START_TASK
One decision: for EVERY step of every use case below, name the module that will carry it.
You do NOT classify forms, do NOT write scenarios, do NOT invent operations — owners only.
When the script's candidates tie at the top, the choice belongs to the OPERATOR: ask.
$END_TASK

$START_DATA
$START_DOCUMENT
path: .agent/staging/frd~A.xml
The use cases every step of which needs an owner. Their layer is closed — do not touch it.
$END_DOCUMENT
$START_CONTENT
<frd grammar="1" goal="add Glossary as a new configuration type for bot term dictionaries with CRUD, versioning, substitution, export/import and agent binding">

  <actor name="operator" kind="human" via="HTTP REST /glossarystore/glossaries"/>
  <actor name="rendering-system" kind="system" via="internal GlossaryService"/>

  <usecase id="UC1" actor="operator" goal="create a glossary">
    <pre>operator is authenticated</pre>
    <post>glossary is stored with system-generated id and version 1</post>
    <step n="1">operator sends POST to /glossarystore/glossaries with terms array in the request body</step>
    <step n="2">system validates every term key against the format rules and assigns a system-generated id</step>
    <step n="3">system stores the glossary with version 1 and returns 201 with Location header containing the id</step>
    <ext id="1a" error="none" outcome="glossary creation is rejected, no glossary is stored"/>
    <ext id="2a" error="none" outcome="glossary creation is rejected because one or more term keys are invalid"/>
  </usecase>

  <usecase id="UC2" actor="operator" goal="read one glossary">
    <pre>glossary exists in the system</pre>
    <post>requested glossary is returned with all its terms</post>
    <step n="1">operator sends GET to /glossarystore/glossaries/{id}</step>
    <step n="2">system retrieves the glossary and returns it with its terms, id and version</step>
    <ext id="2a" error="none" outcome="glossary is not returned, absence response is given"/>
  </usecase>

  <usecase id="UC3" actor="operator" goal="list all glossaries">
    <pre>operator is authenticated</pre>
    <post>list of all glossaries is returned</post>
    <step n="1">operator sends GET to /glossarystore/glossaries</step>
    <step n="2">system retrieves all glossaries and returns the list with id, version and terms for each</step>
  </usecase>

  <usecase id="UC4" actor="operator" goal="update a glossary">
    <pre>glossary exists in the system</pre>
    <post>new version of the glossary is stored with updated terms</post>
    <step n="1">operator sends PUT to /glossarystore/glossaries/{id} with new terms array</step>
    <step n="2">system validates every term key against the format rules</step>
    <step n="3">system creates a new version of the glossary and returns 200</step>
    <ext id="2a" error="none" outcome="update is rejected because one or more term keys are invalid, existing version remains unchanged"/>
    <ext id="3a" error="none" outcome="new version is not created, existing version remains unchanged"/>
  </usecase>

  <usecase id="UC5" actor="operator" goal="delete a glossary">
    <pre>glossary exists in the system</pre>
    <post>glossary is removed from the system</post>
    <step n="1">operator sends DELETE to /glossarystore/glossaries/{id}</step>
    <step n="2">system removes the glossary and returns 204</step>
    <ext id="1a" error="none" outcome="glossary is not found, absence response is given"/>
  </usecase>

  <usecase id="UC6" actor="rendering-system" goal="substitute glossary terms in a prompt">
    <pre>agent has glossaries bound in its configuration and prompt template contains glossary placeholders</pre>
    <post>prompt is rendered with glossary terms substituted in priority order where last loaded glossary wins on key collision</post>
    <step n="1">system loads the agent configuration and reads the glossaries resource URI list</step>
    <step n="2">system fetches each glossary by its resource URI in list order and builds a combined terms map where last loaded glossary wins on key collision</step>
    <step n="3">system scans the prompt template for glossary placeholders and replaces matched ones with term values</step>
    <step n="4">system renders the prompt with substituted terms</step>
    <ext id="2a" error="none" outcome="prompt rendering fails because a bound glossary no longer exists"/>
    <ext id="3a" error="none" outcome="prompt is rendered with unmatched placeholders left unresolved"/>
  </usecase>

  <usecase id="UC7" actor="operator" goal="export glossaries in agent ZIP archive">
    <pre>agent has glossaries bound in its configuration</pre>
    <post>all bound glossaries are exported as JSON files into the agent ZIP archive</post>
    <step n="1">operator triggers the agent export via existing agent REST</step>
    <step n="2">system generates id.glossary.json and id.descriptor.json for each bound glossary</step>
    <step n="3">system places the glossary JSON files into the agent ZIP archive</step>
  </usecase>

  <usecase id="UC8" actor="operator" goal="import glossaries from agent ZIP archive">
    <pre>agent ZIP archive contains glossary JSON files</pre>
    <post>new glossaries are created and existing ones are upgraded from the ZIP archive</post>
    <step n="1">operator triggers the agent import via existing agent REST</step>
    <step n="2">system extracts glossary JSON files from the ZIP archive and writes new glossaries</step>
    <step n="3">system merges glossaries by resource URI with new version winning over existing</step>
  </usecase>


  <usecase id="UC10" actor="operator" goal="bind glossaries to an agent">
    <pre>agent exists and glossaries referenced in the list exist</pre>
    <post>glossary list is saved in the agent configuration</post>
    <step n="1">operator updates the agent configuration with a list of glossary resource URIs via the existing agent REST endpoint</step>
    <step n="2">system validates that all referenced glossary URIs exist and saves the configuration</step>
    <ext id="2a" error="none" outcome="configuration update is rejected because a referenced glossary does not exist"/>
  </usecase>

</frd>
$END_CONTENT

$START_DOCUMENT
CANDIDATES — computed by script: each use case step × the repository map (a module's role,
its api names, its file name; neighbours over import edges). The same table judges your answer.
`via` names the edge source when a module is a candidate by NEIGHBOURHOOD, not by its own words.
`DISPUTED` — the top scores tie: the choice is the operator's, not yours.
A step with no candidates is a NEW module: owner with new="yes" — but first look twice at the
analogue block below: the analogue already performs this function somewhere.
$END_DOCUMENT
$START_CONTENT
(скрипт кандидатов не нашёл — каждый шаг вопрос или new=yes)
$END_CONTENT

$START_DOCUMENT
THE ANALOGUE BLUEPRINT — the connected core of the analogue's files, with roles and calls.
This is the ARCHITECTURE your new modules mirror: a new configuration type here has the same
layering as the blueprint shows (model, store interface, REST interface, implementations).
When a step names a module «same as X» / «after X» — X is the PATTERN, not the owner: the work
belongs to a NEW module of this change built after that pattern, or to a module the candidates
name. A module that only appears as a pattern is not an owner.
$END_DOCUMENT
$START_CONTENT
src/main/java/ai/labs/eddi/backup/IResourceSource.java — Interface defining data-source contracts for backup reads of agents, workflows, snippets, and extensions, with nested record types → зовёт: PromptSnippet.java
src/main/java/ai/labs/eddi/configs/snippets/model/PromptSnippet.java — Data model class for prompt snippet configuration entities
src/main/java/ai/labs/eddi/backup/impl/RemoteApiResourceSource.java — Reads agent resource data from a remote EDDI instance REST API via HttpClient, producing IResourceSource records for the import pipeline → зовёт: IResourceSource.java, PromptSnippet.java
src/main/java/ai/labs/eddi/backup/impl/RestExportService.java — JAX-RS CDI service for exporting agents and their resources as ZIP archives, with preview and selective export capabilities → зовёт: IPromptSnippetStore.java, PromptSnippet.java
src/main/java/ai/labs/eddi/configs/snippets/IPromptSnippetStore.java — Persistence interface defining CRUD operations for prompt snippets → зовёт: PromptSnippet.java
src/main/java/ai/labs/eddi/backup/impl/RestImportService.java — JAX-RS CDI service for importing agents from ZIP archives, supporting initial agent import, preview, merge, and upgrade strategies → зовёт: IRestPromptSnippetStore.java, PromptSnippet.java, StructuralMatcher.java, UpgradeExecutor.java, ZipResourceSource.java, RemoteApiResourceSource.java
src/main/java/ai/labs/eddi/configs/snippets/IRestPromptSnippetStore.java — JAX-RS interface defining REST endpoints for prompt snippet management → зовёт: PromptSnippet.java
src/main/java/ai/labs/eddi/backup/impl/StructuralMatcher.java — CDI bean that matches source resources against a target agent's resource tree by structural position and type, producing ImportPreview with content diffs → зовёт: IResourceSource.java, IRestPromptSnippetStore.java, PromptSnippet.java
src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java — CDI bean that executes an upgrade by syncing source content into existing target agent resources, creating new versions → зовёт: IResourceSource.java, IRestPromptSnippetStore.java, StructuralMatcher.java
src/main/java/ai/labs/eddi/backup/impl/ZipResourceSource.java — reads agent, workflow, and snippet backup data from an unzipped ZIP directory, implementing IResourceSource for restore operations → зовёт: IResourceSource.java, PromptSnippet.java
src/main/java/ai/labs/eddi/configs/snippets/mongo/PromptSnippetStore.java — CDI-scoped MongoDB-backed implementation of prompt snippet persistence → зовёт: IPromptSnippetStore.java, PromptSnippet.java
src/main/java/ai/labs/eddi/configs/snippets/rest/RestPromptSnippetStore.java — CDI-scoped REST resource implementation delegating to persistence layer for prompt snippet CRUD → зовёт: IPromptSnippetStore.java, IRestPromptSnippetStore.java, PromptSnippet.java, PromptSnippetService.java
src/main/java/ai/labs/eddi/modules/llm/impl/PromptSnippetService.java — CDI @ApplicationScoped service that loads, caches (Caffeine), and serves prompt snippets with template marker escaping and cache invalidation → зовёт: IPromptSnippetStore.java, PromptSnippet.java
src/main/java/ai/labs/eddi/engine/memory/MemoryItemConverter.java — CDI bean implementing IMemoryItemConverter to transform conversation memory into a flat Map of data objects (snippets, vars, context, info) → зовёт: PromptSnippetService.java
src/main/java/ai/labs/eddi/modules/llm/impl/CounterweightService.java — CDI application-scoped service that applies counterweight safety configurations to LLM system messages using prompt snippets, with activation-level metrics trac → зовёт: PromptSnippetService.java
src/main/java/ai/labs/eddi/modules/llm/impl/LlmTask.java — CDI ApplicationScoped lifecycle task that executes LLM chat model calls within the conversation workflow, building prompts from templates, managing conversation → зовёт: PromptSnippetService.java, CounterweightService.java
src/main/java/ai/labs/eddi/modules/templating/rest/RestTemplatePreview.java — CDI bean implementing the template preview service — resolves Qute templates against real conversation memory or built-in sample data, injecting prompt snippets → зовёт: PromptSnippetService.java
src/test/java/ai/labs/eddi/backup/impl/RemoteApiResourceSourceDeepCoverageTest.java → зовёт: PromptSnippet.java, RemoteApiResourceSource.java
src/test/java/ai/labs/eddi/backup/impl/RemoteApiResourceSourceExtendedTest.java → зовёт: IResourceSource.java, PromptSnippet.java, RemoteApiResourceSource.java
src/test/java/ai/labs/eddi/backup/impl/RemoteApiResourceSourceMissedBranchTest.java → зовёт: PromptSnippet.java, RemoteApiResourceSource.java
src/test/java/ai/labs/eddi/backup/impl/RemoteApiResourceSourceTest.java → зовёт: PromptSnippet.java, RemoteApiResourceSource.java
src/test/java/ai/labs/eddi/backup/impl/RestExportServiceBranchTest.java → зовёт: IPromptSnippetStore.java, RestExportService.java
src/test/java/ai/labs/eddi/backup/impl/RestExportServiceCleanupTest.java → зовёт: IPromptSnippetStore.java, RestExportService.java
src/test/java/ai/labs/eddi/backup/impl/RestExportServiceExtendedBranchTest.java → зовёт: IPromptSnippetStore.java, PromptSnippet.java, RestExportService.java
src/test/java/ai/labs/eddi/backup/impl/RestExportServiceExtendedTest.java → зовёт: IPromptSnippetStore.java, RestExportService.java
src/test/java/ai/labs/eddi/backup/impl/RestExportServiceTest.java → зовёт: IPromptSnippetStore.java, RestExportService.java
src/test/java/ai/labs/eddi/backup/impl/RestImportServiceExtendedTest.java → зовёт: StructuralMatcher.java, UpgradeExecutor.java, RestImportService.java
src/test/java/ai/labs/eddi/backup/impl/StructuralMatcherExtendedBranchTest.java → зовёт: IResourceSource.java, IRestPromptSnippetStore.java, PromptSnippet.java, StructuralMatcher.java
src/test/java/ai/labs/eddi/backup/impl/StructuralMatcherTest.java → зовёт: IResourceSource.java, IRestPromptSnippetStore.java, StructuralMatcher.java
src/test/java/ai/labs/eddi/backup/impl/StructuralMatcherTypedExtensionTest.java → зовёт: IResourceSource.java, IRestPromptSnippetStore.java, StructuralMatcher.java
src/test/java/ai/labs/eddi/backup/impl/UpgradeExecutorTest.java → зовёт: IResourceSource.java, IRestPromptSnippetStore.java, PromptSnippet.java, StructuralMatcher.java, UpgradeExecutor.java
src/test/java/ai/labs/eddi/backup/impl/ZipResourceSourceDeepCoverageTest.java → зовёт: PromptSnippet.java, ZipResourceSource.java
src/test/java/ai/labs/eddi/backup/impl/ZipResourceSourceExtendedTest.java → зовёт: PromptSnippet.java, ZipResourceSource.java
src/test/java/ai/labs/eddi/backup/impl/ZipResourceSourceTest.java → зовёт: IResourceSource.java, ZipResourceSource.java
рёбра ядра: IResourceSource.java → PromptSnippet.java; RemoteApiResourceSource.java → IResourceSource.java; RemoteApiResourceSource.java → PromptSnippet.java; RestExportService.java → IPromptSnippetStore.java; RestExportService.java → PromptSnippet.java; RestImportService.java → IRestPromptSnippetStore.java
$END_CONTENT

$START_DOCUMENT
TYPES THE REPOSITORY DECLARES — name · path · kind. New modules follow the naming convention
visible here; a type name is copied, not invented.
$END_DOCUMENT
$START_CONTENT
IResourceSource · src/main/java/ai/labs/eddi/backup/IResourceSource.java · interface
readAgent() · src/main/java/ai/labs/eddi/backup/IResourceSource.java · method
readWorkflows() · src/main/java/ai/labs/eddi/backup/IResourceSource.java · method
readSnippets() · src/main/java/ai/labs/eddi/backup/IResourceSource.java · method
close() · src/main/java/ai/labs/eddi/backup/IResourceSource.java · method
IRestExportService · src/main/java/ai/labs/eddi/backup/IRestExportService.java · interface
getAgentZipArchive(@PathParam("agentFilename") · src/main/java/ai/labs/eddi/backup/IRestExportService.java · method
exportAgent(@PathParam("agentId") · src/main/java/ai/labs/eddi/backup/IRestExportService.java · method
previewExport(@PathParam("agentId") · src/main/java/ai/labs/eddi/backup/IRestExportService.java · method
IRestImportService · src/main/java/ai/labs/eddi/backup/IRestImportService.java · interface
importInitialAgents() · src/main/java/ai/labs/eddi/backup/IRestImportService.java · method
listRemoteAgents(@QueryParam("sourceUrl") · src/main/java/ai/labs/eddi/backup/IRestImportService.java · method
previewSync(@QueryParam("sourceUrl") · src/main/java/ai/labs/eddi/backup/IRestImportService.java · method
previewSyncBatch(@QueryParam("sourceUrl") · src/main/java/ai/labs/eddi/backup/IRestImportService.java · method
executeSync(@QueryParam("sourceUrl") · src/main/java/ai/labs/eddi/backup/IRestImportService.java · method
executeSyncBatch(@QueryParam("sourceUrl") · src/main/java/ai/labs/eddi/backup/IRestImportService.java · method
IZipArchive · src/main/java/ai/labs/eddi/backup/IZipArchive.java · interface
createZip(String sourceDirPath, String targetZipPath) · src/main/java/ai/labs/eddi/backup/IZipArchive.java · method
createZip(String sourceDirPath, String targetZipPath, java.nio.file.Path allowedBaseDir) · src/main/java/ai/labs/eddi/backup/IZipArchive.java · method
unzip(InputStream zipFile, File targetDir) · src/main/java/ai/labs/eddi/backup/IZipArchive.java · method
CallbackMatcher · src/main/java/ai/labs/eddi/backup/impl/CallbackMatcher.java · class
Callback · src/main/java/ai/labs/eddi/backup/impl/CallbackMatcher.java · interface
CallbackMatcherException · src/main/java/ai/labs/eddi/backup/impl/CallbackMatcher.java · class
foundMatch(MatchResult matchResult) · src/main/java/ai/labs/eddi/backup/impl/CallbackMatcher.java · method
CallbackMatcher(Pattern regex) · src/main/java/ai/labs/eddi/backup/impl/CallbackMatcher.java · method
replaceMatches(CharSequence charSequence, Callback callback) · src/main/java/ai/labs/eddi/backup/impl/CallbackMatcher.java · method
CallbackMatcherException(String message, Throwable cause) · src/main/java/ai/labs/eddi/backup/impl/CallbackMatcher.java · method
RemoteApiResourceSource · src/main/java/ai/labs/eddi/backup/impl/RemoteApiResourceSource.java · class
readAgent() · src/main/java/ai/labs/eddi/backup/impl/RemoteApiResourceSource.java · method
readWorkflows() · src/main/java/ai/labs/eddi/backup/impl/RemoteApiResourceSource.java · method
readSnippets() · src/main/java/ai/labs/eddi/backup/impl/RemoteApiResourceSource.java · method
RestExportService · src/main/java/ai/labs/eddi/backup/impl/RestExportService.java · class
getAgentZipArchive(String agentFilename) · src/main/java/ai/labs/eddi/backup/impl/RestExportService.java · method
exportAgent(String agentId, Integer agentVersion, String selectedResourceIds) · src/main/java/ai/labs/eddi/backup/impl/RestExportService.java · method
previewExport(String agentId, Integer agentVersion) · src/main/java/ai/labs/eddi/backup/impl/RestExportService.java · method
RestImportService · src/main/java/ai/labs/eddi/backup/impl/RestImportService.java · class
importInitialAgents() · src/main/java/ai/labs/eddi/backup/impl/RestImportService.java · method
previewImport(InputStream zippedAgentConfigFiles, String targetAgentId) · src/main/java/ai/labs/eddi/backup/impl/RestImportService.java · method
create(List<T> configs, ImportTransaction transaction) · src/main/java/ai/labs/eddi/backup/impl/RestImportService.java · method
update(T config, String localId, Integer localVersion, ImportTransaction transaction) · src/main/java/ai/labs/eddi/backup/impl/RestImportService.java · method
listRemoteAgents(String sourceUrl, String sourceAuth) · src/main/java/ai/labs/eddi/backup/impl/RestImportService.java · method
previewSyncBatch(String sourceUrl, List<SyncMapping> mappings, String sourceAuth) · src/main/java/ai/labs/eddi/backup/impl/RestImportService.java · method
executeSyncBatch(String sourceUrl, List<SyncRequest> requests, String sourceAuth) · src/main/java/ai/labs/eddi/backup/impl/RestImportService.java · method
SourceUrlValidator · src/main/java/ai/labs/eddi/backup/impl/SourceUrlValidator.java · class
validate(String sourceUrl, boolean allowHttp) · src/main/java/ai/labs/eddi/backup/impl/SourceUrlValidator.java · method
StructuralMatcher · src/main/java/ai/labs/eddi/backup/impl/StructuralMatcher.java · class
UpgradeExecutor · src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java · class
ZipArchive · src/main/java/ai/labs/eddi/backup/impl/ZipArchive.java · class
createZip(String sourceDirPath, String targetZipPath) · src/main/java/ai/labs/eddi/backup/impl/ZipArchive.java · method
createZip(String sourceDirPath, String targetZipPath, Path allowedBaseDir) · src/main/java/ai/labs/eddi/backup/impl/ZipArchive.java · method
unzip(InputStream zipFile, File targetDir) · src/main/java/ai/labs/eddi/backup/impl/ZipArchive.java · method
ZipResourceSource · src/main/java/ai/labs/eddi/backup/impl/ZipResourceSource.java · class
ZipResourceSource(Path unzippedDirectory, IJsonSerialization jsonSerialization) · src/main/java/ai/labs/eddi/backup/impl/ZipResourceSource.java · method
readAgent() · src/main/java/ai/labs/eddi/backup/impl/ZipResourceSource.java · method
readWorkflows() · src/main/java/ai/labs/eddi/backup/impl/ZipResourceSource.java · method
readSnippets() · src/main/java/ai/labs/eddi/backup/impl/ZipResourceSource.java · method
close() · src/main/java/ai/labs/eddi/backup/impl/ZipResourceSource.java · method
ExportPreview · src/main/java/ai/labs/eddi/backup/model/ExportPreview.java · record
ExportableResource · src/main/java/ai/labs/eddi/backup/model/ExportPreview.java · record
ImportPreview · src/main/java/ai/labs/eddi/backup/model/ImportPreview.java · record
ResourceDiff · src/main/java/ai/labs/eddi/backup/model/ImportPreview.java · record
DiffAction · src/main/java/ai/labs/eddi/backup/model/ImportPreview.java · enum
SyncMapping · src/main/java/ai/labs/eddi/backup/model/SyncMapping.java · record
SyncRequest · src/main/java/ai/labs/eddi/backup/model/SyncRequest.java · record
IRestVersionInfo · src/main/java/ai/labs/eddi/configs/IRestVersionInfo.java · interface
redirectToLatestVersion(@PathParam("id") · src/main/java/ai/labs/eddi/configs/IRestVersionInfo.java · method
sneakyThrow(e) · src/main/java/ai/labs/eddi/configs/IRestVersionInfo.java · method
getCurrentVersion(@PathParam("id") · src/main/java/ai/labs/eddi/configs/IRestVersionInfo.java · method
sneakyThrow(e) · src/main/java/ai/labs/eddi/configs/IRestVersionInfo.java · method
getResourceURI() · src/main/java/ai/labs/eddi/configs/IRestVersionInfo.java · method
getCurrentResourceId(String id) · src/main/java/ai/labs/eddi/configs/IRestVersionInfo.java · method
OpenApiConfig · src/main/java/ai/labs/eddi/configs/OpenApiConfig.java · class
OpenApiTagSortFilter · src/main/java/ai/labs/eddi/configs/OpenApiTagSortFilter.java · class
filterOpenAPI(OpenAPI openAPI) · src/main/java/ai/labs/eddi/configs/OpenApiTagSortFilter.java · method
IRestOrphanAdmin · src/main/java/ai/labs/eddi/configs/admin/IRestOrphanAdmin.java · interface
OrphanInfo · src/main/java/ai/labs/eddi/configs/admin/model/OrphanInfo.java · class
OrphanInfo() · src/main/java/ai/labs/eddi/configs/admin/model/OrphanInfo.java · method
OrphanInfo(URI resourceUri, String type, String name, boolean deleted) · src/main/java/ai/labs/eddi/configs/admin/model/OrphanInfo.java · method
getResourceUri() · src/main/java/ai/labs/eddi/configs/admin/model/OrphanInfo.java · method
setResourceUri(URI resourceUri) · src/main/java/ai/labs/eddi/configs/admin/model/OrphanInfo.java · method
$END_CONTENT

$START_DOCUMENT
THE ANALOGUE — functions, not structure: which analogue file a step's function already lives in.
A function the analogue already performs must be inherited by an owner IN ITS OWN HOME (that
file or its neighbourhood), or explained by a question. A new module for a function the
repository already has is the most expensive mistake of this pass.
$END_DOCUMENT
$START_CONTENT
(аналог не сопоставился ни с одним шагом)
$END_CONTENT
$END_DATA

$START_CONSTRAINTS
- THIS PASS WRITES THREE THINGS: `<owner>` and `<question>` into the artifact, AND the
  traceability matrix row into `.agent/rtm.md`: one line per requirement —
  `R3 | owners: path/A.java, new/B.java(new, after=path/C.java) | questions: …`.
  The matrix is judged BOTH ways (coverage substep): a requirement without an owner is LOST work;
  an owner without a requirement is INVENTED work. The blueprint's layer mirrors, the wiring
  callers, and the cluster neighbours all land in the matrix here.
- Every step gets EXACTLY ONE of: an `<owner step="UC1/2" node="path"/>`, an owner with
  `new="yes"` (the file is created by this change), or a `<question step="UC1/2" …/>`.
- `node` is copied from the candidates verbatim, or is a new path with `new="yes"`.
  Never invent a path that exists — check the candidates first.
- One module may own many steps. A step's owner list is ONE module; if two must share a step,
  that is a DISPUTE — ask.
- A `DISPUTED` step without a `<question>` is a refusal: the tie is the operator's decision.
- When the artifact carries `<question>` and ANSWERED holds the operator's replies: replace
  every answered question with its `<owner>` — the answer names the module. A question with no
  answer yet stays a question.
- Questions are ONE batch, each naming the step(s) and the tied candidates; one question
  may cover the steps of ONE dispute: step="UC5/1 UC5/2 UC5/3".
- TWO-FILTER QUESTION TRIAGE — a question must DIE at one of the filters before it reaches
  the operator: (1) can the map, the TYPES table or the blueprint answer it? → answer it
  yourself from the order, it is not a question; (2) is there a defensible default? → ADOPT
  it and RECORD it in .agent/assumptions.md, one line per adoption:
      assumption: <what was unclear> | default: <what you chose> | rationale: <why defensible> | reversible: yes/no
  Only what survives both filters is a question: a decision the OWNER must make — a trade-off,
  an irreversible choice, a policy the requirement does not settle. Every question names its
  candidates and a recommended answer.
- ATTRIBUTE VALUES ARE PLAIN WORDS: no `<`, no `>`, no `&` inside a value — a value carrying
  `<` is not read at all, the element disappears, and the check says MISSING for what you wrote.

      WRONG   subject="глоссарий как <code>{glossary.x}</code> в промпте"
      RIGHT   subject="глоссарий как glossary.x в промпте"

  Name a code fragment in words. If you must show one, write it without angle brackets.
$END_CONSTRAINTS

$START_PREVIOUS
$START_DOCUMENT
path: .agent/staging/frd~owners.xml
THE ARTIFACT AS IT STANDS. Layers already closed: scenarios.
$END_DOCUMENT
$START_CONTENT
<frd grammar="1" goal="add Glossary as a new configuration type for bot term dictionaries with CRUD, versioning, substitution, export/import and agent binding">

  <actor name="operator" kind="human" via="HTTP REST /glossarystore/glossaries"/>
  <actor name="rendering-system" kind="system" via="internal GlossaryService"/>

  <usecase id="UC1" actor="operator" goal="create a glossary">
    <pre>operator is authenticated</pre>
    <post>glossary is stored with system-generated id and version 1</post>
    <step n="1">operator sends POST to /glossarystore/glossaries with terms array in the request body</step>
    <step n="2">system validates every term key against the format rules and assigns a system-generated id</step>
    <step n="3">system stores the glossary with version 1 and returns 201 with Location header containing the id</step>
    <ext id="1a" error="none" outcome="glossary creation is rejected, no glossary is stored"/>
    <ext id="2a" error="none" outcome="glossary creation is rejected because one or more term keys are invalid"/>
  </usecase>

  <usecase id="UC2" actor="operator" goal="read one glossary">
    <pre>glossary exists in the system</pre>
    <post>requested glossary is returned with all its terms</post>
    <step n="1">operator sends GET to /glossarystore/glossaries/{id}</step>
    <step n="2">system retrieves the glossary and returns it with its terms, id and version</step>
    <ext id="2a" error="none" outcome="glossary is not returned, absence response is given"/>
  </usecase>

  <usecase id="UC3" actor="operator" goal="list all glossaries">
    <pre>operator is authenticated</pre>
    <post>list of all glossaries is returned</post>
    <step n="1">operator sends GET to /glossarystore/glossaries</step>
    <step n="2">system retrieves all glossaries and returns the list with id, version and terms for each</step>
  </usecase>

  <usecase id="UC4" actor="operator" goal="update a glossary">
    <pre>glossary exists in the system</pre>
    <post>new version of the glossary is stored with updated terms</post>
    <step n="1">operator sends PUT to /glossarystore/glossaries/{id} with new terms array</step>
    <step n="2">system validates every term key against the format rules</step>
    <step n="3">system creates a new version of the glossary and returns 200</step>
    <ext id="2a" error="none" outcome="update is rejected because one or more term keys are invalid, existing version remains unchanged"/>
    <ext id="3a" error="none" outcome="new version is not created, existing version remains unchanged"/>
  </usecase>

  <usecase id="UC5" actor="operator" goal="delete a glossary">
    <pre>glossary exists in the system</pre>
    <post>glossary is removed from the system</post>
    <step n="1">operator sends DELETE to /glossarystore/glossaries/{id}</step>
    <step n="2">system removes the glossary and returns 204</step>
    <ext id="1a" error="none" outcome="glossary is not found, absence response is given"/>
  </usecase>

  <usecase id="UC6" actor="rendering-system" goal="substitute glossary terms in a prompt">
    <pre>agent has glossaries bound in its configuration and prompt template contains glossary placeholders</pre>
    <post>prompt is rendered with glossary terms substituted in priority order where last loaded glossary wins on key collision</post>
    <step n="1">system loads the agent configuration and reads the glossaries resource URI list</step>
    <step n="2">system fetches each glossary by its resource URI in list order and builds a combined terms map where last loaded glossary wins on key collision</step>
    <step n="3">system scans the prompt template for glossary placeholders and replaces matched ones with term values</step>
    <step n="4">system renders the prompt with substituted terms</step>
    <ext id="2a" error="none" outcome="prompt rendering fails because a bound glossary no longer exists"/>
    <ext id="3a" error="none" outcome="prompt is rendered with unmatched placeholders left unresolved"/>
  </usecase>

  <usecase id="UC7" actor="operator" goal="export glossaries in agent ZIP archive">
    <pre>agent has glossaries bound in its configuration</pre>
    <post>all bound glossaries are exported as JSON files into the agent ZIP archive</post>
    <step n="1">operator triggers the agent export via existing agent REST</step>
    <step n="2">system generates id.glossary.json and id.descriptor.json for each bound glossary</step>
    <step n="3">system places the glossary JSON files into the agent ZIP archive</step>
  </usecase>

  <usecase id="UC8" actor="operator" goal="import glossaries from agent ZIP archive">
    <pre>agent ZIP archive contains glossary JSON files</pre>
    <post>new glossaries are created and existing ones are upgraded from the ZIP archive</post>
    <step n="1">operator triggers the agent import via existing agent REST</step>
    <step n="2">system extracts glossary JSON files from the ZIP archive and writes new glossaries</step>
    <step n="3">system merges glossaries by resource URI with new version winning over existing</step>
  </usecase>


  <usecase id="UC10" actor="operator" goal="bind glossaries to an agent">
    <pre>agent exists and glossaries referenced in the list exist</pre>
    <post>glossary list is saved in the agent configuration</post>
    <step n="1">operator updates the agent configuration with a list of glossary resource URIs via the existing agent REST endpoint</step>
    <step n="2">system validates that all referenced glossary URIs exist and saves the configuration</step>
    <ext id="2a" error="none" outcome="configuration update is rejected because a referenced glossary does not exist"/>
  </usecase>

</frd>
$END_CONTENT
$END_PREVIOUS

$START_ANSWERED
1. Список URI glossaries в самой модели конфига агента (AgentConfiguration), правится штатным агентным REST. Отдельного эндпоинта и UI не заводить; порядок списка = приоритет.
2. ID генерирует система. Оператор его не передаёт: тело POST только terms, готовый id приходит в Location заголовке.
1. Владельцы привязки: штатный агентный REST RestAgentStore (существующий) + поле glossaries в модели AgentConfiguration (её тоже объяви владельцем шагов поля). Отдельного эндпоинта не заводить.
2. Новый GlossaryService — читает ссылки глоссариев из конфига агента через агентный стор, по образцу PromptSnippetService.
3. Новый GlossaryService — коллизия ключей: порядок списка glossaries в AgentConfiguration и есть приоритет, последний побеждает.
4. RestExportService — генерирует {id}.glossary.json + {id}.descriptor.json и кладёт в ZIP агента; механизм файлов из AbstractBackupService.
5. RestImportService — извлечение из ZIP и первичная запись; UpgradeExecutor — merge по resource URI и upgrade существующего (новая версия побеждает).
$END_ANSWERED

$START_FEEDBACK
Evidence of the last failed check (empty = first attempt).
COUNT THE LINES AND CLOSE THEM ALL: F17a — a step without owner/question; F17b — a node that
does not exist and is not new; F17c — a disputed step without a question; F17d — an analogue
function nobody inherited nor explained.
- A line starting with a RULE CODE (F17…) — the artifact's FORM is broken. Fix the named
  element, touch nothing else.
- A line starting with `critic:` — step 11 read this FRD against `TASK.md` and `brd.md`. The form
  is intact; the CONTENT does not add up. THE CODE DECIDES THE REPAIR, and your ROLE names the
  repair of every code. Deleting the named element repairs nothing.
$START_CONTENT

$END_CONTENT
$END_FEEDBACK

$START_SELFCHECK
Before writing the file, list:

1. Count of use case steps, count of owners, count of questions. owners + questions = steps.
2. Every owner node — present in the candidates table (which row), or `new="yes"`.
3. Every DISPUTED step — has a question naming the tied candidates.
4. The analogue block — every function with a step match is an owner or has a question.

If the list matches — write the file. If it does not — fix the artifact, not the list.
$END_SELFCHECK

$START_OUTPUT
path: TWO files in this pass:
  .agent/staging/frd~owners.xml — the elements YOU add, into the file that already carries the use cases:
    <owner step="UC1/2" node="path from the candidates"/>
    <owner step="UC1/2" node="new/path/Module.java" new="yes" after="blueprint/path/of/pattern"/>
    <question step="UC7/1" subject="…" why="…"/>
  .agent/rtm.md — REWRITE the whole file, one line per requirement of brd.md, in order:
    R1 | owners: src/A.java, src/new/B.java(new, after=blueprint/P.java) | questions: спорный-вопрос
    R2 | owners: src/C.java
    (owners column: every module that carries this requirement — existing path, or new path with
    (new, after=<blueprint pattern>); questions column: open operator questions for this row)
check: the script judges the file you write at .agent/staging/frd~owners.xml by the FRD guardrail for pass owners
return: call workflow_result according to the OUTPUT_FORMAT of your ROLE
