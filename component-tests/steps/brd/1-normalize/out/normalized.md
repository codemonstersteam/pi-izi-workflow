add | Glossary | configuration type | dictionary of bot terms, CRUD with versioning, like Prompt Snippet, resource type `eddi://ai.labs.glossary`
substitute | terms | prompts | as `{{glossary.<term>}}` alongside snippets
export | Glossary | agent | alongside agent
import | Glossary | agent | alongside agent, including comparison with existing and upgrade
version | Glossary | mechanism | repeats Prompt Snippet mechanism
merge | Glossary | import | by resource URI, new version wins (upgrade existing)
define | Term | structure | only key + value pair, no description and no category
constrain | Term key | format | up to 64 characters, lowercase, alphanumeric and underscore
reference | Glossary | agent config | like snippets
define | REST path | endpoint | `/glossarystore/glossaries`, *store/* pattern, not `/glossaries`
restrict | substitution | scope | only to glossaries bound to agent; no global substitution
resolve | key conflict | priority | last load wins: connection order in configuration set is priority
define | Glossary resource fields | structure | only id + version + terms
constrain | value length | limit | unlimited
define | template data model key | syntax | `glossary`; standard Qute syntax: `{glossary.<term>}`
cache | Glossary | Caffeine | TTL same as PromptSnippetService
handle | removed Glossary | prompt rendering | error when bound to agent
export | Glossary | agent ZIP archive | as {id}.glossary.json plus {id}.descriptor.json