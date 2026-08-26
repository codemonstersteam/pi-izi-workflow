$START_TASK
Map cell src~main~java~ai~labs~eddi~modules~llm~impl~AgentOrchestrator.java of this repository: one `<module>` per file, one `<gap>` per file that is genuinely
unreadable, what each module IS, what it EXPOSES and what it reaches OUTSIDE this repository.
Edges are already computed — you do not write them.
$END_TASK

$START_DATA
$START_DOCUMENT
files of cell src~main~java~ai~labs~eddi~modules~llm~impl~AgentOrchestrator.java — the whole world of this run: these paths, and only these.

Each file appears as a DIGEST, not as its text: size and language, `package`, the imports a script
resolved inside this repository, the routes and drivers it read out of annotations and imports, then
one line per declaration (`+` public, `-` internal). Lines marked `(computed)` are facts — use them,
do not restate them.

Paths are relative to the run's root, and you are already in it. Copy them verbatim from the list;
never prefix them with a directory of your own.
$END_DOCUMENT
$START_CONTENT
- src/main/java/ai/labs/eddi/modules/llm/impl/AgentOrchestrator.java (145419 b · java)
    package ai.labs.eddi.modules.llm.impl
    imports (computed): src/main/java/ai/labs/eddi/configs/agents/model/AgentConfiguration.java · src/main/java/ai/labs/eddi/configs/agents/IAgentStore.java · src/main/java/ai/labs/eddi/configs/deployment/IDeploymentStore.java · src/main/java/ai/labs/eddi/configs/agents/IRestAgentStore.java · src/main/java/ai/labs/eddi/configs/agents/CapabilityRegistryService.java · src/main/java/ai/labs/eddi/configs/apicalls/model/ApiCall.java · src/main/java/ai/labs/eddi/configs/apicalls/model/ApiCallsConfiguration.java · src/main/java/ai/labs/eddi/configs/groups/model/AgentGroupConfiguration.java · src/main/java/ai/labs/eddi/configs/hitl/model/ToolApprovalsConfig.java · src/main/java/ai/labs/eddi/configs/mcpcalls/model/McpCallsConfiguration.java · src/main/java/ai/labs/eddi/engine/hitl/tools/ChatTranscriptCodec.java · src/main/java/ai/labs/eddi/engine/hitl/tools/IHitlToolJournalStore.java · src/main/java/ai/labs/eddi/engine/hitl/tools/ToolApprovalGate.java · src/main/java/ai/labs/eddi/engine/hitl/tools/ToolApprovalRequiredException.java · src/main/java/ai/labs/eddi/engine/lifecycle/model/ToolCallDecision.java · src/main/java/ai/labs/eddi/engine/memory/model/Data.java · src/main/java/ai/labs/eddi/engine/memory/model/PendingToolCallBatch.java · src/main/java/ai/labs/eddi/secrets/sanitize/SecretRedactionFilter.java · src/main/java/ai/labs/eddi/datastore/serialization/IJsonSerialization.java · src/main/java/ai/labs/eddi/configs/properties/IUserMemoryStore.java · src/main/java/ai/labs/eddi/configs/properties/model/Property.java · src/main/java/ai/labs/eddi/engine/api/IConversationService.java · src/main/java/ai/labs/eddi/engine/lifecycle/exceptions/LifecycleException.java · src/main/java/ai/labs/eddi/engine/attachments/IAttachmentStore.java · src/main/java/ai/labs/eddi/engine/lifecycle/model/HitlDecision.java · src/main/java/ai/labs/eddi/engine/memory/AttachmentContextExtractor.java · src/main/java/ai/labs/eddi/engine/memory/IConversationMemory.java · src/main/java/ai/labs/eddi/engine/memory/IData.java · src/main/java/ai/labs/eddi/engine/model/Context.java · src/main/java/ai/labs/eddi/engine/memory/IMemoryItemConverter.java · src/main/java/ai/labs/eddi/engine/memory/MemoryKeys.java · src/main/java/ai/labs/eddi/engine/memory/MemorySnapshotService.java · src/main/java/ai/labs/eddi/engine/runtime/IAgentFactory.java · src/main/java/ai/labs/eddi/engine/runtime/client/configuration/IResourceClientLibrary.java · src/main/java/ai/labs/eddi/engine/setup/AgentSetupService.java · src/main/java/ai/labs/eddi/modules/apicalls/impl/IApiCallExecutor.java · src/main/java/ai/labs/eddi/modules/llm/capability/JsonResponseFormatPolicy.java · src/main/java/ai/labs/eddi/modules/llm/model/LlmConfiguration.java · src/main/java/ai/labs/eddi/modules/llm/tools/ToolCacheService.java · src/main/java/ai/labs/eddi/modules/llm/tools/ToolCostTracker.java · src/main/java/ai/labs/eddi/modules/llm/tools/ToolExecutionService.java · src/main/java/ai/labs/eddi/modules/llm/tools/ToolInvocation.java · src/main/java/ai/labs/eddi/modules/llm/tools/ToolNameResolver.java · src/main/java/ai/labs/eddi/modules/llm/tools/UserMemoryTool.java · src/main/java/ai/labs/eddi/modules/llm/tools/ConversationRecallTool.java · src/main/java/ai/labs/eddi/modules/llm/tools/CreateSubAgentTool.java · src/main/java/ai/labs/eddi/modules/llm/tools/ConverseWithAgentTool.java · src/main/java/ai/labs/eddi/modules/llm/tools/FindAgentsByCapabilityTool.java · src/main/java/ai/labs/eddi/modules/llm/tools/TeardownAgentTool.java · src/main/java/ai/labs/eddi/utils/LogSanitizer.java · src/main/java/ai/labs/eddi/engine/tenancy/TenantQuotaService.java · src/main/java/ai/labs/eddi/utils/RuntimeUtilities.java · src/main/java/ai/labs/eddi/modules/llm/impl/McpToolProviderManager.java · src/main/java/ai/labs/eddi/modules/llm/impl/A2AToolProviderManager.java · src/main/java/ai/labs/eddi/modules/llm/impl/ToolResponseTruncator.java · src/main/java/ai/labs/eddi/modules/llm/impl/ConversationHistoryBuilder.java · src/main/java/ai/labs/eddi/modules/llm/impl/TokenCounterFactory.java · src/main/java/ai/labs/eddi/modules/llm/impl/AgentExecutionHelper.java · src/main/java/ai/labs/eddi/modules/llm/impl/LlmTask.java · src/main/java/ai/labs/eddi/modules/llm/impl/ConversationSummarizer.java · src/main/java/ai/labs/eddi/modules/llm/impl/WorkflowTraversal.java
    - @ApplicationScoped class AgentOrchestrator
    - record ExecutionResult
    - record ToolSetup
    - record HttpCallToolsResult
    - private static boolean resolveBudgetEnforceDefault()
    - private static void warnAboutUnenforcedBudgets(LlmConfiguration.Task task)
    - void setAttachmentServices(IAttachmentStore attachmentStore, AttachmentTextExtractor attachmentTextExtractor)
    - private static List<ToolSpecification> restoreActiveSpecs(ToolSetup setup, boolean isLazy, List<String> activatedToolNames)
    - private static AiMessage normalizeToolCallIds(AiMessage aiMessage, ToolApprovalsConfig effectiveToolApprovals)
    - private static ToolExecutionRequest rebuiltRequest(PendingToolCallBatch.PendingToolCall c)
    - private static ToolExecutionRequest rebuiltRequest(PendingToolCallBatch.PendingToolCall c, String args)
    - private String rejectionEnvelope(String toolName, String note)
    - private String amendedEnvelope(String result)
    - private static String toJson(Object value)
    - void auditOutcomeUnknown(IConversationMemory memory, PendingToolCallBatch.PendingToolCall c)
    - ToolSetup buildToolSetup(LlmConfiguration.Task task, IConversationMemory memory)
    - private static List<ToolSpecification> computeInitialActiveSpecs(ToolSetup setup, boolean isLazy)
    - private double conversationToolCost(String conversationId)
    - private double toolCostDelta(String conversationId, double costBefore)
    - i, activatedToolNames(isLazy, activeSpecs)
    - private TokenCountEstimator resolveToolContextEstimator(LlmConfiguration.Task task)
    - private static List<int[]> findToolExchanges(List<ChatMessage> messages)
    - private static int tokensOf(ChatMessage message, TokenCountEstimator estimator, Map<ChatMessage, Integer> memo)
    - static TokenUsage sumTokens(TokenUsage a, TokenUsage b)
    - static Integer sumInt(Integer a, Integer b)
    - static Map<String, Object> tokenUsageMap(TokenUsage usage)
    - static Double resolveOverride(Map<String, Double> toolPricing, String dispatchName, String canonicalName)
    - private static String sourceForBuiltInTool(Object tool)
    - private static int readToolPauseCount(IConversationMemory memory)
    - private static void incrementToolPauseCount(IConversationMemory memory, int pausesSoFar)
    - private static int maxPausesPerTurn(ToolApprovalsConfig cfg)
    - private static List<String> activatedToolNames(boolean isLazy, List<ToolSpecification> activeSpecs)
    - private static String buildPauseReason(ToolApprovalsConfig cfg, ToolApprovalGate.GateResult gateResult)
    - private static String capUtf8(String s, int maxBytes)
    - private static List<Map<String, Object>> capTrace(List<Map<String, Object>> trace)
    - private static String fingerprint(List<ToolExecutionRequest> gated)
    - private void recordPauseCapGuard(IConversationMemory memory, String fingerprint)
    - List<Object> collectEnabledTools(LlmConfiguration.Task task, IConversationMemory memory)
    - private List<Object> collectAllBuiltInTools(LlmConfiguration.Task task, IConversationMemory memory)
    - private void addUserMemoryToolIfEnabled(List<Object> tools, IConversationMemory memory)
    … 56 more declarations — read the file for them
$END_CONTENT
$START_DOCUMENT
BRD anchors that matched something in this cell — a hint about what the change will care about.
They mark files, they do not select them: every file above is mapped regardless
$END_DOCUMENT
$START_CONTENT
- src/main/java/ai/labs/eddi/modules/llm/impl/AgentOrchestrator.java — collision
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
- the digest IS the file for `<role>`, `<api>` and `<test>`. Open a file ONLY when its line says
  `no digest` or `NOT COMPUTED`, or when the declarations genuinely do not tell you what the file is.
  A `read` of a file the digest already answered is this run's budget spent on nothing — measured:
  run `615192d7` opened all 17 files of this cell and learned nothing the order had not printed
- every file above is closed by a `<module path>` or a `<gap path why>` — no file is left silent
- `path` is copied from the list verbatim; a path outside this cell does not belong in this part
- every `<module>` answers all THREE dimensions, with an element or with the explicit "none":
  external points — `<io>` … or `io="none"`;
  exposed surface — `<api>` … or `api="none"`;
  tests — `<test path>` … or `tests="none"`
- `<test path="…"/>` when a file of THIS cell tests this module, or when the module itself names its
  test. Write the PATH and nothing else: a suite id belongs to the spine cell, which is being read at
  the same moment as yours, so you cannot know it and must not guess — step 5 binds a test to its
  suite by path. A module with no test you can see carries `tests="none"`
- edges are NOT yours: a `<dep>` or a `deps="none"` anywhere in the part is a blocker. What this file
  imports inside the repository is printed above as `imports (computed)`, with the line it was read
  from; a script owns that measurement now. A library or framework is not an edge either way, and
  what crosses to another SYSTEM is `<io>`, not an import
- `<api kind="http|cli|event|lib" scope="public|internal" name="…">` — an entry point this file
  offers. `scope="public"` means it is reachable from OUTSIDE the process (an HTTP route, a CLI
  command, a consumed topic); `scope="internal"` means only other modules of this repository call it.
  For `kind="http"` the name is exactly `METHOD /path` — `GET /fruits`, uppercase method, no query
  string, no placeholders of your own. A `route (computed)` line above is already in that form — copy
  it. Routes registered by CALLS in the body (a router's `Handle("/x", …)`) are not computable and are
  yours to find
- `<io kind="http|db|queue|cache|blob|mail|rpc" dir="in|out" system="…" config="…" target="…"/>` —
  a point where this file reaches an EXTERNAL system: a database, a broker, another service. `system`
  is a short kebab-case label; `config` is the configuration key that carries the address when the
  address is not in the code; `target` is what you can see in the code (URL, topic, table). At least
  one of `config`/`target` is filled — an external point with neither is a guess. Your own inbound
  HTTP is `<api>`, not `<io>`; `dir="in"` only when the EXTERNAL system initiates (a queue consumer,
  a webhook). A `driver (computed)` line names the KIND only — an import cannot carry `system` or
  `config`, so completing the `<io>` from the file is yours
- a raw `<` inside an attribute value is written `&lt;`
$END_CONSTRAINTS

$START_PREVIOUS
$START_DOCUMENT
path: .agent/staging/part~src~main~java~ai~labs~eddi~modules~llm~impl~AgentOrchestrator.java.xml
ТВОЙ ПРОШЛЫЙ ОТВЕТ — тот самый файл, который забраковала проверка (пусто = первая попытка).
Это ПОЧИНКА, а не новый ответ: правь названные ниже места ЭТОГО текста, остальное оставь как есть.
Написанное заново ломает то, что проверку уже прошло.
$END_DOCUMENT
$START_CONTENT

$END_CONTENT
$END_PREVIOUS

$START_FEEDBACK
Evidence from the last red check, if this is a redelegation. Empty means the first attempt. Each
blocker carries its rule number and the path it is about — repair exactly what it names, first.
$START_CONTENT

$END_CONTENT
$END_FEEDBACK

$START_OUTPUT
path: .agent/staging/part~src~main~java~ai~labs~eddi~modules~llm~impl~AgentOrchestrator.java.xml
schema:
  <part cell="src~main~java~ai~labs~eddi~modules~llm~impl~AgentOrchestrator.java" kind="survey">
    <module path="…">
      <role>…</role>
      <api name="…" kind="http" scope="public"/>
      <io kind="db" dir="out" system="…" config="…" target="…"/>
      <test path="…"/>
    </module>
    <module path="…" io="none" api="none" tests="none"><role>…</role></module>
    <gap path="…" why="…"/>
  </part>
check: the script judges the file you write at .agent/staging/part~src~main~java~ai~labs~eddi~modules~llm~impl~AgentOrchestrator.java.xml by the part guardrail (grammar 4); a red verdict returns as FEEDBACK with rule numbers and paths
return: call workflow_result — the shape and the choice of rail are declared by your ROLE's
OUTPUT_FORMAT
$END_OUTPUT
