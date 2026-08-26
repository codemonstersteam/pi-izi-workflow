$START_TASK  
Put the values on the change: fields, their domains, the failure map.  
Every number comes from a file below and names it. Do not touch the layers already written.  
$END_TASK

$START_DATA  
$START_DOCUMENT  
path: .agent/brd.md  
Measurable business requirement. Every number in it already has a source.  
$END_DOCUMENT  
$START_CONTENT  
R1 add | configuration type | Glossary | dictionary of bot terms, CRUD with versioning, pattern Prompt Snippet, resource type `eddi://ai.labs.glossary`
R2 substitute | terms | prompts | as `{glossary.<term>}` same as snippets
R3 export | Glossary | agent ZIP archive | as `{id}.glossary.json` plus `{id}.descriptor.json`
R4 import | Glossary | agent import | merge by resource URI, new version wins (upgrade existing)
R5 define | versioning | Glossary | repeats Prompt Snippet mechanism
R6 define | Term | Glossary | key + value only, no description, no category
R7 validate | Term key | Glossary | up to 64 chars, lowercase, alphanumeric and underscore
R8 reference | Glossary | agent config | like snippets
R9 define | REST path | Glossary | `/glossarystore/glossaries`, *store/* pattern, not /glossaries
R10 restrict | substitution | Glossary terms | only to glossaries bound to agent, no global
R11 resolve | key collision | Glossary | last loaded wins, configuration set order is priority
R12 define | Glossary resource fields | Glossary | only id + version + terms
R13 define | Term value length | Glossary | unlimited
R14 define | template data model key | Glossary | glossary, Qute syntax: `{glossary.<term>}`
R15 cache | Glossary | Caffeine | TTL same as PromptSnippetService
R16 error | removed Glossary | prompt rendering | error when rendering prompt
analogue: PromptSnippet — files 62; the existing configuration type whose pattern, versioning mechanism, caching, and agent config reference the Glossary repeats
subjects[]: terms · Glossary · versioning · substitution · collision · PromptSnippet  
$END_CONTENT  

$START_DOCUMENT  
path: .agent/normalized.md  
The request normalized into rows, one per requirement: `verb | object | instrument | values`.  
Column `values` IS the measurement the operator already decided. Quote it into `fit` and `domain`
WORD FOR WORD as it stands in the row, and write `source="normalized.md"`.  
A value standing in that column is never a question: asking it re-asks what is already answered.  

    ROW     export | Glossary | agent ZIP archive | as {id}.glossary.json plus {id}.descriptor.json
    VALUE   fit="agent ZIP export carries {id}.glossary.json plus {id}.descriptor.json" source="normalized.md"
$END_DOCUMENT  
$START_CONTENT  
add | configuration type | Glossary | dictionary of bot terms, CRUD with versioning, pattern Prompt Snippet, resource type `eddi://ai.labs.glossary`
substitute | terms | prompts | as `{glossary.<term>}` same as snippets
export | Glossary | agent ZIP archive | as `{id}.glossary.json` plus `{id}.descriptor.json`
import | Glossary | agent import | merge by resource URI, new version wins (upgrade existing)
define | versioning | Glossary | repeats Prompt Snippet mechanism
define | Term | Glossary | key + value only, no description, no category
validate | Term key | Glossary | up to 64 chars, lowercase, alphanumeric and underscore
reference | Glossary | agent config | like snippets
define | REST path | Glossary | `/glossarystore/glossaries`, *store/* pattern, not /glossaries
restrict | substitution | Glossary terms | only to glossaries bound to agent, no global
resolve | key collision | Glossary | last loaded wins, configuration set order is priority
define | Glossary resource fields | Glossary | only id + version + terms
define | Term value length | Glossary | unlimited
define | template data model key | Glossary | glossary, Qute syntax: `{glossary.<term>}`
cache | Glossary | Caffeine | TTL same as PromptSnippetService
error | removed Glossary | prompt rendering | error when rendering prompt  
$END_CONTENT  

$START_DOCUMENT  
path: .agent/answers.md  
Accumulated answers from the operator. The VALUE of an answer is a legal source of a number.  
$END_DOCUMENT  
$START_CONTENT  
1. Список URI glossaries в самой модели конфига агента (AgentConfiguration), правится штатным агентным REST. Отдельного эндпоинта и UI не заводить; порядок списка = приоритет.
2. ID генерирует система. Оператор его не передаёт: тело POST только terms, готовый id приходит в Location заголовке.
1. Владельцы привязки: штатный агентный REST RestAgentStore (существующий) + поле glossaries в модели AgentConfiguration (её тоже объяви владельцем шагов поля). Отдельного эндпоинта не заводить.
2. Новый GlossaryService — читает ссылки глоссариев из конфига агента через агентный стор, по образцу PromptSnippetService.
3. Новый GlossaryService — коллизия ключей: порядок списка glossaries в AgentConfiguration и есть приоритет, последний побеждает.
4. RestExportService — генерирует {id}.glossary.json + {id}.descriptor.json и кладёт в ZIP агента; механизм файлов из AbstractBackupService.
5. RestImportService — извлечение из ZIP и первичная запись; UpgradeExecutor — merge по resource URI и upgrade существующего (новая версия побеждает).  
$END_CONTENT  
$END_DATA

$START_CONSTRAINTS  
- THIS PASS WRITES ONE LAYER: `<field>`, `<failure>` / `<failures>`, `<nfr>`.  
  Do not add or edit use cases, deltas, scenarios or touched — those layers are closed.  
  Do not write `<carried>` — the last pass writes it.  

- ONE EXCEPTION, AND IT IS PART OF YOUR LAYER: the `error` attribute of an existing `<ext>`.  
  A CODE IS A VALUE, and values are this pass's work — the pass that wrote the branches had no
  vocabulary to name one and left `error="none"`.  
  You may CHANGE `error="none"` to a code on a branch that is a failure. You may not add a branch,
  remove one, reorder them, or touch its `outcome`, its `id`, or anything else of a use case.  
  A branch that is NOT a failure — an alternative course that succeeds — keeps `error="none"`.  


- TWO-FILTER QUESTION TRIAGE — a question must DIE at one of the filters before it reaches
  the operator: (1) can the map, the TYPES table or the blueprint answer it? → answer it
  yourself from the order, it is not a question; (2) is there a defensible default? → ADOPT
  it and RECORD it in .agent/assumptions.md, one line per adoption:
      assumption: <what was unclear> | default: <what you chose> | rationale: <why defensible> | reversible: yes/no
  Only what survives both filters is a question: a decision the OWNER must make — a trade-off,
  an irreversible choice, a policy the requirement does not settle. Every question names its
  candidates and a recommended answer.
- ATTRIBUTE VALUES ARE PLAIN WORDS. No `<`, no `>`, no `&`, no tags inside a value.
  A value carrying `<` is not read at all: the scanner ends the element there and the whole element
  disappears — the check then says it is MISSING, and you are told to write what you already wrote.  

      WRONG   type="array<Term>"     domain="map<string,string>"
      RIGHT   type="array of Term"    domain="map of string to string"

- Every quantity (range, enum, format, limit) carries a `source`.  
  Source is one of: 0: TASK.md
1: answers.md
2: brd.md
3: normalized.md
4: appgraph.xml. Source = the file that CONTAINS the value.  
  Naming a format instead of its concrete measurements is forbidden.  
  A quantity you cannot point to in one of these files → ASK the operator, in one batch.  
  `<question>` only when FEEDBACK says the rounds are spent — never a source "from memory", and never
  a filed question while a pause is still available: step 11 turns it into a Reject.  

- One error code `<ext>` → one `<failure>` line, and its `from` lists ALL branches of that code:  
  `from="UC1/1a UC2/2a"`.  

- The change may genuinely have no failure modes. Then write `<failures found="no" why="…"/>`.  
  One of the two variants is mandatory: an empty failure map is not an answer.  

- `<field in="…">` names the operation or the ENTITY the field belongs to. If that entity is an
  existing type of this repository, the change must already carry its module — look at the deltas
  written by the previous pass. If it does not, the field belongs to no module, and that is a
  `<question>`, not a value.  

- A question here is about a VALUE: a limit, a code, a format nobody named. Ask in a SINGLE BATCH.  
$END_CONSTRAINTS

$START_PREVIOUS
Non-empty ALWAYS here. `edit` — add your layer to this file.  
  
$START_DOCUMENT  
path: .agent/staging/frd~data-failures.xml  
THE ARTIFACT AS IT STANDS. Layers already closed: scenarios, owners, contracts.  
The `<ext>` branches below are what your failure map must cover. A branch already carrying a code
keeps it — do not rename it. A failing branch carrying `error="none"` is waiting for YOU to name its
code: nobody before you could.  
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
    <ext id="2a" error="none" outcome="glossary is not stored, operator receives validation error response"/>
    <ext id="3a" error="none" outcome="glossary is not stored, operator receives error response"/>
    <owner step="UC1/1" node="src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java" new="yes" after="src/main/java/ai/labs/eddi/configs/snippets/rest/RestPromptSnippetStore.java"/>
    <owner step="UC1/2" node="src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java" new="yes" after="src/main/java/ai/labs/eddi/configs/snippets/rest/RestPromptSnippetStore.java"/>
    <owner step="UC1/3" node="src/main/java/ai/labs/eddi/configs/glossaries/mongo/GlossaryStore.java" new="yes" after="src/main/java/ai/labs/eddi/configs/snippets/mongo/PromptSnippetStore.java"/>
  </usecase>

  <usecase id="UC2" actor="operator" goal="read one glossary">
    <pre>glossary exists in the system</pre>
    <post>requested glossary is returned with all its terms</post>
    <step n="1">operator sends GET to /glossarystore/glossaries/{id}</step>
    <step n="2">system retrieves the glossary and returns it with its terms, id and version</step>
    <ext id="2a" error="none" outcome="glossary is not returned, operator receives absence response"/>
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
    <ext id="2a" error="none" outcome="update is rejected because term keys are invalid, existing version remains unchanged"/>
    <ext id="3a" error="none" outcome="glossary is not found, existing version remains unchanged"/>
    <owner step="UC4/1" node="src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java" new="yes" after="src/main/java/ai/labs/eddi/configs/snippets/rest/RestPromptSnippetStore.java"/>
    <owner step="UC4/2" node="src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java" new="yes" after="src/main/java/ai/labs/eddi/configs/snippets/rest/RestPromptSnippetStore.java"/>
    <owner step="UC4/3" node="src/main/java/ai/labs/eddi/configs/glossaries/mongo/GlossaryStore.java" new="yes" after="src/main/java/ai/labs/eddi/configs/snippets/mongo/PromptSnippetStore.java"/>
  </usecase>

  <usecase id="UC5" actor="operator" goal="delete a glossary">
    <pre>glossary exists in the system</pre>
    <post>glossary is removed from the system</post>
    <step n="1">operator sends DELETE to /glossarystore/glossaries/{id}</step>
    <step n="2">system removes the glossary and returns 204</step>
    <ext id="1a" error="none" outcome="glossary is not removed, operator receives absence response"/>
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
    <ext id="2a" error="none" outcome="prompt rendering fails because a bound glossary no longer exists"/>
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
    <ext id="2a" error="none" outcome="glossary files are not included in the ZIP, operator receives export error response"/>
    <ext id="3a" error="none" outcome="glossary files are not placed in the ZIP, operator receives export error response"/>
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
    <ext id="2a" error="none" outcome="glossaries are not imported, operator receives import error response"/>
    <ext id="3a" error="none" outcome="glossaries are not merged, operator receives import error response"/>
    <owner step="UC8/1" node="src/main/java/ai/labs/eddi/backup/impl/RestImportService.java"/>
    <owner step="UC8/2" node="src/main/java/ai/labs/eddi/backup/impl/RestImportService.java"/>
    <owner step="UC8/3" node="src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java"/>
  </usecase>

  <usecase id="UC9" actor="operator" goal="bind glossaries to an agent" via="PUT /agentstore/agents/{id}">
    <pre>agent exists and glossaries referenced in the list exist</pre>
    <post>glossary list is saved in the agent configuration</post>
    <step n="1">operator updates the agent configuration with a list of glossary resource URIs via the existing agent REST endpoint</step>
    <step n="2">system validates that all referenced glossary URIs exist and saves the configuration</step>
    <ext id="1a" error="none" outcome="agent is not found, configuration is not updated"/>
    <ext id="2a" error="none" outcome="configuration update is rejected because a referenced glossary does not exist"/>
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
COUNT THE LINES AND CLOSE THEM ALL IN THIS ANSWER. Each line starts with a RULE CODE (F5, F6, F6d).  
- A line starting with `critic:` — step 11 read this FRD against `TASK.md` and `brd.md`. The form is
  intact; the CONTENT does not add up. THE CODE DECIDES THE REPAIR, and your ROLE names the repair of
  every code. Deleting the named element repairs nothing.  
$START_CONTENT  
  
$END_CONTENT  
$END_FEEDBACK

$START_SELFCHECK  
Before writing the file, list the answers. An answer is a number, a list of ids, or a table.  

1. Every number in `domain` and in `fit` — as a table: value · the file it occurs in.  
   A value you cannot place in one of 0: TASK.md
1: answers.md
2: brd.md
3: normalized.md
4: appgraph.xml → it is a `<question>`, not a value → F5.  

2. Every `<ext>` in the artifact — as a table: `UC<id>/<branch id>` · its `outcome` · its `error`.  
   A branch whose outcome is a FAILURE and whose `error` is still `none` → give it a code NOW: it is
   your layer, and the failure map cannot cover a branch that names none.  
   Against each code: its `<failure code>` line → F6.  
   A branch whose code is not listed in the `from` of that code’s failure line → F6d.  
   A `<failure>` code met by no `<ext>` → F6.  

3. If there is no `<failure>` line at all — is `<failures found="no" why="…"/>` written → F6.  

If the list matches — write the file. If it does not — fix the artifact, not the list.  
$END_SELFCHECK

$START_OUTPUT  
path: .agent/staging/frd~data-failures.xml  
schema — the elements YOU add, into the file that already carries use cases, deltas and scenarios:  
    <field name="…" in="operation or entity" type="…" domain="range | enum | format"  
           required="yes|no" error="CODE" source="…"/>  
    <failure code="CODE" status="real code from the requirement or repository — «0» is a stub the judge refuses" client="…" operator="…" from="UC1/1a UC2/2a"/>  
    <failures found="no" why="…"/>  
    <nfr subject="…" fit="…" source="…"/>  
    <question subject="…" why="…"/>  
check: the script judges the file you write at .agent/staging/frd~data-failures.xml by the FRD guardrail for pass data-failures  
return: call workflow_result according to the OUTPUT_FORMAT of your ROLE
