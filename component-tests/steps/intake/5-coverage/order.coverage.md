$START_TASK  
ADD one `<carried>` row for EVERY line of THE REQUIREMENTS OWED below. Count that list: your file must
gain exactly that many rows, no fewer.  
This is the only thing you add — and you must add it. Nothing else in the file changes.  
$END_TASK

$START_DATA  
$START_DOCUMENT  
THE REQUIREMENTS OWED. Every line below needs one `<carried>` row. The ids are COPIED from here —
do not retype them from the BRD and do not renumber them.  
$END_DOCUMENT  
$START_CONTENT  
R1
R2
R3
R4
R5
R6
R7
R8
R9
R10
R11
R12
R13
R14
R15
R16  
$END_CONTENT  
$END_DATA

$START_CONSTRAINTS  
- THIS PASS WRITES ONE LAYER: `<carried>`. Nothing else is added, nothing else is edited.
  "Nothing else" is not "nothing": a file that comes back without new `<carried>` rows fails every
  requirement at once, and that is the most expensive round this pass can spend.  

- ATTRIBUTE VALUES ARE PLAIN WORDS. No `<`, no `>`, no `&`, no tags inside a value.
  A value carrying `<` is not read at all: the scanner ends the element there and the whole element
  disappears — the check then says it is MISSING, and you are told to write what you already wrote.  

      WRONG   why="R7 needs <code>Parcel.status</code> and nothing provides it"
      RIGHT   why="R7 needs the parcel status field and nothing provides it"

- Carrier is an id that EXISTS in this same file: a use-case id, its step (`UC1/2`), a scenario id, a
  delta node, or an nfr subject. A requirement "covered by meaning" is not carried.  

- A requirement nothing carries is NOT to be papered over with a row pointing at the nearest element.
  Say so as a `<question subject="R7" why="nothing in the artifact carries it"/>` — a false row costs
  more than an honest gap. Expect this step to run again: only pass A can add a carrier, and the
  critic turns your question into a Reject.  

- Walk the list ONE BY ONE, top to bottom. Do not group, do not summarise.  
$END_CONSTRAINTS

$START_PREVIOUS
Non-empty ALWAYS here. `edit` — add your rows to this file.  
  
$START_DOCUMENT  
path: .agent/staging/frd~coverage.xml  
THE ARTIFACT AS IT STANDS. Layers already closed: scenarios, owners, contracts, data-failures.  
Everything you may name as a carrier is inside this text.  
$END_DOCUMENT  
$START_CONTENT  
<frd grammar="1" goal="add Glossary as a new configuration type for bot term dictionaries with CRUD, versioning, substitution, export/import and agent binding">

  <actor name="operator" kind="human" via="HTTP REST /glossarystore/glossaries"/>
  <actor name="rendering-system" kind="system" via="internal GlossaryService"/>

  <usecase id="UC1" actor="operator" goal="create a glossary">
    <pre>operator is authenticated</pre>
    <post>glossary is stored with system-generated id and version 1</post>
    <step n="1">operator sends POST to /glossarystore/glossaries with terms array in the request body</step>
    <step n="2">system validates every term key against the format rules</step>
    <step n="3">system assigns a system-generated id and stores the glossary with version 1, returning 201 with Location header containing the id</step>
    <ext id="2a" error="TERM_KEY_INVALID" outcome="glossary is not stored, operator receives validation error response"/>
    <ext id="3a" error="STORAGE_ERROR" outcome="glossary is not stored, operator receives error response"/>
    <owner step="UC1/1" node="src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java" new="yes" after="src/main/java/ai/labs/eddi/configs/snippets/rest/RestPromptSnippetStore.java"/>
    <owner step="UC1/2" node="src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java" new="yes" after="src/main/java/ai/labs/eddi/configs/snippets/rest/RestPromptSnippetStore.java"/>
    <owner step="UC1/3" node="src/main/java/ai/labs/eddi/configs/glossaries/mongo/GlossaryStore.java" new="yes" after="src/main/java/ai/labs/eddi/configs/snippets/mongo/PromptSnippetStore.java"/>
  </usecase>

  <usecase id="UC2" actor="operator" goal="read one glossary">
    <pre>glossary exists in the system</pre>
    <post>requested glossary is returned with all its terms</post>
    <step n="1">operator sends GET to /glossarystore/glossaries/{id}</step>
    <step n="2">system retrieves the glossary and returns it with its terms, id and version</step>
    <ext id="2a" error="GLOSSARY_NOT_FOUND" outcome="glossary is not returned, operator receives absence response"/>
    <owner step="UC2/1" node="src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java" new="yes" after="src/main/java/ai/labs/eddi/configs/snippets/rest/RestPromptSnippetStore.java"/>
    <owner step="UC2/2" node="src/main/java/ai/labs/eddi/configs/glossaries/mongo/GlossaryStore.java" new="yes" after="src/main/java/ai/labs/eddi/configs/snippets/mongo/PromptSnippetStore.java"/>
  </usecase>

  <usecase id="UC3" actor="operator" goal="list all glossaries">
    <pre>operator is authenticated</pre>
    <post>list of all glossaries is returned</post>
    <step n="1">operator sends GET to /glossarystore/glossaries</step>
    <step n="2">system retrieves all glossaries and returns the list with id, version and terms for each</step>
    <owner step="UC3/1" node="src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java" new="yes" after="src/main/java/ai/labs/eddi/configs/snippets/rest/RestPromptSnippetStore.java"/>
    <owner step="UC3/2" node="src/main/java/ai/labs/eddi/configs/glossaries/mongo/GlossaryStore.java" new="yes" after="src/main/java/ai/labs/eddi/configs/snippets/mongo/PromptSnippetStore.java"/>
  </usecase>

  <usecase id="UC4" actor="operator" goal="update a glossary">
    <pre>glossary exists in the system</pre>
    <post>new version of the glossary is stored with updated terms</post>
    <step n="1">operator sends PUT to /glossarystore/glossaries/{id} with new terms array</step>
    <step n="2">system validates every term key against the format rules</step>
    <step n="3">system creates a new version of the glossary and returns 200</step>
    <ext id="2a" error="TERM_KEY_INVALID" outcome="update is rejected because term keys are invalid, existing version remains unchanged"/>
    <ext id="3a" error="GLOSSARY_NOT_FOUND" outcome="glossary is not found, existing version remains unchanged"/>
    <owner step="UC4/1" node="src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java" new="yes" after="src/main/java/ai/labs/eddi/configs/snippets/rest/RestPromptSnippetStore.java"/>
    <owner step="UC4/2" node="src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java" new="yes" after="src/main/java/ai/labs/eddi/configs/snippets/rest/RestPromptSnippetStore.java"/>
    <owner step="UC4/3" node="src/main/java/ai/labs/eddi/configs/glossaries/mongo/GlossaryStore.java" new="yes" after="src/main/java/ai/labs/eddi/configs/snippets/mongo/PromptSnippetStore.java"/>
  </usecase>

  <usecase id="UC5" actor="operator" goal="delete a glossary">
    <pre>glossary exists in the system</pre>
    <post>glossary is removed from the system</post>
    <step n="1">operator sends DELETE to /glossarystore/glossaries/{id}</step>
    <step n="2">system removes the glossary and returns 204</step>
    <ext id="1a" error="GLOSSARY_NOT_FOUND" outcome="glossary is not removed, operator receives absence response"/>
    <owner step="UC5/1" node="src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java" new="yes" after="src/main/java/ai/labs/eddi/configs/snippets/rest/RestPromptSnippetStore.java"/>
    <owner step="UC5/2" node="src/main/java/ai/labs/eddi/configs/glossaries/mongo/GlossaryStore.java" new="yes" after="src/main/java/ai/labs/eddi/configs/snippets/mongo/PromptSnippetStore.java"/>
  </usecase>

  <usecase id="UC6" actor="rendering-system" goal="substitute glossary terms in a prompt">
    <pre>agent has glossaries bound in its configuration and prompt template contains glossary placeholders</pre>
    <post>prompt is rendered with glossary terms substituted in priority order where last loaded glossary wins on key collision</post>
    <step n="1">system loads the agent configuration and reads the glossaries resource URI list</step>
    <step n="2">system fetches each glossary by its resource URI in list order and builds a combined terms map where last loaded glossary wins on key collision</step>
    <step n="3">system scans the prompt template for glossary placeholders and replaces matched ones with term values</step>
    <step n="4">system renders the prompt with substituted terms</step>
    <ext id="2a" error="MISSING_GLOSSARY" outcome="prompt rendering fails because a bound glossary no longer exists"/>
    <ext id="3a" error="none" outcome="prompt is rendered with unmatched placeholders left unresolved"/>
    <owner step="UC6/1" node="src/main/java/ai/labs/eddi/modules/llm/impl/GlossaryService.java" new="yes" after="src/main/java/ai/labs/eddi/modules/llm/impl/PromptSnippetService.java"/>
    <owner step="UC6/2" node="src/main/java/ai/labs/eddi/modules/llm/impl/GlossaryService.java" new="yes" after="src/main/java/ai/labs/eddi/modules/llm/impl/PromptSnippetService.java"/>
    <owner step="UC6/3" node="src/main/java/ai/labs/eddi/modules/llm/impl/GlossaryService.java" new="yes" after="src/main/java/ai/labs/eddi/modules/llm/impl/PromptSnippetService.java"/>
    <owner step="UC6/4" node="src/main/java/ai/labs/eddi/modules/llm/impl/GlossaryService.java" new="yes" after="src/main/java/ai/labs/eddi/modules/llm/impl/PromptSnippetService.java"/>
  </usecase>

  <usecase id="UC7" actor="operator" goal="export glossaries in agent ZIP archive" via="POST /backup/export/{agentId}">
    <pre>agent has glossaries bound in its configuration</pre>
    <post>all bound glossaries are exported as JSON files into the agent ZIP archive</post>
    <step n="1">operator triggers the agent export via existing agent REST</step>
    <step n="2">system generates id.glossary.json and id.descriptor.json for each bound glossary</step>
    <step n="3">system places the glossary JSON files into the agent ZIP archive</step>
    <ext id="2a" error="EXPORT_ERROR" outcome="glossary files are not included in the ZIP, operator receives export error response"/>
    <ext id="3a" error="EXPORT_ERROR" outcome="glossary files are not placed in the ZIP, operator receives export error response"/>
    <owner step="UC7/1" node="src/main/java/ai/labs/eddi/backup/impl/RestExportService.java"/>
    <owner step="UC7/2" node="src/main/java/ai/labs/eddi/backup/impl/RestExportService.java"/>
    <owner step="UC7/3" node="src/main/java/ai/labs/eddi/backup/impl/RestExportService.java"/>
  </usecase>

  <usecase id="UC8" actor="operator" goal="import glossaries from agent ZIP archive" via="POST /backup/import">
    <pre>agent ZIP archive contains glossary JSON files</pre>
    <post>new glossaries are created and existing ones are upgraded from the ZIP archive</post>
    <step n="1">operator triggers the agent import via existing agent REST</step>
    <step n="2">system extracts glossary JSON files from the ZIP archive and writes new glossaries</step>
    <step n="3">system merges glossaries by resource URI with new version winning over existing</step>
    <ext id="2a" error="IMPORT_ERROR" outcome="glossaries are not imported, operator receives import error response"/>
    <ext id="3a" error="IMPORT_ERROR" outcome="glossaries are not merged, operator receives import error response"/>
    <owner step="UC8/1" node="src/main/java/ai/labs/eddi/backup/impl/RestImportService.java"/>
    <owner step="UC8/2" node="src/main/java/ai/labs/eddi/backup/impl/RestImportService.java"/>
    <owner step="UC8/3" node="src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java"/>
  </usecase>

  <usecase id="UC9" actor="operator" goal="bind glossaries to an agent" via="PUT /agentstore/agents/{id}">
    <pre>agent exists and glossaries referenced in the list exist</pre>
    <post>glossary list is saved in the agent configuration</post>
    <step n="1">operator updates the agent configuration with a list of glossary resource URIs via the existing agent REST endpoint</step>
    <step n="2">system validates that all referenced glossary URIs exist and saves the configuration</step>
    <ext id="1a" error="AGENT_NOT_FOUND" outcome="agent is not found, configuration is not updated"/>
    <ext id="2a" error="GLOSSARY_NOT_FOUND" outcome="configuration update is rejected because a referenced glossary does not exist"/>
    <owner step="UC9/1" node="src/main/java/ai/labs/eddi/configs/agents/rest/RestAgentStore.java"/>
    <owner step="UC9/2" node="src/main/java/ai/labs/eddi/configs/agents/rest/RestAgentStore.java"/>
  </usecase>

  <!-- DELTAS -->
  <delta op="glossary CRUD REST endpoints POST GET PUT DELETE /glossarystore/glossaries" form="Added" node="src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java" new="yes" from="нет" to="REST endpoints for glossary create read list update delete"/>
  <delta op="glossary MongoDB persistence layer" form="Added" node="src/main/java/ai/labs/eddi/configs/glossaries/mongo/GlossaryStore.java" new="yes" from="нет" to="MongoDB-backed store for glossary documents with version management"/>
  <delta op="glossary substitution in prompt rendering" form="Added" node="src/main/java/ai/labs/eddi/modules/llm/impl/GlossaryService.java" new="yes" from="нет" to="service loading bound glossaries and substituting placeholders in prompts"/>
  <delta op="POST /backup/export/{agentId}" form="Added" node="src/main/java/ai/labs/eddi/backup/impl/RestExportService.java" from="export agent workflows and extensions without glossaries" to="export agent workflows and extensions including glossary JSON and descriptor files"/>
  <delta op="POST /backup/import" form="Added" node="src/main/java/ai/labs/eddi/backup/impl/RestImportService.java" from="import agent from ZIP without glossary extraction" to="import agent from ZIP including glossary JSON file extraction and creation"/>
  <delta op="executeUpgrade" form="Changed" node="src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java" from="upgrade agent resources without glossary merge" to="upgrade agent resources including glossary merge by resource URI"/>
  <delta op="PUT /agentstore/agents/{id}" form="Added" node="src/main/java/ai/labs/eddi/configs/agents/rest/RestAgentStore.java" from="update agent without glossary binding validation" to="update agent with glossary URI validation and persistence"/>

  <!-- SCENARIOS -->
  <scenario id="S1" uc="UC1" before="no glossary creation endpoint exists" after="operator creates glossary via POST /glossarystore/glossaries and receives 201 with id" nodes="src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java src/main/java/ai/labs/eddi/configs/glossaries/mongo/GlossaryStore.java"/>
  <scenario id="S2" uc="UC2" before="no glossary read endpoint exists" after="operator reads glossary via GET /glossarystore/glossaries/{id} and receives glossary with terms" nodes="src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java src/main/java/ai/labs/eddi/configs/glossaries/mongo/GlossaryStore.java"/>
  <scenario id="S3" uc="UC3" before="no glossary list endpoint exists" after="operator lists glossaries via GET /glossarystore/glossaries and receives full list" nodes="src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java src/main/java/ai/labs/eddi/configs/glossaries/mongo/GlossaryStore.java"/>
  <scenario id="S4" uc="UC4" before="no glossary update endpoint exists" after="operator updates glossary via PUT /glossarystore/glossaries/{id} and new version is stored" nodes="src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java src/main/java/ai/labs/eddi/configs/glossaries/mongo/GlossaryStore.java"/>
  <scenario id="S5" uc="UC5" before="no glossary delete endpoint exists" after="operator deletes glossary via DELETE /glossarystore/glossaries/{id} and glossary is removed" nodes="src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java src/main/java/ai/labs/eddi/configs/glossaries/mongo/GlossaryStore.java"/>
  <scenario id="S6" uc="UC6" before="rendering system does not resolve glossary placeholders in prompts" after="GlossaryService substitutes glossary terms in priority order where last loaded glossary wins on collision" nodes="src/main/java/ai/labs/eddi/modules/llm/impl/GlossaryService.java"/>
  <scenario id="S7" uc="UC7" before="agent ZIP export does not include glossary JSON files" after="agent ZIP export includes id.glossary.json and id.descriptor.json for each bound glossary" nodes="src/main/java/ai/labs/eddi/backup/impl/RestExportService.java"/>
  <scenario id="S8" uc="UC8" before="agent ZIP import does not extract glossary files from archive" after="agent ZIP import extracts glossary JSON files and creates or merges them by resource URI" nodes="src/main/java/ai/labs/eddi/backup/impl/RestImportService.java src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java"/>
  <scenario id="S9" uc="UC9" before="agent configuration update does not support glossary URI list" after="agent configuration update validates referenced glossary URIs exist and saves the glossary list" nodes="src/main/java/ai/labs/eddi/configs/agents/rest/RestAgentStore.java"/>

  <!-- FIELDS -->
  <field name="id" in="Glossary" type="string" domain="system-generated" required="yes" source="brd.md"/>
  <field name="version" in="Glossary" type="integer" domain="starts at 1, increments on each update" required="yes" source="brd.md"/>
  <field name="terms" in="Glossary" type="array of Term" domain="list of key-value Term pairs" required="yes" source="brd.md"/>
  <field name="key" in="Term" type="string" domain="up to 64 characters, lowercase letters, digits, underscores only" required="yes" error="TERM_KEY_INVALID" source="brd.md"/>
  <field name="value" in="Term" type="string" domain="unlimited length" required="yes" source="brd.md"/>
  <field name="glossaries" in="AgentConfiguration" type="array of resource URI" domain="ordered list of eddi://ai.labs.glossary resource URIs, order defines priority" required="no" source="answers.md"/>

  <!-- FAILURES -->
  <failure code="TERM_KEY_INVALID" status="400" client="validation error response returned" operator="correct term keys and retry" from="UC1/2a UC4/2a"/>
  <failure code="STORAGE_ERROR" status="500" client="storage error response returned" operator="check system logs and retry" from="UC1/3a"/>
  <failure code="GLOSSARY_NOT_FOUND" status="404" client="absence response returned" operator="verify glossary id and create if missing" from="UC2/2a UC4/3a UC5/1a UC9/2a"/>
  <failure code="MISSING_GLOSSARY" status="500" client="prompt rendering fails, LLM task is not executed" operator="restore or rebind the removed glossary to the agent" from="UC6/2a"/>
  <failure code="EXPORT_ERROR" status="500" client="export error response returned" operator="check system logs and retry export" from="UC7/2a UC7/3a"/>
  <failure code="IMPORT_ERROR" status="500" client="import error response returned" operator="check ZIP contents and retry import" from="UC8/2a UC8/3a"/>
  <failure code="AGENT_NOT_FOUND" status="404" client="absence response returned" operator="verify agent id" from="UC9/1a"/>

  <!-- NFR -->
  <nfr subject="glossary-cache-ttl" fit="5 minutes" source="brd.md"/>

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
Evidence of the last failed check (empty = first attempt at this layer).  
COUNT THE LINES AND CLOSE THEM ALL IN THIS ANSWER.  
Each line starts with a RULE CODE (F8, F11) and names the requirement or the field.  
$START_CONTENT  
  
$END_CONTENT  
$END_FEEDBACK

$START_SELFCHECK  
Before writing the file, list the answers.  

1. WRITE BOTH NUMBERS DOWN: lines in THE REQUIREMENTS OWED, and `<carried>` rows in your file.
   Equal → good. Your file has FEWER (zero counts) → you have not done this pass at all → F11 on every
   missing one.  

2. Every `<carried by>` value — find it in the artifact by search. Not found → the row is false.  

3. Every `<field in="E">` whose entity E is an existing type of the repository — is E's module named by
   a `<delta node>` or a `<touched path>` in this artifact → F8.  
   It is not, and the field is new → the module that will hold it is missing from the change: say it
   as a `<question>`, do not invent a delta here.  

If the list matches — write the file. If it does not — fix the artifact, not the list.  
$END_SELFCHECK

$START_OUTPUT  
path: .agent/staging/frd~coverage.xml  
schema — the element YOU add, into the file that already carries everything else:  
    <carried req="R1" by="UC1/2"/>  
    <question subject="R7" why="…"/>  
check: the script judges the file you write at .agent/staging/frd~coverage.xml by the FRD guardrail for pass coverage  
return: call workflow_result according to the OUTPUT_FORMAT of your ROLE
