$START_TASK  
Turn the requirement into use cases.  
Do not reason about the repository: it is not in this order, and no file of it is shown to you.  
$END_TASK

$START_DATA  
$START_DOCUMENT  
path: .agent/brd.md  
Measurable business requirement — what is wanted.  
Every number in it already has a source.  
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
`verb` and `object` are what a use case is made of — the action and the thing it acts on.  
Leave `values` alone here: numbers, formats and limits are written by a later pass.  
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
Accumulated answers from the operator to your previous questions.  
$END_DOCUMENT  
$START_CONTENT  
1. Список URI glossaries в самой модели конфига агента (AgentConfiguration), правится штатным агентным REST. Отдельного эндпоинта и UI не заводить; порядок списка = приоритет.
2. ID генерирует система. Оператор его не передаёт: тело POST только terms, готовый id приходит в Location заголовке.
1. Владельцы привязки: штатный агентный REST RestAgentStore (существующий) + поле glossaries в модели AgentConfiguration (её тоже объяви владельцем шагов поля). Отдельного эндпоинта не заводить.
2. Новый GlossaryService — читает ссылки глоссариев из конфига агента через агентный стор, по образцу PromptSnippetService.
3. Новый GlossaryService — коллизия ключей: порядок списка glossaries в AgentConfiguration и есть приоритет, последний побеждает.
4. RestExportService — генерирует {id}.glossary.json + {id}.descriptor.json и кладёт в ZIP агента; механизм файлов из AbstractBackupService.
5. RestImportService — извлечение из ZIP и первичная запись; UpgradeExecutor — merge по resource URI и upgrade существующего (новая версия побеждает).
1. Новый GlossaryStore (Mongo) по образцу PromptSnippetStore — у каждого типа конфигурации свой Mongo-стор (configs/glossaries/mongo/GlossaryStore.java, new=yes after=PromptSnippetStore).
2. Тот же GlossaryStore (Mongo) — удаление это операция стора, не отдельный модуль.  
$END_CONTENT  
$END_DATA

$START_CONSTRAINTS  
- THIS PASS WRITES ONE LAYER: `<actor>`, `<usecase>` with `<pre>`, `<post>`, `<step>`, `<ext>`, and
  `<question>`. Nothing else. No `<delta>`, no `<scenario>`, no `<touched>`, no `<field>`, no
  `<failure>`, no `<nfr>`, no `<carried>` — the passes after this one write them, against data you do
  not have here.  


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

      WRONG   outcome="the placeholder {{parcel.<field>}} is left unresolved"
      RIGHT   outcome="the placeholder is left unresolved"

- One external input → one `<usecase>`.  
  One alternative / failing branch → one `<ext>`.  

- Branch `outcome` is the negation of the `<post>` of its use case, worded from the actor's perspective.  
  Two ends must not carry identical text — not two branches, and not two use cases.  

- `<ext error="CODE">` names the code only when the requirement or the operator named it. Otherwise
  write `error="none"`: the code is a VALUE, the values pass names it later, and it is allowed to
  change `none` to a code on your branch. Leaving `none` costs nothing; inventing a code costs a
  round.  

- All gaps that block this layer must be asked in a SINGLE BATCH. Nothing else.  
  A gap the BRD and the answers do not settle is ASKED, not filed — one batch, this pass.  
  AND NEVER WALKED AROUND: a use case written with only its successful course, because the failing
  one was unclear, hides the gap from everyone downstream. The gap is the question.  
  Write `<question>` only when FEEDBACK says the operator rounds are spent: a filed question is a
  Reject at step 11 and this whole step runs again.  
  Ask about the REQUIREMENT — who enters, what counts as success, whether the case exists at all.  
  Do not ask where a class lives: that question belongs to the next pass, which will have the map.  
$END_CONSTRAINTS

$START_PREVIOUS
Empty here means NOTHING IS WRITTEN YET — first attempt. Then `write`.  
Non-empty means your own artifact: `edit` it in the places FEEDBACK names, and leave the rest alone.  
  
$START_DOCUMENT  
path: .agent/staging/frd~scenarios.xml  
YOUR OWN ARTIFACT as it stands on disk right now.  
WHY it came back is in FEEDBACK, and only there. Do not hunt this text for a fault nobody reported.  
$END_DOCUMENT  
$START_CONTENT  
  
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
1. Новый GlossaryStore (Mongo) по образцу PromptSnippetStore — у каждого типа конфигурации свой Mongo-стор (configs/glossaries/mongo/GlossaryStore.java, new=yes after=PromptSnippetStore).
2. Тот же GlossaryStore (Mongo) — удаление это операция стора, не отдельный модуль.  
$END_ANSWERED

$START_FEEDBACK  
Evidence of the last failed check (empty = first attempt).  
COUNT THE LINES AND CLOSE THEM ALL IN THIS ANSWER. The check runs on the WHOLE file.  
Each line starts with a RULE CODE (F1, F6c). Fix exactly the named rule and element, touch nothing else.  
- A line starting with `critic:` — step 11 read this FRD against `TASK.md` and `brd.md`. The form is
  intact; the CONTENT does not add up. THE CODE DECIDES THE REPAIR, and your ROLE names the repair of
  every code. Deleting the named element repairs nothing.  
$START_CONTENT  
  
$END_CONTENT  
$END_FEEDBACK

$START_SELFCHECK  
Before writing the file, list the answers. An answer is a number, a list of ids, or a table. "Yes" is not an answer.  

1. IDs of all `<usecase>` — as a list. Against each: its `actor`, its `<post>`, the count of its
   `<step>`. An empty cell anywhere → F1.  

2. Ends of all use cases — as a table: `UC<id>/post` and `UC<id>/<branch id>` · their text.  
   Two ends of different use cases with identical text → F6c.  

If the list matches — write the file. If it does not — fix the artifact, not the list.  
$END_SELFCHECK

$START_OUTPUT  
path: .agent/staging/frd~scenarios.xml  
schema:  
  <frd grammar="1" goal="one phrase">  
    <actor name="…" kind="human|system" via="interface on this boundary"/>  
    <usecase id="UC1" actor="…" goal="…">  
      <pre>…</pre>  
      <post>success guarantee</post>  
      <step n="1">…</step>  
      <ext id="1a" error="CODE" outcome="…"/>  
      <ext id="1b" error="none" outcome="…"/>  
    </usecase>  
    <question subject="…" why="…"/>  
  </frd>  
check: the script judges the file you write at .agent/staging/frd~scenarios.xml by the FRD guardrail for pass scenarios  
return: call workflow_result according to the OUTPUT_FORMAT of your ROLE
