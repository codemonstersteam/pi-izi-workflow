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